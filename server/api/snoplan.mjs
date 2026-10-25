// Snöläggning: från prognosfönster till bemannade pass.
//
// Kedjan är avsiktligt uppdelad i steg som en människa går igenom:
// prognosen föreslår ett fönster, driftansvarig väljer, systemet räknar
// fram passen, förfrågningar skickas till dem som kan, och först när någon
// svarat ja finns det bemanning. En skickad fråga är inte ett ja.
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { RANG } from '../auth.mjs';
import { minstRoll } from '../behorighet.mjs';
import { instans } from '../foreningar.mjs';
import { skicka } from '../epost.mjs';
import { kandidater, lage, NIVAER, passUrFonster } from '../snoplan.mjs';
import { prognos } from '../vader.mjs';
import { bool, datum, ettAv, fel, heltal, num, rutt, svar, tidpunkt, txt } from '../http.mjs';
import { idag, nu, passTimmar, plusDagar } from '../tid.mjs';
import { aktivSasong, positionslista } from './register.mjs';

const NIVALISTA = Object.entries(NIVAER).map(([nyckel, n]) => ({ nyckel, ...n }));

/** Medlemmar som kan vara aktuella för bemanning. */
const aktiva = () =>
  alla(
    `SELECT id, namn, roll, epost, telefon, kompetens, kvot_timmar, fodelsedatum FROM medlem
      WHERE aktiv=1 AND utradesdatum IS NULL`
  ).map((m) => ({ ...m, kompetens: JSON.parse(m.kompetens || '[]') }));

const positionskarta = () => Object.fromEntries(positionslista().map((p) => [p.id, p]));

/** Hur mycket var och en gjort i säsongen, för rättvis ordning. */
function insatserISasongen(sasong) {
  const ut = {};
  if (!sasong) return ut;
  for (const r of alla(
    `SELECT b.medlem_id, p.datum, p.start, p.slut, p.slag
       FROM bokning b JOIN pass p ON p.id=b.pass_id
      WHERE b.status IN ('bokad','tilldelad','narvarande')
        AND p.datum BETWEEN ? AND ?`,
    sasong.start,
    sasong.slut
  )) {
    const i = (ut[r.medlem_id] ||= { timmar: 0, natt: 0 });
    i.timmar += passTimmar(r.start, r.slut);
    if (r.slag === 'natt') i.natt += 1;
  }
  return ut;
}

export const hamtaFonster = (id) =>
  en(
    `SELECT f.*, m.namn AS av,
            (SELECT count(*) FROM pass p WHERE p.snofonster_id=f.id) AS pass
       FROM snofonster f LEFT JOIN medlem m ON m.id=f.av_id WHERE f.id=?`,
    id
  );

/** Prognosens fönster, med de som redan tagits om hand utmärkta. */
async function fonsterlage() {
  const v = await prognos().catch(() => null);
  // Samma berikning som hamtaFonster, annars saknas passräkningen i listan.
  const sparade = alla(
    `SELECT f.*, m.namn AS av,
            (SELECT count(*) FROM pass p WHERE p.snofonster_id=f.id) AS pass
       FROM snofonster f LEFT JOIN medlem m ON m.id=f.av_id
      WHERE f.till >= datetime('now','-2 days') ORDER BY f.fran`
  );
  const ur_prognos = (v?.vecka?.fonster || []).map((f) => ({
    ...f,
    // Fönstret kan redan vara hanterat; då ska det inte föreslås igen.
    sparat: sparade.find((s) => s.fran.slice(0, 13) === f.fran.replace('T', ' ').slice(0, 13)) || null,
  }));
  const dygn = v?.vecka?.dygn || [];
  return {
    prognos: ur_prognos,
    sparade,
    plats: v?.plats ?? null,
    uppdaterad: v?.uppdaterad ?? null,
    // Finns inga fönster ska det synas varför, inte bara att listan är tom.
    utsikt: dygn.length
      ? {
          dygn,
          kallaste: Math.min(...dygn.map((d) => d.wetbulb_min)),
          narmast: dygn.find((d) => d.produktionstimmar > 0) || null,
        }
      : null,
  };
}

