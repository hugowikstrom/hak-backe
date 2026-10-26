// Förebyggande underhåll: serviceplaner, årshjul, manualer och reservdelar.
//
// Två saker styr utformningen. En serviceplan är ett förslag tills en
// människa godkänt den – en modell får läsa manualen, men inte bestämma
// anläggningens underhåll. Och varje punkt som kommit ur ett dokument bär
// med sig var i dokumentet den stod, annars går den inte att lita på.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { minstRoll } from '../behorighet.mjs';
import { tolka } from '../ai.mjs';
import {
  DOKUMENTKATALOG, innehallskarta, lasPdf, reservdelarUrText, sidorUr, sokIText,
  strommaDokument, underhallsavsnitt,
} from '../dokument.mjs';
import {
  arshjul, INTERVALLTYPER, kostnader, lage, nastaForfall, samordna, undvikBelastning,
} from '../underhall.mjs';
import { bool, datum, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';
import { skapaArende } from './arenden.mjs';
import { skapaPost } from './drift.mjs';

const PLANSTATUS = ['forslag', 'godkand', 'vilande', 'avfard'];
const ATGARDSTATUS = ['planerad', 'pagar', 'utford', 'installd'];

const SCHEMA_MANUAL = {
  type: 'object',
  properties: {
    punkter: {
      type: 'array',
      description: 'servicepunkter som faktiskt står i texten',
      items: {
        type: 'object',
        properties: {
          namn: { type: 'string' },
          instruktion: { type: ['string', 'null'] },
          intervalltyp: { type: ['string', 'null'], enum: [...INTERVALLTYPER, null] },
          intervall: { type: ['number', 'null'] },
          kompetens: { type: ['string', 'null'] },
          kritisk: {
            type: ['boolean', 'null'],
            description: 'true om manualen kräver behörig tekniker eller kallar arbetet säkerhetskritiskt',
          },
          sida: { type: ['number', 'null'] },
          citat: { type: ['string', 'null'], description: 'den mening i texten punkten bygger på' },
          osaker: { type: ['boolean', 'null'], description: 'true om intervallet inte går att läsa ut' },
        },
      },
    },
  },
};

// Vad ett helt dokument är. Avsnitten inuti kartläggs för sig – en
// servicemanual har nästan alltid en reservdelslista och en sprängskiss.
const DOKUMENTSLAG = [
  'manual', 'servicemanual', 'reservdelslista', 'sprangskiss', 'elschema', 'ritning',
  'datablad', 'sakerhetsdatablad', 'protokoll', 'intyg', 'garanti', 'ovrigt',
];

export const SLAGNAMN = {
  manual: 'Bruksanvisning',
  servicemanual: 'Servicemanual',
  reservdelslista: 'Reservdelslista',
  sprangskiss: 'Sprängskiss',
  elschema: 'Elschema',
  ritning: 'Ritning',
  datablad: 'Tekniskt datablad',
  sakerhetsdatablad: 'Säkerhetsdatablad',
  protokoll: 'Protokoll',
  intyg: 'Intyg',
  garanti: 'Garanti',
  ovrigt: 'Övrigt',
};

/**
 * Vad dokumentet är enligt innehållskartan, när modellen inte svarar eller
 * är osäker. Dominerar en sorts avsnitt sidorna är det den sortens dokument.
 */
export function slagUrKarta(karta, sidor) {
  if (!karta?.length) return null;

  // Vid lika vikt vinner det mer bestämda avsnittet. Ett dokument med ett
  // underhållsavsnitt är hellre en servicemanual än ett datablad – det
  // säger mer om vad man har i handen.
  const ordning = ['reservdelslista', 'sprangskiss', 'elschema', 'serviceintervall', 'underhall', 'tekniska_data'];
  const till = {
    reservdelslista: 'reservdelslista',
    sprangskiss: 'sprangskiss',
    elschema: 'elschema',
    serviceintervall: 'servicemanual',
    underhall: 'servicemanual',
    tekniska_data: 'datablad',
  };

  const vikt = {};
  for (const a of karta) vikt[a.slag] = (vikt[a.slag] || 0) + (a.till - a.fran + 1);
  const [storst] = Object.entries(vikt)
    .filter(([slag]) => till[slag])
    .sort((a, b) => b[1] - a[1] || ordning.indexOf(a[0]) - ordning.indexOf(b[0]));
  if (!storst) return null;
  // Ett enstaka avsnitt bland många säger inte vad dokumentet är.
  return storst[1] / Math.max(1, sidor) < 0.4 ? null : till[storst[0]];
}

const SCHEMA_DOKUMENT = {
  type: 'object',
  properties: {
    slag: { type: ['string', 'null'], enum: [...DOKUMENTSLAG, null] },
    titel: { type: ['string', 'null'], description: 'kort namn att visa i listan' },
    tillverkare: { type: ['string', 'null'] },
    modell: { type: ['string', 'null'] },
    serienummer: { type: ['string', 'null'], description: 'bara om det står i dokumentet' },
    utgava: { type: ['string', 'null'], description: 'utgåva, revision eller årtal' },
    sprak: { type: ['string', 'null'], description: 'sv, en, de …' },
    utrustningstyp: {
      type: ['string', 'null'],
      enum: ['lans', 'flakt', 'pumpstation', 'kompressor', 'lift', 'band', 'pistmaskin', 'ovrigt', null],
    },
    sammanfattning: { type: ['string', 'null'], description: 'en mening om vad dokumentet är' },
    har_underhall: { type: ['boolean', 'null'], description: 'står det något om service eller underhåll?' },
    leverantor: {
      type: ['object', 'null'],
      description: 'service- eller reservdelskontakt om den står i dokumentet',
      properties: {
        namn: { type: ['string', 'null'] },
        telefon: { type: ['string', 'null'] },
        epost: { type: ['string', 'null'] },
      },
    },
    komponenter: {
      type: 'array',
      description: 'delar maskinen består av, som de står i dokumentet',
      items: {
        type: 'object',
        properties: {
          namn: { type: 'string' },
          slag: { type: ['string', 'null'], enum: ['ventil', 'filter', 'slang', 'el', 'motor', 'ovrigt', null] },
        },
      },
    },
  },
};

const SYSTEM_DOKUMENT = `Du läser början av ett dokument som laddats upp i en skidanläggnings
register och säger vad det är för något.

Du beskriver dokumentet. Du bestämmer ingenting, och du gissar inte.

- slag: vad dokumentet i huvudsak är. servicemanual om det handlar om
  underhåll och service, manual om det är en bruksanvisning,
  reservdelslista om det mest är artikelnummer och benämningar,
  sprangskiss om det är en sprängskiss eller detaljritning, elschema för
  kopplingsscheman, ritning för övriga ritningar, datablad för tekniska
  data, sakerhetsdatablad för kemikalier, protokoll för besiktningar och
  utfört arbete, intyg för certifikat, garanti för garantier, annars
  ovrigt.
- tillverkare är bara företagsnamnet, utan modellbeteckning. modell är
  bara beteckningen, utan företagsnamn. Står de ihop i texten ska de delas.
  Båda fylls bara i när de faktiskt står där.
- utrustningstyp: vilken sorts utrustning dokumentet handlar om, om det går
  att avgöra. Annars null.
- sammanfattning: en mening på svenska om vad det är.
- har_underhall: true bara om texten innehåller service- eller
  underhållsanvisningar.
- komponenter: delarna maskinen består av, om de räknas upp. Hitta inte på
  en standarduppsättning. Artikelnummer behöver du inte återge – de läses
  ordagrant ur texten.
- leverantor: bara om en kontakt för service eller reservdelar står i
  dokumentet.`;

const SYSTEM_MANUAL = `Du läser utdrag ur en servicemanual för utrustning i en skidanläggning och
föreslår servicepunkter som en driftansvarig sedan granskar och godkänner.

Du tolkar dokumentet. Du bestämmer ingenting.

- Ta bara med punkter som faktiskt står i texten. Lägg aldrig till
  underhåll du tror borde finnas.
- Varje punkt ska ha sidnummer och ett citat ur texten. Kan du inte ange var
  det står ska punkten utelämnas.
- Står intervallet otydligt ("regelbundet", "vid behov") sätter du intervall
  till null och osaker till true. Gissa aldrig en siffra.
- Står det att arbetet kräver behörig tekniker ska det stå i kompetens, och
  kritisk sättas till true.`;

/** Planen med nästa förfallodatum uträknat. */
const berika = (plan) => {
  const forfall = nastaForfall(plan, { drifttimmar: plan.drifttimmar ?? null });
  return { ...plan, forfall, nasta: forfall.datum, lage: lage(forfall.datum) };
};

const PLAN_SQL = `
  SELECT p.*, u.namn AS utrustning, u.drifttimmar, k.namn AS komponent,
         d.namn AS dokument, d.filnamn AS dokumentfil,
         m.namn AS godkand_av
    FROM serviceplan p
    LEFT JOIN utrustning u ON u.id=p.utrustning_id
    LEFT JOIN komponent k ON k.id=p.komponent_id
    LEFT JOIN dokument d ON d.id=p.dokument_id
    LEFT JOIN medlem m ON m.id=p.godkand_av_id`;

export const hamtaPlan = (id) => {
  const p = en(`${PLAN_SQL} WHERE p.id=?`, id);
  return p ? berika(p) : null;
};

export const planer = ({ status, utrustning_id } = {}) => {
  const villkor = [];
  const p = [];
  if (status) (villkor.push('p.status=?'), p.push(status));
  if (utrustning_id) (villkor.push('p.utrustning_id=?'), p.push(utrustning_id));
  return alla(`${PLAN_SQL} ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''} ORDER BY u.namn, p.namn`, ...p)
    .map(berika);
};

/**
 * Allt som ska göras: godkända planers nästa förfall plus redan planerade
 * åtgärder. Planerade åtgärder vinner över planens uträkning, för någon har
 * tagit ställning till dem.
 */
export function kommande({ manader = 12 } = {}) {
  const atgarder = alla(
    `SELECT a.*, u.namn AS utrustning, p.kritisk
       FROM serviceatgard a
       LEFT JOIN utrustning u ON u.id=a.utrustning_id
       LEFT JOIN serviceplan p ON p.id=a.serviceplan_id
      WHERE a.status IN ('planerad','pagar') AND a.planerad IS NOT NULL`
  ).map((a) => ({
    slag: 'atgard',
    id: a.id,
    serviceplan_id: a.serviceplan_id,
    namn: a.namn,
    datum: a.planerad,
    utrustning_id: a.utrustning_id,
    utrustning: a.utrustning,
    kritisk: a.kritisk ?? 0,
    status: a.status,
    lage: lage(a.planerad),
  }));
  const planerade = new Set(atgarder.map((a) => a.serviceplan_id).filter(Boolean));
  const ur_plan = planer({ status: 'godkand' })
    .filter((p) => !planerade.has(p.id) && p.nasta)
    .map((p) => ({
      slag: 'plan',
      id: p.id,
      serviceplan_id: p.id,
      namn: p.namn,
      datum: p.nasta,
      utrustning_id: p.utrustning_id,
      utrustning: p.utrustning,
      kritisk: p.kritisk,
      uppskattat: p.forfall.uppskattat,
      lage: p.lage,
    }));
  const poster = [...atgarder, ...ur_plan].sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
  const perioder = alla('SELECT * FROM hogbelastning ORDER BY fran');
  // Förslaget att flytta visas vid sidan av: datumet ändras inte av sig självt.
  const med_krock = poster.map((p) => {
    const f = undvikBelastning(p, perioder);
    return { ...p, forslag_flytt: f.flyttad, krock: f.krock || null };
  });
  return {
    poster: med_krock,
    hjul: arshjul(med_krock, { manader }),
    samordna: samordna(med_krock),
    perioder,
  };
}

const SCHEMA_PROTOKOLL = {
  type: 'object',
  properties: {
    datum: { type: ['string', 'null'], description: 'YYYY-MM-DD, när arbetet utfördes' },
    utford_av: { type: ['string', 'null'], description: 'person eller företag' },
    arbete: { type: ['string', 'null'], description: 'vad som gjordes, kort' },
    resultat: { type: ['string', 'null'], enum: ['godkand', 'anmarkningar', 'underkand', null] },
    giltigt_till: { type: ['string', 'null'], description: 'YYYY-MM-DD om protokollet anger det' },
    anmarkningar: {
      type: 'array',
      description: 'brister som noterats, en post per anmärkning',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          allvarlighet: {
            type: ['string', 'null'],
            enum: ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk', null],
          },
          atgardas_senast: { type: ['string', 'null'], description: 'YYYY-MM-DD om det står' },
        },
      },
    },
  },
};

