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
  const [yta, sattYta] = useState(() => localStorage.getItem('hak-yta') || null);

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

  // Arbetsytan styr både startsidan och menyn.
  const ytor = medlem.arbetsytor?.length ? medlem.arbetsytor : [{ nyckel: 'medlem', namn: 'Medlem', sidor: [] }];
  const aktivYta = ytor.find((y) => y.nyckel === yta) || ytor[0];
  const bytYta = (nyckel) => {
    sattYta(nyckel);
    localStorage.setItem('hak-yta', nyckel);
    ga('/');
  };

  const synliga = SIDOR.filter(
    (s) =>
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
      <Ruta.Provider value={{ stig, ga }}>
        <Notiser>
          <div className="skal">
            <header className="topp">
              <div className="marke">
                <Marke storlek={32} />
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
    </Jag.Provider>
  );
}
