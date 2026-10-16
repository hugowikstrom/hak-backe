// Träning: tillfällen, närvaro och underlaget för aktivitetsstöd.
import { useState } from 'react';
import { api, fragestrang } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Lada, Nyckeltal, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { DAGNAMN, idag, langDatum, plusDagar } from '../nytta.js';

const far = (jag, b) => (jag.behorigheter || []).includes(b);
const SLAG = {
  traning: 'Träning', tavling: 'Tävling', lager: 'Läger', mote: 'Möte', arbetsdag: 'Arbetsdag',
};

export function Traning() {
  const jag = useJag();
  const [flik, sattFlik] = useState('tillfallen');
  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Träning</h1>
          <div className="undertext">Träningstillfällen, närvaro och aktivitetsstöd</div>
        </div>
      </div>
      <Flikar
        flikar={[
          { nyckel: 'tillfallen', text: 'Tillfällen och närvaro' },
          { nyckel: 'stod', text: 'Aktivitetsstöd' },
          { nyckel: 'rapport', text: 'Medlemsrapport' },
        ]}
        aktiv={flik}
        satt={sattFlik}
      />
      {flik === 'tillfallen' && <Tillfallen jag={jag} />}
      {flik === 'stod' && <Stod jag={jag} />}
      {flik === 'rapport' && <Medlemsrapport jag={jag} />}
    </>
  );
}

function Tillfallen({ jag }) {
  const notis = useNotis();
  const [period, sattPeriod] = useState({ fran: plusDagar(idag(), -30), till: plusDagar(idag(), 30) });
  const [grupp, sattGrupp] = useState('');
  const forening = useHamta(() => api.hamta('/api/forening'));
  const lista = useHamta(
    () => api.hamta(`/api/traning/tillfallen${fragestrang({ ...period, grupp_id: grupp })}`),
    [period.fran, period.till, grupp]
  );
  const [valt, sattValt] = useState(null);
  const [serie, sattSerie] = useState(false);
  const grupper = (forening.data?.sektioner || []).flatMap((s) => s.grupper);

  if (lista.laddar && !lista.data) return <Vanta />;

  return (
    <>
      <Kort
        titel="Träningstillfällen"
        undertext={`${lista.data.length} i perioden`}
        verktyg={
          <>
            <Val etikett="" varde={grupp} satt={sattGrupp} tomtext="Alla grupper" poster={grupper.map((g) => ({ varde: g.id, text: g.namn }))} />
            <Text etikett="" typ="date" varde={period.fran} satt={(v) => sattPeriod((p) => ({ ...p, fran: v }))} />
            <Text etikett="" typ="date" varde={period.till} satt={(v) => sattPeriod((p) => ({ ...p, till: v }))} />
            {far(jag, 'traning') && <button className="primar liten" onClick={() => sattSerie(true)}>Lägg upp träningsfönster</button>}
          </>
        }
        tat
      >
        <Tabell
          rader={lista.data}
          maxhojd="60vh"
          tomtext="Inga tillfällen i perioden."
          vidKlick={(t) => sattValt(t.id)}
          kolumner={[
            { falt: 'datum', rubrik: 'Datum', visa: (t) => <span className="num">{langDatum(t.datum)}</span> },
            { falt: 'start', rubrik: 'Tid', visa: (t) => <span className="num">{t.start}–{t.slut}</span> },
            { falt: 'grupp', rubrik: 'Grupp', visa: (t) => <strong>{t.grupp || t.sektion || '–'}</strong> },
            { falt: 'rubrik', rubrik: 'Vad', visa: (t) => t.rubrik || SLAG[t.slag] },
            { falt: 'plats', rubrik: 'Plats' },
            { falt: 'deltagare', rubrik: 'Deltagare', sifra: true },
            { falt: 'ledare', rubrik: 'Ledare', sifra: true },
            {
              falt: 'installt', rubrik: 'Status',
              visa: (t) =>
                t.installt ? <Bricka farg="fara">Inställt</Bricka> : t.deltagare ? <Bricka farg="ok">Närvaro tagen</Bricka> : <Bricka farg="varning">Ingen närvaro</Bricka>,
            },
          ]}
        />
      </Kort>

      {valt && (
        <NarvaroLada
          id={valt}
          jag={jag}
          stang={() => { sattValt(null); lista.uppdatera(); }}
        />
      )}
      {serie && (
        <SerieLada
          grupper={grupper}
          stang={() => sattSerie(false)}
          klar={(r) => { sattSerie(false); lista.uppdatera(); notis(`${r.antal} tillfällen lades upp för ${r.grupp}.`); }}
        />
      )}
    </>
  );
}

