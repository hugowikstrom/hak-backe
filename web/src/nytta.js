// Formatering och småhjälp i gränssnittet.
export const DAGNAMN = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'];

export const idag = () => new Date().toLocaleDateString('sv-SE');
export const plusDagar = (datum, n) => {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
export const veckodag = (datum) => (new Date(`${datum}T12:00:00`).getDay() + 6) % 7;
export const arHelg = (datum) => veckodag(datum) >= 5;
export const manadsdag = (datum) => Number(datum.slice(8, 10));
export const kortDatum = (datum) =>
  datum ? `${manadsdag(datum)}/${Number(datum.slice(5, 7))}` : '';
export const langDatum = (datum) =>
  datum ? `${DAGNAMN[veckodag(datum)]} ${manadsdag(datum)}/${Number(datum.slice(5, 7))}` : '';
export const klockslag = (tid) => (tid ? String(tid).slice(11, 16) : '');
export const tidpunkt = (tid) =>
  tid ? `${kortDatum(String(tid).slice(0, 10))} ${klockslag(tid)}` : '';
export const sedan = (tid) => {
  if (!tid) return '';
  const min = (Date.now() - new Date(String(tid).replace(' ', 'T')).getTime()) / 60000;
  if (min < 1) return 'nu';
  if (min < 60) return `${Math.round(min)} min sedan`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h sedan`;
  return `${Math.round(min / 1440)} dgr sedan`;
};

export const initialer = (namn) =>
  String(namn || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((d) => d[0]?.toUpperCase() || '')
    .join('');

export const tal = (v, decimaler = 1) =>
  v == null || v === ''
    ? '–'
    : Number(v).toFixed(decimaler).replace('.', ',').replace(/,0+$/, '');
export const heltal = (v) => (v == null ? '–' : Math.round(v).toString());
export const grader = (v) => (v == null ? '–' : `${tal(v)} °C`);
export const procent = (v) => (v == null ? '–' : `${Math.round(v)} %`);

export const PRIORITET = {
  1: { namn: 'Akut', farg: 'rod' },
  2: { namn: 'Hög', farg: 'gul' },
  3: { namn: 'Normal', farg: 'bla' },
  4: { namn: 'Låg', farg: '' },
};
export const ALLVARLIGHET = {
  sakerhetsrisk: 'Säkerhetsrisk',
  driftstopp: 'Driftstopp',
  begransar: 'Begränsar',
  kosmetisk: 'Kosmetisk',
};
export const ARENDESTATUS = {
  ny: { namn: 'Ny', farg: 'bla' },
  bekraftad: { namn: 'Bekräftad', farg: 'lila' },
  pagar: { namn: 'Pågår', farg: 'gul' },
  vantar: { namn: 'Väntar', farg: '' },
  atgardad: { namn: 'Åtgärdad', farg: 'gron' },
  stangd: { namn: 'Stängd', farg: '' },
};
export const ARENDETYP = { fel: 'Fel', brist: 'Brist', forbattring: 'Förbättring', risk: 'Risk' };
export const UTRUSTNINGSTYP = {
  lans: 'Lans', flakt: 'Fläkt', pumpstation: 'Pumpstation', kompressor: 'Kompressor',
  lift: 'Lift', band: 'Band', pistmaskin: 'Pistmaskin', ovrigt: 'Övrigt',
};
export const INTERVALL = {
  vid_start: 'Vid start', per_pass: 'Per pass', dagligen: 'Dagligen',
  veckovis: 'Veckovis', sasong: 'Säsong',
};
export const ROLLNAMN = {
  medlem: 'Medlem', backansvarig: 'Backansvarig',
  anlaggningsansvarig: 'Anläggningsansvarig', admin: 'Administratör',
};
export const PASSLAG = { dag: 'Dag', kvall: 'Kväll', natt: 'Natt' };
export const KLARTECKEN = {
  utmarkt: 'Utmärkt', mycket_bra: 'Mycket bra', bra: 'Bra', ok: 'OK',
  marginellt: 'Marginellt', nej: 'Nej', okant: 'Okänt',
};
export const INSATSSLAG = {
  pass: 'Pass', snolaggning: 'Snöläggning', arbetsdag: 'Arbetsdag', ovrigt: 'Övrigt',
};
export const RANG = { medlem: 1, backansvarig: 2, anlaggningsansvarig: 3, admin: 4 };
export const minstRoll = (medlem, roll) => (RANG[medlem?.roll] ?? 0) >= RANG[roll];

export const sorteraEfter = (lista, falt, riktning = 1) =>
  [...lista].sort((a, b) => {
    const x = a[falt];
    const y = b[falt];
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * riktning;
    return String(x).localeCompare(String(y), 'sv') * riktning;
  });

export const gruppera = (lista, nyckel) => {
  const m = new Map();
  for (const r of lista) {
    const k = typeof nyckel === 'function' ? nyckel(r) : r[nyckel];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

/**
 * Våtkula för direkt återkoppling i formulär. Samma psykrometerekvation som
 * `server/snoteknik.mjs`; servern räknar om och äger det sparade värdet.
 */
export function vatkulaLokalt(temp, fukt, lufttryck_hPa = 1013.25) {
  if (temp === '' || fukt === '' || temp == null || fukt == null) return null;
  const T = Number(temp);
  const R = Math.min(100, Math.max(0.5, Number(fukt)));
  if (!Number.isFinite(T) || !Number.isFinite(R)) return null;
  const es = (x) => 6.112 * Math.exp((17.62 * x) / (243.12 + x));
  const A = 0.000662;
  const e = (R / 100) * es(T);
  let lag = T - 40;
  let hog = T;
  for (let i = 0; i < 60; i++) {
    const mitt = (lag + hog) / 2;
    if (es(mitt) - A * lufttryck_hPa * (T - mitt) - e < 0) lag = mitt;
    else hog = mitt;
  }
  const svar = Math.round(((lag + hog) / 2) * 10) / 10;
  return svar === 0 ? 0 : svar;
}

export const klarteckenLokalt = (vk) => {
  if (vk == null) return 'okant';
  if (vk < -10) return 'utmarkt';
  if (vk < -7) return 'mycket_bra';
  if (vk < -5) return 'bra';
  if (vk < -3.5) return 'ok';
  if (vk < -2.5) return 'marginellt';
  return 'nej';
};
