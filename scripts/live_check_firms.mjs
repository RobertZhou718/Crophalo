// By hand, never in the automatic run: asks NASA FIRMS for real for Oxford County (two files of about 7 MB, no login) and prints what the VIIRS satellites saw within 250 km in the last 24 hours.
// Checked by scripts/test_live_firms.mjs (the same contract, offline). Run: node scripts/live_check_firms.mjs
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

const r = await runLookup('firms', ['43.13', '-80.75'], { live: true, limitS: 150 });
contract('firms live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  same('both satellites were read', a.satellites, ['NOAA-20', 'NOAA-21']);
  check('every spot is inside the box and has a time, a confidence and a satellite', a.points.every(p => p.lat >= a.box.s && p.lat <= a.box.n && /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(p.time) && ['low', 'nominal', 'high'].includes(p.confidence) && /^NOAA-2[01]$/.test(p.satellite)), a.points[0]);
  check('the newest detection of the files is less than 12 hours old', Date.now() - Date.parse(a.newest) < 12 * 3600e3, a.newest);
  console.log(JSON.stringify({ count: a.count, by: a.by_confidence, newest: a.newest, first: a.points[0] }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
