// Utlägg, läger och tävlingar, samåkning och plånbok – över HTTP.
//
// De fyra hänger ihop: ett godkänt utlägg kan betalas till plånboken, en
// evenemangsavgift kan dras ur den, och samåkningen hänger på evenemanget.
// Därför ligger de i samma test – det är kedjan som är intressant, inte
// de enskilda anropen.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-klubb-'));
process.env.HAK_DB = join(katalog, 'test.db');
process.env.HAK_PORT = '8473';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';

const BAS = 'http://127.0.0.1:8473';
let server;
let db;
const kakor = {};
let aktiv = null;
const id = {};

const anrop = async (metod, stig, kropp) => {
  const r = await fetch(BAS + stig, {
    method: metod,
    headers: {
      'content-type': 'application/json',
      'x-hak': '1',
      ...(aktiv && kakor[aktiv] ? { cookie: kakor[aktiv] } : {}),
    },
    body: kropp === undefined ? undefined : JSON.stringify(kropp),
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length && aktiv) kakor[aktiv] = sc[0].split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, kropp: typ.includes('json') ? await r.json() : await r.text() };
};
const ok = async (metod, stig, kropp) => {
  const r = await anrop(metod, stig, kropp);
  assert.ok(r.status < 400, `${metod} ${stig} gav ${r.status}: ${JSON.stringify(r.kropp)}`);
  return r.kropp;
};
const nekas = async (metod, stig, kropp, status) => {
  const r = await anrop(metod, stig, kropp);
  assert.ok(r.status >= 400, `${metod} ${stig} skulle nekas men gav ${r.status}`);
  if (status) assert.equal(r.status, status, `${metod} ${stig}: ${JSON.stringify(r.kropp)}`);
  return r.kropp;
};
const loggaIn = async (anvandarnamn) => {
  aktiv = anvandarnamn;
  kakor[anvandarnamn] = '';
  await ok('POST', '/api/logga-in', { anvandarnamn, losenord: 'hemligt' });
};

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;
  const medlem = (anvandarnamn, namn, roll, extra = {}) =>
    (id[anvandarnamn] = spara('medlem', {
      anvandarnamn, namn, roll, losenordshash: hasha('hemligt'), kompetens: '[]', ...extra,
    }));

  medlem('kassor', 'Karin Kassör', 'medlem');
  medlem('tranare', 'Tore Tränare', 'tranare');
  medlem('per', 'Per Persson', 'medlem');
  medlem('eva', 'Eva Eriksson', 'medlem');
  medlem('barn', 'Bosse Barn', 'medlem', { fodelsedatum: '2014-01-01' });
  spara('uppdrag', { medlem_id: id.kassor, slag: 'kassor' });
  spara('uppdrag', { medlem_id: id.tranare, slag: 'tranare' });
  const sektion = spara('sektion', { nyckel: 'alpint', namn: 'Alpint' });
  spara('traningsgrupp', { sektion_id: sektion, namn: 'U12' });

  const { sakerstallKontoplan } = await import('../server/bokforing.mjs');
  sakerstallKontoplan();
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

// ---------- utlägg ----------

test('kontoplanen har kostnadskonton och skuldkonto för utlägg', async () => {
  await loggaIn('kassor');
  const k = await ok('GET', '/api/bokforing/konton');
  const nummer = (k.konton || k).map((r) => r.nummer);
  for (const n of ['2641', '2890', '4010', '5410', '5800', '6110', '6590', '6990', '3120'])
    assert.ok(nummer.includes(n), `konto ${n} saknas i kontoplanen`);
});

test('medlemmen anmäler ett utlägg och ser bara sitt eget', async () => {
  await loggaIn('per');
  const skapat = await ok('POST', '/api/utlagg', {
    datum: '2026-10-20',
    belopp_ore: 48900,
    moms_ore: 9780,
    syfte: 'Slangklämmor till lans 4',
    kategori: 'backen',
    utbetalning: 'bank',
  });
  id.utlagg_per = skapat.id;
  assert.equal(skapat.status, 'ny');
  assert.equal(skapat.belopp, '489 kr');
  assert.equal(skapat.kostnadskonto, '5410', 'kategorin backen ska peka på förbrukningsinventarier');

  await loggaIn('eva');
  await ok('POST', '/api/utlagg', { belopp_ore: 10000, syfte: 'Kaffe', kategori: 'fiket' });
  const mina = await ok('GET', '/api/utlagg/mina');
  assert.equal(mina.utlagg.length, 1, 'Eva ska bara se sitt eget');
  // Och inte Pers, inte ens med dess id.
  await nekas('GET', `/api/utlagg/${id.utlagg_per}`, undefined, 403);
  // Listan för kassören är stängd för henne.
  await nekas('GET', '/api/utlagg', undefined, 403);
});

