// Register: medlemmar, områden, utrustning, positioner, säsonger.
import { alla, en, kor, spara, uppdatera } from '../db.mjs';
import { allaMedlemmar, hasha, publikMedlem, RANG } from '../auth.mjs';
import { bool, datum, ettAv, fel, heltal, kravTxt, num, rutt, svar, txt } from '../http.mjs';

const ROLLER = Object.keys(RANG);
const UTRUSTNINGSTYPER = ['lans', 'flakt', 'pumpstation', 'kompressor', 'lift', 'band', 'pistmaskin', 'ovrigt'];

export const utrustningslista = () =>
  alla(`SELECT u.*, o.namn AS omrade FROM utrustning u
        LEFT JOIN omrade o ON o.id=u.omrade_id
        ORDER BY o.ordning, u.ordning, u.namn`);

export const positionslista = () => alla('SELECT * FROM position ORDER BY ordning, namn');
export const omradeslista = () => alla('SELECT * FROM omrade ORDER BY ordning, namn');
export const aktivSasong = () =>
  en('SELECT * FROM sasong WHERE aktiv=1 ORDER BY start DESC LIMIT 1') ||
  en('SELECT * FROM sasong ORDER BY start DESC LIMIT 1');

export const rutter = [
  // ---- medlemmar ----
  rutt('GET', '/api/medlemmar', 'medlem', ({ res }) => svar(res, 200, allaMedlemmar())),

  rutt('POST', '/api/medlemmar', 'backansvarig', ({ res, kropp }) => {
    const anvandarnamn = kravTxt(kropp.anvandarnamn, 'Användarnamn', 40).toLowerCase();
    if (en('SELECT id FROM medlem WHERE lower(anvandarnamn)=?', anvandarnamn))
      throw fel(409, 'Användarnamnet finns redan');
    const id = spara('medlem', {
      anvandarnamn,
      namn: kravTxt(kropp.namn, 'Namn', 120),
      epost: txt(kropp.epost, 160),
      telefon: txt(kropp.telefon, 40),
      losenordshash: hasha(txt(kropp.losenord) || 'hak'),
      roll: ettAv(kropp.roll, ROLLER, 'Roll') || 'medlem',
      kvot_timmar: num(kropp.kvot_timmar),
      kompetens: JSON.stringify(Array.isArray(kropp.kompetens) ? kropp.kompetens : []),
      anteckning: txt(kropp.anteckning),
    });
    svar(res, 201, publikMedlem(en('SELECT * FROM medlem WHERE id=?', id)));
  }),

  rutt('PUT', '/api/medlemmar/:id', 'backansvarig', ({ res, param, kropp, medlem }) => {
    const m = en('SELECT * FROM medlem WHERE id=?', param.id);
    if (!m) throw fel(404, 'Medlemmen finns inte');
    if (kropp.roll && RANG[kropp.roll] > RANG[medlem.roll])
      throw fel(403, 'Du kan inte sätta en högre roll än din egen');
    uppdatera('medlem', m.id, {
      namn: txt(kropp.namn, 120),
      epost: txt(kropp.epost, 160),
      telefon: txt(kropp.telefon, 40),
      roll: ettAv(kropp.roll, ROLLER, 'Roll'),
      aktiv: bool(kropp.aktiv),
      kvot_timmar: kropp.kvot_timmar === undefined ? undefined : num(kropp.kvot_timmar),
      kompetens: kropp.kompetens === undefined ? undefined : JSON.stringify(kropp.kompetens || []),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
      losenordshash: kropp.losenord ? hasha(String(kropp.losenord)) : undefined,
    });
    if (kropp.losenord) kor('DELETE FROM session WHERE medlem_id=?', m.id);
    svar(res, 200, publikMedlem(en('SELECT * FROM medlem WHERE id=?', m.id)));
  }),

  // ---- områden ----
  rutt('GET', '/api/omraden', 'medlem', ({ res }) => svar(res, 200, omradeslista())),

  rutt('POST', '/api/omraden', 'backansvarig', ({ res, kropp }) => {
    const id = spara('omrade', {
      namn: kravTxt(kropp.namn, 'Namn', 80),
      slag: ettAv(kropp.slag, ['backe', 'lift', 'byggnad', 'ovrigt'], 'Slag') || 'backe',
      ordning: heltal(kropp.ordning, 0),
    });
    svar(res, 201, en('SELECT * FROM omrade WHERE id=?', id));
  }),

  rutt('PUT', '/api/omraden/:id', 'backansvarig', ({ res, param, kropp }) => {
    uppdatera('omrade', param.id, {
      namn: txt(kropp.namn, 80),
      slag: ettAv(kropp.slag, ['backe', 'lift', 'byggnad', 'ovrigt'], 'Slag'),
      ordning: kropp.ordning === undefined ? undefined : heltal(kropp.ordning, 0),
      aktiv: bool(kropp.aktiv),
    });
    svar(res, 200, en('SELECT * FROM omrade WHERE id=?', param.id));
  }),

  // ---- utrustning ----
  rutt('GET', '/api/utrustning', 'medlem', ({ res }) => svar(res, 200, utrustningslista())),

  rutt('POST', '/api/utrustning', 'backansvarig', ({ res, kropp }) => {
    const id = spara('utrustning', {
      namn: kravTxt(kropp.namn, 'Namn', 80),
      typ: ettAv(kropp.typ, UTRUSTNINGSTYPER, 'Typ') || 'ovrigt',
      omrade_id: heltal(kropp.omrade_id),
      placering: txt(kropp.placering, 120),
      status: ettAv(kropp.status, ['drift', 'service', 'ur_drift'], 'Status') || 'drift',
      munstycken: heltal(kropp.munstycken),
      anteckning: txt(kropp.anteckning),
      ordning: heltal(kropp.ordning, 0),
    });
    svar(res, 201, en('SELECT * FROM utrustning WHERE id=?', id));
  }),

  rutt('PUT', '/api/utrustning/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const u = en('SELECT * FROM utrustning WHERE id=?', param.id);
    if (!u) throw fel(404, 'Utrustningen finns inte');
    const fullRatt = RANG[medlem.roll] >= RANG.backansvarig;
    uppdatera('utrustning', u.id, {
      // alla får sätta driftstatus, bara ansvariga får ändra stamdata
      status: ettAv(kropp.status, ['drift', 'service', 'ur_drift'], 'Status'),
      anteckning: kropp.anteckning === undefined ? undefined : txt(kropp.anteckning),
      namn: fullRatt ? txt(kropp.namn, 80) : undefined,
      typ: fullRatt ? ettAv(kropp.typ, UTRUSTNINGSTYPER, 'Typ') : undefined,
      omrade_id: fullRatt && kropp.omrade_id !== undefined ? heltal(kropp.omrade_id) : undefined,
      placering: fullRatt && kropp.placering !== undefined ? txt(kropp.placering, 120) : undefined,
      munstycken: fullRatt && kropp.munstycken !== undefined ? heltal(kropp.munstycken) : undefined,
      ordning: fullRatt && kropp.ordning !== undefined ? heltal(kropp.ordning, 0) : undefined,
      aktiv: fullRatt ? bool(kropp.aktiv) : undefined,
    });
    svar(res, 200, en('SELECT * FROM utrustning WHERE id=?', u.id));
  }),

  // ---- positioner ----
  rutt('GET', '/api/positioner', 'medlem', ({ res }) => svar(res, 200, positionslista())),

  rutt('POST', '/api/positioner', 'backansvarig', ({ res, kropp }) => {
    const id = spara('position', {
      nyckel: kravTxt(kropp.nyckel, 'Nyckel', 40).toLowerCase().replace(/\s+/g, '-'),
      namn: kravTxt(kropp.namn, 'Namn', 80),
      kortnamn: txt(kropp.kortnamn, 12),
      farg: txt(kropp.farg, 20) || '#7aa2d0',
      ordning: heltal(kropp.ordning, 0),
      kravs_roll: ettAv(kropp.kravs_roll, Object.keys(RANG), 'Krävd roll'),
    });
    svar(res, 201, en('SELECT * FROM position WHERE id=?', id));
  }),

  rutt('PUT', '/api/positioner/:id', 'backansvarig', ({ res, param, kropp }) => {
    uppdatera('position', param.id, {
      namn: txt(kropp.namn, 80),
      kortnamn: kropp.kortnamn === undefined ? undefined : txt(kropp.kortnamn, 12),
      farg: txt(kropp.farg, 20),
      ordning: kropp.ordning === undefined ? undefined : heltal(kropp.ordning, 0),
      kravs_roll: kropp.kravs_roll === undefined ? undefined : ettAv(kropp.kravs_roll, Object.keys(RANG), 'Krävd roll'),
      aktiv: bool(kropp.aktiv),
    });
    svar(res, 200, en('SELECT * FROM position WHERE id=?', param.id));
  }),

  // ---- säsonger ----
  rutt('GET', '/api/sasonger', 'medlem', ({ res }) =>
    svar(res, 200, alla('SELECT * FROM sasong ORDER BY start DESC'))
  ),

  rutt('POST', '/api/sasonger', 'anlaggningsansvarig', ({ res, kropp }) => {
    const id = spara('sasong', {
      namn: kravTxt(kropp.namn, 'Namn', 40),
      start: datum(kropp.start, 'Start') || (() => { throw fel(400, 'Start krävs'); })(),
      slut: datum(kropp.slut, 'Slut') || (() => { throw fel(400, 'Slut krävs'); })(),
      kvot_timmar: num(kropp.kvot_timmar) ?? 20,
      kvot_nattpass: num(kropp.kvot_nattpass) ?? 2,
      aktiv: bool(kropp.aktiv) ?? 0,
    });
    if (kropp.aktiv) kor('UPDATE sasong SET aktiv=0 WHERE id<>?', id);
    svar(res, 201, en('SELECT * FROM sasong WHERE id=?', id));
  }),

  rutt('PUT', '/api/sasonger/:id', 'anlaggningsansvarig', ({ res, param, kropp }) => {
    uppdatera('sasong', param.id, {
      namn: txt(kropp.namn, 40),
      start: datum(kropp.start, 'Start'),
      slut: datum(kropp.slut, 'Slut'),
      kvot_timmar: kropp.kvot_timmar === undefined ? undefined : num(kropp.kvot_timmar),
      kvot_nattpass: kropp.kvot_nattpass === undefined ? undefined : num(kropp.kvot_nattpass),
      aktiv: bool(kropp.aktiv),
    });
    if (kropp.aktiv) kor('UPDATE sasong SET aktiv=0 WHERE id<>?', param.id);
    svar(res, 200, en('SELECT * FROM sasong WHERE id=?', param.id));
  }),
];
