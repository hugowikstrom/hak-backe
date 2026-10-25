// När nästa service faller ut, och hur året ser ut.
//
// Ren räkning: inget databasanrop, inget nät. Det är därför den går att
// testa, och därför den överlever en omskrivning av lagret under.
import { idag, plusDagar } from './tid.mjs';

export const INTERVALLTYPER = ['dagar', 'veckor', 'manader', 'sasong', 'drifttimmar', 'handelse'];

export const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

/**
 * Lägger till ett intervall på ett datum.
 *
 * Månader räknas som kalendermånader, inte som 30,44 dagar: "var sjätte
 * månad" från den 10 maj betyder den 10 november. Går dagen inte att behålla
 * – 31 januari plus en månad – landar den på månadens sista dag.
 */
const framat = (datum, typ, intervall) => {
  if (!intervall || intervall <= 0) return null;
  if (typ === 'dagar') return plusDagar(datum, Math.round(intervall));
  if (typ === 'veckor') return plusDagar(datum, Math.round(intervall * 7));
  if (typ !== 'manader') return null;

  const [ar, manad, dag] = datum.split('-').map(Number);
  const heltal = Math.floor(intervall);
  const rest = intervall - heltal;
  const d = new Date(Date.UTC(ar, manad - 1 + heltal, 1));
  const sistaIManaden = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dag, sistaIManaden));
  const ut = d.toISOString().slice(0, 10);
  // En halv månad är ungefär femton dagar; mer exakt än så är inte ärligt.
  return rest ? plusDagar(ut, Math.round(rest * 30)) : ut;
};

/**
 * Nästa förfallodatum för en serviceplan.
 *
 * Returnerar `null` när planen inte går att räkna på – händelsestyrda
 * kontroller, eller drifttimmar utan avläsning. Det är ett ärligt svar och
 * inte ett fel: systemet ska inte uppfinna ett datum som ser bestämt ut.
 *
 * `drifttimmar` är utrustningens nuvarande ställning. När planen räknas i
 * timmar översätts återstoden med `timmar_per_dag` till ett datum, så att
 * arbetet går att lägga i årshjulet – men fältet `uppskattat` säger att det
 * är en framskrivning och inte ett bestämt datum.
 */
export function nastaForfall(plan, { nu = idag(), drifttimmar = null, timmar_per_dag = 6 } = {}) {
  const typ = plan.intervalltyp;

  if (typ === 'handelse') return { datum: null, grund: 'handelse', uppskattat: false };

  if (typ === 'sasong') {
    if (!plan.manad) return { datum: null, grund: 'sasong', uppskattat: false };
    const ar = Number(nu.slice(0, 4));
    const manad = String(plan.manad).padStart(2, '0');
    // Första dagen i månaden, i år eller nästa år om den redan passerat.
    const iAr = `${ar}-${manad}-01`;
    const senast = plan.senast_utford || null;
    const passerat = iAr < nu || (senast && senast >= iAr);
    return {
      datum: passerat ? `${ar + 1}-${manad}-01` : iAr,
      grund: 'sasong',
      uppskattat: false,
    };
  }

  if (typ === 'drifttimmar') {
    if (!plan.intervall) return { datum: null, grund: 'drifttimmar', uppskattat: false };
    if (drifttimmar == null) return { datum: null, grund: 'drifttimmar_saknas', uppskattat: false };
    const vid = (plan.senast_timmar ?? 0) + plan.intervall;
    const kvar = vid - drifttimmar;
    return {
      datum: plusDagar(nu, Math.max(0, Math.ceil(kvar / Math.max(0.1, timmar_per_dag)))),
      grund: 'drifttimmar',
      timmar_kvar: Math.round(kvar * 10) / 10,
      vid_timme: Math.round(vid * 10) / 10,
      // Datumet är framskrivet ur hur mycket maskinen brukar gå.
      uppskattat: true,
    };
  }

  if (!['dagar', 'veckor', 'manader'].includes(typ) || !plan.intervall)
    return { datum: null, grund: typ, uppskattat: false };
  // Utan tidigare service förfaller arbetet nu: det har aldrig gjorts.
  if (!plan.senast_utford) return { datum: nu, grund: 'aldrig_utford', uppskattat: false };
  return { datum: framat(plan.senast_utford, typ, plan.intervall), grund: typ, uppskattat: false };
}

/** Försenad, snart, eller längre fram. */
export function lage(datum, { nu = idag(), varning = 14 } = {}) {
  if (!datum) return 'okant';
  if (datum < nu) return 'forsenad';
  if (datum <= plusDagar(nu, varning)) return 'snart';
  return 'kommande';
}

