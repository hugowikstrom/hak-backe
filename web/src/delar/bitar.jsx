// Återanvända byggstenar.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ARENDESTATUS, PRIORITET, procent } from '../nytta.js';

export const Kort = ({ titel, verktyg, children, tat = false, undertext }) => (
  <section className="kort">
    {(titel || verktyg) && (
      <header>
        <div className="kolumn" style={{ gap: 0 }}>
          {titel && <h2>{titel}</h2>}
          {undertext && <span className="liten svag">{undertext}</span>}
        </div>
        {verktyg && <div className="knapprad">{verktyg}</div>}
      </header>
    )}
    <div className={`kropp${tat ? ' tat' : ''}`}>{children}</div>
  </section>
);

export const Bricka = ({ farg = '', children, title }) => (
  <span className={`bricka ${farg}`} title={title}>{children}</span>
);

export const Prioritetsbricka = ({ niva }) => {
  const p = PRIORITET[niva] || PRIORITET[3];
  return <Bricka farg={p.farg}>{p.namn}</Bricka>;
};

export const Statusbricka = ({ status }) => {
  const s = ARENDESTATUS[status] || { namn: status, farg: '' };
  return <Bricka farg={s.farg}>{s.namn}</Bricka>;
};

export const Matare = ({ andel, farg }) => {
  const a = Math.max(0, Math.min(120, andel || 0));
  const klass = farg || (a >= 100 ? 'gron' : a >= 60 ? '' : a >= 30 ? 'gul' : 'rod');
  return (
    <div className={`matare ${klass}`} title={procent(andel)}>
      <span style={{ width: `${Math.min(100, a)}%` }} />
    </div>
  );
};

export const Nyckeltal = ({ etikett, varde, enhet, children, farg }) => (
  <div className="nyckeltal">
    <span className="etikett">{etikett}</span>
    <span className="stortal" style={farg ? { color: `var(--${farg})` } : undefined}>
      {varde}
      {enhet && <small>{enhet}</small>}
    </span>
    {children}
  </div>
);

export const Tomt = ({ children = 'Inget att visa.' }) => <div className="tomt">{children}</div>;
export const Vanta = ({ children = 'Hämtar …' }) => <div className="vanta">{children}</div>;

export const Falt = ({ etikett, krav, children, bredd }) => (
  <label className="falt" style={bredd ? { width: bredd } : undefined}>
    <span className={krav ? 'krav' : undefined}>{etikett}</span>
    {children}
  </label>
);

export const Text = ({ etikett, varde, satt, krav, typ = 'text', ...rest }) => (
  <Falt etikett={etikett} krav={krav}>
    <input type={typ} value={varde ?? ''} onChange={(e) => satt(e.target.value)} {...rest} />
  </Falt>
);

export const Val = ({ etikett, varde, satt, poster, tomtext = '–', krav, ...rest }) => (
  <Falt etikett={etikett} krav={krav}>
    <select value={varde ?? ''} onChange={(e) => satt(e.target.value)} {...rest}>
      {tomtext !== null && <option value="">{tomtext}</option>}
      {poster.map((p) => (
        <option key={p.varde ?? p.id} value={p.varde ?? p.id}>
          {p.text ?? p.namn}
        </option>
      ))}
    </select>
  </Falt>
);

export const Ruta = ({ etikett, pa, satt, ...rest }) => (
  <label className="rad" style={{ gap: 6, fontSize: 12.5 }}>
    <input type="checkbox" checked={!!pa} onChange={(e) => satt(e.target.checked)} {...rest} />
    <span>{etikett}</span>
  </label>
);

export const Lada = ({ titel, children, fot, stang, bred = false }) => {
  const ref = useRef(null);
  useEffect(() => {
    const vid = (e) => e.key === 'Escape' && stang?.();
    document.addEventListener('keydown', vid);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', vid);
  }, [stang]);
  return (
    <div className="lada-bak" onMouseDown={(e) => e.target === e.currentTarget && stang?.()}>
      <div className={`lada${bred ? ' bred' : ''}`} ref={ref} tabIndex={-1} role="dialog" aria-label={titel}>
        <header>
          <h2>{titel}</h2>
          <button className="tom" onClick={stang} aria-label="Stäng">✕</button>
        </header>
        <div className="kropp">{children}</div>
        {fot && <footer>{fot}</footer>}
      </div>
    </div>
  );
};

export const Flikar = ({ flikar, aktiv, satt }) => (
  <div className="flikar" role="tablist">
    {flikar.map((f) => (
      <button key={f.nyckel} role="tab" aria-selected={aktiv === f.nyckel} onClick={() => satt(f.nyckel)}>
        {f.text}
      </button>
    ))}
  </div>
);

