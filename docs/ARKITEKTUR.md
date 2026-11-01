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
*uppdrag* (ordförande, kassör, tränare, volontär), *kompetens* (fik,
uthyrning) och *grupp* (en namngiven samling tillträden). En rutt kräver
antingen en rollnivå (`'backansvarig'`) eller en behörighet (`'@ekonomi'`).
Arbetsytorna – startsida och meny per uppgift – räknas fram ur samma
underlag.

De fyra källorna **läggs ihop**, och ingen av dem kan ta bort något en annan
gett. Grupperna finns för att de tre första inte räcker: en klubb vill kunna
säga "snögänget" och mena de nio som får starta pumpstationen, utan att göra
var och en av dem backansvarig. En medlem kan vara med i flera, och en grupp
ger behörigheter, arbetsytor och – om klubben vill – ett *rollgolv* som
höjer men aldrig sänker.

Tre saker är värda att veta om grupperna:

- **`behorighetsgrupp` är inte `traningsgrupp`.** Den senare, med sin
  `gruppmedlem`, är Freeski och U12 – vem som tränar med vem. Blandar man
  ihop dem får en tolvåring kassabehörighet för att hens grupp har en
  tränare. Därför heter tillträdenas tabeller `grupptillhorighet` och
  rutterna `/api/tilltrade`.
- **Ingen kan ge bort mer än hen själv har.** Rutterna kräver
  `behorighetsstyrning` – ordförande eller administratör – och `provaDelning()`
  i `server/api/tilltrade.mjs` stoppar den som försöker lägga en behörighet
  eller ett rollgolv över sin egen nivå i en grupp. Administratören står över
  spärren, för någon måste kunna sätta upp det första.
- **Återkallelse gäller på en gång.** `till` är ett planerat slutdatum som
  gäller dagen ut; `aterkallad` är en tidsstämpel som stänger tillträdet i
  samma stund. Två kolumner, för ett planerat slut och ett indraget tillträde
  är inte samma sak. Raden ligger kvar – att någon haft kassabehörighet en
  säsong är en uppgift värd att kunna svara på.

**Navigering.** Menyn är ett träd med få grenar, och modulen äger vilken
gren dess sidor hänger i (`grupp` i `server/moduldata.mjs`). Grenarna
kommer till klienten i `/api/plattform` som `menygrupper`, och
`web/src/delar/navigering.jsx` bygger trädet ur det den inloggade faktiskt
får se. En gren med en enda sida blir ingen gren – den sidan står löst,
för en rubrik man måste slå upp för att hitta ett enda ord är en kostnad
utan vinst. Samma träd ritas i sidomenyn och i luckan på liten skärm; det
finns ingen egen mobilmeny att hålla i synk. `Ctrl+K` öppnar
hoppa-till-rutan, som är den snabba vägen för den som redan kan systemet.

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

Ett **dokument** laddas upp i tre steg, och stegen är riktiga anrop – inte
en animation. Tolkningen tar tiotalet sekunder och den som laddar upp ska
kunna se vad som pågår.

1. **Filen in.** `POST /api/underhall/dokument` tar emot råa byte och
   strömmar dem till disk; frågesträngen bär uppgifterna. Ingenting stort
   passerar minnet, så taket sitter i disken och i Caddy (300 MiB på
   dokumentvägen, 16 MiB på allt annat) och inte i processen. `pdftotext`
   drar ut texten sida för sida.
   `innehallskarta()` klassar samtidigt varje sida: tekniska data,
   säkerhet, installation, underhåll, serviceintervall, felsökning,
   reservdelslista, sprängskiss, elschema. Det är **regler och inte
   modell** – rubriker är förutsägbara, och en karta som stämmer varje
   gång är mer värd än en som är kvick ibland. Dominerar en sorts avsnitt
   sidorna avgör kartan också vad hela dokumentet är, utan att någon
   modell behöver svara.
