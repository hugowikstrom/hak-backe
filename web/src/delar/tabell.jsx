// Generell datatabell med sortering, inlinefält och Excel-liknande tangentnavigering.
import { useMemo, useRef, useState } from 'react';
import { Tomt } from './bitar.jsx';
import { sorteraEfter } from '../nytta.js';

/**
 * kolumner: [{ falt, rubrik, sifra?, bredd?, visa?(rad), sortlos?,
 *   redigera?: {typ, poster?, varde?(rad), spara(rad, varde)} }]
 *
 * `poster` får vara en funktion av raden när valen beror på den, och
 * `varde` när cellens värde inte är samma sak som det som visas – en
 * maskinkolumn visar namnet men väljer på id.
 */
export function Tabell({
  rader,
  kolumner,
  nyckel = (r) => r.id,
  vidKlick,
  vald,
  standardsort,
  fot,
  tomtext,
  maxhojd,
}) {
  const [sort, sattSort] = useState(standardsort ? { falt: standardsort, riktning: 1 } : null);
  const kropp = useRef(null);

  const sorterade = useMemo(
    () => (sort ? sorteraEfter(rader, sort.falt, sort.riktning) : rader),
    [rader, sort]
  );

  const vaxlaSort = (k) => {
    if (k.sortlos) return;
    sattSort((s) =>
      s?.falt === k.falt ? { falt: k.falt, riktning: -s.riktning } : { falt: k.falt, riktning: 1 }
    );
  };

  // Tangentnavigering mellan redigerbara fält: piltangenter flyttar, Enter går nedåt.
  const tangent = (e) => {
    const falt = e.target;
    if (!['INPUT', 'SELECT'].includes(falt.tagName)) return;
    const celler = [...kropp.current.querySelectorAll('input, select')];
    const i = celler.indexOf(falt);
    if (i < 0) return;
    const bredd = kolumner.filter((k) => k.redigera).length || 1;
    const flytta = (steg) => {
      const nasta = celler[i + steg];
      if (nasta) {
        e.preventDefault();
        nasta.focus();
        nasta.select?.();
      }
    };
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && falt.tagName === 'INPUT')) flytta(bredd);
    else if (e.key === 'ArrowUp') flytta(-bredd);
    else if (e.key === 'ArrowRight' && falt.selectionStart === falt.value?.length) flytta(1);
    else if (e.key === 'ArrowLeft' && falt.selectionStart === 0) flytta(-1);
  };

  if (!rader.length) return <Tomt>{tomtext}</Tomt>;

  return (
    <div className="tabellramp" style={maxhojd ? { maxHeight: maxhojd } : undefined}>
      <table className="data" onKeyDown={tangent}>
        <thead>
          <tr>
            {kolumner.map((k) => (
              <th
                key={k.falt}
                className={`${k.sifra ? 'sifra' : ''}${k.sortlos ? '' : ' sorterbar'}`}
                style={k.bredd ? { width: k.bredd } : undefined}
                onClick={() => vaxlaSort(k)}
                title={k.titel}
              >
                {k.rubrik}
                {sort?.falt === k.falt ? (sort.riktning > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={kropp}>
          {sorterade.map((r) => (
            <tr
              key={nyckel(r)}
              className={`${vidKlick ? 'klickbar' : ''}${vald && vald === nyckel(r) ? ' valdrad' : ''}`}
              onClick={vidKlick ? (e) => !['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName) && vidKlick(r) : undefined}
            >
              {kolumner.map((k) => (
                <Cell key={k.falt} kolumn={k} rad={r} />
              ))}
            </tr>
          ))}
        </tbody>
        {fot && <tfoot><tr>{fot}</tr></tfoot>}
      </table>
    </div>
  );
}

function Cell({ kolumn, rad }) {
  const [sparar, sattSparar] = useState(false);
  const r = kolumn.redigera;
  if (!r) {
    return (
      <td className={kolumn.sifra ? 'sifra' : undefined}>
        {kolumn.visa ? kolumn.visa(rad) : rad[kolumn.falt] ?? '–'}
      </td>
    );
  }
  const nuvarande = r.varde ? r.varde(rad) : rad[kolumn.falt];
  const val = typeof r.poster === 'function' ? r.poster(rad) : r.poster;
  const skicka = async (varde) => {
    if (String(varde) === String(nuvarande ?? '')) return;
    sattSparar(true);
    try {
      await r.spara(rad, varde);
    } finally {
      sattSparar(false);
    }
  };
  return (
    <td className={`redigerbar${kolumn.sifra ? ' sifra' : ''}`} style={sparar ? { opacity: 0.5 } : undefined}>
      {r.typ === 'val' ? (
        <select value={nuvarande ?? ''} onChange={(e) => skicka(e.target.value)}>
          {val.map((p) => (
            <option key={p.varde} value={p.varde}>{p.text}</option>
          ))}
        </select>
      ) : (
        <input
          type={r.typ || 'text'}
          step={r.steg}
          defaultValue={nuvarande ?? ''}
          onBlur={(e) => skicka(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        />
      )}
    </td>
  );
}
