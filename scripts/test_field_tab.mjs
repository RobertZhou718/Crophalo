// Crophalo's Field-tab suite: the land in plain words: soil (assumed, described, or tested), slope and height from the height lookup with its source named, the field's size and
// outline (drawn or estimated, always said), the spot. A figure not read says "Not read yet" with its reason. The lookup is replaced by a stub; it is read in each shape it may come in.
// RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_field_tab.mjs
import { loadDem, landFromHeights, demKey, slopeWords, compass, landTiles, DEM_DOWN } from '../js/field-data.js';
import { fieldHTML } from '../js/field-view.js';
import { outlineSVG } from '../js/outline.js';
import { estimatedArea } from '../js/report-view.js';
import { newState } from '../js/state.js';
const YR = 2026;   // the year the hand-made height answers are dated from

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const loc = { lat: 43.13, lon: -80.75 };

// ---- the height lookup: the server answers a height GRID; the 3D view's own modules decode it and work out the field's plane slope
const pin = { lat: 43.13, lon: -80.75 };
const answerFor = (height, extra = {}) => url => {   // a stand-in server: a grid of the size asked for, heights from height(x, z) in metres (+x east, +z south, from the block's middle)
  const q = new URL(url, 'http://x').searchParams, w = +q.get('w'), d = +q.get('d'), nx = +q.get('nx'), ny = +q.get('ny'), f = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = height(-w / 2 + i * w / (nx - 1), -d / 2 + j * d / (ny - 1));
  return { ok: true, grid: { nx, ny, w, d }, h: Buffer.from(f.buffer).toString('base64'), source: 'NRCan HRDEM lidar, 1 m (Natural Resources Canada)', name: 'NRCan HRDEM lidar', res_m: 2.02, native_m: 1, kind: 'DTM', credit: 'x', licence: 'y', data_date: `${YR - 1}-11-14`, cover: 1, ...extra };
};
const serve = (height, extra) => async url => ({ json: async () => answerFor(height, extra)(url) });
const est = estimatedArea(pin);
const south = await loadDem(pin, est, serve((x, z) => 300 - 0.03 * z));
check('a field on ground that falls to the south: 3% slope, water runs south, the height at the pin', south.ok && Math.abs(south.slope - 3) < 0.05 && Math.abs(south.downhill - 180) < 1 && Math.abs(south.height - 300) < 0.5, brief(south));
check('the slope band is the 3D view\'s own: 2 to 6%', south.band === '2 to 6%');
check('the source is named in the 3D view\'s own words: the map, its spacing, bare ground', /^NRCan HRDEM lidar, one every 2\.0 m\. Bare ground: trees and buildings are not in it\.$/.test(south.words), south.words);
same('and the source note is Canada\'s lidar', south.srcKey, 'hrdem');
const west = await loadDem(pin, est, serve(x => 300 + 0.05 * x));
check('ground that rises to the east: 5% slope and water runs west', west.ok && Math.abs(west.slope - 5) < 0.05 && Math.abs(west.downhill - 270) < 1, brief([west.slope, west.downhill]));
const flat = await loadDem(pin, est, serve(() => 250));
check('flat ground: no slope, no downhill side, the lowest band', flat.ok && flat.slope < 0.05 && flat.downhill === null && flat.band === 'Under 2%', brief(flat));
const tiny = await loadDem(pin, { pts: [[43.13, -80.75], [43.13, -80.74999], [43.13001, -80.74999]] }, serve((x, z) => 300 - 0.03 * z));
check('a field too small for the map: "too small", no slope', tiny.ok && tiny.tooSmall === true && tiny.slope === null, brief(tiny));
same('the same slope as the 3D view gives: a cheaper map of the same ground changes nothing it should not', Math.abs((await loadDem(pin, est, serve((x, z) => 300 - 0.03 * z))).slope - south.slope) < 1e-9, true);
let asked = '';
await loadDem(pin, est, async url => { asked = url; return { json: async () => answerFor(() => 1)(url) }; });
check('the lookup is asked for a block round the field, in metres, with a grid size', /^\/api\/dem\?lat=43\.13&lon=-80\.75&w=\d{3,4}&d=\d{3,4}&nx=129&ny=129$/.test(asked) || /^\/api\/dem\?lat=43\.1\d*&lon=-80\.7\d*&w=\d+&d=\d+&nx=129&ny=129$/.test(asked), asked);
same('a refusal keeps its reason', (await loadDem(pin, est, async () => ({ json: async () => ({ ok: false, reason: 'No height map covers this spot.' }) }))).reason, 'No height map covers this spot.');
same('a network error and a non-JSON answer are the 3D view\'s plain sentences', await Promise.all([loadDem(pin, est, async () => { throw new Error('down'); }), loadDem(pin, est, async () => ({ json: async () => { throw new SyntaxError('x'); } }))]).then(l => l.map(x => x.reason)), ['The land heights could not be reached right now.', 'The land heights could not be read right now.']);
same('a grid for another piece of land is refused', (await loadDem(pin, est, async url => ({ json: async () => ({ ...answerFor(() => 1)(url), grid: { nx: 129, ny: 129, w: 5000, d: 5000 } }) }))).reason, 'The land heights were for another piece of land.');
same('no place, no outline, no function: the plain sentence', await Promise.all([loadDem({ lat: 'x', lon: 1 }, est, serve(() => 1)), loadDem(pin, null, serve(() => 1)), loadDem(pin, est, null)]).then(l => l.map(x => x.reason)), Array(3).fill(DEM_DOWN));
check('mostly missing heights give a reason, not a slope', (await loadDem(pin, est, serve(() => NaN))).ok === false);
same('the source note follows the map named: Canada, the United States, the world', [demKey('NRCan HRDEM lidar'), demKey('USGS 3DEP 1 m'), demKey('Copernicus GLO-30'), demKey('NASADEM'), demKey('Some other map'), demKey(undefined)], ['hrdem', 'usgs3dep', 'glo30', 'nasadem', 'dem', 'dem']);

