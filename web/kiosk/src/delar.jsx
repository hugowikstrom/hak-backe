// Byggstenar för kiosken.
export { Marke } from '../../delad/marke.jsx';

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
export const STATUSFARG = { ny: 'varning', betald: 'ok', tillagas: 'varning', klar: 'ok', hamtad: '', avbruten: '' };
