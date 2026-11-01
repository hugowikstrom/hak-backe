// Genomgång av API:et över HTTP mot en egen databasfil.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-test-'));
process.env.HAK_DB = join(katalog, 'test.db');
process.env.HAK_PORT = '8457';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0'; // inget riktigt utskick i testet

const BAS = 'http://127.0.0.1:8457';

// Testdata läggs runt dagens datum, annars hamnar den utanför de fönster
// som mina sidor och kvotberäkningen tittar i.
const dag = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const PASSDAGAR = [dag(1), dag(2), dag(3)];
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

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  const dbmodul = await import('../server/db.mjs');
  db = dbmodul;
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = dbmodul;

  // Grunddata: två medlemmar, en position, tre pass.
  spara('medlem', { anvandarnamn: 'chef', namn: 'Chef Chefsson', roll: 'backansvarig', epost: 'chef@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ida', namn: 'Ida Idasson', roll: 'medlem', epost: 'ida@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ove', namn: 'Ove Ovesson', roll: 'medlem', epost: 'ove@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('sasong', { namn: 'test', start: dag(-200), slut: dag(200), kvot_timmar: 8, kvot_nattpass: 1, aktiv: 1 });
  spara('omrade', { namn: 'Stora backen' });
  spara('utrustning', { namn: 'Lans 1', typ: 'lans', omrade_id: 1 });
  spara('position', { nyckel: 'snolaggning', namn: 'Snöläggning' });
  for (const d of PASSDAGAR)
    spara('pass', { datum: d, start: '22:00', slut: '02:00', position_id: 1, behov: 1, slag: 'natt' });
  const mall = spara('checklistmall', { namn: 'Lanstest', omfattning: 'utrustningstyp', utrustningstyp: 'lans', intervall: 'vid_start' });
  spara('checklistpunkt', { mall_id: mall, ordning: 0, text: 'Kopplingar hela', svarstyp: 'bock' });
  spara('checklistpunkt', { mall_id: mall, ordning: 1, text: 'Vattentryck', svarstyp: 'varde', enhet: 'bar' });
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

test('utan inloggning är allt stängt', async () => {
  const r = await anrop('GET', '/api/oversikt');
  assert.equal(r.status, 401);
  const j = await anrop('GET', '/api/jag');
  assert.equal(j.kropp.medlem, null);
});

test('fel lösenord nekas', async () => {
  const r = await anrop('POST', '/api/logga-in', { anvandarnamn: 'ida', losenord: 'fel' });
  assert.equal(r.status, 401);
});

test('skrivning utan klientheader nekas', async () => {
  const r = await fetch(`${BAS}/api/logga-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anvandarnamn: 'ida', losenord: 'hemligt' }),
  });
  assert.equal(r.status, 403);
});

test('medlem loggar in, bokar pass och ser sitt kvotläge', async () => {
  const inlogg = await ok('POST', '/api/logga-in', { anvandarnamn: 'ida', losenord: 'hemligt' });
  assert.equal(inlogg.medlem.roll, 'medlem');

  const rutnat = await ok('GET', `/api/bemanning/rutnat?fran=${PASSDAGAR[0]}&till=${PASSDAGAR[2]}`);
  assert.equal(rutnat.pass.length, 3);
  const pass = rutnat.pass[0];

  await ok('POST', `/api/bemanning/pass/${pass.id}/boka`, {});
  const dubbel = await anrop('POST', `/api/bemanning/pass/${pass.id}/boka`, {});
  assert.equal(dubbel.status, 409, 'samma pass två gånger ska nekas');

  const mina = await ok('GET', '/api/bemanning/mina');
  assert.equal(mina.pass.length, 1);
  assert.equal(mina.lage.kvot, 8);
  assert.equal(mina.lage.planerat, 4);
  assert.equal(mina.lage.kvar, 4);
  assert.equal(mina.lage.natt, 1);
});

test('medlem får inte boka in någon annan', async () => {
  const r = await anrop('POST', '/api/bemanning/pass/2/boka', { medlem_id: 3 });
  assert.equal(r.status, 403);
});

test('otillgänglighet blockerar bokning', async () => {
  await ok('POST', '/api/bemanning/otillganglighet', { fran: PASSDAGAR[1], till: PASSDAGAR[1], orsak: 'bortrest' });
  const r = await anrop('POST', '/api/bemanning/pass/2/boka', {});
  assert.equal(r.status, 409);
  assert.match(r.kropp.fel, /otillgänglig/);
});

test('medlem kommer inte åt registret', async () => {
  const r = await anrop('POST', '/api/medlemmar', { anvandarnamn: 'ny', namn: 'Ny' });
  assert.equal(r.status, 403);
});

test('mätning sparas med framräknad wetbulb', async () => {
  const m = await ok('POST', '/api/sno/matningar', { lufttemp: -5, luftfukt: 50, vattenflode: 6, utrustning_id: 1 });
  assert.equal(m.wetbulb, -7.2);
  assert.equal(m.klartecken.niva, 'mycket_bra'); // −7,2 °C är kallare än gränsen −7
  const nulage = await ok('GET', '/api/sno/nulage');
  assert.equal(nulage.senasteMatning.id, m.id);
});

test('mätning utan värden avvisas', async () => {
  const r = await anrop('POST', '/api/sno/matningar', { anteckning: 'bara text' });
  assert.equal(r.status, 400);
});

test('checklistkörning med avvikelse skapar ärende', async () => {
  const mallar = await ok('GET', '/api/checklistor/for?utrustning_id=1');
  assert.equal(mallar.length, 1);
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mallar[0].id, utrustning_id: 1 });
  assert.equal(k.punkter.length, 2);

  await ok('PUT', `/api/checklistor/svar/${k.id}/${k.punkter[1].id}`, { bockad: true, varde: 31 });
  const oklar = await anrop('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {});
  assert.equal(oklar.status, 400, 'obligatorisk punkt saknar svar');

  await ok('PUT', `/api/checklistor/svar/${k.id}/${k.punkter[0].id}`, { bockad: false, avvikelse: true, kommentar: 'Spricka i slangen' });
  const klar = await ok('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {
    anteckning: 'Blåste hårt, svårt att höra nödstoppet',
  });
  assert.equal(klar.korning.status, 'klar');
  // Avslutsrutan frågar efter en anteckning. Frågas den efter ska den
  // också sparas – annars är frågan en lögn.
  assert.equal(klar.korning.anteckning, 'Blåste hårt, svårt att höra nödstoppet');
  assert.equal(klar.nya_arenden.length, 1);
  assert.match(klar.nya_arenden[0].titel, /Spricka|Kopplingar/);
  assert.equal(klar.nya_arenden[0].utrustning, 'Lans 1');
});

test('ärende kan kommenteras och stängas av den som skapat det', async () => {
  const a = await ok('POST', '/api/arenden', { titel: 'Testfel', prioritet: 1, beskrivning: 'beskrivning' });
  await ok('POST', `/api/arenden/${a.id}/handelse`, { slag: 'atgard', text: 'Lagat' });
  const stangt = await ok('PUT', `/api/arenden/${a.id}`, { status: 'stangd' });
  assert.equal(stangt.status, 'stangd');
  assert.ok(stangt.stangd);
  assert.ok(stangt.handelser.some((h) => h.slag === 'status'));
  assert.equal(stangt.titel, 'Testfel', 'titeln ska inte nollas av en delvis uppdatering');
});

test('backansvarig kan skapa pass, autoplanera och markera närvaro', async () => {
  await ok('POST', '/api/logga-ut');
  await ok('POST', '/api/logga-in', { anvandarnamn: 'chef', losenord: 'hemligt' });

  const nya = await ok('POST', '/api/bemanning/pass', {
    dagar: [dag(10), dag(11)], positioner: [1], start: '17:00', slut: '21:00', behov: 1,
  });
  assert.equal(nya.antal, 2);

  const torr = await ok('POST', '/api/bemanning/autoplan', { fran: dag(0), till: dag(30), torrkor: true });
  assert.ok(torr.tilldelningar.length >= 2);
  assert.equal(torr.skrivet, false);

  const skarpt = await ok('POST', '/api/bemanning/autoplan', { fran: dag(0), till: dag(30), torrkor: false });
  assert.ok(skarpt.skrivna >= 2);

  const efter = await ok('GET', `/api/bemanning/rutnat?fran=${dag(0)}&till=${dag(30)}`);
  const bokningar = efter.pass.flatMap((p) => p.bokningar);
  assert.ok(bokningar.some((b) => b.kalla === 'auto'));
  assert.equal(bokningar.filter((b) => b.medlem_id === 2 && b.pass_id === 2).length, 0, 'otillgänglig dag ska hoppas över');

  const b = bokningar[0];
  await ok('PUT', `/api/bemanning/bokningar/${b.id}`, { status: 'narvarande' });
  const lagen = await ok('GET', '/api/bemanning/lage?alla=1');
  assert.ok(lagen.some((l) => l.utfort > 0), 'närvaro ska bli en insats');
});

test('rapporterna svarar med siffror', async () => {
  const r = await ok('GET', `/api/rapport/samlad?fran=${dag(-30)}&till=${dag(30)}`);
  assert.ok(r.sno.summa.matningar >= 1);
  assert.ok(r.arenden.oppna_totalt >= 1);
  assert.ok(r.bemanning.summa.pass >= 5);
  assert.ok(Object.hasOwn(r.bemanning.rattvisa, 'andel_std'));
});

test('utskick loggas även när sändning är avstängd', async () => {
  const ut = await ok('POST', '/api/bemanning/utskick', { fran: dag(0), till: dag(30) });
  assert.ok(ut.antal >= 1);
  assert.equal(ut.skickade, 0, 'HAK_EPOST_AV=0 ska stoppa sändningen');
  assert.ok(ut.resultat.every((r) => /avstängt/.test(r.fel)));
});

test('CSV-export har rubriker och semikolon', async () => {
  const csv = await ok('GET', `/api/bemanning/schema.csv?fran=${dag(0)}&till=${dag(30)}`);
  assert.match(csv, /Datum;Start;Slut;Position/);
});

// ---- mobilappens tillägg ----

test('bild sparas, hämtas och kan hängas på en avvikelse', async () => {
  // Minsta tänkbara PNG, räcker för att pröva vägen in och ut.
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { bild } = await ok('POST', '/api/bilder', { data: png });
  assert.match(bild, /^[0-9a-f]{24}\.png$/);

  const r = await fetch(`${BAS}/api/bilder/${bild}`, { headers: { cookie: kaka } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');

  const saknas = await anrop('GET', '/api/bilder/0123456789abcdef01234567.png');
  assert.equal(saknas.status, 404);

  const fel = await anrop('POST', '/api/bilder', { data: 'inte en bild' });
  assert.equal(fel.status, 400);
});

test('mobilrond sparar bild på avvikelsen och ärendet länkar till den', async () => {
  const mallar = await ok('GET', '/api/checklistor/for?utrustning_id=1');
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mallar[0].id, utrustning_id: 1, kalla: 'mobil' });
  assert.equal(k.kalla, 'mobil');

  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const svarad = await ok('PUT', `/api/checklistor/svar/${k.id}/${k.punkter[0].id}`, {
    bockad: false, avvikelse: true, kommentar: 'Spricka i slangen', bild: png,
  });
  const punkt = svarad.punkter.find((p) => p.id === k.punkter[0].id);
  assert.match(punkt.bild, /^[0-9a-f]{24}\.png$/);

  // Ronden lämnas med en obesvarad obligatorisk punkt: då avslutas den som
  // brist, inte som godkänd, och motiveringen krävs.
  const klar = await ok('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {
    tvinga: true,
    motivering: 'Resten görs i morgon, lansen är avstängd',
  });
  assert.equal(klar.korning.status, 'klar_med_brist');
  assert.equal(klar.korning.brister.length, 1);
  assert.equal(klar.nya_arenden.length, 1);
  assert.match(klar.nya_arenden[0].beskrivning, new RegExp(`/api/bilder/${punkt.bild}`));
});

test('checklistmall kan kopieras och tas bort', async () => {
  const skapad = await ok('POST', '/api/checklistor/mallar', {
    namn: 'Testmall', omfattning: 'allmant', intervall: 'dagligen',
    punkter: [{ text: 'Punkt ett' }, { text: 'Punkt två', svarstyp: 'varde', enhet: 'cm' }],
  });
  assert.equal(skapad.punkter.length, 2);

  const kopia = await ok('POST', `/api/checklistor/mallar/${skapad.id}/kopia`);
  assert.equal(kopia.namn, 'Testmall (kopia)');
  assert.equal(kopia.aktiv, 0, 'kopian ska vara vilande tills någon aktiverar den');
  assert.equal(kopia.punkter.length, 2);

  const bort = await ok('DELETE', `/api/checklistor/mallar/${kopia.id}`);
  assert.equal(bort.borttagen, true);

  // En mall som använts ska bevaras för historikens skull.
  await ok('POST', '/api/checklistor/korningar', { mall_id: skapad.id });
  const anvand = await ok('DELETE', `/api/checklistor/mallar/${skapad.id}`);
  assert.equal(anvand.borttagen, false);
  assert.equal(anvand.inaktiverad, true);
  const kvar = await ok('GET', '/api/checklistor/mallar');
  assert.equal(kvar.find((m) => m.id === skapad.id).aktiv, 0);
});

test('medlem får inte ändra checklistmallar', async () => {
  await ok('POST', '/api/logga-ut');
  await ok('POST', '/api/logga-in', { anvandarnamn: 'ida', losenord: 'hemligt' });
  const r = await anrop('POST', '/api/checklistor/mallar', { namn: 'Nej', punkter: [{ text: 'x' }] });
  assert.equal(r.status, 403);
  const d = await anrop('DELETE', '/api/checklistor/mallar/1');
  assert.equal(d.status, 403);
});

test('min sida visar en sak i taget, och rätt sak', async () => {
  await ok('POST', '/api/logga-in', { anvandarnamn: 'ida', losenord: 'hemligt' });

  // Ida har bokat ett pass tidigare i testet och har kvot kvar.
  const m = await ok('GET', '/api/mitt');
  assert.ok(['boka', 'nasta_pass', 'snart_pass', 'pa_pass'].includes(m.lage), `oväntat läge: ${m.lage}`);
  assert.ok(m.kvot.text, 'kvoten ska sägas i timmar');

  if (m.lage === 'boka') {
    assert.ok(m.att_boka.length <= 5, 'förslagen ska vara få nog att läsa');
    assert.ok(
      m.att_boka.every((p) => p.saknas > 0),
      'bara pass som faktiskt saknar folk föreslås'
    );
  }

  // Ronder visas bara när man står på eller strax före sitt pass.
  if (!['pa_pass', 'snart_pass'].includes(m.lage)) assert.deepEqual(m.ronder, []);

  // Alltid: mina kommande pass och mina öppna ärenden finns med.
  assert.ok(Array.isArray(m.kommande));
  assert.ok(Array.isArray(m.mina_arenden));
});
