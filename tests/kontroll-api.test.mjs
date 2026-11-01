// Kontrollvyns egna rutter.
//
// Vyn är en annan väg in i samma Backis, men den har två egna löften som
// testerna håller fast: en kontroll som gjordes i går är inte försenad
// bara för att dygnet bytts, och en registrerad service är antingen helt
// skriven eller inte skriven alls.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-kv-'));
process.env.HAK_DB = join(katalog, 'kv.db');
process.env.HAK_PORT = '8468';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '1';

const BAS = 'http://127.0.0.1:8468';
let server;
let db;
let kaka = '';

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
const dag = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;

  spara('medlem', { anvandarnamn: 'bea', namn: 'Bea', roll: 'backansvarig', epost: 'bea@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ida', namn: 'Ida', roll: 'medlem', epost: 'ida@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('sasong', { namn: 'test', start: dag(-100), slut: dag(200), kvot_timmar: 8, kvot_nattpass: 1, aktiv: 1 });
  spara('omrade', { namn: 'Stora backen' });
  spara('utrustning', { namn: 'Stora liften', typ: 'lift', omrade_id: 1, drifttimmar: 7400 });
  spara('checklistmall', {
    namn: 'Lift – före öppning', intervall: 'dagligen',
    omfattning: 'utrustningstyp', utrustningstyp: 'lift', aktiv: 1,
  });
  spara('checklistpunkt', { mall_id: 1, text: 'Nödstopp testade', svarstyp: 'bock', obligatorisk: 1, sakerhetskritisk: 1 });

  const { sakerstallArbetsstallen } = await import('../server/api/arbetsstalle.mjs');
  sakerstallArbetsstallen();
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

test('objektsvyn samlar allt som hör till en maskin i ett svar', async () => {
  await loggaIn('bea');
  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  assert.equal(d.objekt.namn, 'Stora liften');
  assert.equal(d.arbetsstalle.nyckel, 'lift-pist', 'liften hör till Lift & Pist');
  // En aldrig utförd kontroll är försenad, och vägs tyngre än en sen.
  assert.equal(d.kontroller.forsenade.length, 1);
  assert.equal(d.kontroller.forsenade[0].aldrig, true);
  assert.equal(d.kontroller.forsenade[0].antal_punkter, 1);
  assert.deepEqual(d.avvikelser, []);
  assert.deepEqual(d.aktivitet, []);
});

test('en kontroll som gjordes i dag är kommande, inte försenad', async () => {
  const { spara, kor } = db;
  const id = spara('checklistkorning', {
    mall_id: 1, utrustning_id: 1, av_id: 1, startad: `${dag(0)} 07:00`, status: 'klar',
  });
  kor('UPDATE checklistkorning SET avslutad=? WHERE id=?', `${dag(0)} 07:20`, id);

  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  assert.equal(d.kontroller.forsenade.length, 0, 'gjord i dag är inte försenad');
  assert.equal(d.kontroller.kommande.length, 1);
  // Daglig: nästa gång är i morgon, alltså en dag kvar.
  assert.equal(d.kontroller.kommande[0].dagar_kvar, 1);
  assert.equal(d.aktivitet.length, 1, 'körningen syns i aktiviteten');
  assert.equal(d.aktivitet[0].slag, 'kontroll');
});

test('en daglig kontroll som gjordes för en vecka sedan är försenad sex dagar', async () => {
  const { spara, kor } = db;
  const id = spara('checklistkorning', {
    mall_id: 1, utrustning_id: 1, av_id: 1, startad: `${dag(-7)} 07:00`, status: 'klar',
  });
  kor('UPDATE checklistkorning SET avslutad=? WHERE id=?', `${dag(-7)} 07:20`, id);
  // Den färskaste körningen vinner, så den från i dag måste bort.
  kor('DELETE FROM checklistkorning WHERE id=1');

  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  assert.equal(d.kontroller.forsenade.length, 1);
  assert.equal(d.kontroller.forsenade[0].forsenad_dagar, 6);
  assert.equal(d.kontroller.forsenade[0].aldrig, false);
});

test('ett dagschema räknar förfallodag, dagar kvar och fönstret', async () => {
  const { spara, kor } = db;
  const mall = spara('checklistmall', {
    namn: 'Månadskontroll', intervall: 'veckovis', omfattning: 'utrustningstyp',
    utrustningstyp: 'lift', aktiv: 1,
    intervalltyp: 'dagar', intervall_dagar: 30, fonster_dagar: 14,
  });
  spara('checklistpunkt', { mall_id: mall, text: 'Linspänning', svarstyp: 'bock', obligatorisk: 1 });
  const k = spara('checklistkorning', {
    mall_id: mall, utrustning_id: 1, av_id: 1, startad: `${dag(-10)} 09:00`, status: 'klar',
  });
  kor('UPDATE checklistkorning SET avslutad=? WHERE id=?', `${dag(-10)} 09:20`, k);

  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  const r = d.kontroller.alla.find((x) => x.mall_id === mall);
  assert.equal(r.intervalltyp, 'dagar');
  assert.equal(r.senast_datum, dag(20), 'förfaller 30 dagar efter senast utförd');
  assert.equal(r.dagar_kvar, 20);
  // Fönstret är fristen efter förfallodagen: 30 + 14 − 10 gångna dagar.
  assert.equal(r.inom_dagar, 34);
  assert.equal(r.forsenad, false);
});

test('ett dagschema som passerat förfallodagen är försenat', async () => {
  const { spara, kor } = db;
  const mall = spara('checklistmall', {
    namn: 'Kvartalskontroll', intervall: 'sasong', omfattning: 'utrustningstyp',
    utrustningstyp: 'lift', aktiv: 1, intervalltyp: 'dagar', intervall_dagar: 90,
  });
  spara('checklistpunkt', { mall_id: mall, text: 'Växellådsolja', svarstyp: 'bock', obligatorisk: 1 });
  const k = spara('checklistkorning', {
    mall_id: mall, utrustning_id: 1, av_id: 1, startad: `${dag(-100)} 09:00`, status: 'klar',
  });
  kor('UPDATE checklistkorning SET avslutad=? WHERE id=?', `${dag(-100)} 09:20`, k);

  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  const r = d.kontroller.forsenade.find((x) => x.mall_id === mall);
  assert.ok(r, 'ska ligga bland de försenade');
  assert.equal(r.forsenad_dagar, 10);
  assert.equal(r.dagar_kvar, null, 'en försenad kontroll har inga dagar kvar');
});

test('ett timschema räknar från timmarna vid senaste körningen, inte från noll', async () => {
  const { spara, uppdatera } = db;
  uppdatera('utrustning', 1, { drifttimmar: 7400 });
  const mall = spara('checklistmall', {
    namn: 'Linklämmorflytt', intervall: 'sasong', omfattning: 'utrustningstyp',
    utrustningstyp: 'lift', aktiv: 1, intervalltyp: 'drifttimmar', intervall_timmar: 50,
    start_timmar: 7400,
  });
  spara('checklistpunkt', { mall_id: mall, text: 'Klämmorna flyttade', svarstyp: 'bock', obligatorisk: 1 });

  // Räkningen utgår från startställningen Jonas skrivit in, inte från
  // noll – en gammal lift ska inte vara sjutusen timmar försenad bara
  // för att kontrollen aldrig bokförts.
  let d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  let r = d.kontroller.alla.find((x) => x.mall_id === mall);
  assert.equal(r.tidigast_timmar, 7450);
  assert.equal(r.timmar_kvar, 50);
  assert.equal(r.forsenad, false);

  // Maskinen går vidare förbi gränsen.
  uppdatera('utrustning', 1, { drifttimmar: 7470 });
  d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  r = d.kontroller.forsenade.find((x) => x.mall_id === mall);
  assert.ok(r, 'över sina timmar är försenad');
  assert.equal(r.timmar_kvar, -20);
});

test('det Jonas ändrar i mallen syns i både ronden och kontrollvyn', async () => {
  const mallar = await ok('GET', '/api/checklistor/mallar');
  const m = mallar.find((x) => x.namn === 'Lift – före öppning');

  await ok('PUT', `/api/checklistor/mallar/${m.id}`, {
    namn: 'Lift – före öppning',
    intervalltyp: 'dagar',
    intervall_dagar: 7,
    fonster_dagar: 3,
    punkter: [
      ...m.punkter.map((p) => ({ ...p })),
      { text: 'Backvarnaren hörs från toppen', svarstyp: 'bock', obligatorisk: true, sakerhetskritisk: true },
    ],
  });

  // Ronden hämtar sina punkter ur mallistan.
  const efter = (await ok('GET', '/api/checklistor/mallar')).find((x) => x.id === m.id);
  assert.equal(efter.punkter.length, m.punkter.length + 1);
  assert.equal(efter.punkter.at(-1).sakerhetskritisk, 1);
  assert.equal(efter.intervall_dagar, 7);

  // Och kontrollvyn räknar på det nya schemat.
  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  const r = d.kontroller.alla.find((x) => x.mall_id === m.id);
  assert.equal(r.intervalltyp, 'dagar');
  assert.equal(r.antal_punkter, m.punkter.length + 1);
});

test('en mall utan antal avvisas när schemat kräver ett', async () => {
  const r = await anrop('POST', '/api/checklistor/mallar', {
    namn: 'Trasig', omfattning: 'allmant', intervalltyp: 'dagar',
    punkter: [{ text: 'Något', svarstyp: 'bock' }],
  });
  assert.equal(r.status, 400);
});

test('ett timschema utan nollpunkt är inte igång, och räknar inte ned', async () => {
  const { spara } = db;
  const mall = spara('checklistmall', {
    namn: 'Växelolja', intervall: 'sasong', omfattning: 'utrustningstyp',
    utrustningstyp: 'lift', aktiv: 1, intervalltyp: 'drifttimmar', intervall_timmar: 500,
  });
  spara('checklistpunkt', { mall_id: mall, text: 'Olja bytt', svarstyp: 'bock', obligatorisk: 1 });

  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  const r = d.kontroller.alla.find((x) => x.mall_id === mall);
  assert.equal(r.tidigast_timmar, null, 'utan nollpunkt finns ingen gräns');
  assert.equal(r.timmar_kvar, null);
  assert.equal(r.aldrig, true);
});

test('service registreras och kvitteras i ett anrop, och flyttar mätarställningen', async () => {
  const svar = await ok('POST', '/api/kontroll/service', {
    utrustning_id: 1,
    namn: 'Bytt lager i topphjulet',
    drifttimmar: 7600,
    arbetstimmar: 3,
    kostnad_ore: 450000,
    anteckning: 'SKF 6210',
  });
  assert.equal(svar.atgard.status, 'utford', 'det som gjorts är gjort, inte planerat');
  assert.equal(svar.atgard.utford_av_id, 1);

  const u = db.en('SELECT drifttimmar FROM utrustning WHERE id=1');
  assert.equal(u.drifttimmar, 7600);

  // Och den syns i maskinens historik, bredvid kontrollerna.
  const d = await ok('GET', '/api/kontroll/objekt?slag=utrustning&id=1');
  const rad = d.aktivitet.find((r) => r.slag === 'service');
  assert.equal(rad.rubrik, 'Bytt lager i topphjulet');
  assert.equal(rad.detalj, '3 h arbete');
});

test('en felskriven mätarställning kan inte backa maskinens timmar', async () => {
  await ok('POST', '/api/kontroll/service', {
    utrustning_id: 1, namn: 'Smörjning', drifttimmar: 46,
  });
  assert.equal(db.en('SELECT drifttimmar FROM utrustning WHERE id=1').drifttimmar, 7600);
});

test('en vanlig medlem får inte registrera service', async () => {
  await loggaIn('ida');
  const r = await anrop('POST', '/api/kontroll/service', { utrustning_id: 1, namn: 'Pillade lite' });
  assert.equal(r.status, 403);
});

test('påfyllning får medlemmen göra – annars blir den inte gjord alls', async () => {
  const r = await anrop('POST', '/api/pafyllningar', {
    utrustning_id: 1, vatsketyp: 'diesel', mangd: 40, matarstallning: 7700,
  });
  assert.equal(r.status, 201);
  assert.equal(db.en('SELECT drifttimmar FROM utrustning WHERE id=1').drifttimmar, 7700);
});

test('dokumentgrenarna svarar även när de är tomma', async () => {
  await loggaIn('bea');
  const v = await ok('GET', '/api/kontroll/dokument?gren=vatsketyper');
  assert.deepEqual(v.dokument, []);
  assert.match(v.tomtext, /inte inlagda/, 'en tom gren säger varför den är tom');

  const a = await ok('GET', '/api/kontroll/dokument?gren=arbetsstalle&nyckel=lift-pist');
  assert.equal(a.arbetsstalle.namn, 'Lift & Pist');

  const saknas = await anrop('GET', '/api/kontroll/dokument?gren=arbetsstalle&nyckel=hittepa');
  assert.equal(saknas.status, 404);
});

test('objektsvyn kräver ett objekt som finns', async () => {
  const r = await anrop('GET', '/api/kontroll/objekt?slag=utrustning&id=9999');
  assert.equal(r.status, 404);
});
