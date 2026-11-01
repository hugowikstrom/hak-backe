// Kontrollvyns startskärm: sex kort i den ordning klubben är van vid.
//
// Korten bär ingen siffra. Det var en förbättring jag lade till och tog
// bort igen – förlagan räknar bara i flikraden, och två ställen som
// räknar samma sak ser ut som två olika sanningar.
import { Ikon } from './skal.jsx';
import { Installera } from './installera.jsx';

const KORT = [
  { vy: 'avvikelser', namn: 'Avvikelser', ikon: 'avvikelse' },
  { vy: 'enheter', namn: 'Enheter', ikon: 'enhet' },
  { vy: 'ronder', namn: 'Ronder', ikon: 'rond' },
  { vy: 'dokument', namn: 'Dokument', ikon: 'dokument' },
  { vy: 'incidenter', namn: 'Incidenter', ikon: 'incident' },
  { vy: 'genvagar', namn: 'Genvägar', ikon: 'genvag' },
];

export function Hem({ ga }) {
  return (
    <>
      <div className="kv-rutnat">
        {KORT.map((k) => (
          <button key={k.vy} className="kv-kort" onClick={() => ga(k.vy)}>
            <Ikon namn={k.ikon} storlek={40} />
            <span className="namn">{k.namn}</span>
          </button>
        ))}
      </div>

      <Installera />
    </>
  );
}
