// Underhåll och snöplanering över HTTP.
//
// De här testerna håller fast två gränser: en modell får föreslå underhåll
// men aldrig bestämma det, och en skickad förfrågan är inte bemanning.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-uh-'));
process.env.HAK_DB = join(katalog, 'uh.db');
process.env.HAK_PORT = '8465';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';

const BAS = 'http://127.0.0.1:8465';
let server;
let db;
let kaka = '';
let passId;

const anrop = async (metod, stig, kropp) => {
  const r = await fetch(BAS + stig, {
    method: metod,
    headers: { 'content-type': 'application/json', 'x-hak': '1', ...(kaka ? { cookie: kaka } : {}) },
    body: kropp === undefined ? undefined : JSON.stringify(kropp),
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) kaka = sc[0].split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, kropp: typ.includes('json') ? await r.json() : await r.text() };
};
const ok = async (metod, stig, kropp) => {
  const r = await anrop(metod, stig, kropp);
  assert.ok(r.status < 400, `${metod} ${stig} gav ${r.status}: ${JSON.stringify(r.kropp)}`);
  return r.kropp;
};
const loggaIn = (namn) => ok('POST', '/api/logga-in', { anvandarnamn: namn, losenord: 'hemligt' });
const dag = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;

  spara('medlem', { anvandarnamn: 'jonas', namn: 'Jonas', roll: 'anlaggningsansvarig', epost: 'jonas@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'bea', namn: 'Bea', roll: 'backansvarig', epost: 'bea@test', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ida', namn: 'Ida', roll: 'medlem', epost: 'ida@test', telefon: '070-1', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ove', namn: 'Ove', roll: 'medlem', epost: 'ove@test', telefon: '070-2', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('sasong', { namn: 'test', start: dag(-100), slut: dag(200), kvot_timmar: 8, kvot_nattpass: 1, aktiv: 1 });
  spara('omrade', { namn: 'Stora backen' });
  spara('utrustning', { namn: 'Fläkt 2', typ: 'flakt', omrade_id: 1, drifttimmar: 1640 });
  spara('komponent', { utrustning_id: 1, namn: 'Vattenfilter', slag: 'filter' });
  spara('position', { nyckel: 'snolaggning', namn: 'Snöläggning' });
  spara('leverantor', { namn: 'Snökraft AB', telefon: '060-12 34 56' });
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

test('en serviceplan räknar ut när den förfaller', async () => {
  await loggaIn('jonas');
  const p = await ok('POST', '/api/underhall/planer', {
    utrustning_id: 1,
    komponent_id: 1,
    namn: 'Byt vattenfilter',
    intervalltyp: 'drifttimmar',
    intervall: 500,
    senast_timmar: 1200,
  });
  assert.equal(p.plan.status, 'godkand', 'den som skriver in planen själv står för den');
  assert.equal(p.plan.forfall.timmar_kvar, 60);
  assert.equal(p.plan.forfall.uppskattat, true);

  const kalender = await ok('POST', '/api/underhall/planer', {
    utrustning_id: 1,
    namn: 'Smörj oscillationslagret',
    intervalltyp: 'manader',
    intervall: 3,
    senast_utford: dag(-120),
  });
  assert.equal(kalender.plan.lage, 'forsenad');
});

test('manualen tolkas till förslag som ingen får använda förrän de godkänts', async () => {
  await loggaIn('jonas');
  const pdf = readFileSync(new URL('./data/manual.pdf', import.meta.url));
  const d = await ok('POST', '/api/underhall/dokument', {
    utrustning_id: 1,
    namn: 'FK-200 servicemanual',
    fil: `data:application/pdf;base64,${pdf.toString('base64')}`,
  });
  assert.equal(d.dokument.sidor, 2);
  assert.equal(d.las_fel, null);

  // AI:n är avstängd i testet: då ska tolkningen svara ärligt och inte
  // uppfinna servicepunkter.
  const t = await ok('POST', `/api/underhall/dokument/${d.dokument.id}/tolka`, {});
  assert.deepEqual(t.punkter, []);
  assert.match(t.fel, /inte konfigurerad/i);

  // Ett förslag, som om tolkningen lyckats: det får inte räknas förrän
  // någon godkänt det.
  const { spara } = db;
  const forslagId = spara('serviceplan', {
    utrustning_id: 1,
    namn: 'Kontrollera nukleatorernas dimstråle',
    intervalltyp: 'handelse',
    dokument_id: d.dokument.id,
    kallsida: 's. 2',
    kallcitat: '4.3 Kontrollera nukleatorernas dimstrale regelbundet.',
    osaker: 1,
    status: 'forslag',
  });

  const hjul = await ok('GET', '/api/underhall/arshjul');
  assert.ok(
    !hjul.poster.some((p) => p.serviceplan_id === forslagId),
    'ett ogodkänt förslag ska inte ligga i årshjulet'
  );

  // Osäkert intervall måste få ett värde innan planen börjar gälla.
  const utan = await anrop('POST', `/api/underhall/planer/${forslagId}/godkann`, { beslut: 'godkand' });
  assert.equal(utan.status, 400);
  assert.match(utan.kropp.fel, /osäkert/i);

  const godkand = await ok('POST', `/api/underhall/planer/${forslagId}/godkann`, {
    beslut: 'godkand',
    intervalltyp: 'manader',
    intervall: 1,
  });
  assert.equal(godkand.plan.status, 'godkand');
  assert.equal(godkand.plan.osaker, 0);
  assert.equal(godkand.plan.godkand_av, 'Jonas');
  assert.equal(godkand.plan.kallsida, 's. 2', 'källan ska finnas kvar efter godkännande');

  // En medlem får inte godkänna anläggningens underhåll.
  await loggaIn('ida');
  const nekad = await anrop('POST', `/api/underhall/planer/${forslagId}/godkann`, { beslut: 'godkand' });
  assert.equal(nekad.status, 403);
});

test('flera manualer kan läggas in, och går att söka i', async () => {
  await loggaIn('jonas');
  const pdf = readFileSync(new URL('./data/manual.pdf', import.meta.url));
  const bas = `data:application/pdf;base64,${pdf.toString('base64')}`;

  // Klienten skickar en fil i taget; servern ska klara flera i följd.
  for (const namn of ['FK-200 reservdelslista', 'FK-200 elschema'])
    await ok('POST', '/api/underhall/dokument', { namn, fil: bas, utrustning_id: 1, slag: 'ritning' });

  const lista = await ok('GET', '/api/underhall/dokument');
  assert.ok(lista.dokument.length >= 3);
  assert.ok(lista.dokument.every((d) => d.aktuell), 'nya dokument ersätter inte varandra av misstag');

  // Sökningen pekar ut sidan, inte bara dokumentet.
  const tr = await ok('GET', '/api/underhall/dokument/sok?q=nukleator');
  assert.ok(tr.traffar.length >= 1);
  assert.equal(tr.traffar[0].stallen[0].sida, 2, 'underhållsavsnittet står på sida 2');
  assert.match(tr.traffar[0].stallen[0].utdrag, /dimstrale/);

  // Träff på dokumentnamnet räknas också.
  const namntraff = await ok('GET', '/api/underhall/dokument/sok?q=elschema');
  assert.ok(namntraff.traffar.some((x) => x.i_namnet));

  assert.deepEqual((await ok('GET', '/api/underhall/dokument/sok?q=zebrafisk')).traffar, []);
  const kort = await anrop('GET', '/api/underhall/dokument/sok?q=a');
  assert.equal(kort.status, 400, 'en bokstav ger hela manualen som träff – det hjälper ingen');
});

test('en ny version av manualen ersätter men raderar inte den gamla', async () => {
  await loggaIn('jonas');
  const pdf = readFileSync(new URL('./data/manual.pdf', import.meta.url));
  const forsta = db.en(`SELECT id FROM dokument ORDER BY id LIMIT 1`).id;
  const ny = await ok('POST', '/api/underhall/dokument', {
    namn: 'FK-200 servicemanual (2027)',
    fil: `data:application/pdf;base64,${pdf.toString('base64')}`,
    ersatter_id: forsta,
  });
  assert.equal(ny.dokument.version, 2);
  assert.ok(ny.granska_om.length >= 1, 'godkända planer ur den gamla manualen ska granskas om');
  assert.equal(db.en('SELECT aktuell FROM dokument WHERE id=?', forsta).aktuell, 0);
  assert.ok(db.en('SELECT id FROM dokument WHERE id=?', forsta), 'originalet finns kvar');
});

test('kritiskt underhåll flyttas inte för sportlovet, men annat gör det', async () => {
  await loggaIn('jonas');
  await ok('POST', '/api/underhall/perioder', { namn: 'Sportlovet', fran: dag(30), till: dag(37) });

  const kritisk = await ok('POST', '/api/underhall/planer', {
    utrustning_id: 1, namn: 'Besiktning', intervalltyp: 'dagar', intervall: 365, kritisk: true,
  });
  await ok('POST', '/api/underhall/atgarder', { serviceplan_id: kritisk.plan.id, planerad: dag(33) });
  const vanlig = await ok('POST', '/api/underhall/planer', {
    utrustning_id: 1, namn: 'Rengöring', intervalltyp: 'dagar', intervall: 90,
  });
  await ok('POST', '/api/underhall/atgarder', { serviceplan_id: vanlig.plan.id, planerad: dag(33) });

  const hjul = await ok('GET', '/api/underhall/arshjul');
  const k = hjul.poster.find((p) => p.namn === 'Besiktning');
  const v = hjul.poster.find((p) => p.namn === 'Rengöring');
  assert.equal(k.forslag_flytt, null);
  assert.match(k.krock.orsak, /flyttas inte/);
  assert.equal(v.forslag_flytt.till, dag(29), 'flyttas till före perioden');
  assert.equal(v.datum, dag(33), 'men datumet ändras inte av sig självt');

  // Två arbeten på samma enhet nära varandra ska föreslås samordnas.
  assert.ok(hjul.samordna.some((g) => g.poster.length >= 2));
});

test('utförd service flyttar fram planen och syns i journalen', async () => {
  await loggaIn('jonas');
  const plan = db.en(`SELECT * FROM serviceplan WHERE namn='Byt vattenfilter'`);
  const a = await ok('POST', '/api/underhall/atgarder', { serviceplan_id: plan.id, planerad: dag(0) });
  const utford = await ok('POST', `/api/underhall/atgarder/${a.atgard.id}/utford`, {
    kostnad_ore: 45000, arbetstimmar: 1.5, drifttimmar: 1700, anteckning: 'Nytt filter, spolat huset',
  });
  assert.equal(utford.atgard.status, 'utford');

  const efter = db.en('SELECT * FROM serviceplan WHERE id=?', plan.id);
  assert.equal(efter.senast_timmar, 1700);
  assert.equal(db.en('SELECT drifttimmar FROM utrustning WHERE id=1').drifttimmar, 1700);

  const journal = await ok('GET', '/api/drift/journal?slag=atgard');
  assert.ok(journal.poster.some((p) => /Service utförd: Byt vattenfilter/.test(p.text)));
});

test('reservdelar: uttag minskar lagret och kostnaden följer med', async () => {
  await loggaIn('jonas');
  const r = await ok('POST', '/api/underhall/reservdelar', {
    namn: 'Vattenfilter FK-200', artikelnummer: 'SF-90', leverantor_id: 1,
    pris_ore: 25000, lager: 4, minlager: 2, passar: [{ utrustning_id: 1, komponent_id: 1 }],
  });
  const atgard = db.en(`SELECT id FROM serviceatgard WHERE status='utford' LIMIT 1`);
  await ok('POST', `/api/underhall/reservdelar/${r.reservdel.id}/uttag`, {
    antal: 2, serviceatgard_id: atgard.id,
  });
  const lista = await ok('GET', '/api/underhall/reservdelar');
  const del = lista.reservdelar.find((d) => d.id === r.reservdel.id);
  assert.equal(del.lager, 2);
  assert.equal(del.bestall, true, 'lagret är nere på minnivån');
  assert.equal(del.forbrukning_ar, 2);
  assert.equal(del.leverantor, 'Snökraft AB');
  assert.equal(del.telefon, '060-12 34 56', 'numret ska finnas när delen ska beställas');

  // Inleverans fyller på och uppdaterar priset.
  await ok('POST', `/api/underhall/reservdelar/${r.reservdel.id}/uttag`, { antal: -5, pris_ore: 27500 });
  const efter = (await ok('GET', '/api/underhall/reservdelar')).reservdelar.find((d) => d.id === r.reservdel.id);
  assert.equal(efter.lager, 7);
  assert.equal(efter.pris_ore, 27500);
  assert.equal(efter.bestall, false);

  const k = await ok('GET', `/api/underhall/kostnader?fran=${dag(-30)}&till=${dag(1)}`);
  const rad = k.rader.find((x) => x.namn === 'Fläkt 2');
  assert.equal(rad.service_ore, 45000);
  assert.equal(rad.delar_ore, 50000, 'två filter à 250 kr');
  assert.equal(rad.totalt_ore, 95000);
  assert.equal(k.summa.arbetstimmar, 1.5);
});

test('ett prognosfönster blir pass – men ingen bemanning', async () => {
  await loggaIn('bea');
  const f = await ok('POST', '/api/snoplan/fonster', {
    fran: `${dag(2)} 20:00`, till: `${dag(3)} 08:00`, lagsta_wetbulb: -6.2, kalla: 'prognos',
  });
  assert.equal(f.fonster.status, 'forslag');

  const forslag = await ok('POST', `/api/snoplan/fonster/${f.fonster.id}/forslag`, {
    position_id: 1, behov: 2,
  });
  assert.equal(forslag.pass.length, 2);
  assert.equal(forslag.pass.every((p) => !p.finns), true);
  assert.equal(db.en('SELECT count(*) n FROM pass').n, 0, 'förhandsvisningen skriver ingenting');

  const bemannat = await ok('POST', `/api/snoplan/fonster/${f.fonster.id}/bemanna`, {
    position_id: 1, behov: 2,
  });
  assert.equal(bemannat.skapade.length, 2);
  assert.equal(bemannat.fonster.status, 'planerat');
  passId = bemannat.skapade[0].id;

  // Samma fönster två gånger ska inte ge dubbletter.
  const igen = await ok('POST', `/api/snoplan/fonster/${f.fonster.id}/bemanna`, { position_id: 1, behov: 2 });
  assert.equal(igen.skapade.length, 0);
  assert.equal(igen.hoppade.length, 2);

  const underskott = await ok('GET', '/api/snoplan/underskott');
  assert.equal(underskott.summa.platser, 4, 'fyra platser saknar folk');
  assert.equal(underskott.summa.oadresserade, 4, 'och ingen har fått frågan');
});

test('förfrågan är en fråga, svaret är bokningen', async () => {
  await loggaIn('ida');
  await ok('PUT', '/api/snoplan/tillganglighet', { niva: 'garna', nattpass: true });
  await loggaIn('ove');
  await ok('PUT', '/api/snoplan/tillganglighet', { niva: 'vid_brist', nattpass: true });

  await loggaIn('bea');
  const k = await ok(`GET`, `/api/snoplan/pass/${passId}/kandidater`);
  const forst = k.kandidater.filter((x) => x.kan)[0];
  assert.equal(forst.namn, 'Ida', 'den som vill gärna står först');
  assert.equal(k.kandidater.find((x) => x.namn === 'Ove').omgang, 2);

  const skickat = await ok('POST', `/api/snoplan/pass/${passId}/forfragan`, { omgang: 1 });
  assert.ok(skickat.skickade.length >= 1);
  assert.equal(skickat.pass.bokade, 0, 'en skickad fråga är inte bemanning');
  assert.ok(skickat.pass.vantar >= 1);

  // Det som någon fått frågan om larmar inte längre.
  const efter = await ok('GET', '/api/snoplan/underskott');
  assert.ok(efter.summa.oadresserade < 4);

  await loggaIn('ida');
  const mina = await ok('GET', '/api/snoplan/mina-forfragningar');
  assert.equal(mina.forfragningar.length, 1);
  assert.equal(mina.forfragningar[0].lagsta_wetbulb, -6.2, 'varför vi frågar ska synas');

  const svar = await ok('POST', `/api/snoplan/forfragningar/${mina.forfragningar[0].id}/svar`, { ja: true });
  assert.equal(svar.forfragan.status, 'accepterad');
  assert.equal(svar.pass.bokade, 1);

  // Samma fråga går inte att besvara två gånger.
  const igen = await anrop('POST', `/api/snoplan/forfragningar/${mina.forfragningar[0].id}/svar`, { ja: false });
  assert.equal(igen.status, 409);

  // Och ingen annan får svara i ens ställe.
  await loggaIn('ove');
  const annans = await anrop('POST', `/api/snoplan/forfragningar/${mina.forfragningar[0].id}/svar`, { ja: true });
  assert.equal(annans.status, 403);
});

test('dagens bemanning visar telefonnummer bara för den som ska ringa', async () => {
  const datum = db.en('SELECT datum FROM pass WHERE id=?', passId).datum;

  await loggaIn('bea');
  const chefens = await ok('GET', `/api/snoplan/idag?datum=${datum}`);
  const medBemanning = chefens.pass.find((p) => p.bemanning.length);
  assert.equal(chefens.far_ringa, true);
  assert.equal(medBemanning.bemanning[0].telefon, '070-1');

  await loggaIn('ove');
  const medlemmens = await ok('GET', `/api/snoplan/idag?datum=${datum}`);
  assert.equal(medlemmens.far_ringa, false);
  const p = medlemmens.pass.find((x) => x.bemanning.length);
  assert.equal(p.bemanning[0].namn, 'Ida', 'vem som jobbar är inte hemligt');
  assert.equal(p.bemanning[0].telefon, null, 'men numret är inte var mans egendom');
  assert.deepEqual(p.tillfragade, []);
});

test('gästen kan lämna storlekar i förväg – men utprovningen står kvar', async () => {
  // Prislista och en bokning utan inloggning, som i kiosken.
  const { spara } = db;
  spara('hyrespris', { grupp: 'paket', namn: 'Skidpaket', aldersgrupp: 'barn', tid: 'heldag', pris_ore: 25000 });
  kaka = '';
  const pris = db.en(`SELECT id FROM hyrespris LIMIT 1`).id;

  const bokat = await ok('POST', '/api/uthyrning/bokning', {
    rader: [{ hyrespris_id: pris, antal: 2 }],
    mobil: '070-1234567',
    namn: 'Familjen Test',
    besok_datum: dag(3),
    gaster: [
      { namn: 'Nils', alder: 9, langd_cm: 138, vikt_kg: 31, skostorlek: '35', niva: 'nyborjare', onskemal: 'slalom', hjalm: true },
      { namn: 'Siri', alder: 12, langd_cm: 152, vikt_kg: 42, skostorlek: '37', niva: 'van', onskemal: 'twintip' },
    ],
  });
  assert.equal(bokat.gaster.length, 2);
  assert.ok(bokat.anmald);
  assert.equal(bokat.gaster[0].skostorlek, '35');
  assert.equal(bokat.gaster[0].framplockat, false);

  // Ingen bindningsinställning räknas fram någonstans – det är personalens
  // ansvar, och inget fält i systemet påstår något annat.
  assert.ok(!Object.keys(bokat.gaster[0]).some((k) => /din|bindning|insta/i.test(k)));

  // Gästen kan ändra sig via sin egen länk, men inte efter utlämning.
  const andrat = await ok('POST', `/api/uthyrning/avtal/${bokat.nummer}/anmalan?kod=${bokat.kod}`, {
    gaster: [{ namn: 'Nils', skostorlek: '36' }],
  });
  assert.equal(andrat.gaster.length, 1);
  assert.equal(andrat.gaster[0].skostorlek, '36');

  const fel_kod = await anrop('POST', `/api/uthyrning/avtal/${bokat.nummer}/anmalan?kod=fel`, { gaster: [] });
  assert.equal(fel_kod.status, 404);

  // Personalen ser de anmälda och kan markera framplockat.
  await loggaIn('bea');
  const kassa = await ok('GET', '/api/uthyrning/kassa');
  const anmalt = kassa.anmalda.find((a) => a.nummer === bokat.nummer);
  assert.ok(anmalt, 'förhandsanmälda besök ska synas i luckan');
  assert.equal(anmalt.besok_datum, dag(3));
  const gastId = db.en('SELECT id FROM hyresgast ORDER BY id DESC LIMIT 1').id;
  const klar = await ok('POST', `/api/uthyrning/gaster/${gastId}/framplockat`, {});
  assert.equal(klar.gast.framplockat, 1);
});

test('tekniska uppgifter går att redigera i registret', async () => {
  await loggaIn('jonas');
  const ny = await ok('POST', '/api/utrustning', {
    namn: 'Lenko 11', typ: 'flakt', omrade_id: 1, tillverkare: 'Lenko', modell: 'LT10',
    serienummer: 'LK-2026-11', drifttimmar: 0,
  });
  assert.equal(ny.tillverkare, 'Lenko');
  assert.equal(ny.modell, 'LT10');

  const andrad = await ok('PUT', `/api/utrustning/${ny.id}`, { serienummer: 'LK-2026-11B', drifttimmar: 42 });
  assert.equal(andrad.serienummer, 'LK-2026-11B');
  assert.equal(andrad.drifttimmar, 42);

  // En medlem får rapportera drifttimmar men inte ändra stamdata.
  await loggaIn('ida');
  const somMedlem = await ok('PUT', `/api/utrustning/${ny.id}`, { drifttimmar: 50, tillverkare: 'Fel' });
  assert.equal(somMedlem.drifttimmar, 50, 'avläsning är ingen stamdataändring');
  assert.equal(somMedlem.tillverkare, 'Lenko', 'tillverkaren ska vara orörd');
});

/**
 * Uppladdningen med tolkning påslagen. Modellen stubbas: testet ska pröva
 * vad systemet gör med svaret, inte hur bra modellen råkar vara i dag.
 */
test('ett uppladdat dokument säger själv vad det är', async () => {
  await loggaIn('jonas');
  const pdf = readFileSync(new URL('./data/manual.pdf', import.meta.url));
  const riktig = globalThis.fetch;
  process.env.HAK_LLM_NYCKEL = 'test';

  // Första anropet klassificerar dokumentet, andra läser servicepunkterna.
  let anrop = 0;
  const svarMed = (data) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }), {
      headers: { 'content-type': 'application/json' },
    });
  globalThis.fetch = async (url, val) => {
    if (!String(url).includes('/chat/completions')) return riktig(url, val);
    anrop += 1;
    return anrop === 1
      ? svarMed({
          slag: 'manual',
          titel: 'FK-200 servicemanual',
          tillverkare: 'Snökraft',
          modell: 'FK-200',
          utrustningstyp: 'flakt',
          sammanfattning: 'Servicemanual för fläktkanonen FK-200.',
          har_underhall: true,
        })
      : svarMed({
          punkter: [
            {
              namn: 'Byt vattenfilter',
              instruktion: 'var 500 driftstimmar',
              intervalltyp: 'drifttimmar',
              intervall: 500,
              sida: 2,
              citat: '4.1 Byt vattenfilter var 500 driftstimmar.',
            },
            {
              namn: 'Kontrollera nukleatorernas dimstråle',
              intervalltyp: null,
              intervall: null,
              osaker: true,
              sida: 2,
              citat: '4.3 Kontrollera nukleatorernas dimstrale regelbundet.',
            },
            // Utan källa: ska inte sparas, hur rimlig den än låter.
            { namn: 'Smörj allt då och då', intervalltyp: 'manader', intervall: 3 },
          ],
        });
  };

  try {
    // Maskinen finns i registret med samma modell.
    await ok('PUT', '/api/utrustning/1', { tillverkare: 'Snökraft', modell: 'FK-200' });

    // Inget namn skickas med – dokumentet får säga vad det heter.
    const r = await ok('POST', '/api/underhall/dokument', {
      fil: `data:application/pdf;base64,${pdf.toString('base64')}`,
    });
    assert.equal(r.dokument.namn, 'FK-200 servicemanual');
    assert.equal(r.dokument.slag, 'manual');
    assert.match(r.dokument.sammanfattning, /fläktkanonen/i);
    assert.equal(r.foreslagen_utrustning.namn, 'Fläkt 2', 'kopplades till maskinen med samma modell');
    assert.equal(r.dokument.utrustning_id, r.foreslagen_utrustning.id);

    // Servicepunkterna lästes ut i samma steg.
    assert.equal(r.punkter.length, 2, 'punkten utan källhänvisning sparas inte');
    assert.ok(r.punkter.every((p) => p.status === 'forslag'), 'inget gäller förrän någon godkänt det');
    assert.equal(r.punkter[0].kallsida, 's. 2');
    assert.equal(r.punkter.find((p) => /nukleator/i.test(p.namn)).osaker, 1);

    // Förslagen räknas inte i årshjulet.
    const hjul = await ok('GET', '/api/underhall/arshjul');
    const nya = r.punkter.map((p) => p.id);
    assert.ok(!hjul.poster.some((p) => nya.includes(p.serviceplan_id)), 'ogodkända punkter ligger utanför');

    // Samma dokument igen ska inte ge dubbletter av samma punkter.
    anrop = 0;
    const d2 = await ok('POST', `/api/underhall/dokument/${r.dokument.id}/tolka`, {});
    assert.equal(d2.punkter.length, 0, 'punkterna fanns redan');
  } finally {
    globalThis.fetch = riktig;
    delete process.env.HAK_LLM_NYCKEL;
  }
});

