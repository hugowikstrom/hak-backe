// Skalet: inloggning, navigering och sidval.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { Marke, Notiser, Vanta } from './delar/bitar.jsx';
import { minstRoll, ROLLNAMN } from './nytta.js';
import { Inlogg } from './sidor/inlogg.jsx';
import { Start } from './sidor/start.jsx';
import { Oversikt } from './sidor/oversikt.jsx';
import { Snolaggning } from './sidor/snolaggning.jsx';
import { Checklistor } from './sidor/checklistor.jsx';
import { Arenden } from './sidor/arenden.jsx';
import { Bemanning } from './sidor/bemanning.jsx';
import { Mina } from './sidor/mina.jsx';
import { Rapporter } from './sidor/rapporter.jsx';
import { Register } from './sidor/register.jsx';
import { Kassa } from './sidor/kassa.jsx';
import { Ekonomi } from './sidor/ekonomi.jsx';
import { Forening } from './sidor/forening.jsx';
import { Traning } from './sidor/traning.jsx';
import { Ideer } from './sidor/ideer.jsx';

// Menyn visar bara det inloggningen faktiskt får använda, och bara det som
// hör till arbetsytan man står i.
const SIDOR = [
  { stig: '/', text: 'Start', komp: Start, nyckel: 'start' },
  { stig: '/oversikt', text: 'Hela läget', komp: Oversikt, nyckel: 'oversikt' },
  { nyckel: 'snolaggning', stig: '/snolaggning', text: 'Snöläggning', komp: Snolaggning },
  { nyckel: 'checklistor', stig: '/checklistor', text: 'Checklistor', komp: Checklistor },
  { nyckel: 'arenden', stig: '/arenden', text: 'Ärenden', komp: Arenden },
  { nyckel: 'bemanning', stig: '/bemanning', text: 'Bemanning', komp: Bemanning },
  { nyckel: 'kassa', stig: '/kassa', text: 'Kassa', komp: Kassa, behorighet: 'kassa' },
  { nyckel: 'traning', stig: '/traning', text: 'Träning', komp: Traning, behorighet: 'traning' },
  { nyckel: 'forening', stig: '/forening', text: 'Föreningen', komp: Forening },
  { nyckel: 'ekonomi', stig: '/ekonomi', text: 'Ekonomi', komp: Ekonomi, behorighet: 'ekonomi_las' },
  { nyckel: 'ideer', stig: '/ideer', text: 'Idélådan', komp: Ideer },
  { nyckel: 'mina', stig: '/mina', text: 'Mina sidor', komp: Mina },
  { nyckel: 'rapporter', stig: '/rapporter', text: 'Rapporter', komp: Rapporter },
  { nyckel: 'register', stig: '/register', text: 'Register', komp: Register, roll: 'backansvarig' },
];

const Jag = createContext(null);
export const useJag = () => useContext(Jag);

// Vad den här föreningen har påslaget. Komponenter frågar hellre
// harModul('snolaggning') än gissar utifrån rollen.
const Plattform = createContext({ forening: null, moduler: [], harModul: () => true });
export const usePlattform = () => useContext(Plattform);

const Ruta = createContext({ stig: '/', ga: () => {} });
export const useRuta = () => useContext(Ruta);
export const Lank = ({ till, children, ...rest }) => {
  const { ga } = useRuta();
  return (
    <a href={till} onClick={(e) => { e.preventDefault(); ga(till); }} {...rest}>
      {children}
    </a>
  );
};

