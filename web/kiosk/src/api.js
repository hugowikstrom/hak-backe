// Kioskens API. Öppet, men servern bestämmer alla priser.
export async function anrop(metod, stig, kropp) {
  const r = await fetch(stig, {
    method: metod,
    headers: { 'content-type': 'application/json', 'x-hak': '1' },
    body: kropp === undefined ? undefined : JSON.stringify(kropp),
  });
  const typ = r.headers.get('content-type') || '';
  const data = typ.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data?.fel || `Fel ${r.status}`);
  return data;
}
export const api = {
  hamta: (s) => anrop('GET', s),
  skapa: (s, k) => anrop('POST', s, k ?? {}),
};
export const kronor = (ore) =>
  ore == null ? '–' : `${(ore / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`;
