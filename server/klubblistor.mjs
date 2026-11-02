// Klubbens egna checklistor, avlästa ur systemet de kommer ifrån.
//
// Punkterna är skrivna av dem som sköter backen, inte av mig, och de
// står ordagrant som de står där: "Medbringarnas gång (dal/bergstation,
// stolpar)" och inte "Kontrollera medbringarna". Den som gjort ronden i
// tio år läser rubriken, inte meningen — skriver man om den börjar man
// om med inlärningen.
//
// Ordningen är också deras. Väder först och signering sist är inte en
// smaksak: det första säger under vilka förutsättningar kontrollen
// gjordes, det sista vem som svarar för den.
//
// `[text, svarstyp, hjalptext, obligatorisk, sakerhetskritisk, extra]`
//
// Bara listor jag läst av punkt för punkt står här. Liften har fler i
// förlagan – Kontroll av master, Medbringare, Smörj och kontrollschema
// vändhjul, Underhållsschema drivstation, Linklämmorflytt – men att
// öppna var och en betyder att starta och kasta en kontroll i klubbens
// skarpa system. De får läggas till när någon läst dem, inte gissas
// fram: en checklista som påstår sig vara klubbens men inte är det är
// sämre än ingen alls.

/** Vädret i den dagliga uppstartskontrollen. */
const VADER = ['Sol', 'Växlande', 'Mulet', 'Snöfall', 'Regn', 'Dimma', 'Blåst'];

export const KLUBBLISTOR = [
  {
    namn: 'Daglig uppstartskontroll',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'dagligen',
    intervalltyp: 'dagar',
    intervall_dagar: 1,
    position_nyckel: 'backansvarig',
    beskrivning: 'Liftens uppstart. Görs av liftskötaren innan första åkande.',
    kvittens: true,
    punkter: [
      ['Väder', 'val', 'Vilka förhållanden kontrollen gjordes under.', true, false, { alternativ: VADER }],
      ['Backis i tjänst', 'text', 'Vem som är backansvarig i dag.', true, false],
      ['Liftskötare', 'text', 'Vem som sköter liften i dag.', true, false],
      ['Stopp och säkerhetsutrustning, överfartsskydd', 'bock', null, true, true],
      ['Drivmaskineri - vändhjul (lagring)', 'bock', null, true, true],
      ['Medbringarnas gång (dal/bergstation, stolpar)', 'bock', null, true, true],
      ['Rullbatterier', 'bock', null, true, true],
      ['Liftspår', 'bock', null, true, false],
      ['Anslag och skyltar', 'bock', null, true, false],
      ['På- och avstigningsplatser', 'bock', null, true, true],
      ['Ange drifttimmar', 'varde', 'Avläst på räkneverket. Den här siffran för maskinens drifttimmar framåt.',
        true, false, { enhet: 'h', matarstallning: true }],
      ['Namnförtydligande', 'text', null, false, false],
      ['Signering', 'text', 'Den som signerar svarar för att kontrollen är gjord.', true, false],
    ],
  },
  {
    namn: 'Veckokontroll',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'veckovis',
    intervalltyp: 'dagar',
    intervall_dagar: 7,
    fonster_dagar: 3,
    position_nyckel: 'backansvarig',
    beskrivning: 'Liftens veckokontroll. Går djupare än den dagliga.',
    punkter: [
      ['Kontrollera linans position i drivhjul. Även slitage på hjul foder.', 'bock', 'Drivstation', true, true],
      ['Kontrollera oljenivån i växellådan', 'bock', null, true, false],
      ['Kontrollera så att det inte är onormal fukt i huvudelskåpet', 'bock', null, true, false],
      ['Hydraulisk spännanordning', 'bock', null, true, false],
      ['Kontrollera att flytt av medbringare är gjord i tid', 'bock', null, true, false],
      ['Kontroll av bromssträckan', 'bock', null, true, true],
      ['Kontrollera att linan inte har några synliga skador', 'bock', null, true, true],
      ['Kontrollera slitage hjul', 'bock', null, true, false],
      ['Linans gång in och utgående hjul', 'bock', null, true, false],
      ['Lyssna efter missljud', 'bock', null, true, false],
      ['Kontrollera linans position i vändhjulet', 'bock', null, true, true],
      ['Allmän översyn att allt går normalt', 'bock', null, true, false],
      ['Kontrollera motvikt', 'bock', null, true, true],
      ['Namnförtydligande', 'text', null, false, false],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Månadskontroll',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'veckovis',
    intervalltyp: 'dagar',
    intervall_dagar: 30,
    fonster_dagar: 14,
    position_nyckel: 'backansvarig',
    beskrivning: 'Liftens månadskontroll. Master, linhjul, drivlina och bromsar.',
    punkter: [
      ['Kontrollera plattformar, räcken, gångplattformar, överliggare bult och stegar med avseende på sprickor, rost, deformationer, korrekt läge mm.',
        'bock', 'Master', true, true],
      ['Fundament', 'bock', null, true, true],
      ['Mastfot bult', 'bock', null, true, true],
      ['Kontrollera linhjulen', 'bock', null, true, true],
      ['Rullbatterier och vippor, linavvisare, huvudbultarnas skruvar och säkringar, linhjulens läge och fastsättning osv.',
        'bock', null, true, true],
      ['Brytarkabel el-ledning, kopplingsdosor, hållare', 'bock', null, true, true],
      ['Visuell kontroll av hela drivlinan', 'bock', null, true, true],
      ['Visuell kontroll', 'bock', null, true, false],
      ['Kolla oljenivån', 'bock', null, true, false],
      ['Kontrollera det yttre skicket hos driv- och vändskiva', 'bock', null, true, false],
      ['Smörj linskivelager topp & dal', 'bock', null, true, false],
      ['Kontroll av vändhjulets gummi/lingång', 'bock', null, true, false],
      ['Kontrollera att den är tillräckligt uppvevad', 'bock', null, true, false],
      ['Kontrollera visuellt vajer och vajerinfästning', 'bock', null, true, true],
      ['Kontrollera bromsbacksspelet', 'bock', null, true, true],
      ['Kontrollera bromsbeläggens tjocklek', 'bock', null, true, true],
      ['Rörliga delar - Kontrollera att de rör sig lätt, rengör och smörj dem vid behov', 'bock', null, true, false],
    ],
  },
];
