// Crophalo's weather-band suite: the fixed colour scale, the grid of 25 years by 365 days, a missing day staying empty, the leap day left out, the record handed over by the loader, and the curl's start (the rectangle) and end (the rings).
// RULE: never loosen a check to make it pass. No network, no page. Run: node scripts/test_macro_record.mjs
import fs from 'node:fs';
import { tempColor, columnOf, bandPixels, yearsWithData, curl, rowProgress, bandEnd, BAND, CAPTION, CURL_CAPTION } from '../js/macro-record.js';
import { recordDetail } from '../js/report-load.js';
import { buildSeries } from '../js/data.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

same('the scale ends are the slate and the amber, the stone in the middle', [tempColor(-10), tempColor(12), tempColor(35)], [[95, 107, 120], [184, 177, 160], [212, 145, 30]]);
check('a figure beyond the scale takes the end colour', JSON.stringify(tempColor(-40)) === JSON.stringify(tempColor(-10)) && JSON.stringify(tempColor(50)) === JSON.stringify(tempColor(35)));
check('a day not read has no colour', tempColor(NaN) === null && tempColor(undefined) === null && tempColor('9') === null);
let warm = true; for (let t = -10; t < 35; t++) { const a = tempColor(t), b = tempColor(t + 1); if (!((b[0] - b[2]) >= (a[0] - a[2]))) warm = false; }
check('warmer is never bluer: red minus blue only rises with the heat', warm);
check('the scale is never the action blue', [-10, 0, 12, 25, 35].every(t => { const c = tempColor(t); return !(c[2] > c[0] + 60 && c[2] > 180); }));
same('columns: 1 January is 0, 28 February is 58, 1 March is 59, 31 December is 364, 29 February has none', [columnOf(20250101), columnOf(20250228), columnOf(20250301), columnOf(20251231), columnOf(20240229)], [0, 58, 59, 364, -1]);
check('a leap year and a common year put 1 March in the same column', columnOf(20240301) === columnOf(20250301));
// a built record: 2001 to 2025, every day 10 °C but 2010 not sent, one gap, and 2025 ending on 30 June
const dates = [], tmax = [];
for (let y = 2001; y <= 2025; y++) { if (y === 2010) continue; for (let m = 1; m <= 12; m++) for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) { const date = y * 10000 + m * 100 + d; if (y === 2025 && date > 20250630) continue; dates.push(date); tmax.push(date === 20150704 ? NaN : 10); } }
const built = bandPixels(Int32Array.from(dates), Float32Array.from(tmax));
check('a row a year, 25 rows of 365 columns, RGBA', built.rows === 25 && built.columns === 365 && built.pixels.length === 25 * 365 * 4 && built.years.join() === Array.from({ length: 25 }, (_, i) => 2001 + i).join());
const px = (y, date) => built.pixels[((y - 2001) * 365 + columnOf(date)) * 4 + 3];
check('a day read is opaque, a gap is transparent, a year not sent is empty, days after the end are empty', px(2005, 20050315) === 255 && px(2015, 20150704) === 0 && px(2025, 20250630) === 255 && px(2025, 20250701) === 0 && px(2025, 20251201) === 0 && yearsWithData(built).indexOf(2010) < 0 && yearsWithData(built).length === 24);
check('every pixel read comes from a figure of the record: the count is the days sent less the leap days and the gap', built.filled === dates.filter(d => columnOf(d) >= 0).length - 1, `${built.filled}`);
same('the same figure gives the same colour in every row', [0, 1, 2].map(i => Array.from(built.pixels.slice((i * 365 + 100) * 4, (i * 365 + 100) * 4 + 3)).join()).filter((v, i, a) => v === a[0]).length, 3);
// what the loader hands on, from the recorded NASA POWER answer
const REC = JSON.parse(fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8')), S = buildSeries(REC, { lat: REC.geometry.coordinates[1], lon: REC.geometry.coordinates[0] });
const detail = recordDetail(S);
check('the detail is typed arrays of the same length, years 2001 to 2025 only, the figures the record holds', detail.dates instanceof Int32Array && detail.tmax instanceof Float32Array && detail.years instanceof Int16Array && detail.dates.length === detail.tmax.length && detail.years[0] >= 2001 && detail.years.at(-1) <= 2025 && detail.dates.every(d => d >= 20010101 && d <= 20251231));
const i0 = S.days.indexOf(String(detail.dates[10])); check('a figure in the detail is the series\' own', Math.abs(detail.tmax[10] - S.T2M_MAX[i0]) < 1e-3 || (Number.isNaN(detail.tmax[10]) && Number.isNaN(S.T2M_MAX[i0])));
check('no series, no detail', recordDetail(null) === null && recordDetail({ days: [], T2M_MAX: [] }) === null);
// the curl
const from = { x: 40, y: 100, w: 730, h: 250 }, to = { x: 500, y: 20, w: 120, h: 120 };
const shape = curl(from, to, built, { slices: 72 });
check('25 rows by 72 slices, a colour for each cell with a day read and none for the year not sent', shape.count === 1800 && shape.colors[(9 * 72 + 5) * 4 + 3] === 0 && shape.colors[(0 * 72 + 5) * 4 + 3] === 255);
const p0 = shape.at(0, new Float32Array(1800 * 8)), p1 = shape.at(1, new Float32Array(1800 * 8));
check('at 0 the cells are the rectangle, at 1 the rings, and every figure is finite', p0.every(Number.isFinite) && p1.every(Number.isFinite) && Math.abs(p0[0] - from.x) < 1e-3 && Math.abs(p0[1] - from.y) < 1e-3 && Math.abs(p0[1799 * 8 + 4] - (from.x + from.w)) < 1e-3 && Math.abs(p0[1799 * 8 + 5] - (from.y + from.h)) < 1e-3);
const dist = (p, k, q) => Math.hypot(p[k * 8 + q] - shape.center.x, p[k * 8 + q + 1] - shape.center.y);
check('at 1 every corner lies between the inner and the outer radius of the ring, the first row inside and the last outside', [0, 400, 1799].every(k => [0, 2, 4, 6].every(q => dist(p1, k, q) >= shape.radius.inner - 1e-3 && dist(p1, k, q) <= shape.radius.outer + 1e-3)) && dist(p1, 0, 0) < dist(p1, 1799, 4));
check('36 slices at low quality give 900 cells', curl(from, to, built, { slices: 36 }).count === 900);
check('rows trace 70 ms apart for 400 ms each, even, 2.08 s in all', rowProgress(0, 0) === 0 && rowProgress(200, 0) === 0.5 && rowProgress(70, 1) === 0 && rowProgress(270, 1) === 0.5 && rowProgress(2080, 24) === 1 && bandEnd(25) === 2080 && BAND.from === 2001 && BAND.to === 2025);
check('the captions are plain words and say the square, the source, the years and the scale', /NASA weather square around your field \(about 56 by 52 km\), NASA POWER, 2001 to 2025\. Scale: −10 °C to 35 °C\./.test(CAPTION) && /^Worked out from this weather record and the field’s water, soil, wash-off and market figures\.$/.test(CURL_CAPTION));
console.log(`macro_record: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
