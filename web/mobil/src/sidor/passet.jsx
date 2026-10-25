// Mitt pass: vem som jobbar i dag, och frågor jag behöver svara på.
//
// Det här är sidan man öppnar när man står i backen och undrar vem som har
// bandet, eller när telefonen sagt att det finns ett pass att ta ställning
// till. Inget annat ska ta plats här.
import { useState } from 'react';
import { api, hamtaMedCache } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Post, Tomt, useHamta, useNotis, Vanta } from '../delar.jsx';

const idag = () => new Date().toLocaleDateString('sv-SE');

export function Passet() {
  const jag = useJag();
  const notis = useNotis();
  const dagens = useHamta(() => hamtaMedCache(`/api/snoplan/idag?datum=${idag()}`));
  const fragor = useHamta(() => api.hamta('/api/snoplan/mina-forfragningar'));
  const [svarar, sattSvarar] = useState(null);

  const svara = async (f, ja) => {
    sattSvarar(f.id);
    try {
      await api.skapa(`/api/snoplan/forfragningar/${f.id}/svar`, { ja });
      notis(ja ? 'Tack – du är inbokad' : 'Noterat, du är inte inbokad', ja ? 'ok' : 'info');
      fragor.uppdatera();
      dagens.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSvarar(null);
    }
  };

  const pass = dagens.data?.data?.pass || [];
  const bemannade = pass.filter((p) => p.bemanning.length);
  const ofyllda = pass.filter((p) => p.saknas > 0);

  return (
    <>
      {!!(fragor.data?.forfragningar || []).length && (
        <section className="kort">
          <header>
            <h2>Kan du ta det här?</h2>
            <p className="liten svag" style={{ margin: '4px 0 10px' }}>
              En fråga, inte en bokning. Du står inte i schemat förrän du svarat ja.
            </p>
          </header>
          {fragor.data.forfragningar.map((f) => (
            <div key={f.id} className="fraga">
              <div className="rad-mellan">
                <strong>
                  {f.datum} {f.start}–{f.slut}
                </strong>
                {f.slag === 'natt' && <Bricka farg="natt">natt</Bricka>}
              </div>
              <div className="liten svag">
                {f.position}
                {f.lagsta_wetbulb != null
                  ? ` · prognosen ger ${f.lagsta_wetbulb} °C wetbulb`
                  : ''}
              </div>
              <div className="svarsknappar">
                <button className="ok" disabled={svarar === f.id} onClick={() => svara(f, true)}>
                  Ja, jag tar det
                </button>
                <button className="avvik" disabled={svarar === f.id} onClick={() => svara(f, false)}>
                  Nej
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="kort">
        <header>
          <h2>Dagens bemanning</h2>
          <p className="liten svag" style={{ margin: '4px 0 10px' }}>
            {idag()}
            {dagens.data?.fran === 'cache' ? ' · sparad bild, telefonen når inte servern' : ''}
          </p>
        </header>
        {dagens.laddar && !dagens.data ? (
          <Vanta />
        ) : bemannade.length === 0 ? (
          <Tomt>Ingen är schemalagd i dag.</Tomt>
        ) : (
          <div className="lista">
            {bemannade.map((p) => (
              <div key={p.id} className="passrad">
                <span className="markor" style={{ background: p.farg }} aria-hidden="true" />
                <span className="txt">
                  <strong>{p.position}</strong>
                  <span className="liten svag">
                    {p.start}–{p.slut}
                  </span>
                  {p.bemanning.map((b) => (
                    <span key={b.medlem_id} className="person">
                      {b.namn}
                      {b.medlem_id === jag.id ? ' (du)' : ''}
                      {b.telefon && (
                        <a className="ring" href={`tel:${b.telefon.replace(/\s/g, '')}`}>
                          Ring
                        </a>
                      )}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
        {!!ofyllda.length && (
          <p className="liten varningstext" style={{ marginTop: 10 }}>
            {ofyllda.reduce((s, p) => s + p.saknas, 0)} platser saknar folk i dag
            {' '}({ofyllda.map((p) => p.position).join(', ')}).
          </p>
        )}
      </section>
    </>
  );
}
