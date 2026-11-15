// Crophalo's offline suite for the weak-spots lookup (scripts/live/hlsbox.py): NASA's catalogue and token service are replaced by hand-made answers, and every Landsat / Sentinel-2 GeoTIFF by a small
// one built the real way by rasterio (UTM 14N, 30 m squares on whole multiples of 30 m as HLS tiles are, int16 reflectance with scale 0.0001, uint8 Fmask), with known squares made different on purpose.
// RULE: never loosen a check here without a written farming reason beside it. A cloud, a cloud shadow, snow or water shown as low greenness would send a farmer to walk a spot the satellite never saw.
// No internet and no login is needed. The live check is scripts/live_check_hlsbox.mjs, by hand. Run: node scripts/test_live_hlsbox.mjs      Rewrite the page's test answers (scripts/fixtures/live/hlsbox/*.json): node scripts/test_live_hlsbox.mjs --write-fixture
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, PYTHON, URS_TOKEN, FIXTURES } from './live_testlib.mjs';

const NOW = '2026-11-15T12:00:00Z', CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json', MEAD = ['41.165', '-96.47'], EPSG = 32614, HALF = 50;
const SEASONS = [['2024-05-01', '2024-09-30'], ['2025-05-01', '2025-09-30']];
// Two helpers in the folder's Python: the map work (an outline written in metres from the 30 m square under the pin, turned into lon,lat) and the maker of the test files.
const GEOM = `
import sys, json, math
from rasterio.warp import transform
s = json.load(open(sys.argv[1]))
x, y = (v[0] for v in transform('EPSG:4326', 'EPSG:%d' % s['epsg'], [s['lon']], [s['lat']]))
X0, Y0 = math.floor(x / 30) * 30, math.floor(y / 30) * 30
lon, lat = transform('EPSG:%d' % s['epsg'], 'EPSG:4326', [X0 + p[0] for p in s['pts']], [Y0 + p[1] for p in s['pts']])
sys.stdout.write(json.dumps([[a, b] for a, b in zip(lon, lat)]))
`;
const MAKER = `
import sys, json, math, numpy as np, rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform
s = json.load(open(sys.argv[1])); out = sys.argv[2]
x, y = (v[0] for v in transform('EPSG:4326', 'EPSG:%d' % s['epsg'], [s['lon']], [s['lat']]))
X0, Y0 = math.floor(x / 30) * 30, math.floor(y / 30) * 30
H = s['half']; n = 2 * H + 1
i = np.arange(n)[None, :] - H; j = H - np.arange(n)[:, None]        # i: squares east of the pin's square, j: squares north of it
for f in s['files']:
    a = np.full((n, n), float(f['base'])) + f.get('gi', 0) * i + f.get('gj', 0) * j
    if f.get('noise'): a = a + np.random.default_rng(f['seed']).uniform(-f['noise'], f['noise'], (n, n))   # a field is never one even green: a fixed, seeded unevenness
    for p in f.get('patches', []):
        a[(i >= p['i0']) & (i <= p['i1']) & (j >= p['j0']) & (j <= p['j1'])] = p['v']
    if f['kind'] != 'fmask':
        a = np.where(a < -9000, -9999, np.round(a * 1e4))
    with rasterio.open(out + '/' + f['name'], 'w', driver='GTiff', width=n, height=n, count=1, dtype=f['dtype'], crs='EPSG:%d' % f.get('epsg', s['epsg']),
                       transform=from_origin(X0 - H * 30 + f.get('shift', 0), Y0 + 30 + H * 30, 30, 30), nodata=f['nodata']) as d:
        d.write(a.astype(f['dtype']), 1)
        if f['kind'] != 'fmask': d.scales = (1e-4,)
`;
function python(code, spec) {
  const dir = tempFolder('hlsbox-py');
  fs.writeFileSync(path.join(dir, 'run.py'), code); fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec));
  const r = spawnSync(PYTHON, ['-I', path.join(dir, 'run.py'), path.join(dir, 'spec.json'), dir], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('the helper failed: ' + r.stderr.slice(-600));
  return { dir, out: r.stdout };
}
// lon,lat corners from metres east and north of the south-west corner of the pin's own 30 m square
const lonlat = (pts, at = MEAD) => JSON.parse(python(GEOM, { lat: +at[0], lon: +at[1], epsg: EPSG, pts }).out);
const ringText = ring => ring.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(';');

