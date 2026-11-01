// Registrera utförd service på en maskin.
//
// Fälten är de som faktiskt efterfrågas när något skruvats: vad som
// gjordes, när, och mätarställningen. Timmar och kostnad är frivilliga
// – de hör till bokslutet, inte till backen, och ett krav på dem är ett
// skäl att låta bli att registrera.
import { useState } from 'react';
import { api } from '../api.js';
import { useNotis } from '../delar.jsx';
import { Nasta } from './valj.jsx';

const idag = () => new Date().toISOString().slice(0, 10);

export function Service({ vy, ga }) {
  const notis = useNotis();
  const objekt = vy.objekt;
  const [f, sattF] = useState({
    namn: '', utford: idag(), drifttimmar: '', arbetstimmar: '', kostnad: '', anteckning: '',
  });
  const [arbetar, sattArbetar] = useState(false);
  const satt = (k) => (v) => sattF((g) => ({ ...g, [k]: v }));
  const tal = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));

  const spara = async () => {
    if (!f.namn.trim()) return notis('Skriv vad som gjordes.', 'fel');
    sattArbetar(true);
    try {
      await api.skapa('/api/kontroll/service', {
        utrustning_id: objekt.id,
        namn: f.namn.trim(),
        utford: f.utford,
        drifttimmar: tal(f.drifttimmar),
        arbetstimmar: tal(f.arbetstimmar),
        kostnad_ore: f.kostnad === '' ? 0 : Math.round(tal(f.kostnad) * 100),
        anteckning: f.anteckning || null,
      });
      notis('Servicen registrerad.');
      ga('tillbaka');
    } catch (e) {
      notis(e.message, 'fel');
    } finally {
      sattArbetar(false);
    }
  };

  const falt = (nyckel, etikett, extra = {}) => (
    <label className="kv-falt">
      <span>{etikett}</span>
      <input className="kv-valj" value={f[nyckel]}
        onChange={(e) => satt(nyckel)(e.target.value)} {...extra} />
    </label>
  );

  return (
    <>
      <p style={{ margin: '0 0 12px' }}>{objekt?.namn}</p>
      {falt('namn', 'Vad gjordes *', { placeholder: 'Oljebyte, bytt slang, justerad lina …' })}
      {falt('utford', 'Datum', { type: 'date' })}
      {falt('drifttimmar', 'Mätarställning', { inputMode: 'decimal', placeholder: 'drifttimmar' })}
      {falt('arbetstimmar', 'Arbetstimmar', { inputMode: 'decimal', placeholder: 'frivilligt' })}
      {falt('kostnad', 'Kostnad (kr)', { inputMode: 'decimal', placeholder: 'delar och köpt tjänst' })}
      <label className="kv-falt">
        <span>Anteckning</span>
        <textarea className="kv-valj kv-omrade" rows={3} value={f.anteckning}
          onChange={(e) => satt('anteckning')(e.target.value)} />
      </label>
      <Nasta pa={!arbetar} onClick={spara} text="Spara" />
    </>
  );
}
