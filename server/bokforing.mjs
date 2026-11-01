// Bokföring: verifikationer med dubbel bokföring, rättelser och SIE-export.
//
// Bokföringslagen kräver att varje affärshändelse bokförs med en verifikation
// i obruten nummerföljd, att det går att se vem som gjort vad och när, och att
// en bokförd post aldrig raderas eller skrivs om. Tabellerna har triggrar som
// vägrar UPDATE och DELETE; fel rättas med en ny, motbokande verifikation.
import { alla, en, spara, transaktion } from './db.mjs';
import { kronor } from './pengar.mjs';
import { fel } from './http.mjs';
import { instans } from './foreningar.mjs';
import { idag } from './tid.mjs';

/** Föreningens kontoplan, ett urval ur BAS. Går att utöka i registret. */
export const STANDARDKONTON = [
  ['1510', 'Kundfordringar', 'tillgang'],
  ['1910', 'Kassa', 'tillgang'],
  ['1930', 'Bankkonto (kort och Swish)', 'tillgang'],
  ['2420', 'Förskott från medlemmar (plånbok)', 'skuld'],
  ['2611', 'Utgående moms 25 %', 'skuld'],
  ['2621', 'Utgående moms 12 %', 'skuld'],
  ['2631', 'Utgående moms 6 %', 'skuld'],
  ['3010', 'Kioskförsäljning', 'intakt'],
  ['3020', 'Uthyrning av utrustning', 'intakt'],
  ['3030', 'Liftkort', 'intakt'],
  ['3110', 'Medlemsavgifter', 'intakt'],
  ['3120', 'Deltagaravgifter läger och tävling', 'intakt'],
  ['3990', 'Övriga intäkter', 'intakt'],
  // Kostnadskontona används av medlemmarnas utlägg. Namnen är satta för en
  // idrottsförening snarare än ordagrant ur BAS – kontoplanen går att
  // ändra i registret, och den som har en redovisningskonsult gör det.
  ['2641', 'Ingående moms', 'tillgang'],
  ['2890', 'Skuld för medlemmars utlägg', 'skuld'],
  ['4010', 'Inköp av varor till kiosken', 'kostnad'],
  ['5410', 'Förbrukningsinventarier och material', 'kostnad'],
  ['5800', 'Resekostnader', 'kostnad'],
  ['6110', 'Kontorsmateriel', 'kostnad'],
  ['6590', 'Tävlings- och lägerkostnader', 'kostnad'],
  ['6990', 'Övriga kostnader', 'kostnad'],
];

/** Vilket kostnadskonto ett utlägg hamnar på. */
export const UTLAGGSKONTON = {
  fiket: '4010',
  backen: '5410',
  resa: '5800',
  kontor: '6110',
  traning: '6590',
  tavling: '6590',
  ovrigt: '6990',
};

/** Ingående moms – motsatsen till MOMSKONTON, som är den utgående. */
export const INGAENDE_MOMS = '2641';

export const MOMSKONTON = { 0.25: '2611', 0.12: '2621', 0.06: '2631' };

/** Betalmedel styr vilket tillgångskonto som debiteras. */
export const BETALKONTON = {
  swish: '1930',
  kort: '1930',
  kontant: '1910',
  faktura: '1510',
  // Plånboken är redan inbetald – köpet minskar klubbens skuld i stället.
  planbok: '2420',
};

export const SERIER = {
  K: 'Kiosk',
  U: 'Uthyrning',
  M: 'Medlem',
  D: 'Diverse',
};

export function sakerstallKontoplan() {
  for (const [nummer, namn, slag] of STANDARDKONTON) {
    if (!en('SELECT nummer FROM konto WHERE nummer=?', nummer)) spara('konto', { nummer, namn, slag });
  }
}

export const kontoplan = () => alla('SELECT * FROM konto ORDER BY nummer');

const ar = (datum) => Number(String(datum).slice(0, 4));

/** Nästa nummer i serien. Följden får inte ha hål, därför max+1 i en transaktion. */
export const nastaNummer = (serie, arr) =>
  (en('SELECT max(nummer) AS n FROM verifikation WHERE serie=? AND ar=?', serie, arr)?.n ?? 0) + 1;

