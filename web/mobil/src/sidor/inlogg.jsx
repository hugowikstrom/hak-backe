import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Marke } from '../delar.jsx';

/**
 * Kan webbläsaren maskera ett vanligt textfält?
 *
 * En pinkod i ett `type=password` väcker Chromes lösenordshanterare:
 * den erbjuder sig att spara koden och varnar sedan för att "1234" finns
 * i en dataläcka. Det är sant men obrukbart — rutan står i vägen varje
 * gång någon loggar in. Ett maskerat textfält ser likadant ut men
 * räknas inte som ett lösenord, och då är hela samtalet borta.
 *
 * Stöds maskeringen inte (Firefox) används `type=password` som förr. Det
 * ger varningen tillbaka, men en synlig pinkod vore sämre.
 */
const kanMaskera = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('-webkit-text-security', 'disc');

/**
 * Inloggningen. I kontrollvyn bär den samma gröna fält som resten av
 * vyn – den som öppnar appen ska känna igen den redan innan hen loggat
 * in, inte först efteråt.
 */
export function Inlogg({ klar, kontrollvy }) {
  const [anvandarnamn, sattAnv] = useState('');
  const [losenord, sattLos] = useState('');
  // Kontrollvyn loggar in med telefonnummer och pinkod. Numret är
  // förifyllt, som i systemet klubben kommer ifrån – pinkoden är det
  // man kan utantill och därför det enda man skriver.
  const [fel, sattFel] = useState(null);
  const [vantar, sattVantar] = useState(false);
  const [prov, sattProv] = useState(null);
  const [maskerad] = useState(kanMaskera);
  const losenruta = useRef(null);

  // Provinloggningarna kommer ur plattformen. Finns de inte – för att
  // klubben stängt av dem – ritas ingenting extra.
  useEffect(() => {
    api
      .hamta('/api/plattform')
      .then((d) => {
        sattProv(d.provinlogg);
        if (kontrollvy && d.provinlogg?.kontrollnummer) sattAnv(d.provinlogg.kontrollnummer);
      })
      .catch(() => {});
  }, [kontrollvy]);

  const skicka = async (e) => {
    e.preventDefault();
    sattVantar(true);
    sattFel(null);
    try {
      const d = await api.skapa('/api/logga-in', { anvandarnamn, losenord });
      klar(d.medlem);
    } catch (e) {
      sattFel(e.message);
    } finally {
      sattVantar(false);
    }
  };

  /** Fyller i fälten i stället för att logga in direkt – du ska se vad du loggar in med. */
  const valjProv = (konto) => {
    sattAnv(konto.anvandarnamn);
    sattLos(konto.kod);
    sattFel(null);
    losenruta.current?.focus();
  };

  return (
    <div className={`inlogg${kontrollvy ? ' kv-inlogg' : ''}`}>
      <div className="huvud">
        <Marke storlek={84} />
        <h1>{kontrollvy ? 'Härnösands Alpina' : 'Backis Rond'}</h1>
        <p className="liten" style={{ opacity: 0.8 }}>
          {kontrollvy ? 'Kontroller, avvikelser och ronder' : 'Checklistor för Härnösands Alpina'}
        </p>
      </div>
      <form onSubmit={skicka} autoComplete={kontrollvy && maskerad ? 'off' : undefined}>
        {/* Provrutan hör till Backis egen inloggning. Kontrollvyn har
            ingen – där är numret förifyllt och pinkoden fyra siffror. */}
        {!kontrollvy && prov?.konton?.length > 0 && (
          <div className="provinlogg">
            <span className="rubrik">Prova</span>
            {prov.konton.map((k) => (
              <button
                key={k.anvandarnamn}
                type="button"
                className={anvandarnamn === k.anvandarnamn ? 'vald' : ''}
                onClick={() => valjProv(k)}
              >
                {k.text}
                <small>{k.anvandarnamn} · {k.kod}</small>
              </button>
            ))}
          </div>
        )}
        <label className="falt">
          <span>{kontrollvy ? 'Telefonnummer' : 'Användarnamn'}</span>
          <input
            value={anvandarnamn}
            onChange={(e) => sattAnv(e.target.value)}
            autoCapitalize="none"
            autoComplete={kontrollvy ? 'tel' : 'username'}
            {...(kontrollvy ? { type: 'tel', inputMode: 'tel' } : {})}
          />
        </label>
        <label className="falt">
          <span>{kontrollvy ? 'PIN' : 'Lösenord'}</span>
          <input
            ref={losenruta}
            value={losenord}
            onChange={(e) => sattLos(e.target.value)}
            {...(kontrollvy && maskerad
              ? {
                  type: 'text',
                  inputMode: 'numeric',
                  maxLength: 8,
                  className: 'pin maskerad',
                  autoComplete: 'off',
                  name: 'kod',
                }
              : {
                  type: 'password',
                  autoComplete: 'current-password',
                  ...(kontrollvy ? { inputMode: 'numeric', maxLength: 8, className: 'pin' } : {}),
                })}
          />
        </label>
        {fel && <div className="meddelande fel">{fel}</div>}
        <button className="primar stor" disabled={vantar || !anvandarnamn || (kontrollvy && !losenord)}>
          {vantar ? 'Loggar in …' : 'Logga in'}
        </button>
        <p className="liten svagare mitten" style={{ margin: 0 }}>
          {kontrollvy ? 'Samma konto som i Backis.' : 'Samma inloggning som i backsystemet.'}
        </p>
      </form>
    </div>
  );
}
