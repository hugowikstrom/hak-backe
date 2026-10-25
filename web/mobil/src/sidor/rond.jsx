// Själva ronden: en punkt i taget, med avvikelse, värde och bild.
import { useMemo, useState } from 'react';
import { krympBild } from '../api.js';
import { useRuta } from '../app.jsx';
import {
  antalAvvikelser, antalBesvarade, hamtaRond, obesvarade, obesvaradObligatorisk, obesvaradSakerhet,
  sattSvar, synka, taBortRond, uppdateraRond,
} from '../ko.js';
import { Ark, Bricka, Framsteg, Omrade, Segment, Tomt, useNat, useNotis, Vanta } from '../delar.jsx';

export function Rond({ vy, ronder }) {
  const { ga, tillbaka } = useRuta();
  const notis = useNotis();
  const online = useNat();
  const rond = ronder.find((r) => r.lokalId === vy.lokalId) || hamtaRond(vy.lokalId);
  const [lage, sattLage] = useState('steg');
  const [index, sattIndex] = useState(() => {
    const r = hamtaRond(vy.lokalId);
    if (!r) return 0;
    const i = r.punkter.findIndex((p) => !r.svar[p.id]);
    return i < 0 ? 0 : i;
  });
  const [avvikelse, sattAvvikelse] = useState(null);
  const [avsluta, sattAvsluta] = useState(false);

  const punkt = rond?.punkter[index];
  const klara = rond ? antalBesvarade(rond) : 0;
  const saknas = useMemo(() => (rond ? obesvarade(rond).filter((p) => p.obligatorisk) : []), [rond]);
  // Två slags luckor, med helt olika följder: säkerhetskontroller stoppar
  // avslutet, övriga obligatoriska kräver en motivering.
  const saknadSakerhet = useMemo(() => (rond ? obesvaradSakerhet(rond) : []), [rond]);
  const saknadObligatorisk = useMemo(() => (rond ? obesvaradObligatorisk(rond) : []), [rond]);

  if (!rond) return <Tomt>Ronden finns inte längre.</Tomt>;

  if (rond.klar) {
    return (
      <Klar
        rond={rond}
        online={online}
        hem={() => ga('hem')}
        skicka={async () => {
          const r = await synka();
          notis(r.kvar ? 'Fortfarande ingen kontakt – ligger kvar i telefonen.' : 'Skickad.');
        }}
      />
    );
  }

  const svara = (data, gaVidare = true) => {
    sattSvar(rond.lokalId, punkt.id, data);
    synka().catch(() => {});
    if (gaVidare) nasta();
  };

  const nasta = () => {
    const r = hamtaRond(rond.lokalId);
    const kvar = r.punkter.findIndex((p, i) => i > index && !r.svar[p.id]);
    if (kvar >= 0) sattIndex(kvar);
    else if (index < r.punkter.length - 1) sattIndex(index + 1);
    else sattAvsluta(true);
  };

  return (
    <>
      <div className="rondtopp">
        <div className="rad-mellan">
          <div className="vaxa">
            <h1 style={{ fontSize: 19 }}>{rond.mallnamn}</h1>
            {rond.objektnamn && <div className="liten svag">{rond.objektnamn}</div>}
          </div>
          <div className="segment" style={{ flex: '0 0 auto' }}>
            <button aria-pressed={lage === 'steg'} onClick={() => sattLage('steg')}>Steg</button>
            <button aria-pressed={lage === 'lista'} onClick={() => sattLage('lista')}>Lista</button>
          </div>
        </div>
        <Framsteg andel={(klara / rond.punkter.length) * 100} />
        <div className="rad-mellan liten svag">
          <span>{klara} av {rond.punkter.length} besvarade</span>
          {antalAvvikelser(rond) > 0 && <Bricka farg="fara">{antalAvvikelser(rond)} avvikelser</Bricka>}
        </div>
      </div>

      {lage === 'steg' ? (
        <Punktkort
          punkt={punkt}
          index={index}
          antal={rond.punkter.length}
          svar={rond.svar[punkt.id]}
          svara={svara}
          avvik={() => sattAvvikelse(punkt)}
          ejTillamplig={() => {
            const skal = prompt('Varför går kontrollen inte att utföra?');
            if (skal?.trim()) svara({ ej_tillampligt: true, motivering: skal.trim(), bockad: false });
          }}
          bak={() => sattIndex(Math.max(0, index - 1))}
          fram={nasta}
        />
      ) : (
        <div className="kort lista">
          {rond.punkter.map((p, i) => {
            const s = rond.svar[p.id];
            const klar = s && (s.bockad || s.varde != null || s.text || s.avvikelse || s.ej_tillampligt);
            return (
              <button
                key={p.id}
                className={`punktrad${s?.avvikelse ? ' avvikande' : klar ? ' klar' : ''}`}
                onClick={() => {
                  sattIndex(i);
                  sattLage('steg');
                }}
              >
                <span className="markor">{s?.avvikelse ? '!' : klar ? '✓' : i + 1}</span>
                <span>
                  {p.text}
                  {p.sakerhetskritisk && <span className="bricka rod liten"> säkerhet</span>}
                  {s?.varde != null && <span className="liten svag"> — {s.varde} {p.enhet || ''}</span>}
                  {s?.kommentar && <span className="liten svag" style={{ display: 'block' }}>{s.kommentar}</span>}
                </span>
                {s?.bild && <img className="miniatyr" src={s.bild.startsWith('data:') ? s.bild : `/api/bilder/${s.bild}`} alt="" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="knapprad">
        <button
          className="fara"
          onClick={() => {
            if (confirm('Avbryt ronden? Det som fyllts i försvinner.')) {
              taBortRond(rond.lokalId);
              ga('hem');
            }
          }}
        >
          Avbryt
        </button>
        <button className="primar" onClick={() => sattAvsluta(true)}>Avsluta rond</button>
      </div>

      {avvikelse && (
        <AvvikelseArk
          punkt={avvikelse}
          svar={rond.svar[avvikelse.id]}
          stang={() => sattAvvikelse(null)}
          spara={(data) => {
            sattSvar(rond.lokalId, avvikelse.id, { ...data, avvikelse: true, bockad: false });
            synka().catch(() => {});
            sattAvvikelse(null);
            notis('Avvikelse noterad – blir ett ärende när ronden avslutas.');
            nasta();
          }}
        />
      )}

      {avsluta && (
        <AvslutaArk
          saknadSakerhet={saknadSakerhet}
          saknadObligatorisk={saknadObligatorisk}
          rond={rond}
          saknas={saknas}
          online={online}
          stang={() => sattAvsluta(false)}
          slutfor={async ({ anteckning, motivering, kvittens }) => {
            uppdateraRond(rond.lokalId, { klar: true, anteckning, motivering, kvittens });
            sattAvsluta(false);
            await synka().catch(() => {});
          }}
          tillPunkt={(p) => {
            sattIndex(rond.punkter.findIndex((x) => x.id === p.id));
            sattLage('steg');
            sattAvsluta(false);
          }}
        />
      )}
    </>
  );
}

function Punktkort({ punkt, index, antal, svar, svara, avvik, ejTillamplig, bak, fram }) {
  const [varde, sattVarde] = useState(svar?.varde ?? '');
  const [text, sattText] = useState(svar?.text ?? '');
  // Byt punkt => nollställ fälten.
  const [senaste, sattSenaste] = useState(punkt.id);
  if (senaste !== punkt.id) {
    sattSenaste(punkt.id);
    sattVarde(svar?.varde ?? '');
    sattText(svar?.text ?? '');
  }

  return (
    <div className="punktkort">
      <div className="rad-mellan">
        <span className="rakning">Punkt {index + 1} av {antal}</span>
        {punkt.sakerhetskritisk ? (
          <span className="bricka rod">säkerhetskontroll</span>
        ) : !punkt.obligatorisk ? (
          <span className="bricka">frivillig</span>
        ) : null}
        {svar?.avvikelse && <span className="bricka rod">avvikelse</span>}
        {svar?.ej_tillampligt && <span className="bricka">ej tillämplig</span>}
      </div>
      <div className="fraga">{punkt.text}</div>
      {punkt.hjalptext && <div className="hjalp">{punkt.hjalptext}</div>}

      {punkt.svarstyp === 'varde' && (
        <label className="falt">
          <span>Värde {punkt.enhet ? `(${punkt.enhet})` : ''}</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={varde}
            onChange={(e) => sattVarde(e.target.value)}
            style={{ fontSize: 26, minHeight: 60, fontWeight: 700 }}
            autoFocus
          />
        </label>
      )}

      {punkt.svarstyp === 'text' && (
        <Omrade etikett="Noteringar" varde={text} satt={sattText} placeholder="Skriv här" />
      )}

      {svar?.bild && (
        <img className="bildruta" src={svar.bild.startsWith('data:') ? svar.bild : `/api/bilder/${svar.bild}`} alt="Bild till avvikelsen" />
      )}
      {svar?.kommentar && <div className="meddelande varning">{svar.kommentar}</div>}

      <div className="svarsknappar">
        {punkt.svarstyp === 'bock' ? (
          <button className="ok" onClick={() => svara({ bockad: true, avvikelse: false, kommentar: null })}>
            OK
          </button>
        ) : (
          <button
            className="ok"
            disabled={punkt.svarstyp === 'varde' ? varde === '' : !text.trim()}
            onClick={() =>
              svara(
                punkt.svarstyp === 'varde'
                  ? { varde: Number(varde), bockad: true, avvikelse: false }
                  : { text: text.trim(), bockad: true, avvikelse: false }
              )
            }
          >
            Spara
          </button>
        )}
        <button className="avvik" onClick={avvik}>Avvikelse</button>
      </div>

      {/* En säkerhetskontroll går inte att skriva bort. Den utförs eller
          lämnas obesvarad, och då syns den som saknad hela vägen. */}
      {!punkt.sakerhetskritisk && (
        <button className="tom ejtillamplig" onClick={ejTillamplig}>
          Går inte att utföra just nu
        </button>
      )}

      <div className="rad-mellan">
        <button className="tom" onClick={bak} disabled={index === 0}>‹ Föregående</button>
        <button className="tom" onClick={fram}>Hoppa över ›</button>
      </div>
    </div>
  );
}

function AvvikelseArk({ punkt, svar, stang, spara }) {
  const notis = useNotis();
  const [kommentar, sattKommentar] = useState(svar?.kommentar ?? '');
  const [bild, sattBild] = useState(svar?.bild ?? null);
  const [arbetar, sattArbetar] = useState(false);

  const taBild = async (e) => {
    const fil = e.target.files?.[0];
    if (!fil) return;
    sattArbetar(true);
    try {
      sattBild(await krympBild(fil));
    } catch (err) {
      notis(err.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  return (
    <Ark
      titel="Avvikelse"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={arbetar} onClick={() => spara({ kommentar: kommentar.trim() || null, bild })}>
            Spara avvikelse
          </button>
        </>
      }
    >
      <p className="liten svag" style={{ margin: 0 }}>{punkt.text}</p>
      <Omrade
        etikett="Vad är fel?"
        varde={kommentar}
        satt={sattKommentar}
        placeholder="Beskriv kort – texten blir ett ärende."
        autoFocus
      />
      {bild ? (
        <>
          <img className="bildruta" src={bild.startsWith('data:') ? bild : `/api/bilder/${bild}`} alt="Bild till avvikelsen" />
          <button onClick={() => sattBild(null)}>Ta bort bilden</button>
        </>
      ) : (
        <label className="knapp full" style={{ minHeight: 52 }}>
          {arbetar ? 'Bearbetar bilden …' : '📷  Ta bild'}
          <input type="file" accept="image/*" capture="environment" onChange={taBild} style={{ display: 'none' }} />
        </label>
      )}
      <div className="meddelande info">
        Avvikelsen blir ett ärende med prioritet Hög när ronden avslutas.
      </div>
    </Ark>
  );
}

function AvslutaArk({ rond, saknas, saknadSakerhet, saknadObligatorisk, online, stang, slutfor, tillPunkt }) {
  const [anteckning, sattAnteckning] = useState('');
  const [motivering, sattMotivering] = useState('');
  const [beslut, sattBeslut] = useState('');
  const [kvittensord, sattKvittensord] = useState('');
  const avvikelser = rond.punkter.filter((p) => rond.svar[p.id]?.avvikelse);

  // Säkerhetskontroller går inte att lämna. Knappen stängs, och det står
  // varför – inte som en gåta att klura ut.
  const stoppad = saknadSakerhet.length > 0;
  const kravMotivering = saknadObligatorisk.length > 0 && !motivering.trim();
  const kravKvittens = rond.kraver_kvittens && !beslut;
  const kravBeslutsord = beslut === 'driftklar' && saknadObligatorisk.length > 0 && !kvittensord.trim();

  const hinder = stoppad
    ? 'Säkerhetskontroller saknar svar'
    : kravMotivering
      ? 'Motivera de obesvarade punkterna'
      : kravKvittens
        ? 'Ta ställning till driftläget'
        : kravBeslutsord
          ? 'Motivera beslutet'
          : null;

  return (
    <Ark
      titel="Avsluta ronden"
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Tillbaka</button>
          <button
            className="primar"
            disabled={!!hinder}
            title={hinder || undefined}
            onClick={() =>
              slutfor({
                anteckning: anteckning.trim() || null,
                motivering: motivering.trim() || null,
                kvittens: beslut
                  ? { beslut, anteckning: kvittensord.trim() || null }
                  : null,
              })
            }
          >
            {hinder || 'Slutför'}
          </button>
        </>
      }
    >
      <div className="rad hopp">
        <Bricka farg="ok">{antalBesvarade(rond)} av {rond.punkter.length} besvarade</Bricka>
        {!!avvikelser.length && <Bricka farg="fara">{avvikelser.length} avvikelser</Bricka>}
        {!online && <Bricka farg="varning">offline</Bricka>}
      </div>

      {stoppad && (
        <>
          <div className="meddelande fel">
            <strong>Ronden kan inte avslutas.</strong> {saknadSakerhet.length} säkerhetskontroller
            saknar svar. De går inte att hoppa över – utför dem, eller rapportera en avvikelse.
          </div>
          <div className="kort lista">
            {saknadSakerhet.map((p) => (
              <button key={p.id} className="punktrad avvikande" onClick={() => tillPunkt(p)}>
                <span className="markor">!</span>
                <span>{p.text}</span>
                <span className="pil">›</span>
              </button>
            ))}
          </div>
        </>
      )}

      {!!saknadObligatorisk.length && (
        <>
          <div className="meddelande varning">
            {saknadObligatorisk.length} obligatoriska punkter saknar svar. Ronden avslutas då
            <strong> med brist</strong>, inte som godkänd, och det syns i historiken.
          </div>
          <div className="kort lista">
            {saknadObligatorisk.map((p) => (
              <button key={p.id} className="punktrad" onClick={() => tillPunkt(p)}>
                <span className="markor">!</span>
                <span>{p.text}</span>
                <span className="pil">›</span>
              </button>
            ))}
          </div>
          <Omrade
            etikett="Varför lämnas de obesvarade?"
            varde={motivering}
            satt={sattMotivering}
            placeholder="Skyltarna kommer med leveransen i morgon"
          />
        </>
      )}

      {!!avvikelser.length && (
        <div className="kort lista">
          {avvikelser.map((p) => (
            <div key={p.id} className="punktrad avvikande">
              <span className="markor">!</span>
              <span>
                {p.text}
                {rond.svar[p.id].kommentar && (
                  <span className="liten svag" style={{ display: 'block' }}>{rond.svar[p.id].kommentar}</span>
                )}
              </span>
              {rond.svar[p.id].bild && (
                <img className="miniatyr" src={rond.svar[p.id].bild.startsWith('data:') ? rond.svar[p.id].bild : `/api/bilder/${rond.svar[p.id].bild}`} alt="" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Kvittensen är ett eget beslut av en människa. Appen räknar inte
          ut om liften får köra – den frågar den som ansvarar. */}
      {!!rond.kraver_kvittens && (
        <div className="kvittens">
          <p className="liten svag" style={{ margin: '0 0 8px' }}>
            Den här ronden ska kvitteras. Du tar ställning, inte appen.
          </p>
          <Segment
            poster={[
              { varde: 'driftklar', text: 'Driftklar' },
              { varde: 'ej_driftklar', text: 'Ej driftklar' },
            ]}
            varde={beslut}
            satt={sattBeslut}
          />
          {!!beslut && (
            <Omrade
              etikett={
                beslut === 'driftklar'
                  ? 'Underlag för beslutet'
                  : 'Vad gör att den inte är driftklar?'
              }
              varde={kvittensord}
              satt={sattKvittensord}
            />
          )}
        </div>
      )}

      <Omrade etikett="Anteckning om ronden (frivillig)" varde={anteckning} satt={sattAnteckning} />
    </Ark>
  );
}

function Klar({ rond, online, hem, skicka }) {
  const avvikelser = rond.punkter.filter((p) => rond.svar[p.id]?.avvikelse).length;
  return (
    <div className="kort">
      <div className="slutford">
        <div className="bock">{rond.avslutad ? '✓' : '↑'}</div>
        <h1>{rond.avslutad ? 'Ronden är klar' : 'Sparad i telefonen'}</h1>
        <p className="svag" style={{ margin: 0 }}>
          {rond.mallnamn}
          {rond.objektnamn ? ` · ${rond.objektnamn}` : ''}
        </p>
        <div className="rad hopp" style={{ justifyContent: 'center' }}>
          <Bricka farg="ok">{antalBesvarade(rond)} av {rond.punkter.length} besvarade</Bricka>
          {!!avvikelser && <Bricka farg="fara">{avvikelser} avvikelser</Bricka>}
        </div>

        {rond.avslutad ? (
          rond.resultat?.arenden?.length ? (
            <div className="meddelande varning" style={{ textAlign: 'left', width: '100%' }}>
              <strong>Ärenden som skapades:</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                {rond.resultat.arenden.map((a) => (
                  <li key={a.id}>#{a.id} {a.titel}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="meddelande ok" style={{ width: '100%' }}>Inga avvikelser att åtgärda.</div>
          )
        ) : (
          <div className="meddelande varning" style={{ width: '100%' }}>
            {rond.fel
              ? `Kunde inte skickas: ${rond.fel}`
              : online
                ? 'Skickar till servern …'
                : 'Skickas automatiskt när telefonen får täckning.'}
          </div>
        )}

        <div className="knapprad" style={{ width: '100%' }}>
          {!rond.avslutad && <button onClick={skicka}>Försök skicka</button>}
          <button className="primar" onClick={hem}>Till start</button>
        </div>
      </div>
    </div>
  );
}
