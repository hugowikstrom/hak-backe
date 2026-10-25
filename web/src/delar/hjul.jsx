// Årshjulet: tolv månader i en ring, med arbetet utlagt där det faller.
//
// Hjulet är till för överblicken – ser man hela året på en gång ser man
// också att november är överbelastad och juli tom. Detaljerna står i listan
// under; här ska man kunna peka och säga "vad är det där i mars?".
//
// Ritas som SVG utan bibliotek. Geometrin är enkel nog att skriva själv,
// och då slipper vi ett beroende som ska underhållas i tio år.
import { useState } from 'react';

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

const LAGEFARG = {
  forsenad: 'var(--fara)',
  snart: 'var(--varning)',
  kommande: 'var(--klubb)',
  okant: 'var(--text-svagare)',
};

const MITT = 250;
const BANA_YTTRE = 230;  // banan som högbelastningen ligger på
const BANA_INRE = 218;
const RING_YTTRE = 206;
const RING_INRE = 160;  // månadssektorerna
const PRICK_YTTRE = 150;
const PRICK_INRE = 86;

/** Grader → punkt. Noll uppåt, medurs, som en klocka. */
const punkt = (grader, radie) => {
  const r = ((grader - 90) * Math.PI) / 180;
  return [MITT + radie * Math.cos(r), MITT + radie * Math.sin(r)];
};

