// Crophalo's rough-money suite: a plan's figure from the real World Bank and FAOSTAT answers recorded on 14 November 2026, the line under each option, the "How this figure is made" sheet, units and currency,
// the cases with no figure (a stand-in price, a stale price, no yield, nothing read), and that no farmer-facing word says income, earn, profit, revenue, forecast or guarantee.
// RULE: never loosen a check to make it pass; a failure means a farmer could be shown money that is not the sources' figure, or be told it is their income. No internet is needed. Run: node scripts/test_money.mjs
import fs from 'node:fs';
import { planFigure, moneyFor, loadMoney, MONEY_DOWN } from '../js/money-data.js';
import { PRICES_DOWN, moneyLineHTML, moneySheetHTML, assumptionLines, figureWords, MONEY_TITLE } from '../js/money-view.js';
import { roughValue, roughly } from '../js/sales.js';
import { forgetAll } from '../js/memo.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const rec = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/live/${n}/recording.json`, import.meta.url), 'utf8')).answer;
const PRICES = rec('prices-live'), FAO = rec('faostat-live'), RATES = { date: '2026-11-14', rates: { USD: 1, CAD: 1.4, EUR: 0.9, TRY: 40 } };
const S = (year, crop) => ({ year, crop, sow: '2027-05-01', harvest: '2027-10-01', after: 'residue' });
const now = { id: 'now', name: 'Corn, soybeans', kind: 'current', seasons: [S(1, 'corn'), S(2, 'soy')] };
const wheat = { id: 'cws', name: 'Corn, soybeans, winter wheat', kind: 'proposed', seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'wheat')] };
const canola = { id: 'can', name: 'Canola', kind: 'proposed', seasons: [S(1, 'canola'), S(2, 'wheat')] };
const chick = { id: 'chk', name: 'Chickpea', kind: 'proposed', seasons: [S(1, 'chickpea')] };
const BANNED = /\b(income|earn\w*|profit\w*|revenue|forecast\w*|guarantee\w*|promise\w*|expected)\b/i;
const O = { prices: PRICES, faostat: FAO };

