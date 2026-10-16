// Återlämning: länken som kommer i sms när utrustningen lämnats ut.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Bricka } from '../delar.jsx';

export function Retur({ ruta, ga }) {
  const [avtal, sattAvtal] = useState(null);
  const [fel, sattFel] = useState(null);
  const [skickar, sattSkickar] = useState(false);

  useEffect(() => {
    api
      .hamta(`/api/uthyrning/avtal/${ruta.nummer}?kod=${ruta.kod || ''}`)
      .then(sattAvtal)
      .catch((e) => sattFel(e.message));
  }, [ruta.nummer, ruta.kod]);

  const anmal = async () => {
    sattSkickar(true);
    try {
      sattAvtal(await api.skapa(`/api/uthyrning/avtal/${ruta.nummer}/anmal-retur?kod=${ruta.kod}`, { kod: ruta.kod }));
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattSkickar(false);
    }
  };

  if (fel) return <main className="innehall"><div className="meddelande fel">{fel}</div></main>;
  if (!avtal) return <main className="innehall"><div className="tomt">Hämtar …</div></main>;

  const inne = avtal.status === 'aterlamnad';
  return (
    <main className="innehall">
      <div className="kort mitten">
        <div className="liten svag">Hyresnummer</div>
        <div className="ordernummer">{avtal.nummer}</div>
        <div style={{ marginTop: 10 }}>
          <Bricka farg={inne ? 'ok' : 'varning'}>
            {inne ? 'Återlämnad – tack!' : avtal.status === 'ute' ? 'Utrustningen är ute' : 'Bokad'}
          </Bricka>
        </div>
        {avtal.retur_senast && !inne && (
          <p className="liten svag" style={{ marginTop: 10 }}>Lämna tillbaka senast {avtal.retur_senast}.</p>
        )}
      </div>

      <div className="kort">
        <h2>Det du hyrde</h2>
        <div className="rader">
          {avtal.rader.map((r, i) => (
            <div key={i}>
              <span>{r.antal}× {r.namn}</span>
              <span className="liten svag">{r.markning || ''}</span>
            </div>
          ))}
        </div>
      </div>

      {!inne && (
        <div className="kort mitten">
          <p className="liten svag">
            Lämna utrustningen i uthyrningen och tryck här. Personalen prickar av den när de tagit emot den.
          </p>
          <button className="stor" onClick={anmal} disabled={skickar}>
            {skickar ? 'Skickar …' : 'Jag har lämnat tillbaka'}
          </button>
        </div>
      )}

      <div className="kort mitten">
        <button className="lank" onClick={() => ga('/fik/')}>Till fiket</button>
      </div>
    </main>
  );
}