2. **Vad är det här?** `analysera` låter `klassificera()` läsa de första
   sidorna: slag, titel, tillverkare, modell, serienummer, utgåva,
   utrustningstyp och en sammanfattning. Namnet behöver man därför inte
   skriva. Sedan plockar `utvinn()` ut **det som är relevant för just den
   sortens dokument** – en manual har serviceintervall, ett protokoll har
   utfört arbete och anmärkningar, ett intyg har ett sista
   giltighetsdatum. `matchaDokument()` kopplar till rätt maskin, men bara
   när det är entydigt: tio kanoner av samma modell ger ingen koppling
   alls, de räknas upp i stället.

   **Artikelnummer går aldrig genom en modell.** `reservdelarUrText()`
   läser dem ordagrant ur reservdelslistans och sprängskissens sidor. Ett
   artikelnummer som blivit en siffra fel ger fel del i lådan, och det
   märks först när paketet kommer. Allt som läses med regler – kartan och
   numren – finns kvar även när modellen är nere.
3. **Servicepunkterna.** `lasServicepunkter()` plockar de sidor som handlar
   om service och föreslår punkter, med sidnummer och citat.

Uppgifter som bara stod i manualen fylls i på maskinen – men bara i **tomma
fält**. Komponenter, reservdelar, leverantör och protokollets anmärkningar
föreslås och läggs in med ett tryck: registret ska spegla backen, inte en
manual.

Kontextfönstren är olika stora och sällan dokumenterade. Går texten inte in
halverar `tolka()` den och försöker igen, och gatewayens fel översätts av
`begripligt()` till något en människa kan göra något av – ingen ska behöva
läsa "cooldown_list" för att förstå att tolkningen är nere och att fälten
får fyllas i för hand.

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

## Medlemmens vy

Appens startsida visar **en sak**, och vilken avgörs av var man är i dygnet
och i säsongen. Ordningen ligger i `server/mitt.mjs` – ren funktion, egna
tester – och inte i klienten:

```
på pass → strax före pass → obesvarad fråga → saknade timmar → nästa pass → lugnt
```

Står man på pass är det ronderna som gäller, inte en uppmaning att boka
fler. Ronderna som visas är de vars checklista pekar ut passets position
(`checklistmall.position_nyckel`), så en snöläggare slipper fikets
öppningslista.

Hela sidan hämtas i **ett anrop** (`GET /api/mitt`). En telefon i en
skidbacke ska inte behöva fem rundturer för att veta vad användaren ska
göra, och de dyra delarna – rondlistan och lediga pass – räknas bara fram
i de lägen där de faktiskt visas.

Pass som föreslås är bara de medlemmen **får** boka: ett pass som kräver
backansvarig föreslås inte åt den som inte är det. Att visa ett förslag som
ger ett nej är sämre än att inte visa det.

Flikraden följer samma tanke: fyra flikar för en medlem, sju för den som
har ansvar för backen. Det som inte är en flik är en pushad vy med
bakåtknapp – utlägget hör dit, för kvittot fotas på parkeringen utanför
butiken och inte vid ett skrivbord.

## Rollernas vyer

Rollvyerna är arbetsytorna i `ARBETSYTOR`, och de väljs av **uppdraget**,
inte av rollen: `arbetsytorFor()` ger ordföranden *Ordföranden*,
sekreteraren *Sekreteraren*, kassören *Kassören*, tränaren *Tränaren*,
kioskvärden *Kiosken*, och alla *Medlem* sist.

Ordningen är startsidan – man landar i den första ytan – och därför kommer
den egna rollen före den gemensamma `styrelse`. En kassör som loggar in ska
börja i ekonomin, inte i en översikt över hela föreningen.

Ordförande och sekreterare har **samma behörighet att läsa men inte samma
arbete**: ordföranden svarar för ekonomin och tillträdena, sekreteraren för
matrikeln och mötena. Att ge dem samma startsida gör att båda får leta förbi
den andras. Ledamöter och suppleanter får bara `styrelse` – där finns inget
eget arbete att skilja ut.

