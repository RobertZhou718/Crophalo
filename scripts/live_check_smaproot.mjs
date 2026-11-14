// By hand, never in the automatic run: asks NASA for real for Barrie with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_smaproot.mjs (the same contract, offline). Run: node scripts/live_check_smaproot.mjs
import os from 'node:os';
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

const PIN = [44.4, -79.78];
const r = await runLookup('smaproot', PIN, { live: true, home: os.homedir(), limitS: 150 });
contract('smaproot live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered with a value', a?.ok === true, a);
if (a?.ok) {
  const age = (Date.now() - Date.parse(a.date + 'T00:00:00Z')) / 864e5;
  check('the value is a share of the soil\'s volume', a.value > 0 && a.value < 0.9, a.value);
  check('the date is recent (NASA publishes a few days after the day, so under 12 days old)', age >= 0 && age < 12, a.date);
  check('the field is inside the cell\'s edges', a.cell.edges.s < PIN[0] && PIN[0] <= a.cell.edges.n && a.cell.edges.w < PIN[1] && PIN[1] < a.cell.edges.e, a.cell);
  check('the cell is between 5 and 14 km on each side at this latitude', [a.cell.width_km, a.cell.height_km].every(v => v > 5 && v < 14), [a.cell.width_km, a.cell.height_km]);
  same('three requests were sent', r.asked, 3);
  console.log(JSON.stringify({ value: a.value, date: a.date, cell: a.cell, granule: a.granule, window: a.window, age_days: a.age_days }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
