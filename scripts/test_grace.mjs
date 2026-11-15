// Crophalo's suite for the Regional water storage layer (js/grace.js): answers in the GRACE-FO lookup's own shape rebuilt from known parts, a month with no measurement, open water, hostile input, the classes and their colours
// for every kind of colour sight, where a value stands on the bar, the region's disc on the map, the months a time-lapse plays and every sentence. No internet is needed. Run: node scripts/test_grace.mjs
// RULE: never loosen a check here without a written farming reason beside it. A month the satellites did not measure shown as 0 cm, or a region drawn as if it were the field, would tell a farmer something nobody measured.
import * as G from '../js/grace.js';
import { PLAY } from '../js/layeranim.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const pad = n => String(n).padStart(2, '0');
const mo = (y, m) => `${y}${'-'}${pad(m)}`;   // a month as the lookup writes it, built from its parts
const words = (...parts) => parts.join(' ');

// ---- an answer in the lookup's own shape (scripts/live/gracecell.py): April of the first year to September of the newest, with the gap between the two missions and one month with two part-month solutions
function answer({ last = [2026, 9], gaps = [], value = (y, m) => Math.round((Math.sin((m / 12) * 2 * Math.PI) * 8 + (y - 2014) * 0.2) * 100) / 100 } = {}) {
  const months = [];
  for (let y = 2002; y <= last[0]; y++) for (let m = 1; m <= 12; m++) {
    if ((y === 2002 && m < 4) || (y === last[0] && m > last[1])) continue;
    const label = mo(y, m), gap = gaps.includes(label) || (y === 2017 && m >= 7) || (y === 2018 && m <= 5);
    months.push([label, gap ? null : value(y, m), gap ? null : 2 + (y - 2002) * 0.2]);
  }
  return { ok: true, source: 'NASA GRACE and GRACE-FO, JPL mascon solution RL06.3Mv04', units: 'Centimetres of water', cell: { lat: 44.25, lon: -79.75, width_km: 39.8, height_km: 55.6, edges: { n: 44.5, s: 44, e: -79.5, w: -80 } },
    area_km: 300, months, newest_month: mo(...last), value_cm: months.at(-1)[1], uncertainty_cm: months.at(-1)[2], trend_cm_per_year: 0.17, trend_from: mo(2002, 4), trend_to: mo(...last), spot: { lat: 44.25, lon: -79.75 }, cached: false, fetched: '2026-11-15T05:00:00.000Z' };
}

// ---- the answer, rebuilt
const g = G.cleanGrace(answer());
check('a whole answer is read: every month in order, the newest is the last one measured, the centre of the square read', g.ok && g.months.length > 280 && g.newest === mo(2026, 9) && g.centre.lat === 44.25 && g.centre.lon === -79.75 && g.months.every((m, i) => i === 0 || m.month > g.months[i - 1].month), [g.ok, g.months?.length, g.newest]);
check('the gap between the two missions stays empty: no value is made up for it', g.months.filter(m => m.month >= mo(2017, 7) && m.month <= mo(2018, 5)).every(m => m.cm === null && m.unc === null));
same('the region is about 300 km across, as the lookup says', G.discKm(g), 300);
check('the trend is kept with its first and last month', g.trend && g.trend.cmPerYear === 0.17 && g.trend.from === mo(2002, 4) && g.trend.to === mo(2026, 9));
const shuffled = answer(); shuffled.months = [...shuffled.months].reverse().concat([[mo(2026, 9), 99, 1], ['bad', 1, 1], [mo(2026, 13), 2, 1], null, 'x']);
const g2 = G.cleanGrace(shuffled);
check('months out of order are put in order; a month written twice counts once (the first); anything that is not a month is left out', g2.ok && g2.months.length === g.months.length && g2.months.at(-1).cm === g.months.at(-1).cm);
const tail = answer(); tail.months.push([mo(2026, 10), null, null], [mo(2026, 11), null, null]);
same('empty months after the newest measured are dropped: the record ends on the newest month NASA measured', G.cleanGrace(tail).newest, mo(2026, 9));
const odd = answer(); odd.months = odd.months.map(([m, v, u], i) => (i === 3 ? [m, 'ten', u] : i === 4 ? [m, 1e9, u] : i === 5 ? [m, 3, -2] : [m, v, u]));
const g3 = G.cleanGrace(odd);
check('a value that is not a number, or is far outside the record, is empty; a negative uncertainty is empty, its value stays', g3.months[3].cm === null && g3.months[4].cm === null && g3.months[5].cm === 3 && g3.months[5].unc === null);
same('a failed lookup keeps its own plain reason, trimmed, with no control characters', G.cleanGrace({ ok: false, reason: 'NASA did not let this computer’s Earthdata login read the GRACE-FO file\u0007' }), { ok: false, reason: 'NASA did not let this computer’s Earthdata login read the GRACE-FO file', final: false });
same('open water is a final answer: kept, and said', G.cleanGrace({ ok: false, reason: 'This place is open water for the GRACE-FO data, which measures stored water on land', final: true }).final, true);
check('hostile or empty input is no answer, never a crash', [null, undefined, 3, 'x', [], {}, { ok: true }, { ok: true, months: 'x' }, { ok: true, months: [] }, { ok: true, months: [[mo(2026, 1), null, null]] }].every(v => G.cleanGrace(v).ok === false));
const nocell = answer(); delete nocell.cell; nocell.spot = { lat: 44.25, lon: -79.75 };
check('without the cell the square read (spot) is the centre; without both there is no answer', G.cleanGrace(nocell).ok && !G.cleanGrace({ ...answer(), cell: { lat: 'x' }, spot: null }).ok);
check('a size of region that is not believable falls back to 300 km', G.cleanGrace({ ...answer(), area_km: 5 }).areaKm === 300 && G.cleanGrace({ ...answer(), area_km: 330 }).areaKm === 330);

