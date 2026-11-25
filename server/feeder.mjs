// Status för externa IoT-enheter (väderstation och givare) via Feeder-serverns
// REST-API. Modellerad på vader.mjs: tolkningen är ren och testbar, hämtningen
// cachas i minnet med kort TTL och faller tillbaka på senast hämtade värde när
// nätet strular. Token och bas-URL läses ur miljön och lämnar aldrig servern.
//
// Äkta "sedan start" går inte att få: Feeder kapar timserien till 336 timmar.
// Därför visas "denna månad" exakt (month_bytes) medan dygn och vecka är
// summor över de senaste 24 respektive 168 timmarna.

const BAS = () => (process.env.HAK_FEEDER_URL || 'https://feeder.nattviken.com').replace(/\/$/, '');
const TOKEN = () => process.env.HAK_FEEDER_TOKEN || '';
const TTL_SEKUNDER = Number(process.env.HAK_FEEDER_TTL || 30);

/** Unix-sekunder till svensk lokaltid "YYYY-MM-DD HH:MM:SS", som resten av appen läser. */
const SVENSK = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
export function svenskTid(sek) {
  if (sek == null || sek === 0) return null;
  const d = new Date(sek * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(SVENSK.formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// ---- ren tolkning (ingen nätverk – testbar) ----

/** Summerar byte och meddelanden över de timmar Feeder lämnar i ett traffic-svar. */
export function summeraTrafik(trafik) {
  const timmar = trafik?.hours || [];
  let byte = 0;
  let meddelanden = 0;
  for (const h of timmar) {
    byte += (h.bytes_in || 0) + (h.bytes_out || 0);
    meddelanden += (h.msgs_in || 0) + (h.msgs_out || 0);
  }
  return { byte, meddelanden, timmar: timmar.length };
}

/** Är enheten online? Feeder räknar last_seen < 900 s som online. */
const arOnline = (sen_sekunder) => sen_sekunder != null && sen_sekunder < 900;

/** Rå enhetslista → vyobjekt med sammanfattad tillgänglighet. */
export function tolkaLista(enheter, nu = Date.now()) {
  return (Array.isArray(enheter) ? enheter : []).map((d) => {
    const sen = d.last_seen ? Math.max(0, Math.round(nu / 1000 - d.last_seen)) : null;
    return {
      device_id: d.device_id,
      etikett: d.label || d.device_id,
      fw_version: d.fw_version ?? null,
      last_seen: svenskTid(d.last_seen),
      sen_sekunder: sen,
      online: arOnline(sen),
      created_at: svenskTid(d.created_at),
      service_until: d.service_until ? svenskTid(d.service_until) : null,
    };
  });
}

/**
 * Slår ihop de olika Feeder-svaren för en enhet till ett vyobjekt.
 * Telemetrin kommer nyast först; historiken vänds till äldst först så den
 * kan ritas rakt av i en linjegraf.
 */
export function tolkaEnhet({
  detalj = {}, telemetri = [], batteri = null, positioner = [],
  trafik_dygn = null, trafik_vecka = null, nu = Date.now(),
} = {}) {
  const tele = Array.isArray(telemetri) ? telemetri : [];
  const senaste = tele[0] || null;
  const last_seen = detalj?.last_seen ?? null;
  const sen = last_seen ? Math.max(0, Math.round(nu / 1000 - last_seen)) : null;
  const online = typeof detalj?.online === 'boolean' ? detalj.online : arOnline(sen);

  const historik = tele
    .filter((r) => r && r.ts != null)
    .slice()
    .reverse()
    .map((r) => ({
      ts: r.ts,
      tid: svenskTid(r.ts),
      temperatur: r.temperature ?? null,
      fukt: r.humidity ?? null,
      battery_mv: r.battery_mv ?? null,
      rssi: r.rssi ?? null,
      power: r.power ?? null,
    }));
  const medTemp = historik.filter((r) => r.temperatur != null);

  const pos = (Array.isArray(positioner) ? positioner : []).find((p) => p && p.lat != null && p.lon != null) || null;

  const manad_byte = trafik_vecka?.month_bytes ?? trafik_dygn?.month_bytes ?? null;
  const manad_budget = trafik_vecka?.month_budget_bytes ?? trafik_dygn?.month_budget_bytes ?? null;

  return {
    device_id: detalj?.device_id ?? null,
    etikett: detalj?.label || detalj?.device_id || null,
    fw_version: detalj?.fw_version ?? null,
    created_at: svenskTid(detalj?.created_at),
    service_until: detalj?.service_until ? svenskTid(detalj.service_until) : null,
    online,
    last_seen: svenskTid(last_seen),
    sen_sekunder: sen,
    lank: { typ: detalj?.link ?? null, via: detalj?.link_via ?? null, rssi: detalj?.link_rssi ?? null },
    // El- eller batteridrift ur senaste telemetrin.
    drift: senaste?.power ?? null,
    batteri: batteri
      ? {
          tillstand: batteri.state ?? null,
          text: batteri.text ?? null,
          procent: batteri.percent ?? null,
          mv: batteri.mv ?? senaste?.battery_mv ?? null,
          trend_mv_per_h: batteri.trend_mv_per_h ?? null,
        }
      : senaste?.battery_mv != null
        ? { tillstand: null, text: null, procent: null, mv: senaste.battery_mv, trend_mv_per_h: null }
        : null,
    temperatur: medTemp.length
      ? { varde: medTemp.at(-1).temperatur, fukt: medTemp.at(-1).fukt, tid: medTemp.at(-1).tid }
      : null,
    position: pos
      ? {
          lat: pos.lat,
          lon: pos.lon,
          noggrannhet: pos.accuracy_m ?? pos.accuracy ?? null,
          kalla: pos.source ?? null,
          tid: svenskTid(pos.ts),
        }
      : null,
    telemetri: historik,
    datamangd: {
      dygn_byte: summeraTrafik(trafik_dygn).byte,
      dygn_meddelanden: summeraTrafik(trafik_dygn).meddelanden,
      vecka_byte: summeraTrafik(trafik_vecka).byte,
      vecka_meddelanden: summeraTrafik(trafik_vecka).meddelanden,
      manad_byte,
      manad_budget_byte: manad_budget,
      andel_manad: manad_byte != null && manad_budget ? Math.round((manad_byte / manad_budget) * 1000) / 10 : null,
      overhead_note: trafik_vecka?.overhead_note ?? trafik_dygn?.overhead_note ?? null,
    },
  };
}

// ---- hämtning och cache ----
const cache = new Map();

/**
 * Hämtar en Feeder-slutpunkt med bärartoken. Svaret cachas per sökväg med kort
 * TTL. Vid fel återlämnas senast cachade värde om det finns; annars kastas
 * (krävs) eller återlämnas null (valfri slutpunkt som positions/battery).
 */
async function hamtaJson(stig, { kravs = true } = {}) {
  if (!TOKEN()) throw new Error('Feeder-token saknas (HAK_FEEDER_TOKEN)');
  const sparad = cache.get(stig);
  if (sparad && Date.now() - sparad.hamtad < TTL_SEKUNDER * 1000) return sparad.data;
  try {
    const svar = await fetch(`${BAS()}${stig}`, {
      headers: { authorization: `Bearer ${TOKEN()}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!svar.ok) throw new Error(`Feeder svarade ${svar.status} på ${stig}`);
    const data = await svar.json();
    cache.set(stig, { hamtad: Date.now(), data });
    return data;
  } catch (e) {
    if (sparad) return sparad.data;
    if (kravs) throw e;
    return null;
  }
}

/** Bygger ett helt enhetsvyobjekt. Historiklängden styrs av anroparen. */
async function byggEnhet(id, { telemetriAntal = 6, positionsAntal = 1 } = {}) {
  const sok = encodeURIComponent(id);
  const [detalj, telemetri, batteri, positioner, trafik_dygn, trafik_vecka] = await Promise.all([
    hamtaJson(`/api/v1/devices/${sok}`),
    hamtaJson(`/api/v1/devices/${sok}/telemetry?limit=${telemetriAntal}`, { kravs: false }),
    hamtaJson(`/api/v1/devices/${sok}/battery`, { kravs: false }),
    hamtaJson(`/api/v1/devices/${sok}/positions?limit=${positionsAntal}`, { kravs: false }),
    hamtaJson(`/api/v1/devices/${sok}/traffic?hours=24`, { kravs: false }),
    hamtaJson(`/api/v1/devices/${sok}/traffic?hours=168`, { kravs: false }),
  ]);
  return tolkaEnhet({ detalj, telemetri, batteri, positioner, trafik_dygn, trafik_vecka });
}

/** Enhetslistan med sammanfattad status per enhet. */
export async function enheter() {
  const lista = await hamtaJson('/api/v1/devices');
  const ids = (Array.isArray(lista) ? lista : []).map((d) => d.device_id);
  const detaljer = await Promise.all(ids.map((id) => byggEnhet(id, { telemetriAntal: 24, positionsAntal: 1 }).catch(() => null)));
  return {
    kalla: BAS(),
    uppdaterad: new Date().toISOString(),
    enheter: detaljer.filter(Boolean),
  };
}

/** En enhet i detalj, med längre telemetri- och positionshistorik. */
export async function enhet(id) {
  const data = await byggEnhet(id, { telemetriAntal: 200, positionsAntal: 50 });
  return { kalla: BAS(), uppdaterad: new Date().toISOString(), enhet: data };
}
