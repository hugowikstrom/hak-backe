// Olyckor, tillbud och arbetsskador.
//
// Två saker skiljer incidenter från vanliga driftavvikelser. Händelsen måste
// gå att följa upp i efterhand, och den bär uppgifter om en skadad människa.
// Därför ligger personuppgifterna i egna fält som kan gallras utan att
// händelsebeskrivningen förstörs, läsningen loggas, och bara en snävare
// krets ser namnet.
import { alla, en, spara, uppdatera } from '../db.mjs';
import { far } from '../behorighet.mjs';
import { tolka } from '../ai.mjs';
import { bool, ettAv, fel, heltal, kravTxt, rutt, svar, txt } from '../http.mjs';
import { nu } from '../tid.mjs';
import { skapaArende } from './arenden.mjs';
import { skapaPost } from './drift.mjs';

const SLAG = ['arbetsskada', 'gastincident', 'tillbud', 'driftavvikelse'];
const STATUSAR = ['rapporterad', 'granskad', 'uppfoljd', 'avslutad'];

/** Personuppgifterna. Allt annat i en incident är verksamhetsuppgifter. */
const PERSONFALT = ['person_namn', 'person_kontakt', 'person_alder', 'skada', 'vittnen'];

/** Hur länge uppgifterna om en skadad person sparas som standard. */
const GALLRINGSAR = 3;

const SCHEMA_INCIDENT = {
  type: 'object',
  properties: {
    slag: { type: ['string', 'null'], enum: [...SLAG, null] },
    plats: { type: ['string', 'null'] },
    beskrivning: { type: ['string', 'null'] },
    uppgiven_orsak: { type: ['string', 'null'], description: 'bara om rapportören anger en orsak' },
    insatser: { type: ['string', 'null'], description: 'vad personalen gjorde' },
    forhallanden: { type: ['string', 'null'], description: 'väder och pist, om det nämns' },
    person_namn: { type: ['string', 'null'] },
    skada: { type: ['string', 'null'] },
  },
};

const SYSTEM_INCIDENT = `Du strukturerar en muntlig rapport om en händelse i en skidbacke till ett
utkast som personalen sedan granskar och kompletterar.

Du drar inga slutsatser om skuld, orsak eller skadans allvar. Skriv bara det
som sägs. Nämns ingen orsak ska uppgiven_orsak vara null – skriv aldrig en
gissning om varför något hände. Nämns ingen skada, lämna skada som null.`;

/** Döljer personuppgifterna för den som inte ska se dem. */
export function filtrera(incident, medlem) {
  if (!incident) return incident;
  if (far(medlem, 'incident_person')) return { ...incident, personuppgifter: 1 };
  const ut = { ...incident, personuppgifter: 0 };
  for (const f of PERSONFALT) if (ut[f] != null) ut[f] = '[skyddad uppgift]';
  return ut;
}

/** Varje läsning av en incident lämnar ett spår. */
const logga = (incident_id, medlem, slag = 'las') =>
  spara('incidentatkomst', { incident_id, medlem_id: medlem?.id ?? null, slag });

export const hamtaIncident = (id) =>
  en(
    `SELECT i.*, o.namn AS omrade, r.namn AS rapporterad_av, u.namn AS uppfoljning_av
       FROM incident i
       LEFT JOIN omrade o ON o.id=i.omrade_id
       LEFT JOIN medlem r ON r.id=i.rapporterad_av_id
       LEFT JOIN medlem u ON u.id=i.uppfoljning_av_id
      WHERE i.id=?`,
    id
  );

export const incidenter = ({ status, slag, antal = 200 } = {}) => {
  const villkor = [];
  const p = [];
  if (status) (villkor.push('i.status=?'), p.push(status));
  if (slag) (villkor.push('i.slag=?'), p.push(slag));
  return alla(
    `SELECT i.*, o.namn AS omrade, r.namn AS rapporterad_av, u.namn AS uppfoljning_av
       FROM incident i
       LEFT JOIN omrade o ON o.id=i.omrade_id
       LEFT JOIN medlem r ON r.id=i.rapporterad_av_id
       LEFT JOIN medlem u ON u.id=i.uppfoljning_av_id
      ${villkor.length ? `WHERE ${villkor.join(' AND ')}` : ''}
      ORDER BY i.tid DESC LIMIT ?`,
    ...p,
    Math.min(500, antal)
  );
};

