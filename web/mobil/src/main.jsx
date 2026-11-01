import { createRoot } from 'react-dom/client';
import { App } from './app.jsx';
import './stil.css';

// `beforeinstallprompt` kommer ofta innan React hunnit montera någonting.
// Fångas den först i en useEffect är den redan borta, och knappen "Lägg
// till på hemskärmen" dyker aldrig upp. Därför tas den emot här, i
// modulens topp, och läggs undan tills någon vy frågar efter den.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__hakInstallera = e;
  window.dispatchEvent(new Event('hak-installerbar'));
});
window.addEventListener('appinstalled', () => {
  window.__hakInstallera = null;
  window.dispatchEvent(new Event('hak-installerbar'));
});

createRoot(document.getElementById('rot')).render(<App />);

// Kontrollvyn bor i roten på sitt eget värdnamn. Då måste både
// manifestet och servicearbetaren höra hemma där: en arbetare registrerad
// under /mobil/ styr inte sidan som ligger på /, och ett manifest med
// start_url /mobil/ öppnar ikonen i fel vy.
const iRoten = !location.pathname.startsWith('/mobil/');

if (iRoten) {
  const lank = document.querySelector('link[rel=manifest]');
  if (lank) lank.href = '/manifest.webmanifest';
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const [fil, scope] = iRoten ? ['/sw.js', '/'] : ['/mobil/sw.js', '/mobil/'];
  window.addEventListener('load', () =>
    navigator.serviceWorker.register(fil, { scope }).catch(() => {})
  );
}
