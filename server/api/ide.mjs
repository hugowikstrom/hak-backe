// Idélådan: skriv eller prata in en idé. En människa läser och skickar
// vidare till Backlog – inget hamnar där automatiskt.
import { execFile } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { alla, en, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { revidera } from '../bokforing.mjs';
import { LJUDKATALOG as LJUD, sparaLjud, transkribera } from '../tal.mjs';
import { ettAv, fel, kravTxt, rutt, svar, txt } from '../http.mjs';
import { nu } from '../tid.mjs';

const kor = promisify(execFile);

const BACKLOG = process.env.HAK_BACKLOG || '/home/hugo/.local/bin/backlog';
const PROJEKT = process.env.HAK_BACKLOG_PROJEKT || 'inbox';
const KATEGORIER = ['backen', 'fiket', 'uthyrning', 'traning', 'ekonomi', 'ovrigt'];
const STATUSAR = ['ny', 'granskad', 'skickad', 'avfard'];

export const hamtaIde = (id) => en('SELECT * FROM ide WHERE id=?', id);
export const ideer = ({ status, antal = 200 } = {}) =>
  alla(
    `SELECT * FROM ide ${status ? 'WHERE status=?' : ''} ORDER BY skapad DESC LIMIT ?`,
    ...(status ? [status] : []),
    antal
  );

export const rutter = [
  rutt('GET', '/api/ideer', 'medlem', ({ res, fraga }) =>
    svar(res, 200, {
      ideer: ideer({ status: fraga.get('status') || null }),
      kategorier: KATEGORIER,
      backlog_projekt: PROJEKT,
    })
  ),

  rutt('POST', '/api/ideer', 'medlem', async ({ res, kropp, medlem }) => {
    let ljudfil = null;
    let transkript = null;
    let sttfel = null;
    if (kropp.ljud) {
      const { namn, bytes } = await sparaLjud(kropp.ljud);
      ljudfil = namn;
      const r = await transkribera(bytes, namn);
      transkript = r.text;
      sttfel = r.fel;
    }
    const text = txt(kropp.text, 4000);
    if (!text && !transkript && !ljudfil) throw fel(400, 'Skriv eller spela in något först');
    const id = spara('ide', {
      rubrik: txt(kropp.rubrik, 120),
      text,
      transkript,
      ljudfil,
      sekunder: kropp.sekunder ? Number(kropp.sekunder) : null,
      kategori: ettAv(kropp.kategori, KATEGORIER, 'Kategori') || 'ovrigt',
      skapad_av_id: medlem.id,
      skapad_av: medlem.namn,
    });
    svar(res, 201, { ...hamtaIde(id), stt_fel: sttfel });
  }),

  rutt('GET', '/api/ideer/:id/ljud', 'medlem', ({ res, param }) => {
    const i = hamtaIde(param.id);
    if (!i?.ljudfil) throw fel(404, 'Ingen inspelning');
    const typ = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', wav: 'audio/wav' }[i.ljudfil.split('.').pop()];
    const fil = join(LJUD, i.ljudfil);
    res.writeHead(200, { 'content-type': typ || 'application/octet-stream', 'content-length': statSync(fil).size });
    createReadStream(fil).pipe(res);
  }),

  rutt('PUT', '/api/ideer/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const i = hamtaIde(param.id);
    if (!i) throw fel(404, 'Idén finns inte');
    const egen = i.skapad_av_id === medlem.id;
    if (!egen && !far(medlem, 'bemanning') && !far(medlem, 'medlemsregister'))
      throw fel(403, 'Bara den som lämnat idén eller en ansvarig ändrar den');
    uppdatera('ide', i.id, {
      rubrik: kropp.rubrik === undefined ? undefined : txt(kropp.rubrik, 120),
      // Transkriptet rörs aldrig – det är inlämnarens egna ord.
      text: kropp.text === undefined ? undefined : txt(kropp.text, 4000),
      kategori: ettAv(kropp.kategori, KATEGORIER, 'Kategori'),
      status: ettAv(kropp.status, STATUSAR, 'Status'),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning, 1000),
    });
    svar(res, 200, hamtaIde(i.id));
  }),

  /** Backlogprojekten, så att idén hamnar rätt. */
  rutt('GET', '/api/ideer/backlog/projekt', 'medlem', async ({ res }) => {
    try {
      const { stdout } = await kor(BACKLOG, ['project', 'list', '--json'], { timeout: 10000 });
      const data = JSON.parse(stdout);
      svar(res, 200, Array.isArray(data) ? data : data.projects || []);
    } catch {
      svar(res, 200, [{ alias: PROJEKT, name: 'Inkorg' }]);
    }
  }),

  /**
   * Skickar idén till Backlog. Görs av en människa som läst igenom den, och
   * bara av någon i styrelsen eller en ansvarig – backlogen ska inte fyllas
   * av oläst text.
   */
  rutt('POST', '/api/ideer/:id/backlog', 'medlem', async ({ res, param, kropp, medlem }) => {
    if (!far(medlem, 'bemanning') && !far(medlem, 'medlemsregister'))
      throw fel(403, 'Bara styrelsen och ansvariga skickar vidare till Backlog');
    const i = hamtaIde(param.id);
    if (!i) throw fel(404, 'Idén finns inte');
    if (i.backlog_ref) throw fel(409, `Idén ligger redan i Backlog som ${i.backlog_ref}`);
    const rubrik = kravTxt(kropp.rubrik || i.rubrik || (i.text || i.transkript || '').slice(0, 80), 'Rubrik', 120);
    const projekt = txt(kropp.projekt, 40) || PROJEKT;
    const beskrivning = [
      kropp.beskrivning || i.text || '',
      i.transkript && i.transkript !== i.text ? `\n\nOrdagrant inspelat:\n${i.transkript}` : '',
      `\n\nIdé #${i.id} ur HAK Backes idélåda, inlämnad av ${i.skapad_av || 'okänd'} ${i.skapad}.`,
    ].join('');

    try {
      // Argumenten går som array – texten är talad och inte skriven av någon,
      // och ska aldrig kunna tolkas som flaggor av skalet.
      const { stdout } = await kor(
        BACKLOG,
        [
          'task', 'add',
          '--project', projekt,
          '--title', rubrik,
          '--description', beskrivning,
          '--label', 'idelada',
          '--source', 'hak-idelada',
          '--type', ettAv(kropp.typ, ['task', 'bug', 'issue', 'improvement', 'feature', 'chore', 'spike'], 'Typ') || 'task',
          '--as', `human:${medlem.anvandarnamn}`,
          '--json',
        ],
        { timeout: 20000 }
      );
      const skapad = JSON.parse(stdout);
      const ref = skapad.seq ? `${skapad.project?.alias || projekt}-${skapad.seq}` : skapad.id;
      uppdatera('ide', i.id, {
        status: 'skickad',
        backlog_projekt: projekt,
        backlog_ref: ref,
        skickad_tid: nu(),
        skickad_av: medlem.namn,
      });
      revidera({ medlem, handelse: 'skickade idé till Backlog', objekt: ref, detalj: rubrik });
      svar(res, 200, { ...hamtaIde(i.id), utskrift: stdout.trim().slice(0, 500) });
    } catch (e) {
      throw fel(502, `Backlog svarade inte: ${String(e.stderr || e.message || e).slice(0, 300)}`);
    }
  }),
];
