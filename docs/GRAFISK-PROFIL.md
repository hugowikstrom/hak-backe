# Grafisk profil

Allt som rör utseendet står i `web/delad/profil.css` och `web/delad/marke.jsx`.
Logotypen och hur den blev vektor står i `docs/logotyp/`.
Webben, mobilappen och kiosken delar dem; var och en lägger bara sin egen
täthet ovanpå. Ändra på ett ställe, slår igenom på tre.

## Färger

Klubbgrönt är **mätt ur klubbens egen logotyp** (`docs/logotyp/HAK-alpina.png`),
inte ur en skärmdump: `#86bf58`. De andra tonerna är härledda ur den – samma
nyans och mättnad, bara olika ljushet – och sedan kontrastmätta.

| Token | Ljust | Mörkt | Används till |
| --- | --- | --- | --- |
| `--klubb-ren` | `#86bf58` | `#86bf58` | fyllning: listen, primärknappar, märket |
| `--klubb` | `#517a2f` | `#86bf58` | text, ramar och ikoner på ljus botten |
| `--klubb-djup` | `#416226` | `#d6e9c7` | rubriker och ikoner som ska bära tyngd |
| `--klubb-mjuk` | `#eff5eb` | `#181e13` | ljus bottenton bakom grönt |
| `--pa-klubb` | `#15210a` | `#15210a` | text direkt på `--klubb-ren` |
| `--pa-klubb-fyll` | `#ffffff` | `#15210a` | text direkt på `--klubb` |

**Två regler som är lätta att bryta:**

- `--klubb-ren` bär bara mörk text. Vit text på den ger 2,2:1 och är oläslig
  i motljus. Mörk text ger 7,7:1.
- `--pa-klubb` och `--pa-klubb-fyll` hör till **olika** gröna. Den första är
  för den ljusa logotypgrönan, den andra för den mörka `--klubb`. Byter man
  dem blir det grönt på grönt: 3,3:1 i stället för 5,0:1.

Mätta värden i ljust läge: `--klubb` mot vitt 5,03:1 · `--klubb-djup` mot
vitt 7,00:1 · mörk text på `--klubb-mjuk` 14,8:1. I mörkt läge bär
logotypgrönan sig själv mot ytan med 7,9:1. Ändras en ton: mät om den.

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

`web/delad/marke.jsx` bär **klubbens egen logotyp**, spårad ur
`docs/logotyp/HAK-alpina.png` till banor. Två delar:

- `Marke` – skölden med vårdkasen och åkaren. Listen i webben och apparna,
  app-ikonen, kontokortet.
- `Logotyp` – skölden plus ordmärket "HÄRNÖSANDS alpina". Där det finns
  plats att visa vem föreningen är: inloggningen och den publika sidan.

Logotypen är **enfärgad**, till skillnad från den ritning som fanns förut.
Det finns alltså ingen sköld att fylla separat: färgen styrs med
`--marke-motiv` och ingenting annat. På grön botten vitt, på ljus botten
`--klubb-ren`. Den som letar efter `--marke-fond` letar efter något som
togs bort när den riktiga logotypen kom in.

Märket är högre än brett (157 × 167). Lås höjden i CSS och låt bredden
följa – låser man båda pressas skölden ihop.

App-ikonerna i `web/mobil/public/ikon-*.png` rasteriseras ur samma banor.
Byts märket måste PNG:erna göras om – telefonerna hämtar inte nya själva.

Spårningen är en kopia, inte originalet. Kommer klubbens vektorfil från
Alltid Marknadsbyrå är den att föredra: byt banorna i `marke.jsx` och lämna
resten orört. `docs/logotyp/LASMIG.md` beskriver hur.

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