export const Stapeldiagram = ({ poster, enhet = '', max }) => {
  const topp = max ?? Math.max(1, ...poster.map((p) => p.varde || 0));
  return (
    <div className="stapel">
      {poster.map((p) => (
        <div className="post" key={p.etikett}>
          <span className="radbryt" title={p.etikett} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.etikett}
          </span>
          <span className="spar">
            <span style={{ width: `${((p.varde || 0) / topp) * 100}%`, background: p.farg ? `var(--${p.farg})` : undefined }} />
          </span>
          <span className="num hoger liten">
            {p.text ?? `${p.varde}${enhet}`}
          </span>
        </div>
      ))}
      {!poster.length && <Tomt />}
    </div>
  );
};

/** Liten linjegraf med en eller två serier. Punkter: [{x, a, b}] i ordning. */
export const Linjegraf = ({ punkter, hojd = 120, etikett_a, etikett_b, noll = true }) => {
  if (punkter.length < 2) return <Tomt>För få mätpunkter.</Tomt>;
  const B = 480;
  const mv = 26;
  const varden = punkter.flatMap((p) => [p.a, p.b].filter((v) => v != null));
  const min = Math.min(...varden);
  const max = Math.max(...varden);
  const spann = max - min || 1;
  const x = (i) => mv + (i / (punkter.length - 1)) * (B - mv - 6);
  const y = (v) => 8 + (1 - (v - min) / spann) * (hojd - 26);
  const bana = (falt) =>
    punkter
      .map((p, i) => (p[falt] == null ? null : `${i === 0 || punkter[i - 1][falt] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[falt]).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  return (
    <svg className="graf" viewBox={`0 0 ${B} ${hojd}`} preserveAspectRatio="none" role="img">
      <line className="axel" x1={mv} y1={hojd - 16} x2={B - 4} y2={hojd - 16} />
      {noll && min < 0 && max > 0 && (
        <line className="noll" x1={mv} y1={y(0)} x2={B - 4} y2={y(0)} />
      )}
      <text x="2" y={y(max) + 3}>{max.toFixed(1)}</text>
      <text x="2" y={y(min) + 3}>{min.toFixed(1)}</text>
      <path className="linje" d={bana('a')} />
      {punkter.some((p) => p.b != null) && <path className="linje2" d={bana('b')} />}
      <text x={mv} y={hojd - 4}>{punkter[0].x}</text>
      <text x={B - 60} y={hojd - 4}>{punkter.at(-1).x}</text>
      {etikett_a && <text x={mv + 60} y={hojd - 4} style={{ fill: 'var(--blaa)' }}>— {etikett_a}</text>}
      {etikett_b && <text x={mv + 160} y={hojd - 4} style={{ fill: 'var(--lila)' }}>-- {etikett_b}</text>}
    </svg>
  );
};

// ---- Notiser ----
const NotisKontext = createContext(() => {});
export const useNotis = () => useContext(NotisKontext);

export const Notiser = ({ children }) => {
  const [koen, satt] = useState([]);
  const visa = useCallback((text, slag = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    satt((k) => [...k, { id, text, slag }]);
    setTimeout(() => satt((k) => k.filter((n) => n.id !== id)), slag === 'fel' ? 7000 : 3500);
  }, []);
  return (
    <NotisKontext.Provider value={visa}>
      {children}
      <div className="notis" aria-live="polite">
        {koen.map((n) => (
          <div key={n.id} className={n.slag}>{n.text}</div>
        ))}
      </div>
    </NotisKontext.Provider>
  );
};

/** Körs om när nycklarna ändras; returnerar {data, laddar, fel, uppdatera}. */
export const useHamta = (hamtare, nycklar = []) => {
  const [data, sattData] = useState(null);
  const [laddar, sattLaddar] = useState(true);
  const [fel, sattFel] = useState(null);
  const [rakna, sattRakna] = useState(0);
  const ref = useRef(hamtare);
  ref.current = hamtare;
  useEffect(() => {
    let aktuell = true;
    sattLaddar(true);
    ref
      .current()
      .then((d) => aktuell && (sattData(d), sattFel(null)))
      .catch((e) => aktuell && sattFel(e.message))
      .finally(() => aktuell && sattLaddar(false));
    return () => (aktuell = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...nycklar, rakna]);
  return { data, laddar, fel, uppdatera: () => sattRakna((n) => n + 1), sattData };
};
