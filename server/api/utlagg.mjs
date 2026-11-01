// Utlägg: medlemmen har lagt ut egna pengar och vill ha dem tillbaka.
//
// Det här är förmodligen den vanligaste pappersrutinen i en liten förening,
// och den som oftast går fel: någon handlar slangklämmor på Jula, kvittot
// ligger i jackan i tre veckor, och till slut struntar hen i det. Därför
// gör vi det som mobilen är bra på – fota kvittot direkt i parkeringen –
// och låter medlemmen själv se var ärendet ligger.
//
// Bokföringen sker i två steg och det är med flit. När kassören godkänner
// uppstår skulden till medlemmen (kostnaden är klubbens, pengarna är ännu
// inte utbetalda). När utbetalningen görs löses skulden. Däremellan kan
// månadsskiftet ligga, och då är det just den uppdelningen som gör att
// kostnaden hamnar i rätt period.
import { alla, en, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { bokfor, INGAENDE_MOMS, revidera, UTLAGGSKONTON, verifikationFor } from '../bokforing.mjs';
import { krediteraPlanbok, PLANBOKSKONTO } from '../planbok.mjs';
import { kronor } from '../pengar.mjs';
import { sparaBild, bildfinns } from './bilder.mjs';
import { datum, ettAv, fel, heltal, kravTxt, rutt, svar, txt } from '../http.mjs';
import { idag, nu } from '../tid.mjs';

export const KATEGORIER = Object.keys(UTLAGGSKONTON);
export const STATUSAR = ['ny', 'godkand', 'utbetald', 'avslagen'];
const UTBETALNINGSSATT = ['bank', 'planbok'];
const MOMSSATSER = [0, 0.06, 0.12, 0.25];

const BANKKONTO = '1930';
const SKULDKONTO = '2890';

const berika = (u) => ({
  ...u,
  belopp: kronor(u.belopp_ore),
  moms: u.moms_ore ? kronor(u.moms_ore) : null,
  kostnadskonto: UTLAGGSKONTON[u.kategori] || UTLAGGSKONTON.ovrigt,
  verifikation: verifikationFor('utlagg', u.id) || null,
});

const RAD = `SELECT u.*, m.namn AS medlem, m.medlemsnummer, g.namn AS granskad_av
             FROM utlagg u
             JOIN medlem m ON m.id=u.medlem_id
             LEFT JOIN medlem g ON g.id=u.granskad_av_id`;

export const hamta = (id) => en(`${RAD} WHERE u.id=?`, id);

export const utlagg = ({ status, medlem_id, antal = 300 } = {}) => {
  const villkor = [];
  const varden = [];
  if (status) { villkor.push('u.status=?'); varden.push(status); }
  if (medlem_id) { villkor.push('u.medlem_id=?'); varden.push(medlem_id); }
  return alla(
    `${RAD} ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''}
     ORDER BY CASE u.status WHEN 'ny' THEN 0 WHEN 'godkand' THEN 1 ELSE 2 END, u.datum DESC, u.id DESC
     LIMIT ?`,
    ...varden,
    antal
  );
};

/** Vad kassören har att göra. Används av notiserna. */
export const vantar = () => en("SELECT count(*) AS n FROM utlagg WHERE status IN ('ny','godkand')").n;

const krav = (u, medlem) => {
  if (!u) throw fel(404, 'Utlägget finns inte');
  if (u.medlem_id !== medlem.id && !far(medlem, 'ekonomi_las'))
    throw fel(403, 'Du får bara se dina egna utlägg');
  return u;
};

/**
 * Momsen delas av från beloppet om medlemmen angett den. Gör hen inte det
 * bokförs hela summan som kostnad – en förening utan momsregistrering ska
 * inte tvingas fylla i ett fält som inte angår den.
 */
function bokforGodkannande({ u, medlem }) {
  const moms = Math.max(0, Math.min(heltal(u.moms_ore, 0) || 0, u.belopp_ore));
  const netto = u.belopp_ore - moms;
  const rader = [
    { konto: UTLAGGSKONTON[u.kategori] || UTLAGGSKONTON.ovrigt, debet_ore: netto, beskrivning: u.syfte },
  ];
  if (moms) rader.push({ konto: INGAENDE_MOMS, debet_ore: moms, beskrivning: 'Ingående moms' });
  rader.push({ konto: SKULDKONTO, kredit_ore: u.belopp_ore, beskrivning: `Skuld till ${u.medlem}` });
  return bokfor({
    serie: 'D',
    datum: u.datum,
    beskrivning: `Utlägg ${u.medlem}: ${u.syfte}`,
    motpart: u.medlem,
    rader,
    referens_slag: 'utlagg',
    referens_id: u.id,
    av: medlem,
    underlag: u.kvitto ? `bilder/${u.kvitto}` : null,
  });
}

export const rutter = [
  /** Mina egna utlägg – varje medlem, utan behörighet. */
  rutt('GET', '/api/utlagg/mina', 'medlem', ({ res, medlem }) =>
    svar(res, 200, {
      utlagg: utlagg({ medlem_id: medlem.id }).map(berika),
      kategorier: KATEGORIER,
      utbetalningssatt: UTBETALNINGSSATT,
      momssatser: MOMSSATSER,
    })
  ),

  /** Kassörens lista. */
  rutt('GET', '/api/utlagg', '@ekonomi_las', ({ res, fraga }) => {
    const rader = utlagg({ status: ettAv(fraga.get('status'), STATUSAR, 'Status') || null });
    const summa = (status) =>
      rader.filter((u) => u.status === status).reduce((s, u) => s + u.belopp_ore, 0);
    svar(res, 200, {
      utlagg: rader.map(berika),
      kategorier: KATEGORIER,
      utbetalningssatt: UTBETALNINGSSATT,
      momssatser: MOMSSATSER,
      lage: {
        nya: rader.filter((u) => u.status === 'ny').length,
        att_betala_ore: summa('godkand'),
        att_betala: kronor(summa('godkand')),
      },
    });
  }),

  rutt('GET', '/api/utlagg/:id', 'medlem', ({ res, param, medlem }) =>
    svar(res, 200, berika(krav(hamta(heltal(param.id)), medlem)))
  ),

  /**
   * Nytt utlägg. Kvittot kommer antingen som en data-URL direkt från
   * mobilkameran, eller som ett filnamn från ett tidigare anrop till
   * /api/bilder – mobilen laddar upp bilden medan formuläret fylls i.
   */
  rutt('POST', '/api/utlagg', 'medlem', ({ res, kropp, medlem }) => {
    const belopp_ore = heltal(kropp.belopp_ore, 0);
    if (belopp_ore <= 0) throw fel(400, 'Fyll i vad du lagt ut');
    const moms_ore = heltal(kropp.moms_ore, 0) || 0;
    if (moms_ore > belopp_ore) throw fel(400, 'Momsen kan inte vara större än beloppet');
    let kvitto = null;
    if (kropp.kvitto_data) kvitto = sparaBild(kropp.kvitto_data);
    else if (kropp.kvitto) {
      if (!bildfinns(kropp.kvitto)) throw fel(400, 'Kvittobilden finns inte');
      kvitto = kropp.kvitto;
    }
    const id = spara('utlagg', {
      medlem_id: medlem.id,
      datum: datum(kropp.datum) || idag(),
      belopp_ore,
      moms_ore: moms_ore || null,
      syfte: kravTxt(kropp.syfte, 'Vad gäller det', 200),
      kategori: ettAv(kropp.kategori, KATEGORIER, 'Kategori') || 'ovrigt',
      kvitto,
      utbetalning: ettAv(kropp.utbetalning, UTBETALNINGSSATT, 'Utbetalning') || 'bank',
      anteckning: txt(kropp.anteckning, 1000) ?? null,
    });
    revidera({ medlem, handelse: 'anmälde utlägg', objekt: `#${id}`, detalj: { belopp_ore } });
    svar(res, 201, berika(hamta(id)));
  }),

  /** Ändra sitt eget utlägg – bara så länge ingen hunnit granska det. */
  rutt('PUT', '/api/utlagg/:id', 'medlem', ({ res, param, kropp, medlem }) => {
    const u = krav(hamta(heltal(param.id)), medlem);
    if (u.medlem_id !== medlem.id) throw fel(403, 'Det är inte ditt utlägg');
    if (u.status !== 'ny') throw fel(409, 'Utlägget är redan granskat och går inte att ändra');
    const falt = {};
    if (kropp.datum !== undefined) falt.datum = datum(kropp.datum);
    if (kropp.belopp_ore !== undefined) falt.belopp_ore = heltal(kropp.belopp_ore, 0);
    if (kropp.moms_ore !== undefined) falt.moms_ore = heltal(kropp.moms_ore, 0) || null;
    if (kropp.syfte !== undefined) falt.syfte = kravTxt(kropp.syfte, 'Vad gäller det', 200);
    if (kropp.kategori !== undefined) falt.kategori = ettAv(kropp.kategori, KATEGORIER, 'Kategori');
    if (kropp.utbetalning !== undefined) falt.utbetalning = ettAv(kropp.utbetalning, UTBETALNINGSSATT, 'Utbetalning');
    if (kropp.anteckning !== undefined) falt.anteckning = txt(kropp.anteckning, 1000) ?? null;
    if (kropp.kvitto_data) falt.kvitto = sparaBild(kropp.kvitto_data);
    if (falt.belopp_ore !== undefined && falt.belopp_ore <= 0) throw fel(400, 'Fyll i vad du lagt ut');
    uppdatera('utlagg', u.id, falt);
    svar(res, 200, berika(hamta(u.id)));
  }),

  /** Ta bort sitt eget, ogranskade utlägg. Kvittofilen får ligga kvar. */
  rutt('DELETE', '/api/utlagg/:id', 'medlem', ({ res, param, medlem }) => {
    const u = krav(hamta(heltal(param.id)), medlem);
    if (u.medlem_id !== medlem.id) throw fel(403, 'Det är inte ditt utlägg');
    if (u.status !== 'ny') throw fel(409, 'Utlägget är redan granskat');
    en('DELETE FROM utlagg WHERE id=? RETURNING id', u.id);
    svar(res, 200, { borttaget: u.id });
  }),

  /**
   * Godkänn. Här uppstår kostnaden och skulden till medlemmen; pengarna
   * rör sig först i nästa steg.
   */
  rutt('POST', '/api/utlagg/:id/godkann', '@ekonomi', ({ res, param, kropp, medlem }) => {
    const u = hamta(heltal(param.id));
    if (!u) throw fel(404, 'Utlägget finns inte');
    if (u.status !== 'ny') throw fel(409, `Utlägget är redan ${u.status}`);
    if (kropp.moms_ore !== undefined) {
      const moms = heltal(kropp.moms_ore, 0) || 0;
      if (moms > u.belopp_ore) throw fel(400, 'Momsen kan inte vara större än beloppet');
      uppdatera('utlagg', u.id, { moms_ore: moms || null });
    }
    if (kropp.kategori !== undefined)
      uppdatera('utlagg', u.id, { kategori: ettAv(kropp.kategori, KATEGORIER, 'Kategori') });
    const fardigt = hamta(u.id);
    const verifikation = bokforGodkannande({ u: fardigt, medlem });
    uppdatera('utlagg', u.id, {
      status: 'godkand',
      granskad_av_id: medlem.id,
      granskad_tid: nu(),
      anteckning: txt(kropp.anteckning, 1000) ?? fardigt.anteckning,
    });
    revidera({ medlem, handelse: 'godkände utlägg', objekt: `#${u.id}`, detalj: { belopp_ore: fardigt.belopp_ore } });
    svar(res, 200, { ...berika(hamta(u.id)), verifikation });
  }),

  /**
   * Betala ut. Antingen till bankkontot eller till medlemmens plånbok –
   * det senare är vanligare än man tror i en klubb där samma person som
   * handlar också fikar i luckan varje lördag.
   */
  rutt('POST', '/api/utlagg/:id/betala', '@ekonomi', ({ res, param, kropp, medlem }) => {
    const u = hamta(heltal(param.id));
    if (!u) throw fel(404, 'Utlägget finns inte');
    if (u.status === 'utbetald') throw fel(409, 'Utlägget är redan utbetalt');
    if (u.status !== 'godkand') throw fel(409, 'Godkänn utlägget först');
    const satt = ettAv(kropp.utbetalning, UTBETALNINGSSATT, 'Utbetalning') || u.utbetalning;
    const till = satt === 'planbok'
      ? { konto: PLANBOKSKONTO, text: 'Förts till medlemmens plånbok' }
      : { konto: BANKKONTO, text: 'Utbetalt från bankkontot' };
    const verifikation = bokfor({
      serie: 'D',
      datum: idag(),
      beskrivning: `Utbetalning av utlägg till ${u.medlem}`,
      motpart: u.medlem,
      rader: [
        { konto: SKULDKONTO, debet_ore: u.belopp_ore, beskrivning: 'Skulden till medlem löses' },
        { konto: till.konto, kredit_ore: u.belopp_ore, beskrivning: till.text },
      ],
      referens_slag: 'utlaggsbetalning',
      referens_id: u.id,
      av: medlem,
    });
    if (satt === 'planbok')
      krediteraPlanbok({
        medlem: en('SELECT * FROM medlem WHERE id=?', u.medlem_id),
        belopp_ore: u.belopp_ore,
        beskrivning: `Utlägg: ${u.syfte}`,
        referens_slag: 'utlagg',
        referens_id: u.id,
        verifikation_id: verifikation.id,
        av: medlem,
      });
    uppdatera('utlagg', u.id, { status: 'utbetald', utbetalning: satt, betald_tid: nu() });
    revidera({ medlem, handelse: 'betalade utlägg', objekt: `#${u.id}`, detalj: { satt, belopp_ore: u.belopp_ore } });
    svar(res, 200, { ...berika(hamta(u.id)), verifikation });
  }),

  /** Avslag kräver ett skäl. Ett utlägg som bara tystnar är värre än ett nekat. */
  rutt('POST', '/api/utlagg/:id/avsla', '@ekonomi', ({ res, param, kropp, medlem }) => {
    const u = hamta(heltal(param.id));
    if (!u) throw fel(404, 'Utlägget finns inte');
    if (u.status === 'utbetald') throw fel(409, 'Utlägget är redan utbetalt');
    if (u.status === 'godkand') throw fel(409, 'Utlägget är bokfört som godkänt – rätta verifikationen i stället');
    uppdatera('utlagg', u.id, {
      status: 'avslagen',
      avslagsskal: kravTxt(kropp.skal, 'Skäl', 500),
      granskad_av_id: medlem.id,
      granskad_tid: nu(),
    });
    revidera({ medlem, handelse: 'avslog utlägg', objekt: `#${u.id}`, detalj: txt(kropp.skal, 200) });
    svar(res, 200, berika(hamta(u.id)));
  }),
];
