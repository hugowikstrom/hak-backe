// Bemanning: hela schemat som ett rutnät, med bokning, automatplanering och utskick.
import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { api, fragestrang } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Kort, Lada, Matare, Nyckeltal, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import {
  arHelg, DAGNAMN, idag, initialer, kortDatum, langDatum, manadsdag, minstRoll,
  PASSLAG, plusDagar, procent, tal, veckodag,
} from '../nytta.js';

const AKTIVA = ['bokad', 'tilldelad', 'narvarande'];
const radnyckel = (p) => `${p.position_id}|${p.start}|${p.slut}`;

export function Bemanning() {
  const jag = useJag();
  const notis = useNotis();
  const far = minstRoll(jag, 'backansvarig');
  const [fran, sattFran] = useState(() => mandag(idag()));
  const [veckor, sattVeckor] = useState(2);
  const till = plusDagar(fran, veckor * 7 - 1);
  const [baraHal, sattBaraHal] = useState(false);
  const [baraMina, sattBaraMina] = useState(false);
  const [valtPass, sattValtPass] = useState(null);
  const [nyaPass, sattNyaPass] = useState(false);
  const [autoplan, sattAutoplan] = useState(false);
  const [utskick, sattUtskick] = useState(false);

  const rutnat = useHamta(() => api.hamta(`/api/bemanning/rutnat${fragestrang({ fran, till })}`), [fran, till]);
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const lagen = useHamta(() => api.hamta(`/api/bemanning/lage${far ? '?alla=1' : ''}`), [far]);

  const boka = useCallback(
    async (pass) => {
      const min = pass.bokningar.find((b) => b.medlem_id === jag.id && AKTIVA.includes(b.status));
      try {
        if (min) {
          await api.tabort(`/api/bemanning/bokningar/${min.id}`);
          notis(`Avbokad: ${pass.position} ${kortDatum(pass.datum)} ${pass.start}.`);
        } else {
          await api.skapa(`/api/bemanning/pass/${pass.id}/boka`, {});
          notis(`Bokad: ${pass.position} ${langDatum(pass.datum)} ${pass.start}–${pass.slut}.`);
        }
        rutnat.uppdatera();
        lagen.uppdatera();
      } catch (e) {
        notis(e.message, 'fel');
      }
    },
    [jag.id, notis, rutnat, lagen]
  );

  if (rutnat.laddar && !rutnat.data) return <Vanta />;
  if (rutnat.fel) return <div className="meddelande fel">{rutnat.fel}</div>;

  const mittLage = (lagen.data || []).find((l) => l.medlem_id === jag.id);
  const summa = sammanstall(rutnat.data.pass, jag.id);

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Bemanning</h1>
          <div className="undertext">
            {langDatum(fran)} – {langDatum(till)} · {summa.bokade}/{summa.behov} platser fyllda
            {summa.hal ? ` · ${summa.hal} saknas` : ' · fullt'}
          </div>
        </div>
        <div className="knapprad">
          <div className="segment">
            <button onClick={() => sattFran(plusDagar(fran, -7 * veckor))} title="Föregående period">←</button>
            <button onClick={() => sattFran(mandag(idag()))}>I dag</button>
            <button onClick={() => sattFran(plusDagar(fran, 7 * veckor))} title="Nästa period">→</button>
          </div>
          <div className="segment">
            {[1, 2, 4].map((v) => (
              <button key={v} aria-pressed={veckor === v} onClick={() => sattVeckor(v)}>{v} v</button>
            ))}
          </div>
          <a className="knapp" href={`/api/bemanning/schema.csv${fragestrang({ fran, till })}`}>CSV</a>
          {far && (
            <>
              <button onClick={() => sattNyaPass(true)}>Nya pass</button>
              <button onClick={() => sattAutoplan(true)}>Automatplanering</button>
              <button onClick={() => sattUtskick(true)}>Mejla medlemmar</button>
            </>
          )}
        </div>
      </div>

      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Platser" varde={`${summa.bokade}/${summa.behov}`} />
            <Nyckeltal etikett="Saknas" varde={summa.hal} farg={summa.hal ? 'rod' : 'gron'} />
            <Nyckeltal etikett="Mina pass" varde={summa.mina} />
            {mittLage && !mittLage.undantagen && (
              <div className="nyckeltal vaxa">
                <span className="etikett">Min kvot</span>
                <span className="stortal">{tal(mittLage.timmar)}<small>/ {tal(mittLage.kvot)} h</small></span>
                <Matare andel={mittLage.andel} />
              </div>
            )}
          </div>
        </Kort>
        <Kort>
          <div className="legend">
            <span><i style={{ background: 'var(--gron-mjuk)' }} />Fullt</span>
            <span><i style={{ background: 'var(--gul-mjuk)' }} />Delvis</span>
            <span><i style={{ background: 'var(--rod-mjuk)' }} />Tomt</span>
            <span><span className="initial jag">DU</span> din bokning</span>
            <span><span className="initial auto">AP</span> autoplanerad</span>
            <span className="svagare">
              <span className="tasta">piltangent</span> flytta ·{' '}
              <span className="tasta">mellanslag</span> boka/avboka ·{' '}
              <span className="tasta">enter</span> öppna passet
            </span>
          </div>
          <div className="rad hopp" style={{ marginTop: 8 }}>
            <Ruta etikett="Bara pass med hål" pa={baraHal} satt={sattBaraHal} />
            <Ruta etikett="Bara mina pass" pa={baraMina} satt={sattBaraMina} />
          </div>
        </Kort>
      </div>

      <Kort tat>
        <Rutnat
          data={rutnat.data}
          jag={jag}
          baraHal={baraHal}
          baraMina={baraMina}
          vidBokning={boka}
          vidOppna={(p) => sattValtPass(p)}
        />
      </Kort>

      {far && lagen.data && (
        <Kort titel="Medlemmarnas läge" undertext="Sorterat på minst uppfylld kvot först" tat>
          <Tabell
            rader={lagen.data.filter((l) => !l.undantagen)}
            nyckel={(l) => l.medlem_id}
            maxhojd="40vh"
            kolumner={[
              { falt: 'namn', rubrik: 'Medlem', visa: (l) => <strong>{l.namn}</strong> },
              { falt: 'timmar', rubrik: 'Timmar', sifra: true, visa: (l) => tal(l.timmar) },
              { falt: 'kvot', rubrik: 'Kvot', sifra: true, visa: (l) => tal(l.kvot) },
              {
                falt: 'andel', rubrik: 'Uppfyllt', bredd: 170,
                visa: (l) => (
                  <div className="rad">
                    <span className="vaxa"><Matare andel={l.andel} /></span>
                    <span className="num liten">{procent(l.andel)}</span>
                  </div>
                ),
              },
              { falt: 'kvar', rubrik: 'Kvar h', sifra: true, visa: (l) => (l.kvar ? <Bricka farg="gul">{tal(l.kvar)}</Bricka> : <Bricka farg="gron">klar</Bricka>) },
              { falt: 'antal_pass', rubrik: 'Pass', sifra: true },
              { falt: 'natt', rubrik: 'Natt', sifra: true },
              { falt: 'helg', rubrik: 'Helg', sifra: true },
            ]}
          />
        </Kort>
      )}

      {valtPass && (
        <PassLada
          pass={valtPass}
          far={far}
          jag={jag}
          medlemmar={medlemmar.data || []}
          stang={() => sattValtPass(null)}
          uppdaterat={() => { rutnat.uppdatera(); lagen.uppdatera(); }}
        />
      )}
      {nyaPass && (
        <NyaPassLada
          positioner={rutnat.data.positioner}
          fran={fran}
          till={till}
          stang={() => sattNyaPass(false)}
          klar={() => { sattNyaPass(false); rutnat.uppdatera(); notis('Passen skapade.'); }}
        />
      )}
      {autoplan && (
        <AutoplanLada
          fran={fran}
          till={till}
          positioner={rutnat.data.positioner}
          stang={() => sattAutoplan(false)}
          klar={() => { sattAutoplan(false); rutnat.uppdatera(); lagen.uppdatera(); }}
        />
      )}
      {utskick && (
        <UtskickLada fran={fran} till={till} stang={() => sattUtskick(false)} />
      )}
    </>
  );
}