// ---- one plan: the average of its crops' rough values, to two significant digits
{
  const f = planFigure(now, 'CA', O), c = roughValue('corn', 'CA', O), s = roughValue('soy', 'CA', O);
  check('Canada, corn then soybeans: the average of the two crops\' figures, to two significant digits', f.ok && f.perHa === roughly((c.perHa + s.perHa) / 2) && f.years === 2 && f.currency === 'USD', brief(f));
  check('and it is in a sensible range (US$1,000 to 4,000 a hectare)', f.perHa >= 1000 && f.perHa <= 4000, f.perHa);
  const w = planFigure(wheat, 'CA', O); check('a three-year plan averages three crops', w.ok && w.years === 3 && w.crops.map(x => x.crop).join() === 'corn,soy,wheat');
  const cad = planFigure(now, 'CA', { ...O, currency: 'CAD', rates: RATES }); check('in Canadian dollars at the day\'s rate', cad.ok && cad.currency === 'CAD' && cad.perHa === roughly((roughValue('corn', 'CA', { ...O, currency: 'CAD', rates: RATES }).perHa + roughValue('soy', 'CA', { ...O, currency: 'CAD', rates: RATES }).perHa) / 2));
  const noRate = planFigure(now, 'CA', { ...O, currency: 'CAD', rates: null }); check('no exchange rate: it stays in US dollars', noRate.ok && noRate.currency === 'USD');
  check('per acre is the per-hectare figure over 2.47, rounded the same way', f.perAcre === roughly(f.perHa / 2.4710538147));
}
// ---- the cases with no figure: the plan says why, never a number
{
  const c = planFigure(canola, 'CA', O); check('canola has only a proxy price: no figure for the plan, and the reason names canola', !c.ok && /Canola: .*only for a product made from it/.test(c.reason) && c.crop === 'canola', brief(c));
  const k = planFigure(chick, 'CA', O); check('chickpea has no world price: no figure', !k.ok && /chickpea/i.test(k.reason), brief(k));
  check('a country with no yields: no figure, and it says so', (x => !x.ok && /no crop figures for the country/.test(x.reason))(planFigure(now, 'XX', O)));
  check('a stale price is refused', (x => !x.ok && /stopped updating/.test(x.reason))(planFigure({ id: 'x', seasons: [S(1, 'corn')] }, 'CA', { faostat: FAO, prices: { ok: true, series: { corn: { ...PRICES.series.corn, stale: true } } } })));
  check('a stand-in price (made from another product) is refused', (x => !x.ok)(planFigure({ id: 'x', seasons: [S(1, 'corn')] }, 'CA', { faostat: FAO, prices: { ok: true, series: { corn: { ...PRICES.series.corn, proxy: true } } } })));
  check('lookups not read: no figure, and it says which', (x => !x.ok && /did not answer|could not be read/.test(x.reason))(planFigure(now, 'CA', {})));
  check('a plan with no crops has no figure', !planFigure({ id: 'e', seasons: [] }, 'CA', O).ok && !planFigure(null, 'CA', O).ok);
  const map = moneyFor({ current: now, recommended: now, others: [wheat, canola] }, 'CA', O); same('moneyFor: one entry for each plan by the engine\'s own id, the same plan once', Object.keys(map), ['now', 'cws', 'can']);
}
// ---- the line under an option and the sheet
const units = { area: 'metric' }, byPlan = moneyFor({ current: now, recommended: wheat, others: [canola] }, 'CA', O), money = { byPlan, rates: null };
{
  const card = moneyLineHTML(money, now, 'card', units), det = moneyLineHTML(money, now, 'detail', units);
  check('the card line: "About $… a hectare a year, before costs", words only (the card is a button)', /^<span class="cap money-line">About \$[\d,]+ a hectare a year, before costs\.<\/span>$/.test(card) && !card.includes('<button'), card);
  check('the detail line adds the "How this figure is made" button, which names the plan', det.includes('data-act="money"') && det.includes('data-plan="now"') && det.includes(MONEY_TITLE) && det.includes('aria-haspopup="dialog"'));
  check('a plan with no figure says why in one quiet line, in the detail only (a card stays quiet)', /No money figure: Canola: /.test(moneyLineHTML(money, canola, 'detail', units)) && /<p class="cap money-line">No money figure/.test(moneyLineHTML(money, canola, 'detail', units)));
  { const bad = { loading: false, byPlan: { canola: { ok: false, reason: 'Canola: World prices could not be read: Python environment not found (.venv)' }, corn: { ok: false, reason: 'Corn: failed at /srv/crophalo/scripts/live/prices.py status 500' } } }, line = id => moneyLineHTML(bad, { id }, 'detail', units).replace(/<[^>]+>/g, '');
    check('a reason with a path, Python or a status code never reaches the farmer: one plain sentence and nothing after it', line('canola') === PRICES_DOWN && line('corn') === PRICES_DOWN && !/Python|venv|\.py|srv|status/i.test(line('canola') + line('corn')), line('canola') + ' | ' + line('corn')); }
  same('nothing asked yet: nothing drawn', [moneyLineHTML(undefined, now), moneyLineHTML(null, now), moneyLineHTML({ byPlan: {} }, now), moneyLineHTML(money, null)], ['', '', '', '']);
  check('while it works, the detail says so and the card says nothing', /Working out a rough value/.test(moneyLineHTML({ loading: true }, now, 'detail')) && moneyLineHTML({ loading: true }, now, 'card') === '');
  const ac = moneyLineHTML(money, now, 'card', { area: 'imperial' }); check('with acres chosen the line is per acre, from the per-hectare figure', /an acre a year/.test(ac) && !/a hectare/.test(ac), ac);
  const cad = { byPlan: moneyFor({ current: now, recommended: now, others: [] }, 'CA', { ...O, currency: 'CAD', rates: RATES }), rates: RATES }; check('with Canadian dollars chosen the line says CA$', /CA\$[\d,]+/.test(moneyLineHTML(cad, now, 'card', units)));
  const f = byPlan.cws, sheet = moneySheetHTML(f, wheat, null, units), A = assumptionLines(f, null, units).join(' ');
  check('the sheet is titled "How this figure is made" and shows the figure and the plan name', sheet.includes(MONEY_TITLE) && sheet.includes('Corn, soybeans, winter wheat') && /About \$[\d,]+ a hectare a year, before costs/.test(sheet) && sheet.includes('data-money-done'));
  check('assumption: world price, not local, with each crop\'s price and the price month', /World price, not your local price/.test(A) && /corn US\$[\d,.]+ a tonne/i.test(A) && new RegExp(f.priceMonths.length ? 'October|September|November' : 'x').test(A));
  check('assumption: Canada\'s average yield, not the field\'s, with the years', /Canada's average yield, not your field's/.test(A) && /FAOSTAT, \d{4}-\d{4}/.test(A));
  check('assumption: no costs taken off, no selling costs, rounded to two digits, typical harvest', /No costs taken off/.test(A) && /No selling costs/.test(A) && /two significant digits/.test(A) && /not what you will receive/.test(A) && /not a prediction/.test(A));
  check('assumption: the exchange rate and its date when another currency is shown', /1 US\$ = 1\.40 CAD.*2026-11-14/.test(assumptionLines(planFigure(now, 'CA', { ...O, currency: 'CAD', rates: RATES }), RATES, units).join(' ')) && /Amounts are in US dollars/.test(A));
  check('assumption: the wheat note (all wheat together, hard red winter price)', /all wheat together/.test(A));
  check('assumption: acres say how they are made', /divided by 2\.47/.test(assumptionLines(f, null, { area: 'imperial' }).join(' ')));
  check('the sheet names its two sources', /World Bank Commodity Price Data/.test(sheet) && /FAOSTAT/.test(sheet));
  check('figure words: hectare and acre', /^About \$[\d,]+ a hectare a year$/.test(figureWords(f, {})) && /^About \$[\d,]+ an acre a year$/.test(figureWords(f, { area: 'imperial' })));
}
// ---- the words: none of the banned ones on any screen, in any state or currency
{
  const screens = [];
  for (const cur of ['USD', 'CAD', 'EUR', 'TRY']) for (const area of ['metric', 'imperial']) for (const country of ['CA', 'TR', 'XX']) {
    const by = moneyFor({ current: now, recommended: wheat, others: [canola, chick] }, country, { ...O, currency: cur, rates: RATES }), st = { byPlan: by, rates: RATES };
    for (const p of [now, wheat, canola, chick]) { screens.push(moneyLineHTML(st, p, 'card', { area }), moneyLineHTML(st, p, 'detail', { area })); if (by[p.id]?.ok) screens.push(moneySheetHTML(by[p.id], p, RATES, { area })); }
  }
  screens.push(moneyLineHTML({ loading: true }, now, 'detail'), MONEY_DOWN, MONEY_TITLE);
  const text = screens.join(' ').replace(/<[^>]*>/g, ' ');
  check('no screen says income, earn, profit, revenue, forecast, guarantee, promise or expected', !BANNED.test(text), (text.match(BANNED) ?? [''])[0]);
  check('markup in a reason is escaped', !moneyLineHTML({ byPlan: { x: { ok: false, reason: '<img src=x onerror=1>' } } }, { id: 'x' }, 'card').includes('<img'));
}
// ---- the lookups
{
  forgetAll(); const asked = []; const get = async url => { asked.push(url); return { json: async () => (url === '/api/prices' ? PRICES : FAO) }; };
  const [a, b] = await Promise.all([loadMoney(get), loadMoney(get)]); check('the two world lookups are asked once however many ask, through the server\'s routes', asked.sort().join() === '/api/faostat,/api/prices' && a.prices.ok && b.faostat.ok, asked.join());
  forgetAll(); const bad = await loadMoney(async () => { throw new Error('down'); }); check('a failed lookup is a plain sentence, and no figure comes from it', bad.prices.ok === false && bad.prices.reason === MONEY_DOWN && !planFigure(now, 'CA', bad).ok);
  forgetAll(); let n = 0; await loadMoney(async () => { n++; throw new Error('x'); }); await loadMoney(async () => { n++; throw new Error('x'); }); check('a failed lookup is asked again next time', n === 4, String(n));
  forgetAll();
}
console.log(`money: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
