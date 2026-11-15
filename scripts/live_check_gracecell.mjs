// By hand, never in the automatic run: asks NASA for real for Oxford County with the login this computer already has (the lookup reads it, this file never does) and prints the numbers.
// Checked by scripts/test_live_gracecell.mjs (the same contract, offline). Run: node scripts/live_check_gracecell.mjs
import os from 'node:os';
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

const PIN = [43.13, -80.75];
const r = await runLookup('gracecell', PIN.map(String), { live: true, home: os.homedir(), limitS: 150 });
contract('gracecell live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  const age = (Date.now() - Date.parse(a.newest_date + 'T00:00:00Z')) / 864e5;
  check('the series starts with the first month of the record and has about 290 months in all', a.months[0][0] === '2002-04' && a.months.length > 280 && a.months.length < 400, [a.months[0], a.months.length]);
  check('most months have a value; the rest are null, never 0 (the satellite gap of 2017 and 2018 is among them)', a.months_read > 240 && a.gaps.length === a.months.length - a.months_read && a.gaps.includes('2017-12'), [a.months_read, a.gaps]);
  check('the newest month is recent (NASA publishes about two months behind, so under 150 days old)', age > 0 && age < 150, a.newest_date);
  check('every value is a believable number of centimetres', a.months.every(m => m[1] === null || (m[1] > -200 && m[1] < 200)), a.months.find(m => m[1] !== null && Math.abs(m[1]) >= 200));
  check('the trend is a few centimetres a year at most', typeof a.trend_cm_per_year === 'number' && Math.abs(a.trend_cm_per_year) < 10 && a.trend_years > 20, [a.trend_cm_per_year, a.trend_years]);
  check('the field is inside the cell', a.cell.edges.s <= PIN[0] && PIN[0] < a.cell.edges.n && a.cell.edges.w <= PIN[1] && PIN[1] < a.cell.edges.e, a.cell);
  console.log(JSON.stringify({ data_date: a.data_date, months_read: a.months_read, gaps: a.gaps.length, newest: [a.newest_month, a.newest_date, a.value_cm, a.uncertainty_cm], trend: [a.trend_cm_per_year, a.trend_from, a.trend_to, a.trend_years], merged: a.merged_months, cell: a.cell }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
