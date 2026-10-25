// Frö: grunddata för HAK:s backe. Kör med --nollstall för att börja om.
//
// Nollställningen tar bort hela databasfilen och bygger upp den på nytt.
// Bokföringen går med flit inte att tömma rad för rad – verifikationer och
// behandlingshistorik har triggrar som vägrar både UPDATE och DELETE.
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nollstall = process.argv.includes('--nollstall');

// Fröet kan läggas i vilken förening som helst: --forening <nyckel>.
const valdForening = (() => {
  const i = process.argv.indexOf('--forening');
  return i > 0 ? process.argv[i + 1] : null;
})();
const { forening: hamtaForening, standardforening } = await import('./foreningar.mjs');
const foreningen = valdForening ? hamtaForening(valdForening) : standardforening();
if (!foreningen) {
  console.error(`Föreningen ${valdForening} finns inte. Se npm run foreningar.`);
  process.exit(1);
}
const sokvag = foreningen.databas;
console.log(`Förening: ${foreningen.namn} (${sokvag})`);

if (nollstall && sokvag !== ':memory:') {
  for (const fil of [sokvag, `${sokvag}-wal`, `${sokvag}-shm`])
    if (existsSync(fil)) {
      rmSync(fil);
      console.log(`Tog bort ${fil}`);
    }
}

const dbmodul = await import('./db.mjs');
const { ROT } = dbmodul;
const handtag = dbmodul.oppna(sokvag);
const { alla, en, kor, spara, transaktion } = dbmodul;
const db = handtag;

// Allt som följer körs i föreningens skal, så att varje skrivning hamnar i
// dess databas även när plattformen bär flera.
const { medSkal } = dbmodul;
const iForeningen = (fn) => medSkal({ db: handtag, forening: foreningen }, fn);
const { hasha } = await import('./auth.mjs');
const { passSlag, plusDagar, veckodag } = await import('./tid.mjs');

const fanns = en('SELECT count(*) AS n FROM medlem').n;
if (fanns && !nollstall) {
  console.log(`Databasen har redan ${fanns} medlemmar. Kör med --nollstall för att skriva om.`);
  process.exit(0);
}

const IDAG = new Date().toLocaleDateString('sv-SE');

