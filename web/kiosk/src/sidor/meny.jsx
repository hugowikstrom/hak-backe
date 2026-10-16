// Beställning i fiket: välj varor, lägg beställningen, betala med Swish.
import { useEffect, useMemo, useState } from 'react';
import { api, kronor } from '../api.js';
import { Falt } from '../delar.jsx';

const KATEGORINAMN = {
  mat: 'Mat', dryck: 'Dryck', fika: 'Fika', godis: 'Gott', liftkort: 'Liftkort', ovrigt: 'Övrigt',
};

export function Meny({ ga }) {
  const [meny, sattMeny] = useState(null);
  const [fel, sattFel] = useState(null);
  const [kategori, sattKategori] = useState(null);
  const [vagn, sattVagn] = useState({});
  const [steg, sattSteg] = useState('meny');
  const [form, sattForm] = useState({ mobil: '', plats: '', anteckning: '' });
  const [skickar, sattSkickar] = useState(false);

  useEffect(() => {
    api.hamta('/api/fik/meny').then(sattMeny).catch((e) => sattFel(e.message));
  }, []);

  const kategorier = useMemo(
    () => [...new Set((meny?.artiklar || []).map((a) => a.kategori))],
    [meny]
  );
  const synliga = (meny?.artiklar || []).filter((a) => !kategori || a.kategori === kategori);
  const rader = Object.entries(vagn)
    .filter(([, antal]) => antal > 0)
    .map(([id, antal]) => ({ artikel: meny.artiklar.find((a) => a.id === Number(id)), antal }))
    .filter((r) => r.artikel);
  const summa = rader.reduce((a, r) => a + r.artikel.pris_ore * r.antal, 0);

  const andra = (id, steg) =>
    sattVagn((v) => ({ ...v, [id]: Math.max(0, Math.min(20, (v[id] || 0) + steg)) }));

  const skicka = async () => {
    sattSkickar(true);
    sattFel(null);
    try {
      const order = await api.skapa('/api/fik/order', {
        rader: rader.map((r) => ({ artikel_id: r.artikel.id, antal: r.antal })),
        mobil: form.mobil || null,
        plats: form.plats || null,
        anteckning: form.anteckning || null,
      });
      ga(`/fik/order/${order.nummer}?kod=${order.kod}`);
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattSkickar(false);
    }
  };

  if (fel && !meny) return <main className="innehall"><div className="meddelande fel">{fel}</div></main>;
  if (!meny) return <main className="innehall"><div className="tomt">Hämtar menyn …</div></main>;

  if (steg === 'kassa')
    return (
      <main className="innehall">
        <h1>Din beställning</h1>
        <div className="kort" style={{ marginTop: 12 }}>
          <div className="rader">
            {rader.map((r) => (
              <div key={r.artikel.id}>
                <span>{r.antal}× {r.artikel.namn}</span>
                <span className="num">{kronor(r.artikel.pris_ore * r.antal)}</span>
              </div>
            ))}
            <div style={{ fontWeight: 800 }}>
              <span>Att betala</span>
              <span className="num">{kronor(summa)}</span>
            </div>
          </div>
        </div>

        <div className="kort" style={{ marginTop: 14 }}>
          <Falt etikett="Mobilnummer (så vi kan säga till när det är klart)">
            <input
              type="tel"
              inputMode="tel"
              placeholder="070-123 45 67"
              value={form.mobil}
              onChange={(e) => sattForm({ ...form, mobil: e.target.value })}
            />
          </Falt>
          <Falt etikett="Var sitter du? (frivilligt)">
            <input placeholder="Bord 3, uteserveringen …" value={form.plats} onChange={(e) => sattForm({ ...form, plats: e.target.value })} />
          </Falt>
          <Falt etikett="Önskemål">
            <textarea rows={2} placeholder="Utan senap, extra mos …" value={form.anteckning} onChange={(e) => sattForm({ ...form, anteckning: e.target.value })} />
          </Falt>
          {fel && <div className="meddelande fel">{fel}</div>}
          <button className="stor" disabled={skickar || !rader.length} onClick={skicka}>
            {skickar ? 'Skickar …' : `Beställ för ${kronor(summa)}`}
          </button>
          <button className="lank" style={{ marginTop: 12 }} onClick={() => sattSteg('meny')}>
            ← Tillbaka till menyn
          </button>
        </div>
      </main>
    );

  return (
    <>
      <main className="innehall">
        <div className="flikar">
          <button aria-pressed={!kategori} onClick={() => sattKategori(null)}>Allt</button>
          {kategorier.map((k) => (
            <button key={k} aria-pressed={kategori === k} onClick={() => sattKategori(k)}>
              {KATEGORINAMN[k] || k}
            </button>
          ))}
        </div>

        <div className="varor">
          {synliga.map((a) => (
            <div key={a.id} className={`vara${a.slut ? ' slut' : ''}`}>
              <div className="ikon" aria-hidden="true">{a.emoji || '🍽️'}</div>
              <div className="namn">{a.namn}</div>
              {a.beskrivning && <div className="liten svag">{a.beskrivning}</div>}
              <div className="pris">{a.pris}</div>
              {a.slut ? (
                <div className="bricka">Slut i dag</div>
              ) : (
                <div className="knappar">
                  {vagn[a.id] ? (
                    <>
                      <button onClick={() => andra(a.id, -1)} aria-label="Ta bort en">−</button>
                      <span className="antal">{vagn[a.id]}</span>
                      <button onClick={() => andra(a.id, 1)} aria-label="Lägg till en">+</button>
                    </>
                  ) : (
                    <button className="lagg" onClick={() => andra(a.id, 1)}>Lägg till</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {!!rader.length && (
        <div className="kundvagn">
          <div>
            <div className="liten svag">{rader.reduce((a, r) => a + r.antal, 0)} varor</div>
            <div className="summa">{kronor(summa)}</div>
          </div>
          <button onClick={() => sattSteg('kassa')}>Beställ</button>
        </div>
      )}
    </>
  );
}
