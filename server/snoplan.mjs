// Vem som ska frågas om ett snöläggningspass, och i vilken ordning.
//
// Ren räkning. Prioriteringen är ett önskemål från medlemmen och ersätter
// aldrig kompetenskrav, otillgänglighet eller rättvis fördelning – den
// avgör bara vem som får frågan först.
import { alder, arHelg, minuter, passTimmar } from './tid.mjs';

/**
 * Åldersgränser för att få ett arbetspass.
 *
 * Minderåriga har starkt begränsad arbetstid och får i praktiken inte
 * arbeta natt. En snökanon mitt i natten är inget barn ska bli tillfrågad
 * om, oavsett hur gärna familjen ställer upp.
 */
export const MINALDER = 16;
export const MINALDER_NATT = 18;

/** Nivåerna medlemmen själv väljer inför säsongen. */
export const NIVAER = {
  garna: { namn: 'Vill gärna arbeta', omgang: 1, ordning: 0 },
  kanske: { namn: 'Kan arbeta vid behov', omgang: 1, ordning: 1 },
  vid_brist: { namn: 'Reserv vid personalbrist', omgang: 2, ordning: 2 },
  nej: { namn: 'Inte tillgänglig', omgang: null, ordning: 3 },
};

const spann = (p) => {
  const s = minuter(p.start);
  return [s, s + passTimmar(p.start, p.slut) * 60];
};

const krockar = (a, b) => {
  if (a.datum !== b.datum) return false;
  const [a1, a2] = spann(a);
  const [b1, b2] = spann(b);
  return a1 < b2 && b1 < a2;
};

/**
 * Rangordnar vem som ska få frågan om ett pass.
 *
 * Utesluter – inte nedprioriterar – den som saknar kompetens eller roll,
 * har anmält sig otillgänglig, redan är bokad på ett krockande pass, eller
 * sagt nej till säsongen. Det är krav, inte önskemål.
 *
 * Bland dem som kan rangordnas efter: önskad nivå, sedan hur mycket man
 * redan gjort i säsongen, sedan namn så att listan inte hoppar runt.
 */
export function kandidater({
  pass,
  medlemmar,
  tillganglighet = [],
  bokningar = [],
  otillganglig = [],
  positioner = {},
  rang = {},
  insatser = {},
}) {
  const position = positioner[pass.position_id] || {};
  const niva = new Map(tillganglighet.map((t) => [t.medlem_id, t]));
  const natt = pass.slag === 'natt';
  const helg = arHelg(pass.datum);
  const gransen = natt ? MINALDER_NATT : MINALDER;

  const ut = [];
  for (const m of medlemmar) {
    const t = niva.get(m.id);
    const hinder = [];

    const ar = alder(m.fodelsedatum, pass.datum);
    if (ar != null && ar < gransen)
      hinder.push(natt ? `under ${MINALDER_NATT} år – inga nattpass` : `under ${MINALDER} år`);
    if (position.kravs_roll && (rang[m.roll] ?? 0) < (rang[position.kravs_roll] ?? 99))
      hinder.push('saknar behörighet för positionen');
    if (position.kompetens && !(m.kompetens || []).includes(position.kompetens))
      hinder.push('saknar kompetensen');
    if (otillganglig.some((o) => o.medlem_id === m.id && pass.datum >= o.fran && pass.datum <= o.till))
      hinder.push('anmäld otillgänglig');
    if (bokningar.some((b) => b.medlem_id === m.id && krockar(b, pass)))
      hinder.push('bokad på ett krockande pass');
    if (bokningar.some((b) => b.medlem_id === m.id && b.pass_id === pass.id))
      hinder.push('redan bokad på passet');
    if (t?.niva === 'nej') hinder.push('inte tillgänglig i säsongen');
    if (natt && t && !t.nattpass) hinder.push('tar inte nattpass');
    if (helg && t && !t.helger) hinder.push('tar inte helgpass');

    if (hinder.length) {
      ut.push({ medlem: m, kan: false, hinder });
      continue;
    }
    const n = NIVAER[t?.niva || 'kanske'];
    ut.push({
      medlem: m,
      kan: true,
      niva: t?.niva || 'kanske',
      omgang: n.omgang,
      // Den som redan dragit ett tungt lass ska inte få frågan först.
      gjort_timmar: insatser[m.id]?.timmar ?? 0,
      gjort_natt: insatser[m.id]?.natt ?? 0,
      hinder: [],
    });
  }

  return ut
    .filter((k) => k.kan)
    .sort(
      (a, b) =>
        NIVAER[a.niva].ordning - NIVAER[b.niva].ordning ||
        (natt ? a.gjort_natt - b.gjort_natt : 0) ||
        a.gjort_timmar - b.gjort_timmar ||
        a.medlem.namn.localeCompare(b.medlem.namn, 'sv')
    )
    .concat(ut.filter((k) => !k.kan));
}

/**
 * Hur ett pass ligger till. Förfrågningar räknas aldrig som bemanning –
 * en skickad fråga är inte ett ja.
 */
export function lage(pass, { bokningar = [], forfragningar = [] } = {}) {
  const bokade = bokningar.filter(
    (b) => b.pass_id === pass.id && !['avbokad', 'uteblev'].includes(b.status)
  ).length;
  const vantar = forfragningar.filter((f) => f.pass_id === pass.id && f.status === 'skickad').length;
  const saknas = Math.max(0, pass.behov - bokade);
  return {
    behov: pass.behov,
    bokade,
    vantar,
    saknas,
    // Underskott som inte ens är utfrågat är det som ska larma.
    oadresserat: Math.max(0, saknas - vantar),
    fullt: saknas === 0,
  };
}

/**
 * Delar in prognosens produktionsfönster i pass.
 *
 * Fönstret säger när det går att producera snö; passen säger när någon ska
 * stå där. Ett dygnslångt fönster blir flera pass, för ingen jobbar 20
 * timmar i sträck.
 */
export function passUrFonster(fonster, { passlangd = 6, minsta = 3 } = {}) {
  const start = new Date(fonster.fran.replace(' ', 'T'));
  const slut = new Date(fonster.till.replace(' ', 'T'));
  const timmar = (slut - start) / 3600000;
  if (!(timmar > 0)) return [];
  const antal = Math.max(1, Math.round(timmar / passlangd));
  const langd = timmar / antal;
  // Hellre ett långt pass än ett löjligt kort på slutet.
  if (langd < minsta && antal > 1) return passUrFonster(fonster, { passlangd: timmar, minsta });

  const ut = [];
  for (let i = 0; i < antal; i++) {
    const a = new Date(start.getTime() + i * langd * 3600000);
    const b = new Date(start.getTime() + (i + 1) * langd * 3600000);
    const tim = (h) => `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`;
    const timme = a.getHours();
    ut.push({
      datum: a.toLocaleDateString('sv-SE'),
      start: tim(a),
      slut: tim(b),
      timmar: Math.round(langd * 10) / 10,
      slag: timme >= 22 || timme < 6 ? 'natt' : timme >= 17 ? 'kvall' : 'dag',
    });
  }
  return ut;
}
