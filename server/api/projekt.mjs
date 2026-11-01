// Projektsidan: vad som byggs, varför, och var det står.
//
// Sidan är **läsbar utan inloggning**. Det är med flit: den finns för att
// medlemmar som inte är insatta ska kunna förstå vad klubben håller på
// med, och ett inloggningsformulär är ett hinder för precis den personen.
//
// Att *lämna* något kräver konto. En idé utan avsändare går inte att
// följa upp, och den som lämnat den ska kunna se vad det blev av den.
import { alla, en, kor, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import { PROJEKTDELAR, PROJEKTTEXTER } from '../projektdata.mjs';
import { FILMER } from '../filmdata.mjs';
import { instans } from '../foreningar.mjs';
import { modulPa } from '../moduldata.mjs';
import { datum, ettAv, fel, heltal, kravTxt, rutt, svar, text, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';
import { DOKUMENT, html as dokumentHtml, pdf as dokumentPdf } from '../projektdokument.mjs';

export const STATUSAR = ['ide', 'planerad', 'byggs', 'provas', 'i_drift'];
export const STATUSNAMN = {
  ide: 'Idé',
  planerad: 'Planerad',
  byggs: 'Byggs',
  provas: 'Provas',
  i_drift: 'I drift',
};

/**
 * Sår texterna och delarna första gången, och lägger till delar som
 * tillkommit i koden sedan sist. Befintliga rader lämnas i fred – de kan
 * vara ändrade av en människa, och koden ska inte skriva över det.
 */
export function sakerstallProjekt() {
  for (const t of PROJEKTTEXTER)
    if (!en('SELECT nyckel FROM projekttext WHERE nyckel=?', t.nyckel))
      spara('projekttext', { nyckel: t.nyckel, rubrik: t.rubrik, text: t.text, ordning: t.ordning });

  for (const d of PROJEKTDELAR) {
    const fanns = en('SELECT id, film FROM projektdel WHERE nyckel=?', d.nyckel);
    // Finns delen redan skrivs texten aldrig över — den kan vara ändrad av
    // en människa. Ordningen och modulen är däremot inte redaktionella
    // utan strukturella: de bestäms av katalogen, och skjuts en ny del in
    // mitt i listan ska resten flytta på sig. En film som tillkommit
    // hittar också fram.
    if (fanns) {
      uppdatera('projektdel', fanns.id, {
        ordning: d.ordning ?? 0,
        modul: d.modul ?? null,
        ...(d.film && !fanns.film ? { film: d.film } : {}),
      });
      continue;
    }
    spara('projektdel', {
      nyckel: d.nyckel,
      rubrik: d.rubrik,
      sammanfattning: d.sammanfattning ?? null,
      text: d.text ?? null,
      varfor: d.varfor ?? null,
      film: d.film ?? null,
      modul: d.modul ?? null,
      status: d.status || 'planerad',
      ordning: d.ordning ?? 0,
    });
  }
  return { delar: en('SELECT count(*) AS n FROM projektdel').n };
}

const filmFor = (nyckel) => (nyckel ? FILMER.find((f) => f.nyckel === nyckel) || null : null);

/** Antal inlämnade idéer per del. Siffran visas för att visa att det går. */
const ideantal = () => {
  const ut = {};
  for (const r of alla(
    'SELECT projektdel_id AS id, count(*) AS n FROM ide WHERE projektdel_id IS NOT NULL GROUP BY projektdel_id'
  ))
    ut[r.id] = r.n;
  return ut;
};

const berika = (d, antal, forening) => ({
  ...d,
  statusnamn: STATUSNAMN[d.status] || d.status,
  film: filmFor(d.film),
  // En del vars modul är avstängd hos den här föreningen beskriver något
  // som inte finns här, och ska inte låtsas annat.
  modul_pa: d.modul ? modulPa(forening, d.modul) : true,
  ideer: antal[d.id] || 0,
});

export const delar = (forening) => {
  const antal = ideantal();
  return alla('SELECT * FROM projektdel WHERE aktiv=1 ORDER BY ordning, id').map((d) =>
    berika(d, antal, forening)
  );
};

export const texter = () => alla('SELECT * FROM projekttext ORDER BY ordning, nyckel');

const delAv = (nyckel) => {
  const d = en('SELECT * FROM projektdel WHERE nyckel=?', String(nyckel || ''));
  if (!d) throw fel(404, 'Den delen finns inte');
  return d;
};

/**
 * Idéerna vid en del. Texten visas för alla – det är poängen med att
 * lämna den där – men ljudfilen gör det inte. En inspelning bär rösten,
 * och den som pratat in något räknade inte med att bli uppspelad.
 */
const ideerFor = (del_id, medlem) =>
  alla(
    `SELECT i.id, i.rubrik, i.text, i.transkript, i.status, i.skapad, i.skapad_av, i.skapad_av_id,
            i.anteckning, i.ljudfil IS NOT NULL AS inspelad
       FROM ide i WHERE i.projektdel_id=? ORDER BY i.skapad DESC LIMIT 100`,
    del_id
  ).map((i) => ({
    ...i,
    // Transkriptet är det inlämnaren sagt; texten det hen skrivit.
    text: i.text || i.transkript,
    transkript: undefined,
    egen: medlem ? i.skapad_av_id === medlem.id : false,
    ljudfil: undefined,
  }));

export const rutter = [
  /** Hela sidan i ett anrop. Öppen: den som inte är insatt ska slippa logga in. */
  rutt('GET', '/api/projekt', 'oppen', ({ res, medlem, forening }) =>
    svar(res, 200, {
      forening: { namn: instans('namn', 'Föreningen'), plats: instans('plats')?.namn || null },
      texter: texter(),
      // Översiktsfilmen hör till sidan som helhet, inte till en del.
      film: filmFor('projektet'),
      delar: delar(forening),
      statusar: STATUSAR.map((s) => ({ nyckel: s, namn: STATUSNAMN[s] })),
      far_andra: Boolean(medlem && far(medlem, 'projekt')),
      inloggad: Boolean(medlem),
      // Den som inte är inloggad ska veta varför knappen saknas.
      kan_lamna: Boolean(medlem),
    })
  ),

  rutt('GET', '/api/projekt/del/:nyckel', 'oppen', ({ res, param, medlem, forening }) => {
    const d = delAv(param.nyckel);
    svar(res, 200, {
      ...berika(d, ideantal(), forening),
      ideer: ideerFor(d.id, medlem),
      far_andra: Boolean(medlem && far(medlem, 'projekt')),
      inloggad: Boolean(medlem),
    });
  }),

  /** Tidplanen, som den ser ut nu. Underlaget till gantt-vyn och till PDF:en. */
  rutt('GET', '/api/projekt/tidplan', 'oppen', ({ res, forening }) => {
    const rader = delar(forening);
    const datumen = rader
      .flatMap((d) => [d.planerad_start, d.planerad_klar, d.provas_fran, d.driftsatt])
      .filter(Boolean)
      .sort();
    svar(res, 200, {
      delar: rader,
      fran: datumen[0] || idag(),
      till: datumen[datumen.length - 1] || idag(),
      // Ingen del har beslutade datum förrän styrelsen sagt sitt. Står det
      // inte utskrivet läses en plan som ett löfte.
      beslutad: rader.length > 0 && rader.every((d) => d.beslutad),
    });
  }),

  /** Ändra en del. Snäv krets – se behörigheten `projekt`. */
  rutt('PUT', '/api/projekt/del/:nyckel', '@projekt', ({ res, param, kropp, medlem, forening }) => {
    const d = delAv(param.nyckel);
    const falt = { uppdaterad: nu() };
    if (kropp.rubrik !== undefined) falt.rubrik = kravTxt(kropp.rubrik, 'Rubrik', 120);
    if (kropp.sammanfattning !== undefined) falt.sammanfattning = txt(kropp.sammanfattning, 300) ?? null;
    if (kropp.text !== undefined) falt.text = txt(kropp.text, 8000) ?? null;
    if (kropp.varfor !== undefined) falt.varfor = txt(kropp.varfor, 2000) ?? null;
    if (kropp.film !== undefined) falt.film = txt(kropp.film, 60) ?? null;
    if (kropp.status !== undefined) falt.status = ettAv(kropp.status, STATUSAR, 'Status');
    for (const n of ['planerad_start', 'planerad_klar', 'provas_fran', 'driftsatt'])
      if (kropp[n] !== undefined) falt[n] = datum(kropp[n]) ?? null;
    if (kropp.beslutad !== undefined) falt.beslutad = kropp.beslutad ? 1 : 0;
    if (kropp.ordning !== undefined) falt.ordning = heltal(kropp.ordning, 0);
    uppdatera('projektdel', d.id, falt);
    revidera({ medlem, handelse: 'ändrade projektdel', objekt: d.nyckel });
    svar(res, 200, berika(delAv(param.nyckel), ideantal(), forening));
  }),

  rutt('PUT', '/api/projekt/text/:nyckel', '@projekt', ({ res, param, kropp, medlem }) => {
    const t = en('SELECT * FROM projekttext WHERE nyckel=?', param.nyckel);
    if (!t) throw fel(404, 'Texten finns inte');
    kor(
      'UPDATE projekttext SET rubrik=?, text=?, uppdaterad=? WHERE nyckel=?',
      kravTxt(kropp.rubrik, 'Rubrik', 120),
      kravTxt(kropp.text, 'Text', 8000),
      nu(),
      t.nyckel
    );
    revidera({ medlem, handelse: 'ändrade projekttext', objekt: t.nyckel });
    svar(res, 200, en('SELECT * FROM projekttext WHERE nyckel=?', t.nyckel));
  }),

  /**
   * Dokumenten. Kravspecifikationen och tidplanen är öppna – de beskriver
   * klubbens eget arbete för klubbens egna medlemmar. Rapporten till
   * styrelsen kräver inloggning: den innehåller vem som lämnat vilken idé.
   */
  rutt('GET', '/api/projekt/dokument', 'oppen', ({ res, medlem }) =>
    svar(res, 200, {
      dokument: Object.entries(DOKUMENT)
        .filter(([, d]) => d.oppen || medlem)
        .map(([nyckel, d]) => ({ nyckel, titel: d.titel, oppen: d.oppen })),
    })
  ),

  rutt('GET', '/api/projekt/dokument/:slag', 'oppen', async ({ res, param, fraga, medlem }) => {
    const bar = String(param.slag).replace(/\.(pdf|html)$/, '');
    const d = DOKUMENT[bar];
    if (!d) throw fel(404, 'Dokumentet finns inte');
    if (!d.oppen && !medlem) throw fel(401, 'Logga in för att läsa rapporten till styrelsen');

    // ?html=1 visar sidan som den ser ut innan utskrift – bekvämt när
    // dokumentet ska rättas, och billigare än att starta en webbläsare.
    if (fraga.get('html') === '1' || String(param.slag).endsWith('.html'))
      return text(res, 200, dokumentHtml(bar), 'text/html; charset=utf-8');

    const byte = await dokumentPdf(bar);
    if (!byte) throw fel(500, 'Kunde inte skapa PDF:en');
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-length': byte.length,
      'content-disposition': `inline; filename="${bar}-${idag()}.pdf"`,
      'cache-control': 'no-store',
    });
    res.end(byte);
  }),

  /** Svar på en idé. Den som lämnat något ska få veta vad det blev av det. */
  rutt('POST', '/api/projekt/ide/:id/svar', '@projekt', ({ res, param, kropp, medlem }) => {
    const i = en('SELECT * FROM ide WHERE id=?', heltal(param.id));
    if (!i) throw fel(404, 'Idén finns inte');
    uppdatera('ide', i.id, {
      anteckning: kravTxt(kropp.svar, 'Svar', 2000),
      status: ettAv(kropp.status, ['ny', 'granskad', 'skickad', 'avfard'], 'Status') || 'granskad',
    });
    revidera({ medlem, handelse: 'svarade på idé', objekt: `#${i.id}` });
    svar(res, 200, en('SELECT id, status, anteckning FROM ide WHERE id=?', i.id));
  }),
];
