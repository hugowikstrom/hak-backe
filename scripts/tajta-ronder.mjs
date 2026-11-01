#!/usr/bin/env node
// Byter ut en förenings checklistmallar mot de korta.
//
//   node scripts/tajta-ronder.mjs            # visar vad som skulle hända
//   node scripts/tajta-ronder.mjs --kor      # gör det
//
// Gamla mallar **tas inte bort** – de stängs av. En genomförd rond pekar
// på sina punkter, och raderar man punkterna blir historiken obegriplig.
// Avstängda mallar dyker inte upp i nya ronder men går att läsa i
// efterhand, vilket är precis vad bokförd historik ska vara.
//
// Skriptet är idempotent: en mall som redan finns med rätt namn lämnas i
// fred, så det går att köra om utan att något dubbleras.
import { alla, en, kor, spara } from '../server/db.mjs';
import { CHECKLISTMALLAR } from '../server/checklistdata.mjs';
import { forening as hamtaForening, korSom, standardforening } from '../server/foreningar.mjs';

const gor = process.argv.includes('--kor');
const i = process.argv.indexOf('--forening');
const vald = i > -1 ? process.argv[i + 1] : null;
const f = vald ? hamtaForening(vald) : standardforening();
if (!f) {
  console.error(`Föreningen ${vald} finns inte.`);
  process.exit(1);
}

korSom(f, () => {
  // Namnet räcker inte som jämförelse: "Fiket – öppning" finns i båda
  // uppsättningarna men med olika punkter. Det som avgör om en mall redan
  // är den nya är punkterna, inte rubriken.
  const punkterFor = (id) =>
    alla('SELECT text FROM checklistpunkt WHERE mall_id=? ORDER BY ordning', id).map((p) => p.text);
  const samma = (b, n) =>
    b.namn === n.namn &&
    b.punkter.length === n.punkter.length &&
    b.punkter.every((t, i) => t === n.punkter[i][0]);

  const befintliga = alla('SELECT id, namn, aktiv FROM checklistmall').map((m) => ({
    ...m,
    punkter: punkterFor(m.id),
  }));
  const aktiva = befintliga.filter((m) => m.aktiv);
  const attStanga = aktiva.filter((b) => !CHECKLISTMALLAR.some((n) => samma(b, n)));
  const attSkapa = CHECKLISTMALLAR.filter((n) => !aktiva.some((b) => samma(b, n)));

  console.log(`Förening: ${f.namn} (${f.databas})\n`);
  console.log(`Stängs av (${attStanga.length}):`);
  for (const m of attStanga) {
    const korningar = en('SELECT count(*) AS n FROM checklistkorning WHERE mall_id=?', m.id).n;
    console.log(`   ${m.namn}  ·  ${korningar} genomförda ronder bevaras`);
  }
  console.log(`\nLäggs upp (${attSkapa.length}):`);
  for (const m of attSkapa) console.log(`   ${m.namn}  ·  ${m.punkter.length} punkter`);

  if (!gor) {
    console.log('\nInget gjort. Kör om med --kor.');
    return;
  }

  // Omfattningen `omrade` pekar på ett område via namn.
  const omradeId = (namn) => en('SELECT id FROM omrade WHERE namn=?', namn)?.id ?? null;

  let ordning = Math.max(0, ...befintliga.map(() => 0));
  for (const m of attSkapa) {
    const id = spara('checklistmall', {
      namn: m.namn,
      omfattning: m.omfattning,
      intervall: m.intervall,
      beskrivning: m.beskrivning ?? null,
      position_nyckel: m.position_nyckel ?? null,
      utrustningstyp: m.omfattning === 'utrustningstyp' ? m.nyckel : null,
      omrade_id: m.omfattning === 'omrade' ? omradeId(m.nyckel) : null,
      rondtyp: m.extra?.rondtyp ?? null,
      platsslag: m.extra?.platsslag ?? null,
      kraver_kvittens: m.extra?.kvittens ? 1 : 0,
      ordning: ordning++,
    });
    for (const [j, p] of m.punkter.entries())
      spara('checklistpunkt', {
        mall_id: id,
        ordning: j,
        text: p[0],
        svarstyp: p[1] || 'bock',
        enhet: p[2] || null,
        hjalptext: p[3] || null,
        obligatorisk: p[4] === false ? 0 : 1,
        sakerhetskritisk: p[5] === true ? 1 : 0,
      });
  }
  for (const m of attStanga) kor('UPDATE checklistmall SET aktiv=0 WHERE id=?', m.id);

  const kvar = en('SELECT count(*) AS n FROM checklistmall WHERE aktiv=1').n;
  const punkter = en(
    'SELECT count(*) AS n FROM checklistpunkt p JOIN checklistmall m ON m.id=p.mall_id WHERE m.aktiv=1'
  ).n;
  console.log(`\nKlart. ${kvar} aktiva mallar, ${punkter} punkter — ${(punkter / kvar).toFixed(1)} i snitt.`);
});
