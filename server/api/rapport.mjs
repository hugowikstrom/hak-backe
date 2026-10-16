// Rapporter för anläggningsansvarig: snöläggning, ärenden, bemanning och medlemsinsatser.
import { alla, en } from '../db.mjs';
import { csv, datum, rutt, svar, text } from '../http.mjs';
import { arHelg, idag, passSlag, passTimmar, plusDagar, veckonummer } from '../tid.mjs';
import { spridningsmatt } from '../autoplan.mjs';
import { allaLagen } from './bemanning.mjs';
import { OPPNA } from './arenden.mjs';
import { kompletteraMatning } from '../snoteknik.mjs';

const medel = (v) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
const GLAPP_TIMMAR = 3; // längre glapp räknas inte som drifttid

/** Snöläggningsrapport: drifttid, vattenvolym och förhållanden per utrustning. */
export function snorapport(fran, till) {
  const rader = alla(
    `SELECT m.*, u.namn AS utrustning, u.typ AS utrustningstyp, o.namn AS omrade
     FROM matning m LEFT JOIN utrustning u ON u.id=m.utrustning_id
     LEFT JOIN omrade o ON o.id=m.omrade_id
     WHERE date(m.tid) BETWEEN ? AND ? ORDER BY m.utrustning_id, m.tid`,
    fran, till
  ).map(kompletteraMatning);

  const grupper = new Map();
  for (const r of rader) {
    const nyckel = r.utrustning_id ?? 0;
    if (!grupper.has(nyckel))
      grupper.set(nyckel, { utrustning: r.utrustning || 'Ej angiven', omrade: r.omrade, typ: r.utrustningstyp, rader: [] });
    grupper.get(nyckel).rader.push(r);
  }

  const per = [...grupper.entries()].map(([id, g]) => {
    let timmar = 0;
    let volym = 0;
    for (let i = 1; i < g.rader.length; i++) {
      const t0 = new Date(g.rader[i - 1].tid.replace(' ', 'T'));
      const t1 = new Date(g.rader[i].tid.replace(' ', 'T'));
      const h = (t1 - t0) / 3.6e6;
      if (h <= 0 || h > GLAPP_TIMMAR) continue;
      const flode = g.rader[i - 1].vattenflode;
      if (flode == null) continue;
      timmar += h;
      volym += flode * h * 3600 / 1000; // l/s * s -> m3
    }
    const temp = g.rader.map((r) => r.lufttemp).filter((v) => v != null);
    const vk = g.rader.map((r) => r.vatkula).filter((v) => v != null);
    const fl = g.rader.map((r) => r.vattenflode).filter((v) => v != null);
    return {
      utrustning_id: id || null,
      utrustning: g.utrustning,
      omrade: g.omrade,
      typ: g.typ,
      antal_matningar: g.rader.length,
      temp_min: temp.length ? Math.min(...temp) : null,
      temp_medel: medel(temp),
      temp_max: temp.length ? Math.max(...temp) : null,
      vatkula_medel: medel(vk),
      vatkula_min: vk.length ? Math.min(...vk) : null,
      flode_medel: medel(fl),
      flode_max: fl.length ? Math.max(...fl) : null,
      drifttimmar: Math.round(timmar * 10) / 10,
      vattenvolym_m3: Math.round(volym),
      senaste: g.rader.at(-1)?.tid,
    };
  }).sort((a, b) => (b.vattenvolym_m3 || 0) - (a.vattenvolym_m3 || 0));

  const pass = alla(
    `SELECT s.*, m.namn AS ansvarig,
            (SELECT count(*) FROM matning WHERE snopass_id=s.id) AS antal_matningar
     FROM snopass s LEFT JOIN medlem m ON m.id=s.ansvarig_id
     WHERE date(s.start) BETWEEN ? AND ? ORDER BY s.start DESC`,
    fran, till
  );

  return {
    fran, till,
    per_utrustning: per,
    pass,
    summa: {
      matningar: rader.length,
      drifttimmar: Math.round(per.reduce((a, b) => a + b.drifttimmar, 0) * 10) / 10,
      vattenvolym_m3: per.reduce((a, b) => a + b.vattenvolym_m3, 0),
      kallaste_vatkula: per.map((p) => p.vatkula_min).filter((v) => v != null).length
        ? Math.min(...per.map((p) => p.vatkula_min).filter((v) => v != null))
        : null,
      snopass: pass.length,
    },
  };
}

