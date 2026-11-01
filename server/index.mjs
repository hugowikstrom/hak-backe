// Backis – en process: API + statisk klient.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { medlemAvKaka, publikMedlem, RANG, stadaSessioner } from './auth.mjs';
import { far, grupperFor, minstRoll, uppdragFor } from './behorighet.mjs';
import { notiser } from './notiser.mjs';
import { fel, HttpFel, lasKropp, matcha, svar } from './http.mjs';
import { ROT } from './db.mjs';

import { aktivaModuler, allaRutter, MENYGRUPPER, modulPa, publikaModuler } from './moduler.mjs';
import { foreningar, foreningAvVard, korSom, publikForening } from './foreningar.mjs';
import { provinloggningar, sakerstallProvkonton } from './provinlogg.mjs';
import { sakerstallProjekt } from './api/projekt.mjs';
import { sakerstallArbetsstallen } from './api/arbetsstalle.mjs';
import { sakerstallGenvagar } from './api/kontroll.mjs';
import { ARBETSYTOR } from './behorighet.mjs';

const RUTTER = allaRutter();

const PORT = Number(process.env.HAK_PORT || 8120);
const VARD = process.env.HAK_VARD || '127.0.0.1';
const DIST = join(ROT, 'web', 'dist');

/**
 * Värdnamn som landar i kontrollvyn — arbetsställen, ronder och enheter
 * i stället för administrationen. Står som en lista och inte som ett
 * specialfall: en klubb som vill ha en egen ingång ska kunna få en utan
 * att koden ändras.
 */
const KONTROLLVARDAR = (process.env.HAK_KONTROLLVARDAR || 'checkproof,kontroll')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

const vardnamn = (req) =>
  String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();

const arKontrollvard = (req) => KONTROLLVARDAR.some((v) => vardnamn(req).startsWith(v));

/**
 * Manifestet som gör appen installerbar, skrivet per värdnamn.
 *
 * Det går inte att ha som en statisk fil, av två skäl. Backis är
 * fleranvändarsystem: appen ska heta klubbens namn på hemskärmen, inte
 * produktens. Och kontrollvyn bor på sitt eget värdnamn med `/` som
 * startsida — installeras den med `/mobil/` som start_url landar den som
 * öppnar ikonen i fel vy.
 */
