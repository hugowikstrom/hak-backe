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
  vatkula       REAL,     -- °C, räknas fram om den lämnas tom
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
