// Crophalo's offline suite for the outline maths of the setup map (js/geo.js): areas against shapes whose size is known, the date line, a bow-tie, the turned rectangle, the snaps, the words for a size and a length, and the outline's contrast on a field.
// RULE: never loosen a check here without a written farming reason beside it. A wrong area is a wrong figure on a farmer's report. Run: node scripts/test_geo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const g = await import(pathToFileURL(path.join(ROOT, 'js', 'geo.js')).href);

// A box that is 1 km north-south and 1 km east-west on the ground, centred on a latitude: 100 ha wherever it is.
const KM = 1000 / 111195, box = lat => { const dn = KM / Math.cos(lat * Math.PI / 180); return [[lat + KM / 2, 0], [lat + KM / 2, dn], [lat - KM / 2, dn], [lat - KM / 2, 0]]; };
for (const lat of [0, 20, 44.4, 60, 75]) near(`a 1 km square is 100 ha at ${lat} degrees`, g.areaHa(box(lat)), 100, 0.6);
near('the same square drawn the other way round is the same size', g.areaHa(box(44.4).reverse()), 100, 0.6);
near('a 1 ha field (100 m square) is 1 ha', g.areaHa(box(44.4).map(([a, b]) => [(a - 44.4) / 10 + 44.4, b / 10])), 1, 0.01);
near('a box across the 180 degree line is the same size as one beside it', g.areaHa([[0, 179.995], [0, -179.995], [0.009, -179.995], [0.009, 179.995]]), g.areaHa([[0, 10], [0, 10.01], [0.009, 10.01], [0.009, 10]]), 0.05);
same('fewer than three corners is no area', [g.areaHa([]), g.areaHa([[1, 2]]), g.areaHa([[1, 2], [3, 4]]), g.areaHa(null)], [0, 0, 0, 0]);
same('wrapLon', [g.wrapLon(190), g.wrapLon(-190), g.wrapLon(180), g.wrapLon(0), g.wrapLon(540)], [-170, 170, -180, 0, -180]);
same('the ring a user typed with its first corner repeated at the end is closed once', g.cleanRing([[1, 1], [1, 2], [2, 2], [1, 1]]), [[1, 1], [1, 2], [2, 2]]);
same('corners are rounded to 4 decimals', g.cleanRing([[1.123456, 2.987654], [1, 2], [3, 4]])[0], [1.1235, 2.9877]);
same('the map keeps an outline\'s corners to 5 decimals (about 1 m), so a corner dragged at a close zoom lands where it was dropped', g.cleanRing([[1.123456, 2.987654], [1, 2], [3, 4]], 5)[0], [1.12346, 2.98765]);

// bow-tie and the checks an outline must pass
const SQ = [[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0]];
check('a square does not cross itself', !g.selfCrosses(SQ));
check('a bow-tie does', g.selfCrosses([[0, 0], [0.01, 0.01], [0.01, 0], [0, 0.01]]));
check('a long L shape does not', !g.selfCrosses([[0, 0], [0, 0.02], [0.005, 0.02], [0.005, 0.005], [0.02, 0.005], [0.02, 0]]));
check('a triangle does not', !g.selfCrosses([[0, 0], [0.01, 0.005], [0, 0.01]]));
same('a good outline has no problem', g.outlineProblem(SQ), '');
check('a crossed outline is named', /crosses itself/.test(g.outlineProblem([[0, 0], [0.01, 0.01], [0.01, 0], [0, 0.01]])));
check('two corners are not an outline', /three corners/.test(g.outlineProblem([[0, 0], [1, 1]])));
check('a speck is too small to be a field', /too small/.test(g.outlineProblem([[0, 0], [0, 0.00001], [0.00001, 0.00001]])));

