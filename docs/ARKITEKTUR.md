# Arkitektur

Plattformen bär flera föreningar och består av moduler som kan slås på var
för sig. Det här dokumentet beskriver sömmarna: var man lägger till något
nytt, och var gränserna går.

## De fyra sömmarna

**Förening.** En förening är en konfiguration i `data/foreningar.json` och en
egen SQLite-fil. Ingenting delas. Värdnamnet i begäran avgör vilken förening
som gäller, och hela anropet körs i den föreningens *skal* – en
`AsyncLocalStorage` som bär både databasen och inställningarna. Därför kan
modulerna fortsätta anropa `alla()`, `en()` och `spara()` utan att känna till
att det finns fler än en förening, och en fråga kan inte råka läsa fel
förenings medlemmar.

```
begäran → foreningAvVard(x-forwarded-host) → korSom(förening, …)
                                                 │
                                   skal: { db, forening }
                                                 │
                     alla()/en()/kor()      instans('swish')
```

**Modul.** Varje del av systemet är en post i `server/moduler.mjs`: nyckel,
namn, beroenden, rutter och de sidor den bidrar med i klienten. Kärnmoduler
(konto, förening, anläggning, översikt) går inte att stänga av. Resten slås
på per förening. Beroenden dras in automatiskt – en modul utan sin grund är
värre än en som är påslagen i onödan.

Dispatchern vet vilken modul varje rutt hör till och svarar 404 för en
avstängd modul. Klienten frågar `/api/plattform` och bygger sin meny av
svaret, så en avstängd modul försvinner också ur gränssnittet.

**Behörighet.** `server/behorighet.mjs` skiljer på *roll* (nivå i systemet),
*uppdrag* (ordförande, kassör, tränare, volontär) och *kompetens* (fik,
uthyrning). En rutt kräver antingen en rollnivå (`'backansvarig'`) eller en
behörighet (`'@ekonomi'`). Arbetsytorna – startsida och meny per uppgift –
räknas fram ur samma underlag.

**Profil.** Färger och märke ligger i `web/delad/`. Föreningens egna färger
skrivs in i registret och läggs på som CSS-variabler när klienten startar.
Se `docs/GRAFISK-PROFIL.md`.

## AI:n

AI används på ett enda sätt: den strukturerar text som en människa sedan
granskar. `server/ai.mjs` är hela sömmen – ett anrop in, ett JSON-objekt ut,
och ett tydligt `null` när något inte går.

Fyra regler som koden håller, inte bara dokumentationen:

- **Standardmodellen körs på maskinen** (`lokal` via gatewayen på
  127.0.0.1:4000). Driftjournal och incidentrapporter innehåller
  personuppgifter och uppgifter om olyckor.
- **`kanslig: true` tvingar lokal modell.** Väljer en förening en modell hos
  en leverantör gäller det inte incidenter – de byter tillbaka automatiskt.
- **AI skriver aldrig i journalen.** En talad rapport sparas som `driftpost`
  med `bekraftad = NULL`. Först när en människa trycker bekräfta blir den
  dokumentation, och det som sparas är människans text, inte modellens.
  Förslaget ligger kvar oförändrat i `forslag` som JSON.
- **Mätvärden filtreras i kod, inte av modellen.** `rensaMatvarden()` kastar
  värden som inte är tal eller ligger utanför rimliga gränser. "Trycket var
  okej" ger inget tryck.

Är AI:n avstängd fungerar allt ändå: man får transkriptet och fyller i själv.
Det är ett fullgott utfall och inte ett fel i appen.

Utrustning kopplas i två steg. Först modellens fält, sedan – om det är tomt –
en genomsökning av transkriptet (`utrustningskandidater()`), som klarar
talade siffror ("lans fyra"). Båda stegen kräver **entydighet**: nämns två
objekt får människan välja.

## Säkerhetskritiska kontroller

Checklistpunkter kan märkas `sakerhetskritisk`. Då gäller:

- De kan inte markeras "ej tillämplig".
- En rond med en obesvarad säkerhetspunkt går inte att avsluta – det finns
  ingen flagga för att tvinga förbi, med flit. Även mobilappens offlinekö
  vägrar, så svaret kommer i backen och inte först när täckningen återvänder.
