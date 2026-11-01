// Checklistmallarna: klubbens rutiner, som data.
//
// Låg tidigare inne i fro.mjs, men fröet är inte den enda som behöver dem:
// en förening som redan är i drift ska kunna få de nya listorna utan att
// databasen nollställs. Två kopior av samma rutiner hade börjat glida isär
// första gången någon ändrade en punkt.
//
// Signaturen är densamma som den gamla hjälpfunktionen:
//   mallpost(namn, omfattning, nyckel, intervall, beskrivning, punkter,
//            position_nyckel, extra)
// och punkterna är [text, svarstyp, enhet, hjälptext, obligatorisk,
// säkerhetskritisk].

const mallar = [];
const mallpost = (namn, omfattning, nyckel, intervall, beskrivning, punkter, position_nyckel = null, extra = {}) =>
  mallar.push({ namn, omfattning, nyckel, intervall, beskrivning, punkter, position_nyckel, extra });

  // Ronderna är korta med flit.
  //
  // En checklista på tio punkter blir inte gjord ordentligt – den blir
  // bockad. Tre eller fyra punkter som faktiskt betyder något blir lästa.
  // Allt som inte stoppar backen från att öppna hör hemma någon
  // annanstans: mätvärden i snöläggningsrapporten, iakttagelser i ett
  // ärende, och resten i huvudet på den som gör jobbet.
  //
  // Punkter märkta säkerhetskritisk går inte att lämna obesvarade. Det
  // finns ingen flagga för att tvinga förbi dem.

  // ---- Dagligen: det som avgör om backen får öppna ----

  mallpost('Lift – före öppning', 'utrustningstyp', 'lift', 'dagligen',
    'Alla fyra är säkerhetskritiska. Appen avgör inte om liften får öppna – den som kvitterar gör det.', [
      ['Nödstopp testade i båda ändar', 'bock', null, 'Testa i drift, båda ändar, och känn att linan stannar.', true, true],
      ['Linan ligger rätt i alla block', 'bock', null, null, true, true],
      ['Provkörning utan last genomförd', 'bock', null, null, true, true],
      ['På- och avstigning är plan och fri från is', 'bock', null, null, true, true],
    ], 'backansvarig', { rondtyp: 'liftkontroll_start', kvittens: true });

  mallpost('Bandet – före öppning', 'utrustningstyp', 'band', 'dagligen', null, [
    ['Nödstopp testat', 'bock', null, null, true, true],
    ['Sidoskydd och galler sitter fast', 'bock', null, null, true, true],
    ['Bandytan är fri från is och grus', 'bock'],
  ], 'bandet', { rondtyp: 'bandkontroll', kvittens: true });

  mallpost('Backen – öppning', 'allmant', null, 'dagligen',
    'Backansvarigs sista kontroll innan backen öppnar.', [
      ['Liftkontrollerna är gjorda och kvitterade', 'bock', null, null, true, true],
      ['Hinder i backen är skyddade', 'bock', null, 'Stolpar, lansar, kanoner.', true, true],
      ['Första hjälpen-väska och bår på plats', 'bock', null, null, true, true],
      ['Stängda nedfarter är avspärrade', 'bock'],
    ], 'backansvarig');

  mallpost('Backen – stängning', 'allmant', null, 'dagligen', null, [
    ['Backen avsökt, inga åkande kvar', 'bock', null, null, true, true],
    ['Liftar avstängda och låsta', 'bock'],
    ['Dagens avvikelser är rapporterade', 'bock'],
  ], 'backansvarig');

  mallpost('Fiket – öppning', 'omrade', 'Fiket', 'dagligen', null, [
    ['Kyl och frys håller temperatur', 'bock'],
    ['Handtvätt, tvål och papper finns', 'bock'],
    ['Växelkassan är räknad', 'bock'],
  ], 'fik');

  mallpost('Fiket – stängning', 'omrade', 'Fiket', 'dagligen', null, [
    ['Kassan räknad och avstämd', 'bock'],
    ['Kyl och frys stängda och rena', 'bock'],
    ['Spis och kaffebryggare avstängda', 'bock', null, null, true, true],
  ], 'fik');

  mallpost('Skiduthyrningen – öppning', 'omrade', 'Skiduthyrningen', 'dagligen', null, [
    ['Utrustningen stämmer mot utlåningslistan', 'bock'],
    ['Skadad utrustning är uttagen ur hyllan', 'bock', null, null, true, true],
    ['Bindningsverktyg och momentnyckel finns', 'bock'],
  ], 'uthyrning');

  // ---- Vid start: pistmaskinen ----
  //
  // Körs efter stängning, i mörker, ofta ensam. Därför är avsökningen
  // säkerhetskritisk: en pistmaskin i en backe med folk kvar är det
  // allvarligaste som kan hända här.
  //
  // Nivåkontrollen står först för att den hänger ihop med resten av
  // systemet: tankningen registreras med mätarställning, och det är
  // drifttimmarna serviceplanerna räknar på. Registreras den inte
  // förfaller nästa service för sent.

  mallpost('Pistmaskin – före körning', 'utrustningstyp', 'pistmaskin', 'vid_start',
    'Fyra punkter innan maskinen rullar. Tankningen registreras under Påfyllning, inte här.', [
      ['Nivåer kontrollerade: diesel, hydraulolja, kylarvätska', 'bock', null,
        'Fyll på vid behov och registrera påfyllningen med mätarställning.', true, false],
      ['Inget läckage under maskinen', 'bock', null, 'Titta på marken där den stått.', true, false],
      ['Nödstopp, varningsljus och backvarnare fungerar', 'bock', null, null, true, true],
      ['Nedfarten är avsökt och tom på åkande', 'bock', null,
        'Gäller hela den nedfart som ska pistas, inte bara starten.', true, true],
    ], 'backansvarig', { rondtyp: 'pistmaskin_start' });

  // ---- Vid start av snöläggning ----
  //
  // Positionen och maskinen har var sin lista. Ett läckande vattenuttag
  // stannar på platsen när kanonen byts; ett trasigt munstycke följer med
  // kanonen. Blandar man ihop dem hamnar felet på fel sak.

  mallpost('Lansposition – före start', 'snoplats', null, 'vid_start',
    'Gäller platsen, inte maskinen som står där.', [
      ['Vattenuttaget är tätt och ventilen går att stänga', 'bock'],
      ['Slang och elanslutning är hela', 'bock'],
      ['Positionen är avspärrad från åkande', 'bock', null, null, true, true],
    ], 'snolaggning', { rondtyp: 'lansposition', platsslag: 'lans' });

  mallpost('Fläktposition – före start', 'snoplats', null, 'vid_start', null, [
      ['Vattenuttag och elanslutning är hela', 'bock'],
      ['Jordfelsbrytaren är testad', 'bock'],
      ['Kastriktningen är fri från åkande', 'bock', null, null, true, true],
    ], 'snolaggning', { rondtyp: 'flaktposition', platsslag: 'flakt' });

  mallpost('Lans – före start', 'utrustningstyp', 'lans', 'vid_start',
    'Mätvärdena rapporteras i snöläggningen, inte här.', [
      ['Lansen är riktad efter vindriktningen', 'bock'],
      ['Kopplingar är täta, inget läckage', 'bock'],
      ['Dräneringsventilen är stängd', 'bock'],
      ['Munstycken är rena och fria från is', 'bock'],
    ], 'snolaggning');

  mallpost('Fläkt – före start', 'utrustningstyp', 'flakt', 'vid_start', null, [
      ['Fläkten står stabilt och är uppriktad', 'bock'],
      ['Oscilleringen går fritt i hela rörelsen', 'bock'],
      ['Nukleatorerna ger dimstråle', 'bock'],
      ['Vattenfiltret är rent', 'bock'],
    ], 'snolaggning');

  mallpost('Pumpstation – före start', 'utrustningstyp', 'pumpstation', 'vid_start', null, [
    ['Vattennivån i dammen räcker', 'bock'],
    ['Silar och intag är fria från is och skräp', 'bock'],
    ['Inga larm på styrskåpet', 'bock'],
    ['Inget läckage i pumphuset', 'bock'],
  ], 'snolaggning');


export const CHECKLISTMALLAR = mallar;
