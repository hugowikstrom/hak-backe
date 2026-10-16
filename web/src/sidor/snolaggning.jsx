// Snöläggning: rapportera mätvärden, följ utrustningen och håll koll på klartecknet.
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Lank, useJag } from '../app.jsx';
import { Bricka, Kort, Lada, Linjegraf, Nyckeltal, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { Prognos } from '../delar/prognos.jsx';
import {
  grader, initialer, KLARTECKEN, klarteckenLokalt, klockslag, minstRoll, sedan, tal,
  tidpunkt, UTRUSTNINGSTYP, wetbulbLokalt,
} from '../nytta.js';

const TOM = {
  utrustning_id: '', lufttemp: '', luftfukt: '', vattenflode: '', vattentryck: '',
  lufttryck: '', barometer: '', vind_styrka: '', vind_riktning: '', snokvalitet: '', anteckning: '',
};

export function Snolaggning() {
  const jag = useJag();
  const notis = useNotis();
  const nulage = useHamta(() => api.hamta('/api/sno/nulage'));
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const matningar = useHamta(() => api.hamta('/api/sno/matningar?antal=120'));
  const [form, sattForm] = useState(TOM);
  const [sparar, sattSparar] = useState(false);
  const [visaAllt, sattVisaAllt] = useState(false);
  const [nyttArende, sattNyttArende] = useState(null);

  const satt = (f) => (v) => sattForm((g) => ({ ...g, [f]: v }));
  const vk = wetbulbLokalt(form.lufttemp, form.luftfukt);
  const niva = klarteckenLokalt(vk);

  const snokanoner = useMemo(
    () => (utrustning.data || []).filter((u) => ['lans', 'flakt', 'pumpstation', 'kompressor'].includes(u.typ) && u.aktiv),
    [utrustning.data]
  );
  const senastePer = useMemo(() => {
    const m = new Map();
    for (const r of nulage.data?.senaste || []) m.set(r.utrustning_id, r);
    return m;
  }, [nulage.data]);

  const skicka = async (e) => {
    e.preventDefault();
    sattSparar(true);
    try {
      const kropp = { ...form, snopass_id: nulage.data?.pass?.id };
      for (const k of Object.keys(kropp)) if (kropp[k] === '') delete kropp[k];
      const m = await api.skapa('/api/sno/matningar', kropp);
      notis(`Mätning sparad. Wetbulb ${tal(m.wetbulb)} °C – ${KLARTECKEN[m.klartecken.niva].toLowerCase()}.`);
      sattForm((g) => ({ ...TOM, utrustning_id: g.utrustning_id }));
      nulage.uppdatera();
      matningar.uppdatera();
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattSparar(false);
    }
  };

  const passknapp = async () => {
    try {
      if (nulage.data?.pass) {
        await api.spara(`/api/sno/pass/${nulage.data.pass.id}`, { status: 'avslutat' });
        notis('Snöpasset avslutat.');
      } else {
        await api.skapa('/api/sno/pass', {});
        notis('Snöpass startat.');
      }
      nulage.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const sattStatus = async (u, status) => {
    try {
      await api.spara(`/api/utrustning/${u.id}`, { status });
      utrustning.uppdatera();
      notis(`${u.namn}: ${status === 'drift' ? 'i drift' : status === 'service' ? 'service' : 'ur drift'}.`);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  if (nulage.laddar && !nulage.data) return <Vanta />;
  const kt = nulage.data.klartecken;
  const rader = (matningar.data || []).slice(0, visaAllt ? 120 : 25);
  const punkter = (matningar.data || [])
    .filter((r) => r.wetbulb != null)
    .slice(0, 60)
    .reverse()
    .map((r) => ({ x: klockslag(r.tid), a: r.wetbulb, b: r.lufttemp }));

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Snöläggning</h1>
          <div className="undertext">
            {nulage.data.pass
              ? `Snöpass pågår sedan ${tidpunkt(nulage.data.pass.start)}${nulage.data.pass.ansvarig ? ` · ansvarig ${nulage.data.pass.ansvarig}` : ''}`
              : 'Inget snöpass pågår'}
          </div>
        </div>
        <div className="knapprad">
          <button onClick={passknapp}>{nulage.data.pass ? 'Avsluta snöpass' : 'Starta snöpass'}</button>
          <a className="knapp" href="/api/sno/matningar.csv">Exportera CSV</a>
        </div>
      </div>

      <div className="tva">
        <Kort titel="Ny mätning" undertext="Temperatur och fukt räknas om till wetbulb direkt">
          <form onSubmit={skicka} className="kolumn">
            <div className="faltrad">
              <Val
                etikett="Utrustning"
                varde={form.utrustning_id}
                satt={satt('utrustning_id')}
                tomtext="Allmän mätning"
                poster={snokanoner.map((u) => ({ varde: u.id, text: `${u.namn} (${UTRUSTNINGSTYP[u.typ]})` }))}
              />
              <Text etikett="Lufttemp °C" typ="number" step="0.1" varde={form.lufttemp} satt={satt('lufttemp')} />
              <Text etikett="Luftfukt %" typ="number" step="1" varde={form.luftfukt} satt={satt('luftfukt')} />
              <Text etikett="Vattenflöde l/s" typ="number" step="0.1" varde={form.vattenflode} satt={satt('vattenflode')} />
            </div>
            <div className="faltrad">
              <Text etikett="Vattentryck bar" typ="number" step="0.1" varde={form.vattentryck} satt={satt('vattentryck')} />
              <Text etikett="Lufttryck bar" typ="number" step="0.1" varde={form.lufttryck} satt={satt('lufttryck')} />
              <Text etikett="Barometer hPa" typ="number" step="1" varde={form.barometer} satt={satt('barometer')} />
              <Text etikett="Vind m/s" typ="number" step="0.1" varde={form.vind_styrka} satt={satt('vind_styrka')} />
              <Val
                etikett="Vindriktning"
                varde={form.vind_riktning}
                satt={satt('vind_riktning')}
                poster={['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'].map((v) => ({ varde: v, text: v }))}
              />
              <Val
                etikett="Snökvalitet"
                varde={form.snokvalitet}
                satt={satt('snokvalitet')}
                poster={[
                  { varde: 'torr', text: 'Torr' },
                  { varde: 'normal', text: 'Normal' },
                  { varde: 'blot', text: 'Blöt' },
                ]}
              />
            </div>
            <Text etikett="Anteckning" varde={form.anteckning} satt={satt('anteckning')} />
            <div className={`klartecken ${niva}`}>
              <div className="lampa">{vk != null ? tal(vk) : '?'}</div>
              <div className="kolumn" style={{ gap: 0 }}>
                <strong>Wetbulb {vk != null ? `${tal(vk)} °C` : '– °C'}</strong>
                <span className="liten svag">{KLARTECKEN[niva]} – räknas om när du sparar</span>
              </div>
              <button className="primar" style={{ marginLeft: 'auto' }} disabled={sparar}>
                {sparar ? 'Sparar …' : 'Spara mätning'}
              </button>
            </div>
          </form>
        </Kort>

        <Kort titel="Nuläge" undertext={nulage.data.senasteMatning ? `Senaste mätning ${sedan(nulage.data.senasteMatning.tid)}` : 'Ingen mätning ännu'}>
          <div className={`klartecken ${kt.niva}`}>
            <div className="lampa">{kt.wetbulb != null ? tal(kt.wetbulb) : '?'}</div>
            <div className="kolumn" style={{ gap: 2 }}>
              <strong>{KLARTECKEN[kt.niva]}</strong>
              <span className="liten svag">{kt.text}</span>
            </div>
          </div>
          {punkter.length > 1 && (
            <>
              <div className="skiljare" />
              <Linjegraf punkter={punkter} etikett_a="wetbulb °C" etikett_b="lufttemp °C" />
            </>
          )}
        </Kort>
      </div>

      <Prognos />

      <Kort
        titel="Lansar, fläktar och pumpar"
        undertext="Senaste värde per enhet. Klicka på en rad för att rapportera för den."
        tat
      >
        <Tabell
          rader={snokanoner}
          tomtext="Ingen snöläggningsutrustning registrerad."
          vidKlick={(u) => sattForm((g) => ({ ...g, utrustning_id: u.id }))}
          vald={Number(form.utrustning_id) || null}
          kolumner={[
            { falt: 'namn', rubrik: 'Enhet', visa: (u) => <strong>{u.namn}</strong> },
            { falt: 'typ', rubrik: 'Typ', visa: (u) => UTRUSTNINGSTYP[u.typ] },
            { falt: 'omrade', rubrik: 'Område' },
            {
              falt: 'status', rubrik: 'Status', sortlos: true,
              visa: (u) => (
                <div className="segment">
                  {[['drift', 'Drift'], ['service', 'Service'], ['ur_drift', 'Ur drift']].map(([v, t]) => (
                    <button
                      key={v}
                      className="liten"
                      aria-pressed={u.status === v}
                      onClick={(e) => { e.stopPropagation(); sattStatus(u, v); }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ),
            },
            {
              falt: 'wetbulb', rubrik: 'Wetbulb', sifra: true, sortlos: true,
              visa: (u) => {
                const m = senastePer.get(u.id);
                return m?.wetbulb != null ? (
                  <Bricka farg={m.klartecken.niva === 'nej' ? 'fara' : m.klartecken.niva === 'marginellt' ? 'varning' : 'ok'}>
                    {tal(m.wetbulb)} °C
                  </Bricka>
                ) : '–';
              },
            },
            { falt: 'temp', rubrik: 'Temp', sifra: true, sortlos: true, visa: (u) => grader(senastePer.get(u.id)?.lufttemp) },
            { falt: 'flode', rubrik: 'Flöde l/s', sifra: true, sortlos: true, visa: (u) => tal(senastePer.get(u.id)?.vattenflode) },
            { falt: 'senast', rubrik: 'Senast', sortlos: true, visa: (u) => <span className="liten svag">{senastePer.get(u.id) ? sedan(senastePer.get(u.id).tid) : 'aldrig'}</span> },
            {
              falt: 'atgard', rubrik: '', sortlos: true,
              visa: (u) => (
                <div className="knapprad">
                  <Lank till={`/checklistor?utrustning=${u.id}`} className="knapp liten">Checklista</Lank>
                  <button className="liten" onClick={(e) => { e.stopPropagation(); sattNyttArende(u); }}>Ärende</button>
                </div>
              ),
            },
          ]}
        />
      </Kort>

      <Kort
        titel="Mätningslogg"
        undertext="Dina egna värden kan rättas direkt i tabellen"
        verktyg={<Ruta etikett="Visa fler" pa={visaAllt} satt={sattVisaAllt} />}
        tat
      >
        <Tabell
          rader={rader}
          maxhojd="55vh"
          tomtext="Inga mätningar rapporterade."
          kolumner={[
            { falt: 'tid', rubrik: 'Tid', visa: (r) => <span className="num">{tidpunkt(r.tid)}</span> },
            { falt: 'utrustning', rubrik: 'Enhet', visa: (r) => r.utrustning || r.omrade || 'Allmän' },
            { falt: 'lufttemp', rubrik: 'Temp °C', sifra: true, ...faltRedigering('lufttemp', matningar, jag) },
            { falt: 'luftfukt', rubrik: 'Fukt %', sifra: true, ...faltRedigering('luftfukt', matningar, jag) },
            {
              falt: 'wetbulb', rubrik: 'Wetbulb', sifra: true,
              visa: (r) => (
                <span title={r.wetbulb_beraknad ? 'Framräknad ur temp och fukt' : 'Rapporterad'}>
                  {tal(r.wetbulb)}
                  {r.wetbulb_beraknad ? '*' : ''}
                </span>
              ),
            },
            { falt: 'vattenflode', rubrik: 'Flöde l/s', sifra: true, ...faltRedigering('vattenflode', matningar, jag) },
            { falt: 'vattentryck', rubrik: 'Vatten bar', sifra: true, ...faltRedigering('vattentryck', matningar, jag) },
            { falt: 'lufttryck', rubrik: 'Luft bar', sifra: true, ...faltRedigering('lufttryck', matningar, jag) },
            { falt: 'vind_styrka', rubrik: 'Vind', sifra: true, visa: (r) => `${tal(r.vind_styrka)} ${r.vind_riktning || ''}` },
            { falt: 'snokvalitet', rubrik: 'Snö', visa: (r) => (r.snokvalitet ? <Bricka farg={r.snokvalitet === 'blot' ? 'varning' : ''}>{r.snokvalitet}</Bricka> : '–') },
            { falt: 'anteckning', rubrik: 'Anteckning' },
            { falt: 'av', rubrik: 'Av', visa: (r) => <span className="initial" title={r.av}>{initialer(r.av)}</span> },
          ]}
        />
      </Kort>

      {nyttArende && (
        <ArendeLada
          utrustning={nyttArende}
          stang={() => sattNyttArende(null)}
          klar={() => { sattNyttArende(null); notis('Ärendet skapat.'); }}
        />
      )}
    </>
  );
}

/** Inlinefält i mätningsloggen: egna rader, eller ansvariga, får rätta. */
function faltRedigering(falt, kalla, jag) {
  return {
    redigera: {
      typ: 'number',
      steg: '0.1',
      spara: async (rad, varde) => {
        if (rad.av_id !== jag.id && !minstRoll(jag, 'backansvarig')) return;
        await api.spara(`/api/sno/matningar/${rad.id}`, { [falt]: varde === '' ? null : varde });
        kalla.uppdatera();
      },
    },
  };
}

function ArendeLada({ utrustning, stang, klar }) {
  const notis = useNotis();
  const [titel, sattTitel] = useState('');
  const [beskrivning, sattBeskrivning] = useState('');
  const [prioritet, sattPrioritet] = useState('2');
  const [allvarlighet, sattAllvarlighet] = useState('driftstopp');
  const skicka = async () => {
    try {
      await api.skapa('/api/arenden', {
        titel, beskrivning, prioritet, allvarlighet, typ: 'fel',
        utrustning_id: utrustning.id, omrade_id: utrustning.omrade_id,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };
  return (
    <Lada
      titel={`Nytt ärende – ${utrustning.namn}`}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={!titel.trim()} onClick={skicka}>Skapa ärende</button>
        </>
      }
    >
      <Text etikett="Titel" krav varde={titel} satt={sattTitel} autoFocus />
      <label className="falt">
        <span>Beskrivning</span>
        <textarea value={beskrivning} onChange={(e) => sattBeskrivning(e.target.value)} />
      </label>
      <div className="faltrad">
        <Val
          etikett="Prioritet" varde={prioritet} satt={sattPrioritet} tomtext={null}
          poster={[
            { varde: '1', text: '1 Akut' }, { varde: '2', text: '2 Hög' },
            { varde: '3', text: '3 Normal' }, { varde: '4', text: '4 Låg' },
          ]}
        />
        <Val
          etikett="Allvarlighet" varde={allvarlighet} satt={sattAllvarlighet} tomtext={null}
          poster={[
            { varde: 'sakerhetsrisk', text: 'Säkerhetsrisk' }, { varde: 'driftstopp', text: 'Driftstopp' },
            { varde: 'begransar', text: 'Begränsar' }, { varde: 'kosmetisk', text: 'Kosmetisk' },
          ]}
        />
      </div>
    </Lada>
  );
}
