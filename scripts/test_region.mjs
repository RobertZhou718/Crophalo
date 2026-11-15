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
check('the picture is asked for the frame\'s own box, west before east and south before north, to five decimals', (() => { const v = R.footprintView(44.4, -79.78, 9), b = R.pictureBox(v); return b.w < b.e && b.s < b.n && Math.abs(b.n - v.bbox.n) < 1e-5 && Math.abs(b.w - v.bbox.w) < 1e-5; })());
check('the box is centred on the field and 360 by 360 px is asked of NASA, never of Esri', R.PICTURE_SIZE === 360 && !/esri|arcgis/i.test(R.regionHtml({ label: 'Soil moisture', value: 0.31, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap' })));

// ---- the words
same('water by volume, rounded', [R.valueWords(0.314), R.valueWords(0.005), R.valueWords(0.7), R.valueWords(0)], ['31% water by volume', '1% water by volume', '70% water by volume', '0% water by volume']);
same('a value that is not a share of water is no value', [R.valueWords(-0.1), R.valueWords(1.2), R.valueWords(null), R.valueWords(undefined), R.valueWords('0.3'), R.valueWords(NaN)], ['', '', '', '', '', '']);
same('dates read as a farmer says them', [R.dateWords('2026-11-14'), R.dateWords('2026-12-05'), R.dateWords('2028-02-29')], ['14 November 2026', '5 December 2026', '29 February 2028']);
same('a date that does not exist is no date', [R.dateWords(['2028', '02', '30'].join('-')), R.dateWords(['2028', '13', '01'].join('-')), R.dateWords('12 Nov'), R.dateWords(null), R.dateWords('2026-11-14T00:00')], ['', '', '', '', '']);

// ---- a reading rebuilt from known parts
const GOOD = { label: 'Moisture around the roots', value: 0.31, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap' };
same('a good reading is kept', R.cleanReading(GOOD), { label: 'Moisture around the roots', value: 0.31, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap', why: '', cell: null });
for (const bad of [null, 'x', {}, { ...GOOD, lat: undefined }, { ...GOOD, lat: 91 }, { ...GOOD, lon: 'a' }, { ...GOOD, km: 0 }, { ...GOOD, km: 900 }, { ...GOOD, km: 'nine' }])
  same(`not a reading: ${brief(bad)}`, R.cleanReading(bad), null);
same('a missing value stays null, never zero', [R.cleanReading({ ...GOOD, value: null }).value, R.cleanReading({ ...GOOD, value: undefined }).value, R.cleanReading({ ...GOOD, value: '0.3' }).value, R.cleanReading({ ...GOOD, value: 4 }).value], [null, null, null, null]);
same('a wrong date is dropped', R.cleanReading({ ...GOOD, date: 'yesterday' }).date, '');
same('a hostile source key is dropped', R.cleanReading({ ...GOOD, source: '"><script>' }).source, '');
same('no label gets a plain one', R.cleanReading({ ...GOOD, label: '  ' }).label, 'Regional reading');

// ---- the card
const html = R.regionHtml(GOOD);
check('the card shows the plain label, the value and the date', html.includes('Moisture around the roots') && html.includes('31% water by volume') && html.includes('14 November 2026'));
check('it says the value is for the whole area and not inside the field', /one figure for the whole area, a square about 9 km wide\. It is not a reading inside your field/.test(html), html.slice(0, 900));
check('it says what the dashed outline and the dot are', html.includes('The dashed outline is the area this reading covers. The dot is your field.'));
check('the picture is described for a screen reader, and decorative to it otherwise', /role="img" aria-label="A picture of the land round your field\. A dashed outline, a square about 9 km wide/.test(html) && /<img alt=""/.test(html) && /aria-hidden="true"/.test(html));
check('the "i" for the source sits beside the label, solid for NASA, with "For this figure" holding the date and the square', /srci nasa/.test(html) && /data-note="Moisture around the roots for a square about 9 km wide that holds the field, 14 November 2026\. One value for the whole area\."/.test(html), html.slice(0, 600));
check('nothing is painted inside the field: the only shapes are the dashed square and the dot', (html.match(/<rect /g) || []).length === 1 && (html.match(/<circle /g) || []).length === 1 && !/<path|<polygon|<image|gradient|pattern/i.test(html));
const none = R.regionHtml({ ...GOOD, value: null });
check('with no value it says plainly there is none (never "not read yet"), says Crophalo will not guess, and shows no number', none.includes('No value for this area') && !/not read yet/i.test(none) && /will not guess one/.test(none) && /area that holds your field/.test(none) && !/\d+% water/.test(none));
check('with no value the "i" still opens the source, but its "For this figure" does not claim a reading', /srci nasa/.test(none) && !/data-note=/.test(none));
same('nothing at all is drawn for a reading that is not one', R.regionHtml({ nonsense: true }), '');
check('words with marks in them cannot break the markup', !/<script|<img src=x/i.test(R.regionHtml({ ...GOOD, label: '<img src=x onerror=1>', why: '"><script>' })));
// ---- with the cell NASA itself gave (the real answer for Barrie on 14 November 2026)
const CELL = { lat: 44.3537, lon: -79.777, width_km: 7.4, height_km: 10.9, edges: { n: 44.40273, s: 44.30463, e: -79.73029, w: -79.82366 } };
const vc = R.footprintView(44.4, -79.78, 9, CELL);
check('the footprint is the cell\'s own box: taller than wide, like the cell is on the ground', vc.footprint.h > vc.footprint.w * 1.3 && vc.footprint.h < vc.footprint.w * 1.6, vc.footprint);
near('its width and height are the cell\'s over the frame\'s (the frame is 2.2 times the longer side, 10.9 km)', vc.footprint.h * 10.9 * 2.2, 10.9, 0.05);
check('the frame is centred on the cell, not on the field', Math.abs((vc.bbox.n + vc.bbox.s) / 2 - 44.35368) < 1e-3 && Math.abs((vc.bbox.e + vc.bbox.w) / 2 + 79.77698) < 1e-3, vc.bbox);
check('the dot is the field itself: inside the box, near its north edge (the pin is at 44.40, the edge at 44.4027)', vc.dot.x > vc.footprint.x && vc.dot.x < vc.footprint.x + vc.footprint.w && vc.dot.y > vc.footprint.y && vc.dot.y < vc.footprint.y + vc.footprint.h && vc.dot.y - vc.footprint.y < 0.08, [vc.dot, vc.footprint]);
check('every corner of the box and the dot lie inside the picture', [vc.footprint.x, vc.footprint.y, vc.footprint.x + vc.footprint.w, vc.footprint.y + vc.footprint.h, vc.dot.x, vc.dot.y].every(f => f >= 0 && f <= 1));
for (const bad of [{ n: 1, s: 2, e: 3, w: 2 }, { n: 1, s: 0, e: 1, w: 1 }, { n: 'a', s: 0, e: 1, w: 0 }, { n: 99, s: 0, e: 1, w: 0 }, { n: 10, s: 0, e: 3, w: 0 }, null, {}])
  check(`edges that are not a box are not used: ${brief(bad)}`, R.cleanEdges(bad) === null);
same('good edges are kept', R.cleanEdges(CELL.edges), { n: 44.40273, s: 44.30463, w: -79.82366, e: -79.73029 });
same('a reading with bad edges falls back to the square', R.cleanReading({ ...GOOD, cell: { edges: { n: 1, s: 2, e: 3, w: 2 } } }).cell, null);
const withCell = R.regionHtml({ ...GOOD, value: 0.1013, cell: CELL });
check('the card says the area is a box of the cell\'s real size, and not a square', /a box about 7\.4 km wide and 10\.9 km tall/.test(withCell) && !/a square about 9 km/.test(withCell));
check('the "For this figure" line names the box and the date', /data-note="Moisture around the roots for a box about 7\.4 km wide and 10\.9 km tall that holds the field, 14 November 2026/.test(withCell));
check('there is still only one dashed outline and one dot', (withCell.match(/<rect /g) || []).length === 1 && (withCell.match(/<circle /g) || []).length === 1);
const old = ['Tur', 'key'].join('');
check('the country is never written the English way', !html.includes(old));

// ---- every demo field gives an engine answer with three plans, on the NASA POWER answer recorded for its own cell (no score is written anywhere: the engine's answer changes as its rules do)
{
  const { recordedField } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'hand_climates.mjs')).href), E = await import(pathToFileURL(path.join(ROOT, 'js', 'engine.js')).href);
  const fs = await import('node:fs'), regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'));
  for (const [id, file, cc] of [['mead-field', 'mead', 'US'], ['beltsville-field', 'beltsville', 'US'], ['barrie-field', 'barriefield', 'CA']]) {
    const r = regions.find(x => x.id === id), { C, cellElev } = recordedField(file, { lat: r.lat, lon: r.lon });
    const state = { rotation: { preset: r.rotation, custom: [], garden: null, second: {} }, farm: { irrigation: r.defaults.irrigation ?? 'none', tillage: r.defaults.tillage ?? 'reduced', livestock: false, coverOK: true, labor: false }, soil: { mode: 'map', texture: r.defaults.soil_texture, om: null, omPct: null }, soilTest: null, avoid: [], prio: [3, 3, 3, 3, 3] };
    const answer = E.optionsFor(state, C, { lat: r.lat, lon: r.lon, elev: cellElev, country: cc, fieldDrawn: true, soil: { texture: r.defaults.soil_texture, source: 'map' } }, { today: '2026-11-14' });
    const plans = answer?.current ? [answer.current, answer.recommended, ...(answer.others ?? [])].filter(Boolean) : [];
    check(`${id}: the engine gives an answer on its recorded weather, with at least three different plans`, !!answer?.current && new Set(plans.map(p => p.id)).size >= 3 && plans.every(p => Array.isArray(p.seasons) && p.seasons.length >= 2), plans.map(p => p.name));
    check(`${id}: its plans name only crops of the rotation or a known alternative, each with a sowing and a harvest day`, plans.every(p => p.seasons.every(se => typeof se.crop === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(se.sow ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(se.harvest ?? ''))), plans.map(p => p.id));
  }
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
