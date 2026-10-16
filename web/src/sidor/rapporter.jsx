// Rapporter för anläggningsansvarig: snöläggning, ärenden och bemanning över en period.
import { useState } from 'react';
import { api, fragestrang } from '../api.js';
import { Bricka, Flikar, Kort, Matare, Nyckeltal, Prioritetsbricka, Stapeldiagram, Statusbricka, Text, Tomt, useHamta, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { ALLVARLIGHET, ARENDESTATUS, ARENDETYP, idag, kortDatum, langDatum, PASSLAG, plusDagar, PRIORITET, procent, tal, tidpunkt } from '../nytta.js';

export function Rapporter() {
  const [period, sattPeriod] = useState({ fran: plusDagar(idag(), -30), till: idag() });
  const [flik, sattFlik] = useState('sno');
  const rapport = useHamta(
    () => api.hamta(`/api/rapport/samlad${fragestrang(period)}`),
    [period.fran, period.till]
  );

  const snabbval = [
    ['7 dagar', 7], ['30 dagar', 30], ['Säsong', 210],
  ];

  if (rapport.laddar && !rapport.data) return <Vanta />;
  if (rapport.fel) return <div className="meddelande fel">{rapport.fel}</div>;
  const r = rapport.data;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Rapporter</h1>
          <div className="undertext">{langDatum(period.fran)} – {langDatum(period.till)}</div>
        </div>
        <div className="knapprad">
          <div className="segment">
            {snabbval.map(([text, dagar]) => (
              <button key={text} onClick={() => sattPeriod({ fran: plusDagar(idag(), -dagar), till: idag() })}>
                {text}
              </button>
            ))}
          </div>
          <Text etikett="" typ="date" varde={period.fran} satt={(v) => sattPeriod((p) => ({ ...p, fran: v }))} />
          <Text etikett="" typ="date" varde={period.till} satt={(v) => sattPeriod((p) => ({ ...p, till: v }))} />
          <button onClick={() => window.print()}>Skriv ut</button>
        </div>
      </div>

      <Flikar
        flikar={[
          { nyckel: 'sno', text: 'Snöläggning' },
          { nyckel: 'arenden', text: 'Ärenden' },
          { nyckel: 'bemanning', text: 'Bemanning och insatser' },
        ]}
        aktiv={flik}
        satt={sattFlik}
      />

      {flik === 'sno' && <SnoRapport r={r.sno} period={period} />}
      {flik === 'arenden' && <ArendeRapport r={r.arenden} period={period} />}
      {flik === 'bemanning' && <BemanningsRapport r={r.bemanning} period={period} />}
    </>
  );
}

