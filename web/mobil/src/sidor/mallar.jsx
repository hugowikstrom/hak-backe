// Jonas sida: bygga och ändra checklistor direkt i telefonen.
import { useState } from 'react';
import { api, hamtaMedCache } from '../api.js';
import {
  Ark, Bricka, flertal, INTERVALL, Omrade, Post, Segment, Text, Tomt, useHamta, useNotis, UTRUSTNINGSTYP, Val, Vanta,
} from '../delar.jsx';

const TOM_MALL = {
  namn: '', omfattning: 'allmant', utrustningstyp: 'lans', omrade_id: '',
  intervall: 'dagligen', beskrivning: '', aktiv: 1, punkter: [],
};

export function Mallar() {
  const notis = useNotis();
  const mallar = useHamta(() => api.hamta('/api/checklistor/mallar'));
  const utrustning = useHamta(() => hamtaMedCache('/api/utrustning'));
  const omraden = useHamta(() => hamtaMedCache('/api/omraden'));
  const [redigerar, sattRedigerar] = useState(null);

  if (mallar.laddar && !mallar.data) return <Vanta />;
  if (mallar.fel) return <div className="meddelande fel">Att ändra checklistor kräver täckning. {mallar.fel}</div>;

  const typer = [...new Set((utrustning.data?.data || []).map((u) => u.typ))];

  return (
    <>
      <div className="rad-mellan">
        <h1>Checklistor</h1>
        <button className="primar" onClick={() => sattRedigerar({ ...TOM_MALL, ny: true })}>+ Ny</button>
      </div>
      <p className="liten svag" style={{ margin: 0 }}>
        En checklista kan gälla allmänt, alla enheter av en typ, eller ett område. Den dyker då upp
        automatiskt när någon startar en rond där.
      </p>

      <section className="kort lista">
        {(mallar.data || []).map((m) => (
          <Post
            key={m.id}
            figur={m.omfattning === 'utrustningstyp' ? '⚙' : m.omfattning === 'omrade' ? '⌂' : '✓'}
            titel={m.namn}
            under={`${INTERVALL[m.intervall]} · ${m.punkter.length} punkter · ${
              m.omfattning === 'utrustningstyp'
                ? `alla ${flertal(m.utrustningstyp)}`
                : m.omfattning === 'omrade'
                  ? (omraden.data?.data || []).find((o) => o.id === m.omrade_id)?.namn || 'område'
                  : 'allmänt'
            }`}
            hoger={m.aktiv ? <Bricka farg="ok">Aktiv</Bricka> : <Bricka>Vilande</Bricka>}
            onClick={() => sattRedigerar({ ...m, punkter: m.punkter.map((p) => ({ ...p })) })}
          />
        ))}
        {!mallar.data?.length && <Tomt>Inga checklistor ännu.</Tomt>}
      </section>

      {redigerar && (
        <MallArk
          mall={redigerar}
          typer={typer.length ? typer : Object.keys(UTRUSTNINGSTYP)}
          omraden={omraden.data?.data || []}
          stang={() => sattRedigerar(null)}
          klar={(text) => {
            sattRedigerar(null);
            mallar.uppdatera();
            notis(text);
          }}
        />
      )}
    </>
  );
}

