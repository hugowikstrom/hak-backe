import { createRoot } from 'react-dom/client';
import { App } from './app.jsx';
import './stil.css';

createRoot(document.getElementById('rot')).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/mobil/sw.js', { scope: '/mobil/' }).catch(() => {})
  );
}
