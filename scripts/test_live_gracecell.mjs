// Crophalo's offline suite for the stored-water lookup (scripts/live/gracecell.py): NASA's catalogue and token service are replaced by hand-made answers, and the 46 MB GRACE-FO file by a SMALL file
// built the real way (same names, same chunking, same units; made by h5py for each case) and served in the same 256 KB pieces. No internet and no login is needed. The live check is scripts/live_check_gracecell.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A month with no satellite solution shown as 0 cm, or a trend drawn over a few months, would tell a farmer something the satellite never measured. Run: node scripts/test_live_gracecell.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, PYTHON, URS_TOKEN } from './live_testlib.mjs';

const NOW = '2026-11-18T12:00:00Z', BLOCK = 1 << 18;
const FILE = 'https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4/GRCTellus.JPL.test.nc';
const CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json?short_name=TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4&sort_key=-start_date&page_size=5';
const OXFORD = ['43.13', '-80.75'];
const MAKER = `
import sys, json, numpy as np, h5py
spec = json.load(open(sys.argv[1])); T = len(spec['time']); row, col = 266, 558
rows, cols = spec.get('shape', [360, 720])
with h5py.File(sys.argv[2], 'w') as f:
    f['lat'] = np.arange(rows) * 0.5 - 89.75 + spec.get('lat_shift', 0); f['lon'] = np.arange(cols) * 0.5 + 0.25; f['time'] = np.array(spec['time'], dtype='f8')
    for name, vals in (('lwe_thickness', spec['values']), ('uncertainty', spec['unc'])):
        d = f.create_dataset(name, shape=(T, rows, cols), chunks=(20, 90, 180), dtype='f8', compression='gzip', compression_opts=9, fillvalue=-99999.0)
        d.attrs['units'] = np.bytes_(spec.get('units', 'cm')); d.attrs['valid_min'] = np.array([-2305.0]); d.attrs['valid_max'] = np.array([1273.0]); d.attrs['_FillValue'] = np.array([-99999.0])
        if rows == 360:
            d[:, 180:270, 540:720] = np.zeros((T, 90, 180)); d[:, row, col] = np.array(vals, dtype='f8')
    m = f.create_dataset('land_mask', shape=(rows, cols), chunks=(90, 180), dtype='f8', compression='gzip'); m[:, :] = np.ones((rows, cols)); m[min(row, rows - 1), min(col, cols - 1)] = spec.get('land', 1.0)
    f.create_dataset('GAD', data=np.random.default_rng(3).integers(0, 255, 700000, dtype='uint8'))
`;
const daysOf = iso => (Date.parse(iso + 'T00:00:00Z') - Date.UTC(2002, 0, 1)) / 864e5;
// a made-up series: calendar months from 2002-04, month n has value 2 cm per year of the label time (so its straight-line trend is exactly 2 cm a year); gaps are months left out of the time axis
function months(count, gaps = []) {
  const out = [];
  for (let n = 0, y = 2002, m = 4; out.length < count; n++, m === 12 ? (y++, m = 1) : m++) {
    const label = `${y}-${String(m).padStart(2, '0')}`;
    if (!gaps.includes(label)) out.push({ label, date: `${label}-16`, cm: Math.round(2 * ((y - 2002) + (m - 0.5) / 12) * 100) / 100 });
  }
  return out;
}
function build({ list = months(76, ['2002-06', '2002-07', '2003-06']), tweak = {}, spec = {}, cmr = 'ok', urs = { status: 200, body: { access_token: 'tok-hand-made-3' } }, blocks = {} } = {}) {
  const dir = tempFolder('gracecell'), answers = path.join(dir, 'answers'), s = { time: list.map(e => daysOf(e.date)), values: list.map(e => (e.cm)), unc: list.map(() => 5.5), ...spec };
  for (const [k, v] of Object.entries(tweak)) s.values[k] = v;
  fs.writeFileSync(path.join(dir, 'make.py'), MAKER); fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(s));
  const made = spawnSync(PYTHON, ['-I', path.join(dir, 'make.py'), path.join(dir, 'spec.json'), path.join(dir, 'f.nc')], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error('the test file could not be made: ' + made.stderr.slice(-400));
  const file = fs.readFileSync(path.join(dir, 'f.nc'));
  const entries = cmr === 'ok' ? [{ title: 'GRCTellus.JPL.test', time_end: '2026-09-16T23:59:59.000Z', links: [{ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: FILE }, { rel: 'http://esipfed.org/ns/fedsearch/1.1/s3#', href: 's3://x/y.nc' }] }] : [];
  addAnswer(answers, { url: CMR, body: { feed: { entry: entries } } });
  addAnswer(answers, { method: 'POST', url: URS_TOKEN, status: urs.status, body: urs.body ?? '' });
  for (let n = 0; n * BLOCK < file.length; n++) {
    const first = n * BLOCK, last = n === 0 ? BLOCK - 1 : Math.min(file.length, first + BLOCK) - 1, over = blocks[n];
    addAnswer(answers, { url: `${FILE}#${first}-${last}`, ...(over || { status: 206, headers: { 'content-range': `bytes ${first}-${Math.min(last, file.length - 1)}/${file.length}`, 'content-type': 'application/x-netcdf' }, body: file.subarray(first, Math.min(last, file.length - 1) + 1) }) });
  }
  return { answers, size: file.length, list };
}
const run = (args, b, extra = {}) => runLookup('gracecell', args, { replay: b.answers, login: true, now: NOW, ...extra });

