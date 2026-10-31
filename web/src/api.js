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
  // PATCH för det som ändrar några fält i taget, PUT för hela posten.
  andra: (stig, kropp) => anrop('PATCH', stig, kropp ?? {}),
  tabort: (stig) => anrop('DELETE', stig),
};

/**
 * Laddar upp en fil som råa byte, med riktigt förlopp.
 *
 * XHR i stället för fetch: det är enda sättet att få veta hur många byte
 * som faktiskt gått iväg. En manual på trettio megabyte ska inte se ut som
 * en snurra som hängt sig.
 */
export function laddaUppFil(stig, fil, { vidForlopp } = {}) {
  return new Promise((klar, bryt) => {
    const x = new XMLHttpRequest();
    x.open('POST', stig);
    x.setRequestHeader('content-type', fil.type || 'application/octet-stream');
    x.setRequestHeader('x-hak', '1');
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) vidForlopp?.(e.loaded / e.total, e.loaded, e.total);
    };
    x.onload = () => {
      let data;
      try {
        data = JSON.parse(x.responseText);
      } catch {
        return bryt(new Error(`Fel ${x.status}`));
      }
      if (x.status >= 400) return bryt(new Error(data?.fel || `Fel ${x.status}`));
      klar(data);
    };
    x.onerror = () => bryt(new Error('Uppladdningen avbröts'));
    x.send(fil);
  });
}

export const fragestrang = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
