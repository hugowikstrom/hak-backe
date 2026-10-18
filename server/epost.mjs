// E-post. Allt som skickas loggas i epostlogg, även när utskick är avstängt.
import { alla, en, kor, spara } from './db.mjs';

const PA = process.env.HAK_EPOST_AV !== '0';
import { instans } from './foreningar.mjs';

const FRAN = () => instans('epost_fran', process.env.HAK_EPOST_FRAN || 'HAK Backe <backe@nattviken.com>');
const BAS = () => instans('bas_url', process.env.HAK_BAS_URL || 'https://hak.nattviken.com');

let transport = null;
async function hamtaTransport() {
  if (transport) return transport;
  const { createTransport } = await import('nodemailer');
  transport = createTransport({
    host: process.env.HAK_SMTP_HOST || '127.0.0.1',
    port: Number(process.env.HAK_SMTP_PORT || 1025),
    secure: process.env.HAK_SMTP_SAKER === '1',
    auth: process.env.HAK_SMTP_USER
      ? { user: process.env.HAK_SMTP_USER, pass: process.env.HAK_SMTP_LOSEN }
      : undefined,
    tls: { rejectUnauthorized: false },
  });
  return transport;
}

export async function skicka({ till, amne, text, slag = 'ovrigt' }) {
  const id = spara('epostlogg', { till, amne, text, slag });
  if (!till) {
    kor('UPDATE epostlogg SET fel=? WHERE id=?', 'saknar e-postadress', id);
    return { id, skickad: false, fel: 'saknar e-postadress' };
  }
  if (!PA) {
    kor('UPDATE epostlogg SET fel=? WHERE id=?', 'utskick avstängt (HAK_EPOST_AV=0)', id);
    return { id, skickad: false, fel: 'utskick avstängt' };
  }
  try {
    const t = await hamtaTransport();
    await t.sendMail({ from: FRAN(), to: till, subject: amne, text });
    kor(`UPDATE epostlogg SET skickad=datetime('now') WHERE id=?`, id);
    return { id, skickad: true };
  } catch (e) {
    kor('UPDATE epostlogg SET fel=? WHERE id=?', String(e.message || e), id);
    return { id, skickad: false, fel: String(e.message || e) };
  }
}

export const lank = (stig = '') => `${BAS()}${stig}`;

/** Brev till en medlem om bokningsläget. */
export function brevBokning({ medlem, lage, minaPass, lediga, fran, till }) {
  const rader = [
    `Hej ${medlem.namn.split(' ')[0]}!`,
    '',
    `Här är ditt bemanningsläge för perioden ${fran} – ${till}.`,
    '',
    `Dina insatser: ${lage.timmar} av ${lage.kvot} timmar (${lage.andel}%).`,
    `Nattpass: ${lage.natt}. Helgpass: ${lage.helg}.`,
    lage.kvar > 0
      ? `Du har ${lage.kvar} timmar kvar att boka.`
      : 'Du har fyllt din kvot – tack!',
    '',
  ];
  if (minaPass.length) {
    rader.push('Dina bokade pass:');
    for (const p of minaPass) rader.push(`  ${p.datum} ${p.start}-${p.slut}  ${p.position}`);
    rader.push('');
  }
  if (lediga.length) {
    rader.push(`Pass som fortfarande saknar folk (${lediga.length} st):`);
    for (const p of lediga.slice(0, 25))
      rader.push(`  ${p.datum} ${p.start}-${p.slut}  ${p.position}  (${p.bokade}/${p.behov})`);
    if (lediga.length > 25) rader.push(`  ... och ${lediga.length - 25} till`);
    rader.push('');
  }
  rader.push(`Boka här: ${lank('/bemanning')}`, '', 'Hälsningar', 'HAK Backe');
  return rader.join('\n');
}

export function brevArende(a, utrustningsnamn) {
  const pri = ['', 'AKUT', 'Hög', 'Normal', 'Låg'][a.prioritet] || a.prioritet;
  return [
    `Ärende #${a.id}: ${a.titel}`,
    '',
    `Prioritet: ${pri}`,
    `Allvarlighet: ${a.allvarlighet}`,
    utrustningsnamn ? `Gäller: ${utrustningsnamn}` : '',
    '',
    a.beskrivning || '',
    '',
    `Öppna ärendet: ${lank(`/arenden?id=${a.id}`)}`,
  ]
    .filter((r) => r !== '')
    .join('\n');
}

export const epostlogg = (n = 100) =>
  alla('SELECT * FROM epostlogg ORDER BY id DESC LIMIT ?', n);

export const senasteUtskick = (slag) =>
  en('SELECT * FROM epostlogg WHERE slag=? ORDER BY id DESC LIMIT 1', slag);