/**
 * Lägger planerat arbete i årshjulet: tolv månader från och med `fran`.
 * Varje post behåller sitt datum – hjulet är en gruppering, inte en kalender
 * i sig.
 */
export function arshjul(poster, { fran = idag(), manader = 12 } = {}) {
  const start = new Date(`${fran.slice(0, 7)}-01T00:00:00`);
  const hjul = [];
  for (let i = 0; i < manader; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const nyckel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    hjul.push({
      nyckel,
      ar: d.getFullYear(),
      manad: d.getMonth() + 1,
      namn: MANADER[d.getMonth()],
      poster: [],
    });
  }
  const index = new Map(hjul.map((m) => [m.nyckel, m]));
  const utanfor = [];
  for (const p of poster) {
    if (!p.datum) {
      utanfor.push(p);
      continue;
    }
    const m = index.get(p.datum.slice(0, 7));
    if (m) m.poster.push(p);
    else utanfor.push(p);
  }
  for (const m of hjul) m.poster.sort((a, b) => a.datum.localeCompare(b.datum));
  return { manader: hjul, utanfor };
}

/**
 * Arbeten på samma enhet som ligger nära i tid. Underlag för frågan
 * "kompressorn ska servas inom fem dagar, och här finns ett till – vill du
 * planera dem tillsammans?"
 */
export function samordna(poster, { dagar: fonster = 14 } = {}) {
  const per = new Map();
  for (const p of poster) {
    if (!p.datum || !p.utrustning_id) continue;
    if (!per.has(p.utrustning_id)) per.set(p.utrustning_id, []);
    per.get(p.utrustning_id).push(p);
  }
  const grupper = [];
  for (const [utrustning_id, lista] of per) {
    const sorterad = [...lista].sort((a, b) => a.datum.localeCompare(b.datum));
    let grupp = [sorterad[0]];
    for (const p of sorterad.slice(1)) {
      const spann = (new Date(p.datum) - new Date(grupp[0].datum)) / 86400000;
      if (spann <= fonster) grupp.push(p);
      else {
        if (grupp.length > 1) grupper.push({ utrustning_id, utrustning: grupp[0].utrustning, poster: grupp });
        grupp = [p];
      }
    }
    if (grupp.length > 1) grupper.push({ utrustning_id, utrustning: grupp[0].utrustning, poster: grupp });
  }
  return grupper;
}

/**
 * Flyttar arbete ur en högbelastningsperiod – men bara arbete som får
 * flyttas. Obligatoriskt och säkerhetskritiskt underhåll ligger kvar:
 * verksamhetens belastning är inget skäl att skjuta på det.
 *
 * Flytten går bakåt när det finns tid före perioden, annars framåt. Hellre
 * tidigt än sent när det gäller underhåll.
 */
export function undvikBelastning(post, perioder, { nu = idag() } = {}) {
  if (!post.datum) return { ...post, flyttad: null };
  const traff = perioder.find((p) => post.datum >= p.fran && post.datum <= p.till);
  if (!traff) return { ...post, flyttad: null };
  if (post.kritisk)
    return {
      ...post,
      flyttad: null,
      // Den som planerar ska se krocken, inte luras tro att den är löst.
      krock: { period: traff.namn, orsak: 'kritiskt underhåll flyttas inte' },
    };
  const fore = plusDagar(traff.fran, -1);
  const efter = plusDagar(traff.till, 1);
  const nyttDatum = fore >= nu ? fore : efter;
  return {
    ...post,
    datum: nyttDatum,
    flyttad: { fran: post.datum, till: nyttDatum, period: traff.namn, riktning: fore >= nu ? 'tidigare' : 'senare' },
  };
}

/** Summerar vad underhållet kostat: arbete, köpt tjänst och delar. */
export function kostnader({ atgarder = [], uttag = [], arenden = [] }) {
  const summa = (lista, falt) => lista.reduce((s, r) => s + (r[falt] || 0), 0);
  const delar = uttag.reduce((s, u) => s + (u.antal > 0 ? u.antal * (u.pris_ore || 0) : 0), 0);
  return {
    service_ore: summa(atgarder, 'kostnad_ore'),
    delar_ore: Math.round(delar),
    reparation_ore: summa(arenden, 'kostnad_ore'),
    arbetstimmar: Math.round(summa(atgarder, 'arbetstimmar') * 10) / 10,
    totalt_ore: summa(atgarder, 'kostnad_ore') + Math.round(delar) + summa(arenden, 'kostnad_ore'),
  };
}
