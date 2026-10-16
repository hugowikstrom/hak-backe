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
  kassa: { roller: ['medlem', 'volontar', 'tranare', 'backansvarig', 'anlaggningsansvarig', 'admin'], uppdrag: [] },
  bemanning: { roller: ['backansvarig', 'anlaggningsansvarig', 'admin'], uppdrag: ['ordforande', 'sektionsansvarig'] },
  anlaggning: { roller: ['backansvarig', 'anlaggningsansvarig', 'admin'], uppdrag: ['anlaggningsansvarig', 'backansvarig'] },
  medlemsregister: { roller: ['anlaggningsansvarig', 'admin'], uppdrag: ['ordforande', 'kassor', 'sekreterare'] },
  traning: { roller: ['tranare', 'anlaggningsansvarig', 'admin'], uppdrag: ['tranare', 'sektionsansvarig', 'ordforande'] },
  uthyrning: { roller: ['medlem', 'volontar', 'tranare', 'backansvarig', 'anlaggningsansvarig', 'admin'], uppdrag: [] },
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

/** Har medlemmen behörigheten, via sin roll eller ett pågående uppdrag? */
export function far(medlem, behorighet) {
  if (!medlem) return false;
  const regel = BEHORIGHETER[behorighet];
  if (!regel) return false;
  if (medlem.roll === 'admin') return true;
  if (regel.roller.includes(medlem.roll)) return true;
  if (!regel.uppdrag.length) return false;
  const mina = (medlem.uppdrag || uppdragFor(medlem.id)).map((u) => u.slag);
  return regel.uppdrag.some((u) => mina.includes(u));
}

/** Alla behörigheter en medlem har – skickas till klienten för att visa rätt meny. */
export const behorigheterFor = (medlem) =>
  Object.keys(BEHORIGHETER).filter((b) => far(medlem, b));
