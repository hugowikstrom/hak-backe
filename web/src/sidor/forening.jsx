// Föreningen: matrikel, sektioner, träningsgrupper och förtroendeuppdrag.
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Lada, Nyckeltal, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { idag, ROLLNAMN } from '../nytta.js';

const far = (jag, b) => (jag.behorigheter || []).includes(b);

const KATEGORI = {
  aktiv: 'Aktiv', stod: 'Stödmedlem', familj: 'Familjemedlem',
  heders: 'Hedersmedlem', ledare: 'Ledare', provapa: 'Prova på',
};

export function Forening() {
  const jag = useJag();
  const [flik, sattFlik] = useState('matrikel');
  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Föreningen</h1>
          <div className="undertext">Matrikel, sektioner, träningsgrupper och uppdrag</div>
        </div>
      </div>
      <Flikar
        flikar={[
          { nyckel: 'matrikel', text: 'Matrikel' },
          { nyckel: 'grupper', text: 'Sektioner och grupper' },
          { nyckel: 'styrelse', text: 'Styrelse och uppdrag' },
        ]}
        aktiv={flik}
        satt={sattFlik}
      />
      {flik === 'matrikel' && <Matrikel jag={jag} />}
      {flik === 'grupper' && <Grupper jag={jag} />}
      {flik === 'styrelse' && <Styrelse jag={jag} />}
    </>
  );
}

function alder(fodelsedatum) {
  if (!fodelsedatum) return null;
  const f = new Date(`${fodelsedatum}T12:00:00`);
  const nu = new Date();
  let a = nu.getFullYear() - f.getFullYear();
  if (nu < new Date(nu.getFullYear(), f.getMonth(), f.getDate())) a -= 1;
  return a;
}

function Matrikel({ jag }) {
  const notis = useNotis();
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [sok, sattSok] = useState('');
  const [kategori, sattKategori] = useState('');
  const [valt, sattValt] = useState(null);
  const far_se = far(jag, 'medlemsregister');

  const rader = useMemo(() => {
    const alla = medlemmar.data || [];
    const s = sok.trim().toLowerCase();
    return alla
      .filter((m) => (kategori ? (m.kategori || 'aktiv') === kategori : true))
      .filter((m) =>
        !s ||
        m.namn.toLowerCase().includes(s) ||
        (m.epost || '').toLowerCase().includes(s) ||
        (m.medlemsnummer || '').includes(s) ||
        (m.ort || '').toLowerCase().includes(s)
      );
  }, [medlemmar.data, sok, kategori]);

  if (medlemmar.laddar && !medlemmar.data) return <Vanta />;

  const aktiva = (medlemmar.data || []).filter((m) => m.aktiv);
  return (
    <>
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Medlemmar" varde={aktiva.length} />
            <Nyckeltal etikett="Under 18" varde={aktiva.filter((m) => alder(m.fodelsedatum) != null && alder(m.fodelsedatum) < 18).length} />
            <Nyckeltal etikett="Ledare och tränare" varde={aktiva.filter((m) => ['ledare'].includes(m.kategori) || m.roll === 'tranare').length} />
            <Nyckeltal etikett="Saknar födelsedatum" varde={aktiva.filter((m) => !m.fodelsedatum).length} farg={aktiva.some((m) => !m.fodelsedatum) ? 'gul' : 'gron'} />
          </div>
          {!far_se && (
            <p className="liten svag" style={{ marginTop: 8, marginBottom: 0 }}>
              Du ser namn och roll. Personuppgifter visas bara för styrelsen och medlemsansvariga.
            </p>
          )}
        </Kort>
      </div>

      <Kort
        titel="Matrikel"
        undertext={`${rader.length} av ${(medlemmar.data || []).length}`}
        verktyg={
          <>
            <Text etikett="" varde={sok} satt={sattSok} placeholder="Sök namn, ort, nummer" />
            <Val
              etikett="" varde={kategori} satt={sattKategori} tomtext="Alla kategorier"
              poster={Object.entries(KATEGORI).map(([v, t]) => ({ varde: v, text: t }))}
            />
          </>
        }
        tat
      >
        <Tabell
          rader={rader}
          maxhojd="60vh"
          vidKlick={far_se ? (m) => sattValt(m) : undefined}
          tomtext="Ingen medlem matchar."
          kolumner={[
            { falt: 'medlemsnummer', rubrik: 'Nr', visa: (m) => <span className="num">{m.medlemsnummer || '–'}</span> },
            { falt: 'namn', rubrik: 'Namn', visa: (m) => <strong>{m.namn}</strong> },
            ...(far_se
              ? [
                  { falt: 'fodelsedatum', rubrik: 'Född', visa: (m) => (m.fodelsedatum ? `${m.fodelsedatum} (${alder(m.fodelsedatum)} år)` : '–') },
                  { falt: 'ort', rubrik: 'Ort' },
                  { falt: 'epost', rubrik: 'E-post' },
                  { falt: 'telefon', rubrik: 'Telefon' },
                  { falt: 'malsman_namn', rubrik: 'Målsman' },
                ]
              : []),
            { falt: 'kategori', rubrik: 'Kategori', visa: (m) => <Bricka>{KATEGORI[m.kategori] || 'Aktiv'}</Bricka> },
            { falt: 'roll', rubrik: 'Roll', visa: (m) => ROLLNAMN[m.roll] || m.roll },
            {
              falt: 'uppdrag', rubrik: 'Uppdrag',
              visa: (m) =>
                m.uppdrag?.length ? (
                  <span className="rad" style={{ gap: 3, flexWrap: 'wrap' }}>
                    {m.uppdrag.map((u) => <span className="chip" key={u.id}>{u.slag}</span>)}
                  </span>
                ) : (
                  <span className="svagare">–</span>
                ),
            },
            { falt: 'aktiv', rubrik: 'Aktiv', visa: (m) => (m.aktiv ? <Bricka farg="gron">ja</Bricka> : <Bricka>nej</Bricka>) },
          ]}
        />
      </Kort>

      {valt && (
        <MedlemsLada
          medlem={valt}
          stang={() => sattValt(null)}
          klar={() => { sattValt(null); medlemmar.uppdatera(); notis('Sparat.'); }}
        />
      )}
    </>
  );
}

