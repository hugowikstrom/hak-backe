// Kiosken: kundens beställning via QR, och kassans vy.
//
// De publika rutterna är öppna med flit – en gäst i backen ska kunna skanna
// en kod och beställa utan konto. Därför: servern bestämmer priserna, kunden
// skickar bara artikel-id och antal, och skrivningarna är takade per IP.
import { randomBytes } from 'node:crypto';
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { RANG } from '../auth.mjs';
import { kronor, normaliseraMobil } from '../pengar.mjs';
import { betalning, qrkod, swishPa, swishnummer } from '../swish.mjs';
import { skickaSms, smsPa } from '../sms.mjs';
import { bokforAffar, INTAKTSKONTON, revidera, verifikationFor } from '../bokforing.mjs';
import { betalaMedPlanbok, medRabatt, rabattsats, saldo } from '../planbok.mjs';
import { csv, ettAv, fel, heltal, kravTxt, rutt, svar, text, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';

const STATUSAR = ['ny', 'betald', 'tillagas', 'klar', 'hamtad', 'avbruten'];
const BETALSATT = ['swish', 'kort', 'kontant', 'planbok', 'ej_betald'];
const OPPNA = ['ny', 'betald', 'tillagas', 'klar'];

// Enkel spärr mot den som råkar hålla inne knappen eller vill busa.
const takar = new Map();
export function tak(nyckel, antal = 20, fonsterMs = 600000) {
  const nuMs = Date.now();
  const lista = (takar.get(nyckel) || []).filter((t) => nuMs - t < fonsterMs);
  lista.push(nuMs);
  takar.set(nyckel, lista);
  if (takar.size > 5000) takar.clear();
  if (lista.length > antal) throw fel(429, 'För många försök. Vänta en stund.');
}

export const meny = () =>
  alla('SELECT * FROM artikel WHERE aktiv=1 ORDER BY ordning, namn').map((a) => ({
    id: a.id, namn: a.namn, beskrivning: a.beskrivning, kategori: a.kategori,
    pris_ore: a.pris_ore, pris: kronor(a.pris_ore), emoji: a.emoji, slut: !!a.slut,
  }));

export const orderrader = (id) => alla('SELECT * FROM orderrad WHERE order_id=? ORDER BY id', id);

export const hamtaOrder = (id) => {
  const o = en('SELECT * FROM kundorder WHERE id=?', id);
  return o ? { ...o, rader: orderrader(o.id), belopp: kronor(o.belopp_ore) } : null;
};

/** Löpnummer som ropas ut i luckan: K1, K2 … nollställs varje dag. */
function nyttNummer(prefix = 'K') {
  const n = en("SELECT count(*) AS n FROM kundorder WHERE date(skapad)=date('now')").n;
  for (let i = n + 1; i < n + 50; i++) {
    const kandidat = `${prefix}${i}`;
    if (!en('SELECT id FROM kundorder WHERE nummer=?', kandidat)) return kandidat;
  }
  return `${prefix}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/** Bygger en order av artikel-id och antal. Priserna hämtas alltid här. */
export function skapaOrder({ rader, mobil, plats, anteckning, kanal = 'qr', av = null, betalsatt = null }) {
  if (!Array.isArray(rader) || !rader.length) throw fel(400, 'Beställningen är tom');
  if (rader.length > 40) throw fel(400, 'För många rader i en order');

  const poster = rader.map((r) => {
    const artikel = en('SELECT * FROM artikel WHERE id=? AND aktiv=1', heltal(r.artikel_id));
    if (!artikel) throw fel(400, 'Artikeln finns inte');
    if (artikel.slut) throw fel(409, `${artikel.namn} är slut i dag`);
    const antal = Math.min(20, Math.max(1, heltal(r.antal, 1)));
    return { artikel, antal, anteckning: txt(r.anteckning, 120) };
  });

  const belopp = poster.reduce((a, p) => a + p.artikel.pris_ore * p.antal, 0);
  const nummer = nyttNummer();
  const kod = randomBytes(4).toString('hex');

  const id = transaktion(() => {
    const orderId = spara('kundorder', {
      nummer, kod, kanal,
      mobil: mobil ? normaliseraMobil(mobil) : null,
      belopp_ore: belopp,
      plats: txt(plats, 60),
      anteckning: txt(anteckning, 300),
      betalsatt,
      betald_tid: betalsatt && betalsatt !== 'ej_betald' ? nu() : null,
      status: betalsatt && betalsatt !== 'ej_betald' ? 'betald' : 'ny',
      av_id: av?.id ?? null,
    });
    for (const p of poster)
      spara('orderrad', {
        order_id: orderId, artikel_id: p.artikel.id, namn: p.artikel.namn,
        styckpris_ore: p.artikel.pris_ore, antal: p.antal, anteckning: p.anteckning,
      });
    return orderId;
  });
  return hamtaOrder(id);
}

/** Bokför ordern när betalningen är kvitterad. Körs en gång per order. */
export function bokforOrder(order, { betalmedel, av, medlem_id }) {
  if (verifikationFor('order', order.id)) return verifikationFor('order', order.id);
  const rader = order.rader.map((r) => {
    const artikel = r.artikel_id ? en('SELECT kategori FROM artikel WHERE id=?', r.artikel_id) : null;
    return {
      kategori: artikel?.kategori || 'ovrigt',
      konto: artikel?.kategori === 'liftkort' ? INTAKTSKONTON.liftkort : INTAKTSKONTON.kiosk,
      belopp_ore: r.styckpris_ore * r.antal,
    };
  });

  // Plånboken: medlemsrabatt och betalning ur den egna kassan.
  if (betalmedel === 'planbok') {
    const kund = en('SELECT * FROM medlem WHERE id=?', medlem_id);
    if (!kund) throw fel(400, 'Välj vilken medlem som betalar med plånboken');
    const { rader: rabatterade } = medRabatt(rader);
    const { verifikation } = betalaMedPlanbok({
      medlem: kund,
      rader: rabatterade,
      beskrivning: `Kioskorder ${order.nummer}`,
      serie: 'K',
      referens_slag: 'order',
      referens_id: order.id,
      av,
    });
    return verifikation;
  }

  return bokforAffar({
    serie: 'K',
    datum: String(order.skapad).slice(0, 10),
    beskrivning: `Kioskorder ${order.nummer}`,
    motpart: order.mobil || 'Kontantkund',
    rader,
    betalmedel: betalmedel === 'ej_betald' ? 'faktura' : betalmedel,
    referens_slag: 'order',
    referens_id: order.id,
    av,
    underlag: { nummer: order.nummer, rader: order.rader, belopp_ore: order.belopp_ore, kanal: order.kanal },
  });
}

const publikOrder = (o) => ({
  nummer: o.nummer, status: o.status, belopp_ore: o.belopp_ore, belopp: kronor(o.belopp_ore),
  swish: betalning({ belopp_ore: o.belopp_ore, meddelande: `HAK ${o.nummer}` }),
  betalsatt: o.betalsatt, betald: !!o.betald_tid, skapad: o.skapad, plats: o.plats,
  anteckning: o.anteckning,
  rader: o.rader.map((r) => ({ namn: r.namn, antal: r.antal, styckpris_ore: r.styckpris_ore, anteckning: r.anteckning })),
});

/** Vad ordern kostar om medlemmen betalar ur plånboken. */
export function planbokspris(rader) {
  const med = rader.map((r) => ({ ...r, kategori: r.kategori || 'ovrigt' }));
  const { rader: rabatterade, rabatt_ore, sats } = medRabatt(med);
  return {
    belopp_ore: rabatterade.reduce((a, r) => a + r.belopp_ore, 0),
    rabatt_ore,
    rabatt_procent: Math.round(sats * 100),
  };
}

export const rutter = [
  // ---------- publikt ----------
  rutt('GET', '/api/fik/meny', 'oppen', ({ res }) =>
    svar(res, 200, {
      artiklar: meny(),
      swish: swishPa() ? { nummer: swishnummer() } : null,
      oppen: true,
    })
  ),

  rutt('POST', '/api/fik/order', 'oppen', async ({ res, req, kropp }) => {
    tak(`order:${req.socket.remoteAddress}`);
    const order = skapaOrder({
      rader: kropp.rader,
      mobil: kropp.mobil,
      plats: kropp.plats,
      anteckning: kropp.anteckning,
      kanal: ettAv(kropp.kanal, ['qr', 'terminal'], 'Kanal') || 'qr',
    });
    svar(res, 201, { ...publikOrder(order), kod: order.kod });
  }),

  rutt('GET', '/api/fik/order/:nummer', 'oppen', ({ res, param, fraga }) => {
    const o = en('SELECT * FROM kundorder WHERE nummer=?', param.nummer);
    if (!o || (o.kod && o.kod !== fraga.get('kod'))) throw fel(404, 'Ordern finns inte');
    svar(res, 200, publikOrder({ ...o, rader: orderrader(o.id) }));
  }),

  rutt('GET', '/api/fik/order/:nummer/qr', 'oppen', async ({ res, param, fraga }) => {
    const o = en('SELECT * FROM kundorder WHERE nummer=?', param.nummer);
    if (!o || (o.kod && o.kod !== fraga.get('kod'))) throw fel(404, 'Ordern finns inte');
    const svg = await qrkod({ belopp_ore: o.belopp_ore, meddelande: `HAK ${o.nummer}` });
    if (!svg) throw fel(503, 'QR-koden går inte att hämta just nu');
    text(res, 200, svg, 'image/svg+xml', { 'cache-control': 'private, max-age=600' });
  }),

  rutt('POST', '/api/fik/order/:nummer/betald', 'oppen', ({ res, req, param, fraga, kropp }) => {
    // Kunden säger att hen swishat. Kassan ser det som "uppger betald" och
    // kvitterar själv – servern kan inte veta något annat utan handelsavtal.
    tak(`betald:${req.socket.remoteAddress}`, 40);
    const o = en('SELECT * FROM kundorder WHERE nummer=?', param.nummer);
    if (!o || (o.kod && o.kod !== (fraga.get('kod') || kropp.kod))) throw fel(404, 'Ordern finns inte');
    if (o.status === 'ny')
      uppdatera('kundorder', o.id, { betalsatt: 'swish', status: 'betald', betald_tid: nu(), uppdaterad: nu() });
    svar(res, 200, publikOrder({ ...en('SELECT * FROM kundorder WHERE id=?', o.id), rader: orderrader(o.id) }));
  }),

  // ---------- kassan ----------
  rutt('GET', '/api/fik/kassa', 'medlem', ({ res, fraga }) => {
    const dag = fraga.get('datum') || idag();
    const ft = OPPNA.map(() => '?').join(',');
    const oppna = alla(
      `SELECT * FROM kundorder WHERE status IN (${ft}) ORDER BY skapad`,
      ...OPPNA
    ).map((o) => ({ ...o, rader: orderrader(o.id), belopp: kronor(o.belopp_ore) }));
    const dagens = alla('SELECT * FROM kundorder WHERE date(skapad)=? ORDER BY skapad DESC', dag).map((o) => ({
      ...o, rader: orderrader(o.id), belopp: kronor(o.belopp_ore),
    }));
    const salt = en(
      `SELECT coalesce(sum(belopp_ore),0) AS summa, count(*) AS antal FROM kundorder
       WHERE date(skapad)=? AND status<>'avbruten'`,
      dag
    );
    return svar(res, 200, {
      datum: dag,
      oppna,
      dagens,
      summa_ore: salt.summa,
      summa: kronor(salt.summa),
      antal: salt.antal,
      per_artikel: alla(
        `SELECT r.namn, sum(r.antal) AS antal, sum(r.antal * r.styckpris_ore) AS summa_ore
         FROM orderrad r JOIN kundorder o ON o.id=r.order_id
         WHERE date(o.skapad)=? AND o.status<>'avbruten'
         GROUP BY r.namn ORDER BY summa_ore DESC`,
        dag
      ).map((r) => ({ ...r, summa: kronor(r.summa_ore) })),
      swish: swishPa() ? { nummer: swishnummer() } : null,
      sms: smsPa(),
      rabatt_procent: Math.round(rabattsats() * 100),
    });
  }),

  rutt('POST', '/api/fik/kassa/order', 'medlem', ({ res, kropp, medlem }) => {
    const betalsatt = ettAv(kropp.betalsatt, BETALSATT, 'Betalsätt') || 'kontant';
    const kund_id = heltal(kropp.medlem_id);
    if (betalsatt === 'planbok' && !kund_id) throw fel(400, 'Välj vilken medlem som betalar');
    // Order och betalning hör ihop: går betalningen inte igenom ska ingen
    // order bli kvar som betald.
    const { order, verifikation } = transaktion(() => {
      const skapad = skapaOrder({
        rader: kropp.rader,
        mobil: kropp.mobil,
        plats: kropp.plats,
        anteckning: kropp.anteckning,
        kanal: 'kassa',
        av: medlem,
        betalsatt,
      });
      const ver =
        betalsatt === 'ej_betald'
          ? null
          : bokforOrder(skapad, { betalmedel: betalsatt, av: medlem, medlem_id: kund_id });
      return { order: skapad, verifikation: ver };
    });
    if (verifikation)
      revidera({ medlem, handelse: 'sålde i kassan', objekt: order.nummer, detalj: { belopp_ore: order.belopp_ore, betalsatt } });
    svar(res, 201, { ...order, verifikation, planbokssaldo: kund_id ? saldo(kund_id) : null });
  }),

  rutt('PUT', '/api/fik/kassa/order/:id', 'medlem', async ({ res, param, kropp, medlem }) => {
    const o = en('SELECT * FROM kundorder WHERE id=?', param.id);
    if (!o) throw fel(404, 'Ordern finns inte');
    const status = ettAv(kropp.status, STATUSAR, 'Status');
    const betalsatt = ettAv(kropp.betalsatt, BETALSATT, 'Betalsätt');
    uppdatera('kundorder', o.id, {
      status,
      betalsatt,
      betald_tid: betalsatt && betalsatt !== 'ej_betald' ? o.betald_tid || nu() : undefined,
      hamtad_tid: status === 'hamtad' ? nu() : undefined,
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning, 300),
      uppdaterad: nu(),
    });
    // Betalningen bokförs när kassan kvitterat den – inte när kunden säger
    // att hen swishat, för servern kan inte se det utan handelsavtal.
    let verifikation = null;
    const nuBetald = betalsatt && betalsatt !== 'ej_betald';
    if (nuBetald && !verifikationFor('order', o.id)) {
      verifikation = bokforOrder(hamtaOrder(o.id), {
        betalmedel: betalsatt,
        av: medlem,
        medlem_id: heltal(kropp.medlem_id),
      });
      revidera({ medlem, handelse: 'kvitterade betalning', objekt: o.nummer, detalj: { belopp_ore: o.belopp_ore, betalsatt } });
    }
    if (status && status !== o.status)
      revidera({ medlem, handelse: `satte order till ${status}`, objekt: o.nummer });

    // Ett sms när maten står klar sparar ropandet i luckan.
    if (status === 'klar' && o.mobil && kropp.sms !== false)
      await skickaSms({
        till: o.mobil,
        text: `Din beställning ${o.nummer} är klar att hämta i fiket. Hälsningar HAK.`,
        slag: 'fik',
      });
    svar(res, 200, { ...hamtaOrder(o.id), verifikation });
  }),

  rutt('PUT', '/api/fik/artiklar/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM artikel WHERE id=?', param.id);
    if (!a) throw fel(404, 'Artikeln finns inte');
    const fullRatt = RANG[medlem.roll] >= RANG.backansvarig;
    uppdatera('artikel', a.id, {
      // Alla i kassan får märka en vara som slut; priser ändras av ansvariga.
      slut: kropp.slut === undefined ? undefined : kropp.slut ? 1 : 0,
      namn: fullRatt ? txt(kropp.namn, 80) : undefined,
      beskrivning: fullRatt && kropp.beskrivning !== undefined ? txt(kropp.beskrivning, 200) : undefined,
      pris_ore: fullRatt && kropp.pris_ore !== undefined ? Math.max(0, heltal(kropp.pris_ore, 0)) : undefined,
      kategori: fullRatt ? txt(kropp.kategori, 30) : undefined,
      emoji: fullRatt && kropp.emoji !== undefined ? txt(kropp.emoji, 8) : undefined,
      aktiv: fullRatt && kropp.aktiv !== undefined ? (kropp.aktiv ? 1 : 0) : undefined,
      ordning: fullRatt && kropp.ordning !== undefined ? heltal(kropp.ordning, 0) : undefined,
    });
    svar(res, 200, en('SELECT * FROM artikel WHERE id=?', a.id));
  }),

  rutt('POST', '/api/fik/artiklar', 'backansvarig', ({ res, kropp }) => {
    const id = spara('artikel', {
      namn: kravTxt(kropp.namn, 'Namn', 80),
      beskrivning: txt(kropp.beskrivning, 200),
      kategori: txt(kropp.kategori, 30) || 'ovrigt',
      pris_ore: Math.max(0, heltal(kropp.pris_ore, 0)),
      emoji: txt(kropp.emoji, 8),
      ordning: heltal(kropp.ordning, 99),
    });
    svar(res, 201, en('SELECT * FROM artikel WHERE id=?', id));
  }),

  rutt('GET', '/api/fik/forsaljning.csv', 'medlem', ({ res, fraga }) => {
    const fran = fraga.get('fran') || idag();
    const till = fraga.get('till') || fran;
    const rader = alla(
      `SELECT o.nummer, o.skapad, o.status, o.betalsatt, o.kanal, r.namn, r.antal,
              r.styckpris_ore, (r.antal*r.styckpris_ore) AS rad_ore
       FROM orderrad r JOIN kundorder o ON o.id=r.order_id
       WHERE date(o.skapad) BETWEEN ? AND ? ORDER BY o.skapad, r.id`,
      fran, till
    ).map((r) => ({ ...r, styckpris: kronor(r.styckpris_ore), rad: kronor(r.rad_ore) }));
    text(res, 200, csv(rader, [
      { falt: 'skapad', rubrik: 'Tid' }, { falt: 'nummer', rubrik: 'Order' },
      { falt: 'namn', rubrik: 'Artikel' }, { falt: 'antal', rubrik: 'Antal' },
      { falt: 'styckpris', rubrik: 'Styckpris' }, { falt: 'rad', rubrik: 'Summa' },
      { falt: 'betalsatt', rubrik: 'Betalsätt' }, { falt: 'kanal', rubrik: 'Kanal' },
      { falt: 'status', rubrik: 'Status' },
    ]), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="fik-${fran}.csv"` });
  }),
];
