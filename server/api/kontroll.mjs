// Kontrollvyns egna rutter.
//
// Vyn visar samma data som resten av Backis, men ordnad som klubben är
// van vid: allt hänger på ett arbetsställe, och "Mina ärenden" blandar
// kontroller, avvikelser och service i en enda tidslinje.
//
// Att blanda dem är inte en genväg utan själva poängen: den som står i
// backen tänker inte "det här är en checklistkörning, det där är ett
// ärende". Hen tänker "det här är vad jag gjort och vad som väntar".
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { revidera } from '../bokforing.mjs';
import { datum, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';
import { idag } from '../tid.mjs';
import { lage } from './checklistor.mjs';
import { VATSKETYPER } from './arbetsstalle.mjs';
import { skapaPost } from './drift.mjs';

export const SLAG = ['kontroll', 'avvikelse', 'service'];

/**
 * Hur länge en kontroll gäller, i dagar. Två av intervallen hänger på en
 * händelse i stället för på kalendern – de får ingen siffra, och vyn
 * skriver ut villkoret i klartext i stället för ett datum som ljuger.
 */
const INTERVALLDAGAR = { dagligen: 1, veckovis: 7, sasong: 365, vid_start: null, per_pass: null };
const INTERVALLTEXT = {
  dagligen: 'Varje dag', veckovis: 'Varje vecka', sasong: 'En gång per säsong',
  vid_start: 'Vid varje start', per_pass: 'Varje pass',
};

const dagarMellan = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const plusDagar = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString().slice(0, 10);

const ARENDE_OPPNA = ['ny', 'bekraftad', 'pagar', 'vantar'];

/**
 * Tidslinjen. Varje rad får samma form oavsett varifrån den kommer, så
 * att klienten slipper tre olika kort för tre saker som läses likadant.
 */
function tidslinje({ medlem, slag, antal = 60 }) {
  const ut = [];

  if (!slag || slag === 'kontroll')
    for (const k of alla(
      `SELECT k.id, k.startad, k.avslutad, k.status, m.namn AS mall, m.kraver_kvittens,
              u.namn AS utrustning, o.namn AS omrade, p.namn AS plats, med.namn AS av
         FROM checklistkorning k
         JOIN checklistmall m ON m.id=k.mall_id
         LEFT JOIN utrustning u ON u.id=k.utrustning_id
         LEFT JOIN omrade o ON o.id=k.omrade_id
         LEFT JOIN snoplats p ON p.id=k.snoplats_id
         LEFT JOIN medlem med ON med.id=k.av_id
        ORDER BY coalesce(k.avslutad, k.startad) DESC LIMIT ?`,
      antal
    ))
      ut.push({
        slag: 'kontroll',
        id: k.id,
        tid: k.avslutad || k.startad,
        rubrik: k.mall,
        // Positionen före maskinen: en snöläggningsrond går på lansrad
        // fyra, och vilken kanon som står där i dag är en annan fråga.
        objekt: k.plats || k.utrustning || k.omrade || 'Allmänt',
        status: k.status,
        av: k.av,
        klar: k.status === 'klar',
      });

  if (!slag || slag === 'avvikelse')
    for (const a of alla(
      `SELECT a.id, a.titel, a.status, a.prioritet, a.allvarlighet, a.skapad,
              u.namn AS utrustning, o.namn AS omrade, p.namn AS plats, med.namn AS av
         FROM arende a
         LEFT JOIN utrustning u ON u.id=a.utrustning_id
         LEFT JOIN omrade o ON o.id=a.omrade_id
         LEFT JOIN snoplats p ON p.id=a.snoplats_id
         LEFT JOIN medlem med ON med.id=a.skapad_av_id
        ORDER BY a.skapad DESC LIMIT ?`,
      antal
    ))
      ut.push({
        slag: 'avvikelse',
        id: a.id,
        tid: a.skapad,
        rubrik: a.titel,
        objekt: a.plats || a.utrustning || a.omrade || '–',
        status: a.status,
        prioritet: a.prioritet,
        allvarlighet: a.allvarlighet,
        av: a.av,
        klar: ['atgardad', 'stangd'].includes(a.status),
      });

  if (!slag || slag === 'service')
    for (const s of alla(
      `SELECT s.id, s.namn, s.planerad, s.utford, s.status, u.namn AS utrustning
         FROM serviceatgard s
         LEFT JOIN utrustning u ON u.id=s.utrustning_id
        ORDER BY coalesce(s.utford, s.planerad) DESC LIMIT ?`,
      antal
    ))
      ut.push({
        slag: 'service',
        id: s.id,
        tid: s.utford || s.planerad,
        rubrik: s.namn,
        objekt: s.utrustning || '–',
        status: s.status,
        klar: Boolean(s.utford),
      });

  return ut
    .filter((r) => r.tid)
    .sort((a, b) => String(b.tid).localeCompare(String(a.tid)))
    .slice(0, antal);
}

/** Grupperar på dag, som appen klubben är van vid gör. */
const perDag = (rader) => {
  const ut = [];
  for (const r of rader) {
    const dag = String(r.tid).slice(0, 10);
    const sista = ut[ut.length - 1];
    if (sista?.dag === dag) sista.rader.push(r);
    else ut.push({ dag, rubrik: dag === idag() ? 'I dag' : dag, rader: [r] });
  }
  return ut;
};

/**
 * Kontrolltyperna för ett objekt, delade i försenade och kommande.
 *
 * Tre sorters schema, och de svarar på olika frågor:
 *
 *   handelse     rytmen i backen – vid start, varje pass, dagligen.
 *                Förfaller när perioden gått utan att den gjorts.
 *   dagar        N dagar efter senast utförd. Det tillverkaren skriver.
 *   drifttimmar  N timmar efter mätarställningen vid senaste. Den som
 *                står still förfaller inte.
 *
 * Fönstret är skillnaden mellan *utför om* och *utför inom*: dagarna
 * kvar till förfallodagen, och dagarna kvar tills den räknas som missad.
 * En kontroll utan fönster förfaller på dagen.
 */
export function kontrolltyper({ slag, id }) {
  const nu = idag();
  const u = slag === 'utrustning' ? en('SELECT drifttimmar FROM utrustning WHERE id=?', id) : null;
  const timmarNu = u?.drifttimmar ?? null;

  const kol = { utrustning: 'utrustning_id', omrade: 'omrade_id', snoplats: 'snoplats_id' }[slag];

  /**
   * Senaste avslutade körningen, utan tidsgräns.
   *
   * `lage()` tittar bara 21 dagar bakåt – lagom för frågan "vad ska
   * göras i dag", men obrukbart för ett schema på 90 dagar eller 500
   * drifttimmar. Den som gjorde kvartalskontrollen för hundra dagar
   * sedan hade annars sett "Ingen gjord" och förlorat sin nollpunkt.
   */
  const senasteFor = (mall_id) =>
    en(
      `SELECT avslutad, timmar FROM checklistkorning
        WHERE mall_id=? AND ${kol}=? AND status LIKE 'klar%' AND avslutad IS NOT NULL
        ORDER BY avslutad DESC LIMIT 1`,
      mall_id, id
    );

  const rader = [];
  for (const m of lage().mallar) {
    const o = (m.objekt || []).find((x) => x.slag === slag && (x.id ?? null) === (id ?? null));
    if (!o) continue;
    const gjord = senasteFor(m.mall_id);
    if (gjord && !o.senast) o.senast = gjord.avslutad;

    const mall = en(
      `SELECT intervalltyp, intervall_dagar, intervall_timmar, fonster_dagar, start_timmar
         FROM checklistmall WHERE id=?`,
      m.mall_id
    ) || {};
    const senast = o.senast ? String(o.senast).slice(0, 10) : null;
    const rad = {
      mall_id: m.mall_id,
      namn: m.namn,
      intervall: m.intervall,
      intervalltyp: mall.intervalltyp || 'handelse',
      intervalltext: INTERVALLTEXT[m.intervall] || m.intervall,
      antal_punkter: m.antal_punkter,
      objekt: o,
      senast: o.senast,
      senast_av: o.senast_av,
      schemalagd: m.schemalagd,
      aldrig: !o.senast,
      // Fylls i nedan av det schema som gäller.
      forsenad_dagar: null,
      dagar_kvar: null,
      inom_dagar: null,
      senast_datum: null,
      timmar_kvar: null,
      tidigast_timmar: null,
    };

    if (rad.intervalltyp === 'drifttimmar' && mall.intervall_timmar) {
      // Nollpunkten är timmarna vid senaste körningen, annars den
      // startställning som skrivits in på mallen. Saknas båda är
      // kontrollen inte igång: då visas "Ingen gjord" och ingen
      // nedräkning. Maskinens timmar i dag duger inte som nollpunkt –
      // de rör sig, och en gräns som flyttar med mätaren nås aldrig.
      const start = gjord?.timmar ?? mall.start_timmar ?? null;
      if (start != null) {
        rad.tidigast_timmar = start + mall.intervall_timmar;
        if (timmarNu != null) rad.timmar_kvar = Math.round(rad.tidigast_timmar - timmarNu);
      }
    } else if (rad.intervalltyp === 'dagar' && mall.intervall_dagar) {
      if (senast) {
        rad.senast_datum = plusDagar(senast, mall.intervall_dagar);
        const over = dagarMellan(rad.senast_datum, nu);
        if (over > 0) rad.forsenad_dagar = over;
        else rad.dagar_kvar = -over;
        if (mall.fonster_dagar)
          rad.inom_dagar = Math.max(0, dagarMellan(nu, plusDagar(rad.senast_datum, mall.fonster_dagar)));
      }
    } else {
      // Händelsestyrd: samma räkning som förr.
      const dagar = INTERVALLDAGAR[m.intervall] ?? null;
      if (senast && dagar) {
        rad.senast_datum = plusDagar(senast, dagar);
        const over = dagarMellan(rad.senast_datum, nu);
        if (over > 0) rad.forsenad_dagar = over;
        else rad.dagar_kvar = -over;
      }
      rad.behovs = o.behovs;
    }

    // Försenad är tre olika saker, och alla tre stoppar: aldrig utförd,
    // över sin förfallodag, eller över sina drifttimmar.
    rad.forsenad =
      Boolean(rad.forsenad_dagar) ||
      (rad.timmar_kvar != null && rad.timmar_kvar <= 0) ||
      (rad.intervalltyp === 'handelse' && o.behovs) ||
      (rad.aldrig && rad.intervalltyp !== 'drifttimmar' && m.schemalagd);
    rader.push(rad);
  }

  const forsenade = rader.filter((r) => r.forsenad);
  const tyngd = (r) => r.forsenad_dagar ?? (r.timmar_kvar != null ? -r.timmar_kvar : 0);
  return {
    forsenade: forsenade.sort((a, b) => tyngd(b) - tyngd(a)),
    kommande: rader.filter((r) => !r.forsenad),
    alla: rader,
  };
}

/** Objektets historik, oavsett vilket slags händelse det är. */
function aktivitet({ slag, id, kol }) {
  const ut = alla(
    `SELECT k.id, k.startad, k.avslutad, k.status, m.namn AS mall, med.namn AS av,
            (SELECT count(*) FROM checklistsvar s WHERE s.korning_id=k.id AND s.avvikelse=1) AS avvikelser
       FROM checklistkorning k
       JOIN checklistmall m ON m.id=k.mall_id
       LEFT JOIN medlem med ON med.id=k.av_id
      WHERE k.${kol}=? ORDER BY coalesce(k.avslutad, k.startad) DESC LIMIT 50`,
    id
  ).map((k) => ({
    slag: 'kontroll',
    id: k.id,
    tid: k.avslutad || k.startad,
    rubrik: k.mall,
    av: k.av,
    pagar: !k.avslutad,
    avvikelser: k.avvikelser,
  }));

  if (slag === 'utrustning') {
    for (const p of alla(
      'SELECT * FROM pafyllning WHERE utrustning_id=? ORDER BY datum DESC LIMIT 50',
      id
    ))
      ut.push({
        slag: 'pafyllning',
        id: p.id,
        tid: p.datum,
        rubrik: `${VATSKETYPER[p.vatsketyp]?.namn || p.vatsketyp} ${p.mangd} ${p.matenhet}`,
        av: p.av,
        detalj: p.matarstallning ? `${p.matarstallning} h` : null,
      });

    for (const a of alla(
      `SELECT a.*, m.namn AS utford_av FROM serviceatgard a
         LEFT JOIN medlem m ON m.id=a.utford_av_id
        WHERE a.utrustning_id=? ORDER BY coalesce(a.utford, a.planerad) DESC LIMIT 50`,
      id
    ))
      ut.push({
        slag: 'service',
        id: a.id,
        tid: a.utford || a.planerad,
        rubrik: a.namn,
        av: a.utford_av,
        pagar: !a.utford,
        detalj: a.arbetstimmar ? `${a.arbetstimmar} h arbete` : null,
      });
  }

  return ut
    .filter((r) => r.tid)
    .sort((a, b) => String(b.tid).localeCompare(String(a.tid)))
    .slice(0, 80);
}

/** Objektets egen rad, oavsett vilket av de tre slagen det är. */
function hamtaObjekt(slag, id) {
  if (slag === 'utrustning')
    return en('SELECT id, namn, typ, status, drifttimmar, matarstallning_tid, i_bruk_sedan, modell, tillverkare, serienummer, placering, anteckning FROM utrustning WHERE id=?', id);
  if (slag === 'omrade') return en('SELECT id, namn, slag AS typ FROM omrade WHERE id=?', id);
  if (slag === 'snoplats') return en('SELECT id, namn, slag AS typ, omrade_id FROM snoplats WHERE id=?', id);
  return null;
}

export const rutter = [
  rutt('GET', '/api/kontroll/arenden', 'medlem', ({ res, fraga, medlem }) => {
    const slag = ettAv(fraga.get('slag'), SLAG, 'Slag') || null;
    const rader = tidslinje({ medlem, slag });
    svar(res, 200, {
      dagar: perDag(rader),
      antal: {
        kontroll: tidslinje({ medlem, slag: 'kontroll', antal: 500 }).length,
        avvikelse: en(
          `SELECT count(*) AS n FROM arende WHERE status IN (${ARENDE_OPPNA.map(() => '?').join(',')})`,
          ...ARENDE_OPPNA
        ).n,
        service: en("SELECT count(*) AS n FROM serviceatgard WHERE utford IS NULL").n,
      },
      slag: SLAG,
    });
  }),

  /**
   * Allt som hör till ett objekt, i ett svar. Vyn visar sidorna i
   * följd — översikt, kontroller, avvikelser, vätskor, besiktningar,
   * aktivitet — och fem anrop i rad på en telefon i backen är fem
   * chanser att tappa täckning mitt i.
   */
  rutt('GET', '/api/kontroll/objekt', 'medlem', ({ res, fraga }) => {
    const slag = ettAv(fraga.get('slag'), ['utrustning', 'omrade', 'snoplats'], 'Slag') || 'utrustning';
    const id = heltal(fraga.get('id'));
    const objekt = hamtaObjekt(slag, id);
    if (!objekt) throw fel(404, 'Objektet finns inte');

    const arbetsstalle = en(
      `SELECT a.nyckel, a.namn FROM arbetsstalleobjekt ao JOIN arbetsstalle a ON a.id=ao.arbetsstalle_id
        WHERE ao.slag=? AND ao.objekt_id=? LIMIT 1`,
      slag, id
    );
    const kol = { utrustning: 'utrustning_id', omrade: 'omrade_id', snoplats: 'snoplats_id' }[slag];

    const avvikelser = alla(
      `SELECT a.id, a.titel, a.beskrivning, a.status, a.prioritet, a.allvarlighet, a.skapad,
              med.namn AS av
         FROM arende a LEFT JOIN medlem med ON med.id=a.skapad_av_id
        WHERE a.${kol}=? ORDER BY a.skapad DESC LIMIT 50`,
      id
    );

    const pafyllningar = slag === 'utrustning'
      ? alla('SELECT * FROM pafyllning WHERE utrustning_id=? ORDER BY datum DESC, id DESC LIMIT 50', id)
          .map((x) => ({ ...x, typnamn: VATSKETYPER[x.vatsketyp]?.namn || x.vatsketyp }))
      : [];

    // En rad per vätska, som i förlagan: typen, hur mycket totalt och
    // när det gjordes sist. Det är den sammanställningen man vill ha.
    const vatskor = [];
    for (const p of pafyllningar) {
      const rad = vatskor.find((v) => v.vatsketyp === p.vatsketyp);
      if (rad) {
        rad.total += p.mangd;
        rad.antal += 1;
      } else
        vatskor.push({
          vatsketyp: p.vatsketyp, namn: p.typnamn, matenhet: p.matenhet,
          total: p.mangd, antal: 1, senast: p.datum,
        });
    }

    svar(res, 200, {
      slag,
      objekt,
      arbetsstalle: arbetsstalle || null,
      kontroller: kontrolltyper({ slag, id }),
      avvikelser,
      pafyllningar,
      vatskor,
      besiktningar: slag === 'utrustning'
        ? alla(
            `SELECT * FROM besiktning WHERE utrustning_id=? ORDER BY giltig_till IS NULL, giltig_till`,
            id
          ).map((b) => ({
            ...b,
            utgangen: Boolean(b.giltig_till && b.giltig_till < idag()),
            dagar_kvar: b.giltig_till ? dagarMellan(idag(), b.giltig_till) : null,
          }))
        : [],
      dokument: slag === 'utrustning'
        ? alla('SELECT id, namn, slag, sidor, uppladdad FROM dokument WHERE utrustning_id=? AND aktuell=1 ORDER BY namn', id)
        : [],
      // Aktiviteten är allt som hänt på objektet, inte bara kontrollerna.
      // Den som läser en maskins historik vill se oljebytet och
      // tankningen i samma spalt som ronderna – det är tillsammans de
      // förklarar varför maskinen mår som den gör.
      aktivitet: aktivitet({ slag, id, kol }),
    });
  }),

  /**
   * Dokumenten, i de tre grenar klubben är van vid. Vätsketypernas
   * säkerhetsdatablad ligger inte i Backis ännu – grenen finns ändå,
   * tom, så att den som letar ser att den är tom och inte att den saknas.
   */
  rutt('GET', '/api/kontroll/dokument', 'medlem', ({ res, fraga }) => {
    const gren = ettAv(fraga.get('gren'), ['arbetsstalle', 'vatsketyper', 'generella'], 'Gren') || 'generella';
    if (gren === 'vatsketyper')
      return svar(res, 200, {
        gren,
        dokument: [],
        tomtext: 'Säkerhetsdatablad för vätskorna är inte inlagda i Backis ännu.',
      });
    if (gren === 'generella')
      return svar(res, 200, {
        gren,
        dokument: alla(
          'SELECT id, namn, slag, sidor, uppladdad FROM dokument WHERE utrustning_id IS NULL AND aktuell=1 ORDER BY namn'
        ),
      });

    const a = en('SELECT * FROM arbetsstalle WHERE nyckel=?', String(fraga.get('nyckel') || ''));
    if (!a) throw fel(404, 'Arbetsstället finns inte');
    const utr = alla(
      "SELECT objekt_id FROM arbetsstalleobjekt WHERE arbetsstalle_id=? AND slag='utrustning'",
      a.id
    ).map((r) => r.objekt_id);
    svar(res, 200, {
      gren,
      arbetsstalle: { nyckel: a.nyckel, namn: a.namn },
      dokument: utr.length
        ? alla(
            `SELECT d.id, d.namn, d.slag, d.sidor, d.uppladdad, u.namn AS utrustning
               FROM dokument d JOIN utrustning u ON u.id=d.utrustning_id
              WHERE d.utrustning_id IN (${utr.map(() => '?').join(',')}) AND d.aktuell=1
              ORDER BY u.namn, d.namn`,
            ...utr
          )
        : [],
    });
  }),

  /**
   * Utförd service, i ett anrop. Backis modell är planerad åtgärd först
   * och utförd sedan, men den som står med oljekannan i handen har inte
   * planerat något – hen har gjort det. Här skapas och kvitteras
   * åtgärden i samma transaktion, så att en tappad uppkoppling inte kan
   * lämna efter sig en service som ser planerad ut fast den är gjord.
   */
  rutt('POST', '/api/kontroll/service', '@anlaggning', ({ res, kropp, medlem }) => {
    const u = en('SELECT * FROM utrustning WHERE id=?', heltal(kropp.utrustning_id));
    if (!u) throw fel(404, 'Maskinen finns inte');
    const namn = kravTxt(kropp.namn, 'Vad gjordes', 160);
    const utford = datum(kropp.utford, 'Utförd') || idag();
    const drifttimmar = num(kropp.drifttimmar) ?? null;
    const anteckning = txt(kropp.anteckning) ?? null;

    return transaktion(() => {
      const id = spara('serviceatgard', {
        utrustning_id: u.id,
        namn,
        planerad: utford,
        status: 'utford',
        utford,
        utford_av_id: medlem.id,
        arbetstimmar: num(kropp.arbetstimmar) ?? null,
        kostnad_ore: heltal(kropp.kostnad_ore, 0),
        anteckning,
        av_id: medlem.id,
      });
      // Mätarställningen går bara framåt, precis som vid tankning.
      if (drifttimmar != null && (!u.drifttimmar || drifttimmar > u.drifttimmar))
        uppdatera('utrustning', u.id, { drifttimmar });
      skapaPost(
        {
          tid: `${utford} 12:00`,
          slag: 'atgard',
          utrustning_id: u.id,
          text: `Service utförd: ${namn}${anteckning ? ` – ${anteckning}` : ''}`,
        },
        medlem
      );
      revidera({ medlem, handelse: 'registrerade service', objekt: u.namn, detalj: { namn } });
      svar(res, 201, { atgard: en('SELECT * FROM serviceatgard WHERE id=?', id) });
    });
  }),

  /**
   * Avvikelserna som kontrollvyn visar dem: med arbetsstället bredvid
   * enheten, för korten skriver "Lift & Pist / Stora liften" och inte
   * bara maskinens namn. Kopplingen finns i arbetsstalleobjekt och hör
   * inte hemma i /api/arenden, som resten av Backis läser.
   */
  rutt('GET', '/api/kontroll/avvikelser', 'medlem', ({ res, fraga }) => {
    const bara = fraga.get('oppna') === '1';
    svar(res, 200, {
      avvikelser: alla(
        `SELECT a.id, a.titel, a.beskrivning, a.typ, a.status, a.prioritet, a.allvarlighet,
                a.bild, a.skapad, a.uppdaterad,
                u.namn AS utrustning, o.namn AS omrade, p.namn AS plats,
                med.namn AS skapad_av,
                (SELECT ast.namn FROM arbetsstalleobjekt ao JOIN arbetsstalle ast ON ast.id=ao.arbetsstalle_id
                  WHERE (ao.slag='utrustning' AND ao.objekt_id=a.utrustning_id)
                     OR (ao.slag='omrade' AND ao.objekt_id=a.omrade_id)
                     OR (ao.slag='snoplats' AND ao.objekt_id=a.snoplats_id)
                  LIMIT 1) AS arbetsstalle
           FROM arende a
           LEFT JOIN utrustning u ON u.id=a.utrustning_id
           LEFT JOIN omrade o ON o.id=a.omrade_id
           LEFT JOIN snoplats p ON p.id=a.snoplats_id
           LEFT JOIN medlem med ON med.id=a.skapad_av_id
          ${bara ? `WHERE a.status IN (${ARENDE_OPPNA.map(() => '?').join(',')})` : ''}
          ORDER BY a.prioritet, a.uppdaterad DESC LIMIT 300`,
        ...(bara ? ARENDE_OPPNA : [])
      ),
    });
  }),

  /** Pågående kontroller — mina och andras, precis som i det gamla systemet. */
  rutt('GET', '/api/kontroll/pagaende', 'medlem', ({ res, medlem }) => {
    const rader = alla(
      `SELECT k.id, k.startad, k.av_id, m.namn AS mall, u.namn AS utrustning,
              o.namn AS omrade, med.namn AS av
         FROM checklistkorning k
         JOIN checklistmall m ON m.id=k.mall_id
         LEFT JOIN utrustning u ON u.id=k.utrustning_id
         LEFT JOIN omrade o ON o.id=k.omrade_id
         LEFT JOIN snoplats p ON p.id=k.snoplats_id
         LEFT JOIN medlem med ON med.id=k.av_id
        WHERE k.avslutad IS NULL ORDER BY k.startad DESC`
    ).map((k) => ({ ...k, objekt: k.plats || k.utrustning || k.omrade || 'Allmänt', min: k.av_id === medlem.id }));
    svar(res, 200, {
      mina: rader.filter((r) => r.min),
      andras: rader.filter((r) => !r.min),
    });
  }),

  // ---- Genvägar ----
  //
  // Länkar till det klubben använder vid sidan av systemet. De som pekar
  // in i Backis öppnas i appen; övriga i webbläsaren.

  rutt('GET', '/api/kontroll/genvagar', 'medlem', ({ res }) =>
    svar(res, 200, {
      genvagar: alla('SELECT * FROM genvag WHERE aktiv=1 ORDER BY ordning, id'),
    })
  ),

  rutt('POST', '/api/kontroll/genvagar', '@anlaggning', ({ res, kropp, medlem }) => {
    const namn = kravTxt(kropp.namn, 'Namn', 120);
    const url = kravTxt(kropp.url, 'Länk', 500);
    const intern = url.startsWith('/') ? 1 : 0;
    if (!intern && !/^https?:\/\//i.test(url))
      throw fel(400, 'Länken ska börja med http:// eller https://, eller vara en sida i Backis');
    const id = spara('genvag', {
      namn,
      url,
      intern,
      beskrivning: txt(kropp.beskrivning, 300) ?? null,
      ordning: heltal(kropp.ordning, 0),
    });
    revidera({ medlem, handelse: 'lade till genväg', objekt: namn });
    svar(res, 201, en('SELECT * FROM genvag WHERE id=?', id));
  }),

  rutt('DELETE', '/api/kontroll/genvagar/:id', '@anlaggning', ({ res, param, medlem }) => {
    const g = en('SELECT * FROM genvag WHERE id=?', heltal(param.id));
    if (!g) throw fel(404, 'Genvägen finns inte');
    kor('UPDATE genvag SET aktiv=0 WHERE id=?', g.id);
    revidera({ medlem, handelse: 'tog bort genväg', objekt: g.namn });
    svar(res, 200, { borttagen: g.id });
  }),
];

/**
 * Klubbens genvägar som de ser ut i systemet de kommer ifrån. De pekar på
 * saker Backis också kan – och just därför sås de med en intern adress
 * där en sådan finns, så att de gradvis leder hem.
 */
export const GENVAGAR = [
  { namn: 'Bemanningslista Vårdkasen', url: '/mobil/#passet', intern: 1, ordning: 1,
    beskrivning: 'Vem som står var i dag' },
  { namn: 'Snöproduktion Vårdkasen', url: '/snolaggning', intern: 1, ordning: 2,
    beskrivning: 'Mätningar, våtkula och klartecken' },
  { namn: 'Vindriktning och styrka (Toppen)', url: '/snolaggning', intern: 1, ordning: 3,
    beskrivning: 'Prognosen för backens egen punkt' },
  { namn: 'Väderstation och Lenko-fläktarna', url: '/snolaggning', intern: 1, ordning: 4,
    beskrivning: 'Väderdata och fläktarnas inställning' },
];

export function sakerstallGenvagar() {
  for (const g of GENVAGAR)
    if (!en('SELECT id FROM genvag WHERE namn=?', g.namn)) spara('genvag', g);
  return { genvagar: en('SELECT count(*) AS n FROM genvag').n };
}
