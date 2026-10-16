// Byggstenar för mobilgränssnittet.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Klubbmärket: sköld, vårdkasen och en åkare i sväng.
 * Färgerna styrs med --marke-fond (skölden) och --marke-motiv (figurerna),
 * så att märket kan ligga både på grön list och på vit yta.
 */
export const Marke = ({ storlek = 30 }) => {
  // Under ~36 px försvinner vårdkasens stegpinnar. Då ritas en förenklad
  // variant: skölden och åkaren, lite större och grövre.
  if (storlek < 36)
    return (
      <svg viewBox="0 0 512 512" width={storlek} height={storlek} aria-hidden="true" className="marke-svg">
        <path
          d="M110 96 h268 a14 14 0 0 1 14 14 v146 c0 98 -62 160 -148 192 C 160 416, 96 354, 96 256 V 110 a14 14 0 0 1 14 -14 Z"
          fill="var(--marke-fond, #fff)"
        />
        <g stroke="var(--marke-motiv, #8cc63f)" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M300 272 L252 300" strokeWidth="34" />
          <path d="M252 300 L260 336" strokeWidth="32" />
          <path d="M300 272 L240 234" strokeWidth="38" />
          <path d="M240 234 L180 246" strokeWidth="24" />
          <path d="M146 362 L312 320" strokeWidth="20" />
        </g>
        <circle cx="216" cy="210" r="28" fill="var(--marke-motiv, #8cc63f)" />
      </svg>
    );

  return (
  <svg viewBox="0 0 512 512" width={storlek} height={storlek} aria-hidden="true" className="marke-svg">
    <path
      d="M110 96 h268 a14 14 0 0 1 14 14 v146 c0 98 -62 160 -148 192 C 160 416, 96 354, 96 256 V 110 a14 14 0 0 1 14 -14 Z"
      fill="var(--marke-fond, #fff)"
    />
    <g stroke="var(--marke-motiv, #8cc63f)" strokeWidth="12" fill="none" strokeLinecap="round">
      <path d="M148 286 L182 148 L216 286" />
      <path d="M160 236 H204" />
      <path d="M154 262 H210" />
      <path d="M168 204 H196" />
    </g>
    <g stroke="var(--marke-motiv, #8cc63f)" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M330 276 L296 296" strokeWidth="26" />
      <path d="M296 296 L302 322" strokeWidth="24" />
      <path d="M330 276 L286 248" strokeWidth="30" />
      <path d="M286 248 L244 256" strokeWidth="18" />
      <path d="M214 348 L336 318" strokeWidth="14" />
      <path d="M222 364 L344 334" strokeWidth="14" />
    </g>
      <circle cx="268" cy="230" r="21" fill="var(--marke-motiv, #8cc63f)" />
    </svg>
  );
};

export const Bricka = ({ farg = '', children }) => <span className={`bricka ${farg}`}>{children}</span>;
export const Tomt = ({ children = 'Inget här ännu.' }) => <div className="tomt">{children}</div>;
export const Vanta = ({ children = 'Hämtar …' }) => <div className="vanta">{children}</div>;

export const Framsteg = ({ andel }) => (
  <div className="framsteg">
    <span style={{ width: `${Math.max(0, Math.min(100, andel))}%` }} />
  </div>
);

export const Post = ({ figur, figurfarg = '', titel, under, hoger, ...rest }) => (
  <button className="post" {...rest}>
    {figur && <span className={`figur ${figurfarg}`}>{figur}</span>}
    <span className="txt">
      <strong>{titel}</strong>
      {under && <span className="liten svag">{under}</span>}
    </span>
    {hoger ?? <span className="pil" aria-hidden="true">›</span>}
  </button>
);

export const Text = ({ etikett, varde, satt, ...rest }) => (
  <label className="falt">
    <span>{etikett}</span>
    <input value={varde ?? ''} onChange={(e) => satt(e.target.value)} {...rest} />
  </label>
);

