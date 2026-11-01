// Kiosk, uthyrning, förening, träning och idélåda – över HTTP mot egen databas.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-verks-'));
process.env.HAK_DB = join(katalog, 'test.db');
process.env.HAK_PORT = '8459';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';
process.env.HAK_STT_URL = 'http://127.0.0.1:1/omojlig'; // ingen tal-till-text i testet

// Stubbat backlog-kommando, så att testet inte skriver i den riktiga backlogen.
const stubb = join(katalog, 'backlog-stubb.sh');
writeFileSync(
  stubb,
  `#!/bin/sh
if [ "$1" = "project" ]; then echo '{"projects":[{"alias":"inbox","name":"Inkorg"}]}'; exit 0; fi
echo '{"id":"01TEST","seq":42,"project":{"alias":"inbox"},"title":"stub"}'
`
);
chmodSync(stubb, 0o755);
process.env.HAK_BACKLOG = stubb;

const BAS = 'http://127.0.0.1:8459';
let server;
let db;
const kakor = {};
let aktiv = null;

const anrop = async (metod, stig, kropp) => {
  const r = await fetch(BAS + stig, {
    method: metod,
    headers: {
      'content-type': 'application/json',
      'x-hak': '1',
      ...(aktiv && kakor[aktiv] ? { cookie: kakor[aktiv] } : {}),
    },
    body: kropp === undefined ? undefined : JSON.stringify(kropp),
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length && aktiv) kakor[aktiv] = sc[0].split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, kropp: typ.includes('json') ? await r.json() : await r.text() };
};
const ok = async (metod, stig, kropp) => {
  const r = await anrop(metod, stig, kropp);
  assert.ok(r.status < 400, `${metod} ${stig} gav ${r.status}: ${JSON.stringify(r.kropp)}`);
  return r.kropp;
};
const loggaIn = async (anvandarnamn) => {
  aktiv = anvandarnamn;
  kakor[anvandarnamn] = '';
  await ok('POST', '/api/logga-in', { anvandarnamn, losenord: 'hemligt' });
};
const utloggad = () => (aktiv = null);

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;

  const medlem = (anvandarnamn, namn, roll, extra = {}) =>
    spara('medlem', { anvandarnamn, namn, roll, losenordshash: hasha('hemligt'), kompetens: '[]', ...extra });

  const kassorId = medlem('kassor', 'Karin Kassör', 'medlem');
  medlem('kiosk', 'Kiosken', 'medlem');
  const tranareId = medlem('tranare', 'Tore Tränare', 'tranare', { fodelsedatum: '1980-01-01' });
  medlem('medlem', 'Vanlig Medlem', 'medlem', { fodelsedatum: '1990-01-01' });
  spara('uppdrag', { medlem_id: kassorId, slag: 'kassor' });

  // Sortiment och prislista
  spara('artikel', { namn: 'Varmkorv', kategori: 'mat', pris_ore: 3000, ordning: 1 });
  spara('artikel', { namn: 'Kaffe', kategori: 'dryck', pris_ore: 2500, ordning: 2 });
  spara('artikel', { namn: 'Dagkort', kategori: 'liftkort', pris_ore: 27000, ordning: 3 });
  spara('artikel', { namn: 'Slutsåld bulle', kategori: 'fika', pris_ore: 2500, slut: 1, ordning: 4 });
  spara('hyrespris', { grupp: 'paket', namn: 'Paket', aldersgrupp: 'vuxen', tid: 'heldag', pris_ore: 22000 });

  // Förening: sektion, grupp och barn
  const sektion = spara('sektion', { nyckel: 'alpint', namn: 'Alpint' });
  const grupp = spara('traningsgrupp', { sektion_id: sektion, namn: 'U12' });
  spara('gruppmedlem', { grupp_id: grupp, medlem_id: tranareId, roll: 'tranare' });
  for (const [namn, fodd] of [['Barn Ett', '2014-05-05'], ['Barn Två', '2015-06-06'], ['Barn Tre', '2014-07-07']]) {
    const id = medlem(namn.toLowerCase().replace(' ', ''), namn, 'medlem', { fodelsedatum: fodd, kvot_timmar: 0 });
    spara('gruppmedlem', { grupp_id: grupp, medlem_id: id, roll: 'aktiv' });
  }
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

// ---------- kiosken ----------

test('menyn är öppen för alla utan inloggning', async () => {
  utloggad();
  const m = await ok('GET', '/api/fik/meny');
  assert.equal(m.artiklar.length, 4);
  assert.equal(m.artiklar.find((a) => a.namn === 'Varmkorv').pris, '30 kr');
  assert.equal(m.swish, null, 'utan HAK_SWISH_NUMMER erbjuds ingen swish');
});

