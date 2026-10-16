// Plånboken: påfyllning, saldo och inställningar.
import { en } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import {
  alla_saldon, aterbetala, fyllPa, historik, installningar, rabattsats, saldo,
  sattInstallning, totaltSaldo,
} from '../planbok.mjs';
import { kronor } from '../pengar.mjs';
import { ettAv, fel, heltal, rutt, svar, txt } from '../http.mjs';

const BETALMEDEL = ['swish', 'kort', 'kontant'];

const lage = (medlem_id) => ({
  medlem_id,
  saldo_ore: saldo(medlem_id),
  saldo: kronor(saldo(medlem_id)),
  rabatt_procent: Math.round(rabattsats() * 100),
  historik: historik(medlem_id, 50),
});

export const rutter = [
  rutt('GET', '/api/planbok/min', 'medlem', ({ res, medlem }) =>
    svar(res, 200, { ...lage(medlem.id), namn: medlem.namn })
  ),

  rutt('GET', '/api/planbok/medlem/:id', 'medlem', ({ res, param, medlem }) => {
    const id = heltal(param.id);
    if (id !== medlem.id && !far(medlem, 'kassa') && !far(medlem, 'ekonomi_las'))
      throw fel(403, 'Du får bara se din egen plånbok');
    const m = en('SELECT id, namn, medlemsnummer FROM medlem WHERE id=?', id);
    if (!m) throw fel(404, 'Medlemmen finns inte');
    svar(res, 200, { ...lage(m.id), namn: m.namn, medlemsnummer: m.medlemsnummer });
  }),

  /** Översikt för kassan och kassören. */
  rutt('GET', '/api/planbok', 'medlem', ({ res, medlem }) => {
    if (!far(medlem, 'kassa') && !far(medlem, 'ekonomi_las')) throw fel(403, 'Kräver kassabehörighet');
    svar(res, 200, {
      saldon: alla_saldon(),
      totalt_ore: totaltSaldo(),
      totalt: kronor(totaltSaldo()),
      rabatt_procent: Math.round(rabattsats() * 100),
      installningar: installningar(),
    });
  }),

  rutt('POST', '/api/planbok/insattning', 'medlem', ({ res, kropp, medlem }) => {
    if (!far(medlem, 'kassa') && !far(medlem, 'ekonomi')) throw fel(403, 'Kräver kassabehörighet');
    const m = en('SELECT * FROM medlem WHERE id=?', heltal(kropp.medlem_id));
    if (!m) throw fel(404, 'Medlemmen finns inte');
    const transaktion = fyllPa({
      medlem: m,
      belopp_ore: heltal(kropp.belopp_ore, 0),
      betalmedel: ettAv(kropp.betalmedel, BETALMEDEL, 'Betalmedel') || 'swish',
      anteckning: txt(kropp.anteckning, 200),
      av: medlem,
    });
    revidera({ medlem, handelse: 'fyllde på plånbok', objekt: m.namn, detalj: { belopp_ore: transaktion.belopp_ore } });
    svar(res, 201, { ...transaktion, saldo: kronor(transaktion.saldo_efter_ore) });
  }),

  rutt('POST', '/api/planbok/aterbetalning', '@ekonomi', ({ res, kropp, medlem }) => {
    const m = en('SELECT * FROM medlem WHERE id=?', heltal(kropp.medlem_id));
    if (!m) throw fel(404, 'Medlemmen finns inte');
    const t = aterbetala({
      medlem: m,
      belopp_ore: heltal(kropp.belopp_ore, 0),
      betalmedel: ettAv(kropp.betalmedel, BETALMEDEL, 'Betalmedel') || 'swish',
      anteckning: txt(kropp.anteckning, 200),
      av: medlem,
    });
    revidera({ medlem, handelse: 'betalade tillbaka ur plånbok', objekt: m.namn });
    svar(res, 201, t);
  }),

  rutt('PUT', '/api/planbok/installningar', '@ekonomi', ({ res, kropp, medlem }) => {
    for (const [nyckel, varde] of Object.entries(kropp)) {
      if (!['medlemsrabatt_procent', 'rabatterade_kategorier', 'planbok_min_insattning'].includes(nyckel)) continue;
      sattInstallning(nyckel, varde);
      revidera({ medlem, handelse: 'ändrade inställning', objekt: nyckel, detalj: String(varde) });
    }
    svar(res, 200, installningar());
  }),
];
