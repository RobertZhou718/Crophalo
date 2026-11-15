// Crophalo's offline suite for the ground-temperature lookup (scripts/live/ecopass.py): NASA's catalogue and token service are replaced by hand-made answers, and every ECOSTRESS GeoTIFF by a small
// one built the real way by rasterio (UTM 17N, 70 m pixels, the same layer names and types), whose neighbours of the field's pixel are deliberately cloudy or wrong, so only the field's own pixel can pass.
// No internet and no login is needed. The live check is scripts/live_check_ecopass.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A cloudy pixel shown as a ground temperature, or two passes at different hours compared as one, would tell a farmer something the satellite never saw. Run: node scripts/test_live_ecopass.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, PYTHON, URS_TOKEN } from './live_testlib.mjs';

const NOW = '2026-11-18T12:00:00Z', CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json', OXFORD = ['43.13', '-80.75'];
const day = n => new Date(Date.UTC(2026, 10, 18) - n * 864e5).toISOString().slice(0, 10);
const FIRST = day(365), LAST = day(0);   // a whole year of passes is asked for (day passes over the last 365 days)
const MAKER = `
import sys, json, numpy as np, rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform
spec = json.load(open(sys.argv[1])); out = sys.argv[2]
x, y = (v[0] for v in transform('EPSG:4326', 'EPSG:32617', [-80.75], [43.13]))
left, top = np.floor(x / 70) * 70 - 6 * 70, np.ceil(y / 70) * 70 + 6 * 70
for f in spec:
    dt = f['dtype']; a = np.full((13, 13), f['other'], dtype=dt); a[6, 6] = f['center']
    with rasterio.open(out + '/' + f['name'], 'w', driver='GTiff', width=13, height=13, count=1, dtype=dt, crs='EPSG:32617', transform=from_origin(left, top, 70, 70), nodata=f.get('nodata')) as d:
        d.write(a, 1)
`;
const NAME = p => `ECOv00${p.v}_L2T_LSTE_${p.orbit}_${p.scene}_17TNH_${p.stamp}_01`;
const BASE = p => `https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/ECO_L2T_LSTE.00${p.v}/${NAME(p)}/${NAME(p)}`;
// a pass: date (days before the pinned today), utc time, orbit, scene, version, and what the field's own pixel holds (K, error K, QC code, cloud, water); the neighbours hold the opposite
const pass = (o) => ({ v: 3, scene: '006', lst: 285.15, err: 1.2, qc: 0, cloud: 0, water: 0, ago: 3, time: '07:02:19', night: 'NIGHT', ...o, orbit: String(o.orbit), stamp: `${day(o.ago ?? 3).replace(/-/g, '')}T${(o.time || '07:02:19').replace(/:/g, '')}` });
const LAYERS = p => ({ LST: ['float32', Number.isNaN(p.lst) ? 'nan' : p.lst, 400, NaN], LST_err: ['float32', p.err, 99, NaN], QC: ['uint16', p.qc, 0, null], cloud: ['uint8', p.cloud, 1 - (p.cloud === 255 ? 0 : p.cloud), 255], water: ['uint8', p.water, 1 - p.water, null] });
const granule = p => {
  const when = `${day(p.ago ?? 3)}T${p.time || '07:02:19'}.229Z`;
  const links = ['LST', 'LST_err', 'QC', 'cloud', 'water', 'view_zenith', 'Emis3_err', 'height'].map(l => ({ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: `${BASE(p)}_${l}.tif` }));
  return { title: NAME(p), time_start: when, day_night_flag: p.night || 'NIGHT', links: [...links, { rel: 'http://esipfed.org/ns/fedsearch/1.1/s3#', href: 's3://x/y.tif' }, { rel: 'http://esipfed.org/ns/fedsearch/1.1/browse#', href: `${BASE(p)}.png` }] };
};
const cmrUrl = version => `${CMR}?${[['short_name', 'ECO_L2T_LSTE'], ['version', version], ['point', '-80.75,43.13'], ['sort_key', '-start_date'], ['temporal', `${FIRST}T00:00:00Z,${LAST}T23:59:59Z`], ['page_size', 100]].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
function build({ v3 = [], v2 = [], broken = [], urs = { status: 200, body: { access_token: 'tok-hand-made-4' } } } = {}) {
  const dir = tempFolder('ecopass'), answers = path.join(dir, 'answers'), files = [], serve = [];
  for (const p of [...v3, ...v2]) {
    for (const [layer, [dtype, center, other, nodata]] of Object.entries(LAYERS(p))) {
      const name = `${NAME(p)}_${layer}.tif`;
      if (!fs.existsSync(path.join(dir, name)) && !files.some(f => f.name === name)) files.push({ name, dtype, center: center === 'nan' ? NaN : center, other: Number.isNaN(other) || center === 'nan' ? NaN : other, nodata });
      serve.push([`${BASE(p)}_${layer}.tif`, name]);
    }
  }
  const spec = files.map(f => ({ ...f, center: Number.isNaN(f.center) ? 'NaN' : f.center, other: Number.isNaN(f.other) ? 'NaN' : f.other }));
  fs.writeFileSync(path.join(dir, 'make.py'), MAKER.replace("f['dtype']; a = np.full((13, 13), f['other'], dtype=dt); a[6, 6] = f['center']", "f['dtype']; a = np.full((13, 13), float(f['other']), dtype=dt); a[6, 6] = float(f['center'])"));
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec));
  const made = spawnSync(PYTHON, ['-I', path.join(dir, 'make.py'), path.join(dir, 'spec.json'), dir], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error('the test files could not be made: ' + made.stderr.slice(-500));
  addAnswer(answers, { url: cmrUrl('003'), body: { feed: { entry: v3.map(granule) } } });
  addAnswer(answers, { url: cmrUrl('002'), body: { feed: { entry: v2.map(granule) } } });
  addAnswer(answers, { method: 'POST', url: URS_TOKEN, status: urs.status, body: urs.body ?? '' });
  for (const [url, name] of serve) {
    const broke = broken.some(b => url.includes(b));
    addAnswer(answers, broke ? { url, body: 'not a picture' } : { url, file: path.join(dir, name) });
  }
  return answers;
}
const run = (args, answers, extra = {}) => runLookup('ecopass', args, { replay: answers, login: true, now: NOW, ...extra });
const solar = (utc, lon) => { const [h, m] = utc.split(':').map(Number), t = ((h * 60 + m + Math.round(lon / 15 * 60)) % 1440 + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

await group('a good answer for Oxford County', async () => {
  const v3 = [
    pass({ orbit: 47300, ago: 2, time: '07:50:20', lst: 271.35, err: 1.0 }),                            // clear, at night
    pass({ orbit: 47301, ago: 3, time: '12:00:00', cloud: 1 }),                                         // cloud
    pass({ orbit: 47302, ago: 4, time: '14:10:10', night: 'DAY', lst: 293.65, err: 1.6 }),                // clear, in the day
    pass({ orbit: 47303, ago: 5, time: '09:00:00', qc: 1 }),                                            // nominal quality only: possible cloud contamination: not used
    pass({ orbit: 47304, ago: 6, time: '09:10:00', lst: NaN }),                                         // the pixel was not seen
    pass({ orbit: 47305, ago: 7, time: '08:00:00', water: 1 }),                                         // water
    pass({ orbit: 47306, ago: 8, time: '19:30:00', night: 'DAY', lst: 297.15 }),                         // clear
    pass({ orbit: 47306, scene: '007', ago: 8, time: '19:31:00', night: 'DAY', lst: 297.15 }),           // the next scene of the same overpass: one pass, not two
    pass({ orbit: 47307, ago: 9, time: '03:00:00', cloud: 255 }),                                       // cloud "not known": not a reading
    pass({ orbit: 47308, ago: 10, time: '04:00:00', lst: 150 }),                                        // a broken value
    pass({ orbit: 47309, ago: 11, time: '05:00:00', lst: 280.15 }),                                     // clear, but past the four wanted
  ];
  const v2 = [pass({ v: 2, orbit: 47301, ago: 3, time: '12:00:01', cloud: 0, lst: 299 }), pass({ v: 2, orbit: 47320, ago: 1, time: '06:30:00', lst: 275.65, err: 0.9 })];
  const r = await run(OXFORD, build({ v3, v2 })), a = r.answer;
  contract('ecopass', r, { secrets: ['tok-hand-made-4'] });
  check('it is a good answer', a?.ok === true, a);
  same('every clear pass of the year, newest first (nothing is cut at four any more): the version 002 pass that version 003 lacks is in, the pass both have is from 003 (cloudy), never from 002', a.passes.map(p => [p.orbit, p.version]), [[47320, '002'], [47300, '003'], [47302, '003'], [47306, '003'], [47309, '003']]);
  const p0 = a.passes[1];
  same('a pass says its date, UTC time, local solar time, day or night, ground temperature in both units and its own error', [p0.date, p0.utc, p0.solar_time, p0.day_night, p0.lst_c, p0.lst_k, p0.error_k], [day(2), '07:50', solar('07:50', -80.75), 'night', -1.8, 271.35, 1]);
  same('a day pass is named a day pass, at its own hour', [a.passes[2].day_night, a.passes[2].solar_time, a.passes[2].lst_c], ['day', solar('14:10', -80.75), 20.5]);
  check('the field\'s own pixel only: its cloudy, wrong neighbours never leak in', a.passes.every(p => p.lst_c < 30 && p.lst_c > -5), a.passes);
  same('five clear passes are given and the passes looked at were counted', [a.clear_passes, a.passes_checked >= 9, a.passes_found >= 11], [5, true, true]);
  same('the summary counts clear day passes and the days of 45 C or more (none here), with the source of the 45 C beside it', [a.summary.day_clear, a.summary.hot_days, a.summary.hot_c, a.summary.max_day_c, /Crop Science/.test(a.summary.hot_source)], [2, 0, 45, 24, true]);
  check('nominal quality, cloud, water, "not seen" and a broken value are each counted as not usable and never a reading', a.not_usable.cloud === 1 && a.not_usable.water === 1 && a.not_usable.quality >= 1 && a.not_usable.no_data >= 1, a.not_usable);
  check('the next scene of the same overpass is not a second pass', a.passes.filter(p => p.orbit === 47306).length === 1);
  same('the newest clear pass and the data date are its day', [a.newest_clear, a.data_date], [day(1), day(1)]);
  same('the search window is the last 365 days', a.window, { first: FIRST, last: LAST });
  check('the source names ECOSTRESS and the 70 m; the units say surface temperature, not air', /ECOSTRESS/.test(a.source) && a.pixel_m === 70 && /not the air temperature/.test(a.units), a.units);
  check('the note says the passes are at different hours and a bad pixel is never used', /different times of day/.test(a.note) && /never used/.test(a.note), a.note);
  check('a whole answer carries no "incomplete" and no "why_none"', !('incomplete' in a) && !('why_none' in a) && a.read_errors === 0);
});

await group('the days of 45 C or more are counted as days, at the line and not below it, by day only', async () => {
  const list = [
    pass({ orbit: 47600, ago: 2, time: '19:00:00', night: 'DAY', lst: 320.15 }),    // 47 C by day: hot
    pass({ orbit: 47601, ago: 2, time: '20:30:00', night: 'DAY', lst: 322.15 }),    // the same day again, 49 C: still one hot day
    pass({ orbit: 47602, ago: 9, time: '19:00:00', night: 'DAY', lst: 318.15 }),    // 45.0 C exactly: hot (the line is "45 C or more")
    pass({ orbit: 47603, ago: 20, time: '19:00:00', night: 'DAY', lst: 317.05 }),   // 43.9 C: not hot
    pass({ orbit: 47604, ago: 30, time: '03:00:00', night: 'NIGHT', lst: 321.15 }), // 48 C at night (a hot test value): a night pass is never counted
    pass({ orbit: 47605, ago: 200, time: '19:00:00', night: 'DAY', lst: 305.15 }),  // six months back: inside the year, 32 C
  ];
  const r = await run(OXFORD, build({ v3: list })), a = r.answer;
  contract('hot days', r);
  same('two hot passes on one day are one hot day, the exact line counts, 43.9 C and any night pass do not', [a.summary.hot_days, a.summary.day_clear, a.summary.night_clear, a.summary.max_day_c], [2, 4, 1, 49]);
  check('a pass from half a year ago is inside the window and is in the list', a.passes.some(p => p.orbit === 47605), a.passes.map(p => p.orbit));
});

await group('a whole year of passes (about ninety, one every four days) stays inside the memory rule', async () => {
  const list = Array.from({ length: 90 }, (_, i) => pass({ orbit: 48000 + i, ago: 1 + i * 4, time: '19:10:00', night: 'DAY', lst: 290 + (i % 30), cloud: i % 3 === 0 ? 1 : 0 }));
  const r = await run(OXFORD, build({ v3: list }), { env: { FW_ECO_NEW_PER_ASK: '400' } }), a = r.answer;
  contract('a year of passes', r);
  check('every pass of the year was looked at and the clear ones are listed (60 of 90: every third is cloudy)', a.ok === true && a.passes_checked === 90 && a.clear_passes === 60 && a.not_usable.cloud === 30, [a.passes_checked, a.clear_passes, a.not_usable]);
  check('the oldest pass is from the last days of the year asked for, and none is older than the window', a.passes.at(-1).date >= FIRST && a.passes.length === 60, a.passes.at(-1)?.date);
  check('the peak memory stays far inside the 512 MB host (the rule here is 300 MB)', r.peakMB !== null && r.peakMB < 300, r.peakMB);
});

await group('a year is read over several asks: each ask goes on where the last one stopped, newest first, nothing read twice', async () => {
  const list = Array.from({ length: 90 }, (_, i) => pass({ orbit: 49000 + i, ago: 1 + i * 4, time: '19:10:00', night: 'DAY', lst: i === 5 ? 320.15 : 290 + (i % 30) })), answers = build({ v3: list }), cache = tempFolder('ecoyear'), env = { FW_ECO_NEW_PER_ASK: '30' };
  const one = await run(OXFORD, answers, { cache, env }), two = await run(OXFORD, answers, { cache, env }), three = await run(OXFORD, answers, { cache, env }), fourth = await run(OXFORD, answers, { cache, env });
  for (const [n, r] of [[1, one], [2, two], [3, three], [4, fourth]]) contract(`ask ${n} of a year`, r);
  const c = [one, two, three, fourth].map(r => r.answer.coverage);
  same('the first ask reads the newest 30 of 90 and says it is not complete', [c[0].found, c[0].examined, c[0].newly_read, c[0].kept, c[0].complete], [90, 30, 30, 0, false]);
  same('the second ask takes those 30 from what was kept and reads the next 30 (older ones)', [c[1].examined, c[1].newly_read, c[1].kept, c[1].complete], [60, 30, 30, false]);
  same('the third ask finishes the year: 90 of 90, complete, nothing newer was read again', [c[2].examined, c[2].newly_read, c[2].kept, c[2].complete], [90, 30, 60, true]);
  same('a fourth ask reads nothing new and is the same complete answer', [c[3].newly_read, c[3].kept, c[3].complete, JSON.stringify(fourth.answer.passes) === JSON.stringify(three.answer.passes)], [0, 90, true, true]);
  check('each ask goes further back in time, and says how far: "back to" moves to older days', c[0].back_to > c[1].back_to && c[1].back_to > c[2].back_to, c.map(x => x.back_to));
  check('an incomplete ask says so in words, with the numbers, and a complete one does not', /so far the newest 30 of 90 passes were read, back to \d{4}-\d{2}-\d{2}; the rest are read on the next ask/.test(one.answer.incomplete) && /newest 60 of 90/.test(two.answer.incomplete) && !('incomplete' in three.answer), [one.answer.incomplete, three.answer.incomplete]);
  check('the later asks asked NASA for much less than the first: the kept readings are not read again', two.asked < one.asked + 5 && fourth.asked <= 4 && one.asked > 100, [one.asked, two.asked, three.asked, fourth.asked]);
  same('the count of clear days grows with each ask as the older passes are read: 30, 60, 90, 90', [one, two, three, fourth].map(r => r.answer.summary.day_clear), [30, 60, 90, 90]);
});

await group('what a pass held is kept, and a token from the server is used', async () => {
  const list = [pass({ orbit: 47500, ago: 2 }), pass({ orbit: 47501, ago: 3, cloud: 1 }), pass({ orbit: 47502, ago: 4, lst: NaN }), pass({ orbit: 47503, ago: 5, qc: 2 })], cache = tempFolder('ecocache');
  const answers = build({ v3: list }), first = await run(OXFORD, answers, { cache }), second = await run(OXFORD, answers, { cache });
  contract('kept passes', second);
  same('the first run reads every pass, the second reads only the catalogue and the token: the same answer', [first.answer.ok, second.answer.ok, second.answer.passes, second.answer.not_usable], [true, true, first.answer.passes, first.answer.not_usable]);
  check('the second run asked far less: no layer of any pass was read again', second.asked <= 4 && first.asked > second.asked + 6, [first.asked, second.asked]);
  const fresh = await run(OXFORD, answers, { cache: tempFolder('ecocache2') });
  same('a run with nothing kept gives the same answer, so the keeping changes nothing but the time', [fresh.answer.passes, fresh.answer.not_usable], [first.answer.passes, first.answer.not_usable]);
  const given = await runLookup('ecopass', OXFORD, { replay: answers, now: NOW, env: { EARTHDATA_TOKEN: 'tok-from-the-server-0123456789' } });
  contract('token from the server', given, { secrets: ['tok-from-the-server-0123456789'] });
  check('a token handed in by the server is used: no login on the computer, no token asked for', given.answer?.ok === true && given.asked === first.asked - 1, [given.asked, first.asked, given.answer]);
  const short = await runLookup('ecopass', OXFORD, { replay: answers, now: NOW, env: { EARTHDATA_TOKEN: 'short' } });
  check('a token that is not a token is ignored, and with no login the lookup says so', short.answer?.ok === false && /No NASA Earthdata login/.test(short.answer.reason), short.answer);
});

await group('no clear pass, no pass at all, and one pass that cannot be read', async () => {
  const none = await run(OXFORD, build({ v3: [pass({ orbit: 47400, cloud: 1 }), pass({ orbit: 47401, ago: 5, qc: 2 })] })), n = none.answer;
  contract('no clear pass', none);
  check('no clear pass is a plain answer with no passes, never a made-up temperature', n.ok === true && n.passes.length === 0 && n.clear_passes === 0 && n.newest_clear === null && /None of the 2 passes/.test(n.why_none), n);
  same('the data date is then the whole window', n.data_date, `${FIRST}/${LAST}`);
  const empty = await run(OXFORD, build({}));
  contract('no pass at all', empty, { allowMiss: true });
  check('no granule over the place: said plainly, not final (a pass may come)', empty.answer.ok === false && /lists no ECOSTRESS pass/.test(empty.answer.reason) && !empty.answer.final, empty.answer);
  const one = await run(OXFORD, build({ v3: [pass({ orbit: 47410, ago: 2 }), pass({ orbit: 47411, ago: 3 }), pass({ orbit: 47412, ago: 4 })], broken: ['47411'] })), o = one.answer;
  contract('one pass unreadable', one);
  check('one pass that could not be read is counted, said in words, and the others are there', o.ok === true && o.read_errors === 1 && o.passes.length === 2 && /1 pass could not be read just now/.test(o.incomplete), o);
  const all = await run(OXFORD, build({ v3: [pass({ orbit: 47420 }), pass({ orbit: 47421, ago: 4 })], broken: ['_17TNH_'] }));
  check('every pass unreadable: "try again", not final, never a list of nothing', all.answer.ok === false && /could not be read just now/.test(all.answer.reason) && !all.answer.final, all.answer);
  const refused = await run(OXFORD, build({ v3: [pass({ orbit: 47430 })], urs: { status: 401 } }));
  check('a refused login is said plainly', /did not accept this computer's login/.test(refused.answer.reason), refused.answer);
  const nologin = await runLookup('ecopass', OXFORD, { replay: build({ v3: [pass({ orbit: 47440 })] }), now: NOW });
  check('with no login on the computer it says so', nologin.answer.ok === false && /No NASA Earthdata login/.test(nologin.answer.reason), nologin.answer);
});

await group('arguments', async () => {
  const b = build({ v3: [pass({ orbit: 47450 })] });
  for (const [name, args, why] of [['none', [], /required as decimal degrees/], ['text', ['abc', '5'], /required as decimal degrees/], ['too far north (ECOSTRESS does not fly there)', ['60', '10'], /lat must be/], ['too far east', ['44', '190'], /lon -180/]]) {
    const r = await run(args, b);
    check(`${name}: refused in plain words before anything is asked`, r.answer?.ok === false && why.test(r.answer.reason) && r.asked === 0, r.answer);
  }
});

finish();
