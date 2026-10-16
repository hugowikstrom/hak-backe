// Idélådan: skriv eller prata in en idé. En människa läser och skickar
// den vidare till Backlog – ingenting går dit av sig själv.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Kort, Lada, Nyckeltal, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { far, tidpunkt } from '../nytta.js';

const KATEGORINAMN = {
  backen: 'Backen', fiket: 'Fiket', uthyrning: 'Uthyrningen',
  traning: 'Träningen', ekonomi: 'Ekonomi', ovrigt: 'Övrigt',
};
const STATUS = {
  ny: { namn: 'Ny', farg: 'gul' },
  granskad: { namn: 'Läst', farg: 'klubb' },
  skickad: { namn: 'I Backlog', farg: 'gron' },
  avfard: { namn: 'Avfärdad', farg: '' },
};

export function Ideer() {
  const jag = useJag();
  const notis = useNotis();
  const lista = useHamta(() => api.hamta('/api/ideer'));
  const [valt, sattValt] = useState(null);
  const far_skicka = far(jag, 'bemanning') || far(jag, 'medlemsregister');

  if (lista.laddar && !lista.data) return <Vanta />;
  const ideer = lista.data.ideer;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Idélådan</h1>
          <div className="undertext">
            Skriv eller prata in. Ingen idé är för liten – styrelsen läser och skickar vidare till Backlog.
          </div>
        </div>
      </div>

      <div className="tva">
        <NyIde
          kategorier={lista.data.kategorier}
          klar={(i) => {
            lista.uppdatera();
            notis(i.transkript ? 'Tack! Inspelningen är uppskriven.' : 'Tack för idén!');
          }}
        />

        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Nya" varde={ideer.filter((i) => i.status === 'ny').length} farg="gul" />
            <Nyckeltal etikett="Lästa" varde={ideer.filter((i) => i.status === 'granskad').length} />
            <Nyckeltal etikett="I Backlog" varde={ideer.filter((i) => i.status === 'skickad').length} farg="gron" />
          </div>
          <p className="liten svag" style={{ marginTop: 10, marginBottom: 0 }}>
            Inspelningen sparas som ljudfil och skrivs av ordagrant av husets egen tal-till-text. Både ljudet och
            den ordagranna texten finns kvar även om någon putsar texten efteråt.
          </p>
        </Kort>
      </div>

      <Kort titel="Inkomna idéer" undertext={`${ideer.length} stycken`} tat>
        <Tabell
          rader={ideer}
          maxhojd="55vh"
          tomtext="Ingen idé ännu. Var först."
          vidKlick={(i) => sattValt(i)}
          kolumner={[
            { falt: 'skapad', rubrik: 'När', visa: (i) => <span className="num">{tidpunkt(i.skapad)}</span> },
            {
              falt: 'rubrik', rubrik: 'Idé',
              visa: (i) => (
                <div className="kolumn" style={{ gap: 1 }}>
                  <strong>{i.rubrik || (i.text || i.transkript || '').slice(0, 60)}</strong>
                  <span className="liten svag">{(i.text || i.transkript || '').slice(0, 90)}</span>
                </div>
              ),
            },
            { falt: 'kategori', rubrik: 'Gäller', visa: (i) => KATEGORINAMN[i.kategori] || i.kategori },
            { falt: 'skapad_av', rubrik: 'Av' },
            { falt: 'ljudfil', rubrik: 'Ljud', visa: (i) => (i.ljudfil ? <Bricka>🎤</Bricka> : '') },
            { falt: 'status', rubrik: 'Status', visa: (i) => <Bricka farg={STATUS[i.status]?.farg}>{STATUS[i.status]?.namn}</Bricka> },
            { falt: 'backlog_ref', rubrik: 'Backlog', visa: (i) => (i.backlog_ref ? <span className="num">{i.backlog_ref}</span> : '–') },
          ]}
        />
      </Kort>

      {valt && (
        <IdeLada
          ide={valt}
          farSkicka={far_skicka}
          stang={() => sattValt(null)}
          uppdaterat={() => { lista.uppdatera(); sattValt(null); }}
        />
      )}
    </>
  );
}

