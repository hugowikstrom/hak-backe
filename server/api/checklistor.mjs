// Checklistor: mallar, punkter och körningar. En avvikelse kan direkt bli ett ärende.
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { bool, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { skapaArende } from './arenden.mjs';
import { bildfinns, sparaBild } from './bilder.mjs';
import { rondlage } from '../rond.mjs';
import { aktivSasong, omradeslista, utrustningslista } from './register.mjs';
import { idag } from '../tid.mjs';

const INTERVALL = ['vid_start', 'per_pass', 'dagligen', 'veckovis', 'sasong'];
const OMFATTNING = ['utrustningstyp', 'omrade', 'allmant'];

export const mallMedPunkter = (id) => {
  const m = en('SELECT * FROM checklistmall WHERE id=?', id);
  if (!m) return null;
  return { ...m, punkter: alla('SELECT * FROM checklistpunkt WHERE mall_id=? ORDER BY ordning, id', id) };
};

export const mallar = () =>
  alla('SELECT * FROM checklistmall ORDER BY aktiv DESC, ordning, namn').map((m) => ({
    ...m,
    punkter: alla('SELECT * FROM checklistpunkt WHERE mall_id=? ORDER BY ordning, id', m.id),
  }));

const KORNING_SQL = `
  SELECT k.*, mall.namn AS mall, mall.intervall, u.namn AS utrustning, u.typ AS utrustningstyp,
         o.namn AS omrade, me.namn AS av,
         (SELECT count(*) FROM checklistpunkt WHERE mall_id=k.mall_id) AS antal_punkter,
         (SELECT count(*) FROM checklistsvar s WHERE s.korning_id=k.id AND (s.bockad=1 OR s.varde IS NOT NULL OR s.text IS NOT NULL)) AS antal_svar,
         (SELECT count(*) FROM checklistsvar s WHERE s.korning_id=k.id AND s.avvikelse=1) AS antal_avvikelser
  FROM checklistkorning k
  JOIN checklistmall mall ON mall.id=k.mall_id
  LEFT JOIN utrustning u ON u.id=k.utrustning_id
  LEFT JOIN omrade o ON o.id=k.omrade_id
  LEFT JOIN medlem me ON me.id=k.av_id`;

export const korning = (id) => {
  const k = en(`${KORNING_SQL} WHERE k.id=?`, id);
  if (!k) return null;
  const punkter = alla(
    `SELECT p.*, s.id AS svar_id, s.bockad, s.varde, s.text AS svarstext, s.avvikelse, s.kommentar, s.bild, s.tid AS svarstid
     FROM checklistpunkt p LEFT JOIN checklistsvar s ON s.punkt_id=p.id AND s.korning_id=?
     WHERE p.mall_id=? ORDER BY p.ordning, p.id`,
    id,
    k.mall_id
  );
  return { ...k, punkter };
};

/** Mallar som gäller för en viss utrustning (typ) eller ett område. */
export function mallarFor({ utrustning_id, omrade_id }) {
  const u = utrustning_id ? en('SELECT * FROM utrustning WHERE id=?', utrustning_id) : null;
  return alla(
    `SELECT * FROM checklistmall WHERE aktiv=1 AND (
        omfattning='allmant'
        OR (omfattning='utrustningstyp' AND utrustningstyp=?)
        OR (omfattning='omrade' AND omrade_id=?))
     ORDER BY ordning, namn`,
    u?.typ ?? null,
    omrade_id ?? u?.omrade_id ?? null
  );
}

/** Vilka ronder som ska göras i dag, och vilka som redan är gjorda. */
export function lage(datum = idag()) {
  const snopass = en("SELECT start FROM snopass WHERE status='pagar' ORDER BY start DESC LIMIT 1");
  const sasong = aktivSasong();
  return rondlage({
    mallar: alla('SELECT * FROM checklistmall WHERE aktiv=1 ORDER BY ordning, namn').map((m) => ({
      ...m,
      punkter: alla('SELECT id FROM checklistpunkt WHERE mall_id=?', m.id),
    })),
    utrustning: utrustningslista(),
    omraden: omradeslista(),
    korningar: alla(
      `SELECT k.mall_id, k.utrustning_id, k.omrade_id, k.avslutad, m.namn AS av
       FROM checklistkorning k LEFT JOIN medlem m ON m.id=k.av_id
       WHERE k.status='klar' AND k.avslutad IS NOT NULL AND k.avslutad >= date('now','-21 days')`
    ),
    datum,
    snopassStart: snopass?.start || null,
    sasongStart: sasong?.start || null,
  });
}

export const rutter = [
  rutt('GET', '/api/checklistor/mallar', 'medlem', ({ res }) => svar(res, 200, mallar())),

  rutt('GET', '/api/checklistor/lage', 'medlem', ({ res, fraga }) =>
    svar(res, 200, lage(fraga.get('datum') || undefined))
  ),

  rutt('GET', '/api/checklistor/for', 'medlem', ({ res, fraga }) =>
    svar(res, 200, mallarFor({
      utrustning_id: heltal(fraga.get('utrustning_id')),
      omrade_id: heltal(fraga.get('omrade_id')),
    }))
  ),

  rutt('POST', '/api/checklistor/mallar', 'backansvarig', ({ res, kropp }) => {
    const id = spara('checklistmall', {
      namn: kravTxt(kropp.namn, 'Namn', 120),
      omfattning: ettAv(kropp.omfattning, OMFATTNING, 'Omfattning') || 'allmant',
      utrustningstyp: txt(kropp.utrustningstyp, 40),
      omrade_id: heltal(kropp.omrade_id),
      intervall: ettAv(kropp.intervall, INTERVALL, 'Intervall') || 'per_pass',
      beskrivning: txt(kropp.beskrivning),
      ordning: heltal(kropp.ordning, 0),
    });
    for (const [i, p] of (kropp.punkter || []).entries()) {
      spara('checklistpunkt', {
        mall_id: id,
        ordning: heltal(p.ordning, i),
        text: kravTxt(p.text, 'Punkttext', 400),
        hjalptext: txt(p.hjalptext),
        svarstyp: ettAv(p.svarstyp, ['bock', 'varde', 'text'], 'Svarstyp') || 'bock',
        enhet: txt(p.enhet, 16),
        obligatorisk: bool(p.obligatorisk) ?? 1,
      });
    }
    svar(res, 201, mallMedPunkter(id));
  }),

  rutt('PUT', '/api/checklistor/mallar/:id', 'backansvarig', ({ res, param, kropp }) => {
    const m = en('SELECT * FROM checklistmall WHERE id=?', param.id);
    if (!m) throw fel(404, 'Mallen finns inte');
    transaktion(() => {
      uppdatera('checklistmall', m.id, {
        namn: txt(kropp.namn, 120),
        omfattning: ettAv(kropp.omfattning, OMFATTNING, 'Omfattning'),
        utrustningstyp: kropp.utrustningstyp === undefined ? undefined : txt(kropp.utrustningstyp, 40),
        omrade_id: kropp.omrade_id === undefined ? undefined : heltal(kropp.omrade_id),
        intervall: ettAv(kropp.intervall, INTERVALL, 'Intervall'),
        beskrivning: kropp.beskrivning === undefined ? undefined : txt(kropp.beskrivning),
        aktiv: bool(kropp.aktiv),
        ordning: kropp.ordning === undefined ? undefined : heltal(kropp.ordning, 0),
      });
      if (Array.isArray(kropp.punkter)) {
        const kvar = kropp.punkter.filter((p) => p.id).map((p) => Number(p.id));
        for (const p of alla('SELECT id FROM checklistpunkt WHERE mall_id=?', m.id)) {
          if (!kvar.includes(p.id)) kor('DELETE FROM checklistpunkt WHERE id=?', p.id);
        }
        for (const [i, p] of kropp.punkter.entries()) {
          const data = {
            ordning: i,
            text: kravTxt(p.text, 'Punkttext', 400),
            hjalptext: txt(p.hjalptext),
            svarstyp: ettAv(p.svarstyp, ['bock', 'varde', 'text'], 'Svarstyp') || 'bock',
            enhet: txt(p.enhet, 16),
            obligatorisk: bool(p.obligatorisk) ?? 1,
          };
          if (p.id) uppdatera('checklistpunkt', p.id, data);
          else spara('checklistpunkt', { mall_id: m.id, ...data });
        }
      }
    });
    svar(res, 200, mallMedPunkter(m.id));
  }),

  // ---- körningar ----
  rutt('POST', '/api/checklistor/mallar/:id/kopia', 'backansvarig', ({ res, param }) => {
    const m = mallMedPunkter(param.id);
    if (!m) throw fel(404, 'Mallen finns inte');
    const id = transaktion(() => {
      const ny = spara('checklistmall', {
        namn: `${m.namn} (kopia)`.slice(0, 120),
        omfattning: m.omfattning,
        utrustningstyp: m.utrustningstyp,
        omrade_id: m.omrade_id,
        intervall: m.intervall,
        beskrivning: m.beskrivning,
        aktiv: 0,
        ordning: m.ordning,
      });
      for (const p of m.punkter)
        spara('checklistpunkt', {
          mall_id: ny, ordning: p.ordning, text: p.text, hjalptext: p.hjalptext,
          svarstyp: p.svarstyp, enhet: p.enhet, obligatorisk: p.obligatorisk,
        });
      return ny;
    });
    svar(res, 201, mallMedPunkter(id));
  }),

  rutt('DELETE', '/api/checklistor/mallar/:id', 'backansvarig', ({ res, param }) => {
    const m = en('SELECT * FROM checklistmall WHERE id=?', param.id);
    if (!m) throw fel(404, 'Mallen finns inte');
    const korda = en('SELECT count(*) AS n FROM checklistkorning WHERE mall_id=?', m.id).n;
    // En mall som använts får inte försvinna – historiken ska finnas kvar.
    if (korda) {
      uppdatera('checklistmall', m.id, { aktiv: 0 });
      return svar(res, 200, { borttagen: false, inaktiverad: true, korningar: korda });
    }
    kor('DELETE FROM checklistmall WHERE id=?', m.id);
    svar(res, 200, { borttagen: true });
  }),

  rutt('GET', '/api/checklistor/korningar', 'medlem', ({ res, fraga }) => {
    const villkor = [];
    const p = [];
    if (fraga.get('status')) { villkor.push('k.status=?'); p.push(fraga.get('status')); }
    if (fraga.get('utrustning_id')) { villkor.push('k.utrustning_id=?'); p.push(heltal(fraga.get('utrustning_id'))); }
    if (fraga.get('mall_id')) { villkor.push('k.mall_id=?'); p.push(heltal(fraga.get('mall_id'))); }
    svar(res, 200, alla(
      `${KORNING_SQL} ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''}
       ORDER BY k.startad DESC LIMIT ?`,
      ...p,
      heltal(fraga.get('antal'), 100)
    ));
  }),

  rutt('GET', '/api/checklistor/korningar/:id', 'medlem', ({ res, param }) => {
    const k = korning(param.id);
    if (!k) throw fel(404, 'Körningen finns inte');
    svar(res, 200, k);
  }),

  rutt('POST', '/api/checklistor/korningar', 'medlem', ({ res, kropp, medlem }) => {
    const mall = en('SELECT * FROM checklistmall WHERE id=?', heltal(kropp.mall_id));
    if (!mall) throw fel(400, 'Välj en checklista');
    const id = spara('checklistkorning', {
      mall_id: mall.id,
      utrustning_id: heltal(kropp.utrustning_id),
      omrade_id: heltal(kropp.omrade_id),
      snopass_id: heltal(kropp.snopass_id),
      av_id: medlem.id,
      kalla: ettAv(kropp.kalla, ['webb', 'mobil'], 'Källa') || 'webb',
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 201, korning(id));
  }),

  rutt('PUT', '/api/checklistor/svar/:korning/:punkt', 'medlem', ({ res, param, kropp }) => {
    const k = en('SELECT * FROM checklistkorning WHERE id=?', param.korning);
    if (!k) throw fel(404, 'Körningen finns inte');
    const p = en('SELECT * FROM checklistpunkt WHERE id=? AND mall_id=?', param.punkt, k.mall_id);
    if (!p) throw fel(404, 'Punkten hör inte till checklistan');
    let bild;
    if (kropp.bild !== undefined) {
      if (kropp.bild === null || kropp.bild === '') bild = null;
      else if (String(kropp.bild).startsWith('data:')) bild = sparaBild(kropp.bild);
      else if (bildfinns(kropp.bild)) bild = kropp.bild;
      else throw fel(400, 'Okänd bild');
    }
    const data = {
      bockad: bool(kropp.bockad) ?? 0,
      varde: kropp.varde === undefined ? undefined : num(kropp.varde),
      text: kropp.text === undefined ? undefined : txt(kropp.text),
      avvikelse: bool(kropp.avvikelse) ?? 0,
      kommentar: kropp.kommentar === undefined ? undefined : txt(kropp.kommentar),
      bild,
      tid: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };
    const fanns = en('SELECT id FROM checklistsvar WHERE korning_id=? AND punkt_id=?', k.id, p.id);
    if (fanns) uppdatera('checklistsvar', fanns.id, data);
    else spara('checklistsvar', { korning_id: k.id, punkt_id: p.id, ...data });
    svar(res, 200, korning(k.id));
  }),

  rutt('POST', '/api/checklistor/korningar/:id/avsluta', 'medlem', ({ res, param, kropp, medlem }) => {
    const k = korning(param.id);
    if (!k) throw fel(404, 'Körningen finns inte');
    const saknas = k.punkter.filter(
      (p) => p.obligatorisk && !p.bockad && p.varde == null && !p.svarstext
    );
    if (saknas.length && !kropp.tvinga)
      throw fel(400, `${saknas.length} obligatoriska punkter saknar svar`);
    uppdatera('checklistkorning', k.id, {
      status: 'klar',
      avslutad: new Date().toISOString().slice(0, 19).replace('T', ' '),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
    });
    // Avvikelser blir ärenden om de inte redan gjort det.
    const nya = [];
    if (kropp.skapa_arenden !== false) {
      for (const p of k.punkter.filter((p) => p.avvikelse)) {
        const titel = `${k.mall}: ${p.text}`.slice(0, 160);
        const finns = en(
          `SELECT id FROM arende WHERE korning_id=? AND titel=? AND status NOT IN ('stangd')`,
          k.id,
          titel
        );
        if (finns) continue;
        nya.push(
          skapaArende(
            {
              titel,
              beskrivning:
                [p.kommentar, p.hjalptext, p.bild ? `Bild: /api/bilder/${p.bild}` : null]
                  .filter(Boolean)
                  .join('\n\n') || null,
              typ: 'brist',
              prioritet: 2,
              allvarlighet: 'begransar',
              utrustning_id: k.utrustning_id,
              omrade_id: k.omrade_id,
              korning_id: k.id,
            },
            medlem
          )
        );
      }
    }
    svar(res, 200, { korning: korning(k.id), nya_arenden: nya });
  }),
];
