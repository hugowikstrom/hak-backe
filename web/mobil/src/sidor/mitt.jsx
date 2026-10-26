// Medlemmens startsida: en sak i taget.
//
// Vad som står överst avgörs av var man är i dygnet och i säsongen. Står
// man på pass är det ronderna som gäller; har man en fråga obesvarad är det
// den; saknas timmar är det bokningen. Resten ligger nedanför, tyst.
//
// Servern avgör ordningen (server/mitt.mjs) – telefonen ritar den.
import { useState } from 'react';
import { api, hamtaMedCache } from '../api.js';
import { useRuta } from '../app.jsx';
import { nyRond, synka } from '../ko.js';
import { Bricka, Post, Tomt, useHamta, useNotis, Vanta } from '../delar.jsx';

const DAGNAMN = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];

/** "i kväll 22:00", "i morgon 09:00", "tisdag 14 dec 09:00". */
function nar(pass, nu) {
  const d = new Date(`${pass.datum}T12:00:00`);
  const idag = new Date(`${nu.datum}T12:00:00`);
  const dagar = Math.round((d - idag) / 86400000);
  const timme = Number(pass.start.slice(0, 2));
  if (dagar === 0) return `${timme >= 17 ? 'i kväll' : timme < 10 ? 'i morse' : 'i dag'} ${pass.start}`;
  if (dagar === 1) return `i morgon ${pass.start}`;
  if (dagar < 7) return `${DAGNAMN[d.getDay()]} ${pass.start}`;
  return `${pass.datum.slice(8)}/${pass.datum.slice(5, 7)} ${pass.start}`;
}

/** Svenska tal: minustecken och decimalkomma, som i resten av appen. */
const grader = (v) => `${Number(v).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} °C`;

const omTid = (minuter) => {
  if (minuter < 60) return `om ${minuter} min`;
  const h = Math.round(minuter / 60);
  return h < 24 ? `om ${h} tim` : `om ${Math.round(h / 24)} dagar`;
};

