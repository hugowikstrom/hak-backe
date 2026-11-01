// Arbetsställen, påfyllningar och besiktningar.
//
// Modellen är den klubben redan arbetar efter: allt hänger på ett
// arbetsställe, och på ett objekt registreras händelser av några få slag.
// Volontärerna känner igen den, och igenkänning är värd mer än en modell
// som är snyggare på pappret.
//
// Påfyllningarna är nya för Backis och hör ihop med underhållet:
// mätarställningen vid tankning uppdaterar maskinens drifttimmar, och det
// är drifttimmarna serviceplanerna räknar på. En tankning som inte
// registreras gör att nästa service förfaller för sent.
import { alla, en, kor, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import { kronor } from '../pengar.mjs';
import { datum, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';

export const OBJEKTSLAG = ['utrustning', 'omrade', 'snoplats'];
export const PAFYLLNINGSSLAG = ['bransle', 'vatska'];

/**
 * Vätsketyperna en backe faktiskt fyller på. Står i koden och inte i en
 * egen tabell: listan ändras ungefär aldrig, och en tabell till hade bara
 * gett ett register att underhålla.
 */
export const VATSKETYPER = {
  diesel: { namn: 'Diesel', slag: 'bransle', enhet: 'liter' },
  bensin: { namn: 'Bensin', slag: 'bransle', enhet: 'liter' },
  adblue: { namn: 'AdBlue', slag: 'vatska', enhet: 'liter' },
  hydraulolja: { namn: 'Hydraulolja', slag: 'vatska', enhet: 'liter' },
  motorolja: { namn: 'Motorolja', slag: 'vatska', enhet: 'liter' },
  vaxelolja: { namn: 'Växelolja', slag: 'vatska', enhet: 'liter' },
  kylarvatska: { namn: 'Kylarvätska', slag: 'vatska', enhet: 'liter' },
  smorjfett: { namn: 'Smörjfett', slag: 'vatska', enhet: 'kg' },
  kompressorolja: { namn: 'Kompressorolja', slag: 'vatska', enhet: 'liter' },
  annat: { namn: 'Annat', slag: 'vatska', enhet: 'liter' },
};

export const BESIKTNINGSSLAG = ['besiktning', 'certifikat', 'tillstand'];

/** Arbetsställena som klubben redan har i sitt nuvarande system. */
export const ARBETSSTALLEN = [
  { nyckel: 'lift-pist', namn: 'Lift & Pist', ikon: 'lift', ordning: 1,
    beskrivning: 'Liftarna, bandet, nedfarterna och pistningen' },
  { nyckel: 'fordon', namn: 'Fordon', ikon: 'fordon', ordning: 2,
    beskrivning: 'Pistmaskin, skoter och övriga fordon' },
  { nyckel: 'snolaggning', namn: 'Snöläggning', ikon: 'sno', ordning: 3,
    beskrivning: 'Lansar, fläktar, pumpstation och kompressor' },
];

/**
 * Sår arbetsställena och knyter det som redan finns till rätt ställe.
 * Kopplingen görs på utrustningens typ: en lift hör till Lift & Pist,
 * en lans till Snöläggning. Det som inte passar lämnas okopplat hellre
 * än gissat – en maskin på fel arbetsställe är värre än en okopplad.
 */
export function sakerstallArbetsstallen() {
  for (const a of ARBETSSTALLEN)
    if (!en('SELECT id FROM arbetsstalle WHERE nyckel=?', a.nyckel))
      spara('arbetsstalle', a);

  const id = (nyckel) => en('SELECT id FROM arbetsstalle WHERE nyckel=?', nyckel)?.id;
  const knyt = (nyckel, slag, objekt_id) => {
    const a = id(nyckel);
    if (!a || !objekt_id) return;
    kor(
      'INSERT OR IGNORE INTO arbetsstalleobjekt (arbetsstalle_id, slag, objekt_id) VALUES (?,?,?)',
      a, slag, objekt_id
    );
  };

  const typtill = {
    lift: 'lift-pist', band: 'lift-pist', pistmaskin: 'fordon',
    lans: 'snolaggning', flakt: 'snolaggning', pumpstation: 'snolaggning',
    kompressor: 'snolaggning',
  };
  for (const u of alla('SELECT id, typ FROM utrustning'))
    if (typtill[u.typ]) knyt(typtill[u.typ], 'utrustning', u.id);

  // Nedfarterna hör till Lift & Pist, precis som i det gamla systemet.
  for (const o of alla("SELECT id, namn FROM omrade"))
    if (/backe|nedfart|lift|band/i.test(o.namn)) knyt('lift-pist', 'omrade', o.id);
  for (const p of alla('SELECT id FROM snoplats')) knyt('snolaggning', 'snoplats', p.id);

  return { arbetsstallen: en('SELECT count(*) AS n FROM arbetsstalle').n };
}

const objektFor = (a) => {
  const rader = alla('SELECT slag, objekt_id FROM arbetsstalleobjekt WHERE arbetsstalle_id=?', a.id);
  const hamta = (slag, tabell, extra = '') =>
    rader
      .filter((r) => r.slag === slag)
      .map((r) => en(`SELECT id, namn ${extra} FROM ${tabell} WHERE id=?`, r.objekt_id))
      .filter(Boolean)
      .map((o) => ({ ...o, slag }));
  return [
    ...hamta('utrustning', 'utrustning', ', typ, status, drifttimmar'),
    ...hamta('omrade', 'omrade'),
    ...hamta('snoplats', 'snoplats', ', slag AS platsslag'),
  ];
};

const berika = (a) => {
  const objekt = objektFor(a);
  const utr = objekt.filter((o) => o.slag === 'utrustning').map((o) => o.id);
  const hal = utr.map(() => '?').join(',');
  return {
    ...a,
    objekt,
    antal: objekt.length,
    // Siffror som säger om något behöver göras här. Noll visas inte i
    // klienten – samma regel som menyns notiser.
    avvikelser: utr.length
      ? en(
          `SELECT count(*) AS n FROM arende WHERE utrustning_id IN (${hal})
            AND status NOT IN ('atgardad','stangd')`,
          ...utr
        ).n
      : 0,
    besiktningar_snart: en(
      `SELECT count(*) AS n FROM besiktning WHERE arbetsstalle_id=?
        AND giltig_till IS NOT NULL AND giltig_till <= date('now','+60 day')`,
      a.id
    ).n,
  };
};

export const arbetsstallen = () =>
  alla('SELECT * FROM arbetsstalle WHERE aktiv=1 ORDER BY ordning, id').map(berika);

const kravStalle = (nyckel) => {
  const a = en('SELECT * FROM arbetsstalle WHERE nyckel=?', String(nyckel || ''));
  if (!a) throw fel(404, 'Arbetsstället finns inte');
  return a;
};

// ---------------------------------------------------------------------------

const pafyllningar = ({ utrustning_id, antal = 200 } = {}) =>
  alla(
    `SELECT p.*, u.namn AS utrustning FROM pafyllning p
       JOIN utrustning u ON u.id=p.utrustning_id
      ${utrustning_id ? 'WHERE p.utrustning_id=?' : ''}
      ORDER BY p.datum DESC, p.id DESC LIMIT ?`,
    ...(utrustning_id ? [utrustning_id] : []),
    antal
  ).map((p) => ({
    ...p,
    typnamn: VATSKETYPER[p.vatsketyp]?.namn || p.vatsketyp || '–',
    kostnad: p.kostnad_ore ? kronor(p.kostnad_ore) : null,
  }));

/**
 * Förbrukning mellan två påfyllningar. Går bara att räkna när
 * mätarställningen finns på båda – därför efterfrågas den, och därför
 * står den som tom i stället för som noll när den saknas.
 */
const forbrukning = (utrustning_id) => {
  const rader = alla(
    `SELECT datum, mangd, matarstallning FROM pafyllning
      WHERE utrustning_id=? AND matarstallning IS NOT NULL AND slag='bransle'
      ORDER BY matarstallning`,
    utrustning_id
  );
  if (rader.length < 2) return null;
  const forsta = rader[0];
  const sista = rader[rader.length - 1];
  const timmar = sista.matarstallning - forsta.matarstallning;
  // Första tankningens mängd hörde till timmarna före mätperioden.
  const liter = rader.slice(1).reduce((a, r) => a + r.mangd, 0);
  if (timmar <= 0) return null;
  return { timmar, liter, per_timme: liter / timmar };
};

export const rutter = [
  rutt('GET', '/api/arbetsstallen', 'medlem', ({ res }) =>
    svar(res, 200, {
      arbetsstallen: arbetsstallen(),
      vatsketyper: Object.entries(VATSKETYPER).map(([nyckel, v]) => ({ nyckel, ...v })),
    })
  ),

  rutt('GET', '/api/arbetsstallen/:nyckel', 'medlem', ({ res, param }) => {
    const a = kravStalle(param.nyckel);
    const objekt = objektFor(a);
    const utr = objekt.filter((o) => o.slag === 'utrustning').map((o) => o.id);
    const hal = utr.map(() => '?').join(',');
    svar(res, 200, {
      ...berika(a),
      // Allt som hänt här, i den ordning CheckProof visar det: öppna
      // avvikelser först, sedan senaste påfyllningar och besiktningar.
      avvikelselista: utr.length
        ? alla(
            `SELECT id, titel, status, prioritet, allvarlighet, skapad
               FROM arende WHERE utrustning_id IN (${hal})
                AND status NOT IN ('atgardad','stangd')
              ORDER BY prioritet, skapad DESC LIMIT 50`,
            ...utr
          )
        : [],
      pafyllningar: utr.length
        ? alla(
            `SELECT p.*, u.namn AS utrustning FROM pafyllning p JOIN utrustning u ON u.id=p.utrustning_id
              WHERE p.utrustning_id IN (${hal}) ORDER BY p.datum DESC LIMIT 20`,
            ...utr
          ).map((p) => ({ ...p, typnamn: VATSKETYPER[p.vatsketyp]?.namn || p.vatsketyp }))
        : [],
      besiktningar: alla(
        `SELECT b.*, u.namn AS utrustning FROM besiktning b
           LEFT JOIN utrustning u ON u.id=b.utrustning_id
          WHERE b.arbetsstalle_id=? OR b.utrustning_id IN (${hal || 'NULL'})
          ORDER BY b.giltig_till IS NULL, b.giltig_till LIMIT 50`,
        a.id,
        ...utr
      ),
    });
  }),

  // ---- Påfyllningar ----

  rutt('GET', '/api/pafyllningar', 'medlem', ({ res, fraga }) => {
    const utrustning_id = heltal(fraga.get('utrustning_id'));
    svar(res, 200, {
      pafyllningar: pafyllningar({ utrustning_id }),
      vatsketyper: Object.entries(VATSKETYPER).map(([nyckel, v]) => ({ nyckel, ...v })),
      forbrukning: utrustning_id ? forbrukning(utrustning_id) : null,
    });
  }),

  /**
   * Den som tankar registrerar. Ingen behörighet: alternativet är att det
   * inte blir registrerat alls, och då går underhållsplanerna fel.
   */
  rutt('POST', '/api/pafyllningar', 'medlem', ({ res, kropp, medlem }) => {
    const u = en('SELECT * FROM utrustning WHERE id=?', heltal(kropp.utrustning_id));
    if (!u) throw fel(404, 'Maskinen finns inte');
    const vatsketyp = ettAv(kropp.vatsketyp, Object.keys(VATSKETYPER), 'Vätsketyp') || 'diesel';
    const mangd = num(kropp.mangd);
    if (!Number.isFinite(mangd) || mangd <= 0) throw fel(400, 'Fyll i hur mycket du fyllde på');
    const matarstallning = num(kropp.matarstallning) ?? null;

    const id = spara('pafyllning', {
      utrustning_id: u.id,
      datum: datum(kropp.datum) || idag(),
      slag: VATSKETYPER[vatsketyp].slag,
      vatsketyp,
      mangd,
      matenhet: txt(kropp.matenhet, 10) || VATSKETYPER[vatsketyp].enhet,
      matarstallning,
      kostnad_ore: heltal(kropp.kostnad_ore) ?? null,
      anteckning: txt(kropp.anteckning, 500) ?? null,
      av_id: medlem.id,
      av: medlem.namn,
    });

    // Mätarställningen är färskare än det som står på maskinen, men bara
    // om den gått framåt. En felskrivning ska inte kunna backa timmarna.
    if (matarstallning != null && (!u.drifttimmar || matarstallning > u.drifttimmar))
      uppdatera('utrustning', u.id, { drifttimmar: matarstallning, matarstallning_tid: nu() });

    revidera({ medlem, handelse: 'registrerade påfyllning', objekt: u.namn,
      detalj: { vatsketyp, mangd } });
    svar(res, 201, en('SELECT * FROM pafyllning WHERE id=?', id));
  }),

  // ---- Besiktningar och certifikat ----

  rutt('GET', '/api/besiktningar', 'medlem', ({ res, fraga }) => {
    const bara = fraga.get('snart') === '1';
    svar(res, 200, {
      besiktningar: alla(
        `SELECT b.*, u.namn AS utrustning, a.namn AS arbetsstalle FROM besiktning b
           LEFT JOIN utrustning u ON u.id=b.utrustning_id
           LEFT JOIN arbetsstalle a ON a.id=b.arbetsstalle_id
          ${bara ? "WHERE b.giltig_till IS NOT NULL AND b.giltig_till <= date('now','+60 day')" : ''}
          ORDER BY b.giltig_till IS NULL, b.giltig_till`
      ).map((b) => ({
        ...b,
        utgangen: Boolean(b.giltig_till && b.giltig_till < idag()),
        dagar_kvar: b.giltig_till
          ? Math.round((new Date(b.giltig_till) - new Date(idag())) / 86400000)
          : null,
      })),
      slag: BESIKTNINGSSLAG,
    });
  }),

  rutt('POST', '/api/besiktningar', '@anlaggning', ({ res, kropp, medlem }) => {
    const utrustning_id = heltal(kropp.utrustning_id) ?? null;
    const a = kropp.arbetsstalle ? kravStalle(kropp.arbetsstalle) : null;
    if (!utrustning_id && !a) throw fel(400, 'Välj en maskin eller ett arbetsställe');
    const id = spara('besiktning', {
      utrustning_id,
      arbetsstalle_id: a?.id ?? null,
      slag: ettAv(kropp.slag, BESIKTNINGSSLAG, 'Slag') || 'besiktning',
      namn: kravTxt(kropp.namn, 'Namn', 120),
      utfard_av: txt(kropp.utfard_av, 120) ?? null,
      utfardad: datum(kropp.utfardad) ?? null,
      giltig_till: datum(kropp.giltig_till) ?? null,
      anmarkning: txt(kropp.anmarkning, 2000) ?? null,
      av_id: medlem.id,
    });
    revidera({ medlem, handelse: 'registrerade besiktning', objekt: kropp.namn });
    svar(res, 201, en('SELECT * FROM besiktning WHERE id=?', id));
  }),

  rutt('DELETE', '/api/besiktningar/:id', '@anlaggning', ({ res, param, medlem }) => {
    const b = en('SELECT * FROM besiktning WHERE id=?', heltal(param.id));
    if (!b) throw fel(404, 'Besiktningen finns inte');
    en('DELETE FROM besiktning WHERE id=? RETURNING id', b.id);
    revidera({ medlem, handelse: 'tog bort besiktning', objekt: b.namn });
    svar(res, 200, { borttagen: b.id });
  }),
];
