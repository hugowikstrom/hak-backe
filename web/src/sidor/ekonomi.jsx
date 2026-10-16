// Ekonomi: verifikationer, dagsrapport, resultat och export till bokföringen.
import { useState } from 'react';
import { api, fragestrang } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Lada, Nyckeltal, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { idag, langDatum, plusDagar, tidpunkt } from '../nytta.js';

const far = (jag, b) => (jag.behorigheter || []).includes(b);

export function Ekonomi() {
  const jag = useJag();
  const [flik, sattFlik] = useState('verifikationer');
  const [period, sattPeriod] = useState({ fran: plusDagar(idag(), -30), till: idag() });

  if (!far(jag, 'ekonomi_las'))
    return <div className="meddelande fel">Ekonomin kräver behörighet. Prata med kassören eller ordföranden.</div>;

  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Ekonomi</h1>
          <div className="undertext">
            Bokföring enligt dubbel bokföring · verifikationer kan inte ändras i efterhand
          </div>
        </div>
        <div className="knapprad">
          <Text etikett="" typ="date" varde={period.fran} satt={(v) => sattPeriod((p) => ({ ...p, fran: v }))} />
          <Text etikett="" typ="date" varde={period.till} satt={(v) => sattPeriod((p) => ({ ...p, till: v }))} />
          <a className="knapp" href={`/api/bokforing/sie${fragestrang(period)}`}>Hämta SIE-fil</a>
        </div>
      </div>

      <Flikar
        flikar={[
          { nyckel: 'verifikationer', text: 'Verifikationer' },
          { nyckel: 'dag', text: 'Dagsrapport' },
          { nyckel: 'resultat', text: 'Resultat' },
          { nyckel: 'avgifter', text: 'Medlemsavgifter' },
          { nyckel: 'historik', text: 'Behandlingshistorik' },
        ]}
        aktiv={flik}
        satt={sattFlik}
      />

      {flik === 'verifikationer' && <Verifikationer period={period} jag={jag} />}
      {flik === 'dag' && <Dagsrapport />}
      {flik === 'resultat' && <Resultat period={period} />}
      {flik === 'avgifter' && <Avgifter jag={jag} />}
      {flik === 'historik' && <Historik />}
    </>
  );
}

function Verifikationer({ period, jag }) {
  const notis = useNotis();
  const { data, laddar, uppdatera } = useHamta(
    () => api.hamta(`/api/bokforing/verifikationer${fragestrang(period)}`),
    [period.fran, period.till]
  );
  const [valt, sattValt] = useState(null);
  const [ny, sattNy] = useState(false);

  if (laddar && !data) return <Vanta />;

  return (
    <>
      <Kort
        titel={`Verifikationer ${period.fran} – ${period.till}`}
        undertext={`${data.verifikationer.length} stycken`}
        verktyg={far(jag, 'ekonomi') && <button className="primar liten" onClick={() => sattNy(true)}>Bokför manuellt</button>}
        tat
      >
        <Tabell
          rader={data.verifikationer}
          maxhojd="56vh"
          tomtext="Inget bokfört i perioden."
          vidKlick={(v) => sattValt(v)}
          kolumner={[
            { falt: 'serie', rubrik: 'Ver', visa: (v) => <strong className="num">{v.serie}{v.nummer}</strong> },
            { falt: 'datum', rubrik: 'Datum', visa: (v) => <span className="num">{v.datum}</span> },
            { falt: 'beskrivning', rubrik: 'Beskrivning' },
            { falt: 'motpart', rubrik: 'Motpart' },
            { falt: 'belopp', rubrik: 'Belopp', sifra: true },
            { falt: 'skapad_av', rubrik: 'Bokförd av' },
            { falt: 'bokford', rubrik: 'Bokförd', visa: (v) => <span className="liten svag">{tidpunkt(v.bokford)}</span> },
            {
              falt: 'rattar_id', rubrik: '',
              visa: (v) => (v.rattar_id ? <Bricka farg="varning">rättelse</Bricka> : ''),
            },
          ]}
        />
      </Kort>

      {valt && (
        <VerifikationsLada
          id={valt.id}
          jag={jag}
          stang={() => sattValt(null)}
          uppdaterat={() => { uppdatera(); sattValt(null); }}
        />
      )}
      {ny && (
        <ManuellLada
          stang={() => sattNy(false)}
          klar={() => { sattNy(false); uppdatera(); notis('Bokfört.'); }}
        />
      )}
    </>
  );
}