// ---- the half-degree square: every pin inside it shares one answer, as on the server
same('two pins in one half-degree square share a key, the next square has its own', [G.cellKey(44.4438, -79.6618) === G.cellKey(44.01, -79.99), G.cellKey(44.4438, -79.6618) === G.cellKey(44.51, -79.66)], [true, false]);
check('south and west of zero count the same way', G.cellKey(-0.1, -0.1) === '-1:-1' && G.cellKey(0.1, 0.1) === '0:0');

// ---- the classes and the bar
same('a value falls in its class; the edges belong to the class above', [-30, -20, -12, -5, 0, 4.99, 5, 15, 20, 45].map(v => G.classOf(v).words),
  ['much less water than usual', 'less water than usual', 'less water than usual', 'about usual', 'about usual', 'about usual', 'a little more water than usual', 'more water than usual', 'much more water than usual', 'much more water than usual']);
same('no value, no class', [G.classOf(null), G.classOf(NaN)], [null, null]);
const marks = [-60, -40, -25, -20, -15, -10, -7, -5, 0, 5, 7, 10, 15, 20, 25, 40, 60].map(G.barAt);
check('the marker moves left to right as the water rises, from the left edge to the right edge', marks.every((v, i) => i === 0 || v >= marks[i - 1]) && marks[0] === 0 && marks.at(-1) === 1 && G.barAt(0) === 0.5, marks);
check('beyond the open ends the marker stops at the edge, never past it', G.barAt(-500) === 0 && G.barAt(500) === 1 && G.barAt(null) === null);
check('the bar has one equal part per class, with hard edges', G.barGradient().startsWith('linear-gradient(90deg, #975126 0% 14.29%, #bf7c48 14.29% 28.57%') && G.barGradient().endsWith('#007072 85.71% 100%)'));

