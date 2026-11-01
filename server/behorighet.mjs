// Vem får göra vad.
//
// Rollen är grundnivån i systemet. Uppdragen – ordförande, kassör, tränare,
// volontär – ger behörigheter vid sidan av den, för en kassör ska komma åt
// ekonomin utan att vara administratör för snöläggningen.
//
// Fyra källor, och de *läggs ihop*. Ingen av dem kan ta bort något en annan
// gett:
//
//   roll       – en nivå i systemet, en enda per medlem
//   uppdrag    – förtroendeposten: ordförande, kassör, revisor …
//   kompetens  – vad medlemmen är upplärd på: fik, uthyrning
//   grupp      – en namngiven samling tillträden som medlemmen är med i
//
// Grupperna finns för att de tre första inte räcker. En klubb vill kunna
// säga "snögänget" och mena de nio personer som får starta pumpstationen,
// utan att göra var och en av dem backansvarig. Varje medlem kan vara med i
// flera, och en grupp ger behörigheter, arbetsytor och – om klubben vill –
// ett rollgolv.
import { alla } from './db.mjs';

export const RANG = {
  medlem: 1,
  volontar: 1,
  tranare: 2,
  backansvarig: 3,
  anlaggningsansvarig: 4,
  admin: 5,
};

export const ROLLNAMN = {
  medlem: 'Medlem',
  volontar: 'Volontär',
  tranare: 'Tränare',
  backansvarig: 'Backansvarig',
  anlaggningsansvarig: 'Anläggningsansvarig',
  admin: 'Administratör',
};

export const UPPDRAG = {
  ordforande: 'Ordförande',
  vice_ordforande: 'Vice ordförande',
  kassor: 'Kassör',
  sekreterare: 'Sekreterare',
  ledamot: 'Styrelseledamot',
  suppleant: 'Suppleant',
  valberedning: 'Valberedning',
  revisor: 'Revisor',
  sektionsansvarig: 'Sektionsansvarig',
  tranare: 'Tränare',
  volontar: 'Volontär',
  backansvarig: 'Backansvarig',
  anlaggningsansvarig: 'Anläggningsansvarig',
};

/** Styrelsen i lagens mening – de som svarar för föreningen. */
export const STYRELSEN = ['ordforande', 'vice_ordforande', 'kassor', 'sekreterare', 'ledamot', 'suppleant'];

/**
 * Behörigheter, och vilka roller respektive uppdrag som ger dem.
 * En revisor ska kunna läsa bokföringen utan att kunna ändra i den.
 */