const gallringsdatum = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + GALLRINGSAR);
  return d.toISOString().slice(0, 10);
};

export function skapaIncident(data, medlem) {
  const id = spara('incident', {
    tid: data.tid || nu(),
    slag: ettAv(data.slag, SLAG, 'Slag') || 'gastincident',
    plats: txt(data.plats, 160),
    omrade_id: heltal(data.omrade_id),
    beskrivning: kravTxt(data.beskrivning, 'Beskrivning'),
    uppgiven_orsak: txt(data.uppgiven_orsak),
    forhallanden: txt(data.forhallanden),
    insatser: txt(data.insatser),
    vittnen: txt(data.vittnen),
    person_namn: txt(data.person_namn, 120),
    person_kontakt: txt(data.person_kontakt, 120),
    person_alder: heltal(data.person_alder),
    skada: txt(data.skada),
    personal: txt(data.personal),
    rapporterad_av_id: medlem?.id ?? null,
    uppfoljning_av_id: heltal(data.uppfoljning_av_id),
    gallras: gallringsdatum(),
  });
  // Händelsen ska också synas i driftjournalen, men utan personuppgifter.
  skapaPost(
    {
      tid: data.tid || nu(),
      slag: 'incident',
      omrade_id: heltal(data.omrade_id),
      incident_id: id,
      text: `${ettAv(data.slag, SLAG, 'Slag') || 'gastincident'} rapporterad${data.plats ? ` – ${txt(data.plats, 160)}` : ''}`,
    },
    medlem
  );
  return hamtaIncident(id);
}

