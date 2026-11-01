// Utlägg: fota kvittot, och se var ärendet ligger.
//
// Sidan har två ansikten. Medlemmen ser sina egna utlägg och en knapp som
// är stor för att det är den enda åtgärden som betyder något. Kassören ser
// kön, och ser den sorterad så att det som väntar ligger överst – inte
// nyast först, för då ligger alltid det senaste inlämnade i vägen för det
// som faktiskt skulle betalats i förrgår.
import { useRef, useState } from 'react';
import { api, krympBild } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Falt, Flikar, Kort, Lada, Nyckeltal, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { far, idag, langDatum } from '../nytta.js';

const KATEGORI = {
  backen: 'Backen', fiket: 'Fiket', traning: 'Träning', tavling: 'Tävling',
  kontor: 'Kontor', resa: 'Resa', ovrigt: 'Övrigt',
};
const STATUS = {
  ny: { namn: 'Väntar på granskning', farg: 'varning' },
  godkand: { namn: 'Godkänt, väntar på utbetalning', farg: '' },
  utbetald: { namn: 'Utbetalt', farg: 'ok' },
  avslagen: { namn: 'Avslaget', farg: 'fara' },
};
const UTBETALNING = { bank: 'Till bankkontot', planbok: 'Till min plånbok' };

const ore = (text) => Math.round(Number(String(text).replace(',', '.')) * 100);
/** Öre som en siffra att skriva i ett fält: 9780 blir "97,80", 48900 blir "489". */
const falt = (ore) => (ore == null ? '' : String(ore % 100 === 0 ? ore / 100 : (ore / 100).toFixed(2)).replace('.', ','));
const kr = (ore) => `${(ore / 100).toLocaleString('sv-SE', { minimumFractionDigits: ore % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} kr`;

