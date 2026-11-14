// Crophalo's offline suite for the regional reading (js/region.js): the footprint maths, the words, a missing value that stays "not read yet", hostile input.
// RULE: never loosen a check here without a written farming reason beside it. A regional value drawn as a pattern inside a field, or a sample number, would tell a farmer something nobody measured. Run: node scripts/test_region.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const R = await import(pathToFileURL(path.join(ROOT, 'js', 'region.js')).href);

// ---- the footprint
const v = R.footprintView(44.4, -79.78, 9);
near('the frame is 2.2 times as wide as the footprint: 19.8 km from top to bottom', (v.bbox.n - v.bbox.s) * 111.195, 19.8, 0.05);
near('and as wide on the ground (the degrees of longitude are shorter at 44 degrees north)', (v.bbox.e - v.bbox.w) * 111.195 * Math.cos(44.4 * Math.PI / 180), 19.8, 0.05);
near('the footprint is 9 km of the 19.8 km frame', v.footprint.w * 19.8, 9, 0.01);
same('and sits in the middle, with the field dot at the centre', [v.footprint.x + v.footprint.w / 2, v.footprint.y + v.footprint.h / 2, v.dot], [0.5, 0.5, { x: 0.5, y: 0.5 }]);
near('the frame is centred on the field', (v.bbox.n + v.bbox.s) / 2, 44.4, 1e-9); near('both ways', (v.bbox.e + v.bbox.w) / 2, -79.78, 1e-9);
check('a field near the pole keeps the frame on the map', R.footprintView(84.9, 10, 9).bbox.n <= 85);
check('the picture is asked for as 360 by 360 px from the satellite photo service', /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/export\?bbox=-?\d+\.\d{4},-?\d+\.\d{4},-?\d+\.\d{4},-?\d+\.\d{4}&bboxSR=4326&imageSR=3857&size=360,360&format=jpg&f=image$/.test(R.pictureUrl(v)), R.pictureUrl(v));

// ---- the words
same('water by volume, rounded', [R.valueWords(0.314), R.valueWords(0.005), R.valueWords(0.7), R.valueWords(0)], ['31% water by volume', '1% water by volume', '70% water by volume', '0% water by volume']);
same('a value that is not a share of water is no value', [R.valueWords(-0.1), R.valueWords(1.2), R.valueWords(null), R.valueWords(undefined), R.valueWords('0.3'), R.valueWords(NaN)], ['', '', '', '', '', '']);
same('dates read as a farmer says them', [R.dateWords('2026-11-14'), R.dateWords('2026-12-05'), R.dateWords('2028-02-29')], ['14 November 2026', '5 December 2026', '29 February 2028']);
same('a date that does not exist is no date', [R.dateWords(['2028', '02', '30'].join('-')), R.dateWords(['2028', '13', '01'].join('-')), R.dateWords('12 Nov'), R.dateWords(null), R.dateWords('2026-11-14T00:00')], ['', '', '', '', '']);

// ---- a reading rebuilt from known parts
const GOOD = { label: 'Moisture around the roots', value: 0.31, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap' };
same('a good reading is kept', R.cleanReading(GOOD), { label: 'Moisture around the roots', value: 0.31, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap', why: '' });
for (const bad of [null, 'x', {}, { ...GOOD, lat: undefined }, { ...GOOD, lat: 91 }, { ...GOOD, lon: 'a' }, { ...GOOD, km: 0 }, { ...GOOD, km: 900 }, { ...GOOD, km: 'nine' }])
  same(`not a reading: ${brief(bad)}`, R.cleanReading(bad), null);
same('a missing value stays null, never zero', [R.cleanReading({ ...GOOD, value: null }).value, R.cleanReading({ ...GOOD, value: undefined }).value, R.cleanReading({ ...GOOD, value: '0.3' }).value, R.cleanReading({ ...GOOD, value: 4 }).value], [null, null, null, null]);
same('a wrong date is dropped', R.cleanReading({ ...GOOD, date: 'yesterday' }).date, '');
same('a hostile source key is dropped', R.cleanReading({ ...GOOD, source: '"><script>' }).source, '');
same('no label gets a plain one', R.cleanReading({ ...GOOD, label: '  ' }).label, 'Regional reading');

// ---- the card
const html = R.regionHtml(GOOD);
check('the card shows the plain label, the value and the date', html.includes('Moisture around the roots') && html.includes('31% water by volume') && html.includes('14 November 2026'));
check('it says the value is for the whole square and not inside the field', /one figure for the whole square, about 9 km wide\. It is not a reading inside your field/.test(html));
check('it says what the dashed square and the dot are', html.includes('The dashed square is the area this reading covers. The dot is your field.'));
check('the picture is described for a screen reader, and decorative to it otherwise', /role="img" aria-label="A picture of the land round your field\. A dashed square about 9 km wide/.test(html) && /<img alt=""/.test(html) && /aria-hidden="true"/.test(html));
check('the "i" for the source sits beside the label, solid for NASA, with "For this figure" holding the date and the square', /srci nasa/.test(html) && /data-note="Moisture around the roots for the square about 9 km wide round the field, 14 November 2026\. One value for the whole square\."/.test(html), html.slice(0, 600));
check('nothing is painted inside the field: the only shapes are the dashed square and the dot', (html.match(/<rect /g) || []).length === 1 && (html.match(/<circle /g) || []).length === 1 && !/<path|<polygon|<image|gradient|pattern/i.test(html));
const none = R.regionHtml({ ...GOOD, value: null });
check('with no value it says "Not read yet", says Crophalo will not guess, and shows no number', none.includes('Not read yet') && /will not guess one/.test(none) && !/\d+% water/.test(none));
check('with no value the "i" still opens the source, but its "For this figure" does not claim a reading', /srci nasa/.test(none) && !/data-note=/.test(none));
same('nothing at all is drawn for a reading that is not one', R.regionHtml({ nonsense: true }), '');
check('words with marks in them cannot break the markup', !/<script|<img src=x/i.test(R.regionHtml({ ...GOOD, label: '<img src=x onerror=1>', why: '"><script>' })));
const old = ['Tur', 'key'].join('');
check('the country is never written the English way', !html.includes(old));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
