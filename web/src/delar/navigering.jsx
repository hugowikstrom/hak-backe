// Navigeringen: menyträd, meny för liten skärm, och hoppa-till-rutan.
//
// Varför ett träd och inte raden som fanns förut: arton sidor i en vågrät
// rad blir en remsa man drar i, och på en telefon blir den två. Ingenting
// säger vad som hör till vad, och den som letar efter serviceplanerna vet
// inte om de ligger under Underhåll eller Register.
//
// Därför: få grenar, sammanhållna, och bara den man står i uppslagen. Det
// är "less is more" på det enda sätt som håller när systemet växer – inte
// färre sidor, utan färre saker synliga samtidigt.
//
// Det som gör trädet uthärdligt för den som kan systemet är rutan: Ctrl+K
// och två bokstäver tar en vart som helst, utan att öppna någon gren alls.
import { useEffect, useMemo, useRef, useState } from 'react';

const lasGrenar = (nyckel) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(nyckel) || '[]'));
  } catch {
    // En trasig post ska inte stoppa menyn.
    return new Set();
  }
};

/**
 * Grenarna man har uppslagna. Minns mellan besöken, och en uppsättning per
 * arbetsyta: den som står i kiosken och den som sköter backen slår upp
 * olika saker.
 */
export function useOppnaGrenar(yta) {
  const nyckel = `hak-grenar-${yta}`;
  const [oppna, sattOppna] = useState(() => lasGrenar(nyckel));
  useEffect(() => {
    sattOppna(lasGrenar(nyckel));
  }, [nyckel]);
  const vaxla = (gren) => {
    sattOppna((f) => {
      const n = new Set(f);
      if (n.has(gren)) n.delete(gren);
      else n.add(gren);
      localStorage.setItem(nyckel, JSON.stringify([...n]));
      return n;
    });
  };
  return [oppna, vaxla];
}

/**
 * Sidorna ordnade i grenar.
 *
 * Sidor utan gren – Start – står löst högst upp. En gren som blivit tom av
 * behörighet eller avstängd modul faller bort helt; en rubrik utan innehåll
 * är bara en fråga till användaren om vad hen gör för fel.
 */
export function byggTrad(synliga, menygrupper, gruppAvSida) {
  const losa = synliga.filter((s) => !gruppAvSida[s.nyckel]);
  const grenar = menygrupper
    .map((g) => ({ ...g, sidor: synliga.filter((s) => gruppAvSida[s.nyckel] === g.nyckel) }))
    .filter((g) => g.sidor.length);
  // En gren som bara har en enda sida är ingen gren. Den sidan får stå löst
  // i stället för att gömmas bakom en rubrik man måste slå upp.
  const enstaka = grenar.filter((g) => g.sidor.length === 1).flatMap((g) => g.sidor);
  return { losa: [...losa, ...enstaka], grenar: grenar.filter((g) => g.sidor.length > 1) };
}

export function Menytrad({ trad, aktiv, ga, oppna, vaxla, vidVal }) {
  const { losa, grenar } = trad;
  // Grenen man står i är alltid uppslagen, oavsett vad som sparats.
  const grenMedAktiv = grenar.find((g) => g.sidor.some((s) => s === aktiv))?.nyckel;

  const Lank = ({ s }) => (
    <a
      href={s.stig}
      className="menylank"
      aria-current={s === aktiv ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        ga(s.stig);
        vidVal?.();
      }}
    >
      {s.text}
    </a>
  );

  return (
    <nav className="menytrad" aria-label="Huvudmeny">
      {losa.map((s) => (
        <Lank key={s.stig} s={s} />
      ))}
      {grenar.map((g) => {
        const uppe = oppna.has(g.nyckel) || grenMedAktiv === g.nyckel;
        const harAktiv = g.sidor.some((s) => s === aktiv);
        return (
          <div className={`menygren${uppe ? ' uppe' : ''}`} key={g.nyckel}>
            <button
              className="grenknapp"
              aria-expanded={uppe}
              onClick={() => vaxla(g.nyckel)}
            >
              <span className="pil" aria-hidden="true" />
              {g.namn}
              {!uppe && harAktiv && <span className="prick" aria-hidden="true" />}
            </button>
            {uppe && (
              <div className="grenkropp">
                {g.sidor.map((s) => (
                  <Lank key={s.stig} s={s} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Hoppa till. Ctrl+K, skriv, Enter.
 *
 * Söker på sidnamn och på grenens namn, så att "backen" tar fram allt som
 * hör till anläggningen. Matchningen är ordagrann och inte luddig: en
 * träfflista som gissar gör att Enter blir en lotteri.
 */
export function Palett({ poster, stang, ga }) {
  const [text, sattText] = useState('');
  const [i, sattI] = useState(0);
  const faltet = useRef(null);

  useEffect(() => {
    faltet.current?.focus();
  }, []);

  const traffar = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return poster.slice(0, 12);
    const ord = q.split(/\s+/);
    return poster
      .map((p) => {
        const hela = `${p.text} ${p.sammanhang || ''}`.toLowerCase();
        if (!ord.every((o) => hela.includes(o))) return null;
        // Träff i början av namnet väger tyngre än träff i sammanhanget.
        const vikt = p.text.toLowerCase().startsWith(ord[0]) ? 0 : p.text.toLowerCase().includes(ord[0]) ? 1 : 2;
        return { p, vikt };
      })
      .filter(Boolean)
      .sort((a, b) => a.vikt - b.vikt)
      .slice(0, 12)
      .map((t) => t.p);
  }, [text, poster]);

  useEffect(() => {
    sattI(0);
  }, [text]);

  const valj = (p) => {
    if (!p) return;
    stang();
    if (p.stig) ga(p.stig);
    else p.gor?.();
  };

  return (
    <div className="palett-bak" onMouseDown={(e) => e.target === e.currentTarget && stang()}>
      <div className="palett" role="dialog" aria-label="Hoppa till">
        <input
          ref={faltet}
          className="palettfalt"
          placeholder="Hoppa till sida, yta eller åtgärd …"
          value={text}
          onChange={(e) => sattText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') stang();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              sattI((n) => Math.min(n + 1, traffar.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              sattI((n) => Math.max(n - 1, 0));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              valj(traffar[i]);
            }
          }}
        />
        <div className="palettlista">
          {traffar.map((p, n) => (
            <button
              key={p.nyckel}
              className={`palettrad${n === i ? ' pa' : ''}`}
              onMouseEnter={() => sattI(n)}
              onClick={() => valj(p)}
            >
              <span className="vaxa">{p.text}</span>
              {p.sammanhang && <span className="liten svagare">{p.sammanhang}</span>}
            </button>
          ))}
          {!traffar.length && <div className="tomt liten">Inget som heter så.</div>}
        </div>
        <div className="palettfot liten svagare">
          <span><span className="tasta">↑</span> <span className="tasta">↓</span> välj</span>
          <span><span className="tasta">Enter</span> gå</span>
          <span><span className="tasta">Esc</span> stäng</span>
        </div>
      </div>
    </div>
  );
}

/** Ctrl+K eller ⌘K öppnar rutan, var man än står – utom i ett skrivfält. */
export function usePalettgenvag(oppna) {
  useEffect(() => {
    const vid = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        oppna();
      }
    };
    window.addEventListener('keydown', vid);
    return () => window.removeEventListener('keydown', vid);
  }, [oppna]);
}
