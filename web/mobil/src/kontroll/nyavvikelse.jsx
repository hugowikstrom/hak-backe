// Ny avvikelse, med fälten i förlagans ordning.
//
// Rubrik är det enda obligatoriska. Allt annat går att fylla i senare –
// en avvikelse som inte registreras för att formuläret var långt är
// värre än en avvikelse utan kategori.
import { useState } from 'react';
import { api, krympBild } from '../api.js';
import { useHamta, useNotis, Vanta } from '../delar.jsx';

const data = (d) => d.data?.data || d.data || {};

const PRIO = [
  { v: 1, t: 'Prio 1 – akut' },
  { v: 2, t: 'Prio 2 – hög' },
  { v: 3, t: 'Prio 3 – normal' },
  { v: 4, t: 'Prio 4 – låg' },
];
const ALLVAR = [
  { v: 'sakerhetsrisk', t: 'Säkerhetsrisk' },
  { v: 'driftstopp', t: 'Stoppar driften' },
  { v: 'begransar', t: 'Begränsar driften' },
  { v: 'kosmetisk', t: 'Påverkar inte driften' },
];

export function NyAvvikelse({ vy, ga }) {
  const notis = useNotis();
  const objekt = vy.objekt || null;
  const [f, sattF] = useState({
    titel: '', beskrivning: '', prioritet: 3, allvarlighet: 'begransar',
    omrade_id: '', tilldelad_id: '', utrustning_id: objekt?.slag === 'utrustning' ? objekt.id : '',
  });
  const [bild, sattBild] = useState(null);
  const [arbetar, sattArbetar] = useState(false);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));

  const omraden = useHamta(() => api.hamta('/api/omraden'));
  const utr = useHamta(() => api.hamta('/api/utrustning'));
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar').catch(() => []));

  const lista = (d) => {
    const x = data(d);
    return Array.isArray(x) ? x : x.utrustning || x.omraden || x.medlemmar || [];
  };

  const spara = async () => {
    if (!f.titel.trim()) return notis('Skriv en rubrik.', 'fel');
    sattArbetar(true);
    try {
      // Fotot först: går det inte fram ska avvikelsen ändå registreras.
      let bildnamn = null;
      if (bild)
        bildnamn = await api
          .skapa('/api/bilder', { data: bild })
          .then((r) => r.bild)
          .catch(() => null);
      await api.skapa('/api/arenden', {
        titel: f.titel.trim(),
        bild: bildnamn,
        beskrivning: f.beskrivning || null,
        prioritet: Number(f.prioritet),
        allvarlighet: f.allvarlighet,
        utrustning_id: f.utrustning_id || null,
        omrade_id: f.omrade_id || null,
        tilldelad_id: f.tilldelad_id || null,
      });
      notis(bild && !bildnamn ? 'Avvikelsen registrerad – fotot gick inte fram.' : 'Avvikelsen registrerad.');
      ga('tillbaka');
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  if (omraden.laddar && !omraden.data) return <Vanta />;

  return (
    <>
      <label className="kv-falt">
        <span>Rubrik *</span>
        <input className="kv-valj" value={f.titel} onChange={(e) => satt('titel')(e.target.value)}
          placeholder="Vad är fel?" />
      </label>
      <label className="kv-falt">
        <span>Beskrivning</span>
        <textarea className="kv-valj kv-omrade" rows={3} value={f.beskrivning}
          onChange={(e) => satt('beskrivning')(e.target.value)} placeholder="Var, hur, och vad som behöver göras" />
      </label>
      <label className="kv-falt">
        <span>Enhet</span>
        <select className="kv-valj" value={f.utrustning_id} onChange={(e) => satt('utrustning_id')(e.target.value)}>
          <option value="">Ingen särskild</option>
          {lista(utr).map((u) => <option key={u.id} value={u.id}>{u.namn}</option>)}
        </select>
      </label>
      <label className="kv-falt">
        <span>Nedfart</span>
        <select className="kv-valj" value={f.omrade_id} onChange={(e) => satt('omrade_id')(e.target.value)}>
          <option value="">Ingen särskild</option>
          {lista(omraden).map((o) => <option key={o.id} value={o.id}>{o.namn}</option>)}
        </select>
      </label>
      <label className="kv-falt">
        <span>Ansvarig</span>
        <select className="kv-valj" value={f.tilldelad_id} onChange={(e) => satt('tilldelad_id')(e.target.value)}>
          <option value="">Ingen tilldelad</option>
          {lista(medlemmar).map((m) => <option key={m.id} value={m.id}>{m.namn}</option>)}
        </select>
      </label>
      <label className="kv-falt">
        <span>Prioritet</span>
        <select className="kv-valj" value={f.prioritet} onChange={(e) => satt('prioritet')(e.target.value)}>
          {PRIO.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
        </select>
      </label>
      <label className="kv-falt">
        <span>Allvarlighet</span>
        <select className="kv-valj" value={f.allvarlighet} onChange={(e) => satt('allvarlighet')(e.target.value)}>
          {ALLVAR.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
        </select>
      </label>
      <label className="kv-falt">
        <span>Foto</span>
        <input className="kv-valj" type="file" accept="image/*" capture="environment"
          onChange={async (e) => {
            const fil = e.target.files?.[0];
            if (fil) sattBild(await krympBild(fil));
          }} />
      </label>
      {bild && <img className="kv-foto" src={bild} alt="Bifogat foto" />}

      <div className="kv-nasta">
        <button disabled={arbetar} onClick={spara}>
          Spara <span className="rund" aria-hidden="true">›</span>
        </button>
      </div>
    </>
  );
}
