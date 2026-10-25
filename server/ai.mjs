// AI som administrativ assistent – aldrig som beslutsfattare.
//
// Sömmen är avsiktligt tunn: ett anrop in, ett JSON-objekt ut, och ett
// tydligt null när något inte går. Allt som rör säkerhet, godkännanden och
// mätvärden avgörs av människan som läser förslaget.
//
// Standardmodellen är den som körs på maskinen. Driftjournal och
// incidentrapporter innehåller personuppgifter och uppgifter om olyckor, och
// de ska inte lämna huset bara för att ett moln svarar snabbare.
import { instans } from './foreningar.mjs';

const BAS = () => process.env.HAK_LLM_URL || process.env.LLM_BASE_URL || 'http://127.0.0.1:4000/v1';
const NYCKEL = () => process.env.HAK_LLM_NYCKEL || process.env.LLM_API_KEY || '';

/** Modellen som får se känsliga uppgifter måste köras på maskinen. */
export const LOKAL_MODELL = 'lokal';

export const aiPa = () => !!NYCKEL();

/** Vald modell för föreningen, eller den lokala om inget är satt. */
export const modell = () => instans('ai_modell', LOKAL_MODELL);

/**
 * Är modellen en som kör här? Allt utom de uttryckligen lokala aliasen
 * antas gå vidare till en leverantör.
 */
export const arLokal = (m) => m === LOKAL_MODELL || m.startsWith('lokal');

/**
 * Frågar modellen och kräver JSON tillbaka.
 *
 * `kanslig` tvingar lokal modell: hellre ingen tolkning än en olycksrapport
 * hos en utomstående leverantör.
 *
 * Returnerar alltid ett objekt – `data: null` betyder att människan får
 * fylla i själv, vilket är ett fullgott utfall och inte ett fel i appen.
 */
