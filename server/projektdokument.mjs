// Projektets dokument: kravspecifikation, tidplan och rapport till styrelsen.
//
// Skrivs ut ur samma tabeller som projektsidan läser. Det är hela poängen:
// ett dokument som skrivs för hand blir inaktuellt den dag någon ändrar
// något utan att komma ihåg att uppdatera det, och ett projekt som
// beskrivs av två källor beskrivs snart av noll.
//
// PDF:en görs av webbläsaren som redan finns på maskinen. Att dra in ett
// PDF-bibliotek för tre dokument vore att betala underhåll i åratal för
// något Chrome gör gratis.
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { alla, en } from './db.mjs';
import { instans } from './foreningar.mjs';
import { MODULDATA } from './moduldata.mjs';
import { ARBETSYTOR, BEHORIGHETER, BEHORIGHETSNAMN } from './behorighet.mjs';
import { STATUSNAMN } from './api/projekt.mjs';
import { idag } from './tid.mjs';

const kor = promisify(execFile);

export const DOKUMENT = {
  kravspecifikation: { titel: 'Kravspecifikation', oppen: true },
  tidplan: { titel: 'Tidplan', oppen: true },
  styrelserapport: { titel: 'Rapport till styrelsen', oppen: false },
};

const flykt = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (t) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[t]);

/** Blankrad blir nytt stycke – texterna skrivs av människor, inte i markdown. */
const stycken = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((s) => `<p>${flykt(s)}</p>`)
    .join('\n');

const STIL = `
  @page { size: A4; margin: 22mm 18mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font: 11pt/1.55 "Source Sans 3", "Helvetica Neue", Arial, sans-serif;
    color: #1b2116; margin: 0;
  }
  h1 { font-size: 24pt; line-height: 1.1; margin: 0 0 4pt; }
  h2 { font-size: 14pt; margin: 20pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #dfe4d8; }
  h3 { font-size: 11.5pt; margin: 13pt 0 3pt; }
  h2, h3 { break-after: avoid; }
  p { margin: 0 0 7pt; max-width: 36em; }
  .etikett { font-size: 8.5pt; letter-spacing: .1em; text-transform: uppercase; color: #517a2f; font-weight: 600; }
  .under { color: #6c7466; margin-bottom: 14pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 6pt 0 12pt; }
  th, td { text-align: left; padding: 4pt 6pt; border-bottom: .5pt solid #dfe4d8; vertical-align: top; }
  th { font-size: 8pt; letter-spacing: .07em; text-transform: uppercase; color: #6c7466; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .del { break-inside: avoid-page; margin-bottom: 4pt; }
  .varfor { border-left: 2pt solid #86bf58; padding-left: 8pt; margin: 0 0 7pt; color: #416226; }
  .markering { background: #eff5eb; border: .5pt solid #cbdabe; padding: 7pt 9pt; margin: 8pt 0; }
  .bricka {
    display: inline-block; font-size: 8pt; font-weight: 600; padding: 1pt 5pt;
    border-radius: 8pt; background: #eceee8; color: #6c7466;
  }
  .bricka.i_drift { background: #e3f3ea; color: #1f7a4d; }
  .bricka.provas { background: #fdf0d5; color: #946000; }
  footer { margin-top: 18pt; padding-top: 6pt; border-top: .5pt solid #dfe4d8; font-size: 8.5pt; color: #98a092; }
`;

const ram = (titel, kropp) => `<!doctype html><html lang="sv"><meta charset="utf-8">
<title>${flykt(titel)}</title><style>${STIL}</style><body>${kropp}
<footer>${flykt(instans('namn', 'Föreningen'))} · Backis · utskrivet ${idag()}.
Dokumentet genereras ur systemet och speglar läget den dagen.</footer></body></html>`;

const huvud = (titel, under) => `
  <span class="etikett">${flykt(instans('namn', 'Föreningen'))}</span>
  <h1>${flykt(titel)}</h1>
  <p class="under">${flykt(under)}</p>`;

const delar = () => alla('SELECT * FROM projektdel WHERE aktiv=1 ORDER BY ordning, id');
const texter = () => alla('SELECT * FROM projekttext ORDER BY ordning, nyckel');

// ---------------------------------------------------------------------------

