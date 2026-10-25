// Driftjournal, säkerhetskritiska kontroller och incidenter.
//
// Det här är testerna som ska vara svåra att råka ta bort. De håller fast
// de regler som en app i en skidbacke inte får mjuka upp: en ofullständig
// kontroll får inte se ut som godkänd, en säkerhetsrisk får inte tystna, och
// AI:n får föreslå men aldrig intyga.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const katalog = mkdtempSync(join(tmpdir(), 'hak-drift-'));
process.env.HAK_DB = join(katalog, 'drift.db');
process.env.HAK_PORT = '8463';
process.env.HAK_VARD = '127.0.0.1';
process.env.HAK_EPOST_AV = '0';

const BAS = 'http://127.0.0.1:8463';
let server;
let db;
let kaka = '';
let mall;
let sakerhetspunkt;
let vanligpunkt;

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

before(async () => {
  const modul = await import('../server/index.mjs');
  server = modul.server;
  db = await import('../server/db.mjs');
  const { hasha } = await import('../server/auth.mjs');
  const { spara } = db;

  spara('medlem', { anvandarnamn: 'jonas', namn: 'Jonas', roll: 'anlaggningsansvarig', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'bea', namn: 'Bea Back', roll: 'backansvarig', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('medlem', { anvandarnamn: 'ida', namn: 'Ida', roll: 'medlem', losenordshash: hasha('hemligt'), kompetens: '[]' });
  spara('omrade', { namn: 'Teknikbacken' });
  spara('utrustning', { namn: 'Teknikliften', typ: 'lift', omrade_id: 1 });
  spara('utrustning', { namn: 'Snökanon 4', typ: 'flakt', omrade_id: 1 });
  spara('komponent', { utrustning_id: 2, namn: 'Backventil', slag: 'ventil' });

  mall = spara('checklistmall', {
    namn: 'Liftkontroll inför öppning',
    omfattning: 'utrustningstyp',
    utrustningstyp: 'lift',
    intervall: 'vid_start',
    rondtyp: 'liftkontroll_start',
    kraver_kvittens: 1,
  });
  sakerhetspunkt = spara('checklistpunkt', {
    mall_id: mall, ordning: 0, text: 'Nödstopp fungerar', svarstyp: 'bock',
    obligatorisk: 1, sakerhetskritisk: 1,
  });
  vanligpunkt = spara('checklistpunkt', {
    mall_id: mall, ordning: 1, text: 'Skyltar på plats', svarstyp: 'bock', obligatorisk: 1,
  });
});

after(() => {
  server?.close();
  db?.db.close();
  rmSync(katalog, { recursive: true, force: true });
});

test('en säkerhetskritisk kontroll kan inte viftas bort', async () => {
  await loggaIn('bea');
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mall, utrustning_id: 1 });

  const ejTillamplig = await anrop('PUT', `/api/checklistor/svar/${k.id}/${sakerhetspunkt}`, {
    ej_tillampligt: true,
    motivering: 'hinner inte',
  });
  assert.equal(ejTillamplig.status, 400);
  assert.match(ejTillamplig.kropp.fel, /säkerhetskritisk/i);

  // Inte heller den vanliga vägen förbi: tvinga gäller aldrig säkerheten.
  await ok('PUT', `/api/checklistor/svar/${k.id}/${vanligpunkt}`, { bockad: true });
  const tvingat = await anrop('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {
    tvinga: true,
    motivering: 'vi öppnar ändå',
  });
  assert.equal(tvingat.status, 409);
  assert.match(tvingat.kropp.fel, /Nödstopp fungerar/);
});

test('ej tillämplig kräver en motivering', async () => {
  await loggaIn('bea');
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mall, utrustning_id: 1 });
  const utan = await anrop('PUT', `/api/checklistor/svar/${k.id}/${vanligpunkt}`, { ej_tillampligt: true });
  assert.equal(utan.status, 400);
  const med = await ok('PUT', `/api/checklistor/svar/${k.id}/${vanligpunkt}`, {
    ej_tillampligt: true,
    motivering: 'Skyltarna är nedmonterade för säsongen',
  });
  assert.equal(med.punkter.find((p) => p.id === vanligpunkt).ej_tillampligt, 1);
});