const doy = d => { const t = Date.parse(d + 'T00:00:00Z'); return Math.floor((t - Date.UTC(+d.slice(0, 4), 0, 0)) / 864e5); };
const NIRBAND = p => (p.prod === 'S' ? 'B8A' : 'B05');
// a pass: product 'S' (Sentinel-2) or 'L' (Landsat), its day, the tile's cloud %, the tile; fmask / red / nir: { base, gi, gj, patches: [{ i0, i1, j0, j1, v }] } over the squares
const pass = o => { const p = { prod: 'S', cloud: 5, tile: 'T14TPL', ...o }; p.fmask = { base: 0, ...o.fmask }; p.red = { base: 0.05, ...o.red }; p.nir = { base: 0.45, ...o.nir };
  p.title = `HLS.${p.prod}30.${p.tile}.${p.date.slice(0, 4)}${String(doy(p.date)).padStart(3, '0')}T171049.v2.0`; return p; };
const base = p => `https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/HLS${p.prod}30.020/${p.title}/${p.title}`;
const granule = p => ({ title: p.title, time_start: `${p.date}T17:10:49.000Z`, cloud_cover: String(p.cloud), day_night_flag: 'DAY',
  links: [...['B04', NIRBAND(p), 'Fmask', 'B03'].map(l => ({ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: `${base(p)}.${l}.tif` })), { rel: 'http://esipfed.org/ns/fedsearch/1.1/s3#', href: 's3://x/y.tif' }] });