await group('a good answer for Oxford County', async () => {
  const b = build(), r = await run(OXFORD, b), a = r.answer;
  contract('gracecell', r, { secrets: ['tok-hand-made-3'] });
  check('it is a good answer', a?.ok === true, a);
  check('the file really spans more than one piece (so the piece-by-piece read is tested)', b.size > BLOCK, b.size);
  same('the series starts at the first month and ends at the newest month with a value', [a.months[0][0], a.months.at(-1)[0], a.newest_month], ['2002-04', b.list.at(-1).label, b.list.at(-1).label]);
  same('every month the file has is its value and its uncertainty', a.months.filter(m => m[1] !== null).every(m => m[1] === b.list.find(e => e.label === m[0]).cm && m[2] === 5.5), true);
  same('the months with no solution are empty (null), not 0 and not filled in: the first two gaps in a row, then a single one', a.months.filter(m => m[1] === null).map(m => [m[0], m[1], m[2]]), [['2002-06', null, null], ['2002-07', null, null], ['2003-06', null, null]]);
  same('the gaps are named, and the runs of missing months too', [a.gaps, a.gap_spans], [['2002-06', '2002-07', '2003-06'], [['2002-06', '2002-07'], ['2003-06', '2003-06']]]);
  same('the months read are the months in the file', a.months_read, b.list.length);
  same('the newest month, its date, its value and its uncertainty', [a.newest_date, a.value_cm, a.uncertainty_cm], [b.list.at(-1).date, b.list.at(-1).cm, 5.5]);
  check('five or more years: the trend is given, 2 cm a year for this made-up series', Math.abs(a.trend_cm_per_year - 2) < 0.02 && a.trend_years >= 5 && a.trend_from === '2002-04' && a.trend_to === a.newest_month, [a.trend_cm_per_year, a.trend_years]);
  same('the 0.5 degree cell with its edges and size, and the true region size', [a.cell.lat, a.cell.lon, a.cell.edges, a.area_km], [43.25, -80.75, { n: 43.5, s: 43, e: -80.5, w: -81 }, 300]);
  check('the field lies inside the cell', a.cell.edges.s <= 43.13 && 43.13 < a.cell.edges.n && a.cell.edges.w <= -80.75 && -80.75 < a.cell.edges.e);
  check('the source names the mission, the centre and the filter; the units say centimetres of water and the region size', /GRACE/.test(a.source) && /PO\.DAAC|Physical Oceanography/.test(a.source) && /Centimetres of water/.test(a.units) && /300 km/.test(a.units), [a.source, a.units]);
  check('the note says it is a region, not a well, and that gaps are left empty', /not a well/.test(a.note) && /left empty, never filled/.test(a.note), a.note);
  check('a whole answer has no "incomplete"', !('incomplete' in a));
  check('it read only a few pieces of the file, never all of it twice', r.asked <= 3 + Math.ceil(b.size / BLOCK) * 2, r.asked);
});

await group('two part-month solutions in one month, and a short series', async () => {
  const list = months(76, ['2002-06', '2002-07', '2003-06']), at = list.findIndex(e => e.label === '2005-01');
  const dup = [...list.slice(0, at), { label: '2005-01', date: '2005-01' + '-01', cm: list[at].cm + 1 }, { label: '2005-01', date: '2005-01' + '-16', cm: list[at].cm - 1 }, ...list.slice(at + 1)];
  const r = await run(OXFORD, build({ list: dup })), a = r.answer;
  contract('two in one month', r);
  same('one entry for the month, the mean of the two, and the month is named as merged', [a.months.filter(m => m[0] === '2005-01').length, a.months.find(m => m[0] === '2005-01')[1], a.merged_months], [1, list[at].cm, ['2005-01']]);
  const short = await run(OXFORD, build({ list: months(40) })), s = short.answer;
  contract('short series', short);
  check('under five years: NO trend (null), said in words, the months are still given', s.trend_cm_per_year === null && /Fewer than five years/.test(s.trend_note) && s.months_read === 40, [s.trend_cm_per_year, s.trend_note]);
  const sixty = await run(OXFORD, build({ list: months(59) }));
  check('under 60 months read: no trend even if the span is nearly five years', sixty.answer.trend_cm_per_year === null, sixty.answer.trend_cm_per_year);
});

