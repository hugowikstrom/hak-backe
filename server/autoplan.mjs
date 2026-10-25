// Automatplanering: fyller obemannade pass och jämnar ut natt- och helgpass.
// Ren funktion över inlästa data -> förslag. Skrivningen sker i api/bemanning.mjs.
import { alder, arHelg, minuter, passSlag, passTimmar } from './tid.mjs';
import { MINALDER, MINALDER_NATT } from './snoplan.mjs';

const VIKT = { tid: 1, natt: 0.8, helg: 0.5 };

/** Minutintervall för ett pass, pass över midnatt läggs ut på en rak axel. */
const spann = (p) => {
  const s = minuter(p.start);
  return [s, s + passTimmar(p.start, p.slut) * 60];
};

const krockar = (a, b) => {
  if (a.datum === b.datum) {
    const [a1, a2] = spann(a);
    const [b1, b2] = spann(b);
    return a1 < b2 && b1 < a2;
  }
  return false;
};

/**
 * @param {object} indata
 * @param {Array} indata.pass            pass i perioden, med faltet bokade (antal aktiva bokningar)
 * @param {Array} indata.medlemmar       aktiva medlemmar {id, roll, kompetens[], kvot_timmar}
 * @param {Array} indata.befintliga      aktiva bokningar i sasongen {medlem_id, pass_id, datum, start, slut}
 * @param {Array} indata.otillganglig    {medlem_id, fran, till}
 * @param {object} indata.sasong         {kvot_timmar, kvot_nattpass}
 * @param {object} indata.positioner     id -> {nyckel, kravs_roll}
 */
