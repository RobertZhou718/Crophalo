// Crophalo's terrain analysis, the pure parts: Terrain Tiles' land heights read from their PNG tiles, the true ground size of a map pixel, slope (Horn), relief shading, frost pockets (a topographic position index), the relative erosion index
// and the hills' cast shadows, with each layer's classes, colours and words and the table of height sources with their credit lines. Pure: no page, no network, no clock; the PNG inflater is handed in, so Node and the browser run the same code.
// Checked by scripts/test_terrain.mjs (synthetic height grids with known answers, real recorded tiles, every class, colour and sentence) and scripts/e2e_terrain.mjs.

export const TILE = 256, SIDE = 768, MID = 256;   // a map tile, and the 3 × 3 block of height tiles round it that every computed tile is worked out from
export const TERRAIN_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
export const MAX_ZOOM = 15, R_EARTH = 6371000;
const A_WGS84 = 6378137, E2 = 0.00669437999014, RAD = Math.PI / 180, DEG = 180 / Math.PI;
export const tileAddress = (template, z, x, y) => String(template).replace('{z}', z).replace('{x}', x).replace('{y}', y);

// ---- the height sources: the prefix in each tile's x-amz-meta-x-imagery-sources header names the height map it was made from
export const HEIGHT_SOURCES = Object.freeze({
  srtm: { short: 'SRTM', name: 'SRTM (NASA and NGA, radar from the Space Shuttle)', ground: 'about 30 m', span: 'radar of 2000', credit: 'SRTM data courtesy of the U.S. Geological Survey', native: 12 },
  nrcan_cdem: { short: 'CDEM', name: 'Canadian Digital Elevation Model (Natural Resources Canada)', ground: 'about 20 m', span: 'maps and surveys from 1945 to 2011', credit: 'Contains information licensed under the Open Government Licence – Canada', native: 12 },
  eudem: { short: 'EU-DEM', name: 'EU-DEM (Copernicus), a blend of SRTM and ASTER heights', ground: 'about 30 m', span: 'version 1', credit: 'Produced using Copernicus data and information funded by the European Union - EU-DEM layers', native: 12 },
  ned13: { short: '3DEP', name: 'USGS 3DEP (formerly NED), 1/3 arc-second', ground: '10 m', span: 'survey years vary', credit: '3DEP data courtesy of the U.S. Geological Survey', native: 13 },
  ned: { short: '3DEP', name: 'USGS 3DEP (formerly NED), 1 arc-second', ground: '30 m', span: 'survey years vary', credit: '3DEP data courtesy of the U.S. Geological Survey', native: 12 },
  gmted: { short: 'GMTED2010', name: 'GMTED2010 (USGS)', ground: '250 m to 1 km', span: '2010', credit: 'GMTED2010 data courtesy of the U.S. Geological Survey', native: 9 },
  etopo1: { short: 'ETOPO1', name: 'ETOPO1 (NOAA), sea floor and coarse land', ground: 'about 1.8 km', span: '2009', credit: 'U.S. National Oceanic and Atmospheric Administration', native: 7 },
});
export const UNKNOWN_SOURCE = Object.freeze({ short: 'Terrain Tiles', name: 'a source on the Terrain Tiles list', ground: 'not published', span: 'not published', credit: 'See the full list of credits in the "i" card', native: 12 });
export const TILES_LINE = 'Heights: Terrain Tiles (Tilezen, AWS Open Data), built in 2017';
// The prefixes named by one tile's header, each once: "srtm/N44W080.tif, gmted/30N090W_….tif" gives ['srtm', 'gmted'].
export const prefixesOf = header => [...new Set(String(header ?? '').split(/[,\s]+/).map(part => part.split('/')[0].trim().toLowerCase()).filter(p => /^[a-z0-9_]+$/.test(p)))];
export const sourceOf = prefix => (Object.hasOwn(HEIGHT_SOURCES, prefix) ? HEIGHT_SOURCES[prefix] : UNKNOWN_SOURCE);
// The zoom a source's own detail reaches: computing further only repeats its heights. A tile made of several maps counts as its finest land map.
export function nativeZoom(prefixes) {
  const land = prefixes.filter(p => p !== 'gmted' && p !== 'etopo1');
  if (land.length) return Math.max(...land.map(p => sourceOf(p).native));
  return prefixes.length ? Math.max(...prefixes.map(p => sourceOf(p).native)) : 12;
}
// "CDEM" or "CDEM and SRTM": the short names under the view, each once, in the order given.
export const shortNames = prefixes => { const names = [...new Set(prefixes.map(p => sourceOf(p).short))]; return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? 'Terrain Tiles'; };
export const fromWords = prefixes => `computed by Crophalo from ${shortNames(prefixes)} heights`;
export function creditWords(prefixes) {   // the credit of every source under the view, then the tiles themselves
  const parts = [...new Set(prefixes.map(p => sourceOf(p)))].map(s => (s === UNKNOWN_SOURCE ? 'Part of the view comes from a source on the Terrain Tiles list; its credit is in the "i" card.' : `${s.short}: ${s.name}, ${s.ground}, ${s.span}. ${s.credit}.`));
  return `${parts.join(' ')} ${TILES_LINE}.`.trim();
}

