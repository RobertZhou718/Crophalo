// Crophalo's suite for the Places panel's pure parts (js/mapplaces.js): the rows a farmer can choose, the pin and area rows, every sentence, and plain-text escaping of what a place service sends back.
// RULE: never loosen a check here without a written farming reason beside it. A place name from outside is text, never markup, and a service that is down is said plainly, never as an empty list. Run: node scripts/test_mapplaces.mjs
import { resultsHtml, pinRow, areaRow, MESSAGES } from '../js/mapplaces.js';
import { placeRows, parseCoords } from '../js/places.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const html = resultsHtml([{ title: 'Woodstock', sub: 'Oxford County, Ontario, Canada', lat: 43.13, lon: -80.75 }, { title: 'Woodstock', sub: '', lat: 41.9, lon: -88.4 }]);
check('each row is one real button that carries its place by number', (html.match(/<button type="button" class="mapx-row" data-go="\d"/g) ?? []).length === 2 && html.includes('data-go="1"'));
check('a row with a second line shows it, a row without shows none', html.includes('<span>Oxford County, Ontario, Canada</span>') && html.split('<li>')[2].indexOf('<span>') === -1);
const bad = resultsHtml([{ title: '<img src=x onerror=alert(1)>', sub: '"><script>x</script>', lat: 1, lon: 1 }]);
check('a place name from the service is text: no tag, no attribute break-out', !/<img|<script/.test(bad) && bad.includes('&lt;img') && bad.includes('&quot;&gt;&lt;script&gt;'), bad);
check('no rows is an empty list, never a made-up place', resultsHtml([]) === '<ul class="mapx-rows"></ul>');
same('the pin row shows the coordinates to five decimals', pinRow({ lat: 43.13, lon: -80.75 }), { title: 'Your pin', sub: '43.13000, -80.75000' });
same('no pin: no row', pinRow(null), null);
same('the area row shows the area in the farmer\'s units', areaRow(12.4, '12.4 ha'), { title: 'Your outlined area', sub: '12.4 ha' });
same('no outline, zero, or not a number: no row', [areaRow(null, ''), areaRow(0, '0 ha'), areaRow(NaN, '')], [null, null, null]);
check('the service\'s own answer becomes rows with a title, a second line and a place on Earth', placeRows([{ lat: '43.13', lon: '-80.75', name: 'Woodstock', display_name: 'Woodstock, Oxford County, Ontario, Canada', address: { country: 'Canada', country_code: 'ca' } }, { lat: '999', lon: '1', display_name: 'Nowhere' }]).length === 1);
check('coordinates are read before any place name is asked for', !!parseCoords('43.13, -80.75')?.lat && parseCoords('Woodstock') === null);
const BAN = /NaN|undefined|null|\[object|likely|probab|chance|forecast/i;
const words = [MESSAGES.looking, MESSAGES.results, MESSAGES.none('Woodstock'), MESSAGES.down, MESSAGES.coords, MESSAGES.mic, MESSAGES.noPin, MESSAGES.noArea];
check('every sentence is plain, short and holds no banned word', words.every(t => typeof t === 'string' && t.length > 8 && t.length < 130 && !BAN.test(t)), words);
check('the "no match" sentence names what was searched and offers coordinates, and cuts a very long query', MESSAGES.none('Woodstock').includes('“Woodstock”') && /coordinates/.test(MESSAGES.none('x')) && MESSAGES.none('a'.repeat(500)).length < 140);
check('a service that is down is said as such, with the way round it', /not answering/.test(MESSAGES.down) && /paste coordinates/.test(MESSAGES.down));
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
