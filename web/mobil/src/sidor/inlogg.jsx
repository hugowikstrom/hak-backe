import { useState } from 'react';
import { api } from '../api.js';
import { Marke } from '../delar.jsx';

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
      <div className="huvud">
        <Marke storlek={84} />
        <h1>HAK Rond</h1>
        <p className="liten" style={{ opacity: 0.8 }}>Checklistor för Härnösands Alpina</p>
      </div>
      <form onSubmit={skicka}>
        <label className="falt">
          <span>Användarnamn</span>
          <input value={anvandarnamn} onChange={(e) => sattAnv(e.target.value)} autoCapitalize="none" autoComplete="username" />
        </label>
        <label className="falt">
          <span>Lösenord</span>
          <input type="password" value={losenord} onChange={(e) => sattLos(e.target.value)} autoComplete="current-password" />
        </label>
        {fel && <div className="meddelande fel">{fel}</div>}
        <button className="primar stor" disabled={vantar || !anvandarnamn}>
          {vantar ? 'Loggar in …' : 'Logga in'}
        </button>
        <p className="liten svagare mitten" style={{ margin: 0 }}>Samma inloggning som i backsystemet.</p>
      </form>
    </div>
  );
}
