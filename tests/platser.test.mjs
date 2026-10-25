// Positionen i backen och maskinen som står där är två olika saker.
//
// Det är skillnaden hela snöläggningen vilar på: man går "lans fyra", och
// vad som står där i dag är en annan fråga. Ett läckande vattenuttag stannar
// på platsen; ett trasigt munstycke följer med kanonen när den flyttas.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-plats-'));
process.env.HAK_DB = join(katalog, 'plats.db');
process.env.HAK_PORT = '8467';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';

const BAS = 'http://127.0.0.1:8467';
let server;
let db;
let kaka = '';
let lans4;
let lans7;
let v3;
let nessy;

const anrop = async (metod, stig, kropp) => {
  const r = await fetch(BAS + stig, {
    method: metod,
    headers: { 'content-type': 'application/json', 'x-hak': '1', ...(kaka ? { cookie: kaka } : {}) },
    body: kropp === undefined ? undefined : JSON.stringify(kropp),
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) kaka = sc[0].split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, kropp: typ.includes('json') ? await r.json() : await r.text() };
};
const ok = async (metod, stig, kropp) => {
  const r = await anrop(metod, stig, kropp);
  assert.ok(r.status < 400, `${metod} ${stig} gav ${r.status}: ${JSON.stringify(r.kropp)}`);
  return r.kropp;
};
const loggaIn = (namn) => ok('POST', '/api/logga-in', { anvandarnamn: namn, losenord: 'hemligt' });

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;

  spara('medlem', { anvandarnamn: 'jonas', namn: 'Jonas', roll: 'anlaggningsansvarig', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ida', namn: 'Ida', roll: 'medlem', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('omrade', { namn: 'Stora backen' });
  spara('sasong', { namn: 'test', start: '2026-01-01', slut: '2027-12-31', aktiv: 1 });

  // Maskinerna heter vad de är.
  v3 = spara('utrustning', { namn: 'V3-lans 1', typ: 'lans', modell: 'V3' });
  nessy = spara('utrustning', { namn: 'Nessy 1', typ: 'lans', modell: 'Nessy Land' });
  spara('utrustning', { namn: 'Lenko 1', typ: 'flakt', tillverkare: 'Lenko' });

  // Platserna heter var de är.
  lans4 = spara('snoplats', { nummer: 4, namn: 'Lans 4', slag: 'lans', omrade_id: 1, vattenuttag: 'V4' });
  lans7 = spara('snoplats', { nummer: 7, namn: 'Lans 7', slag: 'lans', omrade_id: 1, vattenuttag: 'V7' });
  spara('snoplats', { nummer: 1, namn: 'Fläktplats 1', slag: 'flakt', omrade_id: 1 });
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

test('en position håller en maskin i taget, och bytet skrivs i historiken', async () => {
  await loggaIn('jonas');
  await ok('POST', `/api/platser/${lans4}/maskin`, { utrustning_id: v3 });
  let lista = await ok('GET', '/api/platser');
  assert.equal(lista.platser.find((p) => p.id === lans4).maskin, 'V3-lans 1');
  assert.equal(lista.platser.find((p) => p.id === lans7).tom, true);

  // Ny kanon på samma plats flyttar av den gamla.
  const bytt = await ok('POST', `/api/platser/${lans4}/maskin`, { utrustning_id: nessy });
  assert.equal(bytt.plats.maskin, 'Nessy 1');
  assert.equal(bytt.avflyttade.length, 1);

  const detalj = await ok('GET', `/api/platser/${lans4}`);
  assert.equal(detalj.historik.length, 2);
  assert.equal(detalj.historik[0].maskin, 'Nessy 1');
  assert.equal(detalj.historik[0].till, null);
  assert.equal(detalj.historik[1].maskin, 'V3-lans 1');
  assert.ok(detalj.historik[1].till, 'den gamla uppställningen ska vara avslutad');
});

test('en maskin står på ett ställe, inte två', async () => {
  await loggaIn('jonas');
  // V3:an flyttades av från lans 4 nyss. Ställ den på lans 7.
  await ok('POST', `/api/platser/${lans7}/maskin`, { utrustning_id: v3 });
  const lista = await ok('GET', '/api/platser');
  assert.equal(lista.platser.find((p) => p.id === lans7).maskin, 'V3-lans 1');
  assert.equal(lista.platser.find((p) => p.id === lans4).maskin, 'Nessy 1');

  // Flytta tillbaka den: lans 7 ska bli tom, inte ha två maskiner.
  await ok('POST', `/api/platser/${lans4}/maskin`, { utrustning_id: v3 });
  const efter = await ok('GET', '/api/platser');
  assert.equal(efter.platser.find((p) => p.id === lans7).tom, true);
  assert.equal(efter.platser.find((p) => p.id === lans4).maskin, 'V3-lans 1');
  assert.ok(efter.olacerade.some((u) => u.namn === 'Nessy 1'), 'Nessy står nu utan plats');
});

test('fel sorts maskin på en plats går igenom, men inte tyst', async () => {
  await loggaIn('jonas');
  const flaktplats = (await ok('GET', '/api/platser')).platser.find((p) => p.slag === 'flakt');
  const r = await ok('POST', `/api/platser/${flaktplats.id}/maskin`, { utrustning_id: v3 });
  assert.match(r.varning, /är lans, positionen är gjord för fläktkanon/i);
  assert.equal(r.plats.maskin, 'V3-lans 1');
  // Ställ tillbaka den där den hör hemma.
  await ok('POST', `/api/platser/${lans4}/maskin`, { utrustning_id: v3 });
});

test('ett fel på positionen stannar på positionen', async () => {
  await loggaIn('jonas');
  const a = await ok('POST', '/api/arenden', {
    titel: 'Läckage i kopplingen vid lans 4',
    beskrivning: 'Vatten sprutar ur kopplingen mot stamledningen.',
    typ: 'fel',
    snoplats_id: lans4,
    omrade_id: 1,
  });
  assert.equal(a.plats, 'Lans 4');
  assert.equal(a.utrustning_id, null, 'felet sitter inte på kanonen som råkar stå där');
  // Men vilken maskin som stod där syns, som sammanhang.
  assert.equal(a.maskin_da.namn, 'V3-lans 1');

  // Byt kanon. Felet ska ligga kvar på platsen.
  await ok('POST', `/api/platser/${lans4}/maskin`, { utrustning_id: nessy });
  const efter = await ok('GET', `/api/platser/${lans4}`);
  assert.equal(efter.maskin.namn, 'Nessy 1');
  assert.ok(efter.arenden_plats.some((x) => x.id === a.id), 'platsfelet följer platsen');
  assert.equal(efter.arenden_maskin.length, 0, 'Nessy har inte ärvt lans 4:s läckage');
});

test('ett fel på maskinen följer maskinen', async () => {
  await loggaIn('jonas');
  const a = await ok('POST', '/api/arenden', {
    titel: 'Munstycksringen läcker',
    typ: 'fel',
    utrustning_id: nessy,
  });
  assert.equal(a.utrustning, 'Nessy 1');
  assert.equal(a.snoplats_id, null);

  // Flytta Nessy till lans 7. Felet ska följa med.
  await ok('POST', `/api/platser/${lans7}/maskin`, { utrustning_id: nessy });
  const lans7detalj = await ok('GET', `/api/platser/${lans7}`);
  assert.ok(lans7detalj.arenden_maskin.some((x) => x.id === a.id), 'maskinfelet följde kanonen');
  const lans4detalj = await ok('GET', `/api/platser/${lans4}`);
  assert.ok(!lans4detalj.arenden_maskin.some((x) => x.id === a.id));
});

test('en mätning på en position vet själv vilken maskin som står där', async () => {
  await loggaIn('ida');
  const m = await ok('POST', '/api/sno/matningar', {
    snoplats_id: lans7,
    lufttemp: -6,
    luftfukt: 65,
    vattentryck: 31,
  });
  assert.equal(m.plats, 'Lans 7');
  assert.equal(m.utrustning, 'Nessy 1', 'maskinen fylls i ur uppställningen');
  assert.ok(m.wetbulb < -6 && m.wetbulb > -14);
});

test('återkommande fel räknas åt två håll', async () => {
  await loggaIn('jonas');
  // Tre fel på samma position, med olika kanoner uppställda däremellan.
  // Tiderna sätts isär efteråt: i verkligheten ligger ett kanonbyte och en
  // felanmälan inte i samma sekund, men i ett test gör de det.
  const nya = [];
  for (const i of [1, 2]) {
    nya.push(
      await ok('POST', '/api/arenden', {
        titel: `Vattenuttaget vid lans 4 läcker (${i})`,
        typ: 'fel',
        snoplats_id: lans4,
      })
    );
    await ok('POST', `/api/platser/${lans4}/maskin`, { utrustning_id: i === 1 ? v3 : nessy });
  }
  const dag = (n) => `2026-10-${String(n).padStart(2, '0')} 12:00:00`;
  db.kor(`UPDATE uppstallning SET fran=?, till=? WHERE snoplats_id=? AND utrustning_id=?`,
    dag(1), dag(10), lans4, v3);
  db.kor(`UPDATE uppstallning SET fran=?, till=NULL WHERE snoplats_id=? AND utrustning_id=?`,
    dag(10), lans4, nessy);
  db.kor(`UPDATE arende SET skapad=? WHERE id=?`, dag(5), nya[0].id);
  db.kor(`UPDATE arende SET skapad=? WHERE id=?`, dag(15), nya[1].id);

  const m = await ok('GET', '/api/drift/monster');
  const plats = m.platsmonster.find((r) => r.plats === 'Lans 4');
  assert.ok(plats, 'positionen ska synas i platsmönstret');
  assert.ok(plats.antal >= 3);
  assert.equal(plats.pekar_pa_platsen, true, 'samma fel med olika maskiner pekar på platsen');
  assert.equal(plats.utred, true);

  // Maskinmönstret ska inte ha fått platsens fel på sig.
  assert.ok(!m.monster.some((r) => r.antal >= 3 && r.utrustning === 'Nessy 1'));
});

test('en snöläggningsrond går på positionen, och avvikelsen hamnar där', async () => {
  await loggaIn('jonas');
  const mall = await ok('POST', '/api/checklistor/mallar', {
    namn: 'Lansposition – tillsyn',
    omfattning: 'snoplats',
    platsslag: 'lans',
    intervall: 'per_pass',
    punkter: [{ text: 'Vattenuttaget är tätt' }, { text: 'Slangen är hel' }],
  });
  assert.equal(mall.omfattning, 'snoplats');

  // Listan gäller positionen, inte maskinen som står där.
  const for_platsen = await ok('GET', `/api/checklistor/for?snoplats_id=${lans4}`);
  assert.ok(for_platsen.some((m) => m.id === mall.id));

  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mall.id, snoplats_id: lans4 });
  assert.equal(k.plats, 'Lans 4');
  assert.equal(k.utrustning, 'Nessy 1', 'maskinen noteras med, för sammanhanget');

  await ok('PUT', `/api/checklistor/svar/${k.id}/${k.punkter[0].id}`, {
    avvikelse: true,
    kommentar: 'Droppar vid kopplingen igen',
  });
  await ok('PUT', `/api/checklistor/svar/${k.id}/${k.punkter[1].id}`, { bockad: true });
  const klar = await ok('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {});

  const arende = klar.nya_arenden[0];
  assert.equal(arende.snoplats_id, lans4);
  assert.equal(arende.utrustning_id, null, 'ronden gick på platsen – felet hamnar inte på kanonen');
});
