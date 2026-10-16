// Föreningen: sektioner, träningsgrupper och uppdrag.
import { alla, en, kor, spara, uppdatera } from '../db.mjs';
import { far, STYRELSEN, UPPDRAG, uppdragFor } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import { datum, ettAv, fel, heltal, kravTxt, rutt, svar, txt } from '../http.mjs';

export const sektioner = () =>
  alla('SELECT * FROM sektion ORDER BY ordning, namn').map((s) => ({
    ...s,
    grupper: alla('SELECT * FROM traningsgrupp WHERE sektion_id=? ORDER BY ordning, namn', s.id).map(medRakning),
  }));

const medRakning = (g) => ({
  ...g,
  antal_aktiva: en("SELECT count(*) AS n FROM gruppmedlem WHERE grupp_id=? AND roll='aktiv'", g.id).n,
  tranare: alla(
    `SELECT m.id, m.namn FROM gruppmedlem gm JOIN medlem m ON m.id=gm.medlem_id
     WHERE gm.grupp_id=? AND gm.roll IN ('tranare','hjalptranare') ORDER BY m.namn`,
    g.id
  ),
});

export const grupp = (id) => {
  const g = en(
    `SELECT g.*, s.namn AS sektion FROM traningsgrupp g LEFT JOIN sektion s ON s.id=g.sektion_id WHERE g.id=?`,
    id
  );
  if (!g) return null;
  return {
    ...medRakning(g),
    medlemmar: alla(
      `SELECT gm.id, gm.roll, gm.fran, gm.till, m.id AS medlem_id, m.namn, m.epost, m.telefon
       FROM gruppmedlem gm JOIN medlem m ON m.id=gm.medlem_id
       WHERE gm.grupp_id=? ORDER BY gm.roll, m.namn`,
      id
    ),
  };
};

export const styrelsen = () =>
  alla(
    `SELECT u.*, m.namn, m.epost, m.telefon FROM uppdrag u JOIN medlem m ON m.id=u.medlem_id
     WHERE u.slag IN (${STYRELSEN.map(() => '?').join(',')}) AND (u.till IS NULL OR u.till >= date('now'))
     ORDER BY CASE u.slag ${STYRELSEN.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE 99 END, m.namn`,
    ...STYRELSEN
  );

