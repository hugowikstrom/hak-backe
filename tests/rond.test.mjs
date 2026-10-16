import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodstart, rondlage } from '../server/rond.mjs';

const MALLAR = [
  { id: 1, namn: 'Lans – start', intervall: 'per_pass', omfattning: 'utrustningstyp', utrustningstyp: 'lans', punkter: [{}, {}] },
  { id: 2, namn: 'Liftkontroll', intervall: 'dagligen', omfattning: 'utrustningstyp', utrustningstyp: 'lift', punkter: [{}] },
  { id: 3, namn: 'Fiket – öppning', intervall: 'dagligen', omfattning: 'omrade', omrade_id: 9, punkter: [{}] },
  { id: 4, namn: 'Veckotillsyn', intervall: 'veckovis', omfattning: 'allmant', punkter: [{}] },
];
const UTRUSTNING = [
  { id: 11, namn: 'Lans 1', typ: 'lans', aktiv: 1, status: 'drift' },
  { id: 12, namn: 'Lans 2', typ: 'lans', aktiv: 1, status: 'ur_drift' },
  { id: 13, namn: 'Stora liften', typ: 'lift', aktiv: 1, status: 'drift' },
];
const OMRADEN = [{ id: 9, namn: 'Fiket', aktiv: 1 }];

const lage = (extra = {}) =>
  rondlage({
    mallar: MALLAR, utrustning: UTRUSTNING, omraden: OMRADEN, korningar: [],
    datum: '2026-10-16', snopassStart: null, sasongStart: '2026-10-01', ...extra,
  });

test('periodstart följer intervallet', () => {
  assert.equal(periodstart({ intervall: 'dagligen', datum: '2026-10-16' }), '2026-10-16 00:00:00');
  assert.equal(periodstart({ intervall: 'veckovis', datum: '2026-10-16' }), '2026-10-12 00:00:00');
  assert.equal(periodstart({ intervall: 'sasong', datum: '2026-10-16', sasongStart: '2026-10-01' }), '2026-10-01 00:00:00');
  assert.equal(periodstart({ intervall: 'per_pass', datum: '2026-10-16', snopassStart: null }), null);
  assert.equal(periodstart({ intervall: 'per_pass', datum: '2026-10-16', snopassStart: '2026-10-15 21:30' }), '2026-10-15 21:30');
});

test('utrustning ur drift kräver ingen rond', () => {
  const r = lage({ snopassStart: '2026-10-15 21:30' });
  const lans = r.mallar.find((m) => m.mall_id === 1);
  assert.deepEqual(lans.objekt.map((o) => o.namn), ['Lans 1']);
});

test('snöläggningsronder är vilande när inget snöpass pågår', () => {
  const utan = lage().mallar.find((m) => m.mall_id === 1);
  assert.equal(utan.schemalagd, false);
  assert.equal(utan.kvar, 0);
  const med = lage({ snopassStart: '2026-10-15 21:30' }).mallar.find((m) => m.mall_id === 1);
  assert.equal(med.schemalagd, true);
  assert.equal(med.kvar, 1);
});

test('en avslutad körning i perioden räknas som klar, en äldre gör det inte', () => {
  const igar = lage({ korningar: [{ mall_id: 2, utrustning_id: 13, omrade_id: null, avslutad: '2026-10-15 08:10' }] });
  assert.equal(igar.mallar.find((m) => m.mall_id === 2).kvar, 1);

  const idag = lage({ korningar: [{ mall_id: 2, utrustning_id: 13, omrade_id: null, avslutad: '2026-10-16 07:40', av: 'Annika' }] });
  const lift = idag.mallar.find((m) => m.mall_id === 2);
  assert.equal(lift.kvar, 0);
  assert.equal(lift.klara, 1);
  assert.equal(lift.objekt[0].senast_av, 'Annika');
});

test('veckovis räknas från måndag', () => {
  const mandag = lage({ korningar: [{ mall_id: 4, utrustning_id: null, omrade_id: null, avslutad: '2026-10-12 09:00' }] });
  assert.equal(mandag.mallar.find((m) => m.mall_id === 4).kvar, 0);
  const forraVeckan = lage({ korningar: [{ mall_id: 4, utrustning_id: null, omrade_id: null, avslutad: '2026-10-11 09:00' }] });
  assert.equal(forraVeckan.mallar.find((m) => m.mall_id === 4).kvar, 1);
});

test('summan räknar alla objekt som saknas', () => {
  const r = lage();
  // dagligen: lift + fik, veckovis: allmänt. Snöläggningen är vilande.
  assert.equal(r.kvar, 3);
  assert.equal(r.mallar[0].kvar >= r.mallar.at(-1).kvar, true, 'mest kvar först');
});
