// Plattformen: flera föreningar, var och en med sin databas och sina moduler.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';

const katalog = mkdtempSync(join(tmpdir(), 'hak-plattform-'));
const register = join(katalog, 'foreningar.json');
process.env.HAK_FORENINGSREGISTER = register;
process.env.HAK_PORT = '8461';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_DB = join(katalog, 'standard.db');

writeFileSync(
  register,
  JSON.stringify({
    standard: 'backen',
    foreningar: [
      {
        nyckel: 'backen',
        namn: 'Backens Alpina',
        kortnamn: 'BA',
        domaner: ['backen.test', '127.0.0.1'],
        databas: join(katalog, 'backen.db'),
        moduler: ['*'],
        swish: '1111111111',
        plats: { namn: 'Backen', lat: 62.6, lon: 17.9, hojd: 150 },
        profil: { klubb_ren: '#8cc63f' },
      },
      {
        nyckel: 'dalen',
        namn: 'Dalens SK',
        kortnamn: 'DSK',
        domaner: ['dalen.test'],
        databas: join(katalog, 'dalen.db'),
        // En liten klubb: ärenden och idéer, ingen snöläggning och ingen kiosk.
        moduler: ['arenden', 'ideer'],
        swish: '2222222222',
        plats: { namn: 'Dalsbacken', lat: 59.3, lon: 18.1, hojd: 60 },
        profil: { klubb_ren: '#2f6fb3', klubb: '#24558a' },
      },
    ],
  })
);

const BAS = 'http://127.0.0.1:8461';
let server;
let foreningar;
let db;

// fetch får inte sätta Host, så begäran går via node:http. Det är också så
// det ser ut i drift: Caddy skickar värdnamnet vidare.
const anrop = (metod, stig, { vard = 'backen.test', kaka = '', kropp } = {}) =>
  new Promise((klar, fel) => {
    const data = kropp === undefined ? null : JSON.stringify(kropp);
    const beg = request(
      {
        host: '127.0.0.1',
        port: 8461,
        path: stig,
        method: metod,
        headers: {
          'content-type': 'application/json',
          'x-hak': '1',
          host: vard,
          ...(kaka ? { cookie: kaka } : {}),
          ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
        },
      },
      (svar) => {
        let text = '';
        svar.on('data', (bit) => (text += bit));
        svar.on('end', () => {
          const typ = svar.headers['content-type'] || '';
          klar({
            status: svar.statusCode,
            kaka: (svar.headers['set-cookie'] || [])[0]?.split(';')[0] || null,
            kropp: typ.includes('json') ? JSON.parse(text || 'null') : text,
          });
        });
      }
    );
    beg.on('error', fel);
    if (data) beg.write(data);
    beg.end();
  });

const loggaIn = async (vard, anvandarnamn) => {
  const r = await anrop('POST', '/api/logga-in', { vard, kropp: { anvandarnamn, losenord: 'hemligt' } });
  assert.equal(r.status, 200, `inloggning på ${vard} gav ${r.status}`);
  return r.kaka;
};

before(async () => {
  foreningar = await import('../server/foreningar.mjs');
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { laggGrund } = await import('../server/grund.mjs');

  // Två föreningar, var sin medlem med samma användarnamn.
  for (const [nyckel, namn] of [['backen', 'Bea Backen'], ['dalen', 'Dan Dalen']]) {
    const f = foreningar.forening(nyckel);
    foreningar.korSom(f, () => {
      laggGrund({ foreningsnamn: f.namn, admin: 'admin', losenord: 'hemligt' });
      db.spara('medlem', {
        anvandarnamn: 'ordf',
        namn,
        roll: 'anlaggningsansvarig',
        kompetens: '[]',
        losenordshash: hasha('hemligt'),
      });
    });
  }
  server = (await import('../server/index.mjs')).server;
});

after(() => {
  server?.close();
  for (const sokvag of db.oppnaDatabaser()) db.stang(sokvag);
  rmSync(katalog, { recursive: true, force: true });
});

test('värdnamnet avgör vilken förening man når', async () => {
  const backen = await anrop('GET', '/halsa', { vard: 'backen.test' });
  assert.equal(backen.kropp.forening, 'backen');
  const dalen = await anrop('GET', '/halsa', { vard: 'dalen.test' });
  assert.equal(dalen.kropp.forening, 'dalen');
  // Ett okänt värdnamn hamnar hos standardföreningen.
  const okant = await anrop('GET', '/halsa', { vard: 'nagonannan.test' });
  assert.equal(okant.kropp.forening, 'backen');
});

