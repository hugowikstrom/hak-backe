import { test } from 'node:test';
import assert from 'node:assert/strict';
import { klartecken, kompletteraMatning, vatkula } from '../server/snoteknik.mjs';

test('våtkula räknas ur temperatur och fuktighet', () => {
  // Psykrometerekvationen, jämförd med gängse våtkulatabeller för snöläggning.
  assert.equal(vatkula(-5, 50), -7.2);
  assert.equal(vatkula(0, 100), 0);
  assert.equal(vatkula(-10, 40), -12);
  assert.equal(vatkula(-8, 60), -9.5);
  assert.equal(vatkula(null, 50), null);
  assert.equal(vatkula(-5, null), null);
});

test('mättad luft ger våtkula lika med lufttemperaturen', () => {
  for (const t of [-12, -6, -2, 0]) assert.ok(Math.abs(vatkula(t, 100) - t) <= 0.1);
});

test('våtkulan är monoton i både fukt och temperatur', () => {
  const fuktserie = [1, 20, 40, 60, 80, 100].map((f) => vatkula(-5, f));
  for (let i = 1; i < fuktserie.length; i++) assert.ok(fuktserie[i] > fuktserie[i - 1]);
  const tempserie = [-15, -10, -5, 0, 3].map((t) => vatkula(t, 60));
  for (let i = 1; i < tempserie.length; i++) assert.ok(tempserie[i] > tempserie[i - 1]);
});

test('fuktighet utanför skalan kapas i stället för att ge NaN', () => {
  assert.ok(Number.isFinite(vatkula(-5, 0)));
  assert.ok(Number.isFinite(vatkula(-5, 180)));
  assert.equal(vatkula(-5, 180), vatkula(-5, 100));
});

test('klartecknet följer våtkulan', () => {
  assert.equal(klartecken(-12).niva, 'utmarkt');
  assert.equal(klartecken(-8).niva, 'mycket_bra');
  assert.equal(klartecken(-6).niva, 'bra');
  assert.equal(klartecken(-4).niva, 'ok');
  assert.equal(klartecken(-3).niva, 'marginellt');
  assert.equal(klartecken(-1).niva, 'nej');
  assert.equal(klartecken(null).niva, 'okant');
  assert.equal(klartecken(-1).vatten, 0);
  assert.equal(klartecken(-12).vatten, 100);
});

test('mätning utan rapporterad våtkula får en framräknad', () => {
  const m = kompletteraMatning({ lufttemp: -6, luftfukt: 60 });
  assert.equal(m.vatkula_beraknad, true);
  assert.equal(m.vatkula, vatkula(-6, 60));
  const r = kompletteraMatning({ lufttemp: -6, luftfukt: 60, vatkula: -9 });
  assert.equal(r.vatkula_beraknad, false);
  assert.equal(r.vatkula, -9);
});
