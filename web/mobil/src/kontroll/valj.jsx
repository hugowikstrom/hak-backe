// Väljarna: arbetsställe först, sedan rond eller enhet.
//
// Två steg innan man ser en uppgift är en omväg jag inte hade valt – men
// det är vägen klubben kan, och vanan är värd mer än ett klick. Den som
// vill gå raka vägen når samma ronder från Backis vanliga startsida.
import { useState } from 'react';
import { Ikon } from './skal.jsx';
import { useFavoriter } from './favoriter.js';

export function Valjare({ etikett, platshallare, valt, poster, satt, grupper, favoritslag }) {
  const [oppen, sattOppen] = useState(false);
  const [sok, sattSok] = useState('');
  const [favorit, vaxlaFavorit] = useFavoriter(favoritslag || 'enhet');

  const traffar = poster.filter((p) => !sok || p.namn.toLowerCase().includes(sok.toLowerCase()));
  // Favoriter först, med egen rubrik. Rubriken står kvar även när
  // gruppen är tom i förlagan – men en tom rubrik säger ingenting, så
  // den visas bara när den har något under sig.
  const favoriter = traffar.filter((p) => favorit(p.id ?? p.nyckel));
  const ovriga = traffar.filter((p) => !favorit(p.id ?? p.nyckel));
  const indelat = [
    { rubrik: 'Favoriter', rader: favoriter },
    { rubrik: grupper ? 'Enheter' : 'Arbetsställen', rader: ovriga },
  ].filter((g) => g.rader.length);

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
        <div className="kv-lista rullande">
          <div className="sok">
            <Ikon namn="sok" storlek={22} />
            <input
              value={sok}
              onChange={(e) => sattSok(e.target.value)}
              placeholder="Sök"
              aria-label="Sök"
            />
          </div>
          {indelat.map((g) => (
            <div key={g.rubrik}>
              <div className="rubrik">{g.rubrik}</div>
              {g.rader.map((p) => {
                const id = p.id ?? p.nyckel;
                return (
                  <div key={id} className="rad stjarnrad">
                    <button
                      className="val"
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
                    <button
                      className={`stjarna${favorit(id) ? ' pa' : ''}`}
                      aria-pressed={favorit(id)}
                      aria-label={`Favorit: ${p.namn}`}
                      onClick={() => vaxlaFavorit(id)}
                    >
                      <Ikon namn="stjarna" storlek={24} />
                    </button>
                  </div>
                );
              })}
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
