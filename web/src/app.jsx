// Skalet: inloggning, navigering och sidval.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { PRODUKT } from '../delad/produkt.js';
import { Marke, Notiser, Vanta } from './delar/bitar.jsx';
import { byggTrad, Menytrad, Palett, usePalettgenvag, useOppnaGrenar, useSmalSkarm } from './delar/navigering.jsx';
import { Talruta, useTalgenvag } from './delar/tala.jsx';
import { minstRoll, ROLLNAMN } from './nytta.js';
import { Inlogg } from './sidor/inlogg.jsx';
import { Start } from './sidor/start.jsx';
import { Oversikt } from './sidor/oversikt.jsx';
import { Snolaggning } from './sidor/snolaggning.jsx';
import { Enheter } from './sidor/enheter.jsx';
import { Checklistor } from './sidor/checklistor.jsx';
import { Arenden } from './sidor/arenden.jsx';
import { Bemanning } from './sidor/bemanning.jsx';
import { Mina } from './sidor/mina.jsx';
import { Rapporter } from './sidor/rapporter.jsx';
import { Register } from './sidor/register.jsx';
import { Kassa } from './sidor/kassa.jsx';
import { Luckan } from './sidor/luckan.jsx';
import { Ekonomi } from './sidor/ekonomi.jsx';
import { Forening } from './sidor/forening.jsx';
import { Traning } from './sidor/traning.jsx';
import { Hjalp } from './sidor/hjalp.jsx';
import { Ideer } from './sidor/ideer.jsx';
import { Journal } from './sidor/journal.jsx';
import { Incidenter } from './sidor/incidenter.jsx';
import { Underhall } from './sidor/underhall.jsx';
import { Snoplan } from './sidor/snoplan.jsx';
import { Projekt } from './sidor/projekt.jsx';
import { Utlagg } from './sidor/utlagg.jsx';
import { Planbok } from './sidor/planbok.jsx';
import { Evenemang } from './sidor/evenemang.jsx';
import { Samakning } from './sidor/samakning.jsx';

