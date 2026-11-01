# Backis

Ett system för hela backen: snöläggning och snöplanering, checklistor,
driftjournal, förebyggande underhåll, ärenden, incidenter, bemanning, kiosk,
uthyrning, ekonomi, träning och medlemsmatrikel. Kör som en enda
Node-process med SQLite, byggda klienter i `web/dist`.

Plattformen bär **flera föreningar**. Varje förening har en egen databasfil,
egna färger och egna påslagna moduler; värdnamnet avgör vilken förening en
begäran gäller. `docs/ARKITEKTUR.md` beskriver sömmarna och gränserna.

Drift: <https://backis.nattviken.com> (systemd-tjänsten `hak`, 127.0.0.1:8120).
Mobilappen för checklistor: <https://backis.nattviken.com/mobil/>.
Fiket och uthyrningen för gästerna: <https://backis.nattviken.com/fik/> (öppen, ingen inloggning).

## Kom igång

```bash
npm install
npm run fro          # grunddata: medlemmar, utrustning, checklistor, pass
npm run dev          # API 8120 + webben 5190 + mobilen 5191/mobil/
npm run verify       # tester och bygge – grinden före driftsättning
npm run build        # bygger alla tre klienterna till web/dist
npm run foreningar   # vilka föreningar som finns och vad de har påslaget
npm run ny-forening -- --nyckel vargen --namn "Vargens SK" --doman vargen.se
```

Grunddatat lägger upp sex behörighetsgrupper – Snögänget, Backlaget,
Liftansvariga, Kioskvärdarna, Tränarlaget och Incidentgruppen – som sköts
under *Föreningen → Tillträden*.

Inloggningar i grunddatat (alla har lösenordet `hak`):

| Inloggning | Roll | Ser |
| --- | --- | --- |
| `jonas` | anläggningsansvarig | backen, rapporter, läser ekonomin |
| `ordforande` | anläggningsansvarig + uppdrag ordförande | allt, inklusive bokföring |
| `kassor` | medlem + uppdrag kassör | ekonomi och medlemsregister, inte backen |
| `admin` | administratör | allt |
| `annika`, `per` | backansvarig | schemaläggning, mallar, register, ärenden |
| `kiosk`, `uthyrning` | medlem (volontär) | kassan och uthyrningen |
| `tranare`, `freeski`, `fis` | tränare | träningsgrupper, närvaro, aktivitetsstöd |
| `medlem` och övriga | medlem | boka pass, rapportera mätningar och ärenden |

## Så hänger delarna ihop

**Snöläggning.** Varje mätning sparar lufttemperatur, fukt, vattenflöde,
vatten- och lufttryck, barometer och vind. Wetbulbn räknas fram ur
psykrometerekvationen (`server/snoteknik.mjs`) om den inte rapporterats, och
ger ett klartecken med rekommenderad vattenmängd. Mätningar kan knytas till en
lans, fläkt eller pumpstation och till ett pågående snöpass.

**Checklistor.** En mall har en omfattning: *allmänt*, *per utrustningstyp*
(alla lansar, alla fläktar …) eller *per område* (fiket, uthyrningen …). När
någon startar en checklista för Lans 7 dyker rätt mallar upp automatiskt.
Punkter kan vara bock, värde med enhet eller fritext. Varje punkt kan markeras
som **avvikelse** med en kommentar – vid avslut blir avvikelsen ett ärende.

**Ärenden.** Fel, brister, risker och förbättringar med prioritet 1–4 och
allvarlighet (säkerhetsrisk, driftstopp, begränsar, kosmetisk). Tilldelning,
deadline, händelselogg med kommentarer och åtgärder. Akuta ärenden som
tilldelas någon mejlas.

**Bemanning.** Positioner (backansvarig, stora backen, lilla backen, bandet,
fiket, skiduthyrning, snöläggning, extra resurs) × datum i ett rutnät med
Excel-känsla: pilnavigering, mellanslag bokar och avbokar, enter öppnar passet.
Medlemmar bokar sig själva; backansvarig lägger upp pass, bokar andra och
sätter närvaro. Närvaro blir en insats i medlemmens historik.

**Kvoter och automatplanering.** Varje säsong har en kvot i timmar och ett
riktvärde för nattpass; en medlem kan ha egen kvot, och kvot 0 betyder
undantagen. Automatplaneringen (`server/autoplan.mjs`) fyller bara pass som
saknar folk och väljer den som ligger lägst på en sammanvägning av timmar
mot kvot, nattpass och helgpass. Den respekterar otillgänglighet, kompetens,
rollkrav och krockar, och har ett tak mot kvoten så att de flitigaste inte
lassas över. Resultatet visas som förslag med fördelningen efteråt innan
något skrivs.