test('gästen kan beställa och ser bara sin egen order', async () => {
  utloggad();
  const order = await ok('POST', '/api/fik/order', {
    rader: [{ artikel_id: 1, antal: 2 }, { artikel_id: 2, antal: 1 }],
    mobil: '070-123 45 67',
    plats: 'Bord 3',
  });
  assert.match(order.nummer, /^K\d+$/);
  assert.equal(order.belopp_ore, 8500);
  assert.equal(order.status, 'ny');
  assert.ok(order.kod);

  const med = await ok('GET', `/api/fik/order/${order.nummer}?kod=${order.kod}`);
  assert.equal(med.belopp_ore, 8500);
  const utan = await anrop('GET', `/api/fik/order/${order.nummer}`);
  assert.equal(utan.status, 404, 'utan kod ska ordern inte gå att läsa');
});

test('priset bestäms av servern, inte av beställningen', async () => {
  utloggad();
  const order = await ok('POST', '/api/fik/order', {
    rader: [{ artikel_id: 1, antal: 1, pris_ore: 1, styckpris_ore: 1 }],
  });
  assert.equal(order.belopp_ore, 3000);
});

test('slutsålt och okända artiklar nekas', async () => {
  utloggad();
  const slut = await anrop('POST', '/api/fik/order', { rader: [{ artikel_id: 4, antal: 1 }] });
  assert.equal(slut.status, 409);
  const fel = await anrop('POST', '/api/fik/order', { rader: [{ artikel_id: 999, antal: 1 }] });
  assert.equal(fel.status, 400);
  const tom = await anrop('POST', '/api/fik/order', { rader: [] });
  assert.equal(tom.status, 400);
});

test('kassan slår in, bokför och ser dagens försäljning', async () => {
  await loggaIn('kiosk');
  const order = await ok('POST', '/api/fik/kassa/order', {
    rader: [{ artikel_id: 1, antal: 1 }, { artikel_id: 3, antal: 1 }],
    betalsatt: 'kontant',
  });
  assert.equal(order.belopp_ore, 30000);
  assert.ok(order.verifikation, 'försäljningen ska bokföras direkt');
  assert.equal(order.verifikation.serie, 'K');
  // Kiosk och liftkort hamnar på var sitt intäktskonto.
  const konton = order.verifikation.rader.map((r) => r.konto).sort();
  assert.deepEqual(konton, ['1910', '3010', '3030']);

  const kassa = await ok('GET', '/api/fik/kassa');
  assert.ok(kassa.antal >= 1);
  assert.ok(kassa.oppna.length >= 1, 'gästernas obetalda order ligger kvar som öppen');
});

test('en order bokförs bara en gång', async () => {
  await loggaIn('kiosk');
  const kassa = await ok('GET', '/api/fik/kassa');
  const obetald = kassa.oppna.find((o) => !o.betald_tid);
  const forst = await ok('PUT', `/api/fik/kassa/order/${obetald.id}`, { betalsatt: 'swish', status: 'betald' });
  assert.ok(forst.verifikation);
  const igen = await ok('PUT', `/api/fik/kassa/order/${obetald.id}`, { betalsatt: 'swish', status: 'klar' });
  assert.equal(igen.verifikation, null, 'ingen andra verifikation för samma order');
});

// ---------- uthyrningen ----------

test('hyresbokning, utlämning med märkning och återlämning', async () => {
  utloggad();
  const pris = await ok('GET', '/api/uthyrning/prislista');
  const id = pris.grupper[0].tider[0].id;
  const avtal = await ok('POST', '/api/uthyrning/bokning', {
    rader: [{ hyrespris_id: id, antal: 2 }],
    mobil: '0701234567',
    namn: 'Testkund',
  });
  assert.match(avtal.nummer, /^U\d+$/);
  assert.equal(avtal.belopp_ore, 44000);
  assert.equal(avtal.status, 'bokad');

  await loggaIn('kiosk');
  const kassa = await ok('GET', '/api/uthyrning/kassa');
  const hyra = kassa.ute.find((a) => a.nummer === avtal.nummer);
  assert.ok(hyra);

  const utlamnad = await ok('POST', `/api/uthyrning/avtal/${hyra.id}/utlamning`, {
    rader: [{ id: hyra.rader[0].id, markning: 'SKI-114' }],
    retur_senast: 'i dag 17:00',
    sms: false,
  });
  assert.equal(utlamnad.status, 'ute');
  assert.equal(utlamnad.rader[0].markning, 'SKI-114');

  // Kunden anmäler själv med sin kod.
  utloggad();
  const anmald = await ok('POST', `/api/uthyrning/avtal/${avtal.nummer}/anmal-retur?kod=${avtal.kod}`, {});
  assert.equal(anmald.status, 'aterlamnad');

  const felKod = await anrop('POST', `/api/uthyrning/avtal/${avtal.nummer}/anmal-retur?kod=fel`, {});
  assert.equal(felKod.status, 404);
});

