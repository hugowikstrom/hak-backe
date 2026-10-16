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

export function transaktion(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