function kravspecifikation() {
  const d = delar();
  const t = texter();
  const moduler = MODULDATA.map(
    (m) => `<tr><td>${flykt(m.namn)}</td><td>${flykt(m.beskrivning || '')}</td>
      <td>${m.karna ? 'Kärna' : 'Valfri'}</td></tr>`
  ).join('');
  const behorigheter = Object.keys(BEHORIGHETER)
    .map(
      (b) => `<tr><td>${flykt(b)}</td><td>${flykt(BEHORIGHETSNAMN[b] || '')}</td>
        <td>${flykt((BEHORIGHETER[b].roller || []).join(', ') || '–')}</td>
        <td>${flykt((BEHORIGHETER[b].uppdrag || []).join(', ') || '–')}</td></tr>`
    )
    .join('');
  const ytor = Object.entries(ARBETSYTOR)
    .map(([n, y]) => `<tr><td>${flykt(y.namn)}</td><td>${flykt(y.beskrivning || '')}</td>
      <td class="num">${y.sidor.length}</td></tr>`)
    .join('');

  return ram(
    'Kravspecifikation',
    huvud('Kravspecifikation', 'Backis — system för backdrift, kontroller och föreningsadministration') +
      t.map((x) => `<h2>${flykt(x.rubrik)}</h2>${stycken(x.text)}`).join('') +
      `<h2>Delarna</h2>
       <p>Varje del beskrivs med vad den gör, varför den finns och var den står i dag.</p>` +
      d
        .map(
          (x) => `<div class="del"><h3>${flykt(x.rubrik)}
            <span class="bricka ${x.status}">${flykt(STATUSNAMN[x.status] || x.status)}</span></h3>
            ${x.varfor ? `<div class="varfor">${stycken(x.varfor)}</div>` : ''}
            ${stycken(x.text)}</div>`
        )
        .join('') +
      `<h2>Moduler</h2>
       <p>Systemet är uppdelat i moduler som kan slås på eller av per förening.
          Kärnmoduler går inte att stänga av.</p>
       <table><thead><tr><th>Modul</th><th>Vad den gör</th><th>Slag</th></tr></thead>
       <tbody>${moduler}</tbody></table>

       <h2>Behörigheter</h2>
       <p>Roll, uppdrag, kompetens och behörighetsgrupp läggs ihop. Ingen av dem kan
          ta bort något en annan gett.</p>
       <table><thead><tr><th>Behörighet</th><th>Innebörd</th><th>Roller</th><th>Uppdrag</th></tr></thead>
       <tbody>${behorigheter}</tbody></table>

       <h2>Arbetsytor</h2>
       <p>Vyn styrs av uppdraget. Ytan beskär menyn, inte åtkomsten — den som har rätt
          till en sida når den även utanför sin yta.</p>
       <table><thead><tr><th>Yta</th><th>För vem</th><th>Sidor</th></tr></thead>
       <tbody>${ytor}</tbody></table>

       <h2>Tekniska förutsättningar</h2>
       <p>En Node-process med SQLite. En databasfil per förening — ingenting delas
          mellan klubbar, och värdnamnet avgör vilken förening en begäran gäller.
          Allt ligger på klubbens egen server och lämnar aldrig maskinen.</p>
       <p>Tre klienter: administrationen i webbläsaren, mobilappen för ronder (fungerar
          utan täckning), och gästklienten för fiket och uthyrningen som inte kräver
          inloggning.</p>

       <h2>Krav som följer av lag</h2>
       <div class="markering">
         <p><strong>Bokföringslagen (1999:1078)</strong> gäller föreningen oavsett
            skattestatus. Varje affärshändelse får en verifikation i obruten nummerföljd;
            bokförda poster går inte att ändra eller radera, bara att rätta med en
            motbokande verifikation. Räkenskapsinformation ska bevaras i sju år.</p>
         <p><strong>Kassaregister</strong> krävs inte så länge föreningen är befriad från
            skattskyldighet för försäljningen (Skatteförfarandelagen 39 kap. 5 § 2).
            Det är styrelsens bedömning, inte systemets. Blir försäljningen skattepliktig
            krävs ett certifierat kassaregister med kontrollenhet — hårdvara som måste
            köpas.</p>
         <p><strong>Personuppgifter</strong> minimeras: behörigheten <em>incident</em>
            räcker för att arbeta med en händelse, <em>incident_person</em> krävs för att
            se vem det gällde. Varje läsning loggas, och gallring nollar personfälten men
            lämnar händelsen kvar.</p>
       </div>`
  );
}

function tidplan() {
  const d = delar();
  const rader = d
    .map(
      (x) => `<tr><td>${flykt(x.rubrik)}</td>
        <td><span class="bricka ${x.status}">${flykt(STATUSNAMN[x.status] || x.status)}</span></td>
        <td class="num">${flykt(x.planerad_start || '–')}</td>
        <td class="num">${flykt(x.provas_fran || '–')}</td>
        <td class="num">${flykt(x.planerad_klar || '–')}</td>
        <td class="num">${flykt(x.driftsatt || '–')}</td></tr>`
    )
    .join('');
  const obeslutade = d.filter((x) => !x.beslutad).length;

  return ram(
    'Tidplan',
    huvud('Tidplan', 'När varje del byggs, provas och driftsätts') +
      (obeslutade
        ? `<div class="markering"><p><strong>Datumen är förslag.</strong> ${obeslutade} av
           ${d.length} delar har ännu inte beslutade datum. En plan som läses som ett
           löfte innan den beslutats blir ett löfte ingen gett.</p></div>`
        : '') +
      `<table><thead><tr><th>Del</th><th>Status</th><th>Start</th><th>Provas</th>
        <th>Klar</th><th>I drift</th></tr></thead><tbody>${rader}</tbody></table>

       <h2>Ordningen</h2>
       <p>Kontrollerna först. Det är den delen som ersätter ett betalt system och
          därmed den enda som har en kostnad knuten till sig. Resten flyttar in i den
          takt klubben orkar, och ingenting måste bytas ut på en gång.</p>

       <h2>Så provas en del</h2>
       <p>En del räknas som provad när den körts skarpt av någon som inte byggt den,
          under en riktig dag i backen. Driftsättning är ett beslut, inte ett datum som
          passerar.</p>`
  );
}