test('betald hyra bokförs mot uthyrningskontot', async () => {
  await loggaIn('kiosk');
  const kassa = await ok('GET', '/api/uthyrning/kassa');
  const avtal = kassa.dagens[0];
  const uppdaterad = await ok('PUT', `/api/uthyrning/avtal/${avtal.id}`, { betalsatt: 'kort' });
  assert.ok(uppdaterad.verifikation);
  assert.equal(uppdaterad.verifikation.serie, 'U');
  assert.ok(uppdaterad.verifikation.rader.some((r) => r.konto === '3020'));
});

// ---------- behörigheter ----------

test('kassören når ekonomin, kiosken gör det inte', async () => {
  await loggaIn('kassor');
  const jag = await ok('GET', '/api/jag');
  assert.ok(jag.medlem.behorigheter.includes('ekonomi'));
  assert.ok(!jag.medlem.behorigheter.includes('bemanning'), 'kassören sköter inte bemanningen');
  await ok('GET', '/api/bokforing/verifikationer');

  await loggaIn('kiosk');
  const nekad = await anrop('GET', '/api/bokforing/verifikationer');
  assert.equal(nekad.status, 403);
  const nekadBokforing = await anrop('POST', '/api/bokforing/verifikationer', { beskrivning: 'nej', rader: [] });
  assert.equal(nekadBokforing.status, 403);
});

test('tränaren når träningen men inte medlemsregistret', async () => {
  await loggaIn('tranare');
  const jag = await ok('GET', '/api/jag');
  assert.ok(jag.medlem.behorigheter.includes('traning'));
  assert.ok(!jag.medlem.behorigheter.includes('medlemsregister'));
  const nekad = await anrop('GET', '/api/traning/medlemsrapport');
  assert.equal(nekad.status, 403);
});

// ---------- träning och aktivitetsstöd ----------

test('tränaren lägger upp träningsfönster och prickar av närvaro', async () => {
  await loggaIn('tranare');
  const forening = await ok('GET', '/api/forening');
  const grupp = forening.sektioner[0].grupper[0];
  assert.equal(grupp.namn, 'U12');
  assert.equal(grupp.antal_aktiva, 3);

  const serie = await ok('POST', '/api/traning/tillfallen/serie', {
    grupp_id: grupp.id,
    fran: '2026-12-01',
    till: '2026-12-14',
    veckodagar: [1, 3],
    start: '17:30',
    slut: '19:30',
  });
  assert.equal(serie.antal, 4, 'två dagar i veckan under två veckor');

  const igen = await ok('POST', '/api/traning/tillfallen/serie', {
    grupp_id: grupp.id, fran: '2026-12-01', till: '2026-12-14', veckodagar: [1, 3], start: '17:30', slut: '19:30',
  });
  assert.equal(igen.antal, 0, 'samma fönster läggs inte dubbelt');

  const tillfallen = await ok('GET', '/api/traning/tillfallen?fran=2026-12-01&till=2026-12-14');
  const forst = tillfallen[tillfallen.length - 1];
  const fullt = await ok('GET', `/api/traning/tillfallen/${forst.id}`);
  assert.equal(fullt.deltagare.length, 4, 'gruppen förifylls, ledaren med');
  assert.ok(fullt.deltagare.every((d) => !d.narvarande), 'ingen är bockad från början');

  await ok('PUT', `/api/traning/tillfallen/${forst.id}/narvaro`, {
    narvaro: fullt.deltagare.map((d) => ({ medlem_id: d.medlem_id, narvarande: true, roll: d.roll })),
  });
  const efter = await ok('GET', `/api/traning/tillfallen/${forst.id}`);
  assert.equal(efter.deltagare.filter((d) => d.narvarande).length, 4);
});

