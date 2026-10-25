// Ärenden: fel, brister, risker och förbättringar med prioritet och allvarlighet.
import { alla, en, spara, uppdatera } from '../db.mjs';
import { RANG } from '../auth.mjs';
import { csv, datum, ettAv, fel, heltal, kravTxt, rutt, svar, text, txt } from '../http.mjs';
import { brevArende, skicka } from '../epost.mjs';

export const TYPER = ['fel', 'brist', 'forbattring', 'risk'];
export const ALLVAR = ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk'];
export const STATUSAR = ['ny', 'bekraftad', 'pagar', 'vantar', 'atgardad', 'stangd'];
export const OPPNA = ['ny', 'bekraftad', 'pagar', 'vantar'];

const ARENDE_SQL = `
  SELECT a.*, u.namn AS utrustning, u.typ AS utrustningstyp, o.namn AS omrade,
         sk.namn AS skapad_av, ti.namn AS tilldelad, ti.epost AS tilldelad_epost,
         (SELECT count(*) FROM arendehandelse h WHERE h.arende_id=a.id) AS antal_handelser
  FROM arende a
  LEFT JOIN utrustning u ON u.id=a.utrustning_id
  LEFT JOIN omrade o ON o.id=a.omrade_id
  LEFT JOIN medlem sk ON sk.id=a.skapad_av_id
  LEFT JOIN medlem ti ON ti.id=a.tilldelad_id`;

export const hamtaArende = (id) => {
  const a = en(`${ARENDE_SQL} WHERE a.id=?`, id);
  if (!a) return null;
  return {
    ...a,
    handelser: alla(
      `SELECT h.*, m.namn AS av FROM arendehandelse h LEFT JOIN medlem m ON m.id=h.av_id
       WHERE h.arende_id=? ORDER BY h.tid, h.id`,
      id
    ),
  };
};

export function arendelista({ status, prioritet, utrustning_id, omrade_id, tilldelad_id, fritext, antal = 300 }) {
  const villkor = [];
  const p = [];
  if (status === 'oppna') villkor.push(`a.status IN (${OPPNA.map(() => '?').join(',')})`), p.push(...OPPNA);
  else if (status) villkor.push('a.status=?'), p.push(status);
  if (prioritet) villkor.push('a.prioritet<=?'), p.push(Number(prioritet));
  if (utrustning_id) villkor.push('a.utrustning_id=?'), p.push(Number(utrustning_id));
  if (omrade_id) villkor.push('a.omrade_id=?'), p.push(Number(omrade_id));
  if (tilldelad_id) villkor.push('a.tilldelad_id=?'), p.push(Number(tilldelad_id));
  if (fritext) villkor.push('(a.titel LIKE ? OR a.beskrivning LIKE ?)'), p.push(`%${fritext}%`, `%${fritext}%`);
  return alla(
    `${ARENDE_SQL} ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''}
     ORDER BY CASE WHEN a.status IN ('atgardad','stangd') THEN 1 ELSE 0 END,
              a.prioritet, a.uppdaterad DESC LIMIT ?`,
    ...p,
    Number(antal)
  );
}

/** Skapar ärende + första händelse. Används även av checklistor. */
export function skapaArende(data, medlem) {
  const id = spara('arende', {
    titel: kravTxt(data.titel, 'Titel', 160),
    beskrivning: txt(data.beskrivning),
    typ: ettAv(data.typ, TYPER, 'Typ') || 'fel',
    prioritet: Math.min(4, Math.max(1, heltal(data.prioritet, 3))),
    allvarlighet: ettAv(data.allvarlighet, ALLVAR, 'Allvarlighet') || 'begransar',
    status: ettAv(data.status, STATUSAR, 'Status') || 'ny',
    utrustning_id: heltal(data.utrustning_id),
    komponent_id: heltal(data.komponent_id),
    omrade_id: heltal(data.omrade_id),
    driftpaverkan: txt(data.driftpaverkan, 200),
    tilldelad_id: heltal(data.tilldelad_id),
    korning_id: heltal(data.korning_id),
    deadline: datum(data.deadline, 'Deadline'),
    skapad_av_id: medlem?.id ?? null,
  });
  spara('arendehandelse', {
    arende_id: id,
    av_id: medlem?.id ?? null,
    slag: 'kommentar',
    text: 'Ärendet skapades',
  });
  return hamtaArende(id);
}