export const Omrade = ({ etikett, varde, satt, ...rest }) => (
  <label className="falt">
    <span>{etikett}</span>
    <textarea value={varde ?? ''} onChange={(e) => satt(e.target.value)} {...rest} />
  </label>
);

export const Val = ({ etikett, varde, satt, poster, tomtext = '–', ...rest }) => (
  <label className="falt">
    <span>{etikett}</span>
    <select value={varde ?? ''} onChange={(e) => satt(e.target.value)} {...rest}>
      {tomtext !== null && <option value="">{tomtext}</option>}
      {poster.map((p) => (
        <option key={p.varde} value={p.varde}>{p.text}</option>
      ))}
    </select>
  </label>
);

export const Segment = ({ poster, varde, satt }) => (
  <div className="segment">
    {poster.map((p) => (
      <button key={p.varde} aria-pressed={varde === p.varde} onClick={() => satt(p.varde)}>
        {p.text}
      </button>
    ))}
  </div>
);

export function Ark({ titel, children, fot, stang }) {
  useEffect(() => {
    const vid = (e) => e.key === 'Escape' && stang?.();
    document.addEventListener('keydown', vid);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', vid);
      document.body.style.overflow = '';
    };
  }, [stang]);
  // Arket ritas i body: inuti den rullande ytan blir position:fixed opålitligt.
  return createPortal(
    <div className="ark-bak" onMouseDown={(e) => e.target === e.currentTarget && stang?.()}>
      <div className="ark" role="dialog" aria-label={titel}>
        <header>
          <h2>{titel}</h2>
          <button className="tom" onClick={stang} aria-label="Stäng">✕</button>
        </header>
        <div className="kropp">{children}</div>
        {fot && <footer>{fot}</footer>}
      </div>
    </div>,
    document.body
  );
}

const NotisKontext = createContext(() => {});
export const useNotis = () => useContext(NotisKontext);

export function Notiser({ children }) {
  const [koen, satt] = useState([]);
  const visa = useCallback((text, slag = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    satt((k) => [...k, { id, text, slag }]);
    setTimeout(() => satt((k) => k.filter((n) => n.id !== id)), slag === 'fel' ? 6000 : 2600);
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
}

export function useHamta(hamtare, nycklar = []) {
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
}

/** Är vi online just nu? */
export function useNat() {
  const [pa, satt] = useState(navigator.onLine);
  useEffect(() => {
    const upp = () => satt(true);
    const ner = () => satt(false);
    window.addEventListener('online', upp);
    window.addEventListener('offline', ner);
    return () => {
      window.removeEventListener('online', upp);
      window.removeEventListener('offline', ner);
    };
  }, []);
  return pa;
}

export const INTERVALL = {
  vid_start: 'Vid start', per_pass: 'Per pass', dagligen: 'Dagligen',
  veckovis: 'Veckovis', sasong: 'Säsong',
};
export const UTRUSTNINGSTYP = {
  lans: 'Lans', flakt: 'Fläkt', pumpstation: 'Pumpstation', kompressor: 'Kompressor',
  lift: 'Lift', band: 'Band', pistmaskin: 'Pistmaskin', ovrigt: 'Övrigt',
};
export const UTRUSTNINGSTYP_FLERTAL = {
  lans: 'lansar', flakt: 'fläktar', pumpstation: 'pumpstationer', kompressor: 'kompressorer',
  lift: 'liftar', band: 'band', pistmaskin: 'pistmaskiner', ovrigt: 'enheter',
};
export const flertal = (typ) => UTRUSTNINGSTYP_FLERTAL[typ] || `${(UTRUSTNINGSTYP[typ] || typ).toLowerCase()}ar`;
export const klockan = (t) =>
  t ? new Date(String(t).replace(' ', 'T')).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export const sedan = (t) => {
  if (!t) return '';
  const min = (Date.now() - new Date(String(t).replace(' ', 'T')).getTime()) / 60000;
  if (min < 1) return 'nyss';
  if (min < 60) return `${Math.round(min)} min sedan`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h sedan`;
  return `${Math.round(min / 1440)} dgr sedan`;
};