En yta är ett **urval ur menyn, inte en spärr**. Skriver man in en adress
eller följer en länk till en sida man har rätt till visas den, även om den
inte hör till ytan man står i (`tillatna` mot `synliga` i `web/src/app.jsx`).
Det som styr åtkomst är behörigheten på servern; ytan styr bara hur kort
menyn är.

## Kontrollvyn

`web/mobil/src/kontroll/` är en **andra navigation över samma data**. Den
är formad som systemet klubben kommer ifrån: vit topp med märket, tre
flikar, ett välvt grönt fält med vem man är, och ett rutnät av kort.
Allt under huven är Backis – samma API, samma offlinekö, samma
inloggning, samma behörigheter. Det som skiljer är vägen in.

Formen är avstämd **sida för sida mot den riktiga appen** på klubbens
egen telefon: startskärmens ljusa mönstrade fält (inte grönt – förlagan
bär sin färg i logotypen), ikonerna, de vänsterställda arken, enhetens
två piller och utfällbara räknare, avvikelsekortens nummerrad och
prioritetschip. Där jag först gissade blev det fel, och gissningarna är
utbytta mot det som faktiskt står på skärmen.

Inloggningen är telefonnummer och pinkod. Pinkoden ligger i ett
**maskerat textfält, inte ett `type=password`** – ett lösenordsfält
väcker webbläsarens lösenordshanterare, som erbjuder sig att spara koden
och sedan varnar för att den finns i en dataläcka. Varningen är sann men
står i vägen varje gång någon loggar in.

Sessionen är **en hel säsong och glider framåt** (`HAK_SESSIONSDYGN`,
180 dygn). Appen används i skov – några pass i november, inget i
januari, varje helg i mars – och den som måste logga in på nytt mitt i
ett pass gör det med vantar på i mörker, eller inte alls. Kakan förnyas
vid varje `GET /api/jag`, alltså vid varje appstart.

Vyn väljs av **värdnamnet** (`HAK_KONTROLLVARDAR`, som standard
`checkproof` och `kontroll`), kan tvingas med `?kontroll=1` i adressen,
och sparas sedan i `localStorage` under `hak-kontrollvy`.

Trappan är ärvd och medvetet lång:

    arbetsställe → objekt → vad man vill se → den enskilda posten

Fyra steg för att nå ett besiktningsintyg är fler än en skulle ritat från
början. Det är ändå rätt här: volontärerna kan trappan, och igenkänning
är värd mer än ett sparat tryck. Den som vill gå raka vägen når samma
ronder från Backis vanliga startsida.

Navigationen är en **stack**, inte en router (`Kontrollvy` i
`kontroll/index.jsx`). Varje steg lägger sig på föregående och bakåtpilen
tar bort det översta. En router hade tappat vad man valde på väg ned.
Ronden själv ligger kvar på appens yttre router, och kontrollvyn göms
i stället för att plockas ned medan den pågår – annars hamnar den som
avslutat en kontroll på startskärmen i stället för på maskinen hen stod
vid.

### Installerad app

Båda klienterna är installerbara webbappar, och **manifestet skrivs av
servern per värdnamn** (`manifest()` i `server/index.mjs`). Det går inte
att ha som en statisk fil av två skäl: Backis är fleranvändarsystem och
appen ska heta klubbens namn på hemskärmen, inte produktens; och
kontrollvyn bor i roten på sitt eget värdnamn, så ett manifest med
`start_url: /mobil/` hade öppnat ikonen i fel vy.

Servicearbetaren serveras därför på två adresser — `/mobil/sw.js` och
`/sw.js` — av samma fil. Var den hämtas ifrån avgör vad den styr, och
filen läser själv ut sin rot (`new URL('./', self.location)`) för att veta
vilket skal som ska cachas. På ett kontrollvärdnamn cachas `/` men aldrig
`/index.html`: de är två olika sidor där, och fel av dem ger en app som
öppnar administrationen när täckningen är borta.

Servicearbetaren hämtar **sidan från nätet först** och tillgångarna ur
cachen först. Tillgångarna har hash i filnamnet och kan aldrig bli fel;
sidan pekar ut vilka som gäller. Med cache-först på båda syntes en
driftsättning inte förrän appen startats om en andra gång.

