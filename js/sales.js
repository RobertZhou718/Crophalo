// A rough money figure for a crop, kept honest: the value of a typical harvest from one hectare = the country's average yield (FAOSTAT) × the crop's latest world price
// (the World Bank's monthly Pink Sheet), shown in the farmer's currency through js/currency.js. It is NEVER the farmer's income: it is the world price, not the local one;
// the country's average yield, not the field's; with no costs taken off. Every assumption is written out with the figure, and a figure that cannot be made says why instead.
// Pure: the two lookups' answers go in, words and numbers come out. No page, no storage, no network, no clock. Checked by scripts/test_sales.mjs.
import { convert, fxNote, isCode } from './currency.js';
import { plainReason } from './satellites2-data.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthWords = ym => { const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '')); return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const num = (v, d = 2) => Number(v).toLocaleString('en-CA', { maximumFractionDigits: d });
// Units the Pink Sheet is read in here: US dollars per tonne, or per kilogram (a thousand to the tonne). Anything else is not turned into a tonne price.
const PER_TONNE = { '$/mt': 1, '$/kg': 1000 };
// A figure kept to two significant digits: a rough figure must not look exact. 1,953 becomes 1,950; 86,740 becomes 87,000.
export const roughly = v => { if (!Number.isFinite(v) || v <= 0) return NaN; const p = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
// A figure already in its own currency, written with its symbol and no cents (js/currency.js converts from US dollars; this only writes what is already converted).
export function fmt(value, code) { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(value); } catch { return `${code} ${Math.round(value)}`; } }
export const possessive = name => (/s$/.test(name) ? `${name}'` : `${name}'s`);

// Where a source's crop is not quite the crop on the screen, the figure says so.
const CROP_NOTES = { wheat: "The yield is for all wheat together, spring and winter; the price is for hard red winter wheat.", corn: 'The yield and the price are for grain maize, not silage or sweet corn.' };

// What the figure rests on, as plain sentences; they are shown with every figure.
export function assumptions({ country, cropName, yieldInfo, price, currency, rates, notOfficial, cropId }) {
  const out = [
    `World price, not your local price: the ${monthWords(price.month)} world market price of ${cropName.toLowerCase()} (${price.seriesName}), US$${num(price.usdPerTonne, 1)} a tonne.`,
    `${cap(possessive(country))} average yield, not your field's: ${num(yieldInfo.tPerHa)} tonnes a hectare, ${yieldInfo.years} (FAOSTAT).`,
    'No costs taken off: seed, fertiliser, fuel, machinery, labour and land are not counted.',
    'No selling costs, transport, quality or contract prices, and no yield loss: a typical harvest, sold at the world price.',
    'Not your income and not a forecast: prices move every month.',
  ];
  if (cropId && Object.hasOwn(CROP_NOTES, cropId)) out.push(CROP_NOTES[cropId]);
  if (notOfficial) out.push('FAO marks this yield as an estimate, not an official national figure.');
  out.push(fxNote(currency, rates));
  return out;
}

// The world price of a crop from the prices lookup's answer, or the reason there is none. Never a guess.
export function priceOf(prices, cropId) {
  if (!prices || prices.ok === false) return { ok: false, reason: plainReason(prices?.reason, '') ? `World prices could not be read: ${plainReason(prices.reason, '')}` : 'World prices did not answer.' };
  const s = prices.series && Object.hasOwn(prices.series, cropId) ? prices.series[cropId] : null;
  if (!s) return { ok: false, reason: `The World Bank's price sheet has no world price for ${cropId}.`, noPrice: true };
  if (s.proxy) return { ok: false, reason: `The World Bank's price sheet has no price for ${cropId} itself, only for a product made from it, so no figure is shown.`, noPrice: true };
  if (s.stale) return { ok: false, reason: `The World Bank stopped updating the ${cropId} price after ${monthWords(s.latest?.month)}, so it is too old to use.`, noPrice: true };
  const k = Object.hasOwn(PER_TONNE, s.unit) ? PER_TONNE[s.unit] : null, v = s.latest?.value;
  if (k === null || !Number.isFinite(v) || v <= 0) return { ok: false, reason: `The price of ${cropId} is not in a unit this figure can use.`, noPrice: true };
  return { ok: true, usdPerTonne: Math.round(v * k * 10) / 10, month: s.latest.month, seriesName: s.name, unit: s.unit, changePct: s.change_pct ?? null };
}
// A country's national yield of a crop from the FAOSTAT lookup's answer, or the reason there is none.
export function yieldOf(faostat, country, cropId) {
  if (!faostat || faostat.ok === false) return { ok: false, reason: plainReason(faostat?.reason, '') ? `National yields could not be read: ${plainReason(faostat.reason, '')}` : 'National yields did not answer.' };
  const c = faostat.countries && Object.hasOwn(faostat.countries, country) ? faostat.countries[country] : null;
  if (!c) return { ok: false, reason: `FAOSTAT has no crop figures for the country with code ${String(country).slice(0, 3)}.`, noYield: true };
  const y = c.yield && Object.hasOwn(c.yield, cropId) ? c.yield[cropId] : null;
  if (!Array.isArray(y) || !Number.isFinite(y[0]) || y[0] <= 0) return { ok: false, reason: `FAOSTAT has no national yield for ${cropId} in ${c.name}.`, noYield: true };
  return { ok: true, tPerHa: y[0], years: String(y[1]), country: c.name, notOfficial: Array.isArray(c.not_official) && c.not_official.includes(cropId), farmGate: c.price && Object.hasOwn(c.price, cropId) ? { usdPerTonne: c.price[cropId][0], year: c.price[cropId][1] } : null };
}

