// Vilka ronder som ska göras, och vilka som är försenade.
// Ren funktion över inlästa data – inga frågor mot databasen här.
import { veckonummer } from './tid.mjs';

/** Början på den period som intervallet mäts mot, eller null om ronden inte är schemalagd. */
export function periodstart({ intervall, datum, snopassStart, sasongStart }) {
  const dag = `${datum} 00:00:00`;
  switch (intervall) {
    case 'dagligen':
      return dag;
    case 'veckovis': {
      const d = new Date(`${datum}T12:00:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return `${d.toLocaleDateString('sv-SE')} 00:00:00`;
    }
    case 'sasong':
      return sasongStart ? `${sasongStart} 00:00:00` : null;
    case 'vid_start':
    case 'per_pass':
      // Bara aktuella när snöläggningen är i gång.
      return snopassStart || null;
    default:
      return null;
  }
}

/**
 * Bygger listan över ronder att göra.
 * @param {object} indata
 * @param {Array} indata.mallar        aktiva mallar med punkter
 * @param {Array} indata.utrustning    aktiv utrustning
 * @param {Array} indata.omraden       aktiva områden
 * @param {Array} indata.platser       positioner i backen {id, namn, slag, omrade, maskin}
 * @param {Array} indata.korningar     avslutade körningar {mall_id, utrustning_id, omrade_id, snoplats_id, avslutad}
 * @param {string} indata.datum        dagens datum
 * @param {string|null} indata.snopassStart
 * @param {string|null} indata.sasongStart
 */
export function rondlage({
  mallar, utrustning, omraden, platser = [], korningar, datum, snopassStart, sasongStart,
}) {
  const senasteFor = new Map();
  for (const k of korningar) {
    if (!k.avslutad) continue;
    // En rond på en position räknas på positionen, inte på maskinen: byts
    // kanonen mitt i säsongen ska ronden inte börja om från noll.
    const nyckel = `${k.mall_id}|${k.snoplats_id ? '' : (k.utrustning_id ?? '')}|${k.omrade_id ?? ''}|${k.snoplats_id ?? ''}`;
    const fore = senasteFor.get(nyckel);
    if (!fore || k.avslutad > fore.avslutad) senasteFor.set(nyckel, k);
  }

  const rader = [];
  for (const mall of mallar) {
    const start = periodstart({ intervall: mall.intervall, datum, snopassStart, sasongStart });
    const objekt =
      mall.omfattning === 'utrustningstyp'
        ? utrustning
            .filter((u) => u.typ === mall.utrustningstyp && u.aktiv && u.status !== 'ur_drift')
            .map((u) => ({ slag: 'utrustning', id: u.id, namn: u.namn, omrade: u.omrade }))
        : mall.omfattning === 'snoplats'
          ? platser
              .filter((p) => p.slag === mall.platsslag && p.aktiv !== 0)
              .map((p) => ({
                slag: 'snoplats',
                id: p.id,
                namn: p.namn,
                omrade: p.omrade,
                // Vad som står där i dag – men ronden gäller platsen.
                maskin: p.maskin ?? null,
                utrustning_id: p.utrustning_id ?? null,
                tom: !p.maskin,
              }))
          : mall.omfattning === 'omrade'
            ? omraden
                .filter((o) => o.id === mall.omrade_id && o.aktiv)
                .map((o) => ({ slag: 'omrade', id: o.id, namn: o.namn }))
            : [{ slag: 'allmant', id: null, namn: 'Allmänt' }];

    const poster = objekt.map((o) => {
      const nyckel = `${mall.id}|${o.slag === 'utrustning' ? o.id : ''}|${o.slag === 'omrade' ? o.id : ''}|${o.slag === 'snoplats' ? o.id : ''}`;
      const senaste = senasteFor.get(nyckel) || null;
      const klar = !!(start && senaste && senaste.avslutad >= start);
      return {
        ...o,
        senast: senaste?.avslutad || null,
        senast_av: senaste?.av || null,
        klar,
        // Schemalagd men inte gjord i perioden.
        behovs: !!start && !klar,
      };
    });

    rader.push({
      mall_id: mall.id,
      namn: mall.namn,
      intervall: mall.intervall,
      omfattning: mall.omfattning,
      utrustningstyp: mall.utrustningstyp,
      platsslag: mall.platsslag,
      // Vems rond det är. Medlemmens vy plockar ut just sitt pass ronder.
      position_nyckel: mall.position_nyckel ?? null,
      omrade_id: mall.omrade_id,
      antal_punkter: mall.punkter?.length ?? 0,
      schemalagd: !!start,
      periodstart: start,
      objekt: poster,
      kvar: poster.filter((p) => p.behovs).length,
      klara: poster.filter((p) => p.klar).length,
    });
  }

  rader.sort((a, b) => b.kvar - a.kvar || a.namn.localeCompare(b.namn, 'sv'));
  return {
    datum,
    vecka: veckonummer(datum),
    snopass: !!snopassStart,
    mallar: rader,
    kvar: rader.reduce((a, b) => a + b.kvar, 0),
    klara: rader.reduce((a, b) => a + b.klara, 0),
  };
}
