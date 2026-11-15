// Crophalo's suite for the map's base (js/lightstyle.js and the pure parts of js/mapbase.js): the style holds the names of countries, regions and places and no name of any water, no road, point or park;
// Türkiye by its own name; the colours of the calm map; which backdrop a choice needs, also without WebGL (NASA's picture, never Esri's); the credit lines word for word; every sentence plain.
// RULE: never loosen a check here without a written farming reason beside it. A farm map must not take sides over what a sea or a lake is called. Run: node scripts/test_mapbase.mjs
import { ROAD_NAME, lightStyle, labelsStyle, reading, NAME, COLOURS, PLACE_CLASSES, TILES, GLYPHS, CREDIT } from '../js/lightstyle.js';
const OLD = ['Tur', 'key'].join('');
import { J } from './gibs_fixtures.mjs';
import { backdropFor, creditFor, creditParts, CREDIT_LINKS, SAYS, PHOTO_CREDIT } from '../js/mapbase.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const styles = { light: lightStyle(), photo: labelsStyle(true), paper: labelsStyle(false) };
for (const [name, style] of Object.entries(styles)) {
  const r = reading(style);
  same(`${name}: every layer that draws words comes from the place layer or the road names (no water_name, no poi, no peak, no park name)`, r.sourceLayers, name === 'paper' ? ['place'] : ['transportation_name', 'place']);
  same(`${name}: no symbol layer is named for water`, r.waterLayers, []);
  check(`${name}: country, region, city, town and village names are all there`, ['country', 'state', 'city', 'town', 'village'].every(k => r.classes.includes(k)), r.classes);
  check(`${name}: the symbol layers are the seven of the place list, and the two of the road names where roads are named`, r.symbols.length === (name === 'paper' ? 7 : 9), r.symbols);
  check(`${name}: no icon and no sprite (nothing to fetch beyond tiles and fonts)`, !r.hasIcons && r.sprite === null);
  check(`${name}: the tiles and fonts come from OpenFreeMap`, style.sources.openmaptiles.url === TILES && style.glyphs === GLYPHS && /openfreemap\.org/.test(TILES));
  check(`${name}: the source carries the credit word for word`, style.sources.openmaptiles.attribution === CREDIT && CREDIT === 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
  check(`${name}: every name layer shows English first, then the local name, and Türkiye by its own name`, style.layers.filter(l => l.type === 'symbol' && l['source-layer'] === 'place').every(l => JSON.stringify(l.layout['text-field']) === JSON.stringify(NAME)) && style.layers.filter(l => l['source-layer'] === 'transportation_name').every(l => JSON.stringify(l.layout['text-field']) === JSON.stringify(ROAD_NAME)) && JSON.stringify(NAME).includes('Türkiye') && JSON.stringify(NAME).includes('"TR"') && JSON.stringify(NAME).includes(OLD) && JSON.stringify(NAME).indexOf('Türkiye') < JSON.stringify(NAME).indexOf('name_en", ["get"') + 400);
  check(`${name}: no layer of the style is named after a sea, lake, river, bay or gulf label`, !style.layers.some(l => l.type === 'symbol' && /water|ocean|sea|lake|bay|gulf|river/i.test(l.id)));
}
const light = styles.light, paper = styles.paper, photo = styles.photo;
check('the Light map has its ground: the land, water, farmland, roads, borders', ['land', 'water', 'landcover-farmland', 'road-motorway', 'border-country'].every(id => light.layers.some(l => l.id === id)));
check('its water is filled but never named: the water layer is a fill, and there is no layer of any kind that reads water_name or waterway names', light.layers.filter(l => /water/.test(l['source-layer'] ?? '')).every(l => l.type !== 'symbol'));
same('the calm colours of the note: land, water, farmland, motorways', [COLOURS.land, COLOURS.water, COLOURS.farmland, COLOURS.motorway], ['#f2efe9', '#aad3df', '#eeeedb', '#f9c07a']);
check('the names (and over the photo the thin road lines) have no ground: no background and no fill, so the photo shows through', photo.layers.every(l => l.type === 'symbol' || (l.type === 'line' && l['source-layer'] === 'transportation')) && paper.layers.every(l => l.type === 'symbol'));
check('over the photo the roads come from zoom 12 and stay thin (never wider than 7 px at the closest zoom, so a field is not hidden)', photo.layers.filter(l => l.type === 'line').every(l => l.minzoom >= 12 && JSON.stringify(l.paint['line-width']).match(/18,(\d+(\.\d+)?)/)?.[1] <= 7));
check('over the photo the names are white with a soft dark halo', photo.layers.filter(l => l.type === 'symbol').every(l => l.paint['text-color'] === '#ffffff' && /rgba\((18,24,32|10,14,20)/.test(l.paint['text-halo-color']) && l.paint['text-halo-width'] >= 1.4));
check('over a light ground they are dark with a white halo', paper.layers.every(l => l.paint['text-color'] === '#3a3a3f' && l.paint['text-halo-color'] === '#ffffff') && light.layers.filter(l => l.type === 'symbol').every(l => l.paint['text-color'] === '#3a3a3f'));
check('countries come first at the far zooms and towns only when close', light.layers.find(l => l.id === 'label-country-major').maxzoom === 9 && light.layers.find(l => l.id === 'label-village').minzoom >= 8 && light.layers.find(l => l.id === 'label-state').minzoom <= 5);
same('the place classes asked for', PLACE_CLASSES, ['country', 'state', 'city', 'town', 'village']);
check('borders are dashed and the sea borders are left out', JSON.stringify(light.layers.filter(l => /^border/.test(l.id)).map(l => l.filter)).includes('"maritime"') && light.layers.filter(l => /^border/.test(l.id)).every(l => l.paint['line-dasharray']));
check('a style is plain JSON: it survives a round trip', JSON.stringify(JSON.parse(JSON.stringify(light))) === JSON.stringify(light));

// ---- the words of a name: the style's own expression, run by a small reader of the four forms it uses (case, any, ==, get, coalesce)
function evaluate(e, props) {
  if (!Array.isArray(e)) return e;
  const [op, ...args] = e;
  if (op === 'get') return props[args[0]] ?? null;
  if (op === '==') return evaluate(args[0], props) === evaluate(args[1], props);
  if (op === 'any') return args.some(a => evaluate(a, props));
  if (op === 'coalesce') { for (const a of args) { const v = evaluate(a, props); if (v !== null && v !== undefined) return v; } return null; }
  if (op === 'case') { for (let i = 0; i + 1 < args.length; i += 2) if (evaluate(args[i], props)) return evaluate(args[i + 1], props); return evaluate(args.at(-1), props); }
  throw new Error('unknown form ' + op);
}
same('the country the data names in the old English way is written Türkiye, by its code and by its English name', [evaluate(NAME, { iso_a2: 'TR', name_en: OLD, name: 'Türkiye' }), evaluate(NAME, { name_en: OLD, name: OLD })], ['Türkiye', 'Türkiye']);
same('every other country is written in English first, then by its local name', [evaluate(NAME, { iso_a2: 'CA', name_en: 'Canada', name: 'Canada' }), evaluate(NAME, { name: 'Ελλάδα', 'name:latin': 'Ellada' }), evaluate(NAME, { name: 'Wałbrzych' })], ['Canada', 'Ellada', 'Wałbrzych']);

// ---- the backdrops
same('Satellite with MapLibre: the photo and the names over it', backdropFor({ choice: 'sat', gl: true }), { ground: 'photo', names: 'photo', note: '' });
same('Satellite without MapLibre: NASA\'s picture alone, no names', backdropFor({ choice: 'sat', gl: false }).names, null);
same('Light with MapLibre in Ontario: MapLibre\'s own ground and names', backdropFor({ choice: 'light', lat: 43.13, gl: true }), { ground: 'gl', names: 'light', note: '' });
same('Light without MapLibre: NASA\'s picture with no names and the "no WebGL" sentence key', backdropFor({ choice: 'light', gl: false }), { ground: 'photo', names: null, note: 'gl' });

// ---- the credits, word for word
const FAR = 'Imagery: NASA Blue Marble (NASA GIBS)', NEAR = 'Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0';
same('far (zoom 8 and under) the clean base is NASA Blue Marble', [creditFor({ ground: 'photo', names: null, zoom: 3 }), creditFor({ ground: 'photo', names: null, zoom: 8 })], [FAR, FAR]);
same('close (zoom 9 and nearer) it is Sentinel-2 cloudless 2016 by EOX, with the Copernicus sentence and the licence', [creditFor({ ground: 'photo', names: null, zoom: 9 }), creditFor({ ground: 'photo', names: null, zoom: 15 })], [NEAR, NEAR]);
same('the base with its names', creditFor({ ground: 'photo', names: 'photo', zoom: 4 }), `${FAR} · Place names: OpenFreeMap © OpenMapTiles Data from OpenStreetMap`);
same('with the newest picture on, its credit and day are added', creditFor({ ground: 'photo', names: null, zoom: 12, newest: true, pic: `HLS Sentinel-2 30 m, ${J(5, 'November', 2026)}` }), `${NEAR} · Newest picture: NASA GIBS / Worldview, HLS Sentinel-2 30 m, ${J(5, 'November', 2026)}`);
same('with the newest picture off, no day is in the credit even if one is given', creditFor({ ground: 'photo', names: null, zoom: 12, pic: `HLS Sentinel-2 30 m, ${J(5, 'November', 2026)}` }), NEAR);
same('close up in the United States the corner names the USGS photographs, and where only some tiles have them, both', [creditFor({ ground: 'photo', names: null, zoom: 15, aerial: 'usgs' }), /^Imagery: USDA, USGS The National Map: Orthoimagery; Sentinel-2 cloudless 2016/.test(creditFor({ ground: 'photo', names: null, zoom: 15, aerial: 'both' }))], ['Imagery: USDA, USGS The National Map: Orthoimagery', true]);
same('the USGS credit links The National Map', creditParts(creditFor({ ground: 'photo', names: null, zoom: 15, aerial: 'usgs' })).filter(p => p.href).map(p => p.text), ['The National Map: Orthoimagery']);
same('when the clean base failed, the credit is the daily picture\'s alone', creditFor({ ground: 'photo', names: null, zoom: 12, clean: false, pic: `MODIS Terra 250 m, ${J(5, 'November', 2026)}` }), `Imagery: NASA GIBS / Worldview · MODIS Terra 250 m, ${J(5, 'November', 2026)}`);
same('the close credit links EOX\'s page and the licence', creditParts(creditFor({ ground: 'photo', names: null, zoom: 12 })).filter(p => p.href).map(p => [p.text, p.href]), [['Sentinel-2 cloudless 2016', 'https://cloudless.eox.at'], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']]);
same('the Light map: OpenFreeMap\'s alone', creditFor({ ground: 'gl', names: 'light' }), 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
check('no Esri address and no Esri credit is left in the base', !/esri|arcgis/i.test(JSON.stringify([PHOTO_CREDIT, SAYS, creditFor({ ground: 'photo', names: 'photo' })])));
check('the picture credit is the one NASA asks for', PHOTO_CREDIT === 'Imagery: NASA GIBS / Worldview');

// ---- the sentences
const BAN = /NaN|undefined|null|\[object|forecast|likely|probab|chance/i;
check('every sentence is plain, ends with a full stop and holds no banned word', Object.values(SAYS).every(t => typeof t === 'string' && /\.$/.test(t) && !BAN.test(t) && t.length < 330), SAYS);
check('the clean-picture sentence says the daily picture stands in and can show clouds', /clean satellite picture did not load/.test(SAYS.cleanDown) && /clouds/.test(SAYS.cleanDown));
check('the sentences say what the farmer sees, not how it works', /WebGL/.test(SAYS.noGL) && /offline/.test(SAYS.offline) && /ten minutes/.test(SAYS.stalled) && /satellite picture/.test(SAYS.stalled));
check('no sentence names a sea, lake or country', !Object.values(SAYS).some(t => new RegExp('\\b(Atlantic|Pacific|Ontario|Canada|' + OLD + '|Gulf of)\\b').test(t)));
process.exitCode = failed ? 1 : 0;

// the Light map's credit is three links, and the words stay the same
const parts = creditParts(creditFor({ ground: 'gl', names: 'light' }));
same('the Light map credit is three links, in order, to OpenFreeMap, OpenMapTiles and OpenStreetMap\'s copyright page', parts.filter(p => p.href).map(p => [p.text, p.href]), [['OpenFreeMap', 'https://openfreemap.org'], ['OpenMapTiles', 'https://openmaptiles.org'], ['OpenStreetMap', 'https://www.openstreetmap.org/copyright']]);
same('and the words read as before', parts.map(p => p.text).join(''), 'OpenFreeMap \u00a9 OpenMapTiles Data from OpenStreetMap');
check('the picture credit with names links only the three OpenFreeMap words', creditParts(creditFor({ ground: 'photo', names: 'photo' })).filter(p => p.href).length === 3 && creditParts(PHOTO_CREDIT).every(p => !p.href));
console.log(`${passed} passed, ${failed} failed`);
