// The suite for the satellite picture of the 3D ground, the parts that need no page: the tiles that cover a block, the zoom, the size of the canvas, the credit and the only layer that is ever asked, a failed tile and an all-failed answer.
// Checked in a page by scripts/e2e_farm3d.mjs. RULE: never loosen a check to make it pass. Run: node scripts/test_picture3d.mjs
import { EOX_TILES, USGS_TILES, USGS_CREDIT, CREDIT, MAX_ZOOM, MIN_ZOOM, MAX_TILES, worldPixel, boundsOf, pictureZoom, tilesFor, pictureSize, loadPicture } from '../js/picture3d.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fail++; console.log(`FAIL  ${name}${detail !== '' ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };

check('only the 2016 layer of the cloudless picture is ever asked (the later years are not for this use), over https, with z/y/x in the order the service wants', /^https:\/\/tiles\.maps\.eox\.at\/wmts\/1\.0\.0\/s2cloudless_3857\/default\/g\/\{z\}\/\{y\}\/\{x\}\.jpg$/.test(EOX_TILES) && !/2018|2019|2020|2021|2022|2023|2024/.test(EOX_TILES));
check('the credit names the picture, EOX IT Services GmbH, the modified Copernicus Sentinel data of 2016 and the licence', CREDIT === 'Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0');
// the world pixel of the middle of the world at zoom 0 is the middle of the one tile
const mid = worldPixel(0, 0, 0); check('latitude 0, longitude 0 is the middle of the world', Math.abs(mid.x - 128) < 1e-9 && Math.abs(mid.y - 128) < 1e-9, mid);
const mead = { lat: 41.1795, lon: -96.4398, width: 1101, depth: 1100 };
const b = boundsOf(mead); check('the block is 1.1 km across: half a kilometre either side of the middle', Math.abs((b.north - b.south) * 110574 - 1100) < 1 && Math.abs((b.east - b.west) * 111320 * Math.cos(41.1795 * Math.PI / 180) - 1101) < 1);
const z = pictureZoom(mead, 1536);
check('a block of 1.1 km on 1536 pixels asks for the finest zoom the service holds', z === MAX_ZOOM, z);
check('a block of 80 km asks for a coarser zoom, never below the lowest', pictureZoom({ ...mead, width: 80000, depth: 80000 }, 1536) < MAX_ZOOM && pictureZoom({ ...mead, width: 5e6, depth: 5e6 }, 1536) >= MIN_ZOOM);
const plan = tilesFor(mead, 14);
check('the tiles are a block of whole tiles at the zoom asked, each with its address in the service\'s order', plan.z === 14 && plan.tiles.length >= 1 && plan.tiles.length <= 9 && plan.tiles.every(t => t.url === EOX_TILES.replace('{z}', 14).replace('{y}', t.y).replace('{x}', t.x)), plan.tiles.length);
check('the block\'s corners fall inside the tiles drawn: north-west before south-east, both inside', plan.nw.x < plan.se.x && plan.nw.y < plan.se.y && plan.nw.x >= plan.tiles[0].x * 256 && plan.se.x <= (plan.tiles.at(-1).x + 1) * 256 + 1e-6 && plan.nw.y >= plan.tiles[0].y * 256 && plan.se.y <= (plan.tiles.at(-1).y + 1) * 256 + 1e-6, [plan.nw, plan.se]);
for (const wd of [1e3, 5e3, 2e4, 1e5]) { const pl = tilesFor({ ...mead, width: wd, depth: wd }, pictureZoom({ ...mead, width: wd, depth: wd }, 1536)); check(`a block ${wd / 1000} km across is never asked for more than ${MAX_TILES} tiles`, pl.tiles.length >= 1 && pl.tiles.length <= MAX_TILES, [pl.z, pl.tiles.length]); }
const huge = tilesFor({ lat: 45, lon: 10, width: 300000, depth: 300000 }, 14);
check('a block that would take more than the limit of tiles is asked at a lower zoom', huge.tiles.length <= MAX_TILES && huge.z < 14, [huge.z, huge.tiles.length]);
const sz = pictureSize({ width: 2000, depth: 1000 }, 1536); check('the canvas keeps the block\'s proportions, its long side the size asked', sz.w === 1536 && sz.h === 768, sz);

// loading: a stand-in canvas that records what is drawn where
const canvasLog = [], makeCanvas = (w, h) => ({ width: w, height: h, getContext: () => ({ fillRect() {}, set fillStyle(v) {}, drawImage: (...a) => canvasLog.push(a.slice(1)) }) });
const calls = [], okFetch = async url => { calls.push(url); return { ok: true, blob: async () => ({ url }) }; };
const res = await loadPicture(mead, { fetchImpl: okFetch, makeCanvas, bitmap: async blob => ({ blob, close() {} }) });
check('where the USGS photo answers every tile, only the photo is asked, each tile once, and only the photo is credited', res.ok && res.complete && res.credit === USGS_CREDIT && res.date === '' && calls.length === res.sources.of && calls.every(u => u.startsWith('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/')) && res.sources.eox === 0, [res.credit, calls.length]);
check('the photo\'s tiles are asked in the order z, y, x', /\/tile\/16\/\d+\/\d+$/.test(calls[0]) && USGS_TILES.endsWith('/tile/{z}/{y}/{x}'), calls[0]);
canvasLog.length = 0; calls.length = 0;
const eoxOnly = await loadPicture(mead, { fetchImpl: async url => { calls.push(url); return /basemap\.nationalmap/.test(url) ? { ok: false, status: 404 } : { ok: true, blob: async () => ({}) }; }, makeCanvas, bitmap: async () => ({ close() {} }) });
check('outside the United States (the photo answers 404 everywhere) the cloudless picture is drawn and credited with its year, and the photo is not credited', eoxOnly.ok && eoxOnly.complete && eoxOnly.credit === CREDIT && eoxOnly.date === '2016' && eoxOnly.sources.usgs === 0 && eoxOnly.sources.eox === eoxOnly.sources.eoxOf, [eoxOnly.credit, eoxOnly.sources]);
check('the tiles are drawn edge to edge: positions run from the corner on, every one with a size', canvasLog.length >= 1 && canvasLog.every(a => a[2] > 0 && a[3] > 0));
let nth = 0; calls.length = 0;
const mixed = await loadPicture(mead, { fetchImpl: async url => { calls.push(url); return /basemap\.nationalmap/.test(url) ? (nth++ === 0 ? { ok: false } : { ok: true, blob: async () => ({}) }) : { ok: true, blob: async () => ({}) }; }, makeCanvas, bitmap: async () => ({ close() {} }) });
check('where the photo misses one tile the cloudless picture is asked too and fills under it; both are credited, the photo first', mixed.ok && mixed.complete && mixed.credits.join('|') === `${USGS_CREDIT}|${CREDIT}` && mixed.sources.usgs === mixed.sources.of - 1 && mixed.sources.eox > 0, mixed.sources);
const none = await loadPicture(mead, { fetchImpl: async () => { throw new Error('offline'); }, makeCanvas, bitmap: async () => ({}) });
check('when no tile of either comes the answer is a failure with one plain sentence, never an empty picture', none.ok === false && /could not be read right now/.test(none.reason), none);
const noCanvas = await loadPicture(mead, { fetchImpl: okFetch });
check('with no canvas to draw on it says so plainly', noCanvas.ok === false && /could not be asked for/.test(noCanvas.reason));
console.log(`picture3d: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
