import { test } from 'node:test';
import assert from 'node:assert/strict';
import { klartecken, kompletteraMatning, wetbulb } from '../server/snoteknik.mjs';

test('wetbulb räknas ur temperatur och fuktighet', () => {
  // Psykrometerekvationen, jämförd med gängse wetbulbtabeller för snöläggning.
  assert.equal(wetbulb(-5, 50), -7.2);
  assert.equal(wetbulb(0, 100), 0);
  assert.equal(wetbulb(-10, 40), -12);
  assert.equal(wetbulb(-8, 60), -9.5);
  assert.equal(wetbulb(null, 50), null);
  assert.equal(wetbulb(-5, null), null);
});

test('mättad luft ger wetbulb lika med lufttemperaturen', () => {
  for (const t of [-12, -6, -2, 0]) assert.ok(Math.abs(wetbulb(t, 100) - t) <= 0.1);
});

test('wetbulbn är monoton i både fukt och temperatur', () => {
  const fuktserie = [1, 20, 40, 60, 80, 100].map((f) => wetbulb(-5, f));
  for (let i = 1; i < fuktserie.length; i++) assert.ok(fuktserie[i] > fuktserie[i - 1]);
  const tempserie = [-15, -10, -5, 0, 3].map((t) => wetbulb(t, 60));
  for (let i = 1; i < tempserie.length; i++) assert.ok(tempserie[i] > tempserie[i - 1]);
});

test('fuktighet utanför skalan kapas i stället för att ge NaN', () => {
  assert.ok(Number.isFinite(wetbulb(-5, 0)));
  assert.ok(Number.isFinite(wetbulb(-5, 180)));
  assert.equal(wetbulb(-5, 180), wetbulb(-5, 100));
});

test('klartecknet följer wetbulbn', () => {
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

test('mätning utan rapporterad wetbulb får en framräknad', () => {
  const m = kompletteraMatning({ lufttemp: -6, luftfukt: 60 });
  assert.equal(m.wetbulb_beraknad, true);
  assert.equal(m.wetbulb, wetbulb(-6, 60));
  const r = kompletteraMatning({ lufttemp: -6, luftfukt: 60, wetbulb: -9 });
  assert.equal(r.wetbulb_beraknad, false);
  assert.equal(r.wetbulb, -9);
});
