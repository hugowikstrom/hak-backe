// Enhetsvyn och allt som hänger under den.
//
// Fyra nivåer: arbetsställe → enhet → vad man vill se → den enskilda
// posten. Djupet är ärvt från systemet klubben kommer ifrån och är inte
// värt att korta – den som letar besiktningsintyg letar där intygen
// alltid legat.
import { useState } from 'react';
import { api } from '../api.js';
import {
  ALLVARLIGHET, ARENDESTATUS, ARENDETYP, klockan, nar, useHamta, UTRUSTNINGSSTATUS,
  UTRUSTNINGSTYP, Vanta,
} from '../delar.jsx';
import { Ikon } from './skal.jsx';

const data = (d) => d.data?.data || d.data || {};

export const hamtaObjekt = (slag, id) =>
  api.hamta(`/api/kontroll/objekt?slag=${slag}&id=${id}`);

/** En rad i en lista. Samma form överallt, så ögat slipper lära om. */
export const Rad = ({ ikon, titel, under, hoger, onClick, prick, farg }) => {
  const Tagg = onClick ? 'button' : 'div';
  return (
    <Tagg className="rad" onClick={onClick}>
      {ikon && <Ikon namn={ikon} storlek={20} />}
      {prick && <span className="prick" style={farg ? { background: farg } : undefined} />}
      <span className="txt">
        <strong>{titel}</strong>
        {under && <small>{under}</small>}
      </span>
      {hoger !== undefined ? <span className="hoger">{hoger}</span> : null}
      {onClick && <span aria-hidden="true">›</span>}
    </Tagg>
  );
};

export const Lista = ({ children, tomt = 'Inget här ännu.' }) => (
  <div className="kv-lista">{children ?? <div className="tomt">{tomt}</div>}</div>
);

const PRIOFARG = { 1: '#c0392b', 2: '#e0ae2f', 3: '#4a7fb5', 4: '#8a9099' };

/**
 * Enhetsvyn, byggd som förlagan.
 *
 * Två piller högst upp — "+ Ny" och "Mer ⋮" — och under dem tre kort:
 * mätarställningen, enhetens egna uppgifter, och sedan räknarna. Allt
 * som går att *göra* ligger bakom de två pillren; vyn i sig är något man
 * läser. Det var inte så jag hade ritat den, men det är vägen handen
 * redan kan.
 */