/** Bemanningsläget för ett antal pass, med förfrågningar inräknade. */
function passlage(pass) {
  if (!pass.length) return [];
  const ids = pass.map((p) => p.id);
  const i = ids.map(() => '?').join(',');
  const bokningar = alla(
    `SELECT b.*, m.namn, m.telefon FROM bokning b JOIN medlem m ON m.id=b.medlem_id
      WHERE b.pass_id IN (${i})`,
    ...ids
  );
  const forfragningar = alla(
    `SELECT f.*, m.namn FROM forfragan f JOIN medlem m ON m.id=f.medlem_id
      WHERE f.pass_id IN (${i})`,
    ...ids
  );
  return pass.map((p) => ({
    ...p,
    ...lage(p, { bokningar, forfragningar }),
    bemanning: bokningar
      .filter((b) => b.pass_id === p.id && !['avbokad', 'uteblev'].includes(b.status))
      .map((b) => ({ medlem_id: b.medlem_id, namn: b.namn, status: b.status, telefon: b.telefon })),
    tillfragade: forfragningar
      .filter((f) => f.pass_id === p.id)
      .map((f) => ({ medlem_id: f.medlem_id, namn: f.namn, status: f.status, omgang: f.omgang })),
  }));
}

const brevForfragan = (medlem, pass, fonster, bas) =>
  [
    `Hej ${medlem.namn.split(' ')[0]}!`,
    '',
    fonster
      ? `Prognosen ger ett produktionsfönster ${fonster.fran} – ${fonster.till}` +
        (fonster.lagsta_wetbulb != null ? ` (ned till ${fonster.lagsta_wetbulb} °C wetbulb).` : '.')
      : 'Vi behöver folk på ett pass.',
    '',
    `Passet: ${pass.datum} ${pass.start}–${pass.slut}, ${pass.position}.`,
    '',
    'Svara ja eller nej i appen:',
    `${bas}/bemanning`,
    '',
    'Det här är en förfrågan, inte en bokning. Du är inte inbokad förrän du svarat ja.',
  ].join('\n');