const SYSTEM_PROTOKOLL = `Du läser ett protokoll från en besiktning eller ett utfört arbete i en
skidanläggning och plockar ut det som behöver följas upp.

Du refererar dokumentet. Du bedömer ingenting.

- Datum i formen YYYY-MM-DD. Står det inget datum, lämna null – gissa aldrig.
- anmarkningar: bara de brister som faktiskt står i protokollet, en post
  per anmärkning, med protokollets egen formulering.
- allvarlighet sätts bara när protokollet självt säger något om det, till
  exempel att något måste åtgärdas före drift. Annars null.
- Är protokollet utan anmärkningar ska listan vara tom.`;

const SCHEMA_INTYG = {
  type: 'object',
  properties: {
    avser: { type: ['string', 'null'], description: 'vad intyget gäller' },
    utfardare: { type: ['string', 'null'] },
    utfardat: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    giltigt_till: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    villkor: { type: ['string', 'null'], description: 'villkor som anges, kort' },
  },
};

const SYSTEM_INTYG = `Du läser ett intyg eller certifikat och plockar ut vad det gäller, vem som
utfärdat det och hur länge det gäller. Datum i formen YYYY-MM-DD. Står ett
datum inte i texten ska fältet vara null – gissa aldrig ett giltighetsdatum.`;

