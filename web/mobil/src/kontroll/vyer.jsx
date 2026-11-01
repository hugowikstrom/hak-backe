// Undervyerna: enheter, ronder, dokument, incidenter, genvägar.
//
// Alla följer samma trappa som förlagan — arbetsställe, objekt, och
// därefter det som hör till objektet. Trappan är den klubben kan.
import { useState } from 'react';
import { api } from '../api.js';
import { klockan, useHamta, useNotis, Vanta } from '../delar.jsx';
import { Ikon } from './skal.jsx';
import { Nasta, Valjare } from './valj.jsx';

const hamtaStallen = () => api.hamta('/api/arbetsstallen');
const data = (d) => d.data?.data || d.data || {};

/** Arbetsställe → objekt → vidare. Delad av Enheter och Ronder. */
function Trappa({ etikett, slagfilter, vidVal }) {
  const [stalle, sattStalle] = useState(null);
  const [objekt, sattObjekt] = useState(null);
  const d = useHamta(hamtaStallen);
  if (d.laddar && !d.data) return <Vanta />;
  const stallen = (data(d).arbetsstallen || []).map((a) => ({ ...a, namn: a.namn }));
  const valbara = stalle
    ? (stallen.find((a) => a.id === stalle.id)?.objekt || [])
        .filter((o) => !slagfilter || slagfilter.includes(o.slag))
        .map((o) => ({ ...o, under: stalle.namn }))
    : [];

  return (
    <>
      <Valjare
        etikett="Arbetsställe"
        platshallare="Välj arbetsställe"
        valt={stalle}
        poster={stallen}
        favoritslag="stalle"
        satt={(v) => {
          sattStalle(v);
          sattObjekt(null);
        }}
      />
      <Valjare
        etikett={etikett}
        platshallare={`Välj ${etikett.toLowerCase()}`}
        valt={objekt}
        poster={stalle ? valbara : []}
        satt={sattObjekt}
        favoritslag="enhet"
        grupper
      />
      <Nasta pa={Boolean(objekt)} onClick={() => vidVal(stalle, objekt)} />
    </>
  );
}

/**
 * Kommer man hit från "+ Ny" är trappan bara vägen fram till det man
 * ville göra: `efterval` säger vart valet leder i stället för till
 * objektets översikt.
 */
export const Enheter = ({ vy, ga }) => (
  <Trappa
    etikett="Enhet"
    slagfilter={['utrustning']}
    vidVal={(s, o) => ga(vy?.efterval || 'enhet', { stalle: s, objekt: o, slag: vy?.slag })}
  />
);

export const Ronder = ({ vy, ga }) => (
  <Trappa
    etikett="Rond"
    slagfilter={['omrade', 'snoplats', 'utrustning']}
    vidVal={(s, o) => ga(vy?.efterval || 'rondobjekt', { stalle: s, objekt: o })}
  />
);

/**
 * Dokument: samma tre grenar som förlagan, och arbetsställena ett steg
 * till ned. Tre nivåer för en pdf är i mesta laget, men det är där
 * klubbens manualer alltid legat.
 *
 * Grenen är ett eget steg i stacken och inte ett läge i den här vyn –
 * annars hamnar den som backar ur en dokumentlista på rotnivån i
 * stället för i listan över arbetsställen.
 */
export const Dokument = ({ ga }) => (
  <div className="kv-lista">
    {[
      ['arbetsstalle', 'Arbetsställen', 'Manualer och ritningar per maskin'],
      ['vatsketyper', 'Vätsketyper', 'Säkerhetsdatablad'],
      ['generella', 'Generella', 'Rutiner och instruktioner för hela backen'],
    ].map(([n, t, u]) => (
      <button key={n} className="rad"
        onClick={() => ga(n === 'arbetsstalle' ? 'dokumentstallen' : 'dokumentlista', { gren: n })}>
        <Ikon namn="dokument" storlek={20} />
        <span className="txt"><strong>{t}</strong><small>{u}</small></span>
        <span aria-hidden="true">›</span>
      </button>
    ))}
  </div>
);