// Menyn visar bara det inloggningen faktiskt får använda, och bara det som
// hör till arbetsytan man står i. Vilken gren sidan hänger i kommer från
// servern, för modulen äger sina sidor – se server/moduldata.mjs.
const SIDOR = [
  { stig: '/', text: 'Start', komp: Start, nyckel: 'start' },
  { stig: '/oversikt', text: 'Hela läget', komp: Oversikt, nyckel: 'oversikt' },
  { nyckel: 'snolaggning', stig: '/snolaggning', text: 'Snöläggning', komp: Snolaggning },
  { nyckel: 'enheter', stig: '/enheter', text: 'Enheter', komp: Enheter },
  { nyckel: 'checklistor', stig: '/checklistor', text: 'Checklistor', komp: Checklistor },
  { nyckel: 'arenden', stig: '/arenden', text: 'Ärenden', komp: Arenden },
  { nyckel: 'journal', stig: '/journal', text: 'Driftjournal', komp: Journal },
  { nyckel: 'incidenter', stig: '/incidenter', text: 'Incidenter', komp: Incidenter, behorighet: 'incident' },
  { nyckel: 'bemanning', stig: '/bemanning', text: 'Bemanning', komp: Bemanning },
  { nyckel: 'snoplan', stig: '/snoplan', text: 'Snöplanering', komp: Snoplan, behorighet: 'bemanning' },
  { nyckel: 'underhall', stig: '/underhall', text: 'Underhåll', komp: Underhall, behorighet: 'anlaggning' },
  { nyckel: 'luckan', stig: '/luckan', text: 'Luckan', komp: Luckan, behorighet: 'kassa' },
  { nyckel: 'kassa', stig: '/kassa', text: 'Kassa', komp: Kassa, behorighet: 'kassa' },
  { nyckel: 'traning', stig: '/traning', text: 'Träning', komp: Traning, behorighet: 'traning' },
  { nyckel: 'evenemang', stig: '/evenemang', text: 'Läger och tävling', komp: Evenemang },
  { nyckel: 'samakning', stig: '/samakning', text: 'Samåkning', komp: Samakning },
  { nyckel: 'forening', stig: '/forening', text: 'Föreningen', komp: Forening },
  { nyckel: 'ekonomi', stig: '/ekonomi', text: 'Ekonomi', komp: Ekonomi, behorighet: 'ekonomi_las' },
  // Utlägg och plånbok står utan behörighet: varje medlem har en egen
  // plånbok och kan ha lagt ut pengar. Sidorna visar själva mer för den
  // som får se mer.
  { nyckel: 'utlagg', stig: '/utlagg', text: 'Utlägg', komp: Utlagg },
  { nyckel: 'planbok', stig: '/planbok', text: 'Plånbok', komp: Planbok },
  { nyckel: 'ideer', stig: '/ideer', text: 'Idélådan', komp: Ideer },
  { nyckel: 'mina', stig: '/mina', text: 'Mina sidor', komp: Mina },
  { nyckel: 'hjalp', stig: '/hjalp', text: 'Hjälp', komp: Hjalp },
  { nyckel: 'projekt', stig: '/projekt', text: 'Projektet', komp: Projekt },
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
  // Menyn går att fälla ihop på en stor skärm, och ligger som en lucka på en
  // liten. Samma träd i båda fallen.
  const [menyPa, sattMenyPa] = useState(() => localStorage.getItem('hak-meny') !== 'av');
  const [luckaOppen, sattLuckaOppen] = useState(false);
  const [palettOppen, sattPalettOppen] = useState(false);
  const [talOppet, sattTalOppet] = useState(false);
  // Nyckeln är bara ett utrymme i localStorage, så den rådata-ytan duger –
  // och hooken måste stå här uppe, före de tidiga returerna.
  const [grenarOppna, vaxlaGren] = useOppnaGrenar(yta || 'standard');
  const smal = useSmalSkarm();
  const [notiser, sattNotiser] = useState({});

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
    document.title = PRODUKT;
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
    sattLuckaOppen(false);
  }, []);

  // Siffrorna i menyn. Hämtas om med jämna mellanrum och vid sidbyte, så
  // att en rond man just gjort försvinner ur räkningen utan omladdning.
  useEffect(() => {
    if (!medlem) return undefined;
    let lever = true;
    const hamta = () =>
      api.hamta('/api/notiser').then((d) => lever && sattNotiser(d)).catch(() => {});
    hamta();
    const timer = setInterval(hamta, 60000);
    return () => {
      lever = false;
      clearInterval(timer);
    };
  }, [medlem, stig]);

  usePalettgenvag(useCallback(() => sattPalettOppen(true), []));
  useTalgenvag(useCallback(() => sattTalOppet(true), []));

  if (medlem === undefined) return <Vanta />;

  // Projektsidan läses utan inloggning. Den finns för medlemmar som inte
  // är insatta, och ett inloggningsformulär är ett hinder för precis den
  // personen. Att *lämna* något kräver konto – sidan säger till själv.
  if (!medlem && stig.startsWith('/projekt'))
    return (
      <Ruta.Provider value={{ stig, ga }}>
        <Notiser>
          <div className="oppensida">
            <header className="oppentopp">
              <Marke storlek={30} />
              <span className="namn">{PRODUKT}</span>
              <span className="vaxa" />
              <button className="tom liten" onClick={() => ga('/')}>Logga in</button>
            </header>
            <main className="innehall">
              <div className="sida">
                <Projekt />
              </div>
            </main>
          </div>
        </Notiser>
      </Ruta.Provider>
    );

  if (!medlem)
    return (
      <Inlogg
        forening={plattform?.forening}
        provinlogg={plattform?.provinlogg}
        klar={(m) => {
          // Ett konto kan ha en egen landningssida. Bara direkt efter
          // inloggningen – annars gick det aldrig att gå någon annanstans.
          if (m?.startsida && window.location.pathname === '/') ga(m.startsida);
          hamtaPlattform();
        }}
      />
    );

  // Bara sidor som hör till en påslagen modul finns att gå till.
  const sidorFranModuler = (plattform?.moduler || []).flatMap((m) => m.sidor);
  const tillgangliga = new Set(sidorFranModuler.map((s) => s.nyckel));
  tillgangliga.add('start');
  // Vilken gren varje sida hänger i, enligt modulen som äger den.
  const gruppAvSida = Object.fromEntries(sidorFranModuler.map((s) => [s.nyckel, s.grupp]).filter(([, g]) => g));

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

  // Två listor, och skillnaden mellan dem är hela poängen med arbetsytor.
  // `tillatna` är allt inloggningen får använda; `synliga` är det lilla
  // urval som hör till ytan man står i och därför hamnar i menyn.
  const tillatna = SIDOR.filter(
    (s) =>
      tillgangliga.has(s.nyckel) &&
      (!s.roll || minstRoll(medlem, s.roll)) &&
      (!s.behorighet || (medlem.behorigheter || []).includes(s.behorighet))
  );
  const synliga = tillatna.filter(
    (s) => s.nyckel === 'start' || s.nyckel === 'hjalp' || (aktivYta.sidor || []).includes(s.nyckel)
  );
  // En adress man skrivit in eller följt en länk till ska visa det den
  // pekar på, även när sidan inte hör till arbetsytan. Menyn förblir kort;
  // att tysta bort en sida man har rätt till vore något annat.
  const aktiv = tillatna.find((s) => s.stig === stig) || synliga[0];
  const Sida = aktiv.komp;

  const trad = byggTrad(synliga, plattform?.menygrupper || [], gruppAvSida);
  // Talvägen hör till driftjournalen. Är modulen av finns ingen journal att
  // tala in i, och då ska knappen inte stå där och lova något.
  const harDrift = (plattform?.moduler || []).some((m) => m.nyckel === 'drift');

  const loggaUt = async () => {
    await api.skapa('/api/logga-ut');
    sattMedlem(null);
  };

  const vaxlaMeny = () => {
    const nytt = !menyPa;
    sattMenyPa(nytt);
    localStorage.setItem('hak-meny', nytt ? 'pa' : 'av');
  };

  // Det rutan kan ta en till: sidorna, de andra arbetsytorna, och de få
  // åtgärder som hör till skalet självt.
  const palettposter = [
    ...synliga.map((s) => ({
      nyckel: `sida:${s.nyckel}`,
      text: s.text,
      sammanhang: (plattform?.menygrupper || []).find((g) => g.nyckel === gruppAvSida[s.nyckel])?.namn || null,
      stig: s.stig,
    })),
    ...ytor
      .filter((y) => y.nyckel !== aktivYta.nyckel)
      .map((y) => ({
        nyckel: `yta:${y.nyckel}`,
        text: `Byt till ${y.namn}`,
        sammanhang: 'Arbetsyta',
        gor: () => bytYta(y.nyckel),
      })),
    ...(harDrift
      ? [{ nyckel: 'tala', text: 'Tala in en rapport', sammanhang: 'Åtgärd', gor: () => sattTalOppet(true) }]
      : []),
    {
      nyckel: 'tema',
      text: tema === 'morkt' ? 'Byt till ljust läge' : 'Byt till mörkt läge',
      sammanhang: 'Åtgärd',
      gor: () => sattTema(tema === 'morkt' ? 'ljust' : 'morkt'),
    },
    { nyckel: 'utlogg', text: 'Logga ut', sammanhang: 'Åtgärd', gor: loggaUt },
  ];

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
          <div className={`skal${menyPa ? '' : ' utan-meny'}`}>
            <header className="topp">
              <button
                className="tom lucka-knapp"
                onClick={() => (smal ? sattLuckaOppen(true) : vaxlaMeny())}
                aria-label="Visa eller göm menyn"
                title="Meny"
              >
                <span className="hamburgare" aria-hidden="true" />
              </button>
              <div className="marke">
                <Marke storlek={32} />
                {PRODUKT}
              </div>

              <button
                className="hoppa"
                onClick={() => sattPalettOppen(true)}
                aria-label="Hoppa till sida eller åtgärd"
                title="Hoppa till (Ctrl+K)"
              >
                <span>Hoppa till …</span>
                <span className="tasta">Ctrl K</span>
              </button>

              <div className="toppslut">
                {/* Talknappen står i listen och inte på en sida: en rapport
                    ska kunna börja var man än står. */}
                {harDrift && (
                  <button
                    className="tom liten talknapp"
                    onClick={() => sattTalOppet(true)}
                    title="Tala in en rapport (Ctrl+.)"
                    aria-label="Tala in en rapport"
                  >
                    <span className="mikrofon" aria-hidden="true" />
                  </button>
                )}
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
                <span className="liten svag radbryt doljs-smalt" title={ROLLNAMN[medlem.roll]}>
                  {medlem.namn}
                </span>
                <button className="liten" onClick={loggaUt}>Logga ut</button>
              </div>
            </header>

            <div className="skalkropp">
              <aside className="sidomeny">
                <Menytrad
                  trad={trad}
                  aktiv={aktiv}
                  ga={ga}
                  oppna={grenarOppna}
                  vaxla={vaxlaGren}
                  notiser={notiser}
                />
              </aside>
              <main className="innehall">
                <div className="sida">
                  <Sida yta={aktivYta.nyckel} />
                </div>
              </main>
            </div>

            {luckaOppen && (
              <div className="lucka-bak" onMouseDown={(e) => e.target === e.currentTarget && sattLuckaOppen(false)}>
                <div className="lucka" role="dialog" aria-label="Meny">
                  <div className="lucka-topp">
                    <span className="marke">
                      <Marke storlek={26} />
                      {PRODUKT}
                    </span>
                    <button className="tom" onClick={() => sattLuckaOppen(false)} aria-label="Stäng">✕</button>
                  </div>
                  <Menytrad
                    trad={trad}
                    aktiv={aktiv}
                    ga={ga}
                    vidVal={() => sattLuckaOppen(false)}
                    oppna={grenarOppna}
                    vaxla={vaxlaGren}
                    notiser={notiser}
                  />
                  <div className="lucka-fot liten svag">
                    {medlem.namn} · {ROLLNAMN[medlem.roll]}
                  </div>
                </div>
              </div>
            )}
          </div>

          {palettOppen && (
            <Palett poster={palettposter} stang={() => sattPalettOppen(false)} ga={ga} />
          )}
          {talOppet && harDrift && <Talruta stang={() => sattTalOppet(false)} />}
        </Notiser>
      </Ruta.Provider>
      </Plattform.Provider>
    </Jag.Provider>
  );
}
