// Lägger upp en ny förening på plattformen.
//
//   npm run ny-forening -- --nyckel vargen --namn "Vargens SK" \
//     --doman vargen.nattviken.com --moduler arenden,bemanning,ideer
//
// Föreningen får en egen databasfil, en kontoplan, standardpositioner och
// ett administratörskonto med ett slumpat lösenord som skrivs ut en gång.
import { korSom, skapaForening } from '../server/foreningar.mjs';
import { aktivaModuler } from '../server/moduler.mjs';
import { laggGrund } from '../server/grund.mjs';

const flagga = (namn, standard = null) => {
  const i = process.argv.indexOf(`--${namn}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : standard;
};

const nyckel = flagga('nyckel');
const namn = flagga('namn');
if (!nyckel || !namn) {
  console.error('Använd: npm run ny-forening -- --nyckel <kort-namn> --namn "Föreningens namn" [--doman x.se] [--moduler a,b] [--ort Ort] [--orgnr 80...] [--lat 62.6 --lon 17.9]');
  process.exit(1);
}

const moduler = flagga('moduler');
const lat = Number(flagga('lat', '0'));
const lon = Number(flagga('lon', '0'));

const forening = skapaForening({
  nyckel,
  namn,
  kortnamn: flagga('kortnamn', namn.split(' ').map((o) => o[0]).join('').toUpperCase().slice(0, 4)),
  ort: flagga('ort'),
  orgnr: flagga('orgnr', ''),
  domaner: flagga('doman') ? [flagga('doman')] : [],
  moduler: moduler ? moduler.split(',').map((m) => m.trim()) : ['*'],
  swish: flagga('swish'),
  bas_url: flagga('doman') ? `https://${flagga('doman')}` : null,
  plats: lat && lon ? { namn: flagga('platsnamn', 'Backen'), lat, lon, hojd: Number(flagga('hojd', '0')) } : undefined,
});

const { admin } = korSom(forening, () => laggGrund({ foreningsnamn: namn, admin: flagga('admin', 'admin') }));

console.log(`\nFöreningen ${forening.namn} är upplagd.`);
console.log(`  nyckel    ${forening.nyckel}`);
console.log(`  databas   ${forening.databas}`);
console.log(`  domäner   ${forening.domaner.join(', ') || '(ingen – nås via standarddomänen)'}`);
console.log(`  moduler   ${aktivaModuler(forening).join(', ')}`);
if (admin.losenord) {
  console.log(`\n  Logga in som ${admin.anvandarnamn} med lösenordet ${admin.losenord}`);
  console.log('  Byt det direkt. Det visas inte igen.');
}
console.log('\nPeka domänen hit i Caddy och starta om tjänsten.\n');
