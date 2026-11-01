// Luckan: personalens vy i fiket och skiduthyrningen.
//
// Skild från Kassa-sidan med flit. Kassan är administration – sortiment,
// dagens siffror, plånböcker – och den är gjord för en skärm och en mus.
// Luckan är arbetsytan: någon står upp, har vantar på sig, och har en kö
// framför sig. Den vyn tål inte en tabell med tolv kolumner.
//
// Tre regler som formen följer:
//
//   1. **Ett kort, en nästa åtgärd.** Varje beställning och varje hyra vet
//      själv vad som ska hända härnäst, och den knappen är störst. Resten
//      ligger bakom "Mer". Den som står i luckan ska slippa välja.
//   2. **Kön är först in, först ut.** Äldst överst, alltid. Ingen sortering
//      att ställa in, för det finns bara en rätt ordning i en lucka.
//   3. **Samma vy på platta och telefon.** Korten radas om, inget göms.
//      Ingen separat mobilvy att hålla i synk.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { usePlattform } from '../app.jsx';
import { Kort, Lada, Text, Tomt, useHamta, useNotis, Vanta } from '../delar/bitar.jsx';
import { far } from '../nytta.js';

const kronor = (ore) => `${((ore || 0) / 100).toLocaleString('sv-SE')} kr`;

/** Betalsätten som går att kvittera i luckan. Plånbok hör till kassan. */
const BETALSATT = [
  { varde: 'swish', text: 'Swish' },
  { varde: 'kort', text: 'Kort' },
  { varde: 'kontant', text: 'Kontant' },
];

