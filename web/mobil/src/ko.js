// Ronder lever i telefonen först och skickas till servern när det går.
// En rond är ett dokument, inte en kö av anrop – då överlever den både
// dålig täckning och att appen stängs mitt i.
import { anrop, api, NatverksFel } from './api.js';

const NYCKEL = 'hak-ronder';
const lyssnare = new Set();

export const laddaRonder = () => {
  try {
    return JSON.parse(localStorage.getItem(NYCKEL) || '[]');
  } catch {
    return [];
  }
};

const skriv = (ronder) => {
  localStorage.setItem(NYCKEL, JSON.stringify(ronder));
  for (const l of lyssnare) l(ronder);
};

export const prenumerera = (fn) => {
  lyssnare.add(fn);
  return () => lyssnare.delete(fn);
};

export function nyRond({ mall, utrustning, omrade, snoplats }) {
  const rond = {
    lokalId: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    mall_id: mall.id,
    mallnamn: mall.namn,
    intervall: mall.intervall,
    utrustning_id: utrustning?.id ?? null,
    // Ronden går på positionen; maskinen som står där noteras med.
    snoplats_id: snoplats?.id ?? null,
    objektnamn: snoplats?.namn || utrustning?.namn || omrade?.namn || null,
    maskin: snoplats?.under?.split('·').pop()?.trim() || null,
    omrade_id: omrade?.id ?? utrustning?.omrade_id ?? null,
    kraver_kvittens: mall.kraver_kvittens ? 1 : 0,
    punkter: mall.punkter.map((p) => ({
      id: p.id, text: p.text, hjalptext: p.hjalptext,
      svarstyp: p.svarstyp, enhet: p.enhet, obligatorisk: p.obligatorisk,
      // Säkerhetskritiska punkter måste följa med ned i telefonen, annars
      // kan appen inte hålla regeln offline.
      sakerhetskritisk: p.sakerhetskritisk ? 1 : 0,
    })),
    svar: {},
    startad: new Date().toISOString(),
    klar: false,
    serverId: null,
    skickade: [],
    avslutad: false,
    resultat: null,
    fel: null,
    // Motivering krävs när ronden lämnas med obesvarade obligatoriska punkter.
    motivering: null,
    kvittens: null,
  };
  skriv([rond, ...laddaRonder()]);
  return rond;
}

export const hamtaRond = (lokalId) => laddaRonder().find((r) => r.lokalId === lokalId) || null;

export function uppdateraRond(lokalId, andring) {
  const ronder = laddaRonder().map((r) => (r.lokalId === lokalId ? { ...r, ...andring } : r));
  skriv(ronder);
  return ronder.find((r) => r.lokalId === lokalId);
}

export function sattSvar(lokalId, punktId, svar) {
  const rond = hamtaRond(lokalId);
  if (!rond) return null;
  const nytt = {
    ...rond,
    svar: { ...rond.svar, [punktId]: { ...(rond.svar[punktId] || {}), ...svar, tid: new Date().toISOString() } },
    // ändrat svar måste skickas om
    skickade: rond.skickade.filter((id) => String(id) !== String(punktId)),
  };
  skriv(laddaRonder().map((r) => (r.lokalId === lokalId ? nytt : r)));
  return nytt;
}

export const taBortRond = (lokalId) => skriv(laddaRonder().filter((r) => r.lokalId !== lokalId));

export const obesvarade = (rond) =>
  rond.punkter.filter((p) => {
    const s = rond.svar[p.id];
    return !s || (!s.bockad && s.varde == null && !s.text && !s.avvikelse && !s.ej_tillampligt);
  });

/**
 * Säkerhetskritiska punkter utan svar. De går aldrig att lämna, varken här
 * eller på servern – appen ska säga nej på plats i backen, inte först när
 * täckningen kommer tillbaka.
 */
export const obesvaradSakerhet = (rond) => obesvarade(rond).filter((p) => p.sakerhetskritisk);

/** Obligatoriska punkter utan svar, säkerhetspunkterna undantagna. */
export const obesvaradObligatorisk = (rond) =>
  obesvarade(rond).filter((p) => p.obligatorisk && !p.sakerhetskritisk);

