// Backis Rond – mobilappen. Skal, inloggning och vyval.
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
import { Handelse } from './sidor/handelse.jsx';
import { Passet } from './sidor/passet.jsx';
import { Mitt } from './sidor/mitt.jsx';
import { Utlagg } from './sidor/utlagg.jsx';
import { Kontrollvy } from './kontroll/index.jsx';

const RANG = { medlem: 1, backansvarig: 2, anlaggningsansvarig: 3, admin: 4 };
export const minstRoll = (m, roll) => (RANG[m?.roll] ?? 0) >= RANG[roll];

const JagKontext = createContext(null);
export const useJag = () => useContext(JagKontext);
const RutaKontext = createContext({ ga: () => {} });
export const useRuta = () => useContext(RutaKontext);

export function App() {
  const [medlem, sattMedlem] = useState(undefined);
  const [forening, sattForening] = useState(null);
  // Värdnamnet väljer vy. Ett sparat val vinner, så att den som hittat
  // hit från fel adress slipper leta tillbaka.
  const [kontrollvy] = useState(() => {
    // ?kontroll=1 i adressen vinner över allt och sparas – det är så
    // vyn demonstreras och filmas utan att byta värdnamn.
    const fran = new URLSearchParams(window.location.search).get('kontroll');
    if (fran !== null) {
      localStorage.setItem('hak-kontrollvy', fran === '1' ? '1' : '0');
      return fran === '1';
    }
    const sparat = localStorage.getItem('hak-kontrollvy');
    if (sparat !== null) return sparat === '1';
    return /^(checkproof|kontroll)\./i.test(window.location.hostname);
  });
  const [vy, sattVy] = useState({ namn: 'mitt' });
  const [ronder, sattRonder] = useState(laddaRonder);
  const online = useNat();

  useEffect(() => {
    api.hamta('/api/jag').then((d) => sattMedlem(d.medlem)).catch(() => sattMedlem(null));
    api.hamta('/api/plattform').then((d) => sattForening(d.forening)).catch(() => {});
  }, []);

  useEffect(() => prenumerera(sattRonder), []);
  useEffect(() => (medlem ? startaSynk() : undefined), [medlem]);

  // Telefonens bakåtknapp ska stänga vyn, inte appen.
  useEffect(() => {
    const vid = (e) => sattVy(e.state?.vy || { namn: 'mitt' });
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
  if (!medlem) return <Inlogg klar={sattMedlem} kontrollvy={kontrollvy} />;

  // Kontrollvyn: en egen navigation över samma data, för klubbar som är
  // vana vid att allt hänger på ett arbetsställe. Värdnamnet väljer den,
  // och valet går att ändra under Konto.
  //
  // Själva ronden är densamma i båda vyerna. Den ligger kvar på den
  // yttre routern, så att telefonens bakåtknapp fungerar mitt i en rond
  // och så att den halvfärdiga ronden överlever ett vyväxlande.
  if (kontrollvy) {
    const Egen = { rond: Rond, konto: Konto, handelse: Handelse, utlagg: Utlagg }[vy.namn];
    return (
      <JagKontext.Provider value={medlem}>
        <RutaKontext.Provider value={{ vy, ga, tillbaka }}>
          <Notiser>
            {/* Kontrollvyn monteras alltid: lämnar man ronden ska man
                komma tillbaka dit man startade den, inte till startsidan.
                Därför göms den i stället för att plockas ned. */}
            <div hidden={Boolean(Egen)}>
              <Kontrollvy medlem={medlem} forening={forening} meny={() => ga('konto')} />
            </div>
            {Egen ? (
              <div className="skal kontrollskal">
                <header className="topp">
                  <button className="tillbaka" onClick={tillbaka} aria-label="Tillbaka">‹</button>
                  <div className="marke">
                    <Marke storlek={30} />
                    <span>{forening?.namn || 'Backis'}</span>
                  </div>
                  <div className="slut" />
                </header>
                {!online && (
                  <div className="offlinerad">Offline – ronden sparas i telefonen och skickas sedan</div>
                )}
                <main className="innehall">
                  <div className="sida">
                    <Egen vy={vy} ronder={ronder} />
                  </div>
                </main>
              </div>
            ) : null}
          </Notiser>
        </RutaKontext.Provider>
      </JagKontext.Provider>
    );
  }

  const far = minstRoll(medlem, 'backansvarig');
  const osynkade = ronder.filter((r) => !r.avslutad && r.klar).length;
  const pagaende = ronder.filter((r) => !r.klar).length;

  const Sida = {
    mitt: Mitt, hem: Hem, rond: Rond, historik: Historik, mallar: Mallar, konto: Konto,
    handelse: Handelse, passet: Passet, utlagg: Utlagg,
  }[vy.namn] || Mitt;

  // Fyra flikar för en medlem. Den som har ansvar för backen får de två
  // till som hör till det – men bara den.
  // Korta ord med flit. Sju flikar på en telefonbredd rymmer inte
  // "Checklistor" – och en flik vars text kapas mitt i är sämre än en
  // flik som heter något kortare.
  const flikar = [
    { namn: 'mitt', text: 'Mitt', fig: '●' },
    { namn: 'handelse', text: 'Rapport', fig: '◉' },
    ...(far
      ? [
          { namn: 'hem', text: 'Ronder', fig: '✓' },
          { namn: 'passet', text: 'Pass', fig: '☷' },
          { namn: 'mallar', text: 'Mallar', fig: '✎' },
        ]
      : []),
    { namn: 'historik', text: 'Historik', fig: '≡' },
    { namn: 'konto', text: 'Konto', fig: '☻' },
  ];

  return (
    <JagKontext.Provider value={medlem}>
      <RutaKontext.Provider value={{ vy, ga, tillbaka }}>
        <Notiser>
          <div className="skal">
            <header className="topp">
              {['rond', 'mall', 'handelse', 'utlagg'].includes(vy.namn) ? (
                <button className="tillbaka" onClick={tillbaka} aria-label="Tillbaka">‹</button>
              ) : null}
              <div className="marke">
                <Marke storlek={34} />
                <span>
                  Backis Rond
                  <small>Härnösands Alpina</small>
                </span>
              </div>
              <div className="slut">
                {osynkade > 0 && <span className="bricka varning">{osynkade} att skicka</span>}
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
