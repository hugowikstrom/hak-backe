// Samåkning mellan medlemmar.
//
// Fyrtio mil tur och retur till Sälen, ett tjugotal familjer, och i dag en
// Messenger-tråd där den som skriver sist blir ihågkommen. Här ligger
// bilarna i stället där resan ligger, och den som bokar en plats ser
// förarens telefonnummer – men bara den som faktiskt sitter i bilen gör
// det. En lista över vem som åker vart med vem är känsligare än den ser ut.
import { useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Falt, Kort, Lada, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { langDatum } from '../nytta.js';

const nar = (v) => `${langDatum(String(v).slice(0, 10))} kl ${String(v).slice(11, 16)}`;

export function Samakning() {
  const jag = useJag();
  const notis = useNotis();
  const [alla, sattAlla] = useState(false);
  const [filter, sattFilter] = useState('');
  const { data, laddar, uppdatera } = useHamta(
    () => api.hamta(`/api/samakning?${alla ? 'alla=1&' : ''}${filter ? `evenemang=${filter}` : ''}`),
    [alla, filter]
  );
  const [nytt, sattNytt] = useState(false);

  if (laddar && !data) return <Vanta />;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Samåkning</h1>
          <div className="undertext">
            Har du plats i bilen? Lägg upp avresan. Behöver du åka med? Boka en plats.
          </div>
        </div>
        <div className="knapprad">
          <Val
            etikett=""
            varde={filter}
            satt={sattFilter}
            tomtext="Alla resor"
            poster={data.evenemang.map((e) => ({ varde: e.id, text: e.namn }))}
          />
          <button className={alla ? 'aktiv' : ''} onClick={() => sattAlla((v) => !v)}>
            {alla ? 'Visa kommande' : 'Visa även gamla'}
          </button>
          <button className="primar" onClick={() => sattNytt(true)}>Erbjud plats</button>
        </div>
      </div>

      {data.samakningar.length === 0 ? (
        <Kort>
          <Tomt>
            Ingen har lagt upp någon avresa ännu. Ska du åka till ett läger eller en tävling?
            Lägg upp din bil – någon annan väntar förmodligen på just det.
          </Tomt>
        </Kort>
      ) : (
        <div className="bilrutnat">
          {data.samakningar.map((s) => (
            <Bil key={s.id} s={s} jag={jag} notis={notis} uppdatera={uppdatera} />
          ))}
        </div>
      )}

      {nytt && (
        <Blankett
          evenemang={data.evenemang}
          stang={() => sattNytt(false)}
          klar={() => (sattNytt(false), uppdatera())}
        />
      )}
    </>
  );
}