export function planera({ pass, medlemmar, befintliga, otillganglig, sasong, positioner, rang, tak = 1.25 }) {
  const kvotTim = sasong?.kvot_timmar || 20;
  const kvotNatt = Math.max(sasong?.kvot_nattpass || 2, 0.5);

  const stat = new Map();
  for (const m of medlemmar) {
    // Kvot 0 betyder undantagen från bemanningsplikt (t.ex. anläggningsansvarig).
    if ((m.kvot_timmar ?? kvotTim) <= 0) continue;
    stat.set(m.id, {
      medlem: m,
      timmar: 0,
      natt: 0,
      helg: 0,
      antal: 0,
      pass: [],
      kvot: m.kvot_timmar ?? kvotTim,
    });
  }
  for (const b of befintliga) {
    const s = stat.get(b.medlem_id);
    if (!s) continue;
    s.timmar += passTimmar(b.start, b.slut);
    s.antal += 1;
    if (passSlag(b.start, b.slut) === 'natt') s.natt += 1;
    if (arHelg(b.datum)) s.helg += 1;
    s.pass.push(b);
  }

  const otill = (id, datum) =>
    otillganglig.some((o) => o.medlem_id === id && o.fran <= datum && datum <= o.till);

  // Taket hindrar planeringen från att lassa över kvoten på de som redan ställt upp mest.
  const underTak = (s, p) =>
    !tak || (s.timmar + passTimmar(p.start, p.slut)) / Math.max(s.kvot, 1) <= tak;

  const behorig = (s, p) => {
    const pos = positioner[p.position_id];
    if (!pos) return false;
    // Minderåriga planeras aldrig in, och allra minst på natten.
    const ar = alder(s.medlem.fodelsedatum, p.datum);
    if (ar != null && ar < (passSlag(p.start, p.slut) === 'natt' ? MINALDER_NATT : MINALDER)) return false;
    if (pos.kravs_roll && (rang[s.medlem.roll] ?? 0) < (rang[pos.kravs_roll] ?? 0)) return false;
    const komp = s.medlem.kompetens || [];
    if (komp.length && !komp.includes(pos.nyckel)) return false;
    if (otill(s.medlem.id, p.datum)) return false;
    return !s.pass.some((b) => krockar(b, p));
  };

  const poang = (s, p) => {
    const tim = passTimmar(p.start, p.slut);
    const t = (s.timmar + tim) / Math.max(s.kvot, 1);
    const n = (s.natt + (passSlag(p.start, p.slut) === 'natt' ? 1 : 0)) / kvotNatt;
    const h = (s.helg + (arHelg(p.datum) ? 1 : 0)) / kvotNatt;
    return VIKT.tid * t + VIKT.natt * n + VIKT.helg * h;
  };

  // Luckor: ett objekt per saknad person.
  const luckor = [];
  for (const p of pass) {
    for (let i = 0; i < Math.max(0, p.behov - (p.bokade || 0)); i++) luckor.push(p);
  }
  // Svåraste först: minst antal behöriga, därefter kronologiskt.
  const kandidater = (p) => [...stat.values()].filter((s) => behorig(s, p) && underTak(s, p)).length;
  const sorterade = luckor
    .map((p) => ({ p, k: kandidater(p) }))
    .sort((a, b) => a.k - b.k || a.p.datum.localeCompare(b.p.datum) || minuter(a.p.start) - minuter(b.p.start));

  const tilldelningar = [];
  const otillsatta = [];
  for (const { p } of sorterade) {
    const val = [...stat.values()]
      .filter((s) => behorig(s, p) && underTak(s, p))
      .map((s) => ({ s, poang: poang(s, p) }))
      .sort((a, b) => a.poang - b.poang || a.s.antal - b.s.antal || a.s.medlem.id - b.s.medlem.id)[0];
    if (!val) {
      otillsatta.push({
        pass_id: p.id, datum: p.datum, start: p.start, slut: p.slut, position_id: p.position_id,
        orsak: [...stat.values()].some((s) => behorig(s, p))
          ? 'alla behöriga är uppe i kvottaket'
          : 'ingen behörig och tillgänglig medlem',
      });
      continue;
    }
    const s = val.s;
    const tim = passTimmar(p.start, p.slut);
    s.timmar += tim;
    s.antal += 1;
    if (passSlag(p.start, p.slut) === 'natt') s.natt += 1;
    if (arHelg(p.datum)) s.helg += 1;
    s.pass.push(p);
    tilldelningar.push({
      pass_id: p.id,
      medlem_id: s.medlem.id,
      namn: s.medlem.namn,
      datum: p.datum,
      start: p.start,
      slut: p.slut,
      position_id: p.position_id,
      slag: passSlag(p.start, p.slut),
      timmar: tim,
      poang: Math.round(val.poang * 1000) / 1000,
    });
  }

  const efter = [...stat.values()]
    .map((s) => ({
      medlem_id: s.medlem.id,
      namn: s.medlem.namn,
      timmar: Math.round(s.timmar * 10) / 10,
      kvot: s.kvot,
      natt: s.natt,
      helg: s.helg,
      antal: s.antal,
    }))
    .sort((a, b) => b.timmar - a.timmar);

  return { tilldelningar, otillsatta, efter, spridning: spridningsmatt(efter) };
}

/** Hur ojämnt det blev: standardavvikelse i andel av kvot, och natt/helg-spann. */
export function spridningsmatt(rader) {
  if (!rader.length) return { andel_std: 0, natt_spann: 0, helg_spann: 0 };
  const andelar = rader.map((r) => r.timmar / Math.max(r.kvot, 1));
  const medel = andelar.reduce((a, b) => a + b, 0) / andelar.length;
  const varians = andelar.reduce((a, b) => a + (b - medel) ** 2, 0) / andelar.length;
  const natt = rader.map((r) => r.natt);
  const helg = rader.map((r) => r.helg);
  return {
    andel_std: Math.round(Math.sqrt(varians) * 1000) / 1000,
    andel_medel: Math.round(medel * 1000) / 1000,
    natt_spann: Math.max(...natt) - Math.min(...natt),
    helg_spann: Math.max(...helg) - Math.min(...helg),
  };
}
