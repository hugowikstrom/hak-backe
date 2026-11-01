// Byggstenar för mobilgränssnittet.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export { Logotyp, Marke } from '../../delad/marke.jsx';

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

const iOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS säger sig vara en Mac. Pekskärmen avslöjar den.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const redanApp = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * Går appen att installera, och i så fall hur?
 * Returnerar `null` när den redan är installerad — då finns inget att
 * erbjuda, och en knapp som inte gör något är värre än ingen knapp.
 */
export function useInstallera() {
  // Händelsen fångas i main.jsx innan React startar – den kommer för
  // tidigt för en useEffect. Här läses bara det som lagts undan.
  const [handelse, sattHandelse] = useState(() => window.__hakInstallera || null);
  const [app, sattApp] = useState(redanApp);

  useEffect(() => {
    const bytte = () => {
      sattHandelse(window.__hakInstallera || null);
      sattApp(redanApp());
    };
    window.addEventListener('hak-installerbar', bytte);
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', bytte);
    return () => {
      window.removeEventListener('hak-installerbar', bytte);
      media.removeEventListener?.('change', bytte);
    };
  }, []);

  if (app) return null;
  if (handelse)
    return {
      slag: 'knapp',
      installera: () => {
        handelse.prompt();
        // Händelsen går bara att använda en gång.
        window.__hakInstallera = null;
      },
    };
  if (iOS()) return { slag: 'ios' };
  return null;
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
// Databasens värden är utan diakriter och gemena; folk läser dem inte.
export const ARENDESTATUS = {
  ny: 'Ny', bekraftad: 'Bekräftad', pagar: 'Pågår', vantar: 'Väntar',
  atgardad: 'Åtgärdad', stangd: 'Stängd',
};
export const ALLVARLIGHET = {
  sakerhetsrisk: 'Säkerhetsrisk', driftstopp: 'Driftstopp',
  begransar: 'Begränsar driften', kosmetisk: 'Kosmetisk',
};
export const ARENDETYP = { fel: 'Fel', brist: 'Brist', forbattring: 'Förbättring', risk: 'Risk' };
export const UTRUSTNINGSSTATUS = { drift: 'I drift', service: 'På service', ur_drift: 'Ur drift' };

export const UTRUSTNINGSTYP_FLERTAL = {
  lans: 'lansar', flakt: 'fläktar', pumpstation: 'pumpstationer', kompressor: 'kompressorer',
  lift: 'liftar', band: 'band', pistmaskin: 'pistmaskiner', ovrigt: 'enheter',
};
export const flertal = (typ) => UTRUSTNINGSTYP_FLERTAL[typ] || `${(UTRUSTNINGSTYP[typ] || typ).toLowerCase()}ar`;
export const klockan = (t) =>
  t ? new Date(String(t).replace(' ', 'T')).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
/**
 * Som klockan(), men utan tid när värdet bara är ett datum. En tankning
 * registrerad på "2026-10-29" skedde inte 01:00 – den saknar klockslag,
 * och att hitta på ett är värre än att utelämna det.
 */
export const nar = (t) => {
  if (!t) return '';
  const s = String(t);
  if (s.length <= 10)
    return new Date(`${s}T12:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  return klockan(s);
};
export const sedan = (t) => {
  if (!t) return '';
  const min = (Date.now() - new Date(String(t).replace(' ', 'T')).getTime()) / 60000;
  if (min < 1) return 'nyss';
  if (min < 60) return `${Math.round(min)} min sedan`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h sedan`;
  return `${Math.round(min / 1440)} dgr sedan`;
};
