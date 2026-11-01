// Startsidor. En per arbetsyta – den som står i kiosken ska se kiosken,
// inte snöläggningen, och ordföranden ska se föreningen, inte lansarna.
import { useEffect } from 'react';
import { api, fragestrang } from '../api.js';
import { Lank, useJag, usePlattform } from '../app.jsx';
import { Bricka, Kort, Linjegraf, Matare, Nyckeltal, Prioritetsbricka, Statusbricka, Tomt, useHamta, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import {
  idag, initialer, INTERVALL, KLARTECKEN, klockslag, langDatum, plusDagar, procent,
  prognosstund, prognostimme, sedan, tal, tidpunkt, UTRUSTNINGSTYP,
} from '../nytta.js';

export function Start({ yta }) {
  const Vy = {
    anlaggning: Anlaggning,
    back: Back,
    kiosk: Kiosken,
    uthyrning: Uthyrningen,
    ekonomi: EkonomiStart,
    styrelse: Styrelsen,
    traning: Traningen,
    medlem: Medlemmen,
  }[yta] || Medlemmen;
  return <Vy />;
}

const Rubrik = ({ titel, under, knappar }) => {
  const jag = useJag();
  return (
    <div className="sidhuvud">
      <div>
        <h1>{titel}</h1>
        <div className="undertext">{under}</div>
      </div>
      <div className="knapprad">{knappar}</div>
    </div>
  );
};

/** Wetbulb och produktionsfönster – används av flera vyer. */
function Vaderkort({ kompakt = false }) {
  const { harModul } = usePlattform();
  const pa = harModul('snolaggning');
  const { data } = useHamta(() => (pa ? api.hamta('/api/vader') : Promise.resolve(null)), [pa]);
  if (!pa) return null;
  if (!data) return <Kort titel="Väder"><Vanta /></Kort>;
  const f = data.h48.fonster[0];
  return (
    <Kort titel="Wetbulb och produktion" undertext={`${data.plats.namn} · YR och SMHI`} verktyg={<Lank till="/snolaggning" className="knapp liten">Prognos</Lank>}>
      <div className="rad gap-16 hopp">
        <Nyckeltal etikett="Wetbulb nu" varde={tal(data.nu?.wetbulb)} enhet="°C" />
        <Nyckeltal etikett="Lufttemp" varde={tal(data.nu?.temp)} enhet="°C" />
        <Nyckeltal etikett="Produktion 48 h" varde={data.h48.produktionstimmar} enhet="h" farg={data.h48.produktionstimmar ? 'ok' : 'fara'} />
      </div>
      <div style={{ marginTop: 8 }}>
        {f ? (
          <div className="meddelande ok">
            Nästa fönster: {prognosstund(f.fran)} – {prognosstund(f.till)} ({f.timmar} h, ned till {tal(f.lagsta)} °C)
          </div>
        ) : (
          <div className="meddelande varning">Inget produktionsfönster de närmaste två dygnen.</div>
        )}
      </div>
      {!kompakt && data.h48.punkter.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <Linjegraf
            punkter={data.h48.punkter.map((p) => ({ x: prognostimme(p.tid), a: p.wetbulb, b: p.temp }))}
            hojd={110}
            etikett_a="wetbulb"
            etikett_b="lufttemp"
            grans={-2.5}
          />
        </div>
      )}
    </Kort>
  );
}

function Rondkort({ titel = 'Ronder att göra i dag' }) {
  const { harModul } = usePlattform();
  const pa = harModul('checklistor');
  const { data } = useHamta(() => (pa ? api.hamta('/api/checklistor/lage') : Promise.resolve(null)), [pa]);
  if (!pa) return null;
  if (!data) return <Kort titel={titel}><Vanta /></Kort>;
  // Dagliga kontroller först. De avgör om backen får öppna, och en lista
  // sorterad på antal hade lagt dem under snöläggningens startkontroller –
  // som är fler, men bara gäller de maskiner som faktiskt ska köra.
  const kvar = data.mallar
    .filter((m) => m.kvar)
    .sort((a, b) => (a.intervall === 'dagligen' ? 0 : 1) - (b.intervall === 'dagligen' ? 0 : 1));
  const dagligen = kvar.filter((m) => m.intervall === 'dagligen').reduce((a, m) => a + m.kvar, 0);
  return (
    <Kort
      titel={titel}
      undertext={
        data.kvar ? `${dagligen} före öppning · ${data.kvar} totalt · ${data.klara} gjorda` : 'Allt gjort'
      }
      verktyg={<Lank till="/checklistor" className="knapp liten">Öppna</Lank>}
    >
      {kvar.length ? (
        <ul className="lista">
          {kvar.slice(0, 7).map((m) => (
            <li key={m.mall_id}>
              <span className="vaxa">
                <strong>{m.namn}</strong>
                <div className="liten svag">
                  {INTERVALL[m.intervall]} · {m.objekt.filter((o) => o.behovs).slice(0, 3).map((o) => o.namn).join(', ')}
                  {m.kvar > 3 ? ` +${m.kvar - 3}` : ''}
                </div>
              </span>
              <Bricka farg="varning">{m.kvar}</Bricka>
            </li>
          ))}
        </ul>
      ) : (
        <Tomt>Allt som skulle göras i dag är gjort.</Tomt>
      )}
    </Kort>
  );
}