test('utlägg utan belopp eller syfte tas inte emot', async () => {
  await loggaIn('per');
  await nekas('POST', '/api/utlagg', { syfte: 'Utan belopp' }, 400);
  await nekas('POST', '/api/utlagg', { belopp_ore: 1000 }, 400);
  await nekas('POST', '/api/utlagg', { belopp_ore: 1000, moms_ore: 2000, syfte: 'För mycket moms' }, 400);
});

test('bara den som lagt in utlägget får ändra det, och bara innan granskning', async () => {
  await loggaIn('eva');
  await nekas('PUT', `/api/utlagg/${id.utlagg_per}`, { belopp_ore: 1 }, 403);
  await loggaIn('per');
  const andrat = await ok('PUT', `/api/utlagg/${id.utlagg_per}`, { belopp_ore: 51000, utbetalning: 'planbok' });
  assert.equal(andrat.belopp, '510 kr');
  assert.equal(andrat.utbetalning, 'planbok');
});

test('godkännandet bokför kostnad, moms och skuld till medlemmen', async () => {
  await loggaIn('kassor');
  const kon = await ok('GET', '/api/utlagg');
  assert.equal(kon.lage.nya, 2, 'två nya utlägg i kön');

  const r = await ok('POST', `/api/utlagg/${id.utlagg_per}/godkann`, {});
  assert.equal(r.status, 'godkand');
  assert.equal(r.granskad_av, 'Karin Kassör');
  const rader = r.verifikation.rader;
  const belopp = (konto, sida) => rader.filter((x) => x.konto === konto).reduce((a, x) => a + x[sida], 0);
  assert.equal(belopp('5410', 'debet_ore'), 51000 - 9780, 'kostnaden är beloppet utan moms');
  assert.equal(belopp('2641', 'debet_ore'), 9780, 'ingående moms för sig');
  assert.equal(belopp('2890', 'kredit_ore'), 51000, 'hela beloppet blir en skuld till medlemmen');

  // Godkänt två gånger går inte, och avslag efter godkännande inte heller:
  // då finns en verifikation som i stället måste rättas.
  await nekas('POST', `/api/utlagg/${id.utlagg_per}/godkann`, {}, 409);
  await nekas('POST', `/api/utlagg/${id.utlagg_per}/avsla`, { skal: 'Ångrade mig' }, 409);
});

test('utbetalning till plånboken löser skulden och syns i saldot', async () => {
  await loggaIn('kassor');
  const fore = await ok('GET', `/api/planbok/medlem/${id.per}`);
  assert.equal(fore.saldo_ore, 0);

  const r = await ok('POST', `/api/utlagg/${id.utlagg_per}/betala`, { utbetalning: 'planbok' });
  assert.equal(r.status, 'utbetald');
  const rader = r.verifikation.rader;
  assert.equal(rader.find((x) => x.konto === '2890').debet_ore, 51000, 'skulden löses');
  assert.equal(rader.find((x) => x.konto === '2420').kredit_ore, 51000, 'pengarna blir plånboksskuld i stället');

  const efter = await ok('GET', `/api/planbok/medlem/${id.per}`);
  assert.equal(efter.saldo_ore, 51000);
  assert.equal(efter.historik[0].slag, 'insattning');
  assert.equal(efter.historik[0].referens_slag, 'utlagg');

  await nekas('POST', `/api/utlagg/${id.utlagg_per}/betala`, {}, 409);
});