function Bil({ s, jag, notis, uppdatera }) {
  const [arbetar, sattArbetar] = useState(false);
  const [pastigning, sattPastigning] = useState('');
  const [andra, sattAndra] = useState(false);

  const gor = async (fn, meddelande) => {
    sattArbetar(true);
    try {
      await fn();
      if (meddelande) notis(meddelande);
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <article className={`bilkort${s.status === 'installd' ? ' blek' : ''}`}>
      <header>
        <div>
          <h3>{s.fran}</h3>
          <div className="num liten">{nar(s.avresa)}</div>
        </div>
        {s.status === 'installd' ? (
          <Bricka farg="fara">Inställd</Bricka>
        ) : s.fullt ? (
          <Bricka farg="varning">Full</Bricka>
        ) : (
          <Bricka farg="ok">{s.platser_kvar} {s.platser_kvar === 1 ? 'plats' : 'platser'} kvar</Bricka>
        )}
      </header>

      <dl>
        <dt>Kör</dt>
        <dd>
          {s.forare}
          {s.jag_kor && <span className="svag"> (du)</span>}
          {s.forare_telefon && <span className="num svag"> · {s.forare_telefon}</span>}
        </dd>
        {s.evenemang && (<><dt>Till</dt><dd>{s.evenemang}</dd></>)}
        {s.bil && (<><dt>Bil</dt><dd>{s.bil}</dd></>)}
        <dt>Med</dt>
        <dd>
          {s.passagerare.length === 0 ? (
            <span className="svag">Ingen bokad ännu</span>
          ) : (
            <ul className="passagerare">
              {s.passagerare.map((p) => (
                <li key={p.id}>
                  {p.medlem}
                  {p.pastigning && <span className="svag"> – på vid {p.pastigning}</span>}
                  {p.telefon && <span className="num svag"> · {p.telefon}</span>}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      {s.anteckning && <p className="liten svag">{s.anteckning}</p>}

      {s.status === 'oppen' && (
        <footer>
          {s.min_plats ? (
            <>
              <Bricka farg="ok">Du har plats</Bricka>
              <button
                className="tom liten"
                disabled={arbetar}
                onClick={() => gor(() => api.tabort(`/api/samakning/${s.id}/plats/${s.min_plats.id}`), 'Platsen avbokad')}
              >
                Avboka min plats
              </button>
            </>
          ) : s.jag_kor ? (
            <>
              <button className="liten" onClick={() => sattAndra(true)}>Ändra</button>
              <button
                className="fara tom liten"
                disabled={arbetar}
                onClick={() => gor(() => api.tabort(`/api/samakning/${s.id}`), 'Resan är inställd – hör av dig till dem som bokat')}
              >
                Ställ in resan
              </button>
            </>
          ) : (
            <>
              <Text etikett="" varde={pastigning} satt={sattPastigning} placeholder="Kliver på vid … (frivilligt)" />
              <button
                className="primar liten"
                disabled={arbetar || s.fullt}
                onClick={() => gor(
                  () => api.skapa(`/api/samakning/${s.id}/plats`, { pastigning: pastigning.trim() || null }),
                  'Du har en plats – kom ihåg avresetiden'
                )}
              >
                {s.fullt ? 'Full' : 'Boka plats'}
              </button>
            </>
          )}
        </footer>
      )}

      {andra && (
        <Blankett
          samakning={s}
          stang={() => sattAndra(false)}
          klar={() => (sattAndra(false), uppdatera())}
        />
      )}
    </article>
  );
}

function Blankett({ samakning, evenemang = [], stang, klar }) {
  const notis = useNotis();
  const { data } = useHamta(() => api.hamta('/api/samakning'), []);
  const lista = evenemang.length ? evenemang : data?.evenemang || [];
  const [f, sattF] = useState({
    evenemang_id: samakning?.evenemang_id || '',
    fran: samakning?.fran || '',
    datum: samakning ? String(samakning.avresa).slice(0, 10) : '',
    tid: samakning ? String(samakning.avresa).slice(11, 16) : '06:00',
    platser: String(samakning?.platser ?? 3),
    bil: samakning?.bil || '',
    anteckning: samakning?.anteckning || '',
  });
  const [arbetar, sattArbetar] = useState(false);
  const satt = (n) => (v) => sattF((p) => ({ ...p, [n]: v }));

  const spara = async () => {
    if (!f.fran.trim()) return notis('Varifrån kör du?', 'fel');
    if (!f.datum || !f.tid) return notis('När åker du?', 'fel');
    const kropp = {
      evenemang_id: f.evenemang_id ? Number(f.evenemang_id) : null,
      fran: f.fran.trim(),
      avresa: `${f.datum} ${f.tid}`,
      platser: Number(f.platser) || 0,
      bil: f.bil.trim() || null,
      anteckning: f.anteckning.trim() || null,
    };
    sattArbetar(true);
    try {
      if (samakning) await api.spara(`/api/samakning/${samakning.id}`, kropp);
      else await api.skapa('/api/samakning', kropp);
      notis(samakning ? 'Ändrat' : 'Din bil är upplagd');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <Lada
      titel={samakning ? 'Ändra avresan' : 'Erbjud plats i bilen'}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={arbetar} onClick={spara}>
            {arbetar ? 'Sparar …' : 'Spara'}
          </button>
        </>
      }
    >
      {!samakning && (
        <Val
          etikett="Till vad"
          varde={f.evenemang_id}
          satt={satt('evenemang_id')}
          tomtext="Ingen särskild resa"
          poster={lista.map((e) => ({ varde: e.id, text: `${e.namn} (${langDatum(String(e.start).slice(0, 10))})` }))}
        />
      )}
      <Text etikett="Varifrån" varde={f.fran} satt={satt('fran')} krav placeholder="Härnösand, Coop Maxi" />
      <div className="faltrad">
        <Text etikett="Datum" typ="date" varde={f.datum} satt={satt('datum')} krav />
        <Text etikett="Tid" typ="time" varde={f.tid} satt={satt('tid')} krav />
        <Text etikett="Lediga platser" varde={f.platser} satt={satt('platser')} inputMode="numeric" krav />
      </div>
      <Text etikett="Bil" varde={f.bil} satt={satt('bil')} placeholder="Volvo V90, takbox" />
      <Falt etikett="Något att veta">
        <textarea
          rows={2}
          value={f.anteckning}
          onChange={(e) => satt('anteckning')(e.target.value)}
          placeholder="Plats för fyra par skidor i boxen. Fikapaus i Ånge."
        />
      </Falt>
      <div className="meddelande info">
        Ditt telefonnummer visas för dem som bokar plats i bilen, och deras för dig. Ingen annan
        ser numren.
      </div>
    </Lada>
  );
}