- Övriga obligatoriska punkter får lämnas, men då får ronden status
  `klar_med_brist` och kräver en motivering. En ofullständig kontroll kan
  aldrig redovisas som godkänd.
- En avvikelse på en säkerhetspunkt blir ett ärende med
  `allvarlighet = 'sakerhetsrisk'` och prioritet 1, som bara backansvarig
  eller högre kan stänga – och bara med en dokumenterad åtgärd.

Mallar kan kräva **kvittens**: efter avslutad rond tar en namngiven person
ställning till `driftklar` eller `ej_driftklar`. Appen räknar inte ut om en
lift får öppna. Den skriver ner vem som bestämde, när, och på vilket
underlag.

## Position och maskin

Den viktigaste skillnaden i hela anläggningsdelen, och den som är lättast
att slarva bort: **platsen i backen och maskinen som står där är två olika
saker.**

- `snoplats` är platsen. "Lans 4" är ett ställe i stora backen: vattenuttag
  V4, elanslutning E4, en viss slangdragning, 480 meter från toppen. Den
  flyttar sig inte.
- `utrustning` är maskinen. En V3-lans, en Nessy, en Lenkokanon. Den flyttas
  mellan platser, lagas på verkstaden och står ibland i förrådet.
- `uppstallning` binder ihop dem över tid: vilken maskin som stod på vilken
  plats, från när till när.

Varför det spelar roll: **ett fel kan sitta på endera, och de följs åt olika
håll.** Ett läckande vattenuttag stannar på lans 4 när kanonen byts. Ett
trasigt munstycke följer med kanonen till lans 7. Blandar man ihop dem blir
felstatistiken obrukbar – den pekar ut en kanon som aldrig varit trasig,
eller missar att samma plats krånglar oavsett vad man ställer där.

Därför:

- `arende` har både `snoplats_id` och `utrustning_id`, och formuläret
  tvingar fram ett val: är det positionen eller maskinen som är fel? Bara
  det ena sparas. Vilken maskin som stod där vid tillfället räknas fram ur
  uppställningen och visas som sammanhang – inte som skuld.
- `aterkommandeFel()` räknar per maskin och komponent; `aterkommandePlatsfel()`
  räknar per position och flaggar `pekar_pa_platsen` när samma fel
  återkommit med olika maskiner uppställda.
- Snöläggningsronden går på **positionen**: `checklistmall.omfattning =
  'snoplats'` med `platsslag`. Man går lansrad fyra, och vad som står där i
  dag är en annan fråga. Maskinen noteras på körningen som sammanhang.
- Mätningar görs på en position; maskinen fylls i automatiskt ur
  uppställningen, så att den som rapporterar inte behöver veta den utantill.
- En plats håller en maskin i taget och en maskin står på ett ställe. Ställer
  man upp en maskin någon annanstans flyttas den av där den stod, och båda
  flyttarna hamnar i historiken.

Namnet `snoplats` och inte `position` är inte godtyckligt: `position` är
redan bemanningens positioner (Backansvarig, Fiket, Snöläggning). I
gränssnittet heter de "Positioner i backen" och "Funktioner".

## Förebyggande underhåll

En **serviceplan** säger att något ska göras med jämna mellanrum. När den
förfaller räknas fram i `server/underhall.mjs` – ren funktion, inga
databasanrop – ur intervalltyp, senaste utförande och, för timbaserade
planer, utrustningens drifttimmar.

Tre saker är värda att veta:

- **Månader är kalendermånader.** "Var sjätte månad" från 10 maj är
  10 november, inte 183 dagar senare.
- **Timbaserade planer ger ett uppskattat datum**, framskrivet ur hur mycket
  maskinen brukar gå, och det är märkt `uppskattat`. Saknas avläsning finns
  inget datum alls – systemet hittar inte på ett.
- **Högbelastningsperioder flyttar inte något av sig självt.** De ger ett
  *förslag* vid sidan av datumet. Planer märkta `kritisk` flyttas aldrig, och
  krocken visas i stället för att tystas.

En **manual** laddas upp som dokument och läser sig själv i ett steg:

