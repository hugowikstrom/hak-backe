// Samåkning: vem kör och vem åker med.
//
// Härnösand till Kläppen är fyrtio mil tur och retur, och klubben har ett
// tjugotal familjer. Att det sitter en förälder per bil är varken billigt
// eller trevligt, men samordningen sker i dag i en Messenger-tråd där den
// som skriver sist blir ihågkommen. Här ligger den i stället där resan
// ligger.
//
// Ingen behörighet krävs för att erbjuda eller boka plats – det är hela
// idén. Det som är skyddat är kontaktuppgifterna: telefonnumret syns för
// föraren och för dem som faktiskt sitter i bilen, inte för alla som
// råkar titta på listan.
import { alla, en, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import { ettAv, fel, heltal, kravTxt, rutt, svar, tidpunkt, txt } from '../http.mjs';

const STATUSAR = ['oppen', 'installd'];

const RAD = `SELECT s.*, f.namn AS forare, f.telefon AS forare_telefon,
                    e.namn AS evenemang, e.start AS evenemang_start
             FROM samakning s
             JOIN medlem f ON f.id=s.forare_id
             LEFT JOIN evenemang e ON e.id=s.evenemang_id`;

export const hamta = (id) => en(`${RAD} WHERE s.id=?`, id);

const platser = (samakning_id) =>
  alla(
    `SELECT p.*, m.namn AS medlem, m.telefon
     FROM samakningsplats p JOIN medlem m ON m.id=p.medlem_id
     WHERE p.samakning_id=? AND p.status='bokad'
     ORDER BY p.skapad, p.id`,
    samakning_id
  );

/**
 * Kontaktuppgifter visas för föraren, för medpassagerarna och för den som
 * arrangerar evenemanget. Inte för övriga – en lista över vem som åker
 * vart med vem är känsligare än den ser ut.
 */
const berika = (s, medlem) => {
  const alla_platser = platser(s.id);
  const min = alla_platser.find((p) => p.medlem_id === medlem.id) || null;
  const inblandad = s.forare_id === medlem.id || Boolean(min) || far(medlem, 'evenemang');
  return {
    ...s,
    forare_telefon: inblandad ? s.forare_telefon : null,
    platser_kvar: Math.max(0, s.platser - alla_platser.length),
    fullt: alla_platser.length >= s.platser,
    passagerare: alla_platser.map((p) => ({
      id: p.id,
      medlem_id: p.medlem_id,
      medlem: p.medlem,
      pastigning: p.pastigning,
      telefon: inblandad ? p.telefon : null,
    })),
    min_plats: min ? { id: min.id, pastigning: min.pastigning } : null,
    jag_kor: s.forare_id === medlem.id,
  };
};

export const samakningar = ({ evenemang_id, kommande = true, antal = 200 } = {}) => {
  const villkor = [];
  const varden = [];
  if (evenemang_id) { villkor.push('s.evenemang_id=?'); varden.push(evenemang_id); }
  if (kommande) villkor.push("date(s.avresa) >= date('now') AND s.status='oppen'");
  return alla(
    `${RAD} ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''} ORDER BY s.avresa, s.id LIMIT ?`,
    ...varden,
    antal
  );
};

const kravSamakning = (id) => {
  const s = hamta(heltal(id));
  if (!s) throw fel(404, 'Samåkningen finns inte');
  return s;
};

const agare = (s, medlem) => {
  if (s.forare_id !== medlem.id && !far(medlem, 'evenemang'))
    throw fel(403, 'Det är inte din bil');
};

export const rutter = [
  rutt('GET', '/api/samakning', 'medlem', ({ res, fraga, medlem }) =>
    svar(res, 200, {
      samakningar: samakningar({
        evenemang_id: heltal(fraga.get('evenemang')) ?? null,
        kommande: fraga.get('alla') !== '1',
      }).map((s) => berika(s, medlem)),
      // Resor att knyta en samåkning till. Fri avresa går också bra.
      evenemang: alla(
        `SELECT id, namn, slag, start, plats FROM evenemang
         WHERE start >= date('now') AND status <> 'installt' ORDER BY start LIMIT 50`
      ),
    })
  ),

  rutt('GET', '/api/samakning/:id', 'medlem', ({ res, param, medlem }) =>
    svar(res, 200, berika(kravSamakning(param.id), medlem))
  ),

  /** Erbjud plats i bilen. Varje medlem får göra det. */
  rutt('POST', '/api/samakning', 'medlem', ({ res, kropp, medlem }) => {
    const platser_i_bilen = heltal(kropp.platser, 0) || 0;
    if (platser_i_bilen < 1) throw fel(400, 'Hur många platser har du?');
    if (platser_i_bilen > 8) throw fel(400, 'Fler än åtta platser är nog en buss – skriv den i anteckningen');
    const evenemang_id = heltal(kropp.evenemang_id) ?? null;
    if (evenemang_id && !en('SELECT id FROM evenemang WHERE id=?', evenemang_id))
      throw fel(404, 'Evenemanget finns inte');
    const id = spara('samakning', {
      evenemang_id,
      forare_id: heltal(kropp.forare_id) ?? medlem.id,
      fran: kravTxt(kropp.fran, 'Varifrån', 120),
      avresa: tidpunkt(kropp.avresa, 'Avresa') || kravTxt(kropp.avresa, 'Avresa', 30),
      platser: platser_i_bilen,
      bil: txt(kropp.bil, 80) ?? null,
      anteckning: txt(kropp.anteckning, 500) ?? null,
    });
    revidera({ medlem, handelse: 'erbjöd samåkning', objekt: kropp.fran });
    svar(res, 201, berika(hamta(id), medlem));
  }),

  rutt('PUT', '/api/samakning/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const s = kravSamakning(param.id);
    agare(s, medlem);
    const bokade = platser(s.id).length;
    const falt = {};
    if (kropp.fran !== undefined) falt.fran = kravTxt(kropp.fran, 'Varifrån', 120);
    if (kropp.avresa !== undefined) falt.avresa = tidpunkt(kropp.avresa, 'Avresa');
    if (kropp.bil !== undefined) falt.bil = txt(kropp.bil, 80) ?? null;
    if (kropp.anteckning !== undefined) falt.anteckning = txt(kropp.anteckning, 500) ?? null;
    if (kropp.status !== undefined) falt.status = ettAv(kropp.status, STATUSAR, 'Status');
    if (kropp.platser !== undefined) {
      const nytt = heltal(kropp.platser, 0) || 0;
      // Platserna får inte krympas under dem som redan sitter där. Den som
      // ska lämnas kvar måste bli avbokad med ett ord, inte av ett fält.
      if (nytt < bokade) throw fel(409, `${bokade} har redan bokat plats – säg till dem först`);
      falt.platser = nytt;
    }
    uppdatera('samakning', s.id, falt);
    svar(res, 200, berika(hamta(s.id), medlem));
  }),

  /** Ställ in resan. Platserna blir kvar som historik. */
  rutt('DELETE', '/api/samakning/:id', 'medlem', ({ res, param, medlem }) => {
    const s = kravSamakning(param.id);
    agare(s, medlem);
    uppdatera('samakning', s.id, { status: 'installd' });
    revidera({ medlem, handelse: 'ställde in samåkning', objekt: `${s.fran} ${s.avresa}` });
    svar(res, 200, { ...berika(hamta(s.id), medlem), passagerare_att_meddela: platser(s.id).length });
  }),

  /** Boka plats. Som standard till sig själv. */
  rutt('POST', '/api/samakning/:id/plats', 'medlem', ({ res, param, kropp, medlem }) => {
    const s = kravSamakning(param.id);
    if (s.status !== 'oppen') throw fel(409, 'Resan är inställd');
    const for_id = heltal(kropp.medlem_id) ?? medlem.id;
    if (for_id !== medlem.id && s.forare_id !== medlem.id && !far(medlem, 'evenemang'))
      throw fel(403, 'Du får bara boka plats till dig själv');
    if (for_id === s.forare_id) throw fel(400, 'Föraren sitter redan i bilen');
    const m = en('SELECT id, namn FROM medlem WHERE id=?', for_id);
    if (!m) throw fel(404, 'Medlemmen finns inte');
    const bokade = platser(s.id);
    const fanns = en('SELECT * FROM samakningsplats WHERE samakning_id=? AND medlem_id=?', s.id, for_id);
    if (fanns?.status === 'bokad') throw fel(409, `${m.namn} har redan plats`);
    if (bokade.length >= s.platser) throw fel(409, 'Bilen är full');
    const pastigning = txt(kropp.pastigning, 120) ?? null;
    if (fanns) uppdatera('samakningsplats', fanns.id, { status: 'bokad', pastigning });
    else spara('samakningsplats', { samakning_id: s.id, medlem_id: for_id, pastigning });
    revidera({ medlem, handelse: 'bokade samåkning', objekt: `${s.fran} ${s.avresa}`, detalj: m.namn });
    svar(res, 201, berika(hamta(s.id), medlem));
  }),

  rutt('DELETE', '/api/samakning/:id/plats/:plats', 'medlem', ({ res, param, medlem }) => {
    const s = kravSamakning(param.id);
    const p = en('SELECT * FROM samakningsplats WHERE id=? AND samakning_id=?', heltal(param.plats), s.id);
    if (!p) throw fel(404, 'Platsen finns inte');
    if (p.medlem_id !== medlem.id && s.forare_id !== medlem.id && !far(medlem, 'evenemang'))
      throw fel(403, 'Du får bara avboka din egen plats');
    uppdatera('samakningsplats', p.id, { status: 'avbokad' });
    svar(res, 200, berika(hamta(s.id), medlem));
  }),
];
