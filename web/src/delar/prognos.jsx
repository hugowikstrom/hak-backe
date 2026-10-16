// Väderprognosen för backen: 4, 12 och 48 timmar samt veckan.
import { useState } from 'react';
import { api } from '../api.js';
import { Bricka, Kort, Linjegraf, Nyckeltal, Tomt, useHamta, useNotis, Vanta } from './bitar.jsx';
import { Tabell } from './tabell.jsx';
import { KLARTECKEN, langDatum, prognosstund, prognostimme, sedan, tal } from '../nytta.js';

const HORISONTER = [
  { nyckel: 'h4', text: '4 h' },
  { nyckel: 'h12', text: '12 h' },
  { nyckel: 'h48', text: '48 h' },
  { nyckel: 'vecka', text: 'Vecka' },
];

const farg = (niva) =>
  niva === 'nej' || niva === 'okant' ? 'rod' : niva === 'marginellt' ? 'gul' : niva === 'ok' || niva === 'bra' ? 'klubb' : 'gron';

export function Prognos({ kompakt = false }) {
  const notis = useNotis();
  const [horisont, sattHorisont] = useState(kompakt ? 'h12' : 'h12');
  const { data, laddar, fel, uppdatera } = useHamta(() => api.hamta('/api/vader'));
  const [hamtar, sattHamtar] = useState(false);

  if (laddar && !data) return <Kort titel="Prognos"><Vanta /></Kort>;
  if (fel) return <Kort titel="Prognos"><div className="meddelande fel">{fel}</div></Kort>;

  const h = data[horisont];
  const trasiga = data.kallor.filter((k) => k.fel);

  const uppdateraNu = async () => {
    sattHamtar(true);
    try {
      await api.skapa('/api/vader/uppdatera');
      uppdatera();
      notis('Prognosen är hämtad på nytt.');
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattHamtar(false);
    }
  };

  return (
    <Kort
      titel="Prognos för backen"
      undertext={`${data.plats.namn} · ${data.kallor.map((k) => k.namn).join(' och ')}`}
      verktyg={
        <>
          <div className="segment">
            {HORISONTER.map((x) => (
              <button key={x.nyckel} aria-pressed={horisont === x.nyckel} onClick={() => sattHorisont(x.nyckel)}>
                {x.text}
              </button>
            ))}
          </div>
          <button className="liten" onClick={uppdateraNu} disabled={hamtar}>
            {hamtar ? 'Hämtar …' : 'Uppdatera'}
          </button>
        </>
      }
    >
      {!!trasiga.length && (
        <div className="meddelande varning" style={{ marginBottom: 8 }}>
          {trasiga.map((k) => `${k.namn}: ${k.fel}`).join(' · ')}
        </div>
      )}

      {horisont === 'vecka' ? <Vecka data={data} /> : <Timmar h={h} data={data} kompakt={kompakt} />}
    </Kort>
  );
}

