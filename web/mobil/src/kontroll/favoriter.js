// Favoriter: stjärnorna i väljarna och i kontrollistan.
//
// Ligger i telefonen, inte på servern. En favorit säger "det här är
// mina maskiner" och det är en egenskap hos den som håller i telefonen,
// inte hos klubben. Den som lånar någon annans telefon ska inte få
// deras stjärnor, och den som byter telefon förlorar inget som betyder
// något.
import { useCallback, useEffect, useState } from 'react';

const NYCKEL = 'hak-favoriter';

const las = () => {
  try {
    return JSON.parse(localStorage.getItem(NYCKEL) || '{}');
  } catch {
    return {};
  }
};

/**
 * @param {string} slag  vad stjärnorna gäller: 'stalle', 'enhet', 'mall'
 * @returns {[ (id) => boolean, (id) => void ]}
 */
export function useFavoriter(slag) {
  const [alla, sattAlla] = useState(las);

  // Flera vyer kan ha stjärnor uppe samtidigt – de ska inte glida isär.
  useEffect(() => {
    const vid = () => sattAlla(las());
    window.addEventListener('hak-favoriter', vid);
    window.addEventListener('storage', vid);
    return () => {
      window.removeEventListener('hak-favoriter', vid);
      window.removeEventListener('storage', vid);
    };
  }, []);

  const favorit = useCallback((id) => (alla[slag] || []).includes(id), [alla, slag]);

  const vaxla = useCallback(
    (id) => {
      const nu = las();
      const lista = nu[slag] || [];
      nu[slag] = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
      localStorage.setItem(NYCKEL, JSON.stringify(nu));
      sattAlla(nu);
      window.dispatchEvent(new Event('hak-favoriter'));
    },
    [slag]
  );

  return [favorit, vaxla];
}
