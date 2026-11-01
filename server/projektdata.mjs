// Projektets innehåll: vad som byggs, varför, och var det står.
//
// Texterna bor i koden och sås in i databasen, där de sedan går att ändra
// medan arbetet pågår. Samma uppdelning som modulerna: det som beskriver
// systemet hör till koden, det som ändras av människor hör till databasen.
//
// Tonen är satt för den som *inte* är insatt. En medlem som läser det här
// ska förstå vad klubben håller på med och kunna säga sin mening — inte
// mötas av en kravspecifikation.

export const PROJEKTTEXTER = [
  {
    nyckel: 'syfte',
    rubrik: 'Vad det här är',
    ordning: 1,
    text:
      'Backis är klubbens eget system för att sköta Vårdkasbacken. Checklistorna som ' +
      'görs innan liftarna öppnar, felen som behöver lagas, snöläggningen, passen i ' +
      'schemat, fiket, uthyrningen och medlemsregistret — allt på ett ställe, på ' +
      'klubbens egen server.\n\n' +
      'Det är byggt för en klubb som drivs av folk som också har jobb och barn. ' +
      'Därför är allting kort: en rond är tre eller fyra punkter, inte tio. Går det ' +
      'inte att göra med vantar på en lördagsmorgon är det fel byggt.',
  },
  {
    nyckel: 'bakgrund',
    rubrik: 'Varför vi gör det',
    ordning: 2,
    text:
      'I dag ligger kontrollerna i Checkproof, som kostar klubben sextio tusen kronor ' +
      'om året. Resten sitter i pärmar, kalkylblad och huvudet på ett fåtal personer. ' +
      'När någon slutar följer kunskapen med ut.\n\n' +
      'Målet är att ersätta Checkproof först — det är den akuta kostnaden — och ' +
      'därefter låta resten flytta in i den takt klubben orkar. Ingenting måste bytas ' +
      'ut på en gång.',
  },
  {
    nyckel: 'bidra',
    rubrik: 'Du behövs',
    ordning: 3,
    text:
      'Det här byggs för dem som använder det, och det är du som vet var det skaver. ' +
      'Vid varje del finns en knapp där du kan prata in vad du tycker — en halv minut ' +
      'räcker. Du behöver inte formulera dig fint, och du behöver inte veta hur något ' +
      'fungerar tekniskt.\n\n' +
      'Allt som kommer in läses av en människa. Det som blir av syns på den här sidan.',
  },
  {
    nyckel: 'avgransning',
    rubrik: 'Vad det inte är',
    ordning: 4,
    text:
      'Backis är inget bokföringsprogram och ersätter inte revisorn. Det är inget ' +
      'certifierat kassaregister — klubben behöver inget sådant så länge fikets ' +
      'försäljning är skattefri, men det är en fråga för styrelsen och inte för ' +
      'systemet.\n\n' +
      'Det ersätter heller inte omdömet hos den som står i backen. Systemet ser till ' +
      'att frågan blir ställd. Svaret står du för.',
  },
];

/**
 * Delarna, i den ordning de betyder något för en medlem — inte i den
 * ordning de byggdes. Datumen är förslag tills styrelsen beslutat; `film`
 * pekar in i filmkatalogen (server/filmdata.mjs).
 */