function SnoRapport({ r, period }) {
  return (
    <>
      <Kort titel="Sammanfattning" verktyg={<a className="knapp liten" href={`/api/rapport/sno.csv${fragestrang(period)}`}>CSV</a>}>
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Mätningar" varde={r.summa.matningar} />
          <Nyckeltal etikett="Snöpass" varde={r.summa.snopass} />
          <Nyckeltal etikett="Drifttimmar" varde={tal(r.summa.drifttimmar)} enhet="h" />
          <Nyckeltal etikett="Vatten" varde={r.summa.vattenvolym_m3.toLocaleString('sv-SE')} enhet="m³" />
          <Nyckeltal etikett="Kallaste våtkula" varde={tal(r.summa.kallaste_vatkula)} enhet="°C" />
        </div>
        <p className="liten svag" style={{ marginTop: 8 }}>
          Drifttid och vattenvolym räknas ur mätserierna: varje mätvärde antas gälla fram till nästa mätning,
          glapp längre än tre timmar räknas inte som drift. Rapportera ofta för att få täta siffror.
        </p>
      </Kort>

      <Kort titel="Per utrustning" tat>
        <Tabell
          rader={r.per_utrustning}
          nyckel={(x) => x.utrustning_id ?? x.utrustning}
          standardsort="vattenvolym_m3"
          tomtext="Inga mätningar i perioden."
          kolumner={[
            { falt: 'utrustning', rubrik: 'Enhet', visa: (x) => <strong>{x.utrustning}</strong> },
            { falt: 'omrade', rubrik: 'Område' },
            { falt: 'antal_matningar', rubrik: 'Mätningar', sifra: true },
            { falt: 'drifttimmar', rubrik: 'Drifttim', sifra: true, visa: (x) => tal(x.drifttimmar) },
            { falt: 'vattenvolym_m3', rubrik: 'Vatten m³', sifra: true, visa: (x) => x.vattenvolym_m3.toLocaleString('sv-SE') },
            { falt: 'temp_min', rubrik: 'Temp min', sifra: true, visa: (x) => tal(x.temp_min) },
            { falt: 'temp_medel', rubrik: 'Temp medel', sifra: true, visa: (x) => tal(x.temp_medel) },
            { falt: 'vatkula_medel', rubrik: 'Våtkula medel', sifra: true, visa: (x) => tal(x.vatkula_medel) },
            { falt: 'flode_medel', rubrik: 'Flöde medel', sifra: true, visa: (x) => tal(x.flode_medel) },
            { falt: 'flode_max', rubrik: 'Flöde max', sifra: true, visa: (x) => tal(x.flode_max) },
            { falt: 'senaste', rubrik: 'Senaste', visa: (x) => <span className="liten svag">{tidpunkt(x.senaste)}</span> },
          ]}
        />
      </Kort>

      <div className="tva">
        <Kort titel="Vattenvolym per enhet">
          <Stapeldiagram
            poster={r.per_utrustning.slice(0, 12).map((x) => ({
              etikett: x.utrustning,
              varde: x.vattenvolym_m3,
              text: `${x.vattenvolym_m3.toLocaleString('sv-SE')} m³`,
            }))}
          />
        </Kort>
        <Kort titel="Snöpass i perioden" tat>
          <Tabell
            rader={r.pass}
            tomtext="Inga snöpass."
            kolumner={[
              { falt: 'start', rubrik: 'Start', visa: (p) => <span className="num">{tidpunkt(p.start)}</span> },
              { falt: 'slut', rubrik: 'Slut', visa: (p) => <span className="num">{p.slut ? tidpunkt(p.slut) : '–'}</span> },
              { falt: 'ansvarig', rubrik: 'Ansvarig' },
              { falt: 'antal_matningar', rubrik: 'Mätningar', sifra: true },
              { falt: 'status', rubrik: 'Status', visa: (p) => <Bricka farg={p.status === 'pagar' ? 'bla' : 'gron'}>{p.status}</Bricka> },
              { falt: 'anteckning', rubrik: 'Anteckning' },
            ]}
          />
        </Kort>
      </div>
    </>
  );
}

