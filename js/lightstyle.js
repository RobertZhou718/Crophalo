// Crophalo's calm map style (MapLibre): the Light map and the place names drawn over the satellite photo, both from OpenFreeMap's vector tiles. Country, region, city, town and village names are on,
// in English, and Türkiye by its own name; no name of any sea, ocean, lake, river, bay or gulf exists in the style at all, and no road, point-of-interest or park name either.
// Pure: it only builds style objects. js/mapbase.js loads MapLibre and puts them on the map. Checked by scripts/test_mapbase.mjs (every symbol layer, the colours, Türkiye) and scripts/live_check_basemap.mjs (a real browser).
export const TILES = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const CREDIT = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
export const INK = '#3a3a3f';
export const COLOURS = Object.freeze({ land: '#f3f3f1', water: '#c6d9e6', waterEdge: '#b9cfdf', farmland: '#f4f1e7', grass: '#e8eedf', wood: '#dfe8da', wetland: '#dde8e3', sand: '#f1ede0', ice: '#fbfcfd', rock: '#ebeae6',
  built: '#e6e5e1', park: '#e0eadb', road: '#ffffff', roadEdge: '#d9d9dd', motorway: '#fbefcf', motorwayEdge: '#e2cf9f', rail: '#d3d3d7', border: '#9a9aa2', state: '#c4c4ca' });

// Which kinds of place carry a name, and which source layer they come from. Everything named here is a place on land.
export const PLACE_CLASSES = Object.freeze(['country', 'state', 'city', 'town', 'village']);
export const LABEL_SOURCE_LAYERS = Object.freeze(['place']);
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
    line('road-minor-casing', 'transportation', klass('minor', 'service'), { 'line-color': C.roadEdge, 'line-width': width(12, 1.2, 18, 12) }, { minzoom: 12 }),
    line('road-minor', 'transportation', klass('minor', 'service'), { 'line-color': C.road, 'line-width': width(12, 0.7, 18, 9) }, { minzoom: 12 }),
    line('road-track', 'transportation', klass('track', 'path'), { 'line-color': '#cfcfd3', 'line-width': width(13, 0.5, 18, 2), 'line-dasharray': [2, 2] }, { minzoom: 13 }),
    line('road-major-casing', 'transportation', klass('primary', 'secondary', 'tertiary', 'trunk'), { 'line-color': C.roadEdge, 'line-width': width(6, 1.2, 18, 18) }, { minzoom: 6 }),
    line('road-major', 'transportation', klass('primary', 'secondary', 'tertiary', 'trunk'), { 'line-color': C.road, 'line-width': width(6, 0.7, 18, 15) }, { minzoom: 6 }),
    line('road-motorway-casing', 'transportation', klass('motorway'), { 'line-color': C.motorwayEdge, 'line-width': width(5, 1.4, 18, 20) }, { minzoom: 5 }),
    line('road-motorway', 'transportation', klass('motorway'), { 'line-color': C.motorway, 'line-width': width(5, 0.8, 18, 17) }, { minzoom: 5 }),
    line('rail', 'transportation', klass('rail'), { 'line-color': C.rail, 'line-width': 1, 'line-dasharray': [4, 3] }, { minzoom: 10 }),
    line('border-state', 'boundary', ['all', ['>=', ['get', 'admin_level'], 3], ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]], { 'line-color': C.state, 'line-width': 1, 'line-dasharray': [3, 2] }, { minzoom: 5 }),
    line('border-disputed', 'boundary', ['all', ['==', ['get', 'admin_level'], 2], ['==', ['get', 'disputed'], 1], ['!=', ['get', 'maritime'], 1]], { 'line-color': C.border, 'line-width': 1, 'line-dasharray': [1, 2] }),
    line('border-country', 'boundary', ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]], { 'line-color': C.border, 'line-width': width(2, 0.6, 12, 2.4), 'line-dasharray': [4, 2] }),
  ];
}

const base = layers => ({ version: 8, name: 'Crophalo', sources: { [SOURCE]: { type: 'vector', url: TILES, attribution: CREDIT } }, glyphs: GLYPHS, layers });
// The Light map: calm ground, water without a name, and the names of countries, regions and places.
export const lightStyle = () => base([...groundLayers(), ...labelLayers(false)]);
// The names alone (white with a soft dark halo over the photo; dark with a white halo over a light ground); the background is transparent: there is no ground in this style.
export const labelsStyle = (onImagery = true) => base(labelLayers(onImagery));

// What a test or a check wants to know about a style: every layer that draws words, where its words come from, and whether any of them could be the name of water.
export function reading(style) {
  const layers = Array.isArray(style?.layers) ? style.layers : [], symbols = layers.filter(l => l.type === 'symbol');
  const sourceLayers = [...new Set(symbols.map(l => l['source-layer']))];
  const classes = [...new Set(symbols.flatMap(l => JSON.stringify(l.filter ?? '').match(/"(country|state|city|town|village|[a-z_]+)"/g) ?? []).map(s => s.replaceAll('"', '')))];
  const waterWords = /water|ocean|sea|lake|river|bay|gulf|waterway|marine|channel|strait/i;
  return { symbols: symbols.map(l => l.id), sourceLayers, classes, waterLayers: layers.filter(l => l.type === 'symbol' && (waterWords.test(l.id) || waterWords.test(String(l['source-layer'] ?? '')))).map(l => l.id),
    glyphs: style?.glyphs ?? '', sprite: style?.sprite ?? null, hasIcons: symbols.some(l => l.layout && ('icon-image' in l.layout)) };
}
