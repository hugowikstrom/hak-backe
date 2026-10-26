// Innehållskartan och reservdelarna.
//
// Båda är regler och inte modell, med flit. En karta som stämmer varje
// gång är mer värd än en som är kvick ibland, och ett artikelnummer som
// blivit en siffra fel ger fel del i lådan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { innehallskarta, reservdelarUrText, sokIText } from '../server/dokument.mjs';

const SIDOR = [
  'SNOKRAFT FK-200 FLAKTKANON\nTekniska data\nVattenflode: 2,5-11 l/s\nEffekt: 22 kW',
  'Sakerhetsforeskrifter\nVarning: hogt tryck. Skyddsutrustning kravs.',
  '4. Underhall\n4.1 Byt vattenfilter var 500 driftstimmar.\n4.2 Smorj lagret var tredje manad.',
  '5. Serviceintervall\nVar 50 driftstimmar: kontrollera filter\nVar 500 driftstimmar: byt filter',
  'Felsokning\nKanonen startar inte -> kontrollera jordfelsbrytaren',
  'Reservdelslista\nArt.nr      Benamning                 Antal\nSF-90       Vattenfilter komplett     1\nHV-22       Vattenventil 2 tum        1\nHB-15       Backventil                2',
  'Reservdelslista forts.\nLN-BP-6     Brytpinne                 10\nSK-4411     Oscillationsmotor         1',
  'Sprangskiss\nPos.nr hanvisar till reservdelslistan',
  'Elschema\nKopplingsschema huvudmotor och nukleatorer',
];

test('innehållskartan säger vilka sidor som är vad', () => {
  const k = innehallskarta(SIDOR);
  const text = k.map((a) => `${a.slag}:${a.fran}${a.till > a.fran ? `-${a.till}` : ''}`);
  assert.deepEqual(text, [
    'tekniska_data:1',
    'sakerhet:2',
    'underhall:3',
    'serviceintervall:4',
    'felsokning:5',
    'reservdelslista:6-7',
    'sprangskiss:8',
    'elschema:9',
  ]);
  // Angränsande sidor av samma sort slås ihop till ett avsnitt.
  const delar = k.find((a) => a.slag === 'reservdelslista');
  assert.equal(delar.fran, 6);
  assert.equal(delar.till, 7);
  assert.equal(delar.namn, 'Reservdelslista');
});

test('en sida utan igenkänd rubrik hamnar inte i kartan', () => {
  const k = innehallskarta(['Inledning', 'Tack for att du valde FK-200.']);
  assert.deepEqual(k, []);
});

test('artikelnumren läses ordagrant, inte ungefär', () => {
  const delar = reservdelarUrText(SIDOR[5] + '\n' + SIDOR[6]);
  assert.deepEqual(delar, [
    { artikelnummer: 'SF-90', namn: 'Vattenfilter komplett' },
    { artikelnummer: 'HV-22', namn: 'Vattenventil 2 tum' },
    { artikelnummer: 'HB-15', namn: 'Backventil' },
    { artikelnummer: 'LN-BP-6', namn: 'Brytpinne' },
    { artikelnummer: 'SK-4411', namn: 'Oscillationsmotor' },
  ]);
});

test('benämningen kan stå först, och dubbletter räknas en gång', () => {
  const delar = reservdelarUrText(
    ['Vattenfilter komplett   SF-90', 'Backventil 2 tum   HB-15', 'Vattenfilter igen   SF-90'].join('\n')
  );
  assert.deepEqual(delar.map((d) => d.artikelnummer), ['SF-90', 'HB-15']);
  assert.equal(delar[0].namn, 'Vattenfilter komplett');
});

test('årtal och mått är inte artikelnummer', () => {
  const delar = reservdelarUrText(
    ['Utgava 2026', 'Slanglangd 2500mm', 'Arbetstryck 25bar', 'Packning HK-40P'].join('\n')
  );
  assert.deepEqual(delar.map((d) => d.artikelnummer), ['HK-40P']);
});

test('sökningen pekar ut sidan och visar sammanhanget', () => {
  const traffar = sokIText(SIDOR.join('\f'), 'brytpinne');
  assert.equal(traffar.length, 1);
  assert.equal(traffar[0].sida, 7);
  assert.match(traffar[0].utdrag, /LN-BP-6/);
  // Kortare än två tecken fångas av anroparen, inte här.
  assert.deepEqual(sokIText(SIDOR.join('\f'), 'zebrafisk'), []);
});
