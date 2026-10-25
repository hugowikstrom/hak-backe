// Snöplanering: från prognosfönster till folk på plats.
//
// Kedjan görs i steg med flit. Prognosen föreslår, driftansvarig väljer,
// systemet räknar fram passen och föreslår vem som ska frågas – men en
// skickad fråga är aldrig bemanning. Först ett ja är en bokning.
import { useState } from 'react';
import { api } from '../api.js';
import {
  Bricka, Falt, Flikar, Kort, Lada, Nyckeltal, Text, Tomt, useHamta, useNotis, Val, Vanta,
} from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { kortDatum, tal } from '../nytta.js';

const NIVAFARG = { garna: 'ok', kanske: 'info', vid_brist: 'varning', nej: '' };
const klockan = (t) => (t || '').slice(11, 16);
const dagOchTid = (t) => `${kortDatum((t || '').slice(0, 10))} ${klockan(t)}`;

export function Snoplan() {
  const [flik, sattFlik] = useState('fonster');
  const underskott = useHamta(() => api.hamta('/api/snoplan/underskott'), [flik]);
  const larm = underskott.data?.larm?.length ?? 0;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Snöplanering</h1>
          <div className="undertext">
            Produktionsfönster ur prognosen, och folk till passen de ger.
          </div>
        </div>
      </div>

      <Flikar
        aktiv={flik}
        satt={sattFlik}
        flikar={[
          { nyckel: 'fonster', text: 'Fönster' },
          { nyckel: 'underskott', text: larm ? `Saknas folk (${larm})` : 'Saknas folk' },
          { nyckel: 'tillganglighet', text: 'Säsongen' },
        ]}
      />

      {flik === 'fonster' && <Fonster />}
      {flik === 'underskott' && <Underskott data={underskott} />}
      {flik === 'tillganglighet' && <Tillganglighet />}
    </>
  );
}

