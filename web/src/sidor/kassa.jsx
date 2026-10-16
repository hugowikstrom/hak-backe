// Kassan: beställningar från fiket och uthyrningens avtal, på en skärm.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { Bricka, Flikar, Kort, Lada, Nyckeltal, Text, Tomt, useHamta, useNotis, Val, Vanta } from '../delar/bitar.jsx';
import { Tabell } from '../delar/tabell.jsx';
import { klockslag, minstRoll, sedan, tidpunkt } from '../nytta.js';

const STATUS = {
  ny: { namn: 'Ny', farg: 'varning' },
  betald: { namn: 'Betald', farg: 'info' },
  tillagas: { namn: 'Tillagas', farg: 'varning' },
  klar: { namn: 'Klar', farg: 'ok' },
  hamtad: { namn: 'Hämtad', farg: '' },
  avbruten: { namn: 'Avbruten', farg: '' },
};
const HYRSTATUS = {
  bokad: { namn: 'Bokad', farg: 'varning' },
  ute: { namn: 'Ute', farg: 'info' },
  aterlamnad: { namn: 'Återlämnad', farg: 'ok' },
  forsenad: { namn: 'Försenad', farg: 'fara' },
  avbruten: { namn: 'Avbruten', farg: '' },
};
const BETALSATT = [
  { varde: 'swish', text: 'Swish' },
  { varde: 'kort', text: 'Kort' },
  { varde: 'kontant', text: 'Kontant' },
  { varde: 'planbok', text: 'Plånbok' },
  { varde: 'ej_betald', text: 'Ej betald' },
];

export function Kassa() {
  const [flik, sattFlik] = useState('fik');
  return (
    <>
      <div className="sidhuvud">
        <div>
          <h1>Kassa</h1>
          <div className="undertext">Beställningar i fiket och utrustning på väg ut</div>
        </div>
        <div className="knapprad">
          <a className="knapp" href="/fik/" target="_blank" rel="noreferrer">Öppna gästens vy</a>
        </div>
      </div>
      <Flikar
        flikar={[
          { nyckel: 'fik', text: 'Fiket' },
          { nyckel: 'uthyrning', text: 'Uthyrning' },
          { nyckel: 'planbok', text: 'Plånböcker' },
        ]}
        aktiv={flik}
        satt={sattFlik}
      />
      {flik === 'fik' && <Fiket />}
      {flik === 'uthyrning' && <UthyrningsKassa />}
      {flik === 'planbok' && <Planbocker />}
    </>
  );
}

