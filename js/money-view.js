// Crophalo's rough money figure on screen: one quiet line under each option ("About $2,300 a hectare a year, before costs") and a sheet, "How this figure is made", with every assumption written out.
// It follows the farmer's currency and area unit (a hectare or an acre). It never calls the figure income, earnings, profit, revenue, a forecast or a promise; it says what it is: a rough value of a typical
// harvest at the world price. A plan with no figure says why in one line. Pure: functions of plain data (js/money-data.js, js/currency.js, js/units.js) that return text; openMoneySheet is the one DOM function.
// Checked by scripts/test_money.mjs (the line in each state, the sheet's assumptions, units and currency, and that none of the banned words appears on any screen).
import { esc } from './words.js';
import { fmt } from './sales.js';
import { fxNote } from './currency.js';
import { monthList } from './money-data.js';

export const MONEY_TITLE = 'How this figure is made';
const list = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
// The figure as the line writes it: per hectare or per acre, to two significant digits, in the farmer's currency.
export function figureWords(f, units = {}) {
  const acre = units.area === 'imperial';
  return `About ${fmt(acre ? f.perAcre : f.perHa, f.currency)} ${acre ? 'an acre' : 'a hectare'} a year`;
}
// The line under an option. where: 'card' (words only: the card is itself a button) or 'detail' (with the button that opens the sheet).
export function moneyLineHTML(state, plan, where = 'card', units = {}) {
  if (state === undefined || state === null || !plan || plan.flag === 'fails') return '';   // a plan that does not suit this place gets no money figure either
  if (state.loading) return where === 'detail' ? '<p class="cap money-line" role="status">Working out a rough value from world prices…</p>' : '';
  const f = state.byPlan?.[plan.id];
  if (!f) return '';
  if (!f.ok && where !== 'detail') return '';   // a card says nothing when there is no figure: the reason is said once, in the detail below the cards
  if (!f.ok) { const tag = 'p'; return `<${tag} class="cap money-line">No money figure: ${esc(f.reason)}</${tag}>`; }
  const words = `${figureWords(f, units)}, before costs.`;
  return where === 'detail'
    ? `<p class="cap money-line"><b>${esc(words)}</b> A rough value at the world price. <button type="button" class="link" data-act="money" data-plan="${esc(plan.id)}" aria-haspopup="dialog">${MONEY_TITLE}</button></p>`
    : `<span class="cap money-line">${esc(words)}</span>`;
}
// Every assumption, in plain sentences, with the facts of this figure.
export function assumptionLines(f, rates = null, units = {}) {
  const acre = units.area === 'imperial', many = f.crops.length > 1, months = monthList(f.priceMonths);
  const prices = f.crops.map(c => `${c.name.toLowerCase()} US$${Number(c.fig.price.usdPerTonne).toLocaleString('en-US', { maximumFractionDigits: 1 })} a tonne`);
  const yields = f.crops.map(c => `${c.name.toLowerCase()} ${Number(c.fig.yield.tPerHa).toLocaleString('en-US', { maximumFractionDigits: 2 })} tonnes a hectare`);
  const lines = [
    `World price, not your local price: ${list(prices)} (the World Bank's monthly price sheet, ${list(months)}).`,
    `${f.country}'s average yield, not your field's: ${list(yields)} (FAOSTAT, ${list(f.yieldYears)}).`,
    `${many ? `Each year of the plan is worked out the same way and the ${f.years} years are averaged.` : 'One crop, one year.'} The result is rounded to two significant digits, so it never looks more exact than it is.`,
    'No costs taken off: seed, fertiliser, fuel, machinery, labour and land are not counted.',
    'No selling costs, transport, quality or contract prices, and no yield loss: a typical harvest sold at the world price.',
    'This is a rough value of a typical harvest, not what you will receive. Prices change every month and this is the latest one, not a prediction.',
  ];
  for (const c of f.crops) if (c.fig.assumptions) { const own = c.fig.assumptions.find(l => /all wheat together|grain maize/.test(l)); if (own && !lines.includes(own)) lines.splice(3, 0, own.replace(/\bforecast\b/gi, 'prediction')); }
  if (f.crops.some(c => c.fig.yield.notOfficial)) lines.push('FAO marks one of these yields as an estimate, not an official national figure.');
  lines.push(fxNote(f.currency, rates));
  if (acre) lines.push('Shown per acre: the per-hectare value divided by 2.47.');
  return lines;
}
export function moneySheetHTML(f, plan, rates = null, units = {}) {
  const head = `${figureWords(f, units)}, before costs`;
  return `<div class="sheet-head"><h2 id="dlgMoneyTitle">${MONEY_TITLE}</h2><button type="button" class="btn" data-money-done>Done</button></div>
    <div class="sheet-body"><p><b>${esc(plan ? plan.name ?? '' : '')}</b></p><p class="wk-big num">${esc(head)}</p>
    <ul class="money-assume">${assumptionLines(f, rates, units).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <p class="cap">Sources: World Bank Commodity Price Data (the Pink Sheet) and FAOSTAT, FAO of the United Nations.</p></div>`;
}
// The sheet itself: a dialog that is made once, opened as a modal and gives focus back to where it came from.
export function openMoneySheet(f, plan, rates, units, from = document.activeElement) {
  let d = document.getElementById('dlgMoney');
  if (!d) { d = document.createElement('dialog'); d.className = 'sheet'; d.id = 'dlgMoney'; d.setAttribute('aria-labelledby', 'dlgMoneyTitle'); document.body.append(d); d.addEventListener('click', e => { if (e.target.closest('[data-money-done]') || e.target === d) d.close(); }); }
  d.innerHTML = moneySheetHTML(f, plan, rates, units);
  d.addEventListener('close', () => { try { from?.focus?.(); } catch { /* it had gone */ } }, { once: true });
  d.showModal();
}
