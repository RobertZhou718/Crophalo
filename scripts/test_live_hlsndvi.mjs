// Crophalo's offline suite for the greenness lookup (scripts/live/hlsndvi.py): NASA's catalogue and token service are replaced by hand-made answers, and every Landsat / Sentinel-2 GeoTIFF by a small
// one built the real way by rasterio (UTM 17N, 30 m pixels, int16 reflectance with scale 0.0001, uint8 Fmask), whose pixels round the field's 3 by 3 box are deliberately different, so only the box can be read.
// No internet and no login is needed. The live check is scripts/live_check_hlsndvi.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A cloud, a cloud shadow, snow or water shown as low greenness would tell a farmer the crop failed when the satellite never saw it. Run: node scripts/test_live_hlsndvi.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, PYTHON, URS_TOKEN } from './live_testlib.mjs';

const NOW = '2026-11-18T12:00:00Z', CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json', OXFORD = ['43.13', '-80.75'];
const iso = ago => new Date(Date.UTC(2026, 10, 18) - ago * 864e5).toISOString().slice(0, 10);
const FIRST = iso(365), LAST = iso(0);
const MAKER = `
import sys, json, numpy as np, rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform
spec = json.load(open(sys.argv[1])); out = sys.argv[2]
x, y = (v[0] for v in transform('EPSG:4326', 'EPSG:32617', [-80.75], [43.13]))
left, top = np.floor(x / 30) * 30 - 6 * 30, np.ceil(y / 30) * 30 + 6 * 30
for f in spec:
    a = np.full((13, 13), float(f['other']), dtype=f['dtype']); a[5:8, 5:8] = np.array(f['box'], dtype=float).reshape(3, 3)
    with rasterio.open(out + '/' + f['name'], 'w', driver='GTiff', width=13, height=13, count=1, dtype=f['dtype'], crs='EPSG:32617', transform=from_origin(left, top, 30, 30), nodata=f.get('nodata')) as d:
        d.write(a, 1)
        if f.get('scale'): d.scales = (f['scale'],)
`;
const doy = d => { const t = Date.parse(d + 'T00:00:00Z'); return Math.floor((t - Date.UTC(+d.slice(0, 4), 0, 0)) / 864e5); };
const nine = v => Array(9).fill(v);
// a pass: product 'S' (Sentinel-2) or 'L' (Landsat), days before the pinned today, the tile's cloud %, the tile, and what the field's 3 by 3 box holds (Fmask values, red and near-infrared in reflectance)
const pass = (o) => { const p = { prod: 'S', ago: 10, cloud: 5, tile: 'T17TNH', fmask: nine(0), red: nine(0.1), nir: nine(0.5), ...o }; p.date = iso(p.ago); p.title = `HLS.${p.prod}30.${p.tile}.${p.date.slice(0, 4)}${String(doy(p.date)).padStart(3, '0')}T160821.v2.0`; return p; };
const NIRBAND = p => (p.prod === 'S' ? 'B8A' : 'B05');
const base = p => `https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/HLS${p.prod}30.020/${p.title}/${p.title}`;
const granule = p => ({ title: p.title, time_start: `${p.date}T16:08:21.000Z`, cloud_cover: String(p.cloud), day_night_flag: 'DAY',
  links: [...['B04', NIRBAND(p), 'Fmask', 'B03', 'B02'].map(l => ({ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: `${base(p)}.${l}.tif` })), { rel: 'http://esipfed.org/ns/fedsearch/1.1/s3#', href: 's3://x/y.tif' }, { rel: 'http://esipfed.org/ns/fedsearch/1.1/browse#', href: `${base(p)}.jpg` }] });
