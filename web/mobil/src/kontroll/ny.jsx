// "+ Ny": vad som går att registrera, grupperat på vad det gäller.
//
// Sju val i två grupper, precis som i förlagan. Att Påfyllning öppnar ett
// andra ark med Bränsle och Andra vätsketyper är också taget därifrån –
// det är den vanligaste registreringen på en pistmaskin och förtjänar att
// ligga ett tryck bort.
import { useState } from 'react';
import { Ikon } from './skal.jsx';

// Avvikelse är en skiftnyckel här och en cirkel med utropstecken på
// startskärmen. Det är inte konsekvent, men det är så förlagan ser ut,
// och igenkänning är vad den här vyn finns till för.
const ENHET = [
  { nyckel: 'kontroll', namn: 'Kontroll', ikon: 'kontroll' },
  { nyckel: 'avvikelse', namn: 'Avvikelse', ikon: 'nyckel' },
  { nyckel: 'pafyllning', namn: 'Påfyllning', ikon: 'vatska' },
  { nyckel: 'service', namn: 'Service', ikon: 'service' },
];
const ROND = [
  { nyckel: 'rkontroll', namn: 'Kontroll', ikon: 'kontroll' },
  { nyckel: 'ravvikelse', namn: 'Avvikelse', ikon: 'nyckel' },
  { nyckel: 'incident', namn: 'Incident', ikon: 'incident' },
];

export function NyMeny({ stang, valj }) {
  const [vatska, sattVatska] = useState(false);

  const rad = (v) => (
    <button
      key={v.nyckel}
      onClick={() => (v.nyckel === 'pafyllning' ? sattVatska(true) : (valj(v.nyckel), stang()))}
    >
      <Ikon namn={v.ikon} storlek={22} />
      {v.namn}
    </button>
  );

  return (
    <div className="kv-ark-bak" onMouseDown={(e) => e.target === e.currentTarget && stang()}>
      <div className="kv-ark" role="dialog" aria-label="Ny registrering">
        {vatska ? (
          <>
            <button onClick={() => (valj('pafyllning', 'bransle'), stang())}>Bränsle</button>
            <button onClick={() => (valj('pafyllning', 'vatska'), stang())}>Andra vätsketyper</button>
            <div className="skilj" />
            <button onClick={() => sattVatska(false)}>Tillbaka</button>
          </>
        ) : (
          <>
            <div className="rubrik">Enheter</div>
            {ENHET.map(rad)}
            <div className="rubrik">Ronder</div>
            {ROND.map(rad)}
            <div className="skilj" />
            <button onClick={stang}>Avbryt</button>
          </>
        )}
      </div>
    </div>
  );
}
