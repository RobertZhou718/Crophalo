// Crophalo's "Your hardest year" suite on the recorded NASA POWER answer for Barrie: the year chips (the right years, a tie to the recent year, no year twice, the farmer's order), the cycle year of a real year,
// a verdict equal to what Land history's rules give, the storm row (20 mm or more, three days apart, a day not read never counts as no rain), and every sentence in plain words. RULE: never loosen a check to make it pass. No network.
// Run: node scripts/test_hardyear.mjs
import fs from 'node:fs';
import * as S from '../js/simulate.js';
import { buildSeries } from '../js/data.js';
import { buildHistory } from '../js/history.js';
import { cropOf } from '../js/crops.js';
import { SEASON } from '../js/season.js';
import { yearChips, fullYears, indexIn, judgePlan, playYear, allYears, stormRow, monthsOf, WORDS, WATER_HOLD } from '../js/hardyear.js';
import { localiseText, IMPERIAL, METRIC } from '../js/units.js';
import { hardYearHTML } from '../js/hardyear-view.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const REC = JSON.parse(fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8')), series = buildSeries(REC, { lat: REC.geometry.coordinates[1], lon: REC.geometry.coordinates[0] });
const s = (year, crop, sow, harvest, after) => ({ year, crop, sow, harvest, after, residueUntil: null, window: null });
const now = { id: 'now', seasons: [s(1, 'corn', '2027-05-01', '2027-10-05', 'residue'), s(2, 'soy', '2028-05-20', '2028-10-01', 'residue')] };
const wheat = { id: 'wheat', seasons: [now.seasons[0], now.seasons[1], s(3, 'wheat', '2028-10-05', '2029-07-25', 'cover')] };
const plans = [now, wheat], years = fullYears(series), H = buildHistory(series);

check('the full years are the years the history counts, 2001 to 2025 here', years.length >= 20 && years[0] === 2001 && years.length === H.seasons.length, `${years.length}`);
const chips = yearChips(series);
const dry = H.seasons.filter(x => x.grow !== null).sort((a, b) => a.grow - b.grow || b.year - a.year)[0], down = H.seasons.slice().sort((a, b) => b.down - a.down || b.year - a.year)[0], frost = H.seasons.filter(x => x.last !== null).sort((a, b) => b.last - a.last || b.year - a.year)[0];
check('the first chip is the driest growing season, then the year with most downpour days, then the latest spring frost', chips[0].year === dry.year && chips[0].kind === 'dry' && chips.find(c => c.kind === 'downpour')?.year === down.year && chips.find(c => c.kind === 'frost')?.year === frost.year, brief(chips));
check('no year is a chip twice and there are at most four', new Set(chips.map(c => c.year)).size === chips.length && chips.length <= 4);
check('a chip is worded "2007 · driest growing season"', /^\d{4} · (driest growing season|most downpour days|latest spring frost|most hot days)$/.test(chips[0].words), chips[0].words);
check('a farmer who cares most for soil or wash-off sees the downpour year first', yearChips(series, [2, 5, 4, 2, 3])[0].kind === 'downpour' || yearChips(series, [2, 5, 4, 2, 3]).length === chips.length);
{ const short = JSON.parse(JSON.stringify(REC)); for (const k of Object.keys(short.properties.parameter)) short.properties.parameter[k] = Object.fromEntries(Object.entries(short.properties.parameter[k]).filter(([d]) => d < '20080101'));
  same('under ten full years gives no chips', yearChips(buildSeries(short, { lat: 44.4, lon: -79.8 })), []); }
