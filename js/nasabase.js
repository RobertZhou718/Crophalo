// Crophalo's satellite picture for the map, all from NASA GIBS: the 30 m Harmonized Landsat Sentinel-2 true colour (HLS S30 and L30) near the ground, NASA's MODIS Terra true colour (250 m) under it and when zoomed out.
// The dates GIBS lists are for the whole world, so a day with a picture listed can still be empty or cloudy at the field: the pick tests one real tile at the field, newest day first, at most six days back. Pure except net.
// Checked by scripts/test_nasabase.mjs (real DescribeDomains answers, the tile maths, the clear / cloudy / empty verdict, the day walk, every sentence) and scripts/e2e_map.mjs (the base group).
import { parseDomains, newest, stepBy, hasDay, dateWords, addDays } from './gibs.js';

export const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const HLS_TMS = 'GoogleMapsCompatible_Level12', TRUE_TMS = 'GoogleMapsCompatible_Level9';
export const HLS_NATIVE = 12, TRUE_NATIVE = 9, HLS_MIN_ZOOM = 9, TRIES = 6, MAX_DAYS = 21;
export const HLS = Object.freeze({
  S30: { key: 'S30', gibs: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance', name: 'Sentinel-2' },
  L30: { key: 'L30', gibs: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance', name: 'Landsat 8 and 9' },
});
export const TRUE = Object.freeze({ gibs: 'MODIS_Terra_CorrectedReflectance_TrueColor', name: 'MODIS Terra' });
export const CREDIT = 'Imagery: NASA GIBS / Worldview';
// The clean base of the Satellite map: cloud-free pictures of the whole world, no date. Far (zoom 0 to 8): NASA's Blue Marble from GIBS. Close (zoom 9 and nearer): Sentinel-2 cloudless 2016 by EOX (CC BY 4.0; the 2016 layer ONLY: the layers of 2017 and later are non-commercial).
export const CLEAR_FAR_MAX = 8, CLEAR_NEAR_MIN = 9, CLEAR_NEAR_NATIVE = 14;
export const BLUE = Object.freeze({ gibs: 'BlueMarble_ShadedRelief_Bathymetry', tms: 'GoogleMapsCompatible_Level8', name: 'NASA Blue Marble' });
export const blueTemplate = `${GIBS}/${BLUE.gibs}/default/${BLUE.tms}/{z}/{y}/{x}.jpeg`;
export const EOX_HOST = 'tiles.maps.eox.at';
export const eoxTemplate = `https://${EOX_HOST}/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg`;
export const CLEAR_CREDIT_FAR = 'Imagery: NASA Blue Marble (NASA GIBS)';
export const CLEAR_CREDIT_NEAR = 'Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0';
// Zoom 13 and nearer in the United States: the US Geological Survey's own aerial photographs (USGS Imagery Only, The National Map: USDA and USGS orthoimagery), a US government product, free and public. Real photographs to zoom 16 (drawn larger beyond);
// outside the United States a tile answers 404 and the Sentinel-2 cloudless tile under it shows in its place, tile by tile. Never a blank tile.
export const AERIAL_MIN_ZOOM = 13, AERIAL_NATIVE = 16, AERIAL_HOST = 'basemap.nationalmap.gov';
export const aerialTemplate = `https://${AERIAL_HOST}/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}`;
export const AERIAL_CREDIT = 'Imagery: USDA, USGS The National Map: Orthoimagery';
export const AERIAL_CREDIT_AND = 'USDA, USGS The National Map: Orthoimagery';
// What the corner names: zoom, and which close-up pictures really show (aerial: 'usgs' | 'both' | 'none').
export const clearCredit = (zoom, aerial = 'none') => (zoom >= AERIAL_MIN_ZOOM && aerial === 'usgs' ? AERIAL_CREDIT : zoom >= AERIAL_MIN_ZOOM && aerial === 'both' ? `${AERIAL_CREDIT}; ${CLEAR_CREDIT_NEAR.replace(/^Imagery: /, '')}` : zoom >= CLEAR_NEAR_MIN ? CLEAR_CREDIT_NEAR : CLEAR_CREDIT_FAR);
export const hlsTemplate = l => `${GIBS}/${l.gibs}/default/{time}/${HLS_TMS}/{z}/{y}/{x}.png`;
export const trueTemplate = `${GIBS}/${TRUE.gibs}/default/{time}/${TRUE_TMS}/{z}/{y}/{x}.jpg`;
export const domainsUrl = (gibs, tms) => `${GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=${gibs}&TILEMATRIXSET=${tms}`;
export const hlsDomainsUrl = l => domainsUrl(l.gibs, HLS_TMS);
export const trueDomainsUrl = () => domainsUrl(TRUE.gibs, TRUE_TMS);

// The tile of a place at a zoom: x from the west, y from the north (Web Mercator). Pure.
export function tileOf(lat, lon, z = HLS_NATIVE) {
  const n = 2 ** z, la = Math.max(-85.0511, Math.min(85.0511, lat)), x = Math.floor(((lon + 180) / 360) * n), y = Math.floor(((1 - Math.asinh(Math.tan((la * Math.PI) / 180)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}
export const hlsTileUrl = (l, day, t) => `${GIBS}/${l.gibs}/default/${day}/${HLS_TMS}/${t.z}/${t.y}/${t.x}.png`;

// What the pixels of a tile say: stats { n, empty, bright } (counts out of n); empty = no picture there (transparent), bright = white or very pale grey with no colour (cloud, snow, haze).
// A tile is clear when under a fifth is empty and under a quarter of what is there is white; empty when over half is missing; otherwise cloudy. Pure.
export function verdict(stats) {
  const n = Math.max(1, stats?.n ?? 0), empty = Math.min(1, (stats?.empty ?? n) / n), shown = Math.max(1, n - (stats?.empty ?? n)), bright = Math.min(1, (stats?.bright ?? 0) / shown);
  const state = empty >= 0.5 ? 'empty' : empty < 0.2 && bright < 0.25 ? 'clear' : 'cloudy';
  return { state, empty: +empty.toFixed(3), bright: +bright.toFixed(3), score: +(empty + bright).toFixed(3) };
}

// Every day either satellite family has a picture listed for, as one list of ranges (the days are global; the field decides). Pure.
export const unionRanges = (...lists) => lists.flat();
// The day before `day` that either has a picture listed, never after yesterday. Pure.
export const dayBefore = (ranges, day, today) => stepBy(ranges, day, -1, 1, today);
export const newestDay = (ranges, today) => newest(ranges, today);

// Choose the picture: starting at `from` (or the newest listed day), look at one real tile at the field for each day, for at most `tries` days. net.look(url) -> { n, empty, bright } or throws.
// Returns { ok: true, day, layer: 'S30' | 'L30', state: 'clear' | 'cloudy', tried } (the first clear one; else the least cloudy one seen), or { ok: false, why }. Pure apart from net.
export async function choose({ ranges, lat, lon, today, net, from = null, tries = TRIES, maxDays = MAX_DAYS }) {
  const tile = tileOf(lat, lon), seen = [], all = unionRanges(ranges.S30 ?? [], ranges.L30 ?? []);
  let day = from ?? newestDay(all, today), days = 0, looked = 0;
  while (day && days < maxDays && looked < tries) {   // a day with no picture over the field costs a few hundred bytes and does not count against the six looks; three weeks is the furthest back
    days++;
    let any = false;
    for (const l of [HLS.S30, HLS.L30]) {
      if (!hasDay(ranges[l.key] ?? [], day)) continue;
      let v;
      try { v = verdict(await net.look(hlsTileUrl(l, day, tile))); } catch { continue; }   // a tile that did not come is not a picture
      if (v.state === 'empty') continue;
      any = true;
      if (v.state === 'clear') return { ok: true, day, layer: l.key, state: 'clear', tried: looked + 1 };
      seen.push({ day, layer: l.key, score: v.score });
    }
    if (any) looked++;
    day = dayBefore(all, day, today);
  }
  if (seen.length) { const best = seen.sort((a, b) => a.score - b.score)[0]; return { ok: true, day: best.day, layer: best.layer, state: 'cloudy', tried: looked }; }
  return { ok: false, why: days ? 'no picture of this place in the last weeks' : 'no day listed' };
}

// The words on the map. Pure.
export const sensorName = key => HLS[key]?.name ?? '';
export const hlsWords = pick => (pick?.ok ? `NASA HLS picture, ${dateWords(pick.day)} (${pick.state === 'cloudy' ? 'partly cloudy, the least cloudy of the last days' : pick.earlier ? 'an earlier clear day' : 'newest clear day'}), 30 m: edges are approximate` : '');
export const trueWords = day => `NASA MODIS picture (250 m), ${dateWords(day)}`;
export const creditWords = (pick, day) => [pick?.ok ? `HLS ${sensorName(pick.layer)} 30 m, ${dateWords(pick.day)}` : '', day ? `MODIS Terra 250 m, ${dateWords(day)}` : ''].filter(Boolean).join('; ');
export const SAYS = Object.freeze({
  picking: 'Looking for the newest clear NASA picture of this place…',
  noHls: 'NASA has no clear 30 m picture of this place in the last weeks, so the coarser MODIS picture shows. Zooming in makes it blurrier.',
  cloudy: 'The newest NASA pictures of this place are cloudy; the least cloudy one shows.',
  noEarlier: 'No earlier clear picture was found in six more days.',
});
export { addDays };

// ---- the browser's part: one tile, read for its pixels (GIBS allows reading its tiles from a page)
export const net = {
  today: () => new Date().toISOString().slice(0, 10),
  text: (url, ms = 9e3) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.text(); }),
  async look(url, ms = 12e3) {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const blob = await r.blob();
    if (blob.size < 1500) return { n: 1, empty: 1, bright: 0 };   // a tile with no picture is a few hundred bytes of nothing
    const bmp = await createImageBitmap(blob), S = 48, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, S, S); bmp.close?.();
    const px = g.getImageData(0, 0, S, S).data; let empty = 0, bright = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 16) { empty++; continue; }
      const lo = Math.min(px[i], px[i + 1], px[i + 2]), hi = Math.max(px[i], px[i + 1], px[i + 2]);
      if (lo > 185 && hi - lo < 45) bright++;
    }
    return { n: S * S, empty, bright };
  },
};
export const rangesOf = async () => {
  const get = url => net.text(url).then(parseDomains, () => []);
  const [S30, L30, TRUE_] = await Promise.all([get(hlsDomainsUrl(HLS.S30)), get(hlsDomainsUrl(HLS.L30)), get(trueDomainsUrl())]);
  return { S30, L30, TRUE: TRUE_ };
};
// Asked once for a place and a day and kept: { key -> promise }
const kept = new Map();
export function pick({ lat, lon, before = null }) {
  const today = net.today(), t = tileOf(lat, lon), key = `${t.x}:${t.y}:${today}:${before ?? ''}`;
  if (kept.has(key)) return kept.get(key);
  const p = rangesOf().then(ranges => {
    const from = before ? dayBefore(unionRanges(ranges.S30, ranges.L30), before, today) : null;
    return before && !from ? { ok: false, why: 'no earlier day listed' } : choose({ ranges, lat, lon, today, net, from });
  }).then(r => ({ ...r, today, earlier: !!before }), () => ({ ok: false, why: 'NASA did not answer', down: true }));
  kept.set(key, p); p.then(r => { if (r.down) kept.delete(key); });
  return p;
}
export const resetPicks = () => kept.clear();
// The newest day MODIS true colour can show: yesterday at the latest (today's is not filled in yet), and not past the end of the list.
export const trueDay = (ranges, today) => newest(ranges ?? [], today);

// ---- a still picture of a box (the home cards, the regional card): a GIBS WMS GetMap address, no key, no account. box: { w, s, e, n } degrees. Pure.
export const WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
export const stillUrl = ({ layer, day, box, width, height, format = 'image/jpeg' }) => {
  const q = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: layer, STYLES: '', CRS: 'EPSG:4326', BBOX: [box.s, box.w, box.n, box.e].map(v => (+v).toFixed(5)).join(','), WIDTH: String(width), HEIGHT: String(height), FORMAT: format, TIME: day });   // WMS 1.3.0 in EPSG:4326 reads latitude first
  return `${WMS}?${q}`;
};
// The picture to show for a place: the newest clear HLS day when there is one (30 m), else MODIS of two days back (250 m), the same day as the map's coarse picture. Returns { url, words, credit, hls }; the page shows `words` beside the picture and `credit` in its credit line.
export async function stillFor({ lat, lon, box, width, height }) {
  const r = await pick({ lat, lon });
  if (r?.ok && r.state === 'clear') return { url: stillUrl({ layer: HLS[r.layer].gibs, day: r.day, box, width, height, format: 'image/png' }), words: hlsWords(r), credit: `${CREDIT}, HLS ${sensorName(r.layer)} 30 m, ${dateWords(r.day)}`, hls: true, day: r.day };
  const day = addDays(net.today(), -2);   // yesterday's MODIS picture is often not made yet and comes back blank: a blank box with a date under it must never be what a farmer sees
  return { url: stillUrl({ layer: TRUE.gibs, day, box, width, height }), words: trueWords(day), credit: `${CREDIT}, MODIS Terra 250 m, ${dateWords(day)}`, hls: false, day };
}
