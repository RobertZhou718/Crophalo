// Records, by hand and live, the answers of the height services for one small box (120 m, 9 × 9 points) at each demo place into scripts/fixtures/live/dem-<place>,
// so scripts/test_live_dem.mjs can run with the network replaced. Run once, or for one place:  node scripts/record_live_heights.mjs [barrie|woodstock]
import fs from 'node:fs';
import path from 'node:path';
import { runLookup, FIXTURES } from './live_testlib.mjs';

const PLACES = { barrie: ['44.4000', '-79.7800'], woodstock: ['43.1300', '-80.7500'] };
const only = process.argv[2];
for (const [name, [lat, lon]] of Object.entries(PLACES)) {
  if (only && only !== name) continue;
  const folder = path.join(FIXTURES, 'dem-' + name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const r = await runLookup('dem', [lat, lon, '120', '120', '9', '9'], { live: true, record: folder, limitS: 120 });
  console.log(`${name}: ok ${r.answer?.ok}, ${r.answer?.source ?? r.answer?.reason}, ${r.seconds.toFixed(1)} s, ${r.peakMB} MB, ${r.asked} requests, ${fs.readdirSync(folder).length} files`);
}