`beforeinstallprompt` fångas i `main.jsx`, **innan React monteras**.
Fångas den först i en `useEffect` har webbläsaren redan skickat den, och
knappen "Lägg till på hemskärmen" dyker aldrig upp. Haken `useInstallera`
i `delar.jsx` läser bara det som lagts undan.

### Generiska klassnamn i kontrollvyn

Vyn har egna komponenter men delar stilmall med mobilappen, och appen
äger korta namn som `.post`, `.topp`, `.stor` och `.rad`. Tre buggar i
rad kom ur det: ärendekortens nummerrad blev grön och klistrad
(`.topp`), heroknappen bredde ut sig över hela skärmen (`button.stor`
sätter `width: 100%`), och enhetens etiketter la sig bredvid värdena i
stället för ovanför (`.post` är en flexrad).

Regeln är därför: ett generiskt namn inuti kontrollvyn måste antingen
vara `kv-`-prefixat eller stå under en `.kv-`-förälder som väger tyngre
än appens regel. Och en egenskap som appen sätter men vyn inte sätter
tillbaka gäller — specificitet hjälper bara mot de deklarationer man
faktiskt skriver.

Samma sak gäller färger: tokens står på varje rot vyn kan ha
(`.kv`, `.kv-ark-bak`, `.inlogg.kv-inlogg`), inte bara på `.kv`. Ett ark
som renderades utanför `.kv` fick `color: var(--kv-text)` som inte gick
att lösa upp, ärvde appens textfärg i stället, och blev i mörkt läge
nästan vit text på ett ljust ark. Det såg ut som att knappen inte gjorde
någonting.

### Där kopian och förlagan skiljer sig

Två ställen är medvetna avvikelser, och båda syns:

**Ronden.** Förlagan kör alla punkter i en rullande lista där man fäller
ut en punkt i taget och svarar med två färgblock – gul med utropstecken,
grön med bock – och har lägena *Standard* och *Fullskärmsläge*. Backis
rond är en punkt i taget med *OK*, *Avvikelse* och *Går inte att utföra*,
och lägena heter *Steg* och *Lista*. Begreppen är desamma, formen är
inte. Ronden delas med Backis Rond, så ett byte här byter för alla –
därför står den kvar tills klubben sagt att den ska bytas.

**Aldrig utförd.** En daglig kontroll som aldrig gjorts hamnar under
*Försenade* i Backis och under *Kommande* i förlagan. Skillnaden är inte
ett fel i räkningen utan i indata: Backis rytm ger varje schemalagd
kontroll en förfallodag, förlagan har ingen för en kontroll utan schema.

### Schemat: tre sorter, och nollpunkten

En checklista har två oberoende egenskaper. **Rytmen** (`intervall`)
säger när i backens dygn den hör hemma – vid start, varje pass,
dagligen. **Schemat** (`intervalltyp`) säger hur ofta den förfaller, och
det är det tillverkaren skriver i manualen:

| typ | räknar | visar |
| --- | --- | --- |
| `handelse` | perioden i rytmen | som förr |
| `dagar` | `intervall_dagar` efter senast utförd | *Utförs senast* · *Utför om* · *Utför inom* |
| `drifttimmar` | `intervall_timmar` efter mätaren vid senaste | *Utförs tidigast vid N h* |

`fonster_dagar` är fristen efter förfallodagen, och är hela skillnaden
mellan *utför om* och *utför inom*. Utan fönster förfaller kontrollen på
dagen.

`start_timmar` är nollpunkten för ett timschema innan det gjorts en
första gång. Den behövs: maskinens timmar **i dag** duger inte som
nollpunkt, för de rör sig, och en gräns som flyttar med mätaren nås
aldrig. Noll duger inte heller – då är varje gammal lift sjutusen timmar
försenad vid uppstart. Saknas nollpunkt står kontrollen som *ingen
gjord* utan nedräkning, vilket är sant.

Körningen sparar `checklistkorning.timmar` vid avslut. Det är den
siffran nästa timintervall räknar från, inte maskinens timmar i dag.

