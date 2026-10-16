// Startsidans samlade nuläge.
import { alla, en } from '../db.mjs';
import { rutt, svar } from '../http.mjs';
import { idag, plusDagar } from '../tid.mjs';
import { nulage } from './sno.mjs';
import { lageFor, rutnat } from './bemanning.mjs';
import { OPPNA } from './arenden.mjs';
import { epostlogg } from '../epost.mjs';

export const rutter = [
  rutt('GET', '/api/oversikt', 'medlem', ({ res, medlem }) => {
    const ft = OPPNA.map(() => '?').join(',');
    const dag = idag();
    const grid = rutnat(dag, plusDagar(dag, 6));
    svar(res, 200, {
      sno: nulage(),
      arenden: {
        oppna: en(`SELECT count(*) AS n FROM arende WHERE status IN (${ft})`, ...OPPNA).n,
        akuta: alla(
          `SELECT a.id, a.titel, a.prioritet, a.status, a.allvarlighet, u.namn AS utrustning, o.namn AS omrade
           FROM arende a LEFT JOIN utrustning u ON u.id=a.utrustning_id LEFT JOIN omrade o ON o.id=a.omrade_id
           WHERE a.status IN (${ft}) AND (a.prioritet<=2 OR a.allvarlighet='sakerhetsrisk')
           ORDER BY a.prioritet, a.skapad LIMIT 8`,
          ...OPPNA
        ),
        mina: alla(
          `SELECT id, titel, prioritet, status FROM arende WHERE tilldelad_id=? AND status IN (${ft})
           ORDER BY prioritet LIMIT 8`,
          medlem.id, ...OPPNA
        ),
      },
      checklistor: {
        pagar: alla(
          `SELECT k.id, m.namn AS mall, u.namn AS utrustning, k.startad, me.namn AS av
           FROM checklistkorning k JOIN checklistmall m ON m.id=k.mall_id
           LEFT JOIN utrustning u ON u.id=k.utrustning_id LEFT JOIN medlem me ON me.id=k.av_id
           WHERE k.status='pagar' ORDER BY k.startad DESC LIMIT 8`
        ),
        avvikelser_7d: en(
          `SELECT count(*) AS n FROM checklistsvar WHERE avvikelse=1 AND tid >= datetime('now','-7 days')`
        ).n,
      },
      bemanning: {
        idag: grid.pass.filter((p) => p.datum === dag),
        veckan: grid.pass,
        hal: grid.pass.filter((p) => p.bokningar.filter((b) => b.status !== 'avbokad').length < p.behov).length,
      },
      mitt_lage: lageFor(medlem.id),
      utrustning_ur_drift: alla(
        `SELECT u.id, u.namn, u.typ, u.status, o.namn AS omrade FROM utrustning u
         LEFT JOIN omrade o ON o.id=u.omrade_id WHERE u.status<>'drift' AND u.aktiv=1 ORDER BY u.namn`
      ),
      senaste_epost: epostlogg(5),
    });
  }),
];