export function App() {
  const [plattform, sattPlattform] = useState(null);
  const [medlem, sattMedlem] = useState(undefined);
  const [stig, sattStig] = useState(window.location.pathname);
  const [tema, sattTema] = useState(() => localStorage.getItem('hak-tema') || 'ljust');
  const [yta, sattYta] = useState(() => localStorage.getItem('hak-yta') || null);

  // Ett anrop ger både vem jag är och vad plattformen består av här.
  const hamtaPlattform = useCallback(
    () =>
      api
        .hamta('/api/plattform')
        .then((d) => {
          sattPlattform(d);
          sattMedlem(d.medlem);
        })
        .catch(() => sattMedlem(null)),
    []
  );
  useEffect(() => {
    hamtaPlattform();
  }, [hamtaPlattform]);

  // Föreningens färger läggs på roten, så att en annan klubb får sina egna.
  useEffect(() => {
    const profil = plattform?.forening?.profil;
    if (!profil) return;
    for (const [nyckel, varde] of Object.entries(profil))
      document.documentElement.style.setProperty(`--${nyckel.replace(/_/g, '-')}`, varde);
    document.title = `${plattform.forening.kortnamn || plattform.forening.namn} Backe`;
  }, [plattform]);

  useEffect(() => {
    document.documentElement.dataset.tema = tema === 'morkt' ? 'morkt' : 'ljust';
    localStorage.setItem('hak-tema', tema);
  }, [tema]);

  useEffect(() => {
    const vid = () => sattStig(window.location.pathname);
    window.addEventListener('popstate', vid);
    return () => window.removeEventListener('popstate', vid);
  }, []);

  const ga = useCallback((till) => {
    if (till !== window.location.pathname + window.location.search) window.history.pushState({}, '', till);
    sattStig(window.location.pathname);
  }, []);

  if (medlem === undefined) return <Vanta />;
  if (!medlem) return <Inlogg forening={plattform?.forening} klar={() => hamtaPlattform()} />;

  // Bara sidor som hör till en påslagen modul finns att gå till.
  const tillgangliga = new Set((plattform?.moduler || []).flatMap((m) => m.sidor.map((s) => s.nyckel)));
  tillgangliga.add('start');

  // Arbetsytan styr både startsidan och menyn.
  // Arbetsytornas sidlistor beskärs av vad föreningen faktiskt har påslaget.
  const ytor = (medlem.arbetsytor?.length ? medlem.arbetsytor : [{ nyckel: 'medlem', namn: 'Medlem', sidor: [] }])
    .map((y) => ({ ...y, sidor: (y.sidor || []).filter((s) => tillgangliga.has(s)) }))
    .filter((y, i, lista) => y.sidor.length || y.nyckel === 'medlem' || i === 0);
  const aktivYta = ytor.find((y) => y.nyckel === yta) || ytor[0];
  const bytYta = (nyckel) => {
    sattYta(nyckel);
    localStorage.setItem('hak-yta', nyckel);
    ga('/');
  };

  const synliga = SIDOR.filter(
    (s) =>
      tillgangliga.has(s.nyckel) &&
      (!s.roll || minstRoll(medlem, s.roll)) &&
      (!s.behorighet || (medlem.behorigheter || []).includes(s.behorighet)) &&
      (s.nyckel === 'start' || (aktivYta.sidor || []).includes(s.nyckel))
  );
  const aktiv = synliga.find((s) => s.stig === stig) || synliga[0];
  const Sida = aktiv.komp;

  const loggaUt = async () => {
    await api.skapa('/api/logga-ut');
    sattMedlem(null);
  };

  return (
    <Jag.Provider value={medlem}>
      <Plattform.Provider
        value={{
          forening: plattform?.forening || null,
          moduler: plattform?.moduler || [],
          harModul: (nyckel) => (plattform?.moduler || []).some((m) => m.nyckel === nyckel),
        }}
      >
      <Ruta.Provider value={{ stig, ga }}>
        <Notiser>
          <div className="skal">
            <header className="topp">
              <div className="marke">
                <Marke storlek={32} />
                {plattform?.forening?.kortnamn || 'HAK'}&nbsp;Backe
              </div>
              <nav className="meny">
                {synliga.map((s) => (
                  <a
                    key={s.stig}
                    href={s.stig}
                    aria-current={s === aktiv ? 'page' : undefined}
                    onClick={(e) => { e.preventDefault(); ga(s.stig); }}
                  >
                    {s.text}
                  </a>
                ))}
              </nav>
              <div className="toppslut">
                {ytor.length > 1 && (
                  <select
                    className="ytval"
                    value={aktivYta.nyckel}
                    onChange={(e) => bytYta(e.target.value)}
                    title="Byt arbetsyta"
                  >
                    {ytor.map((y) => (
                      <option key={y.nyckel} value={y.nyckel}>{y.namn}</option>
                    ))}
                  </select>
                )}
                <button className="tom liten" onClick={() => sattTema(tema === 'morkt' ? 'ljust' : 'morkt')} title="Byt tema">
                  {tema === 'morkt' ? '☀' : '☾'}
                </button>
                <span className="liten svag radbryt" title={ROLLNAMN[medlem.roll]}>
                  {medlem.namn}
                </span>
                <button className="liten" onClick={loggaUt}>Logga ut</button>
              </div>
            </header>
            <main className="innehall">
              <div className="sida">
                <Sida yta={aktivYta.nyckel} />
              </div>
            </main>
          </div>
        </Notiser>
      </Ruta.Provider>
      </Plattform.Provider>
    </Jag.Provider>
  );
}