export const rutter = [
  // ---------- Fönster ----------
  rutt('GET', '/api/snoplan/fonster', '@bemanning', async ({ res }) =>
    svar(res, 200, await fonsterlage())
  ),

  /** Driftansvarig tar ställning till ett fönster. */
  rutt('POST', '/api/snoplan/fonster', '@bemanning', ({ res, kropp, medlem }) => {
    const fran = tidpunkt(kropp.fran, 'Från');
    const till = tidpunkt(kropp.till, 'Till');
    if (!fran || !till) throw fel(400, 'Ange både från och till');
    if (till <= fran) throw fel(400, 'Fönstret slutar innan det börjar');
    const id = spara('snofonster', {
      fran,
      till,
      lagsta_wetbulb: num(kropp.lagsta_wetbulb),
      timmar: num(kropp.timmar) ?? Math.round(((new Date(till.replace(' ', 'T')) - new Date(fran.replace(' ', 'T'))) / 3600000) * 10) / 10,
      kalla: ettAv(kropp.kalla, ['prognos', 'manuell'], 'Källa') || 'prognos',
      status: ettAv(kropp.status, ['forslag', 'planerat', 'avfardat', 'genomfort'], 'Status') || 'forslag',
      anteckning: txt(kropp.anteckning),
      av_id: medlem.id,
    });
    svar(res, 201, { fonster: hamtaFonster(id) });
  }),

  rutt('PATCH', '/api/snoplan/fonster/:id', '@bemanning', ({ res, param, kropp }) => {
    if (!hamtaFonster(param.id)) throw fel(404, 'Fönstret finns inte');
    uppdatera('snofonster', param.id, {
      status: ettAv(kropp.status, ['forslag', 'planerat', 'avfardat', 'genomfort'], 'Status'),
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 200, { fonster: hamtaFonster(param.id) });
  }),

  /**
   * Förhandsvisning: så här skulle fönstret bli pass. Inget skrivs – den
   * som planerar ska se förslaget innan det finns i schemat.
   */
  rutt('POST', '/api/snoplan/fonster/:id/forslag', '@bemanning', ({ res, param, kropp }) => {
    const f = hamtaFonster(param.id);
    if (!f) throw fel(404, 'Fönstret finns inte');
    svar(res, 200, {
      fonster: f,
      pass: passUrFonster(f, { passlangd: num(kropp.passlangd) ?? 6 }).map((p) => ({
        ...p,
        behov: heltal(kropp.behov, 2),
        // Krockar med redan lagda pass ska synas innan man trycker.
        finns: !!en(
          'SELECT id FROM pass WHERE datum=? AND start=? AND position_id=?',
          p.datum, p.start, heltal(kropp.position_id)
        ),
      })),
    });
  }),

  /** Skapar passen. Bemanningsbehov, inte bemanning. */
  rutt('POST', '/api/snoplan/fonster/:id/bemanna', '@bemanning', ({ res, param, kropp }) => {
    const f = hamtaFonster(param.id);
    if (!f) throw fel(404, 'Fönstret finns inte');
    const position_id = heltal(kropp.position_id);
    if (!position_id) throw fel(400, 'Välj position');
    const behov = Math.max(1, heltal(kropp.behov, 2));
    return transaktion(() => {
      const skapade = [];
      const hoppade = [];
      for (const p of passUrFonster(f, { passlangd: num(kropp.passlangd) ?? 6 })) {
        // Samma pass två gånger blir dubbelbokning – hoppa hellre över.
        const finns = en(
          'SELECT id FROM pass WHERE datum=? AND start=? AND position_id=?',
          p.datum, p.start, position_id
        );
        if (finns) {
          hoppade.push({ ...p, pass_id: finns.id });
          continue;
        }
        const id = spara('pass', {
          datum: p.datum,
          start: p.start,
          slut: p.slut,
          position_id,
          behov,
          slag: p.slag,
          snofonster_id: f.id,
          anteckning: txt(kropp.anteckning) || `Snöläggning, fönster ${f.fran}–${f.till}`,
        });
        skapade.push({ ...p, id });
      }
      uppdatera('snofonster', f.id, { status: 'planerat' });
      svar(res, 201, { fonster: hamtaFonster(f.id), skapade, hoppade });
    });
  }),

  // ---------- Tillgänglighet ----------
  rutt('GET', '/api/snoplan/tillganglighet', 'medlem', ({ res, medlem }) => {
    const sasong = aktivSasong();
    const far_se_alla = minstRoll(medlem, 'backansvarig');
    svar(res, 200, {
      sasong,
      nivaer: NIVALISTA,
      min: sasong
        ? en('SELECT * FROM tillganglighet WHERE medlem_id=? AND sasong_id=?', medlem.id, sasong.id)
        : null,
      alla: far_se_alla && sasong
        ? alla(
            `SELECT t.*, m.namn FROM tillganglighet t JOIN medlem m ON m.id=t.medlem_id
              WHERE t.sasong_id=? ORDER BY m.namn`,
            sasong.id
          )
        : null,
      // Vilka som inte svarat är det som faktiskt behöver åtgärdas.
      saknas: far_se_alla && sasong
        ? alla(
            `SELECT m.id, m.namn, m.epost FROM medlem m
              WHERE m.aktiv=1 AND m.utradesdatum IS NULL
                AND NOT EXISTS (SELECT 1 FROM tillganglighet t
                                 WHERE t.medlem_id=m.id AND t.sasong_id=?)
              ORDER BY m.namn`,
            sasong.id
          )
        : null,
    });
  }),

  rutt('PUT', '/api/snoplan/tillganglighet', 'medlem', ({ res, kropp, medlem }) => {
    const sasong = aktivSasong();
    if (!sasong) throw fel(409, 'Ingen aktiv säsong');
    // Backansvarig får fylla i åt någon som ringt in sitt besked.
    const for_id = heltal(kropp.medlem_id) ?? medlem.id;
    if (for_id !== medlem.id && !minstRoll(medlem, 'backansvarig'))
      throw fel(403, 'Du kan bara svara för dig själv');
    const data = {
      niva: ettAv(kropp.niva, Object.keys(NIVAER), 'Nivå') || 'kanske',
      nattpass: bool(kropp.nattpass) ?? 1,
      helger: bool(kropp.helger) ?? 1,
      max_pass: heltal(kropp.max_pass),
      kommentar: txt(kropp.kommentar),
      uppdaterad: nu(),
    };
    const fanns = en('SELECT id FROM tillganglighet WHERE medlem_id=? AND sasong_id=?', for_id, sasong.id);
    if (fanns) uppdatera('tillganglighet', fanns.id, data);
    else spara('tillganglighet', { medlem_id: for_id, sasong_id: sasong.id, ...data });
    svar(res, 200, {
      tillganglighet: en('SELECT * FROM tillganglighet WHERE medlem_id=? AND sasong_id=?', for_id, sasong.id),
    });
  }),

  // ---------- Förfrågningar ----------
  /** Vem som kan ta passet, i den ordning de bör frågas. */
  rutt('GET', '/api/snoplan/pass/:id/kandidater', '@bemanning', ({ res, param }) => {
    const pass = en('SELECT * FROM pass WHERE id=?', param.id);
    if (!pass) throw fel(404, 'Passet finns inte');
    const sasong = aktivSasong();
    const lista = kandidater({
      pass,
      medlemmar: aktiva(),
      tillganglighet: sasong
        ? alla('SELECT * FROM tillganglighet WHERE sasong_id=?', sasong.id)
        : [],
      bokningar: alla(
        `SELECT b.medlem_id, b.pass_id, p.datum, p.start, p.slut FROM bokning b
           JOIN pass p ON p.id=b.pass_id
          WHERE b.status IN ('bokad','tilldelad','narvarande')`
      ),
      otillganglig: alla('SELECT * FROM otillganglighet'),
      positioner: positionskarta(),
      rang: RANG,
      insatser: insatserISasongen(sasong),
    });
    const redan = alla('SELECT medlem_id, status FROM forfragan WHERE pass_id=?', pass.id);
    svar(res, 200, {
      pass: passlage([pass])[0],
      kandidater: lista.map((k) => ({
        medlem_id: k.medlem.id,
        namn: k.medlem.namn,
        kan: k.kan,
        niva: k.niva ?? null,
        omgang: k.omgang ?? null,
        gjort_timmar: k.gjort_timmar ?? null,
        hinder: k.hinder,
        fragad: redan.find((r) => r.medlem_id === k.medlem.id)?.status ?? null,
      })),
    });
  }),

  /** Skickar frågan. Till dem som pekas ut, eller till nästa omgång. */
  rutt('POST', '/api/snoplan/pass/:id/forfragan', '@bemanning', async ({ res, param, kropp, medlem }) => {
    const pass = en(
      `SELECT p.*, pos.namn AS position FROM pass p JOIN position pos ON pos.id=p.position_id WHERE p.id=?`,
      param.id
    );
    if (!pass) throw fel(404, 'Passet finns inte');
    const sasong = aktivSasong();
    const lista = kandidater({
      pass,
      medlemmar: aktiva(),
      tillganglighet: sasong ? alla('SELECT * FROM tillganglighet WHERE sasong_id=?', sasong.id) : [],
      bokningar: alla(
        `SELECT b.medlem_id, b.pass_id, p.datum, p.start, p.slut FROM bokning b
           JOIN pass p ON p.id=b.pass_id WHERE b.status IN ('bokad','tilldelad','narvarande')`
      ),
      otillganglig: alla('SELECT * FROM otillganglighet'),
      positioner: positionskarta(),
      rang: RANG,
      insatser: insatserISasongen(sasong),
    }).filter((k) => k.kan);

    const omgang = Math.min(2, Math.max(1, heltal(kropp.omgang, 1)));
    const valda = kropp.medlemmar?.length
      ? lista.filter((k) => kropp.medlemmar.includes(k.medlem.id))
      : lista.filter((k) => k.omgang <= omgang);
    if (!valda.length) throw fel(409, 'Ingen som kan ta passet är kvar att fråga');

    const l = lage(pass, {
      bokningar: alla('SELECT * FROM bokning WHERE pass_id=?', pass.id),
      forfragningar: alla('SELECT * FROM forfragan WHERE pass_id=?', pass.id),
    });
    // Fråga inte fler än det faktiskt saknas folk till, om inte någon
    // uttryckligen pekat ut vilka.
    const antal = kropp.medlemmar?.length ? valda.length : Math.max(1, l.saknas - l.vantar);
    const mottagare = valda.slice(0, antal);

    const bas = instans('bas_url', 'https://hak.nattviken.com');
    const fonster = pass.snofonster_id ? hamtaFonster(pass.snofonster_id) : null;
    const skickade = [];
    for (const k of mottagare) {
      const fanns = en('SELECT * FROM forfragan WHERE pass_id=? AND medlem_id=?', pass.id, k.medlem.id);
      if (fanns && fanns.status === 'skickad') continue;
      if (fanns) uppdatera('forfragan', fanns.id, { status: 'skickad', skickad: nu(), svarad: null, omgang: k.omgang });
      else
        spara('forfragan', {
          pass_id: pass.id,
          medlem_id: k.medlem.id,
          omgang: k.omgang,
          kanal: k.medlem.epost ? 'epost' : 'app',
        });
      skickade.push({ medlem_id: k.medlem.id, namn: k.medlem.namn, omgang: k.omgang });
      if (k.medlem.epost)
        await skicka({
          till: k.medlem.epost,
          amne: `[HAK] Kan du ta snöläggning ${pass.datum} ${pass.start}–${pass.slut}?`,
          text: brevForfragan(k.medlem, pass, fonster, bas),
          slag: 'forfragan',
        });
    }
    svar(res, 201, { skickade, pass: passlage([pass])[0] });
  }),

  /** Mina obesvarade frågor. */
  rutt('GET', '/api/snoplan/mina-forfragningar', 'medlem', ({ res, medlem }) =>
    svar(res, 200, {
      forfragningar: alla(
        `SELECT f.*, p.datum, p.start, p.slut, p.slag, pos.namn AS position,
                fo.fran AS fonster_fran, fo.till AS fonster_till, fo.lagsta_wetbulb
           FROM forfragan f
           JOIN pass p ON p.id=f.pass_id
           JOIN position pos ON pos.id=p.position_id
           LEFT JOIN snofonster fo ON fo.id=p.snofonster_id
          WHERE f.medlem_id=? AND f.status='skickad' AND p.datum >= date('now','-1 day')
          ORDER BY p.datum, p.start`,
        medlem.id
      ),
    })
  ),

  /** Ja blir en bokning. Nej blir ett nej – och visar om passet nu larmar. */
  rutt('POST', '/api/snoplan/forfragningar/:id/svar', 'medlem', ({ res, param, kropp, medlem }) => {
    const f = en('SELECT * FROM forfragan WHERE id=?', param.id);
    if (!f) throw fel(404, 'Förfrågan finns inte');
    if (f.medlem_id !== medlem.id) throw fel(403, 'Det är inte din förfrågan');
    if (f.status !== 'skickad') throw fel(409, 'Förfrågan är redan besvarad');
    const ja = !!kropp.ja;
    return transaktion(() => {
      uppdatera('forfragan', f.id, {
        status: ja ? 'accepterad' : 'avbojd',
        svarad: nu(),
        kommentar: txt(kropp.kommentar),
      });
      if (ja) {
        const pass = en('SELECT * FROM pass WHERE id=?', f.pass_id);
        const krock = en(
          `SELECT p.datum, p.start FROM bokning b JOIN pass p ON p.id=b.pass_id
            WHERE b.medlem_id=? AND b.status IN ('bokad','tilldelad','narvarande')
              AND p.datum=? AND p.start=?`,
          medlem.id, pass.datum, pass.start
        );
        if (krock) throw fel(409, 'Du är redan bokad på ett pass som krockar');
        const fanns = en('SELECT * FROM bokning WHERE pass_id=? AND medlem_id=?', f.pass_id, medlem.id);
        if (fanns) uppdatera('bokning', fanns.id, { status: 'bokad', kalla: 'forfragan' });
        else spara('bokning', { pass_id: f.pass_id, medlem_id: medlem.id, status: 'bokad', kalla: 'forfragan' });
      }
      const pass = en(
        `SELECT p.*, pos.namn AS position FROM pass p JOIN position pos ON pos.id=p.position_id WHERE p.id=?`,
        f.pass_id
      );
      svar(res, 200, { forfragan: en('SELECT * FROM forfragan WHERE id=?', f.id), pass: passlage([pass])[0] });
    });
  }),

  // ---------- Läget: underskott och dagens personal ----------
  /** Pass som saknar folk, med det som ingen ens frågat om överst. */
  rutt('GET', '/api/snoplan/underskott', '@bemanning', ({ res, fraga }) => {
    const fran = fraga.get('fran') || idag();
    const till = fraga.get('till') || plusDagar(fran, 21);
    const pass = alla(
      `SELECT p.*, pos.namn AS position, pos.nyckel AS positionsnyckel
         FROM pass p JOIN position pos ON pos.id=p.position_id
        WHERE p.datum BETWEEN ? AND ? AND p.publicerad=1
        ORDER BY p.datum, p.start`,
      fran,
      till
    );
    const lagen = passlage(pass).filter((p) => p.saknas > 0);
    svar(res, 200, {
      fran,
      till,
      pass: lagen,
      // Det som ingen frågat om är det som faktiskt behöver göras nu.
      larm: lagen.filter((p) => p.oadresserat > 0),
      summa: {
        pass: lagen.length,
        platser: lagen.reduce((s, p) => s + p.saknas, 0),
        oadresserade: lagen.reduce((s, p) => s + p.oadresserat, 0),
      },
    });
  }),

  /**
   * Vem som arbetar i dag. Hämtas ur schemat, inte ur ett eget register.
   * Telefonnumret visas bara för den som ska kunna ringa.
   */
  rutt('GET', '/api/snoplan/idag', 'medlem', ({ res, fraga, medlem }) => {
    const dag = fraga.get('datum') || idag();
    const far_ringa = minstRoll(medlem, 'backansvarig');
    const pass = alla(
      `SELECT p.*, pos.namn AS position, pos.nyckel AS positionsnyckel, pos.farg
         FROM pass p JOIN position pos ON pos.id=p.position_id
        WHERE p.datum=? AND p.publicerad=1 ORDER BY pos.ordning, p.start`,
      dag
    );
    svar(res, 200, {
      datum: dag,
      // Egen bemanning ser man alltid; andras telefonnummer bara om man
      // har anledning att ringa dem.
      pass: passlage(pass).map((p) => ({
        ...p,
        bemanning: p.bemanning.map((b) => ({
          ...b,
          telefon: far_ringa || b.medlem_id === medlem.id ? b.telefon : null,
        })),
        tillfragade: far_ringa ? p.tillfragade : [],
      })),
      far_ringa,
    });
  }),
];
