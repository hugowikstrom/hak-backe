// Feeder: ren tolkning av enhetsstatus, utan nätverk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summeraTrafik, svenskTid, tolkaEnhet, tolkaLista } from '../server/feeder.mjs';

// En fast "nu" så online och "sedan" blir deterministiska.
const NU_SEK = 1795530621;
const NU = NU_SEK * 1000;

test('byte och meddelanden summeras över timmarna Feeder lämnar', () => {
  const trafik = {
    hours: [
      { hour: '2026-11-24T15', bytes_in: 1525, bytes_out: 259, msgs_in: 8, msgs_out: 1 },
      { hour: '2026-11-24T16', bytes_in: 818, bytes_out: 0, msgs_in: 4, msgs_out: 0 },
    ],
  };
  const s = summeraTrafik(trafik);
  assert.equal(s.byte, 1525 + 259 + 818);
  assert.equal(s.meddelanden, 8 + 1 + 4);
  assert.equal(s.timmar, 2);
  // Tomt eller saknat svar ger nollor, inte undantag.
  assert.deepEqual(summeraTrafik(null), { byte: 0, meddelanden: 0, timmar: 0 });
  assert.deepEqual(summeraTrafik({ hours: [] }), { byte: 0, meddelanden: 0, timmar: 0 });
});

test('enhetslistan får online ur last_seen under 900 s', () => {
  const lista = tolkaLista(
    [
      { device_id: 'a', label: 'Stall', last_seen: NU_SEK - 100, created_at: NU_SEK - 99999, fw_version: 'v1', service_until: 0 },
      { device_id: 'b', label: null, last_seen: NU_SEK - 5000, created_at: NU_SEK - 99999, fw_version: null, service_until: 0 },
    ],
    NU
  );
  assert.equal(lista.length, 2);
  assert.equal(lista[0].online, true);
  assert.equal(lista[0].etikett, 'Stall');
  assert.equal(lista[1].online, false);
  assert.equal(lista[1].etikett, 'b', 'saknad label faller tillbaka på device_id');
  assert.equal(lista[0].service_until, null, 'service_until 0 blir null');
  assert.match(lista[0].last_seen, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('tolkaEnhet slår ihop svaren och summerar datamängd per dygn, vecka och månad', () => {
  const vy = tolkaEnhet({
    detalj: {
      device_id: 'feeder-01', label: 'Grisstall', last_seen: NU_SEK - 60,
      link: 'cell', link_via: '24001', link_rssi: 17, fw_version: 'v36', online: true, created_at: NU_SEK - 100000,
    },
    telemetri: [
      { ts: NU_SEK - 60, temperature: -3.5, humidity: 88, battery_mv: 3752, rssi: 18, power: 'battery' },
      { ts: NU_SEK - 960, temperature: -2.0, humidity: 90, battery_mv: 3702, rssi: 17, power: 'battery' },
    ],
    batteri: { state: 'mäter', mv: 3646, percent: 32, trend_mv_per_h: null, text: 'Samlar mätvärden' },
    positioner: [{ ts: NU_SEK - 99999, lat: 62.7400, lon: 18.1136, accuracy_m: 2.4, source: 'gnss' }],
    trafik_dygn: { hours: [{ bytes_in: 1525, bytes_out: 259, msgs_in: 8, msgs_out: 1 }] },
    trafik_vecka: {
      hours: [
        { bytes_in: 1525, bytes_out: 259, msgs_in: 8, msgs_out: 1 },
        { bytes_in: 800, bytes_out: 18, msgs_in: 4, msgs_out: 0 },
      ],
      month_bytes: 2602, month_budget_bytes: 4194304, overhead_note: 'Payload-byte.',
    },
    nu: NU,
  });

  assert.equal(vy.device_id, 'feeder-01');
  assert.equal(vy.etikett, 'Grisstall');
  assert.equal(vy.online, true);
  assert.equal(vy.drift, 'battery', 'drift kommer ur senaste telemetrin');
  assert.equal(vy.batteri.procent, 32);
  assert.equal(vy.batteri.mv, 3646);
  assert.equal(vy.temperatur.varde, -3.5, 'senaste temperaturen är den nyaste');
  assert.equal(vy.temperatur.fukt, 88);
  assert.equal(vy.lank.typ, 'cell');
  assert.equal(vy.lank.via, '24001');

  // Historiken vänds till äldst först så den kan ritas rakt av.
  assert.equal(vy.telemetri.length, 2);
  assert.equal(vy.telemetri[0].temperatur, -2.0);
  assert.equal(vy.telemetri.at(-1).temperatur, -3.5);

  // Datamängd.
  assert.equal(vy.datamangd.dygn_byte, 1525 + 259);
  assert.equal(vy.datamangd.vecka_byte, 1525 + 259 + 800 + 18);
  assert.equal(vy.datamangd.manad_byte, 2602);
  assert.equal(vy.datamangd.manad_budget_byte, 4194304);
  assert.equal(vy.datamangd.andel_manad, Math.round((2602 / 4194304) * 1000) / 10);
  assert.equal(vy.datamangd.overhead_note, 'Payload-byte.');

  // Position.
  assert.equal(vy.position.kalla, 'gnss');
  assert.equal(vy.position.noggrannhet, 2.4);
});

test('tom position och saknat batteriobjekt hanteras', () => {
  const vy = tolkaEnhet({
    detalj: { device_id: 'vader-backen1', label: 'Väderstation', last_seen: NU_SEK - 5000 },
    telemetri: [{ ts: NU_SEK - 5000, temperature: null, humidity: null, battery_mv: 4041, rssi: -62, power: 'battery' }],
    batteri: null,
    positioner: [],
    trafik_dygn: { hours: [{ bytes_in: 88, bytes_out: 0 }] },
    trafik_vecka: { hours: [{ bytes_in: 88, bytes_out: 0 }], month_bytes: 88, month_budget_bytes: 4194304 },
    nu: NU,
  });
  assert.equal(vy.online, false, 'detaljsvaret saknar online, härleds ur last_seen');
  assert.equal(vy.position, null);
  assert.equal(vy.temperatur, null, 'ingen temperatur rapporterad');
  // Batteriobjekt saknas men telemetrin har millivolt – de används som reserv.
  assert.equal(vy.batteri.mv, 4041);
  assert.equal(vy.batteri.procent, null);
  assert.equal(vy.datamangd.manad_byte, 88);
});

test('svenskTid ger lokal tid och null för tomma värden', () => {
  assert.equal(svenskTid(0), null);
  assert.equal(svenskTid(null), null);
  assert.match(svenskTid(NU_SEK), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});