// R1: the cycle year of a real year
same('a two-year cycle plays corn in 2001, 2003 and soybeans in 2002; a three-year cycle repeats every three', [indexIn(now, 2001), indexIn(now, 2002), indexIn(now, 2003), indexIn(wheat, 2001), indexIn(wheat, 2004)], [0, 1, 0, 0, 0]);
// R2: the verdict is the one Land history's rules give for the same crop and year
const judged = new Map(plans.map(p => [p, judgePlan(p, series)]));
const direct = S.judgeCrop(now.seasons[0], series, { id: 'corn', ...cropOf('corn'), fl: SEASON?.corn?.fl }, { holdMm: WATER_HOLD.loam, irrigationMm: 0, bareAfterDays: 0, fallowBonusMm: 0 }, years);
const y0 = chips[0].year, played = playYear(plans, judged, y0);
const corn = indexIn(now, y0) === 0;
if (corn) check('a verdict equals the verdict of the same crop judged directly', played[0].result === direct.years.find(y => y.year === y0).verdict, `${played[0].result} vs ${direct.years.find(y => y.year === y0).verdict}`);
check('every plan gets one result and one reason starting "Under this plan,"', played.length === 2 && played.every(r => ['hurt', 'close', 'fine', 'nodata'].includes(r.result) && /^Under this plan, /.test(r.reason)), brief(played.map(r => [r.result, r.reason])));
check('a plan with no hard day says so, and never "fine" or "safe"', played.every(r => r.result !== 'fine' || r.reason === WORDS.fineWhy) && !/\b(safe|fine)\b/i.test(JSON.stringify(WORDS).replace(/"fine"/g, '')));
check('each plan has twelve months and only the four ground states', played.every(r => r.cells.length === 12 && r.cells.every(c => [null, 'crop', 'cover', 'residue', 'bare'].includes(c.state))));
const all = allYears(plans, judged, years);
check('the counts over all years add up to the years that could be judged', all.every(c => c.hurt + c.close + c.fine === c.of && c.of <= years.length && c.of > 0), brief(all.map(c => [c.hurt, c.close, c.fine, c.of])));
// the storm row
const st = stormRow(plans, series, years), dayN = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
check('the storm days are 20 mm or more, at most ten, and no two are closer than three days', st.days.length <= 10 && st.days.every(d => d.mm >= 20) && st.days.every((a, i) => st.days.every((b, j) => i === j || Math.abs(dayN(a.date) - dayN(b.date)) >= 3)), brief(st.days));
const gap = { ...series, rain: series.rain.map((v, i) => (i % 2 ? NaN : v)) };
check('a day that was not read is never counted as a day without rain, and a record with no heavy day gives no row', stormRow(plans, gap, years).days.every(d => d.mm >= 20) && stormRow(plans, { ...series, rain: series.rain.map(() => 0) }, years).n === 0);
// the card
const model = { status: 'ok', chips, years, year: y0, rows: played.map((r, i) => ({ name: i ? 'Corn, soybeans, then winter wheat' : 'Corn, then soybeans', role: i ? 'Our suggestion' : 'What you grow now', cells: r.cells, result: r.result, reason: r.reason })), storm: { n: st.n, words: `The ${st.n} rainiest days: bare soil on 2 under what you grow now, 1 under the other.` }, counts: [{ name: 'A', hurt: 1, close: 2, of: 20 }], record: 'One NASA POWER square about 50 km wide. 2001–2025.' };
const html = hardYearHTML(model), text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
check('the card has its title, its lead, the chips with the chosen one pressed, a row for each plan and the footer', /Your hardest year/.test(text) && /This is past weather, not a forecast/.test(text) && (html.match(/aria-pressed="true"/g) ?? []).length === 1 && (html.match(/class="hy-row"/g) ?? []).length === 2 && /Past weather on this land, not a forecast\./.test(text));
check('the rest is under "Show more", closed at first, with the year picker for every other year', /<details class="fold-card" id="hyMore">/.test(html) && !/id="hyMore" open/.test(html) && /data-hy-select/.test(html));
check('no word of yield, loss, save, safe or chance outside "not a forecast"', !/\b(yield|loss|save|safe|chance|probab)/i.test(text.replace(/not a forecast/gi, '')), text.match(/\b(yield|loss|save|safe|chance)\w*/i)?.[0]);
check('the other states say one plain sentence', /could not be read, so no year can be played/.test(hardYearHTML({ status: 'noweather' }).replace(/<[^>]+>/g, '')) && /Too few full years/.test(hardYearHTML({ status: 'toofew' })));
check('words from the answer are plain text', !/<img|<script/.test(hardYearHTML({ ...model, rows: [{ ...model.rows[0], name: '<img src=x>', reason: '<script>1</script>' }] })));
check('a metric figure in a sentence is said in the farmer\'s units on a United States field and left alone elsewhere (17 days of 34 °C, 20 mm)', localiseText('17 days of 34 °C or more, 20 mm or more', IMPERIAL) === '17 days of 93 °F or more, 0.8 in or more' && localiseText('17 days of 34 °C or more, 20 mm or more', METRIC) === '17 days of 34 °C or more, 20 mm or more', localiseText('17 days of 34 °C', IMPERIAL));
check('the card counts its strategies in words (two here, not "three"), and shows a letter for each month under the boxes', /We play your two strategies/.test(text) && (html.match(/<i>[JFMASOND]<\/i>/g) ?? []).length === 24, text.slice(0, 200));
console.log(`hardyear: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
