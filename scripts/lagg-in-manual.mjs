#!/usr/bin/env node
// Lägger in en manual i anläggningen och läser ut servicepunkterna.
//
//   node scripts/lagg-in-manual.mjs <fil.pdf> --namn "…" [--utrustning <id>]
//                                    [--slag servicemanual|manual|broschyr|…]
//
// Samma väg som uppladdningen i gränssnittet tar, men körbar utan webbläsare
// när en manual ska in i efterhand. Stegen är avsiktligt desamma:
//
//   1. filen in, text och innehållskarta ur den (regler, ingen modell)
//   2. klassificering: vad är det här för dokument
//   3. servicepunkter ur underhållsavsnitten, med sida och citat
//
// Punkterna sparas som **förslag**. De blir inga planer förrän en människa
// godkänt dem i Underhåll → Förslag, precis som när någon laddar upp en
// manual själv. Skriptet godkänner ingenting.
//
// Modellen tas ur HAK_AI_MODELL för den här processen. Kör en tjock manual
// med en starkare nivå än `lokal` – en 8B-modell hinner inte igenom ett
// underhållsprogram innan den tar timeout:
//
//   HAK_AI_MODELL=bast node scripts/lagg-in-manual.mjs manual.pdf --namn "…"
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const flagga = (namn) => {
  const i = argv.indexOf(`--${namn}`);
  return i >= 0 ? argv[i + 1] : null;
};
const kalla = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
if (!kalla || !existsSync(kalla)) {
  console.error('Ange en fil som finns. Se kommentaren högst upp i skriptet.');
  process.exit(1);
}

const { forening: hamtaForening, standardforening } = await import('../server/foreningar.mjs');
const foreningen = flagga('forening') ? hamtaForening(flagga('forening')) : standardforening();
if (!foreningen) {
  console.error('Föreningen finns inte. Se npm run foreningar.');
  process.exit(1);
}

const dbmodul = await import('../server/db.mjs');
const handtag = dbmodul.oppna(foreningen.databas);
const { en, spara, medSkal } = dbmodul;
const { DOKUMENTKATALOG, innehallskarta, lasPdf, sidorUr } = await import('../server/dokument.mjs');
const { klassificera } = await import('../server/api/underhall.mjs');
const { lasServicepunkter } = await import('../server/api/underhall.mjs');

const iForeningen = (fn) => medSkal({ db: handtag, forening: foreningen }, fn);

console.log(`Förening: ${foreningen.namn} (${foreningen.databas})`);
console.log(`Modell:   ${process.env.HAK_AI_MODELL || 'lokal'}`);

await iForeningen(async () => {
  // 1. Filen in. Samma namngivning som uppladdningen: slumpat namn på disk,
  //    läsbart namn i databasen.
  mkdirSync(DOKUMENTKATALOG, { recursive: true });
  const filnamn = `${randomBytes(10).toString('hex')}.pdf`;
  copyFileSync(kalla, join(DOKUMENTKATALOG, filnamn));
  const { sidor, text, fel: lasfel } = await lasPdf(filnamn);
  if (lasfel) console.warn(`  pdf-varning: ${lasfel}`);

  const karta = text ? innehallskarta(sidorUr(text)) : [];
  const namn = flagga('namn') || basename(kalla).replace(/\.[a-z0-9]+$/i, '');
  const utrustning_id = flagga('utrustning') ? Number(flagga('utrustning')) : null;

  const id = spara('dokument', {
    utrustning_id,
    namn,
    slag: flagga('slag') || 'servicemanual',
    filnamn,
    mediatyp: 'application/pdf',
    storlek: statSync(kalla).size,
    sidor: sidor.length || null,
    text,
    innehall: karta.length ? JSON.stringify(karta) : null,
    version: 1,
  });
  console.log(`\nDokument #${id}: ${namn} · ${sidor.length} sidor`);
  console.log(`  innehållskarta: ${karta.map((a) => `${a.slag} s.${a.fran}`).join(', ') || '(tom)'}`);

  // 2. Vad är det här?
  const d = en('SELECT * FROM dokument WHERE id=?', id);
  const k = await klassificera(d.text);
  if (k.data) {
    const t = k.data;
    console.log(
      `  klassad som: ${t.slag || '?'} · ${[t.tillverkare, t.modell].filter(Boolean).join(' ') || 'okänd modell'}`
    );
  } else {
    console.log(`  klassificering gick inte: ${k.fel}`);
  }

  // 3. Servicepunkterna. En broschyr har inget underhållsprogram, och ska
  //    inte låtsas ha det – hoppa över steget om slaget säger annat.
  if ((flagga('slag') || 'servicemanual') !== 'servicemanual') {
    console.log('\n  Inte en servicemanual – inga servicepunkter läses ut.\n');
    return;
  }
  const r = await lasServicepunkter(d, null);
  console.log(`\n  underhållsavsnitt: sidorna ${r.avsnitt.join(', ') || '(inga)'}`);
  if (r.fel) console.log(`  tolkningsfel: ${r.fel}`);
  console.log(`  servicepunkter: ${r.punkter.length} (sparade som förslag)\n`);
  for (const p of r.punkter) {
    const iv = p.intervall ? `${p.intervalltyp} ${p.intervall}` : p.intervalltyp;
    console.log(`    ${String(iv).padEnd(20)} ${p.namn}  [${p.kallsida || '–'}]`);
  }
  if (r.punkter.length)
    console.log('\n  Godkänn dem i Underhåll → Förslag. Inget är en plan förrän någon sagt ja.');
});

handtag.close();