iForeningen(() => transaktion(() => {
  // ---------- Medlemmar ----------
  const medlemmar = [
    ['jonas', 'Jonas Lindqvist', 'anlaggningsansvarig', 'jonas@example.com', 0, []],
    ['medlem', 'Medlem Medlemsson', 'medlem', 'medlem@example.com', null, []],
    ['hugo', 'Hugo Wikström', 'admin', 'proj@nattviken.com', 0, []],
    ['annika', 'Annika Sund', 'backansvarig', 'annika@example.com', null, ['backansvarig', 'stora-backen', 'lilla-backen']],
    ['per', 'Per Åkerlund', 'backansvarig', 'per@example.com', null, ['backansvarig', 'snolaggning', 'stora-backen']],
    ['karin', 'Karin Holm', 'medlem', 'karin@example.com', null, ['fik', 'uthyrning']],
    ['stefan', 'Stefan Berg', 'medlem', 'stefan@example.com', null, ['snolaggning', 'stora-backen', 'bandet']],
    ['lotta', 'Lotta Nyberg', 'medlem', 'lotta@example.com', null, ['fik']],
    ['mikael', 'Mikael Ek', 'medlem', 'mikael@example.com', null, ['uthyrning', 'bandet']],
    ['sara', 'Sara Lund', 'medlem', 'sara@example.com', null, []],
    ['tobias', 'Tobias Nord', 'medlem', 'tobias@example.com', null, ['snolaggning', 'lilla-backen']],
    ['emma', 'Emma Dahl', 'medlem', 'emma@example.com', null, ['fik', 'bandet']],
    ['johan', 'Johan Vikner', 'medlem', 'johan@example.com', null, ['stora-backen', 'lilla-backen']],
    ['helena', 'Helena Strand', 'medlem', 'helena@example.com', 12, ['fik', 'uthyrning']],
    ['anders', 'Anders Molin', 'medlem', 'anders@example.com', null, ['snolaggning', 'bandet']],
    ['ingrid', 'Ingrid Sjöberg', 'medlem', 'ingrid@example.com', null, []],
    // Funktionskonton: en inloggning per uppdrag i klubben.
    ['ordforande', 'Ordförande', 'anlaggningsansvarig', 'ordforande@example.com', 0, []],
    ['kassor', 'Kassör', 'medlem', 'kassor@example.com', 0, []],
    ['admin', 'Administratör', 'admin', 'admin@example.com', 0, []],
    ['kiosk', 'Kiosken', 'medlem', 'kiosk@example.com', 0, ['fik']],
    ['uthyrning', 'Skiduthyrningen', 'medlem', 'uthyrning@example.com', 0, ['uthyrning']],
    ['tranare', 'Tränare U10', 'tranare', 'u10@example.com', 0, []],
    ['freeski', 'Tränare Freeski', 'tranare', 'freeski@example.com', 0, []],
    ['fis', 'Tränare FIS', 'tranare', 'fis@example.com', 0, []],
  ];
  const mid = {};
  for (const [i, [anv, namn, roll, epost, kvot, komp]] of medlemmar.entries())
    mid[anv] = spara('medlem', {
      anvandarnamn: anv, namn, roll, epost,
      losenordshash: hasha('hak'),
      kvot_timmar: kvot,
      kompetens: JSON.stringify(komp),
      // Påhittade nummer i 070-serien, så att "ring den som har bandet"
      // går att visa. Byts mot riktiga när matrikeln fylls i.
      telefon: `070-${String(1000000 + i * 1111).slice(0, 3)} ${String(10 + i).slice(0, 2)} ${String(40 + i).slice(0, 2)}`,
    });

  // ---------- Områden ----------
  const omr = {};
  for (const [i, [namn, slag]] of [
    ['Stora backen', 'backe'], ['Lilla backen', 'backe'], ['Bandet', 'lift'],
    ['Stora liften', 'lift'], ['Fiket', 'byggnad'], ['Skiduthyrningen', 'byggnad'],
    ['Pumphuset', 'byggnad'],
  ].entries())
    omr[namn] = spara('omrade', { namn, slag, ordning: i });

  // ---------- Utrustning ----------
  const utr = {};
  const laggTill = (namn, typ, omrade, placering, extra = {}) =>
    (utr[namn] = spara('utrustning', {
      namn, typ, omrade_id: omr[omrade], placering,
      ordning: Object.keys(utr).length, ...extra,
    }));
  for (let i = 1; i <= 8; i++)
    laggTill(`Lans ${i}`, 'lans', 'Stora backen', `Stora backen, position ${i} (${i * 120} m från toppen)`, { munstycken: 12 });
  laggTill('Fläkt 1', 'flakt', 'Stora backen', 'Stora backen, nedre tredjedelen', { munstycken: 24 });
  laggTill('Fläkt 2', 'flakt', 'Stora backen', 'Stora backen, vid målområdet', { munstycken: 24 });
  for (let i = 9; i <= 12; i++)
    laggTill(`Lans ${i}`, 'lans', 'Lilla backen', `Lilla backen, position ${i - 8}`, { munstycken: 8 });
  laggTill('Fläkt 3', 'flakt', 'Lilla backen', 'Lilla backen, vid barnområdet', { munstycken: 18 });
  laggTill('Pumpstation 1', 'pumpstation', 'Pumphuset', 'Pumphuset, huvudpump');
  laggTill('Kompressor 1', 'kompressor', 'Pumphuset', 'Pumphuset, tryckluft');
  laggTill('Stora liften', 'lift', 'Stora liften', 'Släplift, 420 m');
  laggTill('Transportbandet', 'band', 'Bandet', 'Nedre delen av lilla backen');
  laggTill('Pistmaskin', 'pistmaskin', 'Stora backen', 'Garaget');

  // ---------- Checklistor ----------
  let mallordning = 0;
  // Punkt: [text, svarstyp, enhet, hjalptext, obligatorisk, sakerhetskritisk]
  const mall = (namn, omfattning, nyckel, intervall, beskrivning, punkter, position_nyckel = null, extra = {}) => {
    const id = spara('checklistmall', {
      namn, omfattning, intervall, beskrivning, position_nyckel,
      utrustningstyp: omfattning === 'utrustningstyp' ? nyckel : null,
      omrade_id: omfattning === 'omrade' ? omr[nyckel] : null,
      rondtyp: extra.rondtyp || null,
      kraver_kvittens: extra.kvittens ? 1 : 0,
      ordning: mallordning++,
    });
    for (const [i, p] of punkter.entries())
      spara('checklistpunkt', {
        mall_id: id, ordning: i, text: p[0],
        svarstyp: p[1] || 'bock', enhet: p[2] || null,
        hjalptext: p[3] || null, obligatorisk: p[4] === false ? 0 : 1,
        sakerhetskritisk: p[5] === true ? 1 : 0,
      });
    return id;
  };

  mall('Lans – start av snöläggning', 'utrustningstyp', 'lans', 'vid_start',
    'Gå igenom innan vatten släpps på lansen.', [
      ['Wetbulb tillåter produktion (kontrollera i appen)', 'bock', null, 'Under −2,5 °C wetbulb. Rapportera mätningen först.'],
      ['Lansen är riktad rätt efter vindriktningen', 'bock'],
      ['Slangar och kopplingar är hela och utan läckage', 'bock'],
      ['Dräneringsventilen är stängd', 'bock'],
      ['Munstycken är rena och fria från is', 'bock'],
      ['Vattentryck vid lansen', 'varde', 'bar', 'Normalt 25–40 bar.'],
      ['Lufttryck vid lansen', 'varde', 'bar', 'Normalt 6–8 bar.'],
      ['Området runt lansen är avspärrat från åkande', 'bock'],
      ['Elanslutning och kabel är oskadad', 'bock'],
      ['Anteckning om läge och inställning', 'text', null, null, false],
    ], 'snolaggning');

  mall('Lans – tillsyn under drift', 'utrustningstyp', 'lans', 'per_pass',
    'Varannan timme under pågående pass.', [
      ['Snöstrålen träffar rätt och snön är torr', 'bock'],
      ['Ingen isbildning på munstycken', 'bock'],
      ['Lufttemperatur', 'varde', '°C'],
      ['Luftfuktighet', 'varde', '%'],
      ['Vattenflöde', 'varde', 'l/s'],
      ['Inga läckage vid kopplingar', 'bock'],
      ['Snöhögen behöver flyttas av pistmaskin', 'bock', null, 'Bocka om pistmaskinen behöver kallas in.', false],
    ], 'snolaggning');

  mall('Fläkt – start av snöläggning', 'utrustningstyp', 'flakt', 'vid_start',
    'Startrutin för fläktkanon.', [
      ['Wetbulbn tillåter produktion', 'bock'],
      ['Fläkten står stabilt och är uppriktad', 'bock'],
      ['Oscilleringen går fritt i hela rörelsen', 'bock'],
      ['Vattenfilter är rengjort', 'bock'],
      ['Nukleatorer fungerar (kontrollera dimstrålen)', 'bock'],
      ['Kompressortrycket är uppe', 'varde', 'bar'],
      ['Vattenflöde vid start', 'varde', 'l/s'],
      ['Elkabel och jordfelsbrytare kontrollerad', 'bock'],
      ['Inga åkande i kastriktningen', 'bock'],
    ], 'snolaggning');

  mall('Fläkt – daglig tillsyn', 'utrustningstyp', 'flakt', 'dagligen',
    'Görs en gång per dygn under snöläggningssäsong.', [
      ['Ingen is i fläkthuset', 'bock'],
      ['Lager och fläktmotor låter normalt', 'bock'],
      ['Smörjning kontrollerad', 'bock'],
      ['Driftstimmar', 'varde', 'h', null, false],
      ['Avvikelser att rapportera', 'text', null, null, false],
    ], 'snolaggning');

  mall('Pumpstation – start och tillsyn', 'utrustningstyp', 'pumpstation', 'vid_start', null, [
    ['Vattennivå i dammen är tillräcklig', 'bock'],
    ['Nivå i dammen', 'varde', 'cm', null, false],
    ['Silar och intag är fria från is och skräp', 'bock'],
    ['Pumptryck', 'varde', 'bar'],
    ['Inga larm på styrskåpet', 'bock'],
    ['Ingen läckage i pumphuset', 'bock'],
    ['Frostskydd av ledningar kontrollerat', 'bock'],
  ], 'snolaggning');

  mall('Lift – kontroll före öppning', 'utrustningstyp', 'lift', 'dagligen',
    'Kontrollerna märkta säkerhet går inte att hoppa över. Appen avgör inte om liften får ' +
      'öppna – den som kvitterar gör det.', [
      ['Nödstopp testade i båda ändar', 'bock', null, 'Testa i drift, båda ändar, och känn att linan stannar.', true, true],
      ['Linan ligger rätt i alla block', 'bock', null, null, true, true],
      ['Provkörning utan last genomförd', 'bock', null, null, true, true],
      ['På- och avstigning är plan och fri från is', 'bock', null, null, true, true],
      ['Skyltar och avspärrningar på plats', 'bock'],
      ['Kommunikationsradio fungerar', 'bock'],
      ['Liftvärd har genomgått instruktion', 'bock'],
      ['Ovant ljud eller vibration (beskriv)', 'text', null, 'Lämna tomt om allt lät som vanligt.', false],
    ], 'backansvarig', { rondtyp: 'liftkontroll_start', kvittens: true });

  mall('Bandet – daglig säkerhetskontroll', 'utrustningstyp', 'band', 'dagligen', null, [
    ['Nödstopp testat', 'bock', null, null, true, true],
    ['Sidoskydd och galler sitter fast', 'bock', null, null, true, true],
    ['Provkörning genomförd', 'bock', null, null, true, true],
    ['Bandytan är fri från is och grus', 'bock'],
    ['Instruktionsskylt vid påstigning finns', 'bock'],
  ], 'bandet', { rondtyp: 'bandkontroll', kvittens: true });

  mall('Backansvarig – öppning av backen', 'allmant', null, 'dagligen',
    'Backansvarigs rutin innan backen öppnar för allmänheten.', [
      ['Pistning klar och backen besiktad', 'bock'],
      ['Alla hinder är skyddade (stolpar, lansar, kanoner)', 'bock', null, null, true, true],
      ['Nedfarter som är stängda är tydligt avspärrade', 'bock'],
      ['Första hjälpen-väska och bår på plats', 'bock', null, null, true, true],
      ['Liftkontroll är genomförd och kvitterad', 'bock', null, null, true, true],
      ['Bemanning på plats enligt schema', 'bock'],
      ['Snödjup representativt mätvärde', 'varde', 'cm', null, false],
      ['Information till åkande uppdaterad (skyltar/webb)', 'bock', null, null, false],
    ], 'backansvarig');

  mall('Backansvarig – stängning', 'allmant', null, 'dagligen', null, [
    ['Backen avsökt, inga åkande kvar', 'bock'],
    ['Liftar avstängda och låsta', 'bock'],
    ['Avspärrningar inför natten på plats', 'bock'],
    ['Incidenter rapporterade som ärenden', 'bock'],
    ['Pistningsbehov anmält', 'bock', null, null, false],
  ], 'backansvarig');

  mall('Fiket – öppning', 'omrade', 'Fiket', 'dagligen', null, [
    ['Kyl- och frystemperatur kontrollerad', 'varde', '°C'],
    ['Handtvätt och hygienrutiner på plats', 'bock'],
    ['Kassa och kortterminal fungerar', 'bock'],
    ['Växelkassa räknad', 'bock'],
    ['Varor påfyllda', 'bock'],
    ['Brandsläckare och utrymningsväg fria', 'bock'],
  ], 'fik');

  mall('Fiket – stängning', 'omrade', 'Fiket', 'dagligen', null, [
    ['Kassa räknad och avstämd', 'bock'],
    ['Kyl och frys stängda och rena', 'bock'],
    ['Diskat och avtorkat', 'bock'],
    ['Sopor utkastade', 'bock'],
    ['Lås och larm', 'bock'],
  ], 'fik');

  mall('Skiduthyrningen – öppning', 'omrade', 'Skiduthyrningen', 'dagligen', null, [
    ['Utrustning uppräknad mot utlåningslistan', 'bock'],
    ['Skadad utrustning uttagen ur hyllan', 'bock'],
    ['Bindningstestare kalibrerad', 'bock'],
    ['Hjälmar kontrollerade', 'bock'],
    ['Kassa och hyreskontrakt framme', 'bock'],
  ], 'uthyrning');

  // ---------- Positioner ----------
  const pos = {};
  for (const [i, [nyckel, namn, kortnamn, farg, kravs]] of [
    ['backansvarig', 'Backansvarig', 'BACK', '#d98b45', 'backansvarig'],
    ['stora-backen', 'Stora backen', 'STOR', '#5b8ac6', null],
    ['lilla-backen', 'Lilla backen', 'LILL', '#67a97f', null],
    ['bandet', 'Bandet', 'BAND', '#8e7cc3', null],
    ['fik', 'Fiket', 'FIK', '#c96d8b', null],
    ['uthyrning', 'Skiduthyrning', 'UTH', '#4fa3a5', null],
    ['snolaggning', 'Snöläggning', 'SNÖ', '#6c8ebf', null],
    ['extra', 'Extra resurs', 'EXTRA', '#8a8f98', null],
  ].entries())
    pos[nyckel] = spara('position', { nyckel, namn, kortnamn, farg, ordning: i, kravs_roll: kravs });

  // ---------- Säsong ----------
  spara('sasong', {
    namn: '2026/27', start: '2026-10-01', slut: '2027-04-30',
    kvot_timmar: 20, kvot_nattpass: 2, aktiv: 1,
  });

  // ---------- Pass: fem veckor framåt ----------
  const nyttPass = (datum, start, slut, nyckel, behov, anteckning = null) =>
    spara('pass', {
      datum, start, slut, position_id: pos[nyckel], behov,
      slag: passSlag(start, slut), publicerad: 1, anteckning,
      vikt: passSlag(start, slut) === 'natt' ? 1.5 : 1,
    });

  for (let d = 0; d < 35; d++) {
    const datum = plusDagar(IDAG, d);
    const dag = veckodag(datum);
    const helg = dag >= 5;
    // Snöläggning körs natt, hela veckan under kalla perioder.
    nyttPass(datum, '22:00', '02:00', 'snolaggning', 2, 'Nattpass snöläggning');
    nyttPass(datum, '06:00', '10:00', 'snolaggning', 1, 'Morgontillsyn lansar och fläktar');
    if (helg) {
      nyttPass(datum, '09:00', '13:00', 'backansvarig', 1);
      nyttPass(datum, '13:00', '17:00', 'backansvarig', 1);
      nyttPass(datum, '09:30', '13:30', 'stora-backen', 2);
      nyttPass(datum, '13:30', '17:00', 'stora-backen', 2);
      nyttPass(datum, '09:30', '13:30', 'lilla-backen', 1);
      nyttPass(datum, '13:30', '17:00', 'lilla-backen', 1);
      nyttPass(datum, '09:30', '13:30', 'bandet', 1);
      nyttPass(datum, '13:30', '17:00', 'bandet', 1);
      nyttPass(datum, '09:00', '13:30', 'fik', 2);
      nyttPass(datum, '13:30', '17:30', 'fik', 2);
      nyttPass(datum, '09:00', '13:30', 'uthyrning', 1);
      nyttPass(datum, '13:30', '17:30', 'uthyrning', 1);
      nyttPass(datum, '10:00', '15:00', 'extra', 1, 'Vid behov');
    } else if (dag >= 1 && dag <= 4) {
      // Kvällsåkning tisdag–fredag.
      nyttPass(datum, '17:00', '21:00', 'backansvarig', 1);
      nyttPass(datum, '17:00', '21:00', 'stora-backen', 1);
      nyttPass(datum, '17:00', '21:00', 'lilla-backen', 1);
      nyttPass(datum, '17:00', '21:00', 'fik', 1);
      nyttPass(datum, '17:00', '21:00', 'bandet', 1);
    }
  }

  // ---------- Några bokningar, så rutnätet inte är tomt ----------
  const passFor = (datum, nyckel) =>
    alla('SELECT * FROM pass WHERE datum=? AND position_id=? ORDER BY start', datum, pos[nyckel]);
  const boka = (datum, nyckel, anv, i = 0, status = 'bokad') => {
    const p = passFor(datum, nyckel)[i];
    if (p) spara('bokning', { pass_id: p.id, medlem_id: mid[anv], status, kalla: 'sjalv' });
  };
  for (let d = 0; d < 14; d++) {
    const datum = plusDagar(IDAG, d);
    const dag = veckodag(datum);
    if (dag >= 5) {
      boka(datum, 'backansvarig', d % 2 ? 'annika' : 'per');
      boka(datum, 'fik', 'karin');
      boka(datum, 'fik', 'lotta', 1);
      boka(datum, 'uthyrning', 'mikael');
      boka(datum, 'stora-backen', 'johan');
    }
    if (d % 3 === 0) boka(datum, 'snolaggning', 'stefan');
    if (d % 4 === 0) boka(datum, 'snolaggning', 'tobias', 1);
  }

  // ---------- Otillgänglighet ----------
  spara('otillganglighet', { medlem_id: mid.sara, fran: plusDagar(IDAG, 3), till: plusDagar(IDAG, 10), orsak: 'Bortrest' });
  spara('otillganglighet', { medlem_id: mid.emma, fran: plusDagar(IDAG, 1), till: plusDagar(IDAG, 2), orsak: 'Jobbresa' });

  // ---------- Genomförda insatser ----------
  for (const [anv, timmar, slag, bes] of [
    ['annika', 8, 'arbetsdag', 'Höstarbetsdag: röjning och stolpflytt'],
    ['per', 10, 'snolaggning', 'Förberedelse pumphus och slangdragning'],
    ['karin', 4, 'arbetsdag', 'Städning fik'],
    ['stefan', 6, 'snolaggning', 'Slangdragning stora backen'],
    ['johan', 4, 'arbetsdag', 'Målning av liftstolpar'],
    ['mikael', 5, 'arbetsdag', 'Service av hyrskidor'],
  ])
    spara('insats', { medlem_id: mid[anv], datum: plusDagar(IDAG, -12), timmar, slag, beskrivning: bes });

  // ---------- Snöpass och mätningar ----------
  const snopassId = spara('snopass', {
    start: `${plusDagar(IDAG, -1)} 21:30`, ansvarig_id: mid.per, status: 'pagar',
    anteckning: 'Första kylan. Kör lansar 1–5 och fläkt 1.',
  });
  const matning = (timmarBak, utrustning, temp, fukt, flode, extra = {}) => {
    const t = new Date(Date.now() - timmarBak * 3.6e6).toISOString().slice(0, 19).replace('T', ' ');
    spara('matning', {
      tid: t, snopass_id: snopassId, utrustning_id: utr[utrustning],
      omrade_id: en('SELECT omrade_id FROM utrustning WHERE id=?', utr[utrustning]).omrade_id,
      lufttemp: temp, luftfukt: fukt, vattenflode: flode,
      vattentryck: extra.vattentryck ?? 32, lufttryck: extra.lufttryck ?? 7.2,
      barometer: extra.barometer ?? 1012, vind_styrka: extra.vind ?? 2.5,
      vind_riktning: extra.riktning ?? 'NV', snokvalitet: extra.kvalitet ?? 'normal',
      anteckning: extra.anteckning ?? null, av_id: mid[extra.av || 'per'],
    });
  };
  const serie = [
    [14, -4.5, 72, 6.2], [12, -5.2, 70, 6.6], [10, -6.1, 66, 7.1],
    [8, -7.4, 61, 7.6], [6, -8.2, 58, 7.8], [4, -7.1, 63, 7.4],
    [2, -5.8, 69, 6.8], [1, -4.9, 74, 6.3],
  ];
  for (const [h, temp, fukt, flode] of serie) {
    matning(h, 'Lans 1', temp, fukt, flode);
    matning(h, 'Lans 3', temp + 0.2, fukt - 1, flode - 0.4);
    matning(h, 'Fläkt 1', temp - 0.1, fukt, flode * 3.4, { vattentryck: 28, kvalitet: 'torr', av: 'stefan' });
  }
  matning(0.5, 'Lans 5', -3.9, 78, 5.4, { kvalitet: 'blot', anteckning: 'Blir blöt snö, drar ner vattnet', av: 'stefan' });

  // ---------- Ärenden ----------
  const arende = (titel, data) => {
    const id = spara('arende', {
      titel, skapad_av_id: mid[data.av || 'annika'],
      beskrivning: data.beskrivning, typ: data.typ || 'fel',
      prioritet: data.prioritet || 3, allvarlighet: data.allvarlighet || 'begransar',
      status: data.status || 'ny', utrustning_id: data.utrustning ? utr[data.utrustning] : null,
      omrade_id: data.omrade ? omr[data.omrade] : null,
      tilldelad_id: data.tilldelad ? mid[data.tilldelad] : null,
      komponent_id: data.komponent ? komp[data.komponent] : null,
      kostnad_ore: data.kostnad_ore || null,
      driftpaverkan: data.driftpaverkan || null,
      deadline: data.deadline || null,
    });
    spara('arendehandelse', { arende_id: id, av_id: mid[data.av || 'annika'], slag: 'kommentar', text: 'Ärendet skapades' });
    if (data.kommentar)
      spara('arendehandelse', { arende_id: id, av_id: mid[data.tilldelad || 'per'], slag: 'kommentar', text: data.kommentar });
    return id;
  };
  // Komponenter och leverantörer: fel ska kunna sättas på backventilen, inte
  // bara på kanonen, annars går återkommande fel inte att se.
  const lev = {};
  for (const [namn, kontakt, telefon, epost] of [
    ['Snökraft AB', 'Reservdelar snökanoner', '060-12 34 56', 'delar@snokraft.test'],
    ['Liftservice Nord', 'Besiktning och lifttillbehör', '0611-22 33 44', 'service@liftnord.test'],
    ['Härnösands Rör', 'Vatten och ventiler', '0611-55 66 77', 'order@harnorör.test'],
  ])
    lev[namn] = spara('leverantor', { namn, kontakt, telefon, epost });

  const komp = {};
  const komponent = (utrustning, namn, slag, leverantor, artikelnummer = null) => {
    const id = spara('komponent', {
      utrustning_id: utr[utrustning], namn, slag,
      leverantor_id: leverantor ? lev[leverantor] : null,
      artikelnummer,
      ordning: Object.keys(komp).length,
    });
    komp[`${utrustning}/${namn}`] = id;
    return id;
  };
  for (const kanon of ['Fläkt 1', 'Fläkt 2', 'Fläkt 3']) {
    komponent(kanon, 'Huvudaggregat', 'motor', 'Snökraft AB');
    komponent(kanon, 'Vattenventil', 'ventil', 'Härnösands Rör', 'HV-22');
    komponent(kanon, 'Luftventil', 'ventil', 'Härnösands Rör', 'HL-18');
    komponent(kanon, 'Backventil', 'ventil', 'Härnösands Rör', 'HB-15');
    komponent(kanon, 'Vattenfilter', 'filter', 'Snökraft AB', 'SF-90');
    komponent(kanon, 'Nukleatorer', 'ovrigt', 'Snökraft AB');
    komponent(kanon, 'Elskåp och kabel', 'el', null);
  }
  for (const lans of ['Lans 4', 'Lans 7']) {
    komponent(lans, 'Munstycksring', 'ovrigt', 'Snökraft AB');
    komponent(lans, 'Koppling mot stamledning', 'ovrigt', 'Härnösands Rör', 'HK-40');
    komponent(lans, 'Dräneringsventil', 'ventil', 'Härnösands Rör');
  }
  komponent('Stora liften', 'Drivstation', 'motor', 'Liftservice Nord');
  komponent('Stora liften', 'Nödstoppskrets', 'el', 'Liftservice Nord', 'LN-STOP-2');
  komponent('Stora liften', 'Lina och block', 'ovrigt', 'Liftservice Nord');
  komponent('Stora liften', 'Brytpinnar', 'ovrigt', 'Liftservice Nord', 'LN-BP-6');
  komponent('Transportbandet', 'Nödstopp nedre', 'el', 'Liftservice Nord');
  komponent('Transportbandet', 'Bandmatta', 'ovrigt', 'Liftservice Nord');
  komponent('Pumpstation 1', 'Huvudpump', 'motor', 'Härnösands Rör');
  komponent('Pumpstation 1', 'Filterhus', 'filter', 'Härnösands Rör', 'HF-120');
  komponent('Kompressor 1', 'Kompressorpaket', 'motor', 'Snökraft AB');

  arende('Läckage i koppling vid Lans 4', {
    beskrivning: 'Vatten sprutar ur kopplingen mot stamledningen. Lansen är avstängd.',
    typ: 'fel', prioritet: 1, allvarlighet: 'driftstopp', status: 'pagar',
    utrustning: 'Lans 4', omrade: 'Stora backen', tilldelad: 'per', av: 'stefan',
    komponent: 'Lans 4/Koppling mot stamledning',
    driftpaverkan: 'Lans 4 ur drift, produktionen flyttad till lans 5–6',
    kommentar: 'Ny packning beställd, kommer på torsdag.',
  });
  arende('Nödstopp i nedre änden av bandet trögt', {
    beskrivning: 'Går att trycka in men fjädrar inte tillbaka. Säkerhetsrisk.',
    typ: 'risk', prioritet: 1, allvarlighet: 'sakerhetsrisk', status: 'bekraftad',
    utrustning: 'Transportbandet', omrade: 'Bandet', tilldelad: 'annika',
    komponent: 'Transportbandet/Nödstopp nedre',
    driftpaverkan: 'Bandet körs inte förrän nödstoppet är bytt',
  });
  arende('Fläkt 2 oscillerar inte i hela rörelsen', {
    beskrivning: 'Stannar ungefär 20 grader för tidigt åt höger.',
    typ: 'fel', prioritet: 2, allvarlighet: 'begransar', status: 'ny',
    utrustning: 'Fläkt 2', omrade: 'Stora backen', av: 'stefan',
  });
  arende('Kylen i fiket håller inte temperaturen', {
    beskrivning: 'Visade +9 °C vid öppning. Termometer kontrollerad.',
    typ: 'fel', prioritet: 2, allvarlighet: 'begransar', status: 'vantar',
    omrade: 'Fiket', tilldelad: 'karin', av: 'lotta',
  });
  arende('Skylt om avspärrning vid Lans 7 saknas', {
    beskrivning: 'Blåste bort. Behöver ny skylt och buntband.',
    typ: 'brist', prioritet: 3, allvarlighet: 'kosmetisk', status: 'ny',
    utrustning: 'Lans 7', omrade: 'Stora backen',
  });
  arende('Önskemål: fler krokar i uthyrningen', {
    beskrivning: 'Pjäxor hamnar på golvet när det är kö.',
    typ: 'forbattring', prioritet: 4, allvarlighet: 'kosmetisk', status: 'ny',
    omrade: 'Skiduthyrningen', av: 'mikael',
  });
  const stangt = arende('Belysningen i lilla backen blinkade', {
    beskrivning: 'Glappkontakt i stolpe 3.',
    typ: 'fel', prioritet: 2, allvarlighet: 'begransar', status: 'stangd',
    omrade: 'Lilla backen', tilldelad: 'per',
  });
  kor(
    `UPDATE arende SET skapad=?, stangd=?, uppdaterad=? WHERE id=?`,
    `${plusDagar(IDAG, -9)} 18:00`, `${plusDagar(IDAG, -6)} 12:00`, `${plusDagar(IDAG, -6)} 12:00`, stangt
  );

  // ---------- Fel som återkommer ----------
  // Fyra fel på samma backventil under två säsonger. Det är den här
  // historiken som gör att mönstervyn har något att visa – och som i
  // verkligheten är argumentet för att byta hela ventilen.
  for (const [dagarSedan, kostnad, text] of [
    [412, 48000, 'Backventilen på Fläkt 2 läcker tillbaka vid avstängning'],
    [341, 52000, 'Backventilen på Fläkt 2 läcker igen efter 70 drifttimmar'],
    [96, 61500, 'Backventilen på Fläkt 2 läcker, tredje gången'],
    [24, 61500, 'Backventilen på Fläkt 2 läcker på nytt'],
  ]) {
    const id = arende(text, {
      beskrivning: 'Samma ventil som tidigare. Byttes mot ny av samma modell.',
      typ: 'fel', prioritet: 2, allvarlighet: 'driftstopp', status: 'stangd',
      utrustning: 'Fläkt 2', omrade: 'Stora backen', tilldelad: 'per', av: 'stefan',
      komponent: 'Fläkt 2/Backventil', kostnad_ore: kostnad,
    });
    kor(
      `UPDATE arende SET skapad=?, stangd=?, uppdaterad=? WHERE id=?`,
      `${plusDagar(IDAG, -dagarSedan)} 09:00`,
      `${plusDagar(IDAG, -dagarSedan + 3)} 15:00`,
      `${plusDagar(IDAG, -dagarSedan + 3)} 15:00`,
      id
    );
  }

  // ---------- Driftjournal ----------
  // Journalen får en vecka bakåt, så att Jonas ser hur den läses.
  const journalpost = (dagarSedan, klocka, slag, av, text, extra = {}) =>
    spara('driftpost', {
      tid: `${plusDagar(IDAG, -dagarSedan)} ${klocka}`,
      skapad: `${plusDagar(IDAG, -dagarSedan)} ${klocka}`,
      slag, av_id: mid[av], text,
      utrustning_id: extra.utrustning ? utr[extra.utrustning] : null,
      komponent_id: extra.komponent ? komp[extra.komponent] : null,
      omrade_id: extra.omrade ? omr[extra.omrade] : null,
      kalla: extra.kalla || 'mobil',
      bekraftad: `${plusDagar(IDAG, -dagarSedan)} ${klocka}`,
      bekraftad_av_id: mid[av],
      transkript: extra.transkript || null,
    });

  journalpost(6, '07:40', 'rond', 'annika', 'Lift – kontroll före öppning, kvitterad driftklar',
    { utrustning: 'Stora liften', omrade: 'Stora liften' });
  journalpost(5, '22:15', 'atgard', 'stefan',
    'Avisade munstyckena på lans 9 och 10. Snön blev torr igen efteråt.',
    { utrustning: 'Lans 9', omrade: 'Lilla backen',
      transkript: 'Jag har gått snöronden, lans nio och tio hade isat igen lite men jag avisade dem, allt annat såg bra ut' });
  journalpost(4, '06:20', 'observation', 'per',
    'Ovant ljud från drivstationen vid uppstart. Försvann efter ett par minuter – håll ögonen på den.',
    { utrustning: 'Stora liften', komponent: 'Stora liften/Drivstation', omrade: 'Stora liften' });
  journalpost(3, '23:50', 'matning', 'stefan', 'Mätning vid lans 4: wetbulb −6,2, trycket stabilt',
    { utrustning: 'Lans 4', omrade: 'Stora backen' });
  journalpost(2, '08:05', 'atgard', 'per',
    'Bytte backventilen på Fläkt 2 igen. Fjärde gången – vi behöver titta på hela ventilhuset.',
    { utrustning: 'Fläkt 2', komponent: 'Fläkt 2/Backventil', omrade: 'Stora backen' });
  journalpost(1, '16:30', 'observation', 'annika',
    'Isfläck vid påstigningen på bandet. Sandade och spärrade av tills det tinat.',
    { utrustning: 'Transportbandet', omrade: 'Bandet' });

  // ---------- En incident, så att uppföljningen går att visa ----------
  const inc = spara('incident', {
    tid: `${plusDagar(IDAG, -4)} 14:20`,
    slag: 'gastincident',
    plats: 'Teknikbacken, ojämnt parti nedanför mellanstationen',
    omrade_id: omr['Lilla backen'],
    beskrivning:
      'Skidåkare tappade balansen i det ojämna partiet och ramlade. Backpersonalen hjälpte ner personen till fiket.',
    uppgiven_orsak: 'Åkaren uppgav att hen inte sett gropen.',
    forhallanden: '−3 °C, nysnö ovanpå hård pist, god sikt',
    insatser: 'Första hjälpen på plats, åkte ner med pulka, anhörig kontaktad av åkaren själv.',
    personal: 'Annika Ask (backansvarig), Lotta Lund (fiket)',
    person_alder: 14,
    skada: 'Ont i axeln, åkte själv till vårdcentralen',
    rapporterad_av_id: mid.annika,
    uppfoljning_av_id: mid.jonas,
    status: 'granskad',
    gallras: plusDagar(IDAG, 365 * 3),
  });
  spara('driftpost', {
    tid: `${plusDagar(IDAG, -4)} 14:20`,
    slag: 'incident', av_id: mid.annika, incident_id: inc,
    omrade_id: omr['Lilla backen'],
    text: 'gastincident rapporterad – Teknikbacken, ojämnt parti nedanför mellanstationen',
    bekraftad: `${plusDagar(IDAG, -4)} 14:25`,
    bekraftad_av_id: mid.annika,
    kalla: 'mobil',
  });

  // ---------- Underhåll: serviceplaner, årshjul och reservdelar ----------
  const plan = (namn, utrustning, data) =>
    spara('serviceplan', {
      utrustning_id: utr[utrustning],
      komponent_id: data.komponent ? komp[data.komponent] : null,
      namn,
      instruktion: data.instruktion || null,
      intervalltyp: data.typ,
      intervall: data.intervall ?? null,
      manad: data.manad ?? null,
      kompetens: data.kompetens || null,
      kritisk: data.kritisk ? 1 : 0,
      status: 'godkand',
      godkand_av_id: mid.jonas,
      godkand_tid: `${plusDagar(IDAG, -200)} 10:00`,
      senast_utford: data.senast ? plusDagar(IDAG, -data.senast) : null,
      senast_timmar: data.senast_timmar ?? null,
      av_id: mid.jonas,
    });

  plan('Byt vattenfilter', 'Fläkt 1', {
    typ: 'drifttimmar', intervall: 500, senast_timmar: 1200, komponent: 'Fläkt 1/Vattenfilter',
    instruktion: 'Stäng vattnet, lossa filterhuset, byt insats, lufta.',
  });
  plan('Byt vattenfilter', 'Fläkt 2', {
    typ: 'drifttimmar', intervall: 500, senast_timmar: 900, komponent: 'Fläkt 2/Vattenfilter',
  });
  plan('Smörj oscillationslagret', 'Fläkt 1', { typ: 'manader', intervall: 3, senast: 100 });
  plan('Smörj oscillationslagret', 'Fläkt 2', { typ: 'manader', intervall: 3, senast: 20 });
  plan('Årlig liftbesiktning', 'Stora liften', {
    typ: 'sasong', manad: 11, kritisk: 1, kompetens: 'behörig lifttekniker', senast: 350,
    instruktion: 'Besiktning enligt tillverkarens anvisning. Protokollet laddas upp som dokument.',
  });
  plan('Kontroll av lina och block', 'Stora liften', {
    typ: 'manader', intervall: 1, kritisk: 1, senast: 45, komponent: 'Stora liften/Lina och block',
  });
  plan('Service av kompressor', 'Kompressor 1', {
    typ: 'drifttimmar', intervall: 1000, senast_timmar: 3100, kompetens: 'kyltekniker',
  });
  plan('Rengöring av filterhus', 'Pumpstation 1', {
    typ: 'manader', intervall: 6, senast: 150, komponent: 'Pumpstation 1/Filterhus',
  });
  plan('Genomgång efter säsong', 'Pistmaskin', { typ: 'sasong', manad: 4, senast: 190 });
  plan('Kontroll efter varje driftstopp', 'Transportbandet', {
    typ: 'handelse', instruktion: 'Gås igenom innan bandet startas om.',
  });

  // Drifttimmar, så att de timbaserade planerna har något att räkna på.
  for (const [namn, timmar] of [['Fläkt 1', 1640], ['Fläkt 2', 1180], ['Kompressor 1', 3820], ['Stora liften', 7400]])
    kor('UPDATE utrustning SET drifttimmar=? WHERE id=?', timmar, utr[namn]);

  // Ett par utförda arbeten, så kostnadsuppföljningen inte är tom.
  for (const [namn, utrustning, dagarSedan, kostnad, timmar] of [
    ['Smörj oscillationslagret', 'Fläkt 2', 20, 0, 1],
    ['Rengöring av filterhus', 'Pumpstation 1', 150, 180000, 4],
    ['Årlig liftbesiktning', 'Stora liften', 350, 1450000, 8],
  ]) {
    const p = en('SELECT id FROM serviceplan WHERE namn=? AND utrustning_id=?', namn, utr[utrustning]);
    const a = spara('serviceatgard', {
      serviceplan_id: p?.id ?? null,
      utrustning_id: utr[utrustning],
      namn,
      planerad: plusDagar(IDAG, -dagarSedan),
      utford: plusDagar(IDAG, -dagarSedan),
      status: 'utford',
      av_id: mid.jonas,
      utford_av_id: mid.per,
      arbetstimmar: timmar,
      kostnad_ore: kostnad,
    });
    void a;
  }

  spara('hogbelastning', {
    namn: 'Jul och nyår', fran: `${IDAG.slice(0, 4)}-12-22`, till: `${Number(IDAG.slice(0, 4)) + 1}-01-07`,
    anteckning: 'Backen går för fullt. Planerat underhåll läggs före eller efter.',
  });
  spara('hogbelastning', {
    namn: 'Sportlovet', fran: `${Number(IDAG.slice(0, 4)) + 1}-02-22`, till: `${Number(IDAG.slice(0, 4)) + 1}-03-01`,
  });

  const del = (namn, data) => {
    const id = spara('reservdel', {
      namn,
      artikelnummer: data.artikelnummer || null,
      leverantor_id: lev[data.leverantor] ?? null,
      enhet: data.enhet || 'st',
      pris_ore: data.pris ?? null,
      pris_datum: data.pris ? plusDagar(IDAG, -60) : null,
      lager: data.lager ?? 0,
      minlager: data.minlager ?? 0,
      placering: data.placering || null,
    });
    for (const k of data.passar || [])
      spara('reservdelspassning', { reservdel_id: id, utrustning_id: utr[k[0]], komponent_id: k[1] ? komp[`${k[0]}/${k[1]}`] : null });
    return id;
  };

  const filter = del('Vattenfilter FK-200', {
    artikelnummer: 'SF-90', leverantor: 'Snökraft AB', pris: 25000, lager: 3, minlager: 2,
    placering: 'Hyllan i pumphuset',
    passar: [['Fläkt 1', 'Vattenfilter'], ['Fläkt 2', 'Vattenfilter'], ['Fläkt 3', 'Vattenfilter']],
  });
  const backventil = del('Backventil HB-15', {
    artikelnummer: 'HB-15', leverantor: 'Härnösands Rör', pris: 61500, lager: 1, minlager: 2,
    placering: 'Pumphuset, lådan',
    passar: [['Fläkt 2', 'Backventil']],
  });
  del('Brytpinne till lift', {
    artikelnummer: 'LN-BP-6', leverantor: 'Liftservice Nord', pris: 8900, lager: 12, minlager: 6,
    placering: 'Liftkuren', passar: [['Stora liften', 'Brytpinnar']],
  });
  del('Packning kopplingar 2 tum', {
    artikelnummer: 'HK-40P', leverantor: 'Härnösands Rör', pris: 4500, lager: 20, minlager: 10,
    enhet: 'st', placering: 'Verkstaden',
  });

  for (const [delId, antal, dagarSedan] of [[filter, 1, 150], [filter, 1, 20], [backventil, 1, 24], [backventil, 1, 96]])
    spara('reservdelsuttag', {
      reservdel_id: delId, antal, pris_ore: delId === filter ? 25000 : 61500,
      tid: `${plusDagar(IDAG, -dagarSedan)} 10:00`, av_id: mid.per,
    });

  // ---------- Snöplanering: vad medlemmarna sagt om säsongen ----------
  const sasongId = en('SELECT id FROM sasong WHERE aktiv=1')?.id;
  if (sasongId) {
    const svar = [
      ['stefan', 'garna', 1, 1, null], ['per', 'garna', 1, 1, 3], ['annika', 'garna', 1, 1, null],
      ['karin', 'kanske', 0, 1, 2], ['mikael', 'kanske', 1, 0, null], ['lotta', 'vid_brist', 0, 1, 1],
      ['johan', 'kanske', 1, 1, null], ['elin', 'vid_brist', 0, 0, 1],
    ];
    for (const [namn, niva, natt, helg, tak] of svar)
      if (mid[namn])
        spara('tillganglighet', {
          medlem_id: mid[namn], sasong_id: sasongId, niva, nattpass: natt, helger: helg, max_pass: tak,
          kommentar: niva === 'vid_brist' ? 'Hör av er om det kniper' : null,
        });
  }

  // ---------- Kioskens sortiment ----------
  // Priser är klubbens egna och ska stämmas av mot kassan före säsongsstart.
  let artikelordning = 0;
  const artikel = (namn, kategori, kronor, emoji, beskrivning = null) =>
    spara('artikel', {
      namn, kategori, pris_ore: Math.round(kronor * 100), emoji, beskrivning,
      ordning: artikelordning++,
    });

  for (const [namn, kronor, emoji, bes] of [
    ['Varmkorv med bröd', 30, '🌭', null],
    ['Varmkorv med bröd och mos', 45, '🌭', 'Potatismos och rostad lök'],
    ['Dubbel varmkorv', 50, '🌭', 'Två korvar, ett bröd'],
    ['Varm macka ost och skinka', 55, '🥪', 'Grillad i kontaktgrill'],
    ['Toast special', 65, '🥪', 'Skinka, ost, ananas'],
    ['Billys panpizza', 45, '🍕', 'Original eller kebab'],
    ['Nudlar', 35, '🍜', 'Kyckling eller grönsak'],
    ['Dagens soppa med bröd', 60, '🥣', 'Fråga i luckan vilken sort'],
  ])
    artikel(namn, 'mat', kronor, emoji, bes);

  for (const [namn, kronor, emoji, bes] of [
    ['Kaffe', 25, '☕', null],
    ['Te', 25, '🍵', null],
    ['Varm choklad', 30, '🍫', null],
    ['Varm choklad med grädde', 35, '🍫', null],
    ['Läsk 33 cl', 25, '🥤', null],
    ['Vatten 50 cl', 20, '💧', null],
    ['Energidryck', 35, '⚡', null],
    ['Saft', 15, '🧃', null],
  ])
    artikel(namn, 'dryck', kronor, emoji, bes);

  for (const [namn, kronor, emoji, bes] of [
    ['Kanelbulle', 25, '🥐', null],
    ['Chokladboll', 20, '🍪', null],
    ['Våffla med sylt och grädde', 45, '🧇', 'Serveras lördag och söndag'],
    ['Mazarin', 25, '🧁', null],
  ])
    artikel(namn, 'fika', kronor, emoji, bes);

  for (const [namn, kronor, emoji] of [
    ['Lösgodis 100 g', 20, '🍬'],
    ['Chokladbit', 20, '🍫'],
    ['Chips', 25, '🥔'],
    ['Glass', 25, '🍦'],
  ])
    artikel(namn, 'godis', kronor, emoji, null);

  for (const [namn, kronor, bes] of [
    ['Dagkort vuxen', 270, '18–64 år'],
    ['Dagkort ungdom/senior', 250, '8–17 år och 65+'],
    ['Eftermiddagskort vuxen', 140, 'Efter kl 13.30'],
    ['Eftermiddagskort ungdom/senior', 120, 'Efter kl 13.30'],
    ['Kvällskort vuxen', 180, null],
    ['Kvällskort ungdom/senior', 155, null],
    ['Barnbacken', 150, 'Gäller barnbacken hela dagen'],
    ['Barnbacken efter 13.30 och kväll', 90, null],
  ])
    artikel(namn, 'liftkort', kronor, '🎟️', bes);

  // ---------- Uthyrningens prislista ----------
  // Hämtad från harnosandsalpina.se/skiduthyrningen. Stäm av före säsongen.
  let hyresordning = 0;
  const TIDER = ['halvdag', 'heldag', 'tvadagar', 'tredagar', 'vecka'];
  const hyra = (grupp, namn, aldersgrupp, kronor) =>
    TIDER.forEach((tid, i) =>
      spara('hyrespris', {
        grupp, namn, aldersgrupp, tid,
        pris_ore: Math.round(kronor[i] * 100),
        ordning: hyresordning++,
      })
    );

  hyra('paket', 'Paket slalom/snowboard', 'vuxen', [170, 220, 330, 550, 880]);
  hyra('paket', 'Paket slalom/snowboard', 'ungdom', [110, 170, 220, 330, 660]);
  hyra('paket', 'Paket slalom/snowboard', 'barn', [90, 110, 200, 280, 440]);
  hyra('utrustning', 'Skidor eller snowboard', 'vuxen', [110, 170, 220, 330, 660]);
  hyra('utrustning', 'Skidor eller snowboard', 'ungdom', [90, 110, 170, 280, 440]);
  hyra('utrustning', 'Skidor eller snowboard', 'barn', [60, 90, 130, 220, 330]);
  hyra('utrustning', 'Pjäxor eller boots', 'alla', [70, 90, 150, 200, 275]);
  hyra('tillbehor', 'Hjälm', 'alla', [50, 60, 80, 100, 120]);
  hyra('tillbehor', 'Stavar', 'alla', [50, 60, 80, 100, 120]);
  hyra('tillbehor', 'Skidglasögon', 'alla', [50, 60, 80, 100, 120]);

  // ---------- Föreningen: sektioner, grupper och uppdrag ----------
  const sektion = {};
  for (const [i, [nyckel, namn, beskrivning]] of [
    ['alpint', 'Alpint', 'Träning och tävling i slalom, storslalom och super-G'],
    ['freeride', 'Freeride', 'Friåkning, hopp och park'],
    ['minialpina', 'Minialpina', 'Skidlek och första kurvorna för de yngsta'],
    ['anlaggning', 'Anläggning', 'Backen, liftarna och snöläggningen'],
  ].entries())
    sektion[nyckel] = spara('sektion', { nyckel, namn, beskrivning, ordning: i });

  const grupp = {};
  for (const [i, [namn, sekt, aldersspann, dag, tid]] of [
    ['Minialpina 4–6 år', 'minialpina', '4–6 år', 'Söndag', '10:00–11:30'],
    ['U8', 'alpint', '7–8 år', 'Tisdag och söndag', '17:30–19:30'],
    ['U10', 'alpint', '9–10 år', 'Tisdag och torsdag', '17:30–19:30'],
    ['U12', 'alpint', '11–12 år', 'Tisdag, torsdag och lördag', '17:30–19:30'],
    ['U14/U16', 'alpint', '13–16 år', 'Måndag, onsdag och lördag', '17:30–20:00'],
    ['Freeridegruppen', 'freeride', '13 år och uppåt', 'Fredag', '17:00–20:00'],
    ['Freeski', 'freeride', '13 år och uppåt', 'Lördag', '10:00–13:00'],
    ['FIS', 'alpint', '16 år och uppåt', 'Måndag, onsdag och lördag', '17:00–20:00'],
  ].entries())
    grupp[namn] = spara('traningsgrupp', {
      namn, sektion_id: sektion[sekt], aldersspann, dag, tid, ordning: i,
    });

  // Tränare och aktiva i grupperna.
  const iGrupp = (gruppnamn, anv, roll = 'aktiv') =>
    spara('gruppmedlem', { grupp_id: grupp[gruppnamn], medlem_id: mid[anv], roll });
  iGrupp('U12', 'annika', 'tranare');
  iGrupp('U12', 'johan', 'hjalptranare');
  iGrupp('U10', 'per', 'tranare');
  iGrupp('U8', 'karin', 'tranare');
  iGrupp('Minialpina 4–6 år', 'lotta', 'tranare');
  iGrupp('Freeridegruppen', 'stefan', 'tranare');
  iGrupp('U14/U16', 'per', 'tranare');

  // Uppdrag: styrelse, tränare och volontärer.
  const uppdrag = (anv, slag, extra = {}) =>
    spara('uppdrag', { medlem_id: mid[anv], slag, fran: '2026-09-01', ...extra });
  uppdrag('annika', 'ordforande');
  uppdrag('karin', 'kassor');
  uppdrag('lotta', 'sekreterare');
  uppdrag('mikael', 'ledamot');
  uppdrag('emma', 'suppleant');
  uppdrag('jonas', 'anlaggningsansvarig');
  uppdrag('per', 'backansvarig');
  uppdrag('stefan', 'sektionsansvarig', { sektion_id: sektion.freeride });
  uppdrag('tobias', 'volontar');
  uppdrag('anders', 'volontar');
  uppdrag('ingrid', 'revisor');
  uppdrag('ordforande', 'ordforande');
  uppdrag('kassor', 'kassor');
  uppdrag('kiosk', 'volontar');
  uppdrag('uthyrning', 'volontar');
  iGrupp('U10', 'tranare', 'tranare');
  iGrupp('Freeski', 'freeski', 'tranare');
  iGrupp('FIS', 'fis', 'tranare');
  uppdrag('freeski', 'sektionsansvarig', { sektion_id: sektion.freeride });

  // Kassören och tränarna ska komma åt sina delar.
  kor("UPDATE medlem SET roll='tranare' WHERE anvandarnamn IN ('lotta','stefan','johan')");

  // ---------- Matrikeln ----------
  const matrikel = {
    jonas: ['1972-03-14', 'ledare', 'Storgatan 4', '871 30', 'Härnösand'],
    medlem: ['1988-07-02', 'aktiv', 'Skolgatan 11', '871 31', 'Härnösand'],
    annika: ['1979-11-23', 'ledare', 'Brännavägen 8', '871 33', 'Härnösand'],
    per: ['1975-01-30', 'ledare', 'Murbergsvägen 2', '871 60', 'Härnösand'],
    karin: ['1983-05-19', 'ledare', 'Nybrogatan 9', '871 31', 'Härnösand'],
    stefan: ['1990-09-08', 'aktiv', 'Gånsviksvägen 14', '871 62', 'Härnösand'],
    lotta: ['1986-02-11', 'ledare', 'Köpmangatan 3', '871 31', 'Härnösand'],
    mikael: ['1981-12-05', 'aktiv', 'Hamngatan 21', '871 30', 'Härnösand'],
    sara: ['1995-06-27', 'aktiv', 'Nattviksgatan 6', '871 45', 'Härnösand'],
    tobias: ['1992-04-16', 'aktiv', 'Varvsgatan 2', '871 45', 'Härnösand'],
    emma: ['1993-08-30', 'aktiv', 'Franzéngatan 5', '871 31', 'Härnösand'],
    johan: ['1984-10-12', 'ledare', 'Bergsgatan 17', '871 33', 'Härnösand'],
    helena: ['1998-01-25', 'aktiv', 'Södra Vägen 44', '871 52', 'Härnösand'],
    anders: ['1968-03-03', 'stod', 'Tullportsgatan 7', '871 30', 'Härnösand'],
    ingrid: ['1961-07-21', 'heders', 'Brunnshusgatan 12', '871 31', 'Härnösand'],
    hugo: ['1980-05-05', 'aktiv', null, null, 'Härnösand'],
  };
  let medlemsnummer = 1000;
  for (const [anv, [fodelsedatum, kategori, adress, postnummer, ort]] of Object.entries(matrikel)) {
    const m = en('SELECT * FROM medlem WHERE anvandarnamn=?', anv);
    if (!m) continue;
    const delar = m.namn.split(' ');
    kor(
      `UPDATE medlem SET medlemsnummer=?, fornamn=?, efternamn=?, fodelsedatum=?, kategori=?,
         adress=?, postnummer=?, ort=?, intradesdatum=?, samtycke_bild=1, samtycke_tid=datetime('now')
       WHERE id=?`,
      String(++medlemsnummer), delar[0], delar.slice(1).join(' '), fodelsedatum, kategori,
      adress, postnummer, ort, '2020-09-01', m.id
    );
  }

  // Några barn i grupperna, utan inloggning – de är bara medlemmar.
  const barn = [
    ['Elsa Sund', '2014-04-12', 'U12', 'annika'],
    ['Viggo Sund', '2016-08-03', 'U10', 'annika'],
    ['Alma Åkerlund', '2015-02-20', 'U12', 'per'],
    ['Noel Holm', '2017-11-11', 'U8', 'karin'],
    ['Tuva Berg', '2013-06-30', 'U14/U16', 'stefan'],
    ['Liv Nyberg', '2019-03-09', 'Minialpina 4–6 år', 'lotta'],
    ['Melker Ek', '2015-09-17', 'U12', 'mikael'],
    ['Signe Dahl', '2016-01-28', 'U10', 'emma'],
    ['Ville Vikner', '2012-05-14', 'U14/U16', 'johan'],
    ['Ester Lund', '2018-07-07', 'Minialpina 4–6 år', 'sara'],
    ['Hugo Molin', '2014-10-02', 'U12', 'anders'],
    ['Maja Strand', '2015-12-19', 'U12', 'helena'],
    ['Olle Sjöberg', '2016-03-22', 'U10', 'ingrid'],
    ['Wilma Nord', '2016-06-08', 'U10', 'tobias'],
    ['Edvin Holm', '2017-02-14', 'U8', 'karin'],
    ['Nova Berg', '2017-09-26', 'U8', 'stefan'],
    ['Alvin Dahl', '2018-04-30', 'U8', 'emma'],
    ['Saga Vikner', '2013-01-17', 'U14/U16', 'johan'],
    ['Leo Åkerlund', '2012-11-05', 'U14/U16', 'per'],
    ['Iris Sund', '2011-08-23', 'U14/U16', 'annika'],
    ['Folke Ek', '2019-05-12', 'Minialpina 4–6 år', 'mikael'],
    ['Stina Lund', '2020-02-29', 'Minialpina 4–6 år', 'sara'],
    ['Milo Nyberg', '2013-07-18', 'Freeridegruppen', 'lotta'],
    ['Ruth Molin', '2011-04-04', 'Freeridegruppen', 'anders'],
    ['Nils Sund', '2010-02-08', 'FIS', 'annika'],
    ['Agnes Åkerlund', '2009-10-21', 'FIS', 'per'],
    ['Hampus Berg', '2008-12-02', 'FIS', 'stefan'],
    ['Tindra Holm', '2010-07-15', 'Freeski', 'karin'],
    ['Loke Nord', '2011-09-29', 'Freeski', 'tobias'],
    ['Juni Dahl', '2012-03-18', 'Freeski', 'emma'],
  ];
  for (const [namn, fodelsedatum, gruppnamn, forelder] of barn) {
    const foraldern = en('SELECT * FROM medlem WHERE anvandarnamn=?', forelder);
    const delar = namn.split(' ');
    const id = spara('medlem', {
      anvandarnamn: `${delar[0].toLowerCase()}${fodelsedatum.slice(2, 4)}`,
      namn,
      fornamn: delar[0],
      efternamn: delar.slice(1).join(' '),
      fodelsedatum,
      kategori: 'aktiv',
      roll: 'medlem',
      kvot_timmar: 0,
      losenordshash: hasha(Math.random().toString(36).slice(2)),
      kompetens: '[]',
      medlemsnummer: String(++medlemsnummer),
      intradesdatum: '2024-09-01',
      malsman_namn: foraldern?.namn ?? null,
      malsman_telefon: foraldern?.telefon ?? null,
      malsman_epost: foraldern?.epost ?? null,
      ort: 'Härnösand',
      samtycke_bild: 1,
    });
    spara('gruppmedlem', { grupp_id: grupp[gruppnamn], medlem_id: id, roll: 'aktiv' });
  }

  // ---------- Träningstillfällen med närvaro ----------
  const grupptranare = (gruppnamn) =>
    alla(
      "SELECT medlem_id FROM gruppmedlem WHERE grupp_id=? AND roll IN ('tranare','hjalptranare')",
      grupp[gruppnamn]
    );
  const gruppaktiva = (gruppnamn) =>
    alla("SELECT medlem_id FROM gruppmedlem WHERE grupp_id=? AND roll='aktiv'", grupp[gruppnamn]);

  for (const gruppnamn of ['U8', 'U10', 'U12', 'U14/U16', 'Minialpina 4–6 år', 'Freeridegruppen', 'Freeski', 'FIS']) {
    for (let v = 1; v <= 6; v++) {
      const datum = plusDagar(IDAG, -v * 7 + 1);
      const id = spara('traningstillfalle', {
        grupp_id: grupp[gruppnamn],
        datum,
        start: '17:30',
        slut: '19:30',
        plats: 'Vårdkasbacken',
        slag: 'traning',
        rubrik: `${gruppnamn} träning`,
        av_id: mid.annika,
      });
      for (const l of grupptranare(gruppnamn))
        spara('narvaro', { tillfalle_id: id, medlem_id: l.medlem_id, roll: 'ledare', narvarande: 1 });
      for (const a of gruppaktiva(gruppnamn))
        spara('narvaro', { tillfalle_id: id, medlem_id: a.medlem_id, roll: 'deltagare', narvarande: v % 5 === 0 ? 0 : 1 });
    }
  }

  // ---------- Såld fika och uthyrning några dagar bakåt ----------
  const artiklar = alla('SELECT * FROM artikel WHERE kategori IN (\'mat\',\'dryck\',\'fika\',\'godis\')');
  const hyrpaket = alla("SELECT * FROM hyrespris WHERE grupp='paket'");
  let ordernr = 0;
  for (let d = 7; d >= 1; d--) {
    const datum = plusDagar(IDAG, -d);
    for (let o = 0; o < 3 + (d % 3); o++) {
      const valda = artiklar.filter(() => Math.random() < 0.25).slice(0, 3);
      if (!valda.length) continue;
      const belopp = valda.reduce((a, x) => a + x.pris_ore, 0);
      const betalsatt = o % 3 === 0 ? 'kontant' : o % 3 === 1 ? 'swish' : 'kort';
      const id = spara('kundorder', {
        nummer: `K${++ordernr}`,
        kanal: o % 2 ? 'kassa' : 'qr',
        status: 'hamtad',
        belopp_ore: belopp,
        betalsatt,
        betald_tid: `${datum} 12:0${o}`,
        skapad: `${datum} 12:0${o}`,
        uppdaterad: `${datum} 12:3${o}`,
        hamtad_tid: `${datum} 12:3${o}`,
        av_id: mid.karin,
      });
      for (const x of valda)
        spara('orderrad', { order_id: id, artikel_id: x.id, namn: x.namn, styckpris_ore: x.pris_ore, antal: 1 });
    }
    // En uthyrning om dagen.
    const paket = hyrpaket[d % hyrpaket.length];
    const hid = spara('hyresavtal', {
      nummer: `U${d}`,
      namn: ['Familjen Lind', 'Erik Dahl', 'Moa Sjöberg', 'Team Åkerlund'][d % 4],
      status: 'aterlamnad',
      belopp_ore: paket.pris_ore * 2,
      betalsatt: 'kort',
      betald_tid: `${datum} 10:15`,
      utlamnad_tid: `${datum} 10:20`,
      retur_tid: `${datum} 16:05`,
      skapad: `${datum} 10:10`,
      av_id: mid.mikael,
    });
    spara('hyresrad', { avtal_id: hid, hyrespris_id: paket.id, namn: `${paket.namn} · heldag`, pris_ore: paket.pris_ore, antal: 2, aterlamnad: 1 });
  }

  // ---------- Medlemsavgifter ----------
  for (const m of alla("SELECT id, kategori FROM medlem WHERE aktiv=1")) {
    const belopp = m.kategori === 'stod' ? 20000 : m.kategori === 'heders' ? 0 : 45000;
    if (!belopp) continue;
    spara('medlemsavgift', {
      medlem_id: m.id,
      sasong: '2026/27',
      belopp_ore: belopp,
      status: m.id % 4 === 0 ? 'obetald' : 'betald',
      betald_tid: m.id % 4 === 0 ? null : `${plusDagar(IDAG, -40)} 12:00`,
      betalsatt: m.id % 4 === 0 ? null : 'swish',
    });
  }
}));

