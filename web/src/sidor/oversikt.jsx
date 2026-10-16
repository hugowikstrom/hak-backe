// Startsidan: nuläge för snöläggning, ärenden, bemanning och mitt eget läge.
import { api } from '../api.js';
import { Lank, useJag } from '../app.jsx';
import { Bricka, Kort, Linjegraf, Matare, Nyckeltal, Prioritetsbricka, Statusbricka, Tomt, useHamta, Vanta } from '../delar/bitar.jsx';
import {
  grader, idag, initialer, KLARTECKEN, klockslag, kortDatum, langDatum, procent,
  prognosstund, prognostimme, sedan, tal, UTRUSTNINGSTYP,
} from '../nytta.js';

export function Oversikt() {
  const jag = useJag();
  const { data, laddar, fel } = useHamta(() => api.hamta('/api/oversikt'));
  const serie = useHamta(() => api.hamta('/api/sno/matningar?antal=60'));
  const vader = useHamta(() => api.hamta('/api/vader'));
  const ronder = useHamta(() => api.hamta('/api/checklistor/lage'));

  if (laddar && !data) return <Vanta />;
  if (fel) return <div className="meddelande fel">{fel}</div>;

  const kt = data.sno.klartecken;
  const m = data.sno.senasteMatning;
  const lage = data.mitt_lage;
  const punkter = (serie.data || [])
    .filter((r) => r.wetbulb != null)
    .slice(0, 48)
    .reverse()
    .map((r) => ({ x: klockslag(r.tid), a: r.wetbulb, b: r.lufttemp }));

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>God dag, {jag.namn.split(' ')[0]}</h1>
          <div className="undertext">{langDatum(idag())} · läget i backen just nu</div>
        </div>
        <div className="knapprad">
          <Lank till="/snolaggning" className="knapp">Rapportera mätning</Lank>
          <Lank till="/arenden" className="knapp">Nytt ärende</Lank>
        </div>
      </div>

      <div className="rutor bred">
        <Kort titel="Snöläggning – klartecken" undertext={m ? `Senaste mätning ${sedan(m.tid)}` : 'Ingen mätning rapporterad'}>
          <div className={`klartecken ${kt.niva}`}>
            <div className="lampa">{kt.wetbulb != null ? tal(kt.wetbulb) : '?'}</div>
            <div className="kolumn" style={{ gap: 2 }}>
              <strong>{KLARTECKEN[kt.niva]}</strong>
              <span className="liten svag">{kt.text}</span>
              {kt.vatten != null && <span className="liten">Rekommenderad vattenmängd: <strong>{kt.vatten} %</strong></span>}
            </div>
          </div>
          {m && (
            <>
              <div className="skiljare" />
              <div className="rad hopp gap-16">
                <Nyckeltal etikett="Lufttemp" varde={tal(m.lufttemp)} enhet="°C" />
                <Nyckeltal etikett="Fukt" varde={m.luftfukt ?? '–'} enhet="%" />
                <Nyckeltal etikett="Flöde" varde={tal(m.vattenflode)} enhet="l/s" />
                <Nyckeltal etikett="Vattentryck" varde={tal(m.vattentryck)} enhet="bar" />
              </div>
              {punkter.length > 1 && <Linjegraf punkter={punkter} etikett_a="wetbulb" etikett_b="lufttemp" />}
            </>
          )}
          {data.sno.pass && (
            <div className="meddelande info" style={{ marginTop: 8 }}>
              Snöpass pågår sedan {kortDatum(data.sno.pass.start.slice(0, 10))} {klockslag(data.sno.pass.start)}
              {data.sno.pass.ansvarig ? ` · ansvarig ${data.sno.pass.ansvarig}` : ''}
              {data.sno.pass.anteckning ? ` · ${data.sno.pass.anteckning}` : ''}
            </div>
          )}
        </Kort>

        <Kort titel="Mitt läge" undertext="Säsongens insatser">
          {lage.undantagen ? (
            <p className="svag">Du är undantagen från bemanningskvoten.</p>
          ) : (
            <>
              <div className="rad gap-16 hopp">
                <Nyckeltal etikett="Timmar" varde={tal(lage.timmar)} enhet={`/ ${tal(lage.kvot)}`} />
                <Nyckeltal etikett="Nattpass" varde={lage.natt} />
                <Nyckeltal etikett="Helgpass" varde={lage.helg} />
                <Nyckeltal etikett="Kvar" varde={tal(lage.kvar)} enhet="h" farg={lage.kvar > 0 ? 'gul' : 'gron'} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Matare andel={lage.andel} />
                <div className="rad-mellan liten svag" style={{ marginTop: 3 }}>
                  <span>{procent(lage.andel)} av kvoten</span>
                  <span>{tal(lage.utfort)} h utfört · {tal(lage.planerat)} h planerat</span>
                </div>
              </div>
              <div className="skiljare" />
              <Lank till="/mina" className="knapp liten">Mina pass och insatser</Lank>
            </>
          )}
        </Kort>

        <Kort titel="Ärenden" undertext={`${data.arenden.oppna} öppna`} verktyg={<Lank till="/arenden" className="knapp liten">Alla</Lank>}>
          {data.arenden.akuta.length ? (
            <ul className="lista">
              {data.arenden.akuta.map((a) => (
                <li key={a.id}>
                  <span className="vaxa">
                    <Lank till={`/arenden?id=${a.id}`}>#{a.id} {a.titel}</Lank>
                    <div className="liten svag">{a.utrustning || a.omrade || 'Allmänt'}</div>
                  </span>
                  <span className="rad">
                    {a.allvarlighet === 'sakerhetsrisk' && <Bricka farg="rod">Säkerhet</Bricka>}
                    <Prioritetsbricka niva={a.prioritet} />
                    <Statusbricka status={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>Inga akuta ärenden. Fint.</Tomt>
          )}
        </Kort>

        <Kort
          titel="Bemanning i dag"
          undertext={`${data.bemanning.hal} pass med hål den närmaste veckan`}
          verktyg={<Lank till="/bemanning" className="knapp liten">Schemat</Lank>}
        >
          {data.bemanning.idag.length ? (
            <ul className="lista">
              {data.bemanning.idag.map((p) => {
                const bokade = p.bokningar.filter((b) => b.status !== 'avbokad');
                return (
                  <li key={p.id}>
                    <span className="vaxa">
                      <strong>{p.position}</strong>
                      <span className="num svag liten"> {p.start}–{p.slut}</span>
                      <div className="rad liten" style={{ gap: 3, marginTop: 2 }}>
                        {bokade.map((b) => (
                          <span key={b.id} className="initial" title={b.namn}>{initialer(b.namn)}</span>
                        ))}
                        {!bokade.length && <span className="svagare">ingen bokad</span>}
                      </div>
                    </span>
                    <Bricka farg={bokade.length >= p.behov ? 'gron' : bokade.length ? 'gul' : 'rod'}>
                      {bokade.length}/{p.behov}
                    </Bricka>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Tomt>Inga pass i dag.</Tomt>
          )}
        </Kort>

        <Kort
          titel="Väder och produktionsfönster"
          undertext={vader.data ? `${vader.data.plats.namn} · ${vader.data.kallor.map((k) => k.namn).join(' och ')}` : 'Hämtar prognos …'}
          verktyg={<Lank till="/snolaggning" className="knapp liten">Prognos</Lank>}
        >
          {vader.fel && <div className="meddelande varning">{vader.fel}</div>}
          {vader.data && (
            <>
              <div className="rad gap-16 hopp">
                <Nyckeltal etikett="Wetbulb nu" varde={tal(vader.data.nu?.wetbulb)} enhet="°C" />
                <Nyckeltal etikett="Lufttemp" varde={tal(vader.data.nu?.temp)} enhet="°C" />
                <Nyckeltal
                  etikett="Produktion 48 h"
                  varde={vader.data.h48.produktionstimmar}
                  enhet="h"
                  farg={vader.data.h48.produktionstimmar ? 'gron' : 'rod'}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                {vader.data.h48.fonster.length ? (
                  <div className="meddelande ok">
                    Nästa fönster: {prognosstund(vader.data.h48.fonster[0].fran)} –{' '}
                    {prognosstund(vader.data.h48.fonster[0].till)} ({vader.data.h48.fonster[0].timmar} h, ned till{' '}
                    {tal(vader.data.h48.fonster[0].lagsta)} °C)
                  </div>
                ) : (
                  <div className="meddelande varning">Inget produktionsfönster de närmaste två dygnen.</div>
                )}
              </div>
              {vader.data.h48.punkter.length > 1 && (
                <div style={{ marginTop: 8 }}>
                  <Linjegraf
                    punkter={vader.data.h48.punkter.map((p) => ({ x: prognostimme(p.tid), a: p.wetbulb, b: p.temp }))}
                    hojd={110}
                    etikett_a="wetbulb"
                    etikett_b="lufttemp"
                    grans={-2.5}
                  />
                </div>
              )}
            </>
          )}
        </Kort>

        <Kort
          titel="Ronder att göra"
          undertext={ronder.data ? `${ronder.data.kvar} kvar i dag · ${ronder.data.klara} gjorda` : 'Hämtar …'}
          verktyg={<Lank till="/checklistor" className="knapp liten">Checklistor</Lank>}
        >
          {ronder.data && (ronder.data.mallar.filter((m) => m.kvar).length ? (
            <ul className="lista">
              {ronder.data.mallar
                .filter((m) => m.kvar)
                .slice(0, 6)
                .map((m) => (
                  <li key={m.mall_id}>
                    <span className="vaxa">
                      <strong>{m.namn}</strong>
                      <div className="liten svag">
                        {m.objekt.filter((o) => o.behovs).slice(0, 4).map((o) => o.namn).join(', ')}
                        {m.kvar > 4 ? ` +${m.kvar - 4}` : ''}
                      </div>
                    </span>
                    <Bricka farg={m.kvar ? 'gul' : 'gron'}>{m.kvar} kvar</Bricka>
                  </li>
                ))}
            </ul>
          ) : (
            <Tomt>Allt som skulle göras i dag är gjort.</Tomt>
          ))}
        </Kort>

        <Kort titel="Checklistor" undertext={`${data.checklistor.avvikelser_7d} avvikelser senaste veckan`} verktyg={<Lank till="/checklistor" className="knapp liten">Öppna</Lank>}>
          {data.checklistor.pagar.length ? (
            <ul className="lista">
              {data.checklistor.pagar.map((k) => (
                <li key={k.id}>
                  <span className="vaxa">
                    <Lank till={`/checklistor?korning=${k.id}`}>{k.mall}</Lank>
                    <div className="liten svag">{k.utrustning || 'Allmänt'} · {k.av}</div>
                  </span>
                  <span className="liten svag">{sedan(k.startad)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>Inga pågående körningar.</Tomt>
          )}
        </Kort>

        <Kort titel="Utrustning som inte är i drift">
          {data.utrustning_ur_drift.length ? (
            <ul className="lista">
              {data.utrustning_ur_drift.map((u) => (
                <li key={u.id}>
                  <span className="vaxa">
                    <strong>{u.namn}</strong>
                    <div className="liten svag">{UTRUSTNINGSTYP[u.typ]} · {u.omrade}</div>
                  </span>
                  <Bricka farg={u.status === 'ur_drift' ? 'rod' : 'gul'}>
                    {u.status === 'ur_drift' ? 'Ur drift' : 'Service'}
                  </Bricka>
                </li>
              ))}
            </ul>
          ) : (
            <Tomt>All utrustning är i drift.</Tomt>
          )}
        </Kort>

        {!!data.arenden.mina.length && (
          <Kort titel="Tilldelat mig">
            <ul className="lista">
              {data.arenden.mina.map((a) => (
                <li key={a.id}>
                  <Lank till={`/arenden?id=${a.id}`} className="vaxa">#{a.id} {a.titel}</Lank>
                  <span className="rad">
                    <Prioritetsbricka niva={a.prioritet} />
                    <Statusbricka status={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          </Kort>
        )}
      </div>
    </>
  );
}
