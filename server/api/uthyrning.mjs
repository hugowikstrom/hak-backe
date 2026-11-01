// Skiduthyrningen: kundens bokning, utlämning med blippad utrustning och
// återlämning. Prislistan är klubbens egen och ligger i registret.
import { randomBytes } from 'node:crypto';
import { alla, en, kor, spara, transaktion, uppdatera } from '../db.mjs';
import { kronor, normaliseraMobil } from '../pengar.mjs';
import { betalning, qrkod, swishPa, swishnummer } from '../swish.mjs';
import { skickaSms } from '../sms.mjs';
import { bokforAffar, INTAKTSKONTON, revidera, verifikationFor } from '../bokforing.mjs';
import { datum, ettAv, fel, heltal, rutt, svar, text, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';
import { tak } from './fik.mjs';

const STATUSAR = ['bokad', 'ute', 'aterlamnad', 'forsenad', 'avbruten'];
const BETALSATT = ['swish', 'kort', 'kontant', 'ej_betald'];
const UTE = ['bokad', 'ute', 'forsenad'];
const BAS = process.env.HAK_BAS_URL || 'https://backis.nattviken.com';

export const TIDNAMN = {
  halvdag: 'Halvdag eller kväll',
  heldag: 'Heldag',
  tvadagar: '2 dagar',
  tredagar: '3 dagar',
  vecka: 'Vecka',
};
export const ALDERSNAMN = { vuxen: 'Vuxen 18–64 år', ungdom: 'Ungdom 8–17 och 65+', barn: 'Barn upp till 8 år', alla: 'Alla åldrar' };

export const prislista = () => {
  const rader = alla('SELECT * FROM hyrespris WHERE aktiv=1 ORDER BY ordning, namn');
  const grupper = new Map();
  for (const r of rader) {
    const nyckel = `${r.grupp}|${r.namn}|${r.aldersgrupp}`;
    if (!grupper.has(nyckel))
      grupper.set(nyckel, { grupp: r.grupp, namn: r.namn, aldersgrupp: r.aldersgrupp, tider: [] });
    grupper.get(nyckel).tider.push({ id: r.id, tid: r.tid, tidnamn: TIDNAMN[r.tid] || r.tid, pris_ore: r.pris_ore, pris: kronor(r.pris_ore) });
  }
  return [...grupper.values()];
};

export const NIVANAMN = { nyborjare: 'Nybörjare', van: 'Van', erfaren: 'Erfaren' };
export const ONSKEMAL = ['slalom', 'carving', 'twintip', 'snowboard', 'pulka'];

/**
 * Sparar en gästs uppgifter inför besöket.
 *
 * Uppgifterna används för att plocka fram rätt storlekar i förväg. Systemet
 * räknar aldrig fram någon bindningsinställning ur längd och vikt – det gör
 * personalen på plats, med sin egen tabell och sitt eget ansvar.
 */
export function sparaGast(avtal_id, g) {
  return spara('hyresgast', {
    avtal_id,
    namn: txt(g.namn, 80),
    alder: heltal(g.alder),
    langd_cm: heltal(g.langd_cm),
    vikt_kg: heltal(g.vikt_kg),
    skostorlek: txt(g.skostorlek, 10),
    niva: ettAv(g.niva, Object.keys(NIVANAMN), 'Nivå'),
    onskemal: ettAv(g.onskemal, ONSKEMAL, 'Önskemål'),
    hjalm: g.hjalm ? 1 : 0,
    anteckning: txt(g.anteckning, 300),
  });
}

export const hamtaAvtal = (id) => {
  const a = en('SELECT * FROM hyresavtal WHERE id=?', id);
  return a
    ? {
        ...a,
        rader: alla('SELECT * FROM hyresrad WHERE avtal_id=? ORDER BY id', id),
        gaster: alla('SELECT * FROM hyresgast WHERE avtal_id=? ORDER BY id', id),
        belopp: kronor(a.belopp_ore),
      }
    : null;
};

const publiktAvtal = (a) => ({
  nummer: a.nummer,
  swish: betalning({ belopp_ore: a.belopp_ore, meddelande: `HAK ${a.nummer}` }),
  status: a.status,
  belopp_ore: a.belopp_ore,
  belopp: kronor(a.belopp_ore),
  betald: !!a.betald_tid,
  betalsatt: a.betalsatt,
  utlamnad_tid: a.utlamnad_tid,
  retur_senast: a.retur_senast,
  retur_tid: a.retur_tid,
  skapad: a.skapad,
  rader: a.rader.map((r) => ({ namn: r.namn, antal: r.antal, pris_ore: r.pris_ore, markning: r.markning, aterlamnad: !!r.aterlamnad })),
  anmald: a.anmald || null,
  besok_datum: a.besok_datum || null,
  gaster: (a.gaster || []).map((g) => ({
    id: g.id, namn: g.namn, alder: g.alder, langd_cm: g.langd_cm, vikt_kg: g.vikt_kg,
    skostorlek: g.skostorlek, niva: g.niva, onskemal: g.onskemal, hjalm: !!g.hjalm,
    anteckning: g.anteckning, framplockat: !!g.framplockat,
  })),
});

function nyttNummer() {
  const n = en("SELECT count(*) AS n FROM hyresavtal WHERE date(skapad)=date('now')").n;
  for (let i = n + 1; i < n + 50; i++) {
    const kandidat = `U${i}`;
    if (!en('SELECT id FROM hyresavtal WHERE nummer=?', kandidat)) return kandidat;
  }
  return `U${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export function skapaAvtal({ rader, mobil, namn, anteckning, av = null, betalsatt = null }) {
  if (!Array.isArray(rader) || !rader.length) throw fel(400, 'Inget valt att hyra');
  if (rader.length > 20) throw fel(400, 'För många rader');
  const poster = rader.map((r) => {
    const pris = en('SELECT * FROM hyrespris WHERE id=? AND aktiv=1', heltal(r.hyrespris_id));
    if (!pris) throw fel(400, 'Priset finns inte i listan');
    return { pris, antal: Math.min(10, Math.max(1, heltal(r.antal, 1))) };
  });
  const belopp = poster.reduce((a, p) => a + p.pris.pris_ore * p.antal, 0);
  const nummer = nyttNummer();
  const returkod = randomBytes(5).toString('hex');

  const id = transaktion(() => {
    const avtalId = spara('hyresavtal', {
      nummer,
      returkod,
      mobil: mobil ? normaliseraMobil(mobil) : null,
      namn: txt(namn, 80),
      anteckning: txt(anteckning, 300),
      belopp_ore: belopp,
      betalsatt,
      betald_tid: betalsatt && betalsatt !== 'ej_betald' ? nu() : null,
      av_id: av?.id ?? null,
    });
    for (const p of poster)
      spara('hyresrad', {
        avtal_id: avtalId,
        hyrespris_id: p.pris.id,
        namn: `${p.pris.namn} · ${TIDNAMN[p.pris.tid] || p.pris.tid}`,
        pris_ore: p.pris.pris_ore,
        antal: p.antal,
      });
    return avtalId;
  });
  return hamtaAvtal(id);
}

function bokforAvtal(avtal, { betalmedel, av }) {
  if (verifikationFor('hyresavtal', avtal.id)) return verifikationFor('hyresavtal', avtal.id);
  return bokforAffar({
    serie: 'U',
    datum: String(avtal.skapad).slice(0, 10),
    beskrivning: `Uthyrning ${avtal.nummer}`,
    motpart: avtal.namn || avtal.mobil || 'Kontantkund',
    rader: avtal.rader.map((r) => ({ konto: INTAKTSKONTON.uthyrning, belopp_ore: r.pris_ore * r.antal })),
    betalmedel: betalmedel === 'ej_betald' ? 'faktura' : betalmedel,
    referens_slag: 'hyresavtal',
    referens_id: avtal.id,
    av,
    underlag: { nummer: avtal.nummer, rader: avtal.rader, belopp_ore: avtal.belopp_ore },
  });
}

export const rutter = [
  // ---------- publikt ----------
  rutt('GET', '/api/uthyrning/prislista', 'oppen', ({ res }) =>
    svar(res, 200, {
      grupper: prislista(),
      tider: TIDNAMN,
      aldersgrupper: ALDERSNAMN,
      swish: swishPa() ? { nummer: swishnummer() } : null,
    })
  ),

  rutt('POST', '/api/uthyrning/bokning', 'oppen', ({ res, req, kropp }) => {
    tak(`hyra:${req.socket.remoteAddress}`);
    const avtal = skapaAvtal({ rader: kropp.rader, mobil: kropp.mobil, namn: kropp.namn, anteckning: kropp.anteckning });
    // Storlekar som gästen fyllt i hemma. De sparar tid i luckan, men
    // ersätter aldrig utprovningen: bindningar ställs in av personal.
    for (const g of (kropp.gaster || []).slice(0, 12)) sparaGast(avtal.id, g);
    if (kropp.gaster?.length || kropp.besok_datum)
      uppdatera('hyresavtal', avtal.id, {
        anmald: kropp.gaster?.length ? nu() : undefined,
        besok_datum: datum(kropp.besok_datum, 'Besöksdatum') || undefined,
      });
    svar(res, 201, { ...publiktAvtal(hamtaAvtal(avtal.id)), kod: avtal.returkod });
  }),

  /** Gästen fyller i storlekar i efterhand, via sin egen länk. */
  rutt('POST', '/api/uthyrning/avtal/:nummer/anmalan', 'oppen', ({ res, req, param, fraga, kropp }) => {
    tak(`hyraanm:${req.socket.remoteAddress}`);
    const a = en('SELECT * FROM hyresavtal WHERE nummer=?', param.nummer);
    if (!a || (a.returkod && a.returkod !== fraga.get('kod'))) throw fel(404, 'Avtalet finns inte');
    if (a.status !== 'bokad') throw fel(409, 'Utrustningen är redan utlämnad');
    kor('DELETE FROM hyresgast WHERE avtal_id=? AND framplockat=0', a.id);
    for (const g of (kropp.gaster || []).slice(0, 12)) sparaGast(a.id, g);
    uppdatera('hyresavtal', a.id, {
      anmald: nu(),
      besok_datum: datum(kropp.besok_datum, 'Besöksdatum') || undefined,
    });
    svar(res, 200, publiktAvtal(hamtaAvtal(a.id)));
  }),

  /** Personalen markerar att utrustningen är framplockad. */
  rutt('POST', '/api/uthyrning/gaster/:id/framplockat', '@uthyrning', ({ res, param, kropp, medlem }) => {
    const g = en('SELECT * FROM hyresgast WHERE id=?', param.id);
    if (!g) throw fel(404, 'Uppgiften finns inte');
    uppdatera('hyresgast', g.id, {
      framplockat: kropp.framplockat === false ? 0 : 1,
      framplockat_av_id: kropp.framplockat === false ? null : medlem.id,
      anteckning: txt(kropp.anteckning) ?? undefined,
    });
    svar(res, 200, { gast: en('SELECT * FROM hyresgast WHERE id=?', g.id) });
  }),

  rutt('GET', '/api/uthyrning/avtal/:nummer', 'oppen', ({ res, param, fraga }) => {
    const a = en('SELECT * FROM hyresavtal WHERE nummer=?', param.nummer);
    if (!a || (a.returkod && a.returkod !== fraga.get('kod'))) throw fel(404, 'Avtalet finns inte');
    svar(res, 200, publiktAvtal(hamtaAvtal(a.id)));
  }),

  rutt('GET', '/api/uthyrning/avtal/:nummer/qr', 'oppen', async ({ res, param, fraga }) => {
    const a = en('SELECT * FROM hyresavtal WHERE nummer=?', param.nummer);
    if (!a || (a.returkod && a.returkod !== fraga.get('kod'))) throw fel(404, 'Avtalet finns inte');
    const svg = await qrkod({ belopp_ore: a.belopp_ore, meddelande: `HAK ${a.nummer}` });
    if (!svg) throw fel(503, 'QR-koden går inte att hämta just nu');
    text(res, 200, svg, 'image/svg+xml', { 'cache-control': 'private, max-age=600' });
  }),

  // Kunden anmäler själv att utrustningen är inlämnad – länken kommer i sms.
  rutt('POST', '/api/uthyrning/avtal/:nummer/anmal-retur', 'oppen', async ({ res, req, param, fraga, kropp }) => {
    tak(`retur:${req.socket.remoteAddress}`, 30);
    const a = en('SELECT * FROM hyresavtal WHERE nummer=?', param.nummer);
    if (!a || a.returkod !== (fraga.get('kod') || kropp.kod)) throw fel(404, 'Avtalet finns inte');
    if (UTE.includes(a.status))
      uppdatera('hyresavtal', a.id, {
        status: 'aterlamnad',
        retur_tid: nu(),
        anteckning: [a.anteckning, 'Kunden anmälde återlämning själv'].filter(Boolean).join(' · '),
      });
    svar(res, 200, publiktAvtal(hamtaAvtal(a.id)));
  }),

  // ---------- uthyrningens egen vy ----------
  rutt('GET', '/api/uthyrning/kassa', 'medlem', ({ res, fraga }) => {
    const dag = fraga.get('datum') || idag();
    const ft = UTE.map(() => '?').join(',');
    return svar(res, 200, {
      datum: dag,
      ute: alla(`SELECT * FROM hyresavtal WHERE status IN (${ft}) ORDER BY skapad`, ...UTE).map((a) => hamtaAvtal(a.id)),
      dagens: alla('SELECT * FROM hyresavtal WHERE date(skapad)=? ORDER BY skapad DESC', dag).map((a) => hamtaAvtal(a.id)),
      summa: kronor(
        en(`SELECT coalesce(sum(belopp_ore),0) AS s FROM hyresavtal WHERE date(skapad)=? AND status<>'avbruten'`, dag).s
      ),
      // Förhandsanmälda besök, så att utrustningen kan plockas fram i lugn
      // och ro. Utprovningen sker ändå i luckan.
      anmalda: alla(
        `SELECT * FROM hyresavtal
          WHERE status='bokad' AND anmald IS NOT NULL
            AND (besok_datum IS NULL OR besok_datum >= date('now','-1 day'))
          ORDER BY coalesce(besok_datum, date(skapad))`
      ).map((a) => hamtaAvtal(a.id)),
      nivanamn: NIVANAMN,
      prislista: prislista(),
    });
  }),

  rutt('POST', '/api/uthyrning/avtal', 'medlem', ({ res, kropp, medlem }) => {
    const betalsatt = ettAv(kropp.betalsatt, BETALSATT, 'Betalsätt') || 'kontant';
    const avtal = skapaAvtal({
      rader: kropp.rader, mobil: kropp.mobil, namn: kropp.namn,
      anteckning: kropp.anteckning, av: medlem, betalsatt,
    });
    let verifikation = null;
    if (betalsatt !== 'ej_betald') {
      verifikation = bokforAvtal(avtal, { betalmedel: betalsatt, av: medlem });
      revidera({ medlem, handelse: 'hyrde ut', objekt: avtal.nummer, detalj: { belopp_ore: avtal.belopp_ore, betalsatt } });
    }
    svar(res, 201, { ...avtal, verifikation });
  }),

  rutt('PUT', '/api/uthyrning/avtal/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM hyresavtal WHERE id=?', param.id);
    if (!a) throw fel(404, 'Avtalet finns inte');
    const status = ettAv(kropp.status, STATUSAR, 'Status');
    const betalsatt = ettAv(kropp.betalsatt, BETALSATT, 'Betalsätt');
    uppdatera('hyresavtal', a.id, {
      status,
      betalsatt,
      betald_tid: betalsatt && betalsatt !== 'ej_betald' ? a.betald_tid || nu() : undefined,
      retur_senast: kropp.retur_senast === undefined ? undefined : txt(kropp.retur_senast, 20),
      retur_tid: status === 'aterlamnad' ? nu() : undefined,
      namn: kropp.namn === undefined ? undefined : txt(kropp.namn, 80),
      mobil: kropp.mobil === undefined ? undefined : normaliseraMobil(kropp.mobil),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning, 300),
    });
    let verifikation = null;
    if (betalsatt && betalsatt !== 'ej_betald' && !verifikationFor('hyresavtal', a.id)) {
      verifikation = bokforAvtal(hamtaAvtal(a.id), { betalmedel: betalsatt, av: medlem });
      revidera({ medlem, handelse: 'kvitterade hyresbetalning', objekt: a.nummer, detalj: { belopp_ore: a.belopp_ore, betalsatt } });
    }
    if (status) revidera({ medlem, handelse: `satte hyresavtal till ${status}`, objekt: a.nummer });
    svar(res, 200, { ...hamtaAvtal(a.id), verifikation });
  }),

  /** Utlämning: utrustningens märkning blippas in på varje rad. */
  rutt('POST', '/api/uthyrning/avtal/:id/utlamning', 'medlem', async ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM hyresavtal WHERE id=?', param.id);
    if (!a) throw fel(404, 'Avtalet finns inte');
    for (const r of kropp.rader || []) {
      const rad = en('SELECT * FROM hyresrad WHERE id=? AND avtal_id=?', heltal(r.id), a.id);
      if (rad) uppdatera('hyresrad', rad.id, { markning: txt(r.markning, 60) });
    }
    uppdatera('hyresavtal', a.id, {
      status: 'ute',
      utlamnad_tid: nu(),
      retur_senast: txt(kropp.retur_senast, 20) ?? a.retur_senast,
    });
    revidera({ medlem, handelse: 'lämnade ut utrustning', objekt: a.nummer, detalj: kropp.rader || null });

    const avtal = hamtaAvtal(a.id);
    let sms = null;
    if (avtal.mobil && kropp.sms !== false) {
      const lank = `${BAS}/fik/retur/${avtal.nummer}?kod=${avtal.returkod}`;
      sms = await skickaSms({
        till: avtal.mobil,
        slag: 'uthyrning',
        text:
          `Hej! Du har hyrt: ${avtal.rader.map((r) => `${r.antal}× ${r.namn}`).join(', ')}.` +
          `${avtal.retur_senast ? ` Lämna tillbaka senast ${avtal.retur_senast}.` : ''}` +
          ` Anmäl återlämning här: ${lank}`,
      });
    }
    svar(res, 200, { ...avtal, sms });
  }),

  /** Återlämning kvitterad av personalen. */
  rutt('POST', '/api/uthyrning/avtal/:id/retur', 'medlem', ({ res, param, kropp, medlem }) => {
    const a = en('SELECT * FROM hyresavtal WHERE id=?', param.id);
    if (!a) throw fel(404, 'Avtalet finns inte');
    for (const rad of alla('SELECT * FROM hyresrad WHERE avtal_id=?', a.id)) uppdatera('hyresrad', rad.id, { aterlamnad: 1 });
    uppdatera('hyresavtal', a.id, {
      status: 'aterlamnad',
      retur_tid: nu(),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning, 300),
    });
    revidera({ medlem, handelse: 'tog emot återlämning', objekt: a.nummer });
    svar(res, 200, hamtaAvtal(a.id));
  }),
];
