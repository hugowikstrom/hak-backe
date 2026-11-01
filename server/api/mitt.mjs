// Medlemmens vy: en sak i taget.
//
// Allt som behövs för appens startsida i ett enda anrop. Att avgöra vad
// som är viktigast görs här och inte i klienten – dels för att det ska gå
// att pröva i ett test, dels för att en telefon i en skidbacke inte ska
// behöva fem anrop för att veta vad användaren ska göra.
import { aktuellForening, alla, en } from '../db.mjs';
import { attBoka, kvottext, lage as avgorLage, minuterTill, pagar } from '../mitt.mjs';
import { RANG } from '../auth.mjs';
import { rutt, svar } from '../http.mjs';
import { idag, klockan, plusDagar } from '../tid.mjs';
import { lageFor, passlista } from './bemanning.mjs';
import { lage as rondlage } from './checklistor.mjs';
import { aktivSasong } from './register.mjs';
import { modulPa } from '../moduldata.mjs';
import { minaKommande } from './evenemang.mjs';

const AKTIVA = ['bokad', 'tilldelad', 'narvarande'];

/** Mina pass i fönstret, med positionens nyckel så ronderna hittas. */
const minaPass = (medlem_id, fran, till) =>
  alla(
    `SELECT p.id, p.datum, p.start, p.slut, p.slag, p.anteckning, b.status,
            pos.namn AS position, pos.nyckel AS positionsnyckel, pos.farg,
            f.fran AS fonster_fran, f.till AS fonster_till, f.lagsta_wetbulb
       FROM bokning b
       JOIN pass p ON p.id=b.pass_id
       JOIN position pos ON pos.id=p.position_id
       LEFT JOIN snofonster f ON f.id=p.snofonster_id
      WHERE b.medlem_id=? AND b.status IN ('bokad','tilldelad','narvarande')
        AND p.datum BETWEEN ? AND ?
      ORDER BY p.datum, p.start`,
    medlem_id,
    fran,
    till
  );

/**
 * Ronderna som hör till ett pass.
 *
 * En checklista pekar ut vems rond den är med `position_nyckel`. Står man
 * på snöläggning är det snöronderna som gäller, inte fikets öppningslista.
 */
function ronderFor(pass) {
  if (!pass) return [];
  const l = rondlage();
  return l.mallar
    .filter((m) => m.position_nyckel === pass.positionsnyckel)
    .map((m) => ({
      mall_id: m.mall_id,
      namn: m.namn,
      intervall: m.intervall,
      omfattning: m.omfattning,
      platsslag: m.platsslag,
      utrustningstyp: m.utrustningstyp,
      kvar: m.kvar,
      klara: m.klara,
      // Objekten som saknar sin rond. Åtta räcker: klienten visar ett par
      // namn och skickar vidare till valet när de är fler.
      objekt: m.objekt.filter((o) => o.behovs).slice(0, 8),
    }))
    .filter((m) => m.kvar > 0 || m.klara > 0);
}

export const rutter = [
  rutt('GET', '/api/mitt', 'medlem', ({ res, medlem }) => {
    const nu = { datum: idag(), klocka: klockan() };
    const sasong = aktivSasong();
    const kvot = lageFor(medlem.id, sasong);

    // Ett dygn bakåt så att ett nattpass som började i går fortfarande
    // räknas som pågående.
    const mina = minaPass(medlem.id, plusDagar(nu.datum, -1), plusDagar(nu.datum, 120));

    const forfragningar = alla(
      `SELECT f.id, p.datum, p.start, p.slut, p.slag, pos.namn AS position,
              fo.lagsta_wetbulb
         FROM forfragan f
         JOIN pass p ON p.id=f.pass_id
         JOIN position pos ON pos.id=p.position_id
         LEFT JOIN snofonster fo ON fo.id=p.snofonster_id
        WHERE f.medlem_id=? AND f.status='skickad' AND p.datum >= date('now','-1 day')
        ORDER BY p.datum, p.start`,
      medlem.id
    );

    const beslut = avgorLage({ mina, forfragningar, kvot, nu });

    // Pass att föreslå tas bara fram när de behövs. Rondlistan likaså –
    // den kostar en genomgång av alla mallar.
    // Bara pass medlemmen faktiskt får boka. Att föreslå ett pass som
    // kräver backansvarig åt den som inte är det är att be om ett nej.
    const lediga =
      beslut.lage === 'boka'
        ? passlista(nu.datum, plusDagar(nu.datum, 45))
            .filter((p) => p.bokade < p.behov && p.publicerad)
            .filter((p) => !p.kravs_roll || (RANG[medlem.roll] ?? 0) >= (RANG[p.kravs_roll] ?? 99))
            .map((p) => ({ ...p, saknas: p.behov - p.bokade }))
        : [];

    const aktuellt = beslut.lage === 'pa_pass' || beslut.lage === 'snart_pass' ? beslut.pass : null;

    svar(res, 200, {
      nu,
      medlem: { id: medlem.id, namn: medlem.namn, roll: medlem.roll },
      lage: beslut.lage,
      pass: beslut.pass
        ? { ...beslut.pass, minuter_till: minuterTill(beslut.pass, nu), pagar: pagar(beslut.pass, nu) }
        : null,
      // Ronder visas bara när man är på eller strax före sitt pass.
      ronder: ronderFor(aktuellt),
      forfragningar,
      kvot: { ...kvot, text: kvottext(kvot) },
      att_boka: attBoka({ lediga, mina, nu }),
      // Egna ärenden som ännu inte är åtgärdade, som en liten påminnelse.
      mina_arenden: alla(
        `SELECT id, titel, status, prioritet FROM arende
          WHERE tilldelad_id=? AND status NOT IN ('atgardad','stangd')
          ORDER BY prioritet, skapad LIMIT 5`,
        medlem.id
      ),
      kommande: mina.filter((p) => minuterTill(p, nu) > 0).slice(0, 5),
      // Nästa läger eller tävling man anmält sig till. Hör hemma här för
      // att det är samma fråga som passen svarar på: vad har jag framför
      // mig. Är modulen av finns det ingenting att visa.
      evenemang: modulPa(aktuellForening(), 'evenemang') ? minaKommande(medlem.id) : [],
    });
  }),
];