const cmrUrl = (short, first, last) => `${CMR}?${[['short_name', short], ['version', '2.0'], ['point', '-80.75,43.13'], ['sort_key', '-start_date'], ['temporal', `${first}T00:00:00Z,${last}T23:59:59Z`], ['page_size', 200]].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
function build({ list = [], broken = [], urs = { status: 200, body: { access_token: 'tok-hand-made-5' } }, first = FIRST, last = LAST, serveTile = true } = {}) {
  const dir = tempFolder('hlsndvi'), answers = path.join(dir, 'answers'), files = [], serve = [];
  for (const p of list) {
    if (!serveTile && p.tile !== 'T17TNH') continue;
    const layers = { Fmask: ['uint8', p.fmask, 0, 255, null], B04: ['int16', p.red.map(v => (v === 'fill' ? -9999 : Math.round(v * 1e4))), 0, -9999, 1e-4], [NIRBAND(p)]: ['int16', p.nir.map(v => (v === 'fill' ? -9999 : Math.round(v * 1e4))), 7777, -9999, 1e-4] };
    for (const [layer, [dtype, box, other, nodata, scale]] of Object.entries(layers)) {
      const name = `${p.title}.${layer}.tif`;
      files.push({ name, dtype, box: box.map(v => (v === 'fill' ? (layer === 'Fmask' ? 255 : -9999) : v)), other: layer === 'Fmask' ? 0 : other, nodata, scale });
      serve.push([`${base(p)}.${layer}.tif`, name]);
    }
  }
  fs.writeFileSync(path.join(dir, 'make.py'), MAKER); fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(files));
  const made = spawnSync(PYTHON, ['-I', path.join(dir, 'make.py'), path.join(dir, 'spec.json'), dir], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error('the test files could not be made: ' + made.stderr.slice(-500));
  for (const [short, prod] of [['HLSS30', 'S'], ['HLSL30', 'L']]) addAnswer(answers, { url: cmrUrl(short, first, last), body: { feed: { entry: list.filter(p => p.prod === prod).map(granule) } } });
  addAnswer(answers, { method: 'POST', url: URS_TOKEN, status: urs.status, body: urs.body ?? '' });
  for (const [url, name] of serve) addAnswer(answers, broken.some(b => url.includes(b)) ? { url, body: 'not a picture' } : { url, file: path.join(dir, name) });
  return answers;
}
const run = (args, answers, extra = {}) => runLookup('hlsndvi', args, { replay: answers, login: true, now: NOW, ...extra });
const ndvi = (r, n) => Math.round((n - r) / (n + r) * 1000) / 1000;

await group('a good answer for Oxford County', async () => {
  const list = [
    pass({ ago: 5, title: undefined }),                                                                        // newest period: clear, red 0.1 nir 0.5: NDVI 0.667
    pass({ ago: 40, cloud: 10, fmask: nine(2) }),                                                            // the clearest tile of its period, but cloud on the field itself ...
    pass({ ago: 41, prod: 'L', cloud: 30, red: nine(0.2), nir: nine(0.4) }),                                  // ... so the next candidate is used: NDVI 0.333
    pass({ ago: 70, cloud: 1, fmask: nine(16) }),                                                            // only snow in this period
    pass({ ago: 100, fmask: [0, 0, 0, 0, 0, 2, 2, 8, 4], red: [0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9], nir: [0.3, 0.3, 0.3, 0.3, 0.3, 0.01, 0.01, 0.01, 0.01] }), // five clear dots of nine: only they count
    pass({ ago: 130, fmask: [0, 0, 0, 0, 2, 2, 2, 8, 4] }),                                                  // four clear dots of nine: not enough
    pass({ ago: 160, fmask: nine(32) }),                                                                     // water
    pass({ ago: 190, fmask: nine('fill') }),                                                                 // the file's own "not known": not a clear dot
    pass({ ago: 220, red: [0.1, 0.1, 'fill', 0.1, 0.1, 'fill', 0.1, 0.1, 0.1], nir: nine(0.5) }),            // clear, but two dots have no reflectance: seven are used
    pass({ ago: 250, cloud: 50 }), pass({ ago: 250, tile: 'T17TNJ', cloud: 0 }),                                // the same pass seen from the next tile: counted once, from the first (the next tile's files are not served)
    pass({ ago: 280, fmask: nine(192) }),                                                                    // high aerosol only: the air was hazy, the dots are clear
  ];
  const r = await run(OXFORD, build({ list, serveTile: false })), a = r.answer;
  contract('hlsndvi', r, { secrets: ['tok-hand-made-5'] });
  check('it is a good answer', a?.ok === true, a);
  const by = d => a.passes.find(p => p.date === d);
  same('the newest pass: its date, its satellite, NDVI from red and near-infrared, nine clear dots of nine', [by(iso(5)).sensor, by(iso(5)).ndvi, by(iso(5)).clear_pixels, by(iso(5)).of_pixels], ['Sentinel-2', ndvi(0.1, 0.5), 9, 9]);
  same('a cloud on the field is never low greenness: the cloudy pass is passed over and the next candidate of the period is the reading', [by(iso(40)), by(iso(41)).sensor, by(iso(41)).ndvi], [undefined, 'Landsat 8 and 9', ndvi(0.2, 0.4)]);
  same('snow only: the period is left empty, not a low value', [by(iso(70)), a.gaps.some(g => g[0] <= iso(70) && iso(70) <= g[1])], [undefined, true]);
  same('five clear dots of nine are enough, and only those dots are averaged (the cloudy dots would have made it 0.0)', [by(iso(100)).clear_pixels, by(iso(100)).ndvi], [5, ndvi(0.1, 0.3)]);
  check('four clear dots of nine are not enough: the pass is not a reading', !by(iso(130)));
  check('water and "not known" are not readings', !by(iso(160)) && !by(iso(190)));
  same('dots with no reflectance are not used and not counted as clear: seven', [by(iso(220)).clear_pixels, by(iso(220)).ndvi], [7, ndvi(0.1, 0.5)]);
  same('the same pass from two tiles is one pass', a.passes.filter(p => p.date === iso(250)).length, 1);
  same('that pass is the one from the first tile', by(iso(250)).tile, 'T17TNH');
  same('high aerosol alone does not make a dot unclear', [by(iso(280)).clear_pixels, by(iso(280)).ndvi], [9, ndvi(0.1, 0.5)]);
  check('passes are oldest first', a.passes.every((p, i) => i === 0 || a.passes[i - 1].date <= p.date), a.passes.map(p => p.date));
  same('the newest reading', [a.newest_date, a.newest_ndvi], [iso(5), ndvi(0.1, 0.5)]);
  check('the reasons the other passes gave nothing are counted', a.not_usable.cloud >= 2 && a.not_usable.snow === 1 && a.not_usable.water === 1, a.not_usable);
  check('the periods with no clear pass are named as gaps, not filled', a.gaps.length >= 3 && a.gaps.every(g => g[0] <= g[1]), a.gaps);
  same('the window is the last 365 days; the box is 3 by 3 dots of 30 m', [a.window, a.box.pixels, a.box.size_m, a.pixel_m], [{ first: FIRST, last: LAST }, '3x3', 90, 30]);
  check('the source names HLS, 30 m and the DAAC; the units explain NDVI', /Harmonized Landsat and Sentinel-2/.test(a.source) && /30 m/.test(a.source) && /NDVI/.test(a.units), a.source);
  check('the note says what greenness is, that bad dots are never low greenness, and that empty periods stay empty', /about 30 m per dot/.test(a.note) && /never counted as low greenness/.test(a.note) && /left empty/.test(a.note), a.note);
  check('a whole answer carries no "incomplete" and no read errors', !('incomplete' in a) && a.read_errors === 0 && a.skipped_periods.length === 0);
});

await group('nothing clear, nothing listed, and files that cannot be read', async () => {
  const none = await run(OXFORD, build({ list: [pass({ ago: 5, fmask: nine(2) }), pass({ ago: 30, fmask: nine(16) })] })), n = none.answer;
  contract('nothing clear', none);
  check('no clear pass is a plain answer with no passes and a reason, never a made-up greenness', n.ok === true && n.passes.length === 0 && n.newest_ndvi === null && /None of the passes/.test(n.why_none), n);
  const empty = await run(OXFORD, build({}));
  contract('nothing listed', empty, { allowMiss: true });
  check('no pass over the place in the window: said plainly, not final', empty.answer.ok === false && /lists no Landsat or Sentinel-2/.test(empty.answer.reason) && !empty.answer.final, empty.answer);
  const one = await run(OXFORD, build({ list: [pass({ ago: 5 }), pass({ ago: 50 })], broken: [pass({ ago: 50 }).title] })), o = one.answer;
  contract('one pass unreadable', one);
  check('one pass that cannot be read is counted and said in words, the other is there', o.ok === true && o.passes.length === 1 && o.read_errors === 1 && /1 pass could not be read just now/.test(o.incomplete), o);
  const all = await run(OXFORD, build({ list: [pass({ ago: 5 }), pass({ ago: 50 })], broken: ['HLS.'] }));
  check('every pass unreadable: "try again", not final', all.answer.ok === false && /could not be read just now/.test(all.answer.reason) && !all.answer.final, all.answer);
  const refused = await run(OXFORD, build({ list: [pass({ ago: 5 })], urs: { status: 401 } }));
  check('a refused login is said plainly', /did not accept this computer's login/.test(refused.answer.reason), refused.answer);
  const nologin = await runLookup('hlsndvi', OXFORD, { replay: build({ list: [pass({ ago: 5 })] }), now: NOW });
  check('with no login on the computer it says so', nologin.answer.ok === false && /No NASA Earthdata login/.test(nologin.answer.reason), nologin.answer);
});

await group('a window given by hand, and arguments', async () => {
  const compact = d => d.replace(/-/g, '');
  const first = iso(100), last = iso(60);
  const r = await run([...OXFORD, compact(first), compact(last)], build({ list: [pass({ ago: 80 })], first, last })), a = r.answer;
  contract('a window', r);
  same('the window asked for is the window answered, with its own reading', [a.window, a.passes.map(p => p.date)], [{ first, last }, [iso(80)]]);
  const b = build({ list: [pass({ ago: 5 })] });
  for (const [name, args, why] of [['none', [], /required as decimal degrees/], ['text', ['abc', '5'], /required as decimal degrees/], ['too far north', ['91', '10'], /lat must be/], ['one day only', [...OXFORD, '20260101'], /required as decimal degrees/], ['not a day', [...OXFORD, ['2026', '01', '01'].join('-'), '20260201'], /YYYYMMDD/],
    ['last before first', [...OXFORD, '20260301', '20260201'], /must not be after/], ['three years', [...OXFORD, '20230101', '20261101'], /less than 800 days/]]) {
    const x = await run(args, b);
    check(`${name}: refused in plain words before anything is asked`, x.answer?.ok === false && why.test(x.answer.reason) && x.asked === 0, x.answer);
  }
});

finish();