**E-post.** Utskick till medlemmarna med deras kvotläge, deras pass och de
pass som saknar folk. Allt som skickas loggas i `epostlogg`, även när
sändningen är avstängd.

**Plånbok.** Varje medlem har ett förskottskonto som används i fiket, i
uthyrningen och till klubbens avgifter. Kassan fyller på, kassören betalar
tillbaka. Saldot är en **skuld** i bokföringen (konto 2420) – pengarna är
medlemmens ända till dess att något köps.

**Utlägg.** Den som handlat åt klubben fotar kvittot i mobilen. Kassören
granskar, godkänner (kostnad + ingående moms + skuld till medlemmen) och
betalar ut – till bankkontot eller rakt in i medlemmens plånbok. Avslag
kräver ett skäl; ett godkänt utlägg rättas med en motbokning, inte med ett
avslag.

**Läger och tävling.** Evenemang med anmälan, avgift, platsbegränsning och
sista anmälningsdag. Är det fullt hamnar man i en reservkö som tömmer sig
själv när någon hoppar av. Avgiften kan betalas med plånboken av medlemmen
själv, eller kvitteras i kassan. Deltagarlista med behov (specialkost,
allergier) som CSV – men behoven syns bara för arrangören.

**Samåkning.** Vem som kör, varifrån, när och hur många platser som är
lediga – kopplat till ett evenemang eller fristående. Varje medlem får
erbjuda och boka plats utan behörighet. Telefonnumren visas för föraren och
dem som faktiskt sitter i bilen, ingen annan.

**Rapporter.** För anläggningsansvarig: drifttimmar och uppskattad
vattenvolym per lans och fläkt, ärendeläge med åtgärdstider och
säkerhetsrisker, samt bemanningstäckning, hål i schemat och varje medlems
insatser mot kvoten. CSV-export och utskriftsvänlig vy.

## Kod

```
server/            API och logik, inga ramverk
  bokforing.mjs    verifikationer, rättelser, SIE-export
  behorighet.mjs   roller, uppdrag, grupper och vem som får vad
  stod.mjs         aktivitetsstödets villkor som data
  swish.mjs        betalnings-QR  ·  sms.mjs  46elks  ·  tal.mjs  tal till text
  index.mjs        HTTP-server, routing, statiska filer
  schema.sql       hela databasen, körs idempotent vid start
  db.mjs           node:sqlite, små hjälpare (spara/uppdatera/transaktion)
  auth.mjs         scrypt-hash, sessionskakor, rollrang
  snoteknik.mjs    wetbulb och klartecken – rena funktioner
  autoplan.mjs     rättvis fördelning – ren funktion över inlästa data
  tid.mjs          passtider, nattpass, helg, veckonummer
  epost.mjs        SMTP via nodemailer, allt loggas
  fro.mjs          grunddata (`npm run fro`, `--nollstall` skriver om)
  api/*.mjs        en modul per område, exporterar `rutter`
web/src/           Webbklienten: React + Vite, en formgivningsfil
  app.jsx          skal, navigering, inloggning
  delar/           återanvända byggstenar och datatabellen
  sidor/           översikt, snöläggning, checklistor, ärenden, bemanning,
                   mina sidor, rapporter, register
web/kiosk/         Fiket och uthyrningen för gästerna, på /fik/ – ingen inloggning
web/mobil/         Backis Rond: mobilklienten på /mobil/
  public/          manifest, servicearbetare och ikoner
  src/ko.js        ronder i telefonen och synken mot servern
  src/sidor/       hem, rond, historik, checklistor (redigering), konto
tests/             node:test – snöteknik, tid, autoplan, API över HTTP
drift/             systemd-enhet och Caddy-block
```

Hållpunkter:

- **Svenska** i prosa, fältnamn och filnamn. Ramverksfiler på engelska.
- **Rollerna** är `medlem` < `backansvarig` < `anlaggningsansvarig` < `admin`
  och kontrolleras i rutt-tabellen, inte i gränssnittet.
- **Räknelogiken är ren.** `snoteknik.mjs`, `autoplan.mjs` och `tid.mjs` rör
  aldrig databasen, och täcks av tester.
