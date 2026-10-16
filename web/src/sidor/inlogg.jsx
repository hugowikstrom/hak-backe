import { useState } from 'react';
import { api } from '../api.js';
import { Marke } from '../delar/bitar.jsx';

export function Inlogg({ klar }) {
  const [anvandarnamn, sattAnv] = useState('');
  const [losenord, sattLos] = useState('');
  const [fel, sattFel] = useState(null);
  const [vantar, sattVantar] = useState(false);

  const skicka = async (e) => {
    e.preventDefault();
    sattVantar(true);
    sattFel(null);
    try {
      const d = await api.skapa('/api/logga-in', { anvandarnamn, losenord });
      klar(d.medlem);
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattVantar(false);
    }
  };

  return (
    <div className="inlogg">
      <form onSubmit={skicka}>
        <div className="marke">
          <Marke storlek={30} /> HAK Backe
        </div>
        <p className="hjalp">Snöläggning, checklistor, ärenden och bemanning.</p>
        <label className="falt">
          <span>Användarnamn</span>
          <input value={anvandarnamn} onChange={(e) => sattAnv(e.target.value)} autoFocus autoCapitalize="none" />
        </label>
        <label className="falt">
          <span>Lösenord</span>
          <input type="password" value={losenord} onChange={(e) => sattLos(e.target.value)} />
        </label>
        {fel && <div className="meddelande fel">{fel}</div>}
        <button className="primar" disabled={vantar || !anvandarnamn}>
          {vantar ? 'Loggar in …' : 'Logga in'}
        </button>
        <p className="hjalp">Glömt lösenord? Hör av dig till backansvarig.</p>
      </form>
    </div>
  );
}