const cmrUrl = (short, [first, last], at) => `${CMR}?${[['short_name', short], ['version', '2.0'], ['point', `${Number(at[1])},${Number(at[0])}`], ['sort_key', '-start_date'], ['temporal', `${first}T00:00:00Z,${last}T23:59:59Z`], ['page_size', 200]].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
function build({ list = [], broken = [], urs = { status: 200, body: { access_token: 'tok-hand-made-7' } }, at = MEAD } = {}) {
  const files = [], serve = [];
  for (const p of list) {
    const layers = { Fmask: ['fmask', 'uint8', p.fmask, 255], B04: ['band', 'int16', p.red, -9999], [NIRBAND(p)]: ['band', 'int16', p.nir, -9999] };
    for (const [layer, [kind, dtype, v, nodata]] of Object.entries(layers)) {
      const name = `${p.title}.${layer}.tif`;
      files.push({ name, kind, dtype, nodata, ...v, ...(p.offgrid ? { shift: 15 } : {}), ...(p.epsg ? { epsg: p.epsg } : {}) });
      serve.push([`${base(p)}.${layer}.tif`, name]);
    }
  }
  const { dir } = python(MAKER, { lat: +at[0], lon: +at[1], epsg: EPSG, half: HALF, files });
  const answers = path.join(dir, 'answers');
  for (const season of SEASONS) for (const [short, prod] of [['HLSS30', 'S'], ['HLSL30', 'L']])
    addAnswer(answers, { url: cmrUrl(short, season, at), body: { feed: { entry: list.filter(p => p.prod === prod && p.date >= season[0] && p.date <= season[1]).map(granule) } } });
  addAnswer(answers, { method: 'POST', url: URS_TOKEN, status: urs.status, body: urs.body ?? '' });
  for (const [url, name] of serve) addAnswer(answers, broken.some(b => url.includes(b)) ? { url, body: 'not a picture' } : { url, file: path.join(dir, name) });
  return answers;
}
const run = (args, answers, extra = {}) => runLookup('hlsbox', args, { replay: answers, login: true, now: NOW, ...extra });
const ndvi = (r, n) => Math.round((n - r) / (n + r) * 1000) / 1000;

// The test field: 10 by 8 squares, its edges 3 m inside the squares' edges, so the outer ring of squares touches the outline but is not wholly inside it.
const W = 10, H = 8;
const RECT = lonlat([[3, 3], [W * 30 - 3, 3], [W * 30 - 3, H * 30 - 3], [3, H * 30 - 3]]);
const idOf = (i, j) => (H - 1 - j) * W + i;   // cells are listed north to south, west to east: square i east, j north of the pin's square
const WEAK = { i0: 2, i1: 4, j0: 2, j1: 4, v: 0.3 };   // 9 squares less green: NDVI 0.5 against 0.8
const CLOUDY = { i0: 6, i1: 7, j0: 1, j1: 6, v: 8 };    // 12 squares under cloud shadow (Fmask bit 3) on one pass
// The 15-day periods of each season: 0 May 1-15, 1 May 16-30, 2 May 31-Jun 14, 3 Jun 15-29, 4 Jun 30-Jul 14, 5 Jul 15-29, 6 Jul 30-Aug 13, 7 Aug 14-28, 8 Aug 29-Sep 12, 9 Sep 13-30.
const GOOD = [
  pass({ date: '2025-07-20', nir: { patches: [WEAK] } }),                                    // period 5: clear
  pass({ date: '2025-07-02', cloud: 1, fmask: { base: 2 } }),                                // period 4: the clearest tile, but cloud on the whole field ...
  pass({ date: '2025-07-05', prod: 'L', cloud: 20, red: { base: 0.1 }, nir: { base: 0.4, patches: [WEAK] } }),   // ... so the next candidate is the reading (Landsat)
  pass({ date: '2025-06-03', fmask: { patches: [CLOUDY] }, nir: { patches: [WEAK] } }),     // period 2: 12 of 48 inside squares shadowed: 75 % clear, kept, those squares null
  pass({ date: '2025-08-05', fmask: { patches: [{ i0: 1, i1: 8, j0: 1, j1: 3, v: 2 }] } }),  // period 6: 24 of 48 cloudy, 50 % clear, under 60 %: left out
  pass({ date: '2025-09-20', fmask: { base: 16 } }),                                        // period 9: snow only
  pass({ date: '2024-07-20', nir: { base: 0.4, gi: 0.002, patches: [WEAK] } }),             // period 5: a small slope west to east, no two columns alike
  pass({ date: '2024-08-01', offgrid: true }), pass({ date: '2024-08-02', cloud: 30 }),       // period 6: a file whose squares are 15 m off the grid is left out, the next candidate read
  pass({ date: '2024-05-10', fmask: { base: 32 } }),                                        // period 0: water over the whole field
  pass({ date: '2024-06-20', cloud: 40 }), pass({ date: '2024-06-21', cloud: 2, tile: 'T14TQL' }),   // period 3: the next tile over, same UTM zone, same squares: the lower tile cloud is read
];

let mead;   // kept for the page's test answer
await group('a good answer for a field near Mead, Nebraska', async () => {
  const r = await run([...MEAD, ringText(RECT)], build({ list: GOOD })), a = r.answer;
  contract('hlsbox', r, { secrets: ['tok-hand-made-7'] });
  check('it is a good answer', a?.ok === true, a);
  same('every square touching the outline is a cell, 10 by 8', a.cells.length, W * H);
  same('the edge rule: only the 8 by 6 squares with all four corners inside the outline are inside', a.cells_inside, (W - 2) * (H - 2));
  const wrong = a.cells.filter((c, k) => { const i = k % W, j = H - 1 - Math.floor(k / W); return c.inside !== (i >= 1 && i <= W - 2 && j >= 1 && j <= H - 2); });
  check('each known square is inside or not by its four corners', wrong.length === 0, wrong.slice(0, 3));
  check('cells are numbered 0, 1, 2 … in order, each with four corners, a centre and its flag', a.cells.every((c, k) => c.id === k && c.corners.length === 4 && c.corners.every(p => p.length === 2) && typeof c.lat === 'number' && typeof c.lon === 'number' && typeof c.inside === 'boolean'));
  const [nw] = lonlat([[0, H * 30]]), c0 = a.cells[0].corners[0];
  check('the first cell\'s north-west corner is the grid point worked out apart from the lookup (to 1e-6 degrees)', Math.abs(c0[0] - nw[1]) < 2e-6 && Math.abs(c0[1] - nw[0]) < 2e-6, [c0, nw]);
  const lats = a.cells.flatMap(c => c.corners.map(p => p[0])), lons = a.cells.flatMap(c => c.corners.map(p => p[1]));
  check('the window covers the whole outline', RECT.every(([x, y]) => x >= Math.min(...lons) && x <= Math.max(...lons) && y >= Math.min(...lats) && y <= Math.max(...lats)));
  check('every pass has one greenness per cell', a.passes.every(p => p.ndvi.length === a.cells.length), a.passes.map(p => p.ndvi.length));
  const by = d => a.passes.find(p => p.date === d);
  same('the kept passes, oldest first', a.passes.map(p => p.date), ['2024-06-21', '2024-07-20', '2024-08-02', '2025-06-03', '2025-07-05', '2025-07-20']);
  const p = by('2025-07-20');
  same('a clear pass: the weak squares are 0.5 and the rest 0.8, from red and near-infrared', [p.ndvi[idOf(3, 3)], p.ndvi[idOf(6, 6)], p.ndvi[idOf(0, 0)]], [ndvi(0.05, 0.3), ndvi(0.05, 0.45), ndvi(0.05, 0.45)]);
  same('its satellite, tile, granule and share of the field clear', [p.sensor, p.tile, p.granule, p.clear_share], ['Sentinel-2', 'T14TPL', GOOD[0].title, 1]);
  const shadow = by('2025-06-03'), under = a.cells.filter((c, k) => { const i = k % W, j = H - 1 - Math.floor(k / W); return i >= 6 && i <= 7 && j >= 1 && j <= 6; }).map(c => c.id);
  check('cloud shadow is null on its 12 squares, never 0 and never low greenness', under.length === 12 && under.every(k => shadow.ndvi[k] === null), under.map(k => shadow.ndvi[k]));
  same('that pass is kept at 75 % of the inside squares clear', shadow.clear_share, 0.75);
  check('null is never 0 anywhere in the answer', a.passes.every(q => q.ndvi.every(v => v === null || (v > 0.1 && v <= 1))));
  same('cloud on the field: the next candidate of the period is the reading, a Landsat pass', [by('2025-07-02'), by('2025-07-05').sensor, by('2025-07-05').ndvi[idOf(6, 6)]], [undefined, 'Landsat 8 and 9', ndvi(0.1, 0.4)]);
  const out = d => a.left_out.find(x => x.period[0] <= d && d <= x.period[1]);
  same('half the field under cloud (under 60 % clear) is left out as cloud', [by('2025-08-05'), out('2025-08-05')?.why], [undefined, 'cloud']);
  same('snow and water are left out by name, never read as low greenness', [out('2025-09-20')?.why, out('2024-05-10')?.why], ['snow', 'water']);
  same('a file off the 30 m grid is left out and the next candidate read', [by('2024-08-01'), by('2024-08-02')?.date, a.not_usable.other_grid], [undefined, '2024-08-02', 1]);
  same('the next tile over in the same UTM zone shares the squares: its pass is read, the cloudier one is not', [by('2024-06-21')?.tile, by('2024-06-20')], ['T14TQL', undefined]);
  same('with every file there: no read errors, not incomplete, 20 of 20 periods read', [a.read_errors, a.incomplete, a.periods_read], [0, false, 20]);
  same('the 20 periods: May to September of 2024 and 2025, 15 days each, the last of each season to 30 September', [a.periods, a.window], [20, { first: '2024-05-01', last: '2025-09-30', seasons: ['2024-05-01/2024-09-30', '2025-05-01/2025-09-30'] }]);
  check('periods with no pass listed are named as left out, "no_pass"', a.left_out.filter(x => x.why === 'no_pass').length === 20 - 9, a.left_out);
  mead = { r };
  check('every period is a kept pass or a named left-out, never both', a.passes.length + a.left_out.length === 20 && a.left_out.every(x => !a.passes.some(q => x.period[0] <= q.date && q.date <= x.period[1])));
  same('the data date is the newest kept pass; 30 m squares', [a.data_date, a.pixel_m], ['2025-07-20', 30]);
  check('the source names HLS, 30 m and the DAAC; the units explain NDVI and the corners', /Harmonized Landsat and Sentinel-2/.test(a.source) && /30 m/.test(a.source) && /NDVI/.test(a.units) && /decimal degrees/.test(a.units), a.source);
  check('the note says null is never low greenness and the 60 % rule', /never counted as low greenness/.test(a.note) && /60 %/.test(a.note), a.note);
});

await group('a whole answer, the page\'s test field, and the closed outline', async () => {
  const a = mead.r.answer;
  const closed = await run([...MEAD, ringText([...RECT, RECT[0]])], build({ list: GOOD }));
  same('the same outline written closed gives the same cells', JSON.stringify(closed.answer.cells), JSON.stringify(a.cells));
  // The page's test field (package 2B builds against it): a five-sided outline, a weak spot on 7 of 9 clear passes, a small one on all, one shadowed pass, cloudy and snowy periods.
  const FIELD = lonlat([[10, 5], [20 * 30 - 10, 20], [20 * 30 - 4, 16 * 30 - 8], [9 * 30, 16 * 30 - 2], [4, 10 * 30]]);
  const SPOT = { i0: 12, i1: 15, j0: 4, j1: 6, v: 0.3 }, SMALL = { i0: 3, i1: 4, j0: 5, j1: 6, v: 0.32 };
  const days = ['2024-06-05', '2024-06-22', '2024-07-08', '2024-07-25', '2024-08-12', '2025-06-14', '2025-07-01', '2025-07-19', '2025-08-04'];
  const field = days.map((date, k) => pass({ date, prod: k % 3 === 2 ? 'L' : 'S', nir: { base: 0.42 + 0.01 * (k % 4), noise: 0.03, seed: 11 + k, patches: [...(k === 1 || k === 6 ? [] : [SPOT]), SMALL] }, ...(k === 4 ? { fmask: { patches: [{ i0: 0, i1: 5, j0: 0, j1: 15, v: 8 }] } } : {}) }));
  field.push(pass({ date: '2025-08-20', fmask: { base: 2 } }), pass({ date: '2024-09-16', fmask: { base: 16 } }));
  const m = await run([...MEAD, ringText(FIELD)], build({ list: field })), b = m.answer;
  contract('the page\'s test field', m);
  same('nine clear passes, the rest left out by name', [b.passes.length, b.left_out.length, b.incomplete], [9, 11, false]);
  mead = { FIELD, b };
  const cloudy = await run([...MEAD, ringText(FIELD)], build({ list: [...field.slice(0, 3), pass({ date: '2025-07-02', fmask: { base: 2 } }), pass({ date: '2025-08-03', fmask: { base: 8 } })] }));
  same('the cloudy test field: three clear passes only', cloudy.answer.passes.length, 3);
  mead.cloudy = cloudy.answer;
});

await group('the page\'s test answers in scripts/fixtures/live/hlsbox', async () => {
  const dir = path.join(FIXTURES, 'hlsbox'), note = 'Hand-made test data, not a NASA reading: made by scripts/test_live_hlsbox.mjs --write-fixture on 2026-11-15 from small hand-made HLS files over a made-up field near Mead, Nebraska. The live answer has the same fields.';
  if (process.argv.includes('--write-fixture') && mead) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, a] of [['mead.json', mead.b], ['mead-cloudy.json', mead.cloudy]]) fs.writeFileSync(path.join(dir, name), JSON.stringify({ fixture_note: note, ask: { lat: +MEAD[0], lon: +MEAD[1], ring: ringText(mead.FIELD) }, ...a }) + '\n');
  }
  for (const name of ['mead.json', 'mead-cloudy.json']) {
    const a = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    check(`${name}: marked as test data`, a.replayed === true && /Hand-made test data/.test(a.fixture_note), a.fixture_note);
    check(`${name}: the answer's fields as the spec names them`, a.ok === true && ['source', 'pixel_m', 'data_date', 'cells', 'passes', 'periods', 'periods_read', 'incomplete'].every(k => k in a) && a.cells.every(c => ['id', 'corners', 'lat', 'lon', 'inside'].every(k => k in c)) && a.passes.every(p => p.date && p.sensor && p.ndvi.length === a.cells.length), Object.keys(a));
    if (mead) same(`${name}: the same as the lookup gives today (rewrite with --write-fixture)`, JSON.stringify(a.cells), JSON.stringify((name === 'mead.json' ? mead.b : mead.cloudy).cells));
  }
});

