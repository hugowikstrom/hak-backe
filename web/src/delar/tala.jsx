// Tala in. Mikrofonen i listen, och Ctrl+punkt var man än står.
//
// Varför i skalet och inte på en sida: en rapport börjar när något händer,
// inte när man hunnit navigera. Den som står i liftkuren med en handske på
// ska kunna trycka en gång, säga sin sak, och granska texten efteråt.
//
// Vägen är densamma som mobilappens: ljud → transkript → AI-förslag →
// **människan bekräftar** → journal. Steget i mitten skapar ingenting.
// Posten ligger som utkast tills någon läst igenom den, och det som sparas
// är människans text. Går tolkningen inte igenom får man transkriptet och
// fyller i själv – det är ett fullgott utfall och inte ett fel.
import { useEffect, useState } from 'react';
import { klockslag, useInspelning } from '../../delad/inspelning.js';
import { api } from '../api.js';
import { Lada, useNotis } from './bitar.jsx';
import { Bekrafta } from './bekrafta.jsx';

/**
 * Ctrl+punkt startar rutan.
 *
 * Inte när markören står i ett skrivfält: då skriver man, och en genväg som
 * kapar tecken är värre än ingen genväg.
 */
export function useTalgenvag(oppna) {
  useEffect(() => {
    const vid = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== '.') return;
      const i = document.activeElement;
      const skriver = i && (i.tagName === 'INPUT' || i.tagName === 'TEXTAREA' || i.isContentEditable);
      if (skriver) return;
      e.preventDefault();
      oppna();
    };
    window.addEventListener('keydown', vid);
    return () => window.removeEventListener('keydown', vid);
  }, [oppna]);
}

export function Talruta({ stang }) {
  const notis = useNotis();
  const { spelar, ljud, sekunder, fel: mikrofel, starta, stoppa, nollstall, finns } = useInspelning();
  const [skickar, sattSkickar] = useState(false);
  const [post, sattPost] = useState(null);
  const [text, sattText] = useState('');

  useEffect(() => {
    if (mikrofel) notis(mikrofel, 'fel');
  }, [mikrofel, notis]);

  // Mikrofonen startar av sig själv när rutan öppnas: ett tryck ska räcka.
  useEffect(() => {
    if (finns) starta();
    // Startas en gång, när rutan öppnas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skicka = async (med) => {
    sattSkickar(true);
    try {
      const svar = await api.skapa('/api/drift/tal', { ...med, kalla: 'webb' });
      sattPost(svar.post);
      if (svar.stt_fel) notis(`Ljudet sparades, men kunde inte skrivas av: ${svar.stt_fel}`, 'fel');
      else if (svar.ai_fel) notis(`Transkriptet finns, men tolkningen gick inte: ${svar.ai_fel}`, 'fel');
      nollstall();
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattSkickar(false);
    }
  };

  // Ljudet kommer som data-URL en stund efter att inspelningen stoppats.
  useEffect(() => {
    if (ljud && !post && !skickar) skicka({ ljud });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ljud]);

  if (post)
    return (
      <Lada titel="Granska rapporten" stang={stang} bred>
        <div className="meddelande info liten" style={{ marginBottom: 10 }}>
          Posten ligger som utkast. Den räknas som journalförd först när du bekräftar den här nedanför.
        </div>
        <Bekrafta
          post={post}
          klar={() => {
            stang();
            notis('Journalförd', 'ok');
          }}
        />
      </Lada>
    );

  return (
    <Lada titel="Tala in" stang={stang}>
      {!finns ? (
        <div className="meddelande varning">
          Den här webbläsaren släpper inte fram mikrofonen. Skriv i stället – texten tolkas lika bra.
        </div>
      ) : (
        <div className="talbuk">
          <div className={`talprick${spelar ? ' spelar' : ''}`} aria-hidden="true" />
          <div className="talklocka num">{klockslag(sekunder)}</div>
          <div className="liten svag">
            {skickar
              ? 'Skriver av och tolkar – det tar en stund.'
              : spelar
                ? 'Spelar in. Säg vad du ser och vad du gjorde.'
                : 'Mikrofonen är av.'}
          </div>
          <div className="knapprad mitten">
            {spelar ? (
              <button className="primar" onClick={stoppa}>Klar</button>
            ) : (
              <button onClick={starta} disabled={skickar}>Spela in igen</button>
            )}
          </div>
        </div>
      )}

      <details className="skrivinstallet">
        <summary className="liten svag">Skriv i stället</summary>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => sattText(e.target.value)}
          placeholder="Lans fyra läcker vid kopplingen. Stängde av och satte lapp."
        />
        <div className="knapprad">
          <button
            className="primar liten"
            disabled={!text.trim() || skickar}
            onClick={() => {
              if (spelar) stoppa();
              skicka({ text });
            }}
          >
            {skickar ? 'Tolkar …' : 'Tolka texten'}
          </button>
        </div>
      </details>
    </Lada>
  );
}