test('utbetalning kräver godkännande först, och avslag kräver ett skäl', async () => {
  await loggaIn('eva');
  const nytt = await ok('POST', '/api/utlagg', { belopp_ore: 7500, syfte: 'Parkering', kategori: 'resa' });
  await loggaIn('kassor');
  await nekas('POST', `/api/utlagg/${nytt.id}/betala`, { utbetalning: 'bank' }, 409);
  await nekas('POST', `/api/utlagg/${nytt.id}/avsla`, {}, 400);
  const avslaget = await ok('POST', `/api/utlagg/${nytt.id}/avsla`, { skal: 'Ersätts med milersättning' });
  assert.equal(avslaget.status, 'avslagen');
  assert.match(avslaget.avslagsskal, /milersättning/);
  // Medlemmen ser skälet, och kan inte längre ändra.
  await loggaIn('eva');
  await nekas('PUT', `/api/utlagg/${nytt.id}`, { belopp_ore: 100 }, 409);
  await nekas('DELETE', `/api/utlagg/${nytt.id}`, undefined, 409);
});

test('en vanlig medlem kan inte godkänna sitt eget utlägg', async () => {
  await loggaIn('per');
  const eget = await ok('POST', '/api/utlagg', { belopp_ore: 100000, syfte: 'Egen fakturering', kategori: 'ovrigt' });
  await nekas('POST', `/api/utlagg/${eget.id}/godkann`, {}, 403);
  await nekas('POST', `/api/utlagg/${eget.id}/betala`, { utbetalning: 'planbok' }, 403);
  // Men ta bort sitt eget, ogranskade, går bra.
  await ok('DELETE', `/api/utlagg/${eget.id}`);
});

// ---------- läger och tävling ----------

test('tränaren lägger upp ett läger, medlemmen anmäler sig själv', async () => {
  await loggaIn('per');
  await nekas('POST', '/api/evenemang', { namn: 'Eget läger', start: '2027-02-01' }, 403);

  await loggaIn('tranare');
  const e = await ok('POST', '/api/evenemang', {
    slag: 'lager',
    namn: 'Träningsläger Kläppen',
    plats: 'Kläppen',
    start: '2027-02-12',
    slut: '2027-02-15',
    sista_anmalan: '2027-01-20',
    avgift_ore: 240000,
    platser: 2,
  });
  id.lager = e.id;
  assert.match(e.avgift, /^2.400 kr$/, 'kronor() använder tunt mellanrum som tusentalsavgränsare');
  assert.equal(e.platser_kvar, 2);
  assert.equal(e.start, '2027-02-12', 'ett datum utan klockslag tas emot som det är');

  // Och ett möte med klockslag.
  const m = await ok('POST', '/api/evenemang', { slag: 'mote', namn: 'Årsmöte', start: '2027-03-10 18:30' });
  assert.equal(m.start, '2027-03-10 18:30');
  await nekas('POST', '/api/evenemang', { namn: 'Trasig tid', start: '2027-03-10 25:00' }, 400);

  await loggaIn('per');
  const anmald = await ok('POST', `/api/evenemang/${id.lager}/anmalan`, { behov: 'Glutenfritt' });
  assert.equal(anmald.status, 'anmald');
  assert.equal(anmald.reserv, false);
  // Två gånger går inte.
  await nekas('POST', `/api/evenemang/${id.lager}/anmalan`, {}, 409);
  // Och man anmäler inte någon annan.
  await nekas('POST', `/api/evenemang/${id.lager}/anmalan`, { medlem_id: id.eva }, 403);
});

test('när platserna är slut hamnar nästa i reservkön, och kön tömmer sig själv', async () => {
  await loggaIn('eva');
  const andra = await ok('POST', `/api/evenemang/${id.lager}/anmalan`, {});
  assert.equal(andra.status, 'anmald');
  assert.equal(andra.fullt, true);

  // Tränaren skriver in barnet – nu är det fullt, så det blir reserv.
  await loggaIn('tranare');
  const tredje = await ok('POST', `/api/evenemang/${id.lager}/anmalan`, { medlem_id: id.barn });
  assert.equal(tredje.status, 'reserv');
  assert.equal(tredje.reserver, 1);

  // Eva hoppar av. Barnet flyttas upp automatiskt.
  await loggaIn('eva');
  const min = (await ok('GET', `/api/evenemang/${id.lager}`)).min_anmalan;
  const efter = await ok('DELETE', `/api/evenemang/${id.lager}/anmalan/${min.id}`);
  assert.equal(efter.uppflyttade, 1, 'reserven ska ha fått platsen');
  assert.equal(efter.anmalda, 2);
  assert.equal(efter.reserver, 0);
});