test('aktivitetsstödet räknar bara tillfällen som uppfyller villkoren', async () => {
  await loggaIn('tranare');
  const stod = await ok('GET', '/api/traning/stod?regel=lok&fran=2026-12-01&till=2026-12-14');
  assert.equal(stod.sammankomster, 1, 'bara tillfället med avprickad närvaro räknas');
  assert.equal(stod.deltagartillfallen, 3);
  assert.equal(stod.ledartillfallen, 1);
  assert.equal(stod.underkanda.length, 3);
  assert.match(stod.underkanda[0].brister.join(' '), /deltagare|Ledare/);

  const kommun = await ok('GET', '/api/traning/stod?regel=kommun&fran=2026-12-01&till=2026-12-14');
  assert.equal(kommun.regel.alder_max, 20, 'kommunen har egen åldersgräns');
});

// ---------- idélådan ----------

test('idé skrivs in, läses och skickas till backlog av en människa', async () => {
  await loggaIn('medlem');
  const ide = await ok('POST', '/api/ideer', {
    rubrik: 'Varmvattenkran',
    text: 'Vi borde ha varmvatten vid uthyrningen.',
    kategori: 'uthyrning',
  });
  assert.equal(ide.status, 'ny');
  assert.equal(ide.skapad_av, 'Vanlig Medlem');
  assert.equal(ide.backlog_ref, null, 'inget hamnar i backlog automatiskt');

  // En vanlig medlem får inte skicka vidare.
  const nekad = await anrop('POST', `/api/ideer/${ide.id}/backlog`, {});
  assert.equal(nekad.status, 403);

  await loggaIn('kassor');
  const skickad = await ok('POST', `/api/ideer/${ide.id}/backlog`, { projekt: 'inbox' });
  assert.equal(skickad.status, 'skickad');
  assert.equal(skickad.backlog_ref, 'inbox-42');
  assert.equal(skickad.skickad_av, 'Karin Kassör');

  const igen = await anrop('POST', `/api/ideer/${ide.id}/backlog`, {});
  assert.equal(igen.status, 409, 'samma idé skickas inte två gånger');
});

test('tom idé avvisas', async () => {
  await loggaIn('medlem');
  const r = await anrop('POST', '/api/ideer', { kategori: 'ovrigt' });
  assert.equal(r.status, 400);
});

// ---------- plånboken ----------

test('plånboken fylls på och bokförs som skuld till medlemmen', async () => {
  await loggaIn('kassor');
  const medlemmar = await ok('GET', '/api/medlemmar');
  const kund = medlemmar.find((m) => m.anvandarnamn === 'medlem');

  const tom = await ok('GET', `/api/planbok/medlem/${kund.id}`);
  assert.equal(tom.saldo_ore, 0);

  const fyllt = await ok('POST', '/api/planbok/insattning', {
    medlem_id: kund.id, belopp_ore: 50000, betalmedel: 'swish',
  });
  assert.equal(fyllt.saldo_efter_ore, 50000);
  assert.equal(fyllt.slag, 'insattning');

  // Påfyllningen är ingen intäkt – den är en skuld tills medlemmen handlar.
  const ver = await ok('GET', '/api/bokforing/verifikationer');
  const paafyllning = ver.verifikationer.find((v) => v.referens_slag === 'planbok');
  assert.ok(paafyllning, 'påfyllningen ska finnas som verifikation');
  assert.equal(paafyllning.rader.find((r) => r.konto === '2420').kredit_ore, 50000);
  assert.equal(paafyllning.rader.find((r) => r.konto === '1930').debet_ore, 50000);
});

test('köp ur plånboken ger medlemsrabatt och flyttar skulden till intäkt', async () => {
  await loggaIn('kassor');
  const kund = (await ok('GET', '/api/medlemmar')).find((m) => m.anvandarnamn === 'medlem');

  await loggaIn('kiosk');
  // Varmkorv 30 kr (rabatteras) + dagkort 270 kr (rabatteras inte).
  const order = await ok('POST', '/api/fik/kassa/order', {
    rader: [{ artikel_id: 1, antal: 1 }, { artikel_id: 3, antal: 1 }],
    betalsatt: 'planbok',
    medlem_id: kund.id,
  });
  assert.equal(order.belopp_ore, 30000, 'ordern visar ordinarie pris');
  // 10 % på korven, inget på liftkortet.
  assert.equal(order.verifikation.belopp_ore, 29700);
  assert.equal(order.verifikation.rader.find((r) => r.konto === '2420').debet_ore, 29700);
  assert.equal(order.verifikation.rader.find((r) => r.konto === '3010').kredit_ore, 2700);
  assert.equal(order.verifikation.rader.find((r) => r.konto === '3030').kredit_ore, 27000);
  assert.equal(order.planbokssaldo, 50000 - 29700);
});

