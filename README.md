# HAK Backe

Ett system för hela backen: snöläggning, checklistor, ärenden, bemanning och
rapporter. Kör som en enda Node-process med SQLite, byggd klient i `web/dist`.

Drift: <https://hak.nattviken.com> (systemd-tjänsten `hak`, 127.0.0.1:8120).
Mobilappen för checklistor: <https://hak.nattviken.com/mobil/>.

## Kom igång

```bash
npm install
npm run fro          # grunddata: medlemmar, utrustning, checklistor, pass
npm run dev          # API 8120 + webben 5190 + mobilen 5191/mobil/
npm run verify       # tester och bygge – grinden före driftsättning
npm run build        # bygger båda klienterna till web/dist
```

Inloggningar i grunddatat (alla har lösenordet `hak`):

| Inloggning | Roll | Ser |
| --- | --- | --- |
| `jonas` | anläggningsansvarig | allt, inklusive rapporter och säsonger |
| `annika`, `per` | backansvarig | schemaläggning, mallar, register, ärenden |
| `medlem` och övriga | medlem | boka pass, rapportera mätningar och ärenden |

## Så hänger delarna ihop

**Snöläggning.** Varje mätning sparar lufttemperatur, fukt, vattenflöde,
vatten- och lufttryck, barometer och vind. Våtkulan räknas fram ur
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

**Rapporter.** För anläggningsansvarig: drifttimmar och uppskattad
vattenvolym per lans och fläkt, ärendeläge med åtgärdstider och
säkerhetsrisker, samt bemanningstäckning, hål i schemat och varje medlems
insatser mot kvoten. CSV-export och utskriftsvänlig vy.

## Kod

```
server/            API och logik, inga ramverk
  index.mjs        HTTP-server, routing, statiska filer
  schema.sql       hela databasen, körs idempotent vid start
  db.mjs           node:sqlite, små hjälpare (spara/uppdatera/transaktion)
  auth.mjs         scrypt-hash, sessionskakor, rollrang
  snoteknik.mjs    våtkula och klartecken – rena funktioner
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
web/mobil/         HAK Rond: mobilklienten på /mobil/
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
- **Mobilens ronder är dokument, inte köade anrop.** `web/mobil/src/ko.js`
  sparar hela ronden i telefonen och spelar upp den mot API:et när det går.
  Därför överlever en rond både dålig täckning och att appen stängs.
- **Klubbgrönt `#8cc63f`** ur logotypen bär mobilappen. Grönt på vitt duger
  inte som textfärg – använd `--gron-mork` när det ska läsas.
- `npm run verify` är grinden.

## Miljövariabler

| Variabel | Standard | Betydelse |
| --- | --- | --- |
| `HAK_PORT` | 8120 | port |
| `HAK_VARD` | 127.0.0.1 | adress att lyssna på |
| `HAK_DB` | `data/hak.db` | databasfil, `:memory:` går för test |
| `HAK_BAS_URL` | `https://hak.nattviken.com` | länkar i e-post |
| `HAK_SMTP_HOST` / `HAK_SMTP_PORT` | 127.0.0.1 / 1025 | SMTP (Mailpit lokalt) |
| `HAK_SMTP_USER` / `HAK_SMTP_LOSEN` | – | sätts bara om servern kräver det |
| `HAK_EPOST_FRAN` | `HAK Backe <backe@nattviken.com>` | avsändare |
| `HAK_EPOST_AV` | på | `0` loggar utskick utan att skicka |

Bilder på avvikelser sparas som filer under `data/bilder/` och nås via
`/api/bilder/<namn>` för inloggade. Telefonen skalar ned dem före uppladdning.

## Drift

Se `drift/LASMIG.md`.
