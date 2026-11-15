// The land-height tiles the terrain suites read (scripts/fixtures/terrain): a 5 × 5 block of zoom-12 Terrain Tiles round the Barrie demo field and one tile over Ankara, Türkiye, recorded fresh from the live bucket with the source header each tile came with,
// and ISRIC SoilGrids' answer for the demo pin. Run it with --record to record them again (one request at a time). Read by scripts/test_terrain.mjs (the decoder on real tiles) and scripts/e2e_terrain.mjs (a stand-in for the bucket and for SoilGrids).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'terrain');
export const BUCKET = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium';
export const BARRIE = { lat: 44.4438, lon: -79.6618, z: 12, x: 1141, y: 1482 };   // the demo pin and its zoom-12 tile
export const ANKARA = { z: 12, x: 2421, y: 1551 };
export const BLOCK = (() => { const out = []; for (let y = 1480; y <= 1484; y++) for (let x = 1139; x <= 1143; x++) out.push({ z: 12, x, y }); return out; })();
const key = t => `${t.z}/${t.x}/${t.y}`;
const sourcesFile = path.join(DIR, 'sources.json');

// One recorded tile: { bytes, sources } (the PNG as the bucket sent it and its x-amz-meta-x-imagery-sources header), or null when it was not recorded.
export function recorded(z, x, y) {
  const file = path.join(DIR, String(z), String(x), `${y}.png`);
  if (!fs.existsSync(file)) return null;
  const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));
  return { bytes: fs.readFileSync(file), sources: sources[key({ z, x, y })] ?? '' };
}
export const recordedKeys = () => Object.keys(JSON.parse(fs.readFileSync(sourcesFile, 'utf8')));
// SoilGrids' answer for the demo pin, asked exactly as the map asks it (js/terrain-layers.js): the top two depths, the mean.
export const SOILGRIDS_DEMO = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${BARRIE.lon.toFixed(4)}&lat=${BARRIE.lat.toFixed(4)}&property=sand&property=silt&property=clay&property=soc&depth=0-5cm&depth=5-15cm&value=mean`;
export const soilAnswer = () => JSON.parse(fs.readFileSync(path.join(DIR, 'soilgrids_demo.json'), 'utf8'));

async function recordSoil() {
  const res = await fetch(SOILGRIDS_DEMO, { signal: AbortSignal.timeout(60e3), headers: { 'user-agent': 'terrain-fixture-recorder' } });
  if (!res.ok) throw new Error(`SoilGrids answered ${res.status}`);
  const json = await res.json(); delete json.query_time_s;   // how long the service took that time: not part of the answer
  fs.writeFileSync(path.join(DIR, 'soilgrids_demo.json'), JSON.stringify(json) + '\n');
  console.log(`soilgrids_demo.json  ${json.properties.layers.map(l => l.name).join(', ')}`);
}
async function record() {
  await recordSoil();
  const sources = {};
  for (const t of [...BLOCK, ANKARA]) {
    const res = await fetch(`${BUCKET}/${key(t)}.png`, { signal: AbortSignal.timeout(30e3), headers: { 'user-agent': 'terrain-fixture-recorder' } });
    if (!res.ok) throw new Error(`${key(t)} answered ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer()), file = path.join(DIR, String(t.z), String(t.x), `${t.y}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    sources[key(t)] = res.headers.get('x-amz-meta-x-imagery-sources') ?? '';
    console.log(`${key(t)}  ${bytes.length} bytes  ${sources[key(t)]}`);
  }
  fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 1) + '\n');
}
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) { if (process.argv.includes('--record')) await record(); else if (process.argv.includes('--record-soil')) await recordSoil(); }
