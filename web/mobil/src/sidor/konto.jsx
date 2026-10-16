// Konto, appläge och hjälp.
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { laddaRonder, synka } from '../ko.js';
import { Bricka, Marke, useHamta, useNat, useNotis, Vanta } from '../delar.jsx';

const ROLLNAMN = {
  medlem: 'Medlem', backansvarig: 'Backansvarig',
  anlaggningsansvarig: 'Anläggningsansvarig', admin: 'Administratör',
};

export function Konto() {
  const jag = useJag();
  const notis = useNotis();
  const online = useNat();
  const planbok = useHamta(() => api.hamta('/api/planbok/min'));
  const mina = useHamta(() => api.hamta('/api/bemanning/mina'));
  const ronder = laddaRonder();
  const kvar = ronder.filter((r) => !r.avslutad).length;
  const installerad = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <>
      <h1>Konto</h1>
      <section className="kort">
        <div className="kropp rad">
          <span className="marke-pa-vitt"><Marke storlek={44} /></span>
          <div className="vaxa">
            <strong>{jag.namn}</strong>
            <div className="liten svag">{jag.anvandarnamn} · {ROLLNAMN[jag.roll]}</div>
          </div>
        </div>
      </section>

      {planbok.data && (
        <section className="kort gron">
          <div className="kropp">
            <div className="rad-mellan">
              <div>
                <div className="mini svag">Min plånbok</div>
                <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--mono)' }}>{planbok.data.saldo}</div>
              </div>
              <Bricka farg="ok">{planbok.data.rabatt_procent} % rabatt</Bricka>
            </div>
            <p className="liten svag" style={{ margin: '8px 0 0' }}>
              Fyll på i kiosken eller hos kassören – en påfyllning i stället för en swishavgift per korv.
              Rabatten dras automatiskt på fika och mat.
            </p>
            {!!planbok.data.historik.length && (
              <div className="lista" style={{ marginTop: 10 }}>
                {planbok.data.historik.slice(0, 5).map((h) => (
                  <div key={h.id} className="rad-mellan" style={{ padding: '6px 0', borderBottom: '1px solid var(--ram)' }}>
                    <span className="liten">
                      {h.slag === 'insattning' ? 'Påfyllning' : h.slag === 'kop' ? 'Köp' : h.slag}
                      <span className="svag"> · {h.beskrivning || ''}</span>
                    </span>
                    <span className="num liten">{h.belopp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {mina.data && !mina.data.lage.undantagen && (
        <section className="kort">
          <div className="kropp">
            <div className="rad-mellan">
              <span>Mina timmar i säsongen</span>
              <Bricka farg={mina.data.lage.kvar > 0 ? 'varning' : 'ok'}>
                {mina.data.lage.timmar} av {mina.data.lage.kvot} h
              </Bricka>
            </div>
            {!!mina.data.pass.filter((p) => p.datum >= new Date().toLocaleDateString('sv-SE')).length && (
              <div className="lista" style={{ marginTop: 8 }}>
                {mina.data.pass
                  .filter((p) => p.datum >= new Date().toLocaleDateString('sv-SE'))
                  .slice(0, 3)
                  .map((p) => (
                    <div key={`${p.datum}${p.start}${p.position}`} className="rad-mellan" style={{ padding: '6px 0', borderBottom: '1px solid var(--ram)' }}>
                      <span className="liten"><strong>{p.position}</strong> · {p.datum} {p.start}–{p.slut}</span>
                      <Bricka>{p.status}</Bricka>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="kort">
        <div className="kropp kolumn">
          <div className="rad-mellan">
            <span>Anslutning</span>
            <Bricka farg={online ? 'ok' : 'varning'}>{online ? 'Online' : 'Offline'}</Bricka>
          </div>
          <div className="rad-mellan">
            <span>Ronder i telefonen</span>
            <Bricka farg={kvar ? 'varning' : 'ok'}>{kvar ? `${kvar} att skicka` : 'Allt skickat'}</Bricka>
          </div>
          <button
            onClick={async () => {
              const r = await synka();
              notis(r.kvar ? `${r.kvar} ronder kvar att skicka.` : 'Allt är skickat.');
            }}
          >
            Synka nu
          </button>
        </div>
      </section>

      {!installerad && (
        <section className="kort gron">
          <div className="kropp">
            <strong>Lägg appen på hemskärmen</strong>
            <p className="liten" style={{ margin: '6px 0 0' }}>
              iPhone: dela-knappen → <em>Lägg till på hemskärmen</em>.<br />
              Android: menyn ⋮ → <em>Installera app</em>.<br />
              Då startar HAK Rond i helskärm och fungerar utan täckning.
            </p>
          </div>
        </section>
      )}

      <section className="kort">
        <div className="kropp kolumn">
          <a className="knapp full" href="/" target="_blank" rel="noreferrer">Öppna hela backsystemet</a>
          <button
            className="fara"
            onClick={async () => {
              if (kvar && !confirm(`${kvar} ronder är inte skickade. Logga ut ändå?`)) return;
              await api.skapa('/api/logga-ut');
              location.reload();
            }}
          >
            Logga ut
          </button>
        </div>
      </section>
      <p className="liten svagare mitten">HAK Rond · Härnösands Alpina Klubb</p>
    </>
  );
}