test('behoven är känsliga och syns inte för andra deltagare', async () => {
  await loggaIn('eva');
  const e = await ok('GET', `/api/evenemang/${id.lager}`);
  const pers = e.anmalningar.find((a) => a.medlem_id === id.per);
  assert.equal(pers.behov, undefined, 'Eva ska inte se Pers specialkost');
  assert.equal(pers.telefon, undefined);
  // Men arrangören ser dem – det är hen som bokar boendet.
  await loggaIn('tranare');
  const forArrangoren = await ok('GET', `/api/evenemang/${id.lager}`);
  assert.equal(forArrangoren.anmalningar.find((a) => a.medlem_id === id.per).behov, 'Glutenfritt');
  const csvtext = await ok('GET', `/api/evenemang/${id.lager}/deltagare.csv`);
  assert.match(csvtext, /Glutenfritt/);
  assert.match(csvtext, /Per Persson/);
});

test('avgiften kan betalas med plånboken och bokförs som deltagaravgift', async () => {
  // Per har 510 kr i plånboken efter utlägget – lägret kostar 2 400.
  await loggaIn('per');
  const e = await ok('GET', `/api/evenemang/${id.lager}`);
  const min = e.min_anmalan;
  await nekas('POST', `/api/evenemang/${id.lager}/anmalan/${min.id}/betald`, { betalsatt: 'planbok' }, 409);

  await loggaIn('kassor');
  await ok('POST', '/api/planbok/insattning', { medlem_id: id.per, belopp_ore: 200000, betalmedel: 'swish' });

  await loggaIn('per');
  const betalt = await ok('POST', `/api/evenemang/${id.lager}/anmalan/${min.id}/betald`, { betalsatt: 'planbok' });
  assert.equal(betalt.betalda, 1);
  const konton = betalt.verifikation.rader.map((r) => r.konto);
  assert.ok(konton.includes('3120'), 'intäkten ska hamna på deltagaravgifter');
  assert.ok(konton.includes('2420'), 'plånbokens skuld minskar');
  const pb = await ok('GET', '/api/planbok/min');
  assert.equal(pb.saldo_ore, 51000 + 200000 - 240000);

  // Dubbelt betalt går inte, och en betald anmälan avbokas inte av medlemmen själv.
  await nekas('POST', `/api/evenemang/${id.lager}/anmalan/${min.id}/betald`, { betalsatt: 'planbok' }, 409);
  await nekas('DELETE', `/api/evenemang/${id.lager}/anmalan/${min.id}`, undefined, 409);
});

test('en annans avgift kvitteras bara av kassan', async () => {
  await loggaIn('tranare');
  const ny = await ok('POST', `/api/evenemang/${id.lager}/anmalan`, { medlem_id: id.eva });
  const e = await ok('GET', `/api/evenemang/${id.lager}`);
  const evas = e.anmalningar.find((a) => a.medlem_id === id.eva);
  assert.ok(evas);
  await loggaIn('per');
  await nekas('POST', `/api/evenemang/${id.lager}/anmalan/${evas.id}/betald`, { betalsatt: 'kontant' }, 403);
  await loggaIn('kassor');
  const r = await ok('POST', `/api/evenemang/${id.lager}/anmalan/${evas.id}/betald`, { betalsatt: 'kontant' });
  assert.ok(r.verifikation.rader.some((x) => x.konto === '1910'), 'kontanter går till kassakontot');
  assert.equal(ny.status, 'reserv', 'Eva kom in som reserv när lägret var fullt');
});

test('sista anmälningsdag stänger för medlemmen men inte för arrangören', async () => {
  await loggaIn('tranare');
  const e = await ok('POST', '/api/evenemang', {
    namn: 'Kretstävling',
    slag: 'tavling',
    start: '2027-01-30',
    sista_anmalan: '2020-01-01',
    avgift_ore: 15000,
  });
  await loggaIn('per');
  const svar = await nekas('POST', `/api/evenemang/${e.id}/anmalan`, {}, 409);
  assert.match(svar.fel || svar.meddelande || JSON.stringify(svar), /2020-01-01/);
  await loggaIn('tranare');
  await ok('POST', `/api/evenemang/${e.id}/anmalan`, { medlem_id: id.per });
});

