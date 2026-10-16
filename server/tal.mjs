// Tal till text via husets egen STT-router. Ljudet lämnar aldrig maskinen.
const URL_STT = process.env.HAK_STT_URL || 'http://127.0.0.1:8115/v1/audio/transcriptions';
const MODELL = process.env.HAK_STT_MODELL || 'kb-sv';

export const talPa = () => !!URL_STT;

/**
 * Skickar ljudet till routern och får tillbaka ett ordagrant transkript.
 * Faller tillbaka på null – då får idén ligga kvar som ren inspelning.
 */
export async function transkribera(bytes, filnamn = 'ide.webm') {
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes]), filnamn);
    form.append('model', MODELL);
    form.append('language', 'sv');
    form.append('response_format', 'json');
    const svar = await fetch(URL_STT, { method: 'POST', body: form, signal: AbortSignal.timeout(180000) });
    if (!svar.ok) throw new Error(`STT svarade ${svar.status}: ${(await svar.text()).slice(0, 200)}`);
    const data = await svar.json();
    const text = (data.text || data.transcript || '').trim();
    return { text: text || null, fel: text ? null : 'Tomt transkript' };
  } catch (e) {
    return { text: null, fel: String(e.message || e) };
  }
}