function Fiket() {
  const jag = useJag();
  const notis = useNotis();
  const kassa = useHamta(() => api.hamta('/api/fik/kassa'));
  const meny = useHamta(() => api.hamta('/api/fik/meny'));
  const [nyOrder, sattNyOrder] = useState(false);

  // Luckan ska se nya beställningar utan att ladda om.
  useEffect(() => {
    const timer = setInterval(() => kassa.uppdatera(), 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (kassa.laddar && !kassa.data) return <Vanta />;
  if (kassa.fel) return <div className="meddelande fel">{kassa.fel}</div>;

  const andra = async (order, data) => {
    try {
      await api.spara(`/api/fik/kassa/order/${order.id}`, data);
      kassa.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <>
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Öppna beställningar" varde={kassa.data.oppna.length} farg={kassa.data.oppna.length ? 'varning' : 'ok'} />
            <Nyckeltal etikett="Sålt i dag" varde={kassa.data.summa} />
            <Nyckeltal etikett="Beställningar i dag" varde={kassa.data.antal} />
            <div className="vaxa" />
            <div className="knapprad">
              <button className="primar" onClick={() => sattNyOrder(true)}>Sälj i kassan</button>
              <a className="knapp" href="/api/fik/forsaljning.csv">CSV</a>
            </div>
          </div>
          {!kassa.data.swish && (
            <p className="liten svag" style={{ marginTop: 8, marginBottom: 0 }}>
              Swish är inte uppsatt – gästerna hänvisas till att betala i luckan. Sätt HAK_SWISH_NUMMER i tjänsten för QR-betalning.
            </p>
          )}
        </Kort>
      </div>

      <Kort titel="Öppna beställningar" undertext="Nyast överst · uppdateras av sig själv" tat>
        {kassa.data.oppna.length ? (
          <div className="kolumn" style={{ padding: 10 }}>
            {kassa.data.oppna.map((o) => (
              <div key={o.id} className="kort" style={{ boxShadow: 'none' }}>
                <div className="kropp">
                  <div className="rad-mellan">
                    <div className="rad">
                      <span className="stortal" style={{ fontSize: 22 }}>{o.nummer}</span>
                      <Bricka farg={STATUS[o.status]?.farg}>{STATUS[o.status]?.namn || o.status}</Bricka>
                      {o.betald_tid ? <Bricka farg="ok">Betald {o.betalsatt}</Bricka> : <Bricka farg="fara">Obetald</Bricka>}
                      {o.kanal === 'qr' && <Bricka>QR</Bricka>}
                      {o.plats && <Bricka>{o.plats}</Bricka>}
                    </div>
                    <span className="liten svag">{sedan(o.skapad)} · {o.belopp}</span>
                  </div>
                  <ul className="lista" style={{ margin: '8px 0' }}>
                    {o.rader.map((r) => (
                      <li key={r.id}>
                        <span className="vaxa"><strong>{r.antal}×</strong> {r.namn}{r.anteckning ? ` – ${r.anteckning}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                  {o.anteckning && <div className="meddelande varning">{o.anteckning}</div>}
                  <div className="knapprad">
                    {!o.betald_tid && (
                      <Val
                        etikett=""
                        varde=""
                        tomtext="Kvittera betalning …"
                        satt={(v) => v && andra(o, { betalsatt: v, status: 'betald' })}
                        poster={BETALSATT.filter((b) => b.varde !== 'ej_betald')}
                      />
                    )}
                    {o.status !== 'tillagas' && o.status !== 'klar' && (
                      <button onClick={() => andra(o, { status: 'tillagas' })}>Tillagas</button>
                    )}
                    {o.status !== 'klar' && (
                      <button className="primar" onClick={() => andra(o, { status: 'klar' })}>
                        Klar{o.mobil ? ' + sms' : ''}
                      </button>
                    )}
                    <button onClick={() => andra(o, { status: 'hamtad' })}>Hämtad</button>
                    <button className="fara" onClick={() => confirm(`Avbryt ${o.nummer}?`) && andra(o, { status: 'avbruten' })}>
                      Avbryt
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Tomt>Inga öppna beställningar.</Tomt>
        )}
      </Kort>

      <div className="tva">
        <Kort titel="Dagens beställningar" tat>
          <Tabell
            rader={kassa.data.dagens}
            maxhojd="40vh"
            tomtext="Inget sålt i dag ännu."
            kolumner={[
              { falt: 'nummer', rubrik: 'Nr' },
              { falt: 'skapad', rubrik: 'Tid', visa: (o) => <span className="num">{klockslag(o.skapad)}</span> },
              { falt: 'belopp', rubrik: 'Summa', sifra: true },
              { falt: 'betalsatt', rubrik: 'Betalt', visa: (o) => (o.betald_tid ? o.betalsatt : <Bricka farg="fara">nej</Bricka>) },
              { falt: 'kanal', rubrik: 'Kanal' },
              { falt: 'status', rubrik: 'Status', visa: (o) => <Bricka farg={STATUS[o.status]?.farg}>{STATUS[o.status]?.namn}</Bricka> },
            ]}
          />
        </Kort>
        <Kort titel="Sålt i dag per vara" tat>
          <Tabell
            rader={kassa.data.per_artikel}
            nyckel={(r) => r.namn}
            maxhojd="40vh"
            tomtext="Inget sålt än."
            kolumner={[
              { falt: 'namn', rubrik: 'Vara' },
              { falt: 'antal', rubrik: 'Antal', sifra: true },
              { falt: 'summa', rubrik: 'Summa', sifra: true },
            ]}
          />
        </Kort>
      </div>

      <Kort titel="Sortiment" undertext="Bocka i det som är slut, så försvinner det ur gästernas meny" tat>
        <Tabell
          rader={meny.data?.artiklar || []}
          maxhojd="40vh"
          kolumner={[
            { falt: 'namn', rubrik: 'Vara', visa: (a) => `${a.emoji || ''} ${a.namn}` },
            { falt: 'kategori', rubrik: 'Kategori' },
            { falt: 'pris', rubrik: 'Pris', sifra: true },
            {
              falt: 'slut', rubrik: 'Slut i dag',
              visa: (a) => (
                <input
                  type="checkbox"
                  checked={!!a.slut}
                  onChange={async (e) => {
                    try {
                      await api.spara(`/api/fik/artiklar/${a.id}`, { slut: e.target.checked });
                      meny.uppdatera();
                    } catch (err) {
                      notis(err.message, 'fel');
                    }
                  }}
                />
              ),
            },
          ]}
        />
      </Kort>

      {nyOrder && (
        <SaljLada
          meny={meny.data?.artiklar || []}
          stang={() => sattNyOrder(false)}
          klar={(order) => {
            sattNyOrder(false);
            kassa.uppdatera();
            notis(`${order.nummer} inslagen – ${order.belopp}.`);
          }}
        />
      )}
    </>
  );
}

function SaljLada({ meny, stang, klar }) {
  const notis = useNotis();
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [vagn, sattVagn] = useState({});
  const [betalsatt, sattBetalsatt] = useState('kontant');
  const [kund, sattKund] = useState('');
  const [planbok, sattPlanbok] = useState(null);
  const [sok, sattSok] = useState('');

  // Saldot hämtas när en medlem väljs, så kassan ser om pengarna räcker.
  useEffect(() => {
    if (!kund) return sattPlanbok(null);
    api.hamta(`/api/planbok/medlem/${kund}`).then(sattPlanbok).catch(() => sattPlanbok(null));
  }, [kund]);
  const rader = Object.entries(vagn)
    .filter(([, a]) => a > 0)
    .map(([id, antal]) => ({ artikel: meny.find((m) => m.id === Number(id)), antal }))
    .filter((r) => r.artikel);
  const summa = rader.reduce((a, r) => a + r.artikel.pris_ore * r.antal, 0);
  // Medlemsrabatten gäller fika och mat, inte liftkort.
  const rabatterbart = rader
    .filter((r) => ['mat', 'dryck', 'fika', 'godis'].includes(r.artikel.kategori))
    .reduce((a, r) => a + r.artikel.pris_ore * r.antal, 0);
  const rabatt = betalsatt === 'planbok' && planbok ? Math.round((rabatterbart * (planbok.rabatt_procent || 0)) / 100) : 0;
  const attBetala = summa - rabatt;
  const lista = sok ? meny.filter((m) => m.namn.toLowerCase().includes(sok.toLowerCase())) : meny;

  return (
    <Lada
      bred
      titel="Sälj i kassan"
      stang={stang}
      fot={
        <>
          <span className="vaxa">
            <span className="stortal" style={{ fontSize: 20 }}>{(attBetala / 100).toLocaleString('sv-SE')} kr</span>
            {rabatt > 0 && <span className="liten svag"> (−{(rabatt / 100).toLocaleString('sv-SE')} kr medlemsrabatt)</span>}
          </span>
          <button onClick={stang}>Avbryt</button>
          <button
            className="primar"
            disabled={!rader.length || (betalsatt === 'planbok' && (!kund || (planbok && planbok.saldo_ore < attBetala)))}
            onClick={async () => {
              try {
                klar(
                  await api.skapa('/api/fik/kassa/order', {
                    rader: rader.map((r) => ({ artikel_id: r.artikel.id, antal: r.antal })),
                    betalsatt,
                    medlem_id: betalsatt === 'planbok' ? kund : undefined,
                  })
                );
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Slå in
          </button>
        </>
      }
    >
      <div className="faltrad">
        <Text etikett="Sök vara" varde={sok} satt={sattSok} autoFocus />
        <Val etikett="Betalsätt" varde={betalsatt} satt={sattBetalsatt} tomtext={null} poster={BETALSATT} />
        {betalsatt === 'planbok' && (
          <Val
            etikett="Vem betalar"
            varde={kund}
            satt={sattKund}
            tomtext="– välj medlem –"
            poster={(medlemmar.data || []).filter((m) => m.aktiv).map((m) => ({ varde: m.id, text: m.namn }))}
          />
        )}
      </div>
      {betalsatt === 'planbok' && planbok && (
        <div className={`meddelande ${planbok.saldo_ore < attBetala ? 'fel' : 'ok'}`}>
          {planbok.namn}: {planbok.saldo} i plånboken · {planbok.rabatt_procent} % medlemsrabatt
          {planbok.saldo_ore < attBetala ? ' — räcker inte till köpet' : ''}
        </div>
      )}
      <div className="knapprad">
        {lista.map((a) => (
          <button key={a.id} className="liten" onClick={() => sattVagn((v) => ({ ...v, [a.id]: (v[a.id] || 0) + 1 }))}>
            {a.emoji} {a.namn} <span className="svag">{a.pris}</span>
          </button>
        ))}
      </div>
      {!!rader.length && (
        <>
          <div className="skiljare" />
          <ul className="lista">
            {rader.map((r) => (
              <li key={r.artikel.id}>
                <span className="vaxa">{r.antal}× {r.artikel.namn}</span>
                <span className="rad">
                  <span className="num">{((r.artikel.pris_ore * r.antal) / 100).toLocaleString('sv-SE')} kr</span>
                  <button className="liten" onClick={() => sattVagn((v) => ({ ...v, [r.artikel.id]: v[r.artikel.id] - 1 }))}>−</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Lada>
  );
}

function Planbocker() {
  const jag = useJag();
  const notis = useNotis();
  const oversikt = useHamta(() => api.hamta('/api/planbok'));
  const medlemmar = useHamta(() => api.hamta('/api/medlemmar'));
  const [kund, sattKund] = useState('');
  const [belopp, sattBelopp] = useState('500');
  const [betalmedel, sattBetalmedel] = useState('swish');

  if (oversikt.laddar && !oversikt.data) return <Vanta />;
  if (oversikt.fel) return <div className="meddelande fel">{oversikt.fel}</div>;

  return (
    <>
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Klubbens skuld till medlemmar" varde={oversikt.data.totalt} />
            <Nyckeltal etikett="Plånböcker med pengar" varde={oversikt.data.saldon.length} />
            <Nyckeltal etikett="Medlemsrabatt" varde={`${oversikt.data.rabatt_procent} %`} />
          </div>
          <p className="liten svag" style={{ marginTop: 8, marginBottom: 0 }}>
            Påfyllningen bokförs som en skuld till medlemmen (konto 2420). Först när medlemmen handlar blir
            det en intäkt. Rabatten gäller fika och mat, inte liftkort.
          </p>
        </Kort>
      </div>

      <Kort titel="Fyll på en plånbok" undertext="En påfyllning, många köp – i stället för en swishavgift per korv">
        <div className="faltrad">
          <Val
            etikett="Medlem"
            varde={kund}
            satt={sattKund}
            tomtext="– välj –"
            poster={(medlemmar.data || []).filter((m) => m.aktiv).map((m) => ({ varde: m.id, text: m.namn }))}
          />
          <Text etikett="Belopp (kr)" varde={belopp} satt={sattBelopp} />
          <Val
            etikett="Betalt med"
            varde={betalmedel}
            satt={sattBetalmedel}
            tomtext={null}
            poster={[
              { varde: 'swish', text: 'Swish' },
              { varde: 'kort', text: 'Kort' },
              { varde: 'kontant', text: 'Kontant' },
            ]}
          />
          <button
            className="primar"
            disabled={!kund}
            onClick={async () => {
              try {
                const r = await api.skapa('/api/planbok/insattning', {
                  medlem_id: kund,
                  belopp_ore: Math.round(Number(String(belopp).replace(',', '.')) * 100),
                  betalmedel,
                });
                notis(`Påfyllt. Nytt saldo: ${r.saldo}.`);
                oversikt.uppdatera();
              } catch (e) {
                notis(e.message, 'fel');
              }
            }}
          >
            Fyll på
          </button>
        </div>
      </Kort>

      <Kort titel="Plånböcker" tat>
        <Tabell
          rader={oversikt.data.saldon}
          nyckel={(r) => r.id}
          maxhojd="45vh"
          tomtext="Ingen har fyllt på ännu."
          kolumner={[
            { falt: 'medlemsnummer', rubrik: 'Nr', visa: (r) => <span className="num">{r.medlemsnummer || '–'}</span> },
            { falt: 'namn', rubrik: 'Medlem' },
            { falt: 'saldo', rubrik: 'Saldo', sifra: true },
          ]}
        />
      </Kort>
    </>
  );
}

function UthyrningsKassa() {
  const jag = useJag();
  const notis = useNotis();
  const kassa = useHamta(() => api.hamta('/api/uthyrning/kassa'));
  const [valt, sattValt] = useState(null);

  if (kassa.laddar && !kassa.data) return <Vanta />;
  if (kassa.fel) return <div className="meddelande fel">{kassa.fel}</div>;

  const andra = async (avtal, data) => {
    try {
      await api.spara(`/api/uthyrning/avtal/${avtal.id}`, data);
      kassa.uppdatera();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <>
      <div className="rutor">
        <Kort>
          <div className="rad gap-16 hopp">
            <Nyckeltal etikett="Utrustning ute" varde={kassa.data.ute.filter((a) => a.status === 'ute').length} />
            <Nyckeltal etikett="Väntar på utlämning" varde={kassa.data.ute.filter((a) => a.status === 'bokad').length} farg="varning" />
            <Nyckeltal etikett="Hyrt i dag" varde={kassa.data.summa} />
          </div>
        </Kort>
      </div>

      <Kort titel="Pågående hyror" undertext="Blippa utrustningens märkning vid utlämning" tat>
        {kassa.data.ute.length ? (
          <Tabell
            rader={kassa.data.ute}
            vidKlick={(a) => sattValt(a)}
            kolumner={[
              { falt: 'nummer', rubrik: 'Nr', visa: (a) => <strong>{a.nummer}</strong> },
              { falt: 'namn', rubrik: 'Kund', visa: (a) => a.namn || a.mobil || '–' },
              { falt: 'rader', rubrik: 'Utrustning', sortlos: true, visa: (a) => a.rader.map((r) => `${r.antal}× ${r.namn}`).join(', ') },
              { falt: 'belopp', rubrik: 'Summa', sifra: true },
              { falt: 'betald_tid', rubrik: 'Betalt', visa: (a) => (a.betald_tid ? <Bricka farg="ok">{a.betalsatt}</Bricka> : <Bricka farg="fara">nej</Bricka>) },
              { falt: 'status', rubrik: 'Status', visa: (a) => <Bricka farg={HYRSTATUS[a.status]?.farg}>{HYRSTATUS[a.status]?.namn}</Bricka> },
              { falt: 'retur_senast', rubrik: 'Åter senast' },
            ]}
          />
        ) : (
          <Tomt>Ingen utrustning ute.</Tomt>
        )}
      </Kort>

      <Kort titel="Dagens hyror" tat>
        <Tabell
          rader={kassa.data.dagens}
          maxhojd="34vh"
          tomtext="Inget uthyrt i dag."
          vidKlick={(a) => sattValt(a)}
          kolumner={[
            { falt: 'nummer', rubrik: 'Nr' },
            { falt: 'skapad', rubrik: 'Tid', visa: (a) => <span className="num">{klockslag(a.skapad)}</span> },
            { falt: 'namn', rubrik: 'Kund', visa: (a) => a.namn || a.mobil || '–' },
            { falt: 'belopp', rubrik: 'Summa', sifra: true },
            { falt: 'status', rubrik: 'Status', visa: (a) => <Bricka farg={HYRSTATUS[a.status]?.farg}>{HYRSTATUS[a.status]?.namn}</Bricka> },
          ]}
        />
      </Kort>

      {valt && (
        <AvtalLada
          avtal={valt}
          stang={() => sattValt(null)}
          uppdaterat={() => { kassa.uppdatera(); sattValt(null); }}
          andra={andra}
        />
      )}
    </>
  );
}

function AvtalLada({ avtal, stang, uppdaterat, andra }) {
  const notis = useNotis();
  const [rader, sattRader] = useState(avtal.rader.map((r) => ({ ...r })));
  const [returSenast, sattReturSenast] = useState(avtal.retur_senast || '');

  const lamnaUt = async () => {
    try {
      const r = await api.skapa(`/api/uthyrning/avtal/${avtal.id}/utlamning`, {
        rader: rader.map((r) => ({ id: r.id, markning: r.markning })),
        retur_senast: returSenast || null,
      });
      notis(r.sms?.skickat ? 'Utlämnat. Sms med återlämningslänk skickat.' : 'Utlämnat.');
      uppdaterat();
    } catch (e) {
      notis(e.message, 'fel');
    }
  };

  return (
    <Lada
      bred
      titel={`Hyra ${avtal.nummer} · ${avtal.namn || avtal.mobil || 'kund'}`}
      stang={stang}
      fot={
        <>
          {!avtal.betald_tid && (
            <Val
              etikett=""
              varde=""
              tomtext="Kvittera betalning …"
              satt={(v) => v && andra(avtal, { betalsatt: v }).then(uppdaterat)}
              poster={BETALSATT.filter((b) => b.varde !== 'ej_betald')}
            />
          )}
          <span className="vaxa" />
          {avtal.status === 'bokad' && <button className="primar" onClick={lamnaUt}>Lämna ut</button>}
          {avtal.status === 'ute' && (
            <button
              className="primar"
              onClick={async () => {
                await api.skapa(`/api/uthyrning/avtal/${avtal.id}/retur`, {});
                notis('Återlämning kvitterad.');
                uppdaterat();
              }}
            >
              Ta emot retur
            </button>
          )}
          <button onClick={stang}>Stäng</button>
        </>
      }
    >
      <div className="rad hopp">
        <Bricka farg={HYRSTATUS[avtal.status]?.farg}>{HYRSTATUS[avtal.status]?.namn}</Bricka>
        <Bricka>{avtal.belopp}</Bricka>
        {avtal.betald_tid ? <Bricka farg="ok">Betald {avtal.betalsatt}</Bricka> : <Bricka farg="fara">Obetald</Bricka>}
        {avtal.mobil && <Bricka>{avtal.mobil}</Bricka>}
        <span className="liten svag">Bokad {tidpunkt(avtal.skapad)}</span>
      </div>

      <div className="faltrad">
        <Text etikett="Åter senast" varde={returSenast} satt={sattReturSenast} placeholder="t.ex. i dag 17:00" />
      </div>

      <h4>Utrustning</h4>
      <div className="tabellramp">
        <table className="data">
          <thead>
            <tr><th>Antal</th><th>Vad</th><th>Märkning (blippas)</th><th>Åter</th></tr>
          </thead>
          <tbody>
            {rader.map((r, i) => (
              <tr key={r.id}>
                <td className="sifra">{r.antal}</td>
                <td>{r.namn}</td>
                <td className="redigerbar">
                  <input
                    value={r.markning || ''}
                    placeholder="SKI-114"
                    onChange={(e) => sattRader((lista) => lista.map((x, j) => (j === i ? { ...x, markning: e.target.value } : x)))}
                  />
                </td>
                <td>{r.aterlamnad ? <Bricka farg="ok">ja</Bricka> : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {avtal.anteckning && <div className="meddelande info">{avtal.anteckning}</div>}
    </Lada>
  );
}
