// The rough money figure's suite: js/sales.js on the real answers recorded from the World Bank and FAOSTAT on 14 November 2026, and on made-up answers for the edges.
// RULE: never loosen a check here without a written farming reason beside it. A failure means a farmer would be shown money that is not the sources' figure, or told it is their income.
// Run: node scripts/test_sales.mjs   (no network)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../js/sales.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 280 ? s.slice(0, 280) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), FIX = path.join(HERE, 'fixtures', 'live');
const PRICES = JSON.parse(fs.readFileSync(path.join(FIX, 'prices-live', 'recording.json'), 'utf8')).answer;
const FAO = JSON.parse(fs.readFileSync(path.join(FIX, 'faostat-live', 'recording.json'), 'utf8')).answer;
const RATES = { date: '2026-11-14', rates: { USD: 1, CAD: 1.4, EUR: 0.9, TRY: 40 } };

// ---- small helpers
same('two significant digits: a rough figure never looks exact', [1953, 86740, 2326.155, 95, 9.4, 100].map(S.roughly), [2000, 87000, 2300, 95, 9.4, 100]);
same('nothing positive, nothing', [0, -5, NaN, Infinity, null].map(S.roughly).map(Number.isNaN), [true, true, true, true, true]);
same('months in words', [S.monthWords('2026-10'), S.monthWords('2026-13'), S.monthWords(''), S.monthWords(null)], ['October 2026', '', '', '']);
same('"Canada\'s", "Türkiye\'s", "Philippines\'"', [S.possessive('Canada'), S.possessive('Türkiye'), S.possessive('Philippines')], ["Canada's", "Türkiye's", "Philippines'"]);
same('a figure already in its currency is written with no cents', [S.fmt(2300, 'USD'), S.fmt(3300, 'CAD')], ['$2,300', 'CA$3,300']);

