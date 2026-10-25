// Dokument på disk, och texten ur dem.
//
// Originalet är handlingen och sparas alltid. Texten dras ut för att kunna
// sökas och tolkas – lyckas det inte går dokumentet ändå att öppna, vilket
// är viktigare än att tolkningen fungerar.
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ROT } from './db.mjs';
import { fel } from './http.mjs';

const kor = promisify(execFile);

/** Samma tecken som pdftotext skiljer sidor med. */
export const SIDBRYT = '\f';

export const sidorUr = (text) => String(text || '').split(SIDBRYT);

export const DOKUMENTKATALOG = join(ROT, 'data', 'dokument');
const PDFTOTEXT = process.env.HAK_PDFTOTEXT || '/usr/bin/pdftotext';
const MAX = 40_000_000;

const TYPER = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
};

/** Tar emot en fil som data-URL och lägger den på disk. */
export function sparaDokument(dataUrl) {
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/is.exec(String(dataUrl || ''));
  if (!m) throw fel(400, 'Filen måste skickas som data-URL');
  const mediatyp = m[1].toLowerCase();
  const andelse = TYPER[mediatyp];
  if (!andelse) throw fel(415, `Filtypen ${mediatyp} tas inte emot`);
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) throw fel(400, 'Tom fil');
  if (bytes.length > MAX) throw fel(413, 'Filen är för stor');
  const namn = `${randomBytes(10).toString('hex')}.${andelse}`;
  mkdirSync(DOKUMENTKATALOG, { recursive: true });
  writeFileSync(join(DOKUMENTKATALOG, namn), bytes);
  return { filnamn: namn, mediatyp, storlek: bytes.length };
}

/**
 * Plockar ut texten ur en PDF, sida för sida.
 *
 * Sidnumren är poängen: en servicepunkt som inte går att slå upp i manualen
 * är inte spårbar, och då duger den inte som underlag.
 */
export async function lasPdf(filnamn) {
  const fil = join(DOKUMENTKATALOG, filnamn);
  try {
    const { stdout } = await kor(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', fil, '-'], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120000,
    });
    // pdftotext skiljer sidor med sidbrytning (\f).
    const sidor = stdout.split('\f').map((s) => s.trim());
    if (sidor.length && !sidor.at(-1)) sidor.pop();
    // Sidbrytningen sparas med texten. Slås sidorna ihop med tomrad går
    // sidnumren förlorade, och då går citaten inte att slå upp.
    return { sidor, text: sidor.join(SIDBRYT), fel: null };
  } catch (e) {
    return { sidor: [], text: null, fel: String(e.stderr || e.message || e).slice(0, 300) };
  }
}

/**
 * Avsnitt som handlar om underhåll. En manual är mest teknisk beskrivning;
 * modellen ska läsa de delar som faktiskt säger något om service, inte hela
 * boken – det blir både bättre och billigare.
 */
export function underhallsavsnitt(sidor, { maxTecken = 24000 } = {}) {
  const ord = /underh[åa]ll|service|sm[öo]rj|byt[ea]?\b|kontroll|inspekt|rengör|rengor|intervall|var\s+\d+\s*(tim|dag|vecka|m[åa]nad)|maintenance|lubricat|replace|inspect/i;
  const valda = [];
  let tecken = 0;
  for (const [i, text] of sidor.entries()) {
    if (!ord.test(text)) continue;
    const bit = text.slice(0, 4000);
    if (tecken + bit.length > maxTecken) break;
    valda.push({ sida: i + 1, text: bit });
    tecken += bit.length;
  }
  return valda;
}
