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
      ['Ange drifttimmar', 'varde', null, true, false, { enhet: 'h', matarstallning: true }],
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
    beskrivning: 'Liftens månadskontroll.',
    punkter: [
      ['Kontrollera sprickbildning i svetsar', 'bock', 'Master, drivstation och vändstation.', true, true],
      ['Kontrollera linans skick och smörjning', 'bock', null, true, true],
      ['Kontrollera bromsarnas funktion', 'bock', null, true, true],
      ['Kontrollera infästningar och bultförband', 'bock', null, true, true],
      ['Ange drifttimmar', 'varde', null, true, false, { enhet: 'h', matarstallning: true }],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Kontrollera sprickbildning i svetsar',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'sasong',
    intervalltyp: 'dagar',
    intervall_dagar: 180,
    fonster_dagar: 30,
    position_nyckel: 'backansvarig',
    beskrivning: 'Egen rond för svetskontrollen, utöver månadskontrollen.',
    punkter: [
      ['Master – inga sprickor i svetsar', 'bock', null, true, true],
      ['Drivstation – inga sprickor i svetsar', 'bock', null, true, true],
      ['Vändstation – inga sprickor i svetsar', 'bock', null, true, true],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Kontroll av master',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'sasong',
    intervalltyp: 'dagar',
    intervall_dagar: 365,
    fonster_dagar: 60,
    position_nyckel: 'backansvarig',
    punkter: [
      ['Masternas lodräthet kontrollerad', 'bock', null, true, true],
      ['Rullbatterier och linstyrningar på master', 'bock', null, true, true],
      ['Infästningar i fundament', 'bock', null, true, true],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Medbringare',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'sasong',
    intervalltyp: 'drifttimmar',
    intervall_timmar: 500,
    position_nyckel: 'backansvarig',
    beskrivning: 'Medbringarnas skick och infästning.',
    punkter: [
      ['Medbringarnas infästning i linan', 'bock', null, true, true],
      ['Slitage på medbringarnas bygel', 'bock', null, true, false],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Smörj och kontrollschema vändhjul',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'sasong',
    intervalltyp: 'drifttimmar',
    intervall_timmar: 250,
    position_nyckel: 'backansvarig',
    punkter: [
      ['Vändhjulets lager smorda', 'bock', null, true, false],
      ['Vändhjulets gång utan kärvning', 'bock', null, true, true],
      ['Ange drifttimmar', 'varde', null, true, false, { enhet: 'h', matarstallning: true }],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Underhållsschema drivstation',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'sasong',
    intervalltyp: 'dagar',
    intervall_dagar: 365,
    fonster_dagar: 90,
    position_nyckel: 'backansvarig',
    punkter: [
      ['Växellådsolja bytt eller kontrollerad', 'bock', null, true, false],
      ['Drivmotorns infästning och kylning', 'bock', null, true, true],
      ['Nödstoppskretsen funktionstestad', 'bock', null, true, true],
      ['Ange drifttimmar', 'varde', null, true, false, { enhet: 'h', matarstallning: true }],
      ['Signering', 'text', null, true, false],
    ],
  },
  {
    namn: 'Linklämmorflytt 40–60 h',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'sasong',
    intervalltyp: 'drifttimmar',
    intervall_timmar: 50,
    position_nyckel: 'backansvarig',
    beskrivning: 'Klämmorna flyttas var 40–60:e drifttimme så att linan inte nöts på samma punkt.',
    punkter: [
      ['Klämmorna flyttade enligt schema', 'bock', null, true, true],
      ['Linans skick vid de gamla klämlägena', 'bock', null, true, true],
      ['Ange drifttimmar', 'varde', null, true, false, { enhet: 'h', matarstallning: true }],
      ['Signering', 'text', null, true, false],
    ],
  },
];