await group('refusals, failures and the time limit', async () => {
  const b = build({ list: [pass({ date: '2025-07-14' })] });
  const big = lonlat([[-1100, -1100], [1100, -1100], [1100, 1100], [-1100, 1100]]);
  const tooBig = await run([...MEAD, ringText(big)], b);
  contract('too big', tooBig);
  check('a box over 2 km across is refused, final, before anything is asked', tooBig.answer.ok === false && /too big for one look \(over 2 km across\)/.test(tooBig.answer.reason) && tooBig.answer.final === true && tooBig.asked === 0, tooBig.answer);
  const tooSmall = await run([...MEAD, ringText(lonlat([[0, 0], [150, 0], [150, 150], [0, 150]]))], b);
  check('a field with fewer than 30 whole squares is refused, final, before anything is asked', tooSmall.answer.ok === false && /too small for 30 m squares/.test(tooSmall.answer.reason) && tooSmall.answer.final === true && tooSmall.asked === 0, tooSmall.answer);
  const far = await run(['41.30', '-96.47', ringText(RECT)], b);
  check('a pin outside the outline\'s box is refused', far.answer.ok === false && /inside the box of the field's outline/.test(far.answer.reason) && far.asked === 0, far.answer);
  for (const [name, args, why] of [['no outline', MEAD, /outline are required/], ['two corners', [...MEAD, ringText(RECT.slice(0, 2))], /3 to 200 corners/], ['text', [...MEAD, 'a,b;c,d;e,f'], /plain number/],
    ['201 corners', [...MEAD, ringText(Array.from({ length: 201 }, (_, k) => [-96.47 + 0.001 * Math.cos(k / 32), 41.165 + 0.001 * Math.sin(k / 32)]))], /3 to 200 corners/], ['no lat', ['', '-96.47', ringText(RECT)], /required as decimal degrees/]]) {
    const x = await run(args, b);
    check(`${name}: refused in plain words before anything is asked`, x.answer?.ok === false && why.test(x.answer.reason) && x.asked === 0, x.answer);
  }
  const nologin = await runLookup('hlsbox', [...MEAD, ringText(RECT)], { replay: b, now: NOW });
  check('with no NASA login on the computer it says so (the page then shows low ground only)', nologin.answer.ok === false && /No NASA Earthdata login/.test(nologin.answer.reason), nologin.answer);
  const refused = await run([...MEAD, ringText(RECT)], build({ list: [pass({ date: '2025-07-14' })], urs: { status: 401 } }));
  check('a refused login is said plainly', /did not accept this computer's login/.test(refused.answer.reason), refused.answer);
  const empty = await run([...MEAD, ringText(RECT)], build({}));
  contract('nothing listed', empty, { allowMiss: true });
  check('no pass listed over the field: said plainly, not final', empty.answer.ok === false && /lists no Landsat or Sentinel-2/.test(empty.answer.reason) && /2024 and 2025/.test(empty.answer.reason) && !empty.answer.final, empty.answer);
  const all = await run([...MEAD, ringText(RECT)], build({ list: [pass({ date: '2025-07-14' }), pass({ date: '2024-07-14' })], broken: ['HLS.'] }));
  check('every file unreadable: "try again", not final', all.answer.ok === false && /could not be read just now/.test(all.answer.reason) && !all.answer.final, all.answer);
  const one = await run([...MEAD, ringText(RECT)], build({ list: [pass({ date: '2025-07-14' }), pass({ date: '2024-07-14' })], broken: [pass({ date: '2024-07-14' }).title] })), o = one.answer;
  contract('one unreadable', one);
  check('one pass that cannot be read: counted, its period named "not_read", the answer incomplete', o.ok && o.passes.length === 1 && o.read_errors === 1 && o.incomplete === true && o.periods_read === 19 && o.left_out.some(x => x.why === 'not_read'), o);
  const late = await run([...MEAD, ringText(RECT)], b, { limitS: 27 });   // 27 s: the lookup's own stop at 22 s leaves it no time to start a period
  contract('the time limit', late);
  const l = late.answer;
  check('out of time: a good answer with no passes, incomplete, the period named "no_time", periods_read 19 of 20', l.ok === true && l.passes.length === 0 && l.incomplete === true && l.periods_read === 19 && l.left_out.some(x => x.why === 'no_time') && /No pass was looked at before the time ran out/.test(l.why_none) && !/clear view|cloud/i.test(l.why_none), l);
  // The catalogue answering an error page, or nothing at all: said plainly, never final, never a made-up answer.
  const down = build({ list: [pass({ date: '2025-07-14' })] });
  for (const season of SEASONS) for (const short of ['HLSS30', 'HLSL30']) addAnswer(down, { url: cmrUrl(short, season, MEAD), status: 503, headers: { 'content-type': 'text/html' }, body: '<html><body>Service Unavailable</body></html>' });
  const page = await run([...MEAD, ringText(RECT)], down);
  contract('the catalogue answering an error page', page, { allowMiss: true });
  check('the catalogue answering an error page: "did not answer just now", not final', page.answer.ok === false && /did not answer just now/.test(page.answer.reason) && !page.answer.final, page.answer);
  const hung = build({ list: [pass({ date: '2025-07-14' })] });
  for (const season of SEASONS) for (const short of ['HLSS30', 'HLSL30']) addAnswer(hung, { url: cmrUrl(short, season, MEAD), replies: [{ fail: 'hang' }] });
  const slow = await run([...MEAD, ringText(RECT)], hung, { limitS: 8 });
  contract('the catalogue never answering', slow, { allowMiss: true });
  check('the catalogue never answering: the slow sentence inside the time limit, not final', slow.answer.ok === false && /took too long to answer/.test(slow.answer.reason) && !slow.answer.final && slow.seconds < 8, [slow.answer, slow.seconds]);
});

await group('the last days of September belong to the last period of their own season', async () => {
  const r = await run([...MEAD, ringText(RECT)], build({ list: [pass({ date: '2024-09-29' }), pass({ date: '2025-09-30', cloud: 3 })] })), a = r.answer;
  const of = d => a.left_out.find(x => x.period[0] <= d && d <= x.period[1])?.why ?? 'kept';
  same('29 September 2024 and 30 September 2025 are read in 13-30 September, and 1-15 May 2025 has no pass', [a.passes.map(p => p.date), of('2024-09-29'), of('2025-09-30'), of('2025-05-01')], [['2024-09-29', '2025-09-30'], 'kept', 'kept', 'no_pass']);
});

await group('NASA refusing the files to this login (a 403 from the raster library)', async () => {
  const dir = tempFolder('hlsbox-403'), script = path.join(dir, 'refused.py');
  fs.writeFileSync(script, `import common
import rasterio
from rasterio._err import CPLE_HttpResponseError
import hlsbox
def refuse(*a, **k):
    raise CPLE_HttpResponseError(11, 1, "HTTP response code: 403")
rasterio.open = refuse
common.run(hlsbox.main, hlsbox.LIMIT_S)
`);
  const r = await runLookup('hlsbox', [...MEAD, ringText(RECT)], { replay: build({ list: [pass({ date: '2025-07-14' }), pass({ date: '2024-07-14' })] }), login: true, now: NOW, script });
  check('a 403 on every file gives the HLS lookup\'s own NO_RIGHTS sentence', r.answer?.ok === false && /did not let this computer's Earthdata login read the HLS files/.test(r.answer.reason), r.answer);
});

await group('the biggest field allowed: time and memory', async () => {
  const side = 1900, big = lonlat([[-side / 2, -side / 2], [side / 2, -side / 2], [side / 2, side / 2], [-side / 2, side / 2]]);
  const list = ['2024-06-05', '2024-07-08', '2025-06-14', '2025-07-19'].map(date => pass({ date, nir: { gi: 0.001 } }));
  const r = await run([...MEAD, ringText(big)], build({ list })), a = r.answer;
  contract('1.9 km field', r);
  check('about 64 by 64 squares (a UTM square here sits turned 1.7 degrees, so its lon-lat box is 1.96 km), every pass one value per square', a.ok && a.cells.length > 3900 && a.passes.length === 4 && a.passes.every(p => p.ndvi.length === a.cells.length), a.ok ? a.cells.length : a);
  check('the answer stays small enough for the server (under 8 MB)', r.stdout.length < 8e6, r.stdout.length);
  console.log(`biggest field: ${a.cells.length} cells, ${(r.stdout.length / 1e6).toFixed(2)} MB answer, peak ${r.peakMB} MB, ${r.seconds.toFixed(1)} s`);
});

finish();
