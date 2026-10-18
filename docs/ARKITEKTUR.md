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