/** Datum i rätt form, annars null. Modellen får inte hitta på ett. */
const kanskedatum = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

/**
 * Vad dokumentet är, enligt en läsning av de första sidorna.
 *
 * Svaret är ett förslag som fyller i formuläret åt den som laddar upp – inte
 * en sanning. Allt går att rätta i efterhand, och tolkningen sparas rå så
 * att det syns vad modellen faktiskt sa.
 */
async function klassificera(text) {
  if (!text) return { data: null, modell: null, fel: 'Ingen text att läsa' };
  // Början räcker: titelsidan och innehållsförteckningen säger vad det är.
  return tolka({
    system: SYSTEM_DOKUMENT,
    text: sidorUr(text).slice(0, 3).join('\n\n').slice(0, 4000),
    schema: SCHEMA_DOKUMENT,
    tecken: 900,
  });
}

/**
 * Hittar utrustningen dokumentet handlar om, men bara när det är entydigt.
 * Modell går före tillverkare: "LT10" pekar ut en maskin, "Lenko" tio.
 */
export function matchaDokument({ tillverkare, modell, utrustningstyp }, lista) {
  const lik = (a, b) => a && b && String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
  const steg = [
    (u) => lik(u.modell, modell) && lik(u.tillverkare, tillverkare),
    (u) => lik(u.modell, modell),
    (u) => lik(u.tillverkare, tillverkare) && (!utrustningstyp || u.typ === utrustningstyp),
  ];
  for (const prov of steg) {
    const traffar = lista.filter(prov);
    if (traffar.length === 1) return traffar[0];
    // Tio kanoner av samma modell är inte otydligt – manualen gäller dem
    // alla. Men den kan bara hängas på en, så den hängs inte på någon.
    if (traffar.length > 1) return { flera: traffar };
  }
  return null;
}

/**
 * Plockar ut det som är relevant för just den här sortens dokument.
 *
 * En manual innehåller serviceintervall, ett protokoll innehåller utfört
 * arbete och anmärkningar, ett intyg innehåller ett sista giltighetsdatum.
 * Att läsa alla tre likadant vore att missa två av dem.
 */