export const PROJEKTDELAR = [
  {
    nyckel: 'kontroller',
    rubrik: 'Kontroller och ronder',
    sammanfattning: 'Säkerhetskontrollerna innan backen öppnar. Det som ersätter Checkproof.',
    varfor:
      'Liftarna, bandet och backen ska kontrolleras varje dag innan någon åker. Det är ' +
      'det som måste fungera först, och det är det som kostar oss pengar i dag.',
    text:
      'Nio kontroller före öppning: tre liftar, transportbandet, backen, fiket och ' +
      'uthyrningen. Varje rond är tre till fyra punkter. De som rör säkerheten går inte ' +
      'att hoppa över — men systemet avgör aldrig om en lift får öppna, det gör den som ' +
      'kvitterar.\n\n' +
      'Hittar du något som är fel trycker du Avvikelse i stället för att bocka av. När ' +
      'ronden avslutas blir det ett ärende av sig självt.',
    film: 'kontroller',
    modul: 'checklistor',
    status: 'i_drift',
    ordning: 1,
  },
  {
    // Står direkt efter kontrollerna: det är samma arbete, i den form
    // klubben redan kan. Den delen finns för att styrelsen ska kunna se
    // att bytet inte betyder att någon måste lära om.
    nyckel: 'kontrollvyn',
    rubrik: 'Kontrollvyn — samma app som förut',
    sammanfattning: 'Backis i den form vi är vana vid, med ikon på hemskärmen.',
    varfor:
      'Det som kostar i ett systembyte är sällan licensen — det är att femton volontärer ' +
      'ska lära om. Kontrollvyn finns för att slippa den kostnaden: den som gjort en rond ' +
      'förut behöver inte veta att något har bytts ut.',
    text:
      'Samma trappa som förut: arbetsställe, enhet, och därefter det som hör till enheten. ' +
      'Startskärmen har samma sex kort, plus-knappen samma sju val, och ronderna startas ' +
      'på samma sätt. Inloggningen är telefonnumret och en pinkod, och appen går att ' +
      'lägga på hemskärmen — då startar den utan adressfält och fungerar utan täckning.\n\n' +
      'Under huven är allt Backis — samma databas, samma behörigheter, samma offlinekö. ' +
      'Den som hellre vill gå raka vägen använder Backis vanliga startsida i stället; ' +
      'det är samma ronder och samma ärenden, bara en kortare väg.',
    film: 'kontrollvyn',
    modul: 'checklistor',
    status: 'i_drift',
    ordning: 2,
  },
  {
    nyckel: 'arenden',
    rubrik: 'Ärenden',
    sammanfattning: 'Allt som är trasigt, bristfälligt eller farligt — på ett ställe.',
    varfor:
      'I dag är det en lapp i fikat, ett sms till Jonas och något någon kom ihåg att ' +
      'säga. Det som inte skrivs upp blir inte lagat.',
    text:
      'Fel, brister, risker och förbättringar med prioritet och allvarlighet. Ett ärende ' +
      'hör antingen till en maskin eller till en plats i backen — ett läckande vattenuttag ' +
      'stannar på platsen när kanonen byts, ett trasigt munstycke följer med kanonen.',
    film: 'arenden',
    modul: 'arenden',
    status: 'i_drift',
    ordning: 3,
  },
  {
    nyckel: 'snolaggning',
    rubrik: 'Snöläggning',
    sammanfattning: 'Mätningar, våtkula och prognos för just Vårdkasbacken.',
    varfor:
      'Snö går bara att tillverka i rätt väder, och fönstren är korta. Att veta när ' +
      'avgör hur mycket snö vi får för pengarna.',
    text:
      'Temperatur och fuktighet räknas om till våtkula direkt, och systemet ger ett ' +
      'klartecken med rekommenderad vattenmängd. Prognosen hämtas från YR och SMHI för ' +
      'backens egen punkt. Snöplaneringen visar var produktionsfönstren ligger — men ' +
      'beslutet att bemanna dem är en människas.',
    film: 'anlaggningsansvarig',
    modul: 'snolaggning',
    status: 'i_drift',
    ordning: 4,
  },
  {
    nyckel: 'underhall',
    rubrik: 'Underhåll och årshjul',
    sammanfattning: 'Service på maskinerna innan de går sönder, inte efter.',
    varfor:
      'En kompressor som havererar i januari stänger backen. Tillverkarens intervall ' +
      'står i manualen — men manualen ligger i en pärm.',
    text:
      'Ladda upp maskinens manual, så läser systemet ut vad dokumentet är och var ' +
      'underhållsprogrammet står. Varje punkt bär citatet ur sidan den kommer från, och ' +
      'ingenting blir en plan förrän någon godkänt den. Årshjulet visar vad som förfaller ' +
      'när, och håller kritiskt underhåll borta från högsäsongen.',
    film: 'anlaggningsansvarig',
    modul: 'underhall',
    status: 'i_drift',
    ordning: 5,
  },
  {
    nyckel: 'bemanning',
    rubrik: 'Bemanning och pass',
    sammanfattning: 'Vem står var, vilka pass saknar folk, och hur många timmar du gjort.',
    varfor:
      'Schemat är klubbens svåraste pussel, och det är alltid samma personer som drar ' +
      'det tyngsta lasset.',
    text:
      'Hela säsongen i ett rutnät. Du bokar dig själv på de pass som saknar folk, och ' +
      'ser din kvot fylla på sig. Automatplaneringen fördelar rättvist mot kvot, ' +
      'nattpass och helger, och hoppar över de dagar folk sagt att de inte kan.',
    film: 'medlem',
    modul: 'bemanning',
    status: 'i_drift',
    ordning: 6,
  },
  {
    nyckel: 'fiket',
    rubrik: 'Fiket',
    sammanfattning: 'Beställning med QR, kassa och sortiment.',
    varfor: 'Kön vid luckan är som längst när det är som mest att göra.',
    text:
      'Gästen beställer i sin egen telefon och betalar med Swish. I luckan dyker ' +
      'beställningen upp som ska lagas. Priserna sätts alltid av servern, aldrig av ' +
      'telefonen.',
    film: 'fiket',
    modul: 'kiosk',
    status: 'i_drift',
    ordning: 7,
  },
  {
    nyckel: 'uthyrningen',
    rubrik: 'Skiduthyrningen',
    sammanfattning: 'Prislista, utlämning med märkning, och återlämning.',
    varfor: 'Utrustning som inte kommer tillbaka kostar mer än en hel säsongs hyra.',
    text:
      'Gästen bokar i förväg och fyller i storlekar, så att ni hinner plocka fram. ' +
      'Varje del får ett märkningsnummer vid utlämning — det är det som gör att rätt par ' +
      'kommer tillbaka. Pjäxor provas alltid i luckan, aldrig i förväg.',
    film: 'uthyrningen',
    modul: 'uthyrning',
    status: 'i_drift',
    ordning: 8,
  },
  {
    nyckel: 'foreningen',
    rubrik: 'Medlemmar och förening',
    sammanfattning: 'Matrikel, sektioner, träningsgrupper och förtroendeuppdrag.',
    varfor:
      'Medlemsuppgifter är personuppgifter, och ska inte ligga i ett kalkylblad på ' +
      'någons privata dator.',
    text:
      'Registret med sektioner, grupper och uppdrag. Vem som kommer åt vad styrs av ' +
      'roll, uppdrag och behörighetsgrupper — en tolvåring får inte kassabehörighet för ' +
      'att hens träningsgrupp har en tränare.',
    film: 'foreningen',
    modul: 'forening',
    status: 'i_drift',
    ordning: 9,
  },
  {
    nyckel: 'pengar',
    rubrik: 'Plånbok och utlägg',
    sammanfattning: 'Medlemmens förskottskonto, och kvitton som fotas i stället för att tappas bort.',
    varfor:
      'Den som handlar slangklämmor åt klubben ska inte behöva jaga kassören i tre ' +
      'veckor för att få tillbaka sina pengar.',
    text:
      'Fota kvittot i mobilen när du står kvar i butiken. Kassören granskar, godkänner ' +
      'och betalar ut — till banken eller rakt in i din plånbok. Plånboken används sedan ' +
      'i fiket, i uthyrningen och till klubbens avgifter.',
    film: 'pengar',
    modul: 'utlagg',
    status: 'provas',
    ordning: 10,
  },
  {
    nyckel: 'evenemang',
    rubrik: 'Läger, tävling och samåkning',
    sammanfattning: 'Anmälan med avgift och reservkö, och vem som kör till Kläppen.',
    varfor:
      'Anmälningar i en Messenger-tråd blir fel, och den som hoppar av tre dagar före ' +
      'avresa utlöser en ringrunda.',
    text:
      'Evenemang med anmälan, avgift, platsgräns och sista anmälningsdag. Är det fullt ' +
      'hamnar man i en reservkö som tömmer sig själv när någon hoppar av. Samåkningen ' +
      'visar vem som kör, varifrån och hur många platser som är lediga.',
    film: 'evenemang',
    modul: 'evenemang',
    status: 'provas',
    ordning: 11,
  },
  {
    nyckel: 'kassaregister',
    rubrik: 'Kassan mot myndighetskraven',
    sammanfattning: 'Räkenskapsår, kassaavstämning och arkivering enligt bokföringslagen.',
    varfor:
      'Bokföringslagen gäller föreningen oavsett skattestatus, och underlagen ska ' +
      'bevaras i sju år.',
    text:
      'Räkenskapsår som går att låsa, dagsavslut där kontanterna i lådan stäms av mot ' +
      'böckerna, och kvitton som bevaras som räkenskapsinformation. Tabellerna finns; ' +
      'logiken är påbörjad men inte klar.\n\n' +
      'Klubben behöver inget certifierat kassaregister så länge fikets försäljning är ' +
      'skattefri enligt inkomstskattelagen — men det är styrelsen som avgör den frågan, ' +
      'inte systemet.',
    modul: 'ekonomi',
    status: 'planerad',
    ordning: 12,
  },
];