export function Utlagg() {
  const jag = useJag();
  const granskar = far(jag, 'ekonomi_las');
  const [flik, sattFlik] = useState(granskar ? 'kon' : 'mina');
  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Utlägg</h1>
          <div className="undertext">
            Har du handlat åt klubben? Fota kvittot – resten sköter kassören.
          </div>
        </div>
      </div>
      {granskar ? (
        <>
          <Flikar
            flikar={[
              { nyckel: 'kon', text: 'Att hantera' },
              { nyckel: 'mina', text: 'Mina utlägg' },
            ]}
            aktiv={flik}
            satt={sattFlik}
          />
          {flik === 'kon' ? <Kon /> : <Mina />}
        </>
      ) : (
        <Mina />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Medlemmens sida
// ---------------------------------------------------------------------------

function Mina() {
  const { data, laddar, uppdatera } = useHamta(() => api.hamta('/api/utlagg/mina'));
  const [nytt, sattNytt] = useState(false);
  const [redigera, sattRedigera] = useState(null);

  if (laddar && !data) return <Vanta />;
  const rader = data.utlagg;
  const summa = (status) => rader.filter((u) => u.status === status).reduce((a, u) => a + u.belopp_ore, 0);

  return (
    <>
      <div className="rad gap-16 hopp">
        <Nyckeltal etikett="Väntar på granskning" varde={kr(summa('ny'))} />
        <Nyckeltal etikett="Godkänt, ej utbetalt" varde={kr(summa('godkand'))} farg={summa('godkand') ? 'ok' : undefined} />
        <Nyckeltal etikett="Utbetalt i år" varde={kr(summa('utbetald'))} />
      </div>

      <Kort
        titel="Mina utlägg"
        undertext={rader.length ? `${rader.length} totalt` : null}
        verktyg={<button className="primar" onClick={() => sattNytt(true)}>Nytt utlägg</button>}
        tat
      >
        {rader.length === 0 ? (
          <Tomt>
            Inga utlägg ännu. Har du köpt något åt klubben? Fota kvittot medan du står kvar
            i butiken – det tar tio sekunder och då är det gjort.
          </Tomt>
        ) : (
          <Tabell
            rader={rader}
            tomtext="Inga utlägg."
            vidKlick={(u) => u.status === 'ny' && sattRedigera(u)}
            kolumner={[
              { falt: 'datum', rubrik: 'Inköpsdatum', visa: (u) => <span className="num">{langDatum(u.datum)}</span> },
              { falt: 'syfte', rubrik: 'Vad', visa: (u) => <strong>{u.syfte}</strong> },
              { falt: 'kategori', rubrik: 'Hör till', visa: (u) => KATEGORI[u.kategori] },
              { falt: 'belopp_ore', rubrik: 'Belopp', sifra: true, visa: (u) => <span className="num">{u.belopp}</span> },
              {
                falt: 'kvitto', rubrik: 'Kvitto',
                visa: (u) =>
                  u.kvitto ? (
                    <a href={`/api/bilder/${u.kvitto}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      Visa
                    </a>
                  ) : (
                    <span className="svag">–</span>
                  ),
              },
              {
                falt: 'status', rubrik: 'Läge',
                visa: (u) => (
                  <>
                    <Bricka farg={STATUS[u.status].farg}>{STATUS[u.status].namn}</Bricka>
                    {u.status === 'avslagen' && u.avslagsskal && (
                      <div className="liten svag" style={{ marginTop: 2 }}>{u.avslagsskal}</div>
                    )}
                    {u.status === 'utbetald' && (
                      <div className="liten svag" style={{ marginTop: 2 }}>{UTBETALNING[u.utbetalning]}</div>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
      </Kort>

      {(nytt || redigera) && (
        <Blankett
          utlagg={redigera}
          kategorier={data.kategorier}
          stang={() => (sattNytt(false), sattRedigera(null))}
          klar={() => (sattNytt(false), sattRedigera(null), uppdatera())}
        />
      )}
    </>
  );
}

/**
 * Formuläret. Kvittot först, för det är det man har i handen – och på en
 * telefon öppnar `capture` kameran direkt i stället för filväljaren.
 * Momsen är frivillig: en förening utan momsregistrering ska inte behöva
 * fylla i ett fält som inte angår den.
 */
function Blankett({ utlagg, kategorier, stang, klar }) {
  const notis = useNotis();
  const filref = useRef(null);
  const [f, sattF] = useState({
    datum: utlagg?.datum || idag(),
    belopp: falt(utlagg?.belopp_ore),
    moms: falt(utlagg?.moms_ore),
    syfte: utlagg?.syfte || '',
    kategori: utlagg?.kategori || 'backen',
    utbetalning: utlagg?.utbetalning || 'bank',
    anteckning: utlagg?.anteckning || '',
  });
  const [bild, sattBild] = useState(utlagg?.kvitto ? `/api/bilder/${utlagg.kvitto}` : null);
  const [bilddata, sattBilddata] = useState(null);
  const [arbetar, sattArbetar] = useState(false);
  const satt = (nyckel) => (v) => sattF((p) => ({ ...p, [nyckel]: v }));

  const taBild = async (e) => {
    const fil = e.target.files?.[0];
    if (!fil) return;
    sattArbetar(true);
    try {
      const data = await krympBild(fil);
      sattBilddata(data);
      sattBild(data);
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattArbetar(false);
      e.target.value = '';
    }
  };

  const spara = async () => {
    const belopp_ore = ore(f.belopp);
    if (!Number.isFinite(belopp_ore) || belopp_ore <= 0) return notis('Fyll i vad du lagt ut', 'fel');
    if (!f.syfte.trim()) return notis('Skriv kort vad det gäller', 'fel');
    const kropp = {
      datum: f.datum,
      belopp_ore,
      moms_ore: f.moms ? ore(f.moms) : 0,
      syfte: f.syfte.trim(),
      kategori: f.kategori,
      utbetalning: f.utbetalning,
      anteckning: f.anteckning.trim() || null,
      ...(bilddata ? { kvitto_data: bilddata } : {}),
    };
    sattArbetar(true);
    try {
      if (utlagg) await api.spara(`/api/utlagg/${utlagg.id}`, kropp);
      else await api.skapa('/api/utlagg', kropp);
      notis(utlagg ? 'Utlägget ändrat' : 'Utlägget är inlämnat – kassören ser det nu');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  const taBort = async () => {
    try {
      await api.tabort(`/api/utlagg/${utlagg.id}`);
      notis('Utlägget är borttaget');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      titel={utlagg ? 'Ändra utlägg' : 'Nytt utlägg'}
      stang={stang}
      fot={
        <>
          {utlagg && <button className="fara tom" onClick={taBort}>Ta bort</button>}
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={arbetar} onClick={spara}>
            {arbetar ? 'Arbetar …' : utlagg ? 'Spara' : 'Lämna in'}
          </button>
        </>
      }
    >
      <div className="kvittoruta">
        {bild ? (
          <>
            <img src={bild} alt="Kvittot" />
            <button className="tom liten" onClick={() => (sattBild(null), sattBilddata(null))}>
              Ta bort bilden
            </button>
          </>
        ) : (
          <label className="kvittoknapp">
            <span className="stor">📷</span>
            <span>{arbetar ? 'Bearbetar bilden …' : 'Fota eller välj kvittot'}</span>
            <span className="liten svag">Behövs för att kassören ska kunna bokföra det</span>
            <input
              ref={filref}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={taBild}
              style={{ display: 'none' }}
            />
          </label>
        )}
      </div>

      <div className="faltrad">
        <Text etikett="Inköpsdatum" typ="date" varde={f.datum} satt={satt('datum')} krav />
        <Text etikett="Belopp" varde={f.belopp} satt={satt('belopp')} krav inputMode="decimal" placeholder="489,00" />
        <Text etikett="Varav moms" varde={f.moms} satt={satt('moms')} inputMode="decimal" placeholder="frivilligt" />
      </div>
      <Text
        etikett="Vad gäller det"
        varde={f.syfte}
        satt={satt('syfte')}
        krav
        placeholder="Slangklämmor och packningar till lans 4"
      />
      <div className="faltrad">
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
          poster={Object.entries(UTBETALNING).map(([varde, text]) => ({ varde, text }))}
        />
      </div>
      <Falt etikett="Något kassören behöver veta">
        <textarea rows={2} value={f.anteckning} onChange={(e) => satt('anteckning')(e.target.value)} />
      </Falt>
    </Lada>
  );
}

// ---------------------------------------------------------------------------
// Kassörens kö
// ---------------------------------------------------------------------------

function Kon() {
  const jag = useJag();
  const notis = useNotis();
  const [status, sattStatus] = useState('');
  const { data, laddar, uppdatera } = useHamta(
    () => api.hamta(`/api/utlagg${status ? `?status=${status}` : ''}`),
    [status]
  );
  const [valt, sattValt] = useState(null);
  const far_bokfora = far(jag, 'ekonomi');

  if (laddar && !data) return <Vanta />;

  const atgard = async (u, stig, kropp) => {
    try {
      await api.skapa(`/api/utlagg/${u.id}/${stig}`, kropp);
      uppdatera();
      sattValt(null);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <>
      <div className="rad gap-16 hopp">
        <Nyckeltal etikett="Väntar på granskning" varde={data.lage.nya} farg={data.lage.nya ? 'varning' : undefined} />
        <Nyckeltal etikett="Att betala ut" varde={data.lage.att_betala} />
      </div>

      <Kort
        titel="Utläggskön"
        undertext="Det som väntar ligger överst"
        verktyg={
          <Val
            etikett=""
            varde={status}
            satt={sattStatus}
            tomtext="Alla lägen"
            poster={Object.entries(STATUS).map(([varde, s]) => ({ varde, text: s.namn }))}
          />
        }
        tat
      >
        <Tabell
          rader={data.utlagg}
          maxhojd="62vh"
          tomtext="Inget i kön."
          vidKlick={(u) => sattValt(u)}
          kolumner={[
            { falt: 'datum', rubrik: 'Datum', visa: (u) => <span className="num">{langDatum(u.datum)}</span> },
            { falt: 'medlem', rubrik: 'Vem', visa: (u) => <strong>{u.medlem}</strong> },
            { falt: 'syfte', rubrik: 'Vad' },
            { falt: 'kategori', rubrik: 'Konto', visa: (u) => <span className="num">{u.kostnadskonto}</span> },
            { falt: 'belopp_ore', rubrik: 'Belopp', sifra: true, visa: (u) => <span className="num">{u.belopp}</span> },
            { falt: 'moms_ore', rubrik: 'Moms', sifra: true, visa: (u) => <span className="num svag">{u.moms || '–'}</span> },
            {
              falt: 'kvitto', rubrik: 'Kvitto',
              visa: (u) =>
                u.kvitto ? (
                  <a href={`/api/bilder/${u.kvitto}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Visa</a>
                ) : (
                  <Bricka farg="varning">Saknas</Bricka>
                ),
            },
            { falt: 'status', rubrik: 'Läge', visa: (u) => <Bricka farg={STATUS[u.status].farg}>{STATUS[u.status].namn}</Bricka> },
          ]}
        />
      </Kort>

      {valt && (
        <Granska
          utlagg={valt}
          kategorier={data.kategorier}
          far_bokfora={far_bokfora}
          stang={() => sattValt(null)}
          atgard={atgard}
        />
      )}
    </>
  );
}

function Granska({ utlagg, kategorier, far_bokfora, stang, atgard }) {
  const notis = useNotis();
  const [kategori, sattKategori] = useState(utlagg.kategori);
  const [moms, sattMoms] = useState(falt(utlagg.moms_ore));
  const [skal, sattSkal] = useState('');
  const [utbetalning, sattUtbetalning] = useState(utlagg.utbetalning);

  const ny = utlagg.status === 'ny';
  const godkand = utlagg.status === 'godkand';

  return (
    <Lada
      titel={`${utlagg.medlem}: ${utlagg.syfte}`}
      stang={stang}
      bred
      fot={
        <>
          <button onClick={stang}>Stäng</button>
          {ny && far_bokfora && (
            <>
              <button
                className="fara tom"
                onClick={() => (skal.trim() ? atgard(utlagg, 'avsla', { skal: skal.trim() }) : notis('Skriv ett skäl för avslaget', 'fel'))}
              >
                Avslå
              </button>
              <button
                className="primar"
                onClick={() => atgard(utlagg, 'godkann', { kategori, moms_ore: moms ? ore(moms) : 0 })}
              >
                Godkänn och bokför
              </button>
            </>
          )}
          {godkand && far_bokfora && (
            <button className="primar" onClick={() => atgard(utlagg, 'betala', { utbetalning })}>
              Betala ut {utlagg.belopp}
            </button>
          )}
        </>
      }
    >
      <div className="granskning">
        <div className="granskning-kvitto">
          {utlagg.kvitto ? (
            <a href={`/api/bilder/${utlagg.kvitto}`} target="_blank" rel="noreferrer">
              <img src={`/api/bilder/${utlagg.kvitto}`} alt="Kvittot" />
            </a>
          ) : (
            <Tomt>Inget kvitto bifogat. Fråga efter ett innan du bokför.</Tomt>
          )}
        </div>
        <div className="granskning-falt">
          <dl className="uppgifter">
            <dt>Belopp</dt><dd className="num">{utlagg.belopp}</dd>
            <dt>Inköpsdatum</dt><dd className="num">{langDatum(utlagg.datum)}</dd>
            <dt>Inlämnat</dt><dd className="num">{utlagg.skapad?.slice(0, 16)}</dd>
            <dt>Läge</dt><dd><Bricka farg={STATUS[utlagg.status].farg}>{STATUS[utlagg.status].namn}</Bricka></dd>
            {utlagg.granskad_av && (<><dt>Granskat av</dt><dd>{utlagg.granskad_av}</dd></>)}
            {utlagg.verifikation && (
              <>
                <dt>Verifikation</dt>
                <dd className="num">{utlagg.verifikation.serie}{utlagg.verifikation.nummer}</dd>
              </>
            )}
          </dl>
          {utlagg.anteckning && <div className="meddelande info">{utlagg.anteckning}</div>}

          {ny && far_bokfora && (
            <>
              <div className="faltrad">
                <Val
                  etikett="Kostnadskonto"
                  varde={kategori}
                  satt={sattKategori}
                  tomtext={null}
                  poster={kategorier.map((k) => ({ varde: k, text: KATEGORI[k] || k }))}
                />
                <Text etikett="Varav moms" varde={moms} satt={sattMoms} inputMode="decimal" />
              </div>
              <Text etikett="Skäl, om du avslår" varde={skal} satt={sattSkal} placeholder="Ersätts med milersättning i stället" />
              <div className="meddelande info">
                Godkännandet bokför kostnaden och en skuld till {utlagg.medlem}. Pengarna rör sig
                först när du betalar ut.
              </div>
            </>
          )}

          {godkand && far_bokfora && (
            <>
              <Val
                etikett="Betala ut"
                varde={utbetalning}
                satt={sattUtbetalning}
                tomtext={null}
                poster={[
                  { varde: 'bank', text: 'Till bankkontot' },
                  { varde: 'planbok', text: `Till ${utlagg.medlem}s plånbok` },
                ]}
              />
              <div className="meddelande info">
                {utbetalning === 'planbok'
                  ? 'Pengarna hamnar direkt i plånboken och kan användas i fiket.'
                  : 'Gör själva överföringen i banken – den här knappen bokför den.'}
              </div>
            </>
          )}

          {!far_bokfora && <div className="meddelande info">Du kan läsa utläggen men inte bokföra dem.</div>}
        </div>
      </div>
    </Lada>
  );
}