/** Arbetsställena, som väg till deras dokument. */
export function Dokumentstallen({ ga }) {
  const d = useHamta(hamtaStallen);
  if (d.laddar && !d.data) return <Vanta />;
  return (
    <div className="kv-lista">
      {(data(d).arbetsstallen || []).map((a) => (
        <button key={a.id} className="rad"
          onClick={() => ga('dokumentlista', { gren: 'arbetsstalle', stalle: a })}>
          <Ikon namn="dokument" storlek={20} />
          <span className="txt"><strong>{a.namn}</strong><small>{a.beskrivning}</small></span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

/** Dokumenten i en gren. Öppnas i telefonens egen pdf-visare. */
export function Dokumentlista({ vy }) {
  const stig = `/api/kontroll/dokument?gren=${vy.gren}${vy.stalle ? `&nyckel=${vy.stalle.nyckel}` : ''}`;
  const d = useHamta(() => api.hamta(stig), [stig]);
  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;
  const i = data(d);
  const rader = i.dokument || [];
  return (
    <div className="kv-lista">
      {rader.length ? (
        rader.map((x) => (
          <a key={x.id} className="rad" href={`/api/underhall/dokument/${x.id}/fil`}
            target="_blank" rel="noreferrer">
            <Ikon namn="dokument" storlek={20} />
            <span className="txt">
              <strong>{x.namn}</strong>
              <small>{[x.utrustning, x.slag, x.sidor ? `${x.sidor} sidor` : null].filter(Boolean).join(' · ')}</small>
            </span>
            <span aria-hidden="true">›</span>
          </a>
        ))
      ) : (
        <div className="tomt">{i.tomtext || 'Inga dokument här ännu.'}</div>
      )}
    </div>
  );
}

const INCIDENTSLAG = {
  arbetsskada: 'Arbetsskada', gastincident: 'Gästincident',
  tillbud: 'Tillbud', driftavvikelse: 'Driftavvikelse',
};
const INCIDENTSTATUS = {
  rapporterad: 'Rapporterad', granskad: 'Granskad',
  uppfoljd: 'Uppföljd', avslutad: 'Avslutad',
};

/**
 * Incidenterna, delade som i förlagan. "Klarmarkerad" är här detsamma
 * som avslutad – en incident som är uppföljd men inte avslutad är inte
 * klar, och ska synas bland de aktiva.
 */
export function Incidenter({ ga }) {
  const [flik, sattFlik] = useState('aktiva');
  const d = useHamta(() => api.hamta('/api/incidenter'));
  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;
  const i = data(d);
  const alla = Array.isArray(i) ? i : i.incidenter || [];
  const rader = alla.filter((x) =>
    flik === 'aktiva' ? x.status !== 'avslutad' : x.status === 'avslutad'
  );
  return (
    <>
      <div className="kv-segment">
        <button aria-pressed={flik === 'aktiva'} onClick={() => sattFlik('aktiva')}>Aktiva</button>
        <button aria-pressed={flik === 'klara'} onClick={() => sattFlik('klara')}>Klarmarkerade</button>
      </div>
      {rader.length ? (
        <div className="kv-lista">
          {rader.map((x) => (
            <button key={x.id} className="rad" onClick={() => ga('incident', { incident: x })}>
              <Ikon namn="incident" storlek={20} />
              <span className="txt">
                <strong>{INCIDENTSLAG[x.slag] || x.slag || 'Incident'}</strong>
                <small>{klockan(x.tid)}{x.plats ? ` · ${x.plats}` : ''}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="svag" style={{ textAlign: 'center', marginTop: 40 }}>
          {flik === 'aktiva' ? 'Inga aktiva incidenter.' : 'Inga klarmarkerade incidenter.'}
        </p>
      )}
    </>
  );
}

/**
 * Den enskilda incidenten. Personuppgifterna kommer maskerade från
 * servern om man inte får se dem – vyn visar det servern skickar och
 * gör ingen egen bedömning.
 */
export function Incident({ vy }) {
  const d = useHamta(() => api.hamta(`/api/incidenter/${vy.incident.id}`), [vy.incident.id]);
  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;
  const x = data(d).incident || data(d);
  const falt = [
    ['Tid', klockan(x.tid)],
    ['Slag', INCIDENTSLAG[x.slag] || x.slag],
    ['Status', INCIDENTSTATUS[x.status] || x.status],
    ['Plats', x.plats],
    ['Beskrivning', x.beskrivning],
    ['Uppgiven orsak', x.uppgiven_orsak],
    ['Förhållanden', x.forhallanden],
    ['Insatser', x.insatser],
    ['Personal', x.personal],
    ['Vittnen', x.vittnen],
    ['Ålder', x.person_alder],
    ['Skada', x.skada],
  ].filter(([, v]) => v);
  return (
    <div className="kv-lista">
      {falt.map(([e, v]) => (
        <div key={e} className="rad">
          <span className="txt"><strong>{e}</strong><small>{v}</small></span>
        </div>
      ))}
    </div>
  );
}

export function Genvagar() {
  const d = useHamta(() => api.hamta('/api/kontroll/genvagar'));
  if (d.laddar && !d.data) return <Vanta />;
  const rader = data(d).genvagar || [];
  return (
    <div className="kv-lista">
      {rader.map((g) => (
        <a key={g.id} className="rad" href={g.url} target={g.intern ? undefined : '_blank'} rel="noreferrer">
          <Ikon namn="genvag" storlek={20} />
          <span className="txt">
            <strong>{g.namn}</strong>
            {g.beskrivning && <small>{g.beskrivning}</small>}
          </span>
          <span aria-hidden="true">›</span>
        </a>
      ))}
      {!rader.length && <div className="tomt">Inga genvägar upplagda.</div>}
    </div>
  );
}

/** Påfyllning: den registrering som sker oftast på en pistmaskin. */
export function Pafyllning({ vy, ga }) {
  const notis = useNotis();
  const objekt = vy.objekt;
  const d = useHamta(() => api.hamta('/api/pafyllningar'));
  const [f, sattF] = useState({ vatsketyp: vy.slag === 'vatska' ? 'hydraulolja' : 'diesel', mangd: '', matarstallning: '', anteckning: '' });
  const [arbetar, sattArbetar] = useState(false);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  const typer = (data(d).vatsketyper || []).filter((t) => !vy.slag || t.slag === vy.slag);

  const spara = async () => {
    const mangd = Number(String(f.mangd).replace(',', '.'));
    if (!Number.isFinite(mangd) || mangd <= 0) return notis('Hur mycket fyllde du på?', 'fel');
    sattArbetar(true);
    try {
      await api.skapa('/api/pafyllningar', {
        utrustning_id: objekt.id,
        vatsketyp: f.vatsketyp,
        mangd,
        matarstallning: f.matarstallning ? Number(String(f.matarstallning).replace(',', '.')) : null,
        anteckning: f.anteckning || null,
      });
      notis('Registrerat', 'ok');
      ga('tillbaka');
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <>
      <p style={{ margin: '0 0 12px' }}>{objekt?.namn}</p>
      <label className="kv-falt">
        <span>Vätsketyp</span>
        <select className="kv-valj" value={f.vatsketyp} onChange={(e) => satt('vatsketyp')(e.target.value)}>
          {typer.map((t) => <option key={t.nyckel} value={t.nyckel}>{t.namn}</option>)}
        </select>
      </label>
      <label className="kv-falt">
        <span>Mängd</span>
        <input className="kv-valj" inputMode="decimal" value={f.mangd}
          onChange={(e) => satt('mangd')(e.target.value)} placeholder="liter" />
      </label>
      <label className="kv-falt">
        <span>Mätarställning</span>
        <input className="kv-valj" inputMode="decimal" value={f.matarstallning}
          onChange={(e) => satt('matarstallning')(e.target.value)} placeholder="drifttimmar" />
      </label>
      <label className="kv-falt">
        <span>Anteckning</span>
        <input className="kv-valj" value={f.anteckning} onChange={(e) => satt('anteckning')(e.target.value)} />
      </label>
      <Nasta pa={!arbetar} onClick={spara} text="Spara" />
    </>
  );
}
