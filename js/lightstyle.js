// Crophalo's calm map style (MapLibre): the Light map and the place names drawn over the satellite photo, both from OpenFreeMap's vector tiles. Country, region, city, town and village names are on,
// in English, and Türkiye by its own name; no name of any sea, ocean, lake, river, bay or gulf exists in the style at all, and no road, point-of-interest or park name either.
// Pure: it only builds style objects. js/mapbase.js loads MapLibre and puts them on the map. Checked by scripts/test_mapbase.mjs (every symbol layer, the colours, Türkiye) and scripts/live_check_basemap.mjs (a real browser).
export const TILES = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const CREDIT = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
export const INK = '#3a3a3f';
// The colours of a street map people know: soft land, clear blue water, green parks and woods, white streets with a grey edge, yellow main roads, orange motorways; every name is dark on a white halo (about 7:1 or better).
export const COLOURS = Object.freeze({ land: '#f2efe9', water: '#aad3df', waterEdge: '#8fc0d1', farmland: '#eeeedb', grass: '#d6ebc1', wood: '#bcdca8', wetland: '#c9e3cf', sand: '#f1e6c4', ice: '#fbfcfd', rock: '#e4e0d8',
  built: '#e9e3da', park: '#c8e6b0', road: '#ffffff', roadEdge: '#c9c6bd', major: '#fde9a9', majorEdge: '#dfbf5c', motorway: '#f9c07a', motorwayEdge: '#d9873a', rail: '#b9b6b0', border: '#8a8a93', state: '#b4b4bb' });

// Which kinds of place carry a name, and which source layer they come from. Everything named here is a place on land.
export const PLACE_CLASSES = Object.freeze(['country', 'state', 'city', 'town', 'village']);
export const LABEL_SOURCE_LAYERS = Object.freeze(['place', 'transportation_name']);   // places, and the names of roads (never of water)
const SOURCE = 'openmaptiles';

