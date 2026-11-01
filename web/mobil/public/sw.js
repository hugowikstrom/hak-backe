// Servicearbetare: appskalet ligger kvar i telefonen så ronden går att
// göra utan täckning. API-svar cachas aldrig som sanning – de hämtas om.
const CACHE = 'hak-rond-v4';

// Samma fil serveras både som /mobil/sw.js och som /sw.js. Var den
// hämtades ifrån avgör vad den styr, och därmed vilket skal som ska
// ligga kvar i telefonen: kontrollvyn bor i roten, mobilappen under
// /mobil/. Att cacha fel skal ger en app som startar tom offline.
const ROT = new URL('./', self.location).pathname;
// I roten cachas bara "/" och inte "/index.html": på ett kontrollvärdnamn
// är de två olika sidor – "/" är kontrollvyn, "/index.html" är
// administrationen. Att cacha fel av dem ger en app som öppnar fel vy
// när täckningen är borta.
const SKAL =
  ROT === '/'
    ? ['/', '/manifest.webmanifest', '/mobil/ikon.svg']
    : ['/mobil/', '/mobil/index.html', '/mobil/manifest.webmanifest', '/mobil/ikon.svg'];

self.addEventListener('install', (e) => {
  // En enskild fil som inte går att hämta ska inte sänka hela
  // installationen – addAll är allt-eller-inget, det här är inte det.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SKAL.map((s) => c.add(s).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((namn) => Promise.all(namn.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/**
 * Två strategier, för de två sorternas filer.
 *
 * **Sidan själv** hämtas från nätet först. Den pekar ut vilka
 * tillgångar som gäller, och serveras den ur cachen får telefonen kvar
 * gårdagens app tills någon öppnar den en andra gång. Det var precis vad
 * som hände: en driftsättning syntes inte förrän appen startats om.
 *
 * **Tillgångarna** har hash i filnamnet och kan aldrig bli fel. Dem
 * hämtas ur cachen först – det är det som gör starten snabb och gör att
 * appen går att öppna utan täckning.
 */
const arSida = (begaran, url) =>
  begaran.mode === 'navigate' ||
  (begaran.headers.get('accept') || '').includes('text/html') ||
  url.pathname === ROT;

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API sköts av appen och dess kö

  if (arSida(e.request, url)) {
    e.respondWith(
      fetch(e.request)
        .then((svar) => {
          if (svar.ok) caches.open(CACHE).then((c) => c.put(ROT, svar.clone()));
          return svar;
        })
        .catch(() => caches.match(ROT).then((t) => t || caches.match(e.request)))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((traff) => {
      const natet = fetch(e.request)
        .then((svar) => {
          if (svar.ok) caches.open(CACHE).then((c) => c.put(e.request, svar.clone()));
          return svar;
        })
        .catch(() => traff);
      return traff || natet;
    })
  );
});