1. `pdftotext` drar ut texten sida för sida.
2. `klassificera()` läser de första sidorna och säger vad dokumentet är –
   slag, titel, tillverkare, modell, utrustningstyp, en sammanfattning, och
   om det alls står något om underhåll. Namnet behöver man därför inte
   skriva; lämnas det tomt får dokumentet säga sitt eget.
3. `matchaDokument()` kopplar det till rätt maskin, men **bara när det är
   entydigt**: modell går före tillverkare, och tio kanoner av samma modell
   ger ingen koppling alls – de räknas upp i stället, så att människan kan
   välja.
4. `lasServicepunkter()` plockar de sidor som handlar om service och
   föreslår punkter, med sidnummer och citat.

Servicepunkterna sparas med status `forslag`. **En punkt utan källa sparas
inte alls** – går den inte att slå upp i manualen duger den inte som
underlag. Förslag räknas inte i årshjulet, och ett osäkert intervall måste få
ett värde innan planen godkänns: systemet räknar i dagar och kan inte arbeta
med "regelbundet".

Allt som kommer ur läsningen är ifyllt, inte bestämt. Tolkningen sparas rå i
`dokument.tolkning` så att det går att se vad modellen sa även efter att
någon rättat uppgifterna. Är AI:n avstängd fungerar uppladdningen ändå –
texten läses, dokumentet får filnamnet, och punkterna läggs in för hand.

En ny version av en manual ersätter den gamla men raderar den aldrig, och
pekar ut vilka godkända punkter som bör granskas om.

Flera manualer laddas upp i en omgång, men skickas **en fil i taget** från
klienten: en bunt på tjugo megabyte i samma anrop är inget att göra en
mobiluppkoppling till, och en fil som strular ska inte sänka de andra.
När manualerna blir många är det sökningen som gör dem användbara –
`sokIText()` svarar med sidnummer och omgivande text, så att träffen går att
slå upp i pappersexemplaret också.

## Snöläggningsbemanning

Kedjan är uppdelad i steg med flit:

```
prognos → fönster någon tagit ställning till → pass → förfrågan → svar → bokning
```

**En skickad förfrågan är inte bemanning.** `forfragan` är en egen tabell
skild från `bokning`, och `lage()` räknar `oadresserat` – underskott som
ingen ens fått frågan om. Det är den siffran som ska larma.

Ordningen bland kandidaterna kommer ur medlemmens eget säsongssvar
(`tillganglighet`) och hur mycket hen redan gjort. Men **önskemål går aldrig
före krav**: kompetens, roll, otillgänglighet, krockande pass och ålder
utesluter, de nedprioriterar inte.

**Åldersgränser** (`server/snoplan.mjs`): 16 år för arbetspass, 18 för
nattpass. Samma regel gäller i automatplaneringen, som annars bokar in folk
utan att fråga. En snökanon klockan tre på natten är inget barn ska bli
tillfrågat om.

## Personuppgifter i incidenter

Olyckor och tillbud ligger i en egen modul, och personuppgifterna i egna
kolumner (`person_namn`, `person_kontakt`, `person_alder`, `skada`,
`vittnen`). Det gör tre saker möjliga:

- **Dataminimering.** Behörigheten `incident` räcker för att arbeta med
  händelsen; `incident_person` krävs för att se vem det gällde. Övriga ser
  `[skyddad uppgift]`.
- **Spårbar åtkomst.** Varje läsning, ändring och gallring loggas i
  `incidentatkomst`.
- **Gallring utan att historien förstörs.** Ett gallringsdatum sätts vid
  registreringen; gallringen nollar personfälten och lämnar
  händelsebeskrivningen kvar.

Personuppgifter följer aldrig med vidare: journalposten om en incident bär
bara slag och plats, och ett åtgärdsärende ur en incident får en
beskrivning utan namn.

## Modulregistret i två delar

`moduldata.mjs` håller metadatan – nycklar, beroenden, sidor – och
`moduler.mjs` kopplar på rutterna. Delningen är inte kosmetisk: en modul som
behöver veta om en annan är påslagen (checklistorna frågar efter
driftjournalen innan de skriver en journalpost) måste kunna göra det utan
att importera hela ruttabellen, och därmed sig själv. Den cirkeln fanns och
sprack så fort en modulfil importerades fristående.

