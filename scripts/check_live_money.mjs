// BY HAND ONLY: one live run of each money lookup, printing seconds, peak memory and the figures a farmer's rough value rests on (Canada: corn, soybeans, winter wheat).
// Run: node scripts/check_live_money.mjs [prices|faostat|both]   Free shared services: do not loop it. Not part of the automatic check; the offline suite is scripts/test_live_crops.mjs.
import path from 'node:path';
import { runLookup, ROOT } from './live_testlib.mjs';
import { roughValue } from '../js/sales.js';

const what = process.argv[2] || 'prices', answers = {};
const cache = path.join(ROOT, '.cache', 'crops-prices', 'fw');
for (const id of what === 'both' ? ['prices', 'faostat'] : [what]) {
  const r = await runLookup(id, [], { live: true, limitS: 420, cache });
  answers[id] = r.answer;
  console.log(`${id}: exit ${r.code}, ${r.seconds.toFixed(2)} s, peak memory ${r.peakMB} MB, ${r.asked} requests sent, ok ${r.answer?.ok}${r.answer?.ok ? '' : ', ' + r.answer?.reason}`);
  if (id === 'prices' && r.answer?.ok) for (const c of ['corn', 'soy', 'wheat']) console.log(`  ${c}: ${r.answer.series[c]?.name} ${r.answer.series[c]?.latest?.month} US$${r.answer.series[c]?.latest?.value} a tonne`);
  if (id === 'faostat' && r.answer?.ok) {
    console.log(`  data ${r.answer.data_date}, rebuilt ${r.answer.rebuilt}, ${Object.keys(r.answer.countries).length} countries`);
    for (const c of ['corn', 'soy', 'wheat']) console.log(`  Canada ${c}: ${JSON.stringify(r.answer.countries.CA?.yield?.[c])}`);
  }
}
if (answers.prices?.ok && answers.faostat?.ok) for (const c of ['corn', 'soy', 'wheat']) console.log(roughValue(c, 'CA', { prices: answers.prices, faostat: answers.faostat }).chip, '·', c);
