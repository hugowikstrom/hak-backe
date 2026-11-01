// Projektsidan: vad klubben bygger, varför, och var det står.
//
// Mottagaren är den medlem som *inte* är insatt. Därför är ordningen
// omvänd mot en vanlig projektsida: syftet och filmerna först, delarna
// som kort man kan öppna, och formalia — tidplan, kravspecifikation,
// rapporter till styrelsen — längst ned under en egen rubrik.
//
// Sidan går att läsa utan inloggning. Att lämna en idé gör det inte, och
// den som inte är inloggad får veta varför i stället för att mötas av en
// knapp som inte gör något.
import { useEffect, useState } from 'react';
import { useInspelning } from '../../delad/inspelning.js';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Falt, Kort, Lada, Tomt, useHamta, useNotis, Vanta } from '../delar/bitar.jsx';
import { langDatum } from '../nytta.js';

const STATUSFARG = {
  ide: 'svag',
  planerad: '',
  byggs: 'info',
  provas: 'varning',
  i_drift: 'ok',
};

export function Projekt() {
  const jag = useJag();
  const { data, laddar, uppdatera } = useHamta(() => api.hamta('/api/projekt'));
  const [oppen, sattOppen] = useState(null);
  const [visaFormalia, sattVisaFormalia] = useState(false);

  if (laddar && !data) return <Vanta />;
  if (!data) return <Tomt>Projektsidan kunde inte läsas.</Tomt>;

  const text = (nyckel) => data.texter.find((t) => t.nyckel === nyckel);
  const syfte = text('syfte');
  const ovriga = data.texter.filter((t) => t.nyckel !== 'syfte');
  const idrift = data.delar.filter((d) => d.status === 'i_drift').length;

  return (
    <>
      {/* ---- Vad det här är ---- */}
      <section className="projekthuvud">
        <span className="etikett">{data.forening.namn}</span>
        <h1>{syfte?.rubrik || 'Projektet'}</h1>
        {syfte && <Stycken text={syfte.text} klass="ingress" />}
        {data.film && (
          <video
            className="projektfilm oversikt"
            controls
            preload="metadata"
            poster={`/api/hjalp/affisch/${data.film.nyckel}`}
            src={`/api/hjalp/film/${data.film.nyckel}`}
          />
        )}
        <div className="rad gap-8 hopp" style={{ marginTop: 4 }}>
          <Bricka farg="ok">{idrift} delar i drift</Bricka>
          <Bricka>{data.delar.length} totalt</Bricka>
          {!data.inloggad && (
            <span className="liten svag">Du läser utan att vara inloggad — det går bra.</span>
          )}
        </div>
      </section>

      {/* ---- Delarna ---- */}
      <Kort
        titel="Så här är det byggt"
        undertext="Varje del har en film. Tryck på den du är nyfiken på."
        tat
      >
        <div className="delrutnat">
          {data.delar.map((d) => (
            <Delkort key={d.nyckel} d={d} oppna={() => sattOppen(d.nyckel)} />
          ))}
        </div>
      </Kort>

      {/* ---- Varför, bidra, avgränsning ---- */}
      <div className="tva">
        {ovriga.map((t) => (
          <Kort key={t.nyckel} titel={t.rubrik}>
            <Stycken text={t.text} />
            {t.nyckel === 'bidra' && !data.inloggad && (
              <div className="meddelande info" style={{ marginTop: 8 }}>
                Logga in för att lämna en idé. Har du inget konto — hör av dig till
                backansvarig, eller prata med någon i styrelsen.
              </div>
            )}
          </Kort>
        ))}
      </div>

      {/* ---- Formalia, för den som vill ---- */}
      <Kort
        titel="Tidplan och dokument"
        undertext="För styrelsen och den som vill läsa noggrant"
        verktyg={
          <button className="liten" onClick={() => sattVisaFormalia((v) => !v)}>
            {visaFormalia ? 'Dölj' : 'Visa'}
          </button>
        }
      >
        {visaFormalia ? (
          <Formalia delar={data.delar} inloggad={data.inloggad} />
        ) : (
          <p className="svag" style={{ margin: 0 }}>
            Kravspecifikation, tidplan och rapporter till styrelsen — som PDF.
          </p>
        )}
      </Kort>

      {oppen && (
        <Del
          nyckel={oppen}
          stang={() => sattOppen(null)}
          andrat={uppdatera}
          jag={jag}
        />
      )}
    </>
  );
}