/** Ärenderapport: läge, flöde och åtgärdstider. */
export function arenderapport(fran, till) {
  const oppnaFt = OPPNA.map(() => '?').join(',');
  const perStatus = alla('SELECT status, count(*) AS antal FROM arende GROUP BY status');
  const perPrioritet = alla(
    `SELECT prioritet, count(*) AS antal FROM arende WHERE status IN (${oppnaFt}) GROUP BY prioritet ORDER BY prioritet`,
    ...OPPNA
  );
  const perTyp = alla(`SELECT typ, count(*) AS antal FROM arende WHERE status IN (${oppnaFt}) GROUP BY typ`, ...OPPNA);
  const perOmrade = alla(
    `SELECT coalesce(o.namn,'Ej angivet') AS omrade,
            sum(CASE WHEN a.status IN (${oppnaFt}) THEN 1 ELSE 0 END) AS oppna,
            count(*) AS totalt
     FROM arende a LEFT JOIN omrade o ON o.id=a.omrade_id GROUP BY omrade ORDER BY oppna DESC`,
    ...OPPNA
  );
  const perUtrustning = alla(
    `SELECT u.namn AS utrustning, u.typ, count(*) AS antal,
            sum(CASE WHEN a.status IN (${oppnaFt}) THEN 1 ELSE 0 END) AS oppna
     FROM arende a JOIN utrustning u ON u.id=a.utrustning_id
     GROUP BY u.id ORDER BY antal DESC LIMIT 10`,
    ...OPPNA
  );
  const nya = en('SELECT count(*) AS n FROM arende WHERE date(skapad) BETWEEN ? AND ?', fran, till).n;
  const stangda = en('SELECT count(*) AS n FROM arende WHERE stangd IS NOT NULL AND date(stangd) BETWEEN ? AND ?', fran, till).n;
  const tider = alla(
    `SELECT prioritet, (julianday(stangd)-julianday(skapad)) AS dagar FROM arende
     WHERE stangd IS NOT NULL AND date(stangd) BETWEEN ? AND ?`,
    fran, till
  );
  const sakerhet = alla(
    `SELECT a.id, a.titel, a.prioritet, a.status, a.skapad, u.namn AS utrustning, o.namn AS omrade
     FROM arende a LEFT JOIN utrustning u ON u.id=a.utrustning_id LEFT JOIN omrade o ON o.id=a.omrade_id
     WHERE a.allvarlighet='sakerhetsrisk' AND a.status IN (${oppnaFt}) ORDER BY a.prioritet, a.skapad`,
    ...OPPNA
  );
  const aldst = alla(
    `SELECT a.id, a.titel, a.prioritet, a.status, a.skapad, round(julianday('now')-julianday(a.skapad)) AS alder_dagar,
            u.namn AS utrustning
     FROM arende a LEFT JOIN utrustning u ON u.id=a.utrustning_id
     WHERE a.status IN (${oppnaFt}) ORDER BY a.skapad LIMIT 10`,
    ...OPPNA
  );
  return {
    fran, till, per_status: perStatus, per_prioritet: perPrioritet, per_typ: perTyp,
    per_omrade: perOmrade, per_utrustning: perUtrustning,
    nya, stangda,
    atgardstid_dagar: medel(tider.map((t) => t.dagar)),
    atgardstid_akuta_dagar: medel(tider.filter((t) => t.prioritet <= 2).map((t) => t.dagar)),
    oppna_totalt: perPrioritet.reduce((a, b) => a + b.antal, 0),
    sakerhetsrisker: sakerhet,
    aldsta_oppna: aldst,
  };
}

