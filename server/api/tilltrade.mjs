// Tillträden: grupperna som ger medlemmar åtkomst till delar av systemet.
//
// Rutterna heter /api/tilltrade och inte /api/grupper, för
// /api/forening/grupper är redan träningsgrupperna. Två olika sorters
// grupper med samma namn i API:et är en bugg som väntar på att hända.
//
// Den som delar ut tillträden kan dela ut allt annat också. Därför två
// regler som koden håller, inte bara dokumentationen:
//
//   1. Rutterna kräver behörigheten `behorighetsstyrning` – ordförande
//      eller administratör, ingen annan.
//   2. Ingen kan ge bort mer än hen själv har. En ordförande som saknar
//      `incident_person` kan inte lägga den i en grupp, och inte heller
//      sätta ett rollgolv över sin egen nivå. Administratören står över
//      spärren, för någon måste kunna sätta upp det första.
import { alla, en, kor, nyttId, uppdatera } from '../db.mjs';
import {
  BEHORIGHETER, BEHORIGHETSNAMN, far, grupperFor, RANG, rollNiva, ROLLNAMN, ARBETSYTOR,
} from '../behorighet.mjs';
import { datum, ettAv, fel, heltal, kravTxt, rutt, svar, txt } from '../http.mjs';

const ROLLGOLV = Object.keys(RANG);

/** Nyckel ur ett namn: "Snögänget" → "snoganget". */
const nyckelAv = (namn) =>
  namn
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'grupp';

const behorigheterFor = (grupp_id) =>
  alla('SELECT behorighet FROM gruppbehorighet WHERE grupp_id=? ORDER BY behorighet', grupp_id).map(
    (r) => r.behorighet
  );

const ytorFor = (grupp_id) =>
  alla('SELECT yta FROM gruppyta WHERE grupp_id=? ORDER BY yta', grupp_id).map((r) => r.yta);

const medlemmarI = (grupp_id) =>
  alla(
    `SELECT t.id, t.fran, t.till, t.aterkallad, m.id AS medlem_id, m.namn, m.roll, m.aktiv
       FROM grupptillhorighet t JOIN medlem m ON m.id = t.medlem_id
      WHERE t.grupp_id = ?
      ORDER BY (t.aterkallad IS NOT NULL OR (t.till IS NOT NULL AND t.till < date('now'))), m.namn`,
    grupp_id
  ).map((r) => ({
    ...r,
    aktiv: !!r.aktiv,
    // Upphörd av endera skälet: återkallad, eller passerat slutdatum.
    upphord: !!r.aterkallad || !!(r.till && r.till < new Date().toISOString().slice(0, 10)),
  }));

export const gruppen = (id) => {
  const g = en('SELECT * FROM behorighetsgrupp WHERE id=?', id);
  if (!g) return null;
  return {
    ...g,
    inbyggd: !!g.inbyggd,
    aktiv: !!g.aktiv,
    behorigheter: behorigheterFor(g.id),
    ytor: ytorFor(g.id),
    medlemmar: medlemmarI(g.id),
  };
};

export const grupperna = () =>
  alla('SELECT * FROM behorighetsgrupp ORDER BY ordning, namn').map((g) => ({
    ...g,
    inbyggd: !!g.inbyggd,
    aktiv: !!g.aktiv,
    behorigheter: behorigheterFor(g.id),
    ytor: ytorFor(g.id),
    antal: en(
      `SELECT count(*) AS n FROM grupptillhorighet
        WHERE grupp_id=? AND aterkallad IS NULL AND (till IS NULL OR till >= date('now'))`,
      g.id
    ).n,
  }));

/**
 * Vad den här medlemmen får dela ut.
 *
 * Administratören får allt. Alla andra får bara vidare det de själva har –
 * annars är behörighetsstyrning en väg att ge sig själv resten.
 */
export function fardelbart(medlem) {
  const admin = medlem.roll === 'admin';
  return {
    behorigheter: Object.keys(BEHORIGHETER).filter((b) => admin || far(medlem, b)),
    rollgolv: ROLLGOLV.filter((r) => admin || RANG[r] <= rollNiva(medlem)),
    ytor: Object.keys(ARBETSYTOR),
    allt: admin,
  };
}

