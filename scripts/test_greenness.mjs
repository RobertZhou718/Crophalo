// Crophalo's greenness-history suite: the lookup's answer (/api/ndvihist, a stand-in in its real shape, made for Oxford: peaks from 0.56 to 0.64 and a steady sentence) rebuilt from known parts, the card's sentences in their order, gaps that are never 0, seasons
// with fewer clear readings marked, no sentence meaning only the seasons, always the 2 km patch (250 m pixels) with its roads, towns and woods, the chart and the table, and the background load. RULE: never loosen a check. No network. Run: node scripts/test_greenness.mjs
import { cleanGreenness, greenLines, greenChartSVG, greenTable, greenItemHTML, loadGreenness, PATCH_WORDS, READING_WORDS, GREEN_DOWN } from '../js/greenness.js';
import { historyHTML } from '../js/history-view.js';
import { buildHistory } from '../js/history.js';
import { forgetAll } from '../js/memo.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const season = (year, peak, extra = {}) => ({ year, peak, peak_date: peak === null ? null : `${year}-07-04`, n: 12, of: 12, partial: false, valid_pixels: 80, ...extra });
const PEAKS = [0.58, 0.6, 0.56, 0.61, 0.64, 0.59, 0.6, 0.62, 0.57, 0.6, 0.63, 0.61, 0.59, 0.6, 0.62, 0.6, 0.58, 0.61, 0.6, 0.63, 0.59, 0.6, 0.62, 0.6, 0.61];
const STEADY = { ok: true, source: 'NASA GIBS MODIS Terra 16-day greenness', data_date: '2001/2025', units: 'greenness (0 bare to about 0.8 thick green)', pixel_m: 250, patch_km: 2, window: 'April to September', seasons: PEAKS.map((p, i) => season(2001 + i, p)), seasons_read: 25, years_without: [], partial_years: [], early: { from: 2001, to: 2010, mean: 0.6, n: 10 }, recent: { from: 2016, to: 2025, mean: 0.6, n: 10 }, change: { kind: 'steady', difference: 0, needed: 0.05 }, browner_years: [], sentence: 'Peak greenness has been steady since 2001.', advice: null, note: 'A 2 km patch.' };
const GREENER = { ...STEADY, change: { kind: 'greener', difference: 0.08, needed: 0.05 }, sentence: 'The land here is greener at its peak since 2018 than in 2001–2010 (about 0.78 now, 0.71 then).', advice: 'This often means fields nearby started to be watered or changed crop: ask the seller.' };

