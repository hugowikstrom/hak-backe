// Utlägg i telefonen.
//
// Det här är platsen utlägget faktiskt uppstår: man står på parkeringen
// utanför Jula med ett kvitto i handen. Därför är knappen "Fota kvittot"
// det första man ser, kameran öppnas direkt, och ingenting annat är
// obligatoriskt utom belopp och vad det gäller.
import { useState } from 'react';
import { api, krympBild } from '../api.js';
import { useRuta } from '../app.jsx';
import { Ark, Bricka, Omrade, Post, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar.jsx';

const KATEGORI = {
  backen: 'Backen', fiket: 'Fiket', traning: 'Träning', tavling: 'Tävling',
  kontor: 'Kontor', resa: 'Resa', ovrigt: 'Övrigt',
};
const STATUS = {
  ny: { namn: 'Väntar på granskning', farg: 'varning' },
  godkand: { namn: 'Godkänt', farg: 'info' },
  utbetald: { namn: 'Utbetalt', farg: 'ok' },
  avslagen: { namn: 'Avslaget', farg: 'fara' },
};
const idag = () => new Date().toLocaleDateString('sv-SE');
const ore = (text) => Math.round(Number(String(text).replace(',', '.')) * 100);

export function Utlagg() {
  const { tillbaka } = useRuta();
  const d = useHamta(() => api.hamta('/api/utlagg/mina'));
  const [nytt, sattNytt] = useState(false);

  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;

  const vantar = d.data.utlagg.filter((u) => u.status === 'ny' || u.status === 'godkand');

  return (
    <>
      <section className="huvudsak lugn">
        <span className="etikett">Utlägg</span>
        <h1>Har du lagt ut pengar?</h1>
        <p className="under">
          {vantar.length
            ? `${vantar.length} väntar på kassören.`
            : 'Fota kvittot medan du står kvar i butiken – då är det gjort.'}
        </p>
      </section>

      <button className="stor primar" onClick={() => sattNytt(true)}>📷  Lämna in ett utlägg</button>

      <section className="kort">
        <header>
          <h2>Mina utlägg</h2>
        </header>
        {d.data.utlagg.length === 0 ? (
          <Tomt>Inget inlämnat ännu.</Tomt>
        ) : (
          <div className="lista">
            {d.data.utlagg.map((u) => (
              <Post
                key={u.id}
                figur={u.kvitto ? '🧾' : '–'}
                figurfarg={['varning', 'fara'].includes(STATUS[u.status].farg) ? STATUS[u.status].farg : ''}
                titel={u.syfte}
                under={`${u.datum} · ${KATEGORI[u.kategori]} · ${u.belopp}`}
                hoger={<Bricka farg={STATUS[u.status].farg}>{STATUS[u.status].namn}</Bricka>}
              />
            ))}
          </div>
        )}
      </section>

      {d.data.utlagg.some((u) => u.status === 'avslagen') && (
        <section className="kort tyst">
          <header>
            <h2>Avslag</h2>
          </header>
          {d.data.utlagg
            .filter((u) => u.status === 'avslagen')
            .map((u) => (
              <p key={u.id} className="liten svag" style={{ margin: '4px 0' }}>
                <strong>{u.syfte}:</strong> {u.avslagsskal}
              </p>
            ))}
        </section>
      )}

      <button className="tom" onClick={tillbaka}>Tillbaka</button>

      {nytt && <Blankett kategorier={d.data.kategorier} stang={() => sattNytt(false)} klar={() => (sattNytt(false), d.uppdatera())} />}
    </>
  );
}

function Blankett({ kategorier, stang, klar }) {
  const notis = useNotis();
  const [bild, sattBild] = useState(null);
  const [f, sattF] = useState({
    datum: idag(), belopp: '', moms: '', syfte: '', kategori: 'backen', utbetalning: 'bank', anteckning: '',
  });
  const [arbetar, sattArbetar] = useState(false);
  const satt = (n) => (v) => sattF((p) => ({ ...p, [n]: v }));

  const taBild = async (e) => {
    const fil = e.target.files?.[0];
    if (!fil) return;
    sattArbetar(true);
    try {
      sattBild(await krympBild(fil, 1600, 0.72));
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattArbetar(false);
      e.target.value = '';
    }
  };

  const skicka = async () => {
    const belopp_ore = ore(f.belopp);
    if (!Number.isFinite(belopp_ore) || belopp_ore <= 0) return notis('Fyll i vad du lagt ut', 'fel');
    if (!f.syfte.trim()) return notis('Skriv kort vad det gäller', 'fel');
    sattArbetar(true);
    try {
      await api.skapa('/api/utlagg', {
        datum: f.datum,
        belopp_ore,
        moms_ore: f.moms ? ore(f.moms) : 0,
        syfte: f.syfte.trim(),
        kategori: f.kategori,
        utbetalning: f.utbetalning,
        anteckning: f.anteckning.trim() || null,
        ...(bild ? { kvitto_data: bild } : {}),
      });
      notis('Inlämnat – kassören ser det nu', 'ok');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <Ark
      titel="Nytt utlägg"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={arbetar} onClick={skicka}>
            {arbetar ? 'Arbetar …' : 'Lämna in'}
          </button>
        </>
      }
    >
      {bild ? (
        <>
          <img className="bildruta" src={bild} alt="Kvittot" />
          <button onClick={() => sattBild(null)}>Ta om bilden</button>
        </>
      ) : (
        <label className="knapp full" style={{ minHeight: 56 }}>
          {arbetar ? 'Bearbetar bilden …' : '📷  Fota kvittot'}
          <input type="file" accept="image/*" capture="environment" onChange={taBild} style={{ display: 'none' }} />
        </label>
      )}

      <Text etikett="Belopp, kr" varde={f.belopp} satt={satt('belopp')} inputMode="decimal" placeholder="489,00" autoFocus />
      <Text etikett="Vad gäller det" varde={f.syfte} satt={satt('syfte')} placeholder="Slangklämmor till lans 4" />
      <Val
        etikett="Hör till"
        varde={f.kategori}
        satt={satt('kategori')}
        tomtext={null}
        poster={kategorier.map((k) => ({ varde: k, text: KATEGORI[k] || k }))}
      />
      <Val
        etikett="Betala ut"
        varde={f.utbetalning}
        satt={satt('utbetalning')}
        tomtext={null}
        poster={[
          { varde: 'bank', text: 'Till mitt bankkonto' },
          { varde: 'planbok', text: 'Till min plånbok' },
        ]}
      />
      <Text etikett="Inköpsdatum" type="date" varde={f.datum} satt={satt('datum')} />
      <Text etikett="Varav moms (frivilligt)" varde={f.moms} satt={satt('moms')} inputMode="decimal" />
      <Omrade etikett="Något kassören behöver veta" varde={f.anteckning} satt={satt('anteckning')} rows={2} />
    </Ark>
  );
}
