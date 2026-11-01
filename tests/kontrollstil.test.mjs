// Klassnamnen i kontrollvyn får inte krocka med appens egna.
//
// Vyn har egna komponenter men delar stilmall med mobilappen, och appen
// äger korta namn: `.topp` är ett grönt klistrat sidhuvud, `.post` en
// flexrad, `.stor` en knapp i full bredd, `.sida` en flexspalt. Fyra
// separata buggar har kommit ur det, och alla fyra såg ut som något
// annat: en grön bjälke över ett kort, en knapp som bredde ut sig, en
// etikett bredvid sitt värde i stället för ovanför, ett sidhuvud som
// radade sina tre knappar på höjden.
//
// Regeln är att ett klassnamn i `kontroll/` antingen ska vara
// kv-prefixat eller stå under en kv-förälder som väger tyngre. Det här
// testet håller fast den regeln så att nästa krock blir ett rött test i
// stället för en skärmbild någon undrar över.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KONTROLL = join(ROT, 'web/mobil/src/kontroll');

/** Klassnamn som appens stilmallar definierar som ensam klass, `.namn {…}`. */
function appensBaraKlasser() {
  const namn = new Set();
  for (const fil of ['web/mobil/src/stil.css', 'web/delad/profil.css']) {
    const css = readFileSync(join(ROT, fil), 'utf-8');
    // Bara regler vars hela väljare är en ensam klass – de är de enda
    // som kan vinna över ett oprefixat namn inuti vyn.
    for (const m of css.matchAll(/(^|\})\s*((?:\.[a-zA-ZåäöÅÄÖ0-9_-]+\s*,\s*)*\.[a-zA-ZåäöÅÄÖ0-9_-]+)\s*\{/g))
      for (const del of m[2].split(','))
        if (/^\s*\.[a-zA-ZåäöÅÄÖ0-9_-]+\s*$/.test(del)) namn.add(del.trim().slice(1));
  }
  return namn;
}

/** Klassnamn som kontrollvyns komponenter sätter på element. */
function vynsKlasser() {
  const namn = new Map();
  for (const fil of readdirSync(KONTROLL).filter((f) => f.endsWith('.jsx'))) {
    const kod = readFileSync(join(KONTROLL, fil), 'utf-8');
    for (const m of kod.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const rad = (m[1] || m[2] || '').replace(/\$\{[^}]*\}/g, ' ');
      for (const k of rad.split(/\s+/).filter(Boolean)) {
        if (!namn.has(k)) namn.set(k, fil);
      }
    }
  }
  return namn;
}

/** Väljare i kontrollvyns egen stilmall, för att se vad som är scopat. */
const kontrollCss = readFileSync(join(KONTROLL, 'stil.css'), 'utf-8');

test('inget oprefixat klassnamn i kontrollvyn krockar med appens egna', () => {
  const appens = appensBaraKlasser();
  const krockar = [];

  for (const [klass, fil] of vynsKlasser()) {
    if (klass.startsWith('kv-') || !appens.has(klass)) continue;
    // Ett oprefixat namn är i sin ordning om vyns stilmall alltid når
    // det genom en kv-förälder – då väger den tyngre än appens regel.
    const scopat = new RegExp(`\\.kv[a-zA-ZåäöÅÄÖ0-9_-]*\\s[^,{]*\\.${klass}\\b`).test(kontrollCss);
    if (!scopat) krockar.push(`${klass} (${fil}) – appen definierar .${klass}`);
  }

  assert.deepEqual(
    krockar,
    [],
    `Prefixa med kv- eller skriv regeln under en kv-förälder:\n  ${krockar.join('\n  ')}`
  );
});
