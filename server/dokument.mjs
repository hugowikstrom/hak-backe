// Dokument på disk, och texten ur dem.
//
// Originalet är handlingen och sparas alltid. Texten dras ut för att kunna
// sökas och tolkas – lyckas det inte går dokumentet ändå att öppna, vilket
// är viktigare än att tolkningen fungerar.
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { once } from 'node:events';
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
// Manualer kan vara stora. Taket är satt så att en rejäl servicemanual
// med bilder går in, men så att ingen fyller disken med en film.
const MAX = 250_000_000;

const TYPER = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
};

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
export function underhallsavsnitt(sidor, { maxTecken = 9000 } = {}) {
  const ord = /underh[åa]ll|service|sm[öo]rj|byt[ea]?\b|kontroll|inspekt|rengör|rengor|intervall|var\s+\d+\s*(tim|dag|vecka|m[åa]nad)|maintenance|lubricat|replace|inspect/i;
  const valda = [];
  let tecken = 0;
  for (const [i, text] of sidor.entries()) {
    if (!ord.test(text)) continue;
    const bit = text.slice(0, 3000);
    if (tecken + bit.length > maxTecken) break;
    valda.push({ sida: i + 1, text: bit });
    tecken += bit.length;
  }
  return valda;
}

/**
 * Hittar var i ett dokument en fras står.
 *
 * Poängen med många manualer är inte att ha dem, utan att kunna slå upp
 * saker i dem. Träffen returneras med sidnummer och omgivande text, så att
 * man vet var man ska titta i pappersexemplaret också.
 */
export function sokIText(text, fras, { omgivning = 160, hogst = 5 } = {}) {
  const sok = String(fras || '').trim().toLowerCase();
  if (sok.length < 2 || !text) return [];
  const traffar = [];
  for (const [i, sida] of sidorUr(text).entries()) {
    const lag = sida.toLowerCase();
    let fran = 0;
    while (traffar.length < hogst) {
      const vid = lag.indexOf(sok, fran);
      if (vid < 0) break;
      const start = Math.max(0, vid - omgivning / 2);
      const slut = Math.min(sida.length, vid + sok.length + omgivning / 2);
      traffar.push({
        sida: i + 1,
        utdrag: `${start > 0 ? '… ' : ''}${sida.slice(start, slut).replace(/\s+/g, ' ').trim()}${slut < sida.length ? ' …' : ''}`,
      });
      fran = vid + sok.length;
    }
    if (traffar.length >= hogst) break;
  }
  return traffar;
}

/**
 * Tar emot en fil som ström och skriver den direkt till disk.
 *
 * Filen passerar aldrig minnet i sin helhet, så storleken begränsas av
 * disken och inte av processen.
 */
export async function strommaDokument(req, { mediatyp, filnamn: originalnamn }) {
  const typ = String(mediatyp || '').split(';')[0].toLowerCase();
  const andelse = TYPER[typ] || (originalnamn || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!andelse || !Object.values(TYPER).includes(andelse))
    throw fel(415, `Filtypen ${typ || 'okänd'} tas inte emot`);

  mkdirSync(DOKUMENTKATALOG, { recursive: true });
  const namn = `${randomBytes(10).toString('hex')}.${andelse}`;
  const sokvag = join(DOKUMENTKATALOG, namn);
  const ut = createWriteStream(sokvag);
  // En ström som förstörs avger ett fel asynkront. Utan lyssnare tar det
  // ned hela processen – och en för stor fil ska inte stänga appen för
  // alla andra. Samma sak om klienten bryter mitt i.
  ut.on('error', () => {});
  req.on('error', () => {});

  const stad = () => {
    ut.destroy();
    rmSync(sokvag, { force: true });
  };

  let storlek = 0;
  try {
    for await (const bit of req) {
      storlek += bit.length;
      if (storlek > MAX) {
        stad();
        throw fel(413, `Filen är större än ${Math.round(MAX / 1e6)} MB`);
      }
      if (!ut.write(bit) && !ut.destroyed) await once(ut, 'drain');
    }
    await new Promise((klar, bryt) => ut.end((f) => (f ? bryt(f) : klar())));
  } catch (e) {
    stad();
    // Bryter klienten eller proxyn mitt i är det inte ett fel i appen.
    if (e?.status) throw e;
    throw fel(400, `Uppladdningen avbröts: ${String(e.message || e).slice(0, 120)}`);
  }
  if (!storlek) {
    rmSync(sokvag, { force: true });
    throw fel(400, 'Tom fil');
  }
  return { filnamn: namn, mediatyp: typ || `application/${andelse}`, storlek };
}