const mandag = (datum) => plusDagar(datum, -veckodag(datum));

function sammanstall(pass, jagId) {
  let behov = 0;
  let bokade = 0;
  let hal = 0;
  let mina = 0;
  for (const p of pass) {
    const n = p.bokningar.filter((b) => AKTIVA.includes(b.status)).length;
    behov += p.behov;
    bokade += Math.min(n, p.behov);
    hal += Math.max(0, p.behov - n);
    if (p.bokningar.some((b) => b.medlem_id === jagId && AKTIVA.includes(b.status))) mina += 1;
  }
  return { behov, bokade, hal, mina };
}

/** Själva rutnätet: rader = position och passtid, kolumner = datum. */
function Rutnat({ data, jag, baraHal, baraMina, vidBokning, vidOppna }) {
  const ramp = useRef(null);
  const jagId = jag.id;
  const [markerad, sattMarkerad] = useState(null);
  // Positioner med rollkrav som jag inte uppfyller går inte att boka själv.
  const obehorig = useMemo(() => {
    const m = new Map();
    for (const p of data.positioner) m.set(p.id, p.kravs_roll && !minstRoll(jag, p.kravs_roll) ? p.kravs_roll : null);
    return m;
  }, [data.positioner, jag]);

  const { rader, celler } = useMemo(() => {
    const celler = new Map();
    const rader = new Map();
    for (const p of data.pass) {
      const nyckel = radnyckel(p);
      if (!rader.has(nyckel))
        rader.set(nyckel, {
          nyckel, position_id: p.position_id, position: p.position, farg: p.farg,
          start: p.start, slut: p.slut, slag: p.slag, timmar: p.timmar, pass: [],
        });
      rader.get(nyckel).pass.push(p);
      celler.set(`${nyckel}@${p.datum}`, p);
    }
    const ordning = new Map(data.positioner.map((p, i) => [p.id, i]));
    let lista = [...rader.values()].sort(
      (a, b) => (ordning.get(a.position_id) ?? 99) - (ordning.get(b.position_id) ?? 99) || a.start.localeCompare(b.start)
    );
    if (baraHal)
      lista = lista.filter((r) =>
        r.pass.some((p) => p.bokningar.filter((b) => AKTIVA.includes(b.status)).length < p.behov)
      );
    if (baraMina)
      lista = lista.filter((r) =>
        r.pass.some((p) => p.bokningar.some((b) => b.medlem_id === jagId && AKTIVA.includes(b.status)))
      );
    return { rader: lista, celler };
  }, [data, baraHal, baraMina, jagId]);

  const flytta = (e, radIndex, dagIndex) => {
    const dagar = data.dagar.length;
    let r = radIndex;
    let d = dagIndex;
    if (e.key === 'ArrowRight') d += 1;
    else if (e.key === 'ArrowLeft') d -= 1;
    else if (e.key === 'ArrowDown') r += 1;
    else if (e.key === 'ArrowUp') r -= 1;
    else return false;
    e.preventDefault();
    if (r < 0 || r >= rader.length || d < 0 || d >= dagar) return true;
    const mal = ramp.current?.querySelector(`[data-ruta="${r}:${d}"]`);
    mal?.focus();
    sattMarkerad(`${r}:${d}`);
    return true;
  };

  if (!rader.length) return <Tomt>Inga pass i perioden. Skapa pass med “Nya pass”.</Tomt>;

  let sistaPosition = null;

  return (
    <div className="rutnatsramp" ref={ramp}>
      <table className="rutnat">
        <thead>
          <tr>
            <th className="hornruta">Position och tid</th>
            {data.dagar.map((d) => (
              <th key={d.datum} className={d.helg ? 'helgdag' : undefined} title={`Vecka ${d.vecka}`}>
                <span className="dagnamn">{DAGNAMN[veckodag(d.datum)]}</span>
                {manadsdag(d.datum)}/{Number(d.datum.slice(5, 7))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rader.map((r, ri) => {
            const nyPosition = r.position !== sistaPosition;
            sistaPosition = r.position;
            return (
              <Fragment key={r.nyckel}>
                {nyPosition && (
                  <tr className="gruppsrad">
                    <th className="gruppen" scope="row">
                      <span className="prick" style={{ background: r.farg, marginRight: 6 }} />
                      {r.position}
                    </th>
                    {data.dagar.map((d) => (
                      <td key={d.datum} className={d.helg ? 'helgdag' : undefined} />
                    ))}
                  </tr>
                )}
                <tr>
                  <th className="radrubrik" scope="row">
                    <span className="tid">{r.start}–{r.slut}</span>{' '}
                    <span className="liten svag">{PASSLAG[r.slag]} {tal(r.timmar)} h</span>
                  </th>
                  {data.dagar.map((d, di) => {
                    const p = celler.get(`${r.nyckel}@${d.datum}`);
                    if (!p)
                      return <td key={d.datum} className={`cell obokbar${d.helg ? ' helgdag' : ''}`} />;
                    const bokade = p.bokningar.filter((b) => AKTIVA.includes(b.status));
                    const min = bokade.find((b) => b.medlem_id === jagId);
                    const klass =
                      bokade.length >= p.behov ? 'full' : bokade.length ? 'delvis' : 'tom';
                    const kravs = obehorig.get(p.position_id);
                    const ruta = `${ri}:${di}`;
                    return (
                      <td
                        key={d.datum}
                        className={`cell ${klass}${d.helg ? ' helgdag' : ''}${min ? ' mitt' : ''}${kravs ? ' obehorig' : ''}${markerad === ruta ? ' markerad' : ''}`}
                      >
                        <button
                          className="cellknapp"
                          data-ruta={ruta}
                          title={`${p.position} ${langDatum(p.datum)} ${p.start}–${p.slut}\n${bokade.map((b) => b.namn).join(', ') || 'ingen bokad'}\n${
                            kravs ? `Kräver rollen ${kravs} – enter visar passet` : `Klicka för att ${min ? 'avboka' : 'boka'}, enter för att öppna`
                          }`}
                          onFocus={() => sattMarkerad(ruta)}
                          onClick={(e) => (e.shiftKey || e.altKey ? vidOppna(p) : vidBokning(p))}
                          onDoubleClick={() => vidOppna(p)}
                          onKeyDown={(e) => {
                            if (flytta(e, ri, di)) return;
                            if (e.key === ' ') { e.preventDefault(); vidBokning(p); }
                            else if (e.key === 'Enter') { e.preventDefault(); vidOppna(p); }
                          }}
                        >
                          <span className="namnrad">
                            {bokade.slice(0, 3).map((b) => (
                              <span
                                key={b.id}
                                className={`initial${b.medlem_id === jagId ? ' jag' : ''}${b.kalla === 'auto' ? ' auto' : ''}`}
                                title={`${b.namn}${b.kalla === 'auto' ? ' (autoplanerad)' : ''}`}
                              >
                                {initialer(b.namn)}
                              </span>
                            ))}
                            {bokade.length > 3 && <span className="initial">+{bokade.length - 3}</span>}
                          </span>
                          <span className="antal">
                            {bokade.length}/{p.behov}
                            {p.anteckning ? ' ✎' : ''}
                            {kravs ? ' 🔒' : ''}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PassLada({ pass, far, jag, medlemmar, stang, uppdaterat }) {
  const notis = useNotis();
  const { data, laddar, uppdatera } = useHamta(
    () => api.hamta(`/api/bemanning/rutnat${fragestrang({ fran: pass.datum, till: pass.datum })}`),
    [pass.id]
  );
  const [lagg, sattLagg] = useState('');
  const aktuellt = data?.pass.find((p) => p.id === pass.id) || pass;
  const bokningar = aktuellt.bokningar.filter((b) => b.status !== 'avbokad');
  const min = bokningar.find((b) => b.medlem_id === jag.id);

  const gor = async (fn, meddelande) => {
    try {
      await fn();
      uppdatera();
      uppdaterat();
      if (meddelande) notis(meddelande);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      titel={`${aktuellt.position} · ${langDatum(aktuellt.datum)} ${aktuellt.start}–${aktuellt.slut}`}
      stang={stang}
      fot={
        <>
          {far && (
            <button
              className="fara"
              onClick={() =>
                confirm('Ta bort passet?') &&
                gor(() => api.tabort(`/api/bemanning/pass/${aktuellt.id}`), 'Passet borttaget.').then(stang)
              }
            >
              Ta bort passet
            </button>
          )}
          <span className="vaxa" />
          {min ? (
            <button onClick={() => gor(() => api.tabort(`/api/bemanning/bokningar/${min.id}`), 'Avbokad.')}>Avboka mig</button>
          ) : (
            <button className="primar" onClick={() => gor(() => api.skapa(`/api/bemanning/pass/${aktuellt.id}/boka`, {}), 'Bokad.')}>
              Boka mig
            </button>
          )}
          <button onClick={stang}>Stäng</button>
        </>
      }
    >
      <div className="rad hopp">
        <Bricka farg={bokningar.length >= aktuellt.behov ? 'gron' : bokningar.length ? 'gul' : 'rod'}>
          {bokningar.length}/{aktuellt.behov} platser
        </Bricka>
        <Bricka farg={aktuellt.slag === 'natt' ? 'natt' : ''}>{PASSLAG[aktuellt.slag]}</Bricka>
        <Bricka>{tal(aktuellt.timmar)} h</Bricka>
        {arHelg(aktuellt.datum) && <Bricka farg="natt">Helg</Bricka>}
      </div>
      {aktuellt.anteckning && <p className="brodtext">{aktuellt.anteckning}</p>}

      {laddar && !data ? (
        <Vanta />
      ) : (
        <ul className="lista kort" style={{ boxShadow: 'none' }}>
          {bokningar.map((b) => (
            <li key={b.id}>
              <span className="vaxa">
                <span className="initial" style={{ marginRight: 6 }}>{initialer(b.namn)}</span>
                {b.namn}
                {b.kalla === 'auto' && <span className="liten svagare"> autoplanerad</span>}
              </span>
              <span className="rad">
                {far ? (
                  <select
                    value={b.status}
                    onChange={(e) => gor(() => api.spara(`/api/bemanning/bokningar/${b.id}`, { status: e.target.value }))}
                    style={{ width: 130 }}
                  >
                    <option value="bokad">Bokad</option>
                    <option value="tilldelad">Tilldelad</option>
                    <option value="narvarande">Närvarande</option>
                    <option value="uteblev">Uteblev</option>
                    <option value="avbokad">Avbokad</option>
                  </select>
                ) : (
                  <Bricka>{b.status}</Bricka>
                )}
                {(far || b.medlem_id === jag.id) && (
                  <button className="liten fara" onClick={() => gor(() => api.tabort(`/api/bemanning/bokningar/${b.id}`), 'Bokningen borttagen.')}>
                    ✕
                  </button>
                )}
              </span>
            </li>
          ))}
          {!bokningar.length && <li><span className="svagare">Ingen är bokad på passet.</span></li>}
        </ul>
      )}

      {far && (
        <>
          <div className="rad" style={{ alignItems: 'flex-end' }}>
            <div className="vaxa">
              <Val
                etikett="Lägg till medlem" varde={lagg} satt={sattLagg} tomtext="– välj –"
                poster={medlemmar
                  .filter((m) => m.aktiv && !bokningar.some((b) => b.medlem_id === m.id))
                  .map((m) => ({ varde: m.id, text: m.namn }))}
              />
            </div>
            <button
              disabled={!lagg}
              onClick={() =>
                gor(() => api.skapa(`/api/bemanning/pass/${aktuellt.id}/boka`, { medlem_id: lagg }), 'Medlem inbokad.').then(() => sattLagg(''))
              }
            >
              Lägg till
            </button>
          </div>
          <div className="faltrad">
            <Text
              etikett="Behov" typ="number" varde={aktuellt.behov}
              satt={(v) => gor(() => api.spara(`/api/bemanning/pass/${aktuellt.id}`, { behov: v }))}
            />
            <Text
              etikett="Start" varde={aktuellt.start}
              satt={(v) => gor(() => api.spara(`/api/bemanning/pass/${aktuellt.id}`, { start: v }))}
            />
            <Text
              etikett="Slut" varde={aktuellt.slut}
              satt={(v) => gor(() => api.spara(`/api/bemanning/pass/${aktuellt.id}`, { slut: v }))}
            />
            <Text
              etikett="Anteckning" varde={aktuellt.anteckning || ''}
              satt={(v) => gor(() => api.spara(`/api/bemanning/pass/${aktuellt.id}`, { anteckning: v }))}
            />
          </div>
        </>
      )}
    </Lada>
  );
}

function NyaPassLada({ positioner, fran, till, stang, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({
    fran, till, start: '17:00', slut: '21:00', behov: 1, anteckning: '',
  });
  const [valda, sattValda] = useState([]);
  const [dagar, sattDagar] = useState([0, 1, 2, 3, 4, 5, 6]);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  const vaxla = (lista, satt, v) =>
    satt(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  const datumlista = useMemo(() => {
    const ut = [];
    let d = f.fran;
    while (d <= f.till && ut.length < 200) {
      if (dagar.includes(veckodag(d))) ut.push(d);
      d = plusDagar(d, 1);
    }
    return ut;
  }, [f.fran, f.till, dagar]);

  const skicka = async () => {
    try {
      await api.skapa('/api/bemanning/pass', {
        dagar: datumlista,
        positioner: valda,
        start: f.start,
        slut: f.slut,
        behov: f.behov,
        anteckning: f.anteckning || null,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      titel="Nya pass"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={!valda.length || !datumlista.length} onClick={skicka}>
            Skapa {datumlista.length * valda.length} pass
          </button>
        </>
      }
    >
      <div className="faltrad">
        <Text etikett="Från" typ="date" varde={f.fran} satt={satt('fran')} />
        <Text etikett="Till" typ="date" varde={f.till} satt={satt('till')} />
        <Text etikett="Start" varde={f.start} satt={satt('start')} placeholder="17:00" />
        <Text etikett="Slut" varde={f.slut} satt={satt('slut')} placeholder="21:00" />
        <Text etikett="Personer per pass" typ="number" min="1" varde={f.behov} satt={satt('behov')} />
      </div>
      <div>
        <h4>Veckodagar</h4>
        <div className="segment">
          {DAGNAMN.map((d, i) => (
            <button key={d} aria-pressed={dagar.includes(i)} onClick={() => vaxla(dagar, sattDagar, i)}>{d}</button>
          ))}
        </div>
      </div>
      <div>
        <h4>Positioner</h4>
        <div className="knapprad">
          {positioner.map((p) => (
            <button
              key={p.id}
              aria-pressed={valda.includes(p.id)}
              className={valda.includes(p.id) ? 'primar liten' : 'liten'}
              onClick={() => vaxla(valda, sattValda, p.id)}
            >
              {p.namn}
            </button>
          ))}
        </div>
      </div>
      <Text etikett="Anteckning" varde={f.anteckning} satt={satt('anteckning')} />
      <div className="meddelande info">
        {datumlista.length} datum × {valda.length} positioner. Finns passet redan uppdateras det i stället.
      </div>
    </Lada>
  );
}

function AutoplanLada({ fran, till, positioner, stang, klar }) {
  const notis = useNotis();
  const [period, sattPeriod] = useState({ fran, till });
  const [tak, sattTak] = useState('1.25');
  const [forslag, sattForslag] = useState(null);
  const [kor, sattKor] = useState(false);

  const posnamn = useMemo(() => new Map(positioner.map((p) => [p.id, p.namn])), [positioner]);

  const rakna = async () => {
    sattKor(true);
    try {
      const r = await api.skapa('/api/bemanning/autoplan', { ...period, torrkor: true, tak: Number(tak) || null });
      sattForslag(r);
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattKor(false);
    }
  };

  const skriv = async () => {
    sattKor(true);
    try {
      const r = await api.skapa('/api/bemanning/autoplan', { ...period, torrkor: false, tak: Number(tak) || null });
      notis(`${r.skrivna} pass tilldelade.`);
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattKor(false);
    }
  };

  return (
    <Lada
      bred
      titel="Automatplanering"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Stäng</button>
          <button onClick={rakna} disabled={kor}>{kor ? 'Räknar …' : 'Räkna om förslag'}</button>
          <button className="primar" disabled={!forslag?.tilldelningar.length || kor} onClick={skriv}>
            Skriv in {forslag?.tilldelningar.length || 0} tilldelningar
          </button>
        </>
      }
    >
      <p className="brodtext">
        Planeringen fyller bara pass som saknar folk. Den räknar in det medlemmen redan bokat under säsongen
        och jämnar ut timmar, nattpass och helgpass. Otillgänglighet, kompetens och krockar respekteras.
      </p>
      <div className="faltrad">
        <Text etikett="Från" typ="date" varde={period.fran} satt={(v) => sattPeriod((p) => ({ ...p, fran: v }))} />
        <Text etikett="Till" typ="date" varde={period.till} satt={(v) => sattPeriod((p) => ({ ...p, till: v }))} />
        <Val
          etikett="Tak mot kvoten" varde={tak} satt={sattTak} tomtext={null}
          poster={[
            { varde: '1', text: '100 % av kvoten' },
            { varde: '1.25', text: '125 % av kvoten' },
            { varde: '1.5', text: '150 % av kvoten' },
            { varde: '', text: 'Inget tak' },
          ]}
        />
      </div>

      {!forslag ? (
        <div className="meddelande info">Tryck på “Räkna om förslag” för att se vad planeringen vill göra.</div>
      ) : (
        <>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Tilldelningar" varde={forslag.tilldelningar.length} />
            <Nyckeltal etikett="Kvar obemannat" varde={forslag.otillsatta.length} farg={forslag.otillsatta.length ? 'gul' : 'gron'} />
            <Nyckeltal etikett="Spridning kvot" varde={tal(forslag.spridning.andel_std, 2)} />
            <Nyckeltal etikett="Nattspann" varde={forslag.spridning.natt_spann} />
            <Nyckeltal etikett="Helgspann" varde={forslag.spridning.helg_spann} />
          </div>
          <div className="tva">
            <div>
              <h4>Förslag</h4>
              <Tabell
                rader={forslag.tilldelningar}
                nyckel={(t) => `${t.pass_id}-${t.medlem_id}`}
                maxhojd="34vh"
                kolumner={[
                  { falt: 'datum', rubrik: 'Datum', visa: (t) => <span className="num">{kortDatum(t.datum)}</span> },
                  { falt: 'start', rubrik: 'Tid', visa: (t) => <span className="num">{t.start}–{t.slut}</span> },
                  { falt: 'position_id', rubrik: 'Position', visa: (t) => posnamn.get(t.position_id) },
                  { falt: 'namn', rubrik: 'Medlem' },
                  { falt: 'slag', rubrik: 'Typ', visa: (t) => PASSLAG[t.slag] },
                ]}
              />
            </div>
            <div>
              <h4>Så blir fördelningen</h4>
              <Tabell
                rader={forslag.efter}
                nyckel={(e) => e.medlem_id}
                maxhojd="34vh"
                kolumner={[
                  { falt: 'namn', rubrik: 'Medlem' },
                  { falt: 'timmar', rubrik: 'Timmar', sifra: true, visa: (e) => `${tal(e.timmar)}/${tal(e.kvot)}` },
                  { falt: 'antal', rubrik: 'Pass', sifra: true },
                  { falt: 'natt', rubrik: 'Natt', sifra: true },
                  { falt: 'helg', rubrik: 'Helg', sifra: true },
                ]}
              />
              {!!forslag.otillsatta.length && (
                <div className="meddelande varning" style={{ marginTop: 8 }}>
                  {forslag.otillsatta.length} platser kunde inte fyllas.
                  {' '}
                  {[...new Set(forslag.otillsatta.map((o) => o.orsak))].join(' · ')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Lada>
  );
}

function UtskickLada({ fran, till, stang }) {
  const notis = useNotis();
  const [period, sattPeriod] = useState({ fran, till });
  const [bara, sattBara] = useState(true);
  const [kor, sattKor] = useState(false);
  const [resultat, sattResultat] = useState(null);

  const skicka = async () => {
    sattKor(true);
    try {
      const r = await api.skapa('/api/bemanning/utskick', { ...period, bara_under_kvot: bara });
      sattResultat(r);
      notis(`${r.skickade} av ${r.antal} brev skickade.`);
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattKor(false);
    }
  };

  return (
    <Lada
      titel="Mejla medlemmar om bemanningen"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Stäng</button>
          <button className="primar" disabled={kor} onClick={skicka}>{kor ? 'Skickar …' : 'Skicka'}</button>
        </>
      }
    >
      <p className="brodtext">
        Varje medlem får sitt eget kvotläge, sina bokade pass i perioden och en lista på pass som saknar folk.
      </p>
      <div className="faltrad">
        <Text etikett="Från" typ="date" varde={period.fran} satt={(v) => sattPeriod((p) => ({ ...p, fran: v }))} />
        <Text etikett="Till" typ="date" varde={period.till} satt={(v) => sattPeriod((p) => ({ ...p, till: v }))} />
      </div>
      <Ruta etikett="Bara de som inte fyllt sin kvot" pa={bara} satt={sattBara} />
      {resultat && (
        <>
          <div className="skiljare" />
          <Tabell
            rader={resultat.resultat}
            nyckel={(r) => r.medlem_id}
            maxhojd="34vh"
            kolumner={[
              { falt: 'namn', rubrik: 'Medlem' },
              { falt: 'epost', rubrik: 'E-post' },
              {
                falt: 'skickad', rubrik: 'Status',
                visa: (r) => (r.skickad ? <Bricka farg="gron">Skickad</Bricka> : <Bricka farg="rod">{r.fel || 'Fel'}</Bricka>),
              },
            ]}
          />
        </>
      )}
    </Lada>
  );
}
