// Crophalo's suite for the terrain analysis (js/terrain-math.js, js/terrain-jobs.js): known synthetic height grids (a flat plane, ramps, a bowl, a ridge in a low sun), real Terrain Tiles recorded fresh from the bucket, the erosion factors,
// the classes, the colours under colour-blind sight, the words and the fetching rules. RULE: never loosen a check here without a written farming reason beside it (a slope, a frost pocket or a shadow drawn must be one the heights really show).
import zlib from 'node:zlib';
import { recorded, BARRIE, ANKARA, BLOCK } from './terrain_fixtures.mjs';
import * as T from '../js/terrain-math.js';
import { createEngine, AT_ONCE } from '../js/terrain-jobs.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail === '' ? '' : `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const near = (name, got, want, tol) => check(name, Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const inflate = bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
const { SIDE, MID, TILE } = T;

// ---- synthetic grids: heights from a function of (row, col) of the 768 × 768 block, square pixels of a given size
function synth(fn, { size = 30, gx = size, gy = size, whole = false } = {}) {
  const raw = new Float32Array(SIDE * SIDE);
  for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) raw[r * SIDE + c] = fn(r, c);
  let lo = Infinity, hi = -Infinity; for (const v of raw) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return { raw, smooth: null, smoothed: -1, gx: new Float64Array(SIDE).fill(gx), gy: new Float64Array(SIDE).fill(gy), whole, lo, hi, z: 12, y: 1482 };
}
const render = (kind, grid, opts = {}) => { const out = new Uint8ClampedArray(TILE * TILE * 4), gen = T.renderTile(kind, grid, opts, out); let s; while (!(s = gen.next()).done); return s.value; };
const alphaAt = (rgba, y, x) => rgba[(y * TILE + x) * 4 + 3];
const rgbAt = (rgba, y, x) => [0, 1, 2].map(k => rgba[(y * TILE + x) * 4 + k]);
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// a flat plane: no slope anywhere, nothing drawn
{
  const g = synth(() => 250), v = T.pointValues(g, MID + 128, MID + 128);
  same('a flat plane has a slope of exactly 0 %', [v.slopePct, v.slopeDeg], [0, 0]);
  check('on a flat plane the slope layer draws nothing (under 2 % is left clear)', render('slope', g).every((b, i) => i % 4 !== 3 || b === 0));
  check('on a flat plane the relief shading draws nothing', render('relief', g).every((b, i) => i % 4 !== 3 || b === 0));
  near('flat ground under the relief light gets 255 × cos 45°', T.hillshade(0, 0), 255 * Math.SQRT1_2, 1e-9);
  same('a flat plane is never a frost pocket (it is level with its surroundings)', render('frost', g).some((b, i) => i % 4 === 3 && b > 0), false);
}
// ramps: a 10 % rise gives 10 %, whichever way it faces and whatever the pixel size
{
  const east = synth((r, c) => 200 + 0.1 * c * 30), v = T.pointValues(east, MID + 100, MID + 100);
  near('a 10 % ramp rising east reads 10 %', v.slopePct, 10, 0.01);
  near('and 5.7° (atan 0.1)', v.slopeDeg, Math.atan(0.1) * 180 / Math.PI, 0.01);
  const south = synth(r => 300 - 0.1 * r * 20, { gx: 45, gy: 20 }), w = T.pointValues(south, MID + 50, MID + 200);
  near('a 10 % ramp falling south on 45 m × 20 m pixels reads 10 % (the north–south size is used north–south)', w.slopePct, 10, 0.01);
  const seven = render('slope', synth((r, c) => 200 + 0.07 * c * 30));
  same('a 7 % ramp is drawn in the "sloping" class (5 to 10 %) everywhere', new Set([...Array(TILE * TILE).keys()].map(i => seven.slice(i * 4, i * 4 + 4).join())).size, 1);
  same('in that class\'s colour', rgbAt(seven, 10, 10), hexRgb(T.SLOPE_CLASSES[2].colour));
  const steep = render('slope', synth((r, c) => 200 + 0.4 * c * 30));
  same('a 40 % ramp is "steep" (over 30 %)', rgbAt(steep, 128, 128), hexRgb(T.SLOPE_CLASSES[5].colour));
  // the true size of a pixel: the demo field's tile at zoom 12
  const s = T.rowSize(12, BARRIE.y, MID + 128);
  same('a pixel of the Barrie tile at zoom 12 is 27.34 m east–west and 27.24 m north–south (WGS84)', [s.gx.toFixed(2), s.gy.toFixed(2)], ['27.34', '27.24']);
  const real = T.makeGrid(Array(9).fill(new Float32Array(TILE * TILE)), 12, BARRIE.y, false);
  for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) real.raw[r * SIDE + c] = 250 + 0.1 * c * real.gx[r];
  near('a 10 % ramp laid out on the true pixel sizes of that tile reads 10 %', T.pointValues(real, MID + 128, MID + 40).slopePct, 10, 0.05);
}
// the classes and their words
same('slope classes: FAO\'s, with everything under 2 % as one', [1.99, 2, 4.99, 5, 9.99, 10, 14.99, 15, 29.99, 30, 80].map(T.slopeClass), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
same('every slope class says its range in % and in degrees', T.SLOPE_CLASSES.map(k => `${k.range} (${k.degrees})`), ['under 2 % (0 to 1.1°)', '2 to 5 % (1.1 to 2.9°)', '5 to 10 % (2.9 to 5.7°)', '10 to 15 % (5.7 to 8.5°)', '15 to 30 % (8.5 to 16.7°)', 'over 30 % (over 16.7°)']);
same('the value at the pin: whole percent and whole degrees, under 2 % said as such', [T.slopeHere({ ok: true, slopePct: 4.4, slopeDeg: 2.52 }), T.slopeHere({ ok: true, slopePct: 1.2, slopeDeg: 0.7 }), T.slopeHere({ ok: false })], ['4 % (about 3°), gently sloping', 'under 2 % (flat to very gently sloping)', null]);

same('FAO\'s steep (30 to 60 %) and very steep (over 60 %) share one colour, and the value at the pin says which', [T.slopeHere({ ok: true, slopePct: 45, slopeDeg: 24.2 }), T.slopeHere({ ok: true, slopePct: 70, slopeDeg: 35 }), T.SLOPE_CLASSES[5].words, T.slopeClass(70)], ['45 % (about 24°), steep', '70 % (about 35°), very steep', 'steep (over 60 %: very steep)', 5]);
check('the method says which FAO classes are joined', /classes under 2 % are joined/.test(T.METHOD.slope) && /steep and very steep classes \(30 to 60 % and over 60 %\) share one colour/.test(T.METHOD.slope));

// relief shading: Esri's formula, light from the north-west, 45° up
{
  const nw = T.hillshade(Math.SQRT1_2, Math.SQRT1_2);   // ground rising to the south-east at 45°: it faces the north-west light square on
  near('a 45° slope facing the north-west light gets the full 255', nw, 255, 1e-9);
  same('a slope facing away (south-east) at 45° or more gets 0', T.hillshade(-1, -1), 0);
  const g = synth((r, c) => 200 + 0.2 * (r + c) * 30), shade = render('relief', g);   // rising to the south-east: faces the light
  const g2 = synth((r, c) => 200 - 0.2 * (r + c) * 30), dark = render('relief', g2);   // falling to the south-east: turned away
  check('ground facing the light is left clear, ground turned away is darkened', alphaAt(shade, 128, 128) === 0 && alphaAt(dark, 128, 128) > 60, [alphaAt(shade, 128, 128), alphaAt(dark, 128, 128)]);
  const gentle = synth((r, c) => 200 - 0.02 * (r + c) * 30), faint = render('relief', gentle), strong = render('relief', gentle, { strong: true });
  check('"Stronger shading" darkens gentle ground more than the true heights do', alphaAt(strong, 128, 128) > 2 * alphaAt(faint, 128, 128) && alphaAt(faint, 128, 128) > 0, [alphaAt(faint, 128, 128), alphaAt(strong, 128, 128)]);
}
// frost pockets: a bowl gives a pocket in its middle, never its rim; steep ground and the sea are never pockets
{
  const bowl = (depth, centreHeight = 250) => (r, c) => { const d2 = ((r - MID - 128) ** 2 + (c - MID - 128) ** 2) * 900, rim = 600 ** 2; return centreHeight + depth * Math.min(d2, rim) / 90000; };
  const deep = synth(bowl(9)), shallow = synth(bowl(4.5)), sea = synth(bowl(9, -40));
  const vd = T.pointValues(deep, MID + 128, MID + 128), vs = T.pointValues(shallow, MID + 128, MID + 128);
  near('the middle of a bowl 9 m deep at 300 m lies 6.6 m below the average of the ±300 m square round it (the TPI, worked out by hand on the 30 m pixels)', vd.tpi, -9 * (2 * (770 / 21) * 900) / 90000, 0.01);
  same('so it is "cold air settles more", and a bowl half as deep is "may settle"', [vd.frost, vs.frost], [1, 0]);
  const fd = render('frost', deep);
  same('the bowl\'s middle is drawn in the deep frost colour', rgbAt(fd, 128, 128), hexRgb(T.FROST_CLASSES[1].colour));
  check('its rim and the land round it are not drawn', alphaAt(fd, 128, 128 + 25) === 0 && alphaAt(fd, 10, 10) === 0, [alphaAt(fd, 128, 153), alphaAt(fd, 10, 10)]);
  same('a pocket at or below sea level is never drawn (the sea is not judged)', render('frost', sea).some((b, i) => i % 4 === 3 && b > 0), false);
  same('the frost classes: −2 m and −5 m, only on slopes under 5 %', [T.frostClass(-1.9, 1, 100), T.frostClass(-2, 1, 100), T.frostClass(-5, 4.9, 100), T.frostClass(-8, 5, 100), T.frostClass(-8, 1, 0)], [-1, 0, 1, -1, -1]);
  same('the window is 300 m: 11 pixels each way on the demo field\'s 27 m grid', T.frostRadius(27.34), 11);
  // a lake: flat water lies low and level beside rising shores, so its edge would read as a pocket; it is not judged
  const lake = synth((r, c) => { const d = Math.hypot(r - MID - 128, c - MID - 128); return d < 60 ? 219 : 219 + 3 * (d - 60); });
  check('near the shore the lake lies over 2 m below its surroundings, flat: by the heights alone it would be a pocket', T.pointValues(lake, MID + 128, MID + 128 + 55).frost >= 0, T.pointValues(lake, MID + 128, MID + 128 + 55).tpi);
  same('but a dead-level area bigger than half a square kilometre (a lake) is not drawn as frost pockets', alphaAt(render('frost', lake), 128, 128 + 55), 0);
  same('the sentence at the pin', [T.frostHere(vd), T.frostHere({ ok: true, height: 50, tpi: 2.4, slopePct: 1 }), T.frostHere({ ok: true, height: 50, tpi: -3, slopePct: 7 })],
    ['This spot is 7 m below the ground around it (within 300 m): cold air can settle here on clear, calm nights.', 'This spot is 2 m above the ground around it (within 300 m): cold air drains away.', 'This spot is 3 m below the ground around it (within 300 m), on a slope of 5 % or more: cold air drains on downhill.']);
}
// sun and shade: a ridge in a low sun shades the side away from the sun, not the side facing it
{
  const ridge = (r, c) => 250 + 50 * Math.max(0, 1 - Math.abs(c - MID - 128) / 40);   // a north–south ridge 50 m high, 1.2 km each side
  const g = synth(ridge), east = T.sunRay(90, 2), west = T.sunRay(270, 2), row = MID + 128, c0 = MID + 128;
  same('the morning sun in the east (2° up): the foot of the ridge on the west side is in its shadow, the east side is in the sun', [T.inShade(g.raw, g.gx, g.gy, row, c0 - 45, east, g.hi), T.inShade(g.raw, g.gx, g.gy, row, c0 + 45, east, g.hi)], [true, false]);
  same('the evening sun in the west: the shadow falls on the east side instead', [T.inShade(g.raw, g.gx, g.gy, row, c0 - 45, west, g.hi), T.inShade(g.raw, g.gx, g.gy, row, c0 + 45, west, g.hi)], [false, true]);
  same('the shadow reaches 50 m ÷ tan 2° (1.43 km, 47 pixels) from the crest, no further', [T.inShade(g.raw, g.gx, g.gy, row, c0 - 47, east, g.hi), T.inShade(g.raw, g.gx, g.gy, row, c0 - 49, east, g.hi)], [true, false]);
  same('with the sun 30° up the ridge casts no shadow that far', T.inShade(g.raw, g.gx, g.gy, row, c0 - 45, T.sunRay(90, 30), g.hi), false);
  const tile = render('sunshade', g, { azimuth: 90, apparent: 2 });
  check('drawn: the shaded west side gets the slate wash, the flat ground in the sun on the east side stays clear', alphaAt(tile, 128, 128 - 45) === Math.round(T.SHADE_ALPHA * 255) && alphaAt(tile, 128, 128 + 45) === 0, [alphaAt(tile, 128, 83), alphaAt(tile, 128, 173)]);
  same('a slope facing the low sun is lit brighter, never shaded', [rgbAt(tile, 128, 128 + 20), alphaAt(tile, 128, 128 + 20) > 0], [[255, 250, 235], true]);
  const flat = synth(() => 250), far = synth((r, c) => (c > SIDE - 20 ? 250 + 60 : 250));
  same('the Earth\'s curve is counted: a 60 m rise 11 km away would shade ground under a 0.3° sun on a flat Earth, but the curve (9 m there) drops it below the ray; under a 0.25° sun it still shades', [T.inShade(far.raw, far.gx, far.gy, row, MID + 128, T.sunRay(90, 0.3), far.hi), T.inShade(far.raw, far.gx, far.gy, row, MID + 128, T.sunRay(90, 0.25), far.hi)], [false, true]);
  same('flat land never shades itself, however low the sun', T.inShade(flat.raw, flat.gx, flat.gy, row, c0, T.sunRay(100, 0.6), flat.hi), false);
  const day = T.pointValues(g, row, c0 - 45, { path: [{ height: 2, azimuth: 90, minutes: 60 }, { height: 30, azimuth: 180, minutes: 60 }, { height: 2, azimuth: 270, minutes: 60 }, { height: -1, azimuth: 300, minutes: 60 }] });
  same('direct sun at the west foot over a day: in shadow in the morning, in the sun at noon and in the evening (the sun down is not daylight)', [day.sunMinutes, day.dayMinutes], [120, 180]);
  same('said to the nearest 10 minutes', [T.sunDayWords({ ok: true, sunMinutes: 371, dayMinutes: 530 }), T.hoursWords(55), T.hoursWords(4)], ['Direct sun here: about 6 h 10 min of the 8 h 50 min of daylight (hills only)', '1 h', '0 min']);
  same('a very low sun says how far the hills it counts reach', [T.lowSunWords(1, 7000, 300), T.lowSunWords(20, 7000, 300)], ['The sun is very low: hills more than 7 km away are not included.', '']);
}
// erosion exposure: the RUSLE slope factor, Williams' K, the Modified Fournier Index and the fixed classes
{
  same('the slope factor at 2, 5, 9, 15 and 30 % (McCool): 0.25, 0.57, 1.01, 1.99, 4.33', [2, 5, 9, 15, 30].map(p => T.sFactor(p / 100).toFixed(2)), ['0.25', '0.57', '1.01', '1.99', '4.33']);
  same('K of loam (40 % sand, 40 % silt, 20 % clay, 1.5 % carbon) is 0.2605', T.K_LOAM.toFixed(4), '0.2605');
  same('K of the demo field\'s SoilGrids soil (sand 50.8, silt 32.2, clay 17.1 %, carbon 2.62 %) is 0.2143, 0.82 × loam', [T.williamsK({ sand: 50.8, silt: 32.2, clay: 17.1, carbon: 2.62 }).toFixed(4), (T.williamsK({ sand: 50.8, silt: 32.2, clay: 17.1, carbon: 2.62 }) / T.K_LOAM).toFixed(2)], ['0.2143', '0.82']);
  check('sand and silt erode more than clay', T.williamsK({ sand: 10, silt: 70, clay: 20, carbon: 1 }) > T.williamsK({ sand: 20, silt: 20, clay: 60, carbon: 1 }));
  const even = { year: 2020, months: Array(12).fill(50) }, wet = { year: 2021, months: [600, ...Array(11).fill(0)] };
  same('the Modified Fournier Index: even rain of 600 mm a year gives 50 mm; all of it in one month gives 600 mm', [T.fournier([even]).mfi, T.fournier([wet]).mfi], [50, 600]);
  same('it is worked from the average month over whole years', T.fournier([even, { year: 2022, months: Array(12).fill(150) }]), { mfi: 100, yearly: 1200, years: 2, first: 2020, last: 2022 });
  same('a year with a month missing is left out, and no whole year gives nothing', [T.fournier([{ year: 1, months: [1, 2] }]), T.fournier([])], [null, null]);
  near('1 on the scale is a 9 % slope of loam under moderate rain (MFI 100 mm)', T.sFactor(0.09) * T.erosionFactor(T.K_LOAM, 100), 1, 0.01);
  same('the classes are fixed: low under 0.25, moderate to 0.5, high to 1, very high over 1', [0.1, 0.25, 0.49, 0.5, 0.99, 1, 3].map(T.erosionClass), [0, 1, 1, 2, 2, 3, 3]);
  const ramp = synth((r, c) => 200 + 0.1 * c * 30);
  same('a 10 % ramp (S = 1.17) under a factor of 0.3 is "moderate"; under loam in rain of MFI 100 mm "very high"', [rgbAt(render('erosion', ramp, { factor: 0.3 }), 9, 9), rgbAt(render('erosion', ramp, { factor: 1 }), 9, 9)], [hexRgb(T.EROSION_CLASSES[1].colour), hexRgb(T.EROSION_CLASSES[3].colour)]);
  same('erosion at the pin in words', T.erosionHere({ ok: true, erosion: 0.42, slopePct: 4.6 }), 'moderate (0.4; slope 5 %)');
  same('texture classes of the USDA triangle', [T.textureWords({ sand: 60, silt: 28, clay: 12 }), T.textureWords({ sand: 40, silt: 40, clay: 20 }), T.textureWords({ sand: 90, silt: 5, clay: 5 }), T.textureWords({ sand: 10, silt: 30, clay: 60 })], ['sandy loam', 'loam', 'sand', 'clay']);
}
// SoilGrids and the rain record, read into the erosion inputs
{
  const layer = (name, a, b, f = 10) => ({ name, unit_measure: { d_factor: f }, depths: [{ label: '0-5cm', values: { mean: a } }, { label: '5-15cm', values: { mean: b } }, { label: '15-30cm', values: { mean: 1 } }] });
  const answer = { properties: { layers: [layer('clay', 138, 131), layer('sand', 512, 520), layer('silt', 350, 349), layer('soc', 530, 381)] } };   // the shape of SoilGrids' answer, with the values it gave for the demo pin
  const soil = T.soilFromSoilGrids(answer);
  same('SoilGrids: the top 15 cm, weighted by depth, the three fractions summed to 100 %, carbon in %', [soil.sand, soil.silt, soil.clay, soil.carbon].map(v => v.toFixed(1)), ['51.7', '34.9', '13.3', '4.3']);
  same('no soil there (a null value) gives null, never a guess', T.soilFromSoilGrids({ properties: { layers: [layer('clay', null, 1), layer('sand', 1, 1), layer('silt', 1, 1), layer('soc', 1, 1)] } }), null);
  const S = { days: [], year: [], month: [], rain: [] };
  for (let t = Date.UTC(2023, 0, 1); t < Date.UTC(2026, 10, 1); t += 864e5) { const d = new Date(t); S.days.push(d.toISOString().slice(0, 10).replace(/-/g, '')); S.year.push(d.getUTCFullYear()); S.month.push(d.getUTCMonth() + 1); S.rain.push(d.getUTCFullYear() === 2024 && d.getUTCMonth() === 5 && d.getUTCDate() > 3 ? NaN : 2); }
  same('the rain record: only whole years count (2024 lost most of June, 2026 has not ended)', T.rainYears(S, 2025).map(y => y.year), [2023, 2025]);
  same('and each month holds its rain', T.rainYears(S, 2025)[0].months.slice(0, 2), [62, 56]);
}
// the colours: ordered by lightness, adjacent classes apart in lightness for every kind of colour sight, never the page's blue
{
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = rgbLin => { const Y = 0.2126 * rgbLin[0] + 0.7152 * rgbLin[1] + 0.0722 * rgbLin[2]; return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
  const SIGHT = { normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],   // Machado, Oliveira and Fernandes (2009), severity 1
    deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] };
  const seen = (hex, m) => { const c = hexRgb(hex).map(lin); return L(m.map(row => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])))); };
  for (const [name, list] of [['slope', T.SLOPE_CLASSES], ['erosion', T.EROSION_CLASSES], ['frost', T.FROST_CLASSES]]) {
    const colours = list.map(k => k.colour).filter(Boolean);
    for (const [sight, m] of Object.entries(SIGHT)) {
      const Ls = colours.map(c => seen(c, m)), steps = Ls.slice(1).map((v, i) => Ls[i] - v);
      check(`${name}: with ${sight} sight the classes get darker step by step, at least 8 L* apart`, steps.every(s => s >= 8), Ls.map(v => v.toFixed(1)));
    }
    check(`${name}: no class is the page's interactive blue or close to it`, colours.every(c => { const a = hexRgb(c), b = hexRgb('#0a63d8'); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 80; }), colours);
  }
}
// reading Terrain Tiles: the real tiles recorded from the bucket, and a picture made here with every PNG row filter
{
  const barrie = recorded(BARRIE.z, BARRIE.x, BARRIE.y), ankara = recorded(ANKARA.z, ANKARA.x, ANKARA.y);
  const stat = h => { const s = Float64Array.from(h).sort(); return [s[0], s.at(-1), s[s.length / 2], new Set(s).size]; };
  const b = await T.decodeTerrarium(barrie.bytes, inflate), a = await T.decodeTerrarium(ankara.bytes, inflate);
  same('the demo field\'s tile (Canada\'s CDEM): 228 to 300 m, median 256 m, 73 different heights, whole metres', [...stat(b.heights), b.whole], [228, 300, 256, 73, true]);
  same('Ankara, Türkiye (EU-DEM): 829.32 to 1020.32 m, median 870.98 m, 24,157 different heights, with decimals', [...stat(a.heights).slice(0, 3).map(v => +v.toFixed(2)), stat(a.heights)[3], a.whole], [829.32, 1020.32, 870.98, 24157, false]);
  same('the source header names the height map: CDEM near Barrie, EU-DEM in Türkiye', [T.prefixesOf(barrie.sources), T.prefixesOf(ankara.sources)], [['nrcan_cdem'], ['eudem']]);
  const heights = Float32Array.from({ length: TILE * TILE }, (_, i) => -30 + ((i * 7919) % 9000) + (i % 256) / 256);
  const rgb = new Uint8Array(TILE * TILE * 3); heights.forEach((h, i) => { const v = h + 32768, r = Math.floor(v / 256), g = Math.floor(v) % 256, bb = Math.round((v - Math.floor(v)) * 256); rgb.set([r, g, bb], i * 3); });
  const rows = [];
  for (let y = 0; y < TILE; y++) {   // each row with one of the five filters, the way an encoder would write it
    const type = y % 5, row = rgb.subarray(y * 768, y * 768 + 768), up = y ? rgb.subarray((y - 1) * 768, y * 768) : new Uint8Array(768), f = new Uint8Array(769); f[0] = type;
    for (let i = 0; i < 768; i++) { const a2 = i >= 3 ? row[i - 3] : 0, b2 = up[i], c2 = i >= 3 ? up[i - 3] : 0, p = a2 + b2 - c2, pr = Math.abs(p - a2) <= Math.abs(p - b2) && Math.abs(p - a2) <= Math.abs(p - c2) ? a2 : Math.abs(p - b2) <= Math.abs(p - c2) ? b2 : c2;
      f[i + 1] = (row[i] - [0, a2, b2, (a2 + b2) >> 1, pr][type]) & 255; }
    rows.push(f);
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  const back = await T.decodeTerrarium(png, inflate);
  check('a tile written with all five PNG row filters reads back to the same heights, to 1/256 m', back.heights.every((h, i) => Math.abs(h - heights[i]) < 1 / 256 + 1e-6) && back.whole === false);
  let threw = ''; try { await T.decodeTerrarium(new Uint8Array(40), inflate); } catch (e) { threw = e.message; }
  same('something that is not a PNG is refused, never read as heights', threw, 'not a PNG');
}
// the sources, their credit lines and the zoom worth computing at
{
  same('a tile made of several maps names each once', T.prefixesOf('srtm/N44W080.tif, srtm/N45W080.tif, gmted/30N090W_x.tif'), ['srtm', 'gmted']);
  same('the zoom worth computing at: 13 for the 10 m 3DEP, 12 for 30 m maps and mixes, 9 for GMTED alone, 12 when unknown', [T.nativeZoom(['ned13']), T.nativeZoom(['srtm', 'gmted']), T.nativeZoom(['gmted']), T.nativeZoom([]), T.nativeZoom(['kartverket'])], [13, 12, 9, 12, 12]);
  same('the legend line names the real source', [T.fromWords(['nrcan_cdem']), T.fromWords(['ned13', 'nrcan_cdem']), T.fromWords([])], ['computed by Crophalo from CDEM heights', 'computed by Crophalo from 3DEP and CDEM heights', 'computed by Crophalo from Terrain Tiles heights']);
  const credit = T.creditWords(['nrcan_cdem']);
  check('the credit line carries the source\'s own licence words and the Terrain Tiles line', credit.includes('Contains information licensed under the Open Government Licence – Canada') && credit.includes('maps and surveys from 1945 to 2011') && credit.endsWith('Heights: Terrain Tiles (Tilezen, AWS Open Data), built in 2017.'), credit);
  check('an unknown source is said to be on the Terrain Tiles list, never given a made-up name', T.creditWords(['kartverket']).startsWith('Part of the view comes from a source on the Terrain Tiles list'));
  check('every source has its name, ground size, span, credit and zoom', Object.values(T.HEIGHT_SOURCES).every(s => s.short && s.name && s.ground && s.span && s.credit && s.native >= 7 && s.native <= 13));
  same('the grid in the legend: whole metres, then tens of metres', [T.gridWords(27.34), T.gridWords(109.4), T.gridWords(13.7)], ['27 m grid', '110 m grid', '14 m grid']);
  same('the five layers in the owner\'s order, each with its row words', T.TERRAIN_LAYERS.map(l => `${l.name}: ${l.sub}`), ['Slope: SRTM 30 m or finer', 'Erosion exposure: slope × soil × rain · a relative index', 'Frost pockets: low ground where cold air settles', 'Sun and shade: hill shadows, any day and hour', 'Relief shading: light from the north-west']);
  check('each layer says what to do when the map is zoomed out too far', T.TERRAIN_LAYERS.every(l => /^Zoom in to see /.test(l.zoomIn)) && T.terrainLayer('slope').zoomIn === 'Zoom in to see slope.');
  same('sun and shade and frost pockets start at zoom 11, where the heights mean something; slope and relief at 9', T.TERRAIN_LAYERS.map(l => [l.id, l.minZoom]), [['slope', 9], ['erosion', 11], ['frost', 11], ['sunshade', 11], ['relief', 9]]);
}
// the real tiles round the demo field: the shares of each slope class match what was measured on them by hand
{
  const grid9 = async (z, x, y) => T.makeGrid(await Promise.all([-1, 0, 1].flatMap(dy => [-1, 0, 1].map(async dx => { const t = recorded(z, x + dx, y + dy); return t ? (await T.decodeTerrarium(t.bytes, inflate)).heights : null; }))), z, y, true);
  const g = await grid9(BARRIE.z, BARRIE.x, BARRIE.y), h = T.smoothGrid(g, 2), counts = Array(6).fill(0);
  let zero = 0;
  for (let r = 0; r < TILE; r++) for (let c = 0; c < TILE; c++) { const { dx, dy } = T.horn(h, g.gx, g.gy, MID + r, MID + c), p = T.slopePercent(dx, dy); if (p === 0) zero++; counts[T.slopeClass(p)]++; }
  const share = n => Math.round(1000 * n / (TILE * TILE)) / 10;
  check('after the 3 × 3 average, 9 % of the demo tile reads exactly 0 % (20 % did on the raw whole metres)', Math.abs(share(zero) - 9) <= 1, share(zero));
  check('the demo tile: about 51 % under 2 %, 33 % at 2 to 5 %, 12 % at 5 to 10 %', Math.abs(share(counts[0]) - 51.2) <= 1 && Math.abs(share(counts[1]) - 32.6) <= 1 && Math.abs(share(counts[2]) - 11.9) <= 1, counts.map(share));
  const frost = render('frost', g), pockets = [...Array(TILE * TILE).keys()].filter(i => frost[i * 4 + 3] > 0).length;
  check('frost pockets cover a small part of the demo tile (some per cent, never most of it)', share(pockets) > 2 && share(pockets) < 25, share(pockets));
  const lakeTile = await grid9(12, 1143, 1482), lake = render('frost', lakeTile), lakeMarks = [...Array(TILE * TILE).keys()].filter(i => lake[i * 4 + 3] > 0).length;
  check('the tile over Kempenfelt Bay of Lake Simcoe: the flat water is not marked as frost pockets', share(lakeMarks) < 5, share(lakeMarks));
}
// the fetching: each tile once, six at a time, kept, failures said, the work in small steps
{
  const asked = [], inFlight = { now: 0, most: 0 };
  const respond = (url, delay = 5) => new Promise(done => setTimeout(() => {
    const m = /(\d+)\/(\d+)\/(\d+)\.png$/.exec(url), t = m && recorded(+m[1], +m[2], +m[3]);
    done(t ? new Response(t.bytes, { status: 200, headers: { 'x-amz-meta-x-imagery-sources': t.sources } }) : new Response('', { status: 404 }));
  }, delay));
  const fetch = async url => { asked.push(url); inFlight.now++; inFlight.most = Math.max(inFlight.most, inFlight.now); try { return await respond(url); } finally { inFlight.now--; } };
  let pauses = 0;
  const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };   // processor time, so a busy computer does not make a short step look long
  const engine = createEngine({ fetch, budgetMs: 4, clock: cpuMs, pause: () => { pauses++; return new Promise(done => setImmediate(done)); } });
  const template = 'https://tiles.test/terrarium/{z}/{x}/{y}.png';
  const jobs = [[1141, 1482], [1142, 1482], [1141, 1483]].map(([x, y], i) => engine.run({ type: 'tile', id: i + 1, kind: 'slope', z: 12, x, y, template }));
  const answers = await Promise.all(jobs);
  check('three neighbouring tiles are worked out from their blocks', answers.every(a => a.ok && a.rgba.byteLength === TILE * TILE * 4 && a.prefixes[0] === 'nrcan_cdem' && a.whole === true), answers.map(a => a.why));
  same('each height tile is fetched once, though three blocks share most of them (15 tiles, not 27)', [asked.length, new Set(asked).size], [15, 15]);
  check(`never more than ${AT_ONCE} requests at a time`, inFlight.most <= AT_ONCE, inFlight.most);
  await engine.run({ type: 'tile', id: 9, kind: 'relief', z: 12, x: 1141, y: 1482, template });
  same('a second layer over the same place fetches nothing again', asked.length, 15);
  const sun = await engine.run({ type: 'tile', id: 10, kind: 'sunshade', z: 12, x: 1141, y: 1482, template, opts: { azimuth: 150, apparent: 8 } });
  check('the work is done in small steps: it let others in, and no step took 50 ms of processor time', sun.ok && pauses > 5 && engine.counts().longestStepMs < 50, [pauses, engine.counts().longestStepMs]);
  const edge = await engine.run({ type: 'tile', id: 11, kind: 'slope', z: 12, x: 1143, y: 1482, template });
  check('a tile next to the recorded block still draws (its missing neighbours are said, never made up)', edge.ok && edge.missing === 3, [edge.ok, edge.missing]);
  same('no tile there at all: "none"', (await engine.run({ type: 'tile', id: 12, kind: 'slope', z: 12, x: 100, y: 100, template })).why, 'none');
  const broken = createEngine({ fetch: async () => new Response('', { status: 500 }), pause: () => Promise.resolve() });
  same('a server error is a failed fetch, said as such', (await broken.run({ type: 'tile', id: 1, kind: 'slope', z: 12, x: 1, y: 1, template })).why, 'fetch');
  let tries = 0;
  const flaky = createEngine({ fetch: async url => { tries++; return tries <= 9 ? new Response('', { status: 503 }) : respond(url, 0); }, pause: () => Promise.resolve() });
  await flaky.run({ type: 'tile', id: 1, kind: 'slope', z: 12, x: 1141, y: 1482, template });
  const before = tries; await flaky.run({ type: 'tile', id: 2, kind: 'slope', z: 12, x: 1141, y: 1482, template });
  same('a failed tile is not asked for again at once (no hammering)', tries, before);
  flaky.retry(); const again = await flaky.run({ type: 'tile', id: 3, kind: 'slope', z: 12, x: 1141, y: 1482, template });
  check('"Try again" asks once more, and then it draws', again.ok && tries > before, [again.why, tries]);
  const slow = createEngine({ fetch: url => respond(url, 50), pause: () => Promise.resolve() });
  const late = slow.run({ type: 'tile', id: 7, kind: 'slope', z: 12, x: 1141, y: 1482, template }); slow.cancel(7);
  same('a tile that left the view is called off and never worked out', (await late).why, 'cancelled');
  const pin = await engine.run({ type: 'point', id: 20, lat: BARRIE.lat, lon: BARRIE.lon, z: 12, template, opts: { factor: 0.43 } });
  check('the readings at the demo pin: a real height between 228 and 300 m, a slope, a frost position and an erosion index', pin.ok && pin.values.height >= 228 && pin.values.height <= 300 && Number.isFinite(pin.values.slopePct) && Number.isFinite(pin.values.tpi) && Number.isFinite(pin.values.erosion), pin.values);
  same('a pin beyond 85° has no heights', (await engine.run({ type: 'point', id: 21, lat: 88, lon: 0, z: 12, template })).why, 'far');
  same('the probe says which map lies under the demo field and the zoom worth computing at', await engine.run({ type: 'probe', id: 22, lat: BARRIE.lat, lon: BARRIE.lon, z: 12, template }), { id: 22, ok: true, prefixes: ['nrcan_cdem'], native: 12, whole: true });
  check('the recorded block is whole: 25 tiles', BLOCK.length === 25 && BLOCK.every(t => recorded(t.z, t.x, t.y)));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