// ---- reading a Terrarium PNG: 256 × 256 RGB, height = R × 256 + G + B / 256 − 32768 metres
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
// pause, when given, is awaited between stretches of 64 rows, so a page that decodes on its own thread never stalls.
export async function decodeTerrarium(bytes, inflate, pause = null) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 33 || PNG_SIG.some((v, i) => b[i] !== v)) throw new Error('not a PNG');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength), parts = [];
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  for (let at = 8; at + 8 <= b.length;) {
    const len = view.getUint32(at), type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]), data = b.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = b[at + 16]; colour = b[at + 17]; interlace = b[at + 20]; }
    else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  const bpp = colour === 2 ? 3 : colour === 6 ? 4 : 0;
  if (width !== TILE || height !== TILE || depth !== 8 || !bpp || interlace !== 0 || !parts.length) throw new Error('not a Terrarium tile');
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let off = 0; for (const p of parts) { joined.set(p, off); off += p.length; }
  const raw = new Uint8Array(await inflate(joined)), stride = width * bpp;
  if (raw.length < height * (stride + 1)) throw new Error('the picture is cut short');
  const px = new Uint8Array(height * stride), heights = new Float32Array(width * height);
  let whole = true, lo = Infinity, hi = -Infinity;
  for (let r0 = 0; r0 < height; r0 += 64) {
    const r1 = Math.min(height, r0 + 64);
    unfilterRows(raw, px, width, bpp, r0, r1);
    for (let i = r0 * width, j = r0 * stride; i < r1 * width; i++, j += bpp) { const v = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768; heights[i] = v; if (px[j + 2]) whole = false; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (pause && r1 < height) await pause();
  }
  return { heights, whole, lo, hi };   // whole: every height a whole metre (the fraction byte is always 0), as in the SRTM and CDEM tiles
}
// PNG's five row filters undone: None, Sub, Up, Average, Paeth.
export function unfilter(raw, width, height, bpp) { const out = new Uint8Array(height * width * bpp); unfilterRows(raw, out, width, bpp, 0, height); return out; }
function unfilterRows(raw, out, width, bpp, from, to) {
  const stride = width * bpp;
  for (let r = from; r < to; r++) {
    const type = raw[r * (stride + 1)], src = r * (stride + 1) + 1, dst = r * stride, up = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? out[dst + i - bpp] : 0, b = r ? out[up + i] : 0, c = r && i >= bpp ? out[up + i - bpp] : 0;
      let v;
      if (type === 0) v = x; else if (type === 1) v = x + a; else if (type === 2) v = x + b; else if (type === 3) v = x + ((a + b) >> 1);
      else if (type === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw new Error('unknown PNG filter');
      out[dst + i] = v & 255;
    }
  }
}

// ---- the map's squares on the ground
// The tile and the pixel inside it (0 to 255) that a place falls on at a zoom.
export function pixelAt(lat, lon, z) {
  const n = 2 ** z, la = Math.max(-85.0511, Math.min(85.0511, lat)) * RAD, fx = ((((lon + 180) % 360) + 360) % 360) / 360 * n, fy = (1 - Math.asinh(Math.tan(la)) / Math.PI) / 2 * n;
  const x = Math.min(n - 1, Math.floor(fx)), y = Math.min(n - 1, Math.floor(fy));
  return { z, x, y, px: Math.min(TILE - 1, Math.floor((fx - x) * TILE)), py: Math.min(TILE - 1, Math.floor((fy - y) * TILE)) };
}
// The true size of one pixel of a row on the WGS84 ground, east–west (gx) and north–south (gy), in metres. row is the row of the 768-row block: 256 is the first row of the tile y.
export function rowSize(z, y, row) {
  const s = 2 * Math.PI * A_WGS84 / (TILE * 2 ** z), Y = y + (row - MID + 0.5) / TILE, phi = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / 2 ** z)));
  const sin = Math.sin(phi), w = 1 - E2 * sin * sin;
  return { gx: s * Math.cos(phi) / Math.sqrt(w), gy: s * (1 - E2) * Math.cos(phi) / w ** 1.5, lat: phi * DEG };
}
export const gridWords = metres => `${metres < 100 ? Math.round(metres) : Math.round(metres / 10) * 10} m grid`;

