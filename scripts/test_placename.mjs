// Crophalo's place-name suite: the wording of the top line from the place service's answer, the web address, once for one place, at most one request a second, a failure said and asked again, and no coordinates in the name.
// RULE: never loosen a check to make it pass. No network. Run: node scripts/test_placename.mjs
import { nameFromReverse, reverseUrl, loadName, forgetNames, GAP_MS, SETTLE_MS, FINDING, PLACE_UNKNOWN } from '../js/placename.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

same('a town and its province: "Near Barrie, Ontario"', nameFromReverse({ address: { city: 'Barrie', state: 'Ontario', country: 'Canada', country_code: 'ca' } }), 'Near Barrie, Ontario');
same('a village in the United States: the state follows', nameFromReverse({ address: { village: 'Mead', state: 'Nebraska', country: 'United States', country_code: 'us' } }), 'Near Mead, Nebraska');
same('a county when there is no town', nameFromReverse({ address: { county: 'Oxford County', state: 'Ontario', country: 'Canada' } }), 'Near Oxford County, Ontario');
same('a town without a state takes the country', nameFromReverse({ address: { town: 'Polatlı', country: 'Türkiye', country_code: 'tr' } }).startsWith('Near Polatlı, '), true);
same('a region and a country with no town', nameFromReverse({ address: { state: 'Saskatchewan', country: 'Canada' } }), 'Saskatchewan, Canada');
same('only a country', nameFromReverse({ address: { country: 'Canada', country_code: 'ca' } }), 'Canada');
same('nothing to name gives an empty line, never coordinates', [nameFromReverse({}), nameFromReverse(null), nameFromReverse({ address: {} }), nameFromReverse({ address: { house_number: '3' } })], ['', '', '', '']);
check('the name never holds a number with a decimal point', !/\d\.\d/.test(nameFromReverse({ address: { city: 'Barrie', state: 'Ontario' } })));
check('the web address asks for a town-level answer in English with the position to four decimals only', /nominatim\.openstreetmap\.org\/reverse\?/.test(reverseUrl(44.403104, -79.645402)) && /zoom=10/.test(reverseUrl(1, 2)) && /lat=44\.4031&lon=-79\.6454$/.test(reverseUrl(44.403104, -79.645402)) && /accept-language=en/.test(reverseUrl(1, 2)));
check('the words: "Finding the place name" while it is asked, "Your field" when no name could be found', FINDING === 'Finding the place name' && PLACE_UNKNOWN === 'Your field' && GAP_MS >= 1000 && SETTLE_MS >= 1000);

// the lookup
const reply = body => ({ ok: true, status: 200, json: async () => body });
const BARRIE = { address: { city: 'Barrie', state: 'Ontario', country: 'Canada', country_code: 'ca' } };
forgetNames();
let calls = 0, clock = 10_000; const waits = [];
const env = { now: () => clock, wait: async ms => { waits.push(ms); clock += ms; }, fetch: async () => { calls++; return reply(BARRIE); } };
const a = await loadName(44.4031, -79.6454, env), b = await loadName(44.40312, -79.64541, env);
check('a place is asked once: the same field again is not asked, and the answer is the name', calls === 1 && a.ok && a.name === 'Near Barrie, Ontario' && b.name === a.name, brief([calls, a]));
const c = await loadName(43.0, -80.0, env), d = await loadName(42.0, -81.0, env);
check('two different places are never asked within a second of each other', calls === 3 && waits.length >= 1 && waits.every(w => w <= GAP_MS), brief(waits));
forgetNames(); calls = 0;
const bad = await loadName(10, 10, { ...env, fetch: async () => { calls++; return { ok: false, status: 429, json: async () => ({}) }; } });
const again = await loadName(10, 10, { ...env, fetch: async () => { calls++; return reply(BARRIE); } });
check('a failure is said plainly and the place is asked again next time', bad.ok === false && /429/.test(bad.reason) && again.ok && calls === 2, brief([bad, again]));
forgetNames();
const none = await loadName(11, 11, { ...env, fetch: async () => reply({ address: {} }) });
check('an answer with no town is a failure with a reason, not an empty name', none.ok === false && /no town/.test(none.reason), brief(none));
forgetNames();
const thrown = await loadName(12, 12, { ...env, fetch: async () => { throw new Error('offline'); } });
check('no connection is a failure with a reason', thrown.ok === false && /offline/.test(thrown.reason));
console.log(`placename: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