function manifest(req, forening) {
  const kontroll = arKontrollvard(req);
  const rot = kontroll ? '/' : '/mobil/';
  return {
    name: kontroll ? forening.namn : `Backis Rond – ${forening.namn}`,
    // Det som får plats under ikonen. Klubbens kortnamn i kontrollvyn:
    // den som letar efter appen letar efter klubben, inte efter Backis.
    short_name: kontroll ? forening.kortnamn || forening.namn : 'Backis Rond',
    description: kontroll
      ? `Kontroller, avvikelser och ronder för ${forening.namn}.`
      : `Checklistor och ronder för ${forening.namn}.`,
    lang: 'sv',
    id: rot,
    start_url: rot,
    scope: rot,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    // Vitt, inte grönt: färgen målar telefonens statusrad, och förlagan
    // har en vit topp med svart klocka. Grönt gjorde statusraden grön
    // och appen främmande vid första anblicken.
    theme_color: '#ffffff',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/mobil/ikon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/mobil/ikon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/mobil/ikon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/mobil/ikon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

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
      // Manifestet skrivs per värdnamn och går därför före den statiska
      // filen med samma namn.
      if (stig === '/manifest.webmanifest' || stig === '/mobil/manifest.webmanifest')
        return svar(res, 200, manifest(req, forening), {
          'content-type': 'application/manifest+json; charset=utf-8',
          'cache-control': 'no-cache',
        });

      // Servicearbetaren måste ligga i roten för att få styra roten.
      // Samma fil, serverad på två ställen – scopet bestäms av var den
      // hämtas ifrån, inte av vad som står i den.
      if (stig === '/sw.js' && statisk(res, '/mobil/sw.js')) return;

      if (statisk(res, stig)) return;
      // Mobilappen och kiosken är egna klienter med egna startsidor.
      //
      // På kontrollvärdarna är mobilklienten dessutom startsidan: den som
      // går dit ska möta arbetsställena direkt, inte administrationen.
      // Samma byggda klient, samma data – värdnamnet väljer bara ingång.
      const kontrollvard = arKontrollvard(req);
      const skal =
        stig === '/mobil' || stig.startsWith('/mobil/')
          ? '/mobil/index.html'
          : stig === '/fik' || stig.startsWith('/fik/')
            ? '/fik/index.html'
            : kontrollvard
              ? '/mobil/index.html'
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
    const medlem = grundmedlem
      ? { ...grundmedlem, uppdrag: uppdragFor(grundmedlem.id), grupper: grupperFor(grundmedlem.id) }
      : null;
    return svar(res, 200, {
      forening: publikForening(forening),
      moduler: publikaModuler(forening),
      menygrupper: MENYGRUPPER,
      arbetsytor: ARBETSYTOR,
      medlem: publikMedlem(grundmedlem),
      provinlogg: provinloggningar(),
    });
  }

  // Vad som väntar på någon just nu, för siffrorna i menyn. Egen rutt och
  // inte en del av /api/plattform: plattformen hämtas en gång, notiserna
  // om och om igen.
  if (stig === '/api/notiser' && req.method === 'GET') {
    const jag = medlemAvKaka(req.headers.cookie);
    if (!jag) throw fel(401, 'Inte inloggad');
    const medlem = { ...jag, uppdrag: uppdragFor(jag.id), grupper: grupperFor(jag.id) };
    return svar(res, 200, notiser(medlem, forening));
  }

  const traff = matcha(RUTTER, req.method, stig);
  if (!traff) throw fel(404, `Okänd slutpunkt: ${req.method} ${stig}`);
  const { rutt: r, param } = traff;
  // En avstängd modul finns inte för den här föreningen.
  if (!modulPa(forening, r.modul))
    throw fel(404, `Modulen ${r.modul} är inte påslagen för ${forening.namn}`);

  const grundmedlem = medlemAvKaka(req.headers.cookie);
  // Uppdragen och grupperna följer med, så att behörighetsprövningen slipper
  // läsa om dem – far() och minstRoll() hittar dem på medlemmen.
  const medlem = grundmedlem
    ? { ...grundmedlem, uppdrag: uppdragFor(grundmedlem.id), grupper: grupperFor(grundmedlem.id) }
    : null;
  if (r.roll !== 'oppen') {
    if (!medlem) throw fel(401, 'Inte inloggad');
    if (r.roll.startsWith('@')) {
      if (!far(medlem, r.roll.slice(1))) throw fel(403, `Kräver behörigheten ${r.roll.slice(1)}`);
    } else if (!minstRoll(medlem, r.roll)) {
      throw fel(403, `Kräver rollen ${r.roll}`);
    }
  }
  // Enkelt CSRF-skydd: skrivningar måste komma från klienten.
  if (req.method !== 'GET' && req.headers['x-hak'] !== '1')
    throw fel(403, 'Saknar klientheader');

  // Rutter som strömmar själva får begäran oläst.
  const kropp = r.ravkropp ? {} : await lasKropp(req);
  await r.fn({ req, res, medlem, kropp, fraga: url.searchParams, param, forening });
}

server.listen(PORT, VARD, () => {
  const lista = foreningar();
  console.log(`Backis lyssnar på http://${VARD}:${PORT}`);
  console.log(
    `Föreningar: ${lista.map((f) => `${f.nyckel} (${aktivaModuler(f).length} moduler)`).join(', ')}`
  );
  stadaAllasSessioner();
  for (const f of lista) {
    try {
      korSom(f, sakerstallProjekt);
      korSom(f, sakerstallArbetsstallen);
      korSom(f, sakerstallGenvagar);
      const konton = korSom(f, sakerstallProvkonton);
      if (konton.length)
        console.log(`Provinloggning (${f.nyckel}): ${konton.map((k) => k.anvandarnamn).join(', ')}`);
    } catch (e) {
      console.error('[provinloggning]', f.nyckel, e.message);
    }
  }
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
