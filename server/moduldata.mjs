// Modulernas metadata: vad som finns, vad som beror på vad, och vilka sidor
// varje modul bidrar med.
//
// Avsiktligt skild från moduler.mjs, som kopplar på rutterna. En modul som
// behöver veta om en annan är påslagen – checklistorna frågar efter
// driftjournalen – ska kunna göra det utan att importera hela ruttabellen,
// och därmed sig själv.

export const MODULDATA = [
  {
    nyckel: 'konto',
    namn: 'Konto och inloggning',
    karna: true,
    sidor: [{ nyckel: 'mina', grupp: 'mitt', text: 'Mina sidor', stig: '/mina' }],
  },
  {
    nyckel: 'forening',
    namn: 'Föreningen',
    beskrivning: 'Matrikel, sektioner, träningsgrupper och förtroendeuppdrag',
    karna: true,
    sidor: [{ nyckel: 'forening', grupp: 'foreningen', text: 'Föreningen', stig: '/forening' }],
  },
  {
    nyckel: 'anlaggning',
    namn: 'Anläggning',
    beskrivning: 'Områden, utrustning, positioner och säsonger',
    karna: true,
    sidor: [{ nyckel: 'register', grupp: 'backen', text: 'Register', stig: '/register', roll: 'backansvarig' }],
  },
  {
    nyckel: 'oversikt',
    namn: 'Översikt',
    karna: true,
    sidor: [{ nyckel: 'oversikt', grupp: 'uppfoljning', text: 'Hela läget', stig: '/oversikt' }],
  },
  {
    nyckel: 'arenden',
    namn: 'Ärenden',
    beskrivning: 'Fel, brister, risker och förbättringar',
    sidor: [{ nyckel: 'arenden', grupp: 'backen', text: 'Ärenden', stig: '/arenden' }],
  },
  {
    // Driftjournalen håller ihop ronder, mätningar, fel och incidenter till
    // en läsbar historik, och är vägen in för talade rapporter.
    nyckel: 'drift',
    namn: 'Driftjournal',
    beskrivning: 'Journal, talrapportering, utrustningshistorik och återkommande fel',
    beroenden: ['anlaggning', 'arenden'],
    sidor: [{ nyckel: 'journal', grupp: 'backen', text: 'Driftjournal', stig: '/journal' }],
  },
  {
    // Förebyggande underhåll: årshjul, serviceplaner ur manualerna och
    // reservdelar. Hänger på driften, för en utförd service journalförs.
    nyckel: 'underhall',
    namn: 'Underhåll',
    beskrivning: 'Serviceplaner, årshjul, manualer, reservdelar och kostnader',
    beroenden: ['anlaggning', 'drift'],
    sidor: [{ nyckel: 'underhall', grupp: 'backen', text: 'Underhåll', stig: '/underhall', behorighet: 'anlaggning' }],
  },
  {
    // Olyckor och tillbud ligger i egen modul: en klubb kan behöva journalen
    // utan att hantera personuppgifter om skadade gäster.
    nyckel: 'incidenter',
    namn: 'Incidenter',
    beskrivning: 'Olyckor, tillbud och arbetsskador med begränsad åtkomst',
    beroenden: ['drift'],
    sidor: [{ nyckel: 'incidenter', grupp: 'backen', text: 'Incidenter', stig: '/incidenter', behorighet: 'incident' }],
  },
  {
    nyckel: 'checklistor',
    namn: 'Checklistor och ronder',
    beroenden: ['anlaggning', 'arenden'],
    sidor: [{ nyckel: 'checklistor', grupp: 'backen', text: 'Checklistor', stig: '/checklistor' }],
  },
  {
    nyckel: 'snolaggning',
    namn: 'Snöläggning',
    beskrivning: 'Mätningar, wetbulb och väderprognos',
    beroenden: ['anlaggning'],
    sidor: [{ nyckel: 'snolaggning', grupp: 'backen', text: 'Snöläggning', stig: '/snolaggning' }],
  },
  {
    // Medlemmens egen vy: en sak i taget. Hör till bemanningen, för det är
    // pass och ronder den handlar om.
    nyckel: 'mitt',
    namn: 'Min sida',
    beskrivning: 'Nästa pass, ronderna som hör dit, och pass att boka',
    beroenden: ['bemanning', 'checklistor'],
    sidor: [],
  },
  {
    nyckel: 'bemanning',
    namn: 'Bemanning',
    beskrivning: 'Pass, bokningar, kvoter och automatplanering',
    beroenden: ['anlaggning'],
    sidor: [{ nyckel: 'bemanning', grupp: 'foreningen', text: 'Bemanning', stig: '/bemanning' }],
  },
  {
    // Prognosfönster blir bemanningsbehov. Egen modul, för en klubb kan ha
    // bemanning utan att tillverka snö.
    nyckel: 'snoplan',
    namn: 'Snöplanering',
    beskrivning: 'Produktionsfönster, säsongstillgänglighet och förfrågningar',
    beroenden: ['bemanning', 'snolaggning'],
    sidor: [{ nyckel: 'snoplan', grupp: 'backen', text: 'Snöplanering', stig: '/snoplan', behorighet: 'bemanning' }],
  },
  {
    nyckel: 'ekonomi',
    namn: 'Ekonomi',
    beskrivning: 'Bokföring, verifikationer, SIE-export och plånbok',
    sidor: [{ nyckel: 'ekonomi', grupp: 'pengar', text: 'Ekonomi', stig: '/ekonomi', behorighet: 'ekonomi_las' }],
  },
  {
    nyckel: 'kiosk',
    namn: 'Kiosk',
    beskrivning: 'Beställning med QR, kassa och sortiment',
    beroenden: ['ekonomi'],
    sidor: [{ nyckel: 'kassa', grupp: 'pengar', text: 'Kassa', stig: '/kassa', behorighet: 'kassa' }],
    gastklient: '/fik/',
  },
  {
    nyckel: 'uthyrning',
    namn: 'Uthyrning',
    beskrivning: 'Prislista, utlämning och återlämning',
    beroenden: ['ekonomi', 'kiosk'],
    sidor: [],
    gastklient: '/fik/uthyrning',
  },
  {
    nyckel: 'traning',
    namn: 'Träning',
    beskrivning: 'Träningstillfällen, närvaro och aktivitetsstöd',
    beroenden: ['forening'],
    sidor: [{ nyckel: 'traning', grupp: 'foreningen', text: 'Träning', stig: '/traning', behorighet: 'traning' }],
  },
  {
    nyckel: 'ideer',
    namn: 'Idélåda',
    beskrivning: 'Skrivna och inspelade idéer, vidare till Backlog',
    sidor: [{ nyckel: 'ideer', grupp: 'mitt', text: 'Idélådan', stig: '/ideer' }],
  },
  {
    nyckel: 'rapporter',
    namn: 'Rapporter',
    beroenden: ['arenden', 'bemanning'],
    sidor: [{ nyckel: 'rapporter', grupp: 'uppfoljning', text: 'Rapporter', stig: '/rapporter' }],
  },
];