test('plånboken kan inte övertrasseras och ingen spökorder blir kvar', async () => {
  await loggaIn('kiosk');
  const kund = (await ok('GET', '/api/medlemmar')).find((m) => m.anvandarnamn === 'medlem');
  const fore = await ok('GET', '/api/fik/kassa');

  const nekad = await anrop('POST', '/api/fik/kassa/order', {
    rader: [{ artikel_id: 3, antal: 10 }],
    betalsatt: 'planbok',
    medlem_id: kund.id,
  });
  assert.equal(nekad.status, 409);
  assert.match(nekad.kropp.fel, /räcker inte/);

  const efter = await ok('GET', '/api/fik/kassa');
  assert.equal(efter.antal, fore.antal, 'ordern rullades tillbaka med betalningen');

  const utanMedlem = await anrop('POST', '/api/fik/kassa/order', {
    rader: [{ artikel_id: 1, antal: 1 }], betalsatt: 'planbok',
  });
  assert.equal(utanMedlem.status, 400);
});

test('plånbokstransaktioner går inte att ändra eller ta bort', async () => {
  const rad = db.en('SELECT * FROM planbokstransaktion ORDER BY id DESC LIMIT 1');
  assert.throws(() => db.kor('UPDATE planbokstransaktion SET belopp_ore=0 WHERE id=?', rad.id), /får inte ändras/);
  assert.throws(() => db.kor('DELETE FROM planbokstransaktion WHERE id=?', rad.id), /får inte tas bort/);
});

test('medlemmen ser sin egen plånbok men inte andras', async () => {
  await loggaIn('medlem');
  const min = await ok('GET', '/api/planbok/min');
  assert.ok(min.saldo_ore > 0);
  assert.equal(min.rabatt_procent, 10);
  assert.ok(min.historik.length >= 2);

  const kassorId = (await ok('GET', '/api/medlemmar')).find((m) => m.anvandarnamn === 'kassor').id;
  const annans = await anrop('GET', `/api/planbok/medlem/${kassorId}`);
  assert.equal(annans.status, 403);
  const oversikt = await anrop('GET', '/api/planbok');
  assert.equal(oversikt.status, 403, 'bara de som står i kassan ser allas plånböcker');
});

test('rabattsatsen går att ändra av kassören', async () => {
  await loggaIn('kassor');
  const nya = await ok('PUT', '/api/planbok/installningar', { medlemsrabatt_procent: '15' });
  assert.equal(nya.medlemsrabatt_procent, '15');
  const min = await ok('GET', '/api/planbok/min');
  assert.equal(min.rabatt_procent, 15);
  await ok('PUT', '/api/planbok/installningar', { medlemsrabatt_procent: '10' });
});

/**
 * Menysiffrorna.
 *
 * Reglerna som gör dem användbara: bara sådant som kräver en åtgärd, och
 * aldrig en nolla. En siffra som alltid står där slutar betyda något.
 */
test('notiser räknar bara det som väntar på någon', async () => {
  const { notiser } = await import('../server/notiser.mjs');
  const { spara, kor } = db;
  const forening = { moduler: ['*'] };
  const chef = { id: 1, roll: 'admin', uppdrag: [], grupper: [] };

  const fore = notiser(chef, forening);

  // Ett lågprioriterat ärende är ingen notis – det ligger och väntar på
  // rätt väder eller rätt reservdel.
  spara('arende', { titel: 'Önskemål: fler krokar', prioritet: 4, status: 'ny', typ: 'forbattring' });
  assert.equal(
    notiser(chef, forening).arenden ?? 0,
    fore.arenden ?? 0,
    'lågprioriterat ärende ska inte räknas'
  );

  // Ett akut gör det.
  spara('arende', { titel: 'Nödstopp trögt', prioritet: 1, status: 'ny', typ: 'fel' });
  assert.equal((notiser(chef, forening).arenden ?? 0) - (fore.arenden ?? 0), 1);

  // Och en säkerhetsrisk, oavsett prioritet.
  spara('arende', { titel: 'Lös skylt', prioritet: 4, status: 'ny', typ: 'brist', allvarlighet: 'sakerhetsrisk' });
  assert.equal((notiser(chef, forening).arenden ?? 0) - (fore.arenden ?? 0), 2);

  // En avstängd modul räknas inte alls.
  const utanArenden = notiser(chef, { moduler: ['ideer'] });
  assert.equal(utanArenden.arenden, undefined, 'avstängd modul ger ingen siffra');

  // Och en nolla visas inte.
  kor("UPDATE arende SET status='stangd'");
  assert.equal(notiser(chef, forening).arenden, undefined, 'noll ska utelämnas');
});
