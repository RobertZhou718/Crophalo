// Crophalo's shade suite: js/shade.js on made-up land whose answer is known by geometry: flat ground, a 10 m wall, a 10° ridge, a far hill,
// near land and far hill together, a 12 m tree row, missing heights, the job store, the words, the time a job may take. No internet is needed.
// RULE: never loosen a check here without a written farming reason beside it. A farmer decides where to plant frost-tender or sun-hungry crops by these strips.
// Run: node scripts/test_shade.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sun from '../js/sun.js';
import * as shade from '../js/shade.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);

const LAT = 44.39, LON = -79.69, DEC21 = { y: 2026, m: 12, d: 21 };   // Barrie in mid-winter: the sun at noon about 22° up, the shadows at their longest
const { SUN, LAND, TREES, HILLS, UNDER, DOWN, BAD } = shade.MOMENT;
const RAD = Math.PI / 180;

// A square of land of the given half-width in metres with a node every `cell` metres; the ground and the tree heights come from functions of (x, z).
function gridOf(half, cell, ground, trees = null) {
  const nx = Math.round(2 * half / cell) + 1, g = new Float32Array(nx * nx), t = trees ? new Float32Array(nx * nx) : null;
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const x = -half + i * cell, z = -half + j * cell; g[j * nx + i] = ground(x, z); if (t) t[j * nx + i] = trees(x, z); }
  return { nx, ny: nx, x0: -half, z0: -half, dx: cell, dz: cell, ground: g, trees: t };
}
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const job = (grid, polys, extra = {}) => shade.buildJob({ lat: LAT, lon: LON, grid, polys, ...extra });
const nodeAt = (j, x, z) => Math.round((z - j.lattice.z0) / j.lattice.step) * j.lattice.nx + Math.round((x - j.lattice.x0) / j.lattice.step);
const noonSun = () => { const ev = sun.sunEvents(DEC21, LAT, LON), s = sun.sunAt(ev.noon, LAT, LON); return { ev, apparent: s.apparent, azimuth: s.azimuth }; };

// ---- flat ground: nothing shades, a whole day of sun
{
  const j = job(gridOf(150, 2, () => 0), [box(-50, -50, 50, 50)], { step: 10 });
  const n = noonSun();
  check('flat ground: every near horizon is 0°', j.near.angles.every(b => b === 0));
  check('flat ground at noon: every spot is in sun', shade.momentOf(j, n).every(c => c === SUN || c === 255));
  const day = shade.dayOf(j, DEC21), mid = nodeAt(j, 0, 0), expected = n.ev.daylightMinutes;
  near('flat ground: the minutes of sun are the day length (to the 10-minute step)', day.minutes[mid], expected, 20);
  check('flat ground: the sun is not hidden before 10:00 or after 14:00 of the sun\'s own day', day.first[mid] - n.ev.rise < 11 * 60000 && n.ev.set - day.last[mid] < 11 * 60000);
  check('the sun being down is its own state', shade.momentOf(j, { apparent: -3, azimuth: 0 }).every(c => c === DOWN || c === 255));
  const f = shade.fieldOf(j, day, box(-40, -40, 40, 40));
  check('a flat field has no strip', !f.tooSmall && f.strips.length === 0, f.strips);
  near('a flat field\'s mean sun is the day', f.meanHours * 60, expected, 20);
}

// ---- a 10 m wall along east–west at 2 m thickness: the shadow falls north and reaches 10 / tan(sun height) on 21 December at noon
{
  const grid = gridOf(320, 1, (x, z) => z >= 0 && z <= 2 && Math.abs(x) <= 300 ? 10 : 0);
  const j = job(grid, [box(-30, -60, 30, -1), box(-30, 4, 30, 40)], { step: 1 });
  const n = noonSun(), m = shade.momentOf(j, n), want = 10 / Math.tan(n.apparent * RAD);
  check('wall: a spot 10 m north of it is shaded by the land', m[nodeAt(j, 0, -10)] === LAND, m[nodeAt(j, 0, -10)]);
  check('wall: a spot 15 m north is shaded', m[nodeAt(j, 0, -15)] === LAND);
  check('wall: a spot 40 m north is in sun', m[nodeAt(j, 0, -40)] === SUN);
  check('wall: a spot 10 m south of it is in sun (the sun is south)', m[nodeAt(j, 0, 10)] === SUN);
  let tip = 0; for (let d = 1; d <= 59; d++) if (m[nodeAt(j, 0, -d)] === LAND) tip = d;
  near(`wall: the shadow's tip is at 10 / tan(sun height) = ${want.toFixed(1)} m`, tip, want, 2);
  const day = shade.dayOf(j, DEC21);
  check('wall: 10 m behind it there is less than a third of the day\'s sun, 60 m behind it the whole day', day.minutes[nodeAt(j, 0, -10)] < n.ev.daylightMinutes / 3 && day.minutes[nodeAt(j, 0, -55)] > n.ev.daylightMinutes - 120, [day.minutes[nodeAt(j, 0, -10)], day.minutes[nodeAt(j, 0, -55)]]);
  check('wall: its shade is "land", not trees or hills', day.cause.land[nodeAt(j, 0, -10)] > 0 && day.cause.trees[nodeAt(j, 0, -10)] === 0 && day.cause.hills[nodeAt(j, 0, -10)] === 0);
}