// ---- a block of heights: the tile and its eight neighbours, 768 × 768 metres, NaN where a tile is missing
// tiles: nine height tiles from the north-west, each a Float32Array or { heights, lo, hi }, or null. scratch: { raw, smooth } buffers to reuse between blocks.
export function makeGrid(tiles, z, y, whole, scratch = null) {
  const raw = scratch?.raw?.length === SIDE * SIDE ? scratch.raw : new Float32Array(SIDE * SIDE), gx = new Float64Array(SIDE), gy = new Float64Array(SIDE);
  let lo = Infinity, hi = -Infinity;
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
    const t = tiles[ty * 3 + tx], h = t?.heights ?? t ?? null;
    if (!h) { for (let r = 0; r < TILE; r++) raw.fill(NaN, (ty * TILE + r) * SIDE + tx * TILE, (ty * TILE + r) * SIDE + tx * TILE + TILE); continue; }
    for (let r = 0; r < TILE; r++) raw.set(h.subarray(r * TILE, r * TILE + TILE), (ty * TILE + r) * SIDE + tx * TILE);
    let a = t?.lo, b = t?.hi;
    if (!Number.isFinite(a) || !Number.isFinite(b)) { a = Infinity; b = -Infinity; for (const v of h) { if (v < a) a = v; if (v > b) b = v; } }
    if (a < lo) lo = a; if (b > hi) hi = b;
  }
  for (let r = 0; r < SIDE; r++) { const s = rowSize(z, y, r); gx[r] = s.gx; gy[r] = s.gy; }
  return { raw, smooth: null, smoothed: -1, spare: scratch?.smooth?.length === SIDE * SIDE ? scratch.smooth : null, pool: scratch?.pool ?? null, gx, gy, whole: !!whole, lo, hi, z, y };
}
// A working array of a block, reused from one block to the next when the engine keeps a pool (no large array is made, and no garbage left, on every tile).
const take = (pool, name, Type, length) => { if (!pool) return new Type(length); let a = pool[name]; if (!(a instanceof Type) || a.length !== length) a = pool[name] = new Type(length); return a; };
// Whole-metre heights cut gentle slopes into steps (one metre on a 27 m grid is 3.7 %), so they are averaged over 3 × 3 pixels first; decimal heights are used as they are.
// Only the square of `margin` pixels round the tile is worked out (in stretches of 32 rows: a generator); the rest keeps the plain heights.
export function* smoothSteps(grid, margin) {
  if (grid.smoothed >= margin) return grid.smooth;
  const src = grid.raw;
  if (!grid.whole) { grid.smooth = src; grid.smoothed = SIDE; return src; }
  let out = grid.smooth && grid.smooth !== src ? grid.smooth : null;
  if (!out) { out = grid.spare ?? new Float32Array(SIDE * SIDE); out.set(src); }
  const from = Math.max(1, MID - margin), to = Math.min(SIDE - 1, MID + TILE + margin);
  for (let r = from; r < to; r++) {
    for (let c = from; c < to; c++) {
      const i = r * SIDE + c; if (src[i] !== src[i]) continue;
      let s = 0, n = 0;
      for (let dr = -SIDE; dr <= SIDE; dr += SIDE) for (let dc = -1; dc <= 1; dc++) { const v = src[i + dr + dc]; if (v === v) { s += v; n++; } }
      out[i] = s / n;
    }
    if ((r - from) % 32 === 31) yield;
  }
  grid.smooth = out; grid.smoothed = margin;
  return out;
}
export function smoothGrid(grid, margin) { const g = smoothSteps(grid, margin); let s; while (!(s = g.next()).done); return grid.smooth; }
// One pixel's smoothed height, worked out on the spot (for the readings at the pin, which need only a few).
const smoothedAt = (grid, r, c) => {
  if (r < 0 || c < 0 || r >= SIDE || c >= SIDE) return NaN;
  const raw = grid.raw, i = r * SIDE + c; if (!grid.whole || raw[i] !== raw[i]) return raw[i];
  let s = 0, n = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= SIDE || cc >= SIDE) continue; const v = raw[rr * SIDE + cc]; if (v === v) { s += v; n++; } }
  return s / n;
};

// ---- slope and the way a slope faces (Horn 1981, the weights Esri documents): dz/dx east and dz/dy south, as rises per metre
export function horn(h, gx, gy, r, c) { const at = hornInto(h, gx, gy, r, c); return { dx: at.dx, dy: at.dy }; }
const HORN = { dx: 0, dy: 0 };   // the loops below read every pixel's slope into this one object, so a tile leaves no garbage behind
function hornInto(h, gx, gy, r, c) {
  const i = r * SIDE + c, a = h[i - SIDE - 1], b = h[i - SIDE], cc = h[i - SIDE + 1], d = h[i - 1], f = h[i + 1], g = h[i + SIDE - 1], hh = h[i + SIDE], ii = h[i + SIDE + 1];
  HORN.dx = ((cc + 2 * f + ii) - (a + 2 * d + g)) / (8 * gx[r]); HORN.dy = ((g + 2 * hh + ii) - (a + 2 * b + cc)) / (8 * gy[r]);
  return HORN;
}
export const slopePercent = (dx, dy) => 100 * Math.hypot(dx, dy);
export const slopeDegrees = (dx, dy) => Math.atan(Math.hypot(dx, dy)) * DEG;
export function aspectOf(dx, dy) {   // Esri's aspect, radians counter-clockwise from east, of the direction the ground falls toward
  if (dx !== 0) { const a = Math.atan2(dy, -dx); return a < 0 ? a + 2 * Math.PI : a; }
  return dy > 0 ? Math.PI / 2 : dy < 0 ? 1.5 * Math.PI : 0;
}
// The light on a slope (Esri's hillshade): 255 for ground that faces the light square on, 0 for ground turned away. azimuth clockwise from north, altitude above the horizon, degrees.
export function hillshade(dx, dy, azimuth = 315, altitude = 45) {
  return Math.max(0, 255 * incidence(dx, dy, azimuth, altitude));
}
export function incidence(dx, dy, azimuth, altitude) {   // cos of the angle between the sun and the ground's own up
  const zen = (90 - altitude) * RAD, az = (((360 - azimuth + 90) % 360) + 360) % 360 * RAD, slope = Math.atan(Math.hypot(dx, dy));
  return Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspectOf(dx, dy));
}

// Slope classes: FAO, Guidelines for soil description (4th edition), Table 7, with its four classes under 2 % joined, because whole-metre heights cannot tell them apart. Colours: a viridis-like ramp, light for gentle, deep for steep; under 2 % is left clear.
const PCT_DEG = p => (Math.atan(p / 100) * DEG).toFixed(1);
export const SLOPE_CLASSES = Object.freeze([
  { upTo: 2, words: 'flat to very gently sloping', range: 'under 2 %', degrees: `0 to ${PCT_DEG(2)}°`, colour: null },
  { upTo: 5, words: 'gently sloping', range: '2 to 5 %', degrees: `${PCT_DEG(2)} to ${PCT_DEG(5)}°`, colour: '#fde725' },
  { upTo: 10, words: 'sloping', range: '5 to 10 %', degrees: `${PCT_DEG(5)} to ${PCT_DEG(10)}°`, colour: '#7ad151' },
  { upTo: 15, words: 'strongly sloping', range: '10 to 15 %', degrees: `${PCT_DEG(10)} to ${PCT_DEG(15)}°`, colour: '#22a884' },
  { upTo: 30, words: 'moderately steep', range: '15 to 30 %', degrees: `${PCT_DEG(15)} to ${PCT_DEG(30)}°`, colour: '#2a788e' },
  { upTo: Infinity, words: 'steep (over 60 %: very steep)', range: 'over 30 %', degrees: `over ${PCT_DEG(30)}°`, colour: '#46327e' },   // FAO's steep (30 to 60 %) and very steep (over 60 %) share one colour; the value at the pin says which
]);
const faoWords = pct => (pct >= 60 ? 'very steep' : pct >= 30 ? 'steep' : SLOPE_CLASSES[slopeClass(pct)].words);
const SLOPE_UP = SLOPE_CLASSES.map(k => k.upTo);
export const slopeClass = pct => { if (pct !== pct) return -1; for (let i = 0; i < SLOPE_UP.length; i++) if (pct < SLOPE_UP[i]) return i; return SLOPE_UP.length - 1; };

