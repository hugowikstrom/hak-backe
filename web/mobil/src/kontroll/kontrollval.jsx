// "Välj typ av kontroll" – och den som faktiskt startar en rond.
//
// Två lägen, som i förlagan: *Enstaka* startar en, *Utför flera* låter
// en kryssa i flera och köra dem efter varandra. Listan delas i
// Försenade och Kommande.
//
// Fotraden under varje namn är hela poängen med skärmen, och den säger
// olika saker beroende på vad som styr kontrollen:
//
//   försenad      "Utför om: 236 dagar försenad"  (rött)
//   dagschema     "Utförs senast 30 juli 2027"
//                 "Utför om: 181 dagar"            (grönt)
//                 "Utför inom: 271 dagar"          (grönt)
//   timschema     "Utförs tidigast vid 5629 h"
//   aldrig gjord  "Senast utförd: Ingen gjord"
//
// En kontroll vars tid inte är inne går inte att starta. Kortet är grått
// och saknar pil – det är så förlagan säger nej, utan att skriva det.
import { useState } from 'react';
import { api } from '../api.js';
import { useRuta } from '../app.jsx';
import { nyRond, synka } from '../ko.js';
import { useHamta, useNotis, Vanta } from '../delar.jsx';
import { Ikon } from './skal.jsx';
import { useFavoriter } from './favoriter.js';

const data = (d) => d.data?.data || d.data || {};

const startaRond = (mall, objekt, slag, i) =>
  nyRond({
    mall,
    utrustning: slag === 'utrustning' ? objekt : null,
    omrade: slag === 'omrade' ? objekt : null,
    snoplats: slag === 'snoplats' ? objekt : null,
    avvikelser: i?.avvikelser_per_punkt,
    foregaende: i?.foregaende,
  });