export async function tolka({ system, text, schema, kanslig = false, tecken = 1200 }) {
  if (!aiPa()) return { data: null, modell: null, fel: 'AI är inte konfigurerad' };
  let vald = modell();
  if (kanslig && !arLokal(vald)) vald = LOKAL_MODELL;

  const instruktion = `${system}\n\nSvara med ett enda JSON-objekt enligt detta schema:\n${JSON.stringify(schema)}\n\nRegler som gäller före allt annat:\n- Hitta aldrig på värden. Saknas uppgiften i texten ska fältet vara null.\n- Påstå aldrig att en kontroll, mätning eller åtgärd är gjord om texten inte säger det.\n- Skilj observation från åtgärd.`;

  const skicka = async (format) => {
    const svar = await fetch(`${BAS()}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${NYCKEL()}` },
      body: JSON.stringify({
        model: vald,
        messages: [
          { role: 'system', content: instruktion },
          { role: 'user', content: text },
        ],
        response_format: format,
        // Flera alias är resonemangsmodeller som avvisar temperature med 400.
        max_completion_tokens: tecken,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const kropp = await svar.text();
    if (!svar.ok) throw new Error(`${svar.status}: ${kropp.slice(0, 300)}`);
    return JSON.parse(kropp);
  };

  try {
    let json;
    try {
      json = await skicka({ type: 'json_schema', json_schema: { name: 'tolkning', schema, strict: false } });
    } catch (e) {
      // DeepSeek och flera lokala modeller stöder bara json_object. Schemat
      // ligger redan i systemprompten, så fallet är ofarligt.
      if (!/response_format|json_schema|not support|unavailable|400/i.test(String(e.message))) throw e;
      json = await skicka({ type: 'json_object' });
    }
    const innehall = json.choices?.[0]?.message?.content;
    if (!innehall) throw new Error('Tomt svar');
    const data = JSON.parse(stadaJson(innehall));
    return { data, modell: vald, fel: null };
  } catch (e) {
    return { data: null, modell: vald, fel: String(e.message || e) };
  }
}

/** Modeller lägger ibland JSON i en kodruta eller skriver en rad före. */
export function stadaJson(s) {
  const t = String(s).trim();
  const utan = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = utan.indexOf('{');
  const slut = utan.lastIndexOf('}');
  return start >= 0 && slut > start ? utan.slice(start, slut + 1) : utan;
}

/** Ute i backen säger man "kanon fyra", inte "kanon 4". */
// "en" är med flit utelämnat: det är oftare en artikel än ett nummer.
const SIFFEROND = {
  noll: 0, ett: 1, tva: 2, 'två': 2, tre: 3, fyra: 4, fem: 5, sex: 6, sju: 7,
  atta: 8, 'åtta': 8, nio: 9, tio: 10, elva: 11, tolv: 12, tretton: 13, fjorton: 14, femton: 15,
};

// \b duger inte: det räknar å, ä och ö som ordgränser, så "två" aldrig
// hade matchat. Lookaround på bokstav eller siffra gör det rätt.
const ORDGRANS = new RegExp(
  `(?<![\\p{L}\\d])(${Object.keys(SIFFEROND).join('|')})(?![\\p{L}\\d])`,
  'gu'
);

export const siffror = (text) =>
  String(text).toLowerCase().replace(ORDGRANS, (ord) => String(SIFFEROND[ord]));

/**
 * Hittar utrustningen som talet syftar på, men bara när det är entydigt.
 * "Kanon 4" ska träffa Snökanon 4; "kanonen" ska inte träffa någonting.
 */
export function matchaUtrustning(namn, lista) {
  if (!namn) return null;
  const n = siffror(String(namn).trim());
  const exakt = lista.filter((u) => u.namn.toLowerCase() === n);
  if (exakt.length === 1) return exakt[0];
  const siffra = n.match(/\d+/)?.[0];
  const traffar = lista.filter((u) => {
    const un = u.namn.toLowerCase();
    if (siffra) {
      // Med siffra i talet måste numret stämma: kanon 4 är inte kanon 14.
      const us = un.match(/\d+/)?.[0];
      if (us !== siffra) return false;
    }
    const ord = n.replace(/\d+/g, '').trim().split(/\s+/).filter((o) => o.length > 2);
    return ord.length > 0 && ord.some((o) => un.includes(o) || o.includes(un.replace(/\d+/g, '').trim()));
  });
  return traffar.length === 1 ? traffar[0] : null;
}

/**
 * Letar efter utrustning direkt i det som sades, när modellen inte plockade
 * ut något. Rena strängar är inte smartare än en språkmodell, men de är
 * förutsägbara – och här är förutsägbart mer värt.
 *
 * Bara entydiga träffar räknas: nämns två kanoner får människan välja.
 */
export function utrustningskandidater(text, lista) {
  if (!text) return [];
  const normaliserad = siffror(text);
  const traffar = new Set();

  // "kanon 4", "lans 12", "fläkt 2" – ord följt av ett nummer.
  for (const [, ord, nummer] of normaliserad.matchAll(/(\p{L}{3,})\s*(\d{1,3})\b/gu)) {
    const t = matchaUtrustning(`${ord} ${nummer}`, lista);
    if (t) traffar.add(t.id);
  }

  // Namn utan nummer, som "teknikliften" eller "pistmaskinen".
  for (const u of lista) {
    const namn = siffror(u.namn);
    if (/\d/.test(namn)) continue;
    const re = new RegExp(`(?<![\\p{L}\\d])${namn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?(?:en|n)?(?![\\p{L}\\d])`, 'u');
    if (re.test(normaliserad)) traffar.add(u.id);
  }

  return [...traffar].map((id) => lista.find((u) => u.id === id));
}

/** Entydig träff eller ingenting. Två nämnda kanoner är en fråga, inte ett svar. */
export function utrustningITal(text, lista) {
  const k = utrustningskandidater(text, lista);
  return k.length === 1 ? k[0] : null;
}