## Lägga till en modul

1. Skriv `server/api/<modul>.mjs` som exporterar `rutter` (använd `rutt()`
   från `http.mjs`).
2. Lägg tabellerna i `server/schema.sql` med `CREATE TABLE IF NOT EXISTS`.
   Nya kolumner i befintliga tabeller läggs i migreringslistan i `db.mjs`.
3. Registrera modulen i `server/moduler.mjs`: nyckel, namn, beroenden, rutter
   och vilka sidor den ger klienten.
4. Lägg sidan i klientens `SIDOR` med samma nyckel.
5. Skriv testerna i `tests/`. En modul utan test räknas inte som klar.

Inget mer. Ruttabellen, menyn, behörighetsprövningen och av/på per förening
sköter sig själva.

## Lägga till en förening

```bash
npm run ny-forening -- --nyckel vargen --namn "Vargens SK" \
  --doman vargen.nattviken.com --moduler arenden,bemanning,ideer \
  --lat 63.4 --lon 13.1 --ort Åre
npm run foreningar          # visar vad som finns och vad som är påslaget
```

Föreningen får en egen databas med kontoplan, standardpositioner, en säsong
och ett administratörskonto – ingen demodata. Peka domänen hit i Caddy och
starta om tjänsten. Demodata kan läggas i en förening med
`node server/fro.mjs --forening vargen --nollstall`.

## Varför en databas per förening

- **Ingen läcka kan konstrueras.** Alternativet, `forening_id` i varje tabell,
  är ett `WHERE` bort från att visa fel klubbs medlemsregister.
- **En förening är en fil.** Går att säkerhetskopiera, lämna ut vid
  förfrågan, flytta till egen drift eller radera på riktigt.
- **Bokföringen hålls isär på riktigt**, vilket är hela poängen med en
  obruten verifikationsserie.

Priset är att frågor över flera föreningar måste loopa över dem
(`foreningar().map(f => korSom(f, …))`). Det gör
sessionsstädningen och `npm run foreningar` redan.

## Var gränserna går

Ärligt om vad som *inte* är löst, så att ingen blir överraskad:

- **Processen är en.** Alla föreningar delar node-process och minne. Det
  räcker länge för klubbar i den här storleken, men en förening som får en
  trafiktopp påverkar de andra. Nästa steg vore en process per förening
  bakom samma Caddy – registret och skalet är redan förberedda för det.
- **Skrivningar är synkrona.** `node:sqlite` blockerar under frågan. Med
  tiotals föreningar och tunga rapporter kan det märkas.
- **Schemat är gemensamt.** Alla föreningar kör samma tabeller och samma
  migreringar. En förening kan inte ha ett eget fält. Behövs det är vägen
  en `extra`-kolumn med JSON, inte en gren i schemat.
- **Ingen plattformsadministratör finns ännu.** Föreningar läggs upp från
  kommandoraden. Det är med flit: att skapa en förening är sällsynt och
  allvarligt nog att göra medvetet.
- **Modulerna importerar varandra** där domänen hänger ihop (checklistor
  skapar ärenden, uthyrningen delar kioskens takräknare). Beroendena står i
  registret, så en avstängd modul drar in det den behöver i stället för att
  krascha. Det är enklare än ett händelsesystem och lättare att följa.

## Att hålla

- **Rör inte `process.env` i en modul.** Läs `instans('falt')` i stället, så
  följer inställningen föreningen.
- **Öppna aldrig en databas själv.** Använd `alla/en/kor/spara`; de hittar
  rätt databas genom skalet.
- **Bakgrundsarbete måste välja förening.** Allt utanför en begäran saknar
  skal och hamnar i standardföreningen. Linda i `korSom(forening, …)`.
- **Räknelogiken är ren.** `snoteknik`, `autoplan`, `stod`, `tid`, `pengar`
  och `bokforing`s uträkningar rör varken databas eller nät. Det är därför de
  går att testa, och därför de överlever en omskrivning av lagret under.