export function Mitt() {
  const { ga } = useRuta();
  const notis = useNotis();
  const d = useHamta(() => hamtaMedCache('/api/mitt'));
  const [arbetar, sattArbetar] = useState(null);
  // Fyra ronder räcker på skärmen; resten bakom ett tryck.
  const [allaRonder, sattAllaRonder] = useState(false);

  if (d.laddar && !d.data) return <Vanta />;
  if (d.fel && !d.data) return <div className="meddelande fel">{d.fel}</div>;

  const m = d.data.data;
  const { lage, pass, ronder, forfragningar, kvot, att_boka, mina_arenden, kommande, nu } = m;

  const svara = async (f, ja) => {
    sattArbetar(f.id);
    try {
      await api.skapa(`/api/snoplan/forfragningar/${f.id}/svar`, { ja });
      notis(ja ? 'Tack – du är inbokad' : 'Noterat', ja ? 'ok' : 'info');
      d.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(null);
    }
  };

  const boka = async (p) => {
    sattArbetar(p.id);
    try {
      await api.skapa(`/api/bemanning/pass/${p.id}/boka`, {});
      notis('Inbokad', 'ok');
      d.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(null);
    }
  };

  /**
   * Startar ronden. Gäller den ett enda objekt går vi rakt in i den;
   * gäller den tolv lansar skickas man till valet – att rada upp tolv
   * rader här vore att flytta problemet, inte lösa det.
   */
  const startaRond = async (rond, objekt = null) => {
    if (!objekt && rond.objekt.length !== 1) return ga('hem', { valj: rond.mall_id });
    const val = objekt || rond.objekt[0];
    try {
      const mallar = await api.hamta('/api/checklistor/mallar');
      const full = (mallar.data || mallar).find((x) => x.id === rond.mall_id);
      if (!full) return notis('Checklistan kunde inte läsas', 'fel');
      const ny = nyRond({
        mall: full,
        utrustning: val?.slag === 'utrustning' ? val : null,
        omrade: val?.slag === 'omrade' ? val : null,
        snoplats: val?.slag === 'snoplats' ? { ...val, under: val.maskin } : null,
      });
      synka().catch(() => {});
      ga('rond', { lokalId: ny.lokalId });
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <>
      {/* ---- Det som gäller nu ---- */}
      {(lage === 'pa_pass' || lage === 'snart_pass') && pass && (
        <section className="huvudsak">
          <span className="etikett">{pass.pagar ? 'Du är på pass' : `Ditt pass börjar ${omTid(pass.minuter_till)}`}</span>
          <h1>{pass.position}</h1>
          <p className="under">
            {/* Pågår passet säger rubriken redan vilket dygn det är. */}
            {pass.pagar ? `${pass.start}–${pass.slut}` : `${nar(pass, nu)}–${pass.slut}`}
            {pass.lagsta_wetbulb != null ? ` · prognos ${grader(pass.lagsta_wetbulb)} wetbulb` : ''}
          </p>
          {pass.anteckning && <p className="under">{pass.anteckning}</p>}
        </section>
      )}

      {lage === 'svara' && (
        <section className="huvudsak">
          <span className="etikett">Du har fått en fråga</span>
          <h1>Kan du ta ett pass?</h1>
          <p className="under">En fråga, inte en bokning. Du står inte i schemat förrän du svarat ja.</p>
        </section>
      )}

      {lage === 'boka' && (
        <section className="huvudsak">
          <span className="etikett">Säsongen</span>
          <h1>Dags att boka</h1>
          <p className="under">{kvot.text}</p>
        </section>
      )}

      {lage === 'nasta_pass' && pass && (
        <section className="huvudsak lugn">
          <span className="etikett">Nästa pass</span>
          <h1>{pass.position}</h1>
          <p className="under">
            {nar(pass, nu)}–{pass.slut} · {omTid(pass.minuter_till)}
          </p>
        </section>
      )}

      {lage === 'lugnt' && (
        <section className="huvudsak lugn">
          <span className="etikett">{nu.datum}</span>
          <h1>Inget just nu</h1>
          <p className="under">{kvot.text || 'Inga pass bokade, inget som väntar.'}</p>
        </section>
      )}

      {/* ---- Ronderna som hör till passet ---- */}
      {!!ronder.length && (
        <section className="kort">
          <header>
            <h2>Att göra på passet</h2>
            <p className="liten svag" style={{ margin: '4px 0 8px' }}>
              {ronder.reduce((s, r) => s + r.kvar, 0)} kvar av {ronder.reduce((s, r) => s + r.kvar + r.klara, 0)}
            </p>
          </header>
          <div className="lista">
            {(allaRonder ? ronder : ronder.slice(0, 4)).map((r) => (
              <Post
                key={r.mall_id}
                figur={r.kvar || '✓'}
                figurfarg={r.kvar ? 'varning' : 'ok'}
                titel={r.namn}
                under={
                  r.kvar === 0
                    ? 'alla gjorda'
                    : r.objekt.length === 1
                      ? r.objekt[0].namn + (r.objekt[0].maskin ? ` · ${r.objekt[0].maskin}` : '')
                      : `${r.kvar} kvar · ${r.objekt.slice(0, 2).map((o) => o.namn).join(', ')}${r.kvar > 2 ? ' …' : ''}`
                }
                onClick={() => startaRond(r)}
              />
            ))}
          </div>
          {ronder.length > 4 && (
            <button className="tom" onClick={() => sattAllaRonder(!allaRonder)}>
              {allaRonder ? 'Visa färre' : `Visa alla ${ronder.length}`}
            </button>
          )}
        </section>
      )}

      {/* ---- Frågor att svara på ---- */}
      {!!forfragningar.length && (
        <section className="kort">
          <header>
            <h2>Kan du ta det här?</h2>
          </header>
          {forfragningar.map((f) => (
            <div key={f.id} className="fraga">
              <div className="rad-mellan">
                <strong>
                  {nar(f, nu)}–{f.slut}
                </strong>
                {f.slag === 'natt' && <Bricka farg="natt">natt</Bricka>}
              </div>
              <div className="liten svag">
                {f.position}
                {f.lagsta_wetbulb != null ? ` · prognos ${grader(f.lagsta_wetbulb)} wetbulb` : ''}
              </div>
              <div className="svarsknappar">
                <button className="ok" disabled={arbetar === f.id} onClick={() => svara(f, true)}>
                  Ja, jag tar det
                </button>
                <button className="avvik" disabled={arbetar === f.id} onClick={() => svara(f, false)}>
                  Nej
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---- Pass att boka ---- */}
      {!!att_boka.length && (
        <section className="kort">
          <header>
            <h2>Pass som saknar folk</h2>
          </header>
          <div className="lista">
            {att_boka.map((p) => (
              <Post
                key={p.id}
                figur={p.saknas}
                figurfarg="varning"
                titel={`${nar(p, nu)}–${p.slut}`}
                under={`${p.position}${p.slag === 'natt' ? ' · natt' : ''}`}
                hoger={
                  <button
                    className="boka"
                    disabled={arbetar === p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      boka(p);
                    }}
                  >
                    Boka
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Det tysta: kommande pass och egna ärenden ---- */}
      {!!kommande.length && lage !== 'nasta_pass' && (
        <section className="kort tyst">
          <header>
            <h2>Dina pass</h2>
          </header>
          <div className="lista">
            {kommande.map((p) => (
              <div key={p.id} className="passrad liten">
                <span className="markor" style={{ background: p.farg }} aria-hidden="true" />
                <span className="txt">
                  <strong>
                    {nar(p, nu)}–{p.slut}
                  </strong>
                  <span className="svag">{p.position}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!mina_arenden.length && (
        <section className="kort tyst">
          <header>
            <h2>Dina ärenden</h2>
          </header>
          <div className="lista">
            {mina_arenden.map((a) => (
              <div key={a.id} className="passrad liten">
                <span className="txt">
                  <strong>{a.titel}</strong>
                  <span className="svag">{a.status}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {lage === 'lugnt' && !ronder.length && !kommande.length && (
        <Tomt>Här dyker ditt nästa pass upp, och ronderna som hör till det.</Tomt>
      )}
    </>
  );
}
