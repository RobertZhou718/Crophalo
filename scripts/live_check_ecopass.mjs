// By hand, never in the automatic run: asks NASA for real for Oxford County with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_ecopass.mjs (the same contract, offline). Run: node scripts/live_check_ecopass.mjs
import os from 'node:os';
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

const r = await runLookup('ecopass', ['43.13', '-80.75'], { live: true, home: os.homedir(), limitS: 150 });
contract('ecopass live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  check('at least one clear pass in 60 days over Oxford', a.passes.length >= 1, a.why_none);
  check('every pass has a believable ground temperature (-50 to 60 C) and a date inside the window', a.passes.every(p => p.lst_c > -50 && p.lst_c < 60 && p.date >= a.window.first && p.date <= a.window.last), a.passes);
  check('passes are newest first, one per orbit', a.passes.every((p, i) => i === 0 || a.passes[i - 1].date >= p.date) && new Set(a.passes.map(p => p.orbit)).size === a.passes.length);
  check('every pass names its local solar time and day or night', a.passes.every(p => /^\d\d:\d\d$/.test(p.solar_time) && ['day', 'night'].includes(p.day_night)), a.passes);
  console.log(JSON.stringify({ clear: a.clear_passes, checked: a.passes_checked, not_usable: a.not_usable, errors: a.read_errors, passes: a.passes.map(p => [p.date, p.solar_time, p.day_night, p.lst_c, p.error_k, p.version]) }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
