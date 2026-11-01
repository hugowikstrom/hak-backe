# Så gör du

En kort genomgång av kontrolldelen i Backis: hur du loggar in, gör dagens
ronder, och vad som händer när något inte stämmer.

Allt nedan tar under en minut att göra i verkligheten. Är något otydligt är
det systemets fel, inte ditt — säg till.

---

## 1. Logga in

Gå till adressen du fått och välj en rad under **Prova systemet**:

| Konto | Kod | Vad du ser |
| --- | --- | --- |
| `backis` | `hak` | Projektsidan — vad klubben bygger, och lämna en idé |
| `anlaggning` | `07012345678` | Hela backen: underhåll, snöläggning, ronder och ärenden |
| `backansvarig` | `07012345678` | Dagens drift: ronder, ärenden och bemanning |

Tryck på raden och sedan **Logga in**.

Knapparna fyller bara i fälten åt dig. Har du ett eget konto loggar du in med
det i stället — då heter du ditt namn i systemet, och det är ditt namn som
står på ronderna du kvitterar.

---

## 2. Vad som måste göras innan backen öppnar

Startsidan svarar på en enda fråga: **vad måste vara gjort innan vi öppnar.**

Överst står *Ronder att göra i dag* med texten **"9 före öppning"**. Det är de
som räknas:

- **Lift – före öppning** × 3 (Stora liften, Teknikliften, Lilla liften)
- **Bandet – före öppning** (Transportbandet)
- **Backen – öppning** och **Backen – stängning**
- **Fiket – öppning** och **Fiket – stängning**
- **Skiduthyrningen – öppning**

Snöläggningens startkontroller ligger för sig längre ned. De gäller bara de
maskiner som faktiskt ska köra, och hör inte ihop med öppningen.

---

## 3. Gör en rond

1. Klicka på objektet — till exempel **Stora liften**.
2. Bocka av punkterna. Liftkontrollen har fyra:
   - Nödstopp testade i båda ändar
   - Linan ligger rätt i alla block
   - Provkörning utan last genomförd
   - På- och avstigning är plan och fri från is
3. Tryck **Markera klar**.

Objektet blir grönt och räknas av. Nästa lift är en egen rond och kvitteras
för sig.

> **Listorna är korta med flit.** En checklista på tio punkter blir inte gjord
> ordentligt — den blir bockad. Fyra punkter som betyder något blir lästa.

### Du kan inte hoppa över en säkerhetspunkt

Trycker du **Markera klar** utan att ha svarat får du:

> *4 säkerhetskritiska kontroller saknar svar: Nödstopp testade i båda ändar;
> Linan ligger rätt i alla block; Provkörning utan last genomförd; På- och
> avstigning är plan och fri från is*

Det finns ingen flagga för att tvinga förbi. **Systemet avgör inte om liften
får öppna — det gör du som kvitterar.** Systemet ser bara till att frågan
blev ställd.

---

## 4. När något är fel

Bocka inte av. Tryck **Avvikelse** på punkten och skriv vad som är fel:

> *Is vid påstigningen, behöver skrapas och saltas*

När du avslutar ronden blir avvikelsen **ett ärende av sig självt**, kopplat
till rätt objekt. Du hittar det under **Ärenden**, tillsammans med allt annat
som är fel i backen. Ingen behöver komma ihåg att skriva upp det, och ingen
behöver leta i en pärm efter vad som hände i tisdags.

Ett ärende hör antingen till **en maskin** eller till **en plats i backen** —
aldrig båda. Ett läckande vattenuttag stannar på lansplatsen när kanonen
byts; ett trasigt munstycke följer med kanonen.

---

## 5. Snöläggning

Under **Snöläggning** rapporterar du mätningen: temperatur, fuktighet, tryck
och flöde. Våtkulan räknas ut direkt och du får ett klartecken med
rekommenderad vattenmängd. Prognosen hämtas från YR och SMHI för just
Vårdkasbacken.

**Mätvärden hör hemma här, inte i en checklista.** Därför är
snöläggningsronderna bara avbockning — allt som ska mätas mäts på ett ställe.

---

## 6. Ute i backen: mobilen

Lägg till `/mobil/` på hemskärmen så startar den som en vanlig app.

- Du ser passet du bokat och ronderna som hör till det.
- **Den fungerar utan täckning.** Ronden sparas i telefonen och skickas upp
  när nätet kommer tillbaka.
- Du kan fota direkt på en avvikelse.
- Under **Rapportera** kan du prata in en rapport i stället för att skriva med
  vantar på. Ingenting journalförs förrän du läst igenom texten och bekräftat.

---

## 7. Ändra checklistorna själva

Ni äger listorna. Under **Checklistor → Mallar (redigera)** lägger ni till,
tar bort och ändrar punkter.

För varje punkt väljer ni:

- **Svarstyp** — bock, värde med enhet, eller fritext
- **Obligatorisk** — måste besvaras för att ronden ska gå att avsluta
- **Säkerhetskritisk** — går inte att lämna, och inte att markera som ej
  tillämplig

Håll er till tre till fem punkter per rond. Blir en lista längre än så är det
nästan alltid för att något hör hemma någon annanstans: ett mätvärde i
snöläggningen, en iakttagelse i ett ärende.

---

## 8. Vem ser vad

Alla loggar in i samma system men landar på olika ställen. Vyn styrs av
**uppdraget**, inte av vem som råkar vara inloggad:

| Uppdrag | Landar på |
| --- | --- |
| Backansvarig | Dagens drift: ronder, ärenden, bemanning |
| Anläggningsansvarig | Hela backen, inklusive underhåll och årshjul |
| Ordförande | Hela föreningen: ekonomi, tillträden, uppföljning |
| Sekreterare | Matrikel, möten och evenemang |
| Kassör | Bokföring, utlägg, plånböcker |
| Tränare | Grupper, närvaro, läger och tävlingar |
| Medlem | Sina pass, sina ronder, läget i backen |

Menyn visar bara det som hör till din arbetsyta. Du kommer åt resten ändå —
en länk eller en adress tar dig dit — men menyn hålls kort.

`Ctrl+K` hoppar till vilken sida som helst. `Ctrl+.` öppnar talrutan.

---

## 9. Projektsidan

På **`/projekt`** står vad klubben bygger, varför, och var varje del står.
Sidan går att läsa **utan att logga in** — skicka länken till vem som helst i
klubben.

Vid varje del finns en knapp där du kan prata in vad du tycker. En halv minut
räcker. Det kräver konto, för en idé utan avsändare går inte att följa upp.

Längst ned finns tidplanen och dokumenten — kravspecifikation, gantt och
rapport till styrelsen, som PDF. De skrivs ut ur systemet och speglar alltid
läget just den dagen.

## 10. Filmerna

Under **Hjälp** ligger genomgångarna, en per roll. Börja med *Kontroller i
telefonen* — den visar ronden så som den faktiskt görs, i mobilen.

Ny volontär? Peka på filmen som gäller hen.
