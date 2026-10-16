// Medlemmarnas plånbok.
//
// Poängen är att slippa en swishavgift per korv: medlemmen fyller på en gång
// och handlar många gånger. Pengarna är klubbens skuld till medlemmen tills
// de handlas upp, och bokförs därefter – därför konto 2420.
import { alla, en, spara } from './db.mjs';
import { bokfor, bokforAffar, BETALKONTON, INTAKTSKONTON, verifikationFor } from './bokforing.mjs';
import { kronor } from './pengar.mjs';
import { fel } from './http.mjs';
import { idag } from './tid.mjs';

export const PLANBOKSKONTO = '2420';
export const SLAG = ['insattning', 'kop', 'aterbetalning', 'justering'];

/** Inställningar som klubben kan ändra utan att någon rör koden. */
const STANDARD = {
  medlemsrabatt_procent: '10',
  rabatterade_kategorier: 'mat,dryck,fika,godis',
  planbok_min_insattning: '10000',
};

export function installning(nyckel) {
  const rad = en('SELECT varde FROM installning WHERE nyckel=?', nyckel);
  return rad ? rad.varde : STANDARD[nyckel];
}

export function sattInstallning(nyckel, varde, beskrivning = null) {
  if (en('SELECT nyckel FROM installning WHERE nyckel=?', nyckel))
    en('UPDATE installning SET varde=?, beskrivning=coalesce(?, beskrivning) WHERE nyckel=? RETURNING nyckel', String(varde), beskrivning, nyckel);
  else spara('installning', { nyckel, varde: String(varde), beskrivning });
  return installning(nyckel);
}

export const installningar = () => ({
  ...STANDARD,
  ...Object.fromEntries(alla('SELECT nyckel, varde FROM installning').map((r) => [r.nyckel, r.varde])),
});

