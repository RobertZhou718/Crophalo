// Crophalo's rough money figure for a rotation plan: the world price of each crop in the plan (the World Bank's monthly Pink Sheet) times the country's average yield (FAOSTAT), averaged over the plan's years,
// shown in the farmer's currency. It is a rough value of a typical harvest and nothing more: world price not local, national yield not the field's, no costs taken off. A crop with no usable price or yield,
// a stand-in price, a stale price or an unread lookup gives NO figure for the plan, and the reason is kept. Every figure is rounded to two significant digits so it never looks exact. Pure but for loadMoney (two fetches). The per-crop arithmetic and the price/yield checks are js/sales.js; the words are in js/money-view.js.
// Checked by scripts/test_money.mjs on the real answers recorded from the World Bank and FAOSTAT on 14 November 2026.
import { roughValue, roughly, monthWords } from './sales.js';
import { once } from './memo.js';
import { cropName } from './crops.js';

export const MONEY_DOWN = 'The world price lookup did not answer, so no money figure is shown.';
const ACRES_PER_HA = 2.4710538147;
const name = id => { try { return cropName(id, true) || String(id); } catch { return String(id); } };
const mean = list => list.reduce((s, v) => s + v, 0) / list.length;

// One plan: { ok: true, perHa, currency, crops: [{ crop, name, fig }], years, priceMonths: [..], yieldYears: [..], country } or { ok: false, reason, crop? }.
export function planFigure(plan, country, { prices, faostat, currency = 'USD', rates = null } = {}) {
  const seasons = Array.isArray(plan?.seasons) ? plan.seasons.filter(s => s && typeof s.crop === 'string') : [];
  if (!seasons.length) return { ok: false, reason: 'This plan has no crops to put a figure on.' };
  const figs = [];
  for (const s of seasons) {
    const fig = roughValue(s.crop, country, { prices, faostat, currency, rates, cropName: name(s.crop) });
    if (!fig.ok) return { ok: false, reason: `${name(s.crop)}: ${fig.reason}`, crop: s.crop, missing: fig.missing };
    figs.push({ crop: s.crop, name: name(s.crop), fig });
  }
  const code = figs[0].fig.currency;
  if (figs.some(f => f.fig.currency !== code)) return { ok: false, reason: 'The figures are in different currencies, so none is shown.' };
  const perHa = roughly(mean(figs.map(f => f.fig.perHa)));
  if (!Number.isFinite(perHa)) return { ok: false, reason: 'The figure could not be worked out.' };
  const uniq = list => [...new Set(list)];
  return { ok: true, perHa, perAcre: roughly(perHa / ACRES_PER_HA), currency: code, crops: figs, years: seasons.length, country: figs[0].fig.yield.country,
    priceMonths: uniq(figs.map(f => f.fig.price.month)), yieldYears: uniq(figs.map(f => f.fig.yield.years)) };
}
// Every plan of an answer: a map from the plan's own id to its figure.
export function moneyFor(result, country, opts) {
  const out = {};
  if (!result?.current) return out;
  for (const p of [result.current, result.recommended, ...(Array.isArray(result.others) ? result.others : [])]) if (p && typeof p.id === 'string' && !Object.hasOwn(out, p.id)) out[p.id] = planFigure(p, country, opts);
  return out;
}
export const monthList = list => list.map(monthWords).filter(Boolean);

// The two lookups, asked once for everyone (js/memo.js), through the server's own routes.
export function loadMoney(get = globalThis.fetch?.bind(globalThis)) {
  return once('money', async () => {
    if (typeof get !== 'function') return { prices: { ok: false, reason: MONEY_DOWN }, faostat: { ok: false, reason: MONEY_DOWN } };
    const ask = async url => { try { const a = await (await get(url)).json(); return a && typeof a === 'object' ? a : { ok: false, reason: MONEY_DOWN }; } catch { return { ok: false, reason: MONEY_DOWN }; } };
    const [prices, faostat] = await Promise.all([ask('/api/prices'), ask('/api/faostat')]);
    return { prices, faostat };
  }, { good: m => m.prices?.ok !== false && m.faostat?.ok !== false });
}