test('en avvikelse på en säkerhetspunkt blir ett säkerhetsärende', async () => {
  await loggaIn('bea');
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mall, utrustning_id: 1 });
  await ok('PUT', `/api/checklistor/svar/${k.id}/${sakerhetspunkt}`, {
    avvikelse: true,
    kommentar: 'Nödstoppet löser inte ut vid test',
  });
  await ok('PUT', `/api/checklistor/svar/${k.id}/${vanligpunkt}`, { bockad: true });
  const klar = await ok('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {});
  assert.equal(klar.korning.status, 'klar');

  const arende = klar.nya_arenden[0];
  assert.equal(arende.allvarlighet, 'sakerhetsrisk');
  assert.equal(arende.prioritet, 1);
  assert.equal(arende.typ, 'risk');

  // Och det går inte att stänga utan att någon skriver vad som gjordes.
  const utanAtgard = await anrop('PUT', `/api/arenden/${arende.id}`, { status: 'atgardad' });
  assert.equal(utanAtgard.status, 400);
  assert.match(utanAtgard.kropp.fel, /åtgärden/i);

  await loggaIn('ida');
  const somMedlem = await anrop('PUT', `/api/arenden/${arende.id}`, {
    status: 'atgardad',
    atgard: 'Jag tror det är okej nu',
  });
  assert.equal(somMedlem.status, 403);

  await loggaIn('bea');
  const stangt = await ok('PUT', `/api/arenden/${arende.id}`, {
    status: 'atgardad',
    atgard: 'Bytt nödstoppsrelä, testat tre gånger med last',
  });
  assert.equal(stangt.status, 'atgardad');
  assert.ok(stangt.handelser.some((h) => h.slag === 'atgard'));
});

test('ofullständig rond avslutas som brist, inte som godkänd', async () => {
  await loggaIn('bea');
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mall, utrustning_id: 1 });
  await ok('PUT', `/api/checklistor/svar/${k.id}/${sakerhetspunkt}`, { bockad: true });

  const utanMotivering = await anrop('POST', `/api/checklistor/korningar/${k.id}/avsluta`, { tvinga: true });
  assert.equal(utanMotivering.status, 400);

  const klar = await ok('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {
    tvinga: true,
    motivering: 'Skyltarna kommer med leveransen i morgon',
  });
  assert.equal(klar.korning.status, 'klar_med_brist');
  assert.equal(klar.korning.brister[0].text, 'Skyltar på plats');

  // Att kvittera en sådan rond som driftklar kräver ett eget ställningstagande.
  const utan = await anrop('POST', `/api/checklistor/korningar/${k.id}/kvittens`, { beslut: 'driftklar' });
  assert.equal(utan.status, 400);
  const kvitterad = await ok('POST', `/api/checklistor/korningar/${k.id}/kvittens`, {
    beslut: 'driftklar',
    anteckning: 'Liften är säker att köra, skyltningen sätts upp i morgon',
  });
  assert.equal(kvitterad.korning.kvittens_beslut, 'driftklar');
  assert.equal(kvitterad.korning.kvittens_av_id, 2);
});

test('appen avgör inte om liften får öppnas – en människa kvitterar', async () => {
  await loggaIn('ida');
  const k = await ok('POST', '/api/checklistor/korningar', { mall_id: mall, utrustning_id: 1 });
  await ok('PUT', `/api/checklistor/svar/${k.id}/${sakerhetspunkt}`, { bockad: true });
  await ok('PUT', `/api/checklistor/svar/${k.id}/${vanligpunkt}`, { bockad: true });

  // Innan ronden är avslutad finns inget att kvittera.
  const forTidigt = await anrop('POST', `/api/checklistor/korningar/${k.id}/kvittens`, { beslut: 'driftklar' });
  assert.equal(forTidigt.status, 409);

  await ok('POST', `/api/checklistor/korningar/${k.id}/avsluta`, {});
  // En medlem får konstatera att något inte är driftklart …
  const ej = await ok('POST', `/api/checklistor/korningar/${k.id}/kvittens`, {
    beslut: 'ej_driftklar',
    anteckning: 'Ovant ljud i drivstationen',
  });
  assert.equal(ej.korning.kvittens_beslut, 'ej_driftklar');
  // … men att ta liften i drift är ett ansvar som kräver behörighet.
  const driftklar = await anrop('POST', `/api/checklistor/korningar/${k.id}/kvittens`, { beslut: 'driftklar' });
  assert.equal(driftklar.status, 403);
});

