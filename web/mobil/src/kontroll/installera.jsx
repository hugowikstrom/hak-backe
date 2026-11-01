// Lägg appen på hemskärmen.
//
// En webbapp som ligger kvar i en webbläsarflik blir inte använd. Den som
// ska göra en rond i backen ska trycka på en ikon, inte leta upp en
// adress med vantar på.
//
// Android och skrivbordet ger oss `beforeinstallprompt` och kan göra det
// med ett tryck. iOS ger ingenting alls — där får man peka på var knappen
// sitter, och det är bättre än att dölja möjligheten.
//
// Själva haken bor i delar.jsx: Backis Rond behöver den också.
import { useState } from 'react';
import { useInstallera } from '../delar.jsx';
import { Ikon } from './skal.jsx';

/** Raden under korten. Visas bara när det finns något att göra. */
export function Installera() {
  const lage = useInstallera();
  const [visaIos, sattVisaIos] = useState(false);
  if (!lage) return null;

  return (
    <>
      <button
        className="kv-installera"
        onClick={() => (lage.slag === 'ios' ? sattVisaIos(true) : lage.installera())}
      >
        <Ikon namn="hem" storlek={20} />
        <span className="txt">
          <strong>Lägg till på hemskärmen</strong>
          <small>Öppnas som en app, utan adressfält</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>

      {visaIos && (
        <div className="kv-ark-bak" onMouseDown={(e) => e.target === e.currentTarget && sattVisaIos(false)}>
          <div className="kv-ark" role="dialog" aria-label="Lägg till på hemskärmen">
            <div className="rubrik">Så lägger du till appen</div>
            <p className="kv-steg">1. Tryck på Dela-knappen längst ned i Safari.</p>
            <p className="kv-steg">2. Välj <strong>Lägg till på hemskärmen</strong>.</p>
            <p className="kv-steg">3. Tryck <strong>Lägg till</strong>.</p>
            <div className="skilj" />
            <button onClick={() => sattVisaIos(false)}>Stäng</button>
          </div>
        </div>
      )}
    </>
  );
}