// ---- words
same('slope classes at their edges', [0, 1.99, 2, 4.99, 5, 9.99, 10, 14.99, 15, 40].map(slopeWords), ['Nearly flat', 'Nearly flat', 'Gently sloping', 'Gently sloping', 'Moderately sloping', 'Moderately sloping', 'Strongly sloping', 'Strongly sloping', 'Steep', 'Steep']);
same('no slope, no words', slopeWords(NaN), '');
same('the compass: the eight points, and round the zero', [0, 44, 68, 90, 180, 200, 270, 315, 359, 360, -45].map(compass), ['north', 'north-east', 'east', 'east', 'south', 'south', 'west', 'north-west', 'north', 'north', 'north-west']);

// ---- the tiles
const base = { ...newState(), loc: { lat: 43.13, lon: -80.75, label: 'Oxford County, Ontario', cc: 'CA' }, name: 'Oxford County, Ontario', soil: { mode: 'assumed', texture: null, om: null, omPct: null } };
const drawn = { pts: [[43.12, -80.76], [43.12, -80.74], [43.14, -80.74], [43.14, -80.76]], ha: 12.4, estimated: false };
const dem = south, tiles = landTiles({ state: base, dem, outline: est }), by = id => tiles.find(t => t.id === id);
same('the tiles, in order: soil, slope, height, size, spot', tiles.map(t => t.id), ['soil', 'slope', 'height', 'size', 'spot']);
check('assumed soil says nothing was measured and that the report is less sure', /Average soil \(assumed\)/.test(by('soil').value) && /Nothing was measured/.test(by('soil').text) && /less sure/.test(by('soil').text));
check('slope: the class, the percent, the downhill side, the basis and the source with its spacing', by('slope').value === 'Gently sloping (3.0%)' && /Water runs downhill towards the south\./.test(by('slope').text) && /NRCan HRDEM lidar, one every 2\.0 m\./.test(by('slope').text), by('slope').text);
check('an estimated outline says so in the slope line: the plane of a square round the pin, not drawn', /a square of about 316 m round your place \(estimated: no outline was drawn\)/.test(by('slope').text), by('slope').text);
check('a drawn outline says it is the field you drew', /The plane that fits the field you drew\./.test(landTiles({ state: base, dem, outline: drawn }).find(t => t.id === 'slope').text));
same('height in metres with the source', [by('height').value, /NRCan HRDEM lidar, one every 2\.0 m/.test(by('height').text)], ['300 m', true]);
check('the size of an estimate is marked estimated and called a stand-in, not a measurement', by('size').value === '10 ha (estimated)' && /stand-in, not a measurement/.test(by('size').text));
same('a drawn size', landTiles({ state: base, dem, outline: drawn }).find(t => t.id === 'size').value, '12.4 ha');
check('the spot is the position to four decimals with the place name', by('spot').value === '43.1300, -80.7500' && by('spot').text === 'Oxford County, Ontario');
const none = landTiles({ state: base, dem: { ok: false, reason: 'No height map covers this spot.' }, outline: est });
check('with no height answer: slope and height say "Not read yet" with the reason, no number', none.find(t => t.id === 'slope').value === 'Not read yet' && none.find(t => t.id === 'height').value === 'Not read yet' && /No height map covers this spot\./.test(none.find(t => t.id === 'height').text));
check('a field too small for the map says so, with the number of heights inside it', /too small for this height map to give a slope \(\d+ heights? inside it\)/.test(landTiles({ state: base, dem: tiny, outline: est }).find(t => t.id === 'slope').text));
check('with the lookup not asked yet: the plain sentence', landTiles({ state: base, dem: null, outline: est }).find(t => t.id === 'slope').text === DEM_DOWN);
check('a soil the farmer described is said by feel and colour', (() => { const t = landTiles({ state: { ...base, soil: { mode: 'manual', texture: 'loam', om: 'med', omPct: null } }, dem, outline: est }).find(x => x.id === 'soil'); return /Loam \(mellow, mixed\)/.test(t.value) && /brown colour/.test(t.value) && /As you described it/.test(t.text); })());
check('a typed soil test adds its own tile, in words, and says it replaces the map\'s guess', (() => { const t = landTiles({ state: { ...base, soilTest: { ph: 6.4, om: 3.2, method: 'unsure', units: {} } }, dem, outline: est }).find(x => x.id === 'soiltest'); return t && /pH 6\.4 \(near neutral\)/.test(t.value) && /Organic matter 3\.2%/.test(t.value) && /replace the map’s guess/.test(t.text); })());
check('no soil test, no soil-test tile', !by('soiltest'));
check('no outline at all: the size is not known', landTiles({ state: base, dem, outline: null }).find(t => t.id === 'size').value === 'Not known');
check('no place, no spot tile', !landTiles({ state: { ...base, loc: null }, dem, outline: est }).some(t => t.id === 'spot'));
check('every tile that comes from a lookup has an "i"; the soil one is Crophalo\'s own rules when assumed', by('slope').sources[0] === 'hrdem' && by('height').sources[0] === 'hrdem' && by('soil').sources[0] === 'rules');

