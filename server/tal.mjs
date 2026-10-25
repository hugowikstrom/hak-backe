// Tal till text via husets egen STT-router. Ljudet lämnar aldrig maskinen.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROT } from './db.mjs';
import { fel } from './http.mjs';

export const LJUDKATALOG = join(ROT, 'data', 'ljud');

const URL_STT = process.env.HAK_STT_URL || 'http://127.0.0.1:8115/v1/audio/transcriptions';
const MODELL = process.env.HAK_STT_MODELL || 'kb-sv';

export const talPa = () => !!URL_STT;

/**
 * Skickar ljudet till routern och får tillbaka ett ordagrant transkript.
 * Faller tillbaka på null – då får idén ligga kvar som ren inspelning.
 */
export async function transkribera(bytes, filnamn = 'ide.webm') {
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes]), filnamn);
    form.append('model', MODELL);
    form.append('language', 'sv');
    form.append('response_format', 'json');
    const svar = await fetch(URL_STT, { method: 'POST', body: form, signal: AbortSignal.timeout(180000) });
    if (!svar.ok) throw new Error(`STT svarade ${svar.status}: ${(await svar.text()).slice(0, 200)}`);
    const data = await svar.json();
    const text = (data.text || data.transcript || '').trim();
    return { text: text || null, fel: text ? null : 'Tomt transkript' };
  } catch (e) {
    return { text: null, fel: String(e.message || e) };
  }
}

/**
 * Tar emot en inspelning som data-URL och lägger den på disk.
 * Delas av idélådan och driftjournalen: ljudet är originalhandlingen och
 * sparas även när transkriberingen misslyckas.
 */
export function sparaLjud(dataUrl) {
  const m = /^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/is.exec(String(dataUrl || ''));
  if (!m) throw fel(400, 'Ljudet måste skickas som data-URL');
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) throw fel(400, 'Tom inspelning');
  if (bytes.length > 25_000_000) throw fel(413, 'Inspelningen är för lång');
  const andelse = m[1].includes('ogg') ? 'ogg' : m[1].includes('mp4') ? 'mp4'
    : m[1].includes('wav') ? 'wav' : 'webm';
  const namn = `${randomBytes(10).toString('hex')}.${andelse}`;
  mkdirSync(LJUDKATALOG, { recursive: true });
  writeFileSync(join(LJUDKATALOG, namn), bytes);
  return { namn, bytes };
}
