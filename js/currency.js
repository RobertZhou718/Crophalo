// Crophalo's currencies: crop prices are published in US dollars; the farmer may see them in one of eight currencies, converted at the day's central-bank reference rate from Frankfurter.
// Pure: cleanRates(), convert(), money(), fxNote(). loadRates() asks Frankfurter once and keeps the answer 12 hours on this device; a failure leaves everything in US dollars, said plainly.
// Checked by scripts/test_pages.mjs (the rates' shape, the note's three sentences, money formatting, a hostile answer).
export const CURRENCIES = Object.freeze([['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['CAD', 'Canadian dollar'], ['TRY', 'Turkish lira'], ['AUD', 'Australian dollar'], ['INR', 'Indian rupee'], ['BRL', 'Brazilian real']]);
export const CODES = Object.freeze(CURRENCIES.map(c => c[0])), RATES_KEY = 'crophalo.fx.v1', KEEP_MS = 12 * 3600e3;
export const fxUrl = () => `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CODES.filter(c => c !== 'USD').join(',')}`;
export const isCode = v => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
// Frankfurter's answer rebuilt: { date, rates: { EUR: 0.92, ... } } for the known codes only; null when it cannot be used.
export function cleanRates(raw) {
  if (!raw || typeof raw !== 'object' || raw.base !== 'USD' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date ?? '') || !raw.rates || typeof raw.rates !== 'object') return null;
  const rates = { USD: 1 };
  for (const code of CODES) if (code !== 'USD' && Object.hasOwn(raw.rates, code) && typeof raw.rates[code] === 'number' && raw.rates[code] > 0 && raw.rates[code] < 1e6) rates[code] = raw.rates[code];
  return Object.keys(rates).length > 1 ? { date: raw.date, rates } : null;
}
export const convert = (usd, code, rates) => typeof usd === 'number' && Number.isFinite(usd) ? usd * (code === 'USD' ? 1 : rates?.rates?.[code] ?? NaN) : NaN;
export function money(usd, code, rates, locale = 'en-US') {
  const v = convert(usd, code, rates), c = Number.isFinite(v) ? code : 'USD', n = Number.isFinite(v) ? v : usd;
  if (!Number.isFinite(n)) return '';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }).format(n); } catch { return `US$${Math.round(usd)}`; }
}
export function fxNote(code, rates) {
  if (!isCode(code) || code === 'USD') return 'Amounts are in US dollars.';
  const r = rates?.rates?.[code];
  return r ? `Shown in ${code}, converted from US dollars at 1 US$ = ${r < 10 ? r.toFixed(2) : r.toFixed(1)} ${code}. Exchange rates from the European Central Bank, via Frankfurter, ${rates.date}.` : 'Exchange rates could not be read, so amounts stay in US dollars.';
}
export function readRates(storage = globalThis.localStorage, now = Date.now()) {
  try { const kept = JSON.parse(storage.getItem(RATES_KEY)), rates = cleanRates(kept?.rates); return rates && Number.isFinite(kept.at) && now - kept.at >= 0 && now - kept.at < KEEP_MS ? rates : null; } catch { return null; }
}
export async function loadRates(get = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage, now = Date.now()) {
  const kept = readRates(storage, now);
  if (kept) return kept;
  try {
    const rates = cleanRates(await (await get(fxUrl())).json());
    if (rates) try { storage.setItem(RATES_KEY, JSON.stringify({ at: now, rates: { base: 'USD', date: rates.date, rates: rates.rates } })); } catch { /* a full store costs only the keeping */ }
    return rates;
  } catch { return null; }
}
