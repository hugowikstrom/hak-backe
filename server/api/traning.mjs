// Träningstillfällen, närvaro och rapporter till bidragsgivarna.
import { alla, en, kor, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import { periodFor, REGLER, sammanstallning } from '../stod.mjs';
import { csv, datum as datumfalt, ettAv, fel, heltal, klocka, rutt, svar, text, txt } from '../http.mjs';
import { idag } from '../tid.mjs';

const SLAG = ['traning', 'tavling', 'lager', 'mote', 'arbetsdag'];

export const tillfalle = (id) => {
  const t = en(
    `SELECT t.*, g.namn AS grupp, s.namn AS sektion FROM traningstillfalle t
     LEFT JOIN traningsgrupp g ON g.id=t.grupp_id
     LEFT JOIN sektion s ON s.id=t.sektion_id WHERE t.id=?`,
    id
  );
  if (!t) return null;
  return {
    ...t,
    installt: !!t.installt,
    deltagare: alla(
      `SELECT n.id, n.roll, n.narvarande, n.anteckning, m.id AS medlem_id, m.namn, m.fodelsedatum
       FROM narvaro n JOIN medlem m ON m.id=n.medlem_id
       WHERE n.tillfalle_id=? ORDER BY n.roll DESC, m.namn`,
      id
    ).map((d) => ({ ...d, narvarande: !!d.narvarande })),
  };
};

const tillfallenMedNarvaro = ({ fran, till, grupp_id }) => {
  const villkor = ['t.datum BETWEEN ? AND ?'];
  const p = [fran, till];
  if (grupp_id) villkor.push('t.grupp_id=?'), p.push(grupp_id);
  return alla(
    `SELECT t.*, g.namn AS grupp FROM traningstillfalle t
     LEFT JOIN traningsgrupp g ON g.id=t.grupp_id
     WHERE ${villkor.join(' AND ')} ORDER BY t.datum, t.start`,
    ...p
  ).map((t) => ({
    ...t,
    deltagare: alla(
      `SELECT n.roll, n.narvarande, m.id AS medlem_id, m.fodelsedatum
       FROM narvaro n JOIN medlem m ON m.id=n.medlem_id WHERE n.tillfalle_id=?`,
      t.id
    ),
  }));
};

export const rutter = [
  rutt('GET', '/api/traning/tillfallen', 'medlem', ({ res, fraga }) => {
    const fran = datumfalt(fraga.get('fran')) || idag().slice(0, 8) + '01';
    const till = datumfalt(fraga.get('till')) || idag();
    svar(res, 200, alla(
      `SELECT t.*, g.namn AS grupp, s.namn AS sektion,
              (SELECT count(*) FROM narvaro n WHERE n.tillfalle_id=t.id AND n.narvarande=1 AND n.roll='deltagare') AS deltagare,
              (SELECT count(*) FROM narvaro n WHERE n.tillfalle_id=t.id AND n.narvarande=1 AND n.roll='ledare') AS ledare
       FROM traningstillfalle t
       LEFT JOIN traningsgrupp g ON g.id=t.grupp_id
       LEFT JOIN sektion s ON s.id=t.sektion_id
       WHERE t.datum BETWEEN ? AND ? ${fraga.get('grupp_id') ? 'AND t.grupp_id=?' : ''}
       ORDER BY t.datum DESC, t.start DESC LIMIT 400`,
      fran, till, ...(fraga.get('grupp_id') ? [heltal(fraga.get('grupp_id'))] : [])
    ));
  }),

  rutt('GET', '/api/traning/tillfallen/:id', 'medlem', ({ res, param }) => {
    const t = tillfalle(param.id);
    if (!t) throw fel(404, 'Tillfället finns inte');
    svar(res, 200, t);
  }),

  rutt('POST', '/api/traning/tillfallen', '@traning', ({ res, kropp, medlem }) => {
    const grupp = kropp.grupp_id ? en('SELECT * FROM traningsgrupp WHERE id=?', heltal(kropp.grupp_id)) : null;
    const id = spara('traningstillfalle', {
      grupp_id: grupp?.id ?? null,
      sektion_id: heltal(kropp.sektion_id) ?? grupp?.sektion_id ?? null,
      datum: datumfalt(kropp.datum, 'Datum') || idag(),
      start: klocka(kropp.start, 'Start'),
      slut: klocka(kropp.slut, 'Slut'),
      plats: txt(kropp.plats, 80),
      slag: ettAv(kropp.slag, SLAG, 'Slag') || 'traning',
      rubrik: txt(kropp.rubrik, 120),
      anteckning: txt(kropp.anteckning, 300),
      av_id: medlem.id,
    });
    // Gruppens medlemmar läggs in direkt, så ledaren bara prickar av.
    if (grupp && kropp.fyll !== false) {
      for (const gm of alla('SELECT * FROM gruppmedlem WHERE grupp_id=?', grupp.id))
        spara('narvaro', {
          tillfalle_id: id,
          medlem_id: gm.medlem_id,
          roll: gm.roll === 'tranare' || gm.roll === 'hjalptranare' ? 'ledare' : 'deltagare',
          narvarande: 0,
        });
    }
    svar(res, 201, tillfalle(id));
  }),

  /**
   * Hela terminens träningsfönster på en gång. Tränaren väljer veckodagar
   * och period; tillfällen som redan finns hoppas över.
   */
  rutt('POST', '/api/traning/tillfallen/serie', '@traning', ({ res, kropp, medlem }) => {
    const grupp = en('SELECT * FROM traningsgrupp WHERE id=?', heltal(kropp.grupp_id));
    if (!grupp) throw fel(400, 'Välj en träningsgrupp');
    const fran = datumfalt(kropp.fran, 'Från');
    const till = datumfalt(kropp.till, 'Till');
    if (!fran || !till) throw fel(400, 'Från och till krävs');
    const veckodagar = (kropp.veckodagar || []).map((d) => heltal(d)).filter((d) => d >= 0 && d <= 6);
    if (!veckodagar.length) throw fel(400, 'Välj minst en veckodag');
    const start = klocka(kropp.start, 'Start');
    const slut = klocka(kropp.slut, 'Slut');

    const skapade = [];
    const d = new Date(`${fran}T12:00:00`);
    const slutdag = new Date(`${till}T12:00:00`);
    let varv = 0;
    while (d <= slutdag && varv++ < 400) {
      const datum = d.toLocaleDateString('sv-SE');
      const veckodag = (d.getDay() + 6) % 7;
      if (veckodagar.includes(veckodag)) {
        const finns = en(
          'SELECT id FROM traningstillfalle WHERE grupp_id=? AND datum=? AND coalesce(start,?)=?',
          grupp.id, datum, start ?? '', start ?? ''
        );
        if (!finns) {
          const id = spara('traningstillfalle', {
            grupp_id: grupp.id,
            sektion_id: grupp.sektion_id,
            datum, start, slut,
            plats: txt(kropp.plats, 80) || 'Vårdkasbacken',
            slag: ettAv(kropp.slag, SLAG, 'Slag') || 'traning',
            rubrik: txt(kropp.rubrik, 120) || `${grupp.namn} träning`,
            av_id: medlem.id,
          });
          // Gruppens medlemmar förifylls som obockade.
          for (const gm of alla('SELECT * FROM gruppmedlem WHERE grupp_id=?', grupp.id))
            spara('narvaro', {
              tillfalle_id: id,
              medlem_id: gm.medlem_id,
              roll: gm.roll === 'tranare' || gm.roll === 'hjalptranare' ? 'ledare' : 'deltagare',
              narvarande: 0,
            });
          skapade.push(id);
        }
      }
      d.setDate(d.getDate() + 1);
    }
    revidera({ medlem, handelse: 'lade upp träningsfönster', objekt: grupp.namn, detalj: { fran, till, antal: skapade.length } });
    svar(res, 201, { antal: skapade.length, grupp: grupp.namn, ids: skapade });
  }),

  rutt('PUT', '/api/traning/tillfallen/:id', '@traning', ({ res, param, kropp }) => {
    const t = en('SELECT * FROM traningstillfalle WHERE id=?', param.id);
    if (!t) throw fel(404, 'Tillfället finns inte');
    uppdatera('traningstillfalle', t.id, {
      datum: datumfalt(kropp.datum, 'Datum'),
      start: klocka(kropp.start, 'Start'),
      slut: klocka(kropp.slut, 'Slut'),
      plats: kropp.plats === undefined ? undefined : txt(kropp.plats, 80),
      slag: ettAv(kropp.slag, SLAG, 'Slag'),
      rubrik: kropp.rubrik === undefined ? undefined : txt(kropp.rubrik, 120),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning, 300),
      installt: kropp.installt === undefined ? undefined : kropp.installt ? 1 : 0,
    });
    svar(res, 200, tillfalle(t.id));
  }),

  /** Prickar av närvaron. Ledaren gör det i mobilen på plats. */
  rutt('PUT', '/api/traning/tillfallen/:id/narvaro', '@traning', ({ res, param, kropp, medlem }) => {
    const t = en('SELECT * FROM traningstillfalle WHERE id=?', param.id);
    if (!t) throw fel(404, 'Tillfället finns inte');
    for (const rad of kropp.narvaro || []) {
      const medlem_id = heltal(rad.medlem_id);
      if (!en('SELECT id FROM medlem WHERE id=?', medlem_id)) continue;
      const roll = ettAv(rad.roll, ['deltagare', 'ledare'], 'Roll') || 'deltagare';
      const finns = en('SELECT * FROM narvaro WHERE tillfalle_id=? AND medlem_id=?', t.id, medlem_id);
      if (finns) uppdatera('narvaro', finns.id, { narvarande: rad.narvarande ? 1 : 0, roll, anteckning: txt(rad.anteckning, 120) });
      else spara('narvaro', { tillfalle_id: t.id, medlem_id, roll, narvarande: rad.narvarande ? 1 : 0 });
    }
    revidera({ medlem, handelse: 'registrerade närvaro', objekt: `${t.datum} ${t.rubrik || ''}`.trim() });
    svar(res, 200, tillfalle(t.id));
  }),

  rutt('DELETE', '/api/traning/narvaro/:id', '@traning', ({ res, param }) => {
    kor('DELETE FROM narvaro WHERE id=?', param.id);
    svar(res, 200, { ok: true });
  }),

  // ---------- rapporter till bidragsgivarna ----------
  rutt('GET', '/api/traning/stod', 'medlem', ({ res, fraga, medlem }) => {
    if (!far(medlem, 'traning') && !far(medlem, 'ekonomi_las')) throw fel(403, 'Kräver behörigheten traning');
    const nyckel = fraga.get('regel') || 'lok';
    const regel = REGLER[nyckel];
    if (!regel) throw fel(400, `Okänt stöd: ${nyckel}`);
    const period = periodFor(regel, fraga.get('datum') || idag());
    const fran = datumfalt(fraga.get('fran')) || period.fran;
    const till = datumfalt(fraga.get('till')) || period.till;
    svar(res, 200, {
      regler: Object.fromEntries(Object.entries(REGLER).map(([k, r]) => [k, { namn: r.namn, mottagare: r.mottagare }])),
      vald: nyckel,
      period,
      ...sammanstallning({
        tillfallen: tillfallenMedNarvaro({ fran, till, grupp_id: heltal(fraga.get('grupp_id')) }),
        regel,
        fran,
        till,
      }),
    });
  }),

  rutt('GET', '/api/traning/stod.csv', 'medlem', ({ res, fraga, medlem }) => {
    if (!far(medlem, 'traning') && !far(medlem, 'ekonomi_las')) throw fel(403, 'Kräver behörigheten traning');
    const regel = REGLER[fraga.get('regel') || 'lok'];
    const period = periodFor(regel, fraga.get('datum') || idag());
    const fran = datumfalt(fraga.get('fran')) || period.fran;
    const till = datumfalt(fraga.get('till')) || period.till;
    const r = sammanstallning({ tillfallen: tillfallenMedNarvaro({ fran, till }), regel, fran, till });
    const rader = r.tillfallen.map((t) => ({
      ...t,
      godkand: t.godkand ? 'Ja' : 'Nej',
      brister: t.brister.join('; '),
    }));
    text(res, 200, csv(rader, [
      { falt: 'datum', rubrik: 'Datum' }, { falt: 'grupp', rubrik: 'Grupp' },
      { falt: 'minuter', rubrik: 'Minuter' }, { falt: 'deltagare', rubrik: 'Deltagare' },
      { falt: 'deltagare_i_alder', rubrik: `Deltagare ${regel.alder_min}-${regel.alder_max} år` },
      { falt: 'ledare', rubrik: 'Ledare' }, { falt: 'godkand', rubrik: 'Godkänd' },
      { falt: 'brister', rubrik: 'Brister' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="aktivitetsstod-${fran}.csv"` });
  }),

  /** Medlemsunderlag till förbund och kommun: antal per ålder och kategori. */
  rutt('GET', '/api/traning/medlemsrapport', '@medlemsregister', ({ res, fraga }) => {
    const ar = heltal(fraga.get('ar'), Number(idag().slice(0, 4)));
    const medlemmar = alla("SELECT * FROM medlem WHERE aktiv=1 AND (utradesdatum IS NULL OR utradesdatum >= ?)", `${ar}-01-01`);
    const spann = [
      ['0-6', 0, 6], ['7-12', 7, 12], ['13-16', 13, 16], ['17-20', 17, 20], ['21-25', 21, 25], ['26+', 26, 200],
    ];
    const alder = (m) => (m.fodelsedatum ? ar - Number(String(m.fodelsedatum).slice(0, 4)) : null);
    svar(res, 200, {
      ar,
      totalt: medlemmar.length,
      saknar_fodelsedatum: medlemmar.filter((m) => !m.fodelsedatum).length,
      per_aldersspann: spann.map(([namn, min, max]) => ({
        spann: namn,
        antal: medlemmar.filter((m) => alder(m) != null && alder(m) >= min && alder(m) <= max).length,
      })),
      per_kategori: alla(
        "SELECT coalesce(kategori,'aktiv') AS kategori, count(*) AS antal FROM medlem WHERE aktiv=1 GROUP BY kategori"
      ),
      per_sektion: alla(
        `SELECT s.namn AS sektion, count(DISTINCT gm.medlem_id) AS antal
         FROM sektion s LEFT JOIN traningsgrupp g ON g.sektion_id=s.id
         LEFT JOIN gruppmedlem gm ON gm.grupp_id=g.id AND gm.roll='aktiv'
         GROUP BY s.id ORDER BY s.ordning`
      ),
      licenser: alla(
        "SELECT count(*) AS antal FROM medlem WHERE licens IS NOT NULL AND (licens_till IS NULL OR licens_till >= date('now'))"
      )[0],
    });
  }),
];
