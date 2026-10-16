// Skalet: inloggning, navigering och sidval.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { Marke, Notiser, Vanta } from './delar/bitar.jsx';
import { minstRoll, ROLLNAMN } from './nytta.js';
import { Inlogg } from './sidor/inlogg.jsx';
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

// Menyn visar bara det inloggningen faktiskt får använda.
const SIDOR = [
  { stig: '/', text: 'Översikt', komp: Oversikt },
  { stig: '/snolaggning', text: 'Snöläggning', komp: Snolaggning },
  { stig: '/checklistor', text: 'Checklistor', komp: Checklistor },
  { stig: '/arenden', text: 'Ärenden', komp: Arenden },
  { stig: '/bemanning', text: 'Bemanning', komp: Bemanning },
  { stig: '/kassa', text: 'Kassa', komp: Kassa, behorighet: 'kassa' },
  { stig: '/traning', text: 'Träning', komp: Traning, behorighet: 'traning' },
  { stig: '/forening', text: 'Föreningen', komp: Forening },
  { stig: '/ekonomi', text: 'Ekonomi', komp: Ekonomi, behorighet: 'ekonomi_las' },
  { stig: '/ideer', text: 'Idélådan', komp: Ideer },
  { stig: '/mina', text: 'Mina sidor', komp: Mina },
  { stig: '/rapporter', text: 'Rapporter', komp: Rapporter },
  { stig: '/register', text: 'Register', komp: Register, roll: 'backansvarig' },
];

const Jag = createContext(null);
export const useJag = () => useContext(Jag);

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
  const [medlem, sattMedlem] = useState(undefined);
  const [stig, sattStig] = useState(window.location.pathname);
  const [tema, sattTema] = useState(() => localStorage.getItem('hak-tema') || 'ljust');

  useEffect(() => {
    api.hamta('/api/jag').then((d) => sattMedlem(d.medlem)).catch(() => sattMedlem(null));
  }, []);

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
  if (!medlem) return <Inlogg klar={(m) => sattMedlem(m)} />;

  const synliga = SIDOR.filter(
    (s) =>
      (!s.roll || minstRoll(medlem, s.roll)) &&
      (!s.behorighet || (medlem.behorigheter || []).includes(s.behorighet))
  );
  const aktiv = synliga.find((s) => s.stig === stig) || synliga[0];
  const Sida = aktiv.komp;

  const loggaUt = async () => {
    await api.skapa('/api/logga-ut');
    sattMedlem(null);
  };

  return (
    <Jag.Provider value={medlem}>
      <Ruta.Provider value={{ stig, ga }}>
        <Notiser>
          <div className="skal">
            <header className="topp">
              <div className="marke">
                <Marke storlek={26} />
                HAK&nbsp;Backe
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
                <Sida />
              </div>
            </main>
          </div>
        </Notiser>
      </Ruta.Provider>
    </Jag.Provider>
  );
}