// The words of a name: English where the data has it, the local name otherwise; Türkiye wherever the data uses the old English name.
const OLD_NAME = ['Tur', 'key'].join('');   // the English name the data may carry for the country; the style writes the country's own name instead
export const NAME = ['case', ['any', ['==', ['get', 'iso_a2'], 'TR'], ['==', ['get', 'name_en'], OLD_NAME]], 'Türkiye', ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']]];

const zoomSize = (...pairs) => ['interpolate', ['linear'], ['zoom'], ...pairs];
function labelLayers(onImagery) {
  const paint = onImagery
    ? { 'text-color': '#ffffff', 'text-halo-color': 'rgba(18,24,32,0.62)', 'text-halo-width': 1.6, 'text-halo-blur': 1 }
    : { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 1.4, 'text-halo-blur': 0.5 };
  const layout = (font, size, extra = {}) => ({ 'text-field': NAME, 'text-font': [font], 'text-size': size, 'text-max-width': 7, 'text-padding': 4, ...extra });
  const place = (id, filter, options, extra = {}) => ({ id, type: 'symbol', source: SOURCE, 'source-layer': 'place', filter, layout: options, paint, ...extra });
  const cls = name => ['==', ['get', 'class'], name];
  return [
    place('label-country-major', ['all', cls('country'), ['==', ['get', 'rank'], 1]], layout('Noto Sans Bold', zoomSize(1, 10, 4, 17), { 'text-max-width': 6.25 }), { maxzoom: 9 }),
    place('label-country', ['all', cls('country'), ['>=', ['get', 'rank'], 2]], layout('Noto Sans Bold', zoomSize(2, 9, 7, 16), { 'text-max-width': 6.25 }), { minzoom: 2, maxzoom: 9 }),
    place('label-state', cls('state'), layout('Noto Sans Italic', zoomSize(4, 10, 8, 14), { 'text-letter-spacing': 0.12, 'text-transform': 'uppercase' }), { minzoom: 4, maxzoom: 9 }),
    place('label-capital', ['all', cls('city'), ['==', ['get', 'capital'], 2]], layout('Noto Sans Bold', ['interpolate', ['exponential', 1.2], ['zoom'], 2, 10, 7, 14, 11, 19]), { minzoom: 1 }),
    place('label-city', ['all', cls('city'), ['!=', ['get', 'capital'], 2]], layout('Noto Sans Regular', ['interpolate', ['exponential', 1.2], ['zoom'], 2, 9, 7, 13, 11, 18]), { minzoom: 1 }),
    place('label-town', cls('town'), layout('Noto Sans Regular', ['interpolate', ['exponential', 1.2], ['zoom'], 7, 11, 11, 14]), { minzoom: 6 }),
    place('label-village', cls('village'), layout('Noto Sans Regular', ['interpolate', ['exponential', 1.2], ['zoom'], 8, 10, 11, 12]), { minzoom: 9 }),
  ];
}

// Road names along the road, from zoom 13 (main roads from 11); no name of water or of any other feature. Dark on white over a map, white on dark over the photo.
export const ROAD_NAME = ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
function roadNameLayers(onImagery) {
  const paint = onImagery
    ? { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,14,20,0.8)', 'text-halo-width': 1.6, 'text-halo-blur': 0.5 }
    : { 'text-color': '#3a3a3f', 'text-halo-color': '#ffffff', 'text-halo-width': 2, 'text-halo-blur': 0.3 };
  const name = (id, classes, minzoom, size) => ({ id, type: 'symbol', source: SOURCE, 'source-layer': 'transportation_name', minzoom, filter: ['all', ['match', ['get', 'class'], classes, true, false], ['has', 'name']],
    layout: { 'text-field': ROAD_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': size, 'symbol-placement': 'line', 'text-pitch-alignment': 'viewport', 'text-padding': 2, 'text-letter-spacing': 0.02, 'symbol-spacing': 320 }, paint });
  return [
    name('road-name-major', ['motorway', 'trunk', 'primary', 'secondary'], 11, zoomSize(11, 10, 16, 13)),
    name('road-name-minor', ['tertiary', 'minor', 'service', 'track'], 13, zoomSize(13, 10, 17, 12.5)),
  ];
}
// The roads over the photo, thin, with a dark edge so a road stays visible on bright or dark ground; from zoom 12, and never wide enough to hide a field.
function roadOverlayLayers() {
  const edge = (id, classes, minzoom, w) => line(id, 'transportation', klass(...classes), { 'line-color': 'rgba(10,14,20,0.5)', 'line-width': w }, { minzoom });
  const core = (id, classes, minzoom, w, colour) => line(id, 'transportation', klass(...classes), { 'line-color': colour, 'line-opacity': 0.9, 'line-width': w }, { minzoom });
  return [
    edge('photo-road-edge', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], 12, width(12, 1.4, 18, 7)),
    core('photo-road-minor', ['tertiary', 'minor'], 13, width(13, 0.5, 18, 3.4), '#ffffff'),
    core('photo-road-major', ['motorway', 'trunk', 'primary', 'secondary'], 12, width(12, 0.8, 18, 4.6), '#ffe9a6'),
  ];
}
const fill = (id, layer, filter, color, extra = {}, paint = {}) => ({ id, type: 'fill', source: SOURCE, 'source-layer': layer, ...(filter ? { filter } : {}), paint: { 'fill-color': color, ...paint }, ...extra });
const line = (id, layer, filter, paint, extra = {}, layout = {}) => ({ id, type: 'line', source: SOURCE, 'source-layer': layer, ...(filter ? { filter } : {}), layout: { 'line-cap': 'round', 'line-join': 'round', ...layout }, paint, ...extra });
const klass = (...names) => ['match', ['get', 'class'], names, true, false];
const width = (...pairs) => ['interpolate', ['exponential', 1.4], ['zoom'], ...pairs];

function groundLayers() {
  const C = COLOURS;
  return [
    { id: 'land', type: 'background', paint: { 'background-color': C.land } },
    fill('landcover-farmland', 'landcover', klass('farmland'), C.farmland, { minzoom: 7 }),
    fill('landcover-grass', 'landcover', klass('grass'), C.grass),
    fill('landcover-wood', 'landcover', klass('wood'), C.wood),
    fill('landcover-wetland', 'landcover', klass('wetland'), C.wetland, { minzoom: 6 }),
    fill('landcover-sand', 'landcover', klass('sand'), C.sand),
    fill('landcover-ice', 'landcover', klass('ice'), C.ice),
    fill('landcover-rock', 'landcover', klass('rock'), C.rock),
    fill('landuse-built', 'landuse', klass('residential', 'suburb', 'commercial', 'industrial', 'retail'), C.built, { minzoom: 8 }),
    fill('park', 'park', null, C.park, { minzoom: 8 }),
    fill('water', 'water', ['!=', ['get', 'brunnel'], 'tunnel'], C.water, {}, { 'fill-antialias': true, 'fill-outline-color': C.waterEdge }),
    line('waterway', 'waterway', klass('river', 'canal'), { 'line-color': C.water, 'line-width': width(8, 0.6, 14, 3) }, { minzoom: 8 }),
    line('waterway-stream', 'waterway', klass('stream', 'drain', 'ditch'), { 'line-color': C.water, 'line-width': width(12, 0.5, 16, 1.5) }, { minzoom: 12 }),
    fill('building', 'building', null, '#e0dfdb', { minzoom: 14 }, { 'fill-outline-color': '#d4d3cf' }),
    line('road-minor-casing', 'transportation', klass('minor', 'service', 'tertiary'), { 'line-color': C.roadEdge, 'line-width': width(12, 1.2, 18, 12) }, { minzoom: 12 }),
    line('road-minor', 'transportation', klass('minor', 'service', 'tertiary'), { 'line-color': C.road, 'line-width': width(12, 0.7, 18, 9) }, { minzoom: 12 }),
    line('road-track', 'transportation', klass('track'), { 'line-color': '#c4bda9', 'line-width': width(12, 0.8, 18, 4) }, { minzoom: 12 }),
    line('road-path', 'transportation', klass('path'), { 'line-color': '#b5ae9c', 'line-width': width(13, 0.6, 18, 2), 'line-dasharray': [2, 2] }, { minzoom: 14 }),
    line('road-major-casing', 'transportation', klass('primary', 'secondary', 'trunk'), { 'line-color': C.majorEdge, 'line-width': width(6, 1.2, 18, 18) }, { minzoom: 6 }),
    line('road-major', 'transportation', klass('primary', 'secondary', 'trunk'), { 'line-color': C.major, 'line-width': width(6, 0.7, 18, 15) }, { minzoom: 6 }),
    line('road-motorway-casing', 'transportation', klass('motorway'), { 'line-color': C.motorwayEdge, 'line-width': width(5, 1.4, 18, 20) }, { minzoom: 5 }),
    line('road-motorway', 'transportation', klass('motorway'), { 'line-color': C.motorway, 'line-width': width(5, 0.8, 18, 17) }, { minzoom: 5 }),
    line('rail', 'transportation', klass('rail'), { 'line-color': C.rail, 'line-width': 1, 'line-dasharray': [4, 3] }, { minzoom: 10 }),
    line('border-state', 'boundary', ['all', ['>=', ['get', 'admin_level'], 3], ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]], { 'line-color': C.state, 'line-width': 1, 'line-dasharray': [3, 2] }, { minzoom: 5 }),
    line('border-disputed', 'boundary', ['all', ['==', ['get', 'admin_level'], 2], ['==', ['get', 'disputed'], 1], ['!=', ['get', 'maritime'], 1]], { 'line-color': C.border, 'line-width': 1, 'line-dasharray': [1, 2] }),
    line('border-country', 'boundary', ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]], { 'line-color': C.border, 'line-width': width(2, 0.6, 12, 2.4), 'line-dasharray': [4, 2] }),
  ];
}

