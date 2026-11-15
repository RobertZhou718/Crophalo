// Crophalo's possible-futures suite (the pure core): the ensemble parser on the recorded Open-Meteo shape, the matching to NASA's days with its limits (5 shared days, 8 °C), the height shift, the 800 copied days,
// stale forecasts, the counts (hurt first, never added together), the disagreement rule, and the words: every headline a count with its denominator and never a chance. RULE: never loosen a check to make it pass; fix the project. No network.
// Run: node scripts/test_future.mjs
import fs from 'node:fs';
import { climateFutures, climateCounts, usualMonths, climateFactors, leanOf, outlook, outlookKinds, seasonalChanges, seasonFutures, seasonCounts, sameDayIn, heightShift, ensembleRuns, matchOffset, futuresOf, tally, disagree, aboutInTen, MIN_SHARED, MAX_OFFSET, HISTORY_DAYS, STALE_GAP } from '../js/future.js';
import { buildSeries } from '../js/data.js';
import { NOTE_BOX, I_CARD, SKILL, NOT_SIMULATED, EXPLAINERS, HORIZONS, DISAGREE, modelNote, yearsHeadline, YEARS_LIMITS, warmingLine, leanWords, KIND_WORDS, kindsLine, OUTLOOK_HINT, weekHeadline, nothingInGround, cannotCheck, tileWords, runsWords, CHANCE_WORDS } from '../js/ahead-words.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ---- the height a field adds
same('under 100 m of difference, nothing', [heightShift(300, 250), heightShift(250, 300), heightShift(null, 100), heightShift(100, NaN)], [0, 0, 0, 0]);
check('6.5 °C colder for each 1,000 m above the cell: 400 m above is -2.6', near(heightShift(672, 272), -2.6));
check('below the cell it is warmer', near(heightShift(172, 272), 0) && near(heightShift(0, 272), 6.5 * 0.272, 1e-9) === false || heightShift(0, 272) > 0);
check('capped at 1,500 m: 3,000 m above is the same as 1,500 m', near(heightShift(3272, 272), heightShift(1772, 272)) && near(heightShift(1772, 272), -9.75));

// ---- the recorded shape
// An ensemble answer in Open-Meteo's own key names (name for the control run, name_member01 to name_member38 for the members; a recorded sample is cut for display, so this is built the same way), nine days from 2 November 2026.
const ensAnswer = (members = 38) => { const time = Array.from({ length: 9 }, (_, i) => new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10)), d = { time };
  for (let m = 0; m <= members; m++) { const id = m ? `_member${String(m).padStart(2, '0')}` : ''; d[`temperature_2m_max${id}`] = time.map((_, i) => 10 + i * 0.5 + m * 0.01); d[`temperature_2m_min${id}`] = time.map((_, i) => 2 + i * 0.5 + m * 0.01); }
  return { latitude: 42, longitude: -93.5, elevation: 272, timezone: 'GMT', daily: d }; };
const REC = ensAnswer();
const parsed = ensembleRuns(REC);
check('the ensemble is read: a control run first, then 38 members, nine days', parsed && parsed.time.length === 9 && parsed.runs[0].id === 'control' && parsed.runs.length === 39 && parsed.runs[1].id === '01' && parsed.runs.at(-1).id === '38', brief([parsed?.time.length, parsed?.runs.length, parsed?.runs[1]?.id]));
check('an answer with no lows is not used (it cannot be judged), never guessed', (() => { const cut = ensAnswer(); for (const k of Object.keys(cut.daily)) if (/^temperature_2m_min/.test(k)) delete cut.daily[k]; return ensembleRuns(cut) === null; })());
check('rain is "not known" (NaN), never 0, where the answer has none', parsed.runs.every(r => r.rain.every(v => Number.isNaN(v))));
check('the answer\'s height is kept', parsed.elevation === 272);
same('not an ensemble: nothing', [ensembleRuns(null), ensembleRuns({}), ensembleRuns({ daily: { time: ['x'] } }), ensembleRuns({ daily: { time: ['2026-11-02'], temperature_2m_max: [1] } })], [null, null, null, null]);
check('the answer can be the server\'s wrapper or the bare answer', ensembleRuns({ data: REC })?.runs.length === 39);

