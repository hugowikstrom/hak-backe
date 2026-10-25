// Minimal routing och svarshjälp ovanpå node:http.
export class HttpFel extends Error {
  constructor(status, meddelande) {
    super(meddelande);
    this.status = status;
  }
}
export const fel = (status, meddelande) => new HttpFel(status, meddelande);

export function svar(res, status, data, extra = {}) {
  const kropp = JSON.stringify(data ?? null);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  });
  res.end(kropp);
}

export function text(res, status, kropp, typ = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': typ, 'cache-control': 'no-store', ...extra });
  res.end(kropp);
}

export async function lasKropp(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const bitar = [];
  let n = 0;
  for await (const b of req) {
    n += b.length;
    // Taket gäller JSON. Stora filer går en annan väg, se ravkropp.
    if (n > 16_000_000) throw fel(413, 'För stor begäran');
    bitar.push(b);
  }
  if (!bitar.length) return {};
  try {
    return JSON.parse(Buffer.concat(bitar).toString('utf8'));
  } catch {
    throw fel(400, 'Ogiltig JSON');
  }
}

/** rutt('POST', '/api/arenden/:id/handelse', 'medlem', fn) */
/**
 * En rutt. `val.ravkropp` lämnar begäran oläst åt hanteraren, för det som
 * ska strömmas till disk i stället för att buffras som JSON – en manual på
 * trettio megabyte har inget i minnet att göra.
 */
export function rutt(metod, monster, roll, fn, val = {}) {
  const namn = [];
  const re = new RegExp(
    '^' +
      monster
        .split('/')
        .map((del) => {
          if (del.startsWith(':')) {
            namn.push(del.slice(1));
            return '([^/]+)';
          }
          return del.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  return { metod, re, namn, roll, fn, monster, ...val };
}

export function matcha(rutter, metod, stig) {
  for (const r of rutter) {
    if (r.metod !== metod) continue;
    const m = re_exec(r.re, stig);
    if (m) {
      const param = {};
      r.namn.forEach((n, i) => (param[n] = decodeURIComponent(m[i + 1])));
      return { rutt: r, param };
    }
  }
  return null;
}
const re_exec = (re, s) => re.exec(s);

// ---- indatahjälp ----
// undefined betyder "fältet skickades inte" och lämnar värdet orört vid uppdatering.
// null eller tom sträng betyder "töm fältet".
export const txt = (v, max = 4000) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
export const kravTxt = (v, namn, max = 4000) => {
  const s = txt(v, max);
  if (!s) throw fel(400, `${namn} krävs`);
  return s;
};
export const num = (v) => {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw fel(400, `Ogiltigt tal: ${v}`);
  return n;
};
export const heltal = (v, fallback = null) => {
  const n = num(v);
  return n == null ? fallback : Math.round(n);
};
export const bool = (v) => (v === undefined ? undefined : v == null ? null : v ? 1 : 0);
export const ettAv = (v, lista, namn) => {
  const s = txt(v);
  if (s == null) return s;
  if (!lista.includes(s)) throw fel(400, `${namn} måste vara en av: ${lista.join(', ')}`);
  return s;
};
export const datum = (v, namn = 'datum') => {
  const s = txt(v);
  if (!s) return s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fel(400, `${namn} ska vara YYYY-MM-DD`);
  return s;
};
/** En tidpunkt: YYYY-MM-DD HH:MM. ISO med T tas emot och skrivs om. */
export const tidpunkt = (v, namn = 'tidpunkt') => {
  const s = txt(v);
  if (!s) return s;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m || +m[2] > 23 || +m[3] > 59) throw fel(400, `${namn} ska vara YYYY-MM-DD HH:MM`);
  return `${m[1]} ${m[2]}:${m[3]}`;
};

export const klocka = (v, namn = 'tid') => {
  const s = txt(v);
  if (!s) return s;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || +m[1] > 23 || +m[2] > 59) throw fel(400, `${namn} ska vara HH:MM`);
  return `${String(+m[1]).padStart(2, '0')}:${m[2]}`;
};

export function csv(rader, kolumner) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const ut = [kolumner.map((k) => cell(k.rubrik)).join(';')];
  for (const r of rader) ut.push(kolumner.map((k) => cell(r[k.falt])).join(';'));
  return '﻿' + ut.join('\r\n');
}