/** Kastar om något i listan ligger utanför vad medlemmen får dela ut. */
function provaDelning(medlem, { behorigheter, roll_golv }) {
  const far_ge = fardelbart(medlem);
  for (const b of behorigheter || []) {
    if (!BEHORIGHETER[b]) throw fel(400, `Okänd behörighet: ${b}`);
    if (!far_ge.behorigheter.includes(b))
      throw fel(403, `Du kan inte ge bort "${BEHORIGHETSNAMN[b] || b}" – du har den inte själv`);
  }
  if (roll_golv && !far_ge.rollgolv.includes(roll_golv))
    throw fel(403, `Du kan inte sätta rollgolvet ${ROLLNAMN[roll_golv] || roll_golv} – det ligger över din egen nivå`);
}

/** Skriver om gruppens behörigheter och ytor till exakt de listor som skickats. */
function sattInnehall(grupp_id, behorigheter, ytor) {
  if (behorigheter) {
    kor('DELETE FROM gruppbehorighet WHERE grupp_id=?', grupp_id);
    for (const b of [...new Set(behorigheter)])
      kor('INSERT INTO gruppbehorighet (grupp_id, behorighet) VALUES (?, ?)', grupp_id, b);
  }
  if (ytor) {
    kor('DELETE FROM gruppyta WHERE grupp_id=?', grupp_id);
    for (const y of [...new Set(ytor)].filter((y) => ARBETSYTOR[y]))
      kor('INSERT INTO gruppyta (grupp_id, yta) VALUES (?, ?)', grupp_id, y);
  }
}

