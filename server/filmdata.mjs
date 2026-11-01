// Genomgångsfilmerna: vad som finns och vem var och en är till för.
//
// Katalogen står här och inte bland filerna i `data/film/`, av samma skäl
// som modulernas metadata ligger i `moduldata.mjs`: en lista som beskriver
// systemet hör till koden. Själva filmerna är stora binärer och ligger i
// datakatalogen, utanför git.
//
// `modul` gör att en klubb utan kiosk slipper en film om kiosken. En film
// utan modul gäller alla.
export const FILMER = [
  {
    // Ingången för den som inte är insatt: vad klubben bygger och varför.
    // Står allra först och hör inte till någon modul – den gäller alla.
    nyckel: 'projektet',
    titel: 'Vad klubben bygger',
    beskrivning:
      'En kort genomgång av projektet: vilka delar som finns, varför vi gör det, och hur du säger vad du tycker.',
    for: 'Alla medlemmar',
    modul: null,
    ordning: -1,
  },
  {
    // Står först: det är den här en klubb vill se när den funderar på att
    // byta ut sitt kontrollsystem.
    nyckel: 'kontroller',
    titel: 'Kontroller i telefonen',
    beskrivning:
      'Dagens säkerhetskontroller där de faktiskt görs: logga in, välj lift, en punkt i taget – och vad som händer när en säkerhetskontroll saknar svar.',
    for: 'Alla som gör ronder',
    modul: 'checklistor',
    ordning: 0,
  },
  {
    // Ligger direkt efter kontrollfilmen: det är samma arbete, visat i den
    // form klubben redan känner igen. Styrelsen frågar efter den här.
    nyckel: 'kontrollvyn',
    titel: 'Kontrollvyn',
    beskrivning:
      'Lägg appen på hemskärmen, och gå igenom hela kontrollvyn: arbetsställe och enhet, försenade kontroller, ronden med sin säkerhetsspärr, vätskor och besiktningar, påfyllning och avvikelse, dokument, incidenter och genvägar.',
    for: 'Styrelsen och alla som gör ronder',
    modul: 'checklistor',
    ordning: 0.5,
  },
  {
    nyckel: 'medlem',
    titel: 'För dig som är medlem',
    beskrivning:
      'Dina pass, dina ronder och läget i backen. Boka pass, gör en rond, rapportera ett fel och använd mobilappen.',
    for: 'Alla medlemmar',
    modul: null,
    ordning: 1,
  },
  {
    nyckel: 'backansvarig',
    titel: 'För dig som är backansvarig',
    beskrivning:
      'Dagens drift: ronder och kvittens, ärenden, bemanning, snöläggning och driftjournal.',
    for: 'Backansvarig',
    modul: 'checklistor',
    ordning: 2,
  },
  {
    nyckel: 'fiket',
    titel: 'För dig som står i fiket',
    beskrivning:
      'Luckan: ta emot beställningar, kvittera betalning, sälj direkt och håll sortimentet aktuellt.',
    for: 'Kioskvärdar',
    modul: 'kiosk',
    ordning: 3,
  },
  {
    nyckel: 'uthyrningen',
    titel: 'För dig som sköter uthyrningen',
    beskrivning:
      'Prislistan, utlämning med märkning, och återlämning. Pjäxorna provas alltid i luckan.',
    for: 'Uthyrningen',
    modul: 'uthyrning',
    ordning: 4,
  },
  {
    nyckel: 'anlaggningsansvarig',
    titel: 'För dig som är anläggningsansvarig',
    beskrivning:
      'Hela systemet i en följd: snöläggning, planering, underhåll och årshjul, incidenter och register.',
    for: 'Anläggningsansvarig',
    modul: 'underhall',
    ordning: 5,
  },
  {
    nyckel: 'arenden',
    titel: 'Ärenden',
    beskrivning: 'Fel, brister och risker på ett ställe — och varför ett ärende hör till antingen en maskin eller en plats.',
    for: 'Alla som arbetar i backen',
    modul: 'arenden',
    ordning: 6,
  },
  {
    nyckel: 'foreningen',
    titel: 'Föreningen',
    beskrivning: 'Matrikel, sektioner, träningsgrupper och uppdrag — och hur tillträden styrs av roll, uppdrag och grupp.',
    for: 'Styrelsen och sektionsansvariga',
    modul: 'forening',
    ordning: 7,
  },
  {
    nyckel: 'pengar',
    titel: 'Plånbok och utlägg',
    beskrivning: 'Fota kvittot, kassören godkänner och betalar ut — till banken eller rakt in i plånboken.',
    for: 'Alla medlemmar och kassören',
    modul: 'utlagg',
    ordning: 8,
  },
  {
    nyckel: 'evenemang',
    titel: 'Läger, tävling och samåkning',
    beskrivning: 'Anmälan med avgift och reservkö, deltagarlistan med behov, och vem som kör till Kläppen.',
    for: 'Tränare och medlemmar',
    modul: 'evenemang',
    ordning: 9,
  },
];

export const film = (nyckel) => FILMER.find((f) => f.nyckel === nyckel) || null;