test('ett inställt evenemang tar inte emot anmälningar', async () => {
  await loggaIn('tranare');
  const e = await ok('POST', '/api/evenemang', { namn: 'Snöfattigt', start: '2027-04-01' });
  await ok('PUT', `/api/evenemang/${e.id}`, { status: 'installt' });
  await loggaIn('per');
  await nekas('POST', `/api/evenemang/${e.id}/anmalan`, {}, 409);
  // Och det syns inte i kommande-listan.
  const lista = await ok('GET', '/api/evenemang');
  assert.ok(!lista.evenemang.some((x) => x.id === e.id));
});

// ---------- samåkning ----------

test('varje medlem får erbjuda plats i bilen, utan behörighet', async () => {
  await loggaIn('per');
  const s = await ok('POST', '/api/samakning', {
    evenemang_id: id.lager,
    fran: 'Härnösand, Coop Maxi',
    avresa: '2027-02-12 06:00',
    platser: 3,
    bil: 'Volvo V90, takbox',
  });
  id.bil = s.id;
  assert.equal(s.jag_kor, true);
  assert.equal(s.platser_kvar, 3);
  await nekas('POST', '/api/samakning', { fran: 'Ingenstans', avresa: '2027-02-12 06:00', platser: 0 }, 400);
  await nekas('POST', '/api/samakning', { fran: 'Buss', avresa: '2027-02-12 06:00', platser: 40 }, 400);
  await nekas('POST', '/api/samakning', { fran: 'Fel tid', avresa: 'imorgon', platser: 2 }, 400);
});

test('kontaktuppgifter syns för föraren och passagerarna, inte för övriga', async () => {
  db.kor('UPDATE medlem SET telefon=? WHERE id=?', '070-1234567', id.per);
  await loggaIn('eva');
  const utanfor = await ok('GET', `/api/samakning/${id.bil}`);
  assert.equal(utanfor.forare_telefon, null, 'den som inte åker med ser inget nummer');

  // Kassören har gott om behörigheter men är inte arrangör, och ska inte
  // se vem som åker vart med vem. Att kvittera avgifter är något annat.
  await loggaIn('kassor');
  assert.equal((await ok('GET', `/api/samakning/${id.bil}`)).forare_telefon, null);
  // Tränaren arrangerar och behöver numren.
  await loggaIn('tranare');
  assert.equal((await ok('GET', `/api/samakning/${id.bil}`)).forare_telefon, '070-1234567');

  await loggaIn('eva');

  await ok('POST', `/api/samakning/${id.bil}/plats`, { pastigning: 'Älandsbro' });
  const inne = await ok('GET', `/api/samakning/${id.bil}`);
  assert.equal(inne.forare_telefon, '070-1234567', 'den som sitter i bilen behöver numret');
  assert.equal(inne.platser_kvar, 2);
  assert.equal(inne.min_plats.pastigning, 'Älandsbro');
});

test('bilen fylls inte över, och föraren bokar inte sig själv', async () => {
  await loggaIn('per');
  await nekas('POST', `/api/samakning/${id.bil}/plats`, {}, 400);
  await ok('POST', `/api/samakning/${id.bil}/plats`, { medlem_id: id.barn });
  await loggaIn('kassor');
  await ok('POST', `/api/samakning/${id.bil}/plats`, {});
  const full = await ok('GET', `/api/samakning/${id.bil}`);
  assert.equal(full.fullt, true);
  await loggaIn('tranare');
  await nekas('POST', `/api/samakning/${id.bil}/plats`, {}, 409);
});

test('platsantalet kan inte krympas under dem som redan bokat', async () => {
  await loggaIn('per');
  const svar = await nekas('PUT', `/api/samakning/${id.bil}`, { platser: 1 }, 409);
  assert.match(JSON.stringify(svar), /3 har redan bokat/);
  await ok('PUT', `/api/samakning/${id.bil}`, { platser: 4 });
  // Och ingen annan än föraren ändrar i bilen.
  await loggaIn('eva');
  await nekas('PUT', `/api/samakning/${id.bil}`, { platser: 8 }, 403);
  await nekas('DELETE', `/api/samakning/${id.bil}`, undefined, 403);
});

