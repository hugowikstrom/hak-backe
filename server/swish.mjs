// Swish: betalning med förifylld QR-kod.
//
// Klubben behöver inget handelsavtal för det här – QR-koden fyller bara i
// mottagare, belopp och meddelande i kundens Swish-app. Baksidan är att
// servern inte får veta när betalningen gick igenom; kassan kvitterar.
// Finns ett Swish Handel-avtal senare byts kvittensen mot deras callback.
const NUMMER = process.env.HAK_SWISH_NUMMER || null;
const QR_API = 'https://mpc.getswish.net/qrg-swish/api/v1/prefilled';
const cache = new Map();

export const swishPa = () => !!NUMMER;
export const swishnummer = () => NUMMER;

/** Betalningsunderlag för en order: det kassan och kunden behöver se. */
export function betalning({ belopp_ore, meddelande }) {
  if (!NUMMER) return null;
  return {
    nummer: NUMMER,
    belopp: belopp_ore / 100,
    meddelande,
    // Fungerar när sidan öppnas i telefonen som har Swish installerat.
    lank: `swish://payment?data=${encodeURIComponent(
      JSON.stringify({ version: 1, payee: { value: NUMMER }, amount: { value: belopp_ore / 100 }, message: { value: meddelande } })
    )}`,
  };
}

/** QR-kod som SVG. Faller tillbaka på null – då visar klienten siffrorna. */
export async function qrkod({ belopp_ore, meddelande }) {
  if (!NUMMER) return null;
  const nyckel = `${NUMMER}|${belopp_ore}|${meddelande}`;
  if (cache.has(nyckel)) return cache.get(nyckel);
  try {
    const svar = await fetch(QR_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        format: 'svg',
        size: 300,
        payee: { value: NUMMER, editable: false },
        amount: { value: belopp_ore / 100, editable: false },
        message: { value: meddelande, editable: false },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!svar.ok) throw new Error(`Swish QR svarade ${svar.status}`);
    const svg = await svar.text();
    if (!svg.includes('<svg')) throw new Error('Swish QR gav inget svg');
    cache.set(nyckel, svg);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return svg;
  } catch {
    return null;
  }
}