{
  const g = cleanGreenness(STEADY);
  check('the steady Oxford answer is rebuilt: 25 seasons, oldest first, peaks 0.56 to 0.64, no gaps', g.ok && g.seasons.length === 25 && g.seasons[0].year === 2001 && g.seasons.at(-1).year === 2025 && Math.min(...g.seasons.map(s => s.peak)) === 0.56 && Math.max(...g.seasons.map(s => s.peak)) === 0.64 && g.gaps.length === 0 && g.partial.length === 0, brief([g.seasons?.length, g.gaps]));
  same('the lines: the lookup\'s own sentence as given, no advice when there is none, then the 2 km patch', greenLines(g), ['Peak greenness has been steady since 2001.', PATCH_WORDS]);
  check('the patch sentence says 2 km, 250 m pixels, and roads, towns or woods', /2 km patch/.test(PATCH_WORDS) && /250 m pixels/.test(PATCH_WORDS) && /roads, towns or woods/.test(PATCH_WORDS));
  same('a greener answer: the sentence, then its advice (only because it is present), then the patch', greenLines(cleanGreenness(GREENER)), [GREENER.sentence, GREENER.advice, PATCH_WORDS]);
  same('advice with no sentence is not shown alone; no sentence means only the seasons and the patch', greenLines(cleanGreenness({ ...STEADY, sentence: null, advice: 'ask the seller' })), [PATCH_WORDS]);
  const gappy = cleanGreenness({ ...STEADY, seasons: STEADY.seasons.map(s => (s.year === 2012 ? season(2012, null, { n: 0 }) : s.year === 2008 ? { ...s, partial: true, n: 4 } : s)), years_without: [2012, 2013], partial_years: [2008] });
  check('a year without a clear reading is a gap (peak null, never 0), including one only named in years_without', gappy.gaps.join() === '2012,2013' && gappy.seasons.find(s => s.year === 2012).peak === null && gappy.seasons.find(s => s.year === 2013).peak === null && gappy.seasons.every(s => s.peak !== 0));
  same('seasons with fewer clear readings are named', [gappy.partial, greenLines(gappy).slice(1, 3)], [[2008], ['No clear reading in 2012, 2013: left as gaps, never as 0.', 'Fewer clear readings in 2008.']]);
  const svg = greenChartSVG(gappy); check('the chart: a dot for each read season, an empty marker for each gap, the partial one outlined, a labelled image with the scale', (svg.match(/class="gn-dot/g) ?? []).length === 23 && (svg.match(/class="gn-gap"/g) ?? []).length === 2 && (svg.match(/gn-dot partial/g) ?? []).length === 1 && /role="img" aria-label="Peak greenness of each growing season, 2001 to 2025\. 0 is bare ground and about 0\.8 is thick green crop\. 2 seasons have no clear reading\./.test(svg), svg.slice(0, 300));
  const table = greenTable(gappy); check('the table: newest first, "No clear reading" for a gap, clear readings as N of M', /<th scope="row">2025<\/th>/.test(table) && table.indexOf('2025') < table.indexOf('2001') && /No clear reading/.test(table) && /12 of 12/.test(table) && /4 of 12 \(fewer\)/.test(table));
}
{
  same('a refusal keeps its reason; nothing usable is the plain sentence', [cleanGreenness({ ok: false, reason: 'No MODIS pictures for this place.' }).reason, cleanGreenness(null).reason, cleanGreenness({ ok: true, seasons: [] }).reason], ['No MODIS pictures for this place.', GREEN_DOWN, GREEN_DOWN]);
  const hostile = cleanGreenness({ ...STEADY, seasons: [{ year: '2001', peak: 0.5 }, { year: 2002, peak: 'x' }, { year: 2003, peak: 9 }, { year: 2004, peak: -5 }, { year: 3000, peak: 0.5 }, null, { year: 2005, peak: 0.55, n: -4, of: 0 }], sentence: '<img src=x onerror=1>', years_without: ['x', 2007, 2007.5], partial_years: 'no' });
  same('hostile seasons are rebuilt from known parts: only real years, peaks in range or none', hostile.seasons.map(s => [s.year, s.peak]), [[2002, null], [2003, null], [2004, null], [2005, 0.55], [2007, null]]);
  check('a sentence from outside is plain text in the card', !greenItemHTML({ status: 'ok', result: hostile }).includes('<img src=x'));
  check('an unknown change kind is dropped', cleanGreenness({ ...STEADY, change: { kind: 'purple', difference: 1 } }).change === null);
}
{
  const item = greenItemHTML({ status: 'ok', result: cleanGreenness(STEADY) }), t = text(item);
  check('the card item has the chart, the sentence, the patch, and the numbers folded', item.includes('class="ch gn-chart"') && t.includes('Peak greenness has been steady since 2001.') && t.includes('2 km patch') && item.includes('<details class="disc"><summary>The numbers</summary>'));
  check('while it reads: it says so, with the 80 seconds, and the page does not wait (a status, no figure)', greenItemHTML({ status: 'loading' }).includes(READING_WORDS) && /up to 80 seconds; the page does not wait for it/.test(READING_WORDS) && /role="status"/.test(greenItemHTML({ status: 'loading' })) && !/gn-chart/.test(greenItemHTML({ status: 'loading' })));
  check('not asked and failed are plain, with no figure', /Not read yet\./.test(greenItemHTML(undefined)) && greenItemHTML({ status: 'error', reason: 'No MODIS pictures for this place.' }).includes('No MODIS pictures for this place.') && greenItemHTML({ status: 'error' }).includes(GREEN_DOWN));
  const H = buildHistory({ days: ['20010101'], T2M_MAX: [1], T2M_MIN: [0], rain: [0] }, {}); const base = { h: { ok: true, first: 2001, last: 2025, counted: 25, skipped: [], notOver: null, short: false, usual: { grow: 400, lastFrost: 110, firstFrost: 290 }, counts: Object.fromEntries(['dry', 'lateFrost', 'earlyFrost', 'hot', 'dryspell', 'downpour'].map(id => [id, { n: 0, of: 25, years: [] }])), strips: Object.fromEntries(['dry', 'lateFrost', 'earlyFrost', 'hot', 'dryspell', 'downpour'].map(id => [id, [{ year: 2001, state: 'clear' }]])), trends: {}, through: '2026-11-12' }, farm: 'F', place: 'P', fields: [], date: '2026-11-14' };
  const page = historyHTML({ ...base, extras: { modis: { status: 'ok', result: cleanGreenness(STEADY) } } }), sat = page.slice(page.indexOf('<ul class="h-list">'), page.indexOf('id="h-pests"'));
  check('the page\'s "What satellites saw" card shows the greenness first, then the others as "Not read yet"', sat.indexOf('MODIS greenness') < sat.indexOf('GRACE-FO') && /Peak greenness has been steady since 2001\./.test(sat) && /GRACE-FO water storage:<\/b> Not read yet\./.test(sat));
  check('with the load running the card says it is reading, and with nothing asked it says the lookup is not connected', historyHTML({ ...base, extras: { modis: { status: 'loading' } } }).includes('does not wait for it') && /The greenness history since 2001 is not read yet/.test(historyHTML({ ...base, extras: {} })));
  check('the old way still works: a plain words extra is shown as it was', /Peak is steady\./.test(historyHTML({ ...base, extras: { modis: { words: 'Peak is steady.' } } })));
  check('no money or chance word on the greenness card', !/\b(price|profit|income|chance|likely|probabl\w*|worth)\b/i.test(text(item)));
}
{
  forgetAll(); const asked = []; const get = async url => { asked.push(url); return { json: async () => STEADY }; };
  const [a, b] = await Promise.all([loadGreenness({ lat: 43.1312, lon: -80.7499 }, get), loadGreenness({ lat: 43.1312, lon: -80.7499 }, get)]);
  check('the route is asked once for one place, with the position to four decimals, and the answer is the cleaned one', asked.length === 1 && asked[0] === '/api/ndvihist?lat=43.1312&lon=-80.7499' && a.ok && b.ok && a.seasons.length === 25, asked.join());
  forgetAll(); same('a failed ask is the plain sentence, and is asked again next time', [(await loadGreenness({ lat: 1, lon: 2 }, async () => { throw new Error('x'); })).reason, (await loadGreenness({ lat: 1, lon: 2 }, async () => ({ json: async () => ({ ok: false, reason: 'later' }) }))).reason], [GREEN_DOWN, 'later']);
  same('no place, no request', (await loadGreenness({}, async () => { throw new Error('asked'); })).reason, GREEN_DOWN); forgetAll();
}
console.log(`greenness: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
