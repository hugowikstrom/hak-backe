// Byggstenar för kiosken.
export const Marke = ({ storlek = 34 }) => (
  <svg viewBox="0 0 512 512" width={storlek} height={storlek} aria-hidden="true">
    <path d="M110 96 h268 a14 14 0 0 1 14 14 v146 c0 98 -62 160 -148 192 C 160 416, 96 354, 96 256 V 110 a14 14 0 0 1 14 -14 Z" fill="#fff" />
    <g stroke="var(--gron)" strokeWidth="12" fill="none" strokeLinecap="round">
      <path d="M148 286 L182 148 L216 286" /><path d="M160 236 H204" /><path d="M154 262 H210" /><path d="M168 204 H196" />
    </g>
    <g stroke="var(--gron)" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M330 276 L296 296" strokeWidth="26" /><path d="M296 296 L302 322" strokeWidth="24" />
      <path d="M330 276 L286 248" strokeWidth="30" /><path d="M286 248 L244 256" strokeWidth="18" />
      <path d="M214 348 L336 318" strokeWidth="14" /><path d="M222 364 L344 334" strokeWidth="14" />
    </g>
    <circle cx="268" cy="230" r="21" fill="var(--gron)" />
  </svg>
);

export const Bricka = ({ farg = '', children }) => <span className={`bricka ${farg}`}>{children}</span>;

export const Falt = ({ etikett, children }) => (
  <label className="falt">
    <span>{etikett}</span>
    {children}
  </label>
);

export const STATUSTEXT = {
  ny: 'Mottagen – vi väntar på betalning',
  betald: 'Betald – vi börjar laga',
  tillagas: 'Tillagas just nu',
  klar: 'Klar att hämta i luckan',
  hamtad: 'Hämtad. Smaklig måltid!',
  avbruten: 'Avbruten',
};
export const STATUSFARG = { ny: 'gul', betald: 'gron', tillagas: 'gul', klar: 'gron', hamtad: '', avbruten: '' };