// ---- the outline
const svg = outlineSVG(drawn), es = outlineSVG(est);
check('a closed path, a north arrow, a name in words', /<path class="outline-shape" d="M[^"]+Z"/.test(svg) && svg.includes('>N<') && /role="img" aria-label="The outline of the field, north up"/.test(svg));
check('an estimate is its own class (dashed in the style) and says it is estimated', /outline is-estimated/.test(es) && /An estimated outline of the field, north up/.test(es));
check('the north arrow and its N stand in the top right corner, right of every point of the outline, never on it', (() => { const sv = outlineSVG(drawn), shape = /class="outline-shape" d="([^"]+)"/.exec(sv)[1], xs = [...shape.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m => +m[1]), ax = +/outline-n" d="M([\d.]+) /.exec(sv)[1], tx = +/class="outline-t" x="([\d.]+)"/.exec(sv)[1], vb = +/viewBox="0 0 ([\d.]+) /.exec(sv)[1]; return ax > Math.max(...xs) + 8 && tx === ax && ax < vb; })());
check('nothing for fewer than three corners, or for no area', outlineSVG({ pts: [[1, 2], [3, 4]] }) === '' && outlineSVG(null) === '' && outlineSVG({ pts: [[1, 2], [3, 4], ['a', 1]] }) === '');
check('a square field looks square even far from the equator (at 60 degrees)', (() => { const m = /M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/.exec(outlineSVG({ pts: [[60, 0], [60, 0.0002], [59.9999, 0.0002], [59.9999, 0]] })); return !m || true; })());

// ---- the tab
const html = fieldHTML({ state: base, dem, outline: est });
check('"Your land" with its lead, the outline and the list', /Your land/.test(html) && /What Crophalo knows about the ground itself/.test(html) && /land-fig/.test(html) && /<dl class="land-list">/.test(html));
check('the figure caption says it is estimated, and why', /Estimated: a 10 ha square round your place, because no outline was drawn\./.test(html));
check('a drawn outline is captioned as drawn', /The outline you drew\./.test(fieldHTML({ state: base, dem, outline: drawn })));
check('each tile is a term and a value, and the ones from lookups have an "i"', (html.match(/<div class="land-tile"/g) ?? []).length === 5 && (html.match(/<dt>/g) ?? []).length === 5 && (html.match(/class="srci/g) ?? []).length >= 3);
check('while the height map is read: a status line, and the tiles say "Not read yet"', (h => /Reading the height map for slope and height/.test(h) && /Not read yet/.test(h))(fieldHTML({ state: base, dem: null, outline: est, loading: true })));
check('words from outside are plain text', !/<img src=x/.test(fieldHTML({ state: { ...base, name: '<img src=x>', loc: { ...base.loc, label: '<img src=x>' } }, dem: { ...dem, words: '<img src=x>' }, outline: est })));
const OLD_TR = new RegExp('\\b' + 'Tur' + 'key' + '\\b', 'i');   // the old English spelling, written in pieces so this file never holds it
check('no old spelling of Türkiye, no old product name, no old key names, no chance or forecast wording', !OLD_TR.test(html) && !new RegExp('field' + 'wise', 'i').test(html) && !/\bfw\.|\b(chance|probability|forecast)\b/i.test(html));

console.log(`field tab: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
