// Vad medlemmen ska se just nu.
//
// Ordningen mellan lägena är hela poängen med vyn: står man på pass är det
// ronderna som gäller, inte en uppmaning att boka fler pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attBoka, kvottext, lage, minuterTill, pagar } from '../server/mitt.mjs';

const NU = { datum: '2026-12-15', klocka: '21:00' };
const pass = (datum, start, slut, position = 'Snöläggning') => ({ datum, start, slut, position });

test('tiden till ett pass räknas över midnatt', () => {
  assert.equal(minuterTill(pass('2026-12-15', '22:00', '02:00'), NU), 60);
  assert.equal(minuterTill(pass('2026-12-16', '08:00', '12:00'), NU), 660);
  assert.equal(minuterTill(pass('2026-12-15', '19:00', '23:00'), NU), -120);

  // Ett nattpass som började i går kväll pågår fortfarande kl. 01:00.
  const efterMidnatt = { datum: '2026-12-16', klocka: '01:00' };
  assert.equal(pagar(pass('2026-12-15', '22:00', '02:00'), efterMidnatt), true);
  assert.equal(pagar(pass('2026-12-15', '22:00', '02:00'), { datum: '2026-12-16', klocka: '03:00' }), false);
});

test('står man på pass är det passet som gäller', () => {
  const r = lage({
    mina: [pass('2026-12-15', '20:00', '00:00')],
    forfragningar: [{ id: 1 }],
    kvot: { kvar: 8, kvot: 20 },
    nu: NU,
  });
  assert.equal(r.lage, 'pa_pass');
  assert.equal(r.pass.start, '20:00');
});

test('en timme innan passet är det passet, inte bokningslistan', () => {
  const r = lage({
    mina: [pass('2026-12-15', '22:00', '02:00')],
    kvot: { kvar: 8, kvot: 20 },
    nu: NU,
  });
  assert.equal(r.lage, 'snart_pass');
});

test('obesvarade frågor går före en uppmaning att boka', () => {
  const r = lage({
    mina: [],
    forfragningar: [{ id: 1 }],
    kvot: { kvar: 8, kvot: 20 },
    nu: NU,
  });
  assert.equal(r.lage, 'svara');
});

test('saknas timmar är det bokningen som ska fram', () => {
  const r = lage({ mina: [], kvot: { kvar: 6, kvot: 20 }, nu: NU });
  assert.equal(r.lage, 'boka');
  assert.equal(r.pass, null);

  // Har man redan bokat något visas det bredvid uppmaningen.
  const med = lage({ mina: [pass('2026-12-20', '09:00', '13:00')], kvot: { kvar: 6, kvot: 20 }, nu: NU });
  assert.equal(med.lage, 'boka');
  assert.equal(med.pass.datum, '2026-12-20');
});

test('full kvot och ett bokat pass ger ett lugnt nästa-pass', () => {
  const r = lage({ mina: [pass('2026-12-20', '09:00', '13:00')], kvot: { kvar: 0, kvot: 20 }, nu: NU });
  assert.equal(r.lage, 'nasta_pass');
});

test('den som är undantagen får ingen bokningsuppmaning', () => {
  const r = lage({ mina: [], kvot: { undantagen: true, kvar: 0, kvot: 0 }, nu: NU });
  assert.equal(r.lage, 'lugnt');
});

test('inget bokat och inget kvar är ett lugnt läge', () => {
  assert.equal(lage({ mina: [], kvot: { kvar: 0, kvot: 20 }, nu: NU }).lage, 'lugnt');
});

test('förslagen är de närmaste, och aldrig pass man redan har', () => {
  const lediga = [
    pass('2026-12-20', '09:00', '13:00'),
    pass('2026-12-16', '09:00', '13:00'),
    pass('2026-12-14', '09:00', '13:00'), // passerat
    pass('2026-12-18', '09:00', '13:00'),
    pass('2026-12-19', '09:00', '13:00'),
    pass('2026-12-21', '09:00', '13:00'),
    pass('2026-12-22', '09:00', '13:00'),
  ];
  const ut = attBoka({ lediga, mina: [pass('2026-12-18', '09:00', '13:00')], nu: NU });
  assert.deepEqual(ut.map((p) => p.datum), ['2026-12-16', '2026-12-19', '2026-12-20', '2026-12-21', '2026-12-22']);
  assert.ok(ut.length <= 5, 'en lista på fyrtio är ett register, inte en hjälp');
});

test('kvottexten säger timmar, inte procent', () => {
  assert.equal(kvottext({ kvar: 6, kvot: 20 }), '6 timmar kvar att boka av 20.');
  assert.equal(kvottext({ kvar: 2.5, kvot: 20 }), '2.5 timmar kvar att boka av 20.');
  assert.match(kvottext({ kvar: 0, kvot: 20 }), /fyllt din insats/);
  assert.equal(kvottext({ undantagen: true }), null);
});
