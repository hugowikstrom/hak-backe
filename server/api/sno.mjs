// Snöläggning: pass, mätningar och nuläge.
import { alla, en, spara, uppdatera } from '../db.mjs';
import { kompletteraMatning, klartecken, wetbulb } from '../snoteknik.mjs';
import { csv, ettAv, fel, heltal, num, rutt, svar, text, txt } from '../http.mjs';

const MATFALT = [
  'lufttemp', 'luftfukt', 'wetbulb', 'vattenflode', 'vattentryck',
  'lufttryck', 'barometer', 'vind_styrka',
];

const MATNING_SQL = `
  SELECT m.*, u.namn AS utrustning, u.typ AS utrustningstyp, o.namn AS omrade, me.namn AS av
  FROM matning m
  LEFT JOIN utrustning u ON u.id=m.utrustning_id
  LEFT JOIN omrade o ON o.id=m.omrade_id
  LEFT JOIN medlem me ON me.id=m.av_id`;

export const matningar = (villkor = '', ...p) =>
  alla(`${MATNING_SQL} ${villkor} ORDER BY m.tid DESC, m.id DESC`, ...p).map(kompletteraMatning);

function lasMatning(kropp) {
  const data = { };
  for (const f of MATFALT) if (kropp[f] !== undefined) data[f] = num(kropp[f]);
  return {
    ...data,
    tid: txt(kropp.tid) || undefined,
    snopass_id: kropp.snopass_id === undefined ? undefined : heltal(kropp.snopass_id),
    utrustning_id: kropp.utrustning_id === undefined ? undefined : heltal(kropp.utrustning_id),
    omrade_id: kropp.omrade_id === undefined ? undefined : heltal(kropp.omrade_id),
    vind_riktning: kropp.vind_riktning === undefined ? undefined : txt(kropp.vind_riktning, 8),
    snokvalitet: ettAv(kropp.snokvalitet, ['torr', 'normal', 'blot'], 'Snökvalitet') ?? undefined,
    anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
  };
}

/** Nuläget: senaste mätning per utrustning samt öppet snöpass. */
export function nulage() {
  const pass = en(`SELECT s.*, m.namn AS ansvarig FROM snopass s
                   LEFT JOIN medlem m ON m.id=s.ansvarig_id
                   WHERE s.status='pagar' ORDER BY s.start DESC LIMIT 1`);
  const senaste = alla(`${MATNING_SQL}
     WHERE m.id IN (SELECT max(id) FROM matning WHERE utrustning_id IS NOT NULL GROUP BY utrustning_id)
     ORDER BY u.ordning, u.namn`).map(kompletteraMatning);
  const generellt = en(`${MATNING_SQL} ORDER BY m.tid DESC, m.id DESC LIMIT 1`);
  return {
    pass,
    senaste,
    senasteMatning: generellt ? kompletteraMatning(generellt) : null,
    klartecken: generellt
      ? klartecken(generellt.wetbulb ?? wetbulb(generellt.lufttemp, generellt.luftfukt))
      : klartecken(null),
  };
}