function ArendeRapport({ r }) {
  return (
    <>
      <Kort titel="Läget">
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Öppna" varde={r.oppna_totalt} />
          <Nyckeltal etikett="Nya i perioden" varde={r.nya} />
          <Nyckeltal etikett="Stängda i perioden" varde={r.stangda} farg="gron" />
          <Nyckeltal etikett="Medeltid till stängning" varde={tal(r.atgardstid_dagar)} enhet="dgr" />
          <Nyckeltal etikett="Varav akuta/höga" varde={tal(r.atgardstid_akuta_dagar)} enhet="dgr" />
          <Nyckeltal etikett="Säkerhetsrisker" varde={r.sakerhetsrisker.length} farg={r.sakerhetsrisker.length ? 'rod' : 'gron'} />
        </div>
      </Kort>

      {!!r.sakerhetsrisker.length && (
        <Kort titel="Öppna säkerhetsrisker" undertext="Ska hanteras först" tat>
          <Tabell
            rader={r.sakerhetsrisker}
            kolumner={[
              { falt: 'id', rubrik: 'Nr', sifra: true },
              { falt: 'titel', rubrik: 'Ärende', visa: (a) => <strong>{a.titel}</strong> },
              { falt: 'utrustning', rubrik: 'Gäller', visa: (a) => a.utrustning || a.omrade || '–' },
              { falt: 'prioritet', rubrik: 'Prio', visa: (a) => <Prioritetsbricka niva={a.prioritet} /> },
              { falt: 'status', rubrik: 'Status', visa: (a) => <Statusbricka status={a.status} /> },
              { falt: 'skapad', rubrik: 'Skapad', visa: (a) => <span className="num">{tidpunkt(a.skapad)}</span> },
            ]}
          />
        </Kort>
      )}

      <div className="rutor bred">
        <Kort titel="Öppna per prioritet">
          <Stapeldiagram
            poster={r.per_prioritet.map((p) => ({
              etikett: PRIORITET[p.prioritet]?.namn || p.prioritet,
              varde: p.antal,
              farg: PRIORITET[p.prioritet]?.farg === 'rod' ? 'rod' : PRIORITET[p.prioritet]?.farg === 'gul' ? 'gul' : undefined,
            }))}
          />
        </Kort>
        <Kort titel="Öppna per typ">
          <Stapeldiagram poster={r.per_typ.map((p) => ({ etikett: ARENDETYP[p.typ] || p.typ, varde: p.antal }))} />
        </Kort>
        <Kort titel="Alla per status">
          <Stapeldiagram poster={r.per_status.map((p) => ({ etikett: ARENDESTATUS[p.status]?.namn || p.status, varde: p.antal }))} />
        </Kort>
      </div>

      <div className="tva">
        <Kort titel="Per område" tat>
          <Tabell
            rader={r.per_omrade}
            nyckel={(x) => x.omrade}
            kolumner={[
              { falt: 'omrade', rubrik: 'Område' },
              { falt: 'oppna', rubrik: 'Öppna', sifra: true },
              { falt: 'totalt', rubrik: 'Totalt', sifra: true },
            ]}
          />
        </Kort>
        <Kort titel="Utrustning med flest ärenden" tat>
          <Tabell
            rader={r.per_utrustning}
            nyckel={(x) => x.utrustning}
            tomtext="Inga ärenden kopplade till utrustning."
            kolumner={[
              { falt: 'utrustning', rubrik: 'Enhet' },
              { falt: 'antal', rubrik: 'Totalt', sifra: true },
              { falt: 'oppna', rubrik: 'Öppna', sifra: true },
            ]}
          />
        </Kort>
      </div>

      <Kort titel="Äldsta öppna ärenden" tat>
        <Tabell
          rader={r.aldsta_oppna}
          tomtext="Inga öppna ärenden."
          kolumner={[
            { falt: 'id', rubrik: 'Nr', sifra: true },
            { falt: 'titel', rubrik: 'Ärende' },
            { falt: 'utrustning', rubrik: 'Gäller', visa: (a) => a.utrustning || '–' },
            { falt: 'prioritet', rubrik: 'Prio', visa: (a) => <Prioritetsbricka niva={a.prioritet} /> },
            { falt: 'status', rubrik: 'Status', visa: (a) => <Statusbricka status={a.status} /> },
            { falt: 'alder_dagar', rubrik: 'Ålder (dgr)', sifra: true },
          ]}
        />
      </Kort>
    </>
  );
}