// ---- frost pockets: the height against the average height within about 300 m (a topographic position index), on gentle ground only
export const FROST_RADIUS_M = 300, FROST_STEEP = 5;
export const FROST_CLASSES = Object.freeze([
  { words: 'cold air may settle', rule: '2 m or more below the ground within 300 m', below: 2, colour: '#c9b6e4' },
  { words: 'cold air settles more', rule: '5 m or more below the ground within 300 m', below: 5, colour: '#5b2a86' },
]);
export const frostRadius = gx => Math.max(1, Math.round(FROST_RADIUS_M / gx));
export function frostClass(tpi, pct, height) {   // 1: settles more, 0: may settle, −1: nothing drawn (higher ground, a slope of 5 % or more, the sea)
  if (!(height > 0) || !(pct < FROST_STEEP) || tpi !== tpi) return -1;
  return tpi <= -FROST_CLASSES[1].below ? 1 : tpi <= -FROST_CLASSES[0].below ? 0 : -1;
}
// The average of the heights in the (2r + 1)² square round every pixel of the tile, from a summed-area table; pixels without heights are left out of the average. A generator: it yields every 64 rows.
export function* windowMeanSteps(h, r, out, pool = null) {
  const n = TILE + 2 * r, base = MID - r, w = n + 1, sum = take(pool, 'sum', Float64Array, w * w), cnt = take(pool, 'cnt', Float64Array, w * w);   // row 0 and column 0 stay 0: they are never written
  for (let y = 0; y < n; y++) {
    let rs = 0, rc = 0; const row = (base + y) * SIDE + base;
    for (let x = 0; x < n; x++) { const v = h[row + x]; if (v === v) { rs += v; rc++; } sum[(y + 1) * w + x + 1] = sum[y * w + x + 1] + rs; cnt[(y + 1) * w + x + 1] = cnt[y * w + x + 1] + rc; }
    if (y % 64 === 63) yield;
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const y0 = y, x0 = x, y1 = y + 2 * r + 1, x1 = x + 2 * r + 1;
      const s = sum[y1 * w + x1] - sum[y0 * w + x1] - sum[y1 * w + x0] + sum[y0 * w + x0], k = cnt[y1 * w + x1] - cnt[y0 * w + x1] - cnt[y1 * w + x0] + cnt[y0 * w + x0];
      out[y * TILE + x] = k ? s / k : NaN;
    }
    if (y % 64 === 63) yield;
  }
  return out;
}
export function windowMeans(h, r) { const out = new Float32Array(TILE * TILE), g = windowMeanSteps(h, r, out); while (!g.next().done); return out; }
export function windowMeanAt(h, r, row, col) {   // the same average for one pixel of the block
  let s = 0, k = 0;
  for (let y = Math.max(0, row - r); y <= Math.min(SIDE - 1, row + r); y++) for (let x = Math.max(0, col - r); x <= Math.min(SIDE - 1, col + r); x++) { const v = h[y * SIDE + x]; if (v === v) { s += v; k++; } }
  return k ? s / k : NaN;
}
// Dead-level ground: a lake (or a wide flat) is one height across. Level areas larger than half a square kilometre are not judged for frost: marks there would mean nothing.
export const LEVEL_KM2 = 0.5;
export function* levelAreas(raw, gx, gy, out /* Uint8Array(TILE²): 1 = not judged */, pool = null) {
  const from = MID - 128, to = MID + TILE + 128, n = to - from, level = take(pool, 'level', Uint8Array, n * n).fill(0);
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const i = (from + y) * SIDE + from + x, v = raw[i]; if (v !== v) continue;
      if (raw[i - 1] === v && raw[i + 1] === v && raw[i - SIDE] === v && raw[i + SIDE] === v && raw[i - SIDE - 1] === v && raw[i - SIDE + 1] === v && raw[i + SIDE - 1] === v && raw[i + SIDE + 1] === v) level[y * n + x] = 1;
    }
    if (y % 64 === 0) yield;
  }
  // each connected level area gets a number and its size, then the tile's pixels in a large one are marked: no list per area, and a pause every 16,384 pixels
  const need = (LEVEL_KM2 * 1e6) / (gx[MID + 128] * gy[MID + 128]), label = take(pool, 'label', Int32Array, n * n).fill(0), stack = take(pool, 'stack', Int32Array, n * n), sizes = [0];
  let work = 0;
  for (let start = 0; start < level.length; start++) {
    if ((start & 65535) === 65535) yield;
    if (!level[start] || label[start]) continue;
    const id = sizes.length; let top = 0, size = 0; stack[top++] = start; label[start] = id;
    while (top) {
      const p = stack[--top]; size++;
      if ((++work & 16383) === 0) yield;
      const y = (p / n) | 0, x = p - y * n;
      if (x > 0 && level[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < n - 1 && level[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[top++] = p + 1; }
      if (y > 0 && level[p - n] && !label[p - n]) { label[p - n] = id; stack[top++] = p - n; }
      if (y < n - 1 && level[p + n] && !label[p + n]) { label[p + n] = id; stack[top++] = p + n; }
    }
    sizes.push(size);
  }
  for (let y = 0; y < TILE; y++) {
    const row = (y + MID - from) * n + MID - from;
    for (let x = 0; x < TILE; x++) { const l = label[row + x]; out[y * TILE + x] = l && sizes[l] >= need ? 1 : 0; }
    if (y % 64 === 63) yield;
  }
}
export function levelArea(raw, gx, gy) { const out = new Uint8Array(TILE * TILE), g = levelAreas(raw, gx, gy, out); while (!g.next().done); return out; }

// ---- erosion exposure: E = S(slope) × (K / K of loam) × (MFI / 100 mm), a relative index
// S: the RUSLE slope-steepness factor (McCool and others, 1987), θ from the Horn slope.
export const sFactor = frac => { const sin = frac / Math.sqrt(1 + frac * frac); return frac < 0.09 ? 10.8 * sin + 0.03 : 16.8 * sin - 0.5; };
// K: Williams' soil erodibility as printed in the APEX theoretical documentation (equation 115). sand, silt, clay in %, carbon = organic carbon in %.
export function williamsK({ sand, silt, clay, carbon }) {
  const x1 = 0.2 + 0.3 * Math.exp(-0.0256 * sand * (1 - silt / 100));
  const x2 = (silt / (clay + silt)) ** 0.3;
  const x3 = 1 - 0.25 * carbon / (carbon + Math.exp(3.718 - 2.947 * carbon));
  const sn1 = 1 - sand / 100;
  const x5 = 1 - 0.7 * sn1 / (sn1 + Math.exp(-5.509 + 22.899 * sn1));
  return x1 * x2 * x3 * x5;
}
export const K_LOAM = williamsK({ sand: 40, silt: 40, clay: 20, carbon: 1.5 });   // 0.2605: loam with 1.5 % carbon, the 1 of the scale
// The Modified Fournier Index (Arnoldus 1980) from whole years of monthly rain: the sum of each month's average rain squared, over the average yearly rain, in mm.
export function fournier(years) {
  const full = (years ?? []).filter(y => Array.isArray(y.months) && y.months.length === 12 && y.months.every(v => Number.isFinite(v) && v >= 0));
  if (!full.length) return null;
  const mean = Array.from({ length: 12 }, (_, m) => full.reduce((s, y) => s + y.months[m], 0) / full.length), total = mean.reduce((s, v) => s + v, 0);
  return total > 0 ? { mfi: mean.reduce((s, v) => s + v * v, 0) / total, yearly: total, years: full.length, first: Math.min(...full.map(y => y.year)), last: Math.max(...full.map(y => y.year)) } : null;
}
export const erosionFactor = (k, mfi) => (k / K_LOAM) * (mfi / 100);
// The soil of the top 15 cm from an ISRIC SoilGrids point answer (0–5 cm and 5–15 cm, weighted by their depth): sand, silt and clay in % (summed to 100), organic carbon in %. null when SoilGrids has no soil there (water, a town, rock).
export function soilFromSoilGrids(json) {
  const layers = json?.properties?.layers, got = {};
  if (!Array.isArray(layers)) return null;
  for (const name of ['sand', 'silt', 'clay', 'soc']) {
    const layer = layers.find(l => l?.name === name), f = Number(layer?.unit_measure?.d_factor) || 0;
    const part = label => { const v = layer?.depths?.find(d => d?.label === label)?.values?.mean; return typeof v === 'number' && Number.isFinite(v) && f > 0 ? v / f : null; };
    const a = part('0-5cm'), b = part('5-15cm');
    if (a === null || b === null) return null;
    got[name] = (a * 5 + b * 10) / 15;
  }
  const total = got.sand + got.silt + got.clay;
  if (!(total > 50 && total < 150) || !(got.soc >= 0)) return null;
  return { sand: got.sand * 100 / total, silt: got.silt * 100 / total, clay: got.clay * 100 / total, carbon: got.soc / 10 };   // soc comes in g/kg: 10 g/kg is 1 %
}
// The monthly rain of every whole year in a daily record (S of js/data.js: days, year, month, rain): a year counts when each of its months has a reading on at least 80 % of its days, and it has ended.
export function rainYears(S, lastFull) {
  const rows = new Map();
  for (let i = 0; i < (S?.days?.length ?? 0); i++) {
    const y = S.year[i], m = S.month[i] - 1, v = S.rain[i];
    let row = rows.get(y); if (!row) rows.set(y, row = { year: y, sum: Array(12).fill(0), n: Array(12).fill(0) });
    if (Number.isFinite(v)) { row.sum[m] += v; row.n[m]++; }
  }
  return [...rows.values()].filter(r => r.year <= lastFull && r.n.every((n, m) => n >= 0.8 * new Date(Date.UTC(r.year, m + 1, 0)).getUTCDate())).map(r => ({ year: r.year, months: r.sum }));
}
export const EROSION_CLASSES = Object.freeze([
  { upTo: 0.25, words: 'low', range: 'under 0.25', colour: null },
  { upTo: 0.5, words: 'moderate', range: '0.25 to 0.5', colour: '#ecc98a' },
  { upTo: 1, words: 'high', range: '0.5 to 1', colour: '#c27c2c' },
  { upTo: Infinity, words: 'very high', range: 'over 1', colour: '#6f3510' },
]);
const EROSION_UP = EROSION_CLASSES.map(k => k.upTo);
export const erosionClass = e => { if (e !== e) return -1; for (let i = 0; i < EROSION_UP.length; i++) if (e < EROSION_UP[i]) return i; return EROSION_UP.length - 1; };
// The soil in words for the legend: the texture class of the USDA triangle the three fractions fall in.
export function textureWords({ sand, silt, clay }) {
  if (silt + 1.5 * clay < 15) return 'sand';
  if (silt + 2 * clay < 30) return 'loamy sand';
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) return 'sandy loam';
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'loam';
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'silt loam';
  if (silt >= 80 && clay < 12) return 'silt';
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'sandy clay loam';
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'clay loam';
  if (clay >= 27 && clay < 40 && sand <= 20) return 'silty clay loam';
  if (clay >= 35 && sand > 45) return 'sandy clay';
  if (clay >= 40 && silt >= 40) return 'silty clay';
  return 'clay';
}

