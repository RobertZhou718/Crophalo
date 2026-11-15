// Crophalo's suite for the map's base (js/lightstyle.js and the pure parts of js/mapbase.js): the style holds the names of countries, regions and places and no name of any water, no road, point or park;
// Türkiye by its own name; the colours of the calm map; which backdrop a choice needs, near the poles and without WebGL; the credit lines word for word; every sentence plain.
// RULE: never loosen a check here without a written farming reason beside it. A farm map must not take sides over what a sea or a lake is called. Run: node scripts/test_mapbase.mjs
import { lightStyle, labelsStyle, reading, NAME, COLOURS, PLACE_CLASSES, TILES, GLYPHS, CREDIT } from '../js/lightstyle.js';
const OLD = ['Tur', 'key'].join('');
import { backdropFor, creditFor, creditParts, CREDIT_LINKS, SAYS, POLE, PHOTO_CREDIT, GREY_CREDIT } from '../js/mapbase.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const styles = { light: lightStyle(), photo: labelsStyle(true), paper: labelsStyle(false) };
for (const [name, style] of Object.entries(styles)) {
  const r = reading(style);
  same(`${name}: every layer that draws words comes from the place layer alone (no water_name, no transportation_name, no poi, no peak, no park name)`, r.sourceLayers, ['place']);
  same(`${name}: no symbol layer is named for water`, r.waterLayers, []);
  check(`${name}: country, region, city, town and village names are all there`, ['country', 'state', 'city', 'town', 'village'].every(k => r.classes.includes(k)), r.classes);
  check(`${name}: the symbol layers are the seven of the place list`, r.symbols.length === 7, r.symbols);
  check(`${name}: no icon and no sprite (nothing to fetch beyond tiles and fonts)`, !r.hasIcons && r.sprite === null);
  check(`${name}: the tiles and fonts come from OpenFreeMap`, style.sources.openmaptiles.url === TILES && style.glyphs === GLYPHS && /openfreemap\.org/.test(TILES));
  check(`${name}: the source carries the credit word for word`, style.sources.openmaptiles.attribution === CREDIT && CREDIT === 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
  check(`${name}: every name layer shows English first, then the local name, and Türkiye by its own name`, style.layers.filter(l => l.type === 'symbol').every(l => JSON.stringify(l.layout['text-field']) === JSON.stringify(NAME)) && JSON.stringify(NAME).includes('Türkiye') && JSON.stringify(NAME).includes('"TR"') && JSON.stringify(NAME).includes(OLD) && JSON.stringify(NAME).indexOf('Türkiye') < JSON.stringify(NAME).indexOf('name_en", ["get"') + 400);
  check(`${name}: no layer of the style is named after a sea, lake, river, bay or gulf label`, !style.layers.some(l => l.type === 'symbol' && /water|ocean|sea|lake|bay|gulf|river/i.test(l.id)));
}
const light = styles.light, paper = styles.paper, photo = styles.photo;
check('the Light map has its ground: the land, water, farmland, roads, borders', ['land', 'water', 'landcover-farmland', 'road-motorway', 'border-country'].every(id => light.layers.some(l => l.id === id)));
check('its water is filled but never named: the water layer is a fill, and there is no layer of any kind that reads water_name or waterway names', light.layers.filter(l => /water/.test(l['source-layer'] ?? '')).every(l => l.type !== 'symbol'));
same('the calm colours of the note: land, water, farmland, motorways', [COLOURS.land, COLOURS.water, COLOURS.farmland, COLOURS.motorway], ['#f3f3f1', '#c6d9e6', '#f4f1e7', '#fbefcf']);
check('the names alone have no ground: no background and no fill, so the photo shows through', photo.layers.every(l => l.type === 'symbol') && paper.layers.every(l => l.type === 'symbol'));
check('over the photo the names are white with a soft dark halo', photo.layers.every(l => l.paint['text-color'] === '#ffffff' && /rgba\(18,24,32/.test(l.paint['text-halo-color']) && l.paint['text-halo-width'] >= 1.4));
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
same('Satellite without MapLibre: the photo alone, no names', backdropFor({ choice: 'sat', gl: false }).names, null);
same('Light with MapLibre in Ontario: MapLibre\'s own ground and names', backdropFor({ choice: 'light', lat: 43.13, gl: true }), { ground: 'gl', names: 'light', note: '' });
same('Light beyond 63 degrees: Esri\'s grey with dark names, and the poles sentence', backdropFor({ choice: 'light', lat: 64, gl: true }), { ground: 'grey', names: 'paper', note: 'pole' });
same('exactly at the line is still the detailed map, in either hemisphere', [backdropFor({ choice: 'light', lat: POLE, gl: true }).ground, backdropFor({ choice: 'light', lat: -POLE, gl: true }).ground], ['gl', 'gl']);
same('Light without MapLibre: Esri\'s grey and the "no WebGL" sentence key', backdropFor({ choice: 'light', lat: 43, gl: false }), { ground: 'grey', names: null, note: 'gl' });
same('the south pole is the same as the north', backdropFor({ choice: 'light', lat: -80, gl: true }).ground, 'grey');

// ---- the credits, word for word
same('the photo alone', creditFor({ ground: 'photo', names: null }), 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community');
same('the photo with its names', creditFor({ ground: 'photo', names: 'photo' }), 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community · Place names: OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
same('the Light map: OpenFreeMap\'s alone', creditFor({ ground: 'gl', names: 'light' }), 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
same('Esri\'s grey alone, and with names', [creditFor({ ground: 'grey', names: null }), creditFor({ ground: 'grey', names: 'paper' })], [GREY_CREDIT, `${GREY_CREDIT} · Place names: OpenFreeMap © OpenMapTiles Data from OpenStreetMap`]);
check('the photo credit is the one the note names', PHOTO_CREDIT === 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community');

// ---- the sentences
const BAN = /NaN|undefined|null|\[object|forecast|likely|probab|chance/i;
check('every sentence is plain, ends with a full stop and holds no banned word', Object.values(SAYS).every(t => typeof t === 'string' && /\.$/.test(t) && !BAN.test(t) && t.length < 330), SAYS);
check('the sentences say what the farmer sees, not how it works', /WebGL/.test(SAYS.noGL) && /offline/.test(SAYS.offline) && /ten minutes/.test(SAYS.stalled) && /poles/.test(SAYS.pole));
check('no sentence names a sea, lake or country', !Object.values(SAYS).some(t => new RegExp('\\b(Atlantic|Pacific|Ontario|Canada|' + OLD + '|Gulf of)\\b').test(t)));
process.exitCode = failed ? 1 : 0;

// the Light map's credit is three links, and the words stay the same
const parts = creditParts(creditFor({ ground: 'gl', names: 'light' }));
same('the Light map credit is three links, in order, to OpenFreeMap, OpenMapTiles and OpenStreetMap\'s copyright page', parts.filter(p => p.href).map(p => [p.text, p.href]), [['OpenFreeMap', 'https://openfreemap.org'], ['OpenMapTiles', 'https://openmaptiles.org'], ['OpenStreetMap', 'https://www.openstreetmap.org/copyright']]);
same('and the words read as before', parts.map(p => p.text).join(''), 'OpenFreeMap \u00a9 OpenMapTiles Data from OpenStreetMap');
check('the photo credit with names keeps Esri\'s words plain and links only the OpenFreeMap ones', creditParts(creditFor({ ground: 'photo', names: 'photo' })).filter(p => p.href).length === 3 && creditParts(PHOTO_CREDIT).every(p => !p.href));
console.log(`${passed} passed, ${failed} failed`);
