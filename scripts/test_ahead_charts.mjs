// Crophalo's Look ahead charts suite: the band chart and the two 24-month charts drawn from the recorded Oxford answers through the real jobs. Checks the bands, the gaps, the spoken sentences, every number in the folded tables, escaping, no chance words, nothing animated.
// RULE: never loosen a check to make it pass. No network. Run: node scripts/test_ahead_charts.mjs
import fs from 'node:fs';
import { computeJob } from '../js/ahead-job.js';
import { buildSeries } from '../js/data.js';
import { cropOf } from '../js/crops.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const rec = name => { const text = fs.readFileSync(new URL(`./fixtures/open-meteo/${name}.rec`, import.meta.url), 'utf8'); return JSON.parse(text.slice(text.indexOf('\n') + 1)); };
const ENS = rec('ensemble-oxford'), SEAS = rec('seasonal-oxford'), CLIM = rec('climate-oxford');
const POW = buildSeries(JSON.parse(fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8')), { lat: 43.13, lon: -80.75 });
const judge = (season, series) => { const causes = []; let seen = 0; for (let i = 0; i < series.days.length; i++) { const d = `${series.days[i].slice(0, 4)}-${series.days[i].slice(4, 6)}-${series.days[i].slice(6, 8)}`; if (d < season.sow || d > season.harvest) continue; seen++; const lo = series.T2M_MIN[i]; if (!Number.isFinite(lo)) continue; if (lo <= -2) causes.push({ severity: 'hit', kind: 'frost-young', date: d }); else if (lo < 0) causes.push({ severity: 'close', kind: 'frost-young', date: d }); } return seen ? { verdict: causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine', causes, notes: [] } : { verdict: 'growing', causes: [], notes: [] }; };
const WHEAT = { seasons: [{ crop: 'wheat', sow: '2026-10-05', harvest: '2027-07-20' }] };
const T = '2026-11-14';

import { bandChartSVG, bandWords, bandTable, tempChartSVG, rainChartSVG, outlookWords, outlookTables, deg } from '../js/ahead-charts.js';
const CHANCE = /\b(chance|probab|likel|odds|percent|%|guarantee|forecast says it will)/i;
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const w = await computeJob('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: WHEAT, today: T, endDate: '2026-11-28', fieldElev: 298, ctx: {} }, { judge, cropOf });
const b = w.result.per[0].bands, runs = w.result.per[0].tally.runs;
check('bands: one entry per day of the window, with 51 runs', b.days.length >= 10 && b.runs === 51 && runs === 51 && b.lo.length === b.days.length, `${b.days.length} days`);
check('bands: every band is ordered lowest <= middle half <= highest and counts its runs', b.lo.concat(b.hi).filter(Boolean).every(x => x.min <= x.q1 && x.q1 <= x.q3 && x.q3 <= x.max && x.n >= 5 && x.n <= 51));
const svg = bandChartSVG(b, { kind: 'lo', lines: [{ v: 0, label: '0 °C' }, { v: -2, label: '−2 °C' }], label: 'x' });
check('band chart: an svg with a label, a light band, a darker middle half and two dashed crop lines', /^<svg/.test(svg) && /role="img"/.test(svg) && /class="ab-all"/.test(svg) && /class="ab-mid"/.test(svg) && (svg.match(/class="ab-line"/g) ?? []).length === 2);
check('band chart: days after the 7th are drawn thinner', /class="ab-all thin"/.test(svg) && /class="ab-mid thin"/.test(svg));
check('band chart: nothing is animated and no centre line is drawn', !/<animate|<set |animateTransform|style="[^"]*animation/.test(svg) && !/ab-mean|ch-median/.test(svg));
const gappy = { days: ['2026-11-14', '2026-11-15', '2026-11-16'], lo: [{ min: 1, q1: 2, q3: 3, max: 4, n: 9 }, null, { min: 0, q1: 1, q3: 2, max: 3, n: 9 }], hi: [null, null, null], runs: 9 };
const g2 = { days: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'], lo: [{ min: 1, q1: 2, q3: 3, max: 4, n: 9 }, { min: 1, q1: 2, q3: 3, max: 4, n: 9 }, null, { min: 0, q1: 1, q3: 2, max: 3, n: 9 }], hi: [null, null, null, null], runs: 9 };
check('band chart: a day with too few runs breaks the band, it is never bridged (the lone day after it draws nothing)', (bandChartSVG(g2, { kind: 'lo' }).match(/class="ab-all" d="(M[^"]*Z)"/)?.[1].match(/M/g) ?? []).length === 1 && !/class="ab-all" d="[^"]*Z M/.test(bandChartSVG(g2, { kind: 'lo' })));
check('band chart: no value at all draws nothing', bandChartSVG({ days: [], lo: [], hi: [], runs: 0 }) === '' && bandChartSVG(gappy, { kind: 'hi' }) === '');
const words = bandWords(b, 'lo', { model: 'European model', runs, below0: w.result.per[0].nights.below0, belowLine: w.result.per[0].nights.belowHard, lineLabel: '−2 °C' });
check('band words: the model, the 51 runs, the coldest night with its range and the middle half, the counts below 0', /European model/.test(words) && /51 runs/.test(words) && /coldest night/.test(words) && /middle half/.test(words) && new RegExp(`${w.result.per[0].nights.below0} of 51 runs have a night below 0 °C`).test(words), words);
check('band words: no chance words', !CHANCE.test(words) && !CHANCE.test(bandWords(b, 'hi', { model: 'm', runs })));
check('band words: nothing to draw says so', /not enough runs/.test(bandWords(gappy, 'hi', { model: 'm', runs: 9 })));
const tbl = bandTable(b, 'lo', 'Nights');
check('band table: one row for every day, every min and max of the chart is readable', (tbl.match(/<tr><th scope="row">/g) ?? []).length === b.days.length && b.lo.filter(Boolean).every(x => tbl.includes(deg(x.min)) && tbl.includes(deg(x.max))));
check('band table: a gap day says too few runs', bandTable(gappy, 'lo', 'N').includes('Too few runs with a value'));
check('band table: the caption is escaped', bandTable(b, 'lo', '<b>x</b>').includes('&lt;b&gt;') && !bandTable(b, 'lo', '<b>x</b>').includes('<b>x'));

const o = await computeJob('outlook', { seasonal: SEAS, climate: [{ model: 'EC_Earth3P_HR', answer: CLIM }], series: POW, today: T }, { judge, cropOf });
const rows = o.result.rows;
check('outlook rows: every month has the usual values next to the moved ones', rows.length === 24 && rows.filter(r => r.kind !== 'unavailable').every(r => Number.isFinite(r.usual.mean) && Number.isFinite(r.usual.rain) && Number.isFinite(r.mean)));
const t = tempChartSVG(rows), r = rainChartSVG(rows), ow = outlookWords(rows);
check('temperature chart: the moved mean, the dashed usual month, the middle half, the seasonal months shaded', /^<svg/.test(t) && /class="ab-mean"/.test(t) && /class="ab-usual"/.test(t) && /class="ab-mid"/.test(t) && /class="ab-season"/.test(t) && /role="img"/.test(t));
check('rain chart: one bar for each month with a number, and a mark for the usual month', (r.match(/class="ab-bar/g) ?? []).length === rows.filter(x => x.kind !== 'unavailable').length && (r.match(/class="ab-tick"/g) ?? []).length === (r.match(/class="ab-bar/g) ?? []).length && /<title>[A-Z][a-z]{2} 20\d\d: about \d+ mm \(usual \d+ mm\)/.test(r));
check('charts: not animated', !/<animate|animateTransform|animation/.test(t + r));
check('outlook words: the warmest and coldest month and the wettest and driest, with the usual, and no chance words', /warmest month/.test(ow.temp) && /coldest/.test(ow.temp) && /wettest/.test(ow.rain) && /driest/.test(ow.rain) && /usual/.test(ow.temp) && !CHANCE.test(ow.temp + ow.rain), ow.temp);
check('outlook words: the label of each chart is its sentence', t.includes(ow.temp.slice(0, 40)) && r.includes(ow.rain.slice(0, 40)));
const ot = outlookTables(rows);
check('outlook table: 24 rows and every moved and usual figure is readable', (ot.match(/<tr><th scope="row">/g) ?? []).length === 24 && rows.filter(x => x.kind !== 'unavailable').every(x => ot.includes(deg(x.mean)) && ot.includes(`${Math.round(x.rain)} mm`)));
const some = rows.map((x, i) => i === 3 ? { ...x, kind: 'unavailable', reason: 'No forecast <i>here</i>' } : x);
check('a missing month is a gap, its reason is escaped in the table, and the sentence still works', outlookTables(some).includes('No forecast &lt;i&gt;here&lt;/i&gt;') && /^<svg/.test(tempChartSVG(some)) && outlookWords(some).temp.length > 40);
check('nothing available says so', outlookWords(rows.map(x => ({ ...x, kind: 'unavailable' }))).temp.includes('too few') && tempChartSVG(rows.map(x => ({ ...x, kind: 'unavailable' }))) === '' && rainChartSVG([]) === '');
console.log(`ahead_charts: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
