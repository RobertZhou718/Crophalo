// By hand, never in the automatic run: asks NASA GIBS for real for Oxford County (about 300 small map tiles, about 80 seconds) and prints the seasons. The greenness record is open: no login is used.
// Checked by scripts/test_live_ndvihist.mjs (the same contract, offline). Run: node scripts/live_check_ndvihist.mjs
import { check, same, finish, runLookup, contract } from './live_testlib.mjs';

const r = await runLookup('ndvihist', ['43.13', '-80.75'], { live: true, limitS: 150 });
contract('ndvihist live', r, { allowMiss: true });
const a = r.answer;
check('NASA answered', a?.ok === true, a);
if (a?.ok) {
  check('at least 20 seasons from 2001 to the last full year, oldest first', a.seasons.length >= 20 && a.seasons[0].year === 2001 && a.seasons.every((s, i) => i === 0 || a.seasons[i - 1].year < s.year), [a.seasons.length, a.seasons[0]?.year]);
  check('every peak is a believable greenness (0.2 to 1) read from at least 3 composites, dated inside its season', a.seasons.every(s => s.peak > 0.2 && s.peak <= 1 && s.n >= 3 && s.peak_date.startsWith(String(s.year)) && +s.peak_date.slice(5, 7) >= 4 && +s.peak_date.slice(5, 7) <= 9), a.seasons.find(s => !(s.peak > 0.2 && s.n >= 3)));
  check('the sentence is made only from the numbers beside it', a.change === null || a.sentence.includes(a.recent.mean.toFixed(2)) || a.change.kind === 'steady', [a.sentence, a.recent, a.change]);
  same('the seasons count matches the answer', a.seasons_read, a.seasons.length);
  console.log(JSON.stringify({ seasons: a.seasons.length, window: a.window, early: a.early, recent: a.recent, change: a.change, sentence: a.sentence, advice: a.advice, browner: a.browner_years, without: a.years_without, partial: a.partial_years, incomplete: a.incomplete }));
}
console.log(`seconds ${r.seconds.toFixed(1)}  peak memory ${r.peakMB} MB  requests ${r.asked}`);
finish();
