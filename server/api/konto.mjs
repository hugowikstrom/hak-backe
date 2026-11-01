// Inloggning och eget konto.
import { en, kor, uppdatera } from '../db.mjs';
import {
  hasha, loggaIn, loggaUt, publikMedlem, rensaKaka, sattKaka, sessionAvKaka, stammer,
} from '../auth.mjs';
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

  /**
   * Vem är jag? Appen frågar det vid varje start, och det är därför
   * kakan förnyas just här: sessionen glider framåt på servern, men
   * webbläsarens kopia har ett fast slutdatum från när den sattes. Utan
   * den här raden loggas den som använder appen varje vecka ändå ut
   * exakt ett halvår efter sin första inloggning.
   */
  rutt('GET', '/api/jag', 'oppen', ({ req, res, medlem }) => {
    const s = medlem ? sessionAvKaka(req.headers.cookie) : null;
    svar(res, 200, { medlem: publikMedlem(medlem) }, s ? { 'set-cookie': sattKaka(s.id) } : {});
  }),

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