// ---- a 10° ridge: the ground rises at 10° south of the line z = 0
{
  const t10 = Math.tan(10 * RAD);
  const grid = gridOf(320, 1, (x, z) => z > 0 ? t10 * z : 0);
  const j = job(grid, [box(-10, -1, 10, 21)], { step: 1 });
  const at = nodeAt(j, 0, 0), south = 36, north = 0;
  near('ridge: at its foot the horizon due south is 10° (a 0.5° step)', j.near.angles[at * shade.DIRS + south] * shade.ANGLE_UNIT, 10, 0.5);
  same('ridge: the horizon due north is 0°', j.near.angles[at * shade.DIRS + north], 0);
  check('ridge: every stored angle is a whole 0.5° step (one byte)', j.near.angles instanceof Uint8Array);
  check('ridge: a 12° sun in the south is in sun, an 8° sun is in shade', shade.momentOf(j, { apparent: 12, azimuth: 180 })[at] === SUN && shade.momentOf(j, { apparent: 8, azimuth: 180 })[at] === LAND);
  check('ridge: a sun low in the east is not hidden by a ridge in the south', shade.momentOf(j, { apparent: 8, azimuth: 90 })[at] === SUN);
  const up = nodeAt(j, 0, 20);
  same('ridge: on the slope, looking north the ground falls away: 0°', j.near.angles[up * shade.DIRS + north], 0);
}

// ---- a far hill 16.8° high in the south (Sion's horizon), read from the server
{
  const bytes = new Uint8Array(shade.DIRS); for (let k = 32; k <= 40; k++) bytes[k] = Math.round(16.8 / shade.ANGLE_UNIT);
  const far = { x0: 0, z0: 0, dx: 1, dz: 1, nx: 1, ny: 1, bytes };
  const j = job(gridOf(100, 2, () => 0), [box(-20, -20, 20, 20)], { step: 10, far }), at = nodeAt(j, 0, 0);
  check('far hill: an 10° sun in the south is behind the hills', shade.momentOf(j, { apparent: 10, azimuth: 180 })[at] === HILLS);
  check('far hill: a 20° sun in the south is in sun', shade.momentOf(j, { apparent: 20, azimuth: 180 })[at] === SUN);
  check('far hill: a low sun in the east is in sun (no hill there)', shade.momentOf(j, { apparent: 5, azimuth: 90 })[at] === SUN);
  check('far hill: it is read, and said to be read', j.farRead === true);
  // the near land and the far hills together: the higher of the two wins
  const t = Math.tan(25 * RAD);
  const both = job(gridOf(320, 1, (x, z) => z > 0 ? t * z : 0), [box(-5, -1, 5, 1)], { step: 1, far }), b = nodeAt(both, 0, 0);
  check('near 25° and far 16.8°: a 20° sun is shaded by the near land', shade.momentOf(both, { apparent: 20, azimuth: 180 })[b] === LAND);
  const t5 = Math.tan(5 * RAD);
  const low = job(gridOf(320, 1, (x, z) => z > 0 ? t5 * z : 0), [box(-5, -1, 5, 1)], { step: 1, far }), l = nodeAt(low, 0, 0);
  check('near 5° and far 16.8°: a 10° sun is behind the far hills', shade.momentOf(low, { apparent: 10, azimuth: 180 })[l] === HILLS);
  check('near 5° and far 16.8°: a 17.5° sun is in sun', shade.momentOf(low, { apparent: 17.5, azimuth: 180 })[l] === SUN);
  // bilinear between the server's spots
  const lo = new Uint8Array(2 * 2 * shade.DIRS).fill(0), hi = 40;
  for (let c = 0; c < 4; c++) for (let k = 0; k < shade.DIRS; k++) lo[c * shade.DIRS + k] = (c % 2) ? hi : 0;   // west spots 0, east spots 20°
  const grid2 = { x0: -100, z0: -100, dx: 200, dz: 200, nx: 2, ny: 2, bytes: lo };
  const lat = { x0: -100, z0: 0, step: 100, nx: 3, ny: 1, inside: new Uint8Array([1, 1, 1]), count: 3 };
  const f = shade.farHorizon(grid2, lat).angles;
  same('the far horizon is read bilinear between the server\'s spots: 0, half, full', [f[0], f[shade.DIRS], f[2 * shade.DIRS]], [0, 20, 40]);
  same('no far horizon read: zeros, and said so', [shade.farHorizon(null, lat).read, shade.farHorizon(null, lat).angles.every(b => b === 0)], [false, true]);
}

