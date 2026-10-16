// Bilder till avvikelser. Lagras som filer under data/bilder, aldrig i databasen.
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROT } from '../db.mjs';
import { fel, rutt, svar } from '../http.mjs';

const KATALOG = join(ROT, 'data', 'bilder');
mkdirSync(KATALOG, { recursive: true });

const TYPER = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const TAK = 3_000_000;

export function sparaBild(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) throw fel(400, 'Bilden måste skickas som data-URL');
  const andelse = TYPER[m[1]];
  if (!andelse) throw fel(400, `Bildformatet ${m[1]} stöds inte`);
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) throw fel(400, 'Tom bild');
  if (bytes.length > TAK) throw fel(413, 'Bilden är för stor, minska upplösningen');
  const namn = `${randomBytes(12).toString('hex')}.${andelse}`;
  writeFileSync(join(KATALOG, namn), bytes);
  return namn;
}

export const bildfinns = (namn) =>
  /^[0-9a-f]{24}\.(jpg|png|webp)$/.test(String(namn || '')) && existsSync(join(KATALOG, namn));

export const rutter = [
  rutt('POST', '/api/bilder', 'medlem', ({ res, kropp }) =>
    svar(res, 201, { bild: sparaBild(kropp.data) })
  ),

  rutt('GET', '/api/bilder/:namn', 'medlem', ({ res, param }) => {
    if (!bildfinns(param.namn)) throw fel(404, 'Bilden finns inte');
    const fil = join(KATALOG, param.namn);
    res.writeHead(200, {
      'content-type': MIME[param.namn.split('.').pop()],
      'content-length': statSync(fil).size,
      'cache-control': 'private, max-age=31536000, immutable',
    });
    createReadStream(fil).pipe(res);
  }),
];