function styrelserapport() {
  const d = delar();
  const rakna = (s) => d.filter((x) => x.status === s).length;
  const ideer = alla(
    `SELECT i.*, p.rubrik AS del FROM ide i
       LEFT JOIN projektdel p ON p.id=i.projektdel_id
      WHERE i.projektdel_id IS NOT NULL ORDER BY i.skapad DESC LIMIT 40`
  );
  const obesvarade = en(
    "SELECT count(*) AS n FROM ide WHERE projektdel_id IS NOT NULL AND (anteckning IS NULL OR anteckning='')"
  ).n;

  return ram(
    'Rapport till styrelsen',
    huvud('Rapport till styrelsen', `Läget ${idag()}`) +
      `<h2>Sammanfattning</h2>
       <table><thead><tr><th>Läge</th><th>Antal delar</th></tr></thead><tbody>
         <tr><td>I drift</td><td class="num">${rakna('i_drift')}</td></tr>
         <tr><td>Provas</td><td class="num">${rakna('provas')}</td></tr>
         <tr><td>Byggs</td><td class="num">${rakna('byggs')}</td></tr>
         <tr><td>Planerade</td><td class="num">${rakna('planerad') + rakna('ide')}</td></tr>
       </tbody></table>

       <h2>Beslut som behövs</h2>
       <div class="markering">
         <p><strong>Tidplanen.</strong> Datumen i tidplanen är förslag tills styrelsen
            beslutat dem.</p>
         <p><strong>Skattestatus för fikets försäljning.</strong> Bedömningen att
            försäljningen är skattefri enligt inkomstskattelagen 7 kap. avgör om klubben
            behöver ett certifierat kassaregister. Frågan bör bekräftas med revisorn.</p>
         <p><strong>Uppsägning av Checkproof.</strong> Kontrolldelen är i drift. Innan
            uppsägning bör befintliga kontroller exporteras ur Checkproof — det är datan,
            inte funktionen, som är svår att få tillbaka efteråt.</p>
       </div>

       <h2>Idéer från medlemmarna</h2>
       <p>${ideer.length} inlämnade via projektsidan, varav ${obesvarade} ännu obesvarade.</p>` +
      (ideer.length
        ? `<table><thead><tr><th>Datum</th><th>Del</th><th>Från</th><th>Idé</th></tr></thead><tbody>${ideer
            .map(
              (i) => `<tr><td class="num">${flykt(String(i.skapad).slice(0, 10))}</td>
                <td>${flykt(i.del || '–')}</td><td>${flykt(i.skapad_av || '–')}</td>
                <td>${flykt((i.text || i.transkript || '').slice(0, 220))}</td></tr>`
            )
            .join('')}</tbody></table>`
        : '<p>Inga ännu.</p>') +
      `<h2>Delarna i detalj</h2>` +
      d
        .map(
          (x) => `<div class="del"><h3>${flykt(x.rubrik)}
            <span class="bricka ${x.status}">${flykt(STATUSNAMN[x.status] || x.status)}</span></h3>
            <p>${flykt(x.sammanfattning || '')}</p></div>`
        )
        .join('')
  );
}

const BYGGARE = { kravspecifikation, tidplan, styrelserapport };

export const html = (slag) => {
  const bygg = BYGGARE[slag];
  if (!bygg) return null;
  return bygg();
};

/**
 * HTML → PDF med webbläsaren som redan finns. Chrome vägrar skriva ut en
 * fil den inte får läsa, så sidan läggs i en egen temporär katalog och
 * städas bort efteråt.
 */
export async function pdf(slag) {
  const sidan = html(slag);
  if (!sidan) return null;
  const katalog = mkdtempSync(join(tmpdir(), 'backis-pdf-'));
  try {
    const kalla = join(katalog, 'sida.html');
    const ut = join(katalog, 'ut.pdf');
    writeFileSync(kalla, sidan);
    await kor(
      process.env.HAK_CHROME || 'google-chrome',
      [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        `--user-data-dir=${join(katalog, 'profil')}`,
        '--no-pdf-header-footer', '--print-to-pdf-no-header',
        `--print-to-pdf=${ut}`,
        `file://${kalla}`,
      ],
      { timeout: 60000 }
    );
    return readFileSync(ut);
  } finally {
    rmSync(katalog, { recursive: true, force: true });
  }
}
