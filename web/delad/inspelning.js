// Mikrofonen, delad av idélådan och driftjournalen.
//
// Hooken sköter bara inspelningen: den lämnar tillbaka ljudet som data-URL
// och håller reda på hur länge det spelats. Vad ljudet blir avgör sidan.
import { useEffect, useRef, useState } from 'react';

export function useInspelning() {
  const [spelar, sattSpelar] = useState(false);
  const [ljud, sattLjud] = useState(null);
  const [sekunder, sattSekunder] = useState(0);
  const [fel, sattFel] = useState(null);
  const inspelare = useRef(null);
  const bitar = useRef([]);
  const klocka = useRef(null);

  // Mikrofonen måste släppas även om sidan byts mitt i en inspelning.
  useEffect(
    () => () => {
      clearInterval(klocka.current);
      if (inspelare.current?.state === 'recording') inspelare.current.stop();
    },
    []
  );

  const starta = async () => {
    sattFel(null);
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: true });
      const spelare = new MediaRecorder(strom);
      bitar.current = [];
      spelare.ondataavailable = (e) => e.data.size && bitar.current.push(e.data);
      spelare.onstop = () => {
        const blob = new Blob(bitar.current, { type: spelare.mimeType || 'audio/webm' });
        const lasare = new FileReader();
        lasare.onload = () => sattLjud(lasare.result);
        lasare.readAsDataURL(blob);
        for (const spar of strom.getTracks()) spar.stop();
      };
      spelare.start();
      inspelare.current = spelare;
      sattSpelar(true);
      sattSekunder(0);
      klocka.current = setInterval(() => sattSekunder((s) => s + 1), 1000);
    } catch (e) {
      sattFel(`Mikrofonen gick inte att starta: ${e.message}`);
    }
  };

  const stoppa = () => {
    inspelare.current?.stop();
    clearInterval(klocka.current);
    sattSpelar(false);
  };

  const nollstall = () => {
    sattLjud(null);
    sattSekunder(0);
    sattFel(null);
  };

  return { spelar, ljud, sekunder, fel, starta, stoppa, nollstall, finns: !!navigator.mediaDevices };
}

export const klockslag = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