/** Menyns grenar, i den ordning de ska stå. En sida utan grupp står löst
 *  högst upp – Start hör inte under någon rubrik.
 *
 *  Grenarna är få med flit. Fler än en handfull rubriker blir en lista att
 *  leta i, och då är det ingen vinst mot den platta raden de ersätter. */
export const MENYGRUPPER = [
  { nyckel: 'backen', namn: 'Backen' },
  { nyckel: 'foreningen', namn: 'Föreningen' },
  { nyckel: 'pengar', namn: 'Pengar' },
  { nyckel: 'uppfoljning', namn: 'Uppföljning' },
  { nyckel: 'mitt', namn: 'Mitt' },
];

const nyckelkarta = new Map(MODULDATA.map((m) => [m.nyckel, m]));
export const modul = (nyckel) => nyckelkarta.get(nyckel) || null;
export const karnmoduler = MODULDATA.filter((m) => m.karna).map((m) => m.nyckel);

/** Modulerna en förening faktiskt kör, med beroenden inräknade. */
export function aktivaModuler(forening) {
  const onskade = forening?.moduler?.includes('*')
    ? MODULDATA.map((m) => m.nyckel)
    : [...new Set([...karnmoduler, ...(forening?.moduler || [])])];
  const med = new Set();
  const lagg = (nyckel, spar = []) => {
    const m = modul(nyckel);
    if (!m || med.has(nyckel) || spar.includes(nyckel)) return;
    for (const b of m.beroenden || []) lagg(b, [...spar, nyckel]);
    med.add(nyckel);
  };
  for (const n of onskade) lagg(n);
  return MODULDATA.filter((m) => med.has(m.nyckel)).map((m) => m.nyckel);
}

export const modulPa = (forening, nyckel) => !nyckel || aktivaModuler(forening).includes(nyckel);

/** Modulerna som klienten behöver känna till. */
export const publikaModuler = (forening) => {
  const aktiva = aktivaModuler(forening);
  return MODULDATA.filter((m) => aktiva.includes(m.nyckel)).map((m) => ({
    nyckel: m.nyckel,
    namn: m.namn,
    beskrivning: m.beskrivning || null,
    karna: !!m.karna,
    sidor: m.sidor || [],
    gastklient: m.gastklient || null,
  }));
};
