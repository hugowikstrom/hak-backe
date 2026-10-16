// Genomförda ronder, egna och andras.
import { useState } from 'react';
import { api } from '../api.js';
import { Ark, Bricka, klockan, Post, Tomt, useHamta, Vanta } from '../delar.jsx';

export function Historik() {
  const [vald, sattVald] = useState(null);
  const korningar = useHamta(() => api.hamta('/api/checklistor/korningar?antal=60'));

  if (korningar.laddar && !korningar.data) return <Vanta />;
  if (korningar.fel) return <div className="meddelande fel">Historiken kräver täckning. {korningar.fel}</div>;

  return (
    <>
      <h1>Historik</h1>
      <section className="kort lista">
        {(korningar.data || []).map((k) => (
          <Post
            key={k.id}
            figur={k.antal_avvikelser ? '!' : '✓'}
            figurfarg={k.antal_avvikelser ? 'fara' : ''}
            titel={k.mall}
            under={`${k.utrustning || k.omrade || 'Allmänt'} · ${klockan(k.startad)} · ${k.av || ''}`}
            hoger={
              <span className="brickrad">
                {!!k.antal_avvikelser && <Bricka farg="rod">{k.antal_avvikelser}</Bricka>}
                <Bricka farg={k.status === 'klar' ? 'gron' : 'gul'}>
                  {k.status === 'klar' ? 'Klar' : 'Pågår'}
                </Bricka>
              </span>
            }
            onClick={() => sattVald(k.id)}
          />
        ))}
        {!korningar.data?.length && <Tomt>Inga ronder ännu.</Tomt>}
      </section>
      {vald && <Detalj id={vald} stang={() => sattVald(null)} />}
    </>
  );
}

function Detalj({ id, stang }) {
  const { data: k, laddar } = useHamta(() => api.hamta(`/api/checklistor/korningar/${id}`), [id]);
  return (
    <Ark titel={k?.mall || 'Rond'} stang={stang} fot={<button className="primar" onClick={stang}>Stäng</button>}>
      {laddar && !k ? (
        <Vanta />
      ) : (
        <>
          <div className="rad hopp">
            <Bricka>{k.utrustning || k.omrade || 'Allmänt'}</Bricka>
            <Bricka farg={k.status === 'klar' ? 'gron' : 'gul'}>{k.status === 'klar' ? 'Klar' : 'Pågår'}</Bricka>
            {k.kalla === 'mobil' && <Bricka>mobil</Bricka>}
          </div>
          <p className="liten svag" style={{ margin: 0 }}>
            {klockan(k.startad)}{k.avslutad ? ` – ${klockan(k.avslutad)}` : ''} · {k.av}
          </p>
          <div className="kort lista">
            {k.punkter.map((p) => {
              const klar = p.bockad || p.varde != null || p.svarstext;
              return (
                <div key={p.id} className={`punktrad${p.avvikelse ? ' avvikande' : klar ? ' klar' : ''}`}>
                  <span className="markor">{p.avvikelse ? '!' : klar ? '✓' : '–'}</span>
                  <span>
                    {p.text}
                    {p.varde != null && <span className="liten svag"> — {p.varde} {p.enhet || ''}</span>}
                    {p.svarstext && <span className="liten svag" style={{ display: 'block' }}>{p.svarstext}</span>}
                    {p.kommentar && <span className="liten svag" style={{ display: 'block' }}>{p.kommentar}</span>}
                  </span>
                  {p.bild && <img className="miniatyr" src={`/api/bilder/${p.bild}`} alt="" />}
                </div>
              );
            })}
          </div>
          {k.anteckning && <div className="meddelande info">{k.anteckning}</div>}
        </>
      )}
    </Ark>
  );
}
