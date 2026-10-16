// Databasen. En fil, ingen ORM, synkrona frågor (node:sqlite).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const harDenna = dirname(fileURLToPath(import.meta.url));
export const ROT = join(harDenna, '..');

const sokvag = process.env.HAK_DB || join(ROT, 'data', 'hak.db');
if (sokvag !== ':memory:') mkdirSync(dirname(sokvag), { recursive: true });

export const db = new DatabaseSync(sokvag);
db.exec(readFileSync(join(harDenna, 'schema.sql'), 'utf8'));

// Kolumnen hette vatkula innan branschordet wetbulb slog igenom i appen.
if (db.prepare('PRAGMA table_info(matning)').all().some((k) => k.name === 'vatkula'))
  db.exec('ALTER TABLE matning RENAME COLUMN vatkula TO wetbulb');

// Kolumner som tillkommit efter första versionen. CREATE TABLE IF NOT EXISTS
// rör inte befintliga tabeller, så de måste läggas till här.
for (const [tabell, kolumn, typ] of [
  ['checklistsvar', 'bild', 'TEXT'],
  ['checklistkorning', 'kalla', "TEXT NOT NULL DEFAULT 'webb'"],
  ['checklistmall', 'position_nyckel', 'TEXT'],
  ['kundorder', 'kod', 'TEXT'],
  // Matrikeln: personuppgifter ligger kvar i medlemstabellen men läses bara
  // av den som har behörigheten medlemsregister.
  ['medlem', 'medlemsnummer', 'TEXT'],
  ['medlem', 'fornamn', 'TEXT'],
  ['medlem', 'efternamn', 'TEXT'],
  ['medlem', 'fodelsedatum', 'TEXT'],
  ['medlem', 'adress', 'TEXT'],
  ['medlem', 'postnummer', 'TEXT'],
  ['medlem', 'ort', 'TEXT'],
  ['medlem', 'kategori', "TEXT NOT NULL DEFAULT 'aktiv'"],
  ['medlem', 'intradesdatum', 'TEXT'],
  ['medlem', 'utradesdatum', 'TEXT'],
  ['medlem', 'malsman_namn', 'TEXT'],
  ['medlem', 'malsman_telefon', 'TEXT'],
  ['medlem', 'malsman_epost', 'TEXT'],
  ['medlem', 'nodkontakt_namn', 'TEXT'],
  ['medlem', 'nodkontakt_telefon', 'TEXT'],
  ['medlem', 'licens', 'TEXT'],
  ['medlem', 'licens_till', 'TEXT'],
  ['medlem', 'samtycke_bild', 'INTEGER'],
  ['medlem', 'samtycke_tid', 'TEXT'],
  ['medlem', 'belastningsregister_visat', 'TEXT'],
]) {
  const finns = db.prepare(`PRAGMA table_info(${tabell})`).all().some((k) => k.name === kolumn);
  if (!finns) db.exec(`ALTER TABLE ${tabell} ADD COLUMN ${kolumn} ${typ}`);
}

export const alla = (sql, ...p) => db.prepare(sql).all(...p);
export const en = (sql, ...p) => db.prepare(sql).get(...p) ?? null;
export const kor = (sql, ...p) => db.prepare(sql).run(...p);
export const nyttId = (sql, ...p) => Number(db.prepare(sql).run(...p).lastInsertRowid);
export const ivarde = (v) => (v === true ? 1 : v === false ? 0 : v);

/** Enkel insert från objekt. Hoppar över undefined. */
export function spara(tabell, data) {
  const nycklar = Object.keys(data).filter((k) => data[k] !== undefined);
  const sql = `INSERT INTO ${tabell} (${nycklar.join(',')}) VALUES (${nycklar.map(() => '?').join(',')})`;
  return nyttId(sql, ...nycklar.map((k) => ivarde(data[k])));
}

/** Enkel update från objekt. Hoppar över undefined. Returnerar antal ändrade rader. */
export function uppdatera(tabell, id, data) {
  const nycklar = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!nycklar.length) return 0;
  const sql = `UPDATE ${tabell} SET ${nycklar.map((k) => `${k}=?`).join(',')} WHERE id=?`;
  return Number(kor(sql, ...nycklar.map((k) => ivarde(data[k])), id).changes);
}

// Transaktioner kan ligga i varandra: en försäljning som bokförs öppnar en
// inre transaktion. Bara den yttersta gör BEGIN och COMMIT.
let djup = 0;
export function transaktion(fn) {
  if (djup > 0) return fn();
  db.exec('BEGIN');
  djup = 1;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    djup = 0;
  }
}
