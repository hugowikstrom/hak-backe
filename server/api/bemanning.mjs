// Bemanning: pass, bokningar, kvoter, automatplanering och utskick.
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { RANG } from '../auth.mjs';
import { planera } from '../autoplan.mjs';
import { brevBokning, skicka } from '../epost.mjs';
import { arHelg, datumspann, idag, passSlag, passTimmar, plusDagar, veckonummer } from '../tid.mjs';
import { bool, csv, datum, ettAv, fel, heltal, klocka, num, rutt, svar, text, txt } from '../http.mjs';
import { aktivSasong, positionslista } from './register.mjs';

const BOKNINGSSTATUS = ['bokad', 'tilldelad', 'narvarande', 'uteblev', 'avbokad'];
const AKTIVA = ['bokad', 'tilldelad', 'narvarande'];
const aktivaFragetecken = AKTIVA.map(() => '?').join(',');

export const passlista = (fran, till) =>
  alla(
    `SELECT p.*, pos.namn AS position, pos.nyckel AS positionsnyckel, pos.farg, pos.kravs_roll,
            (SELECT count(*) FROM bokning b WHERE b.pass_id=p.id AND b.status IN (${aktivaFragetecken})) AS bokade
     FROM pass p JOIN position pos ON pos.id=p.position_id
     WHERE p.datum BETWEEN ? AND ?
     ORDER BY p.datum, p.start, pos.ordning`,
    ...AKTIVA,
    fran,
    till
  );

export const bokningslista = (fran, till) =>
  alla(
    `SELECT b.*, m.namn, m.anvandarnamn, p.datum, p.start, p.slut, p.position_id
     FROM bokning b JOIN medlem m ON m.id=b.medlem_id JOIN pass p ON p.id=b.pass_id
     WHERE p.datum BETWEEN ? AND ? ORDER BY p.datum, p.start, m.namn`,
    fran,
    till
  );

/** Rutnätet: ett pass per cell, med alla bokningar inbakade. */
export function rutnat(fran, till) {
  const pass = passlista(fran, till);
  const bokningar = bokningslista(fran, till);
  const perPass = new Map();
  for (const b of bokningar) {
    if (!perPass.has(b.pass_id)) perPass.set(b.pass_id, []);
    perPass.get(b.pass_id).push({
      id: b.id, medlem_id: b.medlem_id, namn: b.namn, status: b.status, kalla: b.kalla, kommentar: b.kommentar,
    });
  }
  return {
    fran,
    till,
    dagar: datumspann(fran, till).map((d) => ({ datum: d, helg: arHelg(d), vecka: veckonummer(d) })),
    positioner: positionslista().filter((p) => p.aktiv),
    pass: pass.map((p) => ({
      ...p,
      timmar: passTimmar(p.start, p.slut),
      slag: passSlag(p.start, p.slut),
      helg: arHelg(p.datum),
      bokningar: perPass.get(p.id) || [],
    })),
  };
}

/** Insats- och kvotläge för en medlem inom säsongen. */
export function lageFor(medlem_id, sasong) {
  const s = sasong || aktivSasong();
  const period = s ? [s.start, s.slut] : ['1900-01-01', '2999-12-31'];
  const m = en('SELECT * FROM medlem WHERE id=?', medlem_id);
  const kvot = m?.kvot_timmar ?? s?.kvot_timmar ?? 20;
  const utfort =
    en('SELECT coalesce(sum(timmar),0) AS t FROM insats WHERE medlem_id=? AND datum BETWEEN ? AND ?',
      medlem_id, ...period)?.t ?? 0;
  const bokade = alla(
    `SELECT p.datum, p.start, p.slut, b.status FROM bokning b JOIN pass p ON p.id=b.pass_id
     WHERE b.medlem_id=? AND b.status IN (${aktivaFragetecken}) AND p.datum BETWEEN ? AND ?`,
    medlem_id, ...AKTIVA, ...period
  );
  const planerat = bokade
    .filter((b) => b.datum >= idag() && b.status !== 'narvarande')
    .reduce((a, b) => a + passTimmar(b.start, b.slut), 0);
  const totalt = Math.round((utfort + planerat) * 10) / 10;
  return {
    medlem_id,
    namn: m?.namn,
    epost: m?.epost,
    undantagen: kvot <= 0,
    kvot,
    timmar: totalt,
    utfort: Math.round(utfort * 10) / 10,
    planerat: Math.round(planerat * 10) / 10,
    andel: kvot > 0 ? Math.round((totalt / kvot) * 100) : null,
    kvar: kvot > 0 ? Math.max(0, Math.round((kvot - totalt) * 10) / 10) : 0,
    natt: bokade.filter((b) => passSlag(b.start, b.slut) === 'natt').length,
    helg: bokade.filter((b) => arHelg(b.datum)).length,
    antal_pass: bokade.length,
    kvot_nattpass: s?.kvot_nattpass ?? 2,
  };
}

