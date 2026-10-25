// Rapportera en händelse – med rösten, med handskarna på.
//
// Flödet är tre steg och inte fler: prata, läs igenom, bekräfta. Det som
// AI:n tolkat visas som förslag att rätta, aldrig som färdig sanning, och
// ingenting hamnar i journalen förrän någon tryckt Bekräfta.
import { useState } from 'react';
import { api, hamtaMedCache } from '../api.js';
import { useRuta } from '../app.jsx';
import { Bricka, Omrade, Text, useHamta, useNotis, Val, Vanta } from '../delar.jsx';
import { klockslag, useInspelning } from '../../../delad/inspelning.js';

const MATFALT = [
  ['lufttemp', 'Lufttemperatur', '°C'],
  ['luftfukt', 'Luftfuktighet', '%'],
  ['vattentryck', 'Vattentryck', 'bar'],
  ['lufttryck', 'Lufttryck', 'bar'],
  ['vattenflode', 'Vattenflöde', 'l/s'],
];

export function Handelse() {
  const { ga } = useRuta();
  const notis = useNotis();
  const mik = useInspelning();
  const [text, sattText] = useState('');
  // Avskrift och tolkning tar några sekunder. Den som står i backen ska
  // veta vad som pågår, inte undra om appen hängt sig.
  const [steg, sattSteg] = useState(null);
  const skickar = !!steg;
  const [utkast, sattUtkast] = useState(null);
  const utrustning = useHamta(() => hamtaMedCache('/api/utrustning'));

  const skicka = async () => {
    if (!mik.ljud && !text.trim()) return notis('Spela in eller skriv något först', 'fel');
    sattSteg(mik.ljud ? 'Skriver av inspelningen …' : 'Tolkar …');
    try {
      const r = await api.skapa('/api/drift/tal', {
        ljud: mik.ljud,
        text: text.trim() || null,
        kalla: 'mobil',
      });
      if (r.stt_fel) notis(`Ljudet sparades men kunde inte skrivas av: ${r.stt_fel}`, 'fel');
      // Att AI:n är avstängd är inget fel – sidan säger redan att ingen
      // tolkning gjordes, och texten finns kvar.
      if (r.ai_fel && !/inte konfigurerad/i.test(r.ai_fel))
        notis('Tolkningen gick inte – fyll i själv, texten finns kvar.', 'info');
      sattUtkast(r.post);
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSteg(null);
    }
  };

  if (utkast)
    return (
      <Granska
        post={utkast}
        utrustning={utrustning.data?.data || []}
        klar={() => {
          notis('Skrivet i driftjournalen', 'ok');
          ga('hem');
        }}
        avbryt={() => {
          sattUtkast(null);
          mik.nollstall();
          sattText('');
        }}
      />
    );

  return (
    <section className="kort">
      <header>
        <h2>Rapportera händelse</h2>
        <p className="liten svag" style={{ margin: '4px 0 12px' }}>
          Prata på som du skulle berättat det för Jonas. Du får läsa igenom innan något sparas.
        </p>
      </header>

      <div className="mikrofon">
        <button
          className={`stor ${mik.spelar ? 'spelar' : ''}`}
          onClick={mik.spelar ? mik.stoppa : mik.starta}
          disabled={skickar}
        >
          <span className="fig" aria-hidden="true">{mik.spelar ? '■' : '●'}</span>
          {mik.spelar ? `Spelar in ${klockslag(mik.sekunder)} – tryck för att stoppa` : 'Spela in'}
        </button>
        {mik.ljud && !mik.spelar && (
          <p className="liten">
            <Bricka farg="ok">Inspelning {klockslag(mik.sekunder)}</Bricka>{' '}
            <button className="tom" onClick={mik.nollstall}>Spela in igen</button>
          </p>
        )}
      </div>

      <Omrade
        etikett="Eller skriv"
        varde={text}
        satt={sattText}
        rows={4}
        placeholder="Trycket var okej, kanon fyra hade isat igen men jag avisade den."
      />

      <button className="knapp stor" onClick={skicka} disabled={skickar}>
        {steg || 'Fortsätt'}
      </button>
      {skickar && (
        <p className="liten svag" style={{ textAlign: 'center', margin: '8px 0 0' }}>
          Tar några sekunder. Ingenting sparas i journalen förrän du bekräftat.
        </p>
      )}
    </section>
  );
}

