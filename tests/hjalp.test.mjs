// Hjälpen: filmlistan och att det går att spola i en film.
//
// Byteintervallen är det som provas hårdast. Utan dem laddar webbläsaren
// hem hela filen för att hoppa till minut tre, och i en backe med dålig
// täckning är det skillnaden mellan att titta och att låta bli.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-hjalp-'));
const filmer = join(katalog, 'film');
mkdirSync(filmer, { recursive: true });

// En "film" på tusen byte räcker för att prova intervallen. Innehållet är
// löpande siffror, så att varje byte går att känna igen på sin plats.
const INNEHALL = Buffer.from(
  Array.from({ length: 1000 }, (_, i) => String(i % 10)).join(''),
  'utf8'
);
writeFileSync(join(filmer, 'medlem.mp4'), INNEHALL);
writeFileSync(join(filmer, 'medlem.jpg'), Buffer.from('affisch'));
// fiket.mp4 lämnas med flit obefintlig: en film som inte finns ska inte
// listas, även om den står i katalogen.

process.env.HAK_DB = join(katalog, 'test.db');
process.env.HAK_FILMKATALOG = filmer;
process.env.HAK_PORT = '8471';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';

const BAS = 'http://127.0.0.1:8471';
let server;
let db;
let kaka = '';

const anrop = async (metod, stig, extra = {}) => {
  const r = await fetch(BAS + stig, {
    method: metod,
    headers: { 'content-type': 'application/json', 'x-hak': '1', ...(kaka ? { cookie: kaka } : {}), ...(extra.headers || {}) },
    body: extra.kropp === undefined ? undefined : JSON.stringify(extra.kropp),
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) kaka = sc[0].split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return {
    status: r.status,
    huvuden: r.headers,
    kropp: typ.includes('json') ? await r.json() : await r.text(),
  };
};

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  db.spara('medlem', {
    anvandarnamn: 'ida', namn: 'Ida Idasson', roll: 'medlem', epost: 'ida@test',
    losenordshash: hasha('hemligt'), kompetens: '[]',
  });
  await anrop('POST', '/api/logga-in', { kropp: { anvandarnamn: 'ida', losenord: 'hemligt' } });
});

after(() => {
  server?.close();
  db?.stang?.();
  rmSync(katalog, { recursive: true, force: true });
});

test('hjälpen listar bara filmer som finns på disk', async () => {
  const r = await anrop('GET', '/api/hjalp');
  assert.equal(r.status, 200);
  const nycklar = r.kropp.filmer.map((f) => f.nyckel);
  assert.deepEqual(nycklar, ['medlem'], 'bara den film som ligger där ska listas');
  const f = r.kropp.filmer[0];
  assert.equal(f.storlek, 1000);
  assert.equal(f.film, '/api/hjalp/film/medlem');
  assert.equal(f.affisch, '/api/hjalp/affisch/medlem');
  assert.ok(f.titel && f.beskrivning && f.for, 'katalogtexten ska följa med');
});

test('hela filmen svarar 200 och säger att den tar intervall', async () => {
  const r = await anrop('GET', '/api/hjalp/film/medlem');
  assert.equal(r.status, 200);
  assert.equal(r.huvuden.get('accept-ranges'), 'bytes');
  assert.equal(r.huvuden.get('content-length'), '1000');
  assert.equal(r.huvuden.get('content-type'), 'video/mp4');
  assert.equal(r.kropp.length, 1000);
});

test('ett byteintervall svarar 206 med rätt bitar', async () => {
  const r = await anrop('GET', '/api/hjalp/film/medlem', { headers: { Range: 'bytes=10-19' } });
  assert.equal(r.status, 206);
  assert.equal(r.huvuden.get('content-range'), 'bytes 10-19/1000');
  assert.equal(r.huvuden.get('content-length'), '10');
  assert.equal(r.kropp, INNEHALL.subarray(10, 20).toString());
});

test('öppet slut ger resten av filen', async () => {
  const r = await anrop('GET', '/api/hjalp/film/medlem', { headers: { Range: 'bytes=990-' } });
  assert.equal(r.status, 206);
  assert.equal(r.huvuden.get('content-range'), 'bytes 990-999/1000');
  assert.equal(r.kropp, INNEHALL.subarray(990).toString());
});

test('"bytes=-50" betyder de sista femtio, inte de första', async () => {
  const r = await anrop('GET', '/api/hjalp/film/medlem', { headers: { Range: 'bytes=-50' } });
  assert.equal(r.status, 206);
  assert.equal(r.huvuden.get('content-range'), 'bytes 950-999/1000');
  assert.equal(r.kropp, INNEHALL.subarray(950).toString());
});

test('ett intervall utanför filen avvisas med 416', async () => {
  const r = await anrop('GET', '/api/hjalp/film/medlem', { headers: { Range: 'bytes=5000-6000' } });
  assert.equal(r.status, 416);
  assert.equal(r.huvuden.get('content-range'), 'bytes */1000');
});

test('en film som inte finns ger 404, inte ett trasigt svar', async () => {
  const r = await anrop('GET', '/api/hjalp/film/fiket');
  assert.equal(r.status, 404);
});

test('hjälpen kräver inloggning', async () => {
  const utan = await fetch(`${BAS}/api/hjalp`);
  assert.equal(utan.status, 401);
});
