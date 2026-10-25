// Underhållsräkningen: när något förfaller, och vad som får flyttas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arshjul, kostnader, lage, nastaForfall, samordna, undvikBelastning,
} from '../server/underhall.mjs';

const NU = '2026-10-25';

test('kalenderintervall räknas från senaste service', () => {
  const r = nastaForfall(
    { intervalltyp: 'manader', intervall: 6, senast_utford: '2026-05-10' },
    { nu: NU }
  );
  assert.equal(r.datum, '2026-11-10', 'sex månader från 10 maj är 10 november');
  assert.equal(r.uppskattat, false);
  assert.equal(lage(r.datum, { nu: NU }), 'kommande', '16 dagar bort är inte brådskande');
  assert.equal(lage('2026-11-02', { nu: NU }), 'snart');
  // Dagen finns inte i alla månader: 31 januari plus en månad blir sista februari.
  assert.equal(
    nastaForfall({ intervalltyp: 'manader', intervall: 1, senast_utford: '2027-01-31' }, { nu: NU }).datum,
    '2027-02-28'
  );

  assert.equal(nastaForfall({ intervalltyp: 'veckor', intervall: 2, senast_utford: '2026-10-01' }, { nu: NU }).datum, '2026-10-15');
  assert.equal(lage('2026-10-15', { nu: NU }), 'forsenad');
});

test('det som aldrig gjorts förfaller nu', () => {
  const r = nastaForfall({ intervalltyp: 'dagar', intervall: 30, senast_utford: null }, { nu: NU });
  assert.equal(r.datum, NU);
  assert.equal(r.grund, 'aldrig_utford');
});

test('säsongsarbete hamnar rätt år', () => {
  // September har passerat i år, alltså nästa höst.
  assert.equal(nastaForfall({ intervalltyp: 'sasong', manad: 9 }, { nu: NU }).datum, '2027-09-01');
  // December ligger kvar i år.
  assert.equal(nastaForfall({ intervalltyp: 'sasong', manad: 12 }, { nu: NU }).datum, '2026-12-01');
  // Redan utfört i år: nästa år.
  assert.equal(
    nastaForfall({ intervalltyp: 'sasong', manad: 12, senast_utford: '2026-12-03' }, { nu: NU }).datum,
    '2027-12-01'
  );
});

test('drifttimmar ger ett uppskattat datum, aldrig ett bestämt', () => {
  const r = nastaForfall(
    { intervalltyp: 'drifttimmar', intervall: 500, senast_timmar: 1200 },
    { nu: NU, drifttimmar: 1640, timmar_per_dag: 6 }
  );
  assert.equal(r.timmar_kvar, 60);
  assert.equal(r.vid_timme, 1700);
  assert.equal(r.datum, '2026-11-04');
  assert.equal(r.uppskattat, true, 'framskrivning ska vara märkt som framskrivning');

  // Utan avläsning finns inget datum att ge – och inget påhittat heller.
  const utan = nastaForfall({ intervalltyp: 'drifttimmar', intervall: 500 }, { nu: NU });
  assert.equal(utan.datum, null);
  assert.equal(utan.grund, 'drifttimmar_saknas');
});

test('händelsestyrda kontroller har inget datum', () => {
  const r = nastaForfall({ intervalltyp: 'handelse' }, { nu: NU });
  assert.equal(r.datum, null);
  assert.equal(lage(r.datum), 'okant');
});

test('årshjulet grupperar tolv månader och tappar ingenting', () => {
  const poster = [
    { id: 1, datum: '2026-11-04', namn: 'Service kompressor' },
    { id: 2, datum: '2026-11-20', namn: 'Filterbyte' },
    { id: 3, datum: '2027-06-01', namn: 'Liftbesiktning' },
    { id: 4, datum: null, namn: 'Efter varje driftstopp' },
    { id: 5, datum: '2028-01-01', namn: 'Långt fram' },
  ];
  const { manader, utanfor } = arshjul(poster, { fran: NU });
  assert.equal(manader.length, 12);
  assert.equal(manader[0].namn, 'oktober');
  assert.equal(manader[1].poster.length, 2);
  assert.equal(manader[1].poster[0].id, 1, 'posterna ska ligga i datumordning');
  assert.equal(manader.find((m) => m.nyckel === '2027-06').poster.length, 1);
  assert.equal(utanfor.length, 2, 'både odaterat och det som ligger utanför året');
});

test('arbeten nära varandra på samma enhet föreslås samordnas', () => {
  const g = samordna([
    { id: 1, utrustning_id: 7, utrustning: 'Kompressor 1', datum: '2026-10-30' },
    { id: 2, utrustning_id: 7, utrustning: 'Kompressor 1', datum: '2026-11-05' },
    { id: 3, utrustning_id: 7, utrustning: 'Kompressor 1', datum: '2027-03-01' },
    { id: 4, utrustning_id: 9, utrustning: 'Pumpstation 1', datum: '2026-11-01' },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].utrustning, 'Kompressor 1');
  assert.deepEqual(g[0].poster.map((p) => p.id), [1, 2]);
});

test('planerat underhåll viker för sportlovet – men inte det kritiska', () => {
  const perioder = [{ namn: 'Sportlovet', fran: '2027-02-22', till: '2027-03-01' }];

  const flyttad = undvikBelastning({ namn: 'Filterbyte', datum: '2027-02-25' }, perioder, { nu: NU });
  assert.equal(flyttad.datum, '2027-02-21');
  assert.equal(flyttad.flyttad.riktning, 'tidigare');

  const kritisk = undvikBelastning(
    { namn: 'Lifttbesiktning', datum: '2027-02-25', kritisk: 1 },
    perioder,
    { nu: NU }
  );
  assert.equal(kritisk.datum, '2027-02-25', 'kritiskt underhåll flyttas inte för belastning');
  assert.equal(kritisk.flyttad, null);
  assert.match(kritisk.krock.orsak, /flyttas inte/);

  // Ligger perioden redan bakom oss får arbetet läggas efter den i stället.
  const bakat = undvikBelastning({ namn: 'Smörjning', datum: '2026-10-26' },
    [{ namn: 'Höstlov', fran: '2026-10-20', till: '2026-10-30' }], { nu: NU });
  assert.equal(bakat.datum, '2026-10-31');
  assert.equal(bakat.flyttad.riktning, 'senare');
});

test('kostnaderna delas upp i service, delar och reparationer', () => {
  const k = kostnader({
    atgarder: [{ kostnad_ore: 120000, arbetstimmar: 3 }, { kostnad_ore: 45000, arbetstimmar: 1.5 }],
    uttag: [{ antal: 2, pris_ore: 25000 }, { antal: -5, pris_ore: 25000 }],
    arenden: [{ kostnad_ore: 61500 }],
  });
  assert.equal(k.service_ore, 165000);
  assert.equal(k.delar_ore, 50000, 'inleveranser är inte en kostnad på utrustningen');
  assert.equal(k.reparation_ore, 61500);
  assert.equal(k.arbetstimmar, 4.5);
  assert.equal(k.totalt_ore, 276500);
});