export async function utvinn(dokument) {
  // Budgeten är satt efter det minsta kontextfönstret vi kan räkna med.
  // Räcker den inte halverar tolka() texten och försöker igen.
  const text = sidorUr(dokument.text).slice(0, 6).join('\n\n').slice(0, 5000);

  if (dokument.slag === 'protokoll') {
    const r = await tolka({ system: SYSTEM_PROTOKOLL, text, schema: SCHEMA_PROTOKOLL, tecken: 1500 });
    if (!r.data) return { slag: 'protokoll', fel: r.fel, data: null };
    const d = r.data;
    return {
      slag: 'protokoll',
      fel: null,
      data: {
        datum: kanskedatum(d.datum),
        utford_av: txt(d.utford_av, 120),
        arbete: txt(d.arbete, 200),
        resultat: ettAv(d.resultat, ['godkand', 'anmarkningar', 'underkand'], 'Resultat'),
        giltigt_till: kanskedatum(d.giltigt_till),
        anmarkningar: (d.anmarkningar || [])
          .filter((a) => a?.text)
          .slice(0, 20)
          .map((a) => ({
            text: txt(a.text, 400),
            allvarlighet:
              ettAv(a.allvarlighet, ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk'], 'Allvarlighet') ||
              'begransar',
            atgardas_senast: kanskedatum(a.atgardas_senast),
          })),
        // Serviceplaner som protokollet kan tänkas kvittera.
        planer: dokument.utrustning_id
          ? alla(
              `SELECT id, namn, intervalltyp, senast_utford FROM serviceplan
                WHERE utrustning_id=? AND status='godkand'`,
              dokument.utrustning_id
            )
          : [],
      },
    };
  }

  if (dokument.slag === 'intyg') {
    const r = await tolka({ system: SYSTEM_INTYG, text, schema: SCHEMA_INTYG, tecken: 800 });
    if (!r.data) return { slag: 'intyg', fel: r.fel, data: null };
    return {
      slag: 'intyg',
      fel: null,
      data: {
        avser: txt(r.data.avser, 200),
        utfardare: txt(r.data.utfardare, 120),
        utfardat: kanskedatum(r.data.utfardat),
        giltigt_till: kanskedatum(r.data.giltigt_till),
        villkor: txt(r.data.villkor, 400),
      },
    };
  }

  // Ritningar och övrigt har ingen uppföljning att plocka ut – där räcker
  // klassificeringen och att dokumentet går att söka i.
  return { slag: dokument.slag, fel: null, data: null };
}

/**
 * Läser ut servicepunkter ur ett dokument och sparar dem som förslag.
 *
 * Punkterna gäller ingenting förrän en människa godkänt dem, och en punkt
 * som inte går att slå upp i dokumentet sparas inte alls.
 */
export async function lasServicepunkter(dokument, medlem) {
  const avsnitt = underhallsavsnitt(sidorUr(dokument.text));
  if (!avsnitt.length) return { punkter: [], avsnitt: [], fel: null, modell: null };

  const r = await tolka({
    system: SYSTEM_MANUAL,
    text: avsnitt.map((a) => `--- Sida ${a.sida} ---\n${a.text}`).join('\n\n'),
    schema: SCHEMA_MANUAL,
    tecken: 3000,
  });
  if (!r.data) return { punkter: [], avsnitt: avsnitt.map((a) => a.sida), fel: r.fel, modell: r.modell };

  const skapade = [];
  for (const p of r.data.punkter || []) {
    if (!p?.namn) continue;
    // Utan källa är punkten inte spårbar, och då ska den inte sparas.
    if (!p.sida && !p.citat) continue;
    // Samma punkt två gånger ur samma dokument hjälper ingen.
    if (en('SELECT id FROM serviceplan WHERE dokument_id=? AND namn=?', dokument.id, txt(p.namn, 160)))
      continue;
    const id = spara('serviceplan', {
      utrustning_id: dokument.utrustning_id,
      namn: txt(p.namn, 160),
      instruktion: txt(p.instruktion),
      intervalltyp: ettAv(p.intervalltyp, INTERVALLTYPER, 'Intervalltyp') || 'handelse',
      intervall: typeof p.intervall === 'number' ? p.intervall : null,
      kompetens: txt(p.kompetens, 120),
      // Kräver manualen behörig tekniker är arbetet inget att skjuta på
      // för att backen har fullt.
      kritisk: p.kritisk ? 1 : 0,
      dokument_id: dokument.id,
      kallsida: p.sida ? `s. ${p.sida}` : null,
      kallcitat: txt(p.citat, 2000),
      osaker: p.osaker || typeof p.intervall !== 'number' ? 1 : 0,
      status: 'forslag',
      av_id: medlem?.id ?? null,
    });
    skapade.push(hamtaPlan(id));
  }
  return { punkter: skapade, avsnitt: avsnitt.map((a) => a.sida), fel: null, modell: r.modell };
}

/**
 * Reservdelar ur dokumentets egna reservdelsavsnitt, lästa ordagrant.
 * Hittas inget avsnitt gås hela texten igenom – en lista kan sakna rubrik.
 */
export function delarUrDokument(dokument) {
  const sidor = sidorUr(dokument.text);
  const karta = dokument.innehall ? JSON.parse(dokument.innehall) : innehallskarta(sidor);
  const avsnitt = karta.filter((a) => a.slag === 'reservdelslista' || a.slag === 'sprangskiss');
  const text = avsnitt.length
    ? avsnitt.map((a) => sidor.slice(a.fran - 1, a.till).join('\n')).join('\n')
    : sidor.join('\n');
  return reservdelarUrText(text);
}

const dokumentrad = (id) =>
  en(
    `SELECT d.id, d.namn, d.slag, d.filnamn, d.sidor, d.version, d.uppladdad,
            d.sammanfattning, d.utrustning_id, d.avser_datum, d.giltigt_till, d.innehall,
            u.namn AS utrustning
       FROM dokument d LEFT JOIN utrustning u ON u.id=d.utrustning_id
      WHERE d.id=?`,
    id
  );

export const rutter = [
  // ---------- Serviceplaner ----------
  rutt('GET', '/api/underhall/planer', '@anlaggning', ({ res, fraga }) =>
    svar(res, 200, {
      planer: planer({ status: fraga.get('status'), utrustning_id: heltal(fraga.get('utrustning')) }),
      intervalltyper: INTERVALLTYPER,
      statusar: PLANSTATUS,
    })
  ),

  rutt('POST', '/api/underhall/planer', '@anlaggning', ({ res, kropp, medlem }) => {
    const id = spara('serviceplan', {
      utrustning_id: heltal(kropp.utrustning_id),
      komponent_id: heltal(kropp.komponent_id),
      namn: kravTxt(kropp.namn, 'Namn', 160),
      instruktion: txt(kropp.instruktion),
      intervalltyp: ettAv(kropp.intervalltyp, INTERVALLTYPER, 'Intervalltyp') || 'dagar',
      intervall: num(kropp.intervall),
      manad: heltal(kropp.manad),
      kompetens: txt(kropp.kompetens, 120),
      kritisk: bool(kropp.kritisk) ?? 0,
      dokument_id: heltal(kropp.dokument_id),
      kallsida: txt(kropp.kallsida, 40),
      kallcitat: txt(kropp.kallcitat, 2000),
      osaker: bool(kropp.osaker) ?? 0,
      // Den som skriver in planen för hand står för den själv.
      status: 'godkand',
      godkand_av_id: medlem.id,
      godkand_tid: nu(),
      senast_utford: datum(kropp.senast_utford, 'Senast utförd'),
      senast_timmar: num(kropp.senast_timmar),
      av_id: medlem.id,
    });
    svar(res, 201, { plan: hamtaPlan(id) });
  }),

  rutt('PATCH', '/api/underhall/planer/:id', '@anlaggning', ({ res, param, kropp }) => {
    if (!en('SELECT id FROM serviceplan WHERE id=?', param.id)) throw fel(404, 'Planen finns inte');
    uppdatera('serviceplan', param.id, {
      namn: kropp.namn === undefined ? undefined : kravTxt(kropp.namn, 'Namn', 160),
      instruktion: txt(kropp.instruktion),
      intervalltyp: ettAv(kropp.intervalltyp, INTERVALLTYPER, 'Intervalltyp'),
      intervall: num(kropp.intervall),
      manad: heltal(kropp.manad),
      kompetens: txt(kropp.kompetens, 120),
      kritisk: bool(kropp.kritisk),
      komponent_id: heltal(kropp.komponent_id),
      osaker: bool(kropp.osaker),
      senast_utford: datum(kropp.senast_utford, 'Senast utförd'),
      senast_timmar: num(kropp.senast_timmar),
    });
    svar(res, 200, { plan: hamtaPlan(param.id) });
  }),

  /**
   * Godkännande. Ett förslag ur en manual blir serviceplan först här, och
   * bara av någon som får ta det ansvaret.
   */
  rutt('POST', '/api/underhall/planer/:id/godkann', '@anlaggning', ({ res, param, kropp, medlem }) => {
    const p = en('SELECT * FROM serviceplan WHERE id=?', param.id);
    if (!p) throw fel(404, 'Planen finns inte');
    const beslut = ettAv(kropp.beslut, ['godkand', 'avfard', 'vilande'], 'Beslut') || 'godkand';
    if (beslut === 'godkand' && !minstRoll(medlem, 'backansvarig'))
      throw fel(403, 'Bara backansvarig eller högre godkänner serviceplaner');
    // Ett osäkert intervall måste få ett värde innan planen börjar gälla,
    // annars står det "regelbundet" i ett system som räknar dagar.
    if (beslut === 'godkand' && p.osaker && !num(kropp.intervall) && !p.intervall)
      throw fel(400, 'Intervallet är osäkert i manualen – ange det innan planen godkänns');
    uppdatera('serviceplan', p.id, {
      status: beslut,
      intervall: num(kropp.intervall) ?? undefined,
      intervalltyp: ettAv(kropp.intervalltyp, INTERVALLTYPER, 'Intervalltyp'),
      manad: heltal(kropp.manad),
      osaker: num(kropp.intervall) ? 0 : undefined,
      godkand_av_id: medlem.id,
      godkand_tid: nu(),
    });
    svar(res, 200, { plan: hamtaPlan(p.id) });
  }),

  // ---------- Årshjul och planering ----------
  rutt('GET', '/api/underhall/arshjul', '@anlaggning', ({ res, fraga }) =>
    svar(res, 200, kommande({ manader: heltal(fraga.get('manader'), 12) }))
  ),

  rutt('GET', '/api/underhall/atgarder', '@anlaggning', ({ res, fraga }) =>
    svar(res, 200, {
      atgarder: alla(
        `SELECT a.*, u.namn AS utrustning, k.namn AS komponent, p.namn AS plan,
                m.namn AS utford_av,
                (SELECT coalesce(sum(t.antal * coalesce(t.pris_ore,0)),0)
                   FROM reservdelsuttag t WHERE t.serviceatgard_id=a.id AND t.antal>0) AS delar_ore
           FROM serviceatgard a
           LEFT JOIN utrustning u ON u.id=a.utrustning_id
           LEFT JOIN komponent k ON k.id=a.komponent_id
           LEFT JOIN serviceplan p ON p.id=a.serviceplan_id
           LEFT JOIN medlem m ON m.id=a.utford_av_id
          ${fraga.get('status') ? 'WHERE a.status=?' : ''}
          ORDER BY coalesce(a.utford, a.planerad) DESC LIMIT 300`,
        ...(fraga.get('status') ? [fraga.get('status')] : [])
      ),
    })
  ),

  rutt('POST', '/api/underhall/atgarder', '@anlaggning', ({ res, kropp, medlem }) => {
    const plan = kropp.serviceplan_id ? hamtaPlan(heltal(kropp.serviceplan_id)) : null;
    const id = spara('serviceatgard', {
      serviceplan_id: plan?.id ?? null,
      utrustning_id: heltal(kropp.utrustning_id) ?? plan?.utrustning_id ?? null,
      komponent_id: heltal(kropp.komponent_id) ?? plan?.komponent_id ?? null,
      namn: kravTxt(kropp.namn || plan?.namn, 'Namn', 160),
      planerad: datum(kropp.planerad, 'Planerad') || plan?.nasta || null,
      anteckning: txt(kropp.anteckning),
      av_id: medlem.id,
    });
    svar(res, 201, { atgard: en('SELECT * FROM serviceatgard WHERE id=?', id) });
  }),

  /** Utförd service: planen flyttas fram och arbetet hamnar i journalen. */
  rutt('POST', '/api/underhall/atgarder/:id/utford', '@anlaggning', ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM serviceatgard WHERE id=?', param.id);
    if (!a) throw fel(404, 'Åtgärden finns inte');
    if (a.status === 'utford') throw fel(409, 'Åtgärden är redan utförd');
    return transaktion(() => {
      const utford = datum(kropp.utford, 'Utförd') || idag();
      uppdatera('serviceatgard', a.id, {
        status: 'utford',
        utford,
        utford_av_id: medlem.id,
        arbetstimmar: num(kropp.arbetstimmar),
        kostnad_ore: heltal(kropp.kostnad_ore, 0),
        anteckning: txt(kropp.anteckning) ?? undefined,
      });
      if (a.serviceplan_id)
        uppdatera('serviceplan', a.serviceplan_id, {
          senast_utford: utford,
          senast_timmar: num(kropp.drifttimmar) ?? undefined,
        });
      // Ny drifttimmaravläsning hör hemma på utrustningen.
      if (num(kropp.drifttimmar) != null && a.utrustning_id)
        uppdatera('utrustning', a.utrustning_id, { drifttimmar: num(kropp.drifttimmar) });
      skapaPost(
        {
          tid: `${utford} 12:00`,
          slag: 'atgard',
          utrustning_id: a.utrustning_id,
          komponent_id: a.komponent_id,
          text: `Service utförd: ${a.namn}${txt(kropp.anteckning) ? ` – ${txt(kropp.anteckning)}` : ''}`,
        },
        medlem
      );
      svar(res, 200, { atgard: en('SELECT * FROM serviceatgard WHERE id=?', a.id) });
    });
  }),

  rutt('POST', '/api/underhall/atgarder/:id/installd', '@anlaggning', ({ res, param, kropp }) => {
    const a = en('SELECT a.*, p.kritisk FROM serviceatgard a LEFT JOIN serviceplan p ON p.id=a.serviceplan_id WHERE a.id=?', param.id);
    if (!a) throw fel(404, 'Åtgärden finns inte');
    const skal = txt(kropp.anteckning);
    // Att ställa in kritiskt underhåll ska kosta ett resonemang.
    if (a.kritisk && !skal) throw fel(400, 'Motivera varför det kritiska underhållet ställs in');
    uppdatera('serviceatgard', a.id, { status: 'installd', anteckning: skal });
    svar(res, 200, { atgard: en('SELECT * FROM serviceatgard WHERE id=?', a.id) });
  }),

  // ---------- Högbelastningsperioder ----------
  rutt('GET', '/api/underhall/perioder', '@anlaggning', ({ res }) =>
    svar(res, 200, { perioder: alla('SELECT * FROM hogbelastning ORDER BY fran') })
  ),

  rutt('POST', '/api/underhall/perioder', '@anlaggning', ({ res, kropp }) => {
    const fran = datum(kropp.fran, 'Från');
    const till = datum(kropp.till, 'Till');
    if (!fran || !till) throw fel(400, 'Ange både från och till');
    if (till < fran) throw fel(400, 'Perioden slutar innan den börjar');
    const id = spara('hogbelastning', {
      namn: kravTxt(kropp.namn, 'Namn', 120),
      fran,
      till,
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 201, { period: en('SELECT * FROM hogbelastning WHERE id=?', id) });
  }),

  rutt('DELETE', '/api/underhall/perioder/:id', '@anlaggning', ({ res, param }) => {
    kor('DELETE FROM hogbelastning WHERE id=?', param.id);
    svar(res, 200, { borttagen: Number(param.id) });
  }),

  // ---------- Dokument och manualtolkning ----------
  rutt('GET', '/api/underhall/dokument', '@anlaggning', ({ res, fraga }) =>
    svar(res, 200, {
      dokument: alla(
        `SELECT d.id, d.utrustning_id, d.namn, d.slag, d.filnamn, d.mediatyp, d.storlek, d.sidor,
                d.version, d.aktuell, d.uppladdad, d.sammanfattning, d.ai_modell, d.innehall,
                u.namn AS utrustning, m.namn AS av,
                (SELECT count(*) FROM serviceplan p WHERE p.dokument_id=d.id) AS punkter
           FROM dokument d
           LEFT JOIN utrustning u ON u.id=d.utrustning_id
           LEFT JOIN medlem m ON m.id=d.av_id
          ${fraga.get('utrustning') ? 'WHERE d.utrustning_id=?' : ''}
          ORDER BY d.uppladdad DESC`,
        ...(fraga.get('utrustning') ? [heltal(fraga.get('utrustning'))] : [])
      ),
    })
  ),

  /** Sök i manualerna. Träffen pekar ut sida, inte bara dokument. */
  rutt('GET', '/api/underhall/dokument/sok', '@anlaggning', ({ res, fraga }) => {
    const q = txt(fraga.get('q'), 120);
    if (!q || q.length < 2) throw fel(400, 'Skriv minst två tecken');
    const traffar = [];
    for (const d of alla(
      `SELECT d.id, d.namn, d.sidor, d.version, d.aktuell, u.namn AS utrustning, d.text
         FROM dokument d LEFT JOIN utrustning u ON u.id=d.utrustning_id
        WHERE d.text IS NOT NULL ORDER BY d.aktuell DESC, d.uppladdad DESC`
    )) {
      const i_texten = sokIText(d.text, q);
      const i_namnet = d.namn.toLowerCase().includes(q.toLowerCase());
      if (!i_texten.length && !i_namnet) continue;
      traffar.push({
        id: d.id, namn: d.namn, utrustning: d.utrustning, sidor: d.sidor,
        version: d.version, aktuell: d.aktuell, i_namnet, stallen: i_texten,
      });
    }
    svar(res, 200, { fraga: q, traffar });
  }),

  /**
   * Steg 1: ta emot filen och läs ut texten.
   *
   * Tolkningen ligger i ett eget steg med flit. Den tar tio sekunder och
   * ska inte hålla filen gisslan – och den som laddar upp ska kunna se
   * vad som pågår i stället för att stirra på en snurra.
   */
  rutt(
    'POST',
    '/api/underhall/dokument',
    '@anlaggning',
    async ({ req, res, fraga, medlem }) => {
    // Filen strömmas rakt till disk. Uppgifterna om den kommer i
    // frågesträngen, så att ingenting stort behöver passera minnet.
    const { filnamn, mediatyp, storlek } = await strommaDokument(req, {
      mediatyp: req.headers['content-type'],
      filnamn: fraga.get('filnamn'),
    });
    let sidor = null;
    let text = null;
    let lasfel = null;
    if (mediatyp === 'application/pdf') {
      const r = await lasPdf(filnamn);
      sidor = r.sidor.length || null;
      text = r.text;
      lasfel = r.fel;
    } else if (mediatyp === 'text/plain') {
      text = readFileSync(join(DOKUMENTKATALOG, filnamn), 'utf8');
      sidor = 1;
    }

    // En ny version ersätter den gamla, men raderar den aldrig: en godkänd
    // checklista ska gå att följa tillbaka till sin manual.
    const ersatter = heltal(fraga.get('ersatter_id'));
    const gammal = ersatter ? en('SELECT * FROM dokument WHERE id=?', ersatter) : null;
    if (gammal) uppdatera('dokument', gammal.id, { aktuell: 0 });

    // Innehållskartan är regler, inte modell, och kan göras direkt.
    const karta = text ? innehallskarta(sidorUr(text)) : [];

    const id = spara('dokument', {
      utrustning_id: heltal(fraga.get('utrustning_id')) ?? gammal?.utrustning_id ?? null,
      innehall: karta.length ? JSON.stringify(karta) : null,
      namn:
        txt(fraga.get('namn'), 160) ||
        (fraga.get('filnamn') || filnamn).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim(),
      slag:
        ettAv(fraga.get('slag'), DOKUMENTSLAG, 'Slag') ||
        slagUrKarta(karta, sidor || 1) ||
        'manual',
      filnamn,
      mediatyp,
      storlek,
      sidor,
      text,
      version: (gammal?.version ?? 0) + 1,
      ersatter_id: gammal?.id ?? null,
      av_id: medlem.id,
    });

    svar(res, 201, {
      dokument: dokumentrad(id),
      las_fel: lasfel,
      innehall: karta,
      // Går texten att läsa är nästa steg att tolka den.
      kan_tolkas: !!text,
      namngivet: !!txt(fraga.get('namn'), 160),
      storlek,
      granska_om: gammal
        ? alla('SELECT id, namn FROM serviceplan WHERE dokument_id=? AND status=?', gammal.id, 'godkand')
        : [],
    });
    },
    // Strömmas, inte JSON: en manual kan vara hundratals megabyte.
    { ravkropp: true }
  ),

  /**
   * Steg 2: läs vad dokumentet är och fyll i det som går.
   *
   * Namnet skrivs bara över om ingen skrivit ett eget, och uppgifter på
   * maskinen fylls bara i där de saknas. Det som någon skrivit rörs inte.
   */
  rutt('POST', '/api/underhall/dokument/:id/analysera', '@anlaggning', async ({ res, param, kropp }) => {
    const d = en('SELECT * FROM dokument WHERE id=?', param.id);
    if (!d) throw fel(404, 'Dokumentet finns inte');
    if (!d.text) throw fel(409, 'Ingen text kunde läsas ur dokumentet');

    const r = await klassificera(d.text);
    const t = r.data || {};

    // Det som läses med regler – innehållskartan och artikelnumren –
    // behöver ingen modell och ska finnas även när den är nere.
    const utanModell = {
      innehall: d.innehall ? JSON.parse(d.innehall) : innehallskarta(sidorUr(d.text)),
      reservdelar: delarUrDokument(d).filter(
        (x) =>
          !alla('SELECT artikelnummer FROM reservdel WHERE artikelnummer IS NOT NULL')
            .map((y) => y.artikelnummer.toLowerCase())
            .includes(x.artikelnummer.toLowerCase())
      ),
    };

    if (!r.data)
      return svar(res, 200, {
        dokument: dokumentrad(d.id),
        tolkning: null,
        fel: r.fel,
        innehall: utanModell.innehall,
        // Reservdelarna står kvar: de lästes ordagrant ur texten.
        forslag: {
          utrustning_id: d.utrustning_id,
          komponenter: [],
          reservdelar: utanModell.reservdelar.slice(0, 60),
          leverantor: null,
        },
      });

    const traff = t.tillverkare || t.modell
      ? matchaDokument(t, alla('SELECT id, namn, typ, tillverkare, modell FROM utrustning WHERE aktiv=1'))
      : null;
    const foreslagen = traff?.flera ? null : traff;

    uppdatera('dokument', d.id, {
      namn: kropp.behall_namn || !t.titel ? undefined : txt(t.titel, 160),
      slag: ettAv(t.slag, DOKUMENTSLAG, 'Slag') ?? undefined,
      sammanfattning: txt(t.sammanfattning, 400),
      utrustning_id: d.utrustning_id ?? foreslagen?.id ?? undefined,
      tolkning: JSON.stringify(t),
      ai_modell: r.modell,
      tolkad_tid: nu(),
    });

    // Uppgifter som bara stod i manualen fylls i – men bara i tomma fält.
    const maskin_id = d.utrustning_id ?? foreslagen?.id ?? null;
    const fyllda = [];
    if (maskin_id) {
      const u = en('SELECT * FROM utrustning WHERE id=?', maskin_id);
      const nytt = {};
      if (!u.tillverkare && t.tillverkare) nytt.tillverkare = txt(t.tillverkare, 80);
      if (!u.modell && t.modell) nytt.modell = txt(t.modell, 80);
      if (!u.serienummer && t.serienummer) nytt.serienummer = txt(t.serienummer, 80);
      if (Object.keys(nytt).length) {
        uppdatera('utrustning', u.id, nytt);
        fyllda.push(...Object.keys(nytt));
      }
    }

    // Komponenter, reservdelar och leverantör föreslås men läggs inte in
    // av sig själva: registret ska spegla backen, inte en manual.
    const befintliga = maskin_id
      ? alla('SELECT namn FROM komponent WHERE utrustning_id=?', maskin_id).map((k) => k.namn.toLowerCase())
      : [];
    const artiklar = alla('SELECT artikelnummer FROM reservdel WHERE artikelnummer IS NOT NULL')
      .map((x) => x.artikelnummer.toLowerCase());

    // Det som är relevant för just den här sortens dokument.
    const uppdaterad = en('SELECT * FROM dokument WHERE id=?', d.id);
    const utvunnet = uppdaterad.text ? await utvinn(uppdaterad) : { slag: uppdaterad.slag, data: null };
    if (utvunnet.data?.datum || utvunnet.data?.utfardat || utvunnet.data?.giltigt_till)
      uppdatera('dokument', d.id, {
        avser_datum: utvunnet.data.datum ?? utvunnet.data.utfardat ?? undefined,
        giltigt_till: utvunnet.data.giltigt_till ?? undefined,
      });

    svar(res, 200, {
      dokument: dokumentrad(d.id),
      tolkning: t,
      modell: r.modell,
      fel: null,
      // Vad som gick att plocka ut, och vad det innebär att göra.
      utvinning: utvunnet,
      foreslagen_utrustning: foreslagen ? { id: foreslagen.id, namn: foreslagen.namn } : null,
      galler_flera: traff?.flera?.map((u) => ({ id: u.id, namn: u.namn })) || null,
      ifyllt: fyllda,
      forslag: {
        utrustning_id: maskin_id,
        komponenter: (t.komponenter || [])
          .filter((k) => k?.namn && !befintliga.includes(String(k.namn).toLowerCase()))
          .slice(0, 20)
          .map((k) => ({ namn: txt(k.namn, 120), slag: txt(k.slag, 40) })),
        // Artikelnumren läses ordagrant ur reservdelsavsnitten. Ett nummer
        // som blivit en siffra fel ger fel del i lådan, och det märks
        // först när paketet kommer.
        reservdelar: utanModell.reservdelar.slice(0, 60),
        leverantor:
          t.leverantor?.namn && !en('SELECT id FROM leverantor WHERE lower(namn)=lower(?)', t.leverantor.namn)
            ? {
                namn: txt(t.leverantor.namn, 120),
                telefon: txt(t.leverantor.telefon, 40),
                epost: txt(t.leverantor.epost, 160),
              }
            : null,
      },
      innehall: utanModell.innehall,
      // Servicepunkter läses ur manualer och servicemanualer, och bara när
      // det faktiskt står något om underhåll.
      har_underhall:
        ['manual', 'servicemanual'].includes(uppdaterad.slag) && t.har_underhall !== false,
    });
  }),

  /**
   * Lägg in det som föreslogs ur dokumentet: komponenter, reservdelar och
   * leverantör. Ett eget steg, för registret ska spegla backen och inte en
   * manual – någon ska ha tittat på listan först.
   */
  rutt('POST', '/api/underhall/dokument/:id/forslag', '@anlaggning', ({ res, param, kropp, medlem }) => {
    kropp.medlem = medlem;
    const d = en('SELECT * FROM dokument WHERE id=?', param.id);
    if (!d) throw fel(404, 'Dokumentet finns inte');
    return transaktion(() => {
      let leverantor_id = heltal(kropp.leverantor_id);
      if (kropp.leverantor?.namn) {
        const fanns = en('SELECT id FROM leverantor WHERE lower(namn)=lower(?)', kropp.leverantor.namn);
        leverantor_id =
          fanns?.id ??
          spara('leverantor', {
            namn: kravTxt(kropp.leverantor.namn, 'Namn', 120),
            telefon: txt(kropp.leverantor.telefon, 40),
            epost: txt(kropp.leverantor.epost, 160),
            anteckning: `Ur ${d.namn}`,
          });
      }

      const utrustning_id = heltal(kropp.utrustning_id) ?? d.utrustning_id;
      const komponenter = [];
      for (const k of kropp.komponenter || []) {
        if (!k?.namn || !utrustning_id) continue;
        if (en('SELECT id FROM komponent WHERE utrustning_id=? AND lower(namn)=lower(?)', utrustning_id, k.namn))
          continue;
        komponenter.push(
          spara('komponent', {
            utrustning_id,
            namn: kravTxt(k.namn, 'Namn', 120),
            slag: txt(k.slag, 40),
            leverantor_id,
            ordning: komponenter.length,
          })
        );
      }

      const reservdelar = [];
      for (const r of kropp.reservdelar || []) {
        if (!r?.namn) continue;
        if (r.artikelnummer && en('SELECT id FROM reservdel WHERE lower(artikelnummer)=lower(?)', r.artikelnummer))
          continue;
        const id = spara('reservdel', {
          namn: kravTxt(r.namn, 'Namn', 160),
          artikelnummer: txt(r.artikelnummer, 60),
          leverantor_id,
          anteckning: `Ur ${d.namn}`,
        });
        if (utrustning_id) spara('reservdelspassning', { reservdel_id: id, utrustning_id });
        reservdelar.push(id);
      }

      // Anmärkningar ur ett protokoll blir ärenden – men bara de som
      // användaren kryssat i. Protokollet självt blir källan.
      const arenden = [];
      for (const a of kropp.anmarkningar || []) {
        if (!a?.text) continue;
        arenden.push(
          skapaArende(
            {
              titel: txt(a.text, 160),
              beskrivning: `Anmärkning i ${d.namn}${a.atgardas_senast ? `, ska åtgärdas senast ${a.atgardas_senast}` : ''}.`,
              typ: 'brist',
              allvarlighet:
                ettAv(a.allvarlighet, ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk'], 'Allvarlighet') ||
                'begransar',
              prioritet: a.allvarlighet === 'sakerhetsrisk' ? 1 : 2,
              utrustning_id,
              deadline: datum(a.atgardas_senast, 'Åtgärdas senast'),
            },
            kropp.medlem
          ).id
        );
      }

      // Ett protokoll visar att arbetet är gjort. Planen flyttas fram till
      // protokollets datum, inte till i dag.
      const kvitterade = [];
      for (const id of kropp.markera_utford || []) {
        const plan = en('SELECT * FROM serviceplan WHERE id=?', heltal(id));
        if (!plan || !kanskedatum(kropp.utford_datum)) continue;
        uppdatera('serviceplan', plan.id, { senast_utford: kropp.utford_datum });
        spara('serviceatgard', {
          serviceplan_id: plan.id,
          utrustning_id: plan.utrustning_id,
          namn: plan.namn,
          planerad: kropp.utford_datum,
          utford: kropp.utford_datum,
          status: 'utford',
          anteckning: `Enligt ${d.namn}`,
        });
        kvitterade.push(plan.id);
      }

      svar(res, 201, {
        komponenter: komponenter.length,
        reservdelar: reservdelar.length,
        leverantor_id: leverantor_id ?? null,
        arenden: arenden.length,
        kvitterade: kvitterade.length,
      });
    });
  }),

  rutt('GET', '/api/underhall/dokument/:id/fil', '@anlaggning', ({ res, param }) => {
    const d = en('SELECT * FROM dokument WHERE id=?', param.id);
    if (!d) throw fel(404, 'Dokumentet finns inte');
    const fil = join(DOKUMENTKATALOG, d.filnamn);
    if (!existsSync(fil)) throw fel(404, 'Filen finns inte kvar');
    res.writeHead(200, {
      'content-type': d.mediatyp || 'application/octet-stream',
      'content-length': statSync(fil).size,
      'content-disposition': `inline; filename="${encodeURIComponent(d.namn)}"`,
    });
    createReadStream(fil).pipe(res);
  }),

  /**
   * Läser manualen och föreslår servicepunkter. Förslagen sparas som
   * serviceplaner med status 'forslag' – de gör ingenting förrän en
   * människa godkänt dem, och varje punkt bär sidnummer och citat.
   */
  /**
   * Läs ut servicepunkter ur ett dokument som redan ligger uppe. Görs
   * automatiskt vid uppladdning, men behövs när en manual kommit in utan
   * tolkning eller när man vill läsa om den.
   */
  rutt('POST', '/api/underhall/dokument/:id/tolka', '@anlaggning', async ({ res, param, medlem }) => {
    const d = en('SELECT * FROM dokument WHERE id=?', param.id);
    if (!d) throw fel(404, 'Dokumentet finns inte');
    if (!d.text) throw fel(409, 'Ingen text kunde läsas ur dokumentet – lägg in punkterna för hand');
    const r = await lasServicepunkter(d, medlem);
    if (r.avsnitt?.length === 0) throw fel(409, 'Hittade inga underhållsavsnitt i dokumentet');
    svar(res, r.punkter.length ? 201 : 200, r);
  }),

  // ---------- Reservdelar ----------
  rutt('GET', '/api/underhall/reservdelar', '@anlaggning', ({ res }) =>
    svar(res, 200, {
      reservdelar: alla(
        `SELECT r.*, l.namn AS leverantor, l.telefon, l.epost,
                (SELECT coalesce(sum(t.antal),0) FROM reservdelsuttag t
                  WHERE t.reservdel_id=r.id AND t.antal>0 AND t.tid >= date('now','-365 days')) AS forbrukning_ar,
                (SELECT max(t.tid) FROM reservdelsuttag t WHERE t.reservdel_id=r.id AND t.antal>0) AS senast_uttag
           FROM reservdel r
           LEFT JOIN leverantor l ON l.id=r.leverantor_id
          WHERE r.aktiv=1 ORDER BY r.namn`
      ).map((r) => ({ ...r, bestall: r.lager <= r.minlager })),
    })
  ),

  rutt('POST', '/api/underhall/reservdelar', '@anlaggning', ({ res, kropp }) => {
    const id = spara('reservdel', {
      namn: kravTxt(kropp.namn, 'Namn', 160),
      artikelnummer: txt(kropp.artikelnummer, 60),
      leverantor_id: heltal(kropp.leverantor_id),
      enhet: txt(kropp.enhet, 12) || 'st',
      pris_ore: heltal(kropp.pris_ore),
      pris_datum: kropp.pris_ore ? idag() : null,
      lager: num(kropp.lager) ?? 0,
      minlager: num(kropp.minlager) ?? 0,
      placering: txt(kropp.placering, 120),
      anteckning: txt(kropp.anteckning),
    });
    for (const k of kropp.passar || [])
      spara('reservdelspassning', {
        reservdel_id: id,
        utrustning_id: heltal(k.utrustning_id),
        komponent_id: heltal(k.komponent_id),
      });
    svar(res, 201, { reservdel: en('SELECT * FROM reservdel WHERE id=?', id) });
  }),

  /** Uttag minskar lagret, inleverans (negativt antal) ökar det. */
  rutt('POST', '/api/underhall/reservdelar/:id/uttag', '@anlaggning', ({ res, param, kropp, medlem }) => {
    const r = en('SELECT * FROM reservdel WHERE id=?', param.id);
    if (!r) throw fel(404, 'Reservdelen finns inte');
    const antal = num(kropp.antal);
    if (!antal) throw fel(400, 'Ange antal');
    return transaktion(() => {
      const pris = heltal(kropp.pris_ore) ?? r.pris_ore;
      spara('reservdelsuttag', {
        reservdel_id: r.id,
        antal,
        pris_ore: pris,
        av_id: medlem.id,
        serviceatgard_id: heltal(kropp.serviceatgard_id),
        arende_id: heltal(kropp.arende_id),
        anteckning: txt(kropp.anteckning),
      });
      uppdatera('reservdel', r.id, {
        lager: Math.round((r.lager - antal) * 100) / 100,
        // Ett nytt inköpspris är den färskaste uppgiften vi har.
        pris_ore: antal < 0 && heltal(kropp.pris_ore) ? heltal(kropp.pris_ore) : undefined,
        pris_datum: antal < 0 && heltal(kropp.pris_ore) ? idag() : undefined,
      });
      svar(res, 200, { reservdel: en('SELECT * FROM reservdel WHERE id=?', r.id) });
    });
  }),

  rutt('GET', '/api/underhall/reservdelar/:id/historik', '@anlaggning', ({ res, param }) =>
    svar(res, 200, {
      uttag: alla(
        `SELECT t.*, m.namn AS av, a.namn AS atgard
           FROM reservdelsuttag t
           LEFT JOIN medlem m ON m.id=t.av_id
           LEFT JOIN serviceatgard a ON a.id=t.serviceatgard_id
          WHERE t.reservdel_id=? ORDER BY t.tid DESC LIMIT 200`,
        param.id
      ),
      passar: alla(
        `SELECT p.*, u.namn AS utrustning, k.namn AS komponent
           FROM reservdelspassning p
           LEFT JOIN utrustning u ON u.id=p.utrustning_id
           LEFT JOIN komponent k ON k.id=p.komponent_id
          WHERE p.reservdel_id=?`,
        param.id
      ),
    })
  ),

  // ---------- Kostnadsuppföljning ----------
  rutt('GET', '/api/underhall/kostnader', '@anlaggning', ({ res, fraga }) => {
    const fran = fraga.get('fran') || `${new Date().getFullYear()}-01-01`;
    const till = fraga.get('till') || idag();
    const rader = alla(
      `SELECT u.id, u.namn, u.typ FROM utrustning u WHERE u.aktiv=1 ORDER BY u.ordning, u.namn`
    ).map((u) => {
      const atgarder = alla(
        `SELECT kostnad_ore, arbetstimmar FROM serviceatgard
          WHERE utrustning_id=? AND status='utford' AND utford BETWEEN ? AND ?`,
        u.id, fran, till
      );
      const uttag = alla(
        `SELECT t.antal, t.pris_ore FROM reservdelsuttag t
           LEFT JOIN serviceatgard a ON a.id=t.serviceatgard_id
           LEFT JOIN arende ar ON ar.id=t.arende_id
          WHERE (a.utrustning_id=? OR ar.utrustning_id=?) AND t.tid BETWEEN ? AND ?`,
        u.id, u.id, fran, `${till} 23:59:59`
      );
      const arenden = alla(
        `SELECT kostnad_ore FROM arende
          WHERE utrustning_id=? AND kostnad_ore IS NOT NULL AND skapad BETWEEN ? AND ?`,
        u.id, fran, `${till} 23:59:59`
      );
      return { ...u, ...kostnader({ atgarder, uttag, arenden }) };
    });
    const summa = (falt) => rader.reduce((s, r) => s + r[falt], 0);
    svar(res, 200, {
      fran,
      till,
      rader: rader.filter((r) => r.totalt_ore > 0 || r.arbetstimmar > 0),
      summa: {
        service_ore: summa('service_ore'),
        delar_ore: summa('delar_ore'),
        reparation_ore: summa('reparation_ore'),
        totalt_ore: summa('totalt_ore'),
        arbetstimmar: Math.round(summa('arbetstimmar') * 10) / 10,
      },
    });
  }),
];
