// Tömmer web/dist före bygget. Klienterna bygger till samma katalog och
// får därför inte tömma den var för sig.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rot = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(rot, 'web', 'dist'), { recursive: true, force: true });
