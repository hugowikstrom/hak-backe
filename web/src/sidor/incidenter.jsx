// Olyckor och tillbud.
//
// Sidan är byggd kring två saker: händelsen ska gå att följa upp, och
// uppgifterna om den skadade ska bara synas för den som behöver dem. Det som
// står "[skyddad uppgift]" är inte ett fel – det är dataminimering som
// fungerar.
import { useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Falt, Kort, Lada, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { tidpunkt } from '../nytta.js';

const SLAG = {
  arbetsskada: { namn: 'Arbetsskada', farg: 'fara' },
  gastincident: { namn: 'Gästincident', farg: 'varning' },
  tillbud: { namn: 'Tillbud', farg: 'info' },
  driftavvikelse: { namn: 'Driftavvikelse', farg: '' },
};
const STATUS = {
  rapporterad: { namn: 'Rapporterad', farg: 'varning' },
  granskad: { namn: 'Granskad', farg: 'info' },
  uppfoljd: { namn: 'Uppföljd', farg: 'ok' },
  avslutad: { namn: 'Avslutad', farg: '' },
};

export function Incidenter() {
  const jag = useJag();
  const notis = useNotis();
  const lista = useHamta(() => api.hamta('/api/incidenter'));
  const [ny, sattNy] = useState(false);
  const [vald, sattVald] = useState(null);

  if (lista.laddar && !lista.data) return <Vanta />;
  if (lista.fel) return <div className="meddelande fel">{lista.fel}</div>;

  const { incidenter, ser_personuppgifter, gallringsar } = lista.data;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Incidenter</h1>
          <div className="undertext">
            Olyckor, tillbud och arbetsskador. Personuppgifter gallras efter {gallringsar} år;
            händelsebeskrivningen sparas.
          </div>
        </div>
        <div className="sidhuvud-verktyg">
          {!ser_personuppgifter && <Bricka>personuppgifter dolda för dig</Bricka>}
          <button className="primar" onClick={() => sattNy(true)}>Rapportera incident</button>
        </div>
      </div>

      {incidenter.length === 0 ? (
        <Tomt>Inga incidenter registrerade.</Tomt>
      ) : (
        <Kort titel="Registrerade incidenter">
          <Tabell
            rader={incidenter}
            standardsort="tid"
            vidKlick={sattVald}
            kolumner={[
              { falt: 'tid', rubrik: 'När', visa: (i) => tidpunkt(i.tid) },
              {
                falt: 'slag',
                rubrik: 'Slag',
                visa: (i) => <Bricka farg={SLAG[i.slag]?.farg}>{SLAG[i.slag]?.namn || i.slag}</Bricka>,
              },
              { falt: 'plats', rubrik: 'Plats', visa: (i) => i.plats || i.omrade || '–' },
              {
                falt: 'beskrivning',
                rubrik: 'Händelse',
                visa: (i) => i.beskrivning.slice(0, 80) + (i.beskrivning.length > 80 ? ' …' : ''),
              },
              {
                falt: 'status',
                rubrik: 'Status',
                visa: (i) => <Bricka farg={STATUS[i.status]?.farg}>{STATUS[i.status]?.namn}</Bricka>,
              },
              {
                falt: 'gallrad',
                rubrik: '',
                sortlos: true,
                visa: (i) => (i.gallrad ? <Bricka>gallrad</Bricka> : ''),
              },
            ]}
          />
        </Kort>
      )}

      {ny && (
        <Lada titel="Rapportera incident" stang={() => sattNy(false)} bred>
          <NyIncident
            serPerson={ser_personuppgifter}
            klar={() => {
              sattNy(false);
              lista.uppdatera();
              notis('Incidenten är registrerad', 'ok');
            }}
          />
        </Lada>
      )}

      {vald && (
        <Lada titel={`Incident ${vald.id}`} stang={() => sattVald(null)} bred>
          <Detalj
            id={vald.id}
            uppdaterad={() => {
              lista.uppdatera();
              sattVald(null);
            }}
          />
        </Lada>
      )}
    </>
  );
}

