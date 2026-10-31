// Behörighetsgrupper: att en medlem kan tillhöra flera grupper, och att
// gruppen öppnar delar av systemet som rollen inte gör.
//
// Det som provas är gränserna, för det är där det kostar att ha fel:
// gruppen får ge, den får inte ta bort, en utgången tillhörighet ger
// ingenting, och ingen kan dela ut mer än hen själv har.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-tilltrade-'));
process.env.HAK_DB = join(katalog, 'test.db');
process.env.HAK_PORT = '8469';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';

const BAS = 'http://127.0.0.1:8469';
let server;
let db;

/** Varje inloggning får hålla sin egen kaka, så att flera kan vara inne. */
const skapaKlient = () => {
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
  return {
    anrop,
    ok: async (metod, stig, kropp) => {
      const r = await anrop(metod, stig, kropp);
      assert.ok(r.status < 400, `${metod} ${stig} gav ${r.status}: ${JSON.stringify(r.kropp)}`);
      return r.kropp;
    },
    loggaIn: (anvandarnamn) => anrop('POST', '/api/logga-in', { anvandarnamn, losenord: 'hemligt' }),
  };
};

const idag = () => new Date().toISOString().slice(0, 10);
const dagar = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

let admin;
let ordf;
let kassor;
let vera;

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;

  const medlem = (anvandarnamn, namn, roll) =>
    spara('medlem', {
      anvandarnamn, namn, roll, epost: `${anvandarnamn}@test`,
      losenordshash: hasha('hemligt'), kompetens: '[]',
    });

  medlem('admin', 'Admin Adminsson', 'admin');
  const ordf_id = medlem('annika', 'Annika Ordförande', 'medlem');
  medlem('karin', 'Karin Kassör', 'medlem');
  medlem('vera', 'Vera Volontär', 'medlem');
  medlem('viktor', 'Viktor Vanlig', 'medlem');

  // Ordföranden får sitt uppdrag, och därmed behörighetsstyrningen.
  spara('uppdrag', { medlem_id: ordf_id, slag: 'ordforande', fran: dagar(-30) });
  spara('uppdrag', { medlem_id: 3, slag: 'kassor', fran: dagar(-30) });
  // Något att nå: ett område kräver @anlaggning för att skrivas.
  spara('omrade', { namn: 'Stora backen' });

  admin = skapaKlient();
  ordf = skapaKlient();
  kassor = skapaKlient();
  vera = skapaKlient();
  await admin.loggaIn('admin');
  await ordf.loggaIn('annika');
  await kassor.loggaIn('karin');
  await vera.loggaIn('vera');
});

after(() => {
  server?.close();
  db?.stang?.();
  rmSync(katalog, { recursive: true, force: true });
});

test('bara den som får styra tillträden kommer åt grupperna', async () => {
  // Kassören har ekonomin men inte nycklarna till systemet.
  const k = await kassor.anrop('GET', '/api/tilltrade');
  assert.equal(k.status, 403);
  const v = await vera.anrop('GET', '/api/tilltrade');
  assert.equal(v.status, 403);
  const o = await ordf.anrop('GET', '/api/tilltrade');
  assert.equal(o.status, 200);
});

// Ordföranden har inte @anlaggning själv och kan därför inte dela ut den –
// spärren nedan provar just det. Grupper som ger den sätts upp av
// administratören, medlemskapen sköter ordföranden.
test('en grupp ger behörighet som rollen inte ger', async () => {
  // Vera är vanlig medlem: det som kräver @anlaggning är stängt.
  const innan = await vera.anrop('GET', '/api/drift/leverantorer');
  assert.equal(innan.status, 403);

  const grupp = await admin.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Snögänget',
    beskrivning: 'Kör snöläggningen',
    behorigheter: ['anlaggning'],
    ytor: ['back'],
  });
  assert.equal(grupp.nyckel, 'snoganget');
  assert.deepEqual(grupp.behorigheter, ['anlaggning']);

  await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 4 });

  // Samma anrop, samma roll – men nu med gruppen.
  const efter = await vera.anrop('GET', '/api/drift/leverantorer');
  assert.ok(efter.status < 400, `gav ${efter.status}: ${JSON.stringify(efter.kropp)}`);
});

test('medlemmen ser själv vilka grupper hon är med i, och sin nivå', async () => {
  const p = await vera.ok('GET', '/api/plattform');
  assert.equal(p.medlem.roll, 'medlem', 'rollen ändras inte av en grupp');
  assert.deepEqual(
    p.medlem.grupper.map((g) => g.nyckel),
    ['snoganget']
  );
  assert.ok(p.medlem.behorigheter.includes('anlaggning'));
  // Gruppen gav ingen nivå, bara en behörighet.
  assert.equal(p.medlem.roll_niva, 1);
  // Arbetsytan gruppen öppnar finns i ytväljaren.
  assert.ok(p.medlem.arbetsytor.some((y) => y.nyckel === 'back'));
});

test('rollgolv höjer nivån men sänker ingen', async () => {
  const grupp = await admin.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Liftansvariga',
    roll_golv: 'backansvarig',
    behorigheter: ['anlaggning'],
  });
  await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 4 });

  const p = await vera.ok('GET', '/api/plattform');
  assert.equal(p.medlem.roll, 'medlem');
  assert.equal(p.medlem.roll_niva, 3, 'backansvarig är nivå 3');

  // Administratören står över golvet: hennes nivå rör sig inte nedåt.
  await admin.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 1 });
  const a = await admin.ok('GET', '/api/plattform');
  assert.equal(a.medlem.roll_niva, 5);
});

