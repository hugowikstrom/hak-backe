// Väderprognos för backen från två källor: YR (met.no) och SMHI.
// Tolkningen är ren och testbar; hämtningen cachas, för båda tjänsterna
// ber uttryckligen om att man inte frågar oftare än prognosen uppdateras.
import { klartecken, wetbulb } from './snoteknik.mjs';

/** Vårdkasbacken i Härnösand. Går att flytta med HAK_PLATS=lat,lon,hojd. */
export const PLATS = (() => {
  const [lat, lon, hojd] = (process.env.HAK_PLATS || '62.627,17.914,170').split(',').map(Number);
  return { namn: 'Vårdkasbacken', lat, lon, hojd: hojd || 0 };
})();

const AGENT = process.env.HAK_VADER_AGENT || 'HAK-Backe/1.0 (+https://hak.nattviken.com)';
const TTL_MINUTER = Number(process.env.HAK_VADER_TTL || 30);

const KALLOR = {
  yr: {
    namn: 'YR (met.no)',
    url: () =>
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${PLATS.lat}&lon=${PLATS.lon}&altitude=${Math.round(PLATS.hojd)}`,
    huvuden: { 'user-agent': AGENT, accept: 'application/json' },
    tolka: tolkaYr,
  },
  smhi: {
    namn: 'SMHI',
    url: () =>
      `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${PLATS.lon}/lat/${PLATS.lat}/data.json`,
    huvuden: { 'user-agent': AGENT, accept: 'application/json' },
    tolka: tolkaSmhi,
  },
};

/**
 * Prognoserna kommer i UTC. Allt i appen räknas i svensk lokaltid, annars
 * hamnar nattens produktionsfönster på fel dygn. Formen "YYYY-MM-DD HH:00"
 * sorterar och jämförs som text och läses som lokal tid av klienten.
 */
const SVENSK = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
export const lokalTimme = (nar) => {
  const d = nar instanceof Date ? nar : new Date(nar);
  if (Number.isNaN(d.getTime())) return null;
  const delar = Object.fromEntries(SVENSK.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${delar.year}-${delar.month}-${delar.day} ${delar.hour}:00`;
};
const timme = lokalTimme;

/** YR: instant-värden per tidsteg, nederbörd i next_1_hours. */
export function tolkaYr(json) {
  const serie = json?.properties?.timeseries || [];
  return serie
    .map((s) => {
      const d = s.data?.instant?.details || {};
      if (d.air_temperature == null) return null;
      return {
        tid: timme(s.time),
        temp: d.air_temperature,
        fukt: d.relative_humidity ?? null,
        vind: d.wind_speed ?? null,
        vindriktning: d.wind_from_direction ?? null,
        tryck: d.air_pressure_at_sea_level ?? null,
        moln: d.cloud_area_fraction ?? null,
        nederbord: s.data?.next_1_hours?.details?.precipitation_amount ?? s.data?.next_6_hours?.details?.precipitation_amount ?? null,
        symbol: s.data?.next_1_hours?.summary?.symbol_code ?? s.data?.next_6_hours?.summary?.symbol_code ?? null,
      };
    })
    .filter(Boolean);
}

/** SMHI SNOW1gv1: platt dataobjekt per tidsteg. */
export function tolkaSmhi(json) {
  const serie = json?.timeSeries || json?.timeseries || [];
  return serie
    .map((s) => {
      const d = s.data || {};
      if (d.air_temperature == null) return null;
      return {
        tid: timme(s.time || s.validTime),
        temp: d.air_temperature,
        fukt: d.relative_humidity ?? null,
        vind: d.wind_speed ?? null,
        vindriktning: d.wind_from_direction ?? null,
        tryck: d.air_pressure_at_mean_sea_level ?? null,
        moln: d.cloud_area_fraction ?? null,
        nederbord: d.precipitation_amount_mean_deterministic ?? d.precipitation_amount_mean ?? null,
        symbol: d.symbol_code ?? null,
      };
    })
    .filter(Boolean);
}

const medel = (v) => {
  const t = v.filter((x) => x != null);
  return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
};
const avrunda = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * Slår ihop källorna timme för timme och räknar wetbulb på varje.
 * Finns båda källorna blir samlingsvärdet medelvärdet av dem.
 */
export function slaIhop(serier) {
  const timmar = new Map();
  for (const [kalla, punkter] of Object.entries(serier)) {
    for (const p of punkter) {
      if (!timmar.has(p.tid)) timmar.set(p.tid, { tid: p.tid, kallor: {} });
      timmar.get(p.tid).kallor[kalla] = { ...p, wetbulb: wetbulb(p.temp, p.fukt, p.tryck ?? undefined) };
    }
  }
  return [...timmar.values()]
    .sort((a, b) => a.tid.localeCompare(b.tid))
    .map((t) => {
      const lista = Object.values(t.kallor);
      const temp = avrunda(medel(lista.map((k) => k.temp)));
      const fukt = avrunda(medel(lista.map((k) => k.fukt)), 0);
      const tryck = avrunda(medel(lista.map((k) => k.tryck)), 0);
      const vk = avrunda(medel(lista.map((k) => k.wetbulb)));
      return {
        tid: t.tid,
        temp,
        fukt,
        tryck,
        vind: avrunda(medel(lista.map((k) => k.vind))),
        vindriktning: avrunda(medel(lista.map((k) => k.vindriktning)), 0),
        nederbord: avrunda(medel(lista.map((k) => k.nederbord)), 1),
        symbol: lista[0]?.symbol ?? null,
        wetbulb: vk,
        klartecken: klartecken(vk),
        // Hur mycket källorna skiljer sig – stor spridning betyder osäker prognos.
        spridning: lista.length > 1 ? avrunda(Math.max(...lista.map((k) => k.wetbulb)) - Math.min(...lista.map((k) => k.wetbulb))) : 0,
        kallor: Object.fromEntries(
          Object.entries(t.kallor).map(([k, v]) => [k, { temp: v.temp, fukt: v.fukt, wetbulb: avrunda(v.wetbulb), vind: v.vind }])
        ),
      };
    });
}

/** Sammanhängande perioder där wetbulbn tillåter produktion. */
export function produktionsfonster(punkter, gran = -2.5) {
  const ut = [];
  let nu = null;
  for (const p of punkter) {
    const duger = p.wetbulb != null && p.wetbulb < gran;
    if (duger && !nu) nu = { fran: p.tid, till: p.tid, lagsta: p.wetbulb, timmar: 1 };
    else if (duger) {
      nu.till = p.tid;
      nu.lagsta = Math.min(nu.lagsta, p.wetbulb);
      nu.timmar += 1;
    } else if (nu) {
      ut.push(nu);
      nu = null;
    }
  }
  if (nu) ut.push(nu);
  return ut.map((f) => ({ ...f, lagsta: avrunda(f.lagsta) }));
}

/** Dygn för dygn: spann, produktionstimmar och hur kallt det blir. */
export function dygnssammanfattning(punkter) {
  const dagar = new Map();
  for (const p of punkter) {
    const dag = p.tid.slice(0, 10);
    if (!dagar.has(dag)) dagar.set(dag, { datum: dag, punkter: [] });
    dagar.get(dag).punkter.push(p);
  }
  return [...dagar.values()].map((d) => {
    const temp = d.punkter.map((p) => p.temp).filter((v) => v != null);
    const vk = d.punkter.map((p) => p.wetbulb).filter((v) => v != null);
    const produktion = d.punkter.filter((p) => p.wetbulb != null && p.wetbulb < -2.5).length;
    const bra = d.punkter.filter((p) => p.wetbulb != null && p.wetbulb < -5).length;
    return {
      datum: d.datum,
      timmar: d.punkter.length,
      temp_min: temp.length ? Math.min(...temp) : null,
      temp_max: temp.length ? Math.max(...temp) : null,
      wetbulb_min: vk.length ? avrunda(Math.min(...vk)) : null,
      wetbulb_medel: avrunda(medel(vk)),
      produktionstimmar: produktion,
      bra_timmar: bra,
      nederbord: avrunda(d.punkter.reduce((a, b) => a + (b.nederbord || 0), 0), 1),
      // Timmarna är inte alltid heltäckande längre fram i prognosen.
      tackning: d.punkter.length >= 20 ? 'hel' : 'gles',
    };
  });
}

/** Klipper serien till ett antal timmar framåt från nu. */
export const fonster = (punkter, timmar, nu = new Date()) => {
  const start = lokalTimme(new Date(nu.getTime() - 3600e3));
  const slut = lokalTimme(new Date(nu.getTime() + timmar * 3600e3));
  return punkter.filter((p) => p.tid >= start && p.tid <= slut);
};

// ---- hämtning och cache ----
const cache = new Map();

async function hamtaKalla(nyckel) {
  const k = KALLOR[nyckel];
  const sparad = cache.get(nyckel);
  if (sparad && Date.now() - sparad.hamtad < TTL_MINUTER * 60e3) return sparad;
  try {
    const svar = await fetch(k.url(), { headers: k.huvuden, signal: AbortSignal.timeout(15000) });
    if (!svar.ok) throw new Error(`${k.namn} svarade ${svar.status}`);
    const punkter = k.tolka(await svar.json());
    if (!punkter.length) throw new Error(`${k.namn} gav inga tidsteg`);
    const ny = { nyckel, namn: k.namn, hamtad: Date.now(), punkter, fel: null };
    cache.set(nyckel, ny);
    return ny;
  } catch (e) {
    const fel = { nyckel, namn: k.namn, hamtad: sparad?.hamtad ?? 0, punkter: sparad?.punkter ?? [], fel: String(e.message || e) };
    if (sparad) cache.set(nyckel, { ...sparad, fel: fel.fel });
    return fel;
  }
}

/** Hela prognosen: timserie, fönster och dygn. */
export async function prognos({ tvinga = false } = {}) {
  if (tvinga) cache.clear();
  const hamtade = await Promise.all(Object.keys(KALLOR).map(hamtaKalla));
  const serier = Object.fromEntries(hamtade.filter((h) => h.punkter.length).map((h) => [h.nyckel, h.punkter]));
  const punkter = Object.keys(serier).length ? slaIhop(serier) : [];
  const nu = new Date();

  const horisont = (timmar) => {
    const del = fonster(punkter, timmar, nu);
    return {
      timmar,
      punkter: del,
      fonster: produktionsfonster(del),
      produktionstimmar: del.filter((p) => p.wetbulb != null && p.wetbulb < -2.5).length,
      kallast: del.length ? Math.min(...del.map((p) => p.wetbulb ?? 99)) : null,
    };
  };

  return {
    plats: PLATS,
    uppdaterad: new Date().toISOString(),
    kallor: hamtade.map((h) => ({
      nyckel: h.nyckel, namn: h.namn, fel: h.fel,
      hamtad: h.hamtad ? new Date(h.hamtad).toISOString() : null,
      tidsteg: h.punkter.length,
    })),
    nu: punkter.find((p) => p.tid >= lokalTimme(new Date(nu.getTime() - 3600e3))) || null,
    h4: horisont(4),
    h12: horisont(12),
    h48: horisont(48),
    vecka: {
      dygn: dygnssammanfattning(fonster(punkter, 24 * 7, nu)),
      fonster: produktionsfonster(fonster(punkter, 24 * 7, nu)),
    },
  };
}
