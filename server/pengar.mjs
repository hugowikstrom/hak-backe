// Belopp räknas i ören, hela vägen. Bara vid utskrift blir de kronor.
export const kronor = (ore) => (ore == null ? '–' : `${(ore / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`);
export const tillOre = (kr) => Math.round(Number(kr) * 100);
export const summa = (rader) => rader.reduce((a, r) => a + r.styckpris_ore * r.antal, 0);

/** Mobilnummer som 46elks och Swish vill ha det: +46… */
export function normaliseraMobil(nummer) {
  const rent = String(nummer || '').replace(/[\s()-]/g, '');
  // 00 före landsnumret måste tas först, annars läses 0046… som ett 0-nummer.
  if (/^00\d{9,15}$/.test(rent)) return `+${rent.slice(2)}`;
  if (/^\+\d{9,15}$/.test(rent)) return rent;
  if (/^0\d{8,12}$/.test(rent)) return `+46${rent.slice(1)}`;
  if (/^46\d{7,13}$/.test(rent)) return `+${rent}`;
  return null;
}
