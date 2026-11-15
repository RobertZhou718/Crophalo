// Crophalo's weather-week suite: the alerts at every threshold, each naming its days and what to do; the quiet week said only when all seven days were read; the soil temperature and the water lines with their units (°F and inches for a field in the United States, °C and mm elsewhere);
// a missing forecast; and the three new blocks on the Weather tab. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_weather_week.mjs
import { weekAlerts, weekStatus, soilLine, waterLine, weekBlockHTML, QUIET, CALM_WORDS } from '../js/weather-week.js';
import { forecastHTML } from '../js/weather-view.js';
import { METRIC, IMPERIAL } from '../js/units.js';
import { esc } from '../js/words.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const day = (date, o = {}) => ({ date, tmin: 5, tmax: 18, rain: 0, wind: 10, code: 1, ...o });
const DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];   // Mon to Sun
const calm = DATES.map(d => day(d));
same('a quiet week gives no alert', weekAlerts(calm, METRIC), []);
check('a quiet week with all seven days read says so', weekStatus(calm, METRIC).quiet === QUIET && /No frost, heat, heavy rain or strong wind/.test(QUIET));
check('a quiet week is not said when fewer than seven days were read', /Only 4 of the next 7 days were read, so a quiet week cannot be said\./.test(weekStatus(calm.slice(0, 4), METRIC).quiet) && weekStatus([], METRIC).quiet === '');
// thresholds: frost at 0 °C or below, heat from 35, heavy rain from 20 mm, wind from 40 km/h, thunderstorm from code 95
const one = (kind, o) => weekAlerts([day('2026-11-18', o)], METRIC).filter(a => a.kind === kind).length;
check('frost: a night at 0 °C is an alert, 0.1 °C is not', one('frost', { tmin: 0 }) === 1 && one('frost', { tmin: 0.1 }) === 0);
check('heat: 35 °C is an alert, 34.9 is not', one('heat', { tmax: 35 }) === 1 && one('heat', { tmax: 34.9 }) === 0);
check('heavy rain: 20 mm is an alert, 19.9 is not', one('rain', { rain: 20 }) === 1 && one('rain', { rain: 19.9 }) === 0);
check('wind: 40 km/h is an alert, 39.9 is not', one('wind', { wind: 40 }) === 1 && one('wind', { wind: 39.9 }) === 0);
check('thunderstorm: codes 95, 96 and 99 are alerts, 80 is not', [95, 96, 99].every(c => one('storm', { code: c }) === 1) && one('storm', { code: 80 }) === 0);
check('a value that was not read never makes an alert', weekAlerts([day('2026-11-18', { tmin: NaN, tmax: NaN, rain: NaN, wind: NaN, code: NaN })], METRIC).length === 0);
const frosty = [day('2026-11-19', { tmin: -1.4 }), day('2026-11-20', { tmin: -3.2 }), day('2026-11-21', { tmin: -0.5 }), ...calm.slice(0, 3)];
const a = weekAlerts(frosty, METRIC)[0];
check('an alert names its days and what to do, with the coldest figure in the farmer\'s units', a.kind === 'frost' && a.days.join() === 'Thu,Fri,Sat' && /^Thu, Fri and Sat: the night falls to −3 °C or lower\. Tender plants, flowers and young shoots can be hurt\. Cover them if you can\.$/.test(a.words), a.words);
check('a US field reads °F', /the night falls to 26 °F or lower/.test(weekAlerts(frosty, IMPERIAL)[0].words) && /up to 97 °F/.test(weekAlerts([day('2026-11-18', { tmax: 36 })], IMPERIAL)[0].words), weekAlerts(frosty, IMPERIAL)[0].words);
check('heavy rain follows inches and wind follows miles an hour on a US field', /up to 1\.2 in of rain in one day/.test(weekAlerts([day('2026-11-18', { rain: 30 })], IMPERIAL)[0].words) && /gusts to 31 mph/.test(weekAlerts([day('2026-11-18', { wind: 50 })], IMPERIAL)[0].words) && /gusts to 50 km\/h/.test(weekAlerts([day('2026-11-18', { wind: 50 })], METRIC)[0].words));
same('alerts come in the order frost, heat, heavy rain, wind, thunderstorm', weekAlerts([day('2026-11-18', { tmin: -2, tmax: 36, rain: 25, wind: 45, code: 95 })], METRIC).map(x => x.kind), ['frost', 'heat', 'rain', 'wind', 'storm']);
check('with an alert the quiet sentence is gone', weekStatus(frosty, METRIC).alerts.length === 1 && weekStatus(frosty, METRIC).quiet === '');
// soil and water
const week = { soilT: [{ date: '2026-11-16', value: 4.2 }, { date: '2026-11-17', value: 3.8 }, { date: '2026-11-18', value: NaN }, { date: '2026-11-19', value: 5.1 }], water: { et0: 12.4, rain: 30, days: 7 } };
check('the soil line gives the average and the range of the days read, and how many', /^Soil temperature 6 cm down: about 4 °C on average this week, from 4 °C to 5 °C \(3 days read\)\.$/.test(soilLine(week, METRIC)), soilLine(week, METRIC));
check('a US field reads the soil in °F', /about 40 °F on average this week, from 39 °F to 41 °F/.test(soilLine(week, IMPERIAL)), soilLine(week, IMPERIAL));
check('no soil reading says it is not read', soilLine({ soilT: [] }, METRIC) === 'Soil temperature (6 cm down) is not read for this week.' && /not read/.test(soilLine(null, METRIC)));
check('the water line gives the loss, the rain forecast and which is more, in millimetres or inches', /about 12 mm\. Rain forecast: 30 mm\. The forecast brings more rain than the air takes\./.test(waterLine(week, METRIC)) && /about 0\.5 in\. Rain forecast: 1\.2 in\./.test(waterLine(week, IMPERIAL)) && /More water leaves the field than the forecast brings/.test(waterLine({ water: { et0: 40, rain: 5, days: 7 } }, METRIC)));
check('water loss is not added up from fewer than seven days', /not worked out: it needs all 7 days of the forecast \(5 were read\)/.test(waterLine({ water: { et0: NaN, rain: NaN, days: 5 } }, METRIC)) && /not worked out/.test(waterLine(null, METRIC)));
check('the calm-day rule is written out with its numbers', /under 1 mm of rain, a rain chance under 40 in 100, wind under 20 km\/h, a night above 0 °C and a day under 35 °C/.test(CALM_WORDS) && /weather check only/.test(CALM_WORDS));
// the tab
const html = weekBlockHTML({ ...week, days: frosty }, METRIC, esc);
check('the block has the alert, the soil line, the water line and the fold, and says nothing made up', /wk-alert is-frost/.test(html) && /wk-soil/.test(html) && /wk-water/.test(html) && /id="wkCalm"/.test(html) && !/wk-quiet/.test(html) && /How we pick the calm, dry days/.test(html));
const tab = forecastHTML({ days: calm.map(d => ({ date: d.date, name: 'Mon', hi: 18, lo: 5, rain: 0, rainText: 'dry', icon: 'leaf', calm: true })), week: { ...week, days: calm, today: '2026-11-16' } }, METRIC);
check('the Weather tab\'s week shows the quiet-week line, the soil line, the water line and the calm-day fold', /No frost, heat, heavy rain or strong wind/.test(tab) && /Soil temperature 6 cm down/.test(tab) && /Water the air takes/.test(tab) && /How we pick the calm, dry days/.test(tab));
check('on a US field the day tiles read °F and inches', (() => { const t = forecastHTML({ days: [{ date: '2026-11-16', name: 'Mon', hi: 20, lo: 0, rain: 5, rainText: '5 mm', icon: 'rain', calm: false }], week: { days: [day('2026-11-16', { tmax: 20, tmin: 0, rain: 5 })], today: '2026-11-16' } }, IMPERIAL); return />68°</.test(t) && />32°</.test(t) && /0\.2 in/.test(t); })());
check('a missing forecast still says so and adds nothing', /The forecast is not available right now/.test(forecastHTML({ days: [], week: null }, METRIC)) && !/wk-soil/.test(forecastHTML({ days: [], week: null }, METRIC)));
check('words are plain text and no chance word is used', !/<img|<script/.test(weekBlockHTML({ days: [] }, METRIC, esc)) && !/\b(chance of|likely|probably|guarantee)\b/i.test(weekAlerts(frosty, METRIC)[0].words + CALM_WORDS.replace('a rain chance under', 'a rain level under')));
console.log(`weather_week: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