test('utan tolkning fungerar uppladdningen ändå', async () => {
  await loggaIn('jonas');
  const pdf = readFileSync(new URL('./data/manual.pdf', import.meta.url));
  // AI:n är avstängd: namnet faller tillbaka på filnamnet, och inget
  // påstås om vad dokumentet är.
  const r = await ok('POST', '/api/underhall/dokument', {
    fil: `data:application/pdf;base64,${pdf.toString('base64')}`,
  });
  assert.equal(r.tolkning, null);
  assert.match(r.tolkning_fel, /inte konfigurerad/i);
  assert.ok(r.dokument.namn.length > 0, 'dokumentet får ett namn ändå');
  assert.equal(r.dokument.slag, 'manual');
  assert.deepEqual(r.punkter, []);
  assert.equal(r.dokument.sidor, 2, 'texten läses oavsett om AI:n svarar');
});

test('otydlig koppling blir ingen koppling', async () => {
  const { matchaDokument } = await import('../server/api/underhall.mjs');
  const lista = [
    { id: 1, namn: 'Lenko 1', typ: 'flakt', tillverkare: 'Lenko', modell: 'LT10' },
    { id: 2, namn: 'Lenko 2', typ: 'flakt', tillverkare: 'Lenko', modell: 'LT10' },
    { id: 3, namn: 'Fläkt 1', typ: 'flakt', tillverkare: 'Snökraft', modell: 'FK-200' },
    { id: 4, namn: 'Stora liften', typ: 'lift', tillverkare: 'Liftservice Nord', modell: null },
  ];
  assert.equal(matchaDokument({ tillverkare: 'Snökraft', modell: 'FK-200' }, lista).id, 3);
  // Tio Lenkor av samma modell: dokumentet gäller dem alla, inte en av dem.
  const flera = matchaDokument({ tillverkare: 'Lenko', modell: 'LT10' }, lista);
  assert.equal(flera.id, undefined, 'ingen enskild maskin pekas ut');
  assert.deepEqual(flera.flera.map((u) => u.namn), ['Lenko 1', 'Lenko 2']);
  assert.equal(matchaDokument({ tillverkare: 'Liftservice Nord' }, lista).id, 4);
  assert.equal(matchaDokument({}, lista), null);
  assert.equal(matchaDokument({ tillverkare: 'Okänd AB' }, lista), null);
});
