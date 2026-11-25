// Plattformens moduler.
//
// Varje del av systemet är en modul som kan slås på eller av per förening.
// En klubb utan snöläggning ska inte se lansar, och en klubb utan kiosk ska
// inte se kassan. Modulen äger sina rutter och sina sidor i klienten, och
// säger vilka andra moduler den behöver.
//
// Kärnmoduler går inte att stänga av: utan konto, medlemmar och föreningen
// finns ingen plattform.
import { aktivaModuler, MENYGRUPPER, modul, MODULDATA, modulPa, publikaModuler } from './moduldata.mjs';
import { rutter as konto } from './api/konto.mjs';
import { rutter as register } from './api/register.mjs';
import { rutter as forening } from './api/forening.mjs';
import { rutter as tilltrade } from './api/tilltrade.mjs';
import { rutter as hjalp } from './api/hjalp.mjs';
import { rutter as bilder } from './api/bilder.mjs';
import { rutter as oversikt } from './api/oversikt.mjs';
import { rutter as sno } from './api/sno.mjs';
import { rutter as vader } from './api/vader.mjs';
import { rutter as checklistor } from './api/checklistor.mjs';
import { rutter as arenden } from './api/arenden.mjs';
import { rutter as bemanning } from './api/bemanning.mjs';
import { rutter as mitt } from './api/mitt.mjs';
import { rutter as rapport } from './api/rapport.mjs';
import { rutter as fik } from './api/fik.mjs';
import { rutter as uthyrning } from './api/uthyrning.mjs';
import { rutter as bokforing } from './api/bokforing.mjs';
import { rutter as planbok } from './api/planbok.mjs';
import { rutter as traning } from './api/traning.mjs';
import { rutter as ide } from './api/ide.mjs';
import { rutter as drift } from './api/drift.mjs';
import { rutter as incident } from './api/incident.mjs';
import { rutter as underhall } from './api/underhall.mjs';
import { rutter as snoplan } from './api/snoplan.mjs';
import { rutter as platser } from './api/platser.mjs';
import { rutter as utlagg } from './api/utlagg.mjs';
import { rutter as evenemang } from './api/evenemang.mjs';
import { rutter as samakning } from './api/samakning.mjs';
import { rutter as projekt } from './api/projekt.mjs';
import { rutter as arbetsstalle } from './api/arbetsstalle.mjs';
import { rutter as kontroll } from './api/kontroll.mjs';
import { rutter as enheter } from './api/enheter.mjs';

// Rutterna kopplas på metadatan i moduldata.mjs. Lägg till modulen där,
// och dess rutter här.
const RUTTER = {
  konto: [...konto, ...bilder],
  forening: [...forening, ...tilltrade],
  anlaggning: [...register, ...arbetsstalle],
  hjalp: hjalp,
  oversikt: oversikt,
  arenden: arenden,
  drift: drift,
  underhall: underhall,
  incidenter: incident,
  checklistor: [...checklistor, ...kontroll],
  snolaggning: [...sno, ...vader, ...platser],
  enheter: enheter,
  mitt: mitt,
  bemanning: bemanning,
  snoplan: snoplan,
  ekonomi: [...bokforing, ...planbok],
  kiosk: fik,
  uthyrning: uthyrning,
  traning: traning,
  utlagg: utlagg,
  evenemang: evenemang,
  samakning: samakning,
  projekt: projekt,
  ideer: ide,
  rapporter: rapport,
};

export const MODULER = MODULDATA.map((m) => ({ ...m, rutter: RUTTER[m.nyckel] || [] }));

/** Hela ruttabellen, där varje rutt vet vilken modul den tillhör. */
export const allaRutter = () =>
  MODULER.flatMap((m) => m.rutter.map((r) => ({ ...r, modul: m.nyckel })));

export { aktivaModuler, MENYGRUPPER, modul, MODULDATA, modulPa, publikaModuler };
