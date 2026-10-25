// Vem får göra vad.
//
// Rollen är grundnivån i systemet. Uppdragen – ordförande, kassör, tränare,
// volontär – ger behörigheter vid sidan av den, för en kassör ska komma åt
// ekonomin utan att vara administratör för snöläggningen.
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
  uthyrning: {
    roller: ['backansvarig', 'anlaggningsansvarig', 'admin'],
    uppdrag: ['kassor', 'ordforande', 'volontar'],
    kompetens: ['uthyrning', 'fik'],
  },
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

export const minstRoll = (medlem, roll) => (RANG[medlem?.roll] ?? 0) >= (RANG[roll] ?? 99);

const kompetensFor = (medlem) => {
  try {
    return typeof medlem.kompetens === 'string' ? JSON.parse(medlem.kompetens || '[]') : medlem.kompetens || [];
  } catch {
    return [];
  }
};

/** Har medlemmen behörigheten – via roll, uppdrag eller sin kompetens? */
export function far(medlem, behorighet) {
  if (!medlem) return false;
  const regel = BEHORIGHETER[behorighet];
  if (!regel) return false;
  if (medlem.roll === 'admin') return true;
  if (regel.roller.includes(medlem.roll)) return true;
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
      'bemanning', 'rapporter', 'register', 'ideer', 'mina'],
  },
  back: {
    namn: 'Backen',
    beskrivning: 'Dagens drift: bemanning, ronder och ärenden',
    sidor: ['bemanning', 'snoplan', 'checklistor', 'journal', 'arenden', 'incidenter', 'snolaggning',
      'underhall', 'ideer', 'mina'],
  },
  kiosk: {
    namn: 'Kiosken',
    beskrivning: 'Beställningar, försäljning och sortiment',
    sidor: ['kassa', 'ideer', 'mina'],
  },
  uthyrning: {
    namn: 'Uthyrningen',
    beskrivning: 'Utrustning ut och in, och dagens hyror',
    sidor: ['kassa', 'ideer', 'mina'],
  },
  ekonomi: {
    namn: 'Ekonomi',
    beskrivning: 'Bokföring, avgifter och rapporter',
    sidor: ['ekonomi', 'kassa', 'forening', 'rapporter', 'ideer', 'mina'],
  },
  styrelse: {
    namn: 'Styrelsen',
    beskrivning: 'Överblick över hela föreningen',
    sidor: ['forening', 'ekonomi', 'arenden', 'incidenter', 'bemanning', 'traning', 'rapporter', 'ideer', 'mina'],
  },
  traning: {
    namn: 'Träningen',
    beskrivning: 'Grupper, närvaro och aktivitetsstöd',
    sidor: ['traning', 'forening', 'bemanning', 'ideer', 'mina'],
  },
  medlem: {
    namn: 'Medlem',
    beskrivning: 'Dina pass, dina ronder och läget i backen',
    sidor: ['bemanning', 'checklistor', 'journal', 'arenden', 'snolaggning', 'ideer', 'mina'],
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

  if (uppdrag.includes('ordforande') || uppdrag.includes('vice_ordforande') || uppdrag.includes('sekreterare')) lagg('styrelse');
  if (uppdrag.includes('kassor') || uppdrag.includes('revisor')) lagg('ekonomi');
  if (medlem.roll === 'anlaggningsansvarig' || uppdrag.includes('anlaggningsansvarig')) lagg('anlaggning');
  if (medlem.roll === 'backansvarig' || uppdrag.includes('backansvarig')) lagg('back');
  if (medlem.roll === 'tranare' || uppdrag.includes('tranare') || uppdrag.includes('sektionsansvarig')) lagg('traning');
  if (kompetens.includes('fik')) lagg('kiosk');
  if (kompetens.includes('uthyrning')) lagg('uthyrning');
  if (medlem.roll === 'admin') for (const y of Object.keys(ARBETSYTOR)) lagg(y);
  lagg('medlem');
  return ut;
}