export const rutter = [
  rutt('GET', '/api/arenden', 'medlem', ({ res, fraga }) =>
    svar(res, 200, arendelista({
      status: fraga.get('status'),
      prioritet: fraga.get('prioritet'),
      utrustning_id: fraga.get('utrustning_id'),
      omrade_id: fraga.get('omrade_id'),
      tilldelad_id: fraga.get('tilldelad_id'),
      fritext: fraga.get('fritext'),
      antal: fraga.get('antal') || 300,
    }))
  ),

  rutt('GET', '/api/arenden.csv', 'medlem', ({ res, fraga }) => {
    const rader = arendelista({ status: fraga.get('status') || null, antal: 2000 }).map((a) => ({
      ...a,
      prioritet_text: ['', 'Akut', 'Hög', 'Normal', 'Låg'][a.prioritet],
    }));
    text(res, 200, csv(rader, [
      { falt: 'id', rubrik: 'Nr' }, { falt: 'titel', rubrik: 'Titel' },
      { falt: 'typ', rubrik: 'Typ' }, { falt: 'prioritet_text', rubrik: 'Prioritet' },
      { falt: 'allvarlighet', rubrik: 'Allvarlighet' }, { falt: 'status', rubrik: 'Status' },
      { falt: 'omrade', rubrik: 'Område' }, { falt: 'utrustning', rubrik: 'Utrustning' },
      { falt: 'tilldelad', rubrik: 'Tilldelad' }, { falt: 'skapad', rubrik: 'Skapad' },
      { falt: 'deadline', rubrik: 'Deadline' }, { falt: 'stangd', rubrik: 'Stängd' },
      { falt: 'beskrivning', rubrik: 'Beskrivning' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="arenden.csv"' });
  }),

  rutt('GET', '/api/arenden/:id', 'medlem', ({ res, param }) => {
    const a = hamtaArende(param.id);
    if (!a) throw fel(404, 'Ärendet finns inte');
    svar(res, 200, a);
  }),

  rutt('POST', '/api/arenden', 'medlem', async ({ res, kropp, medlem }) => {
    const a = skapaArende(kropp, medlem);
    if (a.tilldelad_epost && a.prioritet <= 2)
      await skicka({
        till: a.tilldelad_epost,
        amne: `[HAK] Ärende #${a.id}: ${a.titel}`,
        text: brevArende(a, a.utrustning),
        slag: 'arende',
      });
    svar(res, 201, a);
  }),

  rutt('PUT', '/api/arenden/:id', 'medlem', async ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM arende WHERE id=?', param.id);
    if (!a) throw fel(404, 'Ärendet finns inte');
    const egen = a.skapad_av_id === medlem.id || a.tilldelad_id === medlem.id;
    if (!egen && RANG[medlem.roll] < RANG.backansvarig)
      throw fel(403, 'Bara ansvariga ändrar andras ärenden');

    const nyStatus = ettAv(kropp.status, STATUSAR, 'Status');

    // Ett säkerhetsärende får inte tystna av sig självt. Att skriva
    // "åtgärdad" på en säkerhetsrisk kräver att någon med ansvar gör det,
    // och att det står vad som gjordes.
    if (nyStatus && ['atgardad', 'stangd'].includes(nyStatus) && a.allvarlighet === 'sakerhetsrisk') {
      if (RANG[medlem.roll] < RANG.backansvarig)
        throw fel(403, 'Bara backansvarig eller högre får stänga ett säkerhetsärende');
      const atgard = txt(kropp.atgard);
      const dokumenterad = en(
        `SELECT id FROM arendehandelse WHERE arende_id=? AND slag='atgard'`,
        a.id
      );
      if (!atgard && !dokumenterad)
        throw fel(400, 'Beskriv åtgärden innan säkerhetsärendet stängs');
      if (atgard)
        spara('arendehandelse', { arende_id: a.id, av_id: medlem.id, slag: 'atgard', text: atgard });
    } else if (txt(kropp.atgard)) {
      spara('arendehandelse', { arende_id: a.id, av_id: medlem.id, slag: 'atgard', text: txt(kropp.atgard) });
    }

    const nyTilldelad = kropp.tilldelad_id === undefined ? undefined : heltal(kropp.tilldelad_id);
    uppdatera('arende', a.id, {
      titel: txt(kropp.titel, 160),
      beskrivning: kropp.beskrivning === undefined ? undefined : txt(kropp.beskrivning),
      typ: ettAv(kropp.typ, TYPER, 'Typ'),
      prioritet: kropp.prioritet === undefined ? undefined : Math.min(4, Math.max(1, heltal(kropp.prioritet, 3))),
      allvarlighet: ettAv(kropp.allvarlighet, ALLVAR, 'Allvarlighet'),
      status: nyStatus,
      utrustning_id: kropp.utrustning_id === undefined ? undefined : heltal(kropp.utrustning_id),
      omrade_id: kropp.omrade_id === undefined ? undefined : heltal(kropp.omrade_id),
      komponent_id: kropp.komponent_id === undefined ? undefined : heltal(kropp.komponent_id),
      kostnad_ore: kropp.kostnad_ore === undefined ? undefined : heltal(kropp.kostnad_ore),
      driftpaverkan: kropp.driftpaverkan === undefined ? undefined : txt(kropp.driftpaverkan, 200),
      tilldelad_id: nyTilldelad,
      deadline: kropp.deadline === undefined ? undefined : datum(kropp.deadline, 'Deadline'),
      uppdaterad: new Date().toISOString().slice(0, 19).replace('T', ' '),
      stangd: nyStatus === 'stangd' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : undefined,
    });
    if (nyStatus && nyStatus !== a.status)
      spara('arendehandelse', { arende_id: a.id, av_id: medlem.id, slag: 'status', text: `Status: ${a.status} → ${nyStatus}` });
    if (nyTilldelad !== undefined && nyTilldelad !== a.tilldelad_id) {
      const m = nyTilldelad ? en('SELECT * FROM medlem WHERE id=?', nyTilldelad) : null;
      spara('arendehandelse', {
        arende_id: a.id, av_id: medlem.id, slag: 'tilldelning',
        text: m ? `Tilldelad ${m.namn}` : 'Tilldelning borttagen',
      });
      const uppdaterad = hamtaArende(a.id);
      if (m?.epost)
        await skicka({
          till: m.epost,
          amne: `[HAK] Ärende #${a.id} tilldelat dig: ${uppdaterad.titel}`,
          text: brevArende(uppdaterad, uppdaterad.utrustning),
          slag: 'arende',
        });
    }
    svar(res, 200, hamtaArende(a.id));
  }),

  rutt('POST', '/api/arenden/:id/handelse', 'medlem', ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM arende WHERE id=?', param.id);
    if (!a) throw fel(404, 'Ärendet finns inte');
    spara('arendehandelse', {
      arende_id: a.id,
      av_id: medlem.id,
      slag: ettAv(kropp.slag, ['kommentar', 'atgard'], 'Slag') || 'kommentar',
      text: kravTxt(kropp.text, 'Text'),
    });
    uppdatera('arende', a.id, { uppdaterad: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    svar(res, 201, hamtaArende(a.id));
  }),
];
