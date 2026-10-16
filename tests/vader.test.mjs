import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dygnssammanfattning, fonster, produktionsfonster, slaIhop, tolkaSmhi, tolkaYr } from '../server/vader.mjs';

const las = (namn) => JSON.parse(readFileSync(join(import.meta.dirname, 'data', namn), 'utf8'));
const YR = tolkaYr(las('yr.json'));
const SMHI = tolkaSmhi(las('smhi.json'));

test('båda källorna tolkas till samma form', () => {
  assert.equal(YR.length, 6);
  assert.equal(SMHI.length, 6);
  for (const serie of [YR, SMHI]) {
    assert.deepEqual(Object.keys(serie[0]).sort(), [
      'fukt', 'moln', 'nederbord', 'symbol', 'temp', 'tid', 'tryck', 'vind', 'vindriktning',
    ]);
    assert.match(serie[0].tid, /^\d{4}-\d{2}-\d{2} \d{2}:00$/);
  }
  assert.equal(YR[0].temp, -1.2);
  assert.equal(SMHI[0].temp, -0.8);
});

test('tomt eller trasigt svar ger tom serie i stället för undantag', () => {
  assert.deepEqual(tolkaYr(null), []);
  assert.deepEqual(tolkaSmhi({}), []);
  assert.deepEqual(tolkaYr({ properties: { timeseries: [{ time: 'x', data: {} }] } }), []);
});

test('källorna slås ihop till medelvärde med våtkula', () => {
  const ihop = slaIhop({ yr: YR, smhi: SMHI });
  assert.equal(ihop.length, 6);
  const f = ihop[0];
  assert.equal(f.temp, -1);
  assert.equal(Object.keys(f.kallor).length, 2);
  assert.ok(f.vatkula < f.temp, 'våtkulan ska vara lägre än lufttemperaturen');
  assert.ok(f.spridning >= 0 && f.spridning < 1, 'källorna ligger nära varandra');
  assert.equal(f.klartecken.niva, 'nej');
  assert.equal(ihop.at(-2).klartecken.niva, 'mycket_bra');
});

test('en ensam källa fungerar lika bra', () => {
  const bara = slaIhop({ yr: YR });
  assert.equal(bara.length, 6);
  assert.equal(bara[0].spridning, 0);
  assert.deepEqual(Object.keys(bara[0].kallor), ['yr']);
});

test('produktionsfönster hittar sammanhängande kyla', () => {
  const ihop = slaIhop({ yr: YR, smhi: SMHI });
  const f = produktionsfonster(ihop);
  assert.equal(f.length, 1);
  // Provdatat är i UTC; i december ligger svensk tid en timme före.
  assert.equal(f[0].fran, '2026-12-01 20:00');
  assert.equal(f[0].till, '2026-12-02 00:00');
  assert.equal(f[0].timmar, 5);
  assert.ok(f[0].lagsta < -7);
});

test('dygnssammanfattningen räknar produktionstimmar', () => {
  const d = dygnssammanfattning(slaIhop({ yr: YR, smhi: SMHI }));
  // Sista timmen faller på nästa dygn i svensk tid.
  assert.equal(d.length, 2);
  assert.equal(d[0].datum, '2026-12-01');
  assert.equal(d[0].produktionstimmar + d[1].produktionstimmar, 5);
  assert.equal(d[0].bra_timmar + d[1].bra_timmar, 4, 'våtkula under −5 °C i fyra av timmarna');
  assert.equal(d[0].tackning, 'gles', 'sex timmar är inte ett helt dygn');
  assert.ok(d[0].temp_min <= d[0].temp_max);
});

test('fönster klipper serien mot klockan', () => {
  const ihop = slaIhop({ yr: YR, smhi: SMHI });
  const nu = new Date('2026-12-01T18:30:00Z');
  assert.equal(fonster(ihop, 4, nu).length, 5);
  assert.equal(fonster(ihop, 2, nu).length, 3);
  assert.equal(fonster(ihop, 48, nu).length, 6);
});
