// HAK Backe – en process: API + statisk klient.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { medlemAvKaka, publikMedlem, RANG, stadaSessioner } from './auth.mjs';
import { far, uppdragFor } from './behorighet.mjs';
import { fel, HttpFel, lasKropp, matcha, svar } from './http.mjs';
import { ROT } from './db.mjs';

import { aktivaModuler, allaRutter, modulPa, publikaModuler } from './moduler.mjs';
import { foreningar, foreningAvVard, korSom, publikForening } from './foreningar.mjs';
import { ARBETSYTOR } from './behorighet.mjs';

const RUTTER = allaRutter();

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
  // Värdnamnet avgör vilken förening begäran gäller. Allt nedan körs i den
  // föreningens skal: dess databas och dess inställningar.
  // Bakom Caddy är det X-Forwarded-Host som bär det namn gästen skrev.
  const forening = foreningAvVard(req.headers['x-forwarded-host'] || req.headers.host);

  try {
    if (stig.startsWith('/api/')) {
      return await korSom(forening, () => hanteraApi({ req, res, url, stig, forening }));
    }

    if (stig === '/halsa') return svar(res, 200, { ok: true, tid: new Date().toISOString(), forening: forening.nyckel });

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (statisk(res, stig)) return;
      // Mobilappen och kiosken är egna klienter med egna startsidor.
      const skal =
        stig === '/mobil' || stig.startsWith('/mobil/')
          ? '/mobil/index.html'
          : stig === '/fik' || stig.startsWith('/fik/')
            ? '/fik/index.html'
            : '/index.html';
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

async function hanteraApi({ req, res, url, stig, forening }) {
  // Vad plattformen består av för den här föreningen.
  if (stig === '/api/plattform' && req.method === 'GET') {
    const grundmedlem = medlemAvKaka(req.headers.cookie);
    const medlem = grundmedlem ? { ...grundmedlem, uppdrag: uppdragFor(grundmedlem.id) } : null;
    return svar(res, 200, {
      forening: publikForening(forening),
      moduler: publikaModuler(forening),
      arbetsytor: ARBETSYTOR,
      medlem: publikMedlem(grundmedlem),
    });
  }

  const traff = matcha(RUTTER, req.method, stig);
  if (!traff) throw fel(404, `Okänd slutpunkt: ${req.method} ${stig}`);
  const { rutt: r, param } = traff;
  // En avstängd modul finns inte för den här föreningen.
  if (!modulPa(forening, r.modul))
    throw fel(404, `Modulen ${r.modul} är inte påslagen för ${forening.namn}`);

  const grundmedlem = medlemAvKaka(req.headers.cookie);
  // Uppdragen följer med, så att behörighetsprövningen slipper läsa om dem.
  const medlem = grundmedlem ? { ...grundmedlem, uppdrag: uppdragFor(grundmedlem.id) } : null;
  if (r.roll !== 'oppen') {
    if (!medlem) throw fel(401, 'Inte inloggad');
    if (r.roll.startsWith('@')) {
      if (!far(medlem, r.roll.slice(1))) throw fel(403, `Kräver behörigheten ${r.roll.slice(1)}`);
    } else if (!(RANG[medlem.roll] >= RANG[r.roll])) {
      throw fel(403, `Kräver rollen ${r.roll}`);
    }
  }
  // Enkelt CSRF-skydd: skrivningar måste komma från klienten.
  if (req.method !== 'GET' && req.headers['x-hak'] !== '1')
    throw fel(403, 'Saknar klientheader');

  const kropp = await lasKropp(req);
  await r.fn({ req, res, medlem, kropp, fraga: url.searchParams, param, forening });
}

server.listen(PORT, VARD, () => {
  const lista = foreningar();
  console.log(`HAK Backe lyssnar på http://${VARD}:${PORT}`);
  console.log(
    `Föreningar: ${lista.map((f) => `${f.nyckel} (${aktivaModuler(f).length} moduler)`).join(', ')}`
  );
  stadaAllasSessioner();
});
/** Gamla sessioner städas i varje förenings databas. */
function stadaAllasSessioner() {
  for (const f of foreningar()) {
    try {
      korSom(f, stadaSessioner);
    } catch (e) {
      console.error('[sessionsstädning]', f.nyckel, e.message);
    }
  }
}
setInterval(stadaAllasSessioner, 6 * 3600e3).unref();

for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => server.close(() => process.exit(0)));
