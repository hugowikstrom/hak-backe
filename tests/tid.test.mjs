import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arHelg, datumspann, passSlag, passTimmar, plusDagar, veckodag, veckonummer } from '../server/tid.mjs';

test('pass över midnatt räknas rätt', () => {
  assert.equal(passTimmar('22:00', '02:00'), 4);
  assert.equal(passTimmar('17:00', '21:00'), 4);
  assert.equal(passTimmar('09:30', '13:30'), 4);
  assert.equal(passTimmar('23:30', '00:00'), 0.5);
});

test('passets slag avgörs av starttid och midnattspassage', () => {
  assert.equal(passSlag('22:00', '02:00'), 'natt');
  assert.equal(passSlag('04:00', '08:00'), 'natt');
  assert.equal(passSlag('17:00', '21:00'), 'kvall');
  assert.equal(passSlag('09:00', '13:00'), 'dag');
  assert.equal(passSlag('14:00', '13:00'), 'natt', 'passet går över midnatt');
});

test('helg och veckodag räknas från måndag', () => {
  assert.equal(veckodag('2026-10-12'), 0);
  assert.equal(veckodag('2026-10-18'), 6);
  assert.equal(arHelg('2026-10-16'), false);
  assert.equal(arHelg('2026-10-17'), true);
  assert.equal(arHelg('2026-10-18'), true);
});

test('veckonummer och datumspann', () => {
  assert.equal(veckonummer('2026-01-01'), 1);
  assert.equal(veckonummer('2026-10-16'), 42);
  assert.equal(plusDagar('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(datumspann('2026-10-16', '2026-10-18'), ['2026-10-16', '2026-10-17', '2026-10-18']);
});
