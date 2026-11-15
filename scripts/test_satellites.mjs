// Crophalo's Satellites & prices suite: the last 30 days of NASA GPM satellite rain as the server gives them, and the cards around them. A day nobody read is a gap and never 0 mm,
// the newest days are first estimates, and the square is said to be a square and not a gauge. The server's route is replaced by a stub. RULE: never loosen a check to make it pass;
// fix the project. No internet is needed. Run: node scripts/test_satellites.mjs
import { cleanRain, rainWords, squareWords, loadImerg, longDay, dayWords, RAIN_DOWN } from '../js/satellites-data.js';
import { satellitesHTML, rainCardHTML, rainChartSVG, rainTable, moistureCardHTML } from '../js/satellites-view.js';
import { ALL_SOURCES } from '../js/sources.more.js';
const YR = 2026;   // the year of the hand-made satellite-rain answer's days: the dates below are written from it

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// an answer in the real format (30 days ending on 13 November of the year above, the last two from the Early Run)
const START = Date.UTC(YR, 9, 15), day = i => new Date(START + i * 864e5).toISOString().slice(0, 10);
const rain = i => [0.17, 5.28, 0, 0, 1.2, 12.4, 0.3, 0, 0, 7.1][i % 10];
const days = Array.from({ length: 30 }, (_, i) => [day(i), rain(i), i >= 28 ? 'early' : 'late']);
const GOOD = { ok: true, source: 'NASA GPM IMERG daily precipitation, version 07', data_date: `${YR}-10-15/${YR}-11-13`, cell: { lat: 43.15, lon: -80.75, width_km: 8.1, height_km: 11.1 }, days, days_read: 30, total_mm: 0, late: 28, early: 2, first_estimate: [day(28), day(29)], newest_day: day(29), note: 'x' };

