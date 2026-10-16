# Grafisk profil

Allt som rör utseendet står i `web/delad/profil.css` och `web/delad/marke.jsx`.
Webben, mobilappen och kiosken delar dem; var och en lägger bara sin egen
täthet ovanpå. Ändra på ett ställe, slår igenom på tre.

## Färger

Klubbgrönt är hämtat ur logotypen på harnosandsalpina.se.

| Token | Ljust | Mörkt | Används till |
| --- | --- | --- | --- |
| `--klubb-ren` | `#8cc63f` | `#8cc63f` | fyllning: listen, primärknappar, märkets figur |
| `--klubb` | `#477c20` | `#9ad44f` | text, ramar och ikoner på ljus botten |
| `--klubb-djup` | `#35611a` | `#c6ea9a` | text ovanpå `--klubb-ren` |
| `--klubb-mjuk` | `#f1f8e7` | `#1d2a14` | ljus bottenton bakom grönt |
| `--pa-klubb` | `#15210a` | `#15210a` | text direkt på `--klubb-ren` |

**Regeln som är lätt att bryta:** `--klubb-ren` bär bara mörk text. Vit text
på den ger 2,0:1 och är oläslig i motljus.

Alla textfärger är mätta mot både vit yta och sin egen mjuka bottenton och
når minst 4,6:1. Ändras en ton: mät om den.

Neutralerna är varma med ett stänk grönt – `--yta` (kort), `--bak` (sidans
botten), `--bak-2` (nedtonat), `--hover`, `--ram`, `--ram-stark`, `--text`,
`--text-svag`, `--text-svagare`.

## Betydelser

Grönt är varumärket. Status har egna färger, och de används aldrig omvänt.

| Token | Betyder | Exempel |
| --- | --- | --- |
| `--ok` | klart, godkänt, betalt | rond klar, hyra återlämnad |
| `--varning` | behöver uppmärksamhet | ronder kvar, obetald order |
| `--fara` | akut eller trasigt | säkerhetsrisk, plånboken räcker inte |
| `--info` | pågår, neutral upplysning | ny, tillagas, utrustning ute |
| `--natt` | nattpass | helg och natt i bemanningsrutnätet |
| `--lila` | tilldelat av någon annan | autoplanerat pass |

Varje färg har en mjuk bottenton med samma namn plus `-mjuk`.

## Märket

En ritning i `web/delad/marke.jsx`, i tre nivåer efter storlek:

- **44 px och uppåt** – hela motivet: sköld, vårdkasen med stegpinnar och
  åkaren i sväng. App-ikon, inloggning, kontokort.
- **28–44 px** – vårdkasen utan stegpinnar och en nättare åkare. Listen i
  webben och apparna. Under den här storleken blir stegpinnarna gröt.
- **Under 28 px** – skölden och åkaren i grova drag.

Färgerna styrs med `--marke-fond` (skölden) och `--marke-motiv` (figurerna).
På grön botten: vit sköld, grön figur. På vit yta: grön sköld, vit figur.

App-ikonerna i `web/mobil/public/ikon-*.png` rasteriseras ur `ikon.svg`.
Ritas märket om måste PNG:erna göras om – telefonerna hämtar inte nya själva.

Klubbens riktiga vektorlogotyp kommer från Alltid Marknadsbyrå. Finns den
att få byts märket mot den, och ikonerna härleds ur den i stället.

## Täthet per klient

| | Webben | Mobilappen | Kiosken |
| --- | --- | --- | --- |
| Text | 13 px | 16 px | 16 px |
| Radie | 6 px | 16 px | 16 px |
| Tryckyta | 28 px | 46–64 px | 50–64 px |
| Tanke | arbetsverktyg, mycket på skärmen | en hand, en vante | gäst i motljus |

## Mörkt läge

Profilen definierar både `prefers-color-scheme: dark` och `[data-tema]`, så
webbklientens egen växel fungerar oavsett vad systemet säger. Apparna följer
systemet. Skriv aldrig en färg direkt i en komponent – då missar den mörkt
läge.
