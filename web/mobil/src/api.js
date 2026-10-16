// Prat med servern. Kastar NatverksFel när det inte går fram, så att
// kön vet skillnaden mellan "nekat" och "ingen täckning".
export class NatverksFel extends Error {}

export async function anrop(metod, stig, kropp) {
  let r;
  try {
    r = await fetch(stig, {
      method: metod,
      headers: { 'content-type': 'application/json', 'x-hak': '1' },
      body: kropp === undefined ? undefined : JSON.stringify(kropp),
    });
  } catch {
    throw new NatverksFel('Ingen kontakt med servern');
  }
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
  hamta: (s) => anrop('GET', s),
  skapa: (s, k) => anrop('POST', s, k ?? {}),
  spara: (s, k) => anrop('PUT', s, k ?? {}),
  tabort: (s) => anrop('DELETE', s),
};

/** Senast hämtade grunddata, så att appen går att använda utan täckning. */
const CACHE = 'hak-cache-';
export async function hamtaMedCache(stig) {
  try {
    const data = await api.hamta(stig);
    localStorage.setItem(CACHE + stig, JSON.stringify({ tid: Date.now(), data }));
    return { data, fran: 'natet' };
  } catch (e) {
    const sparad = localStorage.getItem(CACHE + stig);
    if (sparad) return { data: JSON.parse(sparad).data, fran: 'cache' };
    throw e;
  }
}

/** Skalar ned och komprimerar en bild innan den lämnar telefonen. */
export function krympBild(fil, maxKant = 1280, kvalitet = 0.62) {
  return new Promise((klar, fel) => {
    const lasare = new FileReader();
    lasare.onerror = () => fel(new Error('Kunde inte läsa bilden'));
    lasare.onload = () => {
      const bild = new Image();
      bild.onerror = () => fel(new Error('Kunde inte tolka bilden'));
      bild.onload = () => {
        const skala = Math.min(1, maxKant / Math.max(bild.width, bild.height));
        const duk = document.createElement('canvas');
        duk.width = Math.round(bild.width * skala);
        duk.height = Math.round(bild.height * skala);
        duk.getContext('2d').drawImage(bild, 0, 0, duk.width, duk.height);
        klar(duk.toDataURL('image/jpeg', kvalitet));
      };
      bild.src = lasare.result;
    };
    lasare.readAsDataURL(fil);
  });
}