// ---- a 12 m tree row along the south edge of a field
{
  const grid = gridOf(200, 1, () => 0, (x, z) => z >= 102 && z <= 106 && x >= -20 && x <= 120 ? 12 : 0);
  const field = box(0, 0, 100, 100);
  const j = job(grid, [field], { step: 2 });
  const day = shade.dayOf(j, DEC21), f = shade.fieldOf(j, day, field);
  check('tree row: the field reads, and finds a strip on its south edge', !f.tooSmall && f.strips.length >= 1 && f.strips[0].edge === 'south', f.strips);
  const s = f.strips[0] || {};
  check('tree row: the strip is from trees', s.cause === 'trees', s.cause);
  check('tree row: the strip is about 15 to 50 m wide', s.width >= 15 && s.width <= 50, s.width);
  near('tree row: the trees are named 12 m tall', s.treeHeight, 12, 0.5);
  check('tree row: no strip on the north, east or west edges', f.strips.every(x => x.edge === 'south'), f.strips.map(x => x.edge));
  check('tree row: the field is less sunny than a flat one and its least sunny tenth is much less', f.meanHours < day.ev.daylightMinutes / 60 && f.leastSunnyHours < f.meanHours / 2, [f.meanHours, f.leastSunnyHours]);
  const words = shade.stripWords(s, { offsetMin: -300 });
  check('tree row: the strip is told "about … wide along the south edge … of trees"', /^A strip about \d+ m wide along the south edge/.test(words) && words.includes('trees'), words);
  check('tree row: a spot just north of the row is shaded at noon by trees', shade.momentOf(j, noonSun())[nodeAt(j, 50, 98)] === TREES);
  check('the horizon over a tree row is said to be a tree one', j.near.treeBits[nodeAt(j, 50, 98) * shade.DIRS + 36] === 1);
  // a small field is not worked out
  same('a field of fewer than four open spots is too small', shade.fieldOf(j, day, box(11, 11, 13, 13)).tooSmall, true);
  // a spot under a tree is "under", never counted as open ground of the field
  const treeTop = job(gridOf(60, 1, () => 0, (x, z) => Math.abs(x) < 3 && Math.abs(z) < 3 ? 8 : 0), [box(-10, -10, 10, 10)], { step: 1 });
  same('under a tree of 3 m or more: "under trees", whatever the sun does', shade.momentOf(treeTop, { apparent: 40, azimuth: 180 })[nodeAt(treeTop, 0, 0)], UNDER);
}

// ---- a missing height never shades and never clears
{
  const grid = gridOf(100, 1, (x, z) => (x > 20 && x < 40 ? NaN : 0));
  const j = job(grid, [box(-10, -10, 60, 10)], { step: 5 });
  same('a spot with no height is "bad", never clear sky', shade.momentOf(j, { apparent: 40, azimuth: 180 })[nodeAt(j, 30, 0)], BAD);
  same('a missing height beside a spot does not shade it', shade.momentOf(j, { apparent: 2, azimuth: 90 })[nodeAt(j, 10, 0)], SUN);
  const day = shade.dayOf(j, DEC21), f = shade.fieldOf(j, day, box(-10, -10, 60, 10));
  check('the bad spots are left out of the field\'s figures', f.spots === shade.fieldOf(j, day, box(-10, -10, 20, 10)).spots + shade.fieldOf(j, day, box(40, -10, 60, 10)).spots || f.spots < 45, f.spots);
  const none = job(gridOf(40, 2, () => NaN), [box(-10, -10, 10, 10)], { step: 5 });
  same('a grid with no height at all says the ground was not read', none.groundRead, false);
  check('and every spot of it is bad', shade.momentOf(none, { apparent: 40, azimuth: 180 }).every(c => c === BAD || c === 255));
}

