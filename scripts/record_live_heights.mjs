// Records, by hand and live, the answers of the height services for one small box at Barrie (120 m, 9 × 9 points) into scripts/fixtures/live/dem-barrie,
// so scripts/test_live_dem.mjs can run with the network replaced. Run once:  node scripts/record_live_heights.mjs
import fs from 'node:fs';
import path from 'node:path';
import { runLookup, FIXTURES } from './live_testlib.mjs';

const folder = path.join(FIXTURES, 'dem-barrie');
fs.rmSync(folder, { recursive: true, force: true });
fs.mkdirSync(folder, { recursive: true });
const r = await runLookup('dem', ['44.4000', '-79.7800', '120', '120', '9', '9'], { live: true, record: folder, limitS: 120 });
console.log(`ok ${r.answer?.ok}, ${r.answer?.source ?? r.answer?.reason}, ${r.seconds.toFixed(1)} s, ${r.peakMB} MB, ${r.asked} requests, ${fs.readdirSync(folder).length} files, ${(fs.readdirSync(folder).reduce((s, f) => s + fs.statSync(path.join(folder, f)).size, 0) / 1024).toFixed(0)} KB`);