export const BEHORIGHETER = {
  ekonomi: { roller: ['admin'], uppdrag: ['kassor', 'ordforande'] },
  ekonomi_las: { roller: ['admin', 'anlaggningsansvarig'], uppdrag: ['kassor', 'ordforande', 'revisor', 'sekreterare'] },
  // Kassan sköts av den som faktiskt står där: fik- eller uthyrningspasset,
  // en volontär, eller någon ansvarig. Inte varje medlem.
  kassa: {
    roller: ['backansvarig', 'anlaggningsansvarig', 'admin'],
    uppdrag: ['kassor', 'ordforande', 'volontar'],
    kompetens: ['fik', 'uthyrning'],
  },
  bemanning: { roller: ['backansvarig', 'anlaggningsansvarig', 'admin'], uppdrag: ['ordforande', 'sektionsansvarig'] },
  anlaggning: { roller: ['backansvarig', 'anlaggningsansvarig', 'admin'], uppdrag: ['anlaggningsansvarig', 'backansvarig'] },
  medlemsregister: { roller: ['anlaggningsansvarig', 'admin'], uppdrag: ['ordforande', 'kassor', 'sekreterare'] },
  // Olyckor och tillbud. Den som arbetar i backen måste kunna rapportera och
  // läsa sina egna händelser; personuppgifterna i dem är en snävare krets.
  incident: {
    roller: ['backansvarig', 'anlaggningsansvarig', 'admin'],
    uppdrag: ['backansvarig', 'anlaggningsansvarig', 'ordforande', 'sekreterare'],
  },
  // Namn, kontaktuppgift och skada på en skadad gäst. Dataminimering i
  // praktiken: de flesta som arbetar med uppföljningen behöver dem inte.
  incident_person: {
    roller: ['anlaggningsansvarig', 'admin'],
    uppdrag: ['anlaggningsansvarig', 'ordforande'],
  },
  traning: { roller: ['tranare', 'anlaggningsansvarig', 'admin'], uppdrag: ['tranare', 'sektionsansvarig', 'ordforande'] },
  // Läger, tävlingar och aktiviteter. Vidare krets än `traning`: en resa
  // till Kläppen arrangeras ofta av en förälder utan tränaruppdrag, och
  // styrelsen lägger in årsmötet. Att anmäla sig kräver ingen behörighet.
  //
  // Kassören står med flit inte här. Att kvittera en avgift går genom
  // `kassa`, och behörigheten att arrangera bär också rätten att se
  // deltagarnas behov och samåkningarnas telefonnummer – en krets som ska
  // vara de som faktiskt behöver dem.
  evenemang: {
    roller: ['tranare', 'backansvarig', 'anlaggningsansvarig', 'admin'],
    uppdrag: ['tranare', 'sektionsansvarig', 'ordforande', 'sekreterare'],
  },
  // Projektsidans texter och tidplan. Snäv krets: sidan är klubbens
  // ansikte utåt mot sina egna medlemmar, och datum som står där läses
  // som löften även när de är förslag.
  projekt: { roller: ['admin'], uppdrag: ['ordforande', 'sekreterare'] },
  // Att styra vem som kommer åt vad är inte samma sak som att föra
  // medlemsregister. Kretsen är snäv med flit: den som kan dela ut
  // behörigheter kan dela ut alla de andra.
  behorighetsstyrning: { roller: ['admin'], uppdrag: ['ordforande'] },
  uthyrning: {
    roller: ['backansvarig', 'anlaggningsansvarig', 'admin'],
    uppdrag: ['kassor', 'ordforande', 'volontar'],
    kompetens: ['uthyrning', 'fik'],
  },
};

/** Behörigheterna med läsbara namn, för gränssnittet som delar ut dem. */
export const BEHORIGHETSNAMN = {
  ekonomi: 'Bokföra och ändra i ekonomin',
  ekonomi_las: 'Läsa ekonomin',
  kassa: 'Stå i kassan',
  bemanning: 'Planera bemanning',
  anlaggning: 'Sköta anläggningen och dess register',
  medlemsregister: 'Föra medlemsregistret',
  incident: 'Rapportera och följa upp incidenter',
  incident_person: 'Se personuppgifter i incidenter',
  traning: 'Hålla träning och föra närvaro',
  projekt: 'Redigera projektsidan',
  evenemang: 'Lägga upp läger, tävlingar och aktiviteter',
  uthyrning: 'Sköta uthyrningen',
  behorighetsstyrning: 'Styra grupper och tillträden',
};

export const uppdragFor = (medlem_id) =>
  alla(
    `SELECT u.*, s.namn AS sektion, g.namn AS grupp FROM uppdrag u
     LEFT JOIN sektion s ON s.id=u.sektion_id
     LEFT JOIN traningsgrupp g ON g.id=u.grupp_id
     WHERE u.medlem_id=? AND (u.till IS NULL OR u.till >= date('now'))
     ORDER BY u.slag`,
    medlem_id
  );

/**
 * Grupperna en medlem är med i just nu, med allt de ger.
 *
 * Tillhörigheter som gått ut lämnas utanför men ligger kvar i tabellen:
 * att någon hade kassabehörighet förra säsongen är en uppgift värd att
 * kunna svara på.
 */
export function grupperFor(medlem_id) {
  const grupper = alla(
    `SELECT g.id, g.nyckel, g.namn, g.roll_golv
       FROM grupptillhorighet t
       JOIN behorighetsgrupp g ON g.id = t.grupp_id
      WHERE t.medlem_id = ? AND g.aktiv = 1
        AND t.aterkallad IS NULL
        AND (t.fran IS NULL OR t.fran <= date('now'))
        AND (t.till IS NULL OR t.till >= date('now'))
      ORDER BY g.ordning, g.namn`,
    medlem_id
  );
  if (!grupper.length) return [];
  // Två frågor för hela listan i stället för två per grupp: den här koden
  // körs en gång per begäran.
  const hal = grupper.map(() => '?').join(',');
  const ids = grupper.map((g) => g.id);
  const beh = alla(`SELECT grupp_id, behorighet FROM gruppbehorighet WHERE grupp_id IN (${hal})`, ...ids);
  const ytor = alla(`SELECT grupp_id, yta FROM gruppyta WHERE grupp_id IN (${hal})`, ...ids);
  return grupper.map((g) => ({
    ...g,
    behorigheter: beh.filter((b) => b.grupp_id === g.id).map((b) => b.behorighet),
    ytor: ytor.filter((y) => y.grupp_id === g.id).map((y) => y.yta),
  }));
}

