// Vem som får frågan om ett snöläggningspass, och hur fönster blir pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kandidater, lage, passUrFonster } from '../server/snoplan.mjs';

const RANG = { medlem: 1, volontar: 1, tranare: 2, backansvarig: 3, anlaggningsansvarig: 4, admin: 5 };
const POSITIONER = { 1: { nyckel: 'snolaggning', kravs_roll: null } };
const PASS = { id: 10, datum: '2026-12-15', start: '22:00', slut: '02:00', position_id: 1, behov: 2, slag: 'natt' };

const MEDLEMMAR = [
  { id: 1, namn: 'Alva', roll: 'medlem', kompetens: [] },
  { id: 2, namn: 'Bosse', roll: 'medlem', kompetens: [] },
  { id: 3, namn: 'Cia', roll: 'medlem', kompetens: [] },
  { id: 4, namn: 'David', roll: 'medlem', kompetens: [] },
];

test('den som vill arbeta får frågan först', () => {
  const k = kandidater({
    pass: PASS,
    medlemmar: MEDLEMMAR,
    positioner: POSITIONER,
    rang: RANG,
    tillganglighet: [
      { medlem_id: 1, niva: 'kanske', nattpass: 1, helger: 1 },
      { medlem_id: 2, niva: 'garna', nattpass: 1, helger: 1 },
      { medlem_id: 3, niva: 'vid_brist', nattpass: 1, helger: 1 },
      { medlem_id: 4, niva: 'nej', nattpass: 1, helger: 1 },
    ],
  });
  assert.deepEqual(k.filter((x) => x.kan).map((x) => x.medlem.namn), ['Bosse', 'Alva', 'Cia']);
  assert.equal(k.find((x) => x.medlem.id === 2).omgang, 1);
  assert.equal(k.find((x) => x.medlem.id === 3).omgang, 2, 'reserver frågas i andra omgången');
  const david = k.find((x) => x.medlem.id === 4);
  assert.equal(david.kan, false);
  assert.match(david.hinder[0], /inte tillgänglig/);
});

test('barn tillfrågas inte om arbetspass, och aldrig om nattpass', () => {
  const barn = [
    { id: 10, namn: 'Alma', roll: 'medlem', kompetens: [], fodelsedatum: '2015-02-20' },
    { id: 11, namn: 'Agnes', roll: 'medlem', kompetens: [], fodelsedatum: '2009-10-21' },
    { id: 12, namn: 'Vuxen', roll: 'medlem', kompetens: [], fodelsedatum: '1990-01-01' },
  ];
  const vill = barn.map((m) => ({ medlem_id: m.id, niva: 'garna', nattpass: 1, helger: 1 }));

  const natt = kandidater({ pass: PASS, medlemmar: barn, positioner: POSITIONER, rang: RANG, tillganglighet: vill });
  assert.deepEqual(natt.filter((x) => x.kan).map((x) => x.medlem.namn), ['Vuxen']);
  // Agnes är 17 på passdagen: gammal nog för dagpass, inte för natt.
  assert.match(natt.find((x) => x.medlem.id === 11).hinder[0], /18 år/);
  assert.match(natt.find((x) => x.medlem.id === 10).hinder[0], /18 år/);

  const dag = kandidater({
    pass: { ...PASS, start: '09:00', slut: '15:00', slag: 'dag' },
    medlemmar: barn, positioner: POSITIONER, rang: RANG, tillganglighet: vill,
  });
  assert.deepEqual(dag.filter((x) => x.kan).map((x) => x.medlem.namn), ['Agnes', 'Vuxen']);
  assert.match(dag.find((x) => x.medlem.id === 10).hinder[0], /16 år/);
});

test('prioritet går aldrig före krav', () => {
  const k = kandidater({
    pass: { ...PASS, position_id: 2 },
    medlemmar: MEDLEMMAR,
    positioner: { 2: { nyckel: 'backansvarig', kravs_roll: 'backansvarig' } },
    rang: RANG,
    tillganglighet: [{ medlem_id: 1, niva: 'garna', nattpass: 1, helger: 1 }],
  });
  // Alva vill gärna, men saknar behörigheten. Då står hon inte i listan.
  assert.equal(k.filter((x) => x.kan).length, 0);
  assert.match(k.find((x) => x.medlem.id === 1).hinder[0], /behörighet/);
});