test('ronden hamnar i driftjournalen utan att någon skriver in den igen', async () => {
  await loggaIn('bea');
  const j = await ok('GET', '/api/drift/journal?slag=rond');
  assert.ok(j.poster.length >= 3, 'varje avslutad rond ska ha en journalpost');
  assert.ok(j.poster.some((p) => /avslutad med brist/.test(p.text)));
  assert.ok(j.poster.every((p) => p.utkast === 0), 'ronder är dokumentation, inte utkast');
});

test('talrapport blir ett utkast som människan får rätta', async () => {
  await loggaIn('bea');
  // AI:n är avstängd i testet: då ska texten finnas kvar och förslaget vara tomt.
  const svar = await ok('POST', '/api/drift/tal', {
    text: 'Gick snöronden, kanon fyra hade isat igen men jag avisade den',
    kalla: 'mobil',
  });
  assert.equal(svar.post.utkast, 1, 'en talrapport är aldrig klar förrän någon bekräftar');
  assert.equal(svar.post.bekraftad, null);
  assert.match(svar.post.transkript, /isat igen/);

  // Utkast räknas inte som journal.
  const bara = await ok('GET', '/api/drift/journal?utkast=nej');
  assert.ok(!bara.poster.some((p) => p.id === svar.post.id));

  const bekraftad = await ok('POST', `/api/drift/journal/${svar.post.id}/bekrafta`, {
    text: 'Avisade snökanon 4, inget kvarstår',
    utrustning_id: 2,
    matvarden: { lufttemp: -4, luftfukt: 72 },
  });
  assert.ok(bekraftad.post.bekraftad);
  assert.equal(bekraftad.post.bekraftad_av, 'Bea Back');
  assert.equal(bekraftad.post.utrustning, 'Snökanon 4');

  // Muntliga mätvärden sparas som mätning med den som bekräftade som avsändare,
  // och wetbulb räknas fram – aldrig gissas.
  const matning = db.en('SELECT * FROM matning WHERE id=?', bekraftad.post.matning_id);
  assert.equal(matning.lufttemp, -4);
  assert.equal(matning.av_id, 2);
  assert.ok(matning.wetbulb < -4 && matning.wetbulb > -10);
  assert.match(matning.anteckning, /muntligt/i);
});

test('en bekräftad journalpost går inte att ta bort', async () => {
  await loggaIn('bea');
  const post = await ok('POST', '/api/drift/journal', { text: 'Sandade trappan vid dalstationen' });
  const r = await anrop('DELETE', `/api/drift/journal/${post.post.id}`);
  assert.equal(r.status, 409);
});

test('AI:n får inte hitta på mätvärden', async () => {
  const { rensaMatvarden } = await import('../server/api/drift.mjs');
  // Orimliga och icke-numeriska värden kastas, inte justeras.
  assert.deepEqual(rensaMatvarden({ lufttemp: -4, luftfukt: 72 }), { lufttemp: -4, luftfukt: 72 });
  assert.deepEqual(rensaMatvarden({ lufttemp: 'okej' }), {});
  assert.deepEqual(rensaMatvarden({ lufttemp: -4, vattentryck: 900 }), { lufttemp: -4 });
  assert.deepEqual(rensaMatvarden({ luftfukt: null }), {});
  assert.deepEqual(rensaMatvarden(undefined), {});
});