/**
 * Bokför en affärshändelse.
 * @param {object} v
 * @param {string} v.serie       K, U, M eller D
 * @param {string} v.datum       affärshändelsens dag, YYYY-MM-DD
 * @param {Array}  v.rader       [{konto, debet_ore?, kredit_ore?, beskrivning?, momssats?}]
 */
export function bokfor({ serie, datum = idag(), beskrivning, motpart = null, rader, referens_slag = null, referens_id = null, rattar_id = null, av = null, underlag = null }) {
  if (!SERIER[serie]) throw fel(400, `Okänd verifikationsserie: ${serie}`);
  if (!beskrivning) throw fel(400, 'Verifikationen måste ha en beskrivning');
  if (!Array.isArray(rader) || rader.length < 2) throw fel(400, 'En verifikation behöver minst två rader');

  const debet = rader.reduce((a, r) => a + (r.debet_ore || 0), 0);
  const kredit = rader.reduce((a, r) => a + (r.kredit_ore || 0), 0);
  if (debet !== kredit) throw fel(400, `Verifikationen balanserar inte: debet ${kronor(debet)} mot kredit ${kronor(kredit)}`);
  if (!debet) throw fel(400, 'Verifikationen är på noll kronor');

  for (const r of rader) {
    if (!en('SELECT nummer FROM konto WHERE nummer=?', String(r.konto)))
      throw fel(400, `Kontot ${r.konto} finns inte i kontoplanen`);
  }

  return transaktion(() => {
    const arr = ar(datum);
    const id = spara('verifikation', {
      serie,
      nummer: nastaNummer(serie, arr),
      ar: arr,
      datum,
      beskrivning,
      motpart,
      belopp_ore: debet,
      referens_slag,
      referens_id,
      rattar_id,
      skapad_av_id: av?.id ?? null,
      skapad_av: av?.namn ?? 'systemet',
      underlag: underlag ? JSON.stringify(underlag) : null,
    });
    for (const r of rader)
      spara('verifikationsrad', {
        verifikation_id: id,
        konto: String(r.konto),
        beskrivning: r.beskrivning ?? null,
        debet_ore: r.debet_ore || 0,
        kredit_ore: r.kredit_ore || 0,
        momssats: r.momssats || 0,
      });
    return hamta(id);
  });
}

/**
 * En försäljning: brutto in på betalkontot, netto på intäktskontot och
 * eventuell moms för sig. Föreningar som inte är momsregistrerade kör med
 * momssats 0, vilket är standard här.
 */
export function bokforForsaljning({ serie, datum, beskrivning, motpart, belopp_ore, intaktskonto, momssats = 0, betalmedel = 'swish', referens_slag, referens_id, av, underlag }) {
  const betalkonto = BETALKONTON[betalmedel];
  if (!betalkonto) throw fel(400, `Okänt betalmedel: ${betalmedel}`);
  const netto = momssats > 0 ? Math.round(belopp_ore / (1 + momssats)) : belopp_ore;
  const moms = belopp_ore - netto;
  const rader = [
    { konto: betalkonto, debet_ore: belopp_ore, beskrivning: `Betalt med ${betalmedel}` },
    { konto: intaktskonto, kredit_ore: netto, momssats },
  ];
  if (moms > 0) rader.push({ konto: MOMSKONTON[momssats], kredit_ore: moms, beskrivning: `Moms ${Math.round(momssats * 100)} %` });
  return bokfor({ serie, datum, beskrivning, motpart, rader, referens_slag, referens_id, av, underlag });
}

/** Har affären redan bokförts? Skyddar mot dubbla verifikationer. */
export const verifikationFor = (referens_slag, referens_id) =>
  en('SELECT * FROM verifikation WHERE referens_slag=? AND referens_id=? ORDER BY id LIMIT 1', referens_slag, referens_id);

/** Vilket intäktskonto en vara hör till. */
export const INTAKTSKONTON = {
  liftkort: '3030',
  uthyrning: '3020',
  medlemsavgift: '3110',
  kiosk: '3010',
};

/**
 * Bokför en order eller ett hyresavtal med flera rader. Raderna grupperas per
 * intäktskonto, så att kiosk och liftkort hamnar var för sig i bokföringen.
 */