const base = layers => ({ version: 8, name: 'Crophalo', sources: { [SOURCE]: { type: 'vector', url: TILES, attribution: CREDIT } }, glyphs: GLYPHS, layers });
// The Map: a clear street map: soft ground, water without a name, roads with their names, and the names of countries, regions and places.
export const lightStyle = () => base([...groundLayers(), ...roadNameLayers(false), ...labelLayers(false)]);
// The names alone (white with a soft dark halo over the photo; dark with a white halo over a light ground); the background is transparent: there is no ground in this style.
// Over the photo (Satellite) the roads' thin lines and names come with them from zoom 12; over a light ground there is no ground at all and only the names.
export const labelsStyle = (onImagery = true) => base(onImagery ? [...roadOverlayLayers(), ...roadNameLayers(true), ...labelLayers(true)] : labelLayers(false));

// What a test or a check wants to know about a style: every layer that draws words, where its words come from, and whether any of them could be the name of water.
export function reading(style) {
  const layers = Array.isArray(style?.layers) ? style.layers : [], symbols = layers.filter(l => l.type === 'symbol');
  const sourceLayers = [...new Set(symbols.map(l => l['source-layer']))];
  const classes = [...new Set(symbols.flatMap(l => JSON.stringify(l.filter ?? '').match(/"(country|state|city|town|village|[a-z_]+)"/g) ?? []).map(s => s.replaceAll('"', '')))];
  const waterWords = /water|ocean|sea|lake|river|bay|gulf|waterway|marine|channel|strait/i;
  return { symbols: symbols.map(l => l.id), sourceLayers, classes, waterLayers: layers.filter(l => l.type === 'symbol' && (waterWords.test(l.id) || waterWords.test(String(l['source-layer'] ?? '')))).map(l => l.id),
    glyphs: style?.glyphs ?? '', sprite: style?.sprite ?? null, hasIcons: symbols.some(l => l.layout && ('icon-image' in l.layout)) };
}
