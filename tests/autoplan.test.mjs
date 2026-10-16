import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planera, spridningsmatt } from '../server/autoplan.mjs';

const RANG = { medlem: 1, backansvarig: 2, anlaggningsansvarig: 3, admin: 4 };
const POSITIONER = {
  1: { id: 1, nyckel: 'snolaggning', namn: 'Snöläggning', kravs_roll: null },
  2: { id: 2, nyckel: 'backansvarig', namn: 'Backansvarig', kravs_roll: 'backansvarig' },
};
const SASONG = { kvot_timmar: 20, kvot_nattpass: 2 };

const medlem = (id, extra = {}) => ({
  id, namn: `Medlem ${id}`, roll: 'medlem', kompetens: [], kvot_timmar: null, ...extra,
});

const nattpass = (id, datum, position_id = 1, behov = 1) => ({
  id, datum, start: '22:00', slut: '02:00', position_id, behov, bokade: 0, publicerad: 1,
});

const grund = (extra = {}) => ({
  medlemmar: [medlem(1), medlem(2), medlem(3), medlem(4)],
  befintliga: [],
  otillganglig: [],
  sasong: SASONG,
  positioner: POSITIONER,
  rang: RANG,
  tak: null,
  ...extra,
});

test('nattpass fördelas jämnt mellan medlemmarna', () => {
  const pass = Array.from({ length: 8 }, (_, i) => nattpass(i + 1, `2026-12-${String(i + 1).padStart(2, '0')}`));
  const r = planera(grund({ pass }));
  assert.equal(r.tilldelningar.length, 8);
  assert.equal(r.otillsatta.length, 0);
  const perMedlem = new Map();
  for (const t of r.tilldelningar) perMedlem.set(t.medlem_id, (perMedlem.get(t.medlem_id) || 0) + 1);
  assert.deepEqual([...perMedlem.values()].sort(), [2, 2, 2, 2]);
  assert.equal(r.spridning.natt_spann, 0);
});

test('den som redan ställt upp får mindre nytt', () => {
  const pass = Array.from({ length: 3 }, (_, i) => nattpass(i + 1, `2026-12-0${i + 1}`));
  const befintliga = Array.from({ length: 4 }, (_, i) => ({
    medlem_id: 1, pass_id: 100 + i, datum: `2026-11-0${i + 1}`, start: '22:00', slut: '02:00', position_id: 1,
  }));
  const r = planera(grund({ pass, befintliga }));
  assert.equal(r.tilldelningar.some((t) => t.medlem_id === 1), false);
});

test('otillgänglighet, kompetens och rollkrav respekteras', () => {
  const pass = [nattpass(1, '2026-12-05'), { ...nattpass(2, '2026-12-05', 2), start: '09:00', slut: '13:00' }];
  const r = planera(
    grund({
      pass,
      medlemmar: [
        medlem(1, { kompetens: ['fik'] }),                       // kan inte snöläggning
        medlem(2),                                               // otillgänglig
        medlem(3, { roll: 'backansvarig', kompetens: ['snolaggning', 'backansvarig'] }),
      ],
      otillganglig: [{ medlem_id: 2, fran: '2026-12-01', till: '2026-12-31' }],
    })
  );
  // Bara medlem 3 är behörig till båda passen, men de krockar inte i tid.
  assert.equal(r.tilldelningar.length, 2);
  assert.ok(r.tilldelningar.every((t) => t.medlem_id === 3));
});

test('krockande pass ger aldrig dubbelbokning', () => {
  const pass = [nattpass(1, '2026-12-05'), nattpass(2, '2026-12-05')];
  const r = planera(grund({ pass, medlemmar: [medlem(1)] }));
  assert.equal(r.tilldelningar.length, 1);
  assert.equal(r.otillsatta.length, 1);
  assert.match(r.otillsatta[0].orsak, /behörig/);
});

test('taket hindrar att någon lassas över kvoten', () => {
  const pass = Array.from({ length: 40 }, (_, i) => nattpass(i + 1, `2026-12-${String((i % 28) + 1).padStart(2, '0')}`, 1, 1));
  const utan = planera(grund({ pass }));
  const med = planera(grund({ pass, tak: 1 }));
  assert.ok(med.tilldelningar.length < utan.tilldelningar.length);
  for (const e of med.efter) assert.ok(e.timmar <= e.kvot, `${e.namn} fick ${e.timmar} h av ${e.kvot}`);
  assert.ok(med.otillsatta.some((o) => /kvottaket/.test(o.orsak)));
});

test('medlem med kvot 0 planeras inte in', () => {
  const pass = [nattpass(1, '2026-12-05')];
  const r = planera(grund({ pass, medlemmar: [medlem(1, { kvot_timmar: 0 }), medlem(2)] }));
  assert.equal(r.tilldelningar[0].medlem_id, 2);
});

test('spridningsmått mäter ojämnhet', () => {
  const jamnt = spridningsmatt([
    { timmar: 10, kvot: 20, natt: 1, helg: 1 },
    { timmar: 10, kvot: 20, natt: 1, helg: 1 },
  ]);
  assert.equal(jamnt.andel_std, 0);
  const ojamnt = spridningsmatt([
    { timmar: 20, kvot: 20, natt: 4, helg: 0 },
    { timmar: 0, kvot: 20, natt: 0, helg: 3 },
  ]);
  assert.ok(ojamnt.andel_std > 0.4);
  assert.equal(ojamnt.natt_spann, 4);
  assert.equal(ojamnt.helg_spann, 3);
});
