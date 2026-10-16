// Klubbmärket. En ritning, tre klienter.
//
// Motivet är hämtat ur Härnösands Alpinas emblem: skölden, vårdkasen på
// berget och en åkare i sväng. Under 36 px faller stegpinnarna bort – de
// blir ändå gröt – och kvar står skölden och åkaren.
//
// Färgerna styrs med --marke-fond (skölden) och --marke-motiv (figurerna),
// så att märket fungerar både på grön list och på vit yta.

export function Marke({ storlek = 32, fond, motiv, ...rest }) {
  const stil = {
    ...(fond ? { '--marke-fond': fond } : null),
    ...(motiv ? { '--marke-motiv': motiv } : null),
    display: 'block',
  };
  const skold = 'var(--marke-fond, #fff)';
  const figur = 'var(--marke-motiv, var(--klubb-ren, #8cc63f))';
  const SKOLD = 'M110 96 h268 a14 14 0 0 1 14 14 v146 c0 98 -62 160 -148 192 C 160 416, 96 354, 96 256 V 110 a14 14 0 0 1 14 -14 Z';
  const svg = (barn) => (
    <svg viewBox="0 0 512 512" width={storlek} height={storlek} aria-hidden="true" className="marke-svg" style={stil} {...rest}>
      <path d={SKOLD} fill={skold} />
      {barn}
    </svg>
  );

  // Under 28 px försvinner allt utom skölden och en åkare i grova drag.
  if (storlek < 28)
    return svg(
      <>
        <g stroke={figur} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M300 272 L252 300" strokeWidth="34" />
          <path d="M252 300 L260 336" strokeWidth="32" />
          <path d="M300 272 L240 234" strokeWidth="38" />
          <path d="M240 234 L180 246" strokeWidth="24" />
          <path d="M146 362 L312 320" strokeWidth="20" />
        </g>
        <circle cx="216" cy="210" r="28" fill={figur} />
      </>
    );

  // 28–44 px: vårdkasen utan stegpinnar och en nättare åkare. Luften gör
  // att motivet går att läsa i en lista eller en app-rubrik.
  if (storlek < 44)
    return svg(
      <>
        <g stroke={figur} strokeWidth="16" fill="none" strokeLinecap="round">
          <path d="M150 288 L184 150 L218 288" />
          <path d="M161 240 H207" />
        </g>
        <g stroke={figur} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M330 278 L298 296" strokeWidth="24" />
          <path d="M298 296 L304 320" strokeWidth="22" />
          <path d="M330 278 L288 252" strokeWidth="28" />
          <path d="M288 252 L250 260" strokeWidth="17" />
          <path d="M220 348 L338 320" strokeWidth="15" />
        </g>
        <circle cx="272" cy="236" r="20" fill={figur} />
      </>
    );

  // Hela märket: sköld, vårdkase med stegpinnar och åkare i sväng.
  return svg(
    <>
      <g stroke={figur} strokeWidth="12" fill="none" strokeLinecap="round">
        <path d="M148 286 L182 148 L216 286" />
        <path d="M160 236 H204" />
        <path d="M154 262 H210" />
        <path d="M168 204 H196" />
      </g>
      <g stroke={figur} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M330 276 L296 296" strokeWidth="26" />
        <path d="M296 296 L302 322" strokeWidth="24" />
        <path d="M330 276 L286 248" strokeWidth="30" />
        <path d="M286 248 L244 256" strokeWidth="18" />
        <path d="M214 348 L336 318" strokeWidth="14" />
        <path d="M222 364 L344 334" strokeWidth="14" />
      </g>
      <circle cx="268" cy="230" r="21" fill={figur} />
    </>
  );
}
