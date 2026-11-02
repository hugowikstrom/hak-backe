#!/usr/bin/env node
// Lägger in klubbens egna checklistor i Backis.
//
//   node scripts/klubblistor.mjs            # visar vad som skulle hända
//   node scripts/klubblistor.mjs --kor      # gör det
//
// Listorna är avlästa ur systemet klubben kommer ifrån och står i
// `server/klubblistor.mjs`. Den som redan finns med samma namn fylls på
// med de punkter som saknas och får sitt schema uppdaterat – men
// punkter tas aldrig bort. En punkt som någon lagt till i Backis är
// någons beslut, och det är inte skriptets sak att gå emot det.
//
// Gamla mallar stängs inte av heller. Det här lägger till klubbens
// riktiga listor vid sidan av; vad som ska vara kvar bestämmer Jonas i
// checklisteditorn.
import { alla, en, kor, spara, uppdatera } from '../server/db.mjs';
import { KLUBBLISTOR } from '../server/klubblistor.mjs';
import { forening as hamtaForening, korSom, standardforening } from '../server/foreningar.mjs';

const gor = process.argv.includes('--kor');
const i = process.argv.indexOf('--forening');
const vald = i > -1 ? process.argv[i + 1] : null;
const f = vald ? hamtaForening(vald) : standardforening();
if (!f) {
  console.error(`Föreningen ${vald} finns inte.`);
  process.exit(1);
}

const punktdata = (p, ordning) => {
  const [text, svarstyp, hjalptext, obligatorisk, sakerhetskritisk, extra = {}] = p;
  return {
    ordning,
    text,
    svarstyp: svarstyp || 'bock',
    hjalptext: hjalptext ?? null,
    obligatorisk: obligatorisk ? 1 : 0,
    // En säkerhetspunkt är alltid obligatorisk. Annars går den att
    // lämna, och då spärrar den ingenting.
    sakerhetskritisk: sakerhetskritisk ? 1 : 0,
    enhet: extra.enhet ?? null,
    alternativ: extra.alternativ ? JSON.stringify(extra.alternativ) : null,
    matarstallning: extra.matarstallning ? 1 : 0,
  };
};

korSom(f, () => {
  console.log(`Förening: ${f.namn} (${f.databas})\n`);
  let nya = 0;
  let fyllda = 0;

  for (const [n, lista] of KLUBBLISTOR.entries()) {
    const fanns = en('SELECT * FROM checklistmall WHERE namn=?', lista.namn);
    const falt = {
      namn: lista.namn,
      omfattning: lista.omfattning,
      utrustningstyp: lista.utrustningstyp ?? null,
      platsslag: lista.platsslag ?? null,
      omrade_id: lista.omrade_id ?? null,
      intervall: lista.intervall,
      intervalltyp: lista.intervalltyp ?? 'handelse',
      intervall_dagar: lista.intervall_dagar ?? null,
      intervall_timmar: lista.intervall_timmar ?? null,
      fonster_dagar: lista.fonster_dagar ?? null,
      start_timmar: lista.start_timmar ?? null,
      position_nyckel: lista.position_nyckel ?? null,
      beskrivning: lista.beskrivning ?? null,
      kraver_kvittens: lista.kvittens ? 1 : 0,
      aktiv: 1,
      ordning: n,
    };

    const id = fanns?.id;
    if (!fanns) nya += 1;
    else fyllda += 1;

    const befintliga = id
      ? alla('SELECT id, text FROM checklistpunkt WHERE mall_id=? ORDER BY ordning, id', id)
      : [];
    const saknade = lista.punkter.filter(
      (p) => !befintliga.some((b) => b.text === p[0])
    );

    console.log(`${fanns ? 'finns' : 'NY   '}  ${lista.namn}`);
    console.log(
      `        ${lista.punkter.length} punkter` +
        (fanns ? ` · ${saknade.length} saknas` : '') +
        ` · ${falt.intervalltyp}` +
        (falt.intervall_dagar ? ` ${falt.intervall_dagar} dagar` : '') +
        (falt.intervall_timmar ? ` ${falt.intervall_timmar} h` : '')
    );
    for (const p of saknade) console.log(`          + ${p[0]}`);

    if (!gor) continue;

    const mall = id ?? spara('checklistmall', falt);
    if (id) uppdatera('checklistmall', id, falt);

    // Ordningen sätts om på alla punkter som finns i listan, så att de
    // hamnar i klubbens ordning även om någon lagt till en punkt i mitten.
    for (const [j, p] of lista.punkter.entries()) {
      const b = befintliga.find((x) => x.text === p[0]);
      if (b) uppdatera('checklistpunkt', b.id, punktdata(p, j));
      else spara('checklistpunkt', { mall_id: mall, ...punktdata(p, j) });
    }
  }

  if (!gor) {
    console.log('\nInget gjort. Kör om med --kor.');
    return;
  }
  const kvar = en('SELECT count(*) AS n FROM checklistmall WHERE aktiv=1').n;
  const punkter = en(
    'SELECT count(*) AS n FROM checklistpunkt p JOIN checklistmall m ON m.id=p.mall_id WHERE m.aktiv=1'
  ).n;
  console.log(`\nKlart. ${nya} nya, ${fyllda} uppdaterade. ${kvar} aktiva mallar, ${punkter} punkter.`);
});
