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
const UNDERHALLSORD =
  /underh[åa]ll|service|sm[öo]rj|byt[ea]?\b|kontroll|inspekt|rengör|rengor|intervall|maintenance|lubricat|replace|inspect/gi;

/** Rubriker som *är* ett underhållsprogram, inte bara nämner underhåll. */
const PROGRAMRUBRIK =
  /maintenance\s+(programme|program|schedule|plan)|service\s+(schedule|plan|intervals?)|underh[åa]llsprogram|underh[åa]llsschema|underh[åa]llsplan|serviceschema|serviceintervall/i;

/** "after 2000 hours", "var 500 timmar", "every 6 months", "efter 10 dagar". */
const INTERVALLUTTRYCK =
  /\b(after|every|var|varje|efter)\s+\d[\d\s.,]*\s*(h\b|hours?|timmar|tim\b|dagar|dag\b|veckor|vecka|m[åa]nader|m[åa]nad|year|år)/gi;

const antal = (text, regel) => (text.match(regel) || []).length;

/**
 * Sidorna som troligast bär underhållsprogrammet.
 *
 * Tidigare togs sidorna *i ordning* tills teckenbudgeten tog slut. På en
 * tjock manual räcker det att introt och säkerhetskapitlet nämner ordet
 * "maintenance" för att hela budgeten ska gå åt där – och själva
 * underhållsprogrammet, som kan ligga på sidan fyrtiotvå, nås aldrig.
 * Det var precis vad som hände med kompressormanualen: sidorna 1, 2 och 4
 * valdes, programmet på sidan 42 missades, och tolkningen hittade noll
 * punkter i ett dokument som har ett komplett schema.
 *
 * Nu poängsätts sidorna först och de bästa får budgeten:
 *
 *   · en rubrik som *är* ett underhållsprogram väger tyngst
 *   · därefter antalet intervalluttryck ("after 2000 hours")
 *   · sist tätheten av underhållsord, som bara skiljer jämna fall åt
 *
 * Urvalet lämnas tillbaka i sidordning, för en modell som läser sidorna
 * huller om buller läser dem sämre.
 */
