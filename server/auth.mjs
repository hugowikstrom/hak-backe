// Inloggning: användarnamn + lösenord, scrypt, sessionskaka. Inga externa beroenden.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { alla, en, kor, spara } from './db.mjs';
import {
  ARBETSYTOR, arbetsytorFor, behorigheterFor, grupperFor,
  minstRoll as minstRollGrupp, RANG as RANGER, rollNiva, uppdragFor,
} from './behorighet.mjs';

const KAKA = 'hak_sess';
const DYGN = 86400e3;

export function hasha(losenord) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(losenord, salt, 64).toString('hex')}`;
}

export function stammer(losenord, hash) {
  if (!hash?.startsWith('scrypt$')) return false;
  const [, salt, nyckel] = hash.split('$');
  const a = Buffer.from(nyckel, 'hex');
  const b = scryptSync(losenord, salt, a.length);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const RANG = RANGER;
export const minstRoll = minstRollGrupp;

export function loggaIn(anvandarnamn, losenord) {
  const namn = String(anvandarnamn || '').trim().toLowerCase();
  const m = en('SELECT * FROM medlem WHERE lower(anvandarnamn)=? OR lower(epost)=?', namn, namn);
  if (!m || !m.aktiv || !stammer(String(losenord || ''), m.losenordshash)) return null;
  const id = randomBytes(24).toString('base64url');
  const giltig = new Date(Date.now() + 30 * DYGN).toISOString();
  spara('session', { id, medlem_id: m.id, giltig_t: giltig });
  return { id, medlem: m, giltig };
}

export function medlemAvKaka(kakrad) {
  const sid = lasKaka(kakrad, KAKA);
  if (!sid) return null;
  const s = en(`SELECT * FROM session WHERE id=? AND giltig_t > datetime('now')`, sid);
  if (!s) return null;
  const m = en('SELECT * FROM medlem WHERE id=? AND aktiv=1', s.medlem_id);
  return m || null;
}

export const loggaUt = (kakrad) => {
  const sid = lasKaka(kakrad, KAKA);
  if (sid) kor('DELETE FROM session WHERE id=?', sid);
};

export function lasKaka(rad, namn) {
  for (const del of String(rad || '').split(';')) {
    const i = del.indexOf('=');
    if (i > 0 && del.slice(0, i).trim() === namn) return decodeURIComponent(del.slice(i + 1).trim());
  }
  return null;
}

export const sattKaka = (id) =>
  `${KAKA}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;
export const rensaKaka = () => `${KAKA}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const stadaSessioner = () => kor(`DELETE FROM session WHERE giltig_t <= datetime('now')`);

export const publikMedlem = (m) => {
  if (!m) return null;
  const uppdrag = uppdragFor(m.id);
  const grupper = grupperFor(m.id);
  return {
    id: m.id,
    anvandarnamn: m.anvandarnamn,
    namn: m.namn,
    epost: m.epost,
    telefon: m.telefon,
    roll: m.roll,
    aktiv: !!m.aktiv,
    kvot_timmar: m.kvot_timmar,
    kompetens: JSON.parse(m.kompetens || '[]'),
    anteckning: m.anteckning,
    uppdrag,
    // Grupperna med namn, så att medlemmen själv kan se varför hen kommer åt
    // något. "Du ser kassan för att du är med i Kioskvärdarna."
    grupper: grupper.map((g) => ({ nyckel: g.nyckel, namn: g.namn, roll_golv: g.roll_golv })),
    // Nivån grupperna lyft medlemmen till. Klienten jämför mot den, inte mot
    // `roll`, annars döljer den sidor som servern släpper igenom.
    roll_niva: rollNiva({ ...m, grupper }),
    behorigheter: behorigheterFor({ ...m, uppdrag, grupper }),
    arbetsytor: arbetsytorFor({ ...m, uppdrag, grupper }).map((n) => ({ nyckel: n, ...ARBETSYTOR[n] })),
  };
};

export const allaMedlemmar = () =>
  alla('SELECT * FROM medlem ORDER BY aktiv DESC, namn').map(publikMedlem);
