// Crophalo's places suite: the coordinates a farmer types or pastes, the demo-region match, the place rows and the saved-field records.
// RULE: never loosen a check here to make it pass. A failure means a farmer's field would open in the wrong place, or not at all:
// fix the project, not the test. No internet is needed. Run: node scripts/test_places.mjs
import { parseCoords, coordText, spotKey, matchRegions, placeRows, MINUS_MSG } from '../js/places.js';
import { cleanSaved, savedDate } from '../js/saved.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, lat, lon) => check(name, got && !got.reason && Math.abs(got.lat - lat) < 1e-4 && Math.abs(got.lon - lon) < 1e-4, `got ${brief(got)}, wanted ${lat}, ${lon}`);

// ---- coordinates: every way a farmer may write them
near('a decimal pair with a comma', parseCoords('42.03, -93.62'), 42.03, -93.62);
near('a decimal pair with a space', parseCoords('42.03 -93.62'), 42.03, -93.62);
near('a decimal pair with a semicolon', parseCoords('42.03; -93.62'), 42.03, -93.62);
near('whole numbers', parseCoords('44, -80'), 44, -80);
near('degree signs', parseCoords('42.03°, -93.62°'), 42.03, -93.62);
near('letters after the numbers', parseCoords('42.03 N, 93.62 W'), 42.03, -93.62);
near('letters with degree signs', parseCoords('42.03° N 93.62° W'), 42.03, -93.62);
near('letters before the numbers', parseCoords('N 42.03 W 93.62'), 42.03, -93.62);
near('small letters', parseCoords('37.87 n, 32.49 e'), 37.87, 32.49);
near('south and east', parseCoords('33.9 S, 18.4 E'), -33.9, 18.4);
near('longitude written first, the letters say so', parseCoords('93.62 W, 42.03 N'), 42.03, -93.62);
near('a minus that agrees with its letter counts once', parseCoords('-33.9 S, 18.4 E'), -33.9, 18.4);
near('the typographic minus', parseCoords('42.03, −93.62'), 42.03, -93.62);
near('degrees, minutes and seconds', parseCoords('42°01\'48"N 93°37\'12"W'), 42.03, -93.62);
near('degrees, minutes and seconds with spaces and a comma', parseCoords('42° 01\' 48" N, 93° 37\' 12" W'), 42.03, -93.62);
near('degrees and minutes', parseCoords('42°1.8\'N, 93°37.2\'W'), 42.03, -93.62);
near('typographic marks', parseCoords('42°01′48″N 93°37′12″W'), 42.03, -93.62);
near('an OpenStreetMap link', parseCoords('https://www.openstreetmap.org/#map=15/44.4000/-79.7800'), 44.4, -79.78);
near('an OpenStreetMap marker link', parseCoords('https://www.openstreetmap.org/?mlat=44.4&mlon=-79.78#map=12/44.4/-79.78'), 44.4, -79.78);
near('a Google link with a centre', parseCoords('https://www.google.com/maps/@44.4,-79.78,14z'), 44.4, -79.78);
near('a Google link: the pin wins over the centre', parseCoords('https://www.google.com/maps/place/Barrie/@44.3,-79.7,12z/data=!3d44.4!4d-79.78'), 44.4, -79.78);
near('a Google search link', parseCoords('https://maps.google.com/?q=44.4,-79.78'), 44.4, -79.78);
near('the far east edge', parseCoords('0, 180'), 0, 180);

// ---- the minus-sign rule: a minus with North or East is a mistake worth explaining, never guessed around
same('a minus with North is refused with the reason', parseCoords('-42.03 N, 93.62 W'), { reason: MINUS_MSG });
same('a minus with East is refused with the reason', parseCoords('42.03 N, -93.62 E'), { reason: MINUS_MSG });
check('the reason says what to do', /minus sign/.test(MINUS_MSG) && /letter/.test(MINUS_MSG));

// ---- not coordinates: these are place names to search for
for (const text of ['', '  ', 'Barrie, Ontario', 'Konya', '42.03', 'Route 66', '91, 10', '10, 181', '42.03 N, 93.62 N', '42.03 E, 93.62 W', 'N 42.03 N, 93', '42°61\'N, 93°W', '1, 2, 3', 'https://example.org/', 'Barrie 44.4, -79.78'])
  same(`"${text}" is not read as coordinates`, parseCoords(text), null);
same('nothing at all', parseCoords(undefined), null);

// ---- how a spot is written and kept
same('five decimals on the screen', coordText(42.03, -93.62), '42.03000, -93.62000');
same('four decimals name the spot', spotKey(44.40004, -79.78001), '44.4000,-79.7800');

// ---- demo regions
const REGIONS = [{ id: 'barrie', name: 'Barrie & Simcoe County', country: 'Canada', aliases: ['Ontario'] }, { id: 'x', name: 'Konya Plain', country: 'Türkiye' }];
const ids = text => matchRegions(REGIONS, text).map(r => r.id);
same('found by its name', ids('barr'), ['barrie']);
same('found by its country', ids('canada'), ['barrie']);
same('found by another name', ids('Ontario'), ['barrie']);
same('the country is found with or without its dots', [ids('turkiye'), ids('Türk')], [['x'], ['x']]);
same('one letter finds nothing', ids('b'), []);
same('no match', ids('zzz'), []);

// ---- place rows from the search service
const rows = placeRows([
  { lat: '37.8715', lon: '32.4846', name: 'Konya', display_name: 'Konya, Central Anatolia Region, Turkey', address: { country: 'Turkey', country_code: 'tr' } },
  { lat: '44.39', lon: '-79.69', name: '', display_name: 'Barrie, Simcoe County, Ontario, Canada', address: { country: 'Canada', country_code: 'ca' } },
  { lat: 'x', lon: '1', display_name: 'Nowhere' }, null,
]);
same('the country is written Crophalo’s way', rows[0], { title: 'Konya', sub: 'Central Anatolia Region, Türkiye', lat: 37.8715, lon: 32.4846 });
same('a place with no name of its own takes the first part', rows[1], { title: 'Barrie', sub: 'Simcoe County, Ontario, Canada', lat: 44.39, lon: -79.69 });
same('a broken answer gives no row', rows.length, 2);
same('an answer that is not a list gives none', placeRows({ error: 'x' }), []);

// ---- saved fields
const kept = cleanSaved([
  { lat: 44.4, lon: -79.78, name: 'Home field', place: 'Canada', at: 2, summary: 'Our suggestion: keep it.', answers: { size: 10 }, extra: 'dropped' },
  { lat: 44.40001, lon: -79.78001, name: 'The same spot again', at: 1 },
  { lat: 95, lon: 0, name: 'Off the Earth' }, { lat: 'a', lon: 1 }, null, 'text',
  { lat: 1, lon: 2, name: '  ', at: 3, answers: [1] },
]);
same('one record per spot, newest first, known parts only', kept, [
  { key: '1.0000,2.0000', name: 'My field', place: '', lat: 1, lon: 2, at: 3, summary: '', answers: {} },
  { key: '44.4000,-79.7800', name: 'Home field', place: 'Canada', lat: 44.4, lon: -79.78, at: 2, summary: 'Our suggestion: keep it.', answers: { size: 10 } },
]);
same('a value that is not a list saves nothing', [cleanSaved(null), cleanSaved({ a: 1 }), cleanSaved('x')], [[], [], []]);
same('the saved date in words', savedDate(new Date(2026, 10, 14, 12).getTime()), 'Nov 14, 2026');
same('no date, no words', savedDate(0), '');

console.log(`places: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