export const rutter = [
  rutt('GET', '/api/incidenter', '@incident', ({ res, fraga, medlem }) =>
    svar(res, 200, {
      incidenter: incidenter({
        status: fraga.get('status'),
        slag: fraga.get('slag'),
        antal: heltal(fraga.get('antal'), 200),
      }).map((i) => filtrera(i, medlem)),
      slag: SLAG,
      statusar: STATUSAR,
      ser_personuppgifter: far(medlem, 'incident_person') ? 1 : 0,
      gallringsar: GALLRINGSAR,
    })
  ),

  rutt('GET', '/api/incidenter/:id', '@incident', ({ res, param, medlem }) => {
    const i = hamtaIncident(param.id);
    if (!i) throw fel(404, 'Incidenten finns inte');
    logga(i.id, medlem);
    svar(res, 200, {
      incident: filtrera(i, medlem),
      // Vem som läst syns för den som ansvarar för uppgifterna.
      atkomst: far(medlem, 'incident_person')
        ? alla(
            `SELECT a.*, m.namn FROM incidentatkomst a LEFT JOIN medlem m ON m.id=a.medlem_id
              WHERE a.incident_id=? ORDER BY a.tid DESC LIMIT 100`,
            i.id
          )
        : null,
    });
  }),

  rutt('POST', '/api/incidenter', '@incident', ({ res, kropp, medlem }) =>
    svar(res, 201, { incident: filtrera(skapaIncident(kropp, medlem), medlem) })
  ),

  /** Talvägen. Förslaget är ett utkast och sparas aldrig som rapport. */
  rutt('POST', '/api/incidenter/tolka', '@incident', async ({ res, kropp }) => {
    const text = kravTxt(kropp.text, 'Text');
    // kanslig: en olycksrapport får inte skickas till en extern leverantör.
    const r = await tolka({ system: SYSTEM_INCIDENT, text, schema: SCHEMA_INCIDENT, kanslig: true });
    svar(res, 200, { forslag: r.data, modell: r.modell, fel: r.fel });
  }),

  rutt('PATCH', '/api/incidenter/:id', '@incident', ({ res, param, kropp, medlem }) => {
    const i = hamtaIncident(param.id);
    if (!i) throw fel(404, 'Incidenten finns inte');
    if (i.gallrad) throw fel(409, 'Incidenten är gallrad och går inte att ändra');
    const rorPerson = PERSONFALT.some((f) => kropp[f] !== undefined);
    if (rorPerson && !far(medlem, 'incident_person'))
      throw fel(403, 'Du får inte ändra personuppgifterna i en incident');
    logga(i.id, medlem, 'andra');
    uppdatera('incident', i.id, {
      slag: ettAv(kropp.slag, SLAG, 'Slag'),
      status: ettAv(kropp.status, STATUSAR, 'Status'),
      plats: txt(kropp.plats, 160),
      omrade_id: heltal(kropp.omrade_id),
      beskrivning: kropp.beskrivning === undefined ? undefined : kravTxt(kropp.beskrivning, 'Beskrivning'),
      uppgiven_orsak: txt(kropp.uppgiven_orsak),
      forhallanden: txt(kropp.forhallanden),
      insatser: txt(kropp.insatser),
      personal: txt(kropp.personal),
      uppfoljning_av_id: heltal(kropp.uppfoljning_av_id),
      ...(rorPerson
        ? {
            person_namn: txt(kropp.person_namn, 120),
            person_kontakt: txt(kropp.person_kontakt, 120),
            person_alder: heltal(kropp.person_alder),
            skada: txt(kropp.skada),
            vittnen: txt(kropp.vittnen),
          }
        : {}),
      uppdaterad: nu(),
    });
    svar(res, 200, { incident: filtrera(hamtaIncident(i.id), medlem) });
  }),

  /** Ett åtgärdsärende ur incidenten – det ojämna partiet ska lagas. */
  rutt('POST', '/api/incidenter/:id/arende', '@incident', ({ res, param, kropp, medlem }) => {
    const i = hamtaIncident(param.id);
    if (!i) throw fel(404, 'Incidenten finns inte');
    if (i.arende_id) throw fel(409, 'Incidenten har redan ett ärende');
    const a = skapaArende(
      {
        titel: kravTxt(kropp.titel, 'Titel', 160),
        // Personuppgifter följer aldrig med in i ärendekön, som fler ser.
        beskrivning: txt(kropp.beskrivning) || `Åtgärd efter incident ${i.id} (${i.slag}) ${i.plats || ''}`.trim(),
        typ: 'risk',
        allvarlighet: ettAv(kropp.allvarlighet,
          ['sakerhetsrisk', 'driftstopp', 'begransar', 'kosmetisk'], 'Allvarlighet') || 'sakerhetsrisk',
        prioritet: heltal(kropp.prioritet, 1),
        omrade_id: i.omrade_id,
      },
      medlem
    );
    uppdatera('incident', i.id, { arende_id: a.id, uppdaterad: nu() });
    svar(res, 201, { arende: a, incident: filtrera(hamtaIncident(i.id), medlem) });
  }),

  /** Gallring: personuppgifterna bort, händelsen kvar. */
  rutt('POST', '/api/incidenter/:id/gallra', '@incident_person', ({ res, param, medlem }) => {
    const i = hamtaIncident(param.id);
    if (!i) throw fel(404, 'Incidenten finns inte');
    if (i.gallrad) throw fel(409, 'Redan gallrad');
    logga(i.id, medlem, 'gallra');
    uppdatera('incident', i.id, {
      person_namn: null,
      person_kontakt: null,
      person_alder: null,
      skada: null,
      vittnen: null,
      gallrad: nu(),
      uppdaterad: nu(),
    });
    svar(res, 200, { incident: hamtaIncident(i.id) });
  }),

  /** Vad som ska gallras, så att det inte blir liggande. */
  rutt('GET', '/api/incidenter/gallring/kommande', '@incident_person', ({ res }) =>
    svar(res, 200, {
      kommande: alla(
        `SELECT id, tid, slag, plats, gallras FROM incident
          WHERE gallrad IS NULL AND gallras IS NOT NULL AND gallras <= date('now','+90 days')
          ORDER BY gallras`
      ),
    })
  ),
];