// ---- the sun's cast shadows: from each pixel, step toward the sun one pixel at a time; shade when the ground ahead rises above the ray
export const SHADE_TOLERANCE_M = 0.5;
export function sunRay(azimuth, apparent) {   // the step toward the sun on the grid (col east, row south) and the ray's rise per metre
  const a = azimuth * RAD, e = Math.sin(a), n = Math.cos(a), big = Math.max(Math.abs(e), Math.abs(n)) || 1;
  return { dc: e / big, dr: -n / big, tan: Math.tan(apparent * RAD), azimuth, apparent };
}
function bilinear(h, r, c) {
  const r0 = Math.floor(r), c0 = Math.floor(c), fr = r - r0, fc = c - c0, i = r0 * SIDE + c0;
  return (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + SIDE] * (1 - fc) + h[i + SIDE + 1] * fc) * fr;
}
// true: in the shade of higher ground; false: in the sun; null: no height here. The ray stops in the sun once it is above the highest ground of the block, or leaves the block.
export function inShade(h, gx, gy, row, col, ray, hi) {
  const h0 = h[row * SIDE + col]; if (h0 !== h0) return null;
  const d = Math.hypot(ray.dc * gx[row], ray.dr * gy[row]);
  for (let k = 1; ; k++) {
    const r = row + k * ray.dr, c = col + k * ray.dc;
    if (r < 0 || c < 0 || r >= SIDE - 1 || c >= SIDE - 1) return false;
    const dist = k * d, top = h0 + dist * ray.tan;
    if (top > hi) return false;
    const v = bilinear(h, r, c);
    if (v === v && v - dist * dist / (2 * R_EARTH) > top + SHADE_TOLERANCE_M) return true;
  }
}
// How far the block reaches toward the sun from the tile's edge, in metres: hills further away than this are not in the shadows.
export const reachMetres = (gx, gy, ray) => TILE * Math.hypot(ray.dc * gx[MID], ray.dr * gy[MID]);

