// Crophalo's satellite card frame suite: every card is one closed line and opens to what the farmer gets first, at most four short sentences, a closed "Show more" and one source link; no card says "not read yet" or shows a program word.
// RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_satcard.mjs
import { satCard, satWaiting, satPlain, sentences, fit, MAX_SENTENCES } from '../js/satcard.js';
import { satellitesHTML } from '../js/satellites-view.js';
let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) pass++; else { fail++; console.log(`FAIL  ${name}${got === undefined ? '' : `  (${String(typeof got === 'string' ? got : JSON.stringify(got)).slice(0, 220)})`}`); } };

check('sentences split at a full stop and a capital, not inside a number', JSON.stringify(sentences(['The value is 0.62 today. It rose. Fine'])) === JSON.stringify(['The value is 0.62 today.', 'It rose.', 'Fine']));
{ const f = fit(['One. Two. Three.', 'Four. Five.', 'Six.']); check('at most four sentences show, the rest wait under Show more', f.shown.length === MAX_SENTENCES && f.rest.length === 2, f); }
{ const h = satCard({ id: 'x', name: 'How wet the soil is around your field', one: '31% water by volume, 12 Nov', first: '31% water by volume', lines: ['A. B. C. D. E.'], more: '<p>instrument</p>', source: 'smap' });
  check('closed form: the name and one figure sit in the summary of a closed details', /<details class="fold sat-fold"><summary><h3 class="sat-name">How wet the soil is around your field<\/h3><span class="sat-one">31% water by volume, 12 Nov<\/span><\/summary>/.test(h));
  check('the first thing the farmer gets is the big line, and only four sentences show', h.includes('sat-first') && (h.split('Show more')[0].match(/<p class="cap">/g) ?? []).length === 4, h);
  check('the fifth sentence and the instrument are under Show more', /Show more<\/summary><p class="cap">E\.<\/p><p>instrument<\/p>/.test(h));
  check('exactly one link, to the source\'s own website, opening in a new tab', (h.match(/<a /g) ?? []).length === 1 && /href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer"/.test(h)); }
check('a loading card is open with one polite line', /<details class="fold sat-fold" open>/.test(satWaiting({ id: 'x', name: 'N', line: 'Reading…' })) && /role="status"/.test(satWaiting({ id: 'x', name: 'N', line: 'Reading…' })));
check('a card with nothing says its one plain line', /No value yet/.test(satPlain({ id: 'x', name: 'N', line: 'No clear photo. Try later.' })));
{ const all = satellitesHTML({});
  check('no card says "not read yet" or "not built yet"', !/not read yet|not built yet/i.test(all));
  check('no card shows a program word', !/\b(undefined|null|NaN|traceback|exception|api\/|\.py|JSON)\b/.test(all.replace(/<[^>]+>/g, ' ')), all.replace(/<[^>]+>/g, ' ').slice(0, 200));
  check('the soil moisture card exists once', (all.match(/data-card="smap"/g) ?? []).length === 1); }
console.log(`satcard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