// inside, and the box between two points
check('a point inside', g.insideRing(0.005, 0.005, SQ)); check('a point outside', !g.insideRing(0.02, 0.005, SQ));
check('a point near the 180 degree line is inside a box that spans it', g.insideRing(0.001, -179.9995, [[0, 179.995], [0, -179.995], [0.009, -179.995], [0.009, 179.995]]));
same('two points make four corners, clockwise from the north-west', g.boxCorners([44.5, -79.7], [44.4, -79.8]), [[44.5, -79.8], [44.5, -79.7], [44.4, -79.7], [44.4, -79.8]]);
same('and the short way round the 180 degree line', g.boxCorners([10, 179.9], [9, -179.9]), [[10, 179.9], [10, -179.9], [9, -179.9], [9, 179.9]]);

// the limits of one field (as My Farm has them): at most 100 corners, at most 5,000 ha, said in the unit that comes first
const BIG = box(44.4).map(([a, b]) => [(a - 44.4) * 8 + 44.4, b * 8]);   // 8 km square, 6,400 ha
check('an outline over 5,000 ha is refused, in hectares', /over 5,000 ha\)/.test(g.outlineProblem(BIG)), g.outlineProblem(BIG));
check('and in acres where acres come first', /over 12,355 acres\)/.test(g.outlineProblem(BIG, 'acres')), g.outlineProblem(BIG, 'acres'));
const MANY = Array.from({ length: 101 }, (_, i) => [44.4 + 0.004 * Math.sin(i / 101 * 2 * Math.PI), -79.7 + 0.006 * Math.cos(i / 101 * 2 * Math.PI)]);
same('the 101st corner is one too many', g.outlineProblem(MANY), 'Up to 100 corners.');
same('100 corners are a field', g.outlineProblem(MANY.slice(0, 100)), '');

