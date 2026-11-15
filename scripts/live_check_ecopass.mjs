// By hand, never in the automatic run: asks NASA for real for Oxford County with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_ecopass.mjs (the same contract, offline). Run: node scripts/live_check_ecopass.mjs
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

// What each pass held is kept between runs, so a run goes on where the last one stopped: the cache folder is the same every time (LIVE_CACHE names another; delete the folder to start from nothing).
const cache = process.env.LIVE_CACHE || path.join(os.tmpdir(), 'crophalo-live-cache', 'ecopass'); fs.mkdirSync(cache, { recursive: true });
const r = await runLookup('ecopass', ['43.13', '-80.75'], { live: true, home: os.homedir(), limitS: 150, cache });
contract('ecopass live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  check('at least one clear pass in the last 365 days over Oxford', a.passes.length >= 1, a.why_none);
  check('every pass has a believable ground temperature (-50 to 60 C) and a date inside the window', a.passes.every(p => p.lst_c > -50 && p.lst_c < 60 && p.date >= a.window.first && p.date <= a.window.last), a.passes);
  check('passes are newest first, one per orbit', a.passes.every((p, i) => i === 0 || a.passes[i - 1].date >= p.date) && new Set(a.passes.map(p => p.orbit)).size === a.passes.length);
  check('every pass names its local solar time and day or night', a.passes.every(p => /^\d\d:\d\d$/.test(p.solar_time) && ['day', 'night'].includes(p.day_night)), a.passes);
  check('the year is asked for: the window is 365 days long', Math.round((Date.parse(a.window.last) - Date.parse(a.window.first)) / 864e5) === 365, a.window);
  check('the summary counts clear day days and days at 45 C or more, and cites its source', a.summary && Number.isInteger(a.summary.day_clear) && Number.isInteger(a.summary.hot_days) && a.summary.hot_days <= a.summary.day_clear && a.summary.hot_c === 45 && /Crop Science/.test(a.summary.hot_source), a.summary);
  check('the peak memory stays inside the 300 MB rule of the 512 MB host', r.peakMB !== null && r.peakMB < 300, r.peakMB);
  check('the answer says how far down the year it got and whether it is complete', a.coverage && a.coverage.found >= a.coverage.examined && typeof a.coverage.complete === 'boolean', a.coverage);
  console.log(`cache ${cache}: coverage ${JSON.stringify(a.coverage)}  (kept ${a.coverage?.kept}, newly read ${a.coverage?.newly_read})`);
  console.log(JSON.stringify({ summary: a.summary, found: a.passes_found, incomplete: a.incomplete ?? null, clear: a.clear_passes, checked: a.passes_checked, not_usable: a.not_usable, errors: a.read_errors, newest_five: a.passes.slice(0, 5).map(p => [p.date, p.solar_time, p.day_night, p.lst_c, p.error_k, p.version]) }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
