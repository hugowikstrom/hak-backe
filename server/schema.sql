-- HAK Backe: hela databasen. Körs idempotent vid varje start.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- Personer och behörighet ----------
CREATE TABLE IF NOT EXISTS medlem (
  id             INTEGER PRIMARY KEY,
  anvandarnamn   TEXT NOT NULL UNIQUE,
  namn           TEXT NOT NULL,
  epost          TEXT,
  telefon        TEXT,
  losenordshash  TEXT NOT NULL,
  roll           TEXT NOT NULL DEFAULT 'medlem',   -- medlem | backansvarig | anlaggningsansvarig | admin
  aktiv          INTEGER NOT NULL DEFAULT 1,
  kvot_timmar    REAL,                             -- åsidosätter säsongens kvot
  kompetens      TEXT NOT NULL DEFAULT '[]',       -- JSON-lista med positionsnycklar
  anteckning     TEXT,
  -- Matrikeln. Läses bara av den som har behörigheten medlemsregister.
  medlemsnummer  TEXT,
  fornamn        TEXT,
  efternamn      TEXT,
  fodelsedatum   TEXT,
  adress         TEXT,
  postnummer     TEXT,
  ort            TEXT,
  kategori       TEXT NOT NULL DEFAULT 'aktiv',    -- aktiv | stod | familj | heders | ledare | provapa
  intradesdatum  TEXT,
  utradesdatum   TEXT,
  malsman_namn   TEXT,
  malsman_telefon TEXT,
  malsman_epost  TEXT,
  nodkontakt_namn TEXT,
  nodkontakt_telefon TEXT,
  licens         TEXT,
  licens_till    TEXT,
  samtycke_bild  INTEGER,
  samtycke_tid   TEXT,
  belastningsregister_visat TEXT,
  skapad         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session (
  id        TEXT PRIMARY KEY,
  medlem_id INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  skapad    TEXT NOT NULL DEFAULT (datetime('now')),
  giltig_t  TEXT NOT NULL
);

-- ---------- Anläggningen ----------
CREATE TABLE IF NOT EXISTS omrade (
  id      INTEGER PRIMARY KEY,
  namn    TEXT NOT NULL UNIQUE,
  slag    TEXT NOT NULL DEFAULT 'backe',          -- backe | lift | byggnad | ovrigt
  ordning INTEGER NOT NULL DEFAULT 0,
  aktiv   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS utrustning (
  id         INTEGER PRIMARY KEY,
  namn       TEXT NOT NULL,
  typ        TEXT NOT NULL,                       -- lans | flakt | pumpstation | kompressor | lift | band | pistmaskin | ovrigt
  omrade_id  INTEGER REFERENCES omrade(id) ON DELETE SET NULL,
  placering  TEXT,
  status     TEXT NOT NULL DEFAULT 'drift',       -- drift | service | ur_drift
  munstycken INTEGER,
  anteckning TEXT,
  ordning    INTEGER NOT NULL DEFAULT 0,
  aktiv      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_utrustning_omrade ON utrustning(omrade_id);

-- ---------- Snöläggning ----------
CREATE TABLE IF NOT EXISTS snopass (
  id         INTEGER PRIMARY KEY,
  start      TEXT NOT NULL,
  slut       TEXT,
  ansvarig_id INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'pagar',       -- pagar | avslutat
  anteckning TEXT,
  skapad     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matning (
  id            INTEGER PRIMARY KEY,
  tid           TEXT NOT NULL DEFAULT (datetime('now')),
  snopass_id    INTEGER REFERENCES snopass(id) ON DELETE SET NULL,
  utrustning_id INTEGER REFERENCES utrustning(id) ON DELETE SET NULL,
  omrade_id     INTEGER REFERENCES omrade(id) ON DELETE SET NULL,
  lufttemp      REAL,     -- °C
  luftfukt      REAL,     -- % RH
  wetbulb       REAL,     -- °C, räknas fram om den lämnas tom
  vattenflode   REAL,     -- l/s
  vattentryck   REAL,     -- bar
  lufttryck     REAL,     -- bar (tryckluft till lansen)
  barometer     REAL,     -- hPa
  vind_styrka   REAL,     -- m/s
  vind_riktning TEXT,
  snokvalitet   TEXT,     -- torr | normal | blot
  anteckning    TEXT,
  av_id         INTEGER REFERENCES medlem(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_matning_tid ON matning(tid);
CREATE INDEX IF NOT EXISTS idx_matning_utr ON matning(utrustning_id);

-- ---------- Checklistor ----------
CREATE TABLE IF NOT EXISTS checklistmall (
  id          INTEGER PRIMARY KEY,
  namn        TEXT NOT NULL,
  omfattning  TEXT NOT NULL DEFAULT 'allmant',    -- utrustningstyp | omrade | allmant
  utrustningstyp TEXT,
  omrade_id   INTEGER REFERENCES omrade(id) ON DELETE SET NULL,
  intervall   TEXT NOT NULL DEFAULT 'per_pass',   -- vid_start | per_pass | dagligen | veckovis | sasong
  position_nyckel TEXT,                            -- vems rond: backansvarig, fik, uthyrning …
  beskrivning TEXT,
  aktiv       INTEGER NOT NULL DEFAULT 1,
  ordning     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklistpunkt (
  id         INTEGER PRIMARY KEY,
  mall_id    INTEGER NOT NULL REFERENCES checklistmall(id) ON DELETE CASCADE,
  ordning    INTEGER NOT NULL DEFAULT 0,
  text       TEXT NOT NULL,
  hjalptext  TEXT,
  svarstyp   TEXT NOT NULL DEFAULT 'bock',        -- bock | varde | text
  enhet      TEXT,
  obligatorisk INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_punkt_mall ON checklistpunkt(mall_id);

CREATE TABLE IF NOT EXISTS checklistkorning (
  id            INTEGER PRIMARY KEY,
  mall_id       INTEGER NOT NULL REFERENCES checklistmall(id) ON DELETE CASCADE,
  utrustning_id INTEGER REFERENCES utrustning(id) ON DELETE SET NULL,
  omrade_id     INTEGER REFERENCES omrade(id) ON DELETE SET NULL,
  snopass_id    INTEGER REFERENCES snopass(id) ON DELETE SET NULL,
  av_id         INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  startad       TEXT NOT NULL DEFAULT (datetime('now')),
  avslutad      TEXT,
  status        TEXT NOT NULL DEFAULT 'pagar',    -- pagar | klar
  kalla         TEXT NOT NULL DEFAULT 'webb',     -- webb | mobil
  anteckning    TEXT
);
CREATE INDEX IF NOT EXISTS idx_korning_mall ON checklistkorning(mall_id);

CREATE TABLE IF NOT EXISTS checklistsvar (
  id         INTEGER PRIMARY KEY,
  korning_id INTEGER NOT NULL REFERENCES checklistkorning(id) ON DELETE CASCADE,
  punkt_id   INTEGER NOT NULL REFERENCES checklistpunkt(id) ON DELETE CASCADE,
  bockad     INTEGER NOT NULL DEFAULT 0,
  varde      REAL,
  text       TEXT,
  avvikelse  INTEGER NOT NULL DEFAULT 0,
  kommentar  TEXT,
  bild       TEXT,                                -- filnamn under data/bilder
  tid        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(korning_id, punkt_id)
);

-- ---------- Ärenden ----------
CREATE TABLE IF NOT EXISTS arende (
  id            INTEGER PRIMARY KEY,
  titel         TEXT NOT NULL,
  beskrivning   TEXT,
  typ           TEXT NOT NULL DEFAULT 'fel',      -- fel | brist | forbattring | risk
  prioritet     INTEGER NOT NULL DEFAULT 3,       -- 1 akut, 2 hog, 3 normal, 4 lag
  allvarlighet  TEXT NOT NULL DEFAULT 'begransar',-- sakerhetsrisk | driftstopp | begransar | kosmetisk
  status        TEXT NOT NULL DEFAULT 'ny',       -- ny | bekraftad | pagar | vantar | atgardad | stangd
  utrustning_id INTEGER REFERENCES utrustning(id) ON DELETE SET NULL,
  omrade_id     INTEGER REFERENCES omrade(id) ON DELETE SET NULL,
  skapad_av_id  INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  tilldelad_id  INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  korning_id    INTEGER REFERENCES checklistkorning(id) ON DELETE SET NULL,
  deadline      TEXT,
  skapad        TEXT NOT NULL DEFAULT (datetime('now')),
  uppdaterad    TEXT NOT NULL DEFAULT (datetime('now')),
  stangd        TEXT
);
CREATE INDEX IF NOT EXISTS idx_arende_status ON arende(status, prioritet);

CREATE TABLE IF NOT EXISTS arendehandelse (
  id        INTEGER PRIMARY KEY,
  arende_id INTEGER NOT NULL REFERENCES arende(id) ON DELETE CASCADE,
  tid       TEXT NOT NULL DEFAULT (datetime('now')),
  av_id     INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  slag      TEXT NOT NULL DEFAULT 'kommentar',    -- kommentar | status | tilldelning | atgard
  text      TEXT
);
CREATE INDEX IF NOT EXISTS idx_handelse_arende ON arendehandelse(arende_id);

-- ---------- Bemanning ----------
CREATE TABLE IF NOT EXISTS sasong (
  id            INTEGER PRIMARY KEY,
  namn          TEXT NOT NULL UNIQUE,
  start         TEXT NOT NULL,
  slut          TEXT NOT NULL,
  kvot_timmar   REAL NOT NULL DEFAULT 20,
  kvot_nattpass REAL NOT NULL DEFAULT 2,
  aktiv         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS position (
  id        INTEGER PRIMARY KEY,
  nyckel    TEXT NOT NULL UNIQUE,
  namn      TEXT NOT NULL,
  kortnamn  TEXT,
  farg      TEXT NOT NULL DEFAULT '#7aa2d0',
  ordning   INTEGER NOT NULL DEFAULT 0,
  kravs_roll TEXT,                                -- lägsta roll som får bokas
  aktiv     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pass (
  id          INTEGER PRIMARY KEY,
  datum       TEXT NOT NULL,                      -- YYYY-MM-DD
  start       TEXT NOT NULL,                      -- HH:MM
  slut        TEXT NOT NULL,
  position_id INTEGER NOT NULL REFERENCES position(id) ON DELETE CASCADE,
  behov       INTEGER NOT NULL DEFAULT 1,
  slag        TEXT NOT NULL DEFAULT 'dag',        -- dag | kvall | natt
  vikt        REAL NOT NULL DEFAULT 1,            -- rättviseviktning
  publicerad  INTEGER NOT NULL DEFAULT 1,
  anteckning  TEXT,
  UNIQUE(datum, start, position_id)
);
CREATE INDEX IF NOT EXISTS idx_pass_datum ON pass(datum);

CREATE TABLE IF NOT EXISTS bokning (
  id        INTEGER PRIMARY KEY,
  pass_id   INTEGER NOT NULL REFERENCES pass(id) ON DELETE CASCADE,
  medlem_id INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  status    TEXT NOT NULL DEFAULT 'bokad',        -- bokad | tilldelad | narvarande | uteblev | avbokad
  kalla     TEXT NOT NULL DEFAULT 'sjalv',        -- sjalv | admin | auto
  tid       TEXT NOT NULL DEFAULT (datetime('now')),
  kommentar TEXT,
  UNIQUE(pass_id, medlem_id)
);
CREATE INDEX IF NOT EXISTS idx_bokning_medlem ON bokning(medlem_id);

CREATE TABLE IF NOT EXISTS otillganglighet (
  id        INTEGER PRIMARY KEY,
  medlem_id INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  fran      TEXT NOT NULL,
  till      TEXT NOT NULL,
  orsak     TEXT
);

CREATE TABLE IF NOT EXISTS insats (
  id          INTEGER PRIMARY KEY,
  medlem_id   INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  datum       TEXT NOT NULL,
  timmar      REAL NOT NULL,
  slag        TEXT NOT NULL DEFAULT 'pass',       -- pass | snolaggning | arbetsdag | ovrigt
  pass_id     INTEGER REFERENCES pass(id) ON DELETE SET NULL,
  beskrivning TEXT,
  registrerad TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pass_id, medlem_id)
);
CREATE INDEX IF NOT EXISTS idx_insats_medlem ON insats(medlem_id, datum);

-- ---------- E-post ----------
CREATE TABLE IF NOT EXISTS epostlogg (
  id        INTEGER PRIMARY KEY,
  till      TEXT NOT NULL,
  amne      TEXT NOT NULL,
  text      TEXT NOT NULL,
  slag      TEXT NOT NULL DEFAULT 'ovrigt',
  skickad   TEXT,
  fel       TEXT,
  skapad    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Kiosken ----------
CREATE TABLE IF NOT EXISTS artikel (
  id          INTEGER PRIMARY KEY,
  namn        TEXT NOT NULL,
  beskrivning TEXT,
  kategori    TEXT NOT NULL DEFAULT 'ovrigt',  -- mat | dryck | godis | glass | liftkort | ovrigt
  pris_ore    INTEGER NOT NULL,
  emoji       TEXT,
  ordning     INTEGER NOT NULL DEFAULT 0,
  aktiv       INTEGER NOT NULL DEFAULT 1,
  slut        INTEGER NOT NULL DEFAULT 0,      -- tillfälligt slut i dag
  anteckning  TEXT
);

CREATE TABLE IF NOT EXISTS kundorder (
  id          INTEGER PRIMARY KEY,
  nummer      TEXT NOT NULL UNIQUE,            -- kort kod som ropas ut, t.ex. K42
  kod         TEXT,                            -- kundens nyckel till sin egen order
  kanal       TEXT NOT NULL DEFAULT 'qr',      -- qr | terminal | kassa
  status      TEXT NOT NULL DEFAULT 'ny',      -- ny | betald | tillagas | klar | hamtad | avbruten
  mobil       TEXT,
  belopp_ore  INTEGER NOT NULL DEFAULT 0,
  betalsatt   TEXT,                            -- swish | kort | kontant | ej_betald
  betald_tid  TEXT,
  plats       TEXT,                            -- var kunden sitter, om hen sagt det
  anteckning  TEXT,
  skapad      TEXT NOT NULL DEFAULT (datetime('now')),
  uppdaterad  TEXT NOT NULL DEFAULT (datetime('now')),
  hamtad_tid  TEXT,
  av_id       INTEGER REFERENCES medlem(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_status ON kundorder(status, skapad);

CREATE TABLE IF NOT EXISTS orderrad (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES kundorder(id) ON DELETE CASCADE,
  artikel_id    INTEGER REFERENCES artikel(id) ON DELETE SET NULL,
  namn          TEXT NOT NULL,
  styckpris_ore INTEGER NOT NULL,
  antal         INTEGER NOT NULL DEFAULT 1,
  anteckning    TEXT
);
CREATE INDEX IF NOT EXISTS idx_orderrad_order ON orderrad(order_id);

-- ---------- Skiduthyrningen ----------
CREATE TABLE IF NOT EXISTS hyrespris (
  id          INTEGER PRIMARY KEY,
  grupp       TEXT NOT NULL,                   -- paket | utrustning | tillbehor
  namn        TEXT NOT NULL,
  aldersgrupp TEXT NOT NULL DEFAULT 'alla',    -- vuxen | ungdom | barn | alla
  tid         TEXT NOT NULL,                   -- halvdag | heldag | tvadagar | tredagar | vecka
  pris_ore    INTEGER NOT NULL,
  ordning     INTEGER NOT NULL DEFAULT 0,
  aktiv       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS hyresavtal (
  id            INTEGER PRIMARY KEY,
  nummer        TEXT NOT NULL UNIQUE,          -- t.ex. U17
  mobil         TEXT,
  namn          TEXT,
  status        TEXT NOT NULL DEFAULT 'bokad', -- bokad | ute | aterlamnad | forsenad | avbruten
  belopp_ore    INTEGER NOT NULL DEFAULT 0,
  betalsatt     TEXT,
  betald_tid    TEXT,
  utlamnad_tid  TEXT,
  retur_senast  TEXT,
  retur_tid     TEXT,
  returkod      TEXT,                          -- kundens länk för att anmäla återlämning
  anteckning    TEXT,
  skapad        TEXT NOT NULL DEFAULT (datetime('now')),
  av_id         INTEGER REFERENCES medlem(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_hyresavtal_status ON hyresavtal(status, skapad);

CREATE TABLE IF NOT EXISTS hyresrad (
  id           INTEGER PRIMARY KEY,
  avtal_id     INTEGER NOT NULL REFERENCES hyresavtal(id) ON DELETE CASCADE,
  hyrespris_id INTEGER REFERENCES hyrespris(id) ON DELETE SET NULL,
  namn         TEXT NOT NULL,
  pris_ore     INTEGER NOT NULL,
  antal        INTEGER NOT NULL DEFAULT 1,
  markning     TEXT,                           -- utrustningens märkning, blippad vid utlämning
  aterlamnad   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_hyresrad_avtal ON hyresrad(avtal_id);

CREATE TABLE IF NOT EXISTS smslogg (
  id      INTEGER PRIMARY KEY,
  till    TEXT NOT NULL,
  text    TEXT NOT NULL,
  slag    TEXT NOT NULL DEFAULT 'ovrigt',
  skickat TEXT,
  fel     TEXT,
  skapad  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Bokföring ----------
-- Verifikationer får aldrig ändras eller tas bort. Fel rättas med en ny
-- verifikation som pekar på den felaktiga (se triggarna nedan).
CREATE TABLE IF NOT EXISTS konto (
  nummer      TEXT PRIMARY KEY,                -- BAS-konto, t.ex. 1910
  namn        TEXT NOT NULL,
  slag        TEXT NOT NULL,                   -- tillgang | skuld | intakt | kostnad
  momssats    REAL NOT NULL DEFAULT 0,
  aktiv       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS verifikation (
  id           INTEGER PRIMARY KEY,
  serie        TEXT NOT NULL,                  -- K kiosk, U uthyrning, M medlem, D diverse
  nummer       INTEGER NOT NULL,               -- obruten följd per serie och år
  ar           INTEGER NOT NULL,
  datum        TEXT NOT NULL,                  -- affärshändelsens dag
  bokford      TEXT NOT NULL DEFAULT (datetime('now')),  -- när den registrerades
  beskrivning  TEXT NOT NULL,
  motpart      TEXT,                           -- vem affären gjordes med
  belopp_ore   INTEGER NOT NULL,               -- bruttobelopp, för snabb läsning
  referens_slag TEXT,                          -- order | hyresavtal | medlemsavgift | manuell | rattelse
  referens_id  INTEGER,
  rattar_id    INTEGER REFERENCES verifikation(id),  -- den verifikation som rättas
  skapad_av_id INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  skapad_av    TEXT,                           -- namnet sparas, även om medlemmen tas bort
  underlag     TEXT,                           -- json: ordern som den såg ut
  UNIQUE(serie, ar, nummer)
);
CREATE INDEX IF NOT EXISTS idx_verifikation_datum ON verifikation(datum);

CREATE TABLE IF NOT EXISTS verifikationsrad (
  id              INTEGER PRIMARY KEY,
  verifikation_id INTEGER NOT NULL REFERENCES verifikation(id),
  konto           TEXT NOT NULL,
  beskrivning     TEXT,
  debet_ore       INTEGER NOT NULL DEFAULT 0,
  kredit_ore      INTEGER NOT NULL DEFAULT 0,
  momssats        REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_verrad_ver ON verifikationsrad(verifikation_id);

-- Behandlingshistorik: vem gjorde vad. Läggs till, ändras aldrig.
CREATE TABLE IF NOT EXISTS revision (
  id        INTEGER PRIMARY KEY,
  tid       TEXT NOT NULL DEFAULT (datetime('now')),
  medlem_id INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  namn      TEXT,
  handelse  TEXT NOT NULL,
  objekt    TEXT,
  detalj    TEXT
);
CREATE INDEX IF NOT EXISTS idx_revision_tid ON revision(tid);

CREATE TRIGGER IF NOT EXISTS verifikation_far_inte_andras
BEFORE UPDATE ON verifikation
BEGIN SELECT RAISE(ABORT, 'En bokförd verifikation får inte ändras. Bokför en rättelse i stället.'); END;

CREATE TRIGGER IF NOT EXISTS verifikation_far_inte_raderas
BEFORE DELETE ON verifikation
BEGIN SELECT RAISE(ABORT, 'En bokförd verifikation får inte tas bort. Bokför en rättelse i stället.'); END;

CREATE TRIGGER IF NOT EXISTS verrad_far_inte_andras
BEFORE UPDATE ON verifikationsrad
BEGIN SELECT RAISE(ABORT, 'En bokförd rad får inte ändras.'); END;

CREATE TRIGGER IF NOT EXISTS verrad_far_inte_raderas
BEFORE DELETE ON verifikationsrad
BEGIN SELECT RAISE(ABORT, 'En bokförd rad får inte tas bort.'); END;

CREATE TRIGGER IF NOT EXISTS revision_far_inte_andras
BEFORE UPDATE ON revision
BEGIN SELECT RAISE(ABORT, 'Behandlingshistoriken får inte ändras.'); END;

CREATE TRIGGER IF NOT EXISTS revision_far_inte_raderas
BEFORE DELETE ON revision
BEGIN SELECT RAISE(ABORT, 'Behandlingshistoriken får inte tas bort.'); END;

-- ---------- Föreningen: sektioner, grupper och uppdrag ----------
CREATE TABLE IF NOT EXISTS sektion (
  id      INTEGER PRIMARY KEY,
  nyckel  TEXT NOT NULL UNIQUE,
  namn    TEXT NOT NULL,
  beskrivning TEXT,
  ordning INTEGER NOT NULL DEFAULT 0,
  aktiv   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS traningsgrupp (
  id         INTEGER PRIMARY KEY,
  sektion_id INTEGER REFERENCES sektion(id) ON DELETE SET NULL,
  namn       TEXT NOT NULL,
  aldersspann TEXT,
  beskrivning TEXT,
  dag        TEXT,                              -- när gruppen tränar, fritext
  tid        TEXT,
  ordning    INTEGER NOT NULL DEFAULT 0,
  aktiv      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gruppmedlem (
  id        INTEGER PRIMARY KEY,
  grupp_id  INTEGER NOT NULL REFERENCES traningsgrupp(id) ON DELETE CASCADE,
  medlem_id INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  roll      TEXT NOT NULL DEFAULT 'aktiv',      -- aktiv | tranare | hjalptranare | foralder
  fran      TEXT,
  till      TEXT,
  UNIQUE(grupp_id, medlem_id, roll)
);

-- Förtroendeposter och uppdrag. Styr behörigheter vid sidan av rollen.
CREATE TABLE IF NOT EXISTS uppdrag (
  id         INTEGER PRIMARY KEY,
  medlem_id  INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  slag       TEXT NOT NULL,                     -- ordforande | kassor | sekreterare | ledamot |
                                                -- suppleant | valberedning | tranare | volontar |
                                                -- sektionsansvarig | backansvarig | anlaggningsansvarig
  sektion_id INTEGER REFERENCES sektion(id) ON DELETE SET NULL,
  grupp_id   INTEGER REFERENCES traningsgrupp(id) ON DELETE SET NULL,
  fran       TEXT,
  till       TEXT,                              -- tomt = pågående
  anteckning TEXT,
  UNIQUE(medlem_id, slag, sektion_id, grupp_id)
);
CREATE INDEX IF NOT EXISTS idx_uppdrag_medlem ON uppdrag(medlem_id);

-- ---------- Medlemsavgifter ----------
CREATE TABLE IF NOT EXISTS medlemsavgift (
  id              INTEGER PRIMARY KEY,
  medlem_id       INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  sasong          TEXT NOT NULL,                -- t.ex. 2026/27
  belopp_ore      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'obetald',  -- obetald | betald | eftergiven
  betald_tid      TEXT,
  betalsatt       TEXT,
  verifikation_id INTEGER REFERENCES verifikation(id),
  anteckning      TEXT,
  skapad          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(medlem_id, sasong)
);
CREATE INDEX IF NOT EXISTS idx_avgift_sasong ON medlemsavgift(sasong, status);

-- ---------- Träningstillfällen och närvaro ----------
-- Underlaget för LOK-stöd, kommunalt aktivitetsstöd och förbundsrapporter.
CREATE TABLE IF NOT EXISTS traningstillfalle (
  id         INTEGER PRIMARY KEY,
  grupp_id   INTEGER REFERENCES traningsgrupp(id) ON DELETE SET NULL,
  sektion_id INTEGER REFERENCES sektion(id) ON DELETE SET NULL,
  datum      TEXT NOT NULL,
  start      TEXT,
  slut       TEXT,
  plats      TEXT,
  slag       TEXT NOT NULL DEFAULT 'traning',   -- traning | tavling | lager | mote | arbetsdag
  rubrik     TEXT,
  anteckning TEXT,
  installt   INTEGER NOT NULL DEFAULT 0,
  skapad     TEXT NOT NULL DEFAULT (datetime('now')),
  av_id      INTEGER REFERENCES medlem(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tillfalle_datum ON traningstillfalle(datum);

CREATE TABLE IF NOT EXISTS narvaro (
  id           INTEGER PRIMARY KEY,
  tillfalle_id INTEGER NOT NULL REFERENCES traningstillfalle(id) ON DELETE CASCADE,
  medlem_id    INTEGER NOT NULL REFERENCES medlem(id) ON DELETE CASCADE,
  roll         TEXT NOT NULL DEFAULT 'deltagare',  -- deltagare | ledare
  narvarande   INTEGER NOT NULL DEFAULT 1,
  anteckning   TEXT,
  UNIQUE(tillfalle_id, medlem_id)
);
CREATE INDEX IF NOT EXISTS idx_narvaro_tillfalle ON narvaro(tillfalle_id);

-- ---------- Idélådan ----------
-- Råinspelning, ordagrant transkript och den text människan godkänt hålls
-- isär. En uppgift i Backlog skapas aldrig utan att någon läst igenom.
CREATE TABLE IF NOT EXISTS ide (
  id              INTEGER PRIMARY KEY,
  rubrik          TEXT,
  text            TEXT,                          -- det inlämnaren står för
  transkript      TEXT,                          -- ordagrant från tal-till-text
  ljudfil         TEXT,                          -- filnamn under data/ljud
  sekunder        REAL,
  status          TEXT NOT NULL DEFAULT 'ny',    -- ny | granskad | skickad | avfard
  kategori        TEXT,                          -- backen | fiket | traning | ekonomi | ovrigt
  skapad_av_id    INTEGER REFERENCES medlem(id) ON DELETE SET NULL,
  skapad_av       TEXT,
  skapad          TEXT NOT NULL DEFAULT (datetime('now')),
  anteckning      TEXT,
  backlog_projekt TEXT,
  backlog_ref     TEXT,
  skickad_tid     TEXT,
  skickad_av      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ide_status ON ide(status, skapad);