// ---- the colours: each side darker step by step, at least 8 L* apart, for every kind of colour sight; the two sides apart; never the page's blue
{
  const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lab = rgbLin => { const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = (0.4124564 * rgbLin[0] + 0.3575761 * rgbLin[1] + 0.1804375 * rgbLin[2]) / 0.95047, Y = 0.2126729 * rgbLin[0] + 0.7151522 * rgbLin[1] + 0.072175 * rgbLin[2], Z = (0.0193339 * rgbLin[0] + 0.119192 * rgbLin[1] + 0.9503041 * rgbLin[2]) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  const SIGHT = { normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],   // Machado, Oliveira and Fernandes (2009), severity 1
    deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] };
  const seen = (hex, m) => { const c = hexRgb(hex).map(lin); return lab(m.map(row => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])))); };
  const colours = G.GRACE_CLASSES.map(k => k.colour), mid = (colours.length - 1) / 2;
  same('seven classes, the middle one about usual', [colours.length, G.GRACE_CLASSES[mid].words], [7, 'about usual']);
  for (const [sight, m] of Object.entries(SIGHT)) {
    const Ls = colours.map(c => seen(c, m)[0]), dry = Ls.slice(0, mid + 1).reverse(), wet = Ls.slice(mid);
    const steps = side => side.slice(1).map((v, i) => side[i] - v);
    check(`with ${sight} sight each side gets darker step by step away from usual, at least 8 L* apart`, [...steps(dry), ...steps(wet)].every(s => s >= 8), Ls.map(v => v.toFixed(1)));
    const apart = [0, 1, 2].map(i => { const a = seen(colours[i], m), b = seen(colours[colours.length - 1 - i], m); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); });
    check(`with ${sight} sight less water and more water never look alike (colour difference over 25 at every step)`, apart.every(d => d > 25), apart.map(d => d.toFixed(1)));
  }
  const blue = hexRgb('#0a63d8');
  check('no class is the page\'s interactive blue or close to it', colours.every(c => { const a = hexRgb(c); return Math.hypot(a[0] - blue[0], a[1] - blue[1], a[2] - blue[2]) > 80; }), colours);
  const hue = ([r, gg, b]) => { const hi = Math.max(r, gg, b), d = hi - Math.min(r, gg, b); return !d ? 0 : (60 * (hi === r ? ((gg - b) / d) % 6 : hi === gg ? (b - r) / d + 2 : (r - gg) / d + 4) + 360) % 360; };
  check('the teal side stays green of blue (hue under 190), so it never reads as the page\'s blue', colours.slice(mid + 1).every(c => hue(hexRgb(c)) < 190), colours.slice(mid + 1).map(c => hue(hexRgb(c)).toFixed(0)));
  check('a month with no measurement is grey, not a colour of the scale', !colours.includes(G.GAP_COLOUR) && (() => { const [r, gg, b] = hexRgb(G.GAP_COLOUR); return r === gg && gg === b; })());
}

// ---- the region on the map
{
  const z = 7, n = 256 * 2 ** z, la = (44.25 * Math.PI) / 180, cx = ((-79.75 + 180) / 360) * n, cy = ((1 - Math.asinh(Math.tan(la)) / Math.PI) / 2) * n, tx = Math.floor(cx / 256), ty = Math.floor(cy / 256);
  const d = G.discInTile(g, z, tx, ty), mpp = (2 * Math.PI * 6378137 * Math.cos(la)) / n;
  check('the disc is centred on the square read, in the tile that holds it', d && Math.abs(d.x - (cx - tx * 256)) < 1e-6 && Math.abs(d.y - (cy - ty * 256)) < 1e-6);
  check('its radius is 150 km in map pixels at that latitude', d && Math.abs(d.r * mpp - 150000) < 1, d && d.r * mpp);
  same('a tile far away holds none of it', G.discInTile(g, z, tx + 6, ty), null);
  const b = G.discBounds(g);
  check('"Show the whole region" fits about 300 km north to south round the centre', Math.abs((b[1][0] - b[0][0]) * 111.195 - 300) < 3 && b[0][1] < -79.75 && b[1][1] > -79.75, b);
  check('a field-sized view lies inside one region; a view of half the province does not', G.viewInside(g, { s: 44.42, n: 44.47, w: -79.7, e: -79.62 }) && !G.viewInside(g, { s: 42, n: 46.5, w: -83, e: -76 }));
}

// ---- the months: one step, the newest, the time-lapse
same('one month earlier and later, an empty month included; none past either end', [G.stepMonth(g, mo(2018, 6), -1), G.stepMonth(g, mo(2026, 9), 1), G.stepMonth(g, mo(2002, 4), -1), G.stepMonth(g, 'x', 1)], [mo(2018, 5), null, null, null]);
const fr = G.graceFrames(g);
check('the time-lapse plays the last eight months, oldest first, ending on the newest', fr.length === PLAY.maxFrames && fr.at(-1) === mo(2026, 9) && fr[0] === mo(2026, 2) && fr.every((m, i) => i === 0 || m > fr[i - 1]), fr);
const gg = G.cleanGrace(answer({ gaps: [mo(2026, 6)] }));
check('a month with no measurement inside the last eight is played as empty, never skipped silently', G.graceFrames(gg).includes(mo(2026, 6)) && G.monthOf(gg, mo(2026, 6)).cm === null);
same('no answer, no frames', G.graceFrames({ ok: false }), []);

