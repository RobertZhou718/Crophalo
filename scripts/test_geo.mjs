// Crophalo's offline suite for the outline maths of the setup map (js/geo.js): areas against shapes whose size is known, the date line, a bow-tie, the words for a size.
// RULE: never loosen a check here without a written farming reason beside it. A wrong area is a wrong figure on a farmer's report. Run: node scripts/test_geo.mjs
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

// the words
same('size in hectares', [g.areaWords(12.43), g.areaWords(3.14), g.areaWords(0.456)], ['12.4 ha', '3.1 ha', '0.46 ha']);
same('size in acres for US units', [g.areaWords(12.43, 'us'), g.areaWords(1, 'us')], ['30.7 acres', '2.5 acres']);
same('the pin says where it is', g.pinWords(44.38941, -79.69031), 'Pin at 44.3894, -79.6903');
same('the slope words at their edges', [1.9, 2, 5.9, 6, 11.9, 12].map(g.slopeWords), ['nearly flat', 'gently sloping', 'gently sloping', 'moderately sloping', 'moderately sloping', 'steep']);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
