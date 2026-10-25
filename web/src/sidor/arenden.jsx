// Ärenden: rapportera fel och brister, prioritera, följ åtgärder.
import { useEffect, useState } from 'react';
import { api, fragestrang } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Kort, Lada, Prioritetsbricka, Statusbricka, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { ALLVARLIGHET, ARENDESTATUS, ARENDETYP, initialer, minstRoll, PRIORITET, sedan, tidpunkt } from '../nytta.js';

const PRIOVAL = Object.entries(PRIORITET).map(([v, p]) => ({ varde: v, text: `${v} ${p.namn}` }));

export function Arenden() {
  const jag = useJag();
  const notis = useNotis();
  const [filter, sattFilter] = useState({ status: 'oppna', prioritet: '', omrade_id: '', utrustning_id: '', fritext: '' });
  const [valt, sattValt] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    return id ? Number(id) : null;
  });
  const [nytt, sattNytt] = useState(false);

  const lista = useHamta(() => api.hamta(`/api/arenden${fragestrang(filter)}`), [JSON.stringify(filter)]);
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const omraden = useHamta(() => api.hamta('/api/omraden'));
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));

  const satt = (f) => (v) => sattFilter((g) => ({ ...g, [f]: v }));

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Ärenden</h1>
          <div className="undertext">Fel, brister, risker och förbättringar i hela anläggningen</div>
        </div>
        <div className="knapprad">
          <a className="knapp" href={`/api/arenden.csv${fragestrang({ status: filter.status })}`}>Exportera CSV</a>
          <button className="primar" onClick={() => sattNytt(true)}>Nytt ärende</button>
        </div>
      </div>

      <Kort tat>
        <div className="kropp">
          <div className="faltrad">
            <Val
              etikett="Status" varde={filter.status} satt={satt('status')} tomtext="Alla"
              poster={[{ varde: 'oppna', text: 'Alla öppna' }, ...Object.entries(ARENDESTATUS).map(([v, s]) => ({ varde: v, text: s.namn }))]}
            />
            <Val etikett="Högst prioritet" varde={filter.prioritet} satt={satt('prioritet')} tomtext="Alla" poster={PRIOVAL} />
            <Val
              etikett="Område" varde={filter.omrade_id} satt={satt('omrade_id')} tomtext="Alla"
              poster={(omraden.data || []).map((o) => ({ varde: o.id, text: o.namn }))}
            />
            <Val
              etikett="Utrustning" varde={filter.utrustning_id} satt={satt('utrustning_id')} tomtext="Alla"
              poster={(utrustning.data || []).map((u) => ({ varde: u.id, text: u.namn }))}
            />
            <Text etikett="Sök" varde={filter.fritext} satt={satt('fritext')} placeholder="titel eller beskrivning" />
          </div>
        </div>
        {lista.laddar && !lista.data ? (
          <Vanta />
        ) : (
          <Tabell
            rader={lista.data || []}
            maxhojd="62vh"
            vald={valt}
            vidKlick={(a) => sattValt(a.id)}
            tomtext="Inga ärenden matchar filtret."
            kolumner={[
              { falt: 'id', rubrik: 'Nr', sifra: true, bredd: 48 },
              {
                falt: 'prioritet', rubrik: 'Prio', bredd: 70,
                visa: (a) => <Prioritetsbricka niva={a.prioritet} />,
              },
              {
                falt: 'titel', rubrik: 'Ärende',
                visa: (a) => (
                  <div className="kolumn" style={{ gap: 1 }}>
                    <strong>{a.titel}</strong>
                    <span className="liten svag">
                      {ARENDETYP[a.typ]} · {ALLVARLIGHET[a.allvarlighet]}
                      {a.antal_handelser > 1 ? ` · ${a.antal_handelser} händelser` : ''}
                    </span>
                  </div>
                ),
              },
              {
                falt: 'utrustning',
                rubrik: 'Gäller',
                // Positionen och maskinen ska gå att skilja åt på en rad.
                visa: (a) =>
                  a.plats ? (
                    <>
                      {a.plats} <span className="liten svag">position</span>
                    </>
                  ) : (
                    a.utrustning || a.omrade || '–'
                  ),
              },
              { falt: 'status', rubrik: 'Status', visa: (a) => <Statusbricka status={a.status} /> },
              {
                falt: 'tilldelad', rubrik: 'Tilldelad',
                visa: (a) => (a.tilldelad ? <span className="initial" title={a.tilldelad}>{initialer(a.tilldelad)}</span> : <span className="svagare">–</span>),
              },
              { falt: 'skapad', rubrik: 'Skapad', visa: (a) => <span className="liten svag">{sedan(a.skapad)}</span> },
              { falt: 'deadline', rubrik: 'Deadline', visa: (a) => a.deadline || '–' },
            ]}
          />
        )}
      </Kort>

      {nytt && (
        <ArendeFormular
          utrustning={utrustning.data || []}
          omraden={omraden.data || []}
          medlemmar={medlemmar.data || []}
          stang={() => sattNytt(false)}
          klar={() => { sattNytt(false); lista.uppdatera(); notis('Ärendet skapat.'); }}
        />
      )}

      {valt && (
        <Arende
          id={valt}
          jag={jag}
          medlemmar={medlemmar.data || []}
          stang={() => { sattValt(null); lista.uppdatera(); }}
          notis={notis}
        />
      )}
    </>
  );
}