// ---------- Bokföring av det som sålts ----------
// Verifikationerna skapas utanför transaktionen: de har triggrar som
// vägrar ändringar, och ska bokföras i samma ordning som affärerna skedde.
await iForeningen(async () => {
  const bok = await import('./bokforing.mjs');
  bok.sakerstallKontoplan();
  const kassorska = en("SELECT * FROM medlem WHERE anvandarnamn='karin'");
  const kassor = en("SELECT * FROM medlem WHERE anvandarnamn='kassor'");

  for (const o of alla("SELECT * FROM kundorder WHERE betald_tid IS NOT NULL ORDER BY skapad")) {
    const rader = alla('SELECT r.*, a.kategori FROM orderrad r LEFT JOIN artikel a ON a.id=r.artikel_id WHERE r.order_id=?', o.id);
    bok.bokforAffar({
      serie: 'K',
      datum: o.skapad.slice(0, 10),
      beskrivning: `Kioskorder ${o.nummer}`,
      motpart: 'Kontantkund',
      rader: rader.map((r) => ({
        konto: r.kategori === 'liftkort' ? bok.INTAKTSKONTON.liftkort : bok.INTAKTSKONTON.kiosk,
        belopp_ore: r.styckpris_ore * r.antal,
      })),
      betalmedel: o.betalsatt,
      referens_slag: 'order',
      referens_id: o.id,
      av: kassorska,
    });
  }

  for (const h of alla("SELECT * FROM hyresavtal WHERE betald_tid IS NOT NULL ORDER BY skapad")) {
    const rader = alla('SELECT * FROM hyresrad WHERE avtal_id=?', h.id);
    bok.bokforAffar({
      serie: 'U',
      datum: h.skapad.slice(0, 10),
      beskrivning: `Uthyrning ${h.nummer}`,
      motpart: h.namn,
      rader: rader.map((r) => ({ konto: bok.INTAKTSKONTON.uthyrning, belopp_ore: r.pris_ore * r.antal })),
      betalmedel: h.betalsatt,
      referens_slag: 'hyresavtal',
      referens_id: h.id,
      av: kassorska,
    });
  }

  for (const a of alla("SELECT a.*, m.namn FROM medlemsavgift a JOIN medlem m ON m.id=a.medlem_id WHERE a.status='betald'")) {
    bok.bokforForsaljning({
      serie: 'M',
      datum: a.betald_tid.slice(0, 10),
      beskrivning: `Medlemsavgift ${a.sasong} ${a.namn}`,
      motpart: a.namn,
      belopp_ore: a.belopp_ore,
      intaktskonto: bok.INTAKTSKONTON.medlemsavgift,
      betalmedel: a.betalsatt || 'swish',
      referens_slag: 'medlemsavgift',
      referens_id: a.medlem_id,
      av: kassor,
    });
  }
});

