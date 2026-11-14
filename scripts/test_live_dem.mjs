// The height lookup's offline suite: scripts/live/dem.py with the network replaced by answers recorded from the live service on 14 November 2026
// (scripts/fixtures/live/dem-barrie, made by scripts/record_live_heights.mjs). It needs no internet and writes nothing outside a temp folder.
// RULE: never loosen a check here without a written farming reason beside it. A failure means a farmer would be shown land that is not there:
// a made-up height, a seam between two maps, or "flat" when the truth is "not read".  Run: node scripts/test_live_dem.mjs
import { check, same, group, finish, runLookup, contract } from './live_testlib.mjs';

const watchdog = setTimeout(() => { console.log('FAIL  the suite did not finish in 300 s'); finish(); process.exit(1); }, 300000);
const floats = b64 => { const buf = Buffer.from(b64, 'base64'); return Array.from({ length: buf.length / 4 }, (_, i) => buf.readFloatLE(i * 4)); };

await group('dem: Barrie, from the recorded answers', async () => {
  const r = await runLookup('dem', ['44.4000', '-79.7800', '120', '120', '9', '9'], { replay: 'dem-barrie' });
  contract('dem Barrie', r, { maxMB: 300 });
  const a = r.answer || {};
  check('the finest free map at Barrie is Canada\'s 1 m lidar, named with who publishes it', a.source_id === 'hrdem' && /NRCan HRDEM lidar, 1 m \(Natural Resources Canada\)/.test(a.source || ''), a.source);
  check('its real cell is said, and its credit and licence', a.native_m === 1 && a.res_m >= 1 && /Open Government Licence/.test(a.licence || '') && /Natural Resources Canada/.test(a.credit || ''), [a.native_m, a.res_m, a.licence]);
  same('the grid is the one asked for', [a.grid?.lat, a.grid?.lon, a.grid?.w, a.grid?.d, a.grid?.nx, a.grid?.ny], [44.4, -79.78, 120, 120, 9, 9]);
  check('the kind of height is said (bare ground or tops)', a.kind === 'DTM' || a.kind === 'DSM', a.kind);
  check('the date of the data is a day, with its note, never today\'s lookup time', /^\d{4}-\d\d-\d\d$/.test(a.data_date || '') && a.data_date !== (a.checked || '').slice(0, 10) && !!a.data_date_note, [a.data_date, a.data_date_note]);
  const h = floats(a.h || '');
  same('81 heights, one for each point of the 9 × 9 grid', h.length, 81);
  check('every point has a height, so the share is 1 and nothing was filled from another map', a.cover === 1 && h.every(Number.isFinite) && a.filled == null, [a.cover, a.filled]);
  check('the heights are those of land near Barrie (200 to 350 m above sea level), over a rise of under 30 m across 120 m', h.every(v => v > 200 && v < 350) && Math.max(...h) - Math.min(...h) < 30, [Math.min(...h), Math.max(...h)]);
  check('the units say that the heights are above sea level and that NaN is no height', /metres above sea level/.test(a.units || '') && /NaN/.test(a.units || ''), a.units);
  console.log(`dem Barrie (replayed): ${r.seconds.toFixed(1)} s, peak ${r.peakMB} MB`);
});

await group('dem: Woodstock (Oxford County, the demo field), from the recorded answers', async () => {
  const r = await runLookup('dem', ['43.1300', '-80.7500', '120', '120', '9', '9'], { replay: 'dem-woodstock' });
  contract('dem Woodstock', r, { maxMB: 300 });
  const a = r.answer || {};
  check('Canada\'s 1 m lidar covers the demo field, named with who publishes it', a.source_id === 'hrdem' && /NRCan HRDEM lidar, 1 m \(Natural Resources Canada\)/.test(a.source || ''), a.source);
  same('the grid is the one asked for', [a.grid?.lat, a.grid?.lon, a.grid?.w, a.grid?.d, a.grid?.nx, a.grid?.ny], [43.13, -80.75, 120, 120, 9, 9]);
  const h = floats(a.h || '');
  check('81 heights, every one read, none filled from another map', h.length === 81 && a.cover === 1 && h.every(Number.isFinite) && a.filled == null, [h.length, a.cover]);
  check('the heights are those of land near Woodstock (280 to 320 m above sea level), over a rise of under 12 m across 120 m', h.every(v => v > 280 && v < 320) && Math.max(...h) - Math.min(...h) < 12, [Math.min(...h), Math.max(...h)]);
  check('the date of the data is a day with its note', /^\d{4}-\d\d-\d\d$/.test(a.data_date || '') && !!a.data_date_note, a.data_date);
});

await group('dem: the box and the grid are refused in plain words', async () => {
  const cases = [
    [['44.4', '-79.78', '10', '120', '9', '9'], /^The box must be 20 m to 8 km a side, with 2 to 257 points/, 'a box under 20 m'],
    [['44.4', '-79.78', '9000', '120', '9', '9'], /^The box must be 20 m to 8 km a side/, 'a box over 8 km'],
    [['44.4', '-79.78', '120', '120', '1', '9'], /^The box must be 20 m to 8 km a side/, 'one point a side'],
    [['44.4', '-79.78', '120', '120', '300', '9'], /^The box must be 20 m to 8 km a side/, 'more than 257 points a side'],
    [['44.4', '-79.78', '', '120', '9', '9'], /required/, 'a blank width'],
    [['95', '-79.78', '120', '120', '9', '9'], /lat must be -90\.\.90|-84\.\.84|lat/, 'a latitude off the globe'],
  ];
  for (const [args, reason, what] of cases) {
    const r = await runLookup('dem', args, { replay: 'dem-barrie' });
    contract(`dem ${what}`, r, { allowMiss: true });
    check(`dem ${what}: ok false, in words, final or absent`, r.answer?.ok === false && reason.test(r.answer?.reason || ''), r.answer);
  }
});

// Not covered here: every map being down at once. A replayed run refuses an address that was not recorded with a test-only sentence, so that case needs hand-made 503 answers for each of the ten maps.

clearTimeout(watchdog);
finish();
