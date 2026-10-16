// HAK Backe – en process: API + statisk klient.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { medlemAvKaka, RANG, stadaSessioner } from './auth.mjs';
import { fel, HttpFel, lasKropp, matcha, svar } from './http.mjs';
import { ROT } from './db.mjs';

import { rutter as konto } from './api/konto.mjs';
import { rutter as register } from './api/register.mjs';
import { rutter as sno } from './api/sno.mjs';
import { rutter as checklistor } from './api/checklistor.mjs';
import { rutter as arenden } from './api/arenden.mjs';
import { rutter as bemanning } from './api/bemanning.mjs';
import { rutter as rapport } from './api/rapport.mjs';
import { rutter as oversikt } from './api/oversikt.mjs';
import { rutter as bilder } from './api/bilder.mjs';

const RUTTER = [...konto, ...register, ...sno, ...checklistor, ...arenden, ...bemanning, ...rapport, ...oversikt, ...bilder];

const PORT = Number(process.env.HAK_PORT || 8120);
const VARD = process.env.HAK_VARD || '127.0.0.1';
const DIST = join(ROT, 'web', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function statisk(res, stig) {
  const fil = join(DIST, normalize(stig).replace(/^(\.\.[/\\])+/, ''));
  if (!fil.startsWith(DIST) || !existsSync(fil) || !statSync(fil).isFile()) return false;
  const typ = MIME[extname(fil)] || 'application/octet-stream';
  const cache = /\/assets\//.test(fil) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': typ, 'cache-control': cache });
  createReadStream(fil).pipe(res);
  return true;
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const stig = url.pathname;

  try {
    if (stig.startsWith('/api/')) {
      const traff = matcha(RUTTER, req.method, stig);
      if (!traff) throw fel(404, `Okänd slutpunkt: ${req.method} ${stig}`);
      const { rutt: r, param } = traff;

      const medlem = medlemAvKaka(req.headers.cookie);
      if (r.roll !== 'oppen') {
        if (!medlem) throw fel(401, 'Inte inloggad');
        if (!(RANG[medlem.roll] >= RANG[r.roll])) throw fel(403, `Kräver rollen ${r.roll}`);
      }
      // Enkelt CSRF-skydd: skrivningar måste komma från klienten.
      if (req.method !== 'GET' && req.headers['x-hak'] !== '1')
        throw fel(403, 'Saknar klientheader');

      const kropp = await lasKropp(req);
      await r.fn({ req, res, medlem, kropp, fraga: url.searchParams, param });
      return;
    }

    if (stig === '/halsa') return svar(res, 200, { ok: true, tid: new Date().toISOString() });

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (statisk(res, stig)) return;
      // Mobilappen är en egen klient under /mobil/ med egen startsida.
      const skal = stig === '/mobil' || stig.startsWith('/mobil/') ? '/mobil/index.html' : '/index.html';
      if (statisk(res, skal)) return;
      return svar(res, 404, { fel: 'Klienten är inte byggd. Kör npm run build.' });
    }
    throw fel(404, 'Hittades inte');
  } catch (e) {
    const status = e instanceof HttpFel ? e.status : 500;
    if (status >= 500) console.error('[fel]', req.method, stig, e);
    if (!res.headersSent) svar(res, status, { fel: e.message || 'Internt fel' });
    else res.end();
  }
});

server.listen(PORT, VARD, () => {
  console.log(`HAK Backe lyssnar på http://${VARD}:${PORT}`);
  stadaSessioner();
});
setInterval(stadaSessioner, 6 * 3600e3).unref();

for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => server.close(() => process.exit(0)));
