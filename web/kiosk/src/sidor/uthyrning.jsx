// Skiduthyrningen: välj paket, ange mobilnummer, betala och hämta.
import { useEffect, useMemo, useState } from 'react';
import { api, kronor } from '../api.js';
import { Falt } from '../delar.jsx';

export function Uthyrning({ ga }) {
  const [data, sattData] = useState(null);
  const [fel, sattFel] = useState(null);
  const [tid, sattTid] = useState('heldag');
  const [alder, sattAlder] = useState('vuxen');
  const [vagn, sattVagn] = useState({});
  const [steg, sattSteg] = useState('val');
  const [form, sattForm] = useState({ mobil: '', namn: '' });
  const [skickar, sattSkickar] = useState(false);
  const [klar, sattKlar] = useState(null);

  useEffect(() => {
    api.hamta('/api/uthyrning/prislista').then(sattData).catch((e) => sattFel(e.message));
  }, []);

  const synliga = useMemo(
    () => (data?.grupper || []).filter((g) => g.aldersgrupp === alder || g.aldersgrupp === 'alla'),
    [data, alder]
  );
  const prisFor = (g) => g.tider.find((t) => t.tid === tid);
  const rader = Object.entries(vagn)
    .filter(([, antal]) => antal > 0)
    .map(([id, antal]) => {
      const grupp = (data?.grupper || []).find((g) => g.tider.some((t) => t.id === Number(id)));
      const pris = grupp?.tider.find((t) => t.id === Number(id));
      return pris ? { id: Number(id), namn: `${grupp.namn} · ${pris.tidnamn}`, pris_ore: pris.pris_ore, antal } : null;
    })
    .filter(Boolean);
  const summa = rader.reduce((a, r) => a + r.pris_ore * r.antal, 0);

  const andra = (id, steg) => sattVagn((v) => ({ ...v, [id]: Math.max(0, Math.min(10, (v[id] || 0) + steg)) }));

  const boka = async () => {
    sattSkickar(true);
    sattFel(null);
    try {
      const avtal = await api.skapa('/api/uthyrning/bokning', {
        rader: rader.map((r) => ({ hyrespris_id: r.id, antal: r.antal })),
        mobil: form.mobil || null,
        namn: form.namn || null,
      });
      sattKlar(avtal);
      sattSteg('klar');
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattSkickar(false);
    }
  };

  if (fel && !data) return <main className="innehall"><div className="meddelande fel">{fel}</div></main>;
  if (!data) return <main className="innehall"><div className="tomt">Hämtar prislistan …</div></main>;

  if (steg === 'klar' && klar)
    return (
      <main className="innehall">
        <div className="kort mitten">
          <div className="liten svag">Ditt hyresnummer</div>
          <div className="ordernummer">{klar.nummer}</div>
          <p className="liten svag">Visa numret i uthyrningen så plockar vi fram utrustningen.</p>
          <div className="meddelande info" style={{ marginTop: 12 }}>
            {klar.swish ? (
              <>
                Swisha <strong>{kronor(klar.belopp_ore)}</strong> till{' '}
                <strong className="num">{klar.swish.nummer}</strong> med meddelandet{' '}
                <strong>HAK {klar.nummer}</strong>, eller betala med kort i uthyrningen.
              </>
            ) : (
              <>Betala <strong>{kronor(klar.belopp_ore)}</strong> med kort i uthyrningen.</>
            )}
          </div>
          <div className="rader" style={{ textAlign: 'left', marginTop: 12 }}>
            {klar.rader.map((r, i) => (
              <div key={i}>
                <span>{r.antal}× {r.namn}</span>
                <span className="num">{kronor(r.pris_ore * r.antal)}</span>
              </div>
            ))}
          </div>
          <p className="liten svag" style={{ marginTop: 14 }}>
            {klar.rader.some(() => form.mobil)
              ? 'Du får ett sms med en länk när utrustningen lämnas ut. Där anmäler du återlämningen.'
              : 'Lämna gärna ditt mobilnummer i uthyrningen så får du en länk för återlämning.'}
          </p>
          <button className="lank" onClick={() => ga('/fik/')}>Till fiket</button>
        </div>
      </main>
    );

  if (steg === 'kassa')
    return (
      <main className="innehall">
        <h1>Din hyra</h1>
        <div className="kort" style={{ marginTop: 12 }}>
          <div className="rader">
            {rader.map((r) => (
              <div key={r.id}>
                <span>{r.antal}× {r.namn}</span>
                <span className="num">{kronor(r.pris_ore * r.antal)}</span>
              </div>
            ))}
            <div style={{ fontWeight: 800 }}>
              <span>Att betala</span>
              <span className="num">{kronor(summa)}</span>
            </div>
          </div>
        </div>
        <div className="kort" style={{ marginTop: 14 }}>
          <Falt etikett="Mobilnummer (för återlämningslänken)">
            <input type="tel" inputMode="tel" placeholder="070-123 45 67" value={form.mobil} onChange={(e) => sattForm({ ...form, mobil: e.target.value })} />
          </Falt>
          <Falt etikett="Namn">
            <input value={form.namn} onChange={(e) => sattForm({ ...form, namn: e.target.value })} />
          </Falt>
          {fel && <div className="meddelande fel">{fel}</div>}
          <button className="stor" disabled={skickar || !rader.length} onClick={boka}>
            {skickar ? 'Bokar …' : `Boka för ${kronor(summa)}`}
          </button>
          <button className="lank" style={{ marginTop: 12 }} onClick={() => sattSteg('val')}>← Tillbaka</button>
        </div>
      </main>
    );

  return (
    <>
      <main className="innehall">
        <div className="kort" style={{ marginBottom: 14 }}>
          <Falt etikett="Hur länge?">
            <div className="flikar" style={{ paddingBottom: 0 }}>
              {Object.entries(data.tider).map(([nyckel, namn]) => (
                <button key={nyckel} aria-pressed={tid === nyckel} onClick={() => sattTid(nyckel)}>{namn}</button>
              ))}
            </div>
          </Falt>
          <Falt etikett="Vem ska åka?">
            <div className="flikar" style={{ paddingBottom: 0 }}>
              {['vuxen', 'ungdom', 'barn'].map((a) => (
                <button key={a} aria-pressed={alder === a} onClick={() => sattAlder(a)}>{data.aldersgrupper[a]}</button>
              ))}
            </div>
          </Falt>
        </div>

        <div className="varor">
          {synliga.map((g) => {
            const pris = prisFor(g);
            if (!pris) return null;
            return (
              <div key={`${g.namn}-${g.aldersgrupp}`} className="vara">
                <div className="ikon" aria-hidden="true">{g.grupp === 'paket' ? '🎿' : g.grupp === 'tillbehor' ? '🪖' : '🥾'}</div>
                <div className="namn">{g.namn}</div>
                <div className="liten svag">{data.aldersgrupper[g.aldersgrupp]} · {pris.tidnamn}</div>
                <div className="pris">{pris.pris}</div>
                <div className="knappar">
                  {vagn[pris.id] ? (
                    <>
                      <button onClick={() => andra(pris.id, -1)} aria-label="Färre">−</button>
                      <span className="antal">{vagn[pris.id]}</span>
                      <button onClick={() => andra(pris.id, 1)} aria-label="Fler">+</button>
                    </>
                  ) : (
                    <button className="lagg" onClick={() => andra(pris.id, 1)}>Lägg till</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="liten svag" style={{ marginTop: 14 }}>
          Priserna är klubbens ordinarie. Hjälm ingår inte i paketet men finns att hyra separat.
        </p>
      </main>

      {!!rader.length && (
        <div className="kundvagn">
          <div>
            <div className="liten svag">{rader.reduce((a, r) => a + r.antal, 0)} delar</div>
            <div className="summa">{kronor(summa)}</div>
          </div>
          <button onClick={() => sattSteg('kassa')}>Boka</button>
        </div>
      )}
    </>
  );
}