function Fonster() {
  const notis = useNotis();
  const f = useHamta(() => api.hamta('/api/snoplan/fonster'));
  const [planera, sattPlanera] = useState(null);
  const [manuellt, sattManuellt] = useState(false);

  if (f.laddar && !f.data) return <Vanta />;

  const ta = async (p) => {
    try {
      const r = await api.skapa('/api/snoplan/fonster', {
        fran: p.fran.replace('T', ' ').slice(0, 16),
        till: p.till.replace('T', ' ').slice(0, 16),
        lagsta_wetbulb: p.lagsta,
        timmar: p.timmar,
        kalla: 'prognos',
      });
      f.uppdatera();
      sattPlanera(r.fonster);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const oppna = (f.data.sparade || []).filter((s) => !['avfardat', 'genomfort'].includes(s.status));

  return (
    <>
      <Kort
        titel="Ur prognosen"
        undertext={
          f.data.plats
            ? `Wetbulb under −2,5 °C för ${f.data.plats.namn}. Prognosen säger när det går att producera – inte att någon ska stå där.`
            : 'Prognosen är inte tillgänglig just nu.'
        }
      >
        {f.data.prognos.length === 0 ? (
          <div className="utsikt">
            <p>
              Inga produktionsfönster den närmaste veckan.
              {f.data.utsikt
                ? ` Kallaste wetbulb i prognosen är ${tal(f.data.utsikt.kallaste)} °C – gränsen går vid −2,5 °C.`
                : ''}
            </p>
            {!!f.data.utsikt?.dygn?.length && (
              <div className="dygnsrad">
                {f.data.utsikt.dygn.map((d) => (
                  <span key={d.datum} className={d.produktionstimmar ? 'dygn bra' : 'dygn'}>
                    <span className="liten svag">{kortDatum(d.datum)}</span>
                    <strong>{tal(d.wetbulb_min)}°</strong>
                    <span className="liten svag">
                      {d.produktionstimmar ? `${d.produktionstimmar} h` : '–'}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Tabell
            rader={f.data.prognos.map((p, i) => ({ id: i, ...p }))}
            tomtext="Inga fönster."
            kolumner={[
              { falt: 'fran', rubrik: 'Från', visa: (p) => dagOchTid(p.fran) },
              { falt: 'till', rubrik: 'Till', visa: (p) => dagOchTid(p.till) },
              { falt: 'timmar', rubrik: 'Timmar', sifra: true },
              { falt: 'lagsta', rubrik: 'Lägsta wetbulb', sifra: true, visa: (p) => `${tal(p.lagsta)} °C` },
              {
                falt: 'sparat',
                rubrik: '',
                sortlos: true,
                visa: (p) =>
                  p.sparat ? (
                    <Bricka farg={p.sparat.status === 'planerat' ? 'ok' : ''}>{p.sparat.status}</Bricka>
                  ) : (
                    <button onClick={() => ta(p)}>Ta det här fönstret</button>
                  ),
              },
            ]}
          />
        )}
      </Kort>

      <Kort
        titel="Fönster vi tagit ställning till"
        verktyg={<button onClick={() => sattManuellt(true)}>Lägg fönster för hand</button>}
      >
        {oppna.length === 0 ? (
          <Tomt>Inga fönster planerade.</Tomt>
        ) : (
          <Tabell
            rader={oppna}
            tomtext="Inga fönster."
            kolumner={[
              { falt: 'fran', rubrik: 'Från', visa: (p) => dagOchTid(p.fran) },
              { falt: 'till', rubrik: 'Till', visa: (p) => dagOchTid(p.till) },
              { falt: 'lagsta_wetbulb', rubrik: 'Wetbulb', sifra: true, visa: (p) => (p.lagsta_wetbulb != null ? `${tal(p.lagsta_wetbulb)} °C` : '–') },
              { falt: 'pass', rubrik: 'Pass', sifra: true },
              { falt: 'status', rubrik: 'Status', visa: (p) => <Bricka farg={p.status === 'planerat' ? 'ok' : 'varning'}>{p.status}</Bricka> },
              {
                falt: 'id',
                rubrik: '',
                sortlos: true,
                visa: (p) => (
                  <div className="knapprad liten">
                    <button onClick={() => sattPlanera(p)}>{p.pass ? 'Lägg fler pass' : 'Gör pass'}</button>
                    <button
                      className="tom"
                      onClick={async () => {
                        await api.spara(`/api/snoplan/fonster/${p.id}`, { status: 'avfardat' });
                        f.uppdatera();
                      }}
                    >
                      Avfärda
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Kort>

      {manuellt && (
        <Lada titel="Fönster för hand" stang={() => sattManuellt(false)}>
          <ManuelltFonster
            klar={(nytt) => {
              sattManuellt(false);
              f.uppdatera();
              sattPlanera(nytt);
            }}
          />
        </Lada>
      )}

      {planera && (
        <Lada titel="Gör pass av fönstret" stang={() => sattPlanera(null)} bred>
          <GorPass
            fonster={planera}
            klar={(r) => {
              sattPlanera(null);
              f.uppdatera();
              notis(
                `${r.skapade.length} pass skapade${r.hoppade.length ? `, ${r.hoppade.length} fanns redan` : ''}`,
                'ok'
              );
            }}
          />
        </Lada>
      )}
    </>
  );
}

/** Prognosen är ett underlag, inte ett villkor: det går att planera ändå. */
function ManuelltFonster({ klar }) {
  const notis = useNotis();
  const [fran, sattFran] = useState('');
  const [till, sattTill] = useState('');
  return (
    <>
      <p className="liten svag">
        Används när prognosen inte ser något men ni vet bättre – eller när ni planerar längre fram
        än prognosen räcker.
      </p>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text etikett="Från" typ="datetime-local" varde={fran} satt={sattFran} />
        <Text etikett="Till" typ="datetime-local" varde={till} satt={sattTill} />
      </div>
      <div className="knapprad">
        <button
          className="primar"
          disabled={!fran || !till}
          onClick={async () => {
            try {
              const r = await api.skapa('/api/snoplan/fonster', {
                fran: fran.replace('T', ' '),
                till: till.replace('T', ' '),
                kalla: 'manuell',
              });
              klar(r.fonster);
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Skapa fönstret
        </button>
      </div>
    </>
  );
}

function GorPass({ fonster, klar }) {
  const notis = useNotis();
  const positioner = useHamta(() => api.hamta('/api/positioner'));
  const [position_id, sattPosition] = useState('');
  const [behov, sattBehov] = useState('2');
  const [passlangd, sattPasslangd] = useState('6');
  const [forslag, sattForslag] = useState(null);
  const [sparar, sattSparar] = useState(false);

  const visa = async () => {
    try {
      const r = await api.skapa(`/api/snoplan/fonster/${fonster.id}/forslag`, {
        position_id: position_id ? Number(position_id) : null,
        behov: Number(behov),
        passlangd: Number(passlangd),
      });
      sattForslag(r.pass);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <>
      <p>
        Fönstret: <strong>{dagOchTid(fonster.fran)} – {dagOchTid(fonster.till)}</strong>
        {fonster.lagsta_wetbulb != null ? ` (ned till ${tal(fonster.lagsta_wetbulb)} °C wetbulb)` : ''}.
      </p>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Val
          etikett="Position"
          varde={position_id}
          satt={(v) => {
            sattPosition(v);
            sattForslag(null);
          }}
          krav
          poster={(positioner.data || []).map((p) => ({ varde: String(p.id), text: p.namn }))}
        />
        <Text etikett="Personer per pass" typ="number" varde={behov} satt={sattBehov} />
        <Text etikett="Passlängd (tim)" typ="number" varde={passlangd} satt={sattPasslangd} />
        <button disabled={!position_id} onClick={visa}>Visa förslag</button>
      </div>

      {forslag && (
        <>
          <Kort titel="Så här blir passen" tat>
            <Tabell
              rader={forslag.map((p, i) => ({ id: i, ...p }))}
              kolumner={[
                { falt: 'datum', rubrik: 'Datum', visa: (p) => kortDatum(p.datum) },
                { falt: 'start', rubrik: 'Start' },
                { falt: 'slut', rubrik: 'Slut' },
                { falt: 'timmar', rubrik: 'Timmar', sifra: true },
                { falt: 'slag', rubrik: 'Slag' },
                { falt: 'behov', rubrik: 'Behov', sifra: true },
                { falt: 'finns', rubrik: '', sortlos: true, visa: (p) => (p.finns ? <Bricka farg="varning">finns redan</Bricka> : '') },
              ]}
            />
          </Kort>
          <p className="liten svag">
            Passen blir bemanningsbehov, inte bemanning. Ingen är inbokad förrän hen svarat ja.
          </p>
          <div className="knapprad">
            <button
              className="primar"
              disabled={sparar}
              onClick={async () => {
                sattSparar(true);
                try {
                  klar(
                    await api.skapa(`/api/snoplan/fonster/${fonster.id}/bemanna`, {
                      position_id: Number(position_id),
                      behov: Number(behov),
                      passlangd: Number(passlangd),
                    })
                  );
                } catch (e) {
                  notis(e.message, 'fel');
                  sattSparar(false);
                }
              }}
            >
              {sparar ? 'Skapar …' : 'Skapa passen'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Underskott({ data }) {
  const [vald, sattVald] = useState(null);
  if (data.laddar && !data.data) return <Vanta />;
  const { pass, larm, summa } = data.data;

  return (
    <>
      <Kort tat>
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Pass som saknar folk" varde={summa.pass} />
          <Nyckeltal etikett="Platser" varde={summa.platser} />
          <Nyckeltal
            etikett="Ingen har frågats"
            varde={summa.oadresserade}
            farg={summa.oadresserade ? 'fara' : 'ok'}
          />
        </div>
      </Kort>

      {larm.length > 0 && (
        <div className="meddelande fel">
          <strong>{summa.oadresserade} platser som ingen fått frågan om.</strong> Ett underskott syns
          inte av sig självt – skicka förfrågningar, eller sänk behovet.
        </div>
      )}

      <Kort titel="Pass som saknar folk">
        <Tabell
          rader={pass}
          standardsort="datum"
          tomtext="Alla pass är bemannade."
          vidKlick={sattVald}
          kolumner={[
            { falt: 'datum', rubrik: 'Datum', visa: (p) => kortDatum(p.datum) },
            { falt: 'start', rubrik: 'Tid', visa: (p) => `${p.start}–${p.slut}` },
            { falt: 'position', rubrik: 'Position' },
            { falt: 'slag', rubrik: 'Slag', visa: (p) => (p.slag === 'natt' ? <Bricka farg="natt">natt</Bricka> : p.slag) },
            { falt: 'bokade', rubrik: 'Bokade', sifra: true, visa: (p) => `${p.bokade}/${p.behov}` },
            { falt: 'vantar', rubrik: 'Väntar svar', sifra: true },
            {
              falt: 'oadresserat',
              rubrik: '',
              sortlos: true,
              visa: (p) =>
                p.oadresserat > 0 ? (
                  <Bricka farg="fara">{p.oadresserat} ingen frågat</Bricka>
                ) : (
                  <Bricka farg="varning">väntar svar</Bricka>
                ),
            },
          ]}
        />
      </Kort>

      {vald && (
        <Lada titel={`${kortDatum(vald.datum)} ${vald.start}–${vald.slut} · ${vald.position}`} stang={() => sattVald(null)} bred>
          <Kandidater
            pass={vald}
            klar={() => {
              sattVald(null);
              data.uppdatera();
            }}
          />
        </Lada>
      )}
    </>
  );
}

function Kandidater({ pass, klar }) {
  const notis = useNotis();
  const k = useHamta(() => api.hamta(`/api/snoplan/pass/${pass.id}/kandidater`));
  const [valda, sattValda] = useState([]);
  const [skickar, sattSkickar] = useState(false);

  if (k.laddar && !k.data) return <Vanta />;
  const kan = k.data.kandidater.filter((x) => x.kan);
  const kan_inte = k.data.kandidater.filter((x) => !x.kan);

  const skicka = async (kropp) => {
    sattSkickar(true);
    try {
      const r = await api.skapa(`/api/snoplan/pass/${pass.id}/forfragan`, kropp);
      notis(`Frågan är skickad till ${r.skickade.length} personer`, 'ok');
      klar();
    } catch (e) {
      notis(e.message, 'fel');
      sattSkickar(false);
    }
  };

  return (
    <>
      <p className="liten svag">
        Ordningen bygger på vad var och en svarat om säsongen och hur mycket de redan gjort.
        Kompetens- och behörighetskrav går alltid före önskemål.
      </p>

      <Kort titel={`Kan ta passet (${kan.length})`} tat>
        {kan.map((x) => (
          <label key={x.medlem_id} className="kandidatrad">
            <input
              type="checkbox"
              checked={valda.includes(x.medlem_id)}
              disabled={x.fragad === 'skickad'}
              onChange={(e) =>
                sattValda((v) => (e.target.checked ? [...v, x.medlem_id] : v.filter((i) => i !== x.medlem_id)))
              }
            />
            <span className="vaxa">
              {x.namn}
              <span className="liten svag">
                {' '}
                {x.gjort_timmar != null ? `${Math.round(x.gjort_timmar)} h i säsongen` : ''}
              </span>
            </span>
            <Bricka farg={NIVAFARG[x.niva]}>{x.niva === 'vid_brist' ? 'reserv' : x.niva}</Bricka>
            {x.fragad && <Bricka farg={x.fragad === 'accepterad' ? 'ok' : x.fragad === 'avbojd' ? 'fara' : 'varning'}>{x.fragad}</Bricka>}
          </label>
        ))}
      </Kort>

      <div className="knapprad">
        <button className="primar" disabled={skickar} onClick={() => skicka({ omgang: 1 })}>
          Fråga de som kan ({pass.saknas} platser)
        </button>
        <button disabled={skickar} onClick={() => skicka({ omgang: 2 })}>
          Ta med reserverna
        </button>
        <button
          disabled={skickar || !valda.length}
          onClick={() => skicka({ medlemmar: valda })}
        >
          Fråga de valda ({valda.length})
        </button>
      </div>

      {!!kan_inte.length && (
        <Kort titel={`Kan inte (${kan_inte.length})`} tat>
          {kan_inte.map((x) => (
            <div key={x.medlem_id} className="liten">
              <strong>{x.namn}</strong> <span className="svag">— {x.hinder.join(', ')}</span>
            </div>
          ))}
        </Kort>
      )}
    </>
  );
}

function Tillganglighet() {
  const notis = useNotis();
  const t = useHamta(() => api.hamta('/api/snoplan/tillganglighet'));
  if (t.laddar && !t.data) return <Vanta />;
  if (!t.data.sasong) return <Tomt>Ingen aktiv säsong.</Tomt>;

  const svarade = t.data.alla || [];
  const saknas = t.data.saknas || [];

  return (
    <>
      <MittSvar data={t.data} uppdatera={t.uppdatera} />

      {t.data.alla && (
        <>
          <Kort tat>
            <div className="rad gap-16 hopp">
              <Nyckeltal etikett="Svarat" varde={svarade.length} />
              <Nyckeltal etikett="Vill gärna" varde={svarade.filter((s) => s.niva === 'garna').length} farg="ok" />
              <Nyckeltal etikett="Reserver" varde={svarade.filter((s) => s.niva === 'vid_brist').length} />
              <Nyckeltal etikett="Har inte svarat" varde={saknas.length} farg={saknas.length ? 'varning' : 'ok'} />
            </div>
          </Kort>

          <Kort
            titel="Säsongens svar"
            undertext="Nivån är ett önskemål om när man vill arbeta. Den ersätter inte kompetenskrav eller rättvis fördelning."
          >
            <Tabell
              rader={svarade}
              standardsort="namn"
              tomtext="Ingen har svarat ännu."
              kolumner={[
                { falt: 'namn', rubrik: 'Medlem' },
                {
                  falt: 'niva',
                  rubrik: 'Nivå',
                  visa: (s) => (
                    <Bricka farg={NIVAFARG[s.niva]}>
                      {t.data.nivaer.find((n) => n.nyckel === s.niva)?.namn || s.niva}
                    </Bricka>
                  ),
                },
                { falt: 'nattpass', rubrik: 'Natt', visa: (s) => (s.nattpass ? 'ja' : 'nej') },
                { falt: 'helger', rubrik: 'Helg', visa: (s) => (s.helger ? 'ja' : 'nej') },
                { falt: 'max_pass', rubrik: 'Tak/vecka', sifra: true, visa: (s) => s.max_pass ?? '–' },
                { falt: 'kommentar', rubrik: 'Kommentar', visa: (s) => s.kommentar || '' },
              ]}
            />
          </Kort>

          {!!saknas.length && (
            <Kort titel="Har inte svarat" undertext="De räknas som ”kan arbeta vid behov” tills de säger något annat.">
              <p className="liten">{saknas.map((m) => m.namn).join(', ')}</p>
            </Kort>
          )}
        </>
      )}
    </>
  );
}

function MittSvar({ data, uppdatera }) {
  const notis = useNotis();
  const min = data.min || {};
  const [f, sattF] = useState({
    niva: min.niva || 'kanske',
    nattpass: min.nattpass ?? 1,
    helger: min.helger ?? 1,
    max_pass: min.max_pass ?? '',
    kommentar: min.kommentar || '',
  });
  const satt = (n) => (v) => sattF((x) => ({ ...x, [n]: v }));

  return (
    <Kort
      titel="Mitt svar för säsongen"
      undertext={`${data.sasong.namn}: ${data.sasong.start} – ${data.sasong.slut}`}
    >
      <Val
        etikett="Hur vill du ha det?"
        varde={f.niva}
        satt={satt('niva')}
        tomtext={null}
        poster={data.nivaer.map((n) => ({ varde: n.nyckel, text: n.namn }))}
      />
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <label className="kryssrad">
          <input type="checkbox" checked={!!f.nattpass} onChange={(e) => satt('nattpass')(e.target.checked ? 1 : 0)} />
          Jag kan ta nattpass
        </label>
        <label className="kryssrad">
          <input type="checkbox" checked={!!f.helger} onChange={(e) => satt('helger')(e.target.checked ? 1 : 0)} />
          Jag kan ta helgpass
        </label>
        <Text etikett="Högst antal pass per vecka" typ="number" varde={f.max_pass} satt={satt('max_pass')} />
      </div>
      <Falt etikett="Något vi bör veta">
        <textarea
          value={f.kommentar}
          onChange={(e) => satt('kommentar')(e.target.value)}
          rows={2}
          placeholder="Kan inte veckorna 2–3, men gärna helger annars"
        />
      </Falt>
      <div className="knapprad">
        <button
          className="primar"
          onClick={async () => {
            try {
              await api.spara('/api/snoplan/tillganglighet', {
                ...f,
                max_pass: f.max_pass === '' ? null : Number(f.max_pass),
              });
              uppdatera();
              notis('Ditt svar är sparat', 'ok');
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Spara
        </button>
      </div>
    </Kort>
  );
}