// ---- one computed tile, row by row (a generator: it yields after every row, so a page can do it in small steps); RGBA into out
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const SLOPE_RGB = SLOPE_CLASSES.map(k => (k.colour ? hex(k.colour) : null)), EROSION_RGB = EROSION_CLASSES.map(k => (k.colour ? hex(k.colour) : null)), FROST_RGB = FROST_CLASSES.map(k => hex(k.colour));
export const SHADE_RGB = Object.freeze([31, 42, 61]), SHADE_ALPHA = 0.58, LIT_RGB = Object.freeze([255, 250, 235]), RELIEF_RGB = Object.freeze([20, 20, 20]);   // a dark slate wash; a warm light; the relief's grey
export const RELIEF_LIGHT = Object.freeze({ azimuth: 315, altitude: 45 }), STRONG = 3;
const put = (out, p, rgb, alpha) => { out[p] = rgb[0]; out[p + 1] = rgb[1]; out[p + 2] = rgb[2]; out[p + 3] = Math.round(alpha * 255); };
export function* renderTile(kind, grid, opts, out) {
  out.fill(0);
  const { gx, gy } = grid;
  if (kind === 'slope' || kind === 'erosion') {
    const h = yield* smoothSteps(grid, 2), factor = opts.factor;
    for (let y = 0; y < TILE; y++) {
      const r = MID + y;
      for (let x = 0; x < TILE; x++) {
        const { dx, dy } = hornInto(h, gx, gy, r, MID + x); if (dx !== dx || dy !== dy) continue;
        const pct = slopePercent(dx, dy), p = (y * TILE + x) * 4;
        if (kind === 'slope') { const k = slopeClass(pct); if (k > 0) put(out, p, SLOPE_RGB[k], 1); }
        else { const k = erosionClass(sFactor(pct / 100) * factor); if (k > 0) put(out, p, EROSION_RGB[k], 1); }
      }
      yield;
    }
  } else if (kind === 'relief') {
    const h = yield* smoothSteps(grid, 2), lift = opts.strong ? STRONG : 1, flat = hillshade(0, 0, RELIEF_LIGHT.azimuth, RELIEF_LIGHT.altitude);
    for (let y = 0; y < TILE; y++) {
      const r = MID + y;
      for (let x = 0; x < TILE; x++) {
        const { dx, dy } = hornInto(h, gx, gy, r, MID + x); if (dx !== dx || dy !== dy) continue;
        const dark = Math.min(0.85, Math.max(0, (flat - hillshade(dx * lift, dy * lift, RELIEF_LIGHT.azimuth, RELIEF_LIGHT.altitude)) / flat));
        if (dark > 0.004) put(out, (y * TILE + x) * 4, RELIEF_RGB, dark);
      }
      yield;
    }
  } else if (kind === 'frost') {
    const rad = frostRadius(gx[MID + TILE / 2]), h = yield* smoothSteps(grid, rad + 2), means = take(grid.pool, 'means', Float32Array, TILE * TILE), level = take(grid.pool, 'tileLevel', Uint8Array, TILE * TILE);
    yield* windowMeanSteps(h, rad, means, grid.pool);
    yield* levelAreas(grid.raw, gx, gy, level, grid.pool);
    for (let y = 0; y < TILE; y++) {
      const r = MID + y;
      for (let x = 0; x < TILE; x++) {
        const i = y * TILE + x; if (level[i]) continue;
        const v = h[r * SIDE + MID + x], { dx, dy } = hornInto(h, gx, gy, r, MID + x);
        const k = frostClass(v - means[i], slopePercent(dx, dy), grid.raw[r * SIDE + MID + x]);
        if (k >= 0) put(out, i * 4, FROST_RGB[k], k ? 0.8 : 0.72);
      }
      yield;
    }
  } else if (kind === 'sunshade') {
    const ray = sunRay(opts.azimuth, opts.apparent), h = yield* smoothSteps(grid, 2), raw = grid.raw, flat = Math.max(1e-6, Math.sin(opts.apparent * RAD));
    for (let y = 0; y < TILE; y++) {
      const r = MID + y;
      for (let x = 0; x < TILE; x++) {
        if ((x & 63) === 63) yield;   // a low sun over high hills sends long rays: a quarter row at a time
        const shade = inShade(raw, gx, gy, r, MID + x, ray, grid.hi); if (shade === null) continue;
        const { dx, dy } = hornInto(h, gx, gy, r, MID + x), p = (y * TILE + x) * 4, cos = incidence(dx, dy, opts.azimuth, opts.apparent);
        if (shade || !(cos > 0)) { put(out, p, SHADE_RGB, SHADE_ALPHA); continue; }
        if (cos < flat) put(out, p, SHADE_RGB, 0.42 * Math.min(1, (flat - cos) / flat));
        else if (cos > flat) put(out, p, LIT_RGB, 0.28 * Math.min(1, (cos - flat) / Math.max(1e-6, 1 - flat)));
      }
      yield;
    }
  } else throw new Error(`no such terrain layer: ${kind}`);
  return out;
}