function VerifikationsLada({ id, jag, stang, uppdaterat }) {
  const notis = useNotis();
  const { data: v, laddar } = useHamta(() => api.hamta(`/api/bokforing/verifikationer/${id}`), [id]);
  const [anledning, sattAnledning] = useState('');

  if (laddar && !v) return <Lada titel="Verifikation" stang={stang}><Vanta /></Lada>;

  const underlag = v.underlag ? JSON.parse(v.underlag) : null;
  return (
    <Lada
      bred
      titel={`Verifikation ${v.serie}${v.nummer}`}
      stang={stang}
      fot={
        <>
          {far(jag, 'ekonomi') && !v.rattad_av && !v.rattar_id && (
            <>
              <Text etikett="" varde={anledning} satt={sattAnledning} placeholder="Varför rättas den?" />
              <button
                className="fara"
                onClick={async () => {
                  try {
                    await api.skapa(`/api/bokforing/verifikationer/${v.id}/rattelse`, { anledning });
                    notis('Rättelse bokförd.');
                    uppdaterat();
                  } catch (e) {
                    notis(e.message, 'fel');
                  }
                }}
              >
                Bokför rättelse
              </button>
            </>
          )}
          <button className="primar" onClick={stang}>Stäng</button>
        </>
      }
    >
      <div className="rad hopp">
        <Bricka>{v.datum}</Bricka>
        <Bricka>{v.belopp}</Bricka>
        {v.motpart && <Bricka>{v.motpart}</Bricka>}
        <span className="liten svag">Bokförd {tidpunkt(v.bokford)} av {v.skapad_av}</span>
      </div>
      <p className="brodtext">{v.beskrivning}</p>

      {v.rattad_av && (
        <div className="meddelande varning">
          Rättad med verifikation {v.rattad_av.serie}{v.rattad_av.nummer}.
        </div>
      )}
      {v.rattar_id && <div className="meddelande info">Det här är en rättelse av en tidigare verifikation.</div>}

      <Tabell
        rader={v.rader}
        tomtext="Inga rader."
        kolumner={[
          { falt: 'konto', rubrik: 'Konto', visa: (r) => <span className="num">{r.konto}</span> },
          { falt: 'beskrivning', rubrik: 'Text' },
          { falt: 'debet_ore', rubrik: 'Debet', sifra: true, visa: (r) => (r.debet_ore ? (r.debet_ore / 100).toLocaleString('sv-SE') : '') },
          { falt: 'kredit_ore', rubrik: 'Kredit', sifra: true, visa: (r) => (r.kredit_ore ? (r.kredit_ore / 100).toLocaleString('sv-SE') : '') },
          { falt: 'momssats', rubrik: 'Moms', sifra: true, visa: (r) => (r.momssats ? `${Math.round(r.momssats * 100)} %` : '–') },
        ]}
      />

      {underlag && (
        <>
          <h4>Underlag</h4>
          <pre className="brodtext liten" style={{ background: 'var(--yta-3)', padding: 10, borderRadius: 6, overflow: 'auto' }}>
            {JSON.stringify(underlag, null, 1)}
          </pre>
        </>
      )}
    </Lada>
  );
}