test('otydlig utrustning blir en fråga, inte en gissning', async () => {
  const { matchaUtrustning, siffror } = await import('../server/ai.mjs');
  const lista = [
    { id: 1, namn: 'Snökanon 4' },
    { id: 2, namn: 'Snökanon 14' },
    { id: 3, namn: 'Teknikliften' },
  ];
  assert.equal(siffror('Fläkt två'), 'fläkt 2', 'å, ä och ö får inte bryta ordgränsen');
  assert.equal(matchaUtrustning('kanon 4', lista).id, 1);
  // Ute i backen säger man siffran, man skriver den inte.
  assert.equal(matchaUtrustning('kanon fyra', lista).id, 1);
  assert.equal(matchaUtrustning('snökanon fjorton', lista).id, 2);
  assert.equal(matchaUtrustning('snökanon 14', lista).id, 2);
  assert.equal(matchaUtrustning('kanonen', lista), null);
  assert.equal(matchaUtrustning(null, lista), null);
});

test('utrustningen läses ur talet när modellen missar den', async () => {
  const { utrustningITal } = await import('../server/ai.mjs');
  const lista = [
    { id: 1, namn: 'Snökanon 4' },
    { id: 2, namn: 'Lans 4' },
    { id: 3, namn: 'Lans 14' },
    { id: 4, namn: 'Teknikliften' },
    { id: 5, namn: 'Pistmaskin' },
  ];
  assert.equal(utrustningITal('Lans fyra hade isat igen men jag avisade den', lista).id, 2);
  assert.equal(utrustningITal('Teknikliften lät konstigt vid uppstart', lista).id, 4);
  assert.equal(utrustningITal('Pistmaskinen behöver tankas', lista).id, 5);
  // Nämns två objekt ska människan få välja, inte systemet gissa.
  assert.equal(utrustningITal('Både lans 4 och lans 14 läcker', lista), null);
  assert.equal(utrustningITal('Allt ser bra ut', lista), null);
  assert.equal(utrustningITal(null, lista), null);
});

test('känsliga uppgifter går aldrig till en extern modell', async () => {
  const ai = await import('../server/ai.mjs');
  const { instans } = await import('../server/foreningar.mjs');
  process.env.HAK_LLM_NYCKEL = 'test-nyckel';
  const riktig = globalThis.fetch;
  let skickad = null;
  globalThis.fetch = async (url, val) => {
    skickad = JSON.parse(val.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"beskrivning":"x"}' } }] }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    process.env.HAK_AI_MODELL = 'snabb'; // en modell hos en leverantör
    const { instans: _ } = { instans };
    await ai.tolka({ system: 's', text: 't', schema: {}, kanslig: true });
    assert.equal(skickad.model, 'lokal', 'en olycksrapport ska tolkas på maskinen');
    await ai.tolka({ system: 's', text: 't', schema: {} });
    assert.ok(skickad.model, 'vanlig tolkning får använda vald modell');
    // Resonemangsmodeller avvisar temperature, så den skickas aldrig.
    assert.equal(skickad.temperature, undefined);
    assert.ok(skickad.max_completion_tokens > 0);
  } finally {
    globalThis.fetch = riktig;
    delete process.env.HAK_LLM_NYCKEL;
    delete process.env.HAK_AI_MODELL;
  }
});

test('återkommande fel räknas, men slutsatsen lämnas till människan', async () => {
  await loggaIn('jonas');
  for (const i of [1, 2, 3]) {
    const a = await ok('POST', '/api/arenden', {
      titel: `Backventilen läcker (${i})`,
      typ: 'fel',
      utrustning_id: 2,
      beskrivning: 'Samma ventil igen',
    });
    await ok('PUT', `/api/arenden/${a.id}`, { komponent_id: 1, status: 'stangd', kostnad_ore: 45000 });
  }
  const m = await ok('GET', '/api/drift/monster');
  const ventil = m.monster.find((r) => r.komponent === 'Backventil');
  assert.equal(ventil.antal, 3);
  assert.equal(ventil.kostnad_ore, 135000);
  assert.equal(ventil.utred, true, 'tre fel på samma komponent ska föreslås utredas');

  const historik = await ok('GET', '/api/drift/utrustning/2');
  assert.equal(historik.utrustning.namn, 'Snökanon 4');
  assert.equal(historik.komponenter[0].antal_fel, 3);
  assert.ok(historik.arenden.length >= 3);
});