export const antalAvvikelser = (rond) => Object.values(rond.svar).filter((s) => s.avvikelse).length;
export const antalBesvarade = (rond) => rond.punkter.length - obesvarade(rond).length;

let synkarNu = false;

/** Skickar allt som går. Tyst när det inte finns täckning. */
export async function synka() {
  if (synkarNu) return { kvar: laddaRonder().filter((r) => !r.avslutad).length };
  synkarNu = true;
  try {
    for (const rond of laddaRonder()) {
      if (rond.avslutad) continue;
      try {
        await synkaEn(rond.lokalId);
      } catch (e) {
        if (e instanceof NatverksFel) break; // ingen täckning – försök senare
        uppdateraRond(rond.lokalId, { fel: e.message });
      }
    }
  } finally {
    synkarNu = false;
  }
  return { kvar: laddaRonder().filter((r) => !r.avslutad).length };
}

async function synkaEn(lokalId) {
  let rond = hamtaRond(lokalId);
  if (!rond) return;

  if (!rond.serverId) {
    const k = await api.skapa('/api/checklistor/korningar', {
      mall_id: rond.mall_id,
      snoplats_id: rond.snoplats_id,
      utrustning_id: rond.utrustning_id,
      omrade_id: rond.utrustning_id || rond.snoplats_id ? null : rond.omrade_id,
      kalla: 'mobil',
    });
    rond = uppdateraRond(lokalId, { serverId: k.id, fel: null });
  }

  for (const punkt of rond.punkter) {
    const svar = rond.svar[punkt.id];
    if (!svar || rond.skickade.includes(punkt.id)) continue;
    let bild = svar.bild ?? undefined;
    if (bild && bild.startsWith('data:')) {
      const r = await api.skapa('/api/bilder', { data: bild });
      bild = r.bild;
      rond = sattSvar(lokalId, punkt.id, { bild });
    }
    await anrop('PUT', `/api/checklistor/svar/${rond.serverId}/${punkt.id}`, {
      bockad: !!svar.bockad,
      varde: svar.varde ?? null,
      text: svar.text ?? null,
      avvikelse: !!svar.avvikelse,
      kommentar: svar.kommentar ?? null,
      ej_tillampligt: !!svar.ej_tillampligt,
      motivering: svar.motivering ?? null,
      bild: bild ?? null,
    });
    rond = uppdateraRond(lokalId, { skickade: [...hamtaRond(lokalId).skickade, punkt.id], fel: null });
  }

  if (rond.klar) {
    // Luckor i ronden skickas som just luckor, med rapportörens motivering.
    // Appen tvingar aldrig förbi en säkerhetskritisk punkt – kommer en
    // sådan rond ända hit är det ett fel, och servern ska säga nej.
    const brister = obesvaradObligatorisk(rond).length;
    const r = await api.skapa(`/api/checklistor/korningar/${rond.serverId}/avsluta`, {
      // Anteckningen frågades efter i avslutsrutan och ska följa med.
      // Skickas den inte är frågan en lögn.
      anteckning: rond.anteckning ?? null,
      ...(brister ? { tvinga: true, motivering: rond.motivering } : {}),
    });
    if (rond.kvittens)
      await api.skapa(`/api/checklistor/korningar/${rond.serverId}/kvittens`, rond.kvittens);
    uppdateraRond(lokalId, {
      avslutad: true,
      fel: null,
      resultat: {
        arenden: r.nya_arenden.map((a) => ({ id: a.id, titel: a.titel })),
        status: r.korning?.status ?? null,
        tid: new Date().toISOString(),
      },
    });
  }
}

/** Startar bakgrundssynk: vid uppstart, när nätet kommer tillbaka och var 30:e sekund. */
export function startaSynk() {
  const kor = () => synka().catch(() => {});
  kor();
  window.addEventListener('online', kor);
  const timer = setInterval(() => navigator.onLine && kor(), 30000);
  return () => {
    window.removeEventListener('online', kor);
    clearInterval(timer);
  };
}