// ---- polar night: no sun, no strips
{
  const j = shade.buildJob({ lat: 69.65, lon: 18.96, grid: gridOf(100, 2, () => 0), polys: [box(-30, -30, 30, 30)], step: 10 });
  const day = shade.dayOf(j, DEC21);
  check('Tromsø in the polar night: no steps, no minutes of sun', day.steps === 0 && day.minutes.every(v => v === 0));
  same('and no strip is invented', shade.fieldOf(j, day, box(-20, -20, 20, 20)).strips, []);
}

// ---- the step, the limits
same('the step for 1 km² on a computer keeps under 90,000 spots: 4 m', shade.chooseStep(1e6), 4);
same('the step for 1 km² on a phone keeps under 25,000 spots: 10 m', shade.chooseStep(1e6, true), 10);
same('a small field starts at 2 m on a computer and 4 m on a phone', [shade.chooseStep(1000), shade.chooseStep(1000, true)], [2, 4]);
same('the biggest step is 30 m', shade.chooseStep(1e10), 30);
{
  const l = shade.makeLattice([box(0, 0, 100, 60)], 10);
  same('the lattice counts its spots', [l.nx, l.ny, l.count], [10, 6, 60]);
  check('a point in and out of a polygon', shade.pointInPolygon(5, 5, box(0, 0, 10, 10)) && !shade.pointInPolygon(15, 5, box(0, 0, 10, 10)));
  near('the area of a 100 × 60 box', shade.polygonArea(box(0, 0, 100, 60)), 6000, 1e-6);
}

// ---- the words: about, to the half hour
same('hours are said to the half hour', [6.2, 6.3, 6.75, 14.4, 0.3, 0.1, 8].map(shade.hoursWords), ['6 h', '6½ h', '7 h', '14½ h', '½ h', 'less than ¼ h', '8 h']);
same('a missing figure is "not read"', shade.hoursWords(NaN), 'not read');
same('shade times go to 10 minutes', shade.aboutTime(Date.UTC(2026, 11, 21, 8, 44), { offsetMin: 0 }), 'about 08:40');
check('the recipe says "to the half hour"', shade.RECIPE.startsWith('About, to the half hour.'));
check('a sunless strip says there is no direct sun', shade.stripWords({ edge: 'north', width: 22, cause: 'hills', sunless: true }, {}).includes('gets no direct sun'));

// ---- the job store keeps the last 2, the worker answers each message once
{
  const input = { lat: LAT, lon: LON, grid: gridOf(60, 2, () => 0), polys: [box(-10, -10, 10, 10)], step: 10 };
  for (const key of ['a', 'b', 'c']) shade.runJob({ op: 'build', key, input });
  same('the last 2 jobs are kept', shade.jobKeys(), ['b', 'c']);
  let said = ''; try { shade.runJob({ op: 'moment', key: 'a', sun: { apparent: 10, azimuth: 180 } }); } catch (e) { said = e.message; }
  check('a dropped job says to build it again', said.includes('build it again'), said);
  check('a kept job answers a moment', shade.runJob({ op: 'moment', key: 'c', sun: { apparent: 30, azimuth: 180 } }).moment instanceof Uint8Array);
  same('a drop is answered', shade.runJob({ op: 'drop', key: 'c' }).dropped, true);
  const w = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'shade-worker.js'), 'utf8');
  check('the worker answers every message once, with an id, and reports failures as text', /postMessage\(\{ id: msg\.id, ok: true/.test(w) && /ok: false, error/.test(w) && w.includes("from './shade.js'"));
}

// ---- time: the near job on a 220 × 220 m piece (12,100 spots of 2 m, on a 1 m lidar-like surface with trees) must finish in 4 seconds of processor time
{
  const grid = gridOf(300, 1, (x, z) => 3 * Math.sin(x / 40) * Math.cos(z / 55), (x, z) => (x * 7 + z * 13) % 97 === 0 ? 9 : 0);
  const c0 = process.cpuUsage();   // the processor time of this run, so other programs busy on the same computer do not make a fair job look slow
  const j = job(grid, [box(-110, -110, 110, 110)], { step: 2 });
  const c1 = process.cpuUsage(c0), ms = (c1.user + c1.system) / 1000;
  console.log(`the near job on ${j.lattice.count} spots took ${(ms / 1000).toFixed(2)} s of processor time`);
  // A time is only judged when the computer is not busy with other work: on a computer running many programs the same job takes several times as long.
  const busy = os.loadavg()[0] > os.cpus().length * 0.7;
  if (busy) console.log(`the time is not judged: the computer is busy (load ${os.loadavg()[0].toFixed(0)} on ${os.cpus().length} cores)`);
  else check('the near job on about 12,000 spots takes under 4 s of processor time', ms < 4000, ms);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