export function bokforAffar({ serie, datum, beskrivning, motpart, rader, betalmedel, referens_slag, referens_id, av, underlag }) {
  if (verifikationFor(referens_slag, referens_id))
    throw fel(409, 'Affären är redan bokförd');
  const betalkonto = BETALKONTON[betalmedel];
  if (!betalkonto) throw fel(400, `Okänt betalmedel: ${betalmedel}`);

  const perKonto = new Map();
  for (const r of rader) {
    const konto = r.konto || INTAKTSKONTON.kiosk;
    const sats = r.momssats || 0;
    const nyckel = `${konto}|${sats}`;
    perKonto.set(nyckel, (perKonto.get(nyckel) || 0) + r.belopp_ore);
  }

  const brutto = [...perKonto.values()].reduce((a, b) => a + b, 0);
  const verrader = [{ konto: betalkonto, debet_ore: brutto, beskrivning: `Betalt med ${betalmedel}` }];
  const momsPerSats = new Map();
  for (const [nyckel, belopp] of perKonto) {
    const [konto, satsText] = nyckel.split('|');
    const sats = Number(satsText);
    const netto = sats > 0 ? Math.round(belopp / (1 + sats)) : belopp;
    verrader.push({ konto, kredit_ore: netto, momssats: sats });
    if (sats > 0) momsPerSats.set(sats, (momsPerSats.get(sats) || 0) + (belopp - netto));
  }
  for (const [sats, moms] of momsPerSats)
    verrader.push({ konto: MOMSKONTON[sats], kredit_ore: moms, beskrivning: `Moms ${Math.round(sats * 100)} %` });

  return bokfor({ serie, datum, beskrivning, motpart, rader: verrader, referens_slag, referens_id, av, underlag });
}

/** Rättelse: samma belopp, omvända sidor, med pekare till den felaktiga. */
export function bokforRattelse({ verifikation_id, anledning, av }) {
  const original = hamta(verifikation_id);
  if (!original) throw fel(404, 'Verifikationen finns inte');
  if (en('SELECT id FROM verifikation WHERE rattar_id=?', verifikation_id))
    throw fel(409, 'Verifikationen är redan rättad');
  return bokfor({
    serie: original.serie,
    datum: idag(),
    beskrivning: `Rättelse av ${original.serie}${original.nummer}: ${anledning || original.beskrivning}`,
    motpart: original.motpart,
    rader: original.rader.map((r) => ({
      konto: r.konto,
      debet_ore: r.kredit_ore,
      kredit_ore: r.debet_ore,
      momssats: r.momssats,
      beskrivning: 'Rättelse',
    })),
    referens_slag: 'rattelse',
    referens_id: original.id,
    rattar_id: original.id,
    av,
  });
}

export const hamta = (id) => {
  const v = en('SELECT * FROM verifikation WHERE id=?', id);
  return v ? { ...v, rader: alla('SELECT * FROM verifikationsrad WHERE verifikation_id=? ORDER BY id', id) } : null;
};

export const verifikationer = ({ fran, till, serie, antal = 500 } = {}) => {
  const villkor = [];
  const p = [];
  if (fran) villkor.push('datum >= ?'), p.push(fran);
  if (till) villkor.push('datum <= ?'), p.push(till);
  if (serie) villkor.push('serie = ?'), p.push(serie);
  return alla(
    `SELECT * FROM verifikation ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''}
     ORDER BY datum DESC, serie, nummer DESC LIMIT ?`,
    ...p,
    antal
  ).map((v) => ({ ...v, rader: alla('SELECT * FROM verifikationsrad WHERE verifikation_id=? ORDER BY id', v.id) }));
};

/** Saldon per konto i en period – grunden för resultat och balans. */
export const kontosaldon = ({ fran, till }) =>
  alla(
    `SELECT r.konto, k.namn, k.slag,
            sum(r.debet_ore) AS debet_ore, sum(r.kredit_ore) AS kredit_ore,
            sum(r.debet_ore) - sum(r.kredit_ore) AS saldo_ore
     FROM verifikationsrad r
     JOIN verifikation v ON v.id = r.verifikation_id
     LEFT JOIN konto k ON k.nummer = r.konto
     WHERE v.datum BETWEEN ? AND ?
     GROUP BY r.konto ORDER BY r.konto`,
    fran,
    till
  );

