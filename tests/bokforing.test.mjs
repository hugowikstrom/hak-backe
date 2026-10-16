// Bokföringen prövas mot en egen databas – inga spår i den riktiga.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-bok-'));
process.env.HAK_DB = join(katalog, 'bok.db');

let b;
let db;

before(async () => {
  b = await import('../server/bokforing.mjs');
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  db.spara('medlem', {
    anvandarnamn: 'jonas', namn: 'Jonas Lindqvist', roll: 'anlaggningsansvarig',
    losenordshash: hasha('x'), kompetens: '[]',
  });
  b.sakerstallKontoplan();
});
after(() => {
  db.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

const av = { id: 1, namn: 'Jonas Lindqvist' };

test('kontoplanen läggs upp en gång', () => {
  const forst = b.kontoplan().length;
  b.sakerstallKontoplan();
  assert.equal(b.kontoplan().length, forst);
  assert.ok(forst >= 10);
});

test('en försäljning bokförs med betalkonto mot intäktskonto', () => {
  const v = b.bokforForsaljning({
    serie: 'K', datum: '2026-12-01', beskrivning: 'Kioskorder K1', motpart: '+46701234567',
    belopp_ore: 4500, intaktskonto: '3010', betalmedel: 'swish', referens_slag: 'order', referens_id: 1, av,
  });
  assert.equal(v.serie, 'K');
  assert.equal(v.nummer, 1);
  assert.equal(v.belopp_ore, 4500);
  assert.equal(v.skapad_av, 'Jonas Lindqvist');
  assert.equal(v.rader.length, 2);
  assert.equal(v.rader.find((r) => r.konto === '1930').debet_ore, 4500);
  assert.equal(v.rader.find((r) => r.konto === '3010').kredit_ore, 4500);
});

test('moms bryts ut när föreningen är momsregistrerad', () => {
  const v = b.bokforForsaljning({
    serie: 'K', datum: '2026-12-01', beskrivning: 'Kioskorder med moms',
    belopp_ore: 11200, intaktskonto: '3010', momssats: 0.12, betalmedel: 'kontant', av,
  });
  const netto = v.rader.find((r) => r.konto === '3010').kredit_ore;
  const moms = v.rader.find((r) => r.konto === '2621').kredit_ore;
  assert.equal(netto + moms, 11200);
  assert.equal(moms, 11200 - Math.round(11200 / 1.12));
  assert.equal(v.rader.find((r) => r.konto === '1910').debet_ore, 11200);
});

test('nummerserien är obruten per serie och år', () => {
  const ett = b.bokforForsaljning({ serie: 'U', datum: '2026-12-01', beskrivning: 'Hyra 1', belopp_ore: 22000, intaktskonto: '3020', av });
  const tva = b.bokforForsaljning({ serie: 'U', datum: '2026-12-02', beskrivning: 'Hyra 2', belopp_ore: 17000, intaktskonto: '3020', av });
  assert.equal(ett.nummer, 1);
  assert.equal(tva.nummer, 2);
  // Egen serie räknas för sig.
  assert.equal(b.nastaNummer('U', 2026), 3);
  assert.equal(b.nastaNummer('M', 2026), 1);
});

test('en verifikation som inte balanserar vägras', () => {
  assert.throws(
    () =>
      b.bokfor({
        serie: 'D', datum: '2026-12-01', beskrivning: 'Skev',
        rader: [{ konto: '1910', debet_ore: 1000 }, { konto: '3010', kredit_ore: 900 }],
      }),
    /balanserar inte/
  );
});

test('okänt konto vägras', () => {
  assert.throws(
    () =>
      b.bokfor({
        serie: 'D', datum: '2026-12-01', beskrivning: 'Fel konto',
        rader: [{ konto: '9999', debet_ore: 100 }, { konto: '3010', kredit_ore: 100 }],
      }),
    /finns inte i kontoplanen/
  );
});

test('bokförda verifikationer går inte att ändra eller ta bort', () => {
  const v = b.bokforForsaljning({ serie: 'D', datum: '2026-12-01', beskrivning: 'Orörbar', belopp_ore: 5000, intaktskonto: '3990', av });
  assert.throws(() => db.kor('UPDATE verifikation SET beskrivning=? WHERE id=?', 'ändrad', v.id), /får inte ändras/);
  assert.throws(() => db.kor('DELETE FROM verifikation WHERE id=?', v.id), /får inte tas bort/);
  assert.throws(() => db.kor('UPDATE verifikationsrad SET debet_ore=0 WHERE verifikation_id=?', v.id), /får inte ändras/);
  assert.equal(b.hamta(v.id).beskrivning, 'Orörbar');
});

test('fel rättas med en motbokning som pekar på originalet', () => {
  const fel = b.bokforForsaljning({ serie: 'D', datum: '2026-12-01', beskrivning: 'Dubbelslagen order', belopp_ore: 3000, intaktskonto: '3010', betalmedel: 'kontant', av });
  const rattelse = b.bokforRattelse({ verifikation_id: fel.id, anledning: 'Slogs in två gånger', av });
  assert.equal(rattelse.rattar_id, fel.id);
  assert.match(rattelse.beskrivning, /Rättelse av D/);
  // Sidorna är omvända och summan noll tillsammans med originalet.
  assert.equal(rattelse.rader.find((r) => r.konto === '1910').kredit_ore, 3000);
  assert.equal(rattelse.rader.find((r) => r.konto === '3010').debet_ore, 3000);
  assert.throws(() => b.bokforRattelse({ verifikation_id: fel.id, av }), /redan rättad/);
});

test('dagsrapporten summerar intäkter och betalmedel', () => {
  const r = b.dagsrapport('2026-12-01');
  assert.ok(r.verifikationer >= 4);
  assert.ok(r.summa_ore > 0);
  assert.ok(r.betalmedel.some((m) => m.medel === 'swish'));
  assert.ok(r.intakter.some((i) => i.konto === '3010'));
});

test('SIE-filen innehåller verifikationer och konton', () => {
  const sie = b.sie4({ fran: '2026-12-01', till: '2026-12-31', foretag: 'Härnösands Alpina Klubb', orgnr: '802000-0000' });
  assert.match(sie, /#FLAGGA 0/);
  assert.match(sie, /#SIETYP 4/);
  assert.match(sie, /#ORGNR 802000-0000/);
  assert.match(sie, /#KONTO 3010 "Kioskförsäljning"/);
  assert.match(sie, /#KTYP 1930 T/);
  assert.match(sie, /#VER "K" "1" 20261201/);
  assert.match(sie, /#TRANS 1930 \{\} 45\.00/);
  assert.match(sie, /#TRANS 3010 \{\} -45\.00/);
  // Varje verifikation omges av klamrar.
  assert.equal((sie.match(/\{\r\n/g) || []).length, (sie.match(/\}\r\n/g) || []).length);
});

test('SIE-filen kodas i PC8 som formatet kräver', () => {
  const bytes = b.sieKodning('Härnösands Alpina – kioskförsäljning');
  assert.equal(bytes[1], 132, 'ä ska bli byte 132 i CP437');
  assert.equal(bytes[4], 148, 'ö ska bli byte 148');
  assert.equal(bytes.toString('latin1').includes('Alpina'), true);
});

test('behandlingshistoriken är orörbar', () => {
  b.revidera({ medlem: av, handelse: 'kvitterade betalning', objekt: 'K1', detalj: { belopp_ore: 4500 } });
  const rad = b.revisionslogg({ antal: 1 })[0];
  assert.equal(rad.namn, 'Jonas Lindqvist');
  assert.equal(rad.handelse, 'kvitterade betalning');
  assert.throws(() => db.kor('UPDATE revision SET handelse=? WHERE id=?', 'x', rad.id), /får inte ändras/);
  assert.throws(() => db.kor('DELETE FROM revision WHERE id=?', rad.id), /får inte tas bort/);
});

test('en order med både kiosk och liftkort delas på två intäktskonton', () => {
  const v = b.bokforAffar({
    serie: 'K', datum: '2026-12-02', beskrivning: 'Order K9', motpart: '+46701234567',
    rader: [
      { konto: '3010', belopp_ore: 4500 },
      { konto: '3010', belopp_ore: 2500 },
      { konto: '3030', belopp_ore: 27000 },
    ],
    betalmedel: 'swish', referens_slag: 'order', referens_id: 9, av,
  });
  assert.equal(v.belopp_ore, 34000);
  assert.equal(v.rader.find((r) => r.konto === '1930').debet_ore, 34000);
  assert.equal(v.rader.find((r) => r.konto === '3010').kredit_ore, 7000, 'kioskraderna slås ihop');
  assert.equal(v.rader.find((r) => r.konto === '3030').kredit_ore, 27000);
});

test('samma affär kan inte bokföras två gånger', () => {
  assert.throws(
    () =>
      b.bokforAffar({
        serie: 'K', datum: '2026-12-02', beskrivning: 'Order K9 igen',
        rader: [{ konto: '3010', belopp_ore: 4500 }],
        betalmedel: 'swish', referens_slag: 'order', referens_id: 9, av,
      }),
    /redan bokförd/
  );
  assert.ok(b.verifikationFor('order', 9));
});