function BemanningsRapport({ r, period }) {
  return (
    <>
      <Kort titel="Täckning" verktyg={<a className="knapp liten" href={`/api/rapport/insatser.csv${fragestrang(period)}`}>CSV insatser</a>}>
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Pass" varde={r.summa.pass} />
          <Nyckeltal etikett="Platser" varde={`${r.summa.bokade}/${r.summa.behov}`} />
          <Nyckeltal etikett="Saknas" varde={r.summa.hal} farg={r.summa.hal ? 'rod' : 'gron'} />
          <Nyckeltal etikett="Planerade timmar" varde={r.summa.timmar} enhet="h" />
          <Nyckeltal etikett="Under kvot" varde={r.under_kvot} enhet="medlemmar" />
          <Nyckeltal etikett="Spridning kvot" varde={tal(r.rattvisa.andel_std, 2)} />
        </div>
        <p className="liten svag" style={{ marginTop: 8 }}>
          Spridning är standardavvikelsen i andel av kvot – nära noll betyder att alla bär lika mycket.
          Nattspann {r.rattvisa.natt_spann} och helgspann {r.rattvisa.helg_spann} visar skillnaden mellan den
          som har flest och den som har minst såna pass.
        </p>
      </Kort>

      <div className="tva">
        <Kort titel="Täckning per position">
          <Stapeldiagram
            poster={r.per_position.map((p) => ({
              etikett: p.position,
              varde: p.tackning,
              text: `${p.bokade}/${p.behov}`,
              farg: p.tackning >= 100 ? 'gron' : p.tackning >= 70 ? undefined : 'rod',
            }))}
            max={100}
          />
        </Kort>
        <Kort titel="Täckning per vecka">
          <Stapeldiagram
            poster={r.per_vecka.map((p) => ({
              etikett: p.vecka,
              varde: p.tackning,
              text: `${procent(p.tackning)}`,
              farg: p.tackning >= 100 ? 'gron' : p.tackning >= 70 ? undefined : 'rod',
            }))}
            max={100}
          />
        </Kort>
      </div>

      <Kort titel="Medlemmarnas insatser" undertext="Minst uppfylld kvot först" tat>
        <Tabell
          rader={r.medlemmar.filter((m) => !m.undantagen)}
          nyckel={(m) => m.medlem_id}
          kolumner={[
            { falt: 'namn', rubrik: 'Medlem', visa: (m) => <strong>{m.namn}</strong> },
            { falt: 'utfort', rubrik: 'Utfört h', sifra: true, visa: (m) => tal(m.utfort) },
            { falt: 'planerat', rubrik: 'Planerat h', sifra: true, visa: (m) => tal(m.planerat) },
            { falt: 'timmar', rubrik: 'Totalt h', sifra: true, visa: (m) => tal(m.timmar) },
            { falt: 'kvot', rubrik: 'Kvot', sifra: true, visa: (m) => tal(m.kvot) },
            {
              falt: 'andel', rubrik: 'Uppfyllt', bredd: 180,
              visa: (m) => (
                <div className="rad">
                  <span className="vaxa"><Matare andel={m.andel} /></span>
                  <span className="num liten">{procent(m.andel)}</span>
                </div>
              ),
            },
            { falt: 'antal_pass', rubrik: 'Pass', sifra: true },
            { falt: 'natt', rubrik: 'Natt', sifra: true },
            { falt: 'helg', rubrik: 'Helg', sifra: true },
          ]}
        />
      </Kort>

      <Kort titel="Pass som saknar folk" undertext={`${r.hal.length} rader`} tat>
        <Tabell
          rader={r.hal}
          tomtext="Allt är bemannat i perioden."
          maxhojd="45vh"
          kolumner={[
            { falt: 'datum', rubrik: 'Datum', visa: (p) => <span className="num">{langDatum(p.datum)}</span> },
            { falt: 'start', rubrik: 'Tid', visa: (p) => <span className="num">{p.start}–{p.slut}</span> },
            { falt: 'position', rubrik: 'Position' },
            { falt: 'slag', rubrik: 'Typ', visa: (p) => <Bricka farg={p.slag === 'natt' ? 'natt' : ''}>{PASSLAG[p.slag]}</Bricka> },
            { falt: 'bokade', rubrik: 'Bokade', sifra: true },
            { falt: 'behov', rubrik: 'Behov', sifra: true },
            { falt: 'saknas', rubrik: 'Saknas', sifra: true, visa: (p) => <Bricka farg="rod">{p.saknas}</Bricka> },
          ]}
        />
      </Kort>
    </>
  );
}
