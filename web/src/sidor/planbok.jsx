// Plånboken: medlemmens förskott, och det som används i fiket.
//
// Två vyer i en sida. Varje medlem ser sin egen – saldot stort, historiken
// under, och vad man kan använda den till. Den som står i kassan eller för
// böckerna ser dessutom klubbens samtliga plånböcker, kan fylla på och
// betala tillbaka.
//
// Att saldot är en *skuld* för klubben och inte en intäkt är inte en
// detalj: pengarna är medlemmens ända till det att något köps. Därför
// bokförs varje påfyllning mot konto 2420 och varje köp drar ifrån det.
import { useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Nyckeltal, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { far } from '../nytta.js';

const SLAG = {
  insattning: { namn: 'Påfyllning', farg: 'ok' },
  kop: { namn: 'Köp', farg: '' },
  aterbetalning: { namn: 'Återbetalning', farg: 'varning' },
  justering: { namn: 'Justering', farg: 'svag' },
};
const kr = (ore) => `${(ore / 100).toLocaleString('sv-SE')} kr`;

export function Planbok() {
  const jag = useJag();
  const kassan = far(jag, 'kassa') || far(jag, 'ekonomi_las');
  const [flik, sattFlik] = useState('min');

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Plånbok</h1>
          <div className="undertext">
            Förskott som används i fiket, i uthyrningen och till avgifter inom klubben.
          </div>
        </div>
      </div>
      {kassan ? (
        <>
          <Flikar
            flikar={[
              { nyckel: 'min', text: 'Min plånbok' },
              { nyckel: 'klubben', text: 'Klubbens plånböcker' },
            ]}
            aktiv={flik}
            satt={sattFlik}
          />
          {flik === 'min' ? <Min /> : <Klubben jag={jag} />}
        </>
      ) : (
        <Min />
      )}
    </>
  );
}

function Min() {
  const { data, laddar } = useHamta(() => api.hamta('/api/planbok/min'));
  if (laddar && !data) return <Vanta />;

  return (
    <>
      <Kort titel="Ditt saldo">
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Kvar i plånboken" varde={data.saldo} farg={data.saldo_ore > 0 ? 'ok' : undefined} />
          {data.rabatt_procent > 0 && (
            <Nyckeltal etikett="Medlemsrabatt i fiket" varde={`${data.rabatt_procent} %`} />
          )}
        </div>
        <p className="liten svag" style={{ marginBottom: 0 }}>
          Säg till i luckan när du vill fylla på. Pengarna är dina ända till du handlar för dem –
          vill du ha dem tillbaka betalar kassören ut dem mot kvitto.
        </p>
      </Kort>

      <Kort titel="Vad som hänt" tat>
        <Historik rader={data.historik} />
      </Kort>
    </>
  );
}

function Historik({ rader }) {
  return (
    <Tabell
      rader={rader}
      maxhojd="56vh"
      tomtext="Inget har hänt i plånboken ännu."
      kolumner={[
        { falt: 'skapad', rubrik: 'När', visa: (t) => <span className="num">{String(t.skapad).slice(0, 16)}</span> },
        {
          falt: 'slag', rubrik: 'Vad',
          visa: (t) => <Bricka farg={SLAG[t.slag]?.farg}>{SLAG[t.slag]?.namn || t.slag}</Bricka>,
        },
        { falt: 'beskrivning', rubrik: 'Beskrivning' },
        {
          falt: 'belopp_ore', rubrik: 'Belopp', sifra: true,
          visa: (t) => (
            <span className="num" style={{ color: t.belopp_ore < 0 ? undefined : 'var(--ok)' }}>
              {t.belopp_ore > 0 ? '+' : ''}{kr(t.belopp_ore)}
            </span>
          ),
        },
        { falt: 'saldo_efter_ore', rubrik: 'Saldo', sifra: true, visa: (t) => <span className="num svag">{kr(t.saldo_efter_ore)}</span> },
        { falt: 'av', rubrik: 'Av', visa: (t) => <span className="svag">{t.av}</span> },
      ]}
    />
  );
}