const datum = (d) =>
  d ? new Date(`${d}T12:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Raderna under namnet. Tom lista betyder att kortet inte har någon fot. */
function fotrader(k) {
  if (k.forsenad_dagar) return [['Utför om:', `${k.forsenad_dagar} dagar försenad`, 'sen']];
  if (k.timmar_kvar != null && k.timmar_kvar > 0)
    return [['Utförs tidigast vid', `${Math.round(k.tidigast_timmar)} h`, '']];
  if (k.timmar_kvar != null && k.timmar_kvar <= 0)
    return [['Utför om:', `${-k.timmar_kvar} drifttimmar försenad`, 'sen']];
  if (k.aldrig) return [['Senast utförd:', 'Ingen gjord', '']];
  const ut = [];
  if (k.senast_datum) ut.push(['Utförs senast', datum(k.senast_datum), '']);
  if (k.dagar_kvar != null) ut.push(['Utför om:', `${k.dagar_kvar} dagar`, 'kvar']);
  if (k.inom_dagar != null) ut.push(['Utför inom:', `${k.inom_dagar} dagar`, 'kvar']);
  return ut;
}

/** Går kontrollen att starta nu? */
const startbar = (k) => !(k.timmar_kvar != null && k.timmar_kvar > 0);

export function Kontrollval({ vy, ga }) {
  const { ga: gaApp } = useRuta();
  const notis = useNotis();
  const [lage, sattLage] = useState(null);
  const [valda, sattValda] = useState([]);
  const [favorit, vaxlaFavorit] = useFavoriter('mall');
  const slag = vy.objekt.slag || 'utrustning';
  const d = useHamta(() => api.hamta(`/api/kontroll/objekt?slag=${slag}&id=${vy.objekt.id}`), [vy.objekt.id]);
  const m = useHamta(() => api.hamta('/api/checklistor/mallar'));

  if (d.laddar && !d.data) return <Vanta />;
  const i = data(d);
  const k = i.kontroller || { forsenade: [], kommande: [], alla: [] };
  const mallar = m.data?.data || m.data || [];

  // Pilen startar inte ronden utan öppnar mellansidan. Det extra steget
  // är förlagans, och det finns av ett skäl: där står hur många öppna
  // avvikelser enheten har innan man börjar bocka av.
  const starta = (rad) => ga('kontrollstart', { objekt: vy.objekt, stalle: vy.stalle, rad });

  const startaFlera = () => {
    const rader = k.alla.filter((r) => valda.includes(r.mall_id));
    let forsta = null;
    for (const rad of rader) {
      const mall = mallar.find((x) => x.id === rad.mall_id);
      if (!mall) continue;
      const rond = startaRond(mall, vy.objekt, slag, i);
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
        <h1 className="kv-sidtitel">Välj typ av kontroll</h1>
        <p className="kv-underrad">
          {[i.arbetsstalle?.namn, vy.objekt.namn].filter(Boolean).join(' / ')} <span className="prick" />
        </p>
        <div className="kv-lista">
          <button className="rad" onClick={() => sattLage('enstaka')}>
            <Ikon namn="kontroll" storlek={22} />
            <span className="txt"><strong>Enstaka</strong><small>Starta en kontroll</small></span>
            <span aria-hidden="true">›</span>
          </button>
          <button className="rad" onClick={() => sattLage('flera')}>
            <Ikon namn="lista" storlek={22} />
            <span className="txt"><strong>Utför flera</strong><small>Kryssa i och kör efter varandra</small></span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </>
    );

  const kort = (r) => {
    const rader = fotrader(r);
    const kanStarta = startbar(r);
    return (
      <article key={r.mall_id} className={`kv-kontrollkort${kanStarta ? '' : ' vilande'}`}>
        <div className="topp">
          <span className="markera">
            {lage === 'flera' ? (
              <input
                type="checkbox"
                checked={valda.includes(r.mall_id)}
                disabled={!kanStarta}
                aria-label={r.namn}
                onChange={(e) =>
                  sattValda((v) => (e.target.checked ? [...v, r.mall_id] : v.filter((x) => x !== r.mall_id)))
                }
              />
            ) : (
              <button
                className={`stjarna${favorit(r.mall_id) ? ' pa' : ''}`}
                aria-pressed={favorit(r.mall_id)}
                aria-label={`Favorit: ${r.namn}`}
                onClick={() => vaxlaFavorit(r.mall_id)}
              >
                <Ikon namn="stjarna" storlek={24} />
              </button>
            )}
          </span>
          <span className="namn">{r.namn}</span>
          {lage === 'enstaka' && kanStarta && (
            <button className="pil" onClick={() => starta(r)} aria-label={`Starta ${r.namn}`}>»</button>
          )}
        </div>
        {!!rader.length && (
          <div className="fot">
            {rader.map(([e, v, f]) => (
              <p key={e}>
                {e} <span className={f}>{v}</span>
              </p>
            ))}
          </div>
        )}
      </article>
    );
  };

  const stjarnforst = (a, b) => Number(favorit(b.mall_id)) - Number(favorit(a.mall_id));

  return (
    <>
      <h1 className="kv-sidtitel">Välj typ av kontroll</h1>
      <p className="kv-underrad">
        {[i.arbetsstalle?.namn, vy.objekt.namn].filter(Boolean).join(' / ')} <span className="prick" />
      </p>

      <div className="kv-segment">
        <button aria-pressed={lage === 'enstaka'} onClick={() => sattLage('enstaka')}>Enstaka</button>
        <button aria-pressed={lage === 'flera'} onClick={() => sattLage('flera')}>Utför flera</button>
      </div>

      {lage === 'flera' && (
        <p className="kv-vadardetta">
          <button onClick={() => notis('Kryssa i flera kontroller och starta dem efter varandra. Du gör en i taget, men slipper gå tillbaka hit mellan varje.')}>
            Vad är detta? <span className="fraga">?</span>
          </button>
        </p>
      )}

      {!!k.forsenade.length && (
        <section>
          <h2 className="kv-avdelning latt">Försenade</h2>
          {[...k.forsenade].sort(stjarnforst).map(kort)}
        </section>
      )}
      {!!k.kommande.length && (
        <section>
          <h2 className="kv-avdelning latt">Kommande</h2>
          {[...k.kommande].sort(stjarnforst).map(kort)}
        </section>
      )}
      {!k.alla.length && (
        <p className="kv-ingenting">
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

/**
 * "Utför kontroll" – mellansidan mellan listan och själva ronden.
 *
 * Den ser onödig ut tills man läser vad som står på den: antalet öppna
 * avvikelser på enheten, innan man börjar bocka av. Den som ska
 * kontrollera en lift bör veta att det redan finns tre fel anmälda på
 * den.
 */
export function Kontrollstart({ vy, ga }) {
  const { ga: gaApp } = useRuta();
  const notis = useNotis();
  const [oppet, sattOppet] = useState(false);
  const slag = vy.objekt.slag || 'utrustning';
  const d = useHamta(() => api.hamta(`/api/kontroll/objekt?slag=${slag}&id=${vy.objekt.id}`), [vy.objekt.id]);
  const m = useHamta(() => api.hamta('/api/checklistor/mallar'));
  if (d.laddar && !d.data) return <Vanta />;
  const i = data(d);
  const oppna = (i.avvikelser || []).filter((a) => !['atgardad', 'stangd'].includes(a.status));
  const mallar = m.data?.data || m.data || [];

  const starta = () => {
    const mall = mallar.find((x) => x.id === vy.rad.mall_id);
    if (!mall) return notis('Checklistan gick inte att hämta – prova igen när telefonen har täckning.', 'fel');
    const rond = startaRond(mall, vy.objekt, slag, i);
    synka().catch(() => {});
    gaApp('rond', { lokalId: rond.lokalId });
  };

  return (
    <>
      <h1 className="kv-sidtitel">{vy.rad.namn}</h1>
      <p className="kv-underrad">
        {[i.arbetsstalle?.namn, vy.objekt.namn].filter(Boolean).join(' / ')} <span className="prick" />
      </p>

      <button className={`kv-raknare${oppna.length ? '' : ' tom'}`} disabled={!oppna.length}
        aria-expanded={oppet} onClick={() => sattOppet((o) => !o)}>
        <span className="ring">{oppna.length}</span>
        <span className="txt">Aktiva avvikelser</span>
        {!!oppna.length && (
          <span className={`pil${oppet ? ' upp' : ''}`}><Ikon namn="ned" storlek={22} /></span>
        )}
      </button>
      {oppet && (
        <div className="kv-lista">
          {oppna.map((a) => (
            <button key={a.id} className="rad" onClick={() => ga('avvikelse', { arende: a })}>
              <span className="txt"><strong>{a.titel}</strong><small>Prio {a.prioritet}</small></span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}

      <div className="kv-starta-rad">
        <button className="kv-pill delad" onClick={starta}>
          <span className="rund gron"><Ikon namn="spela" storlek={26} /></span>
          <span className="ord">Starta</span>
        </button>
      </div>
    </>
  );
}