const r = cleanRain(GOOD);
check('a good answer is rebuilt: 30 days, all read, the total, the newest day, the early days', r.ok && r.days.length === 30 && r.read === 30 && r.missing === 0 && r.newest === `${YR}-11-13` && JSON.stringify(r.early) === JSON.stringify([`${YR}-11-12`, `${YR}-11-13`]), brief([r.read, r.newest, r.early]));
check('the total is the sum of the days read, to one decimal', r.total === Math.round(days.reduce((s, d) => s + d[1], 0) * 10) / 10);
same('the square is the cell\'s own size', r.cell, { w: 8.1, h: 11.1 });
// gaps
const gap = cleanRain({ ...GOOD, days: days.map((d, i) => i === 3 || i === 29 ? [d[0], null, null] : d), incomplete: '2 days could not be read' });
check('a day with no value is a gap: not 0, and out of the total', gap.days[3].mm === null && gap.read === 28 && gap.missing === 2 && gap.total === Math.round(days.filter((d, i) => i !== 3 && i !== 29).reduce((s, d) => s + d[1], 0) * 10) / 10);
check('the newest day read skips a trailing gap', gap.newest === `${YR}-11-12`);
check('a day that is null stays null, never 0, even with a run name', cleanRain({ ...GOOD, days: [[`${YR}-11-01`, null, 'late']] }).days[0].mm === null && cleanRain({ ...GOOD, days: [[`${YR}-11-01`, null, 'late']] }).days[0].run === null);
check('numbers that cannot be rain are gaps (negative, huge, text, NaN)', cleanRain({ ...GOOD, days: [[`${YR}-11-01`, -1, 'late'], [`${YR}-11-02`, 5000, 'late'], [`${YR}-11-03`, '4', 'late'], [`${YR}-11-04`, NaN, 'late'], [`${YR}-11-05`, 2, 'late']] }).days.map(d => d.mm).join() === ',,,,2' || JSON.stringify(cleanRain({ ...GOOD, days: [[`${YR}-11-01`, -1, 'late'], [`${YR}-11-02`, 5000, 'late'], [`${YR}-11-03`, '4', 'late'], [`${YR}-11-04`, NaN, 'late'], [`${YR}-11-05`, 2, 'late']] }).days.map(d => d.mm)) === '[null,null,null,null,2]');
check('bad rows are dropped, the rest sorted by day', JSON.stringify(cleanRain({ ...GOOD, days: [[`${YR}-11-02`, 1, 'late'], null, 'x', ['nope', 1, 'late'], [`${YR}-11-01`, 2, 'late']] }).days.map(d => d.day)) === JSON.stringify([`${YR}-11-01`, `${YR}-11-02`]));
same('no usable days is a refusal', cleanRain({ ...GOOD, days: [] }), { ok: false, reason: RAIN_DOWN });
same('a refusal keeps its own reason, cut', [cleanRain({ ok: false, reason: 'NASA did not let this login read the rain files.' }).reason, cleanRain({ ok: false, reason: 'x'.repeat(500) }).reason.length], ['NASA did not let this login read the rain files.', 240]);
same('nothing, text, or ok that is not true is a refusal with the plain sentence', [null, 'x', { ok: 'yes', days }, {}].map(x => cleanRain(x).reason), Array(4).fill(RAIN_DOWN));
check('a hostile answer is read as plain data: extra keys never reach the result', (() => { const h = cleanRain({ ...GOOD, __proto__: { polluted: 1 }, constructor: 'x', evil: '<img src=x>' }); return !('evil' in h) && ({}).polluted === undefined; })());
// words
const w = rainWords(r);
check('the card\'s sentences: the total over the days read, the newest day, the first estimates, the square', w.lines[0].startsWith('') && /mm of rain over the 30 days read, of the last 30\./.test(w.lines[0]) && w.lines[1] === `Newest day read: 13 November ${YR}.` && /The newest 2 days are first estimates \(NASA’s Early Run\) and may change when the final run arrives\./.test(w.lines[2]) && w.lines.at(-1) === 'One value for a square about 8 by 11 km, not a gauge in your field.', brief(w.lines));
check('one early day is said in the singular', /The newest day is a first estimate/.test(rainWords(cleanRain({ ...GOOD, days: days.map((d, i) => [d[0], d[1], i === 29 ? 'early' : 'late']) })).lines.join(' ')));
check('gaps are said, as gaps and never as dry days', /2 days could not be read\. They are shown as gaps, never as dry days, so the total may be low\./.test(rainWords(gap).lines.join(' ')));
check('no first-estimate line when there are none', !/first estimate/.test(rainWords(cleanRain({ ...GOOD, days: days.map(d => [d[0], d[1], 'late']) })).lines.join(' ')));
same('the square words, with or without the cell', [squareWords({ w: 8.1, h: 11.1 }), squareWords(null)], ['One value for a square about 8 by 11 km, not a gauge in your field.', 'One value for a square about 8 by 11 km, not a gauge in your field.']);
check('a refused answer gives its reason as the one line', rainWords({ ok: false, reason: 'No.' }).lines[0] === 'No.');
// the route
let asked = '';
const via = body => async url => { asked = url; return { json: async () => body }; };
check('the route is asked for the field\'s own position', (await loadImerg({ lat: 43.13, lon: -80.75 }, via(GOOD)), asked === '/api/imergrain?lat=43.1300&lon=-80.7500'), asked);
check('a good answer comes back cleaned', (await loadImerg({ lat: 43.13, lon: -80.75 }, via(GOOD))).ok === true);
same('a network error, bad JSON, no place and no function are all the plain sentence', await Promise.all([loadImerg({ lat: 1, lon: 2 }, async () => { throw new Error('down'); }), loadImerg({ lat: 1, lon: 2 }, async () => ({ json: async () => { throw new SyntaxError('x'); } })), loadImerg({ lat: 'x', lon: 2 }, via(GOOD)), loadImerg({ lat: 1, lon: 2 }, null)]).then(l => l.map(x => x.reason)), Array(4).fill(RAIN_DOWN));
// the chart and the table
const svg = rainChartSVG(r), gsvg = rainChartSVG(gap);
check('the chart is an image with its summary, and 30 bars', /role="img" aria-label="Satellite rain for each of the last 30 days\. 30 read, 2 first estimates\."/.test(svg) && (svg.match(/class="sr-bar/g) ?? []).length === 30, svg.slice(0, 200));
check('the first estimates are drawn apart (their own class), and say so in their title', (svg.match(/class="sr-bar early"/g) ?? []).length === 2 && /\(first estimate\)/.test(svg));
check('a gap is a marker of its own, with its day in the title, and no bar', (gsvg.match(/class="sr-gap"/g) ?? []).length === 2 && (gsvg.match(/class="sr-bar/g) ?? []).length === 28 && /1[89] Oct: not read|18 Oct: not read/.test(gsvg));
const t = rainTable(gap);
check('the numbers table lists every day with its run, "Not read" for a gap', (t.match(/<tr>/g) ?? []).length === 31 && /Not read<\/td><td>Not read/.test(t) && /First estimate/.test(t) && /Final/.test(t) && /tabindex="0" role="region"/.test(t));
// the tab
const html = satellitesHTML({ rain: r, reading: { label: 'Moisture around the roots', value: 0.31, date: `${YR}-11-12`, km: 9, lat: 43.13, lon: -80.75, source: 'smap' } });
check('the heading and the lead say nothing is filled in', /Satellites &amp; prices/.test(html) && /never filled in/.test(html));
check('the rain card has its total, the chart, the legend, the lines and the numbers fold', ['Satellite rain, the last 30 days', 'sr-chart', 'First estimate', 'Not read', 'The numbers', 'not a gauge in your field'].every(x => html.includes(x)));
check('the rain card\'s "i" is NASA\'s, and says the newest day', /data-src="gpm"/.test(html) && /srci nasa/.test(rainCardHTML(r)) && rainCardHTML(r).includes(`Newest day: 13 November ${YR}.`));
check('the moisture card shows the regional value and says the 12-month view is not there yet', /31% water by volume/.test(html) && /A 12-month view is not available yet/.test(html));
check('the other cards say plainly "Not read yet" and what they will show, each with its "i"', ['grace', 'hls', 'ecostress', 'prices', 'pests'].every(id => new RegExp(`data-card="${id}"[\\s\\S]*?Not read yet`).test(html)) && (html.match(/data-card=/g) ?? []).length === 7);
check('the NASA ones carry the solid "i"', ['gpm', 'grace', 'hls', 'ecostress'].every(k => ALL_SOURCES[k].nasa === true) && ALL_SOURCES.worldbank.nasa === false && /data-src="grace"/.test(html));
check('while it loads: a status line, and no number', (h => /Reading 30 days of NASA satellite rain/.test(h) && !/\bmm\b/.test(h.replace(/30 days/g, '')))(rainCardHTML({ loading: true })));
check('refused: "Not read yet" and the reason, no number', (h => /Not read yet\.<\/b> NASA did not let this login read the rain files\./.test(h) && !/sr-chart/.test(h))(rainCardHTML({ ok: false, reason: 'NASA did not let this login read the rain files.' })));
check('no moisture reading yet: a status line', /Reading the NASA SMAP soil moisture/.test(moistureCardHTML(null)));
check('a refusal from outside is plain text', !/<img src=x/.test(rainCardHTML({ ok: false, reason: '<img src=x onerror=1>' })));
check('no chance or forecast wording in the satellite cards', !/\b(chance|probability|forecast)\b/i.test(html));
const OLD_TR = new RegExp('\\b' + 'Tur' + 'key' + '\\b');   // the old English spelling, written in pieces so this file never holds it
check('no old spelling of Türkiye, no old product name and no key names but crophalo.*', !OLD_TR.test(html) && !new RegExp('field' + 'wise', 'i').test(html) && !/\bfw\./.test(html));
same('dates in words', [dayWords(`${YR}-11-13`), longDay(`${YR}-11-13`), dayWords('x')], ['13 Nov', `13 November ${YR}`, '']);

console.log(`satellites: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
