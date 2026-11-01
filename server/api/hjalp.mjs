// Hjälpen: genomgångsfilmerna, en per roll i klubben.
//
// Filmerna strömmas med stöd för **byteintervall** (HTTP Range). Utan det
// går det inte att spola i en film: webbläsaren laddar hem hela filen för
// att hoppa till minut tre, och på en telefon i backen är det skillnaden
// mellan att titta och att låta bli.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROT } from '../db.mjs';
import { modulPa } from '../moduldata.mjs';
import { FILMER, film } from '../filmdata.mjs';
import { fel, rutt, svar } from '../http.mjs';

// Går att peka om, som databasen: en klubb kan vilja lägga filmerna på en
// annan disk, och testerna behöver en egen katalog.
export const FILMKATALOG = process.env.HAK_FILMKATALOG || join(ROT, 'data', 'film');

const fil = (nyckel, andelse) => join(FILMKATALOG, `${nyckel}.${andelse}`);

/** Filmerna som finns på disk och hör till påslagna moduler. */
const tillgangliga = (forening) =>
  FILMER.filter((f) => modulPa(forening, f.modul) && existsSync(fil(f.nyckel, 'mp4')))
    .sort((a, b) => a.ordning - b.ordning)
    .map((f) => {
      const { size } = statSync(fil(f.nyckel, 'mp4'));
      return {
        ...f,
        storlek: size,
        affisch: existsSync(fil(f.nyckel, 'jpg')) ? `/api/hjalp/affisch/${f.nyckel}` : null,
        film: `/api/hjalp/film/${f.nyckel}`,
      };
    });

/**
 * Strömmar en fil och svarar på byteintervall.
 *
 * Utan Range-svar spelar webbläsaren bara upp från början; med det kan man
 * dra i tidslinjen. `Accept-Ranges` måste sättas även på hela svaret,
 * annars frågar webbläsaren aldrig efter ett intervall.
 */
function strommaMedRange(req, res, sokvag, mediatyp) {
  if (!existsSync(sokvag)) throw fel(404, 'Filmen finns inte');
  const { size } = statSync(sokvag);
  const huvuden = {
    'content-type': mediatyp,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  };

  const bad = req.headers.range;
  const m = /^bytes=(\d*)-(\d*)$/.exec(bad || '');
  if (!m) {
    res.writeHead(200, { ...huvuden, 'content-length': size });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(sokvag).pipe(res);
  }

  // "bytes=-500" betyder de sista 500 byten, inte från noll till 500.
  const bakifran = m[1] === '';
  let fran = bakifran ? Math.max(0, size - Number(m[2] || 0)) : Number(m[1]);
  let till = bakifran || m[2] === '' ? size - 1 : Number(m[2]);
  if (Number.isNaN(fran) || Number.isNaN(till) || fran > till || fran >= size) {
    res.writeHead(416, { 'content-range': `bytes */${size}` });
    return res.end();
  }
  till = Math.min(till, size - 1);

  res.writeHead(206, {
    ...huvuden,
    'content-range': `bytes ${fran}-${till}/${size}`,
    'content-length': till - fran + 1,
  });
  if (req.method === 'HEAD') return res.end();
  return createReadStream(sokvag, { start: fran, end: till }).pipe(res);
}

export const rutter = [
  rutt('GET', '/api/hjalp', 'medlem', ({ res, forening }) =>
    svar(res, 200, { filmer: tillgangliga(forening) })
  ),

  // Filmerna är öppna. De är projektsidans huvudsakliga sätt att förklara
  // systemet för en medlem som inte är insatt, och ett inloggningsformulär
  // mellan nyfikenheten och svaret gör att hen aldrig får svaret. Filmerna
  // visar ingen verklig data – de är inspelade mot en provdatabas.
  rutt('GET', '/api/hjalp/film/:nyckel', 'oppen', ({ req, res, param, forening }) => {
    const f = film(param.nyckel);
    if (!f || !modulPa(forening, f.modul)) throw fel(404, 'Filmen finns inte');
    return strommaMedRange(req, res, fil(f.nyckel, 'mp4'), 'video/mp4');
  }),

  rutt('GET', '/api/hjalp/affisch/:nyckel', 'oppen', ({ req, res, param, forening }) => {
    const f = film(param.nyckel);
    if (!f || !modulPa(forening, f.modul)) throw fel(404, 'Bilden finns inte');
    return strommaMedRange(req, res, fil(f.nyckel, 'jpg'), 'image/jpeg');
  }),
];
