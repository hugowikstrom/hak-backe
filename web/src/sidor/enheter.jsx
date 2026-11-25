// Enheter: status för externa IoT-enheter (väderstation och givare) via
// Feeder-serverns API. Batteri, temperatur, position, el- eller batteridrift,
// senaste pollning och datamängd per dygn, vecka och denna månad.
import { useState } from 'react';
import { api } from '../api.js';
import { Bricka, Kort, Linjegraf, Matare, Nyckeltal, Tomt, useHamta, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { grader, klockslag, sedan, tal, tidpunkt } from '../nytta.js';

/** Byte till läsbar storlek. SI-kilo räcker för någon megabyte i månaden. */
const byte = (n) => {
  if (n == null) return '–';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${tal(n / 1024)} KiB`;
  return `${tal(n / (1024 * 1024))} MiB`;
};

const batterifarg = (procent) =>
  procent == null ? '' : procent >= 50 ? 'ok' : procent >= 20 ? 'varning' : 'fara';

const DRIFT = {
  battery: { text: 'Batteri', farg: 'varning' },
};
const drift = (v) => (v == null ? { text: '–', farg: '' } : DRIFT[v] || { text: 'El', farg: 'ok' });

export function Enheter() {
  const { data, laddar, fel, uppdatera } = useHamta(() => api.hamta('/api/enheter'));
  const [vald, sattVald] = useState(null);

  if (laddar && !data) return <Vanta />;
  if (fel)
    return (
      <>
        <div className="sidhuvud">
          <h1>Enheter</h1>
        </div>
        <Kort titel="Enheter">
          <div className="meddelande fel">Kunde inte nå Feeder-servern: {fel}</div>
        </Kort>
      </>
    );

  const lista = data.enheter || [];
  const online = lista.filter((e) => e.online).length;
  const paBatteri = lista.filter((e) => e.drift === 'battery').length;
  const valdEnhet = lista.find((e) => e.device_id === vald) || null;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Enheter</h1>
          <div className="undertext">
            {data.kalla} · uppdaterad {sedan(data.uppdaterad.replace('T', ' ').slice(0, 19))}
          </div>
        </div>
        <div className="knapprad">
          <button onClick={uppdatera}>Uppdatera</button>
        </div>
      </div>

      <div className="rad gap-16 hopp" style={{ marginBottom: 10 }}>
        <Nyckeltal etikett="Enheter" varde={lista.length} />
        <Nyckeltal etikett="Online" varde={online} enhet={`/ ${lista.length}`} farg={online === lista.length ? 'ok' : online ? 'varning' : 'fara'} />
        <Nyckeltal etikett="På batteridrift" varde={paBatteri} enhet={`/ ${lista.length}`} />
      </div>

      <Kort
        titel="Enheter"
        undertext="Klicka på en rad för att fälla ut detaljer."
        tat
      >
        <Tabell
          rader={lista}
          nyckel={(e) => e.device_id}
          tomtext="Inga enheter registrerade i Feeder."
          vidKlick={(e) => sattVald((v) => (v === e.device_id ? null : e.device_id))}
          vald={vald}
          kolumner={[
            { falt: 'etikett', rubrik: 'Enhet', visa: (e) => <strong>{e.etikett}</strong> },
            {
              falt: 'online', rubrik: 'Status', sortlos: true,
              visa: (e) => <Bricka farg={e.online ? 'ok' : 'fara'}>{e.online ? 'Online' : 'Offline'}</Bricka>,
            },
            {
              falt: 'batteri', rubrik: 'Batteri', sifra: true, sortlos: true,
              visa: (e) =>
                e.batteri?.procent != null ? (
                  <Bricka farg={batterifarg(e.batteri.procent)} title={e.batteri.text || undefined}>
                    {e.batteri.procent} %{e.batteri.mv != null ? ` · ${tal(e.batteri.mv / 1000, 2)} V` : ''}
                  </Bricka>
                ) : e.batteri?.mv != null ? (
                  `${tal(e.batteri.mv / 1000, 2)} V`
                ) : '–',
            },
            { falt: 'temp', rubrik: 'Temp', sifra: true, sortlos: true, visa: (e) => grader(e.temperatur?.varde) },
            {
              falt: 'drift', rubrik: 'Drift', sortlos: true,
              visa: (e) => <Bricka farg={drift(e.drift).farg}>{drift(e.drift).text}</Bricka>,
            },
            {
              falt: 'manad', rubrik: 'Denna månad', sifra: true, sortlos: true,
              titel: 'Datamängd denna månad mot SIM-budgeten',
              visa: (e) => <span className="num">{byte(e.datamangd.manad_byte)}{e.datamangd.andel_manad != null ? ` · ${tal(e.datamangd.andel_manad)} %` : ''}</span>,
            },
            {
              falt: 'senast', rubrik: 'Senast sedd', sortlos: true,
              visa: (e) => <span className="liten svag">{e.last_seen ? sedan(e.last_seen) : 'aldrig'}</span>,
            },
          ]}
        />
      </Kort>

      {valdEnhet && <Detalj id={valdEnhet.device_id} sammanfattning={valdEnhet} />}
    </>
  );
}

function Detalj({ id, sammanfattning }) {
  const { data, laddar, fel } = useHamta(() => api.hamta(`/api/enheter/${encodeURIComponent(id)}`), [id]);
  if (laddar && !data) return <Kort titel={sammanfattning.etikett}><Vanta /></Kort>;
  if (fel) return <Kort titel={sammanfattning.etikett}><div className="meddelande fel">{fel}</div></Kort>;

  const e = data.enhet;
  const d = e.datamangd;

  const tempPunkter = (e.telemetri || [])
    .filter((r) => r.temperatur != null)
    .map((r) => ({ x: klockslag(r.tid), a: r.temperatur }));
  const voltPunkter = (e.telemetri || [])
    .filter((r) => r.battery_mv != null)
    .map((r) => ({ x: klockslag(r.tid), a: Math.round((r.battery_mv / 1000) * 100) / 100 }));

  return (
    <Kort
      titel={e.etikett}
      undertext={`${e.device_id}${e.fw_version ? ` · ${e.fw_version}` : ''}`}
    >
      <div className="rad gap-16 hopp" style={{ marginBottom: 10 }}>
        <Nyckeltal etikett="Status" varde={e.online ? 'Online' : 'Offline'} farg={e.online ? 'ok' : 'fara'}>
          <span className="liten svag">{e.last_seen ? `senast ${sedan(e.last_seen)}` : 'aldrig sedd'}</span>
        </Nyckeltal>
        <Nyckeltal
          etikett="Batteri"
          varde={e.batteri?.procent != null ? e.batteri.procent : '–'}
          enhet={e.batteri?.procent != null ? '%' : undefined}
          farg={batterifarg(e.batteri?.procent)}
        >
          <span className="liten svag">
            {e.batteri?.mv != null ? `${tal(e.batteri.mv / 1000, 2)} V` : '–'}
            {e.batteri?.tillstand ? ` · ${e.batteri.tillstand}` : ''}
          </span>
        </Nyckeltal>
        <Nyckeltal etikett="Drift" varde={drift(e.drift).text} />
        <Nyckeltal etikett="Temperatur" varde={e.temperatur?.varde != null ? tal(e.temperatur.varde) : '–'} enhet="°C">
          {e.temperatur?.fukt != null && <span className="liten svag">{e.temperatur.fukt} % fukt</span>}
        </Nyckeltal>
        <div className="vaxa" />
        {e.lank?.typ && (
          <Nyckeltal etikett="Länk" varde={e.lank.typ}>
            <span className="liten svag">
              {e.lank.via ? `${e.lank.via} · ` : ''}RSSI {e.lank.rssi ?? '–'}
            </span>
          </Nyckeltal>
        )}
      </div>

      {e.batteri?.text && <div className="meddelande" style={{ marginBottom: 8 }}>{e.batteri.text}</div>}

      <div className="tva">
        <div className="kolumn">
          <h4>Temperatur</h4>
          {tempPunkter.length > 1 ? (
            <Linjegraf punkter={tempPunkter} etikett_a="°C" noll />
          ) : (
            <Tomt>Enheten rapporterar ingen temperatur ännu.</Tomt>
          )}
        </div>
        <div className="kolumn">
          <h4>Batterispänning</h4>
          {voltPunkter.length > 1 ? (
            <Linjegraf punkter={voltPunkter} etikett_a="V" noll={false} />
          ) : (
            <Tomt>För få mätpunkter.</Tomt>
          )}
        </div>
      </div>

      <div className="skiljare" />

      <h4>Datamängd</h4>
      <div className="rad gap-16 hopp" style={{ marginBottom: 6 }}>
        <Nyckeltal etikett="Per dygn" varde={byte(d.dygn_byte)}>
          <span className="liten svag">senaste 24 h · {d.dygn_meddelanden} meddelanden</span>
        </Nyckeltal>
        <Nyckeltal etikett="Per vecka" varde={byte(d.vecka_byte)}>
          <span className="liten svag">senaste 168 h · {d.vecka_meddelanden} meddelanden</span>
        </Nyckeltal>
        <Nyckeltal etikett="Denna månad" varde={byte(d.manad_byte)}>
          <span className="liten svag">av {byte(d.manad_budget_byte)} budget</span>
        </Nyckeltal>
      </div>
      {d.andel_manad != null && (
        <Matare andel={d.andel_manad} farg={d.andel_manad > 90 ? 'fara' : d.andel_manad > 70 ? 'varning' : 'ok'} />
      )}
      <div className="liten svag" style={{ marginTop: 6 }}>
        Dygn och vecka är summor över de senaste 24 respektive 168 timmarna – Feeder sparar bara
        336 timmars timserie, så någon äkta totalsumma sedan start finns inte. Denna månad är exakt.
        {d.overhead_note ? ` ${d.overhead_note}` : ' Siffrorna är payload-byte; på länken tillkommer TLS/TCP/WebSocket, räkna 1,3–1,6x mot SIM-kvoten.'}
      </div>

      {e.position && (
        <>
          <div className="skiljare" />
          <h4>Position</h4>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Koordinater" varde={`${tal(e.position.lat, 5)}, ${tal(e.position.lon, 5)}`}>
              <span className="liten svag">
                {e.position.kalla ? `${e.position.kalla} · ` : ''}
                {e.position.noggrannhet != null ? `±${tal(e.position.noggrannhet)} m · ` : ''}
                {e.position.tid ? tidpunkt(e.position.tid) : ''}
              </span>
            </Nyckeltal>
            <div className="vaxa" />
            <a
              className="knapp"
              href={`https://www.openstreetmap.org/?mlat=${e.position.lat}&mlon=${e.position.lon}#map=16/${e.position.lat}/${e.position.lon}`}
              target="_blank"
              rel="noreferrer"
            >
              Visa på karta
            </a>
          </div>
        </>
      )}
    </Kort>
  );
}