function NarvaroLada({ id, jag, stang }) {
  const notis = useNotis();
  const { data: t, laddar, uppdatera } = useHamta(() => api.hamta(`/api/traning/tillfallen/${id}`), [id]);
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [lagg, sattLagg] = useState('');
  const [sparar, sattSparar] = useState(false);

  if (laddar && !t) return <Lada titel="Närvaro" stang={stang}><Vanta /></Lada>;

  const satt = async (medlem_id, narvarande, roll) => {
    sattSparar(true);
    try {
      await api.spara(`/api/traning/tillfallen/${t.id}/narvaro`, { narvaro: [{ medlem_id, narvarande, roll }] });
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSparar(false);
    }
  };

  const narvarande = t.deltagare.filter((d) => d.narvarande).length;
  return (
    <Lada
      bred
      titel={`${t.grupp || SLAG[t.slag]} · ${langDatum(t.datum)} ${t.start || ''}`}
      stang={stang}
      fot={
        <>
          <span className="vaxa liten svag">{narvarande} av {t.deltagare.length} närvarande</span>
          <button className="primar" onClick={stang}>Klar</button>
        </>
      }
    >
      <div className="rad hopp">
        <Bricka farg="info">{SLAG[t.slag]}</Bricka>
        {t.plats && <Bricka>{t.plats}</Bricka>}
        {t.installt && <Bricka farg="fara">Inställt</Bricka>}
        <span className="liten svag">{t.start}–{t.slut}</span>
      </div>

      {far(jag, 'traning') && (
        <div className="faltrad">
          <Val
            etikett="Lägg till någon som inte är i gruppen"
            varde={lagg}
            satt={sattLagg}
            tomtext="– välj –"
            poster={(medlemmar.data || [])
              .filter((m) => m.aktiv && !t.deltagare.some((d) => d.medlem_id === m.id))
              .map((m) => ({ varde: m.id, text: m.namn }))}
          />
          <button
            disabled={!lagg}
            onClick={() => {
              satt(Number(lagg), true, 'deltagare');
              sattLagg('');
            }}
          >
            Lägg till som närvarande
          </button>
        </div>
      )}

      <div className="kort lista" style={{ boxShadow: 'none', opacity: sparar ? 0.7 : 1 }}>
        {t.deltagare.map((d) => (
          <div className="post" key={d.id || d.medlem_id} style={{ display: 'flex', padding: '8px 10px', borderBottom: '1px solid var(--ram)' }}>
            <span className="vaxa">
              <strong>{d.namn}</strong>
              {d.fodelsedatum && <span className="liten svag"> · {d.fodelsedatum.slice(0, 4)}</span>}
              {d.roll === 'ledare' && <Bricka farg="info">ledare</Bricka>}
            </span>
            <div className="knapprad">
              <button
                className={d.narvarande ? 'primar liten' : 'liten'}
                disabled={!far(jag, 'traning')}
                onClick={() => satt(d.medlem_id, true, d.roll)}
              >
                Här
              </button>
              <button
                className={!d.narvarande ? 'liten fara' : 'liten'}
                disabled={!far(jag, 'traning')}
                onClick={() => satt(d.medlem_id, false, d.roll)}
              >
                Borta
              </button>
            </div>
          </div>
        ))}
        {!t.deltagare.length && <Tomt>Ingen i gruppen ännu.</Tomt>}
      </div>
    </Lada>
  );
}

