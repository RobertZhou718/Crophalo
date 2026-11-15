// Crophalo's "Trends on this land" suite, on the recorded NASA POWER answers for Barrie and Oxford (and the recorded GRACE answer for Oxford): counts that add up, the 32 °C line equal to the Weather tab's,
// a trend named and drawn only when the t rule is met, the gaps never drawn as 0, the markup (every row's "i", its table, the past-weather line) and no chance word. RULE: never loosen a check to make it pass; fix the project.
// No internet is needed. Run: node scripts/test_trends.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { buildWeather } from '../js/weather-data.js';
import { cleanGrace } from '../js/satellites2-data.js';
import { cleanGreenness } from '../js/greenness.js';
import { SOURCES } from '../js/sources.js';
import '../js/sources.more.js';
import { trendOf } from '../js/history.js';
import { buildTrends, heatYears, graceYears, cropLimits, lineOf, nearStations, trendSentence, GRACE_MONTHS } from '../js/trends-data.js';
import { sectionHTML, rowHTML, rowSVG, rowTable, trendsHTML, trendsPartHTML, trendLines } from '../js/trends-view.js';
import { localiseText } from '../js/unitstext.js';
import { TW } from '../js/trends-words.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'));
const fin = Number.isFinite, text = html => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
const CHANCE = /\b(chance|chances|likely|likelihood|probabl\w*|odds|expect\w*|forecasts?|predict\w*|will be|guarantee\w*|risk of)\b/i;
const IDS = ['heat', 'springFrost', 'autumnFrost', 'heavy', 'dry', 'balance', 'stored', 'green', 'soil'];
const FARM = { rotation: { preset: null, custom: ['corn', 'soy', 'wheat'] } };

// a greenness answer in the lookup's own shape (scripts/live/ndvihist.py), made by hand: no recorded one is kept, the lookup reads hundreds of map tiles
const greenAnswer = (peaks, from = 2001) => ({ ok: true, seasons: peaks.map((p, i) => ({ year: from + i, peak: p, peak_date: p === null ? '' : `${from + i}-07-12`, n: p === null ? 0 : 10, of: 12, partial: false })), years_without: peaks.map((p, i) => (p === null ? from + i : null)).filter(Boolean), window: 'April to September' });