function NyIncident({ serPerson, klar }) {
  const notis = useNotis();
  const omraden = useHamta(() => api.hamta('/api/omraden'));
  const [f, sattF] = useState({
    slag: 'gastincident',
    tid: new Date().toISOString().slice(0, 16),
    plats: '',
    omrade_id: '',
    beskrivning: '',
    uppgiven_orsak: '',
    forhallanden: '',
    insatser: '',
    personal: '',
    person_namn: '',
    person_kontakt: '',
    skada: '',
  });
  const [sparar, sattSparar] = useState(false);
  const satt = (namn) => (v) => sattF((x) => ({ ...x, [namn]: v }));

  const skicka = async () => {
    if (!f.beskrivning.trim()) return notis('Beskriv vad som hänt', 'fel');
    sattSparar(true);
    try {
      await api.skapa('/api/incidenter', {
        ...f,
        tid: f.tid.replace('T', ' '),
        omrade_id: f.omrade_id ? Number(f.omrade_id) : null,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
      sattSparar(false);
    }
  };

  return (
    <>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Val
          etikett="Slag"
          varde={f.slag}
          satt={satt('slag')}
          tomtext={null}
          poster={Object.entries(SLAG).map(([v, s]) => ({ varde: v, text: s.namn }))}
        />
        <Text etikett="När" typ="datetime-local" varde={f.tid} satt={satt('tid')} />
      </div>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text etikett="Plats" varde={f.plats} satt={satt('plats')} placeholder="Teknikbacken, vid mellanstationen" />
        <Val
          etikett="Område"
          varde={f.omrade_id}
          satt={satt('omrade_id')}
          poster={(omraden.data || []).map((o) => ({ varde: String(o.id), text: o.namn }))}
        />
      </div>

      <Falt etikett="Vad hände?" krav>
        <textarea
          value={f.beskrivning}
          onChange={(e) => satt('beskrivning')(e.target.value)}
          rows={4}
          placeholder="Skriv vad som hände, så sakligt som möjligt."
        />
      </Falt>
      <Falt etikett="Uppgiven orsak">
        <textarea
          value={f.uppgiven_orsak}
          onChange={(e) => satt('uppgiven_orsak')(e.target.value)}
          rows={2}
          placeholder="Bara om någon faktiskt angett en orsak – gissa inte."
        />
      </Falt>
      <div className="rad" style={{ alignItems: 'flex-end' }}>
        <Text
          etikett="Väder och pistförhållanden"
          varde={f.forhallanden}
          satt={satt('forhallanden')}
          placeholder="−3 °C, nysnö, hård pist i kanterna"
        />
        <Text etikett="Inblandad personal" varde={f.personal} satt={satt('personal')} />
      </div>
      <Falt etikett="Vilka insatser gjordes?">
        <textarea value={f.insatser} onChange={(e) => satt('insatser')(e.target.value)} rows={2} />
      </Falt>

      {serPerson ? (
        <fieldset className="personuppgifter">
          <legend>Den som drabbades</legend>
          <p className="liten svag">
            Fyll bara i det som behövs för uppföljningen. Uppgifterna gallras automatiskt och syns
            inte för alla som arbetar med incidenten.
          </p>
          <div className="rad" style={{ alignItems: 'flex-end' }}>
            <Text etikett="Namn" varde={f.person_namn} satt={satt('person_namn')} />
            <Text etikett="Kontakt" varde={f.person_kontakt} satt={satt('person_kontakt')} />
          </div>
          <Text etikett="Skada" varde={f.skada} satt={satt('skada')} />
        </fieldset>
      ) : (
        <div className="meddelande info">
          Uppgifter om den drabbade läggs in av anläggningsansvarig eller ordförande.
        </div>
      )}

      <div className="knapprad">
        <button className="primar" onClick={skicka} disabled={sparar}>
          {sparar ? 'Sparar …' : 'Registrera'}
        </button>
      </div>
    </>
  );
}

function Detalj({ id, uppdaterad }) {
  const notis = useNotis();
  const h = useHamta(() => api.hamta(`/api/incidenter/${id}`));
  const [arendetitel, sattArendetitel] = useState('');
  const [arbetar, sattArbetar] = useState(false);

  if (h.laddar && !h.data) return <Vanta />;
  const i = h.data.incident;
  const atkomst = h.data.atkomst;

  const gor = async (fn, meddelande) => {
    sattArbetar(true);
    try {
      await fn();
      notis(meddelande, 'ok');
      h.uppdatera();
      uppdaterad();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <>
      <div className="rad hopp" style={{ marginBottom: 12 }}>
        <Bricka farg={SLAG[i.slag]?.farg}>{SLAG[i.slag]?.namn}</Bricka>
        <Bricka farg={STATUS[i.status]?.farg}>{STATUS[i.status]?.namn}</Bricka>
        <span className="liten svag">{tidpunkt(i.tid)}</span>
        {i.gallrad && <Bricka>gallrad {tidpunkt(i.gallrad)}</Bricka>}
      </div>

      <dl className="uppgifter">
        <dt>Plats</dt><dd>{i.plats || i.omrade || '–'}</dd>
        <dt>Händelse</dt><dd>{i.beskrivning}</dd>
        {i.uppgiven_orsak && (<><dt>Uppgiven orsak</dt><dd>{i.uppgiven_orsak}</dd></>)}
        {i.forhallanden && (<><dt>Förhållanden</dt><dd>{i.forhallanden}</dd></>)}
        {i.insatser && (<><dt>Insatser</dt><dd>{i.insatser}</dd></>)}
        {i.personal && (<><dt>Personal</dt><dd>{i.personal}</dd></>)}
        <dt>Drabbad</dt>
        <dd>{[i.person_namn, i.person_kontakt, i.skada].filter(Boolean).join(' · ') || '–'}</dd>
        <dt>Rapporterad av</dt><dd>{i.rapporterad_av || '–'}</dd>
        {i.gallras && !i.gallrad && (<><dt>Gallras</dt><dd>{i.gallras}</dd></>)}
      </dl>

      {!i.arende_id ? (
        <Kort titel="Åtgärd" tat>
          <Text
            etikett="Skapa ett ärende av det här"
            varde={arendetitel}
            satt={sattArendetitel}
            placeholder="Jämna ut partiet vid mellanstationen"
          />
          <div className="knapprad">
            <button
              disabled={!arendetitel.trim() || arbetar}
              onClick={() =>
                gor(
                  () => api.skapa(`/api/incidenter/${id}/arende`, { titel: arendetitel.trim() }),
                  'Ärendet är skapat'
                )
              }
            >
              Skapa ärende
            </button>
          </div>
        </Kort>
      ) : (
        <div className="meddelande ok">
          Åtgärdas i ärende #{i.arende_id}. <a href="/arenden">Till ärendena</a>
        </div>
      )}

      <div className="knapprad" style={{ marginTop: 12 }}>
        {i.status !== 'avslutad' && (
          <button
            disabled={arbetar}
            onClick={() =>
              gor(
                () =>
                  api.spara(`/api/incidenter/${id}`, {
                    status: i.status === 'rapporterad' ? 'granskad' : i.status === 'granskad' ? 'uppfoljd' : 'avslutad',
                  }),
                'Status uppdaterad'
              )
            }
          >
            {i.status === 'rapporterad' ? 'Markera granskad' : i.status === 'granskad' ? 'Markera uppföljd' : 'Avsluta'}
          </button>
        )}
        {atkomst && !i.gallrad && (i.person_namn || i.skada) && (
          <button
            className="fara"
            disabled={arbetar}
            onClick={() =>
              confirm('Ta bort personuppgifterna permanent? Händelsebeskrivningen sparas.') &&
              gor(() => api.skapa(`/api/incidenter/${id}/gallra`, {}), 'Personuppgifterna är gallrade')
            }
          >
            Gallra personuppgifter
          </button>
        )}
      </div>

      {atkomst && (
        <Kort titel="Vem har läst" undertext="Åtkomst till en incident loggas. Listan visas för den som ansvarar för uppgifterna.">
          <Tabell
            rader={atkomst}
            kolumner={[
              { falt: 'tid', rubrik: 'Tid', visa: (a) => tidpunkt(a.tid) },
              { falt: 'namn', rubrik: 'Vem', visa: (a) => a.namn || 'okänd' },
              { falt: 'slag', rubrik: 'Vad', visa: (a) => ({ las: 'Läste', andra: 'Ändrade', gallra: 'Gallrade' }[a.slag]) },
            ]}
          />
        </Kort>
      )}
    </>
  );
}
