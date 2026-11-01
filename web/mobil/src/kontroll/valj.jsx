// Väljarna: arbetsställe först, sedan rond eller enhet.
//
// Två steg innan man ser en uppgift är en omväg jag inte hade valt – men
// det är vägen klubben kan, och vanan är värd mer än ett klick. Den som
// vill gå raka vägen når samma ronder från Backis vanliga startsida.
import { useState } from 'react';

export function Valjare({ etikett, platshallare, valt, poster, satt, grupper }) {
  const [oppen, sattOppen] = useState(false);
  const [sok, sattSok] = useState('');

  const traffar = poster.filter(
    (p) => !sok || p.namn.toLowerCase().includes(sok.toLowerCase())
  );
  // Favoriter först, som i förlagan – men bara när någon är märkt.
  const indelat = grupper
    ? [
        { rubrik: 'Favoriter', rader: traffar.filter((p) => p.favorit) },
        { rubrik: etikett === 'Rond' ? 'Ronder' : 'Enheter', rader: traffar.filter((p) => !p.favorit) },
      ].filter((g) => g.rader.length)
    : [{ rubrik: null, rader: traffar }];

  return (
    <label className="kv-falt">
      <span>{etikett}</span>
      {valt ? (
        <button className="kv-valj" onClick={() => satt(null)}>
          {valt.namn}
          <span aria-hidden="true">✕</span>
        </button>
      ) : (
        <button className={`kv-valj${oppen ? '' : ' tom'}`} onClick={() => sattOppen((o) => !o)}>
          {platshallare}
          <span aria-hidden="true">{oppen ? '⌃' : '⌄'}</span>
        </button>
      )}
      {oppen && !valt && (
        <div className="kv-lista">
          <div className="sok">
            <input
              value={sok}
              onChange={(e) => sattSok(e.target.value)}
              placeholder="Sök"
              aria-label="Sök"
            />
          </div>
          {indelat.map((g) => (
            <div key={g.rubrik || 'alla'}>
              {g.rubrik && <div className="rubrik">{g.rubrik}</div>}
              {g.rader.map((p) => (
                <button
                  key={p.id ?? p.nyckel}
                  className="rad"
                  onClick={() => {
                    satt(p);
                    sattOppen(false);
                    sattSok('');
                  }}
                >
                  {p.aktiv !== false && <span className="prick" />}
                  <span className="txt">
                    <strong>{p.namn}</strong>
                    {p.under && <small>{p.under}</small>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {!traffar.length && <div className="tomt">Hittade inga objekt.</div>}
        </div>
      )}
    </label>
  );
}

/** Knappen längst ned. Heter det den gör – "Nästa" på en väg vidare,
 *  "Spara" där trycket skriver något. */
export const Nasta = ({ pa, onClick, text = 'Nästa' }) => (
  <div className="kv-nasta">
    <button disabled={!pa} onClick={onClick}>
      {text} <span className="rund" aria-hidden="true">›</span>
    </button>
  </div>
);
