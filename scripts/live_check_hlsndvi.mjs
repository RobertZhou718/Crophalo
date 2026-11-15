// By hand, never in the automatic run: asks NASA for real for Oxford County with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_hlsndvi.mjs (the same contract, offline). Run: node scripts/live_check_hlsndvi.mjs
import os from 'node:os';
import { check, finish, runLookup, contract } from './live_testlib.mjs';

const r = await runLookup('hlsndvi', ['43.13', '-80.75'], { live: true, home: os.homedir(), limitS: 150 });
contract('hlsndvi live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  check('at least ten clear periods in twelve months (summer is clear often enough)', a.passes.length >= 10, [a.passes.length, a.gaps.length, a.not_usable]);
  check('every greenness is a believable NDVI (-0.2 to 1) from at least 5 of 9 clear dots, dated inside the window', a.passes.every(p => p.ndvi >= -0.2 && p.ndvi <= 1 && p.clear_pixels >= 5 && p.clear_pixels <= 9 && p.date >= a.window.first && p.date <= a.window.last), a.passes);
  check('passes are oldest first, one per date and satellite', a.passes.every((p, i) => i === 0 || a.passes[i - 1].date <= p.date) && new Set(a.passes.map(p => p.date + p.sensor)).size === a.passes.length);
  console.log(JSON.stringify({ read: a.passes.length, periods: a.periods, gaps: a.gaps.length, not_usable: a.not_usable, errors: a.read_errors, skipped: a.skipped_periods.length, incomplete: a.incomplete, newest: [a.newest_date, a.newest_ndvi], range: [Math.min(...a.passes.map(p => p.ndvi)), Math.max(...a.passes.map(p => p.ndvi))] }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
