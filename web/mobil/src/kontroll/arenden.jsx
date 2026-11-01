// Mina ärenden: kontroller, avvikelser och service i en tidslinje.
//
// Att blanda dem är poängen. Den som står i backen tänker inte "det här
// är en checklistkörning, det där är ett ärende" – hen tänker "det här
// är vad som hänt och vad som väntar".
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useRuta } from '../app.jsx';
import { antalBesvarade, laddaRonder, prenumerera } from '../ko.js';
import { klockan, useHamta, Vanta } from '../delar.jsx';
import { Ikon } from './skal.jsx';

const CHIPS = [
  { nyckel: 'kontroll', namn: 'Kontroller' },
  { nyckel: 'avvikelse', namn: 'Avvikelser' },
  { nyckel: 'service', namn: 'Service' },
];

/** Dagrubriken. "I dag" och "I går" skriver sig själva. */
const dagrubrik = (dag) => {
  const d0 = new Date(`${dag}T12:00`);
  const nu = new Date();
  const diff = Math.round((new Date(nu.toISOString().slice(0, 10) + 'T12:00') - d0) / 86400000);
  if (diff === 0) return 'I dag';
  if (diff === 1) return 'I går';
  return d0.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
};

export function Arenden({ ga }) {
  const [slag, sattSlag] = useState('avvikelse');
  const d = useHamta(() => api.hamta(`/api/kontroll/arenden?slag=${slag}`), [slag]);
  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;
  const data = d.data?.data || d.data || {};

  // Avvikelser och kontroller har varsin egen vy; service har ingen
  // ännu, och ett kort som inte leder någonstans ska inte se ut att göra det.
  const oppna = (r) => {
    if (r.slag === 'avvikelse') return () => ga('avvikelse', { arende: r });
    if (r.slag === 'kontroll') return () => ga('korning', { korning: r });
    return undefined;
  };

  return (
    <>
      <p className="kv-sidrubrik">Mina ärenden</p>
      <div className="kv-filterrad">
        <span>Filtrera</span>
        <Ikon namn="reglage" storlek={22} />
      </div>

      <div className="kv-chips">
        {CHIPS.map((c) => (
          <button key={c.nyckel} aria-pressed={slag === c.nyckel} onClick={() => sattSlag(c.nyckel)}>
            {slag === c.nyckel && <span className="bock" aria-hidden="true">✓</span>}
            {c.namn}
          </button>
        ))}
      </div>

      {(data.dagar || []).map((dag) => (
        <section key={dag.dag}>
          <h2 className="kv-dag">{dagrubrik(dag.dag)}</h2>
          {dag.rader.map((r) => (
            <article key={`${r.slag}-${r.id}`} className={`kv-arende ${r.slag}`} onClick={oppna(r)}>
              <div className="nrrad">
                <Ikon namn={r.slag === 'avvikelse' ? 'nyckel' : r.slag === 'kontroll' ? 'kontroll' : 'service'} storlek={19} />
                <span className="nr">
                  #{r.slag === 'avvikelse' ? 'D' : r.slag === 'kontroll' ? 'C' : 'S'}
                  {String(r.id).padStart(6, '0')}
                </span>
                <span className="tid">Senast ändrat: {String(r.tid).slice(0, 10)}</span>
              </div>
              <h3>{r.rubrik}</h3>
              <div className="objekt">{r.objekt}</div>
              <div className="fot">
                <span className="del">
                  <Ikon namn="kategori" storlek={18} /> {r.klar ? 'Klar' : 'Öppen'}
                </span>
                {r.av && <span className="del">{r.av}</span>}
                {r.slag === 'avvikelse' && r.prioritet && (
                  <span className={`prio p${r.prioritet}`}>Prio {r.prioritet}.</span>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}

      {!(data.dagar || []).length && <p className="svag">Inget att visa här.</p>}
    </>
  );
}

/**
 * Pågående kontroller. "Mina" är de som ligger halvfärdiga i telefonen —
 * de kan vara osynkade, och då känner servern inte till dem. Därför
 * läses de ur kön och inte ur svaret, och därför går de att trycka på:
 * poängen med listan är att komma tillbaka in i ronden.
 */
export function Pagaende() {
  const { ga } = useRuta();
  const [vems, sattVems] = useState('mina');
  const [lokala, sattLokala] = useState(laddaRonder);
  useEffect(() => prenumerera(sattLokala), []);
  const d = useHamta(() => api.hamta('/api/kontroll/pagaende'));
  if (d.laddar && !d.data) return <Vanta />;
  const data = d.data?.data || d.data || {};

  const mina = lokala
    .filter((r) => !r.klar)
    .map((r) => ({
      id: r.lokalId,
      mall: r.mallnamn,
      objekt: r.objektnamn || 'Allmänt',
      startad: r.startad,
      kvar: r.punkter.length - antalBesvarade(r),
      lokalId: r.lokalId,
    }));
  const rader = vems === 'mina' ? mina : data.andras || [];

  return (
    <>
      <p className="kv-sidrubrik">Pågående kontroller</p>
      <div className="kv-segment">
        <button aria-pressed={vems === 'mina'} onClick={() => sattVems('mina')}>Mina</button>
        <button aria-pressed={vems === 'andras'} onClick={() => sattVems('andras')}>Andras</button>
      </div>
      {rader.length ? (
        <div className="kv-lista">
          {rader.map((r) => {
            const Tagg = r.lokalId ? 'button' : 'div';
            return (
              <Tagg key={r.id} className="rad"
                onClick={r.lokalId ? () => ga('rond', { lokalId: r.lokalId }) : undefined}>
                <span className="prick" />
                <span className="txt">
                  <strong>{r.mall}</strong>
                  <small>
                    {r.objekt} · {klockan(r.startad)}
                    {r.av ? ` · ${r.av}` : ''}
                    {r.kvar ? ` · ${r.kvar} punkter kvar` : ''}
                  </small>
                </span>
                {r.lokalId && <span aria-hidden="true">›</span>}
              </Tagg>
            );
          })}
        </div>
      ) : (
        <p className="svag" style={{ textAlign: 'center', marginTop: 40 }}>
          {vems === 'mina' ? 'Du har inga pågående kontroller' : 'Ingen annan har någon pågående kontroll'}
        </p>
      )}
    </>
  );
}