function Klubben({ jag }) {
  const notis = useNotis();
  const { data, laddar, uppdatera } = useHamta(() => api.hamta('/api/planbok'));
  const [valt, sattValt] = useState(null);
  const [sok, sattSok] = useState('');

  if (laddar && !data) return <Vanta />;

  const rader = data.saldon.filter(
    (s) => !sok || s.namn.toLowerCase().includes(sok.toLowerCase()) || String(s.medlemsnummer || '').includes(sok)
  );

  return (
    <>
      <div className="rad gap-16 hopp">
        <Nyckeltal etikett="Klubbens skuld till medlemmarna" varde={data.totalt} />
        <Nyckeltal etikett="Plånböcker med pengar i" varde={data.saldon.filter((s) => s.saldo_ore > 0).length} />
        <Nyckeltal etikett="Medlemsrabatt" varde={`${data.rabatt_procent} %`} />
      </div>

      <Kort
        titel="Plånböcker"
        undertext="Klicka på en rad för att fylla på eller betala tillbaka"
        verktyg={<Text etikett="" varde={sok} satt={sattSok} placeholder="Sök namn eller nummer" />}
        tat
      >
        <Tabell
          rader={rader}
          maxhojd="60vh"
          tomtext="Ingen plånbok matchar."
          vidKlick={(s) => sattValt(s)}
          kolumner={[
            { falt: 'medlemsnummer', rubrik: 'Nr', visa: (s) => <span className="num svag">{s.medlemsnummer || '–'}</span> },
            { falt: 'namn', rubrik: 'Medlem', visa: (s) => <strong>{s.namn}</strong> },
            { falt: 'saldo_ore', rubrik: 'Saldo', sifra: true, visa: (s) => <span className="num">{kr(s.saldo_ore)}</span> },
            { falt: 'senast', rubrik: 'Senast', visa: (s) => <span className="num svag">{String(s.senast || '').slice(0, 10) || '–'}</span> },
          ]}
        />
      </Kort>

      {valt && (
        <Hantera
          medlem={valt}
          far_aterbetala={far(jag, 'ekonomi')}
          stang={() => sattValt(null)}
          klar={() => (sattValt(null), uppdatera())}
          notis={notis}
        />
      )}
    </>
  );
}

/**
 * Påfyllning och återbetalning för en medlem. Återbetalning kräver
 * ekonomibehörighet – att ta emot pengar i luckan är inte samma sak som
 * att betala ut dem ur klubbens kassa.
 */
function Hantera({ medlem, far_aterbetala, stang, klar, notis }) {
  const { data, laddar, uppdatera } = useHamta(() => api.hamta(`/api/planbok/medlem/${medlem.id}`), [medlem.id]);
  const [belopp, sattBelopp] = useState('');
  const [betalmedel, sattBetalmedel] = useState('swish');
  const [arbetar, sattArbetar] = useState(false);
  const id = medlem.id;

  const gor = async (stig, meddelande) => {
    const ore = Math.round(Number(String(belopp).replace(',', '.')) * 100);
    if (!Number.isFinite(ore) || ore <= 0) return notis('Fyll i ett belopp', 'fel');
    sattArbetar(true);
    try {
      await api.skapa(`/api/planbok/${stig}`, { medlem_id: id, belopp_ore: ore, betalmedel });
      notis(meddelande);
      sattBelopp('');
      uppdatera();
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <Kort
      titel={medlem.namn}
      undertext={laddar ? 'Hämtar …' : `Saldo ${data?.saldo}`}
      verktyg={<button className="tom" onClick={stang}>Stäng</button>}
    >
      <div className="rad gap-8">
        <Text etikett="Belopp, kr" varde={belopp} satt={sattBelopp} inputMode="decimal" placeholder="500" />
        <Val
          etikett="Betalmedel"
          varde={betalmedel}
          satt={sattBetalmedel}
          tomtext={null}
          poster={[
            { varde: 'swish', text: 'Swish' },
            { varde: 'kort', text: 'Kort' },
            { varde: 'kontant', text: 'Kontant' },
          ]}
        />
        <button className="primar" disabled={arbetar} onClick={() => gor('insattning', 'Plånboken är påfylld')}>
          Fyll på
        </button>
        {far_aterbetala && (
          <button
            disabled={arbetar}
            onClick={() => gor('aterbetalning', 'Återbetalningen är bokförd')}
            title="Betalar tillbaka ur plånboken och bokför det"
          >
            Betala tillbaka
          </button>
        )}
      </div>
      {!far_aterbetala && (
        <div className="meddelande info">
          Du kan fylla på i luckan. Att betala tillbaka pengar ur plånboken gör kassören.
        </div>
      )}
      {data && (data.historik.length ? <Historik rader={data.historik} /> : <Tomt>Ingen historik.</Tomt>)}
    </Kort>
  );
}
