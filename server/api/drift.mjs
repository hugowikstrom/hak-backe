// Driftjournalen: en rad per sak som hänt i anläggningen.
//
// Journalen är en egen tabell men ingen egen sanning – den pekar på ronden,
// mätningen, ärendet eller incidenten där uppgiften faktiskt bor. Poängen är
// att kunna svara på "vad hände i backen i tisdags" utan att leta i fem vyer.
//
// Talvägen: ljud → transkript → AI-förslag → **människa bekräftar** → journal.
// Steget i mitten skapar ingenting. En obekräftad post räknas inte som
// dokumentation, syns som utkast, och AI:n får aldrig påstå att en kontroll
// eller åtgärd är gjord.
import { alla, en, spara, transaktion, uppdatera } from '../db.mjs';
import { far, minstRoll } from '../behorighet.mjs';
import { aiPa, matchaUtrustning, modell, tolka, utrustningskandidater } from '../ai.mjs';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LJUDKATALOG, sparaLjud, talPa, transkribera } from '../tal.mjs';
import { bool, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { nu } from '../tid.mjs';
import { skapaArende } from './arenden.mjs';
import { wetbulb } from '../snoteknik.mjs';

const SLAG = ['observation', 'atgard', 'rond', 'matning', 'incident', 'larm'];

/** Fälten AI:n får föreslå mätvärden i, med enhet och rimlighetsgräns. */
const MATFALT = {
  lufttemp: { enhet: '°C', min: -40, max: 25 },
  luftfukt: { enhet: '%', min: 0, max: 100 },
  wetbulb: { enhet: '°C', min: -40, max: 25 },
  vattentryck: { enhet: 'bar', min: 0, max: 60 },
  lufttryck: { enhet: 'bar', min: 0, max: 40 },
  vattenflode: { enhet: 'l/s', min: 0, max: 200 },
};

export const SCHEMA_JOURNAL = {
  type: 'object',
  properties: {
    slag: { type: ['string', 'null'], enum: ['observation', 'atgard', 'rond', null] },
    rondtyp: { type: ['string', 'null'] },
    utrustning: { type: ['string', 'null'], description: 'namnet som nämns i talet, annars null' },
    komponent: { type: ['string', 'null'] },
    observation: { type: ['string', 'null'], description: 'vad som iakttogs' },
    atgard: { type: ['string', 'null'], description: 'vad rapportören säger att hen gjorde' },
    kvarstar: { type: ['boolean', 'null'], description: 'true om problemet finns kvar' },
    allvarlighet: { type: ['string', 'null'], enum: ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk', null] },
    forslag_arende: { type: ['boolean', 'null'], description: 'true om detta bör bli ett felärende' },
    matvarden: {
      type: 'object',
      description: 'endast värden som uttryckligen sägs; annars null',
      properties: Object.fromEntries(Object.keys(MATFALT).map((f) => [f, { type: ['number', 'null'] }])),
    },
    sammanfattning: { type: ['string', 'null'], description: 'en mening på svenska' },
  },
};

export const SYSTEM_JOURNAL = `Du är assistent i en skidanläggnings driftjournal och strukturerar personalens
talade rapporter till ett utkast som en människa sedan granskar.

Du avgör ingenting. Du dokumenterar bara det som faktiskt sägs.

- Säger rapportören "allt ser bra ut" betyder det INTE att någon särskild kontroll är utförd.
  Lämna då observation som den fria texten och sätt inga kontroller som godkända.
- Mätvärden fylls bara i när ett tal nämns. "Trycket var okej" är ingen siffra – lämna null.
- Är utrustningens namn otydligt, lämna utrustning som null så får personalen välja.
- Skilj på vad som iakttogs (observation) och vad som gjordes (atgard).`;

/** Rensar AI:ns mätvärden: fel typ eller orimlig siffra kastas, inte justeras. */
export function rensaMatvarden(ravarden) {
  const ut = {};
  for (const [falt, gran] of Object.entries(MATFALT)) {
    const v = ravarden?.[falt];
    if (v == null || typeof v !== 'number' || Number.isNaN(v)) continue;
    if (v < gran.min || v > gran.max) continue;
    ut[falt] = v;
  }
  return ut;
}

/** Journalen med förslaget uppackat, så klienten inte behöver tolka JSON. */
const medForslag = (p) =>
  p && { ...p, forslag: p.forslag ? JSON.parse(p.forslag) : null, utkast: p.bekraftad ? 0 : 1 };

export const hamtaPost = (id) =>
  medForslag(
    en(
    `SELECT d.*, m.namn AS av, b.namn AS bekraftad_av, u.namn AS utrustning, k.namn AS komponent,
            o.namn AS omrade
       FROM driftpost d
       LEFT JOIN medlem m ON m.id=d.av_id
       LEFT JOIN medlem b ON b.id=d.bekraftad_av_id
       LEFT JOIN utrustning u ON u.id=d.utrustning_id
       LEFT JOIN komponent k ON k.id=d.komponent_id
       LEFT JOIN snoplats sp ON sp.id=d.snoplats_id
       LEFT JOIN omrade o ON o.id=d.omrade_id
      WHERE d.id=?`,
      id
    )
  );

export function journal({ fran, till, slag, utrustning_id, utkast, antal = 200 } = {}) {
  const villkor = [];
  const p = [];
  if (fran) (villkor.push('d.tid >= ?'), p.push(fran));
  if (till) (villkor.push('d.tid <= ?'), p.push(`${till} 23:59:59`));
  if (slag) (villkor.push('d.slag = ?'), p.push(slag));
  if (utrustning_id) (villkor.push('d.utrustning_id = ?'), p.push(utrustning_id));
  if (utkast === true) villkor.push('d.bekraftad IS NULL');
  if (utkast === false) villkor.push('d.bekraftad IS NOT NULL');
  return alla(
    `SELECT d.*, m.namn AS av, b.namn AS bekraftad_av, u.namn AS utrustning, k.namn AS komponent,
            sp.namn AS plats, o.namn AS omrade
       FROM driftpost d
       LEFT JOIN medlem m ON m.id=d.av_id
       LEFT JOIN medlem b ON b.id=d.bekraftad_av_id
       LEFT JOIN utrustning u ON u.id=d.utrustning_id
       LEFT JOIN komponent k ON k.id=d.komponent_id
       LEFT JOIN snoplats sp ON sp.id=d.snoplats_id
       LEFT JOIN omrade o ON o.id=d.omrade_id
      ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''}
      ORDER BY d.tid DESC, d.id DESC LIMIT ?`,
    ...p,
    Math.min(500, antal)
  ).map(medForslag);
}

/**
 * Skriver en journalpost. `bekraftad` sätts bara när en människa står för
 * innehållet – antingen genom att skriva det själv eller genom att godkänna
 * ett förslag.
 */
export function skapaPost(data, medlem, { bekraftad = true } = {}) {
  const id = spara('driftpost', {
    tid: data.tid || nu(),
    slag: ettAv(data.slag, SLAG, 'Slag') || 'observation',
    av_id: medlem?.id ?? null,
    utrustning_id: heltal(data.utrustning_id),
    komponent_id: heltal(data.komponent_id),
    snoplats_id: heltal(data.snoplats_id),
    omrade_id: heltal(data.omrade_id),
    korning_id: heltal(data.korning_id),
    matning_id: heltal(data.matning_id),
    arende_id: heltal(data.arende_id),
    incident_id: heltal(data.incident_id),
    pass_id: heltal(data.pass_id),
    text: txt(data.text),
    transkript: txt(data.transkript),
    ljudfil: txt(data.ljudfil, 80),
    forslag: data.forslag ? JSON.stringify(data.forslag) : null,
    ai_modell: txt(data.ai_modell, 80),
    bekraftad: bekraftad ? nu() : null,
    bekraftad_av_id: bekraftad ? (medlem?.id ?? null) : null,
    kalla: ettAv(data.kalla, ['webb', 'mobil', 'sensor', 'system'], 'Källa') || 'webb',
  });
  return hamtaPost(id);
}

/** Utrustningens hela liv: ronder, fel, journal och vad som återkommer. */
export function utrustningshistorik(id) {
  const u = en(
    `SELECT u.*, o.namn AS omrade, l.namn AS leverantor, m.namn AS ansvarig
       FROM utrustning u
       LEFT JOIN omrade o ON o.id=u.omrade_id
       LEFT JOIN leverantor l ON l.id=u.leverantor_id
       LEFT JOIN medlem m ON m.id=u.ansvarig_id
      WHERE u.id=?`,
    id
  );
  if (!u) throw fel(404, 'Utrustningen finns inte');
  return {
    utrustning: u,
    komponenter: alla(
      `SELECT k.*, l.namn AS leverantor,
              (SELECT count(*) FROM arende a WHERE a.komponent_id=k.id) AS antal_fel
         FROM komponent k LEFT JOIN leverantor l ON l.id=k.leverantor_id
        WHERE k.utrustning_id=? AND k.aktiv=1 ORDER BY k.ordning, k.namn`,
      id
    ),
    arenden: alla(
      `SELECT a.*, k.namn AS komponent, m.namn AS skapad_av
         FROM arende a
         LEFT JOIN komponent k ON k.id=a.komponent_id
         LEFT JOIN medlem m ON m.id=a.skapad_av_id
        WHERE a.utrustning_id=? ORDER BY a.skapad DESC LIMIT 100`,
      id
    ),
    ronder: alla(
      `SELECT k.id, k.startad, k.avslutad, k.status, mall.namn AS mall, m.namn AS av,
              (SELECT count(*) FROM checklistsvar s WHERE s.korning_id=k.id AND s.avvikelse=1) AS avvikelser
         FROM checklistkorning k
         JOIN checklistmall mall ON mall.id=k.mall_id
         LEFT JOIN medlem m ON m.id=k.av_id
        WHERE k.utrustning_id=? ORDER BY k.startad DESC LIMIT 50`,
      id
    ),
    journal: journal({ utrustning_id: id, antal: 100 }),
    monster: aterkommandeFel(id),
  };
}

/**
 * Räknar fram vad som går sönder om och om igen.
 *
 * Det här är statistik, inte en slutsats: systemet visar att något
 * återkommer och lämnar till människan att avgöra varför.
 */
export function aterkommandeFel(utrustning_id = null) {
  const rader = alla(
    `SELECT a.utrustning_id, a.komponent_id, u.namn AS utrustning, k.namn AS komponent,
            count(*) AS antal,
            min(a.skapad) AS forsta, max(a.skapad) AS senaste,
            sum(coalesce(a.kostnad_ore,0)) AS kostnad_ore,
            sum(CASE WHEN a.allvarlighet='sakerhetsrisk' THEN 1 ELSE 0 END) AS sakerhetsfel,
            avg(CASE WHEN a.stangd IS NOT NULL
                     THEN julianday(a.stangd)-julianday(a.skapad) END) AS dagar_till_atgard
       FROM arende a
       LEFT JOIN utrustning u ON u.id=a.utrustning_id
       LEFT JOIN komponent k ON k.id=a.komponent_id
      WHERE a.typ='fel' AND a.utrustning_id IS NOT NULL
        ${utrustning_id ? 'AND a.utrustning_id=?' : ''}
      GROUP BY a.utrustning_id, a.komponent_id
      HAVING count(*) >= 2
      ORDER BY antal DESC, senaste DESC`,
    ...(utrustning_id ? [utrustning_id] : [])
  );
  return rader.map((r) => ({
    ...r,
    dagar_till_atgard: r.dagar_till_atgard == null ? null : Math.round(r.dagar_till_atgard * 10) / 10,
    // Snittid mellan fel säger mer än antalet: fyra fel på en månad är
    // något annat än fyra fel på sex år.
    dagar_mellan_fel:
      r.antal < 2
        ? null
        : Math.round(
            ((new Date(`${r.senaste}Z`) - new Date(`${r.forsta}Z`)) / 86400000 / (r.antal - 1)) * 10
          ) / 10,
    utred: r.antal >= 3 || r.sakerhetsfel > 0,
  }));
}

/**
 * Fel som återkommer på samma position i backen.
 *
 * Det här är den andra halvan av bilden. Ett vattenuttag som läcker gör det
 * oavsett vilken kanon som står där, och syns bara om man räknar per plats.
 */
export function aterkommandePlatsfel() {
  return alla(
    `SELECT a.snoplats_id, p.namn AS plats, p.slag AS platsslag, o.namn AS omrade,
            count(*) AS antal,
            min(a.skapad) AS forsta, max(a.skapad) AS senaste,
            sum(coalesce(a.kostnad_ore,0)) AS kostnad_ore,
            sum(CASE WHEN a.allvarlighet='sakerhetsrisk' THEN 1 ELSE 0 END) AS sakerhetsfel,
            count(DISTINCT (SELECT s.utrustning_id FROM uppstallning s
                             WHERE s.snoplats_id=a.snoplats_id
                               AND s.fran <= a.skapad
                               AND (s.till IS NULL OR s.till > a.skapad))) AS olika_maskiner
       FROM arende a
       JOIN snoplats p ON p.id=a.snoplats_id
       LEFT JOIN omrade o ON o.id=p.omrade_id
      WHERE a.typ IN ('fel','brist')
      GROUP BY a.snoplats_id
      HAVING count(*) >= 2
      ORDER BY antal DESC, senaste DESC`
  ).map((r) => ({
    ...r,
    dagar_mellan_fel:
      r.antal < 2
        ? null
        : Math.round(
            ((new Date(`${r.senaste}Z`) - new Date(`${r.forsta}Z`)) / 86400000 / (r.antal - 1)) * 10
          ) / 10,
    // Samma fel med olika maskiner på platsen pekar på platsen själv.
    utred: r.antal >= 3 || r.olika_maskiner > 1,
    pekar_pa_platsen: r.olika_maskiner > 1,
  }));
}

export const rutter = [
  // ---------- Journalen ----------
  rutt('GET', '/api/drift/journal', 'medlem', ({ res, fraga, medlem }) =>
    svar(res, 200, {
      poster: journal({
        fran: fraga.get('fran'),
        till: fraga.get('till'),
        slag: fraga.get('slag'),
        utrustning_id: heltal(fraga.get('utrustning')),
        utkast: fraga.get('utkast') === 'ja' ? true : fraga.get('utkast') === 'nej' ? false : undefined,
        antal: heltal(fraga.get('antal'), 200),
      }),
      slag: SLAG,
      kan_skriva: minstRoll(medlem, 'medlem'),
      ai: { pa: aiPa(), modell: aiPa() ? modell() : null, tal: talPa() },
    })
  ),

  rutt('POST', '/api/drift/journal', 'medlem', ({ res, kropp, medlem }) =>
    svar(res, 201, {
      post: skapaPost({ ...kropp, text: kravTxt(kropp.text, 'Text') }, medlem),
    })
  ),

  /**
   * Talvägen. Returnerar ett **utkast** – posten finns i journalen men är
   * märkt obekräftad tills någon godkänner den.
   */
  rutt('POST', '/api/drift/tal', 'medlem', async ({ res, kropp, medlem }) => {
    let ljudfil = null;
    let transkript = txt(kropp.text) || null;
    let sttfel = null;
    if (kropp.ljud) {
      const { namn, bytes } = await sparaLjud(kropp.ljud);
      ljudfil = namn;
      const r = await transkribera(bytes, namn);
      if (r.text) transkript = r.text;
      sttfel = r.fel;
    }
    if (!transkript && !ljudfil) throw fel(400, 'Spela in eller skriv något först');

    let forslag = null;
    let aifel = null;
    let anvand_modell = null;
    if (transkript) {
      const lista = alla('SELECT id, namn, typ FROM utrustning WHERE aktiv=1');
      const r = await tolka({ system: SYSTEM_JOURNAL, text: transkript, schema: SCHEMA_JOURNAL });
      aifel = r.fel;
      anvand_modell = r.modell;
      if (r.data) {
        // Modellen lägger ibland utrustningen i sammanfattningen i stället
        // för i fältet. Då får transkriptet svara i andra hand.
        const namnda = r.data.utrustning ? [] : utrustningskandidater(transkript, lista);
        const trabb =
          matchaUtrustning(r.data.utrustning, lista) || (namnda.length === 1 ? namnda[0] : null);
        const komp = trabb
          ? matchaUtrustning(
              r.data.komponent,
              alla('SELECT id, namn FROM komponent WHERE utrustning_id=? AND aktiv=1', trabb.id)
            )
          : null;
        forslag = {
          ...r.data,
          matvarden: rensaMatvarden(r.data.matvarden),
          utrustning_id: trabb?.id ?? null,
          utrustning_namn: trabb?.namn ?? null,
          komponent_id: komp?.id ?? null,
          // Osäker träff ska sluta i en fråga till människan, inte i en
          // gissning – både när namnet var otydligt och när flera nämndes.
          valj_utrustning: (!!r.data.utrustning && !trabb) || namnda.length > 1,
          namnda: namnda.map((u) => ({ id: u.id, namn: u.namn })),
        };
      }
    }

    const post = skapaPost(
      {
        slag: ettAv(forslag?.slag, SLAG, 'Slag') || 'observation',
        utrustning_id: forslag?.utrustning_id ?? heltal(kropp.utrustning_id),
        komponent_id: forslag?.komponent_id ?? null,
        omrade_id: heltal(kropp.omrade_id),
        pass_id: heltal(kropp.pass_id),
        korning_id: heltal(kropp.korning_id),
        transkript,
        ljudfil,
        forslag,
        ai_modell: anvand_modell,
        kalla: ettAv(kropp.kalla, ['webb', 'mobil'], 'Källa') || 'webb',
      },
      medlem,
      { bekraftad: false }
    );
    svar(res, 201, { post, stt_fel: sttfel, ai_fel: aifel });
  }),

  /**
   * Människan godkänner. Det som sparas är det hon skickar in, inte det
   * AI:n gissade – förslaget ligger kvar oförändrat vid sidan om.
   */
  rutt('POST', '/api/drift/journal/:id/bekrafta', 'medlem', ({ res, param, kropp, medlem }) => {
    const post = hamtaPost(param.id);
    if (!post) throw fel(404, 'Posten finns inte');
    if (post.bekraftad) throw fel(409, 'Posten är redan bekräftad');
    if (post.av_id && post.av_id !== medlem.id && !minstRoll(medlem, 'backansvarig'))
      throw fel(403, 'Bara den som rapporterade kan bekräfta sin post');

    return transaktion(() => {
      const forslag = post.forslag ?? {};
      const utrustning_id = heltal(kropp.utrustning_id) ?? post.utrustning_id;
      let matning_id = null;
      let arende_id = null;

      // Mätvärden från tal är manuellt rapporterade och sparas med den som
      // bekräftar som avsändare – aldrig som sensordata.
      const varden = rensaMatvarden(kropp.matvarden ?? forslag.matvarden);
      if (Object.keys(varden).length) {
        if (varden.wetbulb == null && varden.lufttemp != null && varden.luftfukt != null)
          varden.wetbulb = wetbulb(varden.lufttemp, varden.luftfukt);
        matning_id = spara('matning', {
          tid: post.tid,
          utrustning_id,
          omrade_id: post.omrade_id,
          ...varden,
          anteckning: 'Rapporterad muntligt i driftjournalen',
          av_id: medlem.id,
        });
      }

      if (kropp.skapa_arende) {
        const a = skapaArende(
          {
            titel: kravTxt(kropp.arende_titel || forslag.sammanfattning, 'Ärendets titel', 160),
            beskrivning: txt(kropp.text || post.transkript),
            typ: 'fel',
            allvarlighet: ettAv(kropp.allvarlighet || forslag.allvarlighet,
              ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk'], 'Allvarlighet') || 'begransar',
            prioritet: heltal(kropp.prioritet, 3),
            utrustning_id,
            omrade_id: post.omrade_id,
          },
          medlem
        );
        arende_id = a.id;
        if (heltal(kropp.komponent_id) ?? post.komponent_id)
          uppdatera('arende', a.id, { komponent_id: heltal(kropp.komponent_id) ?? post.komponent_id });
      }

      uppdatera('driftpost', post.id, {
        slag: ettAv(kropp.slag, SLAG, 'Slag') ?? post.slag,
        text: txt(kropp.text) ?? post.transkript,
        utrustning_id,
        komponent_id: heltal(kropp.komponent_id) ?? post.komponent_id,
        omrade_id: heltal(kropp.omrade_id) ?? post.omrade_id,
        matning_id,
        arende_id,
        bekraftad: nu(),
        bekraftad_av_id: medlem.id,
      });
      svar(res, 200, { post: hamtaPost(post.id) });
    });
  }),

  rutt('DELETE', '/api/drift/journal/:id', 'medlem', ({ res, param, medlem }) => {
    const post = hamtaPost(param.id);
    if (!post) throw fel(404, 'Posten finns inte');
    // Ett utkast får kastas. En bekräftad journalpost är dokumentation.
    if (post.bekraftad) throw fel(409, 'En bekräftad journalpost går inte att ta bort');
    if (post.av_id !== medlem.id && !minstRoll(medlem, 'anlaggningsansvarig'))
      throw fel(403, 'Bara den som rapporterade får kasta sitt utkast');
    en('DELETE FROM driftpost WHERE id=? RETURNING id', post.id);
    svar(res, 200, { borttagen: post.id });
  }),

  /** Inspelningen bakom en journalpost, för den som vill höra originalet. */
  rutt('GET', '/api/drift/journal/:id/ljud', 'medlem', ({ res, param }) => {
    const post = hamtaPost(param.id);
    if (!post?.ljudfil) throw fel(404, 'Ingen inspelning');
    const typ = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', wav: 'audio/wav' }[
      post.ljudfil.split('.').pop()
    ];
    const fil = join(LJUDKATALOG, post.ljudfil);
    if (!existsSync(fil)) throw fel(404, 'Inspelningen finns inte kvar');
    res.writeHead(200, { 'content-type': typ || 'application/octet-stream', 'content-length': statSync(fil).size });
    createReadStream(fil).pipe(res);
  }),

  // ---------- Utrustningens historik ----------
  rutt('GET', '/api/drift/utrustning/:id', '@anlaggning', ({ res, param }) =>
    svar(res, 200, utrustningshistorik(param.id))
  ),

  rutt('GET', '/api/drift/monster', '@anlaggning', ({ res }) =>
    svar(res, 200, {
      // Två mönster, som ska läsas åt olika håll. Maskinfel följer
      // maskinen när den flyttas; platsfel stannar i backen.
      monster: aterkommandeFel(),
      platsmonster: aterkommandePlatsfel(),
    })
  ),

  // ---------- Komponenter ----------
  rutt('GET', '/api/drift/komponenter', '@anlaggning', ({ res, fraga }) =>
    svar(res, 200, {
      komponenter: alla(
        `SELECT k.*, u.namn AS utrustning, l.namn AS leverantor
           FROM komponent k
           JOIN utrustning u ON u.id=k.utrustning_id
           LEFT JOIN leverantor l ON l.id=k.leverantor_id
          WHERE k.aktiv=1 ${fraga.get('utrustning') ? 'AND k.utrustning_id=?' : ''}
          ORDER BY u.namn, k.ordning, k.namn`,
        ...(fraga.get('utrustning') ? [heltal(fraga.get('utrustning'))] : [])
      ),
    })
  ),

  rutt('POST', '/api/drift/komponenter', '@anlaggning', ({ res, kropp }) => {
    const id = spara('komponent', {
      utrustning_id: heltal(kropp.utrustning_id) ?? (() => { throw fel(400, 'Välj utrustning'); })(),
      namn: kravTxt(kropp.namn, 'Namn', 120),
      slag: txt(kropp.slag, 40),
      artikelnummer: txt(kropp.artikelnummer, 60),
      leverantor_id: heltal(kropp.leverantor_id),
      anteckning: txt(kropp.anteckning),
      ordning: heltal(kropp.ordning, 0),
    });
    svar(res, 201, { komponent: en('SELECT * FROM komponent WHERE id=?', id) });
  }),

  rutt('PATCH', '/api/drift/komponenter/:id', '@anlaggning', ({ res, param, kropp }) => {
    if (!en('SELECT id FROM komponent WHERE id=?', param.id)) throw fel(404, 'Komponenten finns inte');
    uppdatera('komponent', param.id, {
      namn: kropp.namn === undefined ? undefined : kravTxt(kropp.namn, 'Namn', 120),
      slag: txt(kropp.slag, 40),
      artikelnummer: txt(kropp.artikelnummer, 60),
      leverantor_id: heltal(kropp.leverantor_id),
      anteckning: txt(kropp.anteckning),
      ordning: heltal(kropp.ordning),
      aktiv: bool(kropp.aktiv),
    });
    svar(res, 200, { komponent: en('SELECT * FROM komponent WHERE id=?', param.id) });
  }),

  // ---------- Leverantörer och reservdelar ----------
  rutt('GET', '/api/drift/leverantorer', '@anlaggning', ({ res }) =>
    svar(res, 200, {
      leverantorer: alla(
        `SELECT l.*,
                (SELECT count(*) FROM komponent k WHERE k.leverantor_id=l.id) AS komponenter,
                (SELECT count(*) FROM utrustning u WHERE u.leverantor_id=l.id) AS objekt
           FROM leverantor l WHERE l.aktiv=1 ORDER BY l.namn`
      ),
    })
  ),

  rutt('POST', '/api/drift/leverantorer', '@anlaggning', ({ res, kropp }) => {
    const id = spara('leverantor', {
      namn: kravTxt(kropp.namn, 'Namn', 120),
      kontakt: txt(kropp.kontakt, 120),
      telefon: txt(kropp.telefon, 40),
      epost: txt(kropp.epost, 160),
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 201, { leverantor: en('SELECT * FROM leverantor WHERE id=?', id) });
  }),

  rutt('PATCH', '/api/drift/leverantorer/:id', '@anlaggning', ({ res, param, kropp }) => {
    if (!en('SELECT id FROM leverantor WHERE id=?', param.id)) throw fel(404, 'Leverantören finns inte');
    uppdatera('leverantor', param.id, {
      namn: kropp.namn === undefined ? undefined : kravTxt(kropp.namn, 'Namn', 120),
      kontakt: txt(kropp.kontakt, 120),
      telefon: txt(kropp.telefon, 40),
      epost: txt(kropp.epost, 160),
      anteckning: txt(kropp.anteckning),
      aktiv: bool(kropp.aktiv),
    });
    svar(res, 200, { leverantor: en('SELECT * FROM leverantor WHERE id=?', param.id) });
  }),
];
