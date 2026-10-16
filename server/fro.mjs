// Frö: grunddata för HAK:s backe. Kör med --nollstall för att börja om.
import { alla, db, en, kor, spara, transaktion } from './db.mjs';
import { hasha } from './auth.mjs';
import { passSlag, plusDagar, veckodag } from './tid.mjs';

const nollstall = process.argv.includes('--nollstall');
const fanns = en('SELECT count(*) AS n FROM medlem').n;
if (fanns && !nollstall) {
  console.log(`Databasen har redan ${fanns} medlemmar. Kör med --nollstall för att skriva om.`);
  process.exit(0);
}
if (nollstall) {
  for (const t of ['checklistsvar', 'checklistkorning', 'checklistpunkt', 'checklistmall', 'arendehandelse',
    'arende', 'matning', 'snopass', 'insats', 'bokning', 'otillganglighet', 'pass', 'position',
    'utrustning', 'omrade', 'sasong', 'session', 'medlem', 'epostlogg'])
    kor(`DELETE FROM ${t}`);
}

const IDAG = new Date().toLocaleDateString('sv-SE');

transaktion(() => {
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
  ];
  const mid = {};
  for (const [anv, namn, roll, epost, kvot, komp] of medlemmar)
    mid[anv] = spara('medlem', {
      anvandarnamn: anv, namn, roll, epost,
      losenordshash: hasha('hak'),
      kvot_timmar: kvot,
      kompetens: JSON.stringify(komp),
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
  const mall = (namn, omfattning, nyckel, intervall, beskrivning, punkter) => {
    const id = spara('checklistmall', {
      namn, omfattning, intervall, beskrivning,
      utrustningstyp: omfattning === 'utrustningstyp' ? nyckel : null,
      omrade_id: omfattning === 'omrade' ? omr[nyckel] : null,
      ordning: mallordning++,
    });
    for (const [i, p] of punkter.entries())
      spara('checklistpunkt', {
        mall_id: id, ordning: i, text: p[0],
        svarstyp: p[1] || 'bock', enhet: p[2] || null,
        hjalptext: p[3] || null, obligatorisk: p[4] === false ? 0 : 1,
      });
    return id;
  };

  mall('Lans – start av snöläggning', 'utrustningstyp', 'lans', 'vid_start',
    'Gå igenom innan vatten släpps på lansen.', [
      ['Våtkulan tillåter produktion (kontrollera i appen)', 'bock', null, 'Under −2,5 °C våtkula. Rapportera mätningen först.'],
      ['Lansen är riktad rätt efter vindriktningen', 'bock'],
      ['Slangar och kopplingar är hela och utan läckage', 'bock'],
      ['Dräneringsventilen är stängd', 'bock'],
      ['Munstycken är rena och fria från is', 'bock'],
      ['Vattentryck vid lansen', 'varde', 'bar', 'Normalt 25–40 bar.'],
      ['Lufttryck vid lansen', 'varde', 'bar', 'Normalt 6–8 bar.'],
      ['Området runt lansen är avspärrat från åkande', 'bock'],
      ['Elanslutning och kabel är oskadad', 'bock'],
      ['Anteckning om läge och inställning', 'text', null, null, false],
    ]);

  mall('Lans – tillsyn under drift', 'utrustningstyp', 'lans', 'per_pass',
    'Varannan timme under pågående pass.', [
      ['Snöstrålen träffar rätt och snön är torr', 'bock'],
      ['Ingen isbildning på munstycken', 'bock'],
      ['Lufttemperatur', 'varde', '°C'],
      ['Luftfuktighet', 'varde', '%'],
      ['Vattenflöde', 'varde', 'l/s'],
      ['Inga läckage vid kopplingar', 'bock'],
      ['Snöhögen behöver flyttas av pistmaskin', 'bock', null, 'Bocka om pistmaskinen behöver kallas in.', false],
    ]);

  mall('Fläkt – start av snöläggning', 'utrustningstyp', 'flakt', 'vid_start',
    'Startrutin för fläktkanon.', [
      ['Våtkulan tillåter produktion', 'bock'],
      ['Fläkten står stabilt och är uppriktad', 'bock'],
      ['Oscilleringen går fritt i hela rörelsen', 'bock'],
      ['Vattenfilter är rengjort', 'bock'],
      ['Nukleatorer fungerar (kontrollera dimstrålen)', 'bock'],
      ['Kompressortrycket är uppe', 'varde', 'bar'],
      ['Vattenflöde vid start', 'varde', 'l/s'],
      ['Elkabel och jordfelsbrytare kontrollerad', 'bock'],
      ['Inga åkande i kastriktningen', 'bock'],
    ]);

  mall('Fläkt – daglig tillsyn', 'utrustningstyp', 'flakt', 'dagligen',
    'Görs en gång per dygn under snöläggningssäsong.', [
      ['Ingen is i fläkthuset', 'bock'],
      ['Lager och fläktmotor låter normalt', 'bock'],
      ['Smörjning kontrollerad', 'bock'],
      ['Driftstimmar', 'varde', 'h', null, false],
      ['Avvikelser att rapportera', 'text', null, null, false],
    ]);

  mall('Pumpstation – start och tillsyn', 'utrustningstyp', 'pumpstation', 'vid_start', null, [
    ['Vattennivå i dammen är tillräcklig', 'bock'],
    ['Nivå i dammen', 'varde', 'cm', null, false],
    ['Silar och intag är fria från is och skräp', 'bock'],
    ['Pumptryck', 'varde', 'bar'],
    ['Inga larm på styrskåpet', 'bock'],
    ['Ingen läckage i pumphuset', 'bock'],
    ['Frostskydd av ledningar kontrollerat', 'bock'],
  ]);

  mall('Lift – kontroll före öppning', 'utrustningstyp', 'lift', 'dagligen',
    'Säkerhetskritisk. Liften får inte öppna förrän alla punkter är klara.', [
      ['Nödstopp testade i båda ändar', 'bock'],
      ['Linan ligger rätt i alla block', 'bock'],
      ['På- och avstigning är plan och fri från is', 'bock'],
      ['Skyltar och avspärrningar på plats', 'bock'],
      ['Provkörning utan last genomförd', 'bock'],
      ['Kommunikationsradio fungerar', 'bock'],
      ['Liftvärd har genomgått instruktion', 'bock'],
    ]);

  mall('Bandet – daglig säkerhetskontroll', 'utrustningstyp', 'band', 'dagligen', null, [
    ['Nödstopp testat', 'bock'],
    ['Bandytan är fri från is och grus', 'bock'],
    ['Sidoskydd och galler sitter fast', 'bock'],
    ['Instruktionsskylt vid påstigning finns', 'bock'],
    ['Provkörning genomförd', 'bock'],
  ]);

  mall('Backansvarig – öppning av backen', 'allmant', null, 'dagligen',
    'Backansvarigs rutin innan backen öppnar för allmänheten.', [
      ['Pistning klar och backen besiktad', 'bock'],
      ['Alla hinder är skyddade (stolpar, lansar, kanoner)', 'bock'],
      ['Nedfarter som är stängda är tydligt avspärrade', 'bock'],
      ['Första hjälpen-väska och bår på plats', 'bock'],
      ['Liftkontroll är genomförd och godkänd', 'bock'],
      ['Bemanning på plats enligt schema', 'bock'],
      ['Snödjup representativt mätvärde', 'varde', 'cm', null, false],
      ['Information till åkande uppdaterad (skyltar/webb)', 'bock', null, null, false],
    ]);

  mall('Backansvarig – stängning', 'allmant', null, 'dagligen', null, [
    ['Backen avsökt, inga åkande kvar', 'bock'],
    ['Liftar avstängda och låsta', 'bock'],
    ['Avspärrningar inför natten på plats', 'bock'],
    ['Incidenter rapporterade som ärenden', 'bock'],
    ['Pistningsbehov anmält', 'bock', null, null, false],
  ]);

  mall('Fiket – öppning', 'omrade', 'Fiket', 'dagligen', null, [
    ['Kyl- och frystemperatur kontrollerad', 'varde', '°C'],
    ['Handtvätt och hygienrutiner på plats', 'bock'],
    ['Kassa och kortterminal fungerar', 'bock'],
    ['Växelkassa räknad', 'bock'],
    ['Varor påfyllda', 'bock'],
    ['Brandsläckare och utrymningsväg fria', 'bock'],
  ]);

  mall('Fiket – stängning', 'omrade', 'Fiket', 'dagligen', null, [
    ['Kassa räknad och avstämd', 'bock'],
    ['Kyl och frys stängda och rena', 'bock'],
    ['Diskat och avtorkat', 'bock'],
    ['Sopor utkastade', 'bock'],
    ['Lås och larm', 'bock'],
  ]);

  mall('Skiduthyrningen – öppning', 'omrade', 'Skiduthyrningen', 'dagligen', null, [
    ['Utrustning uppräknad mot utlåningslistan', 'bock'],
    ['Skadad utrustning uttagen ur hyllan', 'bock'],
    ['Bindningstestare kalibrerad', 'bock'],
    ['Hjälmar kontrollerade', 'bock'],
    ['Kassa och hyreskontrakt framme', 'bock'],
  ]);

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
      deadline: data.deadline || null,
    });
    spara('arendehandelse', { arende_id: id, av_id: mid[data.av || 'annika'], slag: 'kommentar', text: 'Ärendet skapades' });
    if (data.kommentar)
      spara('arendehandelse', { arende_id: id, av_id: mid[data.tilldelad || 'per'], slag: 'kommentar', text: data.kommentar });
    return id;
  };
  arende('Läckage i koppling vid Lans 4', {
    beskrivning: 'Vatten sprutar ur kopplingen mot stamledningen. Lansen är avstängd.',
    typ: 'fel', prioritet: 1, allvarlighet: 'driftstopp', status: 'pagar',
    utrustning: 'Lans 4', omrade: 'Stora backen', tilldelad: 'per', av: 'stefan',
    kommentar: 'Ny packning beställd, kommer på torsdag.',
  });
  arende('Nödstopp i nedre änden av bandet trögt', {
    beskrivning: 'Går att trycka in men fjädrar inte tillbaka. Säkerhetsrisk.',
    typ: 'risk', prioritet: 1, allvarlighet: 'sakerhetsrisk', status: 'bekraftad',
    utrustning: 'Transportbandet', omrade: 'Bandet', tilldelad: 'annika',
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
});

console.log('Frö klart:');
for (const t of ['medlem', 'omrade', 'utrustning', 'checklistmall', 'checklistpunkt', 'position', 'pass', 'bokning', 'matning', 'arende', 'insats'])
  console.log(`  ${t}: ${en(`SELECT count(*) AS n FROM ${t}`).n}`);
db.close();
