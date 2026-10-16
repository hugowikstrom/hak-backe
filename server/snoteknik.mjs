// Snöläggningsteknik: våtkula och klartecken. Rena funktioner, inga sidoeffekter.

/** Mättnadstryck över vatten, hPa (Magnus, giltig ca −45…60 °C). */
const mattnadstryck = (T) => 6.112 * Math.exp((17.62 * T) / (243.12 + T));

/**
 * Våtkulatemperatur (°C) ur lufttemperatur (°C) och relativ fuktighet (%).
 * Löser psykrometerekvationen e = es(Tw) − A·P·(T − Tw) med halvering.
 * Monotont i både temperatur och fuktighet, vilket Stulls polynom inte är
 * i de torra lägen vi ofta snölägger i.
 */
export function vatkula(temp, fukt, lufttryck_hPa = 1013.25) {
  if (temp == null || fukt == null || temp === '' || fukt === '') return null;
  const T = Number(temp);
  const R = Math.min(100, Math.max(0.5, Number(fukt)));
  if (!Number.isFinite(T) || !Number.isFinite(R)) return null;
  const A = 0.000662; // psykrometerkonstant, 1/K
  const e = (R / 100) * mattnadstryck(T);
  const avvikelse = (Tw) => mattnadstryck(Tw) - A * lufttryck_hPa * (T - Tw) - e;
  let lag = T - 40;
  let hog = T;
  for (let i = 0; i < 60; i++) {
    const mitt = (lag + hog) / 2;
    if (avvikelse(mitt) < 0) lag = mitt;
    else hog = mitt;
  }
  const svar = Math.round(((lag + hog) / 2) * 10) / 10;
  return svar === 0 ? 0 : svar; // undvik -0
}

const TRAPPA = [
  { gran: -10, niva: 'utmarkt', text: 'Utmärkta förhållanden. Full vattenmängd.', vatten: 100 },
  { gran: -7, niva: 'mycket_bra', text: 'Mycket bra. Kör på hög vattenmängd.', vatten: 90 },
  { gran: -5, niva: 'bra', text: 'Bra produktion. Normal vattenmängd.', vatten: 75 },
  { gran: -3.5, niva: 'ok', text: 'Produktion går. Håll nere vattenmängden.', vatten: 55 },
  { gran: -2.5, niva: 'marginellt', text: 'Marginellt. Minimal vattenmängd, bevaka kvaliteten.', vatten: 35 },
  { gran: Infinity, niva: 'nej', text: 'För varmt för snöläggning. Stäng av vattnet.', vatten: 0 },
];

/** Klartecken för snöläggning utifrån våtkula (°C). */
export function klartecken(vk) {
  if (vk == null) return { niva: 'okant', text: 'Saknar mätvärden.', vatten: null, vatkula: null };
  const t = TRAPPA.find((r) => vk < r.gran) ?? TRAPPA.at(-1);
  return { niva: t.niva, text: t.text, vatten: t.vatten, vatkula: vk };
}

/** Kompletterar en mätning med framräknad våtkula när den inte rapporterats. */
export function kompletteraMatning(m) {
  const vk = m.vatkula ?? vatkula(m.lufttemp, m.luftfukt);
  return { ...m, vatkula: vk, vatkula_beraknad: m.vatkula == null && vk != null, klartecken: klartecken(vk) };
}