function SerieLada({ grupper, stang, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({
    grupp_id: grupper[0]?.id || '',
    fran: idag(),
    till: plusDagar(idag(), 90),
    start: '17:30',
    slut: '19:30',
    plats: 'Vårdkasbacken',
  });
  const [dagar, sattDagar] = useState([1, 3]);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));

  return (
    <Lada
      titel="Lägg upp träningsfönster"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button
            className="primar"
            disabled={!f.grupp_id || !dagar.length}
            onClick={async () => {
              try {
                klar(await api.skapa('/api/traning/tillfallen/serie', { ...f, veckodagar: dagar }));
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Lägg upp
          </button>
        </>
      }
    >
      <p className="liten svag">
        Tränaren lägger upp hela terminen på en gång. Gruppens medlemmar förifylls på varje tillfälle,
        och närvaron prickas av på plats. Tillfällen som redan finns hoppas över.
      </p>
      <div className="faltrad">
        <Val etikett="Grupp" varde={f.grupp_id} satt={satt('grupp_id')} tomtext={null} poster={grupper.map((g) => ({ varde: g.id, text: g.namn }))} />
        <Text etikett="Från" typ="date" varde={f.fran} satt={satt('fran')} />
        <Text etikett="Till" typ="date" varde={f.till} satt={satt('till')} />
        <Text etikett="Start" varde={f.start} satt={satt('start')} />
        <Text etikett="Slut" varde={f.slut} satt={satt('slut')} />
        <Text etikett="Plats" varde={f.plats} satt={satt('plats')} />
      </div>
      <div>
        <h4>Veckodagar</h4>
        <div className="segment">
          {DAGNAMN.map((d, i) => (
            <button
              key={d}
              aria-pressed={dagar.includes(i)}
              onClick={() => sattDagar((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]))}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </Lada>
  );
}

function Stod({ jag }) {
  const [regel, sattRegel] = useState('lok');
  const { data, laddar } = useHamta(() => api.hamta(`/api/traning/stod?regel=${regel}`), [regel]);
  if (laddar && !data) return <Vanta />;
  if (!data) return <div className="meddelande fel">Kunde inte hämta underlaget.</div>;

  return (
    <>
      <Kort
        titel={data.regel.namn}
        undertext={`Rapporteras till ${data.regel.mottagare} · ${data.period.namn} ${data.fran} – ${data.till}`}
        verktyg={
          <>
            <div className="segment">
              {Object.entries(data.regler).map(([n, r]) => (
                <button key={n} aria-pressed={regel === n} onClick={() => sattRegel(n)}>
                  {n === 'lok' ? 'LOK-stöd' : 'Kommunen'}
                </button>
              ))}
            </div>
            <a className="knapp liten" href={`/api/traning/stod.csv?regel=${regel}`}>CSV</a>
          </>
        }
      >
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Sammankomster" varde={data.sammankomster} />
          <Nyckeltal etikett="Deltagartillfällen" varde={data.deltagartillfallen} />
          <Nyckeltal etikett="Ledartillfällen" varde={data.ledartillfallen} />
          <Nyckeltal etikett="Underkända" varde={data.underkanda.length} farg={data.underkanda.length ? 'varning' : 'ok'} />
        </div>
        <p className="liten svag" style={{ marginTop: 8 }}>
          Villkor: deltagare {data.regel.alder_min}–{data.regel.alder_max} år, minst {data.regel.min_deltagare} deltagare
          och en ledare, minst {data.regel.min_minuter} minuter. Sista rapportdag: {data.period.sista_rapportdag}.
          Siffrorna är underlag – inrapporteringen görs i {data.regel.mottagare.includes('Idrott') ? 'IdrottOnline' : 'kommunens system'}.
        </p>
        {!!data.saknar_fodelsedatum && (
          <div className="meddelande varning">
            {data.saknar_fodelsedatum} deltagartillfällen saknar födelsedatum i matrikeln och kan därför inte räknas.
          </div>
        )}
      </Kort>

      <div className="tva">
        <Kort titel="Per grupp" tat>
          <Tabell
            rader={data.per_grupp}
            nyckel={(g) => g.grupp}
            tomtext="Inga godkända sammankomster."
            kolumner={[
              { falt: 'grupp', rubrik: 'Grupp' },
              { falt: 'sammankomster', rubrik: 'Sammankomster', sifra: true },
              { falt: 'deltagartillfallen', rubrik: 'Deltagartillfällen', sifra: true },
              { falt: 'ledartillfallen', rubrik: 'Ledartillfällen', sifra: true },
            ]}
          />
        </Kort>
        <Kort titel="Tillfällen som inte räknas" undertext="Rätta till dem innan rapporten skickas" tat>
          <Tabell
            rader={data.underkanda}
            nyckel={(t) => t.id}
            maxhojd="40vh"
            tomtext="Alla tillfällen uppfyller villkoren."
            kolumner={[
              { falt: 'datum', rubrik: 'Datum' },
              { falt: 'grupp', rubrik: 'Grupp' },
              { falt: 'deltagare_i_alder', rubrik: 'I åldern', sifra: true },
              { falt: 'minuter', rubrik: 'Minuter', sifra: true },
              { falt: 'brister', rubrik: 'Varför', visa: (t) => t.brister.join(', ') },
            ]}
          />
        </Kort>
      </div>
    </>
  );
}

function Medlemsrapport({ jag }) {
  const { data, laddar, fel } = useHamta(() => api.hamta('/api/traning/medlemsrapport'));
  if (fel) return <div className="meddelande fel">{fel}</div>;
  if (laddar && !data) return <Vanta />;
  return (
    <>
      <Kort titel={`Medlemsunderlag ${data.ar}`} undertext="Till förbund, kommun och årsmötet">
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Medlemmar" varde={data.totalt} />
          <Nyckeltal etikett="Licenser" varde={data.licenser?.antal ?? 0} />
          <Nyckeltal etikett="Saknar födelsedatum" varde={data.saknar_fodelsedatum} farg={data.saknar_fodelsedatum ? 'varning' : 'ok'} />
        </div>
      </Kort>
      <div className="rutor bred">
        <Kort titel="Per åldersspann" tat>
          <Tabell
            rader={data.per_aldersspann}
            nyckel={(r) => r.spann}
            kolumner={[{ falt: 'spann', rubrik: 'Ålder' }, { falt: 'antal', rubrik: 'Antal', sifra: true }]}
          />
        </Kort>
        <Kort titel="Per kategori" tat>
          <Tabell
            rader={data.per_kategori}
            nyckel={(r) => r.kategori}
            kolumner={[{ falt: 'kategori', rubrik: 'Kategori' }, { falt: 'antal', rubrik: 'Antal', sifra: true }]}
          />
        </Kort>
        <Kort titel="Per sektion" tat>
          <Tabell
            rader={data.per_sektion}
            nyckel={(r) => r.sektion}
            kolumner={[{ falt: 'sektion', rubrik: 'Sektion' }, { falt: 'antal', rubrik: 'Aktiva', sifra: true }]}
          />
        </Kort>
      </div>
    </>
  );
}
