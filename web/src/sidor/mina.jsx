// Mina sidor: kvotläge, mina pass, mina insatser och otillgänglighet.
import { useState } from 'react';
import { api } from '../api.js';
import { Lank, useJag } from '../app.jsx';
import { Bricka, Kort, Matare, Nyckeltal, Text, Tomt, useHamta, useNotis, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { idag, INSATSSLAG, kortDatum, langDatum, PASSLAG, procent, tal } from '../nytta.js';

export function Mina() {
  const jag = useJag();
  const notis = useNotis();
  const mina = useHamta(() => api.hamta('/api/bemanning/mina'));
  const [nyFran, sattNyFran] = useState(idag());
  const [nyTill, sattNyTill] = useState(idag());
  const [orsak, sattOrsak] = useState('');
  const [losen, sattLosen] = useState({ gammalt: '', nytt: '' });

  if (mina.laddar && !mina.data) return <Vanta />;
  const { lage, pass, insatser, otillganglighet, lediga } = mina.data;

  const gor = async (fn, meddelande) => {
    try {
      await fn();
      mina.uppdatera();
      if (meddelande) notis(meddelande);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const kommande = pass.filter((p) => p.datum >= idag());
  const gangna = pass.filter((p) => p.datum < idag());

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Mina sidor</h1>
          <div className="undertext">{jag.namn} · {jag.anvandarnamn}</div>
        </div>
        <Lank till="/bemanning" className="knapp">Till schemat</Lank>
      </div>

      <div className="rutor bred">
        <Kort titel="Säsongens kvot">
          {lage.undantagen ? (
            <p className="svag">Du är undantagen från bemanningskvoten.</p>
          ) : (
            <>
              <div className="rad gap-16 hopp">
                <Nyckeltal etikett="Timmar totalt" varde={tal(lage.timmar)} enhet={`/ ${tal(lage.kvot)}`} />
                <Nyckeltal etikett="Utfört" varde={tal(lage.utfort)} enhet="h" />
                <Nyckeltal etikett="Planerat" varde={tal(lage.planerat)} enhet="h" />
                <Nyckeltal etikett="Kvar" varde={tal(lage.kvar)} enhet="h" farg={lage.kvar > 0 ? 'varning' : 'ok'} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Matare andel={lage.andel} />
                <div className="rad-mellan liten svag" style={{ marginTop: 4 }}>
                  <span>{procent(lage.andel)} av kvoten uppfyllt</span>
                  <span>{lage.antal_pass} pass · {lage.natt} nattpass · {lage.helg} helgpass</span>
                </div>
              </div>
              {lage.kvar > 0 && (
                <div className="meddelande varning" style={{ marginTop: 10 }}>
                  Du har {tal(lage.kvar)} timmar kvar att boka. Nedan finns pass som saknar folk.
                </div>
              )}
            </>
          )}
        </Kort>

        <Kort titel="Pass som saknar folk" undertext="Ett klick bokar dig" tat>
          <Tabell
            rader={lediga.slice(0, 40)}
            tomtext="Allt är bemannat."
            kolumner={[
              { falt: 'datum', rubrik: 'Datum', visa: (p) => <span className="num">{langDatum(p.datum)}</span> },
              { falt: 'start', rubrik: 'Tid', visa: (p) => <span className="num">{p.start}–{p.slut}</span> },
              { falt: 'position', rubrik: 'Position' },
              { falt: 'saknas', rubrik: 'Saknas', sifra: true, visa: (p) => <Bricka farg="fara">{p.saknas}</Bricka> },
              {
                falt: 'boka', rubrik: '', sortlos: true,
                visa: (p) => (
                  <button
                    className="liten primar"
                    onClick={() => gor(() => api.skapa(`/api/bemanning/pass/${p.id}/boka`, {}), 'Bokad.')}
                  >
                    Boka
                  </button>
                ),
              },
            ]}
          />
        </Kort>
      </div>

      <Kort titel="Mina kommande pass" tat>
        <Tabell
          rader={kommande}
          nyckel={(p) => `${p.datum}-${p.start}-${p.position}`}
          tomtext="Du har inga kommande pass bokade."
          kolumner={[
            { falt: 'datum', rubrik: 'Datum', visa: (p) => <span className="num">{langDatum(p.datum)}</span> },
            { falt: 'start', rubrik: 'Tid', visa: (p) => <span className="num">{p.start}–{p.slut}</span> },
            { falt: 'position', rubrik: 'Position', visa: (p) => <strong>{p.position}</strong> },
            { falt: 'status', rubrik: 'Status', visa: (p) => <Bricka farg={p.status === 'tilldelad' ? 'lila' : 'info'}>{p.status}</Bricka> },
          ]}
        />
      </Kort>

      <div className="tva">
        <Kort titel="Mina insatser" undertext="Genomfört under säsongen" tat>
          <Tabell
            rader={insatser}
            tomtext="Inga registrerade insatser."
            maxhojd="40vh"
            kolumner={[
              { falt: 'datum', rubrik: 'Datum', visa: (i) => <span className="num">{kortDatum(i.datum)}</span> },
              { falt: 'timmar', rubrik: 'Timmar', sifra: true, visa: (i) => tal(i.timmar) },
              { falt: 'slag', rubrik: 'Slag', visa: (i) => INSATSSLAG[i.slag] || i.slag },
              { falt: 'beskrivning', rubrik: 'Beskrivning' },
            ]}
            fot={
              <>
                <td>Summa</td>
                <td className="sifra">{tal(insatser.reduce((a, b) => a + b.timmar, 0))}</td>
                <td colSpan={2} />
              </>
            }
          />
        </Kort>

        <div className="kolumn">
          <Kort titel="När jag inte kan" undertext="Automatplaneringen hoppar över dessa dagar">
            <div className="faltrad">
              <Text etikett="Från" typ="date" varde={nyFran} satt={sattNyFran} />
              <Text etikett="Till" typ="date" varde={nyTill} satt={sattNyTill} />
              <Text etikett="Orsak" varde={orsak} satt={sattOrsak} placeholder="t.ex. bortrest" />
              <button
                className="primar"
                onClick={() =>
                  gor(
                    () => api.skapa('/api/bemanning/otillganglighet', { fran: nyFran, till: nyTill, orsak }),
                    'Sparat.'
                  ).then(() => sattOrsak(''))
                }
              >
                Lägg till
              </button>
            </div>
            <div className="skiljare" />
            {otillganglighet.length ? (
              <ul className="lista">
                {otillganglighet.map((o) => (
                  <li key={o.id}>
                    <span className="vaxa num">
                      {o.fran} – {o.till} <span className="svag">{o.orsak || ''}</span>
                    </span>
                    <button className="liten fara" onClick={() => gor(() => api.tabort(`/api/bemanning/otillganglighet/${o.id}`), 'Borttaget.')}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Tomt>Inga perioder registrerade.</Tomt>
            )}
          </Kort>

          <Kort titel="Byt lösenord">
            <div className="faltrad">
              <Text etikett="Nuvarande" typ="password" varde={losen.gammalt} satt={(v) => sattLosen((l) => ({ ...l, gammalt: v }))} />
              <Text etikett="Nytt" typ="password" varde={losen.nytt} satt={(v) => sattLosen((l) => ({ ...l, nytt: v }))} />
              <button
                disabled={!losen.gammalt || !losen.nytt}
                onClick={async () => {
                  try {
                    await api.skapa('/api/jag/losenord', losen);
                    notis('Lösenordet är bytt. Logga in igen.');
                    setTimeout(() => window.location.reload(), 900);
                  } catch (e) {
                    notis(e.message, 'fel');
                  }
                }}
              >
                Byt
              </button>
            </div>
          </Kort>
        </div>
      </div>

      {!!gangna.length && (
        <Kort titel="Tidigare pass" tat>
          <Tabell
            rader={gangna}
            nyckel={(p) => `${p.datum}-${p.start}-${p.position}`}
            maxhojd="30vh"
            kolumner={[
              { falt: 'datum', rubrik: 'Datum', visa: (p) => <span className="num">{langDatum(p.datum)}</span> },
              { falt: 'start', rubrik: 'Tid', visa: (p) => <span className="num">{p.start}–{p.slut}</span> },
              { falt: 'position', rubrik: 'Position' },
              { falt: 'status', rubrik: 'Status', visa: (p) => <Bricka farg={p.status === 'narvarande' ? 'ok' : ''}>{p.status}</Bricka> },
            ]}
          />
        </Kort>
      )}
    </>
  );
}
