// Starta en rond, eller fortsätt en som redan är påbörjad.
import { useMemo, useState } from 'react';
import { hamtaMedCache } from '../api.js';
import { useRuta } from '../app.jsx';
import { antalBesvarade, nyRond, synka, taBortRond } from '../ko.js';
import { Ark, Bricka, flertal, INTERVALL, Post, sedan, Tomt, useHamta, useNotis, Vanta } from '../delar.jsx';

export function Hem({ ronder }) {
  const { ga } = useRuta();
  const notis = useNotis();
  const [vald, sattVald] = useState(null);
  const [sok, sattSok] = useState('');

  const mallar = useHamta(() => hamtaMedCache('/api/checklistor/mallar'));
  const utrustning = useHamta(() => hamtaMedCache('/api/utrustning'));
  const omraden = useHamta(() => hamtaMedCache('/api/omraden'));

  const lista = useMemo(() => {
    const alla = (mallar.data?.data || []).filter((m) => m.aktiv);
    const s = sok.trim().toLowerCase();
    return s ? alla.filter((m) => m.namn.toLowerCase().includes(s)) : alla;
  }, [mallar.data, sok]);

  const pagaende = ronder.filter((r) => !r.klar);
  const attSkicka = ronder.filter((r) => r.klar && !r.avslutad);

  const starta = (mall, objekt) => {
    const rond = nyRond({
      mall,
      utrustning: objekt?.slag === 'utrustning' ? objekt.post : null,
      omrade: objekt?.slag === 'omrade' ? objekt.post : null,
    });
    sattVald(null);
    synka().catch(() => {});
    ga('rond', { lokalId: rond.lokalId });
  };

  if (mallar.laddar && !mallar.data) return <Vanta />;
  if (mallar.fel && !mallar.data) return <div className="meddelande fel">{mallar.fel}</div>;

  return (
    <>
      {mallar.data?.fran === 'cache' && (
        <div className="meddelande info">Visar sparade checklistor – telefonen når inte servern just nu.</div>
      )}

      {!!pagaende.length && (
        <section className="kort">
          <header>
            <h2>Pågående</h2>
          </header>
          <div className="lista" style={{ marginTop: 10 }}>
            {pagaende.map((r) => (
              <Post
                key={r.lokalId}
                figur="▶"
                titel={r.mallnamn}
                under={`${r.objektnamn ? `${r.objektnamn} · ` : ''}${antalBesvarade(r)}/${r.punkter.length} klara · ${sedan(r.startad)}`}
                onClick={() => ga('rond', { lokalId: r.lokalId })}
              />
            ))}
          </div>
        </section>
      )}

      {!!attSkicka.length && (
        <section className="kort">
          <header><h2>Väntar på att skickas</h2></header>
          <div className="lista" style={{ marginTop: 10 }}>
            {attSkicka.map((r) => (
              <Post
                key={r.lokalId}
                figur="↑"
                figurfarg="varning"
                titel={r.mallnamn}
                under={r.fel ? `Fel: ${r.fel}` : 'Skickas när det finns täckning'}
                hoger={<span className="bricka gul">väntar</span>}
                onClick={() => ga('rond', { lokalId: r.lokalId })}
              />
            ))}
          </div>
          <div className="kropp">
            <button
              className="full"
              onClick={async () => {
                const r = await synka();
                notis(r.kvar ? 'Kvar att skicka – försöker igen senare.' : 'Allt är skickat.');
              }}
            >
              Försök skicka nu
            </button>
          </div>
        </section>
      )}

      <section className="kort">
        <header>
          <h2>Starta rond</h2>
          <p className="liten svag" style={{ margin: '4px 0 10px' }}>
            Välj checklista. Ronden fungerar även utan täckning.
          </p>
          <input
            placeholder="Sök checklista"
            value={sok}
            onChange={(e) => sattSok(e.target.value)}
            style={{ marginBottom: 12 }}
          />
        </header>
        <div className="lista">
          {lista.map((m) => (
            <Post
              key={m.id}
              figur={m.omfattning === 'utrustningstyp' ? '⚙' : m.omfattning === 'omrade' ? '⌂' : '✓'}
              titel={m.namn}
              under={`${INTERVALL[m.intervall]} · ${m.punkter.length} punkter${
                m.omfattning === 'utrustningstyp' ? ` · alla ${flertal(m.utrustningstyp)}` : ''
              }`}
              onClick={() => {
                if (m.omfattning === 'utrustningstyp') sattVald(m);
                else if (m.omfattning === 'omrade') {
                  const omrade = (omraden.data?.data || []).find((o) => o.id === m.omrade_id);
                  starta(m, omrade ? { slag: 'omrade', post: omrade } : null);
                } else starta(m, null);
              }}
            />
          ))}
          {!lista.length && <Tomt>Ingen checklista matchar.</Tomt>}
        </div>
      </section>

      {vald && (
        <ValjObjekt
          mall={vald}
          utrustning={(utrustning.data?.data || []).filter((u) => u.aktiv && u.typ === vald.utrustningstyp)}
          stang={() => sattVald(null)}
          valj={(u) => starta(vald, { slag: 'utrustning', post: u })}
        />
      )}
    </>
  );
}

function ValjObjekt({ mall, utrustning, stang, valj }) {
  const [sok, sattSok] = useState('');
  const lista = sok
    ? utrustning.filter((u) => u.namn.toLowerCase().includes(sok.toLowerCase()))
    : utrustning;
  return (
    <Ark titel={`${mall.namn} – välj enhet`} stang={stang}>
      <input placeholder="Sök enhet" value={sok} onChange={(e) => sattSok(e.target.value)} autoFocus />
      <div className="lista kort">
        {lista.map((u) => (
          <Post
            key={u.id}
            figur={u.namn.replace(/\D/g, '') || '•'}
            figurfarg={u.status === 'drift' ? '' : 'varning'}
            titel={u.namn}
            under={`${u.omrade || ''}${u.status !== 'drift' ? ` · ${u.status === 'service' ? 'service' : 'ur drift'}` : ''}`}
            onClick={() => valj(u)}
          />
        ))}
        {!lista.length && <Tomt>Ingen enhet av den typen.</Tomt>}
      </div>
    </Ark>
  );
}