// ---------- En manual att söka i ----------
// Den påhittade FK-200-manualen som testerna använder. Riktiga manualer
// laddar Jonas upp själv – den här finns bara för att visa att sökningen
// och tolkningen fungerar.
{
  const { existsSync, copyFileSync, statSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const kalla = join(ROT, 'tests', 'data', 'manual.pdf');
  if (existsSync(kalla)) {
    const { DOKUMENTKATALOG, lasPdf } = await import('./dokument.mjs');
    mkdirSync(DOKUMENTKATALOG, { recursive: true });
    const filnamn = 'fk200-manual.pdf';
    copyFileSync(kalla, join(DOKUMENTKATALOG, filnamn));
    const r = await lasPdf(filnamn);
    await iForeningen(async () => {
      const fro_utr = en(`SELECT id FROM utrustning WHERE namn='Fläkt 1'`);
      const fro_jonas = en(`SELECT id FROM medlem WHERE anvandarnamn='jonas'`);
      spara('dokument', {
        utrustning_id: fro_utr?.id ?? null,
        namn: 'FK-200 servicemanual (exempel)',
        slag: 'manual',
        filnamn,
        mediatyp: 'application/pdf',
        storlek: statSync(kalla).size,
        sidor: r.sidor.length || null,
        text: r.text,
        av_id: fro_jonas?.id ?? null,
      });
    });
  }
}

console.log('Frö klart:');
iForeningen(() => {
  for (const t of ['medlem', 'omrade', 'utrustning', 'checklistmall', 'checklistpunkt', 'position',
    'pass', 'bokning', 'matning', 'arende', 'insats', 'artikel', 'hyrespris',
    'sektion', 'traningsgrupp', 'gruppmedlem', 'uppdrag', 'traningstillfalle', 'narvaro', 'medlemsavgift',
    'komponent', 'leverantor', 'driftpost', 'incident',
    'serviceplan', 'serviceatgard', 'reservdel', 'reservdelsuttag', 'hogbelastning', 'tillganglighet',
    'dokument'])
    console.log(`  ${t}: ${en(`SELECT count(*) AS n FROM ${t}`).n}`);
});
db.close();