// The rough value of one hectare. opts: {prices, faostat, currency ('USD' by default), rates (js/currency.js), cropName}.
export function roughValue(cropId, country, { prices, faostat, currency = 'USD', rates = null, cropName } = {}) {
  const name = cropName || cap(String(cropId));
  const p = priceOf(prices, cropId), y = yieldOf(faostat, country, cropId);
  if (!p.ok || !y.ok) return { ok: false, crop: cropId, reason: !p.ok ? p.reason : y.reason, missing: [!p.ok && 'price', !y.ok && 'yield'].filter(Boolean) };
  const usd = p.usdPerTonne * y.tPerHa, code = isCode(currency) ? currency : 'USD';
  const local = code === 'USD' ? usd : convert(usd, code, rates);
  const shown = Number.isFinite(local) ? code : 'USD', shownValue = Number.isFinite(local) ? local : usd;   // no rate: it stays in US dollars, and says so
  const rough = roughly(shownValue), roughUsd = roughly(usd);
  if (!Number.isFinite(rough)) return { ok: false, crop: cropId, reason: 'The figure could not be worked out.', missing: [] };
  const lines = assumptions({ country: y.country, cropName: name, yieldInfo: y, price: p, currency: shown, rates, notOfficial: y.notOfficial, cropId });
  const text = fmt(rough, shown);
  return {
    ok: true, crop: cropId, country, currency: shown, perHaUsd: roughUsd, perHa: rough,
    price: { usdPerTonne: p.usdPerTonne, month: p.month, source: 'World Bank Pink Sheet', series: p.seriesName, changePct: p.changePct },
    yield: { tPerHa: y.tPerHa, years: y.years, source: 'FAOSTAT', country: y.country, notOfficial: y.notOfficial },
    farmGate: y.farmGate ? { usdPerTonne: y.farmGate.usdPerTonne, year: y.farmGate.year, source: 'FAOSTAT Producer Prices' } : null,
    chip: `About ${text} a hectare`,
    headline: `${name}: about ${text} a hectare at the world price`,
    caution: 'A rough guide to what a typical hectare of this crop could be worth at the world price. It is not your income.',
    assumptions: lines,
    asOf: { price: monthWords(p.month), yield: y.years },
    sources: [{ name: 'World Bank Commodity Price Data (The Pink Sheet)', note: `${monthWords(p.month)}, ${p.seriesName}` }, { name: 'FAOSTAT, FAO of the United Nations', note: `national yield ${y.years}` }],
  };
}
// The rough total for an area: the per-hectare figure times the hectares, rounded the same way, with the same caution.
export function forArea(result, hectares) {
  if (!result?.ok || !Number.isFinite(hectares) || hectares <= 0) return null;
  const total = roughly(result.perHa * hectares), text = fmt(total, result.currency);
  return { total, currency: result.currency, text, words: `About ${text} for ${num(hectares, 1)} ha at the world price: not your income.` };
}
// Two crops side by side (the current plan's crop and the proposed one): each figure, and how they stand, in words that never say which one "pays".
export function compareCrops(a, b) {
  if (!a?.ok || !b?.ok) return { ok: false, reason: !a?.ok ? a?.reason : b?.reason };
  if (a.currency !== b.currency) return { ok: false, reason: 'The two figures are in different currencies.' };
  const gap = b.perHa - a.perHa, rel = a.perHa ? Math.abs(gap) / a.perHa : NaN;
  const words = rel < 0.1
    ? `At world prices and national average yields the two come to about the same per hectare (${fmt(a.perHa, a.currency)} and ${fmt(b.perHa, b.currency)}).`
    : `At world prices and national average yields, ${b.crop} comes to about ${fmt(b.perHa, b.currency)} a hectare and ${a.crop} about ${fmt(a.perHa, a.currency)}: ${gap > 0 ? 'higher' : 'lower'} by about ${Math.round(rel * 100 / 5) * 5}%. Costs are not counted, so this says nothing about profit.`;
  return { ok: true, gap, words };
}
