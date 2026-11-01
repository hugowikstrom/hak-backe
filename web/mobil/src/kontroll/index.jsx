// Kontrollvyn: en egen navigation över samma data.
//
// Väljs av värdnamnet och går att slå av och på under Konto. Allt under
// huven är Backis – samma API, samma offlinekö, samma inloggning. Det
// som skiljer är vägen in.
//
// Navigationen är en stack, inte en router: varje steg lägger sig på
// föregående och bakåtpilen tar bort det översta. Det är så förlagan
// beter sig, och det är enda sättet att komma fyra nivåer ned utan att
// tappa vad man valde på väg dit.
import { useState } from 'react';
import { api } from '../api.js';
import { useHamta } from '../delar.jsx';
import { Hero, Skal } from './skal.jsx';
import { Hem } from './hem.jsx';
import { Arenden, Pagaende } from './arenden.jsx';
import { NyMeny } from './ny.jsx';
import {
  Dokument, Dokumentlista, Dokumentstallen, Enheter, Genvagar, Incident, Incidenter,
  Pafyllning, Ronder,
} from './vyer.jsx';
import {
  Aktivitet, AllaAvvikelser, Avvikelse, Avvikelser, Besiktningar, Enhet, Enhetsdokument, Vatskor,
} from './enhet.jsx';
import { Kontrollval } from './kontrollval.jsx';
import { NyAvvikelse } from './nyavvikelse.jsx';
import { Service } from './service.jsx';
import { Korning } from './korning.jsx';
import './stil.css';

/**
 * Rubriken i toppen. Står `null` tar vyn objektets eget namn – en
 * enhetsvy heter "Stora liften", inte "Enhet".
 */
const TITLAR = {
  avvikelser: 'Avvikelser', enheter: 'Enheter', ronder: 'Ronder', dokument: 'Dokument',
  incidenter: 'Incidenter', genvagar: 'Genvägar', dokumentlista: 'Dokument',
  dokumentstallen: 'Arbetsställen',
  kontrollval: 'Checklistor', vatskor: 'Vätsketyper', besiktningar: 'Besiktningar',
  enhetsavvikelser: 'Avvikelser',
  aktivitet: 'Aktivitet', enhetsdokument: 'Dokument', pafyllning: 'Påfyllning',
  nyavvikelse: 'Ny avvikelse', incident: 'Incident', service: 'Service', korning: 'Kontroll',
  avvikelse: null, enhet: null, rondobjekt: null,
};

const VYER = {
  enheter: Enheter,
  ronder: Ronder,
  enhet: Enhet,
  rondobjekt: Enhet,
  avvikelser: AllaAvvikelser,
  enhetsavvikelser: Avvikelser,
  avvikelse: Avvikelse,
  nyavvikelse: NyAvvikelse,
  kontrollval: Kontrollval,
  vatskor: Vatskor,
  besiktningar: Besiktningar,
  aktivitet: Aktivitet,
  enhetsdokument: Enhetsdokument,
  dokument: Dokument,
  dokumentstallen: Dokumentstallen,
  dokumentlista: Dokumentlista,
  incidenter: Incidenter,
  incident: Incident,
  genvagar: Genvagar,
  pafyllning: Pafyllning,
  service: Service,
  korning: Korning,
};

export function Kontrollvy({ medlem, forening, meny }) {
  const [flik, sattFlik] = useState('hem');
  const [stack, sattStack] = useState([]);
  const [nyOppen, sattNyOppen] = useState(false);
  const arenden = useHamta(() => api.hamta('/api/kontroll/arenden'));
  const antal = (arenden.data?.data || arenden.data || {}).antal || {};

  const vy = stack[stack.length - 1] || null;
  // Siffrorna i toppen hämtas om så fort man är tillbaka på startskärmen.
  // Den som just registrerat en avvikelse ska se att den räknades.
  const tillbaka = () => {
    if (stack.length <= 1) arenden.uppdatera();
    sattStack((s) => s.slice(0, -1));
  };
  const ga = (namn, extra = {}) => {
    if (namn === 'tillbaka') return tillbaka();
    sattStack((s) => [...s, { namn, ...extra }]);
  };
  const hem = () => {
    sattStack([]);
    sattFlik('hem');
    arenden.uppdatera();
  };

  const innehall = () => {
    if (vy) {
      const Vy = VYER[vy.namn];
      return Vy ? <Vy vy={vy} ga={ga} /> : <p className="svag">Den vyn är inte byggd ännu.</p>;
    }
    if (flik === 'arenden') return <Arenden ga={ga} />;
    if (flik === 'pagaende') return <Pagaende ga={ga} />;
    return <Hem ga={ga} antal={antal} />;
  };

  const titel = vy ? (TITLAR[vy.namn] ?? vy.objekt?.namn ?? vy.arende?.titel ?? null) : null;

  /**
   * "+ Ny" leder dit registreringen hör hemma. De som gäller en enhet
   * går via trappan – att välja maskin först är hela skillnaden mellan
   * en avvikelse som går att åtgärda och en som ingen hittar.
   */
  const nyval = (vad, slag) => {
    if (vad === 'avvikelse' || vad === 'ravvikelse') return ga('nyavvikelse');
    if (vad === 'incident') return ga('incidenter');
    if (vad === 'pafyllning') return ga('enheter', { efterval: 'pafyllning', slag });
    if (vad === 'service') return ga('enheter', { efterval: 'service' });
    if (vad === 'rkontroll') return ga('ronder', { efterval: 'kontrollval' });
    return ga('enheter', { efterval: 'kontrollval' });
  };

  return (
    <>
      <Skal
        flik={flik}
        sattFlik={(f) => {
          sattStack([]);
          sattFlik(f);
        }}
        titel={titel}
        tillbaka={vy ? tillbaka : null}
        antal={antal.avvikelse}
        meny={meny}
        hem={vy || flik !== 'hem' ? hem : null}
        hero={
          !vy && flik === 'hem' ? (
            <Hero
              namn={medlem?.namn || 'Inloggad'}
              forening={forening?.namn || ''}
              onNy={() => sattNyOppen(true)}
            />
          ) : null
        }
      >
        {innehall()}
      </Skal>
      {nyOppen && (
        <NyMeny
          stang={() => sattNyOppen(false)}
          valj={nyval}
        />
      )}
    </>
  );
}
