// By hand, never in the automatic run: asks NASA for real for Oxford County with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_imergrain.mjs (the same contract, offline). Run: node scripts/live_check_imergrain.mjs
import os from 'node:os';
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

const PIN = [43.13, -80.75];
const r = await runLookup('imergrain', PIN.map(String), { live: true, home: os.homedir(), limitS: 150 });
contract('imergrain live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  same('thirty days listed', a.days.length, 30);
  check('most days were read (a day not published or not read is null, never 0)', a.days_read >= 25, [a.days_read, a.not_published, a.read_errors]);
  check('every value is null or between 0 and 2000 mm', a.days.every(d => d[1] === null || (d[1] >= 0 && d[1] <= 2000)), a.days);
  check('the newest day with a value is within 4 days of today', (Date.now() - Date.parse(a.newest_day + 'T00:00:00Z')) / 864e5 < 4, a.newest_day);
  check('the field is inside the cell', a.cell.edges.s <= PIN[0] && PIN[0] < a.cell.edges.n && a.cell.edges.w <= PIN[1] && PIN[1] < a.cell.edges.e, a.cell);
  console.log(JSON.stringify({ data_date: a.data_date, total_mm: a.total_mm, late: a.late, early: a.early, not_published: a.not_published, read_errors: a.read_errors, cell: a.cell, first: a.days[0], last: a.days[29] }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
