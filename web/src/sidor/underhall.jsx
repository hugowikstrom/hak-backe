// Förebyggande underhåll: årshjulet, planerna, manualerna och delarna.
//
// Årshjulet är sidans huvudvy, för det är så arbetet faktiskt planeras: en
// månad i taget, ett år framåt. Förslag ur en manual ligger för sig tills
// någon godkänt dem – de räknas inte som anläggningens serviceplan förrän
// en människa sagt ja.
import { useState } from 'react';
import { api } from '../api.js';
import {
  Bricka, Falt, Flikar, Kort, Lada, Nyckeltal, Text, Tomt, useHamta, useNotis, Val, Vanta,
} from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { idag, kortDatum } from '../nytta.js';

const kronor = (ore) => `${Math.round((ore || 0) / 100).toLocaleString('sv-SE')} kr`;

const INTERVALLNAMN = {
  dagar: 'dagar', veckor: 'veckor', manader: 'månader',
  sasong: 'säsong', drifttimmar: 'drifttimmar', handelse: 'vid händelse',
};
const LAGE = {
  forsenad: { namn: 'Försenad', farg: 'fara' },
  snart: { namn: 'Snart', farg: 'varning' },
  kommande: { namn: 'Kommande', farg: '' },
  okant: { namn: 'Utan datum', farg: '' },
};

const intervalltext = (p) => {
  if (p.intervalltyp === 'handelse') return 'vid händelse';
  if (p.intervalltyp === 'sasong') return p.manad ? `varje år i månad ${p.manad}` : 'säsongsvis';
  return p.intervall ? `var ${p.intervall} ${INTERVALLNAMN[p.intervalltyp]}` : INTERVALLNAMN[p.intervalltyp];
};

export function Underhall() {
  const [flik, sattFlik] = useState('arshjul');
  const planer = useHamta(() => api.hamta('/api/underhall/planer'), [flik]);
  const forslag = (planer.data?.planer || []).filter((p) => p.status === 'forslag');

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Underhåll</h1>
          <div className="undertext">
            Vad som ska göras, när det ska göras och vad det kostat.
          </div>
        </div>
      </div>

      <Flikar
        aktiv={flik}
        satt={sattFlik}
        flikar={[
          { nyckel: 'arshjul', text: 'Årshjul' },
          { nyckel: 'planer', text: 'Serviceplaner' },
          { nyckel: 'forslag', text: forslag.length ? `Förslag (${forslag.length})` : 'Förslag' },
          { nyckel: 'manualer', text: 'Manualer' },
          { nyckel: 'delar', text: 'Reservdelar' },
          { nyckel: 'kostnader', text: 'Kostnader' },
        ]}
      />

      {flik === 'arshjul' && <Arshjul />}
      {flik === 'planer' && <Planer data={planer} />}
      {flik === 'forslag' && <Forslag planer={forslag} uppdatera={planer.uppdatera} />}
      {flik === 'manualer' && <Manualer uppdateraPlaner={planer.uppdatera} />}
      {flik === 'delar' && <Reservdelar />}
      {flik === 'kostnader' && <Kostnader />}
    </>
  );
}