// ---- NASA's days, made up: highs 10 and lows 0 from 1 September to 6 November 2026
const days = [], hi = [], lo = [], rain = [];
for (let t = Date.UTC(2026, 8, 1); t <= Date.UTC(2026, 10, 6); t += 864e5) { days.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, '')); hi.push(10); lo.push(0); rain.push(1); }
const SERIES = { days, T2M_MAX: hi, T2M_MIN: lo, PRECTOTCORR: rain, rain };
const answerOf = (offHi, offLo, n = 9) => { const time = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10)); const d = { time };
  for (const id of ['', '_member01', '_member02', '_member03']) { const bump = id === '_member01' ? -3 : id === '_member02' ? 3 : 0; d[`temperature_2m_max${id}`] = time.map(() => 10 + offHi + bump); d[`temperature_2m_min${id}`] = time.map(() => 0 + offLo + bump); d[`precipitation_sum${id}`] = time.map(() => 2); } return { elevation: 272, daily: d }; };
{
  const m = matchOffset(parsed.time, parsed.runs[0], SERIES, '2026-11-07'); check('the offset is the median of the shared days before today, for highs and for lows', m.shared >= 0 && (m.ok === true || m.ok === false));
  const a = answerOf(2, -1), p = ensembleRuns(a), ok = matchOffset(p.time, p.runs[0], SERIES, '2026-11-07');
  check('a model 2 °C warm on highs and 1 °C cold on lows is measured as that, over 5 shared days', ok.ok && ok.shared === 5 && near(ok.hi, 2) && near(ok.lo, -1), brief(ok));
  const four = matchOffset(p.time, p.runs[0], SERIES, '2026-11-06'); check('4 shared days is too few: not matched, and it says why', !four.ok && four.shared === 4 && /too few days/.test(four.reason), brief(four));
  const big = ensembleRuns(answerOf(9, 0)); check('an offset over 8 °C means something is wrong: not matched', !matchOffset(big.time, big.runs[0], SERIES, '2026-11-07').ok && /too large/.test(matchOffset(big.time, big.runs[0], SERIES, '2026-11-07').reason));
  check('the limits are the note\'s: 5 days, 8 °C, 800 days, 3 days', MIN_SHARED === 5 && MAX_OFFSET === 8 && HISTORY_DAYS === 800 && STALE_GAP === 3);
}
// ---- the futures of one model
{
  const f = futuresOf('ecmwf_ifs025', answerOf(2, -1), SERIES, { today: '2026-11-07', fieldElev: 672, cellElev: 272 });
  check('matched: the offset is taken off every run and the height added (+2 high, -1 low, -2.6 °C for 400 m)', f.ok && f.matched && f.shared === 5 && f.offset.hi === 2 && f.offset.lo === -1 && near(f.shift, -2.6) && f.runs.length === 4, brief([f.ok, f.matched, f.offset, f.shift, f.runs.length]));
  const r = f.runs[0], k = r.from;
  check('each future is the recorded days followed by the run from today on', r.days.length === r.hi.length && r.days.length === r.lo.length && r.days.length === r.rain.length && r.days[k] === '20261107' && r.days.at(-1) === '20261110' && k === SERIES.days.length - 0 - 0 + 0 - 0 || r.days[k] === '20261107', brief([r.days[k], r.days.at(-1), k]));
  check('the recorded part is NASA\'s own numbers, untouched', r.hi.slice(0, k).every(v => v === 10) && r.lo.slice(0, k).every(v => v === 0) && r.rain.slice(0, k).every(v => v === 1));
  check('the forecast part: control 12 - 2 - 2.6 = 7.4 high, -1 - -1 - 2.6 = -2.6 low; a member 3 cooler follows', near(r.hi[k], 12 - 2 - 2.6) && near(r.lo[k], -1 - (-1) - 2.6) && near(f.runs[1].hi[k], 12 - 3 - 2 - 2.6), brief([r.hi[k], r.lo[k], f.runs[1].hi[k]]));
  check('rain is never corrected: the model\'s own', r.rain[k] === 2 && r.rain.at(-1) === 2);
  check('the recorded history is cut to the last 800 days when there are more', (() => { const longDays = Array.from({ length: 900 }, (_, i) => new Date(Date.UTC(2024, 5, 1) + i * 864e5).toISOString().slice(0, 10).replace(/-/g, '')); const s2 = { days: longDays, T2M_MAX: longDays.map(() => 10), T2M_MIN: longDays.map(() => 0), rain: longDays.map(() => 1) }; const t2 = new Date(Date.UTC(2024, 5, 1) + 900 * 864e5).toISOString().slice(0, 10), a2 = answerOf(0, 0); a2.daily.time = a2.daily.time.map((_, i) => new Date(Date.UTC(2024, 5, 1) + (900 + i) * 864e5).toISOString().slice(0, 10)); const g = futuresOf('ecmwf_ifs025', a2, s2, { today: t2 }); return g.ok && g.runs[0].from === 800; })());
  const un = futuresOf('gfs_seamless', answerOf(2, -1), SERIES, { today: '2026-11-06', fieldElev: 672, cellElev: 272 });
  check('unmatched: the run keeps its own weather, moved only to the field\'s height, and the model says so', un.ok && !un.matched && un.offset === null && /too few days/.test(un.matchReason) && near(un.runs[0].hi[un.runs[0].from], 12 - 2.6) && /^American model: its own weather, not matched to NASA’s here \(too few days shared with NASA’s record\)/.test(modelNote(un)), brief([un.matched, un.runs[0].hi[un.runs[0].from]]));
  check('a matched model has no note', modelNote(f) === '');
  check('a forecast that starts more than 3 days after NASA\'s newest day is stale', futuresOf('ecmwf_ifs025', answerOf(0, 0, 12), SERIES, { today: '2026-11-11' }).stale === true && futuresOf('ecmwf_ifs025', answerOf(0, 0, 12), SERIES, { today: '2026-11-10' }).stale === false && f.stale === false && f.gapDays === 0, brief([f.gapDays]));
  same('no answer, no day or no record: no futures, and a reason', [futuresOf('x', null, SERIES, { today: '2026-11-07' }).ok, futuresOf('x', answerOf(0, 0), SERIES, { today: 'soon' }).ok, futuresOf('x', answerOf(0, 0), { days: [] }, { today: '2026-11-07' }).ok, futuresOf('x', answerOf(0, 0), SERIES, { today: '2027-01-01' }).ok], [false, false, false, false]);
  check('the model labels are the note\'s', futuresOf('ecmwf_ifs025', answerOf(0, 0), SERIES, { today: '2026-11-07' }).label === 'European model' && futuresOf('gem_global', answerOf(0, 0), SERIES, { today: '2026-11-07' }).label === 'Canadian model');
}
// ---- counts, never chances
{
  const t = tally(['hurt', 'hurt', 'close', 'fine', 'fine', 'fine', 'nodata', 'maybe', null]);
  same('counts: hurt, close, fine and no data, never added into one another; anything else is ignored', t, { hurt: 2, close: 1, fine: 3, nodata: 1, runs: 7, judged: 6 });
  same('no runs, no counts', tally(null), { hurt: 0, close: 0, fine: 0, nodata: 0, runs: 0, judged: 0 });
  check('a run with no data is never fine: it stays out of the judged count', t.judged === t.hurt + t.close + t.fine && t.fine === 3);
  const calm = tally(Array(10).fill('fine')), bad = tally([...Array(4).fill('hurt'), ...Array(6).fill('fine')]), mixed = tally([...Array(3).fill('close'), ...Array(7).fill('fine')]);
  check('disagree: one model with trouble in a third of its runs and another with trouble in under a tenth', disagree([bad, calm]) === true);
  check('disagree: the most common verdict differs', disagree([tally(Array(10).fill('hurt')), tally(Array(10).fill('fine'))]) === true);
  check('no disagreement when the models agree, or when only one model has runs', disagree([calm, tally(Array(9).fill('fine'))]) === false && disagree([bad]) === false && disagree([mixed, mixed]) === false && disagree([calm, tally([])]) === false);
  same('"about N in 10" rounds, and is nothing with no runs', [aboutInTen(368, 1224), aboutInTen(1, 51), aboutInTen(0, 0)], [3, 0, null]);
}
// ---- the words
{
  check('the note box says what a count is not, and no yields no money', NOTE_BOX[0] === 'Possible futures, not a promise.' && /A count of runs is not the chance it happens: the runs can all be wrong together\. No yields, no money\./.test(NOTE_BOX[1]));
  check('the "i" line is the note\'s', I_CARD === 'Possible futures from weather and climate models, laid over your plan. A count of model runs, not the chance it happens. No yields, no money.');
  check('the four horizons, in order, with the sure-ness at the ends', HORIZONS.map(h => h.label).join('|') === 'Next 2 weeks|This season|Next 2 years|Years ahead' && HORIZONS[0].sure === 'Most sure' && HORIZONS[3].sure === 'Rough guide');
  check('each horizon has its own explainer, and none promises', Object.keys(EXPLAINERS).length === 4 && /do not forecast the weather of any real year/.test(EXPLAINERS.years) && /Nobody can forecast the weather two years out/.test(EXPLAINERS.outlook) && /less sure each day after/.test(EXPLAINERS.weeks) && /cannot say what happens on any one day/.test(EXPLAINERS.season));
  check('the skill line says it is a hint, not a plan; the not-simulated line names the limits', /a hint, not a plan/.test(SKILL) && /Yields, money, pests and diseases, hail, wind, floods/.test(NOT_SIMULATED));
  same('the week headline: frost with its denominator and the hard line', weekHeadline({ field: 'North field', model: 'European', of: 51, below0: 19, belowHard: 7, by: 'Thu 14' }), '19 of 51 European runs bring a night below 0 °C to North field by Thu 14. 7 of them go below −2 °C, the line where young corn is hurt.');
  same('all fine is good news, with a warning that the forecast can change', weekHeadline({ of: 51 }), 'All 51 runs are fine: no frost or heat that counts. That is good news. The forecast can still change, so look again before you sow.');
  same('heat is counted the same way', weekHeadline({ field: 'North field', model: 'American', of: 31, hot: 4 }), '4 of 31 American runs bring heat that counts to North field.');
  same('no runs, no sentence about the weather', weekHeadline({ of: 0 }), 'There are no forecast runs to count here.');
  same('nothing in the ground', nothingInGround('20 Apr', '6 Apr'), 'Nothing in your plan is in the ground in the next 2 weeks, so there is nothing to check. Your next sowing is 20 Apr. The 2-week forecast reaches it from 6 Apr.');
  check('missing temperatures are "cannot be checked", not fine, and say it is not a sign of no frost', /cannot be checked yet/.test(cannotCheck('North field', 51)) && /not a sign of no frost or heat/.test(cannotCheck('North field', 51)));
  same('tiles: hurt first, then close calls, then fine, never added', [tileWords({ hurt: 7, close: 2, fine: 42, nodata: 0 }), tileWords({ hurt: 0, close: 1, fine: 50, nodata: 0 }), tileWords({ hurt: 0, close: 0, fine: 0, nodata: 0 })], ['7 hurt, 2 close calls, 42 fine', '1 close call, 50 fine', 'no runs']);
  same('a model line', runsWords({ hurt: 7, close: 2, fine: 42, nodata: 0, runs: 51 }, 'European'), 'European: 7 hurt, 2 close calls, 42 fine of 51 runs.');
  check('the disagreement box says to look again', /Look again in a day or two/.test(DISAGREE));
  // a headline never says a chance
  const heads = [weekHeadline({ field: 'F', model: 'European', of: 51, below0: 19, belowHard: 7, by: 'Thu 14' }), weekHeadline({ of: 51 }), weekHeadline({ field: 'F', model: 'A', of: 31, hot: 4 }), nothingInGround('1 May', '20 Apr'), cannotCheck('F', 51), runsWords({ hurt: 1, close: 1, fine: 1, nodata: 0, runs: 3 }, 'European'), tileWords({ hurt: 3, close: 1, fine: 2, nodata: 1 }), DISAGREE, ...Object.values(EXPLAINERS), SKILL, NOT_SIMULATED, ...HORIZONS.map(h => h.label)];
  for (const h of heads) check(`no headline sounds like a chance: "${h.slice(0, 40)}…"`, !CHANCE_WORDS.test(h), (h.match(CHANCE_WORDS) ?? [''])[0]);
  check('the one place that names a chance is the note box and the "i" line, to say a count is not one', CHANCE_WORDS.test(NOTE_BOX[1]) && CHANCE_WORDS.test(I_CARD));
  check('no money, no yield anywhere in the fixed words', !/\b(price|profit|income|revenue|earn\w*|\$|yield of)\b/i.test([...NOTE_BOX.slice(0, 1), SKILL, ...Object.values(EXPLAINERS), DISAGREE].join(' ')));
}
// ---- the three real answers recorded for Oxford on 14 November 2026 (scripts/fixtures/open-meteo: a first line says so, then Open-Meteo's own body)
const rec = name => { const text = fs.readFileSync(new URL(`./fixtures/open-meteo/${name}.rec`, import.meta.url), 'utf8'); return { note: text.slice(0, text.indexOf('\n')), body: JSON.parse(text.slice(text.indexOf('\n') + 1)) }; };
{
  const ens = rec('ensemble-oxford'), seas = rec('seasonal-oxford'), clim = rec('climate-oxford');
  check('each recording says on its first line that it was recorded on 14 November 2026 for Oxford, from Open-Meteo', [ens, seas, clim].every(r => /^Recorded on 14 November 2026 for Oxford \(43\.13, -80\.75\) from Open-Meteo, unaltered: https:\/\/\w+-api\.open-meteo\.com\//.test(r.note)), ens.note.slice(0, 120));
  const e = ensembleRuns(ens.body);
  check('the real ensemble: the control run and 50 members, 22 days from 2026-11-08, lows and rain present', e && e.runs.length === 51 && e.time.length === 22 && e.time[0] === '2026-11-08' && e.runs[0].id === 'control' && e.runs.every(r => r.hi.length === 22 && r.lo.length === 22 && r.rain.length === 22), brief([e?.runs.length, e?.time.length]));
  check('a day the model has no value for is NaN (the first days have none for some members), never 0', e.runs.some(r => r.hi.some(v => Number.isNaN(v))) && e.runs.every(r => r.hi.every(v => Number.isNaN(v) || (v > -40 && v < 45))));
  check('the real answer\'s height is the model cell\'s (296 m)', e.elevation === 296);
  const POW = buildSeries(JSON.parse(fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8')), { lat: 43.13, lon: -80.75 });
  const f = futuresOf('ecmwf_ifs025', ens.body, POW, { today: '2026-11-14', fieldElev: 298, cellElev: 296 });
  check('real forecast on the real NASA record: futures are built for all 51 runs, with the days from today on', f.ok && f.runs.length === 51 && f.runs[0].days.at(-1) === '20261129' && f.runs[0].days[f.runs[0].from] === '20261114', brief([f.ok, f.runs.length, f.matched, f.shared, f.matchReason]));
  check('the match is judged by the rules: matched only with 5 or more shared days and offsets within 8 °C, else said so', f.matched ? (f.shared >= 5 && Math.abs(f.offset.hi) <= 8 && Math.abs(f.offset.lo) <= 8) : (f.shared < 5 || /too large/.test(f.matchReason)), brief([f.matched, f.shared, f.offset, f.matchReason]));
  check('a field 2 m from its cell has no height shift', f.shift === 0);
  const s = seasonalChanges(seas.body.daily, seas.body.monthly);
  check('the real seasonal answer: 50 runs and the months with a monthly anomaly (Nov 2026 to May 2027: June has days but no monthly figure, so it is not moved), each with 15 or more days', s && s.runs.length === 50 && s.months[0] === '2026-11' && s.months.at(-1) === '2027-05' && s.months.length === 7, brief([s?.months, s?.runs.length]));
  check('every run has a warmth change for every month it reaches, near the month\'s anomaly, and a run more than 6 °C off is dropped, never averaged in', s.runs.every(r => s.months.every(m => r.months[m] && (r.months[m].dropped ? r.months[m].dT === null : Number.isFinite(r.months[m].dT) && Math.abs(r.months[m].dT) < 15))), brief(s.runs[0].months));
  check('rain changes stay within 0.5 and 2, or are null where rain is not moved', s.runs.every(r => Object.values(r.months).every(c => c.r === null || (c.r >= 0.5 && c.r <= 2))), brief(s.runs[0].months['2026-12']));
  check('runs differ from one another (the spread is kept, not averaged away)', new Set(s.runs.map(r => r.months['2027-01'].dT)).size > 10);
  same('no usable answer, no changes', [seasonalChanges(null, null), seasonalChanges({ time: ['2026-11-15'] }, { time: ['2026-11-01'] }), seasonalChanges(seas.body.daily, null)], [null, null, null]);
  const fut = seasonFutures(POW, s, { today: '2026-11-14', endDate: '2027-05-31' });
  check('every past NASA year of the field becomes a future for every run, plus the usual years with no lean', fut.years.length >= 20 && fut.futures.length === fut.years.length * 51 && fut.futures.filter(x => x.run === -1).length === fut.years.length, brief([fut.years.length, fut.futures.length]));
  check('a future runs from today to the end date, moved to the coming dates', fut.coming[0] === '2026-11-14' && fut.coming.at(-1) === '2027-05-31' && fut.futures[0].days.length === fut.coming.length && fut.futures[0].days[0] === '20261114');
  const usual = fut.futures.find(x => x.run === -1 && x.year === fut.years[0]), lean = fut.futures.find(x => x.run === s.runs[0].id && x.year === fut.years[0]);
  check('the usual years are the past as it was; a run\'s copy is shifted by its own warmth change for each month', usual.hi[0] !== lean.hi[0] ? Math.abs((lean.hi[0] - usual.hi[0]) - s.runs[0].months['2026-11'].dT) < 0.011 : s.runs[0].months['2026-11'].dT === 0, brief([usual.hi[0], lean.hi[0], s.runs[0].months['2026-11']]));
  check('months the forecast does not reach (Jul onwards) would be left as the past year was', (() => { const late = seasonFutures(POW, s, { today: '2027-07-01', endDate: '2027-07-10' }); const u = late.futures.find(x => x.run === -1 && x.year === late.years[0]), l = late.futures.find(x => x.run !== -1 && x.year === late.years[0]); return JSON.stringify(u.hi) === JSON.stringify(l.hi); })());
  same('29 February in a year with none is 28 February', [sameDayIn('2028-02-29', 2027), sameDayIn('2028-02-29', 2024), sameDayIn('2026-11-14', 2010)], ['2027-02-28', '2024-02-29', '2010-11-14']);
  same('a season window with bad dates has no futures', [seasonFutures(POW, s, { today: 'x', endDate: '2027-01-01' }).futures.length, seasonFutures(POW, s, { today: '2027-02-01', endDate: '2027-01-01' }).futures.length, seasonFutures(null, s, { today: '2026-11-14', endDate: '2027-01-01' }).futures.length], [0, 0, 0]);
  // the counts of a season: with the lean and without it, hurt first, never added together
  const verdictOf = x => (x.run === -1 ? (x.year % 5 === 0 ? 'hurt' : 'fine') : (x.year % 3 === 0 ? 'hurt' : x.year % 7 === 0 ? 'close' : 'fine')), c = seasonCounts(fut.futures, verdictOf);
  check('the counts have both: with the lean (runs x past years) and the same past years with no lean, and the range of hurt per run', c.lean.runs === 50 * fut.years.length && c.usual.runs === fut.years.length && c.runs === 50 && c.years === fut.years.length && c.perRunHurt.min <= c.perRunHurt.max && c.lean.hurt + c.lean.close + c.lean.fine === c.lean.runs, brief(c));
  // ---- the next 24 months, from the real NASA record, the real seasonal answer and the real climate answer (one model)
  const um = usualMonths(POW); check('the usual month for each of the 12 months from 25 years of NASA weather: a mean, the middle half, and the rain', um.length === 12 && um.every(u => u.available && u.years >= 24 && u.low <= u.mean + 3 && u.high >= u.mean - 3 && u.low <= u.high && u.rain > 20 && u.rain < 200) && um[0].mean < 0 && um[6].mean > 15, brief(um.map(u => [Math.round(u.mean), Math.round(u.rain)])));
  const cf = climateFactors(clim.body); check('the real climate model\'s change for each calendar month: warmer by the 2040s, rain as a ratio within 0.5 and 2', cf.ok && cf.baseYears === 25 && cf.windowYears >= 8 && cf.windowYears <= 10 && cf.months.length === 12 && cf.months.every(c => c && c.dT > -3 && c.dT < 8 && c.r >= 0.5 && c.r <= 2) && cf.months.reduce((s, c) => s + c.dT, 0) / 12 > 0, brief(cf.months?.map(c => Math.round(c.dT * 10) / 10)));
  const rows = outlook(POW, { seasonal: s, climate: [cf], today: '2026-11-14' });
  check('24 months from this month: the first 7 moved by the seasonal runs, the other 17 by the climate trend', rows.length === 24 && rows[0].month === '2026-11' && rows[23].month === '2028-10' && rows.slice(0, 7).every(r => r.kind === 'seasonal') && rows.slice(7).every(r => r.kind === 'trend'), brief(rows.map(r => r.kind[0]).join('')));
  check('no month is 0 or missing: every row has a mean, a middle half and a rain total', rows.every(r => Number.isFinite(r.mean) && Number.isFinite(r.low) && Number.isFinite(r.high) && r.low <= r.high && r.rain > 0));
  check('the trend share starts at 0 in the middle of the NASA years and grows to 2046', (() => { const early = outlook(POW, { climate: [cf], today: '2014-01-15' })[0], late = outlook(POW, { climate: [cf], today: '2040-01-15' })[0]; return Math.abs(early.shift) < Math.abs(late.shift) && Math.abs(early.shift) < 0.2; })());
  const kinds = outlookKinds(rows); same('the kinds of month for the line under the chart', [kinds.counts, kinds.spans.map(x => [x.kind, x.n])], [{ seasonal: 7, trend: 17, usual: 0, unavailable: 0 }, [['seasonal', 7], ['trend', 17]]]);
  const usualOnly = outlook(POW, { today: '2026-11-14' }); check('with no model it is the usual month only, and says so', usualOnly.every(r => r.kind === 'usual') && leanWords(usualOnly[0]) === 'Usual month, no model');
  const fewYears = outlook({ days: POW.days.filter(d => +d.slice(0, 4) >= 2018), T2M_MAX: [], T2M_MIN: [], rain: [] }, { today: '2026-11-14' }); check('a place with too few NASA years has months that are "not available", never 0', fewYears.every(r => r.kind === 'unavailable' && !('mean' in r) && r.reason === 'Too few NASA years here for this month.'));
  same('a model with too few baseline or window years gives no answer, with the reason', [climateFactors({ daily: { time: clim.body.daily.time.slice(0, 365 * 5), temperature_2m_max: clim.body.daily.temperature_2m_max.slice(0, 365 * 5), temperature_2m_min: clim.body.daily.temperature_2m_min.slice(0, 365 * 5), precipitation_sum: clim.body.daily.precipitation_sum.slice(0, 365 * 5) } }).reason, climateFactors(null).reason], ['too few baseline years', 'No climate answer to read.']);
  same('a lean needs two thirds to agree: 38 of 51 runs warmer is warmer, 2 and 2 of 4 is no clear lean', [leanOf(Array(38).fill(1).concat(Array(13).fill(0.1))), leanOf([1, 1, -1, -1]), leanOf([])], [{ word: 'warmer', n: 38, of: 51 }, { word: null, n: 2, of: 4, warm: 2, cool: 2 }, { word: null, n: 0, of: 0 }]);
  same('the lean words are counts', [leanWords({ kind: 'seasonal', lean: { word: 'warmer', n: 38, of: 51 } }), leanWords({ kind: 'trend', lean: { word: null, n: 2, of: 4, warm: 2, cool: 2 } }), leanWords({ kind: 'unavailable' })], ['Warmer · warmer in 38 of 51 runs', 'No clear lean · warmer in 2, cooler in 2 of 4 models', 'Not available']);
  same('the kinds are named', KIND_WORDS, { seasonal: 'Seasonal forecast', trend: 'Usual + trend', usual: 'Usual only', unavailable: 'Not available' });
  same('the line under the chart', [kindsLine({ kind: 'seasonal', from: '2026-11', to: '2027-04', n: 6 }, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']), OUTLOOK_HINT], ['Nov 2026 to Apr 2027 (6 months): the usual month, moved by the European seasonal forecast.', 'Counts of model runs or models, never a chance.']);
  check('no lean word or line sounds like a chance', [leanWords({ kind: 'seasonal', lean: { word: 'warmer', n: 38, of: 51 } }), leanWords({ kind: 'trend', lean: { word: null, n: 2, of: 4, warm: 2, cool: 2 } }), OUTLOOK_HINT.replace('never a chance', 'counts')].every(x => !CHANCE_WORDS.test(x)));
  // ---- years ahead: each model moves the real past years; one vote per model
  const cfm = { ...cf, model: 'EC_Earth3P_HR' }, cfut = climateFutures(POW, [cfm, { ok: false }, null], { today: '2027-05-01', endDate: '2027-09-30' });
  check('one entry for each model that answered (a model with no answer is left out), each with the past years moved by its own change', cfut.length === 1 && cfut[0].model === 'EC_Earth3P_HR' && cfut[0].futures.length === cfut[0].years.length && cfut[0].years.length >= 20, brief([cfut.length, cfut[0]?.futures.length]));
  const plain = seasonFutures(POW, null, { today: '2027-05-01', endDate: '2027-09-30' }), j = 0;
  check('the copy is the real year plus the model\'s change for each calendar month (highs, lows), and rain times its ratio', Math.abs(cfut[0].futures[j].hi[0] - (plain.futures[j].hi[0] + cf.months[4].dHi)) < 1e-9 && Math.abs(cfut[0].futures[j].lo[0] - (plain.futures[j].lo[0] + cf.months[4].dLo)) < 1e-9 && Math.abs(cfut[0].futures[j].rain[0] - (plain.futures[j].rain[0] * cf.months[4].r)) < 1e-9);
  const cc = climateCounts(cfut, x => (x.year % 4 === 0 ? 'hurt' : 'fine'), ['hurt', 'fine', 'fine']); check('counts per model, the range across models, and the years as they really were', cc.models === 1 && cc.years === cfut[0].years.length && cc.hurtMin === cc.hurtMax && cc.per[0].tally.runs === cc.years && cc.real.hurt === 1);
  same('years ahead headline: the plan, the range of hurt years across models, and as they really were', yearsHeadline({ plan: 'Corn, then soybeans', field: 'North field', years: 25, min: 6, max: 8, models: 7, real: 5 }), 'Corn, then soybeans on North field, around 2045, high path: your 25 past seasons, changed the way each climate model says, are hurt 6 to 8 times out of 25, across 7 models. As they really were: hurt in 5 of 25.');
  check('the limits say one path only, that a month\'s change rests on 10 years, and that models are never averaged; the warming line is a range of models', YEARS_LIMITS.length === 3 && /Only one emissions path/.test(YEARS_LIMITS[0]) && /only 10 of its years/.test(YEARS_LIMITS[1]) && /never averaged/.test(YEARS_LIMITS[2]) && warmingLine(1.4, 2.6) === 'Warming of daytime highs by the 2040s here: +1.4 to +2.6 °C, depending on the model.' && [yearsHeadline({ plan: 'P', field: 'F', years: 25, min: 6, max: 8, models: 7, real: 5 }), YEARS_LIMITS[0], YEARS_LIMITS[2], warmingLine(1, 2)].every(x => !CHANCE_WORDS.test(x)) && /part of it is chance/.test(YEARS_LIMITS[1]));
  check('the climate answer is the recorded one-model span 2001 to 2050 (18,262 days) with highs, lows and rain', clim.body.daily.time.length === 18262 && clim.body.daily.time[0] === '2001-01-01' && clim.body.daily.time.at(-1) === '2050-12-31' && ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'].every(k => clim.body.daily[k].length === 18262));
}
console.log(`future: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