export const rutter = [
  rutt('GET', '/api/forening', 'medlem', ({ res, medlem }) =>
    svar(res, 200, {
      sektioner: sektioner(),
      styrelse: styrelsen(),
      uppdragsslag: UPPDRAG,
      mina_uppdrag: uppdragFor(medlem.id),
    })
  ),

  rutt('GET', '/api/forening/grupper/:id', 'medlem', ({ res, param }) => {
    const g = grupp(param.id);
    if (!g) throw fel(404, 'Gruppen finns inte');
    svar(res, 200, g);
  }),

  rutt('POST', '/api/forening/sektioner', '@medlemsregister', ({ res, kropp, medlem }) => {
    const id = spara('sektion', {
      nyckel: kravTxt(kropp.nyckel, 'Nyckel', 30).toLowerCase().replace(/\s+/g, '-'),
      namn: kravTxt(kropp.namn, 'Namn', 60),
      beskrivning: txt(kropp.beskrivning, 300),
      ordning: heltal(kropp.ordning, 0),
    });
    revidera({ medlem, handelse: 'lade upp sektion', objekt: kropp.namn });
    svar(res, 201, en('SELECT * FROM sektion WHERE id=?', id));
  }),

  rutt('PUT', '/api/forening/sektioner/:id', '@medlemsregister', ({ res, param, kropp }) => {
    uppdatera('sektion', param.id, {
      namn: txt(kropp.namn, 60),
      beskrivning: kropp.beskrivning === undefined ? undefined : txt(kropp.beskrivning, 300),
      ordning: kropp.ordning === undefined ? undefined : heltal(kropp.ordning, 0),
      aktiv: kropp.aktiv === undefined ? undefined : kropp.aktiv ? 1 : 0,
    });
    svar(res, 200, en('SELECT * FROM sektion WHERE id=?', param.id));
  }),

  rutt('POST', '/api/forening/grupper', '@traning', ({ res, kropp, medlem }) => {
    const id = spara('traningsgrupp', {
      sektion_id: heltal(kropp.sektion_id),
      namn: kravTxt(kropp.namn, 'Namn', 60),
      aldersspann: txt(kropp.aldersspann, 30),
      beskrivning: txt(kropp.beskrivning, 300),
      dag: txt(kropp.dag, 60),
      tid: txt(kropp.tid, 30),
      ordning: heltal(kropp.ordning, 0),
    });
    revidera({ medlem, handelse: 'lade upp träningsgrupp', objekt: kropp.namn });
    svar(res, 201, grupp(id));
  }),

  rutt('PUT', '/api/forening/grupper/:id', '@traning', ({ res, param, kropp }) => {
    uppdatera('traningsgrupp', param.id, {
      namn: txt(kropp.namn, 60),
      sektion_id: kropp.sektion_id === undefined ? undefined : heltal(kropp.sektion_id),
      aldersspann: kropp.aldersspann === undefined ? undefined : txt(kropp.aldersspann, 30),
      beskrivning: kropp.beskrivning === undefined ? undefined : txt(kropp.beskrivning, 300),
      dag: kropp.dag === undefined ? undefined : txt(kropp.dag, 60),
      tid: kropp.tid === undefined ? undefined : txt(kropp.tid, 30),
      ordning: kropp.ordning === undefined ? undefined : heltal(kropp.ordning, 0),
      aktiv: kropp.aktiv === undefined ? undefined : kropp.aktiv ? 1 : 0,
    });
    svar(res, 200, grupp(param.id));
  }),

  rutt('POST', '/api/forening/grupper/:id/medlemmar', '@traning', ({ res, param, kropp, medlem }) => {
    const g = en('SELECT * FROM traningsgrupp WHERE id=?', param.id);
    if (!g) throw fel(404, 'Gruppen finns inte');
    const m = en('SELECT * FROM medlem WHERE id=?', heltal(kropp.medlem_id));
    if (!m) throw fel(404, 'Medlemmen finns inte');
    const roll = ettAv(kropp.roll, ['aktiv', 'tranare', 'hjalptranare', 'foralder'], 'Roll') || 'aktiv';
    if (en('SELECT id FROM gruppmedlem WHERE grupp_id=? AND medlem_id=? AND roll=?', g.id, m.id, roll))
      throw fel(409, `${m.namn} finns redan i gruppen som ${roll}`);
    spara('gruppmedlem', { grupp_id: g.id, medlem_id: m.id, roll, fran: datum(kropp.fran, 'Från') });
    // Tränaruppdrag ger behörighet till träningsdelen.
    if (roll === 'tranare' && !en("SELECT id FROM uppdrag WHERE medlem_id=? AND slag='tranare' AND grupp_id=?", m.id, g.id))
      spara('uppdrag', { medlem_id: m.id, slag: 'tranare', grupp_id: g.id, sektion_id: g.sektion_id });
    revidera({ medlem, handelse: `lade till ${roll} i grupp`, objekt: g.namn, detalj: m.namn });
    svar(res, 201, grupp(g.id));
  }),

  rutt('DELETE', '/api/forening/gruppmedlemmar/:id', '@traning', ({ res, param, medlem }) => {
    const rad = en('SELECT * FROM gruppmedlem WHERE id=?', param.id);
    if (!rad) throw fel(404, 'Finns inte');
    kor('DELETE FROM gruppmedlem WHERE id=?', rad.id);
    if (rad.roll === 'tranare') kor("DELETE FROM uppdrag WHERE medlem_id=? AND slag='tranare' AND grupp_id=?", rad.medlem_id, rad.grupp_id);
    revidera({ medlem, handelse: 'tog bort gruppmedlem', objekt: String(rad.grupp_id) });
    svar(res, 200, { ok: true });
  }),

  rutt('GET', '/api/forening/uppdrag', '@medlemsregister', ({ res }) =>
    svar(res, 200, alla(
      `SELECT u.*, m.namn, s.namn AS sektion, g.namn AS grupp FROM uppdrag u
       JOIN medlem m ON m.id=u.medlem_id
       LEFT JOIN sektion s ON s.id=u.sektion_id
       LEFT JOIN traningsgrupp g ON g.id=u.grupp_id
       ORDER BY u.slag, m.namn`
    ))
  ),

  rutt('POST', '/api/forening/uppdrag', '@medlemsregister', ({ res, kropp, medlem }) => {
    const m = en('SELECT * FROM medlem WHERE id=?', heltal(kropp.medlem_id));
    if (!m) throw fel(404, 'Medlemmen finns inte');
    const slag = ettAv(kropp.slag, Object.keys(UPPDRAG), 'Uppdrag');
    if (!slag) throw fel(400, 'Uppdrag krävs');
    const id = spara('uppdrag', {
      medlem_id: m.id,
      slag,
      sektion_id: heltal(kropp.sektion_id),
      grupp_id: heltal(kropp.grupp_id),
      fran: datum(kropp.fran, 'Från'),
      till: datum(kropp.till, 'Till'),
      anteckning: txt(kropp.anteckning, 200),
    });
    revidera({ medlem, handelse: `gav uppdraget ${slag}`, objekt: m.namn });
    svar(res, 201, en('SELECT * FROM uppdrag WHERE id=?', id));
  }),

  rutt('DELETE', '/api/forening/uppdrag/:id', '@medlemsregister', ({ res, param, medlem }) => {
    const u = en('SELECT u.*, m.namn FROM uppdrag u JOIN medlem m ON m.id=u.medlem_id WHERE u.id=?', param.id);
    if (!u) throw fel(404, 'Uppdraget finns inte');
    kor('DELETE FROM uppdrag WHERE id=?', u.id);
    revidera({ medlem, handelse: `tog bort uppdraget ${u.slag}`, objekt: u.namn });
    svar(res, 200, { ok: true });
  }),
];