function Timmar({ h, data, kompakt }) {
  const punkter = h.punkter.map((p) => ({ x: prognostimme(p.tid), a: p.vatkula, b: p.temp }));
  return (
    <>
      <div className="rad gap-16 hopp" style={{ marginBottom: 10 }}>
        {data.nu && (
          <Nyckeltal etikett="Just nu" varde={tal(data.nu.vatkula)} enhet="°C våtkula">
            <span className="liten svag">
              {tal(data.nu.temp)} °C · {data.nu.fukt} % · {tal(data.nu.vind)} m/s
            </span>
          </Nyckeltal>
        )}
        <Nyckeltal
          etikett="Produktionstimmar"
          varde={h.produktionstimmar}
          enhet={`/ ${h.timmar} h`}
          farg={h.produktionstimmar ? 'gron' : 'rod'}
        />
        <Nyckeltal etikett="Kallast" varde={h.kallast != null && h.kallast < 90 ? tal(h.kallast) : '–'} enhet="°C" />
        <div className="vaxa" />
        <span className="liten svagare">Uppdaterad {sedan(data.uppdaterad.replace('T', ' ').slice(0, 19))}</span>
      </div>

      <Linjegraf
        punkter={punkter}
        etikett_a="våtkula"
        etikett_b="lufttemp"
        grans={-2.5}
        gransetikett="gräns för snöläggning"
      />

      {h.fonster.length ? (
        <div className="kolumn" style={{ marginTop: 10 }}>
          {h.fonster.map((f) => (
            <div key={f.fran} className="meddelande ok">
              <strong>Produktionsfönster:</strong> {prognosstund(f.fran)} – {prognosstund(f.till)} ·{' '}
              {f.timmar} h · ned till {tal(f.lagsta)} °C våtkula
            </div>
          ))}
        </div>
      ) : (
        <div className="meddelande varning" style={{ marginTop: 10 }}>
          Inget produktionsfönster inom {h.timmar} timmar – våtkulan håller sig över −2,5 °C.
        </div>
      )}

      {!kompakt && (
        <div style={{ marginTop: 10 }}>
          <Tabell
            rader={h.punkter}
            nyckel={(p) => p.tid}
            maxhojd="34vh"
            tomtext="Prognosen saknar timmar."
            kolumner={[
              { falt: 'tid', rubrik: 'Tid', visa: (p) => <span className="num">{prognosstund(p.tid)}</span> },
              { falt: 'temp', rubrik: 'Temp', sifra: true, visa: (p) => `${tal(p.temp)} °C` },
              { falt: 'fukt', rubrik: 'Fukt', sifra: true, visa: (p) => `${p.fukt} %` },
              {
                falt: 'vatkula', rubrik: 'Våtkula', sifra: true,
                visa: (p) => <Bricka farg={farg(p.klartecken.niva)}>{tal(p.vatkula)} °C</Bricka>,
              },
              { falt: 'klartecken', rubrik: 'Läge', visa: (p) => KLARTECKEN[p.klartecken.niva] },
              { falt: 'vatten', rubrik: 'Vatten', sifra: true, visa: (p) => (p.klartecken.vatten != null ? `${p.klartecken.vatten} %` : '–') },
              { falt: 'vind', rubrik: 'Vind', sifra: true, visa: (p) => `${tal(p.vind)} m/s` },
              { falt: 'nederbord', rubrik: 'Nederbörd', sifra: true, visa: (p) => (p.nederbord ? `${tal(p.nederbord)} mm` : '–') },
              {
                falt: 'spridning', rubrik: 'Källor', sifra: true,
                titel: 'Skillnad i våtkula mellan YR och SMHI',
                visa: (p) => (
                  <span className={p.spridning > 1.5 ? 'num' : 'num svag'} title={Object.entries(p.kallor).map(([k, v]) => `${k}: ${tal(v.vatkula)} °C`).join(' · ')}>
                    ±{tal(p.spridning)}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
    </>
  );
}

function Vecka({ data }) {
  const dygn = data.vecka.dygn;
  const summa = dygn.reduce((a, d) => a + d.produktionstimmar, 0);
  return (
    <>
      <div className="rad gap-16 hopp" style={{ marginBottom: 10 }}>
        <Nyckeltal etikett="Produktionstimmar i veckan" varde={summa} enhet="h" farg={summa ? 'gron' : 'rod'} />
        <Nyckeltal
          etikett="Kallaste våtkula"
          varde={tal(Math.min(...dygn.map((d) => d.vatkula_min ?? 99).filter((v) => v < 90)))}
          enhet="°C"
        />
        <Nyckeltal etikett="Dygn med produktion" varde={dygn.filter((d) => d.produktionstimmar > 0).length} enhet={`/ ${dygn.length}`} />
      </div>

      <Tabell
        rader={dygn}
        nyckel={(d) => d.datum}
        tomtext="Prognosen saknar dygn."
        kolumner={[
          { falt: 'datum', rubrik: 'Dag', visa: (d) => <strong>{langDatum(d.datum)}</strong> },
          { falt: 'temp_min', rubrik: 'Temp min', sifra: true, visa: (d) => `${tal(d.temp_min)} °C` },
          { falt: 'temp_max', rubrik: 'Temp max', sifra: true, visa: (d) => `${tal(d.temp_max)} °C` },
          {
            falt: 'vatkula_min', rubrik: 'Våtkula min', sifra: true,
            visa: (d) => (
              <Bricka farg={d.vatkula_min != null && d.vatkula_min < -2.5 ? 'gron' : 'rod'}>{tal(d.vatkula_min)} °C</Bricka>
            ),
          },
          {
            falt: 'produktionstimmar', rubrik: 'Produktion', sifra: true,
            visa: (d) => (d.produktionstimmar ? `${d.produktionstimmar} h` : '–'),
          },
          { falt: 'bra_timmar', rubrik: 'Varav bra', sifra: true, titel: 'Timmar med våtkula under −5 °C', visa: (d) => (d.bra_timmar ? `${d.bra_timmar} h` : '–') },
          { falt: 'nederbord', rubrik: 'Nederbörd', sifra: true, visa: (d) => (d.nederbord ? `${tal(d.nederbord)} mm` : '–') },
          {
            falt: 'tackning', rubrik: 'Underlag',
            titel: 'Längre fram ger källorna bara var sjätte timme',
            visa: (d) => <span className="liten svag">{d.timmar} timsteg{d.tackning === 'gles' ? ' (glest)' : ''}</span>,
          },
        ]}
      />

      {!!data.vecka.fonster.length && (
        <div className="kolumn" style={{ marginTop: 10 }}>
          <h4>Produktionsfönster i veckan</h4>
          {data.vecka.fonster.map((f) => (
            <div key={f.fran} className="meddelande ok">
              {prognosstund(f.fran)} – {prognosstund(f.till)} · {f.timmar} h · ned till {tal(f.lagsta)} °C
            </div>
          ))}
        </div>
      )}
    </>
  );
}
