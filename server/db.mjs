// Databasen. En fil per förening, ingen ORM, synkrona frågor (node:sqlite).
//
// Plattformen kan bära flera föreningar. Varje förening har sin egen fil:
// ingen fråga kan läcka mellan dem, och en förening går att lämna ut, flytta
// eller radera som en enda fil. Vilken databas ett anrop gäller avgörs av
// begäran och bärs i en AsyncLocalStorage, så att modulerna kan fortsätta
// anropa alla()/en()/kor() utan att veta något om föreningar.
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const harDenna = dirname(fileURLToPath(import.meta.url));
export const ROT = join(harDenna, '..');

const skal = new AsyncLocalStorage();
const oppnade = new Map();

/** Öppnar en databas och kör schema och migreringar. Samma fil återanvänds. */
export function oppna(sokvag) {
  // :memory: cachas inte – två föreningar i minnet ska inte dela databas.
  if (sokvag !== ':memory:' && oppnade.has(sokvag)) return oppnade.get(sokvag);
  if (sokvag !== ':memory:') mkdirSync(dirname(sokvag), { recursive: true });
  const handtag = new DatabaseSync(sokvag);
  handtag.exec(readFileSync(join(harDenna, 'schema.sql'), 'utf8'));
  migrera(handtag);
  if (sokvag !== ':memory:') oppnade.set(sokvag, handtag);
  return handtag;
}

export function stang(sokvag) {
  const handtag = oppnade.get(sokvag);
  if (!handtag) return;
  handtag.close();
  oppnade.delete(sokvag);
}

export const oppnaDatabaser = () => [...oppnade.keys()];

/** Standarddatabasen: den enda föreningen, eller den som skript kör mot. */
const standardSokvag = process.env.HAK_DB || join(ROT, 'data', 'hak.db');
let standard = null;
const standarddb = () => (standard ??= oppna(standardSokvag));

/**
 * Kör fn i en förenings skal: dess databas och dess konfiguration. All kod
 * inuti ser bara den föreningen, utan att själv behöva veta om saken.
 */
export const medSkal = (innehall, fn) => skal.run(innehall, fn);
export const medDatabas = (handtag, fn) => skal.run({ db: handtag }, fn);

/** Den databas anropet gäller just nu. */
export const aktuell = () => skal.getStore()?.db ?? standarddb();

/** Föreningen anropet gäller, om något skal är satt. */
export const aktuellForening = () => skal.getStore()?.forening ?? null;

/**
 * `db` pekar alltid på den aktuella databasen. Proxyn finns för att äldre
 * kod gör db.prepare(...) rakt av; nya anrop bör gå via alla/en/kor.
 */
export const db = new Proxy(
  {},
  {
    get(_, egenskap) {
      const h = aktuell();
      const v = h[egenskap];
      return typeof v === 'function' ? v.bind(h) : v;
    },
  }
);

function migrera(db) {
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
    // Anläggningsregistret: tekniska uppgifter och ansvar per objekt.
    ['utrustning', 'tillverkare', 'TEXT'],
    ['utrustning', 'modell', 'TEXT'],
    ['utrustning', 'serienummer', 'TEXT'],
    ['utrustning', 'drifttimmar', 'REAL'],
    ['utrustning', 'ansvarig_id', 'INTEGER'],
    ['utrustning', 'leverantor_id', 'INTEGER'],
    ['utrustning', 'i_bruk_sedan', 'TEXT'],
    // En säkerhetskritisk punkt får inte kvitteras bort som "ej tillämplig".
    ['checklistpunkt', 'sakerhetskritisk', 'INTEGER NOT NULL DEFAULT 0'],
    ['checklistmall', 'rondtyp', 'TEXT'],
    ['checklistmall', 'kraver_kvittens', 'INTEGER NOT NULL DEFAULT 0'],
    // Fel sätts på komponenten, och kostnaden följer ärendet.
    ['arende', 'komponent_id', 'INTEGER'],
    ['arende', 'kostnad_ore', 'INTEGER'],
    ['arende', 'driftpaverkan', 'TEXT'],
    // "Ej tillämplig" måste gå att ange, men aldrig utan motivering – och
    // aldrig på en säkerhetskritisk punkt.
    ['checklistsvar', 'ej_tillampligt', 'INTEGER NOT NULL DEFAULT 0'],
    ['checklistsvar', 'motivering', 'TEXT'],
    // En ofullständig rond får inte se ut som en godkänd. Bristerna sparas
    // med ronden så att de syns i efterhand.
    ['checklistkorning', 'brister', 'TEXT'],
    ['checklistkorning', 'brist_motivering', 'TEXT'],
    // Beslutet att ta en lift i drift fattas av en människa, och skrivs ner
    // som ett eget steg efter ronden.
    ['checklistkorning', 'kvittens_beslut', 'TEXT'],
    ['checklistkorning', 'kvittens_av_id', 'INTEGER'],
    ['checklistkorning', 'kvittens_tid', 'TEXT'],
    ['checklistkorning', 'kvittens_anteckning', 'TEXT'],
    // Snöfönstret som passet kom ur, så att planeringen går att följa bakåt.
    ['pass', 'snofonster_id', 'INTEGER'],
    // Förhandsanmälan: när gästen fyllt i sina uppgifter före besöket.
    ['hyresavtal', 'anmald', 'TEXT'],
    ['hyresavtal', 'besok_datum', 'TEXT'],
    // Positionen i backen, vid sidan av maskinen. Ett fel under snöläggning
    // sitter oftast på platsen – vattenuttaget, slangen, elen – och inte på
    // kanonen som råkar stå där.
    ['arende', 'snoplats_id', 'INTEGER'],
    ['matning', 'snoplats_id', 'INTEGER'],
    ['checklistkorning', 'snoplats_id', 'INTEGER'],
    ['driftpost', 'snoplats_id', 'INTEGER'],
    ['checklistmall', 'platsslag', 'TEXT'],
    // Vad tolkningen kom fram till om dokumentet. Sparas rått, så att det
    // går att se vad modellen sa även efter att någon rättat uppgifterna.
    ['dokument', 'tolkning', 'TEXT'],
    ['dokument', 'sammanfattning', 'TEXT'],
    ['dokument', 'ai_modell', 'TEXT'],
    ['dokument', 'tolkad_tid', 'TEXT'],
  ]) {
    const finns = db.prepare(`PRAGMA table_info(${tabell})`).all().some((k) => k.name === kolumn);
    if (!finns) db.exec(`ALTER TABLE ${tabell} ADD COLUMN ${kolumn} ${typ}`);
  }
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