// ---- the world price
{
  const p = S.priceOf(PRICES, 'corn');
  check('corn: the Pink Sheet\'s Maize, US$ a tonne, with its month, from the recorded answer', p.ok && p.seriesName === 'Maize' && p.usdPerTonne === PRICES.series.corn.latest.value && p.month === PRICES.series.corn.latest.month && /^\d{4}-\d\d$/.test(p.month), p);
  check('soybeans and wheat have prices too', S.priceOf(PRICES, 'soy').ok && S.priceOf(PRICES, 'wheat').seriesName === 'Wheat, US HRW');
  const canola = S.priceOf(PRICES, 'canola');
  check('canola has only a proxy (rapeseed oil): no figure, and the reason says why', !canola.ok && canola.noPrice && /only for a product made from it/.test(canola.reason), canola);
  check('a crop the sheet does not list has no price, and it is said', (r => !r.ok && /no world price for chickpea/.test(r.reason))(S.priceOf(PRICES, 'chickpea')));
  const fake = (over = {}) => ({ ok: true, series: { x: { name: 'X', unit: '$/mt', latest: { month: '2026-10', value: 300 }, ...over } } });
  check('a stale series (the sheet stopped updating it) is refused: an old price must not look current', (r => !r.ok && /stopped updating the x price after November 2026/.test(r.reason))(S.priceOf(fake({ stale: true, latest: { month: '2026-11', value: 300 } }), 'x')));
  same('a price in $/kg is turned into a tonne price', S.priceOf(fake({ unit: '$/kg', latest: { month: '2026-10', value: 2.5 } }), 'x').usdPerTonne, 2500);
  check('a unit this figure cannot use is refused, never guessed', !S.priceOf(fake({ unit: '$/bushel' }), 'x').ok && !S.priceOf(fake({ unit: undefined }), 'x').ok);
  check('a price of 0, a negative one or a missing one is refused', [0, -3, NaN, null, 'a'].every(v => !S.priceOf(fake({ latest: { month: '2026-10', value: v } }), 'x').ok));
  // Changed on purpose: the one-page report never says "not read yet" ("no 'not read yet' words on the page"), so a missing lookup now says it did not answer
  check('a failed or missing lookup says so, in words', S.priceOf({ ok: false, reason: 'The World Bank took too long to answer; try again in a minute' }, 'corn').reason.startsWith('World prices could not be read: The World Bank took too long') && S.priceOf(undefined, 'corn').reason === 'World prices did not answer.');
  check('inherited names are not crops', ['__proto__', 'toString', 'constructor'].every(id => !S.priceOf(PRICES, id).ok));
}
// ---- the national yield
{
  const y = S.yieldOf(FAO, 'CA', 'corn');
  check('Canada corn: the FAOSTAT yield, with its years and the country\'s name', y.ok && y.tPerHa === FAO.countries.CA.yield.corn[0] && y.years === '2022-2024' && y.country === 'Canada', y);
  check('Türkiye is written Türkiye', S.yieldOf(FAO, 'TR', 'wheat').country === 'Türkiye');
  check('a country FAOSTAT has no crops for, and a crop it has no yield for, say so', /no crop figures for the country with code XX/.test(S.yieldOf(FAO, 'XX', 'corn').reason) && /no national yield for coffee in Canada/.test(S.yieldOf(FAO, 'CA', 'coffee').reason));
  check('a yield of 0, a negative or a text is refused', [0, -1, NaN, 'x'].every(v => !S.yieldOf({ countries: { CA: { name: 'Canada', yield: { corn: [v, '2022-2024'] } } } }, 'CA', 'corn').ok));
  check('FAO\'s estimate flag is carried: "not official"', S.yieldOf({ countries: { CA: { name: 'Canada', yield: { corn: [10, '2022-2024'] }, not_official: ['corn'] } } }, 'CA', 'corn').notOfficial === true);
  check('inherited names are not countries or crops', S.yieldOf(FAO, '__proto__', 'corn').ok === false && S.yieldOf(FAO, 'CA', 'toString').ok === false);
  check('a failed lookup says so', /National yields could not be read: FAOSTAT did not answer/.test(S.yieldOf({ ok: false, reason: 'FAOSTAT did not answer; try again in a minute' }, 'CA', 'corn').reason));
}
// ---- the rough value of a hectare
{
  const p = PRICES.series.corn.latest.value, yld = FAO.countries.CA.yield.corn[0];
  const r = S.roughValue('corn', 'CA', { prices: PRICES, faostat: FAO });
  check('Canada corn in US dollars: yield × world price, to two significant digits', r.ok && r.perHaUsd === S.roughly(p * yld) && r.currency === 'USD' && r.perHa === r.perHaUsd, [r.perHaUsd, p * yld]);
  check('and it is in a sensible range for corn (US$1,000 to 4,000 a hectare)', r.perHaUsd >= 1000 && r.perHaUsd <= 4000, r.perHaUsd);
  const c = S.roughValue('corn', 'CA', { prices: PRICES, faostat: FAO, currency: 'CAD', rates: RATES });
  check('in Canadian dollars at the day\'s rate, again to two digits', c.currency === 'CAD' && c.perHa === S.roughly(p * yld * 1.4) && /^About CA\$[\d,]+ a hectare$/.test(c.chip), [c.perHa, c.chip]);
  const t = S.roughValue('wheat', 'TR', { prices: PRICES, faostat: FAO, currency: 'TRY', rates: RATES });
  check('Türkiye wheat in lira: written with the lira sign and its own yield', t.ok && t.currency === 'TRY' && t.yield.country === 'Türkiye' && /TRY|₺/.test(t.chip), t.chip);
  const noRate = S.roughValue('corn', 'CA', { prices: PRICES, faostat: FAO, currency: 'CAD', rates: null });
  check('no exchange rate: it stays in US dollars and says so, never a made-up rate', noRate.currency === 'USD' && noRate.assumptions.at(-1).startsWith('Amounts are in US dollars') || /could not be read/.test(noRate.assumptions.at(-1)), noRate.assumptions.at(-1));
  check('an unknown currency code is taken as US dollars', S.roughValue('corn', 'CA', { prices: PRICES, faostat: FAO, currency: 'euro' }).currency === 'USD');
  // the words: every assumption written out, and never the farmer's income
  const A = r.assumptions.join(' ');
  check('every assumption is written beside the figure: world price, not local', /World price, not your local price/.test(A));
  check('the country\'s average yield, not the field\'s', /Canada's average yield, not your field's/.test(A));
  check('no costs taken off', /No costs taken off/.test(A));
  check('not your income, not a forecast', /Not your income and not a forecast/.test(A) && /not your income/i.test(r.caution));
  check('the price\'s month and the yield\'s years are written', new RegExp(S.monthWords(r.price.month)).test(A) && /2022-2024/.test(A) && r.asOf.price === S.monthWords(r.price.month) && r.asOf.yield === '2022-2024');
  check('the sources are named: World Bank Pink Sheet and FAOSTAT', r.sources.map(s => s.name).join(' ').includes('World Bank') && r.sources.map(s => s.name).join(' ').includes('FAOSTAT'));
  check('the headline and chip never call it income, earnings, profit, revenue, a forecast or a promise', !/\b(income|earn|earnings|profit|revenue|forecast|will make|you will|guarantee|expected)\b/i.test(r.chip + ' ' + r.headline), [r.chip, r.headline]);
  check('and the chip says "About" and "a hectare"', /^About .+ a hectare$/.test(r.chip));
  check('wheat says the yield is all wheat and the price is hard red winter', S.roughValue('wheat', 'CA', { prices: PRICES, faostat: FAO }).assumptions.some(l => /all wheat together/.test(l) && /hard red winter/.test(l)));
  check('a crop with only a proxy price has no figure, and the reason is the price\'s', (x => !x.ok && x.missing.includes('price') && /no price for canola itself/.test(x.reason))(S.roughValue('canola', 'CA', { prices: PRICES, faostat: FAO })));
  check('a crop with a price but no national yield says "yield"', (x => !x.ok && x.missing.join() === 'yield')(S.roughValue('corn', 'XX', { prices: PRICES, faostat: FAO })));
  check('with neither lookup read, it says which are missing and shows nothing', (x => !x.ok && x.missing.join() === 'price,yield')(S.roughValue('corn', 'CA', {})));
  check('the figure carries FAO\'s own farm-gate price when it has one, labelled, never mixed in', r.farmGate === null || (r.farmGate.source === 'FAOSTAT Producer Prices' && r.farmGate.usdPerTonne > 0 && r.perHaUsd === S.roughly(p * yld)));
  check('the same inputs give the same words', JSON.stringify(S.roughValue('corn', 'CA', { prices: PRICES, faostat: FAO })) === JSON.stringify(r));
  check('inputs are not changed', JSON.stringify(PRICES).length > 1000 && PRICES.series.corn.latest.value === p);
}
// ---- an area, and two crops side by side
{
  const corn = S.roughValue('corn', 'CA', { prices: PRICES, faostat: FAO }), soy = S.roughValue('soy', 'CA', { prices: PRICES, faostat: FAO });
  const area = S.forArea(corn, 10);
  check('ten hectares: ten times the hectare figure, to two digits, with the caution', area.total === S.roughly(corn.perHa * 10) && /not your income/.test(area.words) && /10 ha/.test(area.words), area);
  check('no area or a bad one gives nothing', S.forArea(corn, 0) === null && S.forArea(corn, NaN) === null && S.forArea({ ok: false }, 10) === null);
  const cmp = S.compareCrops(corn, soy);
  check('corn against soybeans: both figures in words, and costs not counted', cmp.ok && /At world prices and national average yields/.test(cmp.words) && /Costs are not counted/.test(cmp.words) && !/\b(pays|better|worse|best)\b/i.test(cmp.words), cmp.words);
  check('two figures within 10% are "about the same"', S.compareCrops({ ...corn, perHa: 2000 }, { ...corn, perHa: 2100, crop: 'x' }).words.includes('about the same'));
  check('figures in different currencies are not compared', !S.compareCrops(corn, { ...soy, currency: 'CAD' }).ok);
  check('a missing figure is not compared', !S.compareCrops(corn, { ok: false, reason: 'No price.' }).ok && S.compareCrops({ ok: false, reason: 'No yield.' }, corn).reason === 'No yield.');
}
// ---- the module itself
{
  const src = fs.readFileSync(path.join(HERE, '..', 'js', 'sales.js'), 'utf8').replace(/\/\/.*$/gm, '');
  check('it reads and stores nothing: no network, no storage, no clock, no randomness', !/fetch\(|localStorage|sessionStorage|XMLHttpRequest|Date\.now|new Date|Math\.random/.test(src));
  check('it uses the existing currency helper for conversion, not its own rates', /from '\.\/currency\.js'/.test(src) && /convert\(/.test(src));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
