// Läger, tävlingar och aktiviteter.
//
// Skilt från träningstillfällena med flit. Ett träningstillfälle är onsdag
// kväll för U12 och återkommer; ett evenemang är resan till Kläppen i
// februari, med anmälan, avgift, femton platser och sista anmälningsdag.
// Att trycka in båda i samma tabell gör att det ena alltid släpar på fält
// det inte behöver, och att listorna blir obegripliga.
//
// Reservkön är inte en extra funktion utan den som gör anmälan användbar:
// annars står någon och ringer runt när en familj hoppar av tre dagar
// före avresa. Kön behåller sin ordning, och den som hamnar i den vet om
// det direkt.
import { alla, en, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { bokforAffar, revidera, verifikationFor } from '../bokforing.mjs';
import { betalaMedPlanbok } from '../planbok.mjs';
import { kronor } from '../pengar.mjs';
import { csv, datum, ettAv, fel, heltal, kravTxt, rutt, svar, text, tidpunkt, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';

export const SLAG = ['lager', 'tavling', 'aktivitet', 'mote'];
export const STATUSAR = ['planerat', 'oppet', 'genomfort', 'installt'];
const ANMALNINGSSTATUS = ['anmald', 'reserv', 'avbokad'];
const BETALSATT = ['planbok', 'swish', 'kort', 'kontant', 'faktura'];
const AVGIFTSKONTO = '3120';

/**
 * Start och slut får vara antingen ett datum eller ett datum med klockslag.
 * Ett läger pågår i tre dagar och har ingen vettig starttid; ett årsmöte
 * börjar 18:30. Att tvinga in båda i samma form gör en av dem lögnaktig.
 */
const narhelst = (v, namn = 'Tidpunkt') => {
  const s = txt(v);
  if (!s) return s;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : tidpunkt(s, namn);
};

const RAD = `SELECT e.*, s.namn AS sektion, g.namn AS grupp, a.namn AS ansvarig
             FROM evenemang e
             LEFT JOIN sektion s ON s.id=e.sektion_id
             LEFT JOIN traningsgrupp g ON g.id=e.grupp_id
             LEFT JOIN medlem a ON a.id=e.ansvarig_id`;

const anmalningar = (evenemang_id) =>
  alla(
    `SELECT a.*, m.namn AS medlem, m.medlemsnummer, m.telefon, m.epost
     FROM evenemangsanmalan a JOIN medlem m ON m.id=a.medlem_id
     WHERE a.evenemang_id=?
     ORDER BY CASE a.status WHEN 'anmald' THEN 0 WHEN 'reserv' THEN 1 ELSE 2 END, a.anmald_tid, a.id`,
    evenemang_id
  );

const raknat = (id) =>
  en(
    `SELECT
       sum(status='anmald') AS anmalda,
       sum(status='reserv') AS reserver,
       sum(status<>'avbokad' AND betald_tid IS NOT NULL) AS betalda
     FROM evenemangsanmalan WHERE evenemang_id=?`,
    id
  );

export const hamta = (id) => en(`${RAD} WHERE e.id=?`, id);

const berika = (e, medlem) => {
  const r = raknat(e.id);
  const anmalda = r?.anmalda || 0;
  const min = medlem
    ? en('SELECT * FROM evenemangsanmalan WHERE evenemang_id=? AND medlem_id=?', e.id, medlem.id)
    : null;
  return {
    ...e,
    avgift: kronor(e.avgift_ore),
    anmalda,
    reserver: r?.reserver || 0,
    betalda: r?.betalda || 0,
    platser_kvar: e.platser == null ? null : Math.max(0, e.platser - anmalda),
    fullt: e.platser != null && anmalda >= e.platser,
    stangt: Boolean(e.sista_anmalan && e.sista_anmalan < idag()),
    min_anmalan: min ? { id: min.id, status: min.status, betald_tid: min.betald_tid, behov: min.behov } : null,
  };
};

export const evenemang = ({ slag, fran, kommande, antal = 300 } = {}) => {
  const villkor = [];
  const varden = [];
  if (slag) { villkor.push('e.slag=?'); varden.push(slag); }
  if (kommande) { villkor.push("e.start >= date('now') AND e.status <> 'installt'"); }
  else if (fran) { villkor.push('e.start >= ?'); varden.push(fran); }
  return alla(
    `${RAD} ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''} ORDER BY e.start, e.id LIMIT ?`,
    ...varden,
    antal
  );
};

/** Nästa evenemang jag är anmäld till. Startsidan och mobilen frågar. */
export const minaKommande = (medlem_id) =>
  alla(
    `SELECT e.*, a.status AS min_status, a.id AS anmalan_id, a.betald_tid
     FROM evenemang e
     JOIN evenemangsanmalan a ON a.evenemang_id=e.id AND a.medlem_id=?
     WHERE e.start >= date('now') AND e.status <> 'installt' AND a.status <> 'avbokad'
     ORDER BY e.start LIMIT 10`,
    medlem_id
  );

/**
 * Flyttar upp reserver så långt det finns plats. Anropas efter varje
 * avbokning – det är hela poängen med kön att den tömmer sig själv.
 */
function fyllFranKon(e, av) {
  if (e.platser == null) return [];
  const anmalda = en("SELECT count(*) AS n FROM evenemangsanmalan WHERE evenemang_id=? AND status='anmald'", e.id).n;
  const ledigt = e.platser - anmalda;
  if (ledigt <= 0) return [];
  const kon = alla(
    "SELECT * FROM evenemangsanmalan WHERE evenemang_id=? AND status='reserv' ORDER BY anmald_tid, id LIMIT ?",
    e.id,
    ledigt
  );
  for (const r of kon) {
    uppdatera('evenemangsanmalan', r.id, { status: 'anmald' });
    revidera({ medlem: av, handelse: 'flyttade upp reserv', objekt: e.namn, detalj: { anmalan: r.id } });
  }
  return kon;
}

const kravEvenemang = (id) => {
  const e = hamta(heltal(id));
  if (!e) throw fel(404, 'Evenemanget finns inte');
  return e;
};

/** Behoven är känsliga – specialkost och allergier. Bara arrangören ser dem. */
const tvattaAnmalan = (a, medlem) =>
  far(medlem, 'evenemang') || a.medlem_id === medlem.id
    ? a
    : { ...a, behov: undefined, telefon: undefined, epost: undefined, anteckning: undefined };

export const rutter = [
  rutt('GET', '/api/evenemang', 'medlem', ({ res, fraga, medlem }) =>
    svar(res, 200, {
      evenemang: evenemang({
        slag: ettAv(fraga.get('slag'), SLAG, 'Slag') || null,
        kommande: fraga.get('alla') !== '1',
      }).map((e) => berika(e, medlem)),
      slag: SLAG,
      statusar: STATUSAR,
      betalsatt: BETALSATT,
      far_arrangera: far(medlem, 'evenemang'),
    })
  ),

  rutt('GET', '/api/evenemang/:id', 'medlem', ({ res, param, medlem }) => {
    const e = kravEvenemang(param.id);
    svar(res, 200, {
      ...berika(e, medlem),
      anmalningar: anmalningar(e.id).map((a) => tvattaAnmalan(a, medlem)),
      far_arrangera: far(medlem, 'evenemang'),
    });
  }),

  rutt('POST', '/api/evenemang', '@evenemang', ({ res, kropp, medlem }) => {
    const id = spara('evenemang', {
      slag: ettAv(kropp.slag, SLAG, 'Slag') || 'aktivitet',
      namn: kravTxt(kropp.namn, 'Namn', 120),
      plats: txt(kropp.plats, 120) ?? null,
      start: narhelst(kropp.start, 'Start') || kravTxt(kropp.start, 'Start', 30),
      slut: narhelst(kropp.slut, 'Slut') ?? null,
      sista_anmalan: datum(kropp.sista_anmalan) ?? null,
      avgift_ore: heltal(kropp.avgift_ore, 0) || 0,
      platser: heltal(kropp.platser, 0) || null,
      beskrivning: txt(kropp.beskrivning, 4000) ?? null,
      sektion_id: heltal(kropp.sektion_id) ?? null,
      grupp_id: heltal(kropp.grupp_id) ?? null,
      ansvarig_id: heltal(kropp.ansvarig_id) ?? medlem.id,
      status: ettAv(kropp.status, STATUSAR, 'Status') || 'oppet',
      av_id: medlem.id,
    });
    revidera({ medlem, handelse: 'lade upp evenemang', objekt: kropp.namn });
    svar(res, 201, berika(hamta(id), medlem));
  }),

  rutt('PUT', '/api/evenemang/:id', '@evenemang', ({ res, param, kropp, medlem }) => {
    const e = kravEvenemang(param.id);
    const falt = {};
    if (kropp.slag !== undefined) falt.slag = ettAv(kropp.slag, SLAG, 'Slag');
    if (kropp.namn !== undefined) falt.namn = kravTxt(kropp.namn, 'Namn', 120);
    if (kropp.plats !== undefined) falt.plats = txt(kropp.plats, 120) ?? null;
    if (kropp.start !== undefined) falt.start = narhelst(kropp.start, 'Start');
    if (kropp.slut !== undefined) falt.slut = narhelst(kropp.slut, 'Slut') ?? null;
    if (kropp.sista_anmalan !== undefined) falt.sista_anmalan = datum(kropp.sista_anmalan) ?? null;
    if (kropp.avgift_ore !== undefined) falt.avgift_ore = heltal(kropp.avgift_ore, 0) || 0;
    if (kropp.platser !== undefined) falt.platser = heltal(kropp.platser, 0) || null;
    if (kropp.beskrivning !== undefined) falt.beskrivning = txt(kropp.beskrivning, 4000) ?? null;
    if (kropp.sektion_id !== undefined) falt.sektion_id = heltal(kropp.sektion_id) ?? null;
    if (kropp.grupp_id !== undefined) falt.grupp_id = heltal(kropp.grupp_id) ?? null;
    if (kropp.ansvarig_id !== undefined) falt.ansvarig_id = heltal(kropp.ansvarig_id) ?? null;
    if (kropp.status !== undefined) falt.status = ettAv(kropp.status, STATUSAR, 'Status');
    uppdatera('evenemang', e.id, falt);
    // Höjdes platsantalet kan någon ur kön få plats direkt.
    fyllFranKon(hamta(e.id), medlem);
    revidera({ medlem, handelse: 'ändrade evenemang', objekt: e.namn });
    svar(res, 200, berika(hamta(e.id), medlem));
  }),

  /**
   * Anmälan. Standardfallet är att man anmäler sig själv och det kräver
   * ingen behörighet. Arrangören får anmäla andra – en tränare som skriver
   * in de fem som sa ja på träningen ska inte behöva jaga dem att logga in.
   */
  rutt('POST', '/api/evenemang/:id/anmalan', 'medlem', ({ res, param, kropp, medlem }) => {
    const e = kravEvenemang(param.id);
    if (e.status === 'installt') throw fel(409, 'Evenemanget är inställt');
    if (e.status === 'genomfort') throw fel(409, 'Evenemanget har redan varit');
    const for_id = heltal(kropp.medlem_id) ?? medlem.id;
    if (for_id !== medlem.id && !far(medlem, 'evenemang'))
      throw fel(403, 'Du får bara anmäla dig själv');
    const m = en('SELECT * FROM medlem WHERE id=?', for_id);
    if (!m) throw fel(404, 'Medlemmen finns inte');
    if (e.sista_anmalan && e.sista_anmalan < idag() && !far(medlem, 'evenemang'))
      throw fel(409, `Sista anmälningsdag var ${e.sista_anmalan}`);

    const fanns = en('SELECT * FROM evenemangsanmalan WHERE evenemang_id=? AND medlem_id=?', e.id, for_id);
    const anmalda = en("SELECT count(*) AS n FROM evenemangsanmalan WHERE evenemang_id=? AND status='anmald'", e.id).n;
    const status = e.platser != null && anmalda >= e.platser ? 'reserv' : 'anmald';
    const behov = txt(kropp.behov, 500) ?? null;
    const anteckning = txt(kropp.anteckning, 1000) ?? null;

    if (fanns) {
      if (fanns.status !== 'avbokad') throw fel(409, `${m.namn} är redan ${fanns.status}`);
      uppdatera('evenemangsanmalan', fanns.id, { status, anmald_tid: nu(), behov, anteckning });
    } else {
      spara('evenemangsanmalan', { evenemang_id: e.id, medlem_id: for_id, status, behov, anteckning });
    }
    revidera({ medlem, handelse: 'anmälde till evenemang', objekt: e.namn, detalj: { medlem: m.namn, status } });
    svar(res, 201, { ...berika(hamta(e.id), medlem), status, reserv: status === 'reserv' });
  }),

  /** Avbokning. Reservkön fylls på i samma andetag. */
  rutt('DELETE', '/api/evenemang/:id/anmalan/:anmalan', 'medlem', ({ res, param, medlem }) => {
    const e = kravEvenemang(param.id);
    const a = en('SELECT * FROM evenemangsanmalan WHERE id=? AND evenemang_id=?', heltal(param.anmalan), e.id);
    if (!a) throw fel(404, 'Anmälan finns inte');
    if (a.medlem_id !== medlem.id && !far(medlem, 'evenemang'))
      throw fel(403, 'Du får bara avboka din egen anmälan');
    if (a.betald_tid && !far(medlem, 'ekonomi'))
      throw fel(409, 'Avgiften är betald – hör av dig till kassören för återbetalning');
    uppdatera('evenemangsanmalan', a.id, { status: 'avbokad' });
    const uppflyttade = fyllFranKon(hamta(e.id), medlem);
    revidera({ medlem, handelse: 'avbokade från evenemang', objekt: e.namn });
    svar(res, 200, { ...berika(hamta(e.id), medlem), uppflyttade: uppflyttade.length });
  }),

  /**
   * Kvittera avgiften. Plånboken dras direkt; övriga betalsätt bokförs mot
   * sitt tillgångskonto. Ett avgiftsfritt evenemang har inget att kvittera.
   */
  rutt('POST', '/api/evenemang/:id/anmalan/:anmalan/betald', 'medlem', ({ res, param, kropp, medlem }) => {
    const e = kravEvenemang(param.id);
    const a = en('SELECT * FROM evenemangsanmalan WHERE id=? AND evenemang_id=?', heltal(param.anmalan), e.id);
    if (!a) throw fel(404, 'Anmälan finns inte');
    const satt = ettAv(kropp.betalsatt, BETALSATT, 'Betalsätt') || 'planbok';
    // Att betala med sin egen plånbok får man göra själv; att kvittera att
    // kontanter kommit in i en kassa är en kassörsuppgift.
    const egen = a.medlem_id === medlem.id && satt === 'planbok';
    if (!egen && !far(medlem, 'kassa') && !far(medlem, 'ekonomi'))
      throw fel(403, 'Kräver kassabehörighet');
    if (a.betald_tid) throw fel(409, 'Avgiften är redan betald');
    if (!e.avgift_ore) throw fel(400, 'Evenemanget är avgiftsfritt');

    const m = en('SELECT * FROM medlem WHERE id=?', a.medlem_id);
    const beskrivning = `${e.namn}, ${m.namn}`;
    const rader = [{ konto: AVGIFTSKONTO, belopp_ore: e.avgift_ore, momssats: 0, kategori: 'evenemang' }];
    const verifikation =
      satt === 'planbok'
        ? betalaMedPlanbok({
            medlem: m,
            rader,
            beskrivning,
            serie: 'M',
            referens_slag: 'evenemangsanmalan',
            referens_id: a.id,
            av: medlem,
          }).verifikation
        : bokforAffar({
            serie: 'M',
            datum: idag(),
            beskrivning,
            motpart: m.namn,
            rader,
            betalmedel: satt,
            referens_slag: 'evenemangsanmalan',
            referens_id: a.id,
            av: medlem,
          });
    uppdatera('evenemangsanmalan', a.id, { betald_tid: nu(), betalsatt: satt });
    revidera({ medlem, handelse: 'kvitterade evenemangsavgift', objekt: beskrivning, detalj: { satt } });
    svar(res, 200, { ...berika(hamta(e.id), medlem), verifikation });
  }),

  /** Deltagarlistan att ta med sig. Behoven följer med – den som kör bussen behöver dem. */
  rutt('GET', '/api/evenemang/:id/deltagare.csv', '@evenemang', ({ res, param }) => {
    const e = kravEvenemang(param.id);
    const rader = anmalningar(e.id)
      .filter((a) => a.status !== 'avbokad')
      .map((a) => ({ ...a, betald: a.betald_tid ? a.betald_tid.slice(0, 10) : '' }));
    text(
      res,
      200,
      csv(rader, [
        { rubrik: 'Namn', falt: 'medlem' },
        { rubrik: 'Medlemsnummer', falt: 'medlemsnummer' },
        { rubrik: 'Status', falt: 'status' },
        { rubrik: 'Telefon', falt: 'telefon' },
        { rubrik: 'E-post', falt: 'epost' },
        { rubrik: 'Betald', falt: 'betald' },
        { rubrik: 'Behov', falt: 'behov' },
      ]),
      'text/csv; charset=utf-8',
      { 'content-disposition': `attachment; filename="deltagare-${e.id}.csv"` }
    );
  }),
];