/** Hur länge sedan, i ord. En klocka i luckan säger mindre än "12 min". */
function sedan(tid) {
  if (!tid) return '';
  const min = Math.round((Date.now() - new Date(`${tid}Z`).getTime()) / 60000);
  if (min < 1) return 'nyss';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

export function Luckan() {
  const { harModul } = usePlattform();
  const harUthyrning = harModul('uthyrning');
  const [lage, sattLage] = useState(() => localStorage.getItem('hak-luckan') || 'fiket');
  const aktiv = harUthyrning ? lage : 'fiket';

  const byt = (n) => {
    sattLage(n);
    localStorage.setItem('hak-luckan', n);
  };

  return (
    <div className="luckan">
      {harUthyrning && (
        <div className="lagevaljare" role="tablist">
          <button role="tab" aria-selected={aktiv === 'fiket'} onClick={() => byt('fiket')}>Fiket</button>
          <button role="tab" aria-selected={aktiv === 'uthyrning'} onClick={() => byt('uthyrning')}>Uthyrningen</button>
        </div>
      )}
      {aktiv === 'fiket' ? <Fiket /> : <Uthyrningen />}
    </div>
  );
}

/** Tre tal, inget mer. Det är vad man behöver veta när man tittar upp. */
const Lage = ({ poster }) => (
  <div className="luckolage">
    {poster.map((p) => (
      <div key={p.etikett} className={`lagetal ${p.farg || ''}`}>
        <span className="tal">{p.varde}</span>
        <span className="etikett">{p.etikett}</span>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------- Fiket ---

const NASTA = {
  ny: { status: 'tillagas', text: 'Börja laga' },
  betald: { status: 'tillagas', text: 'Börja laga' },
  tillagas: { status: 'klar', text: 'Klar' },
  klar: { status: 'hamtad', text: 'Hämtad' },
};

function Fiket() {
  const notis = useNotis();
  const kassa = useHamta(() => api.hamta('/api/fik/kassa'));
  const [salj, sattSalj] = useState(false);
  const [sortiment, sattSortiment] = useState(false);
  const [arbetar, sattArbetar] = useState(null);

  // Luckan ska se nya beställningar utan att någon laddar om.
  useEffect(() => {
    const t = setInterval(() => kassa.uppdatera(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (kassa.laddar && !kassa.data) return <Vanta />;
  if (kassa.fel) return <div className="meddelande fel">{kassa.fel}</div>;
  const d = kassa.data;

  const andra = async (order, data, kvittering) => {
    sattArbetar(order.id);
    try {
      await api.spara(`/api/fik/kassa/order/${order.id}`, data);
      await kassa.uppdatera();
      if (kvittering) notis(kvittering);
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(null);
    }
  };

  const obetalda = d.oppna.filter((o) => !o.betald_tid).length;
  const attLaga = d.oppna.filter((o) => ['ny', 'betald', 'tillagas'].includes(o.status)).length;
  const klara = d.oppna.filter((o) => o.status === 'klar').length;

  return (
    <>
      <div className="luckotopp">
        <Lage
          poster={[
            { etikett: 'Att laga', varde: attLaga, farg: attLaga ? 'varning' : '' },
            { etikett: 'Klar att hämta', varde: klara, farg: klara ? 'ok' : '' },
            { etikett: 'Obetalt', varde: obetalda, farg: obetalda ? 'fara' : '' },
          ]}
        />
        <div className="luckoknappar">
          <button className="stor primar" onClick={() => sattSalj(true)}>Sälj</button>
          <button className="stor" onClick={() => sattSortiment(true)}>Sortiment</button>
        </div>
      </div>

      {d.oppna.length === 0 ? (
        <Tomt>Inga beställningar just nu. Luckan är ikapp.</Tomt>
      ) : (
        <div className="luckokort">
          {d.oppna.map((o) => (
            <Orderkort
              key={o.id}
              order={o}
              arbetar={arbetar === o.id}
              sms={d.sms}
              andra={andra}
            />
          ))}
        </div>
      )}

      {salj && (
        <Saljlada
          meny={d}
          stang={() => sattSalj(false)}
          klar={(order) => {
            sattSalj(false);
            kassa.uppdatera();
            notis(`${order.nummer} inslagen · ${order.belopp}`);
          }}
        />
      )}
      {sortiment && <Sortimentslada stang={() => { sattSortiment(false); kassa.uppdatera(); }} />}
    </>
  );
}

function Orderkort({ order, arbetar, sms, andra }) {
  const [mer, sattMer] = useState(false);
  const nasta = NASTA[order.status];
  const obetald = !order.betald_tid;

  return (
    <article className={`luckokort-ett${obetald ? ' obetald' : ''}`}>
      <header>
        <span className="nummer">{order.nummer}</span>
        <div className="kolumn" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          {order.plats && <strong className="plats">{order.plats}</strong>}
          <span className="liten svag">{sedan(order.skapad)} · {order.belopp}</span>
        </div>
        {order.kanal === 'qr' && <span className="luckomarke">QR</span>}
      </header>

      <ul className="luckorader">
        {order.rader.map((r) => (
          <li key={r.id}>
            <span className="antal">{r.antal}×</span> {r.namn}
          </li>
        ))}
      </ul>
      {order.anteckning && <p className="luckonotis">{order.anteckning}</p>}

      {obetald ? (
        <div className="betalrad">
          <span className="liten">Ta betalt</span>
          {BETALSATT.map((b) => (
            <button
              key={b.varde}
              className="stor"
              disabled={arbetar}
              onClick={() => andra(order, { betalsatt: b.varde }, `${order.nummer} betald med ${b.text.toLowerCase()}`)}
            >
              {b.text}
            </button>
          ))}
        </div>
      ) : (
        <div className="luckomarke betald">Betald · {order.betalsatt}</div>
      )}

      <footer>
        {nasta && (
          <button
            className="stor primar vaxa"
            disabled={arbetar}
            onClick={() => andra(order, { status: nasta.status }, null)}
          >
            {arbetar ? '…' : nasta.text}
            {nasta.status === 'klar' && order.mobil && sms && <small> + sms</small>}
          </button>
        )}
        <button className="stor tom" onClick={() => sattMer(!mer)} aria-expanded={mer}>Mer</button>
      </footer>
      {mer && (
        <div className="luckomer">
          {order.mobil && <span className="liten svag">{order.mobil}</span>}
          <button className="fara" disabled={arbetar} onClick={() => andra(order, { status: 'avbruten' }, `${order.nummer} avbruten`)}>
            Avbryt beställningen
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Sälj direkt i luckan.
 *
 * Varorna är knappar och inte en lista med antal: den som står i luckan
 * trycker en gång per vara, och ser summan växa. Priset kommer alltid från
 * servern – klienten skickar artikel-id och antal, aldrig belopp.
 */
function Saljlada({ meny, stang, klar }) {
  const notis = useNotis();
  const lista = useHamta(() => api.hamta('/api/fik/meny'));
  const [korg, sattKorg] = useState([]);
  const [kategori, sattKategori] = useState('');
  const [betalsatt, sattBetalsatt] = useState('kontant');
  const [slar, sattSlar] = useState(false);

  const artiklar = lista.data?.artiklar || [];
  const kategorier = useMemo(
    () => [...new Set(artiklar.map((a) => a.kategori))],
    [artiklar]
  );
  const synliga = artiklar.filter((a) => !a.slut && (!kategori || a.kategori === kategori));
  const summa = korg.reduce((s, r) => s + r.pris_ore * r.antal, 0);

  const lagg = (a) =>
    sattKorg((k) => {
      const i = k.findIndex((r) => r.artikel_id === a.id);
      if (i < 0) return [...k, { artikel_id: a.id, namn: a.namn, pris_ore: a.pris_ore, antal: 1 }];
      const ny = [...k];
      ny[i] = { ...ny[i], antal: ny[i].antal + 1 };
      return ny;
    });

  const ta = (artikel_id) =>
    sattKorg((k) =>
      k.flatMap((r) =>
        r.artikel_id !== artikel_id ? [r] : r.antal > 1 ? [{ ...r, antal: r.antal - 1 }] : []
      )
    );

  const sla = async () => {
    sattSlar(true);
    try {
      const order = await api.skapa('/api/fik/kassa/order', {
        rader: korg.map((r) => ({ artikel_id: r.artikel_id, antal: r.antal })),
        betalsatt,
      });
      klar(order);
    } catch (e) {
      notis(e.message, 'fel');
      sattSlar(false);
    }
  };

  return (
    <Lada titel="Sälj i luckan" stang={stang} bred>
      {lista.laddar && !lista.data ? (
        <Vanta />
      ) : (
        <div className="saljvy">
          <div className="saljvaror">
            <div className="chipsrad">
              <button className={kategori ? '' : 'pa'} onClick={() => sattKategori('')}>Allt</button>
              {kategorier.map((k) => (
                <button key={k} className={kategori === k ? 'pa' : ''} onClick={() => sattKategori(k)}>
                  {k}
                </button>
              ))}
            </div>
            <div className="varurutnat">
              {synliga.map((a) => (
                <button key={a.id} className="varuknapp" onClick={() => lagg(a)}>
                  <span className="emoji" aria-hidden="true">{a.emoji}</span>
                  <span className="namn">{a.namn}</span>
                  <span className="pris num">{kronor(a.pris_ore)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="saljkorg">
            {korg.length === 0 ? (
              <p className="svag liten">Tryck på varorna till vänster.</p>
            ) : (
              <ul className="korglista">
                {korg.map((r) => (
                  <li key={r.artikel_id}>
                    <button className="tom liten" onClick={() => ta(r.artikel_id)} aria-label={`Ta bort ${r.namn}`}>−</button>
                    <span className="antal num">{r.antal}×</span>
                    <span className="vaxa">{r.namn}</span>
                    <span className="num">{kronor(r.pris_ore * r.antal)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="saljsumma num">{kronor(summa)}</div>
            <div className="chipsrad">
              {BETALSATT.map((b) => (
                <button key={b.varde} className={betalsatt === b.varde ? 'pa' : ''} onClick={() => sattBetalsatt(b.varde)}>
                  {b.text}
                </button>
              ))}
            </div>
            <button className="stor primar full" disabled={!korg.length || slar} onClick={sla}>
              {slar ? 'Slår in …' : `Slå in ${kronor(summa)}`}
            </button>
          </div>
        </div>
      )}
    </Lada>
  );
}

/** Slut i dag: en rad per vara, en tryckyta. Inget annat. */
function Sortimentslada({ stang }) {
  const notis = useNotis();
  const { data, laddar, uppdatera } = useHamta(() => api.hamta('/api/fik/meny'));
  const vaxla = async (a) => {
    try {
      await api.spara(`/api/fik/artiklar/${a.id}`, { slut: !a.slut });
      uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };
  return (
    <Lada titel="Vad är slut i dag?" stang={stang} bred>
      <p className="liten svag">Det du bockar i försvinner ur gästernas meny direkt.</p>
      {laddar && !data ? (
        <Vanta />
      ) : (
        <div className="slutlista">
          {(data?.artiklar || []).map((a) => (
            <button key={a.id} className={`slutrad${a.slut ? ' slut' : ''}`} onClick={() => vaxla(a)}>
              <span className="emoji" aria-hidden="true">{a.emoji}</span>
              <span className="vaxa">{a.namn}</span>
              <span className="num liten svag">{kronor(a.pris_ore)}</span>
              <span className="lage">{a.slut ? 'Slut' : 'Finns'}</span>
            </button>
          ))}
        </div>
      )}
    </Lada>
  );
}

// ---------------------------------------------------------- Uthyrningen ---

function Uthyrningen() {
  const notis = useNotis();
  const kassa = useHamta(() => api.hamta('/api/uthyrning/kassa'));
  const [utlamning, sattUtlamning] = useState(null);
  const [retur, sattRetur] = useState(null);

  useEffect(() => {
    const t = setInterval(() => kassa.uppdatera(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (kassa.laddar && !kassa.data) return <Vanta />;
  if (kassa.fel) return <div className="meddelande fel">{kassa.fel}</div>;
  const d = kassa.data;

  const vantar = d.ute.filter((a) => a.status === 'bokad');
  const ute = d.ute.filter((a) => a.status === 'ute');
  const forsenade = d.ute.filter((a) => a.status === 'forsenad');

  return (
    <>
      <div className="luckotopp">
        <Lage
          poster={[
            { etikett: 'Väntar på utlämning', varde: vantar.length, farg: vantar.length ? 'varning' : '' },
            { etikett: 'Ute', varde: ute.length },
            { etikett: 'Försenade', varde: forsenade.length, farg: forsenade.length ? 'fara' : '' },
          ]}
        />
        <div className="luckoknappar">
          <span className="liten svag">Hyrt i dag: <strong>{d.summa}</strong></span>
        </div>
      </div>

      {d.ute.length === 0 ? (
        <Tomt>Ingen utrustning ute och inget som väntar.</Tomt>
      ) : (
        <div className="luckokort">
          {[...vantar, ...forsenade, ...ute].map((a) => (
            <Hyreskort
              key={a.id}
              avtal={a}
              lamnaUt={() => sattUtlamning(a)}
              taEmot={() => sattRetur(a)}
            />
          ))}
        </div>
      )}

      {utlamning && (
        <Utlamningslada
          avtal={utlamning}
          stang={() => sattUtlamning(null)}
          klar={(a) => {
            sattUtlamning(null);
            kassa.uppdatera();
            notis(`${a.nummer} utlämnad${a.sms ? ' · sms skickat' : ''}`);
          }}
        />
      )}
      {retur && (
        <Returlada
          avtal={retur}
          stang={() => sattRetur(null)}
          klar={(a) => {
            sattRetur(null);
            kassa.uppdatera();
            notis(`${a.nummer} är inlämnad`);
          }}
        />
      )}
    </>
  );
}

function Hyreskort({ avtal, lamnaUt, taEmot }) {
  const vantar = avtal.status === 'bokad';
  const forsenad = avtal.status === 'forsenad';
  return (
    <article className={`luckokort-ett${forsenad ? ' forsenad' : ''}${!avtal.betald_tid ? ' obetald' : ''}`}>
      <header>
        <span className="nummer">{avtal.nummer}</span>
        <div className="kolumn" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <strong className="plats">{avtal.namn || 'Utan namn'}</strong>
          <span className="liten svag">
            {vantar ? `Bokad ${sedan(avtal.skapad)} sedan` : `Ute${avtal.retur_senast ? ` · åter ${avtal.retur_senast}` : ''}`}
            {' · '}{avtal.belopp}
          </span>
        </div>
        {forsenad && <span className="luckomarke fara">Försenad</span>}
      </header>

      <ul className="luckorader">
        {avtal.rader.map((r) => (
          <li key={r.id}>
            <span className="antal">{r.antal}×</span> {r.namn}
            {r.markning && <span className="markning num">{r.markning}</span>}
          </li>
        ))}
      </ul>
      {avtal.anmald && vantar && (
        <p className="luckonotis">Förhandsanmäld – storlekar finns ifyllda. Pjäxor provas ändå i luckan.</p>
      )}

      <footer>
        {vantar ? (
          <button className="stor primar vaxa" onClick={lamnaUt}>Lämna ut</button>
        ) : (
          <button className="stor primar vaxa" onClick={taEmot}>Ta emot</button>
        )}
      </footer>
    </article>
  );
}

/**
 * Utlämningen.
 *
 * Märkningen per del är det som gör att rätt par kommer tillbaka, så varje
 * rad har ett eget fält. Fälten går att fylla i med en streckkodsläsare:
 * den skriver siffrorna och trycker Enter, och Enter flyttar till nästa rad.
 */
function Utlamningslada({ avtal, stang, klar }) {
  const notis = useNotis();
  const [rader, sattRader] = useState(() => avtal.rader.map((r) => ({ id: r.id, markning: r.markning || '' })));
  const [retur, sattRetur] = useState(avtal.retur_senast || '');
  const [betalsatt, sattBetalsatt] = useState(avtal.betald_tid ? null : 'kort');
  const [lamnar, sattLamnar] = useState(false);

  const satt = (id, v) => sattRader((f) => f.map((r) => (r.id === id ? { ...r, markning: v } : r)));

  const skicka = async () => {
    sattLamnar(true);
    try {
      if (betalsatt && !avtal.betald_tid) await api.spara(`/api/uthyrning/avtal/${avtal.id}`, { betalsatt });
      const ut = await api.skapa(`/api/uthyrning/avtal/${avtal.id}/utlamning`, {
        rader,
        retur_senast: retur || null,
      });
      klar(ut);
    } catch (e) {
      notis(e.message, 'fel');
      sattLamnar(false);
    }
  };

  return (
    <Lada
      titel={`Lämna ut ${avtal.nummer} · ${avtal.namn || 'utan namn'}`}
      stang={stang}
      bred
      fot={
        <button className="stor primar" onClick={skicka} disabled={lamnar}>
          {lamnar ? 'Lämnar ut …' : 'Lämna ut'}
        </button>
      }
    >
      <div className="utlamning">
        {avtal.rader.map((r, i) => (
          <label key={r.id} className="utrad">
            <span className="vad">
              <span className="antal num">{r.antal}×</span> {r.namn}
            </span>
            <input
              value={rader.find((x) => x.id === r.id)?.markning || ''}
              onChange={(e) => satt(r.id, e.target.value)}
              placeholder="märkning"
              autoFocus={i === 0}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const falt = [...e.currentTarget.closest('.utlamning').querySelectorAll('input')];
                falt[falt.indexOf(e.currentTarget) + 1]?.focus();
              }}
            />
          </label>
        ))}
      </div>

      <Text etikett="Åter senast" varde={retur} satt={sattRetur} placeholder="t.ex. i dag 17:00" />

      {avtal.betald_tid ? (
        <div className="meddelande ok liten">Betald {avtal.betalsatt}.</div>
      ) : (
        <>
          <h4>Ta betalt {avtal.belopp}</h4>
          <div className="chipsrad">
            {BETALSATT.map((b) => (
              <button key={b.varde} className={betalsatt === b.varde ? 'pa' : ''} onClick={() => sattBetalsatt(b.varde)}>
                {b.text}
              </button>
            ))}
            <button className={betalsatt === null ? 'pa' : ''} onClick={() => sattBetalsatt(null)}>Senare</button>
          </div>
        </>
      )}

      {avtal.mobil && (
        <p className="liten svag">
          Ett sms med återlämningslänk går till {avtal.mobil} när du lämnar ut.
        </p>
      )}
    </Lada>
  );
}

function Returlada({ avtal, stang, klar }) {
  const notis = useNotis();
  const [anteckning, sattAnteckning] = useState('');
  const [tar, sattTar] = useState(false);

  const skicka = async () => {
    sattTar(true);
    try {
      klar(await api.skapa(`/api/uthyrning/avtal/${avtal.id}/retur`, { anteckning: anteckning || null }));
    } catch (e) {
      notis(e.message, 'fel');
      sattTar(false);
    }
  };

  return (
    <Lada
      titel={`Ta emot ${avtal.nummer}`}
      stang={stang}
      fot={
        <button className="stor primar" onClick={skicka} disabled={tar}>
          {tar ? 'Tar emot …' : 'Allt är inlämnat'}
        </button>
      }
    >
      <ul className="luckorader stor">
        {avtal.rader.map((r) => (
          <li key={r.id}>
            <span className="antal">{r.antal}×</span> {r.namn}
            {r.markning && <span className="markning num">{r.markning}</span>}
          </li>
        ))}
      </ul>
      <Text
        etikett="Anmärkning (om något är trasigt eller saknas)"
        varde={anteckning}
        satt={sattAnteckning}
        placeholder="Lämna tomt om allt är helt"
      />
    </Lada>
  );
}
