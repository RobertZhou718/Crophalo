// Crophalo's Field tab, the figures: the land in plain words: soil (assumed, described, or tested), slope and height of the field from the height lookup with its source named,
// the field's size and outline (drawn or estimated, always said), the spot. Nothing is made up: a figure not read says "Not read yet" with its reason. Pure: landFromHeights(),
// slopeWords(), compass(), landTiles(), demKey(). loadDem() asks the server's own height lookup once, through the 3D view's own modules (js/heights3d.js, js/slope3d-data.js), so the
// report and the 3D farm give the same slope. Checked by scripts/test_field_tab.mjs (a height grid with a known tilt, the lookup's refusals, every word, the estimated outline, the soil test).
import { describe } from './soiltest.js';
import { FEEL, COLOUR } from './words.m3.js';
import { SOIL_MAP_WORDS } from './steps.js';
import { blocksOf, frameAt, heightModel, heightAtMesh, GRID_SIZE_PHONE } from './farm3d-data.js';
import { loadHeights, sourceWords } from './heights3d.js';
import { fieldSlope, bandOf } from './slope3d-data.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
export const DEM_DOWN = 'The height lookup did not answer. Slope and height are not read yet.';

// The source note to show for a height map, by the name the lookup gives it.
export const demKey = name => /HRDEM|Natural Resources Canada|NRCan/i.test(name ?? '') ? 'hrdem' : /3DEP|USGS/i.test(name ?? '') ? 'usgs3dep' : /Copernicus|GLO-?30/i.test(name ?? '') ? 'glo30' : /NASADEM|SRTM/i.test(name ?? '') ? 'nasadem' : 'dem';

// The grid the lookup gave (decoded by heights3d.js) and the field's outline in degrees -> the field's own figures: its plane slope, the downhill bearing, the height at the middle, the source in words.
// polygon: [[lat, lon], ...]; pin: { lat, lon } (the block's middle is the frame's origin).
export function landFromHeights(grid, polygon, block, pin) {
  if (!grid || grid.failed || !grid.h) return { ok: false, reason: grid?.failed || DEM_DOWN };
  const model = heightModel(grid), frame = frameAt(block.lat, block.lon);
  const words = sourceWords(grid), srcKey = demKey(grid.name || grid.source);
  if (model.flat) return { ok: false, reason: 'The height map has too little ground heights here to give a slope.' };
  const poly = polygon.map(([la, lo]) => frame.toXZ(la, lo)), s = fieldSlope(model, poly);
  const mid = frame.toXZ(pin.lat, pin.lon), rel = heightAtMesh(model, mid.x, mid.z), height = fin(rel) ? rel + model.base : null;
  const band = s.tooSmall ? null : bandOf(s.pct);
  return { ok: true, words, name: grid.name ?? '', resolution: fin(grid.res_m) ? grid.res_m : null, kind: grid.kind ?? '', srcKey, height, cells: s.cells, tooSmall: !!s.tooSmall,
    slope: s.tooSmall ? null : s.pct, downhill: s.tooSmall ? null : s.downhill, band: band ? band.name : '' };
}
// Ask the server's height lookup for the block round the field, as the 3D view does, and work the field's slope out. outline: { pts: [[lat, lon], ...] }.
export async function loadDem(loc, outline, get = globalThis.fetch?.bind(globalThis)) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function' || !Array.isArray(outline?.pts) || outline.pts.length < 3) return { ok: false, reason: DEM_DOWN };
  try {
    const block = blocksOf([{ id: 'f', polygon: outline.pts }], { lat, lon })[0], request = { lat: block.lat, lon: block.lon, width: block.width, depth: block.depth, n: GRID_SIZE_PHONE };
    const grid = await loadHeights(request, { fetchImpl: get });
    return landFromHeights(grid, outline.pts, block, { lat, lon });
  } catch { return { ok: false, reason: DEM_DOWN }; }
}

