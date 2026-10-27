// Servicearbetare: appskalet ligger kvar i telefonen så ronden går att
// göra utan täckning. API-svar cachas aldrig som sanning – de hämtas om.
const CACHE = 'hak-rond-v2';
const SKAL = ['/mobil/', '/mobil/index.html', '/mobil/manifest.webmanifest', '/mobil/ikon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SKAL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((namn) => Promise.all(namn.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API sköts av appen och dess kö

  e.respondWith(
    caches.match(e.request).then((traff) => {
      const natet = fetch(e.request)
        .then((svar) => {
          if (svar.ok) caches.open(CACHE).then((c) => c.put(e.request, svar.clone()));
          return svar;
        })
        .catch(() => traff || caches.match('/mobil/index.html'));
      return traff || natet;
    })
  );
});
