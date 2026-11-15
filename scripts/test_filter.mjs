// Crophalo's "Change and see" suite (js/filter-view.js), offline: every control is there with its words, one change edits a state the right way, nothing outside the panel's part is touched, the reset puts the answers back.
// RULE: never loosen a check. Run: node scripts/test_filter.mjs
import { filterHTML, apply, pick, differs, WORDS, rainText, tempText } from '../js/filter-view.js';
import { WATER, FEEL, MATTERS, TILLAGE } from '../js/words.m3.js';
import { PRIORITY_SETS } from '../js/state.js';
let pass = 0, fail = 0; const check = (n, ok, d = '') => { ok ? pass++ : (fail++, console.log('FAIL', n, d)); };
const base = () => ({ name: 'Test', loc: { lat: 1, lon: 2 }, farm: { irrigation: 'none', tillage: 'conventional', other: 1 }, soil: { mode: 'assumed', texture: 'loam', om: 'med' }, prio: [3, 3, 3, 3, 3], prioPreset: 'balanced', sc: { rainPct: 0, tempC: 0 } });
const s0 = base(), html = filterHTML(s0, pick(s0), { open: true });
check('the panel is a fold named "Change and see", open when asked', /<details class="rv-filter" id="lfFilter" open>/.test(html) && html.includes(WORDS.title));
check('every water, tillage, soil and matters choice is a radio with its own id', [...WATER.map(x => `ff-water-${x.value}`), ...TILLAGE.map(x => `ff-tillage-${x.value}`), ...FEEL.map(x => `ff-soil-${x.value}`), ...MATTERS.map(x => `ff-matters-${x.value}`)].every(id => html.includes(`id="${id}"`)));
check('the two sliders carry the old ranges (rain -40..30 by 5, warmth 0..4 by 0.5)', /id="ff-rain"[^>]*min="-40" max="30" step="5"/.test(html) && /id="ff-temp"[^>]*min="0" max="4" step="0.5"/.test(html));
check('the answers now are the ones checked; an assumed soil has no feel on', html.includes('id="ff-water-none"') && /id="ff-water-none"[^>]*checked/.test(html) && !/name="ff-soil"[^>]*checked/.test(html));
check('the reset button is off while nothing changed, and the quiet line is there', /id="ffReset"[^>]*disabled/.test(html) && html.includes('Changed here only: your saved answers stay.'));
const closed = filterHTML(s0, pick(s0)); check('closed unless asked (a phone)', !/<details[^>]*open/.test(closed));
const s = base(), b = pick(s);
check('water changes the irrigation only', apply(s, 'water', 'full') && s.farm.irrigation === 'full' && s.farm.tillage === 'conventional' && s.farm.other === 1);
check('tillage changes the tillage', apply(s, 'tillage', 'notill') && s.farm.tillage === 'notill');
check('soil by feel is a manual soil keeping the rest of the soil', apply(s, 'soil', 'clay') && s.soil.mode === 'manual' && s.soil.texture === 'clay' && s.soil.om === 'med');
check('what matters sets the five weights from the preset', apply(s, 'matters', 'income') && JSON.stringify(s.prio) === JSON.stringify(PRIORITY_SETS.income) && s.prioPreset === 'income');
check('the sliders snap to their steps and stay in range', apply(s, 'rain', '-37') && s.sc.rainPct === -35 && apply(s, 'rain', 99) && s.sc.rainPct === 30 && apply(s, 'temp', 1.2) && s.sc.tempC === 1 && apply(s, 'temp', -3) && s.sc.tempC === 0);
check('a value that is not a choice changes nothing', !apply(s, 'water', 'flood') && !apply(s, 'matters', 'nope') && !apply(s, 'colour', 'x') && s.farm.irrigation === 'full');
check('the panel knows the state differs from the answers, and the reset markup turns on', differs(s, b) && !/id="ffReset"[^>]*disabled/.test(filterHTML(s, b)) && !differs(b && base(), b));
check('the words for the sliders', rainText(0) === 'As recorded' && rainText(-20) === '-20% rain' && rainText(10) === '+10% rain' && tempText(1.5) === '+1.5 °C warmer');
check('no state means no panel', filterHTML(null, null) === '');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