test('ingen kan ge bort mer än hen själv har', async () => {
  // Ordföranden har inte @anlaggning – den hänger på backansvarig eller
  // anläggningsansvarig. Då går den inte att lägga i en grupp heller.
  const r = await ordf.anrop('POST', '/api/tilltrade/grupper', {
    namn: 'Försök',
    behorigheter: ['anlaggning'],
  });
  assert.equal(r.status, 403);
  assert.match(r.kropp.fel, /har den inte själv/);

  // Och inte heller ett rollgolv över den egna nivån.
  const g = await ordf.anrop('POST', '/api/tilltrade/grupper', {
    namn: 'Försök två',
    roll_golv: 'admin',
  });
  assert.equal(g.status, 403);
  assert.match(g.kropp.fel, /över din egen nivå/);

  // Administratören får sätta upp det första.
  const ok = await admin.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Pistgruppen',
    behorigheter: ['anlaggning', 'incident'],
  });
  assert.deepEqual(ok.behorigheter.sort(), ['anlaggning', 'incident']);
});

test('tillhörigheten upphör med datum, och behörigheten med den', async () => {
  const grupp = await ordf.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Kioskvärdarna',
    behorigheter: ['kassa'],
  });
  await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 5 });

  const viktor = skapaKlient();
  await viktor.loggaIn('viktor');
  let p = await viktor.ok('GET', '/api/plattform');
  assert.ok(p.medlem.behorigheter.includes('kassa'));

  await ordf.ok('DELETE', `/api/tilltrade/grupper/${grupp.id}/medlemmar/5`);
  p = await viktor.ok('GET', '/api/plattform');
  assert.ok(!p.medlem.behorigheter.includes('kassa'), 'behörigheten ska vara borta');

  // Raden ligger kvar: vem som haft tillträde är en uppgift i sig.
  const g = await ordf.ok('GET', `/api/tilltrade/grupper/${grupp.id}`);
  const rad = g.medlemmar.find((m) => m.medlem_id === 5);
  assert.ok(rad, 'tillhörigheten ska finnas kvar som historik');
  assert.equal(rad.till, idag());
  assert.equal(rad.upphord, true);
  assert.ok(rad.aterkallad, 'återkallelsen ska ha en tidsstämpel');
});

test('en tillhörighet som inte börjat ger ingenting', async () => {
  const grupp = await ordf.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Framtida laget',
    behorigheter: ['bemanning'],
  });
  await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, {
    medlem_id: 5,
    fran: dagar(14),
  });
  const viktor = skapaKlient();
  await viktor.loggaIn('viktor');
  const p = await viktor.ok('GET', '/api/plattform');
  assert.ok(!p.medlem.behorigheter.includes('bemanning'), 'framtida tillträde gäller inte i dag');
});

test('en avstängd grupp ger ingenting', async () => {
  // Provas på Viktor och inte på Vera: Vera har rollgolvet backansvarig
  // sedan ett tidigare test, och det ger bemanning oavsett gruppen.
  const grupp = await admin.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Vilande laget',
    behorigheter: ['medlemsregister'],
  });
  await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 5 });
  const viktor = skapaKlient();
  await viktor.loggaIn('viktor');
  let p = await viktor.ok('GET', '/api/plattform');
  assert.ok(p.medlem.behorigheter.includes('medlemsregister'));

  await ordf.ok('PATCH', `/api/tilltrade/grupper/${grupp.id}`, { aktiv: false });
  p = await viktor.ok('GET', '/api/plattform');
  assert.ok(!p.medlem.behorigheter.includes('medlemsregister'), 'avstängd grupp ska inte ge något');
});

test('återinträde öppnar samma rad i stället för att dubblera', async () => {
  const grupp = await ordf.ok('POST', '/api/tilltrade/grupper', {
    namn: 'Återvändarna',
    behorigheter: ['bemanning'],
  });
  await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 5 });
  await ordf.ok('DELETE', `/api/tilltrade/grupper/${grupp.id}/medlemmar/5`);
  const g = await ordf.ok('POST', `/api/tilltrade/grupper/${grupp.id}/medlemmar`, { medlem_id: 5 });
  const rader = g.medlemmar.filter((m) => m.medlem_id === 5);
  assert.equal(rader.length, 1, 'en medlem ska ha en rad per grupp');
  assert.equal(rader[0].till, null);
});

test('flera grupper läggs ihop, och grundgrupper går inte att ta bort', async () => {
  const p = await vera.ok('GET', '/api/plattform');
  // Vera är med i snögänget, liftansvariga och vilande laget (avstängd).
  assert.deepEqual(
    p.medlem.grupper.map((g) => g.nyckel).sort(),
    ['liftansvariga', 'snoganget']
  );
  assert.ok(p.medlem.behorigheter.includes('anlaggning'));
  assert.ok(p.medlem.behorigheter.includes('incident'), 'rollgolvet backansvarig ger incident');

  // Grundgrupper stängs av, de raderas inte.
  const { kor, en } = db;
  kor("UPDATE behorighetsgrupp SET inbyggd=1 WHERE nyckel='snoganget'");
  const id = en("SELECT id FROM behorighetsgrupp WHERE nyckel='snoganget'").id;
  const r = await ordf.anrop('DELETE', `/api/tilltrade/grupper/${id}`);
  assert.equal(r.status, 400);
  assert.match(r.kropp.fel, /Stäng av/);
});