function Arende({ id, jag, medlemmar, stang, notis }) {
  const { data: a, laddar, uppdatera } = useHamta(() => api.hamta(`/api/arenden/${id}`), [id]);
  const [text, sattText] = useState('');
  const [slag, sattSlag] = useState('kommentar');

  const andra = async (data) => {
    try {
      await api.spara(`/api/arenden/${id}`, data);
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const kommentera = async () => {
    if (!text.trim()) return;
    try {
      await api.skapa(`/api/arenden/${id}/handelse`, { text, slag });
      sattText('');
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  if (laddar && !a) return <Lada titel="Ärende" stang={stang}><Vanta /></Lada>;

  const far = minstRoll(jag, 'backansvarig') || a.skapad_av_id === jag.id || a.tilldelad_id === jag.id;

  return (
    <Lada
      bred
      titel={`#${a.id} ${a.titel}`}
      stang={stang}
      fot={
        <>
          {far && a.status !== 'stangd' && (
            <>
              {a.status !== 'atgardad' && (
                <button onClick={() => andra({ status: 'atgardad' })}>Markera åtgärdad</button>
              )}
              <button onClick={() => andra({ status: 'stangd' })}>Stäng ärendet</button>
            </>
          )}
          <button className="primar" onClick={stang}>Klar</button>
        </>
      }
    >
      <div className="rad hopp">
        <Prioritetsbricka niva={a.prioritet} />
        <Statusbricka status={a.status} />
        <Bricka>{ARENDETYP[a.typ]}</Bricka>
        <Bricka farg={a.allvarlighet === 'sakerhetsrisk' ? 'fara' : ''}>{ALLVARLIGHET[a.allvarlighet]}</Bricka>
        {a.plats && <Bricka farg="info">{a.plats} · position</Bricka>}
        {a.utrustning && <Bricka>{a.utrustning}</Bricka>}
        {a.komponent && <Bricka>{a.komponent}</Bricka>}
        {a.maskin_da && (
          <Bricka>
            {a.maskin_da.namn} stod här då
          </Bricka>
        )}
        {a.omrade && <Bricka>{a.omrade}</Bricka>}
        <span className="liten svag">Skapat {tidpunkt(a.skapad)} av {a.skapad_av || 'okänd'}</span>
      </div>

      {a.beskrivning && <p className="brodtext">{a.beskrivning}</p>}

      {far && (
        <div className="faltrad">
          <Val
            etikett="Status" varde={a.status} satt={(v) => andra({ status: v })} tomtext={null}
            poster={Object.entries(ARENDESTATUS).map(([v, s]) => ({ varde: v, text: s.namn }))}
          />
          <Val etikett="Prioritet" varde={String(a.prioritet)} satt={(v) => andra({ prioritet: v })} tomtext={null} poster={PRIOVAL} />
          <Val
            etikett="Allvarlighet" varde={a.allvarlighet} satt={(v) => andra({ allvarlighet: v })} tomtext={null}
            poster={Object.entries(ALLVARLIGHET).map(([v, t]) => ({ varde: v, text: t }))}
          />
          <Val
            etikett="Tilldelad" varde={a.tilldelad_id || ''} satt={(v) => andra({ tilldelad_id: v || null })} tomtext="– ingen –"
            poster={medlemmar.filter((m) => m.aktiv).map((m) => ({ varde: m.id, text: m.namn }))}
          />
          <Text etikett="Deadline" typ="date" varde={a.deadline || ''} satt={(v) => andra({ deadline: v || null })} />
        </div>
      )}

      <h4>Händelser</h4>
      <div className="tidslinje">
        {a.handelser.map((h) => (
          <div className="handelse" key={h.id}>
            <span className="num liten svag">{tidpunkt(h.tid)}</span>
            <span>
              {h.slag === 'atgard' && <Bricka farg="ok">Åtgärd</Bricka>}{' '}
              {h.text}
              <span className="liten svagare"> — {h.av || 'systemet'}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <label className="falt vaxa">
          <span>Ny händelse</span>
          <textarea value={text} onChange={(e) => sattText(e.target.value)} placeholder="Vad har hänt eller gjorts?" />
        </label>
        <div className="kolumn" style={{ width: 150 }}>
          <Val
            etikett="Slag" varde={slag} satt={sattSlag} tomtext={null}
            poster={[{ varde: 'kommentar', text: 'Kommentar' }, { varde: 'atgard', text: 'Åtgärd' }]}
          />
          <button className="primar" onClick={kommentera} disabled={!text.trim()}>Lägg till</button>
        </div>
      </div>
    </Lada>
  );
}

function ArendeFormular({ utrustning, omraden, medlemmar, stang, klar }) {
  const notis = useNotis();
  // Felet sitter antingen på en position i backen eller på en maskin. Det
  // är två olika saker och ska inte slarvas ihop: ett läckande vattenuttag
  // stannar på platsen, ett trasigt munstycke följer kanonen.
  const [galler, sattGaller] = useState('maskin');
  const platser = useHamta(() => api.hamta('/api/platser'));
  const [f, sattF] = useState({
    titel: '', beskrivning: '', typ: 'fel', prioritet: '3', allvarlighet: 'begransar',
    utrustning_id: '', snoplats_id: '', omrade_id: '', tilldelad_id: '', deadline: '',
  });
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));

  // Väljer man utrustning följer området med automatiskt.
  useEffect(() => {
    if (!f.utrustning_id) return;
    const u = utrustning.find((x) => String(x.id) === String(f.utrustning_id));
    if (u?.omrade_id) sattF((g) => ({ ...g, omrade_id: String(u.omrade_id) }));
  }, [f.utrustning_id, utrustning]);

  // Samma sak för positionen.
  useEffect(() => {
    if (!f.snoplats_id) return;
    const p = (platser.data?.platser || []).find((x) => String(x.id) === String(f.snoplats_id));
    if (p?.omrade_id) sattF((g) => ({ ...g, omrade_id: String(p.omrade_id) }));
  }, [f.snoplats_id, platser.data]);

  const vald_plats = (platser.data?.platser || []).find((x) => String(x.id) === String(f.snoplats_id));

  const skicka = async () => {
    try {
      await api.skapa('/api/arenden', {
        ...f,
        // Bara det ena skickas med – annars går det inte att läsa i
        // efterhand vad felet faktiskt satt på.
        utrustning_id: galler === 'maskin' ? f.utrustning_id || null : null,
        snoplats_id: galler === 'plats' ? f.snoplats_id || null : null,
        omrade_id: f.omrade_id || null,
        tilldelad_id: f.tilldelad_id || null,
        deadline: f.deadline || null,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      titel="Nytt ärende"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={!f.titel.trim()} onClick={skicka}>Skapa</button>
        </>
      }
    >
      <Text etikett="Titel" krav varde={f.titel} satt={satt('titel')} autoFocus placeholder="Kort beskrivning av felet" />
      {galler === 'plats' && vald_plats?.maskin && (
        <div className="meddelande info">
          {vald_plats.maskin} står på {vald_plats.namn} just nu. Felet läggs på <strong>positionen</strong> –
          är det kanonen som gått sönder, välj ”En maskin” i stället.
        </div>
      )}
      <label className="falt">
        <span>Beskrivning</span>
        <textarea value={f.beskrivning} onChange={(e) => satt('beskrivning')(e.target.value)} placeholder="Var, när, hur – och vad som redan är gjort." />
      </label>
      <div className="faltrad">
        <Val
          etikett="Typ" varde={f.typ} satt={satt('typ')} tomtext={null}
          poster={Object.entries(ARENDETYP).map(([v, t]) => ({ varde: v, text: t }))}
        />
        <Val etikett="Prioritet" varde={f.prioritet} satt={satt('prioritet')} tomtext={null} poster={PRIOVAL} />
        <Val
          etikett="Allvarlighet" varde={f.allvarlighet} satt={satt('allvarlighet')} tomtext={null}
          poster={Object.entries(ALLVARLIGHET).map(([v, t]) => ({ varde: v, text: t }))}
        />
      </div>
      <div className="faltrad">
        <Val
          etikett="Vad är felet på?" varde={galler} satt={sattGaller} tomtext={null}
          poster={[
            { varde: 'plats', text: 'En position i backen' },
            { varde: 'maskin', text: 'En maskin' },
            { varde: 'inget', text: 'Varken eller' },
          ]}
        />
        {galler === 'plats' ? (
          <Val
            etikett="Position" varde={f.snoplats_id} satt={satt('snoplats_id')} tomtext="– välj –"
            poster={(platser.data?.platser || []).map((p) => ({
              varde: p.id,
              text: `${p.namn}${p.maskin ? ` (${p.maskin} står här)` : ' (tom)'}`,
            }))}
          />
        ) : galler === 'maskin' ? (
          <Val
            etikett="Maskin" varde={f.utrustning_id} satt={satt('utrustning_id')} tomtext="– ingen –"
            poster={utrustning.filter((u) => u.aktiv).map((u) => ({ varde: u.id, text: u.namn }))}
          />
        ) : null}
        <Val
          etikett="Område" varde={f.omrade_id} satt={satt('omrade_id')} tomtext="– inget –"
          poster={omraden.map((o) => ({ varde: o.id, text: o.namn }))}
        />
        <Val
          etikett="Tilldela" varde={f.tilldelad_id} satt={satt('tilldelad_id')} tomtext="– ingen –"
          poster={medlemmar.filter((m) => m.aktiv).map((m) => ({ varde: m.id, text: m.namn }))}
        />
        <Text etikett="Deadline" typ="date" varde={f.deadline} satt={satt('deadline')} />
      </div>
      <div className="meddelande info">
        Akuta ärenden som tilldelas någon skickas även som e-post.
      </div>
    </Lada>
  );
}