/** Grupperna, lästa ur medlemmen om de följt med – annars ur databasen. */
const grupperAv = (medlem) =>
  medlem?.grupper ?? (medlem?.id ? grupperFor(medlem.id) : []);

/**
 * Medlemmens nivå i systemet: den egna rollen, eller det högsta rollgolv
 * någon av grupperna ger. Ett golv höjer – det sänker aldrig någon som
 * redan står högre.
 */
export const rollNiva = (medlem) =>
  grupperAv(medlem).reduce((hogst, g) => Math.max(hogst, RANG[g.roll_golv] ?? 0), RANG[medlem?.roll] ?? 0);

export const minstRoll = (medlem, roll) => rollNiva(medlem) >= (RANG[roll] ?? 99);

const kompetensFor = (medlem) => {
  try {
    return typeof medlem.kompetens === 'string' ? JSON.parse(medlem.kompetens || '[]') : medlem.kompetens || [];
  } catch {
    return [];
  }
};

/** Har medlemmen behörigheten – via roll, uppdrag, kompetens eller grupp? */
export function far(medlem, behorighet) {
  if (!medlem) return false;
  const regel = BEHORIGHETER[behorighet];
  if (!regel) return false;
  if (medlem.roll === 'admin') return true;
  const grupper = grupperAv(medlem);
  // Gruppen kan ge behörigheten rakt ut …
  if (grupper.some((g) => g.behorigheter?.includes(behorighet))) return true;
  // … eller via det rollgolv den sätter, som vilken roll som helst.
  const roller = new Set([medlem.roll, ...grupper.map((g) => g.roll_golv).filter(Boolean)]);
  if (roller.has('admin')) return true;
  if (regel.roller.some((r) => roller.has(r))) return true;
  const mina = (medlem.uppdrag || uppdragFor(medlem.id)).map((u) => u.slag);
  if (regel.uppdrag?.some((u) => mina.includes(u))) return true;
  const kompetens = kompetensFor(medlem);
  return !!regel.kompetens?.some((k) => kompetens.includes(k));
}

/** Alla behörigheter en medlem har – skickas till klienten för att visa rätt meny. */
export const behorigheterFor = (medlem) =>
  Object.keys(BEHORIGHETER).filter((b) => far(medlem, b));

/**
 * Arbetsytor: en vy per uppgift i klubben, inte en gemensam för alla.
 * Den som står i kiosken ska se kiosken, inte snöläggningen. Varje yta har
 * en egen startsida och en egen meny.
 */