/** Dagsrapport: vad som sålts och hur det betalats. */
export function dagsrapport(datum = idag()) {
  const saldon = kontosaldon({ fran: datum, till: datum });
  const intakter = saldon.filter((s) => s.slag === 'intakt');
  const betalmedel = Object.entries(BETALKONTON).map(([medel, konto]) => {
    const rad = saldon.find((s) => s.konto === konto);
    return { medel, konto, belopp_ore: rad?.debet_ore ?? 0 };
  });
  return {
    datum,
    verifikationer: verifikationer({ fran: datum, till: datum, antal: 1000 }).length,
    intakter: intakter.map((i) => ({ konto: i.konto, namn: i.namn, belopp_ore: i.kredit_ore - i.debet_ore })),
    summa_ore: intakter.reduce((a, i) => a + (i.kredit_ore - i.debet_ore), 0),
    betalmedel: betalmedel.filter((b) => b.belopp_ore),
    moms_ore: saldon.filter((s) => s.konto.startsWith('26')).reduce((a, s) => a + (s.kredit_ore - s.debet_ore), 0),
  };
}

// ---- SIE 4, det format revisorn och bokföringsprogrammen läser ----
const sieDatum = (d) => String(d).slice(0, 10).replace(/-/g, '');
const sieBelopp = (ore) => (ore / 100).toFixed(2);
const sieText = (s) => `"${String(s ?? '').replace(/["\\]/g, ' ').slice(0, 100)}"`;
const KTYP = { tillgang: 'T', skuld: 'S', intakt: 'I', kostnad: 'K' };

/** SIE-filen i teckentabell PC8 (CP437), som formatet föreskriver. */
export function sieKodning(text) {
  const karta = { 'å': 134, 'ä': 132, 'ö': 148, 'Å': 143, 'Ä': 142, 'Ö': 153, 'é': 130, 'ü': 129, '–': 45, '—': 45, '’': 39, '"': 34 };
  const bytes = [];
  for (const tecken of text) {
    const kod = tecken.codePointAt(0);
    if (kod < 128) bytes.push(kod);
    else if (karta[tecken]) bytes.push(karta[tecken]);
    else bytes.push(63); // ?
  }
  return Buffer.from(bytes);
}

export function sie4({ fran, till, foretag = instans('namn', 'Föreningen'), orgnr = instans('orgnr', '') }) {
  const poster = verifikationer({ fran, till, antal: 10000 }).reverse();
  const anvanda = [...new Set(poster.flatMap((v) => v.rader.map((r) => r.konto)))].sort();
  const konton = kontoplan().filter((k) => anvanda.includes(k.nummer));
  const rader = [
    '#FLAGGA 0',
    `#PROGRAM ${sieText('Backis')} ${sieText('1.0')}`,
    '#FORMAT PC8',
    `#GEN ${sieDatum(idag())}`,
    '#SIETYP 4',
    orgnr ? `#ORGNR ${orgnr}` : null,
    `#FNAMN ${sieText(foretag)}`,
    `#RAR 0 ${sieDatum(fran)} ${sieDatum(till)}`,
    ...konton.map((k) => `#KONTO ${k.nummer} ${sieText(k.namn)}`),
    ...konton.map((k) => `#KTYP ${k.nummer} ${KTYP[k.slag] || 'I'}`),
  ].filter(Boolean);

  for (const v of poster) {
    rader.push(
      `#VER ${sieText(v.serie)} ${sieText(v.nummer)} ${sieDatum(v.datum)} ${sieText(v.beskrivning)} ${sieDatum(v.bokford)} ${sieText(v.skapad_av || '')}`,
      '{'
    );
    for (const r of v.rader) {
      const belopp = r.debet_ore - r.kredit_ore;
      rader.push(`#TRANS ${r.konto} {} ${sieBelopp(belopp)} ${sieDatum(v.datum)} ${sieText(r.beskrivning || v.beskrivning)}`);
    }
    rader.push('}');
  }
  return rader.join('\r\n') + '\r\n';
}

/** Behandlingshistorik. Skrivs alltid, läses av den som granskar. */
export const revidera = ({ medlem, handelse, objekt = null, detalj = null }) =>
  spara('revision', {
    medlem_id: medlem?.id ?? null,
    namn: medlem?.namn ?? 'systemet',
    handelse,
    objekt,
    detalj: typeof detalj === 'string' ? detalj : detalj ? JSON.stringify(detalj) : null,
  });

export const revisionslogg = ({ antal = 200 } = {}) =>
  alla('SELECT * FROM revision ORDER BY id DESC LIMIT ?', antal);
