// Orderkvittot: numret kassan ropar upp, Swish-koden och läget.
import { useEffect, useState } from 'react';
import { api, kronor } from '../api.js';
import { Bricka, STATUSFARG, STATUSTEXT } from '../delar.jsx';

export function Order({ ruta, ga }) {
  const [order, sattOrder] = useState(null);
  const [fel, sattFel] = useState(null);
  const [qr, sattQr] = useState(null);
  const [sager, sattSager] = useState(false);

  const stig = `/api/fik/order/${ruta.nummer}${ruta.kod ? `?kod=${ruta.kod}` : ''}`;

  useEffect(() => {
    let lever = true;
    const hamta = () => api.hamta(stig).then((o) => lever && sattOrder(o)).catch((e) => lever && sattFel(e.message));
    hamta();
    // Kunden ska se när luckan säger att maten är klar.
    const timer = setInterval(hamta, 15000);
    return () => {
      lever = false;
      clearInterval(timer);
    };
  }, [stig]);

  useEffect(() => {
    if (!order || order.betald || !order.swish) return;
    fetch(`/api/fik/order/${ruta.nummer}/qr${ruta.kod ? `?kod=${ruta.kod}` : ''}`)
      .then((r) => (r.ok ? r.text() : null))
      .then(sattQr)
      .catch(() => sattQr(null));
  }, [order?.nummer, order?.betald, ruta.kod, ruta.nummer]);

  const jagHarSwishat = async () => {
    sattSager(true);
    try {
      sattOrder(await api.skapa(`/api/fik/order/${ruta.nummer}/betald?kod=${ruta.kod}`, { kod: ruta.kod }));
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattSager(false);
    }
  };

  if (fel) return <main className="innehall"><div className="meddelande fel">{fel}</div></main>;
  if (!order) return <main className="innehall"><div className="tomt">Hämtar din order …</div></main>;

  return (
    <main className="innehall">
      <div className="kort mitten">
        <div className="liten svag">Ditt ordernummer</div>
        <div className="ordernummer">{order.nummer}</div>
        <div style={{ marginTop: 10 }}>
          <Bricka farg={STATUSFARG[order.status]}>{STATUSTEXT[order.status] || order.status}</Bricka>
        </div>
        <div className="steg">
          <div className={order.status !== 'avbruten' ? 'klar' : ''} />
          <div className={['betald', 'tillagas', 'klar', 'hamtad'].includes(order.status) ? 'klar' : ''} />
          <div className={['klar', 'hamtad'].includes(order.status) ? 'klar' : ''} />
        </div>
        <p className="liten svag" style={{ margin: 0 }}>
          Visa numret i luckan. {order.mobil ? 'Vi skickar ett sms när det är klart.' : ''}
        </p>
      </div>

      {!order.betald &&
        (order.swish ? (
          <div className="kort mitten">
            <h2>Betala med Swish</h2>
            <p className="liten svag">
              Skanna koden, eller swisha <strong>{kronor(order.belopp_ore)}</strong> till{' '}
              <strong className="num">{order.swish.nummer}</strong> med meddelandet{' '}
              <strong>HAK {order.nummer}</strong>.
            </p>
            {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
            <div style={{ marginTop: 14 }}>
              <button className="stor" onClick={jagHarSwishat} disabled={sager}>
                {sager ? 'Tack!' : 'Jag har swishat'}
              </button>
              <p className="liten svag" style={{ marginTop: 10, marginBottom: 0 }}>
                Kassan kvitterar betalningen innan maten lämnas ut.
              </p>
            </div>
          </div>
        ) : (
          <div className="kort mitten">
            <h2>Betala i luckan</h2>
            <p className="liten svag" style={{ marginBottom: 0 }}>
              Visa ordernumret och betala med kort eller kontant när du hämtar.
            </p>
          </div>
        ))}

      <div className="kort">
        <h2>Din beställning</h2>
        <div className="rader">
          {order.rader.map((r, i) => (
            <div key={i}>
              <span>{r.antal}× {r.namn}</span>
              <span className="num">{kronor(r.styckpris_ore * r.antal)}</span>
            </div>
          ))}
          <div style={{ fontWeight: 800 }}>
            <span>Summa</span>
            <span className="num">{order.belopp}</span>
          </div>
        </div>
        {order.plats && <p className="liten svag" style={{ marginTop: 10 }}>Levereras till: {order.plats}</p>}
        {order.anteckning && <p className="liten svag">Önskemål: {order.anteckning}</p>}
      </div>

      <div className="kort mitten">
        <button className="lank" onClick={() => ga('/fik/')}>Beställ något mer</button>
      </div>
    </main>
  );
}
