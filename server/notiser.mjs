// Siffrorna i menyn: vad som väntar på någon just nu.
//
// Menyn är annars stum. Den som undrar om det kommit in ett akut ärende,
// om någon rond är ogjord eller om det står en beställning i luckan måste
// besöka sidan för att få veta – och gör man det varje kvart är menyn en
// omväg till frågan "finns det något att göra?".
//
// Två regler som håller siffrorna ärliga:
//
//   1. **Bara sådant som kräver en åtgärd räknas.** Antalet öppna ärenden
//      är ingen notis – de flesta ligger och väntar på rätt väder eller
//      rätt reservdel. Brådskande ärenden är en notis.
//   2. **En nolla visas inte.** En siffra som alltid står där slutar
//      betyda något, och då har menyn bara blivit stökigare.
//
// Räkningen går per förening, i dess eget skal, precis som allt annat.
import { en } from './db.mjs';
import { far } from './behorighet.mjs';
import { modulPa } from './moduldata.mjs';
import { lage as rondlage } from './api/checklistor.mjs';

const ARENDE_OPPNA = ['ny', 'bekraftad', 'pagar', 'vantar'];

/**
 * Notiser per sidnyckel, så att klienten slipper veta var siffran kommer
 * ifrån. Saknas nyckeln finns inget att visa.
 */
export function notiser(medlem, forening) {
  const ut = {};
  const pa = (m) => modulPa(forening, m);
  const satt = (nyckel, antal) => {
    if (antal > 0) ut[nyckel] = antal;
  };

  if (pa('arenden')) {
    const hal = ARENDE_OPPNA.map(() => '?').join(',');
    satt(
      'arenden',
      en(
        `SELECT count(*) AS n FROM arende
          WHERE status IN (${hal}) AND (prioritet <= 2 OR allvarlighet = 'sakerhetsrisk')`,
        ...ARENDE_OPPNA
      ).n
    );
  }

  if (pa('checklistor')) {
    // Samma uträkning som startsidan visar, så siffrorna aldrig säger emot
    // varandra.
    satt('checklistor', rondlage().kvar);
  }

  if (pa('drift')) {
    // En talad rapport är ett utkast tills någon läst den. Att den ligger
    // och väntar är hela poängen med att visa den här.
    satt('journal', en('SELECT count(*) AS n FROM driftpost WHERE bekraftad IS NULL').n);
  }

  if (pa('utlagg')) {
    // Kassören ser kön; alla andra ser bara sina egna som fått avslag och
    // alltså behöver göras om eller strykas. Ett utlägg som ligger och
    // väntar på godkännande kräver inget av den som lämnat in det.
    if (far(medlem, 'ekonomi'))
      satt('utlagg', en("SELECT count(*) AS n FROM utlagg WHERE status IN ('ny','godkand')").n);
    else
      satt(
        'utlagg',
        en("SELECT count(*) AS n FROM utlagg WHERE medlem_id=? AND status='avslagen'", medlem.id).n
      );
  }

  if (pa('evenemang')) {
    // Min egen obetalda avgift till något som ännu inte varit. Det är det
    // enda i evenemangen som faktiskt kräver något av mig.
    satt(
      'evenemang',
      en(
        `SELECT count(*) AS n FROM evenemangsanmalan a JOIN evenemang e ON e.id=a.evenemang_id
          WHERE a.medlem_id=? AND a.status='anmald' AND a.betald_tid IS NULL
            AND e.avgift_ore > 0 AND e.status <> 'installt' AND e.start >= date('now')`,
        medlem.id
      ).n
    );
  }

  if (pa('kiosk') && far(medlem, 'kassa')) {
    const order = en(
      `SELECT count(*) AS n FROM kundorder WHERE status IN ('ny','betald','tillagas','klar')`
    ).n;
    const hyror = pa('uthyrning')
      ? en(`SELECT count(*) AS n FROM hyresavtal WHERE status IN ('bokad','forsenad')`).n
      : 0;
    satt('luckan', order + hyror);
  }

  return ut;
}
