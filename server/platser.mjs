// Positioner i backen och maskinerna som står där.
//
// Skillnaden är hela poängen. "Lans 4" är en plats: vattenuttaget, elen och
// slangdragningen sitter där och flyttar sig inte. Maskinen som står på
// platsen är något annat – en V3-lans i dag, en Nessy nästa vecka.
//
// Därför kan ett fel sitta på två ställen, och de ska följas åt olika håll:
// ett trasigt vattenuttag stannar på platsen, ett läckande munstycke följer
// med maskinen när den flyttas.
import { alla, en, spara, transaktion, uppdatera } from './db.mjs';
import { nu } from './tid.mjs';

export const PLATSSLAG = ['lans', 'flakt', 'annat'];

/** Databasnycklar utan diakriter; texten folk läser har dem. */
export const PLATSSLAGNAMN = { lans: 'lans', flakt: 'fläktkanon', annat: 'annan utrustning' };
export const UTRUSTNINGSSLAGNAMN = { lans: 'lans', flakt: 'fläktkanon' };

/** Vad som står på platsen just nu, eller vid en viss tidpunkt. */
export function maskinPa(snoplats_id, tid = null) {
  return en(
    `SELECT u.*, s.fran AS uppstalld, s.id AS uppstallning_id
       FROM uppstallning s JOIN utrustning u ON u.id=s.utrustning_id
      WHERE s.snoplats_id=?
        ${tid ? 'AND s.fran <= ? AND (s.till IS NULL OR s.till > ?)' : 'AND s.till IS NULL'}
      ORDER BY s.fran DESC LIMIT 1`,
    snoplats_id,
    ...(tid ? [tid, tid] : [])
  );
}

/** Var en maskin står just nu. */
export const platsFor = (utrustning_id) =>
  en(
    `SELECT p.*, s.fran AS uppstalld FROM uppstallning s JOIN snoplats p ON p.id=s.snoplats_id
      WHERE s.utrustning_id=? AND s.till IS NULL ORDER BY s.fran DESC LIMIT 1`,
    utrustning_id
  );

/** Platserna med vad som står på dem. */
export const platser = ({ slag, aktiv = true } = {}) =>
  alla(
    `SELECT p.*, o.namn AS omrade FROM snoplats p
       LEFT JOIN omrade o ON o.id=p.omrade_id
      WHERE 1=1 ${aktiv ? 'AND p.aktiv=1' : ''} ${slag ? 'AND p.slag=?' : ''}
      ORDER BY p.slag, p.ordning, p.nummer, p.namn`,
    ...(slag ? [slag] : [])
  ).map((p) => {
    const maskin = maskinPa(p.id);
    return {
      ...p,
      utrustning_id: maskin?.id ?? null,
      maskin: maskin?.namn ?? null,
      maskin_typ: maskin?.typ ?? null,
      maskin_tillverkare: maskin?.tillverkare ?? null,
      maskin_modell: maskin?.modell ?? null,
      maskin_status: maskin?.status ?? null,
      uppstalld: maskin?.uppstalld ?? null,
      // En tom plats är inte ett fel – den kan vara avstängd för säsongen.
      tom: !maskin,
    };
  });

/**
 * Ställer upp en maskin på en plats.
 *
 * Både platsen och maskinen kan bara vara på ett ställe: står något annat
 * på platsen flyttas det av, och stod maskinen någon annanstans lämnar den
 * den platsen. Båda flyttarna skrivs i historiken.
 */
export function stallUpp({ snoplats_id, utrustning_id, av_id = null, anteckning = null, tid = null }) {
  const nar = tid || nu();
  return transaktion(() => {
    const avflyttade = [];
    for (const rad of alla(
      `SELECT * FROM uppstallning WHERE till IS NULL AND (snoplats_id=? OR utrustning_id=?)`,
      snoplats_id,
      utrustning_id
    )) {
      // Redan uppställd på rätt plats: rör ingenting.
      if (rad.snoplats_id === Number(snoplats_id) && rad.utrustning_id === Number(utrustning_id))
        return { uppstallning: rad, avflyttade: [], oforandrad: true };
      uppdatera('uppstallning', rad.id, { till: nar });
      avflyttade.push(rad);
    }
    const id = spara('uppstallning', {
      snoplats_id: Number(snoplats_id),
      utrustning_id: Number(utrustning_id),
      fran: nar,
      av_id,
      anteckning,
    });
    return {
      uppstallning: en('SELECT * FROM uppstallning WHERE id=?', id),
      avflyttade,
      oforandrad: false,
    };
  });
}

/** Tar bort maskinen från platsen utan att sätta dit en ny. */
export function platsTom(snoplats_id, { tid = null } = {}) {
  const rad = en('SELECT * FROM uppstallning WHERE snoplats_id=? AND till IS NULL', snoplats_id);
  if (!rad) return null;
  uppdatera('uppstallning', rad.id, { till: tid || nu() });
  return rad;
}

/** Hela historiken för en plats eller en maskin. */
export const uppstallningshistorik = ({ snoplats_id, utrustning_id }) =>
  alla(
    `SELECT s.*, p.namn AS plats, u.namn AS maskin, m.namn AS av
       FROM uppstallning s
       JOIN snoplats p ON p.id=s.snoplats_id
       JOIN utrustning u ON u.id=s.utrustning_id
       LEFT JOIN medlem m ON m.id=s.av_id
      WHERE ${snoplats_id ? 's.snoplats_id=?' : 's.utrustning_id=?'}
      ORDER BY s.fran DESC`,
    snoplats_id || utrustning_id
  );

/**
 * Maskiner som inte står någonstans. De är inte borta – de står i
 * förrådet, på verkstaden eller väntar på en plats.
 */
export const olacerade = () =>
  alla(
    `SELECT u.* FROM utrustning u
      WHERE u.aktiv=1 AND u.typ IN ('lans','flakt')
        AND NOT EXISTS (SELECT 1 FROM uppstallning s WHERE s.utrustning_id=u.id AND s.till IS NULL)
      ORDER BY u.namn`
  );