`kontrolltyper()` slår upp senaste körningen **utan tidsgräns**.
`lage()` tittar bara 21 dagar bakåt – lagom för frågan "vad ska göras i
dag", obrukbart för ett schema på 90 dagar. Den som gjorde
kvartalskontrollen för hundra dagar sedan hade annars sett *Ingen gjord*
och förlorat sin nollpunkt.

### Försenat och aktivitet

Två begrepp är vyns egna och räknas i `server/api/kontroll.mjs`:

* **Försenad** räknas från när kontrollen senast gjordes plus
  intervallet, inte från periodens början. En daglig kontroll som gjordes
  i går är inte försenad en dag bara för att dygnet bytts. En kontroll
  som aldrig gjorts är försenad utan att ha någon siffra – den har ingen
  historik att räkna från.
* **Aktivitet** på ett objekt är kontroller, tankningar och service i
  samma spalt. Tillsammans förklarar de varför maskinen mår som den gör;
  var för sig gör de det inte.

`POST /api/kontroll/service` skriver och kvitterar en åtgärd i **samma
transaktion**. Backis vanliga modell är planerad åtgärd först och utförd
sedan, men den som står med oljekannan i handen har inte planerat något –
hen har gjort det. En tappad uppkoppling ska inte kunna lämna efter sig
en service som ser planerad ut fast den är gjord.

## Pengar som rör sig mellan klubben och medlemmen

Tre vägar, och de är åtskilda för att de är olika saker:

| | Vad | Konto |
| --- | --- | --- |
| **Plånbok** | Medlemmen har lagt in pengar i förväg | 2420, en skuld |
| **Utlägg** | Medlemmen har lagt ut pengar åt klubben | 2890, en skuld |
| **Avgift** | Medlemmen betalar för något | 3120 eller 31xx, en intäkt |

**Plånboken är en skuld, inte en intäkt.** Pengarna är medlemmens ända till
dess att något köps; påfyllningen krediterar 2420 och köpet debiterar det.
Att bokföra påfyllningen som en intäkt vore att räkna in pengar klubben
ännu inte tjänat.

**Utlägget bokförs i två steg**, och det är med flit. Godkännandet lägger
kostnaden på sitt konto och skulden till medlemmen på 2890; utbetalningen
löser skulden mot banken eller mot plånboken. Mellan de två stegen kan ett
månadsskifte ligga, och det är just uppdelningen som gör att kostnaden
hamnar i rätt period. Ett avslag kräver alltid ett skäl – ett utlägg som
bara tystnar är värre än ett som nekas – och ett redan bokfört utlägg kan
inte avslås, bara rättas med en motbokning.

Utbetalning **till plånboken** är inte en genväg utan det vanliga fallet i
en klubb där samma person som handlar också står i fiket varje lördag.
Verifikationen är densamma; bara motkontot skiljer.

## Läger, tävlingar och samåkning

`evenemang` är skilt från `traningstillfalle` med flit. Ett
träningstillfälle är onsdag kväll för U12 och återkommer; ett evenemang är
resan till Kläppen med anmälan, avgift, femton platser och sista
anmälningsdag. Att trycka in båda i samma tabell ger den ena fält den inte
behöver.

**Reservkön är inte en extra funktion.** Utan den står någon och ringer
runt när en familj hoppar av tre dagar före avresa. Kön behåller sin
ordning efter anmälningstid, och `fyllFranKon()` körs efter varje avbokning
och efter varje höjning av platsantalet – den tömmer sig själv.

Att **anmäla sig** kräver ingen behörighet; att **arrangera** kräver
`evenemang`. Skillnaden bär mer än den ser ut: arrangören ser deltagarnas
behov (specialkost, allergier) och samåkningarnas telefonnummer. Kassören
står därför inte i den kretsen – att kvittera en avgift går genom `kassa`.

I samåkningen visas kontaktuppgifter för **föraren och dem som sitter i
bilen**, ingen annan. En lista över vem som åker vart med vem är känsligare
än den ser ut.

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