export function underhallsavsnitt(sidor, { maxTecken = 9000 } = {}) {
  const poangsatta = [];
  for (const [i, text] of sidor.entries()) {
    const ordtraffar = antal(text, UNDERHALLSORD);
    if (!ordtraffar) continue;
    const intervall = antal(text, INTERVALLUTTRYCK);
    const poang =
      (PROGRAMRUBRIK.test(text) ? 100 : 0) +
      Math.min(intervall, 12) * 8 +
      Math.min(ordtraffar, 20);
    poangsatta.push({ sida: i + 1, text: text.slice(0, 3000), poang });
  }
  if (!poangsatta.length) return [];

  // Bäst först, och vid lika poäng den tidigare sidan: innehållsförteckningen
  // och programmet kan båda bära rubriken, och programmet står efter.
  poangsatta.sort((a, b) => b.poang - a.poang || a.sida - b.sida);
  const valda = [];
  let tecken = 0;
  for (const s of poangsatta) {
    if (tecken + s.text.length > maxTecken) continue;
    valda.push(s);
    tecken += s.text.length;
  }
  return valda
    .sort((a, b) => a.sida - b.sida)
    .map(({ sida, text }) => ({ sida, text }));
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

/**
 * Vad olika avsnitt i ett dokument är.
 *
 * En servicemanual är sällan bara en servicemanual: sidorna 34–38 är
 * reservdelslista, 39 är sprängskiss, 41 är elschema. Att veta det gör
 * dokumentet användbart – man kan slå upp rätt sida i stället för att
 * bläddra.
 */
// Ordningen spelar roll: vid lika många träffar på en sida vinner det
// avsnitt som står först, och det ska vara det mer bestämda. En sida med
// rubriken "Serviceintervall" är ett intervallschema, inte allmänt
// underhåll – även om båda orden står där.
export const AVSNITTSSLAG = {
  serviceintervall: {
    namn: 'Serviceintervall',
    monster: [
      /\bserviceintervall\b/i, /\bunderh[åa]llsschema\b/i, /\bserviceschema\b/i,
      /\bservice schedule\b/i,
      /\bvar\s+\d+\s*(?:drifts?)?\s*(?:tim|h\b|dag|vecka|m[åa]nad)/i,
      /\bevery\s+\d+\s*(?:hours|days|weeks|months)\b/i,
    ],
  },
  underhall: {
    namn: 'Underhåll och service',
    monster: [
      /\bunderh[åa]ll\b/i, /\bservice(?:plan|punkt)?\b/i, /\bsm[öo]rj/i,
      /\bmaintenance\b/i, /\blubricat/i,
    ],
  },
  reservdelslista: {
    namn: 'Reservdelslista',
    monster: [
      /\breservdel/i, /\bspare parts?\b/i, /\bparts list\b/i, /\bartikelnummer\b/i,
      /\bart\.?\s*nr\b/i, /\bpart\s*(?:no|number)\b/i, /\bben[äa]mning\b/i,
    ],
  },
  sprangskiss: {
    namn: 'Sprängskiss',
    monster: [
      /\bspr[äa]ngskiss/i, /\bexploded view\b/i, /\bexplosionsritning\b/i,
      /\bdetaljritning\b/i, /\bpos\.?\s*nr\b/i,
    ],
  },
  elschema: {
    namn: 'Elschema',
    monster: [
      /\belschema\b/i, /\bkopplingsschema\b/i, /\bwiring diagram\b/i, /\bcircuit diagram\b/i,
      /\bel\b.{0,12}\bschema\b/i,
    ],
  },
  tekniska_data: {
    namn: 'Tekniska data',
    monster: [
      /\btekniska? data\b/i, /\bspecifikationer?\b/i, /\btechnical data\b/i,
      /\bspecifications?\b/i, /\bm[äa]rkdata\b/i,
    ],
  },
  sakerhet: {
    namn: 'Säkerhet',
    monster: [
      /\bs[äa]kerhetsf[öo]reskrift/i, /\bvarning(?:ar)?\b/i, /\bsafety (?:instructions?|precautions?)\b/i,
      /\bskyddsutrustning\b/i,
    ],
  },
  felsokning: {
    namn: 'Felsökning',
    monster: [/\bfels[öo]kning\b/i, /\btroubleshooting\b/i, /\bfelorsak\b/i, /\batg[äa]rdstabell\b/i],
  },
  installation: {
    namn: 'Installation',
    monster: [/\binstallation\b/i, /\bmontering\b/i, /\bidrifttagning\b/i, /\bcommissioning\b/i],
  },
};

/**
 * Klassar varje sida och slår ihop angränsande sidor av samma sort.
 *
 * Regler och inte modell: rubriker är förutsägbara, och en karta som
 * stämmer varje gång är mer värd än en som är kvick ibland.
 */
export function innehallskarta(sidor) {
  const per = sidor.map((text) => {
    const poang = [];
    for (const [slag, def] of Object.entries(AVSNITTSSLAG)) {
      const traffar = def.monster.filter((m) => m.test(text)).length;
      if (traffar) poang.push({ slag, traffar });
    }
    poang.sort((a, b) => b.traffar - a.traffar);
    return poang[0]?.slag ?? null;
  });

  const avsnitt = [];
  for (const [i, slag] of per.entries()) {
    if (!slag) continue;
    const sista = avsnitt.at(-1);
    if (sista && sista.slag === slag && sista.till === i) sista.till = i + 1;
    else avsnitt.push({ slag, namn: AVSNITTSSLAG[slag].namn, fran: i + 1, till: i + 1 });
  }
  // `till` har räknats som index; gör om till sidnummer.
  return avsnitt.map((a) => ({ ...a, till: Math.max(a.fran, a.till) }));
}

/**
 * Plockar reservdelar ur en reservdelslista.
 *
 * Artikelnumren läses ordagrant ur texten och går aldrig genom en modell.
 * Ett artikelnummer som blivit en siffra fel är värre än inget alls – man
 * beställer fel del och upptäcker det först när paketet kommer.
 */
export function reservdelarUrText(text) {
  const ut = [];
  const sedda = new Set();
  for (const rad of String(text || '').split('\n')) {
    const r = rad.replace(/\s+/g, ' ').trim();
    if (r.length < 6 || r.length > 160) continue;

    // Två vanliga former: numret först eller benämningen först.
    const m =
      /^(?:\d{1,3}[.)]?\s+)?([A-Z0-9][A-Z0-9-]{3,19})\s+([A-Za-zÅÄÖåäö][^|]{2,80}?)(?:\s+\d+\s*(?:st|pcs)?)?$/.exec(r) ||
      /^(?:\d{1,3}[.)]?\s+)?([A-Za-zÅÄÖåäö][^|]{2,80}?)\s+([A-Z0-9][A-Z0-9-]{3,19})(?:\s+\d+\s*(?:st|pcs)?)?$/.exec(r);
    if (!m) continue;

    // Avgör vilket fält som är numret: det med siffror och bindestreck.
    const [a, b] = [m[1].trim(), m[2].trim()];
    const arNummer = (s) => /\d/.test(s) && /^[A-Z0-9-]+$/.test(s) && s.length >= 4;
    const nummer = arNummer(a) ? a : arNummer(b) ? b : null;
    const namn = nummer === a ? b : a;
    if (!nummer || !namn || namn.length < 3) continue;
    // Rena årtal och mått är inte artikelnummer.
    if (/^(19|20)\d{2}$/.test(nummer) || /^\d+(mm|cm|kg|bar|v|w)$/i.test(nummer)) continue;
    if (sedda.has(nummer)) continue;
    sedda.add(nummer);
    ut.push({ artikelnummer: nummer, namn: namn.replace(/[.\s]+$/, '') });
  }
  return ut;
}
