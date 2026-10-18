// Visar föreningarna på plattformen och vad de har påslaget.
import { foreningar } from '../server/foreningar.mjs';
import { aktivaModuler } from '../server/moduler.mjs';
import { korSom } from '../server/foreningar.mjs';
import { en } from '../server/db.mjs';

for (const f of foreningar()) {
  const medlemmar = korSom(f, () => en('SELECT count(*) AS n FROM medlem WHERE aktiv=1')?.n ?? 0);
  console.log(`${f.nyckel.padEnd(12)} ${f.namn}`);
  console.log(`  domäner  ${f.domaner.join(', ') || '(standard)'}`);
  console.log(`  databas  ${f.databas}`);
  console.log(`  medlemmar ${medlemmar}`);
  console.log(`  moduler  ${aktivaModuler(f).join(', ')}`);
  console.log();
}