export const rabattsats = () => Math.max(0, Math.min(90, Number(installning('medlemsrabatt_procent')) || 0)) / 100;
export const rabatteradeKategorier = () =>
  String(installning('rabatterade_kategorier') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const saldo = (medlem_id) =>
  en('SELECT coalesce(sum(belopp_ore),0) AS s FROM planbokstransaktion WHERE medlem_id=?', medlem_id).s;

export const historik = (medlem_id, antal = 100) =>
  alla('SELECT * FROM planbokstransaktion WHERE medlem_id=? ORDER BY id DESC LIMIT ?', medlem_id, antal).map((t) => ({
    ...t,
    belopp: kronor(t.belopp_ore),
    saldo_efter: kronor(t.saldo_efter_ore),
  }));

/** Allt klubben är skyldig medlemmarna just nu. */
export const totaltSaldo = () =>
  en('SELECT coalesce(sum(belopp_ore),0) AS s FROM planbokstransaktion').s;

export const alla_saldon = () =>
  alla(
    `SELECT m.id, m.namn, m.medlemsnummer, coalesce(sum(p.belopp_ore),0) AS saldo_ore
     FROM medlem m LEFT JOIN planbokstransaktion p ON p.medlem_id=m.id
     WHERE m.aktiv=1 GROUP BY m.id HAVING saldo_ore <> 0 ORDER BY saldo_ore DESC`
  ).map((r) => ({ ...r, saldo: kronor(r.saldo_ore) }));

function skriv({ medlem_id, slag, belopp_ore, beskrivning, referens_slag = null, referens_id = null, verifikation_id = null, av }) {
  const nytt = saldo(medlem_id) + belopp_ore;
  const id = spara('planbokstransaktion', {
    medlem_id,
    slag,
    belopp_ore,
    saldo_efter_ore: nytt,
    beskrivning,
    referens_slag,
    referens_id,
    verifikation_id,
    av_id: av?.id ?? null,
    av: av?.namn ?? 'systemet',
  });
  return { ...en('SELECT * FROM planbokstransaktion WHERE id=?', id), saldo_ore: nytt };
}

/** Påfyllning: pengarna in på bankkontot, skulden till medlemmen upp. */
export function fyllPa({ medlem, belopp_ore, betalmedel = 'swish', av, anteckning }) {
  const minsta = Number(installning('planbok_min_insattning')) || 0;
  if (!Number.isFinite(belopp_ore) || belopp_ore < minsta)
    throw fel(400, `Minsta påfyllning är ${kronor(minsta)}`);
  if (!BETALKONTON[betalmedel]) throw fel(400, `Okänt betalmedel: ${betalmedel}`);

  const verifikation = bokfor({
    serie: 'M',
    datum: idag(),
    beskrivning: `Påfyllning av plånbok, ${medlem.namn}`,
    motpart: medlem.namn,
    rader: [
      { konto: BETALKONTON[betalmedel], debet_ore: belopp_ore, beskrivning: `Påfyllning med ${betalmedel}` },
      { konto: PLANBOKSKONTO, kredit_ore: belopp_ore, beskrivning: 'Skuld till medlem' },
    ],
    referens_slag: 'planbok',
    referens_id: medlem.id,
    av,
  });

  return skriv({
    medlem_id: medlem.id,
    slag: 'insattning',
    belopp_ore,
    beskrivning: anteckning || `Påfyllt med ${betalmedel}`,
    referens_slag: 'planbok',
    verifikation_id: verifikation.id,
    av,
  });
}

/**
 * Rabatten gäller bara det som klubben bestämt – liftkort säljs till samma
 * pris för alla. Returnerar rader med rabatterat pris och summan som dras.
 */
export function medRabatt(rader) {
  const sats = rabattsats();
  const kategorier = rabatteradeKategorier();
  const ut = rader.map((r) => {
    const rabatteras = sats > 0 && kategorier.includes(r.kategori || 'ovrigt');
    const rabatt_ore = rabatteras ? Math.round(r.belopp_ore * sats) : 0;
    return { ...r, rabatt_ore, belopp_ore: r.belopp_ore - rabatt_ore };
  });
  return { rader: ut, rabatt_ore: ut.reduce((a, r) => a + r.rabatt_ore, 0), sats };
}

/** Köp ur plånboken: skulden ned, intäkten upp. */
export function betalaMedPlanbok({ medlem, rader, beskrivning, serie = 'K', referens_slag, referens_id, av }) {
  const brutto = rader.reduce((a, r) => a + r.belopp_ore, 0);
  const nu = saldo(medlem.id);
  if (brutto > nu)
    throw fel(409, `Plånboken räcker inte: ${kronor(nu)} kvar, ${kronor(brutto)} att betala`);

  const verifikation = bokforAffar({
    serie,
    datum: idag(),
    beskrivning,
    motpart: medlem.namn,
    rader,
    betalmedel: 'planbok',
    referens_slag,
    referens_id,
    av,
  });

  const transaktion = skriv({
    medlem_id: medlem.id,
    slag: 'kop',
    belopp_ore: -brutto,
    beskrivning,
    referens_slag,
    referens_id,
    verifikation_id: verifikation.id,
    av,
  });
  return { transaktion, verifikation };
}

/** Återbetalning till medlem, t.ex. när någon slutar. */
export function aterbetala({ medlem, belopp_ore, betalmedel = 'swish', av, anteckning }) {
  const nu = saldo(medlem.id);
  if (belopp_ore > nu) throw fel(409, `Plånboken innehåller bara ${kronor(nu)}`);
  const verifikation = bokfor({
    serie: 'M',
    datum: idag(),
    beskrivning: `Återbetalning ur plånbok, ${medlem.namn}`,
    motpart: medlem.namn,
    rader: [
      { konto: PLANBOKSKONTO, debet_ore: belopp_ore, beskrivning: 'Skulden till medlem minskar' },
      { konto: BETALKONTON[betalmedel], kredit_ore: belopp_ore, beskrivning: `Utbetalt med ${betalmedel}` },
    ],
    referens_slag: 'planbok',
    referens_id: medlem.id,
    av,
  });
  return skriv({
    medlem_id: medlem.id,
    slag: 'aterbetalning',
    belopp_ore: -belopp_ore,
    beskrivning: anteckning || `Återbetalt med ${betalmedel}`,
    referens_slag: 'planbok',
    verifikation_id: verifikation.id,
    av,
  });
}
