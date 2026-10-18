// Grunden en ny förening startar med.
//
// Inte demodata: bara det som varje förening behöver för att kunna logga in
// och börja arbeta. Resten lägger föreningen upp själv i gränssnittet.
import { alla, en, spara } from './db.mjs';
import { hasha } from './auth.mjs';
import { sakerstallKontoplan } from './bokforing.mjs';

export const STANDARDPOSITIONER = [
  ['backansvarig', 'Backansvarig', 'BACK', '#d98b45', 'backansvarig'],
  ['stora-backen', 'Stora backen', 'STOR', '#5b8ac6', null],
  ['lilla-backen', 'Lilla backen', 'LILL', '#67a97f', null],
  ['bandet', 'Bandet', 'BAND', '#8e7cc3', null],
  ['fik', 'Fiket', 'FIK', '#c96d8b', null],
  ['uthyrning', 'Skiduthyrning', 'UTH', '#4fa3a5', null],
  ['snolaggning', 'Snöläggning', 'SNÖ', '#6c8ebf', null],
  ['extra', 'Extra resurs', 'EXTRA', '#8a8f98', null],
];

/**
 * Lägger grunden i den databas som är aktuell. Körs om utan skada: det som
 * redan finns lämnas i fred.
 * @returns {{admin: {anvandarnamn: string, losenord: string|null}}}
 */
export function laggGrund({ foreningsnamn = 'Föreningen', admin = 'admin', losenord = null, sasong = null } = {}) {
  sakerstallKontoplan();

  if (!alla('SELECT id FROM position LIMIT 1').length) {
    for (const [i, [nyckel, namn, kortnamn, farg, kravs_roll]] of STANDARDPOSITIONER.entries())
      spara('position', { nyckel, namn, kortnamn, farg, ordning: i, kravs_roll });
  }

  if (!en('SELECT id FROM sasong LIMIT 1')) {
    const ar = new Date().getFullYear();
    const host = new Date().getMonth() >= 6;
    const start = host ? `${ar}-07-01` : `${ar - 1}-07-01`;
    spara('sasong', {
      namn: sasong || `${String(start).slice(0, 4)}/${String(Number(String(start).slice(0, 4)) + 1).slice(2)}`,
      start,
      slut: `${Number(String(start).slice(0, 4)) + 1}-06-30`,
      kvot_timmar: 20,
      kvot_nattpass: 2,
      aktiv: 1,
    });
  }

  let nyttLosen = null;
  if (!en('SELECT id FROM medlem WHERE roll=?', 'admin')) {
    nyttLosen = losenord || Math.random().toString(36).slice(2, 10);
    const id = spara('medlem', {
      anvandarnamn: admin,
      namn: `${foreningsnamn} administratör`,
      roll: 'admin',
      kategori: 'ledare',
      kvot_timmar: 0,
      kompetens: '[]',
      losenordshash: hasha(nyttLosen),
    });
    spara('uppdrag', { medlem_id: id, slag: 'ordforande' });
  }

  return { admin: { anvandarnamn: admin, losenord: nyttLosen } };
}
