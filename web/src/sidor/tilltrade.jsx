// Tillträden: grupperna som ger medlemmar åtkomst till delar av systemet.
//
// Vyn svarar på två frågor, och bara dem: vad ger den här gruppen, och vem
// är med i den. Allt annat – vem som har vilken roll, vilka uppdrag som
// finns – hör hemma i matrikeln och i styrelsefliken.
//
// Det som en gruppstyrning lätt blir är en matris med allt mot allt. Den är
// svår att läsa och lätt att råka klicka fel i. Här står i stället gruppen
// i mitten: en rad per grupp, och gruppens innehåll i en ruta när man
// öppnar den.
import { useState } from 'react';
import { api } from '../api.js';
import { Bricka, Falt, Kort, Lada, Ruta, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';

export function Tilltraden({ jag }) {
  const notis = useNotis();
  const { data, laddar, uppdatera } = useHamta(() => api.hamta('/api/tilltrade'));
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [oppen, sattOppen] = useState(null);
  const [ny, sattNy] = useState(false);

  if (laddar && !data) return <Vanta />;
  if (!data) return <Tomt>Tillträdena gick inte att hämta.</Tomt>;

  const { grupper, behorighetsnamn, rollnamn, ytor, far_ge } = data;

  return (
    <>
      <Kort
        titel="Behörighetsgrupper"
        undertext="En medlem kan vara med i flera grupper. Grupperna lägger ihop sig – ingen av dem tar bort något medlemmen redan har."
        verktyg={<button className="liten primar" onClick={() => sattNy(true)}>Ny grupp</button>}
        tat
      >
        {grupper.length ? (
          <Tabell
            rader={grupper}
            vidKlick={(g) => sattOppen(g.id)}
            kolumner={[
              {
                falt: 'namn',
                rubrik: 'Grupp',
                visa: (g) => (
                  <>
                    <strong>{g.namn}</strong>
                    {g.beskrivning && <div className="liten svag">{g.beskrivning}</div>}
                  </>
                ),
              },
              {
                falt: 'behorigheter',
                rubrik: 'Ger tillträde till',
                sortlos: true,
                visa: (g) =>
                  g.behorigheter.length || g.roll_golv ? (
                    <div className="brickrad">
                      {g.roll_golv && <Bricka farg="lila">{rollnamn[g.roll_golv]}</Bricka>}
                      {g.behorigheter.map((b) => (
                        <Bricka key={b} farg="info">{behorighetsnamn[b] || b}</Bricka>
                      ))}
                    </div>
                  ) : (
                    <span className="svagare">inget ännu</span>
                  ),
              },
              { falt: 'antal', rubrik: 'Medlemmar', sifra: true },
              {
                falt: 'aktiv',
                rubrik: 'Status',
                visa: (g) => (g.aktiv ? <Bricka farg="ok">Aktiv</Bricka> : <Bricka>Avstängd</Bricka>),
              },
            ]}
          />
        ) : (
          <Tomt>Inga grupper ännu. Lägg upp den första.</Tomt>
        )}
      </Kort>

      {!far_ge.allt && (
        <div className="meddelande info">
          Du kan dela ut det du själv har tillträde till. Behörigheter över din egen nivå står kvar
          som låsta i rutan – en administratör får sätta upp dem.
        </div>
      )}

      {oppen && (
        <GruppLada
          id={oppen}
          data={data}
          medlemmar={medlemmar.data || []}
          stang={() => sattOppen(null)}
          uppdaterat={uppdatera}
        />
      )}
      {ny && (
        <NyGrupp
          data={data}
          stang={() => sattNy(false)}
          klar={() => { sattNy(false); uppdatera(); notis('Gruppen är upplagd.'); }}
        />
      )}
    </>
  );
}

/** Kryssrutor för behörigheter, med de odelbara låsta och förklarade. */
function Behorighetsval({ valda, satt, behorighetsnamn, far_ge }) {
  return (
    <div className="valrutor">
      {Object.entries(behorighetsnamn).map(([nyckel, namn]) => {
        const far = far_ge.behorigheter.includes(nyckel);
        const pa = valda.includes(nyckel);
        return (
          <label key={nyckel} className={`valruta${far ? '' : ' last'}`} title={far ? namn : `Du har inte ${namn} själv`}>
            <input
              type="checkbox"
              checked={pa}
              disabled={!far}
              onChange={(e) => satt(e.target.checked ? [...valda, nyckel] : valda.filter((b) => b !== nyckel))}
            />
            <span>
              {namn}
              <em className="liten svagare"> {nyckel}</em>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function Ytval({ valda, satt, ytor }) {
  return (
    <div className="valrutor">
      {ytor.map((y) => (
        <label key={y.nyckel} className="valruta" title={y.beskrivning}>
          <input
            type="checkbox"
            checked={valda.includes(y.nyckel)}
            onChange={(e) => satt(e.target.checked ? [...valda, y.nyckel] : valda.filter((v) => v !== y.nyckel))}
          />
          <span>{y.namn}</span>
        </label>
      ))}
    </div>
  );
}

function GruppLada({ id, data, medlemmar, stang, uppdaterat }) {
  const notis = useNotis();
  const { data: g, laddar, uppdatera, sattData } = useHamta(() => api.hamta(`/api/tilltrade/grupper/${id}`), [id]);
  const [lagg, sattLagg] = useState('');
  const [sparar, sattSparar] = useState(false);

  if (laddar && !g) return <Lada titel="Grupp" stang={stang}><Vanta /></Lada>;
  if (!g) return null;

  const { behorighetsnamn, rollnamn, ytor, far_ge } = data;

  const andra = async (falt) => {
    sattSparar(true);
    try {
      const uppdaterad = await api.andra(`/api/tilltrade/grupper/${g.id}`, falt);
      sattData(uppdaterad);
      uppdaterat();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSparar(false);
    }
  };

  const laggTill = async () => {
    if (!lagg) return;
    try {
      sattData(await api.skapa(`/api/tilltrade/grupper/${g.id}/medlemmar`, { medlem_id: Number(lagg) }));
      sattLagg('');
      uppdaterat();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const taUt = async (medlem_id, namn) => {
    try {
      sattData(await api.tabort(`/api/tilltrade/grupper/${g.id}/medlemmar/${medlem_id}`));
      uppdaterat();
      notis(`${namn} är ute ur gruppen.`);
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  const inne = g.medlemmar.filter((m) => !m.upphord);
  const ute = g.medlemmar.filter((m) => m.upphord);
  const kvar = medlemmar.filter((m) => !inne.some((i) => i.medlem_id === m.id));

  return (
    <Lada titel={g.namn} stang={stang} bred>
      <div className="kolumn gap-16">
        <section>
          <h4>Vad gruppen är</h4>
          <div className="rad hopp" style={{ alignItems: 'flex-end' }}>
            <Text etikett="Namn" varde={g.namn} satt={(v) => sattData({ ...g, namn: v })} onBlur={() => andra({ namn: g.namn })} />
            <Val
              etikett="Rollgolv"
              varde={g.roll_golv || ''}
              satt={(v) => andra({ roll_golv: v || null })}
              tomtext="– ingen nivå –"
              poster={far_ge.rollgolv.map((r) => ({ varde: r, text: rollnamn[r] }))}
            />
            <Ruta etikett="Aktiv" pa={g.aktiv} satt={(v) => andra({ aktiv: v })} />
          </div>
          <Falt etikett="Beskrivning">
            <textarea
              rows={2}
              value={g.beskrivning || ''}
              onChange={(e) => sattData({ ...g, beskrivning: e.target.value })}
              onBlur={() => andra({ beskrivning: g.beskrivning })}
            />
          </Falt>
          {g.roll_golv && (
            <div className="meddelande info liten">
              Alla i gruppen räknas som minst <strong>{rollnamn[g.roll_golv]}</strong>. Den som redan står
              högre påverkas inte.
            </div>
          )}
        </section>

        <section>
          <h4>Behörigheter gruppen ger</h4>
          <Behorighetsval
            valda={g.behorigheter}
            satt={(b) => andra({ behorigheter: b })}
            behorighetsnamn={behorighetsnamn}
            far_ge={far_ge}
          />
        </section>

        <section>
          <h4>Arbetsytor gruppen öppnar</h4>
          <p className="liten svag">
            Ytan är den vy medlemmen kan välja i listen – vilken startsida och vilken meny hen får.
          </p>
          <Ytval valda={g.ytor} satt={(y) => andra({ ytor: y })} ytor={ytor} />
        </section>

        <section>
          <h4>Medlemmar i gruppen ({inne.length})</h4>
          <div className="rad" style={{ alignItems: 'flex-end' }}>
            <Val
              etikett="Lägg till"
              varde={lagg}
              satt={sattLagg}
              tomtext="– välj medlem –"
              poster={kvar.map((m) => ({ varde: String(m.id), text: m.namn }))}
            />
            <button className="liten" onClick={laggTill} disabled={!lagg || sparar}>Lägg till</button>
          </div>
          {inne.length ? (
            <Tabell
              rader={inne}
              nyckel={(m) => m.medlem_id}
              kolumner={[
                { falt: 'namn', rubrik: 'Medlem' },
                { falt: 'fran', rubrik: 'Med sedan' },
                {
                  falt: 'ut',
                  rubrik: '',
                  sortlos: true,
                  visa: (m) => (
                    <button className="tom liten" onClick={() => taUt(m.medlem_id, m.namn)}>
                      Ta ut
                    </button>
                  ),
                },
              ]}
            />
          ) : (
            <Tomt>Ingen är med i gruppen ännu.</Tomt>
          )}
          {!!ute.length && (
            <details className="historik">
              <summary className="liten svag">Tidigare medlemmar ({ute.length})</summary>
              <Tabell
                rader={ute}
                nyckel={(m) => m.medlem_id}
                kolumner={[
                  { falt: 'namn', rubrik: 'Medlem' },
                  { falt: 'fran', rubrik: 'Från' },
                  { falt: 'till', rubrik: 'Till' },
                  {
                    falt: 'ater',
                    rubrik: '',
                    sortlos: true,
                    visa: (m) => (
                      <button
                        className="tom liten"
                        onClick={async () => {
                          sattData(await api.skapa(`/api/tilltrade/grupper/${g.id}/medlemmar`, { medlem_id: m.medlem_id }));
                          uppdaterat();
                        }}
                      >
                        Ta in igen
                      </button>
                    ),
                  },
                ]}
              />
            </details>
          )}
        </section>

        {!g.inbyggd && (
          <section>
            <button
              className="fara liten"
              onClick={async () => {
                try {
                  await api.tabort(`/api/tilltrade/grupper/${g.id}`);
                  uppdaterat();
                  stang();
                  notis('Gruppen är borta.');
                } catch (e) {
                  notis(e.message, 'fel');
                }
              }}
            >
              Ta bort gruppen
            </button>
            <span className="liten svag"> Tillhörigheterna försvinner med den.</span>
          </section>
        )}
      </div>
    </Lada>
  );
}

function NyGrupp({ data, stang, klar }) {
  const notis = useNotis();
  const [namn, sattNamn] = useState('');
  const [beskrivning, sattBeskrivning] = useState('');
  const [roll_golv, sattRollgolv] = useState('');
  const [behorigheter, sattBehorigheter] = useState([]);
  const [ytor, sattYtor] = useState([]);
  const [sparar, sattSparar] = useState(false);
  const { behorighetsnamn, rollnamn, ytor: allaYtor, far_ge } = data;

  const skicka = async () => {
    sattSparar(true);
    try {
      await api.skapa('/api/tilltrade/grupper', {
        namn, beskrivning, roll_golv: roll_golv || null, behorigheter, ytor,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
      sattSparar(false);
    }
  };

  return (
    <Lada
      titel="Ny behörighetsgrupp"
      stang={stang}
      bred
      fot={
        <button className="primar" onClick={skicka} disabled={!namn.trim() || sparar}>
          {sparar ? 'Lägger upp …' : 'Lägg upp gruppen'}
        </button>
      }
    >
      <Text etikett="Namn" krav varde={namn} satt={sattNamn} placeholder="Snögänget" />
      <Falt etikett="Beskrivning">
        <textarea
          rows={2}
          value={beskrivning}
          onChange={(e) => sattBeskrivning(e.target.value)}
          placeholder="Vilka det är och vad de gör"
        />
      </Falt>
      <Val
        etikett="Rollgolv"
        varde={roll_golv}
        satt={sattRollgolv}
        tomtext="– ingen nivå –"
        poster={far_ge.rollgolv.map((r) => ({ varde: r, text: rollnamn[r] }))}
      />
      <h4>Behörigheter</h4>
      <Behorighetsval
        valda={behorigheter}
        satt={sattBehorigheter}
        behorighetsnamn={behorighetsnamn}
        far_ge={far_ge}
      />
      <h4>Arbetsytor</h4>
      <Ytval valda={ytor} satt={sattYtor} ytor={allaYtor} />
    </Lada>
  );
}