test('man avbokar sin egen plats, och föraren kan ställa in resan', async () => {
  await loggaIn('eva');
  const min = (await ok('GET', `/api/samakning/${id.bil}`)).min_plats;
  await loggaIn('barn');
  await nekas('DELETE', `/api/samakning/${id.bil}/plats/${min.id}`, undefined, 403);
  await loggaIn('eva');
  const efter = await ok('DELETE', `/api/samakning/${id.bil}/plats/${min.id}`);
  assert.equal(efter.min_plats, null);
  assert.equal(efter.fullt, false);

  await loggaIn('per');
  const installd = await ok('DELETE', `/api/samakning/${id.bil}`);
  assert.equal(installd.status, 'installd');
  assert.equal(installd.passagerare_att_meddela, 2);
  await loggaIn('barn');
  await nekas('POST', `/api/samakning/${id.bil}/plats`, {}, 409);
  const lista = await ok('GET', '/api/samakning');
  assert.ok(!lista.samakningar.some((s) => s.id === id.bil), 'en inställd resa ligger inte i listan');
});

// ---------- rollvyerna ----------

test('varje roll får sina arbetsytor', async () => {
  const ytorFor = async (anv) => {
    await loggaIn(anv);
    return (await ok('GET', '/api/jag')).medlem.arbetsytor.map((y) => y.nyckel);
  };
  // Kassören hör till styrelsen också – det är samma person i de flesta
  // klubbar, men inte samma arbete, och därför två ytor.
  assert.deepEqual(await ytorFor('kassor'), ['ekonomi', 'styrelse', 'medlem']);
  assert.deepEqual(await ytorFor('tranare'), ['traning', 'medlem']);
  assert.deepEqual(await ytorFor('per'), ['medlem'], 'utan uppdrag finns bara medlemsytan');

  // Och ordförande och sekreterare får olika startsidor, inte samma.
  const { ARBETSYTOR, arbetsytorFor } = await import('../server/behorighet.mjs');
  const med = (slag) => arbetsytorFor({ id: 0, roll: 'medlem', uppdrag: [{ slag }], grupper: [] });
  assert.deepEqual(med('ordforande'), ['ordforande', 'styrelse', 'medlem']);
  assert.deepEqual(med('sekreterare'), ['sekreterare', 'styrelse', 'medlem']);
  assert.deepEqual(med('ledamot'), ['styrelse', 'medlem']);
  assert.notDeepEqual(ARBETSYTOR.ordforande.sidor, ARBETSYTOR.sekreterare.sidor);
});

test('notiserna räknar utläggskön för kassören och avslagen för medlemmen', async () => {
  const { notiser } = await import('../server/notiser.mjs');
  const forening = { moduler: ['utlagg', 'evenemang', 'ekonomi'] };
  const med = (m) => notiser(m, forening);
  const kassor = db.en('SELECT * FROM medlem WHERE anvandarnamn=?', 'kassor');
  const eva = db.en('SELECT * FROM medlem WHERE anvandarnamn=?', 'eva');
  assert.ok(med(kassor).utlagg >= 1, 'kassören ser kön');
  assert.equal(med(eva).utlagg, 1, 'Eva har ett avslag att ta hand om');

  // En obetald avgift till något som ännu inte varit kräver något av Eva.
  assert.equal(med(eva).evenemang, undefined, 'inget obetalt ännu');
  const ev = db.spara('evenemang', { namn: 'Höstläger', start: '2027-09-01', avgift_ore: 50000, status: 'oppet' });
  const anm = db.spara('evenemangsanmalan', { evenemang_id: ev, medlem_id: eva.id, status: 'anmald' });
  assert.equal(med(eva).evenemang, 1, 'obetald avgift till kommande evenemang');

  // Betald, och siffran försvinner – en nolla visas inte.
  db.kor("UPDATE evenemangsanmalan SET betald_tid=datetime('now') WHERE id=?", anm);
  assert.equal(med(eva).evenemang, undefined);
  // Och ett avgiftsfritt evenemang räknas aldrig.
  db.kor('UPDATE evenemang SET avgift_ore=0 WHERE id=?', ev);
  db.kor('UPDATE evenemangsanmalan SET betald_tid=NULL WHERE id=?', anm);
  assert.equal(med(eva).evenemang, undefined, 'avgiftsfritt kräver ingen betalning');
});
