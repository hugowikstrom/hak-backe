// Checklistor: starta och genomföra körningar, och för ansvariga: bygga mallar.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Lada, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { INTERVALL, minstRoll, sedan, tidpunkt, UTRUSTNINGSTYP } from '../nytta.js';

export function Checklistor() {
  const jag = useJag();
  const notis = useNotis();
  const param = new URLSearchParams(window.location.search);
  const [flik, sattFlik] = useState(param.get('mallar') ? 'mallar' : 'korningar');
  const [korningId, sattKorningId] = useState(param.get('korning') ? Number(param.get('korning')) : null);
  const [starta, sattStarta] = useState(param.get('utrustning') ? { utrustning_id: Number(param.get('utrustning')) } : null);

  const mallar = useHamta(() => api.hamta('/api/checklistor/mallar'));
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const omraden = useHamta(() => api.hamta('/api/omraden'));
  const korningar = useHamta(() => api.hamta('/api/checklistor/korningar?antal=120'));
  const lage = useHamta(() => api.hamta('/api/checklistor/lage'));

  const flikar = [
    { nyckel: 'korningar', text: 'Körningar' },
    { nyckel: 'mallar', text: minstRoll(jag, 'backansvarig') ? 'Mallar (redigera)' : 'Mallar' },
  ];

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Checklistor</h1>
          <div className="undertext">Rutiner per lans, fläkt, område och för backansvarig</div>
        </div>
        <div className="knapprad">
          <button className="primar" onClick={() => sattStarta({})}>Starta checklista</button>
        </div>
      </div>

      <Flikar flikar={flikar} aktiv={flik} satt={sattFlik} />

      {flik === 'korningar' ? (
        <>
          <AttGora
            lage={lage}
            starta={async (mall_id, objekt) => {
              try {
                const k = await api.skapa('/api/checklistor/korningar', {
                  mall_id,
                  utrustning_id: objekt.slag === 'utrustning' ? objekt.id : null,
                  omrade_id: objekt.slag === 'omrade' ? objekt.id : null,
                });
                sattKorningId(k.id);
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          />
          <Kort titel="Senaste körningar" tat>
          {korningar.laddar && !korningar.data ? (
            <Vanta />
          ) : (
            <Tabell
              rader={korningar.data || []}
              tomtext="Inga körningar ännu."
              vidKlick={(k) => sattKorningId(k.id)}
              vald={korningId}
              kolumner={[
                { falt: 'startad', rubrik: 'Startad', visa: (k) => <span className="num">{tidpunkt(k.startad)}</span> },
                { falt: 'mall', rubrik: 'Checklista', visa: (k) => <strong>{k.mall}</strong> },
                { falt: 'utrustning', rubrik: 'Gäller', visa: (k) => k.utrustning || k.omrade || 'Allmänt' },
                { falt: 'intervall', rubrik: 'Intervall', visa: (k) => INTERVALL[k.intervall] },
                { falt: 'av', rubrik: 'Av' },
                {
                  falt: 'antal_svar', rubrik: 'Svar', sifra: true,
                  visa: (k) => `${k.antal_svar}/${k.antal_punkter}`,
                },
                {
                  falt: 'antal_avvikelser', rubrik: 'Avvikelser', sifra: true,
                  visa: (k) => (k.antal_avvikelser ? <Bricka farg="gul">{k.antal_avvikelser}</Bricka> : '–'),
                },
                {
                  falt: 'status', rubrik: 'Status',
                  visa: (k) => <Bricka farg={k.status === 'klar' ? 'gron' : 'klubb'}>{k.status === 'klar' ? 'Klar' : 'Pågår'}</Bricka>,
                },
              ]}
            />
            )}
          </Kort>
        </>
      ) : (
        <Mallar mallar={mallar} utrustning={utrustning} omraden={omraden} jag={jag} />
      )}

      {starta && (
        <StartaLada
          forval={starta}
          mallar={mallar.data || []}
          utrustning={(utrustning.data || []).filter((u) => u.aktiv)}
          omraden={omraden.data || []}
          stang={() => sattStarta(null)}
          klar={(k) => { sattStarta(null); sattKorningId(k.id); korningar.uppdatera(); }}
        />
      )}

      {korningId && (
        <KorningLada
          id={korningId}
          stang={() => { sattKorningId(null); korningar.uppdatera(); lage.uppdatera(); }}
          notis={notis}
        />
      )}
    </>
  );
}

/** Vad som ska göras i dag, enligt checklistornas intervall. */
function AttGora({ lage, starta }) {
  if (lage.laddar && !lage.data) return <Kort titel="Att göra i dag"><Vanta /></Kort>;
  if (lage.fel) return null;
  const kvar = lage.data.mallar.filter((m) => m.kvar);
  const klara = lage.data.mallar.filter((m) => !m.kvar && m.klara);
  return (
    <Kort
      titel="Att göra i dag"
      undertext={
        lage.data.kvar
          ? `${lage.data.kvar} ronder kvar · ${lage.data.klara} gjorda${lage.data.snopass ? ' · snöpass pågår' : ''}`
          : 'Allt som skulle göras i dag är gjort'
      }
    >
      {kvar.length ? (
        <div className="kolumn">
          {kvar.map((m) => (
            <div key={m.mall_id}>
              <div className="rad-mellan" style={{ marginBottom: 4 }}>
                <strong>{m.namn}</strong>
                <span className="rad">
                  <Bricka>{INTERVALL[m.intervall]}</Bricka>
                  <Bricka farg="gul">{m.kvar} kvar</Bricka>
                  {!!m.klara && <Bricka farg="gron">{m.klara} klara</Bricka>}
                </span>
              </div>
              <div className="knapprad">
                {m.objekt
                  .filter((o) => o.behovs)
                  .map((o) => (
                    <button key={`${o.slag}-${o.id}`} className="liten" onClick={() => starta(m.mall_id, o)}>
                      {o.namn}
                    </button>
                  ))}
                {m.objekt
                  .filter((o) => o.klar)
                  .map((o) => (
                    <span key={`klar-${o.slag}-${o.id}`} className="bricka gron" title={`Gjord ${tidpunkt(o.senast)}${o.senast_av ? ` av ${o.senast_av}` : ''}`}>
                      ✓ {o.namn}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="meddelande ok">
          Allt är gjort. {klara.length ? `${lage.data.klara} ronder avklarade i dag.` : ''}
        </div>
      )}
      {!lage.data.snopass && (
        <p className="liten svagare" style={{ marginTop: 8, marginBottom: 0 }}>
          Checklistor för snöläggning visas när ett snöpass är igång.
        </p>
      )}
    </Kort>
  );
}

function StartaLada({ forval, mallar, utrustning, omraden, stang, klar }) {
  const notis = useNotis();
  const [utrustningId, sattUtrustning] = useState(forval.utrustning_id ? String(forval.utrustning_id) : '');
  const [omradeId, sattOmrade] = useState('');
  const [mallId, sattMall] = useState('');
  const [passande, sattPassande] = useState([]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (utrustningId) p.set('utrustning_id', utrustningId);
    if (omradeId) p.set('omrade_id', omradeId);
    const stig = `/api/checklistor/for${p.toString() ? `?${p}` : ''}`;
    api.hamta(stig).then((d) => {
      sattPassande(d);
      sattMall((m) => (d.some((x) => String(x.id) === m) ? m : d[0] ? String(d[0].id) : ''));
    });
  }, [utrustningId, omradeId]);

  const lista = (utrustningId || omradeId ? passande : mallar).filter((m) => m.aktiv);

  const skicka = async () => {
    try {
      const k = await api.skapa('/api/checklistor/korningar', {
        mall_id: mallId,
        utrustning_id: utrustningId || null,
        omrade_id: omradeId || null,
      });
      klar(k);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      titel="Starta checklista"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={!mallId} onClick={skicka}>Starta</button>
        </>
      }
    >
      <div className="faltrad">
        <Val
          etikett="Utrustning" varde={utrustningId} satt={(v) => { sattUtrustning(v); sattOmrade(''); }}
          tomtext="– ingen –"
          poster={utrustning.map((u) => ({ varde: u.id, text: `${u.namn} (${UTRUSTNINGSTYP[u.typ]})` }))}
        />
        <Val
          etikett="Område" varde={omradeId} satt={(v) => { sattOmrade(v); sattUtrustning(''); }}
          tomtext="– inget –" poster={omraden.map((o) => ({ varde: o.id, text: o.namn }))}
        />
      </div>
      <Val
        etikett="Checklista" krav varde={mallId} satt={sattMall} tomtext={lista.length ? null : '– ingen passande –'}
        poster={lista.map((m) => ({ varde: m.id, text: `${m.namn} · ${INTERVALL[m.intervall]} · ${m.punkter?.length ?? 0} punkter` }))}
      />
      {!!(utrustningId || omradeId) && !lista.length && (
        <div className="meddelande varning">Ingen mall matchar valet. Välj bort filtret eller skapa en mall.</div>
      )}
    </Lada>
  );
}

function KorningLada({ id, stang, notis }) {
  const { data: k, laddar, uppdatera } = useHamta(() => api.hamta(`/api/checklistor/korningar/${id}`), [id]);
  const [sparar, sattSparar] = useState(null);

  const svara = async (punkt, data) => {
    sattSparar(punkt.id);
    try {
      await api.spara(`/api/checklistor/svar/${id}/${punkt.id}`, data);
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSparar(null);
    }
  };

  const avsluta = async (tvinga) => {
    try {
      const r = await api.skapa(`/api/checklistor/korningar/${id}/avsluta`, { tvinga });
      notis(
        r.nya_arenden.length
          ? `Checklistan är klar. ${r.nya_arenden.length} ärende(n) skapades av avvikelserna.`
          : 'Checklistan är klar.'
      );
      stang();
    } catch (e) {
      if (/obligatoriska/.test(e.message) && confirm(`${e.message}. Avsluta ändå?`)) return avsluta(true);
      notis(e.message, 'fel');
    }
  };

  if (laddar && !k) return <Lada titel="Checklista" stang={stang}><Vanta /></Lada>;

  const klara = k.punkter.filter((p) => p.bockad || p.varde != null || p.svarstext).length;
  const avvikelser = k.punkter.filter((p) => p.avvikelse).length;

  return (
    <Lada
      bred
      titel={`${k.mall} – ${k.utrustning || k.omrade || 'allmänt'}`}
      stang={stang}
      fot={
        <>
          <span className="vaxa liten svag">
            {klara}/{k.punkter.length} besvarade{avvikelser ? ` · ${avvikelser} avvikelser` : ''}
          </span>
          <button onClick={stang}>Stäng</button>
          {k.status !== 'klar' && (
            <button className="primar" onClick={() => avsluta(false)}>Markera klar</button>
          )}
        </>
      }
    >
      {k.status === 'klar' && (
        <div className="meddelande ok">Avslutad {tidpunkt(k.avslutad)} av {k.av}.</div>
      )}
      <div className="kort" style={{ boxShadow: 'none' }}>
        {k.punkter.map((p) => (
          <div
            key={p.id}
            className={`punkt${p.avvikelse ? ' avvikande' : p.bockad || p.varde != null || p.svarstext ? ' klar' : ''}`}
            style={sparar === p.id ? { opacity: 0.6 } : undefined}
          >
            <div>
              {p.svarstyp === 'bock' ? (
                <input
                  type="checkbox"
                  checked={!!p.bockad}
                  disabled={k.status === 'klar'}
                  onChange={(e) => svara(p, { bockad: e.target.checked, avvikelse: p.avvikelse, kommentar: p.kommentar })}
                />
              ) : (
                <span className="chip">{p.svarstyp === 'varde' ? 'värde' : 'text'}</span>
              )}
            </div>
            <div className="text">
              <span>
                {p.text}
                {!p.obligatorisk && <span className="svagare liten"> (frivillig)</span>}
              </span>
              {p.hjalptext && <span className="hjalp">{p.hjalptext}</span>}
              {p.svarstyp === 'varde' && (
                <div className="rad" style={{ gap: 6 }}>
                  <input
                    type="number"
                    step="0.1"
                    style={{ width: 110 }}
                    defaultValue={p.varde ?? ''}
                    disabled={k.status === 'klar'}
                    onBlur={(e) => svara(p, { varde: e.target.value === '' ? null : e.target.value, bockad: e.target.value !== '', avvikelse: p.avvikelse, kommentar: p.kommentar })}
                  />
                  {p.enhet && <span className="svag liten">{p.enhet}</span>}
                </div>
              )}
              {p.svarstyp === 'text' && (
                <textarea
                  defaultValue={p.svarstext ?? ''}
                  disabled={k.status === 'klar'}
                  onBlur={(e) => svara(p, { text: e.target.value, bockad: !!e.target.value, avvikelse: p.avvikelse, kommentar: p.kommentar })}
                />
              )}
              {p.avvikelse && (
                <input
                  placeholder="Vad är fel? Blir ett ärende när checklistan avslutas."
                  defaultValue={p.kommentar ?? ''}
                  disabled={k.status === 'klar'}
                  onBlur={(e) => svara(p, { bockad: p.bockad, avvikelse: true, kommentar: e.target.value })}
                />
              )}
            </div>
            <div>
              <button
                className={`liten${p.avvikelse ? ' fara' : ''}`}
                disabled={k.status === 'klar'}
                onClick={() => svara(p, { bockad: p.bockad, avvikelse: !p.avvikelse, kommentar: p.kommentar })}
                title="Markera avvikelse – skapar ärende vid avslut"
              >
                {p.avvikelse ? 'Avvikelse ✕' : 'Avvikelse'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Lada>
  );
}

function Mallar({ mallar, utrustning, omraden, jag }) {
  const notis = useNotis();
  const [redigerar, sattRedigerar] = useState(null);
  const far = minstRoll(jag, 'backansvarig');
  const typer = useMemo(
    () => [...new Set((utrustning.data || []).map((u) => u.typ))],
    [utrustning.data]
  );

  if (mallar.laddar && !mallar.data) return <Vanta />;

  return (
    <>
      <Kort
        titel="Mallar"
        undertext="En mall är en rutin. Omfattningen avgör var den dyker upp."
        verktyg={far && <button className="primar liten" onClick={() => sattRedigerar({ ny: true, punkter: [] })}>Ny mall</button>}
        tat
      >
        <Tabell
          rader={mallar.data || []}
          tomtext="Inga mallar."
          vidKlick={far ? (m) => sattRedigerar(m) : undefined}
          kolumner={[
            { falt: 'namn', rubrik: 'Namn', visa: (m) => <strong>{m.namn}</strong> },
            {
              falt: 'omfattning', rubrik: 'Gäller',
              visa: (m) =>
                m.omfattning === 'utrustningstyp'
                  ? `Alla ${UTRUSTNINGSTYP[m.utrustningstyp]?.toLowerCase() || m.utrustningstyp}ar`
                  : m.omfattning === 'omrade'
                    ? (omraden.data || []).find((o) => o.id === m.omrade_id)?.namn || 'Område'
                    : 'Allmänt',
            },
            { falt: 'intervall', rubrik: 'Intervall', visa: (m) => INTERVALL[m.intervall] },
            { falt: 'punkter', rubrik: 'Punkter', sifra: true, visa: (m) => m.punkter.length },
            { falt: 'aktiv', rubrik: 'Status', visa: (m) => (m.aktiv ? <Bricka farg="gron">Aktiv</Bricka> : <Bricka>Vilande</Bricka>) },
          ]}
        />
      </Kort>

      {redigerar && (
        <MallLada
          mall={redigerar}
          typer={typer}
          omraden={omraden.data || []}
          stang={() => sattRedigerar(null)}
          klar={() => { sattRedigerar(null); mallar.uppdatera(); notis('Mallen sparad.'); }}
        />
      )}
    </>
  );
}

function MallLada({ mall, typer, omraden, stang, klar }) {
  const notis = useNotis();
  const [form, sattForm] = useState({
    namn: mall.namn || '',
    omfattning: mall.omfattning || 'allmant',
    utrustningstyp: mall.utrustningstyp || typer[0] || 'lans',
    omrade_id: mall.omrade_id || omraden[0]?.id || '',
    intervall: mall.intervall || 'per_pass',
    beskrivning: mall.beskrivning || '',
    aktiv: mall.aktiv === undefined ? true : !!mall.aktiv,
  });
  const [punkter, sattPunkter] = useState(
    (mall.punkter || []).map((p) => ({ ...p })) || []
  );
  const satt = (f) => (v) => sattForm((g) => ({ ...g, [f]: v }));
  const sattPunkt = (i, f, v) => sattPunkter((p) => p.map((x, j) => (j === i ? { ...x, [f]: v } : x)));
  const flytta = (i, steg) =>
    sattPunkter((p) => {
      const n = [...p];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + steg)), 0, x);
      return n;
    });

  const skicka = async () => {
    const kropp = {
      ...form,
      aktiv: form.aktiv,
      utrustningstyp: form.omfattning === 'utrustningstyp' ? form.utrustningstyp : null,
      omrade_id: form.omfattning === 'omrade' ? form.omrade_id : null,
      punkter: punkter.filter((p) => p.text?.trim()),
    };
    try {
      if (mall.ny) await api.skapa('/api/checklistor/mallar', kropp);
      else await api.spara(`/api/checklistor/mallar/${mall.id}`, kropp);
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      bred
      titel={mall.ny ? 'Ny mall' : `Redigera: ${mall.namn}`}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={!form.namn.trim() || !punkter.some((p) => p.text?.trim())} onClick={skicka}>
            Spara mall
          </button>
        </>
      }
    >
      <div className="faltrad">
        <Text etikett="Namn" krav varde={form.namn} satt={satt('namn')} />
        <Val
          etikett="Omfattning" varde={form.omfattning} satt={satt('omfattning')} tomtext={null}
          poster={[
            { varde: 'allmant', text: 'Allmänt' },
            { varde: 'utrustningstyp', text: 'Per utrustningstyp' },
            { varde: 'omrade', text: 'Per område' },
          ]}
        />
        {form.omfattning === 'utrustningstyp' && (
          <Val
            etikett="Utrustningstyp" varde={form.utrustningstyp} satt={satt('utrustningstyp')} tomtext={null}
            poster={typer.map((t) => ({ varde: t, text: UTRUSTNINGSTYP[t] || t }))}
          />
        )}
        {form.omfattning === 'omrade' && (
          <Val
            etikett="Område" varde={form.omrade_id} satt={satt('omrade_id')} tomtext={null}
            poster={omraden.map((o) => ({ varde: o.id, text: o.namn }))}
          />
        )}
        <Val
          etikett="Intervall" varde={form.intervall} satt={satt('intervall')} tomtext={null}
          poster={Object.entries(INTERVALL).map(([v, t]) => ({ varde: v, text: t }))}
        />
      </div>
      <Text etikett="Beskrivning" varde={form.beskrivning} satt={satt('beskrivning')} />
      <Ruta etikett="Aktiv" pa={form.aktiv} satt={satt('aktiv')} />

      <div className="rad-mellan">
        <h4>Punkter</h4>
        <button className="liten" onClick={() => sattPunkter((p) => [...p, { text: '', svarstyp: 'bock', obligatorisk: 1 }])}>
          Lägg till punkt
        </button>
      </div>
      <div className="tabellramp">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Text</th>
              <th style={{ width: 110 }}>Svarstyp</th>
              <th style={{ width: 70 }}>Enhet</th>
              <th>Hjälptext</th>
              <th style={{ width: 60 }}>Krav</th>
              <th style={{ width: 92 }}></th>
            </tr>
          </thead>
          <tbody>
            {punkter.map((p, i) => (
              <tr key={i}>
                <td className="sifra svag">{i + 1}</td>
                <td className="redigerbar">
                  <input value={p.text || ''} onChange={(e) => sattPunkt(i, 'text', e.target.value)} />
                </td>
                <td className="redigerbar">
                  <select value={p.svarstyp || 'bock'} onChange={(e) => sattPunkt(i, 'svarstyp', e.target.value)}>
                    <option value="bock">Bock</option>
                    <option value="varde">Värde</option>
                    <option value="text">Text</option>
                  </select>
                </td>
                <td className="redigerbar">
                  <input value={p.enhet || ''} onChange={(e) => sattPunkt(i, 'enhet', e.target.value)} />
                </td>
                <td className="redigerbar">
                  <input value={p.hjalptext || ''} onChange={(e) => sattPunkt(i, 'hjalptext', e.target.value)} />
                </td>
                <td className="mitten">
                  <input
                    type="checkbox"
                    checked={p.obligatorisk !== 0 && p.obligatorisk !== false}
                    onChange={(e) => sattPunkt(i, 'obligatorisk', e.target.checked ? 1 : 0)}
                  />
                </td>
                <td>
                  <div className="knapprad">
                    <button className="liten tom" onClick={() => flytta(i, -1)} title="Upp">↑</button>
                    <button className="liten tom" onClick={() => flytta(i, 1)} title="Ned">↓</button>
                    <button className="liten tom fara" onClick={() => sattPunkter((x) => x.filter((_, j) => j !== i))} title="Ta bort">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {!punkter.length && (
              <tr><td colSpan={7}><Tomt>Lägg till minst en punkt.</Tomt></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Lada>
  );
}
