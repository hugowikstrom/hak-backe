// Bekräftelsen av en talad rapport.
//
// Delad av driftjournalens utkastflik och av talrutan i listen: samma
// rapport ska granskas på samma sätt oavsett var inspelningen började.
//
// Det som sparas är människans text, inte modellens. Förslaget ligger kvar
// oförändrat vid sidan om, och en obekräftad post är inte dokumentation.
import { useState } from 'react';
import { api } from '../api.js';
import { Falt, useHamta, useNotis, Val } from './bitar.jsx';

export function Bekrafta({ post, klar }) {
  const notis = useNotis();
  const f = post.forslag || {};
  const [text, sattText] = useState(
    [f.observation, f.atgard && `Åtgärd: ${f.atgard}`].filter(Boolean).join('\n') || post.transkript || ''
  );
  const [arende, sattArende] = useState(!!f.forslag_arende);
  const [sparar, sattSparar] = useState(false);
  const utrustning = useHamta(() => api.hamta('/api/utrustning'));
  const [utrId, sattUtrId] = useState(post.utrustning_id ? String(post.utrustning_id) : '');

  const skicka = async () => {
    sattSparar(true);
    try {
      await api.skapa(`/api/drift/journal/${post.id}/bekrafta`, {
        text,
        utrustning_id: utrId ? Number(utrId) : null,
        matvarden: f.matvarden || {},
        skapa_arende: arende,
        arende_titel: arende ? (f.sammanfattning || text).slice(0, 160) : null,
        allvarlighet: f.allvarlighet || null,
      });
      klar();
    } catch (e) {
      notis(e.message, 'fel');
      sattSparar(false);
    }
  };

  return (
    <>
      {post.transkript && (
        <blockquote className="citat">
          <span className="liten svag">Ordagrant</span>
          {post.transkript}
        </blockquote>
      )}
      {post.ljudfil && (
        <audio controls src={`/api/drift/journal/${post.id}/ljud`} style={{ width: '100%', margin: '0 0 12px' }} />
      )}
      {f.valj_utrustning && (
        <div className="meddelande varning">
          {f.namnda?.length > 1
            ? `Flera objekt nämndes: ${f.namnda.map((u) => u.namn).join(', ')}. Välj vilket rapporten gäller.`
            : `Tolkningen hörde ”${f.utrustning}” men kunde inte avgöra vilken utrustning det var. Välj själv.`}
        </div>
      )}

      <Val
        etikett="Utrustning"
        varde={utrId}
        satt={sattUtrId}
        tomtext="– ingen särskild –"
        poster={(utrustning.data || []).map((u) => ({ varde: String(u.id), text: u.namn }))}
      />
      <Falt etikett="Det som ska stå i journalen">
        <textarea value={text} onChange={(e) => sattText(e.target.value)} rows={5} />
      </Falt>

      {!!Object.keys(f.matvarden || {}).length && (
        <div className="meddelande info">
          Mätvärden ur talet sparas som manuellt rapporterade:{' '}
          {Object.entries(f.matvarden).map(([n, v]) => `${n} ${v}`).join(', ')}
        </div>
      )}

      <label className="kryssrad">
        <input type="checkbox" checked={arende} onChange={(e) => sattArende(e.target.checked)} />
        Skapa ett ärende av det här
      </label>

      <div className="knapprad">
        <button className="primar" onClick={skicka} disabled={sparar}>
          {sparar ? 'Sparar …' : 'Bekräfta och journalför'}
        </button>
      </div>
    </>
  );
}