- **En CSS-fil**, `web/src/stil.css`, med sektioner. Inga komponentbibliotek.
- `undefined` i indata betyder "fältet skickades inte", `null` betyder "töm
  fältet". Därför kan en delvis uppdatering aldrig nolla en titel.
- **Bokföringen är orörbar.** Verifikationer, deras rader och
  behandlingshistoriken har triggrar som vägrar UPDATE och DELETE. Ska något
  bort bokförs en rättelse. `npm run fro -- --nollstall` bygger därför om hela
  databasfilen i stället för att radera rader.
- **Priser sätts av servern.** Klienten skickar artikel-id och antal, aldrig
  belopp. Det gäller både kiosken och uthyrningen.
- **Behörighet före roll.** Rutter som rör ekonomi, träning eller
  medlemsregister kräver en behörighet (`@ekonomi`), inte en rollnivå.
- **Grupper lägger till, aldrig till avdrag.** En medlem kan vara med i
  flera behörighetsgrupper, och varje grupp ger behörigheter, arbetsytor och
  eventuellt ett rollgolv. Ingen grupp kan ta bort något medlemmen redan har
  via roll, uppdrag eller kompetens. Grupperna sköts under *Föreningen →
  Tillträden* av den som har `behorighetsstyrning`, och ingen kan dela ut
  mer än hen själv har.
- **Menyn är ett träd, inte en rad.** Vilken gren en sida hänger i står på
  modulen (`grupp` i `server/moduldata.mjs`), inte i klienten. Sidomenyn och
  luckan på liten skärm ritar samma träd. `Ctrl+K` hoppar direkt,
  `Ctrl+.` öppnar talrutan.
- **Mobilens ronder är dokument, inte köade anrop.** `web/mobil/src/ko.js`
  sparar hela ronden i telefonen och spelar upp den mot API:et när det går.
  Därför överlever en rond både dålig täckning och att appen stängs.
- **Den grafiska profilen bor på ett ställe**: `web/delad/profil.css` och
  `web/delad/marke.jsx`, delade av alla tre klienterna. Färger, typsnitt,
  skuggor och märket ändras där, inte i en enskild klient. Reglerna står i
  `docs/GRAFISK-PROFIL.md`.
- **Grönt är varumärket, inte en status.** Klart är `--ok`, pågår är
  `--info`, brådskande är `--fara`. Brickor och mätare använder de namnen.
- **Märket** är ritat efter klubbemblemet: sköld, vårdkasen och en åkare i
  sväng. Det finns i tre nivåer efter storlek, och ikonerna i
  `web/mobil/public/ikon-*.png` rasteriseras ur `ikon.svg` – rita om SVG:n och
  gör om PNG:erna, aldrig tvärtom.
- `npm run verify` är grinden.

## Miljövariabler

| Variabel | Standard | Betydelse |
| --- | --- | --- |
| `HAK_PORT` | 8120 | port |
| `HAK_VARD` | 127.0.0.1 | adress att lyssna på |
| `HAK_DB` | `data/hak.db` | databasfil, `:memory:` går för test |
| `HAK_BAS_URL` | `https://backis.nattviken.com` | länkar i e-post |
| `HAK_SMTP_HOST` / `HAK_SMTP_PORT` | 127.0.0.1 / 1025 | SMTP (Mailpit lokalt) |
| `HAK_SMTP_USER` / `HAK_SMTP_LOSEN` | – | sätts bara om servern kräver det |
| `HAK_EPOST_FRAN` | `Backis <backe@nattviken.com>` | avsändare |
| `HAK_EPOST_AV` | på | `0` loggar utskick utan att skicka |
| `HAK_SWISH_NUMMER` | 1234567890 | klubbens swishnummer; utan det hänvisas gästen till luckan |
| `HAK_46ELKS_ANVANDARE` / `HAK_46ELKS_LOSEN` | – | sms via 46elks; utan dem loggas breven bara |
| `HAK_SMS_FRAN` | HAKbacken | avsändare på sms |
| `HAK_STT_URL` | husets STT-router | tal till text för idélådan |
| `HAK_BACKLOG` / `HAK_BACKLOG_PROJEKT` | backlog-CLI:t / `inbox` | dit idéerna skickas |
| `HAK_PLATS` | 62.627,17.914,170 | koordinater för väderprognosen |
| `HAK_FORENING` / `HAK_ORGNR` | – | står i SIE-filen |

Bilder på avvikelser sparas som filer under `data/bilder/` och nås via
`/api/bilder/<namn>` för inloggade. Telefonen skalar ned dem före uppladdning.

## Drift

Se `drift/LASMIG.md`.