// ---- words
export const slopeWords = pct => !fin(pct) ? '' : pct < 2 ? 'Nearly flat' : pct < 5 ? 'Gently sloping' : pct < 10 ? 'Moderately sloping' : pct < 15 ? 'Strongly sloping' : 'Steep';
const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = deg => fin(deg) ? POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] : '';
const num = (v, d = 0) => v.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const soilWords = s => {
  if (!s?.mode) return { value: 'Not chosen', text: 'No soil was chosen yet.' };
  if (s.mode === 'map') { const f = FEEL.find(x => x.value === s.texture); return { value: f ? `${f.title} (${f.sub})` : 'From a soil map', text: 'From a soil map, not a test of this field. A soil test is better.' }; }   // a demo field's soil
  if (s.mode === 'assumed') return { value: 'Average soil (assumed)', text: 'Nothing was measured. An average loam is assumed until the soil lookup answers, so the report says it is less sure. Tap your own soil in the setup if you know it.' };
  if (s.mode === 'map') return { value: `${SOIL_MAP_WORDS[s.texture] ?? 'Soil'} (from the soil map)`.replace(/^./, c => c.toUpperCase()), text: 'Read from a soil map, not measured on this field. A soil test is better.' };
  const feel = FEEL.find(f => f.value === s.texture), colour = COLOUR.find(c => c.value === s.om);
  return { value: [feel ? `${feel.title} (${feel.sub})` : '', colour ? `${colour.title.toLowerCase()} colour, ${colour.sub}` : ''].filter(Boolean).join(' · ') || 'As you described it', text: 'As you described it by feel and colour. A soil test is better.' };
};
// The tiles of "Your land": [{ id, term, value, text, sources }], from the answers, the outline and the land lookup (or null when it has not answered).
export function landTiles({ state, dem, outline }) {
  const out = [], s = soilWords(state?.soil), key = dem?.ok ? dem.srcKey : 'dem';
  out.push({ id: 'soil', term: 'Soil', value: s.value, text: s.text, sources: state?.soil?.mode === 'assumed' ? ['rules'] : [] });
  const tested = describe(state?.soilTest);
  if (tested.length) out.push({ id: 'soiltest', term: 'Your soil test', value: tested.join(' · '), text: 'These numbers are from your soil test and replace the map’s guess. They stay on this device.', sources: [] });
  const how = outline?.estimated ? `The plane that fits a square of about ${Math.round(Math.sqrt(outline.ha * 1e4))} m round your pin (estimated: no outline was drawn).` : 'The plane that fits the field you drew.';
  if (dem?.ok && fin(dem.slope)) out.push({ id: 'slope', term: 'Slope', value: `${slopeWords(dem.slope)} (${num(dem.slope, 1)}%)`, text: `${dem.downhill !== null && dem.downhill !== undefined ? `Water runs downhill towards the ${compass(dem.downhill)}. ` : ''}${how} ${dem.words}`.trim(), sources: [key], figure: dem.words });
  else if (dem?.ok && dem.tooSmall) out.push({ id: 'slope', term: 'Slope', value: 'Not read yet', text: `The field is too small for this height map to give a slope (${dem.cells} ${dem.cells === 1 ? 'height' : 'heights'} inside it). ${dem.words}`, sources: [key], figure: dem.words });
  else out.push({ id: 'slope', term: 'Slope', value: 'Not read yet', text: dem?.reason ?? DEM_DOWN, sources: ['dem'] });
  out.push(dem?.ok && fin(dem.height) ? { id: 'height', term: 'Height above the sea', value: `${num(dem.height)} m`, text: `${dem.words} A height map’s own reading for the spot; check it against a map you trust.`, sources: [key], figure: dem.words } : { id: 'height', term: 'Height above the sea', value: 'Not read yet', text: dem?.reason ?? DEM_DOWN, sources: ['dem'] });
  out.push(outline ? { id: 'size', term: 'Field size', value: `${num(outline.ha, 1).replace(/\.0$/, '')} ha${outline.estimated ? ' (estimated)' : ''}`, text: outline.estimated ? 'No outline was drawn, so this is a 10 ha square estimated round the pin. It is a stand-in, not a measurement of your field.' : 'The area of the outline you drew.', sources: [] } : { id: 'size', term: 'Field size', value: 'Not known', text: 'No outline was drawn.', sources: [] });
  const loc = state?.loc;
  if (loc) out.push({ id: 'spot', term: 'Spot', value: `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`, text: loc.label || state?.name || '', sources: [] });
  return out;
}