/** Blankrad blir nytt stycke. Texterna skrivs av människor, inte i markdown. */
const Stycken = ({ text, klass }) => (
  <>
    {String(text || '')
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((s, i) => (
        <p key={i} className={klass}>{s}</p>
      ))}
  </>
);

function Delkort({ d, oppna }) {
  return (
    <button className="delkort" onClick={oppna}>
      <header>
        <Bricka farg={STATUSFARG[d.status]}>{d.statusnamn}</Bricka>
        {d.film && <span className="liten svag">▶ film</span>}
        {d.ideer > 0 && <span className="liten svag">{d.ideer} idéer</span>}
      </header>
      <h3>{d.rubrik}</h3>
      <p>{d.sammanfattning}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// En del: film, text, och idéerna som lämnats vid den
// ---------------------------------------------------------------------------

function Del({ nyckel, stang, andrat, jag }) {
  const { data, laddar, uppdatera } = useHamta(() => api.hamta(`/api/projekt/del/${nyckel}`), [nyckel]);

  if (laddar && !data) return <Lada titel="Hämtar …" stang={stang} bred><Vanta /></Lada>;
  if (!data) return null;

  return (
    <Lada
      titel={data.rubrik}
      stang={stang}
      bred
      fot={<button className="primar" onClick={stang}>Stäng</button>}
    >
      <div className="rad gap-8 hopp" style={{ marginBottom: 10 }}>
        <Bricka farg={STATUSFARG[data.status]}>{data.statusnamn}</Bricka>
        {data.driftsatt && <Bricka farg="ok">I drift sedan {langDatum(data.driftsatt)}</Bricka>}
        {!data.modul_pa && <Bricka farg="varning">Inte påslagen hos er</Bricka>}
      </div>

      {data.film && (
        <video
          className="projektfilm"
          controls
          preload="metadata"
          poster={`/api/hjalp/affisch/${data.film.nyckel}`}
          src={`/api/hjalp/film/${data.film.nyckel}`}
        />
      )}

      {data.varfor && (
        <div className="box-varfor">
          <span className="etikett">Varför</span>
          <Stycken text={data.varfor} />
        </div>
      )}
      <Stycken text={data.text} />

      <Ideer del={data} uppdatera={() => (uppdatera(), andrat())} jag={jag} />
    </Lada>
  );
}

// ---------------------------------------------------------------------------
// Idéerna: skriv, eller prata in
// ---------------------------------------------------------------------------

function Ideer({ del, uppdatera, jag }) {
  const notis = useNotis();
  const [text, sattText] = useState('');
  const [arbetar, sattArbetar] = useState(false);
  const { spelar, ljud, sekunder, fel: mikrofel, starta, stoppa, nollstall } = useInspelning();

  useEffect(() => { if (mikrofel) notis(mikrofel, 'fel'); }, [mikrofel]);

  // Ljudet kommer tillbaka asynkront efter stoppet. Så fort det finns
  // skickas idén iväg – den som pratat in något ska inte behöva trycka en
  // gång till för att det ska hända något.
  useEffect(() => {
    if (!ljud) return;
    skicka({ ljud, sekunder });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ljud]);

  const skicka = async (extra = {}) => {
    if (!text.trim() && !extra.ljud) return notis('Skriv eller prata in något först', 'fel');
    sattArbetar(true);
    try {
      await api.skapa('/api/ideer', {
        text: text.trim() || null,
        kategori: 'ovrigt',
        projektdel_id: del.id,
        rubrik: del.rubrik,
        ...extra,
      });
      sattText('');
      nollstall();
      notis('Tack — den är inlämnad och läses av en människa');
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <section className="ideruta">
      <h4>Vad tycker du om den här delen?</h4>
      {jag ? (
        <>
          <p className="liten svag" style={{ margin: '0 0 8px' }}>
            Saknas något? Är det krångligt? En halv minut räcker, och du behöver inte
            formulera dig fint.
          </p>
          <Falt etikett="">
            <textarea
              rows={2}
              value={text}
              onChange={(e) => sattText(e.target.value)}
              placeholder="Skriv här, eller tryck Prata in"
              disabled={spelar}
            />
          </Falt>
          <div className="knapprad">
            <button
              className={spelar ? 'fara' : ''}
              disabled={arbetar}
              onClick={spelar ? stoppa : starta}
            >
              {spelar ? `■ Stoppa och skicka (${sekunder} s)` : '🎤 Prata in'}
            </button>
            <button className="primar" disabled={arbetar || spelar || !text.trim()} onClick={() => skicka()}>
              {arbetar ? 'Skickar …' : 'Skicka'}
            </button>
          </div>
        </>
      ) : (
        <div className="meddelande info">
          Logga in för att lämna en idé. Du kan läsa allt utan konto.
        </div>
      )}

      {del.ideer?.length > 0 && (
        <div className="idelista">
          {del.ideer.map((i) => (
            <article key={i.id} className={`idepost${i.egen ? ' egen' : ''}`}>
              <header>
                <strong>{i.skapad_av || 'Medlem'}</strong>
                <span className="liten svag">{String(i.skapad).slice(0, 10)}</span>
                {i.inspelad ? <Bricka farg="svag">inspelad</Bricka> : null}
                {i.egen && <Bricka farg="info">din</Bricka>}
              </header>
              <p>{i.text}</p>
              {i.anteckning && (
                <div className="svar">
                  <span className="etikett">Svar</span>
                  <p>{i.anteckning}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tidplan och dokument
// ---------------------------------------------------------------------------

function Formalia({ delar, inloggad }) {
  const medDatum = delar.filter((d) => d.planerad_start || d.planerad_klar || d.driftsatt);
  return (
    <div className="kolumn" style={{ gap: 14 }}>
      <Gantt delar={medDatum} />
      <div>
        <h4>Dokument</h4>
        <p className="liten svag" style={{ margin: '0 0 8px' }}>
          Skrivs ut ur systemet och är alltid aktuella — de speglar sidan ovan.
        </p>
        <div className="knapprad">
          <a className="knapp" href="/api/projekt/dokument/kravspecifikation.pdf">Kravspecifikation (PDF)</a>
          <a className="knapp" href="/api/projekt/dokument/tidplan.pdf">Tidplan och gantt (PDF)</a>
          {inloggad && (
            <a className="knapp" href="/api/projekt/dokument/styrelserapport.pdf">Rapport till styrelsen (PDF)</a>
          )}
        </div>
        {!inloggad && (
          <p className="liten svag" style={{ marginTop: 6 }}>
            Rapporten till styrelsen kräver inloggning.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Gantt i ren CSS-grid. Inget diagrambibliotek: staplarna är tolv kolumner
 * och en rad per del, och det är allt diagrammet behöver vara.
 */
function Gantt({ delar }) {
  if (!delar.length)
    return <Tomt>Tidplanen är inte satt ännu. Datumen beslutas av styrelsen.</Tomt>;

  const alla = delar.flatMap((d) => [d.planerad_start, d.planerad_klar, d.provas_fran, d.driftsatt]).filter(Boolean).sort();
  const fran = new Date(alla[0]);
  const till = new Date(alla[alla.length - 1]);
  const spann = Math.max(1, (till - fran) / 86400000);
  const andel = (d) => ((new Date(d) - fran) / 86400000 / spann) * 100;

  const manader = [];
  for (let d = new Date(fran.getFullYear(), fran.getMonth(), 1); d <= till; d.setMonth(d.getMonth() + 1))
    manader.push({ namn: d.toLocaleDateString('sv-SE', { month: 'short' }), vid: andel(d.toISOString().slice(0, 10)) });

  return (
    <div className="gantt">
      <div className="gantt-skala">
        {manader.map((m, i) => (
          <span key={i} style={{ left: `${Math.max(0, m.vid)}%` }}>{m.namn}</span>
        ))}
      </div>
      {delar.map((d) => {
        const start = d.planerad_start || d.provas_fran || d.driftsatt;
        const slut = d.driftsatt || d.planerad_klar || d.provas_fran || start;
        return (
          <div key={d.nyckel} className="gantt-rad">
            <span className="namn">{d.rubrik}</span>
            <span className="spar">
              <span
                className={`stapel ${d.status}`}
                style={{ left: `${andel(start)}%`, width: `${Math.max(2, andel(slut) - andel(start))}%` }}
                title={`${langDatum(start)} – ${langDatum(slut)}`}
              />
            </span>
          </div>
        );
      })}
      <p className="liten svag" style={{ margin: '8px 0 0' }}>
        Datumen är förslag tills styrelsen beslutat dem.
      </p>
    </div>
  );
}
