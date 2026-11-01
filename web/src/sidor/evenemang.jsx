// Läger, tävlingar, aktiviteter och möten.
//
// Sidan är kort med flit. Det en medlem vill veta om ett läger är fyra
// saker – när, var, vad det kostar och om det finns plats – och den
// vanligaste åtgärden är en enda knapp. Därför är varje evenemang ett kort
// med fyra rader och en knapp, inte en rad i en tabell man måste klicka på
// för att förstå.
//
// Arrangören får resten: deltagarlistan, behoven, avgifterna och listan
// att ta med sig i bilen.
import { useState } from 'react';
import { api } from '../api.js';
import { Lank } from '../app.jsx';
import { Bricka, Falt, Kort, Lada, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { idag, langDatum } from '../nytta.js';

const SLAG = {
  lager: { namn: 'Läger', farg: '' },
  tavling: { namn: 'Tävling', farg: 'varning' },
  aktivitet: { namn: 'Aktivitet', farg: 'ok' },
  mote: { namn: 'Möte', farg: 'svag' },
};
const STATUS = { planerat: 'Planerat', oppet: 'Öppet', genomfort: 'Genomfört', installt: 'Inställt' };
const BETALSATT = {
  planbok: 'Plånboken', swish: 'Swish', kort: 'Kort', kontant: 'Kontant', faktura: 'Faktura',
};

/** "12–15 februari" blir läsbart; en enda dag ska inte visas som ett spann. */
const nar = (e) => {
  const d = (v) => langDatum(String(v).slice(0, 10));
  const klocka = (v) => (String(v).length > 10 ? ` ${String(v).slice(11, 16)}` : '');
  if (!e.slut || String(e.slut).slice(0, 10) === String(e.start).slice(0, 10))
    return d(e.start) + klocka(e.start);
  return `${d(e.start)} – ${d(e.slut)}`;
};

export function Evenemang() {
  const notis = useNotis();
  const [alla, sattAlla] = useState(false);
  const [slag, sattSlag] = useState('');
  const { data, laddar, uppdatera } = useHamta(
    () => api.hamta(`/api/evenemang?${alla ? 'alla=1&' : ''}${slag ? `slag=${slag}` : ''}`),
    [alla, slag]
  );
  const [valt, sattValt] = useState(null);
  const [nytt, sattNytt] = useState(false);
  // Saldot hämtas en gång för hela sidan. En knapp som lovar "betala med
  // plånboken" när plånboken är tom är sämre än ingen knapp alls.
  const planbok = useHamta(() => api.hamta('/api/planbok/min'));

  if (laddar && !data) return <Vanta />;
  const arrangor = data.far_arrangera;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Läger och tävling</h1>
          <div className="undertext">
            Anmäl dig till det klubben gör – och lägg upp eller boka samåkning till det.
          </div>
        </div>
        <div className="knapprad">
          <Val
            etikett=""
            varde={slag}
            satt={sattSlag}
            tomtext="Allt"
            poster={Object.entries(SLAG).map(([varde, s]) => ({ varde, text: s.namn }))}
          />
          <button className={alla ? 'aktiv' : ''} onClick={() => sattAlla((v) => !v)}>
            {alla ? 'Visa kommande' : 'Visa även gamla'}
          </button>
          {arrangor && <button className="primar" onClick={() => sattNytt(true)}>Nytt evenemang</button>}
        </div>
      </div>

      {data.evenemang.length === 0 ? (
        <Kort>
          <Tomt>
            {alla ? 'Inga evenemang alls ännu.' : 'Inget planerat just nu. Titta igen om någon vecka.'}
          </Tomt>
        </Kort>
      ) : (
        <div className="evenemangsrutnat">
          {data.evenemang.map((e) => (
            <Evenemangskort
              key={e.id}
              e={e}
              arrangor={arrangor}
              saldo_ore={planbok.data?.saldo_ore ?? null}
              oppna={() => sattValt(e.id)}
              uppdatera={() => (uppdatera(), planbok.uppdatera())}
              notis={notis}
            />
          ))}
        </div>
      )}

      {valt && (
        <Detalj
          id={valt}
          arrangor={arrangor}
          stang={() => sattValt(null)}
          andrat={uppdatera}
        />
      )}
      {nytt && (
        <Blankett
          stang={() => sattNytt(false)}
          klar={() => (sattNytt(false), uppdatera())}
        />
      )}
    </>
  );
}

