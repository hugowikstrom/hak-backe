// Fiket och uthyrningen för gästen i backen. Ingen inloggning.
import { useEffect, useState } from 'react';
import { Marke } from './delar.jsx';
import { Meny } from './sidor/meny.jsx';
import { Order } from './sidor/order.jsx';
import { Uthyrning } from './sidor/uthyrning.jsx';
import { Retur } from './sidor/retur.jsx';

/** /fik/, /fik/order/K12, /fik/uthyrning, /fik/retur/U3 */
function lasRuta() {
  const delar = window.location.pathname.replace(/^\/fik\/?/, '').split('/').filter(Boolean);
  const kod = new URLSearchParams(window.location.search).get('kod');
  if (delar[0] === 'order') return { vy: 'order', nummer: delar[1], kod };
  if (delar[0] === 'uthyrning') return { vy: 'uthyrning' };
  if (delar[0] === 'retur') return { vy: 'retur', nummer: delar[1], kod };
  return { vy: 'meny' };
}

export function App() {
  const [ruta, sattRuta] = useState(lasRuta);

  useEffect(() => {
    const vid = () => sattRuta(lasRuta());
    window.addEventListener('popstate', vid);
    return () => window.removeEventListener('popstate', vid);
  }, []);

  const ga = (stig) => {
    window.history.pushState({}, '', stig);
    sattRuta(lasRuta());
  };

  const Sida = { meny: Meny, order: Order, uthyrning: Uthyrning, retur: Retur }[ruta.vy] || Meny;

  return (
    <div className="skal">
      <header className="topp">
        <Marke />
        <div>
          <div className="namn">{ruta.vy === 'uthyrning' ? 'Skiduthyrningen' : 'Fiket'}</div>
          <div className="under">Härnösands Alpina</div>
        </div>
        {ruta.vy === 'meny' ? (
          <a href="/fik/uthyrning" onClick={(e) => { e.preventDefault(); ga('/fik/uthyrning'); }}>Hyra utrustning</a>
        ) : (
          <a href="/fik/" onClick={(e) => { e.preventDefault(); ga('/fik/'); }}>Till fiket</a>
        )}
      </header>
      <Sida ruta={ruta} ga={ga} />
      <div className="fot">Härnösands Alpina Klubb · Vårdkasbacken</div>
    </div>
  );
}
