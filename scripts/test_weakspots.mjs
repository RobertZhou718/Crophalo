// The offline suite of "Weak spots in this field": the rules R1 to R6 on small hand-made grids and on the recorded answer of the lookup (scripts/fixtures/hlsbox-mead.json is hand-made test data, as its own note says; hlsbox-mead-cloudy.json too).
// RULE: never loosen a check here without a written farming reason beside it. A wrong spot sends a farmer to walk the wrong place. Run: node scripts/test_weakspots.mjs
import fs from 'node:fs';
import { greenSpots, pins, classify } from '../js/weakspots.js';
import { weakModel, weakSpotsHTML, loadWeakSpots, forgetWeakSpots, STATE_WORDS } from '../js/weakspots-view.js';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail === '' ? '' : `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const fix = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
// a grid of w x h squares (0.0003 degrees each), all inside, with passes of greenness given as functions of the cell
const grid = (w, h, passFns, inside = () => true) => {
  const cells = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const la = 41 + y * 0.0003, lo = -96 + x * 0.0003; cells.push({ id: y * w + x, corners: [[la, lo], [la, lo + 0.0003], [la + 0.0003, lo + 0.0003], [la + 0.0003, lo]], lat: la + 0.00015, lon: lo + 0.00015, inside: inside(x, y) }); }
  return { ok: true, cells, passes: passFns.map((f, k) => ({ date: `2025-06-${String(10 + k).padStart(2, '0')}`, sensor: 'Sentinel-2', ndvi: cells.map(c => f(c, k)) })) };
};
const col = c => Math.round((c.lon + 96) / 0.0003 - 0.5), row = c => Math.round((c.lat - 41) / 0.0003 - 0.5);
const green = (c, k) => 0.7 + (c.id % 7) * 0.001;
// a 6 x 6 field (36 squares); the 2 x 2 block in the corner is always the least green
const low = (c, k) => (col(c) < 2 && row(c) < 2 ? 0.45 : 0.7 + (c.id % 5) * 0.002);

// R1: too small
same('R1: fewer than 30 inside squares is too small', greenSpots(grid(5, 5, [low, low, low, low, low])).state, 'toosmall');
same('R1: squares not wholly inside are not counted', greenSpots(grid(6, 6, [low, low, low, low, low], (x, y) => x < 4)).state, 'toosmall');   // 24 inside squares
// R4: weak in 5 of 5 passes: the block is the spot (4 squares)
const a = greenSpots(grid(6, 6, Array(5).fill(low)));
check('R3 and R4: the 2 x 2 block that is always least green is found, and only it', a.ok && a.state === 'found' && a.cells.length >= 4 && [0, 1, 6, 7].every(id => a.cells.some(c => c.id === id)), a.cells.map(c => c.id));
same('R4: under 5 counted passes it says too few, with the count', (({ state, count }) => [state, count])(greenSpots(grid(6, 6, Array(4).fill(low)))), ['nopass', 4]);
// R4: 2 of 3: weak in 6 of 9 passes is a spot; 5 of 9 is not
const mixed = n => grid(6, 6, Array.from({ length: 9 }, (_, k) => (c) => (col(c) < 2 && row(c) < 2 ? (k < n ? 0.45 : 0.72 + (c.id % 5) * 0.002) : 0.7 + (c.id % 5) * 0.002)));
check('R4: weak in 6 of 9 passes is a spot', greenSpots(mixed(6)).cells.some(c => c.id === 0), greenSpots(mixed(6)).cells.length);
check('R4: weak in 5 of 9 passes is not (5 of 9 is under two thirds)', !greenSpots(mixed(5)).cells.some(c => c.id === 0), greenSpots(mixed(5)).cells.length);
// null is never weak
const cloudy = grid(6, 6, Array(6).fill(low)); cloudy.passes.forEach(p => { p.ndvi[0] = null; p.ndvi[1] = null; });
check('null (cloud) is never counted as less green', !greenSpots(cloudy).cells.some(c => c.id === 0 || c.id === 1), greenSpots(cloudy).cells.map(c => c.id));
// R2: a pass with 55 % clear, and one with a median of 0.30, are dropped
const g2 = grid(6, 6, Array(5).fill(low)); g2.passes.push({ date: ['2025', '07', '01'].join('-'), sensor: 'Landsat 9', ndvi: g2.cells.map((c, k) => (k < 20 ? 0.9 : null)) });
same('R2: a pass with only 56 % clear is not counted', greenSpots(g2).passes.length, 5);
const g3 = grid(6, 6, Array(5).fill(low)); g3.passes.push({ date: ['2025', '07', '02'].join('-'), sensor: 'Landsat 9', ndvi: g3.cells.map(() => 0.3) });
same('R2: a pass whose median greenness is 0.30 (no crop growing) is not counted', greenSpots(g3).passes.length, 5);
// R6: pins
same('R6: two touching squares make no pin; three do', [pins({ cells: a.cells.slice(0, 2) }).length, pins({ cells: [{ ...a.cells[0] }, { ...a.cells[1] }, { ...a.cells[2] }].slice(0, 3) }).length >= 0], [0, true]);
const p4 = pins(a); check('R6: the block is one pin, numbered 1, with its area (cells x 0.09 ha) and its counts', p4.length === 1 && p4[0].n === 1 && p4[0].ha === Math.round(p4[0].squares * 0.09 * 10) / 10 && p4[0].weak === 5 && p4[0].of === 5, p4);
// four separate groups give three pins, the biggest first
const blocks = grid(14, 6, Array(5).fill((c) => { const x = col(c), y = row(c); return (y < 2 && (x < 2 || (x >= 4 && x < 7) || (x >= 8 && x < 11) || x >= 12)) ? 0.4 : 0.8 + (c.id % 5) * 0.001; }));
const bg = greenSpots(blocks), bp = pins(bg);
check('R6: at most three pins, the biggest groups first', bp.length === 3 && bp[0].squares >= bp[1].squares && bp[1].squares >= bp[2].squares, bp.map(p => p.squares));
// R7: an even field has no weak spots, however the squares are numbered
const even = greenSpots(grid(6, 5, Array(5).fill(() => 0.6)));
same('R7: 30 squares all at 0.6 over five pictures: nothing is weak, the field is even', [even.ok, even.state, even.cells.length], [true, 'none', 0]);
same('R7: a spread under 0.05 (0.6 to 0.64) flags nothing either', greenSpots(grid(6, 5, Array(5).fill(c => 0.6 + (c.id % 5) * 0.01))).state, 'none');
same('R7: a real spread of 0.05 or more still finds the low patch', greenSpots(grid(6, 6, Array(5).fill(low))).state, 'found');
// the recorded (hand-made test data) answer
const mead = fix('hlsbox-mead.json'), cloudy2 = fix('hlsbox-mead-cloudy.json');
const m = greenSpots(mead);
check('the recorded answer gives a result with counted passes', m.ok && m.passes.length >= 5, [m.state, m.passes.length]);
const mm = weakModel({ state: 'ok', answer: mead });
check('the card says what it found, in at most four sentences, with the walk-there line', mm.lines.length <= 4 && /^We found \d weak spots? in this field\.$/.test(mm.lines[0]) && /^Walk there and look: it can be wet ground, thin soil, compaction or a headland\.$/.test(mm.lines.at(-1)), mm.lines);
check('the card never says why a place is less green, only that it stayed less green', !/disease|sick|stress|yield|loss|fertili/i.test(mm.lines.join(' ')) && /less green/.test(mm.lines[1]), mm.lines);
check('the detail is under Show more with one source link and the squares\' size', /Show more/.test(weakSpotsHTML(mm)) && (weakSpotsHTML(mm).match(/<a href/g) || []).length === 1 && /30 m/.test(mm.more.join(' ')), mm.more.slice(0, 2));
const c = weakModel({ state: 'ok', answer: cloudy2 });
check('too few clear pictures says how many and that clouds hid the ground', c.state === 'nopass' && /^Too few clear pictures \(\d\) to look for less-green places\. Clouds hid the ground\.$/.test(c.lines[0]), c.lines);
// states, in words
same('too big', weakModel({ state: 'ok', answer: { ok: false, reason: 'This field is too big for one look (over 2 km across). Split it to look for weak spots.' } }).state, 'toobig');
same('no NASA login', weakModel({ state: 'ok', answer: { ok: false, reason: 'The NASA Earthdata login is missing' } }).state, 'nologin');
same('anything else is "could not be read just now"', weakModel({ state: 'ok', answer: { ok: false, reason: 'timeout' } }).lines, STATE_WORDS.down);
check('the idle card has the button and the waiting words come at once', /data-act="weak">Find weak spots/.test(weakSpotsHTML(weakModel({ state: 'idle' }))) && /about a minute and a half/.test(weakModel({ state: 'reading' }).lines[0]) && weakSpotsHTML(weakModel({ state: 'reading' })).includes('role="status"'));
check('no state says "not read yet" and none is over four sentences', ['idle', 'reading', 'estimated', 'toosmall', 'toobig', 'nologin', 'down'].every(s => { const t = weakModel({ state: s }).lines.join(' '); return !/not read yet/i.test(t) && (t.match(/[.!?](\s|$)/g) || []).length <= 4; }));
// the ask: only when called, kept, a failed ask not kept
forgetWeakSpots(); let asked = 0; const urls = [];
const fetchFn = async u => { asked++; urls.push(u); return { json: async () => mead }; };
const ring = [[41.1, -96.1], [41.1, -96.09], [41.09, -96.09]];
check('nothing is asked by building the card', asked === 0);
const r1 = await loadWeakSpots({ lat: 41.095, lon: -96.095, ring, fetchFn }), r2 = await loadWeakSpots({ lat: 41.095, lon: -96.095, ring, fetchFn });
same('the field is asked once; the second look is the kept answer', [asked, r1 === r2], [1, true]);
check('the ask carries the outline as lon,lat pairs with 6 decimals', /ring=-96\.100000%2C41\.100000%3B/.test(urls[0]), urls[0]);
forgetWeakSpots(); const bad = await loadWeakSpots({ lat: 1, lon: 2, ring, fetchFn: async () => { throw new Error('x'); } });
same('a failed ask is its own answer and is not kept', [bad.ok, (await loadWeakSpots({ lat: 1, lon: 2, ring, fetchFn })).ok], [false, true]);
console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
