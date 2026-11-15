// Crophalo's Weather-tab suite: the figures and the markup, tested on a recorded real NASA POWER answer for Barrie (and its forecast), plus the rules by hand:
// every figure has its "i", every count has its denominator, the record never says a chance, a missing forecast leaves the rest standing, and a day with a reading
// missing is never called calm. RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_weather_tab.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { hotTile, buildWeather, isCalm, rainWords, dayIcon, longDay, CALM } from '../js/weather-data.js';
import { loadSmap, SMAP_LABEL } from '../js/report-load.js';
import { weatherHTML, forecastHTML, chartSVG, chartTable, chartCard, chartZoomHTML } from '../js/weather-view.js';
const YR = 2026;   // the year of the recorded answer's newest days: the dates below are written from it

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'));
const RECORDED = fx('power_barrie.json'), loc = { lat: RECORDED.geometry.coordinates[1], lon: RECORDED.geometry.coordinates[0] }, NOW = Date.UTC(2026, 10, 14, 12);   // the place is the one the recorded answer was asked for; swap the file when the engine's field is recorded

const series = buildSeries(RECORDED, loc);
check('the recorded NASA POWER answer becomes a daily record', !!series && series.days.length > 9000 && series.source === 'power', series?.days?.length);
const climate = computeClimate(series, loc.lat);
const w = buildWeather({ series, climate, forecast: fx('forecast_barrie.json'), loc, now: NOW });
check('the tab\'s figures are built', w.ok === true && w.years >= 20 && w.first === 2001, brief([w.ok, w.years, w.first, w.last]));
same('weather through the last day that holds both temperatures', w.through, `${YR}-11-12`);
same('the date in words', longDay(w.through), `12 November ${YR}`);
same('four tiles: rain so far, hot days, soil wetness, warmth', w.tiles.map(t => t.id), ['rain', 'hot', 'soil', 'warm']);
check('every tile has a title, a figure, a status word with its own tone and a plain line', w.tiles.every(t => t.title && t.value && t.status && ['good', 'watch', 'risk', 'unclear'].includes(t.tone) && t.text.length > 10 && t.sources.length), brief(w.tiles.map(t => [t.id, t.value, t.status])));
check('no figure says "NaN" or "undefined" anywhere', !/NaN|undefined|null/.test(JSON.stringify([w.tiles, w.facts, w.charts.map(c => [c.title, c.words, c.how])])));
const ids = w.facts.map(f => f.id);
same('the facts, in order', ids, ['rain', 'frost', 'free', 'heat', 'heavy', 'dry', 'dryyears', 'cold', 'trend']);
check('the yearly rain says how many years it counts, of how many', /the middle of \d+ years \(2001–\d{4}\); \d+ of \d+ years counted/i.test(w.facts[0].text), w.facts[0].text);
check('the dry years are counted as N of M', /^\d+ of \d+ years$/.test(w.facts.find(f => f.id === 'dryyears').value));
check('the frost line is counted night by night with its denominator', /of \d+ years/.test(w.facts.find(f => f.id === 'frost').text), w.facts.find(f => f.id === 'frost').text);
check('the coldest night names the year it stands for (a cold winter, the Nth coldest of N years), never a chance', /the \d+(st|nd|rd|th) coldest of \d+ years/.test(w.facts.find(f => f.id === 'cold').text), w.facts.find(f => f.id === 'cold').text);
const RECORD_WORDS = /\b(chance|probability|probably|likely|forecast|predict|odds)\b/i;
check('the record never says a chance, a probability or a forecast', !RECORD_WORDS.test(JSON.stringify([w.facts, w.charts.map(c => c.words)])), JSON.stringify(w.facts).match(RECORD_WORDS)?.[0]);
check('NASA POWER is the source of the record, and satellite rain adds GPM', w.facts[0].sources.includes('power') && w.facts.every(f => f.sources.length));
// charts
same('three charts: rain by month, heat and cold by month, rain by year', w.charts.map(c => c.id), ['rainmonth', 'tempmonth', 'rainyear']);
check('the month charts have twelve labels and the year chart one per year counted', w.charts[0].labels.length === 12 && w.charts[1].labels.length === 12 && w.charts[2].labels.length === w.years);
check('the year chart has the middle year as its line', Number.isFinite(w.charts[2].median) && w.charts[2].median === climate.med.P);
const svg = chartSVG(w.charts[0]);
check('a chart is an image with a name that holds its summary, and bars for each month', /role="img" aria-label="Rain by month in a normal year\./.test(svg) && (svg.match(/class="ch-bar/g) ?? []).length === 12);
check('the table lists every number with its unit', (chartTable(w.charts[0]).match(/<tr>/g) ?? []).length === 13 && /Rain \(mm\)/.test(chartTable(w.charts[0])));
check('a missing value is "Not read" in the table and has no bar', (() => { const c = { ...w.charts[0], series: [{ name: 'Rain', cls: 'rain', values: [10, NaN, 30, ...Array(9).fill(5)] }] }; return /Not read/.test(chartTable(c)) && (chartSVG(c).match(/class="ch-bar/g) ?? []).length === 11; })());
check('a chart with no values draws nothing rather than an empty frame', chartSVG({ ...w.charts[0], series: [{ name: 'x', cls: 'rain', values: Array(12).fill(NaN) }] }) === '');
check('a temperature below zero is written with a true minus', /−\d/.test(chartTable({ ...w.charts[1], signed: true, series: [{ name: 'Low', cls: 'lo', values: [-5.2, ...Array(11).fill(3)] }] })));
const card = chartCard(w.charts[0]);
check('every chart card has its "i" and an Enlarge button that names the chart', /class="srci/.test(card) && /aria-label="Enlarge: Rain by month in a normal year"/.test(card) && /aria-haspopup="dialog"/.test(card));
const zoom = chartZoomHTML(w.charts[2]);
check('the large view has a title, Done, how to read it, in words, the numbers and where it comes from', ['id="czTitle"', 'data-zoom-close', 'How to read it', 'In words', 'The numbers', 'Where it comes from', '<table'].every(x => zoom.includes(x)));
// the forecast
check('the next 7 days are the 7 days from today, each with a name, a high, a low and rain in words', w.days.length === 7 && w.days.every(d => d.name && Number.isFinite(d.hi) && Number.isFinite(d.lo) && d.rainText) && w.days[0].date === `${YR}-11-14`, brief(w.days.map(d => d.date)));
const calmDay = { rain: 0, rainChance: 10, wind: 10, tmin: 4, tmax: 18 };
same('a calm, dry day', isCalm(calmDay), true);
same('each limit: rain 1 mm, chance 40, wind 20, frost, 35 °C', [isCalm({ ...calmDay, rain: 1 }), isCalm({ ...calmDay, rainChance: 40 }), isCalm({ ...calmDay, wind: 20 }), isCalm({ ...calmDay, tmin: 0 }), isCalm({ ...calmDay, tmax: 35 }), isCalm({ ...calmDay, rain: 0.9, rainChance: 39, wind: 19.9, tmin: 0.1, tmax: 34.9 })], [false, false, false, false, false, true]);
same('a day with any reading missing is never called calm', [isCalm({ ...calmDay, wind: NaN }), isCalm({ ...calmDay, rainChance: NaN }), isCalm({ ...calmDay, rain: NaN }), isCalm({ ...calmDay, tmin: NaN }), isCalm({})], [false, false, false, false, false]);
same('rain in words', [rainWords(0.2), rainWords(1.5), rainWords(7.26), rainWords(18), rainWords(NaN)], ['dry', 'a little rain', '7.3 mm', '18 mm', 'rain not read']);
same('the icon: frost, rain, hot, mild', [dayIcon({ tmin: -1, rain: 0, tmax: 5 }), dayIcon({ tmin: 3, rain: 4, tmax: 14 }), dayIcon({ tmin: 18, rain: 0, tmax: 33 }), dayIcon({ tmin: 5, rain: 0, tmax: 15 })], ['frost', 'rain', 'sun', 'leaf']);
same('the limits are the published ones', CALM, { rain: 1, chance: 40, wind: 20, frost: 0, heat: 35 });
// the page
const html = weatherHTML(w);
const at = s => html.indexOf(s);
check('sections in order: the line "weather through", the next 7 days, this year so far, the climate record, the regional reading', at('Weather through') > 0 && at('Weather through') < at('The next 7 days') && at('The next 7 days') < at('This year so far') && at('This year so far') < at('Your climate, 2001') && at('Your climate, 2001') < at('A regional reading'));
check('"weather through" names the date, with NASA POWER\'s "i"', new RegExp(`Weather through <b>12 November ${YR}</b>\\s*<button[^>]*class="srci nasa"`).test(html));
check('the forecast\'s "i" is the outlined one, with its date', /The next 7 days <button[^>]*class="srci"[^>]*data-src="forecast"/.test(html) && /For 7 days from 14 November 2026/.test(html));
const buttons = (html.match(/<button[^>]*class="srci/g) ?? []).length;
check('every tile, every fact and every chart has an "i"', buttons >= w.tiles.length + w.facts.length + w.charts.length + 3, `${buttons} buttons`);
check('every "i" names its sources and starts closed', (html.match(/<button[^>]*class="srci[^>]*aria-expanded="false"[^>]*data-src="[a-z0-9,]+"/g) ?? []).length === buttons);
// The region card never says "not read yet" (the owner's rule: no empty promise): with no value it says "No value for this area" and why.
check('the regional reading says "No value for this area", and shows the square, not a pattern in the field', /No value for this area/.test(html) && /region-pic/.test(html) && /not a reading inside your field|Crophalo has no reading/.test(html));
check('the lead says a rain gauge can differ and should be trusted over these totals', /A rain gauge near you can read quite differently/.test(html) && /trust it over these totals/.test(html));
check('each tile has a status word and a shape, never colour alone', (html.match(/class="mark (good|watch|risk|unclear)"/g) ?? []).length === 4 && (html.match(/class="wk-status"><span class="mark [a-z]+" aria-hidden="true"><\/span><b>[^<]+<\/b>/g) ?? []).length === 4);
check('a calm day is tagged in words', !html.includes('is-calm') || /Calm, dry/.test(html));
// a missing forecast leaves the rest standing
const noFc = buildWeather({ series, climate, forecast: null, loc, now: NOW }), htmlNo = weatherHTML(noFc);
check('no forecast: the section says so plainly, and the record and the year so far are still there', /The forecast is not available right now/.test(htmlNo) && /This year so far/.test(htmlNo) && /Your climate, 2001/.test(htmlNo) && noFc.days.length === 0);
check('a forecast answer that cannot be read is the same', buildWeather({ series, climate, forecast: { daily: {} }, loc, now: NOW }).days.length === 0);
// no record at all
// the report's one page says what could not be worked out, never "not read yet" (NOT_READ in js/report-view.js changed on purpose with the one-page report)
same('no daily record: not read, and nothing is made up', [weatherHTML(null).includes('could not be worked out'), buildWeather({ series: null, climate: null, loc, now: NOW }).ok], [true, false]);
check('a reason from buildWeather is shown', weatherHTML({ ok: false, reason: 'No weather.' }).includes('No weather.'));
check('words from outside are plain text', !/<img src=x/.test(weatherHTML({ ...w, note: '<img src=x onerror=1>' }, {})) && !/<img src=x>/.test(chartCard({ ...w.charts[0], title: '<img src=x>', words: '<b>x</b>' })));
check('a custom reading replaces the empty slot', weatherHTML(w, { reading: { label: 'Root-zone soil moisture', value: 0.31, date: `${YR}-11-12`, km: 9, lat: loc.lat, lon: loc.lon, source: 'smap' } }).includes('31% water by volume'));
const OLD_TR = new RegExp('\\b' + 'Tur' + 'key' + '\\b');   // the old English spelling, written in pieces so this file never holds it
check('no old spelling of Türkiye and no key names but crophalo.* in the markup', !OLD_TR.test(html) && !/\bfw\./.test(html));

// ---- the regional reading through the server's route (stubbed here)
const answer = body => async url => ({ json: async () => body, url });
let asked = '';
const live = await loadSmap(loc, async url => { asked = url; return { json: async () => ({ ok: true, value: 0.31, date: `${YR}-11-12`, cell: { km: 9 } }) }; });
check('the route is asked for the field\'s own position', new RegExp(`^/api/smaproot\\?lat=${loc.lat.toFixed(4)}&lon=${loc.lon.toFixed(4)}$`).test(asked), asked);
check('a good answer is a reading with its value, date, footprint and source', live.value === 0.31 && live.date === `${YR}-11-12` && live.km === 9 && live.source === 'smap' && live.label === 'Moisture around the roots' && live.why === '');
check('the card shows it as one regional value for the whole area it covers', (() => { const h = weatherHTML(w, { reading: live }); return h.includes('31% water by volume') && h.includes(`12 November ${YR}`) && /one figure for the whole area, a square about 9 km wide/.test(h) && h.includes('Moisture around the roots'); })());
const refused = await loadSmap(loc, answer({ ok: false, reason: 'NASA has no SMAP reading for this day yet.' }));
check('a refusal says why under "No value for this area"', refused.value === null && refused.why === 'NASA has no SMAP reading for this day yet.' && /No value for this area/.test(weatherHTML(w, { reading: refused })) && weatherHTML(w, { reading: refused }).includes('NASA has no SMAP reading for this day yet.'));
same('the failures give no value', (await Promise.all([async () => { throw new Error('down'); }, async () => ({ json: async () => { throw new SyntaxError('x'); } }), answer({ ok: true, value: 4 }), null].map(g => loadSmap(loc, g)))).map(r => [r.value, /did not answer/.test(r.why)]), Array(4).fill([null, true]));
same('a place that is not a place is not asked', (await loadSmap({ lat: 'x', lon: 1 }, async () => { throw new Error('asked'); })).value, null);
check('the reading names SMAP, so its "i" is NASA\'s', live.source === 'smap' && /srci nasa/.test(weatherHTML(w, { reading: live }).split('A regional reading')[1]));
// ---- the hot-days tile follows the comparison with the usual, honestly
{
  const base = { status: 'Good', text: 'Heat stress is rare here. So far in 2026: 11 (normal by now 6).' };
  const more = hotTile(base, { year: 2026, hot: { total: 11, normal: 6 } });
  check('11 so far against a usual 6 is not "Good": it says there were more hot days than usual, with both numbers', more.status === 'Watch' && /More hot days than usual: 11 so far, 6 is normal by now/.test(more.text) && !/rare here/.test(more.text), brief(more));
  check('a place that is already a risk stays a risk', hotTile({ status: 'Risk', text: 'Heat can hurt crops at flowering.' }, { year: 2026, hot: { total: 40, normal: 20 } }).status === 'Risk');
  same('near the usual (7 against 6) the place\'s own word stands', hotTile(base, { year: 2026, hot: { total: 7, normal: 6 } }), base);
  const fewer = hotTile({ status: 'Watch', text: 'Heat can hurt crops at flowering. So far in 2026: 2 (normal by now 8).' }, { year: 2026, hot: { total: 2, normal: 8 } });
  check('far fewer than usual says so, and does not call it a risk this year', fewer.status === 'Watch' && /Fewer hot days than usual: 2 so far, 8 is normal by now/.test(fewer.text), brief(fewer));
  same('with no figure for this year, nothing changes', [hotTile(base, null), hotTile(base, { hot: { total: null, normal: 6 } }), hotTile({ status: 'Unknown', text: 'x' }, { hot: { total: 5, normal: 1 } })], [base, base, { status: 'Unknown', text: 'x' }]);
  same('a small difference at a small number is not "more" (2 against 1)', hotTile({ status: 'Good', text: 'Heat stress is rare here.' }, { year: 2026, hot: { total: 2, normal: 1 } }).status, 'Good');
}

console.log(`weather tab: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
