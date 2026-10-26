// Vad en medlem behöver se just nu.
//
// Appen ska visa en sak, inte sju. Vilken sak det är beror på var i
// säsongen och i dygnet man befinner sig: står man på pass är det ronderna
// som gäller, har man ett pass i morgon är det det, och har man inget bokat
// och timmar kvar är det bokningen.
//
// Ren funktion över inläst data, så att ordningen går att pröva i ett test
// i stället för att upptäckas i backen.
import { minuter, passTimmar } from './tid.mjs';

/** Lägen i den ordning de tränger undan varandra. */
export const LAGEN = ['pa_pass', 'snart_pass', 'svara', 'boka', 'nasta_pass', 'lugnt'];

/**
 * Minuter kvar till passet börjar, eller negativt om det pågår.
 * Pass över midnatt hanteras genom att sluttiden läggs på en rak axel.
 */
export function minuterTill(pass, nu) {
  const dagar = (new Date(`${pass.datum}T00:00:00`) - new Date(`${nu.datum}T00:00:00`)) / 86400000;
  return Math.round(dagar * 1440 + minuter(pass.start) - minuter(nu.klocka));
}

export const pagar = (pass, nu) => {
  const till = minuterTill(pass, nu);
  return till <= 0 && -till < passTimmar(pass.start, pass.slut) * 60;
};

/**
 * Avgör vad som ska stå överst.
 *
 * `forevarning` är hur långt före ett pass det börjar tränga sig på – en
 * halvtimme innan är det passet som gäller, inte bokningslistan.
 */
export function lage({ mina = [], forfragningar = [], kvot, nu, forevarning = 180 }) {
  const kommande = mina
    .filter((p) => minuterTill(p, nu) > -24 * 60)
    .sort((a, b) => minuterTill(a, nu) - minuterTill(b, nu));

  const nuvarande = kommande.find((p) => pagar(p, nu));
  if (nuvarande) return { lage: 'pa_pass', pass: nuvarande };

  const strax = kommande.find((p) => {
    const t = minuterTill(p, nu);
    return t > 0 && t <= forevarning;
  });
  if (strax) return { lage: 'snart_pass', pass: strax };

  if (forfragningar.length) return { lage: 'svara', pass: null };

  // Bokning tränger sig på först när man faktiskt saknar timmar.
  const nasta = kommande.find((p) => minuterTill(p, nu) > 0) || null;
  if (kvot && !kvot.undantagen && kvot.kvar > 0) return { lage: 'boka', pass: nasta };
  if (nasta) return { lage: 'nasta_pass', pass: nasta };
  return { lage: 'lugnt', pass: null };
}

/**
 * Pass värda att föreslå: de som saknar folk, som man får ta, och som
 * ligger närmast i tiden. Fem stycken räcker – en lista på fyrtio är
 * ingen hjälp, den är ett register.
 */
export function attBoka({ lediga = [], mina = [], nu, antal = 5 }) {
  const mina_nycklar = new Set(mina.map((p) => `${p.datum} ${p.start}`));
  return lediga
    .filter((p) => minuterTill(p, nu) > 0 && !mina_nycklar.has(`${p.datum} ${p.start}`))
    .sort((a, b) => minuterTill(a, nu) - minuterTill(b, nu))
    .slice(0, antal);
}

/** Kort text om hur man ligger till. Inga procent i onödan. */
export function kvottext(kvot) {
  if (!kvot || kvot.undantagen) return null;
  if (kvot.kvar <= 0) return 'Du har fyllt din insats för säsongen.';
  const h = kvot.kvar === Math.round(kvot.kvar) ? kvot.kvar : kvot.kvar.toFixed(1);
  return `${h} timmar kvar att boka av ${kvot.kvot}.`;
}
