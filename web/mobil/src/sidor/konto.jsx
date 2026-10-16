// Konto, appläge och hjälp.
import { api } from '../api.js';
import { useJag } from '../app.jsx';
import { laddaRonder, synka } from '../ko.js';
import { Bricka, Marke, useNat, useNotis } from '../delar.jsx';

const ROLLNAMN = {
  medlem: 'Medlem', backansvarig: 'Backansvarig',
  anlaggningsansvarig: 'Anläggningsansvarig', admin: 'Administratör',
};

export function Konto() {
  const jag = useJag();
  const notis = useNotis();
  const online = useNat();
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

      <section className="kort">
        <div className="kropp kolumn">
          <div className="rad-mellan">
            <span>Anslutning</span>
            <Bricka farg={online ? 'gron' : 'gul'}>{online ? 'Online' : 'Offline'}</Bricka>
          </div>
          <div className="rad-mellan">
            <span>Ronder i telefonen</span>
            <Bricka farg={kvar ? 'gul' : 'gron'}>{kvar ? `${kvar} att skicka` : 'Allt skickat'}</Bricka>
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
