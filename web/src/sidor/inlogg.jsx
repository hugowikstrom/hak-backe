import { useRef, useState } from 'react';
import { api } from '../api.js';
import { Logotyp } from '../../delad/marke.jsx';
import { PRODUKT } from '../../delad/produkt.js';

export function Inlogg({ klar, forening, provinlogg }) {
  const [anvandarnamn, sattAnv] = useState('');
  const [losenord, sattLos] = useState('');
  const [fel, sattFel] = useState(null);
  const [vantar, sattVantar] = useState(false);
  const losenruta = useRef(null);

  const loggaIn = async (anv, los) => {
    sattVantar(true);
    sattFel(null);
    try {
      const d = await api.skapa('/api/logga-in', { anvandarnamn: anv, losenord: los });
      klar(d.medlem);
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattVantar(false);
    }
  };

  const skicka = (e) => {
    e.preventDefault();
    loggaIn(anvandarnamn, losenord);
  };

  /**
   * Provknapparna fyller i fälten i stället för att logga in direkt. Den
   * som provar ska se *vad* hen loggar in med – nästa gång kommer hen från
   * sin egen telefon utan knapparna.
   */
  const valjProv = (konto) => {
    sattAnv(konto.anvandarnamn);
    sattLos(konto.kod);
    sattFel(null);
    losenruta.current?.focus();
  };

  return (
    <div className="inlogg">
      <form onSubmit={skicka}>
        {/* Här finns plats för hela logotypen, inte bara märket. */}
        <div className="logotyp">
          <Logotyp bredd={230} />
        </div>
        <div className="marke">{PRODUKT}</div>
        {forening?.namn && <p className="hjalp" style={{ marginTop: -4 }}>{forening.namn}</p>}
        <p className="hjalp">Snöläggning, checklistor, ärenden och bemanning.</p>

        {provinlogg?.konton?.length > 0 && (
          <div className="provinlogg">
            <span className="rubrik">Prova systemet</span>
            <div className="val">
              {provinlogg.konton.map((k) => (
                <button
                  key={k.anvandarnamn}
                  type="button"
                  className={anvandarnamn === k.anvandarnamn ? 'vald' : ''}
                  onClick={() => valjProv(k)}
                >
                  <strong>{k.text}</strong>
                  <span>{k.beskrivning}</span>
                  <span className="kod"><code>{k.anvandarnamn}</code> · <code>{k.kod}</code></span>
                </button>
              ))}
            </div>
            <p className="hjalp">Tryck på en rad och sedan Logga in.</p>
          </div>
        )}

        <label className="falt">
          <span>Användarnamn</span>
          <input
            value={anvandarnamn}
            onChange={(e) => sattAnv(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoComplete="username"
          />
        </label>
        <label className="falt">
          <span>Lösenord</span>
          <input
            ref={losenruta}
            type="password"
            value={losenord}
            onChange={(e) => sattLos(e.target.value)}
            autoComplete="current-password"
          />
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