function Evenemangskort({ e, arrangor, saldo_ore, oppna, uppdatera, notis }) {
  const [arbetar, sattArbetar] = useState(false);
  const min = e.min_anmalan;
  const gammalt = e.status === 'genomfort' || e.status === 'installt';

  const anmal = async () => {
    sattArbetar(true);
    try {
      const r = await api.skapa(`/api/evenemang/${e.id}/anmalan`, {});
      notis(r.reserv ? 'Det var fullt – du står som reserv och får plats om någon hoppar av' : 'Du är anmäld');
      uppdatera();
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  const avboka = async () => {
    sattArbetar(true);
    try {
      await api.tabort(`/api/evenemang/${e.id}/anmalan/${min.id}`);
      notis('Du är avbokad');
      uppdatera();
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  const betala = async () => {
    sattArbetar(true);
    try {
      await api.skapa(`/api/evenemang/${e.id}/anmalan/${min.id}/betald`, { betalsatt: 'planbok' });
      notis('Avgiften är betald ur din plånbok');
      uppdatera();
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <article className={`evenemangskort${gammalt ? ' blek' : ''}`}>
      <header>
        <Bricka farg={SLAG[e.slag]?.farg}>{SLAG[e.slag]?.namn || e.slag}</Bricka>
        {e.status !== 'oppet' && <Bricka farg={e.status === 'installt' ? 'fara' : 'svag'}>{STATUS[e.status]}</Bricka>}
        <button className="tom liten" onClick={oppna}>Detaljer</button>
      </header>

      <h3>{e.namn}</h3>
      <dl>
        <dt>När</dt><dd className="num">{nar(e)}</dd>
        {e.plats && (<><dt>Var</dt><dd>{e.plats}</dd></>)}
        <dt>Kostar</dt><dd className="num">{e.avgift_ore ? e.avgift : 'Inget'}</dd>
        <dt>Plats</dt>
        <dd>
          {e.platser == null ? (
            <span className="svag">Ingen gräns</span>
          ) : e.platser_kvar ? (
            <>{e.platser_kvar} av {e.platser} kvar</>
          ) : (
            <Bricka farg="varning">Fullt{e.reserver ? ` · ${e.reserver} i kö` : ''}</Bricka>
          )}
        </dd>
        {e.sista_anmalan && (
          <>
            <dt>Anmälan</dt>
            <dd className="num">{e.stangt ? <span className="svag">Stängde {langDatum(e.sista_anmalan)}</span> : `senast ${langDatum(e.sista_anmalan)}`}</dd>
          </>
        )}
      </dl>

      {e.beskrivning && <p className="liten svag">{e.beskrivning}</p>}

      <footer>
        {min && min.status !== 'avbokad' ? (
          <>
            <Bricka farg={min.status === 'reserv' ? 'varning' : 'ok'}>
              {min.status === 'reserv' ? 'Du står som reserv' : 'Du är anmäld'}
            </Bricka>
            {e.avgift_ore > 0 &&
              (min.betald_tid ? (
                <Bricka farg="ok">Betald</Bricka>
              ) : saldo_ore != null && saldo_ore < e.avgift_ore ? (
                <Lank till="/planbok" className="knapp liten">
                  Fyll på plånboken ({e.avgift})
                </Lank>
              ) : (
                <button className="primar liten" disabled={arbetar} onClick={betala}>
                  Betala {e.avgift} med plånboken
                </button>
              ))}
            {!gammalt && !min.betald_tid && (
              <button className="tom liten" disabled={arbetar} onClick={avboka}>Avboka</button>
            )}
          </>
        ) : gammalt ? (
          <span className="svag liten">Anmälan är stängd</span>
        ) : (
          <button className="primar" disabled={arbetar || (e.stangt && !arrangor)} onClick={anmal}>
            {e.fullt ? 'Ställ mig i kön' : 'Anmäl mig'}
          </button>
        )}
        <Lank till="/samakning" className="liten">Samåkning</Lank>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Detaljerna: deltagarlistan
// ---------------------------------------------------------------------------

function Detalj({ id, arrangor, stang, andrat }) {
  const notis = useNotis();
  const { data, laddar, uppdatera } = useHamta(() => api.hamta(`/api/evenemang/${id}`), [id]);
  const [andra, sattAndra] = useState(false);
  const [lagg, sattLagg] = useState('');

  if (laddar && !data) return <Lada titel="Hämtar …" stang={stang}><Vanta /></Lada>;

  const ange = async (a, betalsatt) => {
    try {
      await api.skapa(`/api/evenemang/${id}/anmalan/${a.id}/betald`, { betalsatt });
      uppdatera();
      andrat();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };
  const stryk = async (a) => {
    try {
      await api.tabort(`/api/evenemang/${id}/anmalan/${a.id}`);
      uppdatera();
      andrat();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const deltagare = data.anmalningar.filter((a) => a.status !== 'avbokad');

  return (
    <Lada
      titel={data.namn}
      stang={stang}
      bred
      fot={
        <>
          {arrangor && (
            <a className="knapp" href={`/api/evenemang/${id}/deltagare.csv`}>Deltagarlista (CSV)</a>
          )}
          {arrangor && <button onClick={() => sattAndra(true)}>Ändra evenemanget</button>}
          <button className="primar" onClick={stang}>Stäng</button>
        </>
      }
    >
      <dl className="uppgifter">
        <dt>Slag</dt><dd>{SLAG[data.slag]?.namn}</dd>
        <dt>När</dt><dd className="num">{nar(data)}</dd>
        {data.plats && (<><dt>Var</dt><dd>{data.plats}</dd></>)}
        <dt>Avgift</dt><dd className="num">{data.avgift_ore ? data.avgift : 'Avgiftsfritt'}</dd>
        <dt>Anmälda</dt>
        <dd>
          {data.anmalda}
          {data.platser != null && ` av ${data.platser}`}
          {data.reserver > 0 && ` · ${data.reserver} i kö`}
        </dd>
        {data.avgift_ore > 0 && (<><dt>Betalt</dt><dd>{data.betalda} av {data.anmalda}</dd></>)}
        {data.ansvarig && (<><dt>Ansvarig</dt><dd>{data.ansvarig}</dd></>)}
        {data.grupp && (<><dt>Grupp</dt><dd>{data.grupp}</dd></>)}
      </dl>
      {data.beskrivning && <p>{data.beskrivning}</p>}

      <Kort titel={`Deltagare (${deltagare.length})`} tat>
        <Tabell
          rader={deltagare}
          maxhojd="40vh"
          tomtext="Ingen anmäld ännu."
          kolumner={[
            { falt: 'medlem', rubrik: 'Namn', visa: (a) => <strong>{a.medlem}</strong> },
            {
              falt: 'status', rubrik: 'Läge',
              visa: (a) => <Bricka farg={a.status === 'reserv' ? 'varning' : 'ok'}>{a.status === 'reserv' ? 'Reserv' : 'Anmäld'}</Bricka>,
            },
            ...(data.avgift_ore > 0
              ? [{
                  falt: 'betald_tid', rubrik: 'Avgift',
                  visa: (a) =>
                    a.betald_tid ? (
                      <Bricka farg="ok">{BETALSATT[a.betalsatt] || 'Betald'}</Bricka>
                    ) : arrangor ? (
                      <div className="knapprad">
                        <button className="liten" onClick={() => ange(a, 'swish')}>Swish</button>
                        <button className="liten" onClick={() => ange(a, 'kontant')}>Kontant</button>
                      </div>
                    ) : (
                      <span className="svag">Obetald</span>
                    ),
                }]
              : []),
            ...(arrangor
              ? [
                  { falt: 'telefon', rubrik: 'Telefon', visa: (a) => <span className="num">{a.telefon || '–'}</span> },
                  { falt: 'behov', rubrik: 'Behov', visa: (a) => a.behov || <span className="svag">–</span> },
                  {
                    falt: 'id', rubrik: '',
                    visa: (a) => <button className="tom liten" onClick={() => stryk(a)}>Stryk</button>,
                  },
                ]
              : []),
          ]}
        />
      </Kort>

      {arrangor && (
        <Falt etikett="Skriv in någon som sagt ja på träningen">
          <div className="rad gap-8">
            <SokMedlem varde={lagg} satt={sattLagg} />
            <button
              disabled={!lagg}
              onClick={async () => {
                try {
                  await api.skapa(`/api/evenemang/${id}/anmalan`, { medlem_id: Number(lagg) });
                  sattLagg('');
                  uppdatera();
                  andrat();
                } catch (e) {
                  notis(e.message, 'fel');
                }
              }}
            >
              Anmäl
            </button>
          </div>
        </Falt>
      )}

      {andra && (
        <Blankett
          evenemang={data}
          stang={() => sattAndra(false)}
          klar={() => (sattAndra(false), uppdatera(), andrat())}
        />
      )}
    </Lada>
  );
}

/** Medlemsväljare. Hämtar matrikeln en gång och låter webbläsaren söka. */
function SokMedlem({ varde, satt }) {
  const { data } = useHamta(() => api.hamta('/api/medlemmar'));
  const poster = (data?.medlemmar || data || []).filter((m) => m.aktiv !== 0);
  return (
    <Val
      etikett=""
      varde={varde}
      satt={satt}
      tomtext="Välj medlem …"
      poster={poster.map((m) => ({ varde: m.id, text: m.namn }))}
    />
  );
}

// ---------------------------------------------------------------------------
// Blanketten
// ---------------------------------------------------------------------------

function Blankett({ evenemang, stang, klar }) {
  const notis = useNotis();
  const forening = useHamta(() => api.hamta('/api/forening'));
  const [f, sattF] = useState({
    slag: evenemang?.slag || 'lager',
    namn: evenemang?.namn || '',
    plats: evenemang?.plats || '',
    start: evenemang?.start || idag(),
    slut: evenemang?.slut || '',
    sista_anmalan: evenemang?.sista_anmalan || '',
    avgift: evenemang ? String(evenemang.avgift_ore / 100) : '',
    platser: evenemang?.platser != null ? String(evenemang.platser) : '',
    beskrivning: evenemang?.beskrivning || '',
    grupp_id: evenemang?.grupp_id || '',
    status: evenemang?.status || 'oppet',
  });
  const [arbetar, sattArbetar] = useState(false);
  const satt = (n) => (v) => sattF((p) => ({ ...p, [n]: v }));
  const grupper = (forening.data?.sektioner || []).flatMap((s) => s.grupper || []);

  const spara = async () => {
    if (!f.namn.trim()) return notis('Vad heter det?', 'fel');
    const kropp = {
      slag: f.slag,
      namn: f.namn.trim(),
      plats: f.plats.trim() || null,
      start: f.start,
      slut: f.slut || null,
      sista_anmalan: f.sista_anmalan || null,
      avgift_ore: f.avgift ? Math.round(Number(String(f.avgift).replace(',', '.')) * 100) : 0,
      platser: f.platser ? Number(f.platser) : null,
      beskrivning: f.beskrivning.trim() || null,
      grupp_id: f.grupp_id ? Number(f.grupp_id) : null,
      status: f.status,
    };
    sattArbetar(true);
    try {
      if (evenemang) await api.spara(`/api/evenemang/${evenemang.id}`, kropp);
      else await api.skapa('/api/evenemang', kropp);
      notis(evenemang ? 'Evenemanget ändrat' : 'Evenemanget är upplagt och öppet för anmälan');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <Lada
      titel={evenemang ? 'Ändra evenemang' : 'Nytt evenemang'}
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
      <div className="faltrad">
        <Val
          etikett="Slag"
          varde={f.slag}
          satt={satt('slag')}
          tomtext={null}
          poster={Object.entries(SLAG).map(([varde, s]) => ({ varde, text: s.namn }))}
        />
        <Val
          etikett="Läge"
          varde={f.status}
          satt={satt('status')}
          tomtext={null}
          poster={Object.entries(STATUS).map(([varde, text]) => ({ varde, text }))}
        />
      </div>
      <Text etikett="Vad heter det" varde={f.namn} satt={satt('namn')} krav placeholder="Träningsläger Kläppen" />
      <Text etikett="Var" varde={f.plats} satt={satt('plats')} placeholder="Kläppen, Sälen" />
      <div className="faltrad">
        <Text etikett="Startar" typ="date" varde={String(f.start).slice(0, 10)} satt={satt('start')} krav />
        <Text etikett="Slutar" typ="date" varde={String(f.slut).slice(0, 10)} satt={satt('slut')} />
        <Text etikett="Sista anmälan" typ="date" varde={f.sista_anmalan} satt={satt('sista_anmalan')} />
      </div>
      <div className="faltrad">
        <Text etikett="Avgift, kr" varde={f.avgift} satt={satt('avgift')} inputMode="decimal" placeholder="0" />
        <Text etikett="Platser" varde={f.platser} satt={satt('platser')} inputMode="numeric" placeholder="utan gräns" />
        <Val
          etikett="Grupp"
          varde={f.grupp_id}
          satt={satt('grupp_id')}
          tomtext="Hela klubben"
          poster={grupper.map((g) => ({ varde: g.id, text: g.namn }))}
        />
      </div>
      <Falt etikett="Vad behöver deltagarna veta">
        <textarea rows={3} value={f.beskrivning} onChange={(e) => satt('beskrivning')(e.target.value)} />
      </Falt>
      <div className="meddelande info">
        Sätter du ett platsantal hamnar den som anmäler sig när det är fullt i en reservkö,
        och flyttas upp automatiskt om någon hoppar av.
      </div>
    </Lada>
  );
}
