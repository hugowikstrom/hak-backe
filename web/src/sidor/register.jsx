// Register: medlemmar, utrustning, områden, positioner och säsonger.
import { useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Lada, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { minstRoll, ROLLNAMN, tal, UTRUSTNINGSTYP } from '../nytta.js';

export function Register() {
  const [flik, sattFlik] = useState('medlemmar');
  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Register</h1>
          <div className="undertext">Grunddata för hela anläggningen</div>
        </div>
      </div>
      <Flikar
        flikar={[
          { nyckel: 'medlemmar', text: 'Medlemmar' },
          { nyckel: 'utrustning', text: 'Utrustning' },
          { nyckel: 'omraden', text: 'Områden' },
          { nyckel: 'positioner', text: 'Positioner' },
          { nyckel: 'sasonger', text: 'Säsonger' },
        ]}
        aktiv={flik}
        satt={sattFlik}
      />
      {flik === 'medlemmar' && <Medlemmar />}
      {flik === 'utrustning' && <Utrustning />}
      {flik === 'omraden' && <Omraden />}
      {flik === 'positioner' && <Positioner />}
      {flik === 'sasonger' && <Sasonger />}
    </>
  );
}

const fel = (notis) => (e) => notis(e.message, 'fel');

function Medlemmar() {
  const jag = useJag();
  const notis = useNotis();
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const positioner = useHamta(() => api.hamta('/api/positioner'));
  const [vald, sattVald] = useState(null);

  if (medlemmar.laddar && !medlemmar.data) return <Vanta />;

  const spara = (m, data) =>
    api.spara(`/api/medlemmar/${m.id}`, data).then(medlemmar.uppdatera).catch(fel(notis));

  return (
    <>
      <Kort
        titel={`Medlemmar (${(medlemmar.data || []).filter((m) => m.aktiv).length} aktiva)`}
        undertext="Ändra direkt i tabellen. Kvot 0 betyder undantagen från bemanningsplikt."
        verktyg={<button className="primar liten" onClick={() => sattVald({ ny: true })}>Ny medlem</button>}
        tat
      >
        <Tabell
          rader={medlemmar.data || []}
          maxhojd="62vh"
          vidKlick={(m) => sattVald(m)}
          kolumner={[
            { falt: 'namn', rubrik: 'Namn', redigera: { spara: (m, v) => spara(m, { namn: v }) } },
            { falt: 'anvandarnamn', rubrik: 'Inloggning' },
            { falt: 'epost', rubrik: 'E-post', redigera: { spara: (m, v) => spara(m, { epost: v }) } },
            { falt: 'telefon', rubrik: 'Telefon', redigera: { spara: (m, v) => spara(m, { telefon: v }) } },
            {
              falt: 'roll', rubrik: 'Roll',
              redigera: {
                typ: 'val',
                poster: Object.entries(ROLLNAMN)
                  .filter(([v]) => minstRoll(jag, v))
                  .map(([v, t]) => ({ varde: v, text: t })),
                spara: (m, v) => spara(m, { roll: v }),
              },
            },
            {
              falt: 'kvot_timmar', rubrik: 'Kvot h', sifra: true,
              redigera: { typ: 'number', steg: '1', spara: (m, v) => spara(m, { kvot_timmar: v === '' ? null : v }) },
            },
            {
              falt: 'kompetens', rubrik: 'Kompetens',
              visa: (m) =>
                m.kompetens.length ? (
                  <span className="rad" style={{ gap: 3, flexWrap: 'wrap' }}>
                    {m.kompetens.map((k) => (
                      <span className="chip" key={k}>
                        {(positioner.data || []).find((p) => p.nyckel === k)?.kortnamn || k}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="svagare">alla</span>
                ),
            },
            {
              falt: 'aktiv', rubrik: 'Aktiv',
              visa: (m) => (
                <input
                  type="checkbox"
                  checked={m.aktiv}
                  onChange={(e) => spara(m, { aktiv: e.target.checked })}
                />
              ),
            },
          ]}
        />
      </Kort>

      {vald && (
        <MedlemLada
          medlem={vald}
          positioner={positioner.data || []}
          jag={jag}
          stang={() => sattVald(null)}
          klar={() => { sattVald(null); medlemmar.uppdatera(); notis('Sparat.'); }}
        />
      )}
    </>
  );
}

function MedlemLada({ medlem, positioner, jag, stang, klar }) {
  const notis = useNotis();
  const [f, sattF] = useState({
    anvandarnamn: medlem.anvandarnamn || '',
    namn: medlem.namn || '',
    epost: medlem.epost || '',
    telefon: medlem.telefon || '',
    roll: medlem.roll || 'medlem',
    kvot_timmar: medlem.kvot_timmar ?? '',
    aktiv: medlem.aktiv === undefined ? true : medlem.aktiv,
    losenord: '',
    anteckning: medlem.anteckning || '',
  });
  const [kompetens, sattKompetens] = useState(medlem.kompetens || []);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));

  const skicka = async () => {
    const kropp = {
      ...f,
      kvot_timmar: f.kvot_timmar === '' ? null : Number(f.kvot_timmar),
      kompetens,
      losenord: f.losenord || undefined,
    };
    try {
      if (medlem.ny) await api.skapa('/api/medlemmar', { ...kropp, losenord: f.losenord || 'hak' });
      else await api.spara(`/api/medlemmar/${medlem.id}`, kropp);
      klar();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      titel={medlem.ny ? 'Ny medlem' : medlem.namn}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button className="primar" disabled={!f.namn.trim() || !f.anvandarnamn.trim()} onClick={skicka}>Spara</button>
        </>
      }
    >
      <div className="faltrad">
        <Text etikett="Namn" krav varde={f.namn} satt={satt('namn')} />
        <Text etikett="Inloggning" krav varde={f.anvandarnamn} satt={satt('anvandarnamn')} disabled={!medlem.ny} />
        <Text etikett="E-post" typ="email" varde={f.epost} satt={satt('epost')} />
        <Text etikett="Telefon" varde={f.telefon} satt={satt('telefon')} />
      </div>
      <div className="faltrad">
        <Val
          etikett="Roll" varde={f.roll} satt={satt('roll')} tomtext={null}
          poster={Object.entries(ROLLNAMN).filter(([v]) => minstRoll(jag, v)).map(([v, t]) => ({ varde: v, text: t }))}
        />
        <Text etikett="Egen kvot (timmar)" typ="number" varde={f.kvot_timmar} satt={satt('kvot_timmar')} placeholder="säsongens kvot" />
        <Text etikett={medlem.ny ? 'Lösenord' : 'Nytt lösenord'} varde={f.losenord} satt={satt('losenord')} placeholder={medlem.ny ? 'hak' : 'lämna tomt'} />
      </div>
      <Ruta etikett="Aktiv medlem" pa={f.aktiv} satt={satt('aktiv')} />
      <div>
        <h4>Kompetens – vilka positioner medlemmen kan bemanna</h4>
        <p className="liten svag">Inget valt betyder att medlemmen kan bemanna alla positioner.</p>
        <div className="knapprad">
          {positioner.map((p) => (
            <button
              key={p.id}
              className={kompetens.includes(p.nyckel) ? 'primar liten' : 'liten'}
              onClick={() =>
                sattKompetens((k) => (k.includes(p.nyckel) ? k.filter((x) => x !== p.nyckel) : [...k, p.nyckel]))
              }
            >
              {p.namn}
            </button>
          ))}
        </div>
      </div>
      <Text etikett="Anteckning" varde={f.anteckning} satt={satt('anteckning')} />
    </Lada>
  );
}

function Utrustning() {
  const notis = useNotis();
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const omraden = useHamta(() => api.hamta('/api/omraden'));
  const [ny, sattNy] = useState(null);

  if (utrustning.laddar && !utrustning.data) return <Vanta />;
  const spara = (u, data) =>
    api.spara(`/api/utrustning/${u.id}`, data).then(utrustning.uppdatera).catch(fel(notis));

  return (
    <>
      <Kort
        titel={`Utrustning (${(utrustning.data || []).length})`}
        undertext="Lansar, fläktar, pumpar, liftar och maskiner"
        verktyg={<button className="primar liten" onClick={() => sattNy({})}>Ny utrustning</button>}
        tat
      >
        <Tabell
          rader={utrustning.data || []}
          maxhojd="62vh"
          kolumner={[
            { falt: 'namn', rubrik: 'Namn', redigera: { spara: (u, v) => spara(u, { namn: v }) } },
            {
              falt: 'typ', rubrik: 'Typ',
              redigera: {
                typ: 'val',
                poster: Object.entries(UTRUSTNINGSTYP).map(([v, t]) => ({ varde: v, text: t })),
                spara: (u, v) => spara(u, { typ: v }),
              },
            },
            {
              falt: 'omrade_id', rubrik: 'Område',
              redigera: {
                typ: 'val',
                poster: [{ varde: '', text: '–' }, ...(omraden.data || []).map((o) => ({ varde: o.id, text: o.namn }))],
                spara: (u, v) => spara(u, { omrade_id: v === '' ? null : v }),
              },
            },
            { falt: 'placering', rubrik: 'Placering', redigera: { spara: (u, v) => spara(u, { placering: v }) } },
            {
              falt: 'munstycken', rubrik: 'Munstycken', sifra: true,
              redigera: { typ: 'number', spara: (u, v) => spara(u, { munstycken: v === '' ? null : v }) },
            },
            {
              falt: 'status', rubrik: 'Status',
              redigera: {
                typ: 'val',
                poster: [
                  { varde: 'drift', text: 'Drift' },
                  { varde: 'service', text: 'Service' },
                  { varde: 'ur_drift', text: 'Ur drift' },
                ],
                spara: (u, v) => spara(u, { status: v }),
              },
            },
            {
              falt: 'aktiv', rubrik: 'Aktiv',
              visa: (u) => (
                <input type="checkbox" checked={!!u.aktiv} onChange={(e) => spara(u, { aktiv: e.target.checked })} />
              ),
            },
          ]}
        />
      </Kort>

      {ny && (
        <EnkelLada
          titel="Ny utrustning"
          falt={[
            { nyckel: 'namn', etikett: 'Namn', krav: true },
            { nyckel: 'typ', etikett: 'Typ', val: Object.entries(UTRUSTNINGSTYP).map(([v, t]) => ({ varde: v, text: t })), standard: 'lans' },
            { nyckel: 'omrade_id', etikett: 'Område', val: (omraden.data || []).map((o) => ({ varde: o.id, text: o.namn })) },
            { nyckel: 'placering', etikett: 'Placering' },
            { nyckel: 'munstycken', etikett: 'Munstycken', typ: 'number' },
          ]}
          stang={() => sattNy(null)}
          skicka={(k) => api.skapa('/api/utrustning', k)}
          klar={() => { sattNy(null); utrustning.uppdatera(); notis('Sparat.'); }}
        />
      )}
    </>
  );
}

function Omraden() {
  const notis = useNotis();
  const omraden = useHamta(() => api.hamta('/api/omraden'));
  const [ny, sattNy] = useState(null);
  if (omraden.laddar && !omraden.data) return <Vanta />;
  const spara = (o, data) => api.spara(`/api/omraden/${o.id}`, data).then(omraden.uppdatera).catch(fel(notis));
  return (
    <>
      <Kort
        titel="Områden"
        undertext="Backar, liftar och byggnader. Checklistor kan knytas till ett område."
        verktyg={<button className="primar liten" onClick={() => sattNy({})}>Nytt område</button>}
        tat
      >
        <Tabell
          rader={omraden.data || []}
          kolumner={[
            { falt: 'namn', rubrik: 'Namn', redigera: { spara: (o, v) => spara(o, { namn: v }) } },
            {
              falt: 'slag', rubrik: 'Slag',
              redigera: {
                typ: 'val',
                poster: [
                  { varde: 'backe', text: 'Backe' }, { varde: 'lift', text: 'Lift' },
                  { varde: 'byggnad', text: 'Byggnad' }, { varde: 'ovrigt', text: 'Övrigt' },
                ],
                spara: (o, v) => spara(o, { slag: v }),
              },
            },
            { falt: 'ordning', rubrik: 'Ordning', sifra: true, redigera: { typ: 'number', spara: (o, v) => spara(o, { ordning: v }) } },
            {
              falt: 'aktiv', rubrik: 'Aktiv',
              visa: (o) => <input type="checkbox" checked={!!o.aktiv} onChange={(e) => spara(o, { aktiv: e.target.checked })} />,
            },
          ]}
        />
      </Kort>
      {ny && (
        <EnkelLada
          titel="Nytt område"
          falt={[
            { nyckel: 'namn', etikett: 'Namn', krav: true },
            {
              nyckel: 'slag', etikett: 'Slag', standard: 'backe',
              val: [
                { varde: 'backe', text: 'Backe' }, { varde: 'lift', text: 'Lift' },
                { varde: 'byggnad', text: 'Byggnad' }, { varde: 'ovrigt', text: 'Övrigt' },
              ],
            },
            { nyckel: 'ordning', etikett: 'Ordning', typ: 'number' },
          ]}
          stang={() => sattNy(null)}
          skicka={(k) => api.skapa('/api/omraden', k)}
          klar={() => { sattNy(null); omraden.uppdatera(); notis('Sparat.'); }}
        />
      )}
    </>
  );
}

function Positioner() {
  const notis = useNotis();
  const positioner = useHamta(() => api.hamta('/api/positioner'));
  const [ny, sattNy] = useState(null);
  if (positioner.laddar && !positioner.data) return <Vanta />;
  const spara = (p, data) => api.spara(`/api/positioner/${p.id}`, data).then(positioner.uppdatera).catch(fel(notis));
  return (
    <>
      <Kort
        titel="Positioner"
        undertext="Raderna i bemanningsschemat: fik, uthyrning, backansvarig, bandet och så vidare."
        verktyg={<button className="primar liten" onClick={() => sattNy({})}>Ny position</button>}
        tat
      >
        <Tabell
          rader={positioner.data || []}
          kolumner={[
            { falt: 'namn', rubrik: 'Namn', redigera: { spara: (p, v) => spara(p, { namn: v }) } },
            { falt: 'nyckel', rubrik: 'Nyckel' },
            { falt: 'kortnamn', rubrik: 'Kort', redigera: { spara: (p, v) => spara(p, { kortnamn: v }) } },
            {
              falt: 'farg', rubrik: 'Färg',
              visa: (p) => (
                <span className="rad">
                  <span className="prick" style={{ background: p.farg }} />
                  <span className="num liten">{p.farg}</span>
                </span>
              ),
            },
            {
              falt: 'kravs_roll', rubrik: 'Kräver roll',
              redigera: {
                typ: 'val',
                poster: [{ varde: '', text: '–' }, ...Object.entries(ROLLNAMN).map(([v, t]) => ({ varde: v, text: t }))],
                spara: (p, v) => spara(p, { kravs_roll: v || null }),
              },
            },
            { falt: 'ordning', rubrik: 'Ordning', sifra: true, redigera: { typ: 'number', spara: (p, v) => spara(p, { ordning: v }) } },
            {
              falt: 'aktiv', rubrik: 'Aktiv',
              visa: (p) => <input type="checkbox" checked={!!p.aktiv} onChange={(e) => spara(p, { aktiv: e.target.checked })} />,
            },
          ]}
        />
      </Kort>
      {ny && (
        <EnkelLada
          titel="Ny position"
          falt={[
            { nyckel: 'namn', etikett: 'Namn', krav: true },
            { nyckel: 'nyckel', etikett: 'Nyckel (små bokstäver)', krav: true },
            { nyckel: 'kortnamn', etikett: 'Kortnamn' },
            { nyckel: 'farg', etikett: 'Färg', standard: '#7aa2d0' },
            { nyckel: 'ordning', etikett: 'Ordning', typ: 'number' },
            {
              nyckel: 'kravs_roll', etikett: 'Kräver roll',
              val: Object.entries(ROLLNAMN).map(([v, t]) => ({ varde: v, text: t })),
            },
          ]}
          stang={() => sattNy(null)}
          skicka={(k) => api.skapa('/api/positioner', k)}
          klar={() => { sattNy(null); positioner.uppdatera(); notis('Sparat.'); }}
        />
      )}
    </>
  );
}

function Sasonger() {
  const jag = useJag();
  const notis = useNotis();
  const sasonger = useHamta(() => api.hamta('/api/sasonger'));
  const [ny, sattNy] = useState(null);
  const far = minstRoll(jag, 'anlaggningsansvarig');
  if (sasonger.laddar && !sasonger.data) return <Vanta />;
  const spara = (s, data) => api.spara(`/api/sasonger/${s.id}`, data).then(sasonger.uppdatera).catch(fel(notis));
  return (
    <>
      <Kort
        titel="Säsonger"
        undertext="Kvoten gäller per säsong. Egen kvot på en medlem går före."
        verktyg={far && <button className="primar liten" onClick={() => sattNy({})}>Ny säsong</button>}
        tat
      >
        <Tabell
          rader={sasonger.data || []}
          tomtext="Ingen säsong upplagd."
          kolumner={[
            { falt: 'namn', rubrik: 'Namn', redigera: far && { spara: (s, v) => spara(s, { namn: v }) } },
            { falt: 'start', rubrik: 'Start', redigera: far && { typ: 'date', spara: (s, v) => spara(s, { start: v }) } },
            { falt: 'slut', rubrik: 'Slut', redigera: far && { typ: 'date', spara: (s, v) => spara(s, { slut: v }) } },
            {
              falt: 'kvot_timmar', rubrik: 'Kvot h', sifra: true,
              redigera: far && { typ: 'number', spara: (s, v) => spara(s, { kvot_timmar: v }) },
              visa: (s) => tal(s.kvot_timmar),
            },
            {
              falt: 'kvot_nattpass', rubrik: 'Kvot nattpass', sifra: true,
              redigera: far && { typ: 'number', spara: (s, v) => spara(s, { kvot_nattpass: v }) },
              visa: (s) => tal(s.kvot_nattpass),
            },
            {
              falt: 'aktiv', rubrik: 'Aktiv',
              visa: (s) =>
                s.aktiv ? (
                  <Bricka farg="gron">Aktiv</Bricka>
                ) : far ? (
                  <button className="liten" onClick={() => spara(s, { aktiv: true })}>Aktivera</button>
                ) : (
                  <Bricka>Vilande</Bricka>
                ),
            },
          ]}
        />
      </Kort>
      {ny && (
        <EnkelLada
          titel="Ny säsong"
          falt={[
            { nyckel: 'namn', etikett: 'Namn', krav: true, standard: '' },
            { nyckel: 'start', etikett: 'Start', typ: 'date', krav: true },
            { nyckel: 'slut', etikett: 'Slut', typ: 'date', krav: true },
            { nyckel: 'kvot_timmar', etikett: 'Kvot timmar', typ: 'number', standard: '20' },
            { nyckel: 'kvot_nattpass', etikett: 'Kvot nattpass', typ: 'number', standard: '2' },
          ]}
          stang={() => sattNy(null)}
          skicka={(k) => api.skapa('/api/sasonger', { ...k, aktiv: true })}
          klar={() => { sattNy(null); sasonger.uppdatera(); notis('Säsongen skapad och aktiverad.'); }}
        />
      )}
    </>
  );
}

/** Liten generell nyhetslåda: en lista fältdefinitioner in, ett objekt ut. */
function EnkelLada({ titel, falt, stang, skicka, klar }) {
  const notis = useNotis();
  const [v, sattV] = useState(() =>
    Object.fromEntries(falt.map((f) => [f.nyckel, f.standard ?? (f.val ? '' : '')]))
  );
  const kravUppfyllt = falt.filter((f) => f.krav).every((f) => String(v[f.nyckel] || '').trim());
  return (
    <Lada
      titel={titel}
      stang={stang}
      fot={
        <>
          <button onClick={stang}>Avbryt</button>
          <button
            className="primar"
            disabled={!kravUppfyllt}
            onClick={async () => {
              try {
                await skicka(Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')));
                klar();
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Spara
          </button>
        </>
      }
    >
      <div className="faltrad">
        {falt.map((f) =>
          f.val ? (
            <Val
              key={f.nyckel}
              etikett={f.etikett}
              krav={f.krav}
              varde={v[f.nyckel]}
              satt={(x) => sattV((g) => ({ ...g, [f.nyckel]: x }))}
              poster={f.val}
              tomtext={f.krav ? null : '–'}
            />
          ) : (
            <Text
              key={f.nyckel}
              etikett={f.etikett}
              krav={f.krav}
              typ={f.typ}
              varde={v[f.nyckel]}
              satt={(x) => sattV((g) => ({ ...g, [f.nyckel]: x }))}
            />
          )
        )}
      </div>
    </Lada>
  );
}