await group('values that cannot be right stay empty', async () => {
  const list = months(76), r = await run(OXFORD, build({ list, tweak: { 10: -99999, 11: 5000, 12: -5000 } })), a = r.answer;
  contract('bad values', r);
  same('the file\'s own "no value", a value over the valid range and one under it are empty months, never 0', [a.months[10][1], a.months[11][1], a.months[12][1]], [null, null, null]);
  check('they are counted as gaps and the other months are untouched', a.gaps.length === 3 && a.months_read === 73, [a.gaps, a.months_read]);
  const lastBad = await run(OXFORD, build({ list, tweak: { 75: -99999 } }));
  same('when the newest month has no value the newest month is the last one that has', lastBad.answer.newest_month, list[74].label);
});

await group('places and files it cannot answer', async () => {
  const ocean = await run(OXFORD, build({ spec: { land: 0.0 } }));
  check('open water: said plainly, final', ocean.answer.ok === false && /open water/.test(ocean.answer.reason) && ocean.answer.final === true, ocean.answer);
  const all = months(76), nothing = await run(OXFORD, build({ list: all, tweak: Object.fromEntries(all.map((_, i) => [i, -99999])) }));
  check('every month empty: no value, final', nothing.answer.ok === false && /no GRACE-FO value/.test(nothing.answer.reason) && nothing.answer.final === true, nothing.answer);
  const none = await run(OXFORD, build({ cmr: 'empty' }));
  contract('no file listed', none, { allowMiss: true });
  check('no file in the catalogue: said plainly, not final', none.answer.ok === false && /lists no GRACE-FO/.test(none.answer.reason) && !none.answer.final, none.answer);
  const refused = await run(OXFORD, build({ urs: { status: 401 } }));
  check('a refused login is said plainly', /did not accept this computer's login/.test(refused.answer.reason), refused.answer);
  const rights = await run(OXFORD, build({ blocks: { 0: { status: 403, body: 'no' } } }));
  check('the file refused with 403: the login may need approving for PO.DAAC, in plain words', /PO\.DAAC/.test(rights.answer.reason), rights.answer);
  const down = await run(OXFORD, build({ blocks: { 0: { status: 503, body: 'down' } } }));
  check('the archive failing is a "try again" sentence, not final', down.answer.ok === false && /did not answer just now|try again/.test(down.answer.reason) && !down.answer.final, down.answer);
  const odd = await run(OXFORD, build({ spec: { shape: [180, 360] } }));
  check('a file laid out differently from the one checked is never read as if it were', odd.answer.ok === false && /no longer laid out/.test(odd.answer.reason), odd.answer);
  const shifted = await run(OXFORD, build({ spec: { lat_shift: 0.5 } }));
  check('a grid shifted by half a cell is refused: the wrong place is worse than no value', shifted.answer.ok === false && /no longer laid out/.test(shifted.answer.reason), shifted.answer);
  const units = await run(OXFORD, build({ spec: { units: 'm' } }));
  check('values in other units are refused', units.answer.ok === false && /no longer laid out/.test(units.answer.reason), units.answer);
  const nologin = await runLookup('gracecell', OXFORD, { replay: build().answers, now: NOW });
  check('with no login on the computer it says so', nologin.answer.ok === false && /No NASA Earthdata login/.test(nologin.answer.reason), nologin.answer);
});

await group('arguments', async () => {
  const b = build();
  for (const [name, args, why] of [['none', [], /required as decimal degrees/], ['text', ['abc', '5'], /required as decimal degrees/], ['too far north', ['91', '10'], /lat must be/], ['too far east', ['44', '190'], /lon -180/]]) {
    const r = await run(args, b);
    check(`${name}: refused in plain words before anything is asked`, r.answer?.ok === false && why.test(r.answer.reason) && r.asked === 0, r.answer);
  }
  const east = await run(['43.13', '99.75'], b);
  check('a place east of the file\'s own cells is read from its own cell, never wrapped wrongly (this made-up file has data only round Oxford, so it is refused, not guessed)', east.answer?.ok === false, east.answer);
});

finish();
