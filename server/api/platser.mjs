// Positionerna i backen: var snön läggs, och vad som står där.
import { alla, en, kor, spara, uppdatera } from '../db.mjs';
import {
  maskinPa, olacerade, platsFor, platsTom, platser, PLATSSLAG, PLATSSLAGNAMN,
  stallUpp, uppstallningshistorik, UTRUSTNINGSSLAGNAMN,
} from '../platser.mjs';
import { bool, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';

export const rutter = [
  rutt('GET', '/api/platser', 'medlem', ({ res, fraga }) =>
    svar(res, 200, {
      platser: platser({ slag: fraga.get('slag') }),
      slag: PLATSSLAG,
      slagnamn: PLATSSLAGNAMN,
      // Maskiner som inte står någonstans just nu – förråd, verkstad, reserv.
      olacerade: olacerade(),
    })
  ),

  rutt('GET', '/api/platser/:id', 'medlem', ({ res, param }) => {
    const p = en('SELECT * FROM snoplats WHERE id=?', param.id);
    if (!p) throw fel(404, 'Positionen finns inte');
    const maskin = maskinPa(p.id);
    svar(res, 200, {
      plats: p,
      maskin,
      historik: uppstallningshistorik({ snoplats_id: p.id }),
      // Fel på platsen och fel på maskinen hålls isär, för de betyder
      // olika saker: det ena följer platsen, det andra maskinen.
      arenden_plats: alla(
        `SELECT a.*, m.namn AS skapad_av FROM arende a LEFT JOIN medlem m ON m.id=a.skapad_av_id
          WHERE a.snoplats_id=? ORDER BY a.skapad DESC LIMIT 50`,
        p.id
      ),
      arenden_maskin: maskin
        ? alla(
            `SELECT a.*, m.namn AS skapad_av FROM arende a LEFT JOIN medlem m ON m.id=a.skapad_av_id
              WHERE a.utrustning_id=? AND a.snoplats_id IS NULL ORDER BY a.skapad DESC LIMIT 50`,
            maskin.id
          )
        : [],
    });
  }),

  rutt('POST', '/api/platser', '@anlaggning', ({ res, kropp }) => {
    const id = spara('snoplats', {
      nummer: heltal(kropp.nummer),
      namn: kravTxt(kropp.namn, 'Namn', 80),
      slag: ettAv(kropp.slag, PLATSSLAG, 'Slag') || 'lans',
      omrade_id: heltal(kropp.omrade_id),
      placering: txt(kropp.placering, 160),
      meter_fran_topp: num(kropp.meter_fran_topp),
      vattenuttag: txt(kropp.vattenuttag, 60),
      elanslutning: txt(kropp.elanslutning, 60),
      anteckning: txt(kropp.anteckning),
      ordning: heltal(kropp.ordning, 0),
    });
    svar(res, 201, { plats: en('SELECT * FROM snoplats WHERE id=?', id) });
  }),

  rutt('PUT', '/api/platser/:id', '@anlaggning', ({ res, param, kropp }) => {
    if (!en('SELECT id FROM snoplats WHERE id=?', param.id)) throw fel(404, 'Positionen finns inte');
    uppdatera('snoplats', param.id, {
      nummer: heltal(kropp.nummer),
      namn: kropp.namn === undefined ? undefined : kravTxt(kropp.namn, 'Namn', 80),
      slag: ettAv(kropp.slag, PLATSSLAG, 'Slag'),
      omrade_id: kropp.omrade_id === undefined ? undefined : heltal(kropp.omrade_id),
      placering: txt(kropp.placering, 160),
      meter_fran_topp: num(kropp.meter_fran_topp),
      vattenuttag: txt(kropp.vattenuttag, 60),
      elanslutning: txt(kropp.elanslutning, 60),
      anteckning: txt(kropp.anteckning),
      ordning: heltal(kropp.ordning),
      aktiv: bool(kropp.aktiv),
    });
    svar(res, 200, { plats: en('SELECT * FROM snoplats WHERE id=?', param.id) });
  }),

  /** Ställ upp en maskin på en plats, eller töm platsen. */
  rutt('POST', '/api/platser/:id/maskin', '@anlaggning', ({ res, param, kropp, medlem }) => {
    const p = en('SELECT * FROM snoplats WHERE id=?', param.id);
    if (!p) throw fel(404, 'Positionen finns inte');

    if (kropp.utrustning_id === null) {
      const togs = platsTom(p.id);
      return svar(res, 200, { plats: platser().find((x) => x.id === p.id), tidigare: togs });
    }

    const u = en('SELECT * FROM utrustning WHERE id=?', heltal(kropp.utrustning_id));
    if (!u) throw fel(404, 'Maskinen finns inte');
    // En lans hör inte hemma på en fläktplats. Det är inget systemet ska
    // tiga om, men inte heller hindra: det kan finnas skäl.
    const varning =
      (p.slag === 'lans' && u.typ !== 'lans') || (p.slag === 'flakt' && u.typ !== 'flakt')
        ? `${u.namn} är ${UTRUSTNINGSSLAGNAMN[u.typ] || u.typ}, positionen är gjord för ${PLATSSLAGNAMN[p.slag]}`
        : null;

    const r = stallUpp({
      snoplats_id: p.id,
      utrustning_id: u.id,
      av_id: medlem.id,
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 200, {
      plats: platser().find((x) => x.id === p.id),
      avflyttade: r.avflyttade,
      oforandrad: r.oforandrad,
      varning,
    });
  }),

  rutt('GET', '/api/platser/maskin/:id/historik', 'medlem', ({ res, param }) =>
    svar(res, 200, {
      nu: platsFor(param.id),
      historik: uppstallningshistorik({ utrustning_id: param.id }),
    })
  ),

  rutt('DELETE', '/api/platser/:id', '@anlaggning', ({ res, param }) => {
    const p = en('SELECT * FROM snoplats WHERE id=?', param.id);
    if (!p) throw fel(404, 'Positionen finns inte');
    // Platsen bär historik och kan hänga ihop med ärenden. Den stängs av,
    // den raderas inte.
    uppdatera('snoplats', p.id, { aktiv: 0 });
    platsTom(p.id);
    svar(res, 200, { avstangd: p.id });
  }),
];