export function Enhet({ vy, ga }) {
  const { objekt, stalle } = vy;
  const slag = objekt.slag || 'utrustning';
  const [mer, sattMer] = useState(false);
  const [oppna, sattOppna] = useState(null);
  const d = useHamta(() => hamtaObjekt(slag, objekt.id), [slag, objekt.id]);
  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;
  const i = data(d);
  const o = i.objekt || objekt;
  const forsenade = i.kontroller?.forsenade || [];
  const avvikelser = (i.avvikelser || []).filter((a) => !['atgardad', 'stangd'].includes(a.status));
  const vidare = (namn, extra) => () => ga(namn, { objekt: { ...o, slag }, stalle, info: i, ...extra });

  const uppgifter = [
    o.serienummer && ['ID', o.serienummer],
    o.tillverkare && ['Märke', o.tillverkare],
    o.modell && ['Modell', o.modell],
    ['Typ', UTRUSTNINGSTYP[o.typ] || o.typ || '–'],
    i.arbetsstalle && ['Arbetsställe', i.arbetsstalle.namn],
  ].filter(Boolean);

  /** Hopfällbar räknare: siffran i en ring, och listan under. */
  const avdelning = (nyckel, rubrik, antal, tomt, rader) => (
    <section key={nyckel}>
      <h2 className="kv-avdelning">{rubrik}</h2>
      <button className="kv-raknare" aria-expanded={oppna === nyckel}
        onClick={() => sattOppna(oppna === nyckel ? null : nyckel)}>
        <span className="ring">{antal}</span>
        <span className="txt">{antal ? rubrik : tomt}</span>
        <span className={`pil${oppna === nyckel ? ' upp' : ''}`}><Ikon namn="ned" storlek={22} /></span>
      </button>
      {oppna === nyckel && rader}
    </section>
  );

  return (
    <>
      <div className="kv-knapprad">
        <button className="kv-pill" onClick={vidare('enhetny')}>
          <Ikon namn="plus" storlek={24} /> Ny
        </button>
        <button className="kv-pill" onClick={() => sattMer(true)}>
          Mer <Ikon namn="mer" storlek={22} />
        </button>
      </div>

      {slag === 'utrustning' && (
        <div className="kv-kort-rad">
          <Ikon namn="matare" storlek={28} />
          <span className="txt">
            <strong>Standardmätarställning</strong>
            <small>{o.drifttimmar != null ? `${o.drifttimmar} h` : '0 h'}</small>
          </span>
        </div>
      )}

      <div className="kv-uppgifter">
        {uppgifter.map(([e, v]) => (
          <div key={e} className="kv-post">
            <span className="etikett">{e}:</span>
            <span className="varde">{v}</span>
          </div>
        ))}
      </div>

      {avdelning(
        'kontroller',
        'Kontroller',
        forsenade.length,
        'Inga försenade kontroller',
        <div className="kv-lista">
          {forsenade.length
            ? forsenade.map((k) => (
                <button key={k.mall_id} className="rad" onClick={vidare('kontrollval')}>
                  <span className="txt"><strong>{k.namn}</strong><small>{k.aldrig ? 'Aldrig utförd' : `Försenad ${k.forsenad_dagar} dagar`}</small></span>
                  <span aria-hidden="true">›</span>
                </button>
              ))
            : <div className="tomt">Inget försenat på den här enheten.</div>}
        </div>
      )}

      {avdelning(
        'avvikelser',
        'Avvikelser',
        avvikelser.length,
        'Avvikelser för denna enhet',
        <div className="kv-lista">
          {avvikelser.length
            ? avvikelser.map((a) => (
                <button key={a.id} className="rad" onClick={() => ga('avvikelse', { arende: a })}>
                  <span className="txt"><strong>{a.titel}</strong><small>Prio {a.prioritet} · {ARENDESTATUS[a.status] || a.status}</small></span>
                  <span aria-hidden="true">›</span>
                </button>
              ))
            : <div className="tomt">Inga öppna avvikelser.</div>}
        </div>
      )}

      {slag === 'utrustning' &&
        avdelning(
          'vatskor',
          'Vätsketyper',
          (i.vatskor || []).length,
          'Vätskor för denna enhet',
          <div className="kv-lista">
            {i.vatskor?.length
              ? i.vatskor.map((v) => (
                  <button key={v.vatsketyp} className="rad" onClick={vidare('vatskor')}>
                    <span className="txt">
                      <strong>{v.namn}</strong>
                      <small>{v.total} {v.matenhet} · senast {v.senast}</small>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                ))
              : <div className="tomt">Inga påfyllningar registrerade.</div>}
          </div>
        )}

      {mer && (
        <div className="kv-ark-bak" onMouseDown={(e) => e.target === e.currentTarget && sattMer(false)}>
          <div className="kv-ark" role="dialog" aria-label="Mer">
            {slag === 'utrustning' && (
              <button onClick={() => (sattMer(false), vidare('besiktningar')())}>Besiktningar &amp; certifikat</button>
            )}
            <button onClick={() => (sattMer(false), vidare('aktivitet')())}>Aktivitet</button>
            {slag === 'utrustning' && (
              <button onClick={() => (sattMer(false), vidare('enhetsdokument')())}>Dokument</button>
            )}
            <div className="skilj" />
            <button onClick={() => sattMer(false)}>Avbryt</button>
          </div>
        </div>
      )}
    </>
  );
}

