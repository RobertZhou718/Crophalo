// By hand, never in the automatic run: asks NASA for real for a field near Mead, Nebraska (about 600 m a side) with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_hlsbox.mjs (the same contract, offline). Run: node scripts/live_check_hlsbox.mjs      Keep its answer as the page's test answer: node scripts/live_check_hlsbox.mjs --keep <file.json>
import fs from 'node:fs';
import os from 'node:os';
import { check, finish, runLookup, contract } from './live_testlib.mjs';

const LAT = '41.1651', LON = '-96.4766';
const RING = [[-96.4802, 41.1624], [-96.4730, 41.1624], [-96.4730, 41.1678], [-96.4802, 41.1678]].map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(';');
const r = await runLookup('hlsbox', [LAT, LON, RING], { live: true, home: os.homedir(), limitS: 150 });
contract('hlsbox live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  const inside = a.cells.filter(c => c.inside).map(c => c.id);
  check('about 18 by 20 squares, most of them wholly inside', a.cells.length >= 300 && a.cells.length <= 500 && inside.length >= 250, [a.cells.length, inside.length]);
  check('every pass has one greenness per cell, each null or a believable NDVI (-0.2 to 1)', a.passes.every(p => p.ndvi.length === a.cells.length && p.ndvi.every(v => v === null || (v >= -0.2 && v <= 1))));
  check('every kept pass is clear over at least 60 % of the inside squares, dated inside the window, oldest first', a.passes.every((p, i) => p.clear_share >= 0.6 && p.date >= a.window.first && p.date <= a.window.last && (i === 0 || a.passes[i - 1].date <= p.date)), a.passes.map(p => [p.date, p.clear_share]));
  check('at least five clear passes in two summers (enough for the page to look for spots)', a.passes.length >= 5, [a.passes.length, a.left_out]);
  check('every period is a kept pass or a named left-out', a.passes.length + a.left_out.length === a.periods, [a.passes.length, a.left_out.length, a.periods]);
  check('within the time limit, under 300 MB', r.seconds < 150 && r.peakMB < 300, [r.seconds, r.peakMB]);
  const flat = a.passes.flatMap(p => inside.map(k => p.ndvi[k]).filter(v => v !== null));
  console.log(JSON.stringify({ cells: a.cells.length, inside: inside.length, passes: a.passes.map(p => `${p.date} ${p.sensor} ${Math.round(p.clear_share * 100)} %`), left_out: a.left_out.map(x => `${x.period[0]} ${x.why}`),
    not_usable: a.not_usable, read_errors: a.read_errors, incomplete: a.incomplete, ndvi_range: [Math.min(...flat), Math.max(...flat)] }));
  const keep = process.argv.indexOf('--keep');
  if (keep > 0 && process.argv[keep + 1]) fs.writeFileSync(process.argv[keep + 1], JSON.stringify({ fixture_note: `Recorded live from NASA HLS v2.0 on ${a.checked.slice(0, 10)} by scripts/live_check_hlsbox.mjs for a field near Mead, Nebraska.`, ask: { lat: +LAT, lon: +LON, ring: RING }, ...a }) + '\n');
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
