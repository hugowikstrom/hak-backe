// SMS via 46elks. Allt loggas i smslogg, även när sändningen är avstängd –
// klubben ska kunna se exakt vad som gått ut till en kund.
import { kor, spara } from './db.mjs';
import { normaliseraMobil } from './pengar.mjs';

const ANVANDARE = process.env.HAK_46ELKS_ANVANDARE || null;
const LOSEN = process.env.HAK_46ELKS_LOSEN || null;
import { instans } from './foreningar.mjs';

const FRAN = () => instans('sms_fran', process.env.HAK_SMS_FRAN || 'HAKbacken');

export const smsPa = () => !!(ANVANDARE && LOSEN);

export async function skickaSms({ till, text, slag = 'ovrigt' }) {
  const nummer = normaliseraMobil(till);
  const id = spara('smslogg', { till: nummer || String(till || ''), text, slag });
  if (!nummer) {
    kor('UPDATE smslogg SET fel=? WHERE id=?', 'ogiltigt mobilnummer', id);
    return { id, skickat: false, fel: 'ogiltigt mobilnummer' };
  }
  if (!smsPa()) {
    kor('UPDATE smslogg SET fel=? WHERE id=?', 'sms avstängt (saknar 46elks-nycklar)', id);
    return { id, skickat: false, fel: 'sms avstängt' };
  }
  try {
    const svar = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${ANVANDARE}:${LOSEN}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ from: FRAN(), to: nummer, message: text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!svar.ok) throw new Error(`46elks svarade ${svar.status}: ${(await svar.text()).slice(0, 120)}`);
    kor("UPDATE smslogg SET skickat=datetime('now') WHERE id=?", id);
    return { id, skickat: true };
  } catch (e) {
    kor('UPDATE smslogg SET fel=? WHERE id=?', String(e.message || e), id);
    return { id, skickat: false, fel: String(e.message || e) };
  }
}
