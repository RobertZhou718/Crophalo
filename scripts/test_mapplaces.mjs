// Crophalo's suite for the Places panel's pure parts (js/mapplaces.js): the rows a farmer can choose, the pin and area rows, every sentence, and plain-text escaping of what a place service sends back.
// RULE: never loosen a check here without a written farming reason beside it. A place name from outside is text, never markup, and a service that is down is said plainly, never as an empty list. Run: node scripts/test_mapplaces.mjs
import { resultsHtml, MESSAGES } from '../js/mapplaces.js';
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
check('the service\'s own answer becomes rows with a title, a second line and a place on Earth', placeRows([{ lat: '43.13', lon: '-80.75', name: 'Woodstock', display_name: 'Woodstock, Oxford County, Ontario, Canada', address: { country: 'Canada', country_code: 'ca' } }, { lat: '999', lon: '1', display_name: 'Nowhere' }]).length === 1);
check('coordinates are read before any place name is asked for', !!parseCoords('43.13, -80.75')?.lat && parseCoords('Woodstock') === null);
const BAN = /NaN|undefined|null|\[object|likely|probab|chance|forecast/i;
const words = [MESSAGES.looking, MESSAGES.results, MESSAGES.none('Woodstock'), MESSAGES.down, MESSAGES.coords, MESSAGES.mic];
check('every sentence is plain, short and holds no banned word', words.every(t => typeof t === 'string' && t.length > 8 && t.length < 130 && !BAN.test(t)), words);
check('the "no match" sentence names what was searched and offers coordinates, and cuts a very long query', MESSAGES.none('Woodstock').includes('“Woodstock”') && /coordinates/.test(MESSAGES.none('x')) && MESSAGES.none('a'.repeat(500)).length < 140);
check('a service that is down is said as such, with the way round it', /not answering/.test(MESSAGES.down) && /paste coordinates/.test(MESSAGES.down));
// ---- the demo field: its outline is a real closed ring, its hectares are the ring's own, the centre is inside it
import fs from 'node:fs';
import { regionOutline, regionAt, NEAR_DEG } from '../js/places.js';
import { areaHa } from '../js/geo.js';
const REGIONS = JSON.parse(fs.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8')), FIELD = REGIONS.find(r => r.outline);
const inside = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i][0] > y) !== (ring[j][0] > y) && x < ((ring[j][1] - ring[i][1]) * (y - ring[i][0])) / (ring[j][0] - ring[i][0]) + ring[i][1]) c = !c; return c; };
// The regions file may hold no field outline: then every region opens as it always has, with a pin and no outline.
if (FIELD) {
  check('the data holds a demo field with an outline', /^[a-z0-9-]+$/.test(FIELD.id) && typeof FIELD.name === 'string');
  const corners = regionOutline(FIELD);
  check('its outline reads as corners [lat, lon], one fewer than the closed ring', Array.isArray(corners) && corners.length === FIELD.outline.length - 1 && corners.every(([la, lo]) => Math.abs(la) <= 90 && Math.abs(lo) <= 180), corners?.length);
  check('its hectares are the ring\'s own, to a percent, and the centre is inside it', corners && Math.abs(areaHa(corners) - FIELD.area_ha) / FIELD.area_ha < 0.01 && inside(FIELD.lon, FIELD.lat, corners), corners && areaHa(corners));
  check('a field of this kind is not small and not a farm of thousands of hectares', FIELD.area_ha > 5 && FIELD.area_ha < 500, FIELD.area_ha);
} else {
  check('no region carries an outline, so each opens with its pin alone, as before', REGIONS.every(r => regionOutline(r) === null));
}
same('a closed ring in GeoJSON order [lon, lat] reads back as corners [lat, lon] without the repeated last one', regionOutline({ outline: [[-96.5, 41.1], [-96.4, 41.1], [-96.4, 41.2], [-96.5, 41.2], [-96.5, 41.1]] }), [[41.1, -96.5], [41.1, -96.4], [41.2, -96.4], [41.2, -96.5]]);
check('every entry has an id, a name, a country and a place on Earth, and the ids are one each', REGIONS.every(r => r.id && r.name && r.country && Math.abs(r.lat) <= 90 && Math.abs(r.lon) <= 180) && new Set(REGIONS.map(r => r.id)).size === REGIONS.length);
same('a ring that is not closed, short, or not numbers is no outline', [regionOutline({ outline: [[1, 2], [3, 4], [5, 6], [7, 8]] }), regionOutline({ outline: [[1, 2], [3, 4], [1, 2]] }), regionOutline({ outline: 'x' }), regionOutline({}), regionOutline({ outline: [[1, 'a'], [3, 4], [5, 6], [1, 'a']] })], [null, null, null, null, null]);
check('no Esri or other photograph is named in the data', !/esri|arcgis/i.test(JSON.stringify(REGIONS)));
// the place event finds its region: by id, else by nearness (the pin keeps 4 decimals, the data holds 6)
{ const LIST = [{ id: 'a-field', lat: 41.179469, lon: -96.439756 }, { id: 'b-field', lat: 39.031031, lon: -76.844119 }, { id: 'near', lat: 41.17955, lon: -96.43985 }];
  same('a place rounded to 4 decimals finds the region held to 6', regionAt(LIST, { lat: 41.1795, lon: -96.4398 })?.id, 'a-field');
  same('the id wins, whatever the coordinates', regionAt(LIST, { region: 'b-field', lat: 1, lon: 2 })?.id, 'b-field');
  same('an unknown id finds nothing', regionAt(LIST, { region: 'nope', lat: 41.179469, lon: -96.439756 }), null);
  same('a place a field away finds nothing', regionAt(LIST, { lat: 41.2, lon: -96.4 }), null);
  same('with two within reach the nearer one wins', regionAt(LIST, { lat: 41.17954, lon: -96.43981 })?.id, 'near');
  check('the reach is 0.00006 degrees both ways: 0.00005 finds it, 0.00007 does not', NEAR_DEG === 0.00006 && regionAt(LIST, { lat: 41.179469 + 0.00005, lon: -96.439756 })?.id === 'a-field' && regionAt([LIST[0]], { lat: 41.179469 + 0.00007, lon: -96.439756 }) === null);
  same('bad input finds nothing', [regionAt(null, { lat: 1, lon: 2 }), regionAt(LIST, null), regionAt(LIST, { lat: 'x', lon: 2 })], [null, null, null]); }
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
