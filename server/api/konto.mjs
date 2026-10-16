// Inloggning och eget konto.
import { en, kor, uppdatera } from '../db.mjs';
import { hasha, loggaIn, loggaUt, publikMedlem, rensaKaka, sattKaka, stammer } from '../auth.mjs';
import { fel, kravTxt, rutt, svar, txt } from '../http.mjs';

export const rutter = [
  rutt('POST', '/api/logga-in', 'oppen', ({ res, kropp }) => {
    const s = loggaIn(kropp.anvandarnamn, kropp.losenord);
    if (!s) throw fel(401, 'Fel användarnamn eller lösenord');
    svar(res, 200, { medlem: publikMedlem(s.medlem) }, { 'set-cookie': sattKaka(s.id) });
  }),

  rutt('POST', '/api/logga-ut', 'oppen', ({ req, res }) => {
    loggaUt(req.headers.cookie);
    svar(res, 200, { ok: true }, { 'set-cookie': rensaKaka() });
  }),

  rutt('GET', '/api/jag', 'oppen', ({ res, medlem }) =>
    svar(res, 200, { medlem: publikMedlem(medlem) })
  ),

  rutt('PUT', '/api/jag', 'medlem', ({ res, medlem, kropp }) => {
    uppdatera('medlem', medlem.id, {
      namn: txt(kropp.namn) ?? medlem.namn,
      epost: txt(kropp.epost),
      telefon: txt(kropp.telefon),
    });
    svar(res, 200, { medlem: publikMedlem(en('SELECT * FROM medlem WHERE id=?', medlem.id)) });
  }),

  rutt('POST', '/api/jag/losenord', 'medlem', ({ res, medlem, kropp }) => {
    if (!stammer(kravTxt(kropp.gammalt, 'Nuvarande lösenord'), medlem.losenordshash))
      throw fel(400, 'Nuvarande lösenord stämmer inte');
    const nytt = kravTxt(kropp.nytt, 'Nytt lösenord');
    if (nytt.length < 3) throw fel(400, 'Lösenordet är för kort');
    uppdatera('medlem', medlem.id, { losenordshash: hasha(nytt) });
    kor('DELETE FROM session WHERE medlem_id=?', medlem.id);
    svar(res, 200, { ok: true, utloggad: true });
  }),
];
