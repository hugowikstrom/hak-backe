// Snabb genomlysning av API:et mot en tillfällig server.
const BAS = process.env.BAS || 'http://127.0.0.1:8121';
let kaka = '';
const anrop = async (metod, stig, kropp) => {
  const r = await fetch(BAS + stig, {
    method: metod,
    headers: { 'content-type': 'application/json', 'x-hak': '1', ...(kaka ? { cookie: kaka } : {}) },
    body: kropp ? JSON.stringify(kropp) : undefined,
  });
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) kaka = sc[0].split(';')[0];
  const t = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
  return { status: r.status, kropp: t };
};
const visa = (m, s, r) => console.log(`${String(r.status).padEnd(4)} ${m} ${s}  ${JSON.stringify(r.kropp).slice(0, 150)}`);
const kolla = async (m, s, k) => { const r = await anrop(m, s, k); visa(m, s, r); if (r.status >= 400) process.exitCode = 1; return r.kropp; };

await kolla('POST', '/api/logga-in', { anvandarnamn: 'jonas', losenord: 'hak' });
await kolla('GET', '/api/jag');
await kolla('GET', '/api/oversikt');
await kolla('GET', '/api/sno/nulage');
await kolla('GET', '/api/sno/matningar?antal=3');
const m = await kolla('POST', '/api/sno/matningar', { lufttemp: -6.5, luftfukt: 65, vattenflode: 7, utrustning_id: 2 });
console.log('   våtkula:', m.vatkula, m.klartecken?.niva);
await kolla('GET', '/api/checklistor/mallar');
const mallar = await kolla('GET', '/api/checklistor/for?utrustning_id=1');
const k = await kolla('POST', '/api/checklistor/korningar', { mall_id: mallar[0].id, utrustning_id: 1 });
for (const p of k.punkter) await anrop('PUT', `/api/checklistor/svar/${k.id}/${p.id}`, { bockad: true, varde: p.svarstyp === 'varde' ? 30 : undefined });
const avv = k.punkter[2];
await kolla('PUT', `/api/checklistor/svar/${k.id}/${avv.id}`, { bockad: false, avvikelse: true, kommentar: 'Spricka i slangen' });
const klar = await kolla('POST', `/api/checklistor/korningar/${k.id}/avsluta`, { tvinga: true });
console.log('   nya ärenden från avvikelse:', klar.nya_arenden.map((a) => a.id));
await kolla('GET', '/api/arenden?status=oppna');
const a = await kolla('POST', '/api/arenden', { titel: 'Test: isbildning vid lans 2', prioritet: 2, allvarlighet: 'driftstopp', utrustning_id: 2, tilldelad_id: 5 });
await kolla('PUT', `/api/arenden/${a.id}`, { status: 'pagar' });
await kolla('POST', `/api/arenden/${a.id}/handelse`, { slag: 'atgard', text: 'Tinade med varmluft' });
await kolla('GET', '/api/bemanning/rutnat');
await kolla('GET', '/api/bemanning/mina');
await kolla('GET', '/api/bemanning/lage?alla=1');
const plan = await kolla('POST', '/api/bemanning/autoplan', { torrkor: true });
console.log(`   förslag: ${plan.tilldelningar.length} tilldelningar, ${plan.otillsatta.length} otillsatta, spridning:`, plan.spridning);
await kolla('GET', '/api/rapport/samlad');
await kolla('GET', '/api/medlemmar');
await kolla('GET', '/api/utrustning');
const ut = await kolla('POST', '/api/bemanning/utskick', { fran: new Date().toLocaleDateString('sv-SE'), bara_under_kvot: true });
console.log(`   utskick: ${ut.skickade}/${ut.antal} skickade`);
await kolla('POST', '/api/logga-ut');
const nekad = await anrop('GET', '/api/oversikt');
visa('GET', '/api/oversikt (utloggad, ska vara 401)', nekad);
if (nekad.status !== 401) process.exitCode = 1;
console.log(process.exitCode ? 'MISSLYCKADES' : 'ALLT OK');
