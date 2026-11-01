import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kronor, normaliseraMobil, summa, tillOre } from '../server/pengar.mjs';

test('belopp skrivs som kronor med tusenmellanrum', () => {
  assert.equal(kronor(4500), '45 kr');
  // toLocaleString skiljer tusental med hårt mellanslag, så beloppet inte bryts.
  assert.equal(kronor(209500), '2\u00a0095 kr');
  assert.equal(kronor(0), '0 kr');
  assert.equal(kronor(null), '–');
  // Ören skrivs alltid med två decimaler; jämna kronor utan.
  assert.equal(kronor(4550), '45,50 kr');
  assert.equal(kronor(9780), '97,80 kr');
  assert.equal(kronor(-9780), '\u221297,80 kr');
});

test('kronor till ören blir heltal', () => {
  assert.equal(tillOre('45.50'), 4550);
  assert.equal(tillOre(270), 27000);
  assert.equal(tillOre('0.1'), 10);
});

test('ordersumman räknar antal', () => {
  assert.equal(summa([{ styckpris_ore: 3000, antal: 2 }, { styckpris_ore: 2500, antal: 1 }]), 8500);
  assert.equal(summa([]), 0);
});

test('mobilnummer normaliseras till +46-form', () => {
  assert.equal(normaliseraMobil('070-123 45 67'), '+46701234567');
  assert.equal(normaliseraMobil('0701234567'), '+46701234567');
  assert.equal(normaliseraMobil('+46701234567'), '+46701234567');
  assert.equal(normaliseraMobil('0046701234567'), '+46701234567');
  assert.equal(normaliseraMobil('46701234567'), '+46701234567');
  assert.equal(normaliseraMobil('(070) 123-4567'), '+46701234567');
});

test('skräp ger null i stället för ett påhittat nummer', () => {
  for (const x of ['abc', '', null, '12', '070-123 45 67 89 01 23']) assert.equal(normaliseraMobil(x), null);
});