export const allaLagen = () => {
  const s = aktivSasong();
  return alla('SELECT id FROM medlem WHERE aktiv=1').map((m) => lageFor(m.id, s));
};

const minaPassFor = (medlem_id, fran, till) =>
  alla(
    `SELECT p.datum, p.start, p.slut, pos.namn AS position, b.status
     FROM bokning b JOIN pass p ON p.id=b.pass_id JOIN position pos ON pos.id=p.position_id
     WHERE b.medlem_id=? AND b.status IN (${aktivaFragetecken}) AND p.datum BETWEEN ? AND ?
     ORDER BY p.datum, p.start`,
    medlem_id, ...AKTIVA, fran, till
  );

const lediga = (fran, till) =>
  passlista(fran, till)
    .filter((p) => p.bokade < p.behov)
    .map((p) => ({ ...p, saknas: p.behov - p.bokade }));

/** Lägger till en bokning med alla kontroller. */
function bokaIn({ pass_id, medlem_id, kalla, status, av, kommentar }) {
  const p = en(
    `SELECT p.*, pos.kravs_roll, pos.nyckel,
            (SELECT count(*) FROM bokning b WHERE b.pass_id=p.id AND b.status IN (${aktivaFragetecken})) AS bokade
     FROM pass p JOIN position pos ON pos.id=p.position_id WHERE p.id=?`,
    ...AKTIVA, pass_id
  );
  if (!p) throw fel(404, 'Passet finns inte');
  const m = en('SELECT * FROM medlem WHERE id=? AND aktiv=1', medlem_id);
  if (!m) throw fel(404, 'Medlemmen finns inte');
  const sjalv = av?.id === medlem_id;
  const ansvarig = RANG[av?.roll] >= RANG.backansvarig;
  if (!sjalv && !ansvarig) throw fel(403, 'Du kan bara boka dig själv');
  if (!p.publicerad && !ansvarig) throw fel(403, 'Passet är inte publicerat');
  if (p.kravs_roll && RANG[m.roll] < RANG[p.kravs_roll])
    throw fel(400, `Passet kräver rollen ${p.kravs_roll}`);
  if (p.bokade >= p.behov && !ansvarig) throw fel(409, 'Passet är fullbokat');

  const fanns = en('SELECT * FROM bokning WHERE pass_id=? AND medlem_id=?', pass_id, medlem_id);
  if (fanns && AKTIVA.includes(fanns.status)) throw fel(409, 'Redan bokad på passet');

  const krock = en(
    `SELECT p2.start, p2.slut, pos.namn FROM bokning b JOIN pass p2 ON p2.id=b.pass_id
     JOIN position pos ON pos.id=p2.position_id
     WHERE b.medlem_id=? AND b.status IN (${aktivaFragetecken}) AND p2.datum=? AND p2.id<>?
       AND p2.start < ? AND p2.slut > ?`,
    medlem_id, ...AKTIVA, p.datum, p.id, p.slut, p.start
  );
  if (krock && !ansvarig)
    throw fel(409, `Krockar med ${krock.namn} ${krock.start}-${krock.slut}`);

  const otill = en(
    'SELECT * FROM otillganglighet WHERE medlem_id=? AND fran<=? AND till>=?',
    medlem_id, p.datum, p.datum
  );
  if (otill && !ansvarig) throw fel(409, `Du är markerad otillgänglig ${otill.fran}–${otill.till}`);

  if (fanns) {
    uppdatera('bokning', fanns.id, { status: status || 'bokad', kalla, kommentar, tid: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    return fanns.id;
  }
  return spara('bokning', { pass_id, medlem_id, status: status || 'bokad', kalla, kommentar });
}

export const rutter = [
  rutt('GET', '/api/bemanning/rutnat', 'medlem', ({ res, fraga }) => {
    const fran = datum(fraga.get('fran')) || idag();
    const till = datum(fraga.get('till')) || plusDagar(fran, 27);
    svar(res, 200, rutnat(fran, till));
  }),

  // ---- pass ----
  rutt('POST', '/api/bemanning/pass', 'backansvarig', ({ res, kropp }) => {
    const dagar = Array.isArray(kropp.dagar) && kropp.dagar.length
      ? kropp.dagar.map((d) => datum(d, 'Datum'))
      : [datum(kropp.datum, 'Datum')];
    if (!dagar[0]) throw fel(400, 'Datum krävs');
    const positioner = Array.isArray(kropp.positioner) && kropp.positioner.length
      ? kropp.positioner.map((p) => heltal(p))
      : [heltal(kropp.position_id)];
    if (!positioner[0]) throw fel(400, 'Position krävs');
    const start = klocka(kropp.start, 'Start') || (() => { throw fel(400, 'Start krävs'); })();
    const slut = klocka(kropp.slut, 'Slut') || (() => { throw fel(400, 'Slut krävs'); })();
    const skapade = [];
    transaktion(() => {
      for (const d of dagar) {
        for (const pos of positioner) {
          const finns = en('SELECT id FROM pass WHERE datum=? AND start=? AND position_id=?', d, start, pos);
          const data = {
            behov: Math.max(1, heltal(kropp.behov, 1)),
            slut,
            slag: passSlag(start, slut),
            vikt: num(kropp.vikt) ?? 1,
            publicerad: bool(kropp.publicerad) ?? 1,
            anteckning: txt(kropp.anteckning),
          };
          if (finns) {
            uppdatera('pass', finns.id, data);
            skapade.push(finns.id);
          } else {
            skapade.push(spara('pass', { datum: d, start, position_id: pos, ...data }));
          }
        }
      }
    });
    svar(res, 201, { antal: skapade.length, ids: skapade });
  }),

  rutt('PUT', '/api/bemanning/pass/:id', 'backansvarig', ({ res, param, kropp }) => {
    const p = en('SELECT * FROM pass WHERE id=?', param.id);
    if (!p) throw fel(404, 'Passet finns inte');
    const start = klocka(kropp.start, 'Start') ?? p.start;
    const slut = klocka(kropp.slut, 'Slut') ?? p.slut;
    uppdatera('pass', p.id, {
      start, slut,
      slag: passSlag(start, slut),
      behov: kropp.behov === undefined ? undefined : Math.max(0, heltal(kropp.behov, 1)),
      vikt: kropp.vikt === undefined ? undefined : num(kropp.vikt),
      publicerad: bool(kropp.publicerad),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
    });
    svar(res, 200, en('SELECT * FROM pass WHERE id=?', p.id));
  }),

  rutt('DELETE', '/api/bemanning/pass/:id', 'backansvarig', ({ res, param }) => {
    const antal = en(`SELECT count(*) AS n FROM bokning WHERE pass_id=? AND status IN (${aktivaFragetecken})`, param.id, ...AKTIVA).n;
    if (antal) throw fel(409, `Passet har ${antal} bokningar. Avboka först.`);
    kor('DELETE FROM pass WHERE id=?', param.id);
    svar(res, 200, { ok: true });
  }),

  // ---- bokningar ----
  rutt('POST', '/api/bemanning/pass/:id/boka', 'medlem', ({ res, param, kropp, medlem }) => {
    const id = bokaIn({
      pass_id: heltal(param.id),
      medlem_id: heltal(kropp.medlem_id) ?? medlem.id,
      kalla: kropp.medlem_id && Number(kropp.medlem_id) !== medlem.id ? 'admin' : 'sjalv',
      av: medlem,
      kommentar: txt(kropp.kommentar),
    });
    svar(res, 201, en('SELECT * FROM bokning WHERE id=?', id));
  }),

  rutt('PUT', '/api/bemanning/bokningar/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const b = en('SELECT * FROM bokning WHERE id=?', param.id);
    if (!b) throw fel(404, 'Bokningen finns inte');
    const ansvarig = RANG[medlem.roll] >= RANG.backansvarig;
    if (b.medlem_id !== medlem.id && !ansvarig) throw fel(403, 'Inte din bokning');
    const status = ettAv(kropp.status, BOKNINGSSTATUS, 'Status');
    if (status && !ansvarig && !['avbokad', 'bokad'].includes(status))
      throw fel(403, 'Bara ansvariga sätter närvaro');
    uppdatera('bokning', b.id, { status, kommentar: kropp.kommentar === undefined ? undefined : txt(kropp.kommentar) });
    // Närvaro blir en insats i medlemmens historik.
    if (status === 'narvarande') {
      const p = en('SELECT * FROM pass WHERE id=?', b.pass_id);
      const finns = en('SELECT id FROM insats WHERE pass_id=? AND medlem_id=?', b.pass_id, b.medlem_id);
      if (!finns)
        spara('insats', {
          medlem_id: b.medlem_id, datum: p.datum, timmar: passTimmar(p.start, p.slut),
          slag: 'pass', pass_id: p.id, beskrivning: 'Genomfört pass',
        });
    } else if (status) {
      kor(`DELETE FROM insats WHERE pass_id=? AND medlem_id=? AND slag='pass'`, b.pass_id, b.medlem_id);
    }
    svar(res, 200, en('SELECT * FROM bokning WHERE id=?', b.id));
  }),

  rutt('DELETE', '/api/bemanning/bokningar/:id', 'medlem', ({ res, param, medlem }) => {
    const b = en('SELECT * FROM bokning WHERE id=?', param.id);
    if (!b) throw fel(404, 'Bokningen finns inte');
    if (b.medlem_id !== medlem.id && RANG[medlem.roll] < RANG.backansvarig)
      throw fel(403, 'Inte din bokning');
    kor('DELETE FROM bokning WHERE id=?', b.id);
    kor(`DELETE FROM insats WHERE pass_id=? AND medlem_id=? AND slag='pass'`, b.pass_id, b.medlem_id);
    svar(res, 200, { ok: true });
  }),

  // ---- kvoter och insatser ----
  rutt('GET', '/api/bemanning/lage', 'medlem', ({ res, fraga, medlem }) => {
    if (fraga.get('alla') && RANG[medlem.roll] >= RANG.backansvarig)
      return svar(res, 200, allaLagen().sort((a, b) => a.andel - b.andel));
    svar(res, 200, [lageFor(medlem.id)]);
  }),

  rutt('GET', '/api/bemanning/mina', 'medlem', ({ res, fraga, medlem }) => {
    const fran = datum(fraga.get('fran')) || plusDagar(idag(), -90);
    const till = datum(fraga.get('till')) || plusDagar(idag(), 180);
    svar(res, 200, {
      lage: lageFor(medlem.id),
      pass: minaPassFor(medlem.id, fran, till),
      insatser: alla('SELECT * FROM insats WHERE medlem_id=? ORDER BY datum DESC LIMIT 200', medlem.id),
      otillganglighet: alla('SELECT * FROM otillganglighet WHERE medlem_id=? ORDER BY fran', medlem.id),
      lediga: lediga(idag(), till).slice(0, 60),
    });
  }),

  rutt('POST', '/api/bemanning/otillganglighet', 'medlem', ({ res, kropp, medlem }) => {
    const id = spara('otillganglighet', {
      medlem_id: heltal(kropp.medlem_id) && RANG[medlem.roll] >= RANG.backansvarig ? heltal(kropp.medlem_id) : medlem.id,
      fran: datum(kropp.fran, 'Från') || (() => { throw fel(400, 'Från krävs'); })(),
      till: datum(kropp.till, 'Till') || datum(kropp.fran, 'Från'),
      orsak: txt(kropp.orsak, 200),
    });
    svar(res, 201, en('SELECT * FROM otillganglighet WHERE id=?', id));
  }),

  rutt('DELETE', '/api/bemanning/otillganglighet/:id', 'medlem', ({ res, param, medlem }) => {
    const o = en('SELECT * FROM otillganglighet WHERE id=?', param.id);
    if (!o) throw fel(404, 'Finns inte');
    if (o.medlem_id !== medlem.id && RANG[medlem.roll] < RANG.backansvarig) throw fel(403, 'Inte din');
    kor('DELETE FROM otillganglighet WHERE id=?', o.id);
    svar(res, 200, { ok: true });
  }),

  rutt('POST', '/api/bemanning/insatser', 'backansvarig', ({ res, kropp }) => {
    const id = spara('insats', {
      medlem_id: heltal(kropp.medlem_id) || (() => { throw fel(400, 'Medlem krävs'); })(),
      datum: datum(kropp.datum, 'Datum') || idag(),
      timmar: num(kropp.timmar) ?? (() => { throw fel(400, 'Timmar krävs'); })(),
      slag: ettAv(kropp.slag, ['pass', 'snolaggning', 'arbetsdag', 'ovrigt'], 'Slag') || 'ovrigt',
      beskrivning: txt(kropp.beskrivning),
    });
    svar(res, 201, en('SELECT * FROM insats WHERE id=?', id));
  }),

  rutt('DELETE', '/api/bemanning/insatser/:id', 'backansvarig', ({ res, param }) => {
    kor('DELETE FROM insats WHERE id=?', param.id);
    svar(res, 200, { ok: true });
  }),

  // ---- automatplanering ----
  rutt('POST', '/api/bemanning/autoplan', 'backansvarig', ({ res, kropp, medlem }) => {
    const fran = datum(kropp.fran, 'Från') || idag();
    const till = datum(kropp.till, 'Till') || plusDagar(fran, 27);
    const s = aktivSasong();
    const positioner = Object.fromEntries(positionslista().map((p) => [p.id, p]));
    const pass = passlista(fran, till).filter((p) => p.publicerad && p.behov > p.bokade);
    const medlemmar = alla('SELECT * FROM medlem WHERE aktiv=1').map((m) => ({
      ...m,
      kompetens: JSON.parse(m.kompetens || '[]'),
    }));
    const period = s ? [s.start, s.slut] : [plusDagar(fran, -200), plusDagar(till, 200)];
    const befintliga = alla(
      `SELECT b.medlem_id, b.pass_id, p.datum, p.start, p.slut, p.position_id FROM bokning b
       JOIN pass p ON p.id=b.pass_id
       WHERE b.status IN (${aktivaFragetecken}) AND p.datum BETWEEN ? AND ?`,
      ...AKTIVA, ...period
    );
    const forslag = planera({
      pass, medlemmar, befintliga,
      tak: kropp.tak === undefined ? 1.25 : num(kropp.tak) || null,
      otillganglig: alla('SELECT * FROM otillganglighet'),
      sasong: s, positioner, rang: RANG,
    });

    if (kropp.torrkor !== false) return svar(res, 200, { ...forslag, skrivet: false });

    let skrivna = 0;
    transaktion(() => {
      for (const t of forslag.tilldelningar) {
        try {
          bokaIn({ pass_id: t.pass_id, medlem_id: t.medlem_id, kalla: 'auto', status: 'tilldelad', av: medlem });
          skrivna++;
        } catch { /* hoppar över det som krockar vid skrivning */ }
      }
    });
    svar(res, 200, { ...forslag, skrivet: true, skrivna });
  }),

  // ---- utskick ----
  rutt('POST', '/api/bemanning/utskick', 'backansvarig', async ({ res, kropp }) => {
    const fran = datum(kropp.fran, 'Från') || idag();
    const till = datum(kropp.till, 'Till') || plusDagar(fran, 27);
    const bara = kropp.bara_under_kvot !== false;
    const oppna = lediga(fran, till).map((p) => ({
      datum: p.datum, start: p.start, slut: p.slut, position: p.position, bokade: p.bokade, behov: p.behov,
    }));
    const mottagare = allaLagen().filter((l) => (bara ? l.kvar > 0 : true));
    const resultat = [];
    for (const l of mottagare) {
      const r = await skicka({
        till: l.epost,
        amne: `[HAK] Bemanning ${fran} – ${till}: ${l.kvar > 0 ? `${l.kvar} h kvar att boka` : 'ditt schema'}`,
        text: brevBokning({
          medlem: { namn: l.namn || '' },
          lage: l,
          minaPass: minaPassFor(l.medlem_id, fran, till),
          lediga: oppna,
          fran, till,
        }),
        slag: 'bemanning',
      });
      resultat.push({ medlem_id: l.medlem_id, namn: l.namn, epost: l.epost, ...r });
    }
    svar(res, 200, {
      antal: resultat.length,
      skickade: resultat.filter((r) => r.skickad).length,
      resultat,
    });
  }),

  rutt('GET', '/api/bemanning/schema.csv', 'medlem', ({ res, fraga }) => {
    const fran = datum(fraga.get('fran')) || idag();
    const till = datum(fraga.get('till')) || plusDagar(fran, 27);
    const rader = [];
    for (const p of rutnat(fran, till).pass) {
      rader.push({
        datum: p.datum, start: p.start, slut: p.slut, position: p.position,
        behov: p.behov, bokade: p.bokningar.filter((b) => AKTIVA.includes(b.status)).length,
        namn: p.bokningar.filter((b) => AKTIVA.includes(b.status)).map((b) => b.namn).join(', '),
        slag: p.slag, anteckning: p.anteckning,
      });
    }
    text(res, 200, csv(rader, [
      { falt: 'datum', rubrik: 'Datum' }, { falt: 'start', rubrik: 'Start' }, { falt: 'slut', rubrik: 'Slut' },
      { falt: 'position', rubrik: 'Position' }, { falt: 'behov', rubrik: 'Behov' },
      { falt: 'bokade', rubrik: 'Bokade' }, { falt: 'namn', rubrik: 'Personer' },
      { falt: 'slag', rubrik: 'Passtyp' }, { falt: 'anteckning', rubrik: 'Anteckning' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="schema-${fran}.csv"` });
  }),
];