export const rutter = [
  rutt('GET', '/api/sno/nulage', 'medlem', ({ res }) => svar(res, 200, nulage())),

  rutt('GET', '/api/sno/matningar', 'medlem', ({ res, fraga }) => {
    const gran = heltal(fraga.get('antal'), 200);
    const utr = heltal(fraga.get('utrustning_id'));
    const pass = heltal(fraga.get('snopass_id'));
    const villkor = [];
    const p = [];
    if (utr) { villkor.push('m.utrustning_id=?'); p.push(utr); }
    if (pass) { villkor.push('m.snopass_id=?'); p.push(pass); }
    if (fraga.get('fran')) { villkor.push('m.tid >= ?'); p.push(fraga.get('fran')); }
    if (fraga.get('till')) { villkor.push('m.tid <= ?'); p.push(`${fraga.get('till')} 23:59:59`); }
    const rader = matningar(villkor.length ? `WHERE ${villkor.join(' AND ')}` : '', ...p).slice(0, gran);
    svar(res, 200, rader);
  }),

  rutt('GET', '/api/sno/matningar.csv', 'medlem', ({ res }) => {
    const rader = matningar().map((m) => ({ ...m, klartecken: m.klartecken.niva }));
    text(res, 200, csv(rader, [
      { falt: 'tid', rubrik: 'Tid' }, { falt: 'utrustning', rubrik: 'Utrustning' },
      { falt: 'omrade', rubrik: 'Område' }, { falt: 'lufttemp', rubrik: 'Lufttemp °C' },
      { falt: 'luftfukt', rubrik: 'Fukt %' }, { falt: 'wetbulb', rubrik: 'Wetbulb °C' },
      { falt: 'vattenflode', rubrik: 'Vattenflöde l/s' }, { falt: 'vattentryck', rubrik: 'Vattentryck bar' },
      { falt: 'lufttryck', rubrik: 'Lufttryck bar' }, { falt: 'barometer', rubrik: 'Barometer hPa' },
      { falt: 'vind_styrka', rubrik: 'Vind m/s' }, { falt: 'vind_riktning', rubrik: 'Vindriktning' },
      { falt: 'snokvalitet', rubrik: 'Snökvalitet' }, { falt: 'klartecken', rubrik: 'Klartecken' },
      { falt: 'anteckning', rubrik: 'Anteckning' }, { falt: 'av', rubrik: 'Rapporterad av' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="matningar.csv"' });
  }),

  rutt('POST', '/api/sno/matningar', 'medlem', ({ res, kropp, medlem }) => {
    const data = lasMatning(kropp);
    if (MATFALT.every((f) => data[f] == null)) throw fel(400, 'Minst ett mätvärde krävs');
    const id = spara('matning', { ...data, av_id: medlem.id });
    svar(res, 201, kompletteraMatning(en(`${MATNING_SQL} WHERE m.id=?`, id)));
  }),

  rutt('PUT', '/api/sno/matningar/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const m = en('SELECT * FROM matning WHERE id=?', param.id);
    if (!m) throw fel(404, 'Mätningen finns inte');
    if (m.av_id !== medlem.id && medlem.roll === 'medlem')
      throw fel(403, 'Du kan bara ändra dina egna mätningar');
    uppdatera('matning', m.id, lasMatning(kropp));
    svar(res, 200, kompletteraMatning(en(`${MATNING_SQL} WHERE m.id=?`, m.id)));
  }),

  rutt('GET', '/api/sno/pass', 'medlem', ({ res }) =>
    svar(res, 200, alla(`SELECT s.*, m.namn AS ansvarig,
             (SELECT count(*) FROM matning WHERE snopass_id=s.id) AS antal_matningar
           FROM snopass s LEFT JOIN medlem m ON m.id=s.ansvarig_id
           ORDER BY s.start DESC LIMIT 100`))
  ),

  rutt('POST', '/api/sno/pass', 'medlem', ({ res, kropp, medlem }) => {
    const id = spara('snopass', {
      start: txt(kropp.start) || undefined,
      ansvarig_id: heltal(kropp.ansvarig_id) ?? medlem.id,
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 201, en('SELECT * FROM snopass WHERE id=?', id));
  }),

  rutt('PUT', '/api/sno/pass/:id', 'medlem', ({ res, param, kropp }) => {
    const p = en('SELECT * FROM snopass WHERE id=?', param.id);
    if (!p) throw fel(404, 'Snöpasset finns inte');
    const avsluta = kropp.status === 'avslutat';
    uppdatera('snopass', p.id, {
      status: ettAv(kropp.status, ['pagar', 'avslutat'], 'Status'),
      slut: avsluta ? (txt(kropp.slut) || new Date().toISOString().slice(0, 19).replace('T', ' ')) : txt(kropp.slut),
      ansvarig_id: kropp.ansvarig_id === undefined ? undefined : heltal(kropp.ansvarig_id),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
    });
    svar(res, 200, en('SELECT * FROM snopass WHERE id=?', p.id));
  }),

  rutt('POST', '/api/sno/wetbulb', 'medlem', ({ res, kropp }) => {
    const vk = wetbulb(num(kropp.lufttemp), num(kropp.luftfukt));
    svar(res, 200, { wetbulb: vk, klartecken: klartecken(vk) });
  }),
];