for (const place of ['barrie', 'oxford']) {
  const A = fx(`power_${place}.json`), loc = { lat: A.geometry.coordinates[1], lon: A.geometry.coordinates[0] };
  const S = buildSeries(A, loc), C = computeClimate(S, loc.lat), Y = C.years;
  const grace = place === 'oxford' ? cleanGrace(fx('live/gracecell-oxford/recording.json').answer) : { ok: false, reason: 'The water-storage lookup did not answer.' };
  const green = cleanGreenness(greenAnswer([0.81, 0.83, 0.8, null, 0.82, 0.84, 0.79, 0.8, 0.83, 0.82, 0.85, 0.78, 0.81, 0.84, 0.82, 0.8, 0.83, 0.81, 0.84, 0.82, 0.8, 0.83, 0.85, 0.82, 0.81]));
  const M = buildTrends({ C, series: S, state: FARM, grace, green, lat: loc.lat, lon: loc.lon }), row = id => M.rows.find(r => r.id === id);
  const P = `${place}:`;
  check(`${P} the card is built from ${Y.length} counted years`, M.ok && M.counted === Y.length && M.first === Y[0] && M.last === Y.at(-1) && Y.length >= 20, [M.counted, M.first, M.last]);
  same(`${P} the rows, in order`, M.rows.map(r => r.id), IDS);

  // heat: the crops' lines, from the rotation, lowest first; the 32 °C line is the Weather tab's own count, year by year
  same(`${P} the heat lines of corn, soybeans and winter wheat`, row('heat').limits, [{ heat: 30, names: ['Winter wheat'] }, { heat: 32, names: ['Corn'] }, { heat: 33, names: ['Soybeans'] }]);
  const h32 = heatYears(S, Y, 32);
  check(`${P} days at 32 °C or more equal the Weather tab's hot days in every year`, h32.every((v, i) => Math.abs(v - C.yearly.heat32[i]) < 1e-9), h32.map((v, i) => [Y[i], v, C.yearly.heat32[i]]).filter(p => Math.abs(p[1] - p[2]) > 1e-9));
  const h35 = heatYears(S, Y, 35);
  check(`${P} days at 35 °C or more equal the Weather tab's 35 °C count`, h35.every((v, i) => Math.abs(v - C.yearly.heat35[i]) < 1e-9));
  const [s30, s32, s33] = row('heat').series.map(s => s.values);
  check(`${P} a higher line never counts more days (30 ≥ 32 ≥ 33 °C) and no year has more days than it has`, Y.every((y, i) => s30[i] >= s32[i] && s32[i] >= s33[i] && s30[i] <= 366 && s33[i] >= 0));
  check(`${P} the heat sentence names each line once`, ['30 °C', '32 °C', '33 °C'].every(t => row('heat').said.split(t).length === 2), row('heat').said);
  check(`${P} the heat lines are said to be Crophalo's own estimate, with the rules source`, row('heat').notes.some(n => /own estimate/.test(n)) && row('heat').sources.includes('rules'));
  const noCrop = buildTrends({ C, series: S, state: null, lat: loc.lat, lon: loc.lon }).rows[0];
  check(`${P} with no rotation the Weather tab's 32 °C line is used and said`, noCrop.limits.length === 1 && noCrop.limits[0].heat === 32 && noCrop.series[0].values === C.yearly.heat32 && noCrop.notes[0] === TW.heat.lineAny);

  // frost
  const sp = row('springFrost').series[0].values, au = row('autumnFrost').series[0].values;
  check(`${P} every year with both frosts has the spring one before the autumn one`, Y.every((y, i) => !(fin(sp[i]) && fin(au[i])) || sp[i] < au[i]));
  check(`${P} the frost dates are the Weather record's own (C.yearly)`, sp === C.yearly.frostLast && au === C.yearly.frostFirst);
  check(`${P} a counted year with no frost is said as No frost in the table, never as Not read`, (() => { const r = { ...row('springFrost'), series: [{ ...row('springFrost').series[0], values: sp.map((v, i) => (i === 2 ? NaN : v)) }] }; return rowTable(r).includes('No frost') && !rowTable(r).includes('Not read'); })());
  check(`${P} the station check is said on the autumn row, near the Ontario stations`, fin(C.frostMargin) && C.frostMargin > 0 ? row('autumnFrost').notes.includes(TW.autumnFrost.corrected(C.frostMargin)) : nearStations(loc.lat, loc.lon) && row('autumnFrost').notes.includes(TW.autumnFrost.station));
  { const fixed = buildTrends({ C: { ...C, frostMargin: 2.5 }, lat: loc.lat, lon: loc.lon }).rows.find(r => r.id === 'autumnFrost');
    check(`${P} when the climate already counts the autumn date with the 2.5 °C station margin, the row says so and never says the stations were 11 days earlier`, fixed.notes.includes(TW.autumnFrost.corrected(2.5)) && fixed.notes[0] === TW.autumnFrost.lineMargin(2.5) && !fixed.notes.some(n => /11 days/.test(n)) && fixed.sources.includes('eccc')); }

  // heavy rain: the 50 mm days are part of the 20 mm days; the years with one are counted out of the years read
  const [h20, h50] = row('heavy').series.map(s => s.values);
  check(`${P} 50 mm days never outnumber 20 mm days`, Y.every((y, i) => !fin(h50[i]) || h50[i] <= h20[i] + 1e-9));
  const with50 = h50.filter(v => v > 0).length;
  check(`${P} the 50 mm years add up: ${with50} of ${h50.filter(fin).length}`, row('heavy').said.includes(`in ${with50} of ${h50.filter(fin).length} years`), row('heavy').said);
  const mean20 = h20.filter(fin).reduce((s, v) => s + v, 0) / h20.filter(fin).length;
  check(`${P} the 20 mm figure is the mean of the table, as the Weather tab says it`, row('heavy').said.includes(`about ${Math.round(mean20)} a year`) && Math.abs(mean20 - C.med.heavy) < 1e-9, [mean20, row('heavy').said]);
  check(`${P} the heavy-rain row cites the erosion page for its soil line`, row('heavy').sources.includes('erosion') && row('heavy').notes.includes(TW.heavy.soil));

  // dry spells
  const dry = row('dry').series[0].values, top = Math.max(...dry.filter(fin));
  check(`${P} a dry spell is at most the 183 days of April to September`, dry.every(v => !fin(v) || (v >= 0 && v <= 183)));
  check(`${P} the longest dry spell and its year are said`, row('dry').said.includes(`${top} days, in ${Y[dry.indexOf(top)]}`), row('dry').said);

  // the water balance: rain minus the water given off, month by month, the months short named
  const B = row('balance');
  check(`${P} the balance is rain minus the water given off, in each month`, B.kind === 'month' && B.values.every((v, m) => Math.abs(v - (C.monthly.P[m] - C.monthly.ET[m])) < 1e-9));
  const short = B.values.map((v, m) => (v < -0.5 ? m : -1)).filter(m => m >= 0);
  check(`${P} every month short of water is named, and no other`, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].every((name, m) => B.said.includes(name) === short.includes(m)), B.said);
  check(`${P} the water given off is said to be the weather model's, not a crop's use`, B.notes.includes(TW.balance.what) && B.sources.includes('merra2'));
  const noEt = buildTrends({ C: { ...C, monthly: { ...C.monthly, ET: C.monthly.ET.map(() => NaN) } }, lat: loc.lat, lon: loc.lon }).rows.find(r => r.id === 'balance');
  check(`${P} with no evaporation figure the balance is not drawn and says so`, noEt.kind === 'none' && noEt.said === TW.balance.none && !/<svg/.test(rowHTML(noEt)));

  // dry soil
  const soil = row('soil').series[0].values, days = C.yearly.stress.map(v => v * 183);
  check(`${P} dry-soil days are the share of dry days of April to September, times 183`, soil.every((v, i) => !fin(v) || Math.abs(v - days[i]) < 1e-9));
  // the report is one page now: SMAP's newest reading is in the fold "What NASA satellites see" (no map time-lapse of SMAP was found in this copy to point to)
  check(`${P} SMAP is said to start in 2015 and where its newest reading is`, row('soil').notes.includes(TW.soil.smap) && /since 2015/.test(TW.soil.smap) && /What NASA satellites see/.test(TW.soil.smap));

  // stored water
  const W = row('stored');
  if (grace.ok) {
    const ys = graceYears(grace), last = grace.months.at(-1).month, running = +last.slice(0, 4);
    check(`${P} the running year of the water record (${running}) is left out`, !ys.some(y => y.year === running) && !/-12$/.test(last));
    check(`${P} each yearly average is the mean of that year's months read, a year counting with ${GRACE_MONTHS} or more`, ys.every(y => { const ms = grace.months.filter(m => m.month.startsWith(`${y.year}-`) && m.cm !== null); return ms.length === y.n && (y.n < GRACE_MONTHS ? !fin(y.cm) : Math.abs(y.cm - Math.round(ms.reduce((s, m) => s + m.cm, 0) / ms.length * 10) / 10) < 1e-9); }));
    check(`${P} the years of the satellites' gap are not filled in`, ys.filter(y => y.year === 2017 || y.year === 2018).every(y => y.n < 12));
    check(`${P} the stored-water row is said to be regional, with the gap between the two missions`, W.notes.includes(TW.stored.regional) && W.notes.includes(TW.stored.gap) && W.sources.includes('grace'));
  } else check(`${P} with no water answer the row says Not read, with the reason, and draws nothing`, W.kind === 'none' && /Not read/.test(rowHTML(W)) && !/<svg/.test(rowHTML(W)));
  const waiting = buildTrends({ C, lat: loc.lat, lon: loc.lon }).rows;
  check(`${P} before their answers arrive, stored water and greenness say Reading…, with a status`, ['stored', 'green'].every(id => { const r = waiting.find(x => x.id === id); return r.kind === 'wait' && /role="status"/.test(rowHTML(r)) && rowHTML(r).includes(TW.reading); }));

  // greenness: a season with no clear reading is a cross, never a dot at 0
  const G = row('green'), gsvg = rowSVG(G);
  check(`${P} greenness: one dot per season read and one cross for the gap`, (gsvg.match(/class="tr-dot/g) ?? []).length === 24 && (gsvg.match(/class="tr-gap"/g) ?? []).length === 1);
  check(`${P} greenness is said to be a 2 km patch, with the GIBS source`, G.notes.includes(TW.green.patch) && G.sources.includes('gibs'));

  // the trend rule, row by row: named and drawn only when t is 2 or more over 10 years or more
  for (const r of M.rows.filter(r => r.trend)) {
    const main = r.series[0].values, pts = r.years.map((y, i) => [y, main[i]]).filter(p => fin(p[1])), t = trendOf(pts), clear = !!t && Math.abs(t.t) >= 2 && t.slope !== 0;
    check(`${P} ${r.id}: the t rule gives ${clear ? 'a clear trend' : 'no clear trend'} (t ${t ? t.t.toFixed(2) : 'none'})`, r.trend.clear === clear);
    check(`${P} ${r.id}: the sentence says a trend only when it is clear`, clear ? /A clear trend\.$/.test(r.trendText) : r.trendText === TW.trendNone, r.trendText);
    check(`${P} ${r.id}: the dashed line is drawn only when the trend is clear`, /class="tr-trend"/.test(rowSVG(r)) === clear);
  }

  // the markup
  const html = sectionHTML(M, 'k'), words = text(html);
  check(`${P} nothing says NaN, undefined or null`, !/NaN|undefined|\bnull\b/.test(html), html.match(/.{40}(NaN|undefined|null).{40}/)?.[0]);
  check(`${P} no chance, forecast or promise word anywhere on the card`, !CHANCE.test(words.replace(TW.past, '')), words.match(CHANCE)?.[0]);
  check(`${P} "Past weather, not a forecast." is on the card`, words.includes(TW.past));
  check(`${P} every row has its source "i"`, M.rows.every(r => rowHTML(r).includes('class="src') || /data-src/.test(rowHTML(r))), M.rows.filter(r => !/src/.test(rowHTML(r))).map(r => r.id));
  check(`${P} every source key a row names is in the source table`, M.rows.every(r => r.sources.every(k => Object.hasOwn(SOURCES, k))), M.rows.flatMap(r => r.sources).filter(k => !Object.hasOwn(SOURCES, k)));
  for (const r of M.rows.filter(r => r.series || r.kind === 'month')) {
    const tbl = rowTable(r), n = (tbl.match(/<tr><th scope="row">/g) ?? []).length, want = r.kind === 'month' ? 12 : r.years.length;
    check(`${P} ${r.id}: the folded table has every ${r.kind === 'month' ? 'month' : 'year'} (${want})`, n === want && /<details class="disc/.test(tbl), n);
    check(`${P} ${r.id}: the chart has a spoken sentence`, /role="img" aria-label="[^"]{30,}"/.test(rowSVG(r)));
  }
  check(`${P} a year not read is a cross on the baseline, never a bar of 0`, (() => { const r = { ...row('dry'), series: [{ ...row('dry').series[0], values: row('dry').series[0].values.map((v, i) => (i === 3 ? NaN : v)) }] }; const svg = rowSVG(r); return (svg.match(/class="tr-gap"/g) ?? []).length === 1 && (svg.match(/class="tr-bar/g) ?? []).length === Y.length - 1; })());
  check(`${P} static: no animation and no motion class in the card`, !/<animate|transition|@keyframes|class="[^"]*\bfx\b/.test(html));

  // The report has no Weather tab any more: the card's hook is on the one page, as one closed part inside the fold "Weather here since 2001"
  // (the join's task placed it there; the paper's hook into the old Weather tab, js/weather-view.js, was not joined).
  const part = trendsPartHTML(M), opened = part.slice(0, part.indexOf('id="lfTrendsMore"')), said = text(opened.slice(opened.indexOf('</summary>')));
  check(`${P} one page: the part is one closed line with its own heading and the years counted`, /^<article class="card pad sat-card tr-part" data-card="trends"><details class="fold sat-fold" id="lfTrends"><summary><h3 class="sat-name">Trends on this land<\/h3><span class="sat-one">\d+ years, \d{4}–\d{4}<\/span><\/summary>/.test(part) && !/id="lfTrends" open/.test(part));
  const sentences = said.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z])/).filter(x => /[a-z]/i.test(x));
  check(`${P} one page: at most four sentences when opened, before "Show more"`, sentences.length >= 3 && sentences.length <= 4, sentences);
  check(`${P} one page: "Past weather, not a forecast" is said, and the source line names NASA POWER with the years`, /past weather, not a forecast/.test(said) && new RegExp(`From NASA POWER, ${M.first}–${M.last}\\.`).test(said));
  check(`${P} one page: every trend line carries its years and its source`, trendLines(M).every(l => /\(\d{4}–\d{4}, NASA [^)]+\)\.$/.test(l) || /^No clear trend from \d{4} to \d{4}: /.test(l)), trendLines(M));
  check(`${P} one page: a trend is named in sight only when the t rule holds`, trendLines(M).filter(l => / every 10 years /.test(l)).length === Math.min(2, M.rows.filter(r => r.trend?.clear).length));
  check(`${P} one page: "Show more" holds every row, each with its source "i"`, (part.match(/class="card pad chart-card tr-row"/g) ?? []).length === M.rows.length && /<details class="fold sat-more" id="lfTrendsMore"><summary>Show more<\/summary>/.test(part));
  const us = trendsPartHTML(M, { localise: t => localiseText(t, { temp: 'F', rain: 'in', area: 'imperial', length: 'imperial' }) });
  check(`${P} one page: in United States units the words read °F and inches, never °C or mm`, !/°C|\d mm\b/.test(text(us).replace(/aria-label="[^"]*"/g, '')) && /°F|in\b/.test(text(us)), (text(us).match(/[^.]*(°C|\d mm\b)[^.]*/g) ?? []).slice(0, 3));
}

// ---- the rule by hand, on made-up years
const yrs = Array.from({ length: 20 }, (_, i) => 2001 + i);
check('a steady rise with little swing is a clear trend', lineOf(yrs, yrs.map((y, i) => i * 2 + (i % 2))).clear === true);
check('the same swing with no rise is no clear trend', lineOf(yrs, yrs.map((y, i) => 10 + (i % 2 ? 5 : -5))).clear === false);
check('nine years make no trend at all, and say so', (() => { const t = lineOf(yrs.slice(0, 9), yrs.slice(0, 9).map((y, i) => i)); return t.short && trendSentence(t, TW.dry, 'days') === TW.trendShort(9); })());
check('years not read are left out of the line, never taken as 0', lineOf(yrs, yrs.map((y, i) => (i === 5 ? NaN : i * 3))).n === 19);
check('a falling trend uses the row\'s own word', /shorter dry spells, by about 30 days every 10 years/.test(trendSentence(lineOf(yrs, yrs.map((y, i) => 100 - 3 * i)), TW.dry, 'days')));
// the crops' lines
same('a preset rotation gives its crops\' heat lines', cropLimits({ rotation: { preset: 'corn-soy' } }), [{ heat: 32, names: ['Corn'] }, { heat: 33, names: ['Soybeans'] }]);
check('a perfectly straight line (no swing at all) is a clear trend, falling too', lineOf(yrs, yrs.map((y, i) => 100 - 3 * i)).clear === true);
same('no rotation gives no crop line', cropLimits({}), []);
same('two crops with one line are named together', cropLimits({ rotation: { custom: ['wheat', 'barley'] } }), [{ heat: 30, names: ['Winter wheat', 'Spring barley'] }]);
same('fallow has no heat line', cropLimits({ rotation: { custom: ['fallow'] } }), []);
// far from the Ontario stations, the date is NASA's own
const K = fx('power_konya.json'), kloc = { lat: K.geometry.coordinates[1], lon: K.geometry.coordinates[0] }, KS = buildSeries(K, kloc), KC = computeClimate(KS, kloc.lat);
const KM = buildTrends({ C: KC, series: KS, lat: kloc.lat, lon: kloc.lon });
check('far from the Ontario stations the autumn row says the date is NASA’s own', !nearStations(kloc.lat, kloc.lon) && KM.rows.find(r => r.id === 'autumnFrost').notes.includes(TW.autumnFrost.stationFar));
check('the Konya card has no NaN either', !/NaN|undefined/.test(sectionHTML(KM)));
check('no weather figures: no card', trendsHTML({ ok: false }) === '' && trendsHTML(null) === '');
check('no weather figures: no part on the one page', trendsPartHTML({ ok: false }) === '' && trendsPartHTML(null) === '');
// the one page puts the part inside the fold "Weather here since 2001", after its plain lines, and asks its later answers when the part is first opened
{
  const rep = fs.readFileSync(new URL('../js/report.js', import.meta.url), 'utf8');
  check('one page: the part is inside the fold "Weather here since 2001", after its lines', /foldHTML\('lfWeather', cf\.head, cf\.body \+ trends\)/.test(rep));
  check('one page: its stored water and greenness are asked when the part is first opened', /d\.id === 'lfTrends'\) loadFor\('trends'\)/.test(rep) && /part === 'trends' && cur\.green === undefined/.test(rep));
}
// a lookup's own words never reach the card
check('a failed lookup is said in plain words, never the server\'s', ['stored', 'green'].every(id => { const M2 = buildTrends({ C: KC, grace: { ok: false, reason: 'Python environment not found (.venv) at /srv/app/x.py' }, green: { ok: false, reason: 'HTTP Error 500 from 10.0.0.1:8080' } }); const r = M2.rows.find(x => x.id === id); return r.kind === 'none' && !/python|\.venv|\/srv|HTTP|10\.0/i.test(r.said); }));

console.log(`trends: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
