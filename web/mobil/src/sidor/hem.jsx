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
  const lage = useHamta(() => hamtaMedCache('/api/checklistor/lage'));
  const utrustning = useHamta(() => hamtaMedCache('/api/utrustning'));
  // Positionerna i backen. En snöläggningsrond går på platsen, inte på
  // kanonen som råkar stå där.
  const platser = useHamta(() => hamtaMedCache('/api/platser'));
  const omraden = useHamta(() => hamtaMedCache('/api/omraden'));

  const lista = useMemo(() => {
    const alla = (mallar.data?.data || []).filter((m) => m.aktiv);
    const s = sok.trim().toLowerCase();
    return s ? alla.filter((m) => m.namn.toLowerCase().includes(s)) : alla;
  }, [mallar.data, sok]);

  const pagaende = ronder.filter((r) => !r.klar);
  const attSkicka = ronder.filter((r) => r.klar && !r.avslutad);

  // Ronder som ska göras i dag enligt checklistornas intervall.
  const attGora = (lage.data?.data?.mallar || []).filter((m) => m.kvar > 0);

  const starta = (mall, objekt) => {
    const rond = nyRond({
      mall,
      utrustning: objekt?.slag === 'utrustning' ? objekt.post : null,
      omrade: objekt?.slag === 'omrade' ? objekt.post : null,
      snoplats: objekt?.slag === 'snoplats' ? objekt.post : null,
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

      <button className="genvag" onClick={() => ga('handelse')}>
        <span className="fig" aria-hidden="true">◉</span>
        <span className="txt">
          <strong>Rapportera händelse</strong>
          <span className="liten svag">Prata in något du sett eller gjort</span>
        </span>
      </button>

      {!!attGora.length && (
        <section className="kort">
          <header>
            <h2>Att göra i dag</h2>
            <p className="liten svag" style={{ margin: '4px 0 10px' }}>
              {lage.data.data.kvar} ronder kvar · {lage.data.data.klara} gjorda
              {lage.data.data.snopass ? ' · snöpass pågår' : ''}
            </p>
          </header>
          <div className="lista">
            {attGora.map((m) => {
              const mall = (mallar.data?.data || []).find((x) => x.id === m.mall_id);
              return (
                <Post
                  key={m.mall_id}
                  figur={m.kvar}
                  figurfarg="varning"
                  titel={m.namn}
                  under={`${INTERVALL[m.intervall]} · ${m.objekt.filter((o) => o.behovs).map((o) => o.namn).slice(0, 3).join(', ')}${m.kvar > 3 ? ` +${m.kvar - 3}` : ''}`}
                  onClick={() => {
                    if (!mall) return notis('Checklistan kunde inte läsas.', 'fel');
                    const kvar = m.objekt.filter((o) => o.behovs);
                    if (m.omfattning === 'allmant') starta(mall, null);
                    else if (kvar.length === 1 && m.omfattning === 'omrade')
                      starta(mall, { slag: 'omrade', post: { id: kvar[0].id, namn: kvar[0].namn } });
                    else sattVald({ ...mall, bara: kvar.map((o) => o.id) });
                  }}
                />
              );
            })}
          </div>
        </section>
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
              figur={
                m.omfattning === 'snoplats'
                  ? '⊙'
                  : m.omfattning === 'utrustningstyp'
                    ? '⚙'
                    : m.omfattning === 'omrade'
                      ? '⌂'
                      : '✓'
              }
              titel={m.namn}
              under={`${INTERVALL[m.intervall]} · ${m.punkter.length} punkter${
                m.omfattning === 'utrustningstyp'
                  ? ` · alla ${flertal(m.utrustningstyp)}`
                  : m.omfattning === 'snoplats'
                    ? ' · positioner i backen'
                    : ''
              }`}
              onClick={() => {
                if (m.omfattning === 'utrustningstyp' || m.omfattning === 'snoplats') sattVald(m);
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
          // En positionsrond väljer plats; en utrustningsrond väljer maskin.
          poster={
            vald.omfattning === 'snoplats'
              ? (platser.data?.data?.platser || [])
                  .filter((p) => p.slag === vald.platsslag)
                  .filter((p) => !vald.bara || vald.bara.includes(p.id))
                  .map((p) => ({
                    slag: 'snoplats',
                    id: p.id,
                    namn: p.namn,
                    under: p.tom
                      ? `${p.omrade || ''} · ingen maskin uppställd`
                      : `${p.omrade || ''} · ${p.maskin}`,
                    varning: p.tom,
                  }))
              : (utrustning.data?.data || [])
                  .filter((u) => u.aktiv && u.typ === vald.utrustningstyp)
                  .filter((u) => !vald.bara || vald.bara.includes(u.id))
                  .map((u) => ({
                    slag: 'utrustning',
                    id: u.id,
                    namn: u.namn,
                    under: `${u.omrade || ''}${u.status !== 'drift' ? ` · ${u.status === 'service' ? 'service' : 'ur drift'}` : ''}`,
                    varning: u.status !== 'drift',
                  }))
          }
          stang={() => sattVald(null)}
          valj={(o) => starta(vald, { slag: o.slag, post: o })}
        />
      )}
    </>
  );
}

function ValjObjekt({ mall, poster, stang, valj }) {
  const [sok, sattSok] = useState('');
  const lista = sok
    ? poster.filter((o) => o.namn.toLowerCase().includes(sok.toLowerCase()))
    : poster;

  return (
    <Ark titel={`${mall.namn} – välj ${mall.omfattning === 'snoplats' ? 'position' : 'enhet'}`} stang={stang}>
      <input
        placeholder={mall.omfattning === 'snoplats' ? 'Sök position' : 'Sök enhet'}
        value={sok}
        onChange={(e) => sattSok(e.target.value)}
        autoFocus
      />
      <div className="lista">
        {lista.map((o) => (
          <Post
            key={`${o.slag}-${o.id}`}
            titel={o.namn}
            under={o.under}
            figurfarg={o.varning ? 'varning' : ''}
            onClick={() => valj(o)}
          />
        ))}
        {!lista.length && <Tomt>Inget att välja.</Tomt>}
      </div>
    </Ark>
  );
}