function MedlemsLada({ medlem, stang, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({ ...medlem });
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  return (
    <Lada
      bred
      titel={medlem.namn}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button
            className="primar"
            onClick={async () => {
              try {
                await api.spara(`/api/medlemmar/${medlem.id}`, {
                  namn: f.namn, epost: f.epost, telefon: f.telefon,
                  medlemsnummer: f.medlemsnummer, fornamn: f.fornamn, efternamn: f.efternamn,
                  fodelsedatum: f.fodelsedatum, adress: f.adress, postnummer: f.postnummer, ort: f.ort,
                  kategori: f.kategori, intradesdatum: f.intradesdatum, utradesdatum: f.utradesdatum,
                  malsman_namn: f.malsman_namn, malsman_telefon: f.malsman_telefon, malsman_epost: f.malsman_epost,
                  nodkontakt_namn: f.nodkontakt_namn, nodkontakt_telefon: f.nodkontakt_telefon,
                  licens: f.licens, licens_till: f.licens_till,
                  samtycke_bild: f.samtycke_bild ? 1 : 0,
                  belastningsregister_visat: f.belastningsregister_visat,
                  anteckning: f.anteckning,
                });
                klar();
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Spara
          </button>
        </>
      }
    >
      <h4>Person</h4>
      <div className="faltrad">
        <Text etikett="Medlemsnummer" varde={f.medlemsnummer || ''} satt={satt('medlemsnummer')} />
        <Text etikett="Förnamn" varde={f.fornamn || ''} satt={satt('fornamn')} />
        <Text etikett="Efternamn" varde={f.efternamn || ''} satt={satt('efternamn')} />
        <Text etikett="Visningsnamn" varde={f.namn || ''} satt={satt('namn')} />
        <Text etikett="Födelsedatum" typ="date" varde={f.fodelsedatum || ''} satt={satt('fodelsedatum')} />
        <Val
          etikett="Kategori" varde={f.kategori || 'aktiv'} satt={satt('kategori')} tomtext={null}
          poster={Object.entries(KATEGORI).map(([v, t]) => ({ varde: v, text: t }))}
        />
      </div>

      <h4>Kontakt</h4>
      <div className="faltrad">
        <Text etikett="E-post" typ="email" varde={f.epost || ''} satt={satt('epost')} />
        <Text etikett="Telefon" varde={f.telefon || ''} satt={satt('telefon')} />
        <Text etikett="Adress" varde={f.adress || ''} satt={satt('adress')} />
        <Text etikett="Postnummer" varde={f.postnummer || ''} satt={satt('postnummer')} />
        <Text etikett="Ort" varde={f.ort || ''} satt={satt('ort')} />
      </div>

      <h4>Målsman och nödkontakt</h4>
      <div className="faltrad">
        <Text etikett="Målsman" varde={f.malsman_namn || ''} satt={satt('malsman_namn')} />
        <Text etikett="Målsmans telefon" varde={f.malsman_telefon || ''} satt={satt('malsman_telefon')} />
        <Text etikett="Målsmans e-post" varde={f.malsman_epost || ''} satt={satt('malsman_epost')} />
        <Text etikett="Nödkontakt" varde={f.nodkontakt_namn || ''} satt={satt('nodkontakt_namn')} />
        <Text etikett="Nödkontaktens telefon" varde={f.nodkontakt_telefon || ''} satt={satt('nodkontakt_telefon')} />
      </div>

      <h4>Medlemskap, licens och samtycken</h4>
      <div className="faltrad">
        <Text etikett="Inträde" typ="date" varde={f.intradesdatum || ''} satt={satt('intradesdatum')} />
        <Text etikett="Utträde" typ="date" varde={f.utradesdatum || ''} satt={satt('utradesdatum')} />
        <Text etikett="Tävlingslicens" varde={f.licens || ''} satt={satt('licens')} />
        <Text etikett="Licens giltig till" typ="date" varde={f.licens_till || ''} satt={satt('licens_till')} />
        <Text etikett="Belastningsregister visat" typ="date" varde={f.belastningsregister_visat || ''} satt={satt('belastningsregister_visat')} />
      </div>
      <Ruta etikett="Samtycker till bilder i klubbens kanaler" pa={!!f.samtycke_bild} satt={satt('samtycke_bild')} />
      <Text etikett="Anteckning" varde={f.anteckning || ''} satt={satt('anteckning')} />

      <div className="meddelande info">
        Personuppgifterna används för medlemsadministration, träning och rapportering till förbund och kommun.
        Ledare som tränar barn ska ha visat utdrag ur belastningsregistret.
      </div>
    </Lada>
  );
}

function Grupper({ jag }) {
  const notis = useNotis();
  const forening = useHamta(() => api.hamta('/api/forening'));
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [valdGrupp, sattValdGrupp] = useState(null);
  const [nyGrupp, sattNyGrupp] = useState(false);

  if (forening.laddar && !forening.data) return <Vanta />;
  const sektioner = forening.data.sektioner;

  return (
    <>
      {sektioner.map((s) => (
        <Kort
          key={s.id}
          titel={s.namn}
          undertext={s.beskrivning}
          verktyg={
            far(jag, 'traning') && (
              <button className="liten" onClick={() => sattNyGrupp({ sektion_id: s.id })}>Ny grupp</button>
            )
          }
          tat
        >
          {s.grupper.length ? (
            <Tabell
              rader={s.grupper}
              vidKlick={(g) => sattValdGrupp(g.id)}
              kolumner={[
                { falt: 'namn', rubrik: 'Grupp', visa: (g) => <strong>{g.namn}</strong> },
                { falt: 'aldersspann', rubrik: 'Ålder' },
                { falt: 'dag', rubrik: 'Träningstider', visa: (g) => [g.dag, g.tid].filter(Boolean).join(' ') },
                { falt: 'antal_aktiva', rubrik: 'Aktiva', sifra: true },
                {
                  falt: 'tranare', rubrik: 'Tränare',
                  visa: (g) => g.tranare.map((t) => t.namn).join(', ') || <span className="svagare">–</span>,
                },
                { falt: 'aktiv', rubrik: 'Status', visa: (g) => (g.aktiv ? <Bricka farg="gron">Aktiv</Bricka> : <Bricka>Vilande</Bricka>) },
              ]}
            />
          ) : (
            <Tomt>Inga grupper i sektionen.</Tomt>
          )}
        </Kort>
      ))}

      {valdGrupp && (
        <GruppLada
          id={valdGrupp}
          jag={jag}
          medlemmar={medlemmar.data || []}
          stang={() => sattValdGrupp(null)}
          uppdaterat={() => forening.uppdatera()}
        />
      )}
      {nyGrupp && (
        <NyGruppLada
          sektion_id={nyGrupp.sektion_id}
          stang={() => sattNyGrupp(false)}
          klar={() => { sattNyGrupp(false); forening.uppdatera(); notis('Gruppen skapad.'); }}
        />
      )}
    </>
  );
}

function GruppLada({ id, jag, medlemmar, stang, uppdaterat }) {
  const notis = useNotis();
  const { data: g, laddar, uppdatera } = useHamta(() => api.hamta(`/api/forening/grupper/${id}`), [id]);
  const [lagg, sattLagg] = useState('');
  const [roll, sattRoll] = useState('aktiv');

  if (laddar && !g) return <Lada titel="Grupp" stang={stang}><Vanta /></Lada>;

  return (
    <Lada
      bred
      titel={`${g.namn}${g.sektion ? ` · ${g.sektion}` : ''}`}
      stang={stang}
      fot={<button className="primar" onClick={stang}>Stäng</button>}
    >
      <div className="rad hopp">
        {g.aldersspann && <Bricka>{g.aldersspann}</Bricka>}
        {g.dag && <Bricka>{g.dag} {g.tid}</Bricka>}
        <Bricka farg="klubb">{g.antal_aktiva} aktiva</Bricka>
      </div>
      {g.beskrivning && <p className="brodtext">{g.beskrivning}</p>}

      {far(jag, 'traning') && (
        <div className="faltrad">
          <Val
            etikett="Lägg till medlem" varde={lagg} satt={sattLagg} tomtext="– välj –"
            poster={medlemmar
              .filter((m) => m.aktiv && !g.medlemmar.some((x) => x.medlem_id === m.id))
              .map((m) => ({ varde: m.id, text: m.namn }))}
          />
          <Val
            etikett="Som" varde={roll} satt={sattRoll} tomtext={null}
            poster={[
              { varde: 'aktiv', text: 'Aktiv' }, { varde: 'tranare', text: 'Tränare' },
              { varde: 'hjalptranare', text: 'Hjälptränare' }, { varde: 'foralder', text: 'Förälder' },
            ]}
          />
          <button
            disabled={!lagg}
            onClick={async () => {
              try {
                await api.skapa(`/api/forening/grupper/${g.id}/medlemmar`, { medlem_id: lagg, roll });
                sattLagg('');
                uppdatera();
                uppdaterat();
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Lägg till
          </button>
        </div>
      )}

      <Tabell
        rader={g.medlemmar}
        tomtext="Ingen i gruppen ännu."
        kolumner={[
          { falt: 'namn', rubrik: 'Namn', visa: (m) => <strong>{m.namn}</strong> },
          { falt: 'roll', rubrik: 'Roll', visa: (m) => <Bricka farg={m.roll === 'tranare' ? 'klubb' : ''}>{m.roll}</Bricka> },
          { falt: 'epost', rubrik: 'E-post' },
          { falt: 'telefon', rubrik: 'Telefon' },
          ...(far(jag, 'traning')
            ? [{
                falt: 'bort', rubrik: '', sortlos: true,
                visa: (m) => (
                  <button
                    className="liten fara"
                    onClick={async () => {
                      await api.tabort(`/api/forening/gruppmedlemmar/${m.id}`);
                      uppdatera();
                      uppdaterat();
                    }}
                  >
                    Ta bort
                  </button>
                ),
              }]
            : []),
        ]}
      />
    </Lada>
  );
}

function NyGruppLada({ sektion_id, stang, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({ namn: '', aldersspann: '', dag: '', tid: '', beskrivning: '' });
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  return (
    <Lada
      titel="Ny träningsgrupp"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button
            className="primar"
            disabled={!f.namn.trim()}
            onClick={async () => {
              try {
                await api.skapa('/api/forening/grupper', { ...f, sektion_id });
                klar();
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Skapa
          </button>
        </>
      }
    >
      <div className="faltrad">
        <Text etikett="Namn" varde={f.namn} satt={satt('namn')} placeholder="U12" />
        <Text etikett="Åldersspann" varde={f.aldersspann} satt={satt('aldersspann')} placeholder="11–12 år" />
        <Text etikett="Dagar" varde={f.dag} satt={satt('dag')} placeholder="Tisdag och torsdag" />
        <Text etikett="Tid" varde={f.tid} satt={satt('tid')} placeholder="17:30–19:30" />
      </div>
      <Text etikett="Beskrivning" varde={f.beskrivning} satt={satt('beskrivning')} />
    </Lada>
  );
}

function Styrelse({ jag }) {
  const notis = useNotis();
  const forening = useHamta(() => api.hamta('/api/forening'));
  const uppdrag = useHamta(() => (far(jag, 'medlemsregister') ? api.hamta('/api/forening/uppdrag') : Promise.resolve([])));
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [ny, sattNy] = useState(false);

  if (forening.laddar && !forening.data) return <Vanta />;

  return (
    <>
      <Kort titel="Styrelsen" undertext="Förtroendevalda med pågående uppdrag" tat>
        <Tabell
          rader={forening.data.styrelse}
          tomtext="Inga styrelseuppdrag registrerade."
          kolumner={[
            { falt: 'slag', rubrik: 'Post', visa: (u) => <strong>{forening.data.uppdragsslag[u.slag] || u.slag}</strong> },
            { falt: 'namn', rubrik: 'Namn' },
            { falt: 'epost', rubrik: 'E-post' },
            { falt: 'telefon', rubrik: 'Telefon' },
            { falt: 'fran', rubrik: 'Sedan' },
          ]}
        />
      </Kort>

      {far(jag, 'medlemsregister') && (
        <Kort
          titel="Alla uppdrag"
          undertext="Uppdrag ger behörigheter vid sidan av rollen"
          verktyg={<button className="primar liten" onClick={() => sattNy(true)}>Nytt uppdrag</button>}
          tat
        >
          <Tabell
            rader={uppdrag.data || []}
            maxhojd="50vh"
            tomtext="Inga uppdrag."
            kolumner={[
              { falt: 'namn', rubrik: 'Medlem', visa: (u) => <strong>{u.namn}</strong> },
              { falt: 'slag', rubrik: 'Uppdrag', visa: (u) => forening.data.uppdragsslag[u.slag] || u.slag },
              { falt: 'sektion', rubrik: 'Sektion' },
              { falt: 'grupp', rubrik: 'Grupp' },
              { falt: 'fran', rubrik: 'Från' },
              { falt: 'till', rubrik: 'Till', visa: (u) => u.till || <span className="svagare">pågående</span> },
              {
                falt: 'bort', rubrik: '', sortlos: true,
                visa: (u) => (
                  <button
                    className="liten fara"
                    onClick={async () => {
                      if (!confirm(`Ta bort uppdraget ${u.slag} för ${u.namn}?`)) return;
                      await api.tabort(`/api/forening/uppdrag/${u.id}`);
                      uppdrag.uppdatera();
                      forening.uppdatera();
                    }}
                  >
                    Ta bort
                  </button>
                ),
              },
            ]}
          />
        </Kort>
      )}

      {ny && (
        <Lada
          titel="Nytt uppdrag"
          stang={() => sattNy(false)}
          fot={<button onClick={() => sattNy(false)}>Stäng</button>}
        >
          <NyttUppdrag
            medlemmar={(medlemmar.data || []).filter((m) => m.aktiv)}
            slag={forening.data.uppdragsslag}
            sektioner={forening.data.sektioner}
            klar={() => { sattNy(false); uppdrag.uppdatera(); forening.uppdatera(); notis('Uppdraget tillagt.'); }}
          />
        </Lada>
      )}
    </>
  );
}

function NyttUppdrag({ medlemmar, slag, sektioner, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({ medlem_id: '', slag: 'ledamot', sektion_id: '', fran: idag() });
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  return (
    <>
      <div className="faltrad">
        <Val etikett="Medlem" varde={f.medlem_id} satt={satt('medlem_id')} tomtext="– välj –" poster={medlemmar.map((m) => ({ varde: m.id, text: m.namn }))} />
        <Val etikett="Uppdrag" varde={f.slag} satt={satt('slag')} tomtext={null} poster={Object.entries(slag).map(([v, t]) => ({ varde: v, text: t }))} />
        <Val etikett="Sektion (om det gäller en)" varde={f.sektion_id} satt={satt('sektion_id')} tomtext="– ingen –" poster={sektioner.map((s) => ({ varde: s.id, text: s.namn }))} />
        <Text etikett="Från" typ="date" varde={f.fran} satt={satt('fran')} />
      </div>
      <button
        className="primar"
        disabled={!f.medlem_id}
        onClick={async () => {
          try {
            await api.skapa('/api/forening/uppdrag', { ...f, sektion_id: f.sektion_id || null });
            klar();
          } catch (e) {
            notis(e.message, 'fel');
          }
        }}
      >
        Lägg till
      </button>
    </>
  );
}
