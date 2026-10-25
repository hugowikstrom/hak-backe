// Plattformens moduler.
//
// Varje del av systemet är en modul som kan slås på eller av per förening.
// En klubb utan snöläggning ska inte se lansar, och en klubb utan kiosk ska
// inte se kassan. Modulen äger sina rutter och sina sidor i klienten, och
// säger vilka andra moduler den behöver.
//
// Kärnmoduler går inte att stänga av: utan konto, medlemmar och föreningen
// finns ingen plattform.
import { rutter as konto } from './api/konto.mjs';
import { rutter as register } from './api/register.mjs';
import { rutter as forening } from './api/forening.mjs';
import { rutter as bilder } from './api/bilder.mjs';
import { rutter as oversikt } from './api/oversikt.mjs';
import { rutter as sno } from './api/sno.mjs';
import { rutter as vader } from './api/vader.mjs';
import { rutter as checklistor } from './api/checklistor.mjs';
import { rutter as arenden } from './api/arenden.mjs';
import { rutter as bemanning } from './api/bemanning.mjs';
import { rutter as rapport } from './api/rapport.mjs';
import { rutter as fik } from './api/fik.mjs';
import { rutter as uthyrning } from './api/uthyrning.mjs';
import { rutter as bokforing } from './api/bokforing.mjs';
import { rutter as planbok } from './api/planbok.mjs';
import { rutter as traning } from './api/traning.mjs';
import { rutter as ide } from './api/ide.mjs';
import { rutter as drift } from './api/drift.mjs';
import { rutter as incident } from './api/incident.mjs';

export const MODULER = [
  {
    nyckel: 'konto',
    namn: 'Konto och inloggning',
    karna: true,
    rutter: [...konto, ...bilder],
    sidor: [{ nyckel: 'mina', text: 'Mina sidor', stig: '/mina' }],
  },
  {
    nyckel: 'forening',
    namn: 'Föreningen',
    beskrivning: 'Matrikel, sektioner, träningsgrupper och förtroendeuppdrag',
    karna: true,
    rutter: forening,
    sidor: [{ nyckel: 'forening', text: 'Föreningen', stig: '/forening' }],
  },
  {
    nyckel: 'anlaggning',
    namn: 'Anläggning',
    beskrivning: 'Områden, utrustning, positioner och säsonger',
    karna: true,
    rutter: register,
    sidor: [{ nyckel: 'register', text: 'Register', stig: '/register', roll: 'backansvarig' }],
  },
  {
    nyckel: 'oversikt',
    namn: 'Översikt',
    karna: true,
    rutter: oversikt,
    sidor: [{ nyckel: 'oversikt', text: 'Hela läget', stig: '/oversikt' }],
  },
  {
    nyckel: 'arenden',
    namn: 'Ärenden',
    beskrivning: 'Fel, brister, risker och förbättringar',
    rutter: arenden,
    sidor: [{ nyckel: 'arenden', text: 'Ärenden', stig: '/arenden' }],
  },
  {
    // Driftjournalen håller ihop ronder, mätningar, fel och incidenter till
    // en läsbar historik, och är vägen in för talade rapporter.
    nyckel: 'drift',
    namn: 'Driftjournal',
    beskrivning: 'Journal, talrapportering, utrustningshistorik och återkommande fel',
    beroenden: ['anlaggning', 'arenden'],
    rutter: drift,
    sidor: [{ nyckel: 'journal', text: 'Driftjournal', stig: '/journal' }],
  },
  {
    // Olyckor och tillbud ligger i egen modul: en klubb kan behöva journalen
    // utan att hantera personuppgifter om skadade gäster.
    nyckel: 'incidenter',
    namn: 'Incidenter',
    beskrivning: 'Olyckor, tillbud och arbetsskador med begränsad åtkomst',
    beroenden: ['drift'],
    rutter: incident,
    sidor: [{ nyckel: 'incidenter', text: 'Incidenter', stig: '/incidenter', behorighet: 'incident' }],
  },
  {
    nyckel: 'checklistor',
    namn: 'Checklistor och ronder',
    beroenden: ['anlaggning', 'arenden'],
    rutter: checklistor,
    sidor: [{ nyckel: 'checklistor', text: 'Checklistor', stig: '/checklistor' }],
  },
  {
    nyckel: 'snolaggning',
    namn: 'Snöläggning',
    beskrivning: 'Mätningar, wetbulb och väderprognos',
    beroenden: ['anlaggning'],
    rutter: [...sno, ...vader],
    sidor: [{ nyckel: 'snolaggning', text: 'Snöläggning', stig: '/snolaggning' }],
  },
  {
    nyckel: 'bemanning',
    namn: 'Bemanning',
    beskrivning: 'Pass, bokningar, kvoter och automatplanering',
    beroenden: ['anlaggning'],
    rutter: bemanning,
    sidor: [{ nyckel: 'bemanning', text: 'Bemanning', stig: '/bemanning' }],
  },
  {
    nyckel: 'ekonomi',
    namn: 'Ekonomi',
    beskrivning: 'Bokföring, verifikationer, SIE-export och plånbok',
    rutter: [...bokforing, ...planbok],
    sidor: [{ nyckel: 'ekonomi', text: 'Ekonomi', stig: '/ekonomi', behorighet: 'ekonomi_las' }],
  },
  {
    nyckel: 'kiosk',
    namn: 'Kiosk',
    beskrivning: 'Beställning med QR, kassa och sortiment',
    beroenden: ['ekonomi'],
    rutter: fik,
    sidor: [{ nyckel: 'kassa', text: 'Kassa', stig: '/kassa', behorighet: 'kassa' }],
    gastklient: '/fik/',
  },
  {
    nyckel: 'uthyrning',
    namn: 'Uthyrning',
    beskrivning: 'Prislista, utlämning och återlämning',
    beroenden: ['ekonomi', 'kiosk'],
    rutter: uthyrning,
    sidor: [],
    gastklient: '/fik/uthyrning',
  },
  {
    nyckel: 'traning',
    namn: 'Träning',
    beskrivning: 'Träningstillfällen, närvaro och aktivitetsstöd',
    beroenden: ['forening'],
    rutter: traning,
    sidor: [{ nyckel: 'traning', text: 'Träning', stig: '/traning', behorighet: 'traning' }],
  },
  {
    nyckel: 'ideer',
    namn: 'Idélåda',
    beskrivning: 'Skrivna och inspelade idéer, vidare till Backlog',
    rutter: ide,
    sidor: [{ nyckel: 'ideer', text: 'Idélådan', stig: '/ideer' }],
  },
  {
    nyckel: 'rapporter',
    namn: 'Rapporter',
    beroenden: ['arenden', 'bemanning'],
    rutter: rapport,
    sidor: [{ nyckel: 'rapporter', text: 'Rapporter', stig: '/rapporter' }],
  },
];

