// "Välj typ av kontroll" – fjärde nivån, och den som faktiskt startar en rond.
//
// Två lägen, som i förlagan: *Enstaka* startar en kontroll direkt,
// *Utför flera* låter en kryssa i flera och köra dem efter varandra.
// Listan delas i Försenade och Kommande, och försenade sorteras på hur
// länge de varit försenade. Den som har en lift som inte besiktats på
// 600 dagar ska se det högst upp, inte leta efter det.
import { useState } from 'react';
import { api } from '../api.js';
import { useRuta } from '../app.jsx';
import { nyRond, synka } from '../ko.js';
import { useHamta, useNotis, Vanta } from '../delar.jsx';
import { Ikon } from './skal.jsx';

const data = (d) => d.data?.data || d.data || {};

/** Hur ronden ska startas beror på vad den gäller. */
const startaRond = (mall, objekt, slag) =>
  nyRond({
    mall,
    utrustning: slag === 'utrustning' ? objekt : null,
    omrade: slag === 'omrade' ? objekt : null,
    snoplats: slag === 'snoplats' ? objekt : null,
  });

const forfallotext = (k) => {
  if (k.aldrig) return 'Aldrig utförd';
  if (k.forsenad_dagar) return `Försenad ${k.forsenad_dagar} dagar`;
  if (k.behovs) return `Ska göras ${k.intervalltext.toLowerCase()}`;
  if (k.dagar_kvar === 0) return 'Utför i dag';
  if (k.dagar_kvar != null) return `Utför om ${k.dagar_kvar} dagar`;
  return k.intervalltext;
};

export function Kontrollval({ vy, ga }) {
  const { ga: gaApp } = useRuta();
  const notis = useNotis();
  const [lage, sattLage] = useState(null);
  const [valda, sattValda] = useState([]);
  const slag = vy.objekt.slag || 'utrustning';
  const d = useHamta(() => api.hamta(`/api/kontroll/objekt?slag=${slag}&id=${vy.objekt.id}`), [vy.objekt.id]);
  const m = useHamta(() => api.hamta('/api/checklistor/mallar'));

  if (d.laddar && !d.data) return <Vanta />;
  const k = data(d).kontroller || { forsenade: [], kommande: [], alla: [] };
  const mallar = m.data?.data || m.data || [];

  const starta = async (rad) => {
    const mall = mallar.find((x) => x.id === rad.mall_id);
    if (!mall) return notis('Checklistan gick inte att hämta – prova igen när telefonen har täckning.', 'fel');
    const rond = startaRond(mall, vy.objekt, slag);
    synka().catch(() => {});
    gaApp('rond', { lokalId: rond.lokalId });
  };

  // Utför flera: ronderna köas, och den första öppnas. Resten ligger
  // kvar som påbörjade och nås från Pågående – samma väg som förlagan.
  const startaFlera = async () => {
    const rader = k.alla.filter((r) => valda.includes(r.mall_id));
    if (!rader.length) return;
    let forsta = null;
    for (const rad of rader) {
      const mall = mallar.find((x) => x.id === rad.mall_id);
      if (!mall) continue;
      const rond = startaRond(mall, vy.objekt, slag);
      if (!forsta) forsta = rond;
    }
    synka().catch(() => {});
    if (!forsta) return notis('Ingen av checklistorna gick att hämta.', 'fel');
    notis(rader.length > 1 ? `${rader.length} kontroller påbörjade.` : 'Kontrollen påbörjad.');
    gaApp('rond', { lokalId: forsta.lokalId });
  };

  if (!lage)
    return (
      <>
        <p className="kv-ledtext">Välj typ av kontroll</p>
        <div className="kv-lista">
          <button className="rad" onClick={() => sattLage('enstaka')}>
            <Ikon namn="kontroll" storlek={20} />
            <span className="txt"><strong>Enstaka</strong><small>Starta en kontroll</small></span>
            <span aria-hidden="true">›</span>
          </button>
          <button className="rad" onClick={() => sattLage('flera')}>
            <Ikon namn="lista" storlek={20} />
            <span className="txt"><strong>Utför flera</strong><small>Kryssa i och kör efter varandra</small></span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </>
    );

  const grupp = (rubrik, rader) =>
    rader.length ? (
      <section key={rubrik}>
        <h2 className="kv-rubrik">{rubrik}</h2>
        <div className="kv-lista">
          {rader.map((r) => (
            <div key={r.mall_id} className={`rad${lage === 'flera' ? ' kryss' : ''}`}>
              {lage === 'flera' && (
                <input type="checkbox" checked={valda.includes(r.mall_id)}
                  onChange={(e) =>
                    sattValda((v) => (e.target.checked ? [...v, r.mall_id] : v.filter((x) => x !== r.mall_id)))
                  }
                  aria-label={r.namn} />
              )}
              <span className="txt">
                <strong>{r.namn}</strong>
                <small>
                  {forfallotext(r)} · {r.antal_punkter} punkter
                  {r.senast ? ` · senast ${String(r.senast).slice(0, 10)}${r.senast_av ? ` av ${r.senast_av}` : ''}` : ''}
                </small>
              </span>
              {lage === 'enstaka' && (
                <button className="kv-starta" onClick={() => starta(r)}>Starta</button>
              )}
            </div>
          ))}
        </div>
      </section>
    ) : null;

  return (
    <>
      <div className="kv-segment">
        <button aria-pressed={lage === 'enstaka'} onClick={() => sattLage('enstaka')}>Enstaka</button>
        <button aria-pressed={lage === 'flera'} onClick={() => sattLage('flera')}>Utför flera</button>
      </div>
      {grupp('Försenade', k.forsenade)}
      {grupp('Kommande', k.kommande)}
      {!k.alla.length && (
        <p className="svag" style={{ textAlign: 'center', marginTop: 36 }}>
          Ingen checklista gäller den här enheten ännu.
        </p>
      )}
      {lage === 'flera' && (
        <div className="kv-nasta">
          <button disabled={!valda.length} onClick={startaFlera}>
            Starta {valda.length || ''} <span className="rund" aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </>
  );
}