/** "+ Ny" på en enhet: samma fyra val, men enheten är redan vald. */
export function EnhetNy({ vy, ga }) {
  const val = [
    ['kontrollval', 'Kontroll', 'kontroll'],
    ['nyavvikelse', 'Avvikelse', 'nyckel'],
    ['pafyllning', 'Påfyllning', 'vatska'],
    ['service', 'Service', 'service'],
  ];
  return (
    <div className="kv-lista">
      {val.map(([v, namn, ikon]) => (
        <button key={v} className="rad" onClick={() => ga(v, { objekt: vy.objekt, stalle: vy.stalle })}>
          <Ikon namn={ikon} storlek={22} />
          <span className="txt"><strong>{namn}</strong></span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Avvikelselistan, byggd som förlagan: sökruta med förstoringsglas,
 * en filterrad, och kort som bär arbetsställe och enhet under rubriken.
 * Foten visar kategori och prioritet — inte status, för status är det
 * man ändrar inne i ärendet, inte det man letar efter i listan.
 */
export function Avvikelselista({ rader, ga, laddar }) {
  const [sok, sattSok] = useState('');
  const [bilder, sattBilder] = useState(false);
  if (laddar) return <Vanta />;
  const s = sok.trim().toLowerCase();
  const visade = (rader || []).filter(
    (a) => !s || `${a.titel} ${a.utrustning || ''} ${a.omrade || ''}`.toLowerCase().includes(s)
  );

  return (
    <>
      <div className="kv-sokfalt">
        <Ikon namn="sok" storlek={22} />
        <input value={sok} onChange={(e) => sattSok(e.target.value)} placeholder="Sök" aria-label="Sök" />
      </div>
      <div className="kv-filterrad">
        <span>Filtrera</span>
        <Ikon namn="reglage" storlek={22} />
      </div>
      <label className="kv-vippa">
        <input type="checkbox" checked={bilder} onChange={(e) => sattBilder(e.target.checked)} />
        <span className="spar" aria-hidden="true" />
        Visa miniatyrbilder
      </label>

      {visade.length ? (
        visade.map((a) => (
          <Avvikelsekort key={a.id} a={a} bild={bilder} onClick={() => ga('avvikelse', { arende: a })} />
        ))
      ) : (
        <p className="svag" style={{ textAlign: 'center', marginTop: 36 }}>Hittade inga avvikelser.</p>
      )}
    </>
  );
}

/** Kortet. Samma form i listan och i tidslinjen. */
export function Avvikelsekort({ a, bild, onClick }) {
  const plats = [a.arbetsstalle, a.utrustning || a.omrade || a.plats].filter(Boolean).join(' / ');
  return (
    <article className="kv-arende avvikelse" style={{ borderRightColor: PRIOFARG[a.prioritet] }}
      onClick={onClick}>
      <div className="nrrad">
        <Ikon namn="nyckel" storlek={19} />
        <span className="nr">#D{String(a.id).padStart(6, '0')}</span>
        <span className="tid">Senast ändrat: {String(a.uppdaterad || a.skapad).slice(0, 10)}</span>
      </div>
      <h3>{a.titel}</h3>
      {plats && <div className="objekt">{plats}</div>}
      <div className="fot">
        <span className="del"><Ikon namn="kategori" storlek={18} /> {ARENDETYP[a.typ] || 'Avvikelse'}</span>
        {a.prioritet && <span className={`prio p${a.prioritet}`}>Prio {a.prioritet}.</span>}
        {bild && a.bild && <img className="mini" src={`/api/bilder/${a.bild}`} alt="" />}
      </div>
    </article>
  );
}

/** Avvikelserna på ett objekt. */
export function Avvikelser({ vy, ga }) {
  const d = useHamta(() => hamtaObjekt(vy.objekt.slag || 'utrustning', vy.objekt.id), [vy.objekt.id]);
  return <Avvikelselista rader={data(d).avvikelser} ga={ga} laddar={d.laddar && !d.data} />;
}

/** Avvikelserna i hela backen – kortet på startskärmen. */
export function AllaAvvikelser({ ga }) {
  const d = useHamta(() => api.hamta('/api/kontroll/avvikelser'));
  return <Avvikelselista rader={data(d).avvikelser} ga={ga} laddar={d.laddar && !d.data} />;
}

/** Den enskilda avvikelsen med sin historik – fjärde nivån. */
export function Avvikelse({ vy }) {
  const d = useHamta(() => api.hamta(`/api/arenden/${vy.arende.id}`), [vy.arende.id]);
  if (d.laddar && !d.data) return <Vanta />;
  const a = data(d);
  return (
    <>
      <article className="kv-arende avvikelse" style={{ borderRightColor: PRIOFARG[a.prioritet] }}>
        <div className="nrrad"><span className="nr">D{String(a.id).padStart(6, '0')}</span>
          <span className="tid">{klockan(a.skapad)}</span></div>
        <h3>{a.titel}</h3>
        {a.beskrivning && <div className="objekt">{a.beskrivning}</div>}
        {a.bild && <img className="kv-foto" src={`/api/bilder/${a.bild}`} alt="Foto på avvikelsen" />}
        <div className="fot">
          Prio {a.prioritet} · {ARENDESTATUS[a.status] || a.status} · {ALLVARLIGHET[a.allvarlighet] || a.allvarlighet}
        </div>
      </article>

      <Lista>
        {[
          a.utrustning && <Rad key="u" titel="Enhet" under={a.utrustning} />,
          a.omrade && <Rad key="o" titel="Nedfart" under={a.omrade} />,
          a.tilldelad && <Rad key="t" titel="Ansvarig" under={a.tilldelad} />,
          a.deadline && <Rad key="d" titel="Klart senast" under={a.deadline} />,
          a.driftpaverkan && <Rad key="p" titel="Driftpåverkan" under={a.driftpaverkan} />,
        ].filter(Boolean)}
      </Lista>

      <h2 className="kv-rubrik">Historik</h2>
      <Lista tomt="Ingen historik.">
        {a.handelser?.length
          ? a.handelser.map((h) => (
              <Rad key={h.id} titel={h.text || h.slag}
                under={`${klockan(h.tid)}${h.av ? ` · ${h.av}` : ''}`} />
            ))
          : null}
      </Lista>
    </>
  );
}

/** Vätskorna: en rad per typ, och historiken under. */
export function Vatskor({ vy, ga }) {
  const d = useHamta(() => hamtaObjekt('utrustning', vy.objekt.id), [vy.objekt.id]);
  const f = useHamta(() => api.hamta(`/api/pafyllningar?utrustning_id=${vy.objekt.id}`), [vy.objekt.id]);
  if (d.laddar && !d.data) return <Vanta />;
  const i = data(d);
  const forbrukning = data(f).forbrukning;

  return (
    <>
      {forbrukning && (
        <Lista>
          <Rad ikon="vatska" titel={`${forbrukning.per_timme.toFixed(2)} l/h`}
            under={`${forbrukning.liter.toFixed(0)} liter på ${forbrukning.timmar} drifttimmar`} />
        </Lista>
      )}
      <h2 className="kv-rubrik">Vätsketyper</h2>
      <Lista tomt="Inga påfyllningar registrerade.">
        {i.vatskor?.length
          ? i.vatskor.map((v) => (
              <Rad key={v.vatsketyp} titel={v.namn}
                under={`${v.total} ${v.matenhet} på ${v.antal} påfyllning${v.antal === 1 ? '' : 'ar'} · senast ${v.senast}`} />
            ))
          : null}
      </Lista>

      <h2 className="kv-rubrik">Påfyllningar</h2>
      <Lista tomt="Inga påfyllningar registrerade.">
        {i.pafyllningar?.length
          ? i.pafyllningar.map((p) => (
              <Rad key={p.id} titel={`${p.typnamn} · ${p.mangd} ${p.matenhet}`}
                under={`${p.datum}${p.matarstallning ? ` · ${p.matarstallning} h` : ''}${p.av ? ` · ${p.av}` : ''}`} />
            ))
          : null}
      </Lista>

      <button className="kv-knapp" onClick={() => ga('pafyllning', { objekt: vy.objekt })}>
        <Ikon namn="vatska" storlek={20} /> Registrera påfyllning
      </button>
    </>
  );
}

/**
 * Besiktningar och certifikat. Utgånget först – det är det som stoppar
 * driften. Utan ett objekt visas hela backens, som från startskärmen.
 */
export function Besiktningar({ vy }) {
  const id = vy?.objekt?.id ?? null;
  const d = useHamta(
    () => (id ? hamtaObjekt('utrustning', id) : api.hamta('/api/besiktningar')),
    [id]
  );
  if (d.laddar && !d.data) return <Vanta />;
  const rader = data(d).besiktningar || [];
  const giltighet = (b) => {
    if (!b.giltig_till) return b.utfardad ? `Utfärdad ${b.utfardad}` : b.slag;
    if (b.utgangen) return `Gick ut ${b.giltig_till}`;
    return `Giltig till ${b.giltig_till} · ${b.dagar_kvar} dagar kvar`;
  };
  return (
    <Lista tomt="Inga besiktningar eller certifikat registrerade.">
      {rader.length
        ? rader.map((b) => (
            <Rad key={b.id} ikon="dokument" titel={b.namn}
              under={[giltighet(b), id ? null : b.utrustning || b.arbetsstalle]
                .filter(Boolean)
                .join(' · ')}
              hoger={b.utgangen ? <span className="kv-flagga rod">Utgången</span> : null} />
          ))
        : null}
    </Lista>
  );
}

/**
 * Aktiviteten: allt som hänt på objektet, nyast först. Kontroller,
 * tankningar och service i samma spalt – tillsammans förklarar de
 * varför maskinen mår som den gör.
 */
export function Aktivitet({ vy, ga }) {
  const d = useHamta(() => hamtaObjekt(vy.objekt.slag || 'utrustning', vy.objekt.id), [vy.objekt.id]);
  if (d.laddar && !d.data) return <Vanta />;
  const rader = data(d).aktivitet || [];
  const ikon = { kontroll: 'kontroll', pafyllning: 'vatska', service: 'service' };
  return (
    <Lista tomt="Inget har registrerats på den här enheten ännu.">
      {rader.length
        ? rader.map((r) => (
            <Rad key={`${r.slag}${r.id}`} ikon={ikon[r.slag]} titel={r.rubrik}
              onClick={r.slag === 'kontroll' ? () => ga('korning', { korning: r }) : undefined}
              under={[nar(r.tid), r.av, r.detalj].filter(Boolean).join(' · ')}
              hoger={
                r.avvikelser > 0 ? (
                  <span className="kv-flagga gul">
                    {r.avvikelser} {r.avvikelser === 1 ? 'avvikelse' : 'avvikelser'}
                  </span>
                ) : r.pagar ? (
                  <span className="kv-flagga">Pågår</span>
                ) : null
              } />
          ))
        : null}
    </Lista>
  );
}

/** Enhetens egna dokument. */
export function Enhetsdokument({ vy }) {
  const d = useHamta(() => hamtaObjekt('utrustning', vy.objekt.id), [vy.objekt.id]);
  if (d.laddar && !d.data) return <Vanta />;
  const rader = data(d).dokument || [];
  return (
    <Lista tomt="Inga dokument uppladdade på den här enheten.">
      {rader.length
        ? rader.map((x) => (
            <a key={x.id} className="rad" href={`/api/underhall/dokument/${x.id}/fil`} target="_blank" rel="noreferrer">
              <Ikon namn="dokument" storlek={20} />
              <span className="txt">
                <strong>{x.namn}</strong>
                <small>{x.slag}{x.sidor ? ` · ${x.sidor} sidor` : ''}</small>
              </span>
              <span aria-hidden="true">›</span>
            </a>
          ))
        : null}
    </Lista>
  );
}