function ManuellLada({ stang, klar }) {
  const notis = useNotis();
  const konton = useHamta(() => api.hamta('/api/bokforing/konton'));
  const [f, sattF] = useState({ serie: 'D', datum: idag(), beskrivning: '', motpart: '' });
  const [rader, sattRader] = useState([
    { konto: '1930', debet: '', kredit: '' },
    { konto: '3990', debet: '', kredit: '' },
  ]);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  const tal = (v) => Math.round(Number(String(v).replace(',', '.') || 0) * 100);
  const debet = rader.reduce((a, r) => a + tal(r.debet), 0);
  const kredit = rader.reduce((a, r) => a + tal(r.kredit), 0);

  return (
    <Lada
      bred
      titel="Bokför manuellt"
      stang={stang}
      fot={
        <>
          <span className="vaxa liten svag">
            Debet {(debet / 100).toLocaleString('sv-SE')} · Kredit {(kredit / 100).toLocaleString('sv-SE')}
            {debet !== kredit ? ' — balanserar inte' : ''}
          </span>
          <button onClick={stang}>Avbryt</button>
          <button
            className="primar"
            disabled={!f.beskrivning.trim() || debet === 0 || debet !== kredit}
            onClick={async () => {
              try {
                await api.skapa('/api/bokforing/verifikationer', {
                  ...f,
                  rader: rader
                    .filter((r) => r.konto && (tal(r.debet) || tal(r.kredit)))
                    .map((r) => ({ konto: r.konto, debet_ore: tal(r.debet), kredit_ore: tal(r.kredit) })),
                });
                klar();
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Bokför
          </button>
        </>
      }
    >
      <div className="faltrad">
        <Val
          etikett="Serie" varde={f.serie} satt={satt('serie')} tomtext={null}
          poster={[
            { varde: 'D', text: 'D – Diverse' }, { varde: 'K', text: 'K – Kiosk' },
            { varde: 'U', text: 'U – Uthyrning' }, { varde: 'M', text: 'M – Medlem' },
          ]}
        />
        <Text etikett="Datum" typ="date" varde={f.datum} satt={satt('datum')} />
        <Text etikett="Beskrivning" varde={f.beskrivning} satt={satt('beskrivning')} />
        <Text etikett="Motpart" varde={f.motpart} satt={satt('motpart')} />
      </div>
      <div className="tabellramp">
        <table className="data">
          <thead><tr><th>Konto</th><th>Debet</th><th>Kredit</th><th /></tr></thead>
          <tbody>
            {rader.map((r, i) => (
              <tr key={i}>
                <td className="redigerbar">
                  <select value={r.konto} onChange={(e) => sattRader((l) => l.map((x, j) => (j === i ? { ...x, konto: e.target.value } : x)))}>
                    {(konton.data || []).map((k) => (
                      <option key={k.nummer} value={k.nummer}>{k.nummer} {k.namn}</option>
                    ))}
                  </select>
                </td>
                <td className="redigerbar">
                  <input value={r.debet} onChange={(e) => sattRader((l) => l.map((x, j) => (j === i ? { ...x, debet: e.target.value } : x)))} />
                </td>
                <td className="redigerbar">
                  <input value={r.kredit} onChange={(e) => sattRader((l) => l.map((x, j) => (j === i ? { ...x, kredit: e.target.value } : x)))} />
                </td>
                <td>
                  <button className="liten tom fara" onClick={() => sattRader((l) => l.filter((_, j) => j !== i))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="liten" onClick={() => sattRader((l) => [...l, { konto: '1910', debet: '', kredit: '' }])}>
        Lägg till rad
      </button>
    </Lada>
  );
}

function Dagsrapport() {
  const [datum, sattDatum] = useState(idag());
  const { data, laddar } = useHamta(() => api.hamta(`/api/bokforing/dagsrapport?datum=${datum}`), [datum]);
  if (laddar && !data) return <Vanta />;
  return (
    <>
      <Kort
        titel={`Dagsrapport ${langDatum(data.datum)}`}
        verktyg={<Text etikett="" typ="date" varde={datum} satt={sattDatum} />}
      >
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Omsättning" varde={data.summa} />
          <Nyckeltal etikett="Verifikationer" varde={data.verifikationer} />
          <Nyckeltal etikett="Moms" varde={data.moms} />
        </div>
      </Kort>
      <div className="tva">
        <Kort titel="Intäkter per konto" tat>
          <Tabell
            rader={data.intakter}
            nyckel={(i) => i.konto}
            tomtext="Inget bokfört den dagen."
            kolumner={[
              { falt: 'konto', rubrik: 'Konto', visa: (i) => <span className="num">{i.konto}</span> },
              { falt: 'namn', rubrik: 'Benämning' },
              { falt: 'belopp', rubrik: 'Belopp', sifra: true },
            ]}
          />
        </Kort>
        <Kort titel="Betalmedel" tat>
          <Tabell
            rader={data.betalmedel}
            nyckel={(b) => b.medel}
            tomtext="Inga betalningar."
            kolumner={[
              { falt: 'medel', rubrik: 'Betalmedel' },
              { falt: 'konto', rubrik: 'Konto', visa: (b) => <span className="num">{b.konto}</span> },
              { falt: 'belopp', rubrik: 'Belopp', sifra: true },
            ]}
          />
        </Kort>
      </div>
    </>
  );
}

function Resultat({ period }) {
  const { data, laddar } = useHamta(
    () => api.hamta(`/api/bokforing/saldon${fragestrang(period)}`),
    [period.fran, period.till]
  );
  if (laddar && !data) return <Vanta />;
  return (
    <>
      <Kort titel={`Resultat ${data.fran} – ${data.till}`}>
        <div className="rad gap-16 hopp">
          <Nyckeltal etikett="Intäkter" varde={data.intakter} farg="ok" />
          <Nyckeltal etikett="Kostnader" varde={data.kostnader} />
          <Nyckeltal etikett="Resultat" varde={data.resultat} farg={data.resultat_ore >= 0 ? 'ok' : 'fara'} />
        </div>
      </Kort>
      <Kort titel="Konton" tat>
        <Tabell
          rader={data.saldon}
          nyckel={(s) => s.konto}
          tomtext="Inget bokfört i perioden."
          kolumner={[
            { falt: 'konto', rubrik: 'Konto', visa: (s) => <span className="num">{s.konto}</span> },
            { falt: 'namn', rubrik: 'Benämning' },
            { falt: 'slag', rubrik: 'Slag' },
            { falt: 'debet', rubrik: 'Debet', sifra: true },
            { falt: 'kredit', rubrik: 'Kredit', sifra: true },
            { falt: 'saldo', rubrik: 'Saldo', sifra: true },
          ]}
        />
      </Kort>
    </>
  );
}

function Avgifter({ jag }) {
  const notis = useNotis();
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [valt, sattValt] = useState(null);
  const [belopp, sattBelopp] = useState('450');
  const [betalmedel, sattBetalmedel] = useState('swish');

  return (
    <Kort
      titel="Medlemsbetalningar"
      undertext="Bokförs i serie M mot konto 3110 Medlemsavgifter"
      tat
    >
      <div className="kropp faltrad">
        <Val
          etikett="Medlem"
          varde={valt || ''}
          satt={sattValt}
          tomtext="– välj –"
          poster={(medlemmar.data || []).filter((m) => m.aktiv).map((m) => ({ varde: m.id, text: m.namn }))}
        />
        <Text etikett="Belopp (kr)" varde={belopp} satt={sattBelopp} />
        <Val
          etikett="Betalmedel" varde={betalmedel} satt={sattBetalmedel} tomtext={null}
          poster={[
            { varde: 'swish', text: 'Swish' }, { varde: 'kort', text: 'Kort' },
            { varde: 'kontant', text: 'Kontant' }, { varde: 'faktura', text: 'Faktura' },
          ]}
        />
        <button
          className="primar"
          disabled={!valt || !far(jag, 'ekonomi')}
          onClick={async () => {
            try {
              const v = await api.skapa('/api/bokforing/medlemsbetalning', {
                medlem_id: valt,
                belopp_ore: Math.round(Number(belopp.replace(',', '.')) * 100),
                betalmedel,
              });
              notis(`Bokfört som ${v.serie}${v.nummer}.`);
            } catch (e) {
              notis(e.message, 'fel');
            }
          }}
        >
          Bokför betalning
        </button>
      </div>
      {!far(jag, 'ekonomi') && (
        <div className="kropp">
          <div className="meddelande info">Du kan läsa ekonomin men inte bokföra. Det gör kassören eller ordföranden.</div>
        </div>
      )}
    </Kort>
  );
}

function Historik() {
  const { data, laddar } = useHamta(() => api.hamta('/api/bokforing/revision?antal=300'));
  if (laddar && !data) return <Vanta />;
  return (
    <Kort titel="Behandlingshistorik" undertext="Vem gjorde vad. Raderna kan inte ändras eller tas bort." tat>
      <Tabell
        rader={data}
        maxhojd="60vh"
        tomtext="Inget loggat ännu."
        kolumner={[
          { falt: 'tid', rubrik: 'Tid', visa: (r) => <span className="num">{tidpunkt(r.tid)}</span> },
          { falt: 'namn', rubrik: 'Vem' },
          { falt: 'handelse', rubrik: 'Vad' },
          { falt: 'objekt', rubrik: 'Objekt' },
          { falt: 'detalj', rubrik: 'Detalj', visa: (r) => <span className="liten svag">{r.detalj}</span> },
        ]}
      />
    </Kort>
  );
}