export const ARBETSYTOR = {
  anlaggning: {
    namn: 'Anläggningen',
    beskrivning: 'Snöläggning, utrustning och backens skick',
    sidor: ['snolaggning', 'snoplan', 'checklistor', 'journal', 'underhall', 'arenden', 'incidenter',
      'bemanning', 'rapporter', 'register', 'utlagg', 'ideer', 'mina'],
  },
  back: {
    namn: 'Backen',
    beskrivning: 'Dagens drift: bemanning, ronder och ärenden',
    sidor: ['bemanning', 'snoplan', 'checklistor', 'journal', 'arenden', 'incidenter', 'snolaggning',
      'underhall', 'utlagg', 'ideer', 'mina'],
  },
  kiosk: {
    namn: 'Kiosken',
    beskrivning: 'Beställningar, försäljning och sortiment',
    sidor: ['luckan', 'kassa', 'planbok', 'ideer', 'mina'],
  },
  uthyrning: {
    namn: 'Uthyrningen',
    beskrivning: 'Utrustning ut och in, och dagens hyror',
    sidor: ['luckan', 'kassa', 'planbok', 'ideer', 'mina'],
  },
  ekonomi: {
    namn: 'Kassören',
    beskrivning: 'Bokföring, utlägg, plånböcker och avgifter',
    sidor: ['ekonomi', 'utlagg', 'planbok', 'kassa', 'luckan', 'forening', 'rapporter', 'ideer', 'mina'],
  },
  // Ordförande, sekreterare och övriga ledamöter har samma behörighet att
  // läsa, men inte samma arbete. Ordföranden styr tillträden och svarar
  // för ekonomin; sekreteraren för matrikeln och mötena. Att ge dem samma
  // startsida gör att båda får leta förbi den andras arbete.
  ordforande: {
    namn: 'Ordföranden',
    beskrivning: 'Hela föreningen: ekonomi, tillträden och uppföljning',
    sidor: ['oversikt', 'forening', 'ekonomi', 'utlagg', 'rapporter', 'arenden', 'incidenter',
      'bemanning', 'traning', 'evenemang', 'ideer', 'mina'],
  },
  sekreterare: {
    namn: 'Sekreteraren',
    beskrivning: 'Matrikel, möten, kallelser och evenemang',
    sidor: ['forening', 'evenemang', 'samakning', 'rapporter', 'arenden', 'incidenter', 'ideer', 'mina'],
  },
  styrelse: {
    namn: 'Styrelsen',
    beskrivning: 'Överblick över hela föreningen',
    sidor: ['oversikt', 'forening', 'ekonomi', 'arenden', 'incidenter', 'bemanning', 'traning',
      'evenemang', 'rapporter', 'ideer', 'mina'],
  },
  traning: {
    namn: 'Tränaren',
    beskrivning: 'Grupper, närvaro, läger och tävlingar',
    sidor: ['traning', 'evenemang', 'samakning', 'forening', 'bemanning', 'utlagg', 'ideer', 'mina'],
  },
  medlem: {
    namn: 'Medlem',
    beskrivning: 'Dina pass, dina ronder och läget i backen',
    sidor: ['bemanning', 'checklistor', 'journal', 'arenden', 'snolaggning', 'evenemang',
      'samakning', 'planbok', 'utlagg', 'ideer', 'mina'],
  },
};

/** Vilka arbetsytor en medlem kan stå i, viktigast först. */
export function arbetsytorFor(medlem) {
  if (!medlem) return ['medlem'];
  const uppdrag = (medlem.uppdrag || uppdragFor(medlem.id)).map((u) => u.slag);
  const kompetens = (() => {
    try {
      return typeof medlem.kompetens === 'string' ? JSON.parse(medlem.kompetens || '[]') : medlem.kompetens || [];
    } catch {
      return [];
    }
  })();
  const ut = [];
  const lagg = (x) => !ut.includes(x) && ut.push(x);

  // Ordningen är startsidan: den första ytan är den man landar i. Därför
  // kommer den egna rollen före den gemensamma styrelseytan – en kassör
  // ska börja i ekonomin, inte i en översikt över hela föreningen.
  if (uppdrag.includes('ordforande') || uppdrag.includes('vice_ordforande')) lagg('ordforande');
  if (uppdrag.includes('sekreterare')) lagg('sekreterare');
  if (uppdrag.includes('kassor') || uppdrag.includes('revisor')) lagg('ekonomi');
  if (uppdrag.some((u) => STYRELSEN.includes(u))) lagg('styrelse');
  if (medlem.roll === 'anlaggningsansvarig' || uppdrag.includes('anlaggningsansvarig')) lagg('anlaggning');
  if (medlem.roll === 'backansvarig' || uppdrag.includes('backansvarig')) lagg('back');
  if (medlem.roll === 'tranare' || uppdrag.includes('tranare') || uppdrag.includes('sektionsansvarig')) lagg('traning');
  if (kompetens.includes('fik')) lagg('kiosk');
  if (kompetens.includes('uthyrning')) lagg('uthyrning');
  // Grupperna öppnar sina ytor, och sitt rollgolv ger samma ytor som rollen.
  for (const g of grupperAv(medlem)) {
    for (const y of g.ytor || []) if (ARBETSYTOR[y]) lagg(y);
    if (g.roll_golv === 'anlaggningsansvarig') lagg('anlaggning');
    if (g.roll_golv === 'backansvarig') lagg('back');
    if (g.roll_golv === 'tranare') lagg('traning');
  }
  if (rollNiva(medlem) >= RANG.admin) for (const y of Object.keys(ARBETSYTOR)) lagg(y);
  lagg('medlem');
  return ut;
}
