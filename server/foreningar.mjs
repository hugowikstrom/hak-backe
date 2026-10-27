// Föreningarna på plattformen.
//
// En förening = en konfiguration och en databasfil. Inget delas, så en
// förening kan lämnas ut, flyttas eller tas bort som en enda fil, och ingen
// fråga kan råka hämta en annan förenings medlemmar.
//
// Registret ligger i data/foreningar.json. Saknas det byggs en förening av
// miljövariablerna, så att en ensam klubb fungerar utan att veta om att
// plattformen kan bära fler.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aktuellForening, medSkal, oppna, ROT } from './db.mjs';

const REGISTER = process.env.HAK_FORENINGSREGISTER || join(ROT, 'data', 'foreningar.json');

/** Grundprofil. En förening kan skriva över enskilda värden. */
export const STANDARDPROFIL = {
  klubb_ren: '#86bf58',
  klubb: '#517a2f',
  klubb_djup: '#35611a',
  klubb_mjuk: '#f1f8e7',
  klubb_ram: '#d6e9bd',
  pa_klubb: '#15210a',
};

const franMiljon = () => ({
  nyckel: 'standard',
  namn: process.env.HAK_FORENING || 'Härnösands Alpina Klubb',
  kortnamn: process.env.HAK_FORENING_KORT || 'HAK',
  orgnr: process.env.HAK_ORGNR || '',
  domaner: [],
  databas: process.env.HAK_DB || join(ROT, 'data', 'hak.db'),
  moduler: ['*'],
  plats: (() => {
    const [lat, lon, hojd] = (process.env.HAK_PLATS || '62.627,17.914,170').split(',').map(Number);
    return { namn: process.env.HAK_PLATSNAMN || 'Vårdkasbacken', lat, lon, hojd: hojd || 0 };
  })(),
  swish: process.env.HAK_SWISH_NUMMER || null,
  // Modellen som tolkar talade driftrapporter. 'lokal' körs på maskinen.
  ai_modell: process.env.HAK_AI_MODELL || 'lokal',
  sms_fran: process.env.HAK_SMS_FRAN || 'HAKbacken',
  epost_fran: process.env.HAK_EPOST_FRAN || 'HAK Backe <backe@nattviken.com>',
  bas_url: process.env.HAK_BAS_URL || 'https://hak.nattviken.com',
  profil: {},
});

let register = null;

function las() {
  if (register) return register;
  if (existsSync(REGISTER)) {
    const rad = JSON.parse(readFileSync(REGISTER, 'utf8'));
    register = {
      standard: rad.standard || rad.foreningar?.[0]?.nyckel,
      foreningar: (rad.foreningar || []).map(komplettera),
    };
  } else {
    const ensam = komplettera(franMiljon());
    register = { standard: ensam.nyckel, foreningar: [ensam] };
  }
  return register;
}

function komplettera(f) {
  const grund = franMiljon();
  return {
    ...grund,
    ...f,
    databas: f.databas
      ? (f.databas.startsWith('/') || f.databas === ':memory:' ? f.databas : join(ROT, f.databas))
      : join(ROT, 'data', 'foreningar', `${f.nyckel}.db`),
    domaner: f.domaner || [],
    moduler: f.moduler || ['*'],
    plats: { ...grund.plats, ...(f.plats || {}) },
    profil: { ...STANDARDPROFIL, ...(f.profil || {}) },
  };
}

export const laddaOm = () => (register = null);
export const foreningar = () => las().foreningar;
export const standardforening = () => forening(las().standard) || las().foreningar[0];
export const forening = (nyckel) => las().foreningar.find((f) => f.nyckel === nyckel) || null;

/** Vilken förening en begäran gäller. Värdnamnet avgör. */
export function foreningAvVard(vard) {
  const namn = String(vard || '').split(':')[0].toLowerCase();
  const traff = las().foreningar.find((f) => f.domaner.some((d) => d.toLowerCase() === namn));
  return traff || standardforening();
}

/** Databasen för en förening, öppnad och migrerad vid behov. */
export const databasFor = (f) => oppna(f.databas);

/** Lägger till en förening i registret och skapar dess databas. */
export function skapaForening(ny) {
  if (!ny?.nyckel || !/^[a-z0-9-]{2,30}$/.test(ny.nyckel))
    throw new Error('Nyckeln ska vara 2–30 tecken: a–z, 0–9 och bindestreck');
  const r = las();
  if (r.foreningar.some((f) => f.nyckel === ny.nyckel)) throw new Error(`Föreningen ${ny.nyckel} finns redan`);
  const forening = komplettera(ny);
  r.foreningar.push(forening);
  r.standard ||= forening.nyckel;
  spara();
  databasFor(forening);
  return forening;
}

export function andraForening(nyckel, andring) {
  const r = las();
  const i = r.foreningar.findIndex((f) => f.nyckel === nyckel);
  if (i < 0) throw new Error(`Föreningen ${nyckel} finns inte`);
  r.foreningar[i] = komplettera({ ...r.foreningar[i], ...andring, nyckel });
  spara();
  return r.foreningar[i];
}

function spara() {
  const r = las();
  mkdirSync(join(ROT, 'data'), { recursive: true });
  // Sökvägarna sparas som de skrevs in, inte som absoluta.
  writeFileSync(
    REGISTER,
    `${JSON.stringify(
      {
        standard: r.standard,
        foreningar: r.foreningar.map((f) => ({
          ...f,
          databas: f.databas.startsWith(ROT) ? f.databas.slice(ROT.length + 1) : f.databas,
        })),
      },
      null,
      2
    )}\n`
  );
}

/** Kör fn som en viss förening: rätt databas och rätt inställningar. */
export const korSom = (f, fn) => medSkal({ db: databasFor(f), forening: f }, fn);

/**
 * Inställning för den förening anropet gäller, med miljövariabeln som
 * reserv. Så fungerar en ensam klubb som förut, och tio klubbar var för sig.
 */
export function instans(falt, reserv = null) {
  const f = aktuellForening() || standardforening();
  const v = f?.[falt];
  return v === undefined || v === null || v === '' ? reserv : v;
}

/** Det klienten behöver veta om föreningen den pratar med. */
export const publikForening = (f) => ({
  nyckel: f.nyckel,
  namn: f.namn,
  kortnamn: f.kortnamn,
  ort: f.ort || null,
  plats: f.plats,
  profil: f.profil,
  swish: !!f.swish,
});