// the turned rectangle of three taps: square corners, the far side through the third tap on either side, and the same flat frame as the area
const A = [43.098, -80.789], B = [43.0995, -80.7868], P1 = [43.0972, -80.7872];
const rect = g.threePointRect(A, B, P1);
check('three points make four corners, starting at the first two', rect?.length === 4 && rect[0][0] === A[0] && Math.abs(rect[0][1] - A[1]) < 1e-12 && Math.abs(rect[1][0] - B[0]) < 1e-12, rect);
const KMd = 111195, flat = (p, o) => [(p[1] - o[1]) * KMd * Math.cos(o[0] * Math.PI / 180), (p[0] - o[0]) * KMd], angle = (a, b, c) => { const u = flat(a, b), v = flat(c, b); return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
check('its four corners are square', rect && [0, 1, 2, 3].every(i => Math.abs(angle(rect[(i + 3) % 4], rect[i], rect[(i + 1) % 4]) - 90) < 0.01), rect && [0, 1, 2, 3].map(i => angle(rect[(i + 3) % 4], rect[i], rect[(i + 1) % 4])));
const side = g.metres(A, B), depth = Math.abs(g.sideOffset(A, B, P1).d);
near('its area is the side times the distance to the far side', g.areaHa(rect), side * depth / 1e4, 1e-3);
const P2 = [A[0] + B[0] - P1[0], A[1] + B[1] - P1[1]];   // P1 turned half round the middle of the side: as far from it, on the other side
check('the far side may be on either side of the first', g.sideOffset(A, B, P2).d * g.sideOffset(A, B, P1).d < 0 && Math.abs(g.areaHa(g.threePointRect(A, B, P2)) - g.areaHa(rect)) < 1e-3);
same('two taps on the same spot are no rectangle', g.threePointRect(A, A, P1), null);
// a side close to north-south or east-west lies on it; one further off keeps its turn
const nearEast = g.snapAxis([43, -80], [43.0001, -79.99]), offEast = g.snapAxis([43, -80], [43.002, -79.99]);
check('a side 1 degree off east-west lies on it', nearEast.snapped && nearEast.at[0] === 43 && Math.abs(nearEast.at[1] + 79.99) < 1e-9, nearEast);
check('a side 15 degrees off keeps its turn', !offEast.snapped && offEast.at[0] === 43.002, offEast);
check('a side 2 degrees off north-south lies on it', (() => { const s = g.snapAxis([43, -80], [43.01, -80.0004]); return s.snapped && Math.abs(s.at[1] + 80) < 1e-9; })());
// the snaps of the mouse, on the screen
const ra = g.rightAngleSnap([0, 0], [100, 0], [103, 90]);
check('a corner within 5 degrees of square is made square', ra.snapped && Math.abs(ra.at[0] - 100) < 1e-9, ra);
check('one 10 degrees off is left alone', !g.rightAngleSnap([0, 0], [100, 0], [118, 100]).snapped);
check('and short lines (under 40 px) are never snapped', !g.rightAngleSnap([0, 0], [30, 0], [31, 20]).snapped);
const sq = g.squareOff([0, 0], [100, 0], [0, 80], [0, 0], [104, 84], 12);
check('the fourth corner of a square field is found within 12 px of the pointer', sq.snapped && Math.abs(sq.at[0] - 100) < 1e-9 && Math.abs(sq.at[1] - 80) < 1e-9, sq);
check('and not from further than 12 px', !g.squareOff([0, 0], [100, 0], [0, 80], [0, 0], [120, 100], 12).snapped);
// a point surely inside: a U-shaped field (a field round a woodlot) has its middle outside
const U = [[0, 0], [0, 0.03], [0.03, 0.03], [0.03, 0.02], [0.01, 0.02], [0.01, 0.01], [0.03, 0.01], [0.03, 0]];
const ip = g.insidePoint(U), sqp = g.insidePoint(SQ);
check('the middle of a U is outside it, and the pin goes inside instead', !g.insideRing(0.0178, 0.015, U) && g.insideRing(ip[0], ip[1], U), ip);
check('a square\'s pin is its middle', Math.abs(sqp[0] - 0.005) < 1e-6 && Math.abs(sqp[1] - 0.005) < 1e-6, sqp);
// the pin is kept to 4 decimals: its place in an outline is a 4-decimal point that is still inside, so the report keeps the outline it was told of
const G1 = [[43.10309, -80.7863], [43.10318, -80.78626], [43.10321, -80.78638], [43.10312, -80.78642]], s1 = g.pinSpot(G1);
check('a 10 m garden whose middle rounds out of it gets a pin on the 4-decimal grid that is still inside', !g.insideRing(43.1032, -80.7863, G1) && s1.every(v => v === Math.round(v * 1e4) / 1e4) && g.insideRing(s1[0], s1[1], G1), s1);
const G2 = [[43.10147, -80.78128], [43.1015, -80.78141], [43.10141, -80.78144], [43.10138, -80.78131]], s2 = g.pinSpot(G2);
check('a garden with no 4-decimal point inside it keeps its middle', g.insideRing(s2[0], s2[1], G2), s2);
const sq4 = g.pinSpot(SQ);
check('a field\'s pin is its middle, on the grid', sq4[0] === 0.005 && sq4[1] === 0.005, sq4);
// the next line of a polygon may not cross an earlier one; touching at a shared corner does not count
const run = [[0, 0], [0, 0.01], [0.01, 0.01]];
check('a line back across the first side crosses', g.edgeCrosses(run, [0.01, 0.01], [-0.005, 0.005]));
check('a line that only meets the last corner does not', !g.edgeCrosses(run, [0.01, 0.01], [0.01, 0]));
check('the closing line of a square does not', !g.edgeCrosses([...run, [0.01, 0]], [0.01, 0], [0, 0]));

// both units: acres first in the US and Canada, hectares elsewhere; rounding by size; thousands with commas; exactly 1 is singular
same('which unit comes first', [g.unitsOrder('auto', 'en-US'), g.unitsOrder('auto', 'fr-CA'), g.unitsOrder('auto', 'en-GB'), g.unitsOrder('auto', 'tr-TR'), g.unitsOrder('auto', 'en'), g.unitsOrder('acres', 'tr-TR'), g.unitsOrder('hectares', 'en-US')], ['acres', 'acres', 'hectares', 'hectares', 'hectares', 'acres', 'hectares']);
same('an area in both units, acres first', g.areaPair(10.08, 'acres'), { first: '24.9 acres', second: '10.1 ha', spoken: '24.9 acres, 10.1 hectares', value: 10.08 * 2.471054, unit: 'acres' });
same('hectares first', [g.areaPair(10.08).first, g.areaPair(10.08).second, g.areaPair(10.08).spoken], ['10.1 ha', '24.9 acres', '10.1 hectares, 24.9 acres']);
same('under 1: two decimals; under 100: one; 100 and over: whole, with commas', [g.areaPair(0.456).first, g.areaPair(42.04).first, g.areaPair(1234.6).first, g.areaPair(99.97).first], ['0.46 ha', '42.0 ha', '1,235 ha', '100 ha']);
same('exactly 1 is one acre and one hectare', [g.areaPair(1 / 2.471054, 'acres').first, g.areaPair(1).spoken], ['1 acre', '1 hectare, 2.5 acres']);
same('a length: metres and kilometres, or feet and miles where acres come first', [g.lengthWords(312.4), g.lengthWords(1243), g.lengthWords(312.1, 'acres'), g.lengthWords(1931, 'acres'), g.lengthWords(312.4, 'hectares', true)], ['312 m', '1.24 km', '1,024 ft', '1.2 mi', '312 metres']);
same('a direction in words', [g.direction([43, -80], [43, -79.99]), g.direction([43, -80], [43.01, -80]), g.direction([43, -80], [42.99, -80.01])], ['east', 'north', 'south-west']);

// the outline reads on a field: the better of the navy core and the white halo against eight spots of a real satellite photo of fields near Woodstock,
// Ontario (pale stubble, brown, green, light green, woods, dark green, a gravel road, a cloud) is at least 3:1 (WCAG 1.4.11), where the old pale blue line gave 1.1 to 3.8
const tokens = Object.fromEntries([...fs.readFileSync(path.join(ROOT, 'css', 'app.css'), 'utf8').matchAll(/(--shade|--card):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), lum = c => { const [r, g2, b] = c.map(v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g2 + .0722 * b; };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + .05) / (lo + .05); };
const FIELD = { stubble: [196, 170, 145], brown: [131, 113, 101], green: [113, 138, 100], lightGreen: [130, 137, 96], woods: [85, 92, 53], darkGreen: [90, 105, 81], road: [156, 154, 128], cloud: [218, 215, 205] };
check('the line\'s two tones are the tokens --shade and --card', /^#[0-9a-f]{6}$/i.test(tokens['--shade'] ?? '') && /^#[0-9a-f]{6}$/i.test(tokens['--card'] ?? ''), tokens);
const best = Object.entries(FIELD).map(([name, c]) => [name, Math.max(ratio(rgb(tokens['--shade']), c), ratio(rgb(tokens['--card']), c))]);
check('on every field colour one of the two tones stands out at least 3:1', best.every(([, r]) => r >= 3), best.map(([n, r]) => `${n} ${r.toFixed(2)}`).join(', '));
check('and the navy core on its white halo is far above it', ratio(rgb(tokens['--shade']), rgb(tokens['--card'])) >= 7);

// the words
same('size in hectares', [g.areaWords(12.43), g.areaWords(3.14), g.areaWords(0.456)], ['12.4 ha', '3.1 ha', '0.46 ha']);
same('size in acres for US units', [g.areaWords(12.43, 'us'), g.areaWords(1, 'us')], ['30.7 acres', '2.5 acres']);
same('the place says where it is', g.pinWords(44.38941, -79.69031), 'Place at 44.3894, -79.6903');
same('the slope words at their edges', [1.9, 2, 5.9, 6, 11.9, 12].map(g.slopeWords), ['nearly flat', 'gently sloping', 'gently sloping', 'moderately sloping', 'moderately sloping', 'steep']);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