// ---- the words
const at = (v, u, m = mo(2026, 9)) => G.hereWords({ months: [{ month: m, cm: v, unc: u }] }, m);
same('the value is said in whole centimetres against the average, with its uncertainty and its month', at(-12.4, 2.04), `Stored water in this region: 12 cm less than the 2004–2009 average (± 2 cm) · ${words('Sep', '2026')}`);
same('a value inside its own uncertainty says so: about usual', at(-4.12, 7.54), `Stored water in this region: 4 cm less than the 2004–2009 average (± 8 cm), within the measurement’s uncertainty, so about usual · ${words('Sep', '2026')}`);
same('more water is said as more', at(15.6, 3), `Stored water in this region: 16 cm more than the 2004–2009 average (± 3 cm) · ${words('Sep', '2026')}`);
same('a value that rounds to nothing is the same as the average', at(0.3, 2), `Stored water in this region: the same as the 2004–2009 average (± 2 cm), within the measurement’s uncertainty, so about usual · ${words('Sep', '2026')}`);
same('a month with no measurement says so and is never a number', at(null, null, mo(2018, 1)), `Stored water in this region: no measurement for ${words('January', '2018')} (the satellites did not measure it; it is left empty, never filled in)`);
same('a month not in the record has no value, said plainly (never "not read")', G.hereWords(g, mo(1999, 1)), 'No value for your pin: no measurement that month.');
same('the newest month says it is the newest, and that it comes late', G.monthLine(g, mo(2026, 9)), `${words('September', '2026')}, the newest month NASA has (it comes about two months after the month ends)`);
same('the trend is a straight line through every month measured, with its span', G.trendWords(g), `Trend from ${words('April', '2002')} to ${words('September', '2026')}: +0.2 cm a year, a straight line through every month NASA measured.`);
same('no trend when the lookup gave none', G.trendWords({ ...g, trend: null }), 'No trend is given: fewer than five years of months were read.');
same('what the server said: no route, busy, its own reason, a final answer, nothing', [G.whyWords(null, 404), G.whyWords(null, 429), G.whyWords({ reason: 'NASA did not answer' }), G.whyWords({ final: true }), G.whyWords(null, 0)],
  [G.GRACE_WORDS.noroute, G.GRACE_WORDS.busy, 'NASA did not answer.', G.GRACE_WORDS.final, G.GRACE_WORDS.down]);
same('the class in words; an empty month is said as such', [G.classWords(g, mo(2026, 9)), G.classWords(G.cleanGrace(answer({ gaps: [mo(2026, 6)] })), mo(2026, 6))], [G.classOf(g.months.at(-1).cm).words, 'no measurement that month']);
same('the row says what the owner asked for, with its instrument kept for Show more', [G.GRACE.name, G.GRACE.sub, G.GRACE.plain], ['Regional water storage', 'GRACE / GRACE-FO 2002 to now · very coarse, about 300 km', 'Water stored across a wide region.']);
same('the coarse warning is the owner\'s words', G.GRACE_WORDS.coarse, 'Very coarse: one value for a whole region, not your field.');
check('the credit names the data and its DOI', /NASA JPL GRACE and GRACE-FO/.test(G.GRACE_CREDIT) && G.GRACE_CREDIT.includes(G.GRACE_DOI) && /PO\.DAAC/.test(G.GRACE_CREDIT));
same('the address asks our own server, four decimals, nothing else', G.GRACE_URL(44.44382, -79.66181), '/api/gracecell?lat=44.4438&lon=-79.6618');
const BAN = /NaN|undefined|null|\[object|Infinity|likely|probab|chance|forecast/;
check('every sentence is plain', [...Object.values(G.GRACE_WORDS).map(w => (typeof w === 'function' ? w(8) : w)), ...G.GRACE_CLASSES.flatMap(k => [k.words, k.range]), G.GRACE_CREDIT, G.hereWords(g, g.newest), G.trendWords(g), G.monthLine(g, g.newest)].every(t => typeof t === 'string' && t.length > 3 && !BAN.test(t)));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