test('incidentrapport döljer personuppgifter för den som inte ska se dem', async () => {
  await loggaIn('jonas');
  const i = await ok('POST', '/api/incidenter', {
    slag: 'gastincident',
    plats: 'Teknikbacken, ojämnt parti vid mellanstationen',
    beskrivning: 'Skidåkare ramlade och fick hjälp av backpersonalen',
    person_namn: 'Testperson Testsson',
    person_kontakt: '070-0000000',
    skada: 'Ont i axeln',
    omrade_id: 1,
  });
  assert.equal(i.incident.person_namn, 'Testperson Testsson');
  assert.equal(i.incident.personuppgifter, 1);
  assert.ok(i.incident.gallras > new Date().toISOString().slice(0, 10));

  // Händelsen syns i journalen – men utan namnet.
  const j = await ok('GET', '/api/drift/journal?slag=incident');
  assert.ok(j.poster.length >= 1);
  assert.ok(!JSON.stringify(j.poster).includes('Testsson'));

  // Backansvarig får arbeta med incidenten men inte se personen.
  await loggaIn('bea');
  const lista = await ok('GET', '/api/incidenter');
  assert.equal(lista.ser_personuppgifter, 0);
  assert.equal(lista.incidenter[0].person_namn, '[skyddad uppgift]');
  const nekad = await anrop('PATCH', `/api/incidenter/${i.incident.id}`, { person_namn: 'Annat namn' });
  assert.equal(nekad.status, 403);
  // Men beskrivningen och uppföljningen får hen röra.
  await ok('PATCH', `/api/incidenter/${i.incident.id}`, { insatser: 'Åkte ner med pulka, ringde anhörig' });

  // En medlem kommer inte in alls.
  await loggaIn('ida');
  const stangt = await anrop('GET', '/api/incidenter');
  assert.equal(stangt.status, 403);
});

test('läsning av en incident lämnar spår, och gallring tar bara personuppgifterna', async () => {
  await loggaIn('jonas');
  const id = db.en('SELECT id FROM incident ORDER BY id LIMIT 1').id;
  await ok('GET', `/api/incidenter/${id}`);
  const med = await ok('GET', `/api/incidenter/${id}`);
  assert.ok(med.atkomst.length >= 2, 'varje läsning loggas');
  assert.ok(med.atkomst.some((a) => a.namn === 'Jonas'));

  const arende = await ok('POST', `/api/incidenter/${id}/arende`, { titel: 'Jämna ut partiet vid mellanstationen' });
  assert.equal(arende.arende.allvarlighet, 'sakerhetsrisk');
  // Personuppgifter följer inte med in i ärendekön som fler ser.
  assert.ok(!JSON.stringify(arende.arende).includes('Testsson'));

  const gallrad = await ok('POST', `/api/incidenter/${id}/gallra`, {});
  assert.equal(gallrad.incident.person_namn, null);
  assert.equal(gallrad.incident.skada, null);
  assert.match(gallrad.incident.beskrivning, /ramlade/, 'händelsen ska finnas kvar');
  assert.ok(gallrad.incident.gallrad);

  const ater = await anrop('PATCH', `/api/incidenter/${id}`, { insatser: 'nytt' });
  assert.equal(ater.status, 409, 'en gallrad incident ändras inte');
});

test('gatewayens fel översätts till något en människa kan göra något av', async () => {
  const { begripligt } = await import('../server/ai.mjs');
  assert.match(
    begripligt('429: {"error":{"message":"No deployments available for selected model, cooldown_list=[...]"}}'),
    /ur funktion.*för hand/i
  );
  assert.match(begripligt('InternalServerError: Context size has been exceeded.'), /för långt/i);
  assert.match(begripligt('429 You have no credits remaining'), /kvot/i);
  assert.match(begripligt('fetch failed'), /går inte att nå/i);
  // Okända fel kapas men behålls, så att de går att felsöka.
  assert.equal(begripligt('nånting ovanligt gick fel'), 'nånting ovanligt gick fel');
});