// ---- the readings at one pixel of the block (the pin): its height, slope, frost position, erosion index and sun
export function pointValues(grid, row, col, opts = {}) {
  const { gx, gy, raw } = grid, height = raw[row * SIDE + col];
  if (height !== height) return { ok: false };
  // the smoothed heights of the square round the pixel only: a reading at the pin needs no more
  const rad = frostRadius(gx[row]), R = rad + 1, n = 2 * R + 1, win = new Float32Array(n * n).fill(NaN);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const r = row - R + y, c = col - R + x; if (r >= 0 && c >= 0 && r < SIDE && c < SIDE) win[y * n + x] = smoothedAt(grid, r, c); }
  const at = (dy, dx) => win[(R + dy) * n + R + dx];
  const dx = ((at(-1, 1) + 2 * at(0, 1) + at(1, 1)) - (at(-1, -1) + 2 * at(0, -1) + at(1, -1))) / (8 * gx[row]), dy = ((at(1, -1) + 2 * at(1, 0) + at(1, 1)) - (at(-1, -1) + 2 * at(-1, 0) + at(-1, 1))) / (8 * gy[row]), pct = slopePercent(dx, dy);
  const out = { ok: true, height, whole: grid.whole, slopePct: pct, slopeDeg: slopeDegrees(dx, dy), gx: gx[row], gy: gy[row] };
  let s = 0, k = 0; for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) { const v = at(y, x); if (v === v) { s += v; k++; } }
  out.tpi = at(0, 0) - (k ? s / k : NaN); out.frost = frostClass(out.tpi, pct, height); out.frostRadius = rad;
  if (Number.isFinite(opts.factor)) out.erosion = sFactor(pct / 100) * opts.factor;
  if (opts.sun && opts.sun.apparent > 0) { const ray = sunRay(opts.sun.azimuth, opts.sun.apparent); out.shade = inShade(raw, gx, gy, row, col, ray, grid.hi); out.cos = incidence(dx, dy, opts.sun.azimuth, opts.sun.apparent); }
  if (Array.isArray(opts.path)) {   // the sun every few minutes through one day: minutes of direct sun at the pixel, hills only
    let sun = 0, day = 0;
    for (const s of opts.path) {
      if (!(s.height > 0)) continue;
      day += s.minutes;
      const ray = sunRay(s.azimuth, s.height);
      if (!inShade(raw, gx, gy, row, col, ray, grid.hi) && incidence(dx, dy, s.azimuth, s.height) > 0) sun += s.minutes;
    }
    out.sunMinutes = sun; out.dayMinutes = day;
  }
  return out;
}

