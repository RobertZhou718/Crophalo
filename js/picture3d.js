// The real picture on the ground of the 3D view: the cloud-free satellite picture "Sentinel-2 cloudless 2016" by EOX, stitched from its map tiles to the piece of land the view shows.
// ONLY this 2016 layer is asked for: it is CC BY 4.0. The later years of the same service are for non-commercial use and are never asked. The credit goes with the picture, always.
// The tile arithmetic is pure (tilesFor, pictureZoom); loadPicture() asks the tiles, one request each, and draws them on a canvas that covers the piece of land edge to edge.
// Checked by scripts/test_picture3d.mjs (the tiles for a known block, the zoom, the credit, a failed tile) and scripts/e2e_farm3d.mjs.

// In the United States the U.S. Geological Survey's own aerial photographs (about 1 m, buildings and crop rows crisp) lie under the picture where their tiles answer; the cloudless satellite picture fills every tile that does not.
export const USGS_TILES = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
export const USGS_MAX_ZOOM = 16, USGS_CREDIT = 'USDA, USGS The National Map: Orthoimagery';
export const EOX_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const MAX_ZOOM = 14, MIN_ZOOM = 9, MAX_TILES = 49;   // the service's real detail ends at zoom 14; a piece of land never needs more than seven tiles across
export const CREDIT = 'Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0';
export const PICTURE_YEAR = 2016;

const RAD = Math.PI / 180;
// A place on the world's pixel grid at a zoom (Web Mercator, 256 px tiles): x east, y south.
export function worldPixel(lat, lon, z) {
  const n = 256 * 2 ** z, s = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * RAD);
  return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
// The corners of a block of land (centre lat, lon; width east-west and depth north-south in metres) as latitudes and longitudes.
export function boundsOf(slab) {
  const dLat = slab.depth / 2 / 110574, dLon = slab.width / 2 / (111320 * Math.cos(slab.lat * RAD));
  return { north: slab.lat + dLat, south: slab.lat - dLat, west: slab.lon - dLon, east: slab.lon + dLon };
}
// The zoom at which one picture pixel is no coarser than one pixel of the canvas the land is drawn on (px across), within what the service really holds.
export function pictureZoom(slab, px, max = MAX_ZOOM) {
  const metresPerPx = slab.width / Math.max(1, px), z = Math.ceil(Math.log2(156543.03392 * Math.cos(slab.lat * RAD) / Math.max(0.01, metresPerPx)));
  return Math.max(MIN_ZOOM, Math.min(max, z));
}
// The tiles that cover the block at zoom z, and where the block's corners fall on their pixel grid. A zoom that would take more than MAX_TILES is lowered until it does not.
export function tilesFor(slab, z, template = EOX_TILES) {
  const b = boundsOf(slab);
  for (let zoom = z; zoom >= MIN_ZOOM; zoom--) {
    const nw = worldPixel(b.north, b.west, zoom), se = worldPixel(b.south, b.east, zoom);
    const x0 = Math.floor(nw.x / 256), x1 = Math.floor((se.x - 1e-6) / 256), y0 = Math.floor(nw.y / 256), y1 = Math.floor((se.y - 1e-6) / 256), count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > MAX_TILES && zoom > MIN_ZOOM) continue;
    const tiles = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y, url: template.replace('{z}', zoom).replace('{y}', y).replace('{x}', x) });
    return { z: zoom, nw, se, tiles };
  }
  return { z, nw: { x: 0, y: 0 }, se: { x: 1, y: 1 }, tiles: [] };
}
// The size of the canvas the picture is drawn on: the block's own proportions, the long side at most `longest` pixels.
export const pictureSize = (slab, longest = 1536) => { const k = longest / Math.max(slab.width, slab.depth); return { w: Math.max(2, Math.round(slab.width * k)), h: Math.max(2, Math.round(slab.depth * k)) }; };

// Ask the tiles and draw them. env: { fetchImpl, makeCanvas(w, h), bitmap(blob) -> ImageBitmap, signal }.
// The USGS photo tiles are asked first; the cloudless picture is asked only when some of the land has no photo, and is drawn under the photo, so each square of the ground shows the sharpest picture that really answered.
// Answers { ok: true, canvas, z, complete, credit, credits, date, sources: { usgs, eox, of, eoxOf } } (a source that drew nothing is not credited; complete is false when some land has no picture at all), or { ok: false, reason }.
export async function loadPicture(slab, { fetchImpl = globalThis.fetch, makeCanvas, bitmap = blob => createImageBitmap(blob), longest = 1536, signal } = {}) {
  const { w, h } = pictureSize(slab, longest);
  if (typeof makeCanvas !== 'function') return { ok: false, reason: 'The satellite picture could not be asked for.' };
  const canvas = makeCanvas(w, h), g = canvas.getContext('2d');
  const lay = async (plan, order) => {   // draws what comes; answers how many came
    const sx = w / (plan.se.x - plan.nw.x), sy = h / (plan.se.y - plan.nw.y); let ok = 0;
    await Promise.all(plan.tiles.map(async t => {
      try {
        const res = await fetchImpl(t.url, { signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) return;
        const img = await bitmap(await res.blob());
        g.globalCompositeOperation = order; g.drawImage(img, (t.x * 256 - plan.nw.x) * sx, (t.y * 256 - plan.nw.y) * sy, 256 * sx + 0.6, 256 * sy + 0.6); img.close?.(); ok++;
      } catch { /* this tile did not come */ }
    }));
    return ok;
  };
  const photo = tilesFor(slab, pictureZoom(slab, w, USGS_MAX_ZOOM), USGS_TILES), usgs = photo.tiles.length ? await lay(photo, 'source-over') : 0;
  let eox = 0, plan = { z: 0, tiles: [] };
  if (usgs < photo.tiles.length || !usgs) { plan = tilesFor(slab, pictureZoom(slab, w), EOX_TILES); eox = plan.tiles.length ? await lay(plan, 'destination-over') : 0; }   // under the photo: only where the photo has nothing
  if (!usgs && !eox) return { ok: false, reason: 'The satellite picture of this place could not be read right now.' };
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#6d7a5a'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';   // under any tile that never came: a plain land colour, never a pattern made up
  const credits = [usgs ? USGS_CREDIT : '', eox ? CREDIT : ''].filter(Boolean), complete = usgs === photo.tiles.length || (plan.tiles.length > 0 && eox === plan.tiles.length);
  return { ok: true, canvas, z: usgs ? photo.z : plan.z, complete, credit: credits.join(' · '), credits, date: eox ? String(PICTURE_YEAR) : '', sources: { usgs, eox, of: photo.tiles.length, eoxOf: plan.tiles.length } };
}
