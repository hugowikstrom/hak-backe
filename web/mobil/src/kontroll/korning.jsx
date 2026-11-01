// En utförd kontroll, punkt för punkt.
//
// Det här är vad en kontroll är värd efteråt: inte att den blev gjord,
// utan vad som stod i den. En avvikelse längst ned i en rond från i
// förrgår är ofta hela förklaringen till dagens fel.
import { api } from '../api.js';
import { klockan, nar, useHamta, Vanta } from '../delar.jsx';
import { Ikon } from './skal.jsx';

const data = (d) => d.data?.data || d.data || {};

const SVARSTEXT = (p) => {
  if (p.ej_tillampligt) return 'Gick inte att utföra';
  if (p.avvikelse) return 'Avvikelse';
  if (p.svarstyp === 'bock') return p.bockad ? 'OK' : 'Obesvarad';
  if (p.varde != null) return `${p.varde}${p.enhet ? ` ${p.enhet}` : ''}`;
  if (p.svarstext) return p.svarstext;
  return 'Obesvarad';
};

export function Korning({ vy }) {
  const id = vy.korning.id;
  const d = useHamta(() => api.hamta(`/api/checklistor/korningar/${id}`), [id]);
  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;
  const k = data(d);
  // Positionen före maskinen, och maskinen som noteras bredvid: en
  // snöläggningsrond går på platsen, inte på kanonen som står där.
  const objekt = k.plats || k.utrustning || k.omrade || 'Allmänt';
  const maskin = k.plats && k.utrustning ? k.utrustning : null;

  return (
    <>
      <div className="kv-lista" style={{ marginBottom: 12 }}>
        <div className="rad">
          <Ikon namn="kontroll" storlek={20} />
          <span className="txt">
            <strong>{k.mall}</strong>
            <small>{objekt}{maskin ? ` · ${maskin}` : ''}</small>
          </span>
        </div>
        <div className="rad">
          <span className="txt">
            <strong>{k.avslutad ? 'Avslutad' : 'Pågår'}</strong>
            <small>
              Startad {klockan(k.startad)}
              {k.avslutad ? ` · avslutad ${klockan(k.avslutad)}` : ''}
              {k.av ? ` · ${k.av}` : ''}
            </small>
          </span>
        </div>
        <div className="rad">
          <span className="txt">
            <strong>{k.antal_svar} av {k.antal_punkter} besvarade</strong>
            {k.antal_avvikelser > 0 && (
              <small>{k.antal_avvikelser} {k.antal_avvikelser === 1 ? 'avvikelse' : 'avvikelser'}</small>
            )}
          </span>
        </div>
        {k.brist_motivering && (
          <div className="rad">
            <span className="txt"><strong>Motivering för luckorna</strong><small>{k.brist_motivering}</small></span>
          </div>
        )}
        {k.kvittens_beslut && (
          <div className="rad">
            <span className="txt">
              <strong>Kvittens: {k.kvittens_beslut}</strong>
              <small>{nar(k.kvittens_tid)}{k.kvittens_anteckning ? ` · ${k.kvittens_anteckning}` : ''}</small>
            </span>
          </div>
        )}
      </div>

      <h2 className="kv-rubrik">Punkterna</h2>
      <div className="kv-lista">
        {(k.punkter || []).map((p) => (
          <div key={p.id} className="rad">
            <span className="txt">
              <strong>{p.text}</strong>
              <small>
                {SVARSTEXT(p)}
                {p.kommentar ? ` · ${p.kommentar}` : ''}
                {p.motivering ? ` · ${p.motivering}` : ''}
              </small>
              {p.bild && <img className="kv-foto" src={`/api/bilder/${p.bild}`} alt="Foto från kontrollen" />}
            </span>
            {!!p.sakerhetskritisk && <span className="kv-flagga rod">Säkerhet</span>}
            {!p.sakerhetskritisk && !!p.avvikelse && <span className="kv-flagga gul">Avvikelse</span>}
          </div>
        ))}
        {!(k.punkter || []).length && <div className="tomt">Checklistan har inga punkter.</div>}
      </div>
    </>
  );
}