test('otillgänglighet, krock och nattpassnekande utesluter', () => {
  const k = kandidater({
    pass: PASS,
    // David har inte svarat på säsongsfrågan och räknas som "vid behov":
    // den som inte sagt något ska fortfarande kunna få frågan.
    medlemmar: MEDLEMMAR,
    positioner: POSITIONER,
    rang: RANG,
    tillganglighet: [
      { medlem_id: 1, niva: 'garna', nattpass: 0, helger: 1 },
      { medlem_id: 2, niva: 'garna', nattpass: 1, helger: 1 },
      { medlem_id: 3, niva: 'garna', nattpass: 1, helger: 1 },
    ],
    otillganglig: [{ medlem_id: 2, fran: '2026-12-10', till: '2026-12-20' }],
    bokningar: [{ medlem_id: 3, pass_id: 99, datum: '2026-12-15', start: '20:00', slut: '23:00' }],
  });
  const kan = k.filter((x) => x.kan).map((x) => x.medlem.namn);
  assert.deepEqual(kan, ['David'], 'de tre som svarat har var sitt hinder');
  assert.match(k.find((x) => x.medlem.id === 1).hinder[0], /nattpass/);
  assert.match(k.find((x) => x.medlem.id === 2).hinder[0], /otillgänglig/);
  assert.match(k.find((x) => x.medlem.id === 3).hinder[0], /krockande/);
});

test('den som redan tagit många nattpass frågas sist', () => {
  const k = kandidater({
    pass: PASS,
    medlemmar: MEDLEMMAR.slice(0, 3),
    positioner: POSITIONER,
    rang: RANG,
    tillganglighet: [
      { medlem_id: 1, niva: 'garna', nattpass: 1, helger: 1 },
      { medlem_id: 2, niva: 'garna', nattpass: 1, helger: 1 },
      { medlem_id: 3, niva: 'garna', nattpass: 1, helger: 1 },
    ],
    insatser: { 1: { timmar: 20, natt: 4 }, 2: { timmar: 30, natt: 1 }, 3: { timmar: 2, natt: 0 } },
  });
  assert.deepEqual(k.filter((x) => x.kan).map((x) => x.medlem.namn), ['Cia', 'Bosse', 'Alva']);
});

test('en skickad förfrågan är inte bemanning', () => {
  const l = lage(PASS, {
    bokningar: [{ pass_id: 10, status: 'bokad' }, { pass_id: 10, status: 'avbokad' }],
    forfragningar: [{ pass_id: 10, status: 'skickad' }, { pass_id: 10, status: 'avbojd' }],
  });
  assert.equal(l.bokade, 1);
  assert.equal(l.saknas, 1);
  assert.equal(l.vantar, 1);
  assert.equal(l.oadresserat, 0, 'den som redan fått frågan räknas som adresserad');
  assert.equal(l.fullt, false);

  const utan = lage(PASS, { bokningar: [{ pass_id: 10, status: 'bokad' }] });
  assert.equal(utan.oadresserat, 1, 'ett underskott ingen frågat om ska larma');
});

test('ett långt produktionsfönster blir flera pass', () => {
  const pass = passUrFonster({ fran: '2026-12-15 20:00', till: '2026-12-16 08:00' }, { passlangd: 6 });
  assert.equal(pass.length, 2);
  assert.equal(pass[0].start, '20:00');
  assert.equal(pass[0].slut, '02:00');
  assert.equal(pass[0].slag, 'kvall');
  assert.equal(pass[1].datum, '2026-12-16', 'passet efter midnatt hör till nästa dag');
  assert.equal(pass[1].slag, 'natt');

  // Ett kort fönster blir ett pass, inte två stympade.
  const kort = passUrFonster({ fran: '2026-12-15 23:00', till: '2026-12-16 04:00' }, { passlangd: 6 });
  assert.equal(kort.length, 1);
  assert.equal(kort[0].timmar, 5);
  assert.equal(passUrFonster({ fran: '2026-12-15 23:00', till: '2026-12-15 23:00' }).length, 0);
});