function MallArk({ mall, typer, omraden, stang, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState(mall);
  const [punkter, sattPunkter] = useState(mall.punkter || []);
  const [punkt, sattPunkt] = useState(null);
  const [sparar, sattSparar] = useState(false);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));

  const flytta = (i, steg) =>
    sattPunkter((p) => {
      const n = [...p];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + steg)), 0, x);
      return n;
    });

  const spara = async () => {
    sattSparar(true);
    try {
      const kropp = {
        namn: f.namn,
        omfattning: f.omfattning,
        utrustningstyp: f.omfattning === 'utrustningstyp' ? f.utrustningstyp : null,
        omrade_id: f.omfattning === 'omrade' ? f.omrade_id || null : null,
        intervall: f.intervall,
        beskrivning: f.beskrivning || null,
        aktiv: f.aktiv ? 1 : 0,
        punkter: punkter.filter((p) => p.text?.trim()),
      };
      if (mall.ny) await api.skapa('/api/checklistor/mallar', kropp);
      else await api.spara(`/api/checklistor/mallar/${mall.id}`, kropp);
      klar(mall.ny ? 'Checklistan är skapad.' : 'Checklistan är sparad.');
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSparar(false);
    }
  };

  const taBort = async () => {
    if (!confirm(`Ta bort "${f.namn}"?`)) return;
    try {
      const r = await api.tabort(`/api/checklistor/mallar/${mall.id}`);
      klar(r.borttagen ? 'Checklistan är borttagen.' : `Checklistan har ${r.korningar} ronder i historiken och gjordes vilande i stället.`);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const kopiera = async () => {
    try {
      await api.skapa(`/api/checklistor/mallar/${mall.id}/kopia`);
      klar('Kopian är skapad som vilande.');
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Ark
      titel={mall.ny ? 'Ny checklista' : 'Ändra checklista'}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={sparar || !f.namn.trim() || !punkter.some((p) => p.text?.trim())} onClick={spara}>
            {sparar ? 'Sparar …' : 'Spara'}
          </button>
        </>
      }
    >
      <Text etikett="Namn" varde={f.namn} satt={satt('namn')} placeholder="t.ex. Lans – start av snöläggning" />

      <label className="falt">
        <span>Gäller</span>
        <Segment
          varde={f.omfattning}
          satt={satt('omfattning')}
          poster={[
            { varde: 'allmant', text: 'Allmänt' },
            { varde: 'utrustningstyp', text: 'Enhetstyp' },
            { varde: 'omrade', text: 'Område' },
          ]}
        />
      </label>

      {f.omfattning === 'utrustningstyp' && (
        <Val
          etikett="Vilken typ av enhet"
          varde={f.utrustningstyp}
          satt={satt('utrustningstyp')}
          tomtext={null}
          poster={typer.map((t) => ({ varde: t, text: UTRUSTNINGSTYP[t] || t }))}
        />
      )}
      {f.omfattning === 'omrade' && (
        <Val
          etikett="Vilket område"
          varde={f.omrade_id}
          satt={satt('omrade_id')}
          tomtext="– välj –"
          poster={omraden.map((o) => ({ varde: o.id, text: o.namn }))}
        />
      )}

      <Val
        etikett="Hur ofta"
        varde={f.intervall}
        satt={satt('intervall')}
        tomtext={null}
        poster={Object.entries(INTERVALL).map(([v, t]) => ({ varde: v, text: t }))}
      />
      <Omrade etikett="Beskrivning (frivillig)" varde={f.beskrivning || ''} satt={satt('beskrivning')} />

      <label className="rad" style={{ gap: 10 }}>
        <input type="checkbox" checked={!!f.aktiv} onChange={(e) => satt('aktiv')(e.target.checked ? 1 : 0)} />
        <span>Aktiv – syns när någon startar en rond</span>
      </label>

      <div className="rad-mellan">
        <h3>Punkter ({punkter.length})</h3>
        <button onClick={() => sattPunkt({ index: -1, data: { text: '', svarstyp: 'bock', enhet: '', hjalptext: '', obligatorisk: 1 } })}>
          + Punkt
        </button>
      </div>

      <div className="kort lista">
        {punkter.map((p, i) => (
          <div key={p.id ?? `ny-${i}`} className="punktrad">
            <span className="markor">{i + 1}</span>
            <button
              className="tom"
              style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 0, padding: 0, color: 'inherit' }}
              onClick={() => sattPunkt({ index: i, data: { ...p } })}
            >
              <span>
                {p.text || <em className="svagare">tom punkt</em>}
                <span className="liten svag" style={{ display: 'block' }}>
                  {p.svarstyp === 'varde' ? `Värde${p.enhet ? ` (${p.enhet})` : ''}` : p.svarstyp === 'text' ? 'Text' : 'Bock'}
                  {p.obligatorisk ? '' : ' · frivillig'}
                </span>
              </span>
            </button>
            <span className="rad" style={{ gap: 2 }}>
              <button className="tom" onClick={() => flytta(i, -1)} aria-label="Upp" style={{ minHeight: 34, padding: '0 8px' }}>↑</button>
              <button className="tom" onClick={() => flytta(i, 1)} aria-label="Ned" style={{ minHeight: 34, padding: '0 8px' }}>↓</button>
            </span>
          </div>
        ))}
        {!punkter.length && <Tomt>Lägg till minst en punkt.</Tomt>}
      </div>

      {!mall.ny && (
        <div className="knapprad">
          <button onClick={kopiera}>Kopiera</button>
          <button className="fara" onClick={taBort}>Ta bort</button>
        </div>
      )}

      {punkt && (
        <PunktArk
          punkt={punkt.data}
          nytt={punkt.index < 0}
          stang={() => sattPunkt(null)}
          spara={(data) => {
            sattPunkter((lista) =>
              punkt.index < 0 ? [...lista, data] : lista.map((x, i) => (i === punkt.index ? data : x))
            );
            sattPunkt(null);
          }}
          taBort={() => {
            sattPunkter((lista) => lista.filter((_, i) => i !== punkt.index));
            sattPunkt(null);
          }}
        />
      )}
    </Ark>
  );
}

function PunktArk({ punkt, nytt, stang, spara, taBort }) {
  const [p, sattP] = useState(punkt);
  const satt = (k) => (v) => sattP((g) => ({ ...g, [k]: v }));
  return (
    <Ark
      titel={nytt ? 'Ny punkt' : 'Ändra punkt'}
      stang={stang}
      fot={
        <>
          {!nytt && <button className="fara" onClick={taBort}>Ta bort</button>}
          <button className="primar" disabled={!p.text?.trim()} onClick={() => spara(p)}>Klar</button>
        </>
      }
    >
      <Omrade etikett="Vad ska kontrolleras?" varde={p.text} satt={satt('text')} placeholder="t.ex. Nödstopp testat" autoFocus />
      <label className="falt">
        <span>Svar</span>
        <Segment
          varde={p.svarstyp}
          satt={satt('svarstyp')}
          poster={[
            { varde: 'bock', text: 'Bock' },
            { varde: 'varde', text: 'Värde' },
            { varde: 'text', text: 'Text' },
          ]}
        />
      </label>
      {p.svarstyp === 'varde' && (
        <Text etikett="Enhet" varde={p.enhet || ''} satt={satt('enhet')} placeholder="bar, °C, cm …" />
      )}
      <Omrade etikett="Hjälptext (frivillig)" varde={p.hjalptext || ''} satt={satt('hjalptext')} placeholder="Normalvärde, var man hittar den, vad man ska se efter." />
      <label className="rad" style={{ gap: 10 }}>
        <input
          type="checkbox"
          checked={p.obligatorisk !== 0 && p.obligatorisk !== false}
          onChange={(e) => satt('obligatorisk')(e.target.checked ? 1 : 0)}
        />
        <span>Obligatorisk</span>
      </label>
    </Ark>
  );
}
