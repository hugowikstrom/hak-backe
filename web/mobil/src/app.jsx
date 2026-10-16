// HAK Rond – mobilappen. Skal, inloggning och vyval.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { laddaRonder, prenumerera, startaSynk } from './ko.js';
import { Marke, Notiser, useNat, Vanta } from './delar.jsx';
import { Inlogg } from './sidor/inlogg.jsx';
import { Hem } from './sidor/hem.jsx';
import { Rond } from './sidor/rond.jsx';
import { Historik } from './sidor/historik.jsx';
import { Mallar } from './sidor/mallar.jsx';
import { Konto } from './sidor/konto.jsx';

const RANG = { medlem: 1, backansvarig: 2, anlaggningsansvarig: 3, admin: 4 };
export const minstRoll = (m, roll) => (RANG[m?.roll] ?? 0) >= RANG[roll];

const JagKontext = createContext(null);
export const useJag = () => useContext(JagKontext);
const RutaKontext = createContext({ ga: () => {} });
export const useRuta = () => useContext(RutaKontext);

export function App() {
  const [medlem, sattMedlem] = useState(undefined);
  const [vy, sattVy] = useState({ namn: 'hem' });
  const [ronder, sattRonder] = useState(laddaRonder);
  const online = useNat();

  useEffect(() => {
    api.hamta('/api/jag').then((d) => sattMedlem(d.medlem)).catch(() => sattMedlem(null));
  }, []);

  useEffect(() => prenumerera(sattRonder), []);
  useEffect(() => (medlem ? startaSynk() : undefined), [medlem]);

  // Telefonens bakåtknapp ska stänga vyn, inte appen.
  useEffect(() => {
    const vid = (e) => sattVy(e.state?.vy || { namn: 'hem' });
    window.addEventListener('popstate', vid);
    return () => window.removeEventListener('popstate', vid);
  }, []);

  const ga = useCallback((namn, data = {}) => {
    const ny = { namn, ...data };
    window.history.pushState({ vy: ny }, '');
    sattVy(ny);
  }, []);
  const tillbaka = useCallback(() => window.history.back(), []);

  if (medlem === undefined) return <Vanta>Startar …</Vanta>;
  if (!medlem) return <Inlogg klar={sattMedlem} />;

  const far = minstRoll(medlem, 'backansvarig');
  const osynkade = ronder.filter((r) => !r.avslutad && r.klar).length;
  const pagaende = ronder.filter((r) => !r.klar).length;

  const Sida = {
    hem: Hem, rond: Rond, historik: Historik, mallar: Mallar, konto: Konto,
  }[vy.namn] || Hem;

  const flikar = [
    { namn: 'hem', text: 'Ronder', fig: '✓' },
    { namn: 'historik', text: 'Historik', fig: '≡' },
    ...(far ? [{ namn: 'mallar', text: 'Checklistor', fig: '✎' }] : []),
    { namn: 'konto', text: 'Konto', fig: '☻' },
  ];

  return (
    <JagKontext.Provider value={medlem}>
      <RutaKontext.Provider value={{ vy, ga, tillbaka }}>
        <Notiser>
          <div className="skal">
            <header className="topp">
              {vy.namn === 'rond' || vy.namn === 'mall' ? (
                <button className="tillbaka" onClick={tillbaka} aria-label="Tillbaka">‹</button>
              ) : null}
              <div className="marke">
                <Marke storlek={34} />
                <span>
                  HAK Rond
                  <small>Härnösands Alpina</small>
                </span>
              </div>
              <div className="slut">
                {osynkade > 0 && <span className="bricka gul">{osynkade} att skicka</span>}
              </div>
            </header>
            {!online && <div className="offlinerad">Offline – ronden sparas i telefonen och skickas sedan</div>}
            <main className="innehall">
              <div className="sida">
                <Sida vy={vy} ronder={ronder} />
              </div>
            </main>
            <nav className="botten">
              {flikar.map((f) => (
                <a
                  key={f.namn}
                  href="#"
                  aria-current={vy.namn === f.namn ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    ga(f.namn);
                  }}
                >
                  <span className="fig" aria-hidden="true">{f.fig}</span>
                  {f.text}
                  {f.namn === 'hem' && pagaende > 0 ? ` (${pagaende})` : ''}
                </a>
              ))}
            </nav>
          </div>
        </Notiser>
      </RutaKontext.Provider>
    </JagKontext.Provider>
  );
}