function Arendekort({ titel = 'Ärenden som väntar', filter = '' }) {
  const { harModul } = usePlattform();
  const pa = harModul('arenden');
  const { data } = useHamta(() => (pa ? api.hamta(`/api/arenden?status=oppna${filter}`) : Promise.resolve(null)), [pa]);
  if (!pa) return null;
  if (!data) return <Kort titel={titel}><Vanta /></Kort>;
  const akuta = data.filter((a) => a.prioritet <= 2 || a.allvarlighet === 'sakerhetsrisk');
  return (
    <Kort titel={titel} undertext={`${data.length} öppna, ${akuta.length} brådskande`} verktyg={<Lank till="/arenden" className="knapp liten">Alla</Lank>}>
      {data.length ? (
        <ul className="lista">
          {(akuta.length ? akuta : data).slice(0, 6).map((a) => (
            <li key={a.id}>
              <span className="vaxa">
                <Lank till={`/arenden?id=${a.id}`}>#{a.id} {a.titel}</Lank>
                <div className="liten svag">{a.utrustning || a.omrade || 'Allmänt'} · {sedan(a.skapad)}</div>
              </span>
              <span className="rad">
                {a.allvarlighet === 'sakerhetsrisk' && <Bricka farg="fara">Säkerhet</Bricka>}
                <Prioritetsbricka niva={a.prioritet} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Tomt>Inga öppna ärenden.</Tomt>
      )}
    </Kort>
  );
}

// ---------- anläggningsansvarig ----------
function Anlaggning() {
  const jag = useJag();
  const { harModul } = usePlattform();
  const oversikt = useHamta(() => api.hamta('/api/oversikt'));
  if (!oversikt.data) return <Vanta />;
  const d = oversikt.data;
  const kt = d.sno.klartecken;
  return (
    <>
      <Rubrik
        titel={`Anläggningen · ${jag.namn.split(' ')[0]}`}
        under={`${langDatum(idag())} · ${[harModul('snolaggning') && 'snöläggning', 'utrustning', 'backens skick']
          .filter(Boolean)
          .join(', ')}`}
        knappar={
          <>
            {harModul('snolaggning') && <Lank till="/snolaggning" className="knapp">Rapportera mätning</Lank>}
            {harModul('arenden') && <Lank till="/arenden" className="knapp">Nytt ärende</Lank>}
          </>
        }
      />
      <div className="rutor bred">
        {harModul('snolaggning') && (
        <Kort titel="Snöläggning just nu" undertext={d.sno.senasteMatning ? `Senaste mätning ${sedan(d.sno.senasteMatning.tid)}` : 'Ingen mätning'}>
          <div className={`klartecken ${kt.niva}`}>
            <div className="lampa">{kt.wetbulb != null ? tal(kt.wetbulb) : '?'}</div>
            <div className="kolumn" style={{ gap: 2 }}>
              <strong>{KLARTECKEN[kt.niva]}</strong>
              <span className="liten svag">{kt.text}</span>
              {kt.vatten != null && <span className="liten">Rekommenderad vattenmängd: <strong>{kt.vatten} %</strong></span>}
            </div>
          </div>
          {d.sno.pass && (
            <div className="meddelande info" style={{ marginTop: 8 }}>
              Snöpass pågår sedan {tidpunkt(d.sno.pass.start)}
              {d.sno.pass.ansvarig ? ` · ansvarig ${d.sno.pass.ansvarig}` : ''}
            </div>
          )}
        </Kort>
        )}

        <Vaderkort kompakt />

        <Kort titel="Utrustning som inte är i drift" verktyg={<Lank till="/register" className="knapp liten">Register</Lank>}>
          {d.utrustning_ur_drift.length ? (
            <ul className="lista">
              {d.utrustning_ur_drift.map((u) => (
                <li key={u.id}>
                  <span className="vaxa">
                    <strong>{u.namn}</strong>
                    <div className="liten svag">{UTRUSTNINGSTYP[u.typ]} · {u.omrade}</div>
                  </span>
                  <Bricka farg={u.status === 'ur_drift' ? 'fara' : 'varning'}>{u.status === 'ur_drift' ? 'Ur drift' : 'Service'}</Bricka>
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>All utrustning är i drift.</Tomt>
          )}
        </Kort>

        <Rondkort />
        <Arendekort />

        {harModul('bemanning') && (
          <Kort titel="Bemanning den närmaste veckan" undertext={`${d.bemanning.hal} pass saknar folk`} verktyg={<Lank till="/bemanning" className="knapp liten">Schemat</Lank>}>
            <div className="rad gap-16 hopp">
              <Nyckeltal etikett="Pass i veckan" varde={d.bemanning.veckan.length} />
              <Nyckeltal etikett="Hål" varde={d.bemanning.hal} farg={d.bemanning.hal ? 'fara' : 'ok'} />
            </div>
          </Kort>
        )}
      </div>
    </>
  );
}

// ---------- backansvarig ----------
function Back() {
  const jag = useJag();
  const oversikt = useHamta(() => api.hamta('/api/oversikt'));
  if (!oversikt.data) return <Vanta />;
  const d = oversikt.data;
  return (
    <>
      <Rubrik
        titel={`Backen i dag · ${jag.namn.split(' ')[0]}`}
        under={langDatum(idag())}
        knappar={<Lank till="/checklistor" className="knapp primar">Starta rond</Lank>}
      />
      <div className="rutor bred">
        <Kort titel="Bemanning i dag" undertext={`${d.bemanning.hal} hål den närmaste veckan`} verktyg={<Lank till="/bemanning" className="knapp liten">Schemat</Lank>}>
          {d.bemanning.idag.length ? (
            <ul className="lista">
              {d.bemanning.idag.map((p) => {
                const bokade = p.bokningar.filter((b) => b.status !== 'avbokad');
                return (
                  <li key={p.id}>
                    <span className="vaxa">
                      <strong>{p.position}</strong> <span className="num svag liten">{p.start}–{p.slut}</span>
                      <div className="rad liten" style={{ gap: 3, marginTop: 2 }}>
                        {bokade.map((b) => <span key={b.id} className="initial" title={b.namn}>{initialer(b.namn)}</span>)}
                        {!bokade.length && <span className="svagare">ingen bokad</span>}
                      </div>
                    </span>
                    <Bricka farg={bokade.length >= p.behov ? 'ok' : bokade.length ? 'varning' : 'fara'}>{bokade.length}/{p.behov}</Bricka>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Tomt>Inga pass i dag.</Tomt>
          )}
        </Kort>
        <Rondkort />
        <Arendekort />
        <Vaderkort kompakt />
      </div>
    </>
  );
}

// ---------- kiosken ----------
function Kiosken() {
  const kassa = useHamta(() => api.hamta('/api/fik/kassa'));
  useEffect(() => {
    const t = setInterval(() => kassa.uppdatera(), 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!kassa.data) return <Vanta />;
  const d = kassa.data;
  const obetalda = d.oppna.filter((o) => !o.betald_tid);
  return (
    <>
      <Rubrik
        titel="Kiosken"
        under={`${langDatum(idag())} · beställningar och försäljning`}
        knappar={
          <>
            <Lank till="/kassa" className="knapp primar">Till kassan</Lank>
            <a className="knapp" href="/fik/" target="_blank" rel="noreferrer">Gästens vy</a>
          </>
        }
      />
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Öppna beställningar" varde={d.oppna.length} farg={d.oppna.length ? 'varning' : 'ok'} />
            <Nyckeltal etikett="Väntar på betalning" varde={obetalda.length} farg={obetalda.length ? 'fara' : 'ok'} />
            <Nyckeltal etikett="Sålt i dag" varde={d.summa} />
            <Nyckeltal etikett="Beställningar i dag" varde={d.antal} />
          </div>
        </Kort>
      </div>

      <Kort titel="Att göra nu" undertext="Uppdateras av sig själv" tat>
        {d.oppna.length ? (
          <Tabell
            rader={d.oppna}
            tomtext="Inget i kön."
            kolumner={[
              { falt: 'nummer', rubrik: 'Nr', visa: (o) => <strong className="stortal" style={{ fontSize: 18 }}>{o.nummer}</strong> },
              { falt: 'rader', rubrik: 'Beställning', sortlos: true, visa: (o) => o.rader.map((r) => `${r.antal}× ${r.namn}`).join(', ') },
              { falt: 'plats', rubrik: 'Var' },
              { falt: 'belopp', rubrik: 'Summa', sifra: true },
              { falt: 'betald_tid', rubrik: 'Betalt', visa: (o) => (o.betald_tid ? <Bricka farg="ok">{o.betalsatt}</Bricka> : <Bricka farg="fara">nej</Bricka>) },
              { falt: 'status', rubrik: 'Status', visa: (o) => <Bricka farg={o.status === 'klar' ? 'ok' : 'varning'}>{o.status}</Bricka> },
              { falt: 'skapad', rubrik: 'Inne', visa: (o) => <span className="liten svag">{sedan(o.skapad)}</span> },
            ]}
          />
        ) : (
          <Tomt>Inga öppna beställningar just nu.</Tomt>
        )}
      </Kort>

      <div className="tva">
        <Kort titel="Sålt i dag per vara" tat>
          <Tabell
            rader={d.per_artikel}
            nyckel={(r) => r.namn}
            maxhojd="34vh"
            tomtext="Inget sålt än i dag."
            kolumner={[
              { falt: 'namn', rubrik: 'Vara' },
              { falt: 'antal', rubrik: 'Antal', sifra: true },
              { falt: 'summa', rubrik: 'Summa', sifra: true },
            ]}
          />
        </Kort>
        <Kort titel="Dagens beställningar" tat>
          <Tabell
            rader={d.dagens}
            maxhojd="34vh"
            tomtext="Inga ännu."
            kolumner={[
              { falt: 'nummer', rubrik: 'Nr' },
              { falt: 'skapad', rubrik: 'Tid', visa: (o) => <span className="num">{klockslag(o.skapad)}</span> },
              { falt: 'belopp', rubrik: 'Summa', sifra: true },
              { falt: 'betalsatt', rubrik: 'Betalt' },
              { falt: 'status', rubrik: 'Status' },
            ]}
          />
        </Kort>
      </div>
    </>
  );
}

// ---------- uthyrningen ----------
function Uthyrningen() {
  const kassa = useHamta(() => api.hamta('/api/uthyrning/kassa'));
  if (!kassa.data) return <Vanta />;
  const d = kassa.data;
  const ute = d.ute.filter((a) => a.status === 'ute');
  const vantar = d.ute.filter((a) => a.status === 'bokad');
  return (
    <>
      <Rubrik
        titel="Skiduthyrningen"
        under={`${langDatum(idag())} · utrustning ut och in`}
        knappar={
          <>
            <Lank till="/kassa" className="knapp primar">Till uthyrningen</Lank>
            <a className="knapp" href="/fik/uthyrning" target="_blank" rel="noreferrer">Gästens vy</a>
          </>
        }
      />
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Ute nu" varde={ute.length} />
            <Nyckeltal etikett="Väntar på utlämning" varde={vantar.length} farg={vantar.length ? 'varning' : 'ok'} />
            <Nyckeltal etikett="Hyrt i dag" varde={d.summa} />
          </div>
        </Kort>
      </div>

      <Kort titel="Att lämna ut" undertext="Bokat av gästerna, väntar på att hämtas" tat>
        {vantar.length ? (
          <Tabell
            rader={vantar}
            kolumner={[
              { falt: 'nummer', rubrik: 'Nr', visa: (a) => <strong>{a.nummer}</strong> },
              { falt: 'namn', rubrik: 'Kund', visa: (a) => a.namn || a.mobil || '–' },
              { falt: 'rader', rubrik: 'Utrustning', sortlos: true, visa: (a) => a.rader.map((r) => `${r.antal}× ${r.namn}`).join(', ') },
              { falt: 'belopp', rubrik: 'Summa', sifra: true },
              { falt: 'betald_tid', rubrik: 'Betalt', visa: (a) => (a.betald_tid ? <Bricka farg="ok">{a.betalsatt}</Bricka> : <Bricka farg="fara">nej</Bricka>) },
            ]}
          />
        ) : (
          <Tomt>Inget väntar på utlämning.</Tomt>
        )}
      </Kort>

      <Kort titel="Ute nu" undertext="Ska tillbaka" tat>
        {ute.length ? (
          <Tabell
            rader={ute}
            kolumner={[
              { falt: 'nummer', rubrik: 'Nr' },
              { falt: 'namn', rubrik: 'Kund', visa: (a) => a.namn || a.mobil || '–' },
              { falt: 'rader', rubrik: 'Märkning', sortlos: true, visa: (a) => a.rader.map((r) => r.markning).filter(Boolean).join(', ') || '–' },
              { falt: 'utlamnad_tid', rubrik: 'Ute sedan', visa: (a) => <span className="liten svag">{sedan(a.utlamnad_tid)}</span> },
              { falt: 'retur_senast', rubrik: 'Åter senast' },
            ]}
          />
        ) : (
          <Tomt>Ingen utrustning ute.</Tomt>
        )}
      </Kort>
    </>
  );
}

// ---------- kassören ----------
function EkonomiStart() {
  const period = { fran: plusDagar(idag(), -30), till: idag() };
  const dag = useHamta(() => api.hamta(`/api/bokforing/dagsrapport?datum=${idag()}`));
  const saldon = useHamta(() => api.hamta(`/api/bokforing/saldon${fragestrang(period)}`));
  const ver = useHamta(() => api.hamta(`/api/bokforing/verifikationer${fragestrang(period)}`));
  const fik = useHamta(() => api.hamta('/api/fik/kassa'));
  if (!dag.data || !saldon.data) return <Vanta />;
  const obetalda = (fik.data?.oppna || []).filter((o) => !o.betald_tid);
  return (
    <>
      <Rubrik
        titel="Ekonomi"
        under={`${langDatum(idag())} · bokföring, avgifter och rapporter`}
        knappar={
          <>
            <Lank till="/ekonomi" className="knapp primar">Bokföringen</Lank>
            <a className="knapp" href={`/api/bokforing/sie${fragestrang(period)}`}>SIE-fil</a>
          </>
        }
      />
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="I dag" varde={dag.data.summa} />
            <Nyckeltal etikett="30 dagar" varde={saldon.data.intakter} farg="ok" />
            <Nyckeltal etikett="Resultat" varde={saldon.data.resultat} farg={saldon.data.resultat_ore >= 0 ? 'ok' : 'fara'} />
            <Nyckeltal etikett="Verifikationer" varde={(ver.data?.verifikationer || []).length} />
            <Nyckeltal etikett="Obetalda i kassan" varde={obetalda.length} farg={obetalda.length ? 'varning' : 'ok'} />
          </div>
        </Kort>
      </div>

      <div className="tva">
        <Kort titel="Dagens intäkter" undertext="Per konto" tat>
          <Tabell
            rader={dag.data.intakter}
            nyckel={(i) => i.konto}
            tomtext="Inget bokfört i dag ännu."
            kolumner={[
              { falt: 'konto', rubrik: 'Konto', visa: (i) => <span className="num">{i.konto}</span> },
              { falt: 'namn', rubrik: 'Benämning' },
              { falt: 'belopp', rubrik: 'Belopp', sifra: true },
            ]}
          />
        </Kort>
        <Kort titel="Betalmedel i dag" tat>
          <Tabell
            rader={dag.data.betalmedel}
            nyckel={(b) => b.medel}
            tomtext="Inga betalningar i dag."
            kolumner={[
              { falt: 'medel', rubrik: 'Betalmedel' },
              { falt: 'belopp', rubrik: 'Belopp', sifra: true },
            ]}
          />
        </Kort>
      </div>

      <Kort titel="Senaste verifikationerna" verktyg={<Lank till="/ekonomi" className="knapp liten">Alla</Lank>} tat>
        <Tabell
          rader={(ver.data?.verifikationer || []).slice(0, 12)}
          maxhojd="40vh"
          tomtext="Inget bokfört i perioden."
          kolumner={[
            { falt: 'serie', rubrik: 'Ver', visa: (v) => <span className="num">{v.serie}{v.nummer}</span> },
            { falt: 'datum', rubrik: 'Datum', visa: (v) => <span className="num">{v.datum}</span> },
            { falt: 'beskrivning', rubrik: 'Beskrivning' },
            { falt: 'motpart', rubrik: 'Motpart' },
            { falt: 'belopp', rubrik: 'Belopp', sifra: true },
            { falt: 'skapad_av', rubrik: 'Av' },
          ]}
        />
      </Kort>
    </>
  );
}

// ---------- ordföranden och styrelsen ----------
function Styrelsen() {
  const jag = useJag();
  const oversikt = useHamta(() => api.hamta('/api/oversikt'));
  const forening = useHamta(() => api.hamta('/api/forening'));
  const saldon = useHamta(() => api.hamta(`/api/bokforing/saldon${fragestrang({ fran: plusDagar(idag(), -30), till: idag() })}`));
  const ideer = useHamta(() => api.hamta('/api/ideer'));
  const stod = useHamta(() => api.hamta('/api/traning/stod?regel=lok'));
  const historik = useHamta(() => api.hamta('/api/bokforing/revision?antal=12'));
  if (!oversikt.data) return <Vanta />;
  const d = oversikt.data;
  const nya = (ideer.data?.ideer || []).filter((i) => i.status === 'ny');
  const medlemmar = (forening.data?.sektioner || []).flatMap((s) => s.grupper).reduce((a, g) => a + g.antal_aktiva, 0);

  return (
    <>
      <Rubrik
        titel={`Styrelsen · ${jag.namn.split(' ')[0]}`}
        under={`${langDatum(idag())} · vad som snurrar och vad som behöver göras`}
        knappar={
          <>
            <Lank till="/forening" className="knapp">Föreningen</Lank>
            <Lank till="/ekonomi" className="knapp">Ekonomi</Lank>
          </>
        }
      />
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Öppna ärenden" varde={d.arenden.oppna} farg={d.arenden.oppna > 8 ? 'varning' : undefined} />
            <Nyckeltal etikett="Hål i bemanningen" varde={d.bemanning.hal} farg={d.bemanning.hal ? 'fara' : 'ok'} />
            <Nyckeltal etikett="Intäkter 30 dgr" varde={saldon.data?.intakter ?? '–'} farg="ok" />
            <Nyckeltal etikett="Aktiva i grupper" varde={medlemmar} />
            <Nyckeltal etikett="Nya idéer" varde={nya.length} farg={nya.length ? 'varning' : undefined} />
            <Nyckeltal etikett="LOK-sammankomster" varde={stod.data?.sammankomster ?? '–'} />
          </div>
        </Kort>
      </div>

      <div className="tva">
        <Kort titel="Det här behöver beslutas eller åtgärdas" undertext="Säkerhet och brådskande först">
          {d.arenden.akuta.length ? (
            <ul className="lista">
              {d.arenden.akuta.map((a) => (
                <li key={a.id}>
                  <span className="vaxa">
                    <Lank till={`/arenden?id=${a.id}`}>#{a.id} {a.titel}</Lank>
                    <div className="liten svag">{a.utrustning || a.omrade || 'Allmänt'}</div>
                  </span>
                  <span className="rad">
                    {a.allvarlighet === 'sakerhetsrisk' && <Bricka farg="fara">Säkerhet</Bricka>}
                    <Prioritetsbricka niva={a.prioritet} />
                    <Statusbricka status={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>Inget brådskande just nu.</Tomt>
          )}
        </Kort>

        <Kort titel="Nya idéer från medlemmarna" verktyg={<Lank till="/ideer" className="knapp liten">Idélådan</Lank>}>
          {nya.length ? (
            <ul className="lista">
              {nya.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <span className="vaxa">
                    <strong>{i.rubrik || (i.text || i.transkript || '').slice(0, 50)}</strong>
                    <div className="liten svag">{i.skapad_av} · {sedan(i.skapad)}</div>
                  </span>
                  {i.ljudfil && <Bricka>🎤</Bricka>}
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>Inga olästa idéer.</Tomt>
          )}
        </Kort>
      </div>

      <div className="tva">
        <Kort titel="Styrelsen" tat>
          <Tabell
            rader={forening.data?.styrelse || []}
            tomtext="Inga uppdrag registrerade."
            kolumner={[
              { falt: 'slag', rubrik: 'Post', visa: (u) => forening.data.uppdragsslag[u.slag] || u.slag },
              { falt: 'namn', rubrik: 'Namn' },
              { falt: 'telefon', rubrik: 'Telefon' },
            ]}
          />
        </Kort>
        <Kort titel="Senast i systemet" undertext="Behandlingshistorik" tat>
          <Tabell
            rader={historik.data || []}
            maxhojd="34vh"
            tomtext="Inget loggat."
            kolumner={[
              { falt: 'tid', rubrik: 'När', visa: (r) => <span className="liten num">{tidpunkt(r.tid)}</span> },
              { falt: 'namn', rubrik: 'Vem' },
              { falt: 'handelse', rubrik: 'Vad' },
              { falt: 'objekt', rubrik: 'Objekt' },
            ]}
          />
        </Kort>
      </div>
    </>
  );
}

// ---------- tränaren ----------
function Traningen() {
  const jag = useJag();
  const forening = useHamta(() => api.hamta('/api/forening'));
  const tillfallen = useHamta(() =>
    api.hamta(`/api/traning/tillfallen${fragestrang({ fran: plusDagar(idag(), -14), till: plusDagar(idag(), 21) })}`)
  );
  const stod = useHamta(() => api.hamta('/api/traning/stod?regel=lok'));
  if (!tillfallen.data) return <Vanta />;

  const minaGrupper = (forening.data?.sektioner || [])
    .flatMap((s) => s.grupper)
    .filter((g) => g.tranare.some((t) => t.id === jag.id));
  const mina = minaGrupper.length ? tillfallen.data.filter((t) => minaGrupper.some((g) => g.namn === t.grupp)) : tillfallen.data;
  const kommande = mina.filter((t) => t.datum >= idag()).slice(-8).reverse();
  const utanNarvaro = mina.filter((t) => t.datum < idag() && !t.deltagare);

  return (
    <>
      <Rubrik
        titel={`Träningen · ${jag.namn.split(' ')[0]}`}
        under={minaGrupper.length ? `Dina grupper: ${minaGrupper.map((g) => g.namn).join(', ')}` : 'Alla grupper'}
        knappar={<Lank till="/traning" className="knapp primar">Tillfällen och närvaro</Lank>}
      />
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Mina grupper" varde={minaGrupper.length} />
            <Nyckeltal etikett="Aktiva" varde={minaGrupper.reduce((a, g) => a + g.antal_aktiva, 0)} />
            <Nyckeltal etikett="Närvaro som saknas" varde={utanNarvaro.length} farg={utanNarvaro.length ? 'varning' : 'ok'} />
            <Nyckeltal etikett="LOK-sammankomster" varde={stod.data?.sammankomster ?? '–'} />
          </div>
        </Kort>
      </div>

      {!!utanNarvaro.length && (
        <Kort titel="Ta närvaro" undertext="Tillfällen som varit men inte prickats av" tat>
          <Tabell
            rader={utanNarvaro.slice(0, 10)}
            tomtext=""
            kolumner={[
              { falt: 'datum', rubrik: 'Datum', visa: (t) => <span className="num">{langDatum(t.datum)}</span> },
              { falt: 'grupp', rubrik: 'Grupp' },
              { falt: 'start', rubrik: 'Tid', visa: (t) => <span className="num">{t.start}–{t.slut}</span> },
              { falt: 'atgard', rubrik: '', sortlos: true, visa: () => <Lank till="/traning" className="knapp liten">Pricka av</Lank> },
            ]}
          />
        </Kort>
      )}

      <div className="tva">
        <Kort titel="Kommande träningar" tat>
          <Tabell
            rader={kommande}
            tomtext="Inga kommande tillfällen. Lägg upp träningsfönster."
            kolumner={[
              { falt: 'datum', rubrik: 'Datum', visa: (t) => <span className="num">{langDatum(t.datum)}</span> },
              { falt: 'start', rubrik: 'Tid', visa: (t) => <span className="num">{t.start}–{t.slut}</span> },
              { falt: 'grupp', rubrik: 'Grupp' },
              { falt: 'plats', rubrik: 'Plats' },
            ]}
          />
        </Kort>
        <Kort titel="Mina grupper" tat>
          <Tabell
            rader={minaGrupper}
            tomtext="Du är inte tränare för någon grupp ännu."
            kolumner={[
              { falt: 'namn', rubrik: 'Grupp' },
              { falt: 'aldersspann', rubrik: 'Ålder' },
              { falt: 'antal_aktiva', rubrik: 'Aktiva', sifra: true },
              { falt: 'dag', rubrik: 'Tider', visa: (g) => [g.dag, g.tid].filter(Boolean).join(' ') },
            ]}
          />
        </Kort>
      </div>
    </>
  );
}

// ---------- medlemmen ----------
function Medlemmen() {
  const jag = useJag();
  const mina = useHamta(() => api.hamta('/api/bemanning/mina'));
  const oversikt = useHamta(() => api.hamta('/api/oversikt'));
  if (!mina.data || !oversikt.data) return <Vanta />;
  const lage = mina.data.lage;
  const kommande = mina.data.pass.filter((p) => p.datum >= idag()).slice(0, 5);
  const d = oversikt.data;

  return (
    <>
      <Rubrik
        titel={`Hej ${jag.namn.split(' ')[0]}`}
        under={`${langDatum(idag())} · dina pass, dina ronder och läget i backen`}
        knappar={
          <>
            <a className="knapp" href="/mobil/" target="_blank" rel="noreferrer">Öppna mobilappen</a>
            <Lank till="/bemanning" className="knapp primar">Boka pass</Lank>
          </>
        }
      />

      <div className="rutor bred">
        <Kort titel="Mitt läge">
          {lage.undantagen ? (
            <p className="svag">Du är undantagen från bemanningskvoten.</p>
          ) : (
            <>
              <div className="rad gap-16 hopp">
                <Nyckeltal etikett="Timmar" varde={tal(lage.timmar)} enhet={`/ ${tal(lage.kvot)}`} />
                <Nyckeltal etikett="Nattpass" varde={lage.natt} />
                <Nyckeltal etikett="Kvar" varde={tal(lage.kvar)} enhet="h" farg={lage.kvar > 0 ? 'varning' : 'ok'} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Matare andel={lage.andel} />
                <div className="liten svag" style={{ marginTop: 3 }}>{procent(lage.andel)} av kvoten</div>
              </div>
            </>
          )}
        </Kort>

        <Kort titel="Mina kommande pass" verktyg={<Lank till="/mina" className="knapp liten">Mina sidor</Lank>}>
          {kommande.length ? (
            <ul className="lista">
              {kommande.map((p) => (
                <li key={`${p.datum}-${p.start}-${p.position}`}>
                  <span className="vaxa">
                    <strong>{p.position}</strong>
                    <div className="liten svag">{langDatum(p.datum)} {p.start}–{p.slut}</div>
                  </span>
                  <Bricka farg={p.status === 'tilldelad' ? 'lila' : 'info'}>{p.status}</Bricka>
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>Du har inga pass bokade. Det finns {mina.data.lediga.length} pass som saknar folk.</Tomt>
          )}
        </Kort>

        <Evenemangskort />
        <Rondkort titel="Check-slingor i dag" />
        <Vaderkort kompakt />
        <Arendekort titel="Ärenden i backen" />
      </div>
    </>
  );
}

/**
 * Nästa läger eller tävling man anmält sig till. Samma fråga som passen
 * svarar på – vad har jag framför mig – och därför samma rad av kort.
 * Modulen avgör om kortet finns alls.
 */
function Evenemangskort() {
  const { harModul } = usePlattform();
  const d = useHamta(() => api.hamta('/api/mitt'));
  if (!harModul('evenemang')) return null;
  const mina = d.data?.evenemang || [];
  return (
    <Kort titel="Mina läger och tävlingar" verktyg={<Lank till="/evenemang" className="knapp liten">Allt som är på gång</Lank>}>
      {mina.length ? (
        <ul className="lista">
          {mina.map((e) => (
            <li key={e.id}>
              <span className="vaxa">
                <strong>{e.namn}</strong>
                <div className="liten svag">
                  {langDatum(String(e.start).slice(0, 10))}
                  {e.plats ? ` · ${e.plats}` : ''}
                </div>
              </span>
              {e.min_status === 'reserv' ? (
                <Bricka farg="varning">Reserv</Bricka>
              ) : e.avgift_ore > 0 && !e.betald_tid ? (
                <Bricka farg="varning">Avgift obetald</Bricka>
              ) : (
                <Bricka farg="ok">Anmäld</Bricka>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Tomt>Du är inte anmäld till något. Se vad klubben har på gång.</Tomt>
      )}
    </Kort>
  );
}
