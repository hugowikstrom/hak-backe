// Hjälpen: genomgångsfilmerna, en per roll i klubben.
//
// Formen är med flit nästan tom. Den som öppnar hjälpen vet redan vad hen
// undrar över – det enda som behövs är att hitta rätt film och starta den.
// Därför: en rad per roll, stillbild och längd, och uppspelning på samma
// sida i stället för en egen vy att backa ut ur.
//
// Filmen strömmas med byteintervall, så det går att dra i tidslinjen utan
// att ladda hem hela filen först. Se server/api/hjalp.mjs.
import { useState } from 'react';
import { api } from '../api.js';
import { Kort, Tomt, useHamta, Vanta } from '../delar/bitar.jsx';

const minuter = (sekunder) => {
  if (!sekunder) return null;
  const m = Math.floor(sekunder / 60);
  const s = Math.round(sekunder % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function Hjalp() {
  const { data, laddar } = useHamta(() => api.hamta('/api/hjalp'));
  const [spelar, sattSpelar] = useState(null);
  const [langder, sattLangder] = useState({});

  if (laddar && !data) return <Vanta />;
  const filmer = data?.filmer || [];

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Hjälp</h1>
          <div className="undertext">
            Genomgångar av systemet, en per roll. Titta på den som gäller dig – det räcker.
          </div>
        </div>
      </div>

      {filmer.length === 0 ? (
        <Tomt>Inga genomgångar är inlagda ännu.</Tomt>
      ) : (
        <div className="filmlista">
          {filmer.map((f) => {
            const pa = spelar === f.nyckel;
            return (
              <Kort key={f.nyckel} tat>
                <div className="filmrad">
                  <button
                    className="filmaffisch"
                    onClick={() => sattSpelar(pa ? null : f.nyckel)}
                    aria-label={`${pa ? 'Stäng' : 'Spela'} ${f.titel}`}
                  >
                    {f.affisch ? <img src={f.affisch} alt="" loading="lazy" /> : <span className="utanaffisch" />}
                    {!pa && <span className="spelaknapp" aria-hidden="true" />}
                  </button>
                  <div className="filmtext">
                    <h2>{f.titel}</h2>
                    <p className="svag">{f.beskrivning}</p>
                    <div className="rad liten svag hopp">
                      <span className="filmfor">{f.for}</span>
                      {langder[f.nyckel] && <span className="num">{minuter(langder[f.nyckel])}</span>}
                    </div>
                  </div>
                  <button className="stor" onClick={() => sattSpelar(pa ? null : f.nyckel)}>
                    {pa ? 'Stäng' : 'Spela'}
                  </button>
                </div>

                {pa && (
                  <div className="filmruta">
                    {/* autoPlay: knappen trycktes redan – ett andra tryck
                        på play är ett steg för mycket. */}
                    <video
                      src={f.film}
                      poster={f.affisch || undefined}
                      controls
                      autoPlay
                      playsInline
                      preload="metadata"
                      // e.target och inte e.currentTarget: mediahändelser
                      // når handlern efter att React nollat currentTarget.
                      onLoadedMetadata={(e) => {
                        const d = e.target?.duration;
                        if (d) sattLangder((l) => ({ ...l, [f.nyckel]: d }));
                      }}
                    />
                  </div>
                )}
              </Kort>
            );
          })}
        </div>
      )}

      <Kort titel="Hittar du inte svaret?">
        <p className="svag" style={{ margin: 0 }}>
          Lämna en fråga i <a href="/ideer">idélådan</a> – den går till styrelsen, och svaret blir
          ofta ett tillägg i nästa genomgång.
        </p>
      </Kort>
    </>
  );
}
