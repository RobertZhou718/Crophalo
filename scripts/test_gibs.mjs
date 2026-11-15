// Crophalo's suite for the NASA GIBS layers (js/gibs.js): the real DescribeDomains answers NASA gave on the day they were recorded (scripts/fixtures/gibs), the dates an image exists for, snapping across NASA's own gaps,
// never after yesterday, a step earlier or later, the tile addresses, the legend colours and every sentence. RULE: never loosen a check here without a written farming reason beside it. A map that draws a day NASA has no image for shows nothing and says nothing. Run: node scripts/test_gibs.mjs
import { D, J, domains } from './gibs_fixtures.mjs';
import { LAYERS, layerOf, DOMAINS, tileTemplate, tileUrl, parseDomains, newest, oldest, snap, stepBy, hasDay, addDays, dateWords, legendGradient, legendWords, buttonWords, WORDS } from '../js/gibs.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const real = id => parseDomains(domains(layerOf(id).gibs));
const NDVI = real('ndvi'), SMAP = real('smap'), RAIN = real('rain'), TEMP = real('temp');
const TODAY = D('20261115');   // the day the answers were recorded, one day after the newest of the rain answer

same('the four layers, by name', LAYERS.map(l => l.name), ['Plant greenness', 'Soil moisture', 'Rain rate', 'Land temperature']);
check('every layer names its NASA layer, its tile grid and the deepest zoom that grid has', LAYERS.every(l => /^[A-Za-z0-9_]+$/.test(l.gibs) && /^GoogleMapsCompatible_Level\d$/.test(l.tms) && l.native === +l.tms.slice(-1)));
check('every legend has ten colours, each a plain hex, and words for both ends', LAYERS.every(l => l.stops.length === 10 && l.stops.every(c => /^#[0-9a-f]{6}$/.test(c)) && l.low && l.high && legendGradient(l).startsWith('linear-gradient(90deg, #')));
same('the tile template carries the day and the tile, the way GIBS wants them', tileTemplate(layerOf('ndvi')), 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png');
same('a probe tile is z/y/x of the world', tileUrl(layerOf('smap'), D('20261101'), 1, 0, 0), `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L4_Analyzed_Root_Zone_Soil_Moisture/default/${D('20261101')}/GoogleMapsCompatible_Level6/1/0/0.png`);
check('the DescribeDomains address names the layer and its grid', DOMAINS(layerOf('rain')).includes('LAYER=IMERG_Precipitation_Rate') && DOMAINS(layerOf('rain')).includes('TILEMATRIXSET=GoogleMapsCompatible_Level6') && DOMAINS(layerOf('rain')).includes('REQUEST=DescribeDomains'));

// ---- NASA's real answers
check('the answers are read: several ranges each, the SMAP record has its gaps', NDVI.length >= 4 && SMAP.length >= 14 && RAIN.length >= 5 && TEMP.length >= 8, [NDVI.length, SMAP.length, RAIN.length, TEMP.length]);
same('a range is days with its step', SMAP[0], { from: D('20150331'), to: D('20250706'), every: 1 });
same('the oldest day with an image', [oldest(SMAP), oldest(TEMP)], [D('20150331'), D('20000224')]);
same('the newest day is never after yesterday: the temperature answer runs to today, the picture used is yesterday', newest(TEMP, TODAY), D('20261114'));
same('and where NASA has stopped earlier the newest is the last day it has (soil moisture runs a few days behind)', [newest(SMAP, TODAY), newest(RAIN, TODAY), newest(NDVI, TODAY)], [D('20261110'), D('20261113'), D('20261113')]);
same('a day NASA has no image for snaps to the nearest day it has: soil moisture has a gap of two months in the autumn of that year', [snap(SMAP, D('20251101'), TODAY), snap(SMAP, D('20251201'), TODAY)], [D('20251009'), D('20251212')]);
same('a day that is there stays', snap(SMAP, D('20260317'), TODAY) === D('20260317') || snap(SMAP, D('20260317'), TODAY) === D('20260316') || snap(SMAP, D('20260317'), TODAY) === D('20260318'), true);
same('asked for the nearest before, or the nearest after, across a gap', [snap(SMAP, D('20251101'), TODAY, -1), snap(SMAP, D('20251101'), TODAY, 1)], [D('20251009'), D('20251212')]);
same('a day before the record snaps to its first day, and a day after yesterday to the newest', [snap(SMAP, D('20100101'), TODAY), snap(RAIN, D('20300101'), TODAY)], [D('20150331'), D('20261113')]);
check('a day is available only when a range holds it', hasDay(SMAP, D('20261109')) && !hasDay(SMAP, D('20261111')) && !hasDay(SMAP, D('20251101')));
same('one step earlier, by the layer\'s own step: eight days for greenness', stepBy(NDVI, D('20261113'), -1, layerOf('ndvi').step, TODAY), D('20261105'));
same('one step earlier across a gap lands on the day before it', stepBy(SMAP, D('20251212'), -1, 1, TODAY), D('20251009'));
same('one step later across a gap lands on the day after it', stepBy(SMAP, D('20251009'), 1, 1, TODAY), D('20251212'));
same('no step later from the newest day, and none earlier from the oldest', [stepBy(RAIN, D('20261113'), 1, 1, TODAY), stepBy(SMAP, D('20150331'), -1, 1, TODAY)], [null, null]);
same('no ranges, no day', [newest([], TODAY), snap([], D('20260101'), TODAY), oldest([])], [null, null, null]);

// ---- hostile and odd input
same('an answer with no Domain is no dates, and a service error is no dates', [parseDomains('<ExceptionReport><Exception exceptionCode="InvalidParameterValue"/></ExceptionReport>'), parseDomains('')], [[], []]);
same('a range that is not days, or runs backwards, or is not a date is left out, the good one stays', parseDomains('<Domain>' + [`${D('20260230')}/${D('20260301')}/P1D`, `${D('20260501')}/${D('20260401')}/P1D`, `${D('20260101')}/${D('20261201')}/P1M`, `${D('20260601')}/${D('20260630')}/P1D`].join(',') + '</Domain>'), [{ from: D('20260601'), to: D('20260630'), every: 1 }]);
same('a range with a step of eight days only has every eighth day', [hasDay([{ from: D('20260101'), to: D('20260201'), every: 8 }], D('20260109')), hasDay([{ from: D('20260101'), to: D('20260201'), every: 8 }], D('20260110'))], [true, false]);
same('not a date: no day', [snap(SMAP, 'tomorrow', TODAY), newest(SMAP, 'x'), stepBy(SMAP, 'x', 1, 1, TODAY)], [null, null, null]);
same('a leap day is added to correctly', [addDays(D('20280228'), 1), addDays(D('20270228'), 1)], [D('20280229'), D('20270301')]);

// ---- the words
const BAN = /NaN|undefined|null|\[object|likely|probab|chance|forecast/i;
check('the date words are the farmer\'s: day, month in full, year', dateWords(D('20261105')) === J('5', 'November', '2026') && dateWords('nope') === '');
check('every sentence is plain', [WORDS.down, WORDS.retry, WORDS.empty, WORDS.waiting, WORDS.none, WORDS.snapped(D('20251101'), D('20251009')), ...LAYERS.map(l => l.sub), ...LAYERS.map(l => l.note)].every(t => typeof t === 'string' && !BAN.test(t)));
check('a snapped day says which day was asked and which is shown', WORDS.snapped(D('20251101'), D('20251009')) === `NASA has no image for ${J('1', 'November', '2025')}. Showing ${J('9', 'October', '2025')}, the nearest day it has.`);
check('the "no image" sentence is the one the note gives', WORDS.empty === 'NASA has no image for this part of the map on this date. Try another date or move the map.' && WORDS.down === 'Not available right now: NASA\'s image server did not answer');
same('the legend ends are said in plain words, the temperature in degrees Celsius', [legendWords(layerOf('ndvi')), legendWords(layerOf('temp'))], ['0 · bare to 1.0 · dense crops', '−73 °C to +77 °C']);
same('the Layers button says what is on', [buttonWords([]), buttonWords(['rain']), buttonWords(['rain', 'temp'])], ['Layers', 'Rain rate', '2 layers']);
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
