# Drift

- **Tjänst:** `hak.service` (kopia i `drift/hak.service`), lyssnar på
  127.0.0.1:8120 och körs som `hugo`. Enda skrivbara katalogen är
  `/home/hugo/hak/backe/data`.
- **Ingång:** Caddy-blocket i `drift/caddy-block.txt` ligger i
  `/home/hugo/aiserver/caddy/Caddyfile` och pekar på 8120. Caddy binder till
  192.168.68.88 och har `admin off`, så omladdning sker med
  `cd /home/hugo/aiserver && docker compose restart caddy`.
- **Certifikat:** hämtas automatiskt från Let's Encrypt. `*.nattviken.com`
  pekar redan på routern, så inget DNS-arbete behövs.
- **E-post:** går till Mailpit på 127.0.0.1:1025, läses på
  <http://127.0.0.1:8025>. Byt `HAK_SMTP_*` i enheten när klubbens riktiga
  adresser ska användas, och sätt `HAK_EPOST_AV=0` under tiden för att inte
  mejla medlemmar av misstag.

## AI-tolkningen

Talade driftrapporter skrivs av med husets STT på 8115 och struktureras av
LiteLLM-gatewayen på 4000. Modellen är `lokal`, alltså llama-server på samma
maskin: journal och incidentrapporter ska inte lämna huset.

Nyckeln ligger i `drift/hak.env`, som inte är med i git. Töm filen för att
stänga av tolkningen – då fungerar allt ändå, personalen får transkriptet och
fyller i själv.

```bash
curl -s localhost:8120/api/drift/journal -b kaka | jq .ai   # {"pa":true,"modell":"lokal"}
```

Byts modellen till en hos en leverantör (`HAK_AI_MODELL`) gäller det inte
incidentrapporter – de tvingas tillbaka till den lokala modellen i koden.

## Manualtolkning

PDF-texten dras ut med `pdftotext` (poppler-utils), som måste finnas på
maskinen:

```bash
pdftotext -v   # 26.01.0
```

Saknas den sparas dokumentet ändå – bara textutdraget och tolkningen uteblir,
och servicepunkterna får läggas in för hand.

## Flera föreningar

I dag kör maskinen en förening: registret `data/foreningar.json` saknas, och
då byggs en förening av miljövariablerna mot `data/hak.db`. Allt fungerar som
förut.

Ska en till förening in:

```bash
npm run ny-forening -- --nyckel vargen --namn "Vargens SK" --doman vargen.nattviken.com
# lägg till ett Caddy-block för domänen som pekar på 127.0.0.1:8120
sudo systemctl restart hak
npm run foreningar
```

Caddy måste skicka med värdnamnet – `reverse_proxy` gör det, och appen läser
`X-Forwarded-Host` före `Host`. Varje förening får sin egen databasfil under
`data/foreningar/`, som ska med i säkerhetskopian.

## Driftsätt en ändring

```bash
cd /home/hugo/hak/backe
npm run verify                 # tester + bygge
sudo systemctl restart hak     # servern läser web/dist vid varje svar,
                               # men omstart tömmer också sessionstabellen
systemctl status hak --no-pager
curl -s https://backis.nattviken.com/halsa
```

Båda klienterna byggs till `web/dist` (webben i roten, mobilappen i
`web/dist/mobil`) och serveras av Node. Glöms `npm run build` visar sidan den
gamla versionen – `halsa` säger alltså inte allt. Kör alltid `npm run build`,
inte `build:webb` ensamt: bygget rensar `web/dist` först och mobilappen måste
byggas efteråt.

Appikonerna är rasteriserade ur `web/mobil/public/ikon.svg`. Ändras märket
måste PNG:erna göras om, annars ligger det gamla kvar på telefonernas
hemskärmar tills appen installeras om.

Mobilappen är en PWA. Servicearbetaren (`/mobil/sw.js`) cachar appskalet, så
en telefon kan ligga kvar på en gammal version tills den laddas om. Höj
`CACHE`-namnet i `web/mobil/public/sw.js` när något i skalet måste ut direkt.

## Pengar

- **Swish** är satt i enheten (`HAK_SWISH_NUMMER`). QR-koderna hämtas från
  Swish öppna QR-tjänst och fylls i med belopp och meddelande `HAK <nummer>`.
  Servern får aldrig veta att betalningen gått igenom – kassan kvitterar. Med
  ett Swish Handel-avtal kan kvittensen bytas mot deras callback.
- **Plånboken** är klubbens skuld till medlemmen (konto 2420) tills hen
  handlar. Kassan fyller på under Kassa → Plånböcker, kassören kan betala
  tillbaka. Rabattsatsen ligger i tabellen `installning`.
- **Bokföringen** kan inte ändras i efterhand. Ska något bort bokförs en
  rättelse, och `npm run fro -- --nollstall` bygger om hela databasfilen.

## Säkerhetsläge

- Allt utom inloggning kräver session. Skrivningar kräver dessutom headern
  `x-hak: 1`, vilket stoppar enkel CSRF.
- Lösenord hashas med scrypt. Grunddatats konton har lösenordet `hak` och
  **bör bytas innan riktiga medlemmar läggs in**, eftersom sajten är publik.
- Databasen innehåller namn, e-post och telefonnummer. Den backas upp med
  resten av `/home/hugo` av `aiserver/bin/backup.sh`.
- Bilder från mobilronderna ligger som filer i `data/bilder/` och kräver
  inloggning. De tas aldrig bort automatiskt.

## Nollställ grunddata

```bash
sudo systemctl stop hak
node server/fro.mjs --nollstall
sudo systemctl start hak
```
