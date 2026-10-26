// Tidshjälp. Allt i lokal tid (Europe/Stockholm) som text, för att kalendern ska bli begriplig.

export const idag = () => new Date().toLocaleDateString('sv-SE');
export const nu = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Klockslaget just nu, HH:MM i lokal tid. */
export const klockan = () =>
  new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

export const minuter = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Passets längd i timmar, hanterar pass över midnatt. */
export function passTimmar(start, slut) {
  let d = minuter(slut) - minuter(start);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 100) / 100;
}

/** natt | kvall | dag utifrån starttid och om passet går över midnatt. */
export function passSlag(start, slut) {
  const s = minuter(start);
  const overMidnatt = minuter(slut) <= s;
  if (s >= 21 * 60 || s < 6 * 60 || overMidnatt) return 'natt';
  if (s >= 16 * 60) return 'kvall';
  return 'dag';
}

export const veckodag = (datum) => (new Date(`${datum}T12:00:00`).getDay() + 6) % 7; // 0 = mån
export const arHelg = (datum) => veckodag(datum) >= 5;

export function veckonummer(datum) {
  const d = new Date(`${datum}T12:00:00`);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dag);
  const nyar = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - nyar) / 86400000 + 1) / 7);
}

export function datumspann(fran, till) {
  const ut = [];
  const d = new Date(`${fran}T12:00:00`);
  const slut = new Date(`${till}T12:00:00`);
  while (d <= slut && ut.length < 400) {
    ut.push(d.toLocaleDateString('sv-SE'));
    d.setDate(d.getDate() + 1);
  }
  return ut;
}

export const plusDagar = (datum, n) => {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

export const DAGNAMN = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'];

/** Ålder i fyllda år vid ett visst datum. Null när födelsedatum saknas. */
export function alder(fodelsedatum, vid = idag()) {
  if (!fodelsedatum) return null;
  const [fa, fm, fd] = String(fodelsedatum).slice(0, 10).split('-').map(Number);
  const [va, vm, vd] = String(vid).slice(0, 10).split('-').map(Number);
  if (!fa || !va) return null;
  let ar = va - fa;
  if (vm < fm || (vm === fm && vd < fd)) ar -= 1;
  return ar;
}