/** Bemanningsrapport: täckning, hål i schemat och rättvisa. */
export function bemanningsrapport(fran, till) {
  const pass = alla(
    `SELECT p.*, pos.namn AS position,
            (SELECT count(*) FROM bokning b WHERE b.pass_id=p.id AND b.status IN ('bokad','tilldelad','narvarande')) AS bokade
     FROM pass p JOIN position pos ON pos.id=p.position_id
     WHERE p.datum BETWEEN ? AND ? ORDER BY p.datum, p.start`,
    fran, till
  );
  const perPosition = new Map();
  for (const p of pass) {
    if (!perPosition.has(p.position)) perPosition.set(p.position, { position: p.position, pass: 0, behov: 0, bokade: 0, hal: 0 });
    const r = perPosition.get(p.position);
    r.pass += 1;
    r.behov += p.behov;
    r.bokade += Math.min(p.bokade, p.behov);
    r.hal += Math.max(0, p.behov - p.bokade);
  }
  const perVecka = new Map();
  for (const p of pass) {
    const v = `v${veckonummer(p.datum)}`;
    if (!perVecka.has(v)) perVecka.set(v, { vecka: v, behov: 0, bokade: 0 });
    perVecka.get(v).behov += p.behov;
    perVecka.get(v).bokade += Math.min(p.bokade, p.behov);
  }
  const lagen = allaLagen();
  const hal = pass
    .filter((p) => p.bokade < p.behov)
    .map((p) => ({ ...p, saknas: p.behov - p.bokade, slag: passSlag(p.start, p.slut), helg: arHelg(p.datum) }));

  return {
    fran, till,
    per_position: [...perPosition.values()].map((r) => ({ ...r, tackning: Math.round((r.bokade / Math.max(r.behov, 1)) * 100) })),
    per_vecka: [...perVecka.values()].map((r) => ({ ...r, tackning: Math.round((r.bokade / Math.max(r.behov, 1)) * 100) })),
    hal,
    summa: {
      pass: pass.length,
      behov: pass.reduce((a, b) => a + b.behov, 0),
      bokade: pass.reduce((a, b) => a + Math.min(b.bokade, b.behov), 0),
      hal: hal.reduce((a, b) => a + b.saknas, 0),
      timmar: Math.round(pass.reduce((a, b) => a + passTimmar(b.start, b.slut) * b.behov, 0)),
    },
    medlemmar: lagen.sort((a, b) => a.andel - b.andel),
    rattvisa: spridningsmatt(lagen.map((l) => ({ timmar: l.timmar, kvot: l.kvot, natt: l.natt, helg: l.helg }))),
    under_kvot: lagen.filter((l) => l.kvar > 0).length,
  };
}

const period = (fraga) => [
  datum(fraga.get('fran')) || plusDagar(idag(), -30),
  datum(fraga.get('till')) || idag(),
];

export const rutter = [
  rutt('GET', '/api/rapport/sno', 'medlem', ({ res, fraga }) => svar(res, 200, snorapport(...period(fraga)))),
  rutt('GET', '/api/rapport/arenden', 'medlem', ({ res, fraga }) => svar(res, 200, arenderapport(...period(fraga)))),
  rutt('GET', '/api/rapport/bemanning', 'medlem', ({ res, fraga }) => svar(res, 200, bemanningsrapport(...period(fraga)))),

  rutt('GET', '/api/rapport/samlad', 'medlem', ({ res, fraga }) => {
    const [fran, till] = period(fraga);
    svar(res, 200, {
      fran, till,
      sno: snorapport(fran, till),
      arenden: arenderapport(fran, till),
      bemanning: bemanningsrapport(fran, till),
    });
  }),

  rutt('GET', '/api/rapport/sno.csv', 'medlem', ({ res, fraga }) => {
    const r = snorapport(...period(fraga));
    text(res, 200, csv(r.per_utrustning, [
      { falt: 'utrustning', rubrik: 'Utrustning' }, { falt: 'omrade', rubrik: 'Område' },
      { falt: 'antal_matningar', rubrik: 'Mätningar' }, { falt: 'drifttimmar', rubrik: 'Drifttimmar' },
      { falt: 'vattenvolym_m3', rubrik: 'Vatten m³' }, { falt: 'temp_min', rubrik: 'Temp min' },
      { falt: 'temp_medel', rubrik: 'Temp medel' }, { falt: 'vatkula_medel', rubrik: 'Våtkula medel' },
      { falt: 'flode_medel', rubrik: 'Flöde medel l/s' }, { falt: 'flode_max', rubrik: 'Flöde max l/s' },
      { falt: 'senaste', rubrik: 'Senaste mätning' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="snorapport.csv"' });
  }),

  rutt('GET', '/api/rapport/insatser.csv', 'medlem', ({ res, fraga }) => {
    const r = bemanningsrapport(...period(fraga));
    text(res, 200, csv(r.medlemmar, [
      { falt: 'namn', rubrik: 'Medlem' }, { falt: 'timmar', rubrik: 'Timmar' },
      { falt: 'kvot', rubrik: 'Kvot' }, { falt: 'andel', rubrik: 'Andel %' },
      { falt: 'utfort', rubrik: 'Utfört' }, { falt: 'planerat', rubrik: 'Planerat' },
      { falt: 'kvar', rubrik: 'Kvar' }, { falt: 'antal_pass', rubrik: 'Pass' },
      { falt: 'natt', rubrik: 'Nattpass' }, { falt: 'helg', rubrik: 'Helgpass' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="insatser.csv"' });
  }),
];
