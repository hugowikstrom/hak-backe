// Checklistor: mallar, punkter och körningar. En avvikelse kan direkt bli ett ärende.
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { bool, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { minstRoll } from '../behorighet.mjs';
import { maskinPa, platser as snoplatser, PLATSSLAG } from '../platser.mjs';
import { skapaArende } from './arenden.mjs';
import { skapaPost } from './drift.mjs';
import { modulPa } from '../moduldata.mjs';
import { aktuellForening } from '../db.mjs';
import { bildfinns, sparaBild } from './bilder.mjs';
import { rondlage } from '../rond.mjs';
import { aktivSasong, omradeslista, utrustningslista } from './register.mjs';
import { idag } from '../tid.mjs';

const INTERVALL = ['vid_start', 'per_pass', 'dagligen', 'veckovis', 'sasong'];
const OMFATTNING = ['utrustningstyp', 'snoplats', 'omrade', 'allmant'];

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
  SELECT k.*, mall.namn AS mall, mall.intervall, mall.kraver_kvittens, mall.rondtyp,
         u.namn AS utrustning, u.typ AS utrustningstyp, plats.namn AS plats, plats.slag AS platsslag,
         o.namn AS omrade, me.namn AS av,
         (SELECT count(*) FROM checklistpunkt WHERE mall_id=k.mall_id) AS antal_punkter,
         (SELECT count(*) FROM checklistsvar s WHERE s.korning_id=k.id AND (s.bockad=1 OR s.varde IS NOT NULL OR s.text IS NOT NULL)) AS antal_svar,
         (SELECT count(*) FROM checklistsvar s WHERE s.korning_id=k.id AND s.avvikelse=1) AS antal_avvikelser
  FROM checklistkorning k
  JOIN checklistmall mall ON mall.id=k.mall_id
  LEFT JOIN utrustning u ON u.id=k.utrustning_id
  LEFT JOIN snoplats plats ON plats.id=k.snoplats_id
  LEFT JOIN omrade o ON o.id=k.omrade_id
  LEFT JOIN medlem me ON me.id=k.av_id`;

export const korning = (id) => {
  const k = en(`${KORNING_SQL} WHERE k.id=?`, id);
  if (!k) return null;
  k.brister = k.brister ? JSON.parse(k.brister) : null;
  const punkter = alla(
    `SELECT p.*, s.id AS svar_id, s.bockad, s.varde, s.text AS svarstext, s.avvikelse, s.kommentar,
            s.bild, s.tid AS svarstid, s.ej_tillampligt, s.motivering
     FROM checklistpunkt p LEFT JOIN checklistsvar s ON s.punkt_id=p.id AND s.korning_id=?
     WHERE p.mall_id=? ORDER BY p.ordning, p.id`,
    id,
    k.mall_id
  );
  return { ...k, punkter };
};

/** Mallar som gäller för en viss utrustning (typ) eller ett område. */
/**
 * Vilka checklistor som gäller för ett objekt.
 *
 * En snöläggningsrond går på en **position** i backen, inte på maskinen –
 * man går lansrad fyra, och vad som står där i dag är en annan fråga. Därför
 * matchar positionens slag, och maskinens typ tas med som andrahandskälla
 * när ronden ändå gäller en maskin.
 */
export function mallarFor({ utrustning_id, omrade_id, snoplats_id }) {
  const plats = snoplats_id ? en('SELECT * FROM snoplats WHERE id=?', snoplats_id) : null;
  // Står en maskin på platsen gäller dess egna listor också.
  const maskin = plats ? maskinPa(plats.id) : null;
  const u = utrustning_id
    ? en('SELECT * FROM utrustning WHERE id=?', utrustning_id)
    : maskin || null;
  return alla(
    `SELECT * FROM checklistmall WHERE aktiv=1 AND (
        omfattning='allmant'
        OR (omfattning='utrustningstyp' AND utrustningstyp=?)
        OR (omfattning='snoplats' AND platsslag=?)
        OR (omfattning='omrade' AND omrade_id=?))
     ORDER BY ordning, namn`,
    u?.typ ?? null,
    plats?.slag ?? null,
    omrade_id ?? plats?.omrade_id ?? u?.omrade_id ?? null
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
    platser: snoplatser(),
    korningar: alla(
      `SELECT k.mall_id, k.utrustning_id, k.omrade_id, k.snoplats_id, k.avslutad, m.namn AS av
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
      snoplats_id: heltal(fraga.get('snoplats_id')),
    }))
  ),

  rutt('POST', '/api/checklistor/mallar', 'backansvarig', ({ res, kropp }) => {
    const id = spara('checklistmall', {
      namn: kravTxt(kropp.namn, 'Namn', 120),
      omfattning: ettAv(kropp.omfattning, OMFATTNING, 'Omfattning') || 'allmant',
      platsslag: ettAv(kropp.platsslag, PLATSSLAG, 'Platsslag'),
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
        // Den viktigaste egenskapen en punkt har. Gick tidigare bara att
        // sätta genom att så databasen, vilket innebar att en klubb som
        // redigerade sina egna listor inte kunde märka något som
        // säkerhetskritiskt – och då finns spärren bara på pappret.
        sakerhetskritisk: bool(p.sakerhetskritisk) ?? 0,
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
        platsslag: ettAv(kropp.platsslag, PLATSSLAG, 'Platsslag'),
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
            sakerhetskritisk: bool(p.sakerhetskritisk) ?? 0,
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
        platsslag: m.platsslag,
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
          // En kopierad lista som tappar sina säkerhetspunkter är farligare
          // än originalet: den ser likadan ut men spärrar ingenting.
          sakerhetskritisk: p.sakerhetskritisk,
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
    // Ronden går på en position; maskinen som står där noteras med, så att
    // ett fel går att hänga på rätt sak efteråt.
    const snoplats_id = heltal(kropp.snoplats_id);
    const maskin = snoplats_id ? maskinPa(snoplats_id) : null;
    const id = spara('checklistkorning', {
      mall_id: mall.id,
      snoplats_id,
      utrustning_id: heltal(kropp.utrustning_id) ?? maskin?.id ?? null,
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
    // En säkerhetskritisk punkt går inte att vifta bort. Den som inte kan
    // utföra kontrollen ska lämna den obesvarad så att den syns som saknad.
    const ejTillampligt = bool(kropp.ej_tillampligt) ?? 0;
    if (ejTillampligt && p.sakerhetskritisk)
      throw fel(400, 'En säkerhetskritisk kontroll kan inte markeras som ej tillämplig');
    const motivering = kropp.motivering === undefined ? undefined : txt(kropp.motivering);
    if (ejTillampligt && !(motivering || kropp.kommentar))
      throw fel(400, 'Ange varför kontrollen inte är tillämplig');

    const data = {
      ej_tillampligt: ejTillampligt,
      motivering,
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

  /**
   * Kvittens. Appen avgör inte om en lift får öppnas – den skriver ner vem
   * som fattade beslutet, när, och på vilket underlag. Ett ej driftklart
   * beslut är ett fullgott utfall och ska gå lika lätt att registrera.
   */
  rutt('POST', '/api/checklistor/korningar/:id/kvittens', 'medlem', ({ res, param, kropp, medlem }) => {
    const k = korning(param.id);
    if (!k) throw fel(404, 'Körningen finns inte');
    if (!k.avslutad) throw fel(409, 'Avsluta ronden innan du kvitterar den');
    const beslut = ettAv(kropp.beslut, ['driftklar', 'ej_driftklar'], 'Beslut');
    if (!beslut) throw fel(400, 'Ange beslut: driftklar eller ej_driftklar');
    // Den som kvitterar driftklart tar ansvaret, och måste få göra det.
    if (beslut === 'driftklar' && !minstRoll(medlem, 'backansvarig'))
      throw fel(403, 'Bara backansvarig eller högre får kvittera driftklart');
    if (beslut === 'driftklar' && k.status === 'klar_med_brist' && !txt(kropp.anteckning))
      throw fel(400, 'Ronden har obesvarade obligatoriska punkter – motivera beslutet');
    uppdatera('checklistkorning', k.id, {
      kvittens_beslut: beslut,
      kvittens_av_id: medlem.id,
      kvittens_tid: new Date().toISOString().slice(0, 19).replace('T', ' '),
      kvittens_anteckning: txt(kropp.anteckning),
    });
    svar(res, 200, { korning: korning(k.id) });
  }),

  rutt('POST', '/api/checklistor/korningar/:id/avsluta', 'medlem', ({ res, param, kropp, medlem }) => {
    const k = korning(param.id);
    if (!k) throw fel(404, 'Körningen finns inte');
    // En avvikelse är ett svar: frågan "är det här i ordning" har fått nej.
    const besvarad = (p) =>
      p.bockad || p.varde != null || p.svarstext || p.ej_tillampligt || p.avvikelse;
    const saknas = k.punkter.filter((p) => p.obligatorisk && !besvarad(p));
    const sakerhet = saknas.filter((p) => p.sakerhetskritisk);

    // Säkerhetskritiska kontroller går aldrig att hoppa över. Det finns
    // ingen flagga för det, med flit.
    if (sakerhet.length)
      throw fel(
        409,
        `${sakerhet.length} säkerhetskritiska kontroller saknar svar: ${sakerhet
          .map((p) => p.text)
          .join('; ')}`
      );

    // Övriga obligatoriska punkter får lämnas – men då är ronden avslutad
    // med brist, inte godkänd, och bristen följer med i historiken.
    if (saknas.length && !kropp.tvinga)
      throw fel(400, `${saknas.length} obligatoriska punkter saknar svar`);
    if (saknas.length && !txt(kropp.motivering))
      throw fel(400, 'Ange varför ronden avslutas med obesvarade obligatoriska punkter');

    uppdatera('checklistkorning', k.id, {
      status: saknas.length ? 'klar_med_brist' : 'klar',
      avslutad: new Date().toISOString().slice(0, 19).replace('T', ' '),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
      brister: saknas.length
        ? JSON.stringify(saknas.map((p) => ({ punkt_id: p.id, text: p.text })))
        : null,
      brist_motivering: saknas.length ? txt(kropp.motivering) : null,
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
              typ: p.sakerhetskritisk ? 'risk' : 'brist',
              prioritet: p.sakerhetskritisk ? 1 : 2,
              allvarlighet: p.sakerhetskritisk ? 'sakerhetsrisk' : 'begransar',
              // Gick ronden på en position hamnar felet där. Att det var
              // maskinens fel får den som bedömer ärendet avgöra.
              snoplats_id: k.snoplats_id,
              utrustning_id: k.snoplats_id ? null : k.utrustning_id,
              omrade_id: k.omrade_id,
              korning_id: k.id,
            },
            medlem
          )
        );
      }
    }
    // Ronden ska synas i driftjournalen utan att någon skriver in den igen.
    const slutford = korning(k.id);
    if (modulPa(aktuellForening(), 'drift')) skapaPost(
      {
        tid: slutford.avslutad,
        slag: 'rond',
        utrustning_id: k.utrustning_id,
        omrade_id: k.omrade_id,
        korning_id: k.id,
        kalla: k.kalla === 'mobil' ? 'mobil' : 'webb',
        text:
          `${k.mall}${slutford.status === 'klar_med_brist' ? ' – avslutad med brist' : ''}` +
          `${slutford.antal_avvikelser ? `, ${slutford.antal_avvikelser} avvikelser` : ''}`,
      },
      medlem
    );
    svar(res, 200, { korning: slutford, nya_arenden: nya });
  }),
];