function NyIde({ kategorier, klar }) {
  const notis = useNotis();
  const [text, sattText] = useState('');
  const [rubrik, sattRubrik] = useState('');
  const [kategori, sattKategori] = useState('ovrigt');
  const [spelar, sattSpelar] = useState(false);
  const [ljud, sattLjud] = useState(null);
  const [sekunder, sattSekunder] = useState(0);
  const [skickar, sattSkickar] = useState(false);
  const inspelare = useRef(null);
  const bitar = useRef([]);
  const klocka = useRef(null);

  useEffect(() => () => klocka.current && clearInterval(klocka.current), []);

  const startaInspelning = async () => {
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
      const spelare = new MediaRecorder(strom);
      bitar.current = [];
      spelare.ondataavailable = (e) => e.data.size && bitar.current.push(e.data);
      spelare.onstop = () => {
        const blob = new Blob(bitar.current, { type: spelare.mimeType || 'audio/webm' });
        const lasare = new FileReader();
        lasare.onload = () => sattLjud(lasare.result);
        lasare.readAsDataURL(blob);
        for (const spar of strom.getTracks()) spar.stop();
      };
      spelare.start();
      inspelare.current = spelare;
      sattSpelar(true);
      sattSekunder(0);
      klocka.current = setInterval(() => sattSekunder((s) => s + 1), 1000);
    } catch (e) {
      notis(`Mikrofonen gick inte att starta: ${e.message}`, 'fel');
    }
  };

  const stoppa = () => {
    inspelare.current?.stop();
    clearInterval(klocka.current);
    sattSpelar(false);
  };

  const skicka = async () => {
    sattSkickar(true);
    try {
      const i = await api.skapa('/api/ideer', {
        rubrik: rubrik || null,
        text: text || null,
        kategori,
        ljud,
        sekunder: ljud ? sekunder : null,
      });
      sattText('');
      sattRubrik('');
      sattLjud(null);
      sattSekunder(0);
      if (i.stt_fel) notis(`Ljudet sparades, men kunde inte skrivas av: ${i.stt_fel}`, 'fel');
      klar(i);
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSkickar(false);
    }
  };

  return (
    <Kort titel="Ny idé" undertext="Skriv, eller håll in och prata">
      <div className="faltrad">
        <Text etikett="Rubrik (frivillig)" varde={rubrik} satt={sattRubrik} placeholder="Vad handlar det om?" />
        <Val
          etikett="Gäller"
          varde={kategori}
          satt={sattKategori}
          tomtext={null}
          poster={kategorier.map((k) => ({ varde: k, text: KATEGORINAMN[k] || k }))}
        />
      </div>
      <label className="falt">
        <span>Idén</span>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => sattText(e.target.value)}
          placeholder="Skriv här, eller spela in och låt tal-till-text skriva av."
        />
      </label>

      <div className="rad hopp">
        {spelar ? (
          <button className="fara" onClick={stoppa}>
            ⏹ Stoppa ({sekunder} s)
          </button>
        ) : (
          <button onClick={startaInspelning}>🎤 Spela in</button>
        )}
        {ljud && !spelar && (
          <>
            <audio controls src={ljud} style={{ height: 32 }} />
            <button className="tom" onClick={() => sattLjud(null)}>Ta bort inspelningen</button>
          </>
        )}
        <span className="vaxa" />
        <button className="primar" disabled={skickar || (!text.trim() && !ljud)} onClick={skicka}>
          {skickar ? 'Skickar …' : 'Lämna in'}
        </button>
      </div>
    </Kort>
  );
}

function IdeLada({ ide, farSkicka, stang, uppdaterat }) {
  const notis = useNotis();
  const projekt = useHamta(() => api.hamta('/api/ideer/backlog/projekt'));
  const [f, sattF] = useState({
    rubrik: ide.rubrik || (ide.text || ide.transkript || '').slice(0, 80),
    text: ide.text || '',
    anteckning: ide.anteckning || '',
    projekt: ide.backlog_projekt || 'inbox',
  });
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));

  const spara = async (extra = {}) => {
    try {
      await api.spara(`/api/ideer/${ide.id}`, { rubrik: f.rubrik, text: f.text, anteckning: f.anteckning, ...extra });
      uppdaterat();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      bred
      titel={ide.rubrik || 'Idé'}
      stang={stang}
      fot={
        <>
          {ide.status !== 'skickad' && farSkicka && (
            <button className="fara" onClick={() => spara({ status: 'avfard' })}>Avfärda</button>
          )}
          <span className="vaxa" />
          <button onClick={() => spara({ status: 'granskad' })}>Spara</button>
          {ide.status !== 'skickad' && farSkicka && (
            <button
              className="primar"
              onClick={async () => {
                try {
                  const r = await api.skapa(`/api/ideer/${ide.id}/backlog`, { rubrik: f.rubrik, beskrivning: f.text, projekt: f.projekt });
                  notis(`Skickad till Backlog som ${r.backlog_ref}.`);
                  uppdaterat();
                } catch (e) {
                  notis(e.message, 'fel');
                }
              }}
            >
              Skicka till Backlog
            </button>
          )}
        </>
      }
    >
      <div className="rad hopp">
        <Bricka farg={STATUS[ide.status]?.farg}>{STATUS[ide.status]?.namn}</Bricka>
        <Bricka>{KATEGORINAMN[ide.kategori] || ide.kategori}</Bricka>
        <span className="liten svag">Inlämnad {tidpunkt(ide.skapad)} av {ide.skapad_av}</span>
        {ide.backlog_ref && <Bricka farg="gron">Backlog {ide.backlog_ref}</Bricka>}
      </div>

      {ide.ljudfil && (
        <div>
          <h4>Inspelning</h4>
          <audio controls src={`/api/ideer/${ide.id}/ljud`} style={{ width: '100%' }} />
        </div>
      )}

      {ide.transkript && (
        <div>
          <h4>Ordagrant uppskrivet</h4>
          <p className="brodtext" style={{ background: 'var(--yta-3)', padding: 10, borderRadius: 6 }}>{ide.transkript}</p>
          <p className="liten svagare">Den här texten ändras aldrig – den är inlämnarens egna ord.</p>
        </div>
      )}

      <Text etikett="Rubrik" varde={f.rubrik} satt={satt('rubrik')} />
      <label className="falt">
        <span>Idén, som den ska stå i Backlog</span>
        <textarea rows={5} value={f.text} onChange={(e) => satt('text')(e.target.value)} />
      </label>
      <label className="falt">
        <span>Styrelsens anteckning</span>
        <textarea rows={2} value={f.anteckning} onChange={(e) => satt('anteckning')(e.target.value)} />
      </label>
      {farSkicka && ide.status !== 'skickad' && (
        <Val
          etikett="Backlogprojekt"
          varde={f.projekt}
          satt={satt('projekt')}
          tomtext={null}
          poster={(projekt.data || [{ alias: 'inbox', name: 'Inkorg' }]).map((p) => ({
            varde: p.alias || p,
            text: `${p.alias || p}${p.name ? ` – ${p.name}` : ''}`,
          }))}
        />
      )}
    </Lada>
  );
}
