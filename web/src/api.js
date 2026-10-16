// Allt prat med servern går härigenom.
const huvuden = { 'content-type': 'application/json', 'x-hak': '1' };

async function anrop(metod, stig, kropp) {
  const r = await fetch(stig, {
    method: metod,
    headers: huvuden,
    body: kropp === undefined ? undefined : JSON.stringify(kropp),
  });
  if (r.status === 204) return null;
  const typ = r.headers.get('content-type') || '';
  const data = typ.includes('json') ? await r.json() : await r.text();
  if (!r.ok) {
    const e = new Error(data?.fel || `Fel ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}

export const api = {
  hamta: (stig) => anrop('GET', stig),
  skapa: (stig, kropp) => anrop('POST', stig, kropp ?? {}),
  spara: (stig, kropp) => anrop('PUT', stig, kropp ?? {}),
  tabort: (stig) => anrop('DELETE', stig),
};

export const fragestrang = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