/** Steg två: läs igenom, rätta, bekräfta. */
function Granska({ post, utrustning, klar, avbryt }) {
  const notis = useNotis();
  const f = post.forslag || {};
  const [varden, sattVarden] = useState(f.matvarden || {});
  const [brodtext, sattBrodtext] = useState(
    [f.observation, f.atgard && `Åtgärd: ${f.atgard}`].filter(Boolean).join('\n') ||
      post.transkript ||
      ''
  );
  const [utrId, sattUtrId] = useState(post.utrustning_id ? String(post.utrustning_id) : '');
  const [slag, sattSlag] = useState(f.atgard ? 'atgard' : post.slag || 'observation');
  const [arende, sattArende] = useState(!!f.forslag_arende);
  const [sparar, sattSparar] = useState(false);

  const bekrafta = async () => {
    sattSparar(true);
    try {
      await api.skapa(`/api/drift/journal/${post.id}/bekrafta`, {
        text: brodtext,
        slag,
        utrustning_id: utrId ? Number(utrId) : null,
        matvarden: varden,
        skapa_arende: arende,
        arende_titel: arende ? (f.sammanfattning || brodtext).slice(0, 160) : null,
        allvarlighet: f.allvarlighet || null,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
      sattSparar(false);
    }
  };

  return (
    <section className="kort">
      <header>
        <h2>Stämmer det här?</h2>
        <p className="liten svag" style={{ margin: '4px 0 12px' }}>
          {post.forslag
            ? 'Tolkat från det du sa. Rätta det som blivit fel – inget är sparat än.'
            : 'Ingen tolkning gjordes. Fyll i det som ska stå i journalen.'}
        </p>
      </header>

      {post.transkript && (
        <blockquote className="citat">
          <span className="liten svag">Du sa</span>
          {post.transkript}
        </blockquote>
      )}

      <Val
        etikett="Vad är det här?"
        varde={slag}
        satt={sattSlag}
        tomtext={null}
        poster={[
          { varde: 'observation', text: 'Något jag såg' },
          { varde: 'atgard', text: 'Något jag gjorde' },
          { varde: 'rond', text: 'En rond jag gick' },
        ]}
      />

      <Val
        etikett={f.valj_utrustning ? 'Vilken utrustning menade du?' : 'Utrustning'}
        varde={utrId}
        satt={sattUtrId}
        tomtext="– ingen särskild –"
        poster={(utrustning || []).map((u) => ({ varde: String(u.id), text: u.namn }))}
      />
      {f.valj_utrustning && (
        <p className="liten varningstext">
          {f.namnda?.length > 1
            ? `Du nämnde flera: ${f.namnda.map((u) => u.namn).join(', ')}. Välj vilken rapporten gäller.`
            : `Jag hörde ”${f.utrustning}” men kunde inte avgöra vilken det var. Välj själv.`}
        </p>
      )}

      <Omrade etikett="Det som ska stå i journalen" varde={brodtext} satt={sattBrodtext} rows={5} />

      {!!Object.keys(varden).length && (
        <div className="matvarden">
          <p className="liten svag">
            Mätvärden ur det du sa – kontrollera siffrorna. De sparas som manuellt rapporterade.
          </p>
          {MATFALT.filter(([n]) => varden[n] != null).map(([namn, etikett, enhet]) => (
            <Text
              key={namn}
              etikett={`${etikett} (${enhet})`}
              varde={varden[namn]}
              satt={(v) => sattVarden({ ...varden, [namn]: v === '' ? null : Number(v) })}
              type="number"
              inputMode="decimal"
            />
          ))}
        </div>
      )}

      <label className="kryss">
        <input type="checkbox" checked={arende} onChange={(e) => sattArende(e.target.checked)} />
        <span>
          Skapa ett ärende av det här
          {f.forslag_arende ? <Bricka farg="varning">föreslaget</Bricka> : null}
        </span>
      </label>

      <div className="rad">
        <button className="knapp stor" onClick={bekrafta} disabled={sparar}>
          {sparar ? 'Sparar …' : 'Bekräfta'}
        </button>
        <button className="tom" onClick={avbryt} disabled={sparar}>Börja om</button>
      </div>
    </section>
  );
}
