// Driftjournalen: vad som hänt i anläggningen, och vad som återkommer.
//
// Tre flikar för tre frågor Jonas faktiskt ställer: vad hände, vad väntar på
// att bekräftas, och vad går sönder om och om igen.
import { useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Falt, Flikar, Kort, Lada, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { far, tidpunkt } from '../nytta.js';

const kronor = (ore) => `${((ore || 0) / 100).toLocaleString('sv-SE')} kr`;

const SLAGNAMN = {
  observation: { namn: 'Observation', farg: '' },
  atgard: { namn: 'Åtgärd', farg: 'ok' },
  rond: { namn: 'Rond', farg: 'info' },
  matning: { namn: 'Mätning', farg: 'info' },
  incident: { namn: 'Incident', farg: 'fara' },
  larm: { namn: 'Larm', farg: 'varning' },
};

const idag = () => new Date().toLocaleDateString('sv-SE');
const dagarBak = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE');
};

export function Journal() {
  const jag = useJag();
  const [flik, sattFlik] = useState('journal');
  const [fran, sattFran] = useState(dagarBak(14));
  const [till, sattTill] = useState(idag());
  const [slag, sattSlag] = useState('');

  const lista = useHamta(
    () => api.hamta(`/api/drift/journal?fran=${fran}&till=${till}${slag ? `&slag=${slag}` : ''}`),
    [fran, till, slag]
  );
  const utkast = useHamta(() => api.hamta('/api/drift/journal?utkast=ja'), [flik]);

  if (lista.laddar && !lista.data) return <Vanta />;

  const poster = (lista.data?.poster || []).filter((p) => !p.utkast);
  const obekraftade = utkast.data?.poster || [];
  const ai = lista.data?.ai;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Driftjournal</h1>
          <div className="undertext">
            Ronder, mätningar, fel och incidenter i en följd.
            {ai?.tal ? ' Personalen kan prata in rapporter i mobilappen.' : ''}
          </div>
        </div>
        <div className="sidhuvud-verktyg">
          {ai && (
            <Bricka farg={ai.pa ? 'ok' : ''}>
              {ai.pa ? `AI-tolkning: ${ai.modell}` : 'AI-tolkning avstängd'}
            </Bricka>
          )}
        </div>
      </div>

      <Flikar
        aktiv={flik}
        satt={sattFlik}
        flikar={[
          { nyckel: 'journal', text: 'Journalen' },
          {
            nyckel: 'utkast',
            text: obekraftade.length ? `Att bekräfta (${obekraftade.length})` : 'Att bekräfta',
          },
          ...(far(jag, 'anlaggning') ? [{ nyckel: 'monster', text: 'Återkommande fel' }] : []),
        ]}
      />

      {flik === 'journal' && (
        <>
          <Kort titel="Visa" tat>
            <div className="rad" style={{ alignItems: 'flex-end' }}>
              <Text etikett="Från" typ="date" varde={fran} satt={sattFran} />
              <Text etikett="Till" typ="date" varde={till} satt={sattTill} />
              <Val
                etikett="Slag"
                varde={slag}
                satt={sattSlag}
                tomtext="alla"
                poster={Object.entries(SLAGNAMN).map(([v, s]) => ({ varde: v, text: s.namn }))}
              />
            </div>
          </Kort>

          {poster.length === 0 ? (
            <Tomt>Inget journalfört i perioden.</Tomt>
          ) : (
            <div className="tidslinje">
              {poster.map((p) => (
                <article key={p.id} className="journalpost">
                  <div className="journalpost-topp">
                    <Bricka farg={SLAGNAMN[p.slag]?.farg || ''}>{SLAGNAMN[p.slag]?.namn || p.slag}</Bricka>
                    <span className="tid">{tidpunkt(p.tid)}</span>
                    <span className="vem">{p.av || 'okänd'}</span>
                    {p.ljudfil && <Bricka>inspelad</Bricka>}
                  </div>
                  <p className="journaltext">{p.text || p.transkript}</p>
                  <div className="journalpost-fot liten svag">
                    {p.plats && <span>{p.plats} <span className="svag">position</span></span>}
                    {p.utrustning && <span>{p.utrustning}{p.komponent ? ` · ${p.komponent}` : ''}</span>}
                    {p.omrade && <span>{p.omrade}</span>}
                    {p.arende_id && <a href={`/arenden#${p.arende_id}`}>Ärende #{p.arende_id}</a>}
                    {p.korning_id && <span>Rond {p.korning_id}</span>}
                    {p.ai_modell && <span>tolkad av {p.ai_modell}, bekräftad av {p.bekraftad_av}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {flik === 'utkast' && <Utkast poster={obekraftade} uppdatera={utkast.uppdatera} />}
      {flik === 'monster' && <Monster />}
    </>
  );
}

/**
 * Obekräftade talrapporter. De är inte dokumentation förrän någon läst dem,
 * och det ska synas tydligt att de ligger och väntar.
 */
function Utkast({ poster, uppdatera }) {
  const notis = useNotis();
  const [oppen, sattOppen] = useState(null);

  if (!poster.length) return <Tomt>Inga rapporter väntar på att bekräftas.</Tomt>;

  return (
    <>
      <Kort
        titel="Väntar på bekräftelse"
        undertext="En talad rapport är ett utkast tills någon läst igenom den. Fram till dess räknas den inte som journalförd."
      >
        <Tabell
          kolumner={[
            { falt: 'tid', rubrik: 'Tid', visa: (p) => tidpunkt(p.tid) },
            { falt: 'av', rubrik: 'Rapportör' },
            { falt: 'utrustning', rubrik: 'Utrustning', visa: (p) => p.utrustning || '–' },
            {
              falt: 'transkript',
              rubrik: 'Det som sades',
              visa: (p) => (p.transkript || '').slice(0, 90) + ((p.transkript || '').length > 90 ? ' …' : ''),
            },
          ]}
          rader={poster}
          vidKlick={sattOppen}
        />
      </Kort>
      {oppen && (
        <Lada titel="Bekräfta journalpost" stang={() => sattOppen(null)}>
          <Bekrafta
            post={oppen}
            klar={() => {
              sattOppen(null);
              uppdatera();
              notis('Journalförd', 'ok');
            }}
          />
        </Lada>
      )}
    </>
  );
}

function Bekrafta({ post, klar }) {
  const notis = useNotis();
  const f = post.forslag || {};
  const [text, sattText] = useState(
    [f.observation, f.atgard && `Åtgärd: ${f.atgard}`].filter(Boolean).join('\n') || post.transkript || ''
  );
  const [arende, sattArende] = useState(!!f.forslag_arende);
  const [sparar, sattSparar] = useState(false);
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const [utrId, sattUtrId] = useState(post.utrustning_id ? String(post.utrustning_id) : '');

  const skicka = async () => {
    sattSparar(true);
    try {
      await api.skapa(`/api/drift/journal/${post.id}/bekrafta`, {
        text,
        utrustning_id: utrId ? Number(utrId) : null,
        matvarden: f.matvarden || {},
        skapa_arende: arende,
        arende_titel: arende ? (f.sammanfattning || text).slice(0, 160) : null,
        allvarlighet: f.allvarlighet || null,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
      sattSparar(false);
    }
  };

  return (
    <>
      {post.transkript && (
        <blockquote className="citat">
          <span className="liten svag">Ordagrant</span>
          {post.transkript}
        </blockquote>
      )}
      {post.ljudfil && (
        <audio controls src={`/api/drift/journal/${post.id}/ljud`} style={{ width: '100%', margin: '0 0 12px' }} />
      )}
      {f.valj_utrustning && (
        <div className="meddelande varning">
          {f.namnda?.length > 1
            ? `Flera objekt nämndes: ${f.namnda.map((u) => u.namn).join(', ')}. Välj vilket rapporten gäller.`
            : `Tolkningen hörde ”${f.utrustning}” men kunde inte avgöra vilken utrustning det var. Välj själv.`}
        </div>
      )}

      <Val
        etikett="Utrustning"
        varde={utrId}
        satt={sattUtrId}
        tomtext="– ingen särskild –"
        poster={(utrustning.data || []).map((u) => ({ varde: String(u.id), text: u.namn }))}
      />
      <Falt etikett="Det som ska stå i journalen">
        <textarea value={text} onChange={(e) => sattText(e.target.value)} rows={5} />
      </Falt>

      {!!Object.keys(f.matvarden || {}).length && (
        <div className="meddelande info">
          Mätvärden ur talet sparas som manuellt rapporterade:{' '}
          {Object.entries(f.matvarden).map(([n, v]) => `${n} ${v}`).join(', ')}
        </div>
      )}

      <label className="kryssrad">
        <input type="checkbox" checked={arende} onChange={(e) => sattArende(e.target.checked)} />
        Skapa ett ärende av det här
      </label>

      <div className="knapprad">
        <button className="primar" onClick={skicka} disabled={sparar}>
          {sparar ? 'Sparar …' : 'Bekräfta och journalför'}
        </button>
      </div>
    </>
  );
}

/** Statistik, inte slutsatser: systemet räknar, människan avgör varför. */
function Monster() {
  const m = useHamta(() => api.hamta('/api/drift/monster'));
  if (m.laddar && !m.data) return <Vanta />;
  const rader = m.data?.monster || [];

  return (
    <Kort
      titel="Fel som återkommer"
      undertext="Två eller fler fel på samma objekt. Siffrorna visar vad som hänt – varför det händer får utredningen svara på."
    >
      {rader.length === 0 ? (
        <Tomt>Inga återkommande fel registrerade ännu.</Tomt>
      ) : (
        <Tabell
          nyckel={(r) => `${r.utrustning_id}-${r.komponent_id ?? 0}`}
          kolumner={[
            { falt: 'utrustning', rubrik: 'Utrustning' },
            { falt: 'komponent', rubrik: 'Komponent', visa: (r) => r.komponent || '(hela objektet)' },
            { falt: 'antal', rubrik: 'Fel', sifra: true },
            {
              falt: 'dagar_mellan_fel',
              rubrik: 'Dagar mellan',
              sifra: true,
              visa: (r) => (r.dagar_mellan_fel == null ? '–' : r.dagar_mellan_fel),
            },
            {
              falt: 'dagar_till_atgard',
              rubrik: 'Dagar till åtgärd',
              sifra: true,
              visa: (r) => (r.dagar_till_atgard == null ? '–' : r.dagar_till_atgard),
            },
            { falt: 'kostnad_ore', rubrik: 'Kostnad', sifra: true, visa: (r) => kronor(r.kostnad_ore) },
            {
              falt: 'utred',
              rubrik: '',
              sortlos: true,
              visa: (r) =>
                r.utred ? (
                  <Bricka farg={r.sakerhetsfel ? 'fara' : 'varning'}>
                    {r.sakerhetsfel ? 'säkerhetsfel' : 'utred grundorsak'}
                  </Bricka>
                ) : (
                  ''
                ),
            },
          ]}
          rader={rader}
        />
      )}
    </Kort>
  );
}