test('plattformen beskriver sig själv olika för olika föreningar', async () => {
  const backen = await anrop('GET', '/api/plattform', { vard: 'backen.test' });
  const dalen = await anrop('GET', '/api/plattform', { vard: 'dalen.test' });

  assert.equal(backen.kropp.forening.namn, 'Backens Alpina');
  assert.equal(dalen.kropp.forening.namn, 'Dalens SK');
  assert.equal(dalen.kropp.forening.profil.klubb_ren, '#2f6fb3', 'varje förening har sina färger');
  assert.equal(backen.kropp.forening.plats.namn, 'Backen');
  assert.equal(dalen.kropp.forening.plats.namn, 'Dalsbacken');

  const modulerB = backen.kropp.moduler.map((m) => m.nyckel);
  const modulerD = dalen.kropp.moduler.map((m) => m.nyckel);
  assert.ok(modulerB.includes('snolaggning') && modulerB.includes('kiosk'));
  assert.ok(!modulerD.includes('snolaggning'), 'Dalen har ingen snöläggning');
  assert.ok(!modulerD.includes('kiosk'));
  assert.ok(modulerD.includes('arenden') && modulerD.includes('ideer'));
  // Kärnan följer alltid med.
  for (const karna of ['konto', 'forening', 'anlaggning', 'oversikt'])
    assert.ok(modulerD.includes(karna), `${karna} är kärna och ska finnas`);
});

test('en avstängd modul finns inte, ens för en inloggad', async () => {
  const kaka = await loggaIn('dalen.test', 'ordf');
  const arenden = await anrop('GET', '/api/arenden', { vard: 'dalen.test', kaka });
  assert.equal(arenden.status, 200, 'ärenden är påslaget');

  const sno = await anrop('GET', '/api/sno/nulage', { vard: 'dalen.test', kaka });
  assert.equal(sno.status, 404);
  assert.match(sno.kropp.fel, /snolaggning är inte påslagen/);

  const kiosk = await anrop('GET', '/api/fik/meny', { vard: 'dalen.test' });
  assert.equal(kiosk.status, 404, 'kioskens publika meny är också avstängd');
});

test('föreningarna delar inga medlemmar', async () => {
  const backen = await loggaIn('backen.test', 'ordf');
  const dalen = await loggaIn('dalen.test', 'ordf');

  const jagB = await anrop('GET', '/api/jag', { vard: 'backen.test', kaka: backen });
  const jagD = await anrop('GET', '/api/jag', { vard: 'dalen.test', kaka: dalen });
  assert.equal(jagB.kropp.medlem.namn, 'Bea Backen');
  assert.equal(jagD.kropp.medlem.namn, 'Dan Dalen');

  // Kakan från den ena föreningen duger inte hos den andra.
  const korsvis = await anrop('GET', '/api/jag', { vard: 'dalen.test', kaka: backen });
  assert.equal(korsvis.kropp.medlem, null, 'sessionen gäller bara sin egen förening');
});

test('det en förening skriver syns inte hos den andra', async () => {
  const backen = await loggaIn('backen.test', 'ordf');
  const dalen = await loggaIn('dalen.test', 'ordf');

  await anrop('POST', '/api/arenden', {
    vard: 'backen.test', kaka: backen,
    kropp: { titel: 'Trasig lift i Backen', prioritet: 1 },
  });
  await anrop('POST', '/api/arenden', {
    vard: 'dalen.test', kaka: dalen,
    kropp: { titel: 'Kaffebryggaren i Dalen', prioritet: 3 },
  });

  const listaB = await anrop('GET', '/api/arenden', { vard: 'backen.test', kaka: backen });
  const listaD = await anrop('GET', '/api/arenden', { vard: 'dalen.test', kaka: dalen });
  assert.deepEqual(listaB.kropp.map((a) => a.titel), ['Trasig lift i Backen']);
  assert.deepEqual(listaD.kropp.map((a) => a.titel), ['Kaffebryggaren i Dalen']);
});

test('inställningar följer föreningen, inte processen', async () => {
  const { instans } = foreningar;
  const backen = foreningar.forening('backen');
  const dalen = foreningar.forening('dalen');
  assert.equal(foreningar.korSom(backen, () => instans('swish')), '1111111111');
  assert.equal(foreningar.korSom(dalen, () => instans('swish')), '2222222222');

  const vader = await import('../server/vader.mjs');
  assert.equal(foreningar.korSom(backen, () => vader.plats().namn), 'Backen');
  assert.equal(foreningar.korSom(dalen, () => vader.plats().lat), 59.3);
});

test('en ny förening får grunden men ingen demodata', async () => {
  const ny = foreningar.skapaForening({
    nyckel: 'ny', namn: 'Nya Klubben', databas: join(katalog, 'ny.db'), moduler: ['arenden'],
  });
  const { laggGrund } = await import('../server/grund.mjs');
  const { admin } = foreningar.korSom(ny, () => laggGrund({ foreningsnamn: ny.namn }));
  assert.ok(admin.losenord, 'ett lösenord skapas en gång');

  foreningar.korSom(ny, () => {
    assert.equal(db.alla('SELECT * FROM position').length, 8, 'standardpositioner finns');
    assert.ok(db.en('SELECT * FROM sasong'), 'en säsong finns');
    assert.ok(db.alla('SELECT * FROM konto').length >= 10, 'kontoplanen finns');
    assert.equal(db.alla('SELECT * FROM utrustning').length, 0, 'ingen demodata');
    assert.equal(db.alla('SELECT * FROM medlem').length, 1, 'bara administratören');
  });

  // Att lägga grunden igen gör ingen skada.
  foreningar.korSom(ny, () => laggGrund({ foreningsnamn: ny.namn }));
  foreningar.korSom(ny, () => assert.equal(db.alla('SELECT * FROM position').length, 8));
});