// ---- the words
export const TERRAIN_LAYERS = Object.freeze([
  { id: 'slope', plain: 'How steep the ground is.', name: 'Slope', sub: 'SRTM 30 m or finer', minZoom: 9, sharp: true, opacity: 65, here: 'Slope here', zoomIn: 'Zoom in to see slope.' },
  { id: 'erosion', plain: 'Where rain could wash soil away.', name: 'Erosion exposure', sub: 'slope × soil × rain · a relative index', minZoom: 11, sharp: true, opacity: 70, here: 'Erosion exposure here', zoomIn: 'Zoom in to see erosion exposure: the soil and rain are read at your field.' },
  { id: 'frost', plain: 'Low spots where frost comes first.', name: 'Frost pockets', sub: 'low ground where cold air settles', minZoom: 11, sharp: true, opacity: 75, here: 'Frost pockets here', zoomIn: 'Zoom in to see frost pockets: they are smaller than this map’s squares.' },
  { id: 'sunshade', plain: 'Where hills cast shadows.', name: 'Sun and shade', sub: 'hill shadows, any day and hour', minZoom: 11, sharp: false, opacity: 100, here: 'Sun here', zoomIn: 'Zoom in to see sun and shade: from this far out the shadows of the hills are too small to draw.' },
  { id: 'relief', plain: 'The shape of the land.', name: 'Relief shading', sub: 'light from the north-west', minZoom: 9, sharp: false, opacity: 100, here: 'Height here', zoomIn: 'Zoom in to see the relief shading.' },
]);
export const terrainLayer = id => TERRAIN_LAYERS.find(l => l.id === id) ?? null;
export const METHOD = Object.freeze({
  slope: 'Slope by Horn’s method on the true size of each pixel. Classes from FAO’s Guidelines for soil description; its classes under 2 % are joined, because whole-metre heights cannot tell them apart, its steep and very steep classes (30 to 60 % and over 60 %) share one colour, and FAO warns that slopes on almost flat ground are often read too steep.',
  relief: 'Relief shading by the standard hillshade formula, the light from the north-west (315°) and 45° up, on the true heights. Only shade is drawn, so the map under it stays readable.',
  frost: 'Cold air is heavier than warm air: on clear, calm nights it drains downhill and settles in low ground (FAO, Frost protection). Marked: ground at least 2 m below the average height within 300 m, on slopes under 5 %. Large dead-level areas (lakes, wide flats) and the sea are not judged. It is not a temperature measurement or a forecast. Hedges, roads, woods and buildings can hold cold air back or let it drain, and they are not in the heights.',
  erosion: 'A relative index: the RUSLE slope factor (McCool) × the soil’s erodibility by Williams’ equation compared with loam × rain as the Modified Fournier Index compared with 100 mm. 1 is a 9 % slope of loam under moderate rain. It is not tonnes of soil lost. It leaves out slope length, crops, residue, terraces and contour farming. Soil and rain are read at your field; the soil can change across the map.',
  sunshade: 'Shadows of the land’s shape only: the sun’s place from the NOAA solar equations, rays cast toward the sun over the heights with the Earth’s curve and half a metre of leeway. Trees, buildings and clouds are not included.',
});
export const KEYS_WORDS = Object.freeze({
  relief: 'Darker: ground turned away from the north-west light.',
  sunShade: 'In the shade of the hills, or turned away from the sun',
  sunLit: 'In the sun; slopes facing it look lighter',
  notColoured: 'not coloured',
});
export const SAYS = Object.freeze({
  noHeights: 'No heights here: the height tiles did not load. Try again.',
  someMissing: 'No heights for part of the map: some height tiles did not load.',
  none: 'No heights here: Terrain Tiles has no tile for this place.',
  farNorth: 'No heights this far north or south.',
  working: 'Reading the land\u2019s heights…',
  noPin: 'draw your field first',
  pinFirst: 'Draw your field to read its soil and rain.',
  sunDown: 'The sun is down at this hour.',
  polarNight: 'The sun does not rise on this date here.',
  whole: metres => `heights in whole metres, smoothed over about ${Math.round(metres / 10) * 10} m`,
  decimal: 'heights with decimals, used as they are',
  stronger: 'Stronger shading: heights × 3 to show gentle ground; the figures use the true heights.',
});
export function lowSunWords(apparent, reach, relief) {   // when the sun is so low that hills beyond the block could still shade the view
  const needs = relief > 0 && apparent > 0 ? relief / Math.tan(apparent * RAD) : 0;
  return needs > reach ? `The sun is very low: hills more than ${Math.max(1, Math.round(reach / 1000))} km away are not included.` : '';
}
// "Slope here: 4 % (about 2°)": whole percent and whole degrees, never finer than the heights allow; under 2 % says so.
export function slopeHere(v) {
  if (!v?.ok) return null;
  return v.slopePct < 2 ? 'under 2 % (flat to very gently sloping)' : `${Math.round(v.slopePct)} % (about ${Math.max(1, Math.round(v.slopeDeg))}°), ${faoWords(v.slopePct)}`;
}
export function frostHere(v) {   // one sentence about the pin
  if (!v?.ok) return null;
  if (!(v.height > 0)) return 'Not judged here: the heights put this spot at or below sea level.';
  const m = Math.round(Math.abs(v.tpi)), steep = !(v.slopePct < FROST_STEEP);
  if (m < 1) return 'This spot is about level with the ground around it (within 300 m).';
  if (v.tpi < 0) return `This spot is ${m} m below the ground around it (within 300 m)${steep ? ', on a slope of 5 % or more: cold air drains on downhill.' : m >= 2 ? ': cold air can settle here on clear, calm nights.' : '.'}`;
  return `This spot is ${m} m above the ground around it (within 300 m): cold air drains away.`;
}
export const erosionHere = v => (v?.ok && Number.isFinite(v.erosion) ? `${EROSION_CLASSES[erosionClass(v.erosion)].words} (${v.erosion < 0.1 ? 'under 0.1' : v.erosion.toFixed(1)}; slope ${v.slopePct < 2 ? 'under 2' : Math.round(v.slopePct)} %)` : null);
export const heightHere = (v, short) => (v?.ok ? `${Math.round(v.height)} m${short ? ` · ${short}${v.whole ? ', whole metres' : ''}` : ''}` : null);
export function hoursWords(minutes) {   // "6 h 10 min", to the nearest 10 minutes (the sun is followed every 10 minutes)
  const m = Math.round(minutes / 10) * 10, h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
}
export const sunDayWords = v => (v?.ok && Number.isFinite(v.sunMinutes) && v.dayMinutes > 0 ? `Direct sun here: about ${hoursWords(v.sunMinutes)} of the ${hoursWords(v.dayMinutes)} of daylight (hills only)` : null);