export const modul = (nyckel) => MODULER.find((m) => m.nyckel === nyckel) || null;
export const karnmoduler = MODULER.filter((m) => m.karna).map((m) => m.nyckel);

/**
 * Vilka moduler som gäller för en förening. "*" betyder alla. Beroenden
 * dras in automatiskt – en modul som saknar sin grund är värre än en som
 * är påslagen i onödan.
 */
export function aktivaModuler(forening) {
  const onskade = forening?.moduler?.includes('*')
    ? MODULER.map((m) => m.nyckel)
    : [...new Set([...karnmoduler, ...(forening?.moduler || [])])];
  const med = new Set();
  const lagg = (nyckel, spar = []) => {
    const m = modul(nyckel);
    if (!m || med.has(nyckel) || spar.includes(nyckel)) return;
    for (const b of m.beroenden || []) lagg(b, [...spar, nyckel]);
    med.add(nyckel);
  };
  for (const n of onskade) lagg(n);
  return MODULER.filter((m) => med.has(m.nyckel)).map((m) => m.nyckel);
}

export const modulPa = (forening, nyckel) => !nyckel || aktivaModuler(forening).includes(nyckel);

/** Hela ruttabellen, där varje rutt vet vilken modul den tillhör. */
export const allaRutter = () =>
  MODULER.flatMap((m) => m.rutter.map((r) => ({ ...r, modul: m.nyckel })));

/** Modulerna som klienten behöver känna till. */
export const publikaModuler = (forening) => {
  const aktiva = aktivaModuler(forening);
  return MODULER.filter((m) => aktiva.includes(m.nyckel)).map((m) => ({
    nyckel: m.nyckel,
    namn: m.namn,
    beskrivning: m.beskrivning || null,
    karna: !!m.karna,
    sidor: m.sidor || [],
    gastklient: m.gastklient || null,
  }));
};