/** Ringsegment mellan två vinklar och två radier. */
function sektor(fran, till, inre, yttre) {
  const [x1, y1] = punkt(fran, yttre);
  const [x2, y2] = punkt(till, yttre);
  const [x3, y3] = punkt(till, inre);
  const [x4, y4] = punkt(fran, inre);
  const stor = till - fran > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${yttre} ${yttre} 0 ${stor} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${inre} ${inre} 0 ${stor} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

const dagarIManaden = (ar, manad) => new Date(ar, manad, 0).getDate();

/**
 * @param {Array} manader  [{ nyckel, ar, manad, namn, poster: [{datum, namn, lage, …}] }]
 * @param {Array} perioder högbelastning [{namn, fran, till}]
 */
export function Arshjul({ manader, perioder = [], vald, valj }) {
  const [over, sattOver] = useState(null);
  if (!manader?.length) return null;

  const steg = 360 / manader.length;
  const idag = new Date().toLocaleDateString('sv-SE');

  // Var i hjulet ett datum hamnar: månadens sektor plus dagens andel av den.
  const vinkelFor = (datum) => {
    const i = manader.findIndex((m) => m.nyckel === datum.slice(0, 7));
    if (i < 0) return null;
    const dag = Number(datum.slice(8, 10));
    const andel = (dag - 0.5) / dagarIManaden(manader[i].ar, manader[i].manad);
    return i * steg + andel * steg;
  };

  // Prickarna. Flera arbeten samma dag staplas inåt i stället för att
  // lägga sig ovanpå varandra.
  const prickar = [];
  const raknare = new Map();
  for (const m of manader) {
    for (const p of m.poster) {
      const v = vinkelFor(p.datum);
      if (v == null) continue;
      const nyckel = `${p.datum}`;
      const varv = raknare.get(nyckel) ?? 0;
      raknare.set(nyckel, varv + 1);
      const radie = PRICK_YTTRE - varv * 15;
      if (radie < PRICK_INRE) continue;
      const [x, y] = punkt(v, radie);
      prickar.push({ ...p, x, y, vinkel: v, radie, manad: m.nyckel });
    }
  }

  // Högbelastningsperioderna som band ytterst.
  const band = perioder
    .map((p) => {
      const a = vinkelFor(p.fran);
      const b = vinkelFor(p.till);
      if (a == null && b == null) return null;
      const fran = a ?? 0;
      const till = b ?? manader.length * steg;
      return till > fran ? { ...p, fran, till } : null;
    })
    .filter(Boolean);

  const nuVinkel = vinkelFor(idag);
  const totalt = prickar.length;
  const forsenade = prickar.filter((p) => p.lage === 'forsenad').length;

  return (
    <div className="hjul">
      <svg viewBox="0 0 500 500" role="img" aria-label="Årshjul över planerat underhåll">
        {/* Högbelastningen ligger på en egen bana ytterst. Banan ritas hel
            så att märkena läses som perioder på ett år, inte som streck. */}
        <circle cx={MITT} cy={MITT} r={(BANA_YTTRE + BANA_INRE) / 2} className="hjul-bana" />
        {band.map((b) => (
          <path key={b.id ?? b.namn} d={sektor(b.fran, b.till, BANA_INRE, BANA_YTTRE)} className="hjul-band">
            <title>{`${b.namn} – planerat underhåll undviks`}</title>
          </path>
        ))}
        {/* Månadsskiften som små streck, så att gränserna syns. */}
        {manader.map((m, i) => {
          const [x1, y1] = punkt(i * steg, BANA_INRE - 3);
          const [x2, y2] = punkt(i * steg, RING_YTTRE);
          return <line key={`tick-${m.nyckel}`} x1={x1} y1={y1} x2={x2} y2={y2} className="hjul-tick" />;
        })}

        {manader.map((m, i) => {
          const fran = i * steg;
          const till = fran + steg;
          const mitten = fran + steg / 2;
          const [tx, ty] = punkt(mitten, (RING_YTTRE + RING_INRE) / 2);
          const antal = m.poster.length;
          const varst = m.poster.some((p) => p.lage === 'forsenad')
            ? 'forsenad'
            : m.poster.some((p) => p.lage === 'snart')
              ? 'snart'
              : antal
                ? 'kommande'
                : 'tom';
          return (
            <g
              key={m.nyckel}
              className={`hjul-manad ${varst}${vald === m.nyckel ? ' vald' : ''}`}
              onClick={() => valj?.(vald === m.nyckel ? null : m.nyckel)}
              onMouseEnter={() => sattOver({ slag: 'manad', m })}
              onMouseLeave={() => sattOver(null)}
            >
              <path d={sektor(fran + 0.6, till - 0.6, RING_INRE, RING_YTTRE)} />
              <text x={tx} y={ty} className="hjul-namn">
                {m.namn.slice(0, 3)}
              </text>
              <text x={tx} y={ty + 14} className="hjul-antal">
                {antal || ''}
              </text>
            </g>
          );
        })}

        {/* Dagens läge: en nål från mitten ut i den månad vi är i. */}
        {nuVinkel != null && (
          <g className="hjul-nal">
            <line x1={MITT} y1={MITT} x2={punkt(nuVinkel, RING_INRE - 4)[0]} y2={punkt(nuVinkel, RING_INRE - 4)[1]} />
            <circle cx={punkt(nuVinkel, RING_INRE - 4)[0]} cy={punkt(nuVinkel, RING_INRE - 4)[1]} r="3" />
          </g>
        )}

        {prickar.map((p) => (
          <circle
            key={`${p.slag}-${p.id}`}
            cx={p.x}
            cy={p.y}
            r={p.kritisk ? 7 : 5.5}
            fill={LAGEFARG[p.lage] || LAGEFARG.kommande}
            className={`hjul-prick${p.kritisk ? ' kritisk' : ''}${vald && vald !== p.manad ? ' dim' : ''}`}
            onMouseEnter={() => sattOver({ slag: 'post', p })}
            onMouseLeave={() => sattOver(null)}
            onClick={() => valj?.(p.manad)}
          >
            <title>{`${p.datum} · ${p.namn}${p.utrustning ? ` · ${p.utrustning}` : ''}`}</title>
          </circle>
        ))}

        {/* Mitten: summan av året, eller det man pekar på. */}
        <circle cx={MITT} cy={MITT} r={PRICK_INRE - 10} className="hjul-mitt" />
        {over?.slag === 'post' ? (
          <>
            <text x={MITT} y={MITT - 14} className="hjul-mitt-rad">{over.p.datum}</text>
            <text x={MITT} y={MITT + 6} className="hjul-mitt-stor liten">{kapa(over.p.namn, 22)}</text>
            <text x={MITT} y={MITT + 26} className="hjul-mitt-rad">{kapa(over.p.utrustning || '', 24)}</text>
          </>
        ) : over?.slag === 'manad' ? (
          <>
            <text x={MITT} y={MITT - 10} className="hjul-mitt-stor">{over.m.poster.length}</text>
            <text x={MITT} y={MITT + 14} className="hjul-mitt-rad">
              {over.m.namn} {over.m.ar}
            </text>
          </>
        ) : (
          <>
            <text x={MITT} y={MITT - 10} className="hjul-mitt-stor">{totalt}</text>
            <text x={MITT} y={MITT + 12} className="hjul-mitt-rad">arbeten på ett år</text>
            {forsenade > 0 && (
              <text x={MITT} y={MITT + 32} className="hjul-mitt-rad fara">{forsenade} försenade</text>
            )}
          </>
        )}
      </svg>

      <div className="hjul-tecken">
        <span><i style={{ background: LAGEFARG.forsenad }} /> försenat</span>
        <span><i style={{ background: LAGEFARG.snart }} /> inom två veckor</span>
        <span><i style={{ background: LAGEFARG.kommande }} /> längre fram</span>
        <span><i className="kritisk" /> kritiskt</span>
        {!!band.length && <span><i className="band" /> högbelastning</span>}
      </div>
    </div>
  );
}

const kapa = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