function Arshjul() {
  const notis = useNotis();
  const h = useHamta(() => api.hamta('/api/underhall/arshjul'));
  const [period, sattPeriod] = useState(false);

  if (h.laddar && !h.data) return <Vanta />;
  const { hjul, poster, samordna, perioder } = h.data;
  const forsenade = poster.filter((p) => p.lage === 'forsenad');
  const krockar = poster.filter((p) => p.krock || p.forslag_flytt);

  return (
    <>
      <Kort tat>
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Försenat" varde={forsenade.length} farg={forsenade.length ? 'fara' : 'ok'} />
          <Nyckeltal etikett="Planerat i år" varde={poster.length} />
          <Nyckeltal etikett="Krockar med högsäsong" varde={krockar.length} farg={krockar.length ? 'varning' : ''} />
        </div>
      </Kort>

      {!!samordna.length && (
        <Kort
          titel="Kan samordnas"
          undertext="Arbeten på samma enhet som ligger nära varandra i tid."
        >
          {samordna.map((g) => (
            <p key={g.utrustning_id} className="samordning">
              <strong>{g.utrustning}:</strong>{' '}
              {g.poster.map((p) => `${p.namn} (${kortDatum(p.datum)})`).join(' · ')}
            </p>
          ))}
        </Kort>
      )}

      <Kort
        titel="Högbelastning"
        undertext="Perioder då planerat underhåll helst undviks. Kritiskt underhåll flyttas aldrig hit."
        verktyg={<button onClick={() => sattPeriod(true)}>Lägg till period</button>}
        tat
      >
        {perioder.length === 0 ? (
          <span className="liten svag">Inga perioder angivna.</span>
        ) : (
          <div className="brickrad">
            {perioder.map((p) => (
              <span key={p.id} className="periodbricka">
                {p.namn} {kortDatum(p.fran)}–{kortDatum(p.till)}
                <button
                  className="tom"
                  aria-label={`Ta bort ${p.namn}`}
                  onClick={async () => {
                    await api.tabort(`/api/underhall/perioder/${p.id}`);
                    h.uppdatera();
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </Kort>

      <div className="arshjul">
        {hjul.manader.map((m) => (
          <section key={m.nyckel} className={`hjulmanad${m.poster.length ? '' : ' tom'}`}>
            <header>
              <h3>{m.namn}</h3>
              <span className="liten svag">{m.ar}</span>
            </header>
            {m.poster.length === 0 ? (
              <p className="liten svag">—</p>
            ) : (
              m.poster.map((p) => (
                <div key={`${p.slag}-${p.id}`} className={`hjulpost ${p.lage}`}>
                  <span className="dag">{p.datum.slice(8)}</span>
                  <span className="txt">
                    {p.namn}
                    <span className="liten svag">
                      {p.utrustning}
                      {p.uppskattat ? ' · uppskattat' : ''}
                      {p.kritisk ? ' · kritiskt' : ''}
                    </span>
                    {p.krock && (
                      <span className="liten varningstext">
                        Krockar med {p.krock.period} – {p.krock.orsak}
                      </span>
                    )}
                    {p.forslag_flytt && (
                      <span className="liten svag">
                        Förslag: flytta till {kortDatum(p.forslag_flytt.till)} ({p.forslag_flytt.period})
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </section>
        ))}
      </div>
      {!!hjul.utanfor.length && (
        <Kort titel="Utan datum" undertext="Händelsestyrt underhåll och det som ligger längre fram." tat>
          {hjul.utanfor.map((p) => (
            <div key={`${p.slag}-${p.id}`} className="liten">
              {p.namn} <span className="svag">· {p.utrustning}</span>
            </div>
          ))}
        </Kort>
      )}

      {period && (
        <Lada titel="Ny högbelastningsperiod" stang={() => sattPeriod(false)}>
          <NyPeriod
            klar={() => {
              sattPeriod(false);
              h.uppdatera();
              notis('Perioden är tillagd', 'ok');
            }}
          />
        </Lada>
      )}
    </>
  );
}

function NyPeriod({ klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({ namn: '', fran: idag(), till: idag() });
  const satt = (n) => (v) => sattF((x) => ({ ...x, [n]: v }));
  return (
    <>
      <Text etikett="Namn" varde={f.namn} satt={satt('namn')} krav placeholder="Sportlovet" />
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text etikett="Från" typ="date" varde={f.fran} satt={satt('fran')} />
        <Text etikett="Till" typ="date" varde={f.till} satt={satt('till')} />
      </div>
      <div className="knapprad">
        <button
          className="primar"
          disabled={!f.namn.trim()}
          onClick={async () => {
            try {
              await api.skapa('/api/underhall/perioder', f);
              klar();
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Spara
        </button>
      </div>
    </>
  );
}

function Planer({ data }) {
  const notis = useNotis();
  const [ny, sattNy] = useState(false);
  if (data.laddar && !data.data) return <Vanta />;
  const planer = (data.data?.planer || []).filter((p) => p.status !== 'forslag');

  return (
    <>
      <Kort
        titel="Serviceplaner"
        undertext="Återkommande underhåll. Nästa datum räknas fram ur intervallet och senaste utförande."
        verktyg={<button className="primar" onClick={() => sattNy(true)}>Ny plan</button>}
      >
        <Tabell
          rader={planer}
          standardsort="nasta"
          tomtext="Inga serviceplaner ännu."
          kolumner={[
            { falt: 'namn', rubrik: 'Arbete' },
            { falt: 'utrustning', rubrik: 'Utrustning', visa: (p) => p.utrustning || '–' },
            { falt: 'komponent', rubrik: 'Komponent', visa: (p) => p.komponent || '' },
            { falt: 'intervalltyp', rubrik: 'Intervall', visa: intervalltext },
            { falt: 'senast_utford', rubrik: 'Senast', visa: (p) => (p.senast_utford ? kortDatum(p.senast_utford) : '–') },
            {
              falt: 'nasta',
              rubrik: 'Nästa',
              visa: (p) =>
                p.nasta ? (
                  <>
                    {kortDatum(p.nasta)}
                    {p.forfall.uppskattat && <span className="liten svag"> ca</span>}
                  </>
                ) : (
                  '–'
                ),
            },
            {
              falt: 'lage',
              rubrik: '',
              sortlos: true,
              visa: (p) => (
                <>
                  <Bricka farg={LAGE[p.lage]?.farg}>{LAGE[p.lage]?.namn}</Bricka>
                  {!!p.kritisk && <Bricka farg="fara">kritiskt</Bricka>}
                </>
              ),
            },
          ]}
        />
      </Kort>
      {ny && (
        <Lada titel="Ny serviceplan" stang={() => sattNy(false)} bred>
          <NyPlan
            klar={() => {
              sattNy(false);
              data.uppdatera();
              notis('Planen är sparad', 'ok');
            }}
          />
        </Lada>
      )}
    </>
  );
}

function NyPlan({ klar }) {
  const notis = useNotis();
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const [f, sattF] = useState({
    namn: '', utrustning_id: '', komponent_id: '', intervalltyp: 'manader',
    intervall: '', manad: '', instruktion: '', kompetens: '', kritisk: false, senast_utford: '',
  });
  const satt = (n) => (v) => sattF((x) => ({ ...x, [n]: v }));
  const komponenter = useHamta(
    () => (f.utrustning_id ? api.hamta(`/api/drift/komponenter?utrustning=${f.utrustning_id}`) : Promise.resolve({ komponenter: [] })),
    [f.utrustning_id]
  );

  return (
    <>
      <Text etikett="Vad ska göras" varde={f.namn} satt={satt('namn')} krav placeholder="Byt vattenfilter" />
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Val
          etikett="Utrustning"
          varde={f.utrustning_id}
          satt={satt('utrustning_id')}
          poster={(utrustning.data || []).map((u) => ({ varde: String(u.id), text: u.namn }))}
        />
        <Val
          etikett="Komponent"
          varde={f.komponent_id}
          satt={satt('komponent_id')}
          poster={(komponenter.data?.komponenter || []).map((k) => ({ varde: String(k.id), text: k.namn }))}
        />
      </div>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Val
          etikett="Intervalltyp"
          varde={f.intervalltyp}
          satt={satt('intervalltyp')}
          tomtext={null}
          poster={Object.entries(INTERVALLNAMN).map(([v, text]) => ({ varde: v, text }))}
        />
        {f.intervalltyp === 'sasong' ? (
          <Text etikett="Månad (1–12)" typ="number" varde={f.manad} satt={satt('manad')} />
        ) : f.intervalltyp === 'handelse' ? null : (
          <Text etikett={`Antal ${INTERVALLNAMN[f.intervalltyp]}`} typ="number" varde={f.intervall} satt={satt('intervall')} />
        )}
        <Text etikett="Senast utförd" typ="date" varde={f.senast_utford} satt={satt('senast_utford')} />
      </div>
      <Falt etikett="Instruktion">
        <textarea value={f.instruktion} onChange={(e) => satt('instruktion')(e.target.value)} rows={3} />
      </Falt>
      <Text etikett="Kräver kompetens" varde={f.kompetens} satt={satt('kompetens')} placeholder="behörig elektriker" />
      <label className="kryssrad">
        <input type="checkbox" checked={f.kritisk} onChange={(e) => satt('kritisk')(e.target.checked)} />
        Kritiskt underhåll – flyttas aldrig för verksamhetens belastning
      </label>
      <div className="knapprad">
        <button
          className="primar"
          disabled={!f.namn.trim()}
          onClick={async () => {
            try {
              await api.skapa('/api/underhall/planer', {
                ...f,
                utrustning_id: f.utrustning_id ? Number(f.utrustning_id) : null,
                komponent_id: f.komponent_id ? Number(f.komponent_id) : null,
                intervall: f.intervall ? Number(f.intervall) : null,
                manad: f.manad ? Number(f.manad) : null,
                senast_utford: f.senast_utford || null,
              });
              klar();
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Spara planen
        </button>
      </div>
    </>
  );
}

/** Det modellen läst ur manualerna. Ingenting av det gäller ännu. */
function Forslag({ planer, uppdatera }) {
  const notis = useNotis();
  const [vald, sattVald] = useState(null);

  if (!planer.length)
    return <Tomt>Inga förslag väntar. Ladda upp en manual för att få servicepunkter föreslagna.</Tomt>;

  return (
    <>
      <div className="meddelande info">
        Förslagen är tolkade ur manualerna och gäller ingenting förrän du godkänt dem. Varje punkt
        går att slå upp i dokumentet den kom ur.
      </div>
      {planer.map((p) => (
        <Kort key={p.id} titel={p.namn} undertext={`${p.utrustning || 'Ingen utrustning'} · ${intervalltext(p)}`}>
          {p.instruktion && <p>{p.instruktion}</p>}
          {p.kallcitat && (
            <blockquote className="citat">
              <span className="liten svag">
                {p.dokument} {p.kallsida}
              </span>
              {p.kallcitat}
            </blockquote>
          )}
          <div className="rad hopp">
            {!!p.osaker && <Bricka farg="varning">intervallet är otydligt i manualen</Bricka>}
            {p.kompetens && <Bricka>kräver {p.kompetens}</Bricka>}
          </div>
          <div className="knapprad">
            <button className="primar" onClick={() => sattVald(p)}>Granska och godkänn</button>
            <button
              onClick={async () => {
                await api.skapa(`/api/underhall/planer/${p.id}/godkann`, { beslut: 'avfard' });
                uppdatera();
                notis('Förslaget är avfärdat');
              }}
            >
              Avfärda
            </button>
          </div>
        </Kort>
      ))}
      {vald && (
        <Lada titel="Godkänn servicepunkt" stang={() => sattVald(null)} bred>
          <Godkann
            plan={vald}
            klar={() => {
              sattVald(null);
              uppdatera();
              notis('Servicepunkten gäller nu', 'ok');
            }}
          />
        </Lada>
      )}
    </>
  );
}

function Godkann({ plan, klar }) {
  const notis = useNotis();
  const [typ, sattTyp] = useState(plan.intervalltyp);
  const [intervall, sattIntervall] = useState(plan.intervall ?? '');
  const [manad, sattManad] = useState(plan.manad ?? '');

  return (
    <>
      {plan.kallcitat && (
        <blockquote className="citat">
          <span className="liten svag">{plan.dokument} {plan.kallsida}</span>
          {plan.kallcitat}
        </blockquote>
      )}
      {!!plan.osaker && (
        <div className="meddelande varning">
          Manualen anger inget tydligt intervall. Bestäm det här – systemet räknar i dagar och kan
          inte arbeta med ”regelbundet”.
        </div>
      )}
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Val
          etikett="Intervalltyp"
          varde={typ}
          satt={sattTyp}
          tomtext={null}
          poster={Object.entries(INTERVALLNAMN).map(([v, text]) => ({ varde: v, text }))}
        />
        {typ === 'sasong' ? (
          <Text etikett="Månad (1–12)" typ="number" varde={manad} satt={sattManad} />
        ) : typ === 'handelse' ? null : (
          <Text etikett={`Antal ${INTERVALLNAMN[typ]}`} typ="number" varde={intervall} satt={sattIntervall} />
        )}
      </div>
      <div className="knapprad">
        <button
          className="primar"
          onClick={async () => {
            try {
              await api.skapa(`/api/underhall/planer/${plan.id}/godkann`, {
                beslut: 'godkand',
                intervalltyp: typ,
                intervall: intervall === '' ? null : Number(intervall),
                manad: manad === '' ? null : Number(manad),
              });
              klar();
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Godkänn
        </button>
      </div>
    </>
  );
}

function Manualer({ uppdateraPlaner }) {
  const notis = useNotis();
  const d = useHamta(() => api.hamta('/api/underhall/dokument'));
  const [ny, sattNy] = useState(false);
  const [arbetar, sattArbetar] = useState(null);
  const [fraga, sattFraga] = useState('');
  const [traffar, sattTraffar] = useState(null);

  if (d.laddar && !d.data) return <Vanta />;

  const tolka = async (dok) => {
    sattArbetar(dok.id);
    try {
      const r = await api.skapa(`/api/underhall/dokument/${dok.id}/tolka`, {});
      if (r.fel) notis(`Tolkningen gick inte: ${r.fel}`, 'fel');
      else notis(`${r.punkter.length} servicepunkter föreslagna – granska dem under Förslag`, 'ok');
      uppdateraPlaner();
      d.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(null);
    }
  };

  const sok = async (e) => {
    e?.preventDefault?.();
    if (fraga.trim().length < 2) return sattTraffar(null);
    try {
      sattTraffar(await api.hamta(`/api/underhall/dokument/sok?q=${encodeURIComponent(fraga.trim())}`));
    } catch (err) {
      notis(err.message, 'fel');
    }
  };

  return (
    <>
      {/* Många manualer är bara till nytta om det går att slå upp saker i
          dem. Träffen pekar ut sidan, så att pappersexemplaret också duger. */}
      <Kort titel="Sök i manualerna" tat>
        <form className="rad" style={{ alignItems: 'flex-end' }} onSubmit={sok}>
          <Text
            etikett="Ord eller fras"
            varde={fraga}
            satt={(v) => {
              sattFraga(v);
              if (!v.trim()) sattTraffar(null);
            }}
            placeholder="nukleator, oljebyte, brytpinne …"
          />
          <button onClick={sok}>Sök</button>
          {traffar && (
            <button className="tom" onClick={() => { sattFraga(''); sattTraffar(null); }}>
              Rensa
            </button>
          )}
        </form>

        {traffar && (
          traffar.traffar.length === 0 ? (
            <p className="liten svag" style={{ marginTop: 10 }}>
              Ingen träff på ”{traffar.fraga}”. Bara dokument med utläst text går att söka i.
            </p>
          ) : (
            <div className="sokresultat">
              {traffar.traffar.map((tr) => (
                <div key={tr.id} className="soktraff">
                  <div className="rad hopp">
                    <a href={`/api/underhall/dokument/${tr.id}/fil`} target="_blank" rel="noreferrer">
                      {tr.namn}
                    </a>
                    {tr.utrustning && <span className="liten svag">{tr.utrustning}</span>}
                    {!tr.aktuell && <Bricka>ersatt</Bricka>}
                    {tr.i_namnet && !tr.stallen.length && <Bricka>träff i namnet</Bricka>}
                  </div>
                  {tr.stallen.map((s, i) => (
                    <p key={i} className="utdrag">
                      <span className="sidnr">s. {s.sida}</span>
                      {s.utdrag}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </Kort>

      <Kort
        titel="Manualer och dokument"
        undertext="Originalet sparas alltid. Texten dras ut så att den går att söka i och tolka."
        verktyg={<button className="primar" onClick={() => sattNy(true)}>Ladda upp</button>}
      >
        <Tabell
          rader={d.data.dokument}
          tomtext="Inga dokument uppladdade."
          kolumner={[
            {
              falt: 'namn',
              rubrik: 'Dokument',
              visa: (x) => (
                <a href={`/api/underhall/dokument/${x.id}/fil`} target="_blank" rel="noreferrer">
                  {x.namn}
                </a>
              ),
            },
            { falt: 'utrustning', rubrik: 'Utrustning', visa: (x) => x.utrustning || '–' },
            { falt: 'sidor', rubrik: 'Sidor', sifra: true, visa: (x) => x.sidor ?? '–' },
            { falt: 'version', rubrik: 'Version', sifra: true },
            { falt: 'punkter', rubrik: 'Servicepunkter', sifra: true },
            { falt: 'uppladdad', rubrik: 'Uppladdad', visa: (x) => kortDatum(x.uppladdad) },
            {
              falt: 'aktuell',
              rubrik: '',
              sortlos: true,
              visa: (x) =>
                x.aktuell ? (
                  <button disabled={arbetar === x.id} onClick={() => tolka(x)}>
                    {arbetar === x.id ? 'Läser …' : 'Läs ut servicepunkter'}
                  </button>
                ) : (
                  <Bricka>ersatt</Bricka>
                ),
            },
          ]}
        />
      </Kort>
      {ny && (
        <Lada titel="Ladda upp dokument" stang={() => sattNy(false)} bred>
          <LaddaUpp
            dokument={d.data.dokument}
            klar={(resultat) => {
              sattNy(false);
              d.uppdatera();
              const lasfel = resultat.filter((r) => r.las_fel);
              const granska = resultat.flatMap((r) => r.granska_om || []);
              if (lasfel.length)
                notis(`${lasfel.length} filer sparades men texten kunde inte läsas`, 'fel');
              else if (granska.length)
                notis(`${granska.length} godkända servicepunkter bör granskas om`, 'info');
              else
                notis(
                  resultat.length === 1 ? 'Dokumentet är uppladdat' : `${resultat.length} dokument uppladdade`,
                  'ok'
                );
            }}
          />
        </Lada>
      )}
    </>
  );
}

/**
 * Flera manualer i taget. Filerna skickas en och en – en bunt på tjugo
 * megabyte i samma anrop är inget att göra en mobiluppkoppling till, och
 * en fil som strular ska inte sänka de andra.
 */
function LaddaUpp({ dokument, klar }) {
  const notis = useNotis();
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const [filer, sattFiler] = useState([]);
  const [slag, sattSlag] = useState('manual');
  const [gemensamUtrustning, sattGemensam] = useState('');
  const [lage, sattLage] = useState(null);

  // Filnamnet duger som dokumentnamn: "FK-200 servicemanual.pdf" är redan
  // det någon skulle skrivit in för hand.
  const las = (e) => {
    const valda = [...(e.target.files || [])];
    Promise.all(
      valda.map(
        (f) =>
          new Promise((klar_) => {
            const lasare = new FileReader();
            lasare.onload = () =>
              klar_({
                data: lasare.result,
                filnamn: f.name,
                namn: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim(),
                storlek: f.size,
                utrustning_id: '',
                ersatter_id: '',
              });
            lasare.readAsDataURL(f);
          })
      )
    ).then((nya) => sattFiler((f) => [...f, ...nya]));
    e.target.value = '';
  };

  const andra = (i, falt) => (v) => sattFiler((f) => f.map((x, j) => (i === j ? { ...x, [falt]: v } : x)));

  const ladda = async () => {
    const klara = [];
    for (const [i, f] of filer.entries()) {
      sattLage({ i, namn: f.namn, antal: filer.length });
      try {
        klara.push(
          await api.skapa('/api/underhall/dokument', {
            namn: f.namn,
            slag,
            fil: f.data,
            utrustning_id: Number(f.utrustning_id || gemensamUtrustning) || null,
            ersatter_id: f.ersatter_id ? Number(f.ersatter_id) : null,
          })
        );
      } catch (e) {
        // En trasig fil stoppar inte de andra, men den tystas inte heller.
        notis(`${f.namn}: ${e.message}`, 'fel');
      }
    }
    sattLage(null);
    if (klara.length) klar(klara);
  };

  return (
    <>
      <Falt etikett="Filer (PDF, bild eller text)" krav>
        {/* Fältet nollställs efter inläsningen så att fler filer kan väljas
            i en andra omgång. Då ljuger webbläsarens egen text om läget –
            raden under säger vad som faktiskt ligger i kön. */}
        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={las} />
      </Falt>
      <p className="liten svag">
        {filer.length
          ? `${filer.length} ${filer.length === 1 ? 'fil' : 'filer'} att ladda upp. Välj fler om du vill – varje fil blir ett eget dokument.`
          : 'Välj flera på en gång – varje fil blir ett eget dokument.'}
      </p>

      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Val
          etikett="Slag"
          varde={slag}
          satt={sattSlag}
          tomtext={null}
          poster={[
            { varde: 'manual', text: 'Manual' },
            { varde: 'ritning', text: 'Ritning' },
            { varde: 'protokoll', text: 'Protokoll' },
            { varde: 'intyg', text: 'Intyg' },
            { varde: 'ovrigt', text: 'Övrigt' },
          ]}
        />
        <Val
          etikett="Utrustning för alla"
          varde={gemensamUtrustning}
          satt={sattGemensam}
          poster={(utrustning.data || []).map((u) => ({ varde: String(u.id), text: u.namn }))}
        />
      </div>

      {filer.map((f, i) => (
        <div key={i} className="filrad">
          <div className="rad" style={{ alignItems: 'flex-end' }}>
            <Text etikett="Namn" varde={f.namn} satt={andra(i, 'namn')} />
            <Val
              etikett="Utrustning"
              varde={f.utrustning_id || gemensamUtrustning}
              satt={andra(i, 'utrustning_id')}
              poster={(utrustning.data || []).map((u) => ({ varde: String(u.id), text: u.namn }))}
            />
            <Val
              etikett="Ersätter"
              varde={f.ersatter_id}
              satt={andra(i, 'ersatter_id')}
              poster={(dokument || [])
                .filter((x) => x.aktuell)
                .map((x) => ({ varde: String(x.id), text: `${x.namn} (v${x.version})` }))}
            />
            <button className="tom" onClick={() => sattFiler(filer.filter((_, j) => j !== i))}>
              Ta bort
            </button>
          </div>
          <p className="liten svag">
            {f.filnamn} · {Math.round(f.storlek / 1024)} kB
          </p>
        </div>
      ))}

      {lage && (
        <div className="meddelande info">
          Laddar upp {lage.i + 1} av {lage.antal}: {lage.namn} …
        </div>
      )}

      <div className="knapprad">
        <button className="primar" disabled={!filer.length || !!lage} onClick={ladda}>
          {lage
            ? `Laddar upp (${lage.i + 1}/${lage.antal}) …`
            : filer.length > 1
              ? `Ladda upp ${filer.length} dokument`
              : 'Ladda upp'}
        </button>
      </div>
    </>
  );
}

function Reservdelar() {
  const notis = useNotis();
  const r = useHamta(() => api.hamta('/api/underhall/reservdelar'));
  const [ny, sattNy] = useState(false);
  const [uttag, sattUttag] = useState(null);

  if (r.laddar && !r.data) return <Vanta />;
  const delar = r.data.reservdelar;
  const bestall = delar.filter((d) => d.bestall);

  return (
    <>
      {!!bestall.length && (
        <div className="meddelande varning">
          <strong>{bestall.length} delar är på eller under minnivån:</strong>{' '}
          {bestall.map((d) => `${d.namn}${d.leverantor ? ` (${d.leverantor}${d.telefon ? `, ${d.telefon}` : ''})` : ''}`).join('; ')}.
          Beställningen gör du själv – systemet skickar ingenting.
        </div>
      )}
      <Kort
        titel="Reservdelar"
        verktyg={<button className="primar" onClick={() => sattNy(true)}>Ny reservdel</button>}
      >
        <Tabell
          rader={delar}
          standardsort="namn"
          tomtext="Inga reservdelar registrerade."
          vidKlick={sattUttag}
          kolumner={[
            { falt: 'namn', rubrik: 'Del' },
            { falt: 'artikelnummer', rubrik: 'Artikelnr', visa: (d) => d.artikelnummer || '–' },
            { falt: 'leverantor', rubrik: 'Leverantör', visa: (d) => d.leverantor || '–' },
            { falt: 'pris_ore', rubrik: 'Senaste pris', sifra: true, visa: (d) => (d.pris_ore ? kronor(d.pris_ore) : '–') },
            { falt: 'lager', rubrik: 'Lager', sifra: true, visa: (d) => `${d.lager} ${d.enhet}` },
            { falt: 'minlager', rubrik: 'Minnivå', sifra: true },
            { falt: 'forbrukning_ar', rubrik: 'Åtgång 12 mån', sifra: true },
            {
              falt: 'bestall',
              rubrik: '',
              sortlos: true,
              visa: (d) => (d.bestall ? <Bricka farg="varning">beställ</Bricka> : ''),
            },
          ]}
        />
      </Kort>
      {ny && (
        <Lada titel="Ny reservdel" stang={() => sattNy(false)} bred>
          <NyReservdel
            klar={() => {
              sattNy(false);
              r.uppdatera();
              notis('Reservdelen är sparad', 'ok');
            }}
          />
        </Lada>
      )}
      {uttag && (
        <Lada titel={uttag.namn} stang={() => sattUttag(null)} bred>
          <Uttag
            del={uttag}
            klar={() => {
              sattUttag(null);
              r.uppdatera();
            }}
          />
        </Lada>
      )}
    </>
  );
}

function NyReservdel({ klar }) {
  const notis = useNotis();
  const leverantorer = useHamta(() => api.hamta('/api/drift/leverantorer'));
  const [f, sattF] = useState({
    namn: '', artikelnummer: '', leverantor_id: '', enhet: 'st', pris: '', lager: '0', minlager: '0', placering: '',
  });
  const satt = (n) => (v) => sattF((x) => ({ ...x, [n]: v }));
  return (
    <>
      <Text etikett="Namn" varde={f.namn} satt={satt('namn')} krav placeholder="Brytpinne till lift" />
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text etikett="Artikelnummer" varde={f.artikelnummer} satt={satt('artikelnummer')} />
        <Val
          etikett="Leverantör"
          varde={f.leverantor_id}
          satt={satt('leverantor_id')}
          poster={(leverantorer.data?.leverantorer || []).map((l) => ({ varde: String(l.id), text: l.namn }))}
        />
      </div>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text etikett="Pris (kr)" typ="number" varde={f.pris} satt={satt('pris')} />
        <Text etikett="Enhet" varde={f.enhet} satt={satt('enhet')} />
        <Text etikett="I lager" typ="number" varde={f.lager} satt={satt('lager')} />
        <Text etikett="Minnivå" typ="number" varde={f.minlager} satt={satt('minlager')} />
      </div>
      <Text etikett="Placering" varde={f.placering} satt={satt('placering')} placeholder="Hyllan i pumphuset" />
      <div className="knapprad">
        <button
          className="primar"
          disabled={!f.namn.trim()}
          onClick={async () => {
            try {
              await api.skapa('/api/underhall/reservdelar', {
                ...f,
                leverantor_id: f.leverantor_id ? Number(f.leverantor_id) : null,
                pris_ore: f.pris ? Math.round(Number(f.pris) * 100) : null,
                lager: Number(f.lager || 0),
                minlager: Number(f.minlager || 0),
              });
              klar();
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Spara
        </button>
      </div>
    </>
  );
}

function Uttag({ del, klar }) {
  const notis = useNotis();
  const h = useHamta(() => api.hamta(`/api/underhall/reservdelar/${del.id}/historik`));
  const [antal, sattAntal] = useState('1');
  const [pris, sattPris] = useState('');

  const skicka = async (tecken) => {
    try {
      await api.skapa(`/api/underhall/reservdelar/${del.id}/uttag`, {
        antal: tecken * Number(antal || 0),
        pris_ore: pris ? Math.round(Number(pris) * 100) : null,
      });
      notis(tecken > 0 ? 'Uttaget är bokfört' : 'Inleveransen är bokförd', 'ok');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <>
      <dl className="uppgifter">
        <dt>Artikelnummer</dt><dd>{del.artikelnummer || '–'}</dd>
        <dt>Leverantör</dt>
        <dd>
          {del.leverantor || '–'}
          {del.telefon ? ` · ${del.telefon}` : ''}
          {del.epost ? ` · ${del.epost}` : ''}
        </dd>
        <dt>Senaste pris</dt><dd>{del.pris_ore ? `${kronor(del.pris_ore)} (${kortDatum(del.pris_datum)})` : '–'}</dd>
        <dt>Lager</dt><dd>{del.lager} {del.enhet}{del.placering ? ` · ${del.placering}` : ''}</dd>
        <dt>Passar</dt>
        <dd>
          {(h.data?.passar || []).map((p) => [p.utrustning, p.komponent].filter(Boolean).join(' · ')).join('; ') || '–'}
        </dd>
      </dl>

      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text etikett="Antal" typ="number" varde={antal} satt={sattAntal} />
        <Text etikett="Styckpris (kr)" typ="number" varde={pris} satt={sattPris} />
        <button onClick={() => skicka(1)}>Ta ut</button>
        <button onClick={() => skicka(-1)}>Lägg in</button>
      </div>

      <Kort titel="Historik" tat>
        <Tabell
          rader={h.data?.uttag || []}
          tomtext="Inga uttag ännu."
          kolumner={[
            { falt: 'tid', rubrik: 'När', visa: (u) => kortDatum(u.tid) },
            { falt: 'antal', rubrik: 'Antal', sifra: true, visa: (u) => (u.antal > 0 ? `−${u.antal}` : `+${-u.antal}`) },
            { falt: 'pris_ore', rubrik: 'Styckpris', sifra: true, visa: (u) => (u.pris_ore ? kronor(u.pris_ore) : '–') },
            { falt: 'atgard', rubrik: 'Till', visa: (u) => u.atgard || u.anteckning || '–' },
            { falt: 'av', rubrik: 'Av', visa: (u) => u.av || '–' },
          ]}
        />
      </Kort>
    </>
  );
}

function Kostnader() {
  const ar = new Date().getFullYear();
  const [fran, sattFran] = useState(`${ar}-01-01`);
  const [till, sattTill] = useState(idag());
  const k = useHamta(() => api.hamta(`/api/underhall/kostnader?fran=${fran}&till=${till}`), [fran, till]);

  if (k.laddar && !k.data) return <Vanta />;

  return (
    <>
      <Kort titel="Period" tat>
        <div className="rad" style={{ alignItems: 'flex-end' }}>
          <Text etikett="Från" typ="date" varde={fran} satt={sattFran} />
          <Text etikett="Till" typ="date" varde={till} satt={sattTill} />
        </div>
      </Kort>
      <Kort tat>
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Service" varde={kronor(k.data.summa.service_ore)} />
          <Nyckeltal etikett="Reservdelar" varde={kronor(k.data.summa.delar_ore)} />
          <Nyckeltal etikett="Reparationer" varde={kronor(k.data.summa.reparation_ore)} />
          <Nyckeltal etikett="Totalt" varde={kronor(k.data.summa.totalt_ore)} />
          <Nyckeltal etikett="Arbetstimmar" varde={k.data.summa.arbetstimmar} />
        </div>
      </Kort>
      <Kort titel="Per utrustning" undertext="Planerad service, delar och reparationer i perioden.">
        <Tabell
          rader={k.data.rader}
          standardsort="totalt_ore"
          tomtext="Inga kostnader i perioden."
          kolumner={[
            { falt: 'namn', rubrik: 'Utrustning' },
            { falt: 'service_ore', rubrik: 'Service', sifra: true, visa: (r) => kronor(r.service_ore) },
            { falt: 'delar_ore', rubrik: 'Delar', sifra: true, visa: (r) => kronor(r.delar_ore) },
            { falt: 'reparation_ore', rubrik: 'Reparationer', sifra: true, visa: (r) => kronor(r.reparation_ore) },
            { falt: 'arbetstimmar', rubrik: 'Timmar', sifra: true },
            { falt: 'totalt_ore', rubrik: 'Totalt', sifra: true, visa: (r) => <strong>{kronor(r.totalt_ore)}</strong> },
          ]}
        />
      </Kort>
    </>
  );
}
