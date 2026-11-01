// Kontrollvyns skal: topp, flikar, välvt fält och hemknapp.
//
// Formen följer systemet klubben kommer ifrån. Det är inte en estetisk
// preferens utan en övergångskostnad som slipper betalas: handen hittar
// Ronder där handen redan vet att Ronder ligger.
import { Marke } from '../delar.jsx';

/** Ikonerna ritas som streck – de ska se lika ut på varje telefon. */
export const Ikon = ({ namn, storlek = 26 }) => {
  const d = {
    hem: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z',
    lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    synk: 'M20 11A8 8 0 0 0 6.3 6.3L4 8.5m0 4.5a8 8 0 0 0 13.7 4.7l2.3-2.2M4 4v4.5h4.5M20 20v-4.5h-4.5',
    // Cirkel med utropstecken, som på startskärmens kort.
    avvikelse: 'M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6Zm0 4.3v5.2m0 3.1v.9',
    // Skiftnyckel. Förlagan använder den i arken och på korten, och
    // cirkeln med utropstecken på startskärmen – samma ord, två bilder.
    nyckel: 'M15.5 3.2a5 5 0 0 0-4.3 7.5L3.6 18.3a1.7 1.7 0 0 0 2.4 2.4l7.6-7.6a5 5 0 0 0 6.2-6.6l-2.9 2.9-2.5-.6-.6-2.5 2.9-2.9a5 5 0 0 0-1.2-.2Z',
    enhet: 'M3 7h11v8H3V7Zm11 3h4l3 3v2h-7v-5ZM6.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    // Rond: två kartnålar och vägen mellan dem.
    rond: 'M7.5 3.5a2.6 2.6 0 0 1 2.6 2.6c0 1.9-2.6 4.6-2.6 4.6S4.9 8 4.9 6.1A2.6 2.6 0 0 1 7.5 3.5Zm0 2.4v.01M7.5 12.5h6a3 3 0 0 1 0 6h-2m5.5-5.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z',
    // Uppslagen bok.
    dokument: 'M12 6.6C10.4 5.3 8.3 4.7 5 4.7v12.8c3.3 0 5.4.6 7 1.8 1.6-1.2 3.7-1.8 7-1.8V4.7c-3.3 0-5.4.6-7 1.9Zm0 0v12.7',
    incident: 'M6 3h9l4 4v14H6V3Zm6 6.5v5m0 3v1',
    // Två hopkopplade länkar.
    genvag: 'M10.4 13.6a3.4 3.4 0 0 0 5.1.4l2.4-2.4a3.4 3.4 0 0 0-4.8-4.8l-1.4 1.4m1.9 2.2a3.4 3.4 0 0 0-5.1-.4l-2.4 2.4a3.4 3.4 0 0 0 4.8 4.8l1.4-1.4',
    kontroll: 'M9 4h6v2H9V4Zm-2 2h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm2 6 2 2 4-4',
    // Verktygslåda.
    service: 'M3 10h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Zm3 0V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3M3 14h18',
    vatska: 'M12 3s5 6 5 9.5a5 5 0 0 1-10 0C7 9 12 3 12 3Z',
    meny: 'M4 7h16M4 12h16M4 17h16',
    stjarna: 'm12 3.6 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8L12 3.6Z',
    // Mätare, som på enhetens standardmätarställning.
    matare: 'M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Zm3.4 5.2L11 13',
    // Organisationsträd: förlagans ikon för kategori.
    kategori: 'M9.5 4.5h5v3.4h-5V4.5ZM4 16.1h4.2v3.4H4v-3.4Zm11.8 0H20v3.4h-4.2v-3.4ZM12 7.9v3.9M6.1 16.1v-2.2h11.8v2.2',
    sok: 'M10.8 4.3a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm4.8 11.4 4 4',
    reglage: 'M4 7h9m3 0h4M4 17h4m3 0h9M15 4.3v5.4M9 14.3v5.4',
    kamera: 'M4 8h3.2l1.5-2h6.6l1.5 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 3.2a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z',
    ned: 'm6 9.5 6 6 6-6',
    mer: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
    plus: 'M12 5v14M5 12h14',
  }[namn];
  return (
    <svg viewBox="0 0 24 24" width={storlek} height={storlek} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
};

/**
 * Hela skalet. `hero` visas bara på startskärmen – i undervyerna byts
 * det mot en rubrikrad med bakåtpil, precis som i förlagan.
 */
export function Skal({ flik, sattFlik, titel, tillbaka, hero, antal, meny, children, hem }) {
  return (
    <div className="kv">
      <header className="kv-topp">
        {tillbaka ? (
          <button className="ikon bak" onClick={tillbaka} aria-label="Tillbaka">‹</button>
        ) : (
          <span />
        )}
        <span className="marke">{titel ? <strong>{titel}</strong> : <Marke storlek={34} />}</span>
        <button className="ikon" onClick={meny} aria-label="Meny"><Ikon namn="meny" /></button>
      </header>

      {!titel && (
        <nav className="kv-flikar" role="tablist">
          {[
            ['hem', 'hem'],
            ['arenden', 'lista'],
            ['pagaende', 'synk'],
          ].map(([n, ikon]) => (
            <button key={n} role="tab" aria-selected={flik === n} onClick={() => sattFlik(n)}>
              <Ikon namn={ikon} />
              {n === 'arenden' && antal > 0 && <span className="bricka">{antal}</span>}
            </button>
          ))}
        </nav>
      )}

      {hero}
      <main className="kv-kropp">{children}</main>
      {hem && <button className="kv-hemknapp" onClick={hem} aria-label="Hem"><Ikon namn="hem" storlek={24} /></button>}
    </div>
  );
}

/**
 * Fältet med vem man är. Ljust med ett svagt triangelmönster och en mjuk
 * välvd underkant – inte färgat. Det var grönt i första versionen, men
 * förlagan har grönt bara i logotypen.
 */
export const Hero = ({ namn, forening, onNy }) => (
  <div className="kv-hero">
    <h1>{namn}</h1>
    <p>{forening}</p>
    {onNy && (
      <button className="kv-pill hjalte" onClick={onNy}>
        <Ikon namn="plus" storlek={26} /> Ny
      </button>
    )}
  </div>
);