export const rutter = [
  rutt('GET', '/api/tilltrade', '@behorighetsstyrning', ({ res, medlem }) =>
    svar(res, 200, {
      grupper: grupperna(),
      behorighetsnamn: BEHORIGHETSNAMN,
      rollnamn: ROLLNAMN,
      ytor: Object.entries(ARBETSYTOR).map(([nyckel, y]) => ({ nyckel, namn: y.namn, beskrivning: y.beskrivning })),
      far_ge: fardelbart(medlem),
    })
  ),

  rutt('GET', '/api/tilltrade/grupper/:id', '@behorighetsstyrning', ({ res, param }) => {
    const g = gruppen(param.id);
    if (!g) throw fel(404, 'Gruppen finns inte');
    return svar(res, 200, g);
  }),

  rutt('POST', '/api/tilltrade/grupper', '@behorighetsstyrning', ({ res, kropp, medlem }) => {
    const namn = kravTxt(kropp.namn, 'Namn', 80);
    const roll_golv = ettAv(kropp.roll_golv, ROLLGOLV, 'Rollgolv');
    const behorigheter = Array.isArray(kropp.behorigheter) ? kropp.behorigheter : [];
    provaDelning(medlem, { behorigheter, roll_golv });

    let nyckel = txt(kropp.nyckel, 40) || nyckelAv(namn);
    // Nyckeln är det stabila namnet; krockar den får den en siffra.
    if (en('SELECT id FROM behorighetsgrupp WHERE nyckel=?', nyckel)) {
      let n = 2;
      while (en('SELECT id FROM behorighetsgrupp WHERE nyckel=?', `${nyckel}_${n}`)) n += 1;
      nyckel = `${nyckel}_${n}`;
    }

    const id = nyttId(
      `INSERT INTO behorighetsgrupp (nyckel, namn, beskrivning, roll_golv, ordning)
       VALUES (?, ?, ?, ?, ?)`,
      nyckel,
      namn,
      txt(kropp.beskrivning, 400) ?? null,
      roll_golv ?? null,
      heltal(kropp.ordning, 0)
    );
    sattInnehall(id, behorigheter, Array.isArray(kropp.ytor) ? kropp.ytor : []);
    return svar(res, 201, gruppen(id));
  }),

  rutt('PATCH', '/api/tilltrade/grupper/:id', '@behorighetsstyrning', ({ res, param, kropp, medlem }) => {
    const g = en('SELECT * FROM behorighetsgrupp WHERE id=?', param.id);
    if (!g) throw fel(404, 'Gruppen finns inte');
    const roll_golv = kropp.roll_golv === undefined ? undefined : ettAv(kropp.roll_golv, ROLLGOLV, 'Rollgolv');
    const behorigheter = Array.isArray(kropp.behorigheter) ? kropp.behorigheter : null;
    provaDelning(medlem, { behorigheter, roll_golv });

    uppdatera('behorighetsgrupp', g.id, {
      namn: kropp.namn === undefined ? undefined : kravTxt(kropp.namn, 'Namn', 80),
      beskrivning: kropp.beskrivning === undefined ? undefined : txt(kropp.beskrivning, 400),
      roll_golv,
      ordning: kropp.ordning === undefined ? undefined : heltal(kropp.ordning, 0),
      aktiv: kropp.aktiv === undefined ? undefined : kropp.aktiv ? 1 : 0,
    });
    sattInnehall(g.id, behorigheter, Array.isArray(kropp.ytor) ? kropp.ytor : null);
    return svar(res, 200, gruppen(g.id));
  }),

  rutt('DELETE', '/api/tilltrade/grupper/:id', '@behorighetsstyrning', ({ res, param }) => {
    const g = en('SELECT * FROM behorighetsgrupp WHERE id=?', param.id);
    if (!g) throw fel(404, 'Gruppen finns inte');
    // Grundgrupperna hör till uppsättningen. Stäng av dem i stället – då
    // ligger historiken kvar över vem som varit med.
    if (g.inbyggd) throw fel(400, 'Grundgrupper går inte att ta bort. Stäng av den i stället.');
    kor('DELETE FROM behorighetsgrupp WHERE id=?', g.id);
    return svar(res, 200, { borttagen: true });
  }),

  rutt('POST', '/api/tilltrade/grupper/:id/medlemmar', '@behorighetsstyrning', ({ res, param, kropp, medlem }) => {
    const g = en('SELECT * FROM behorighetsgrupp WHERE id=?', param.id);
    if (!g) throw fel(404, 'Gruppen finns inte');
    const medlem_id = heltal(kropp.medlem_id);
    if (!medlem_id) throw fel(400, 'Välj en medlem');
    if (!en('SELECT id FROM medlem WHERE id=?', medlem_id)) throw fel(404, 'Medlemmen finns inte');

    const fanns = en('SELECT * FROM grupptillhorighet WHERE grupp_id=? AND medlem_id=?', g.id, medlem_id);
    if (fanns) {
      // Återinträde: samma rad öppnas igen i stället för att dubbleras.
      uppdatera('grupptillhorighet', fanns.id, {
        till: null,
        aterkallad: null,
        fran: datum(kropp.fran, 'Från') || new Date().toISOString().slice(0, 10),
        av_id: medlem.id,
      });
    } else {
      kor(
        'INSERT INTO grupptillhorighet (grupp_id, medlem_id, fran, till, av_id) VALUES (?, ?, ?, ?, ?)',
        g.id,
        medlem_id,
        datum(kropp.fran, 'Från') || new Date().toISOString().slice(0, 10),
        datum(kropp.till, 'Till') ?? null,
        medlem.id
      );
    }
    return svar(res, 201, gruppen(g.id));
  }),

  /**
   * Ut ur gruppen. Raden tas inte bort – den stängs, så att frågan "vem hade
   * kassabehörighet i mars" går att svara på.
   *
   * Tillträdet upphör i samma stund och inte vid midnatt: `aterkallad` är
   * det som räknas, `till` står kvar och berättar vilken dag det hände.
   */
  rutt('DELETE', '/api/tilltrade/grupper/:id/medlemmar/:medlem_id', '@behorighetsstyrning', ({ res, param }) => {
    const t = en(
      'SELECT * FROM grupptillhorighet WHERE grupp_id=? AND medlem_id=?',
      param.id,
      param.medlem_id
    );
    if (!t) throw fel(404, 'Tillhörigheten finns inte');
    uppdatera('grupptillhorighet', t.id, {
      till: new Date().toISOString().slice(0, 10),
      aterkallad: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    return svar(res, 200, gruppen(Number(param.id)));
  }),

  /** Grupperna en medlem är med i. Används av medlemsrutan i matrikeln. */
  rutt('GET', '/api/tilltrade/medlem/:id', '@medlemsregister', ({ res, param }) =>
    svar(res, 200, { grupper: grupperFor(Number(param.id)) })
  ),
];
