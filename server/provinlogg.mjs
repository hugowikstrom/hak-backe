// Två provinloggningar: en för anläggningsansvarig, en för backansvarig.
//
// Finns för att någon ska kunna öppna systemet och se hur det ser ut utan
// att först få ett konto upplagt. Det är inte en bakdörr: koden står
// skriven på inloggningssidan, och den som loggar in syns i
// behandlingshistoriken som den provanvändare hen är.
//
// Rättigheterna är avsiktligt riktiga. En provinloggning som inte kan göra
// en rond eller öppna ett ärende visar ingenting – men den ser bara det
// databasen innehåller, och i en skarp förening bör den stängas av när
// säsongen börjar: sätt HAK_PROVINLOGG=0.
import { alla, en, spara, uppdatera } from './db.mjs';
import { hasha } from './auth.mjs';

/** Koden till rollinloggningarna. Går att byta utan att röra koden. */
export const PROVKOD = process.env.HAK_PROVKOD || '07012345678';

/** Koden till projektinloggningen – den som delas ut i ett mejl. */
export const PROJEKTKOD = process.env.HAK_PROJEKTKOD || 'hak';

/**
 * Kontrollvyns inloggning. Den loggar in med telefonnummer och en
 * fyrsiffrig pinkod, för det är så systemet klubben kommer ifrån gör –
 * och vanan sitter i fingrarna. Under huven är det samma
 * användarnamn-och-lösenord som allt annat i Backis; numret *är*
 * användarnamnet.
 */
export const KONTROLLNUMMER = process.env.HAK_KONTROLLNUMMER || '0701234567';
export const KONTROLLPIN = process.env.HAK_KONTROLLPIN || '1234';

export const provinloggPa = () => process.env.HAK_PROVINLOGG !== '0';

export const PROVKONTON = [
  {
    // Heter som systemet, för det är vad folk gissar på. Landar på
    // projektsidan och har bara medlemsrättigheter: den som ska läsa om
    // projektet och lämna en idé behöver inte kunna kvittera en lift.
    anvandarnamn: 'backis',
    namn: 'Backis (prov)',
    roll: 'medlem',
    kod: PROJEKTKOD,
    text: 'Projektet',
    beskrivning: 'Vad klubben bygger, och lämna en idé',
    startsida: '/projekt',
  },
  {
    anvandarnamn: 'anlaggning',
    namn: 'Anläggningsansvarig (prov)',
    roll: 'anlaggningsansvarig',
    text: 'Anläggningsansvarig',
    beskrivning: 'Hela backen: underhåll, snöläggning, ronder och ärenden',
  },
  {
    anvandarnamn: 'backansvarig',
    namn: 'Backansvarig (prov)',
    roll: 'backansvarig',
    text: 'Backansvarig',
    beskrivning: 'Dagens drift: ronder, ärenden och bemanning',
  },
  {
    // Kontrollvyns konto. Visas inte i provrutan – vyn har ingen, och
    // den som öppnar checkproof.nattviken.com skriver numret han redan
    // kan utantill.
    anvandarnamn: KONTROLLNUMMER,
    namn: 'Backansvarig (prov)',
    roll: 'backansvarig',
    kod: KONTROLLPIN,
    dold: true,
  },
];

/**
 * Lägger upp eller uppdaterar provkontona. Körs vid uppstart, och är
 * idempotent: samma anrop två gånger ger samma två konton.
 *
 * Kompetenserna gör att ronderna för fiket och uthyrningen också syns –
 * annars ser den som provar bara halva checklistbiblioteket och tror att
 * resten saknas.
 */
export function sakerstallProvkonton() {
  if (!provinloggPa()) return [];
  const ut = [];
  for (const k of PROVKONTON) {
    const fanns = en('SELECT * FROM medlem WHERE anvandarnamn=?', k.anvandarnamn);
    const falt = {
      namn: k.namn,
      roll: k.roll,
      losenordshash: hasha(k.kod || PROVKOD),
      aktiv: 1,
      kompetens: JSON.stringify(['snolaggning', 'fik', 'uthyrning', 'backansvarig']),
      // Provkontot ska inte räknas in i någons bemanningskvot.
      kvot_timmar: 0,
      startsida: k.startsida ?? null,
      anteckning: 'Provinloggning. Skapas av systemet och går att stänga av med HAK_PROVINLOGG=0.',
    };
    if (fanns) {
      uppdatera('medlem', fanns.id, falt);
      ut.push({ ...k, id: fanns.id });
    } else {
      ut.push({ ...k, id: spara('medlem', { anvandarnamn: k.anvandarnamn, ...falt }) });
    }
  }
  return ut;
}

/** Det inloggningssidan behöver veta. Aldrig något om andra konton. */
export const provinloggningar = () =>
  provinloggPa()
    ? {
        // Koden står per konto: projektinloggningen delas ut i ett mejl
        // och ska vara lätt att skriva, rollinloggningarna är numret.
        // Kontrollvyn förifyller numret, som systemet klubben kommer
        // ifrån gör. Pinkoden skriver man själv – den ska sitta i
        // fingrarna, inte i rutan.
        kontrollnummer: KONTROLLNUMMER,
        konton: PROVKONTON.filter(
          (k) => !k.dold && en('SELECT id FROM medlem WHERE anvandarnamn=? AND aktiv=1', k.anvandarnamn)
        ).map(({ anvandarnamn, text, beskrivning, kod }) => ({
          anvandarnamn,
          text,
          beskrivning,
          kod: kod || PROVKOD,
        })),
      }
    : null;
