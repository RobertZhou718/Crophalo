// The offline suite of "What this field grew": scripts/live/crophist.py, run the way the server runs it, with the network ALWAYS replaced by
// answers recorded from the live public crop maps on 15 November 2026 (scripts/fixtures/live/crophist/mead: USDA's CroplandCROS service at the
// Mead, Nebraska demo field, its outline, with the fields around it; scripts/fixtures/live/crophist/oxford: AAFC's Annual Crop Inventory at a
// pin on a farm field in Oxford County, Ontario, with the fields around it), and by changed copies of them. Run: node scripts/test_crophist.mjs
/* RULE: never loosen a check here without a written farming reason beside it. */
/*
 * A failure means a farmer would be told the wrong crop for a year of their own field, a year nobody read would look read,
 * or the field's own points would be counted as "the fields around you".
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, group, finish, runLookup, contract, copyOf, alter, tempFolder, PYTHON, LIVE_DIR, ROOT } from './live_testlib.mjs';
import { isCrop } from '../js/crops.js';
import { flagged } from './wordguard.mjs';

const watchdog = setTimeout(() => { console.log('FAIL  the suite did not finish in 300 s'); finish(); process.exit(1); }, 300000);
const MEAD = ['41.1795', '-96.4398', 'US'];
// The demo field's outline (crophalo-work-backup/demo-field-us/field_ring.json), written to 4 decimals as the server writes it.
const MEAD_RING = '-96.4446,41.1830;-96.4349,41.1830;-96.4349,41.1829;-96.4349,41.1759;-96.4440,41.1759;-96.4447,41.1764;-96.4446,41.1830';
// The same box with its north-west corner cut off: the 3 x 3 grid is the same, and only the north-west point falls outside.
const MEAD_CUT = '-96.4447,41.1759;-96.4349,41.1759;-96.4349,41.1830;-96.4398,41.1830;-96.4447,41.17945';
const OXFORD = ['43.2500', '-80.8000', 'CA'];
const ring = text => text.split(';').map(p => p.split(',').map(Number));
const inside = (x, y, r) => { let hit = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit; } return hit; };
const metres = ([la1, lo1], [la2, lo2]) => Math.hypot((la1 - la2) * 110574, (lo1 - lo2) * 111320 * Math.cos(la1 * Math.PI / 180));
const isGetSamples = (a, year, big) => a.method === 'POST' && a.url.includes(`/${year}/ImageServer/getSamples`) && (fs.statSync(a.bodyFile).size > 10000) === big;
const failure = (name, r, re, final = false) => {
  contract(name, r, { allowMiss: true });
  check(`${name}: a failure in plain words${final ? ', final' : ', not final'}`, r.answer?.ok === false && re.test(r.answer.reason) && !!r.answer.final === final, r.answer);
};
const yearsOf = a => (a?.field || []).map(f => f.year);

// ---- Mead, Nebraska: the outline, with the fields around it
let mead;
await group('Mead: the recorded answer', async () => {
  const r = await runLookup('crophist', [...MEAD, '1', MEAD_RING], { replay: 'crophist/mead', limitS: 120 });
  contract('mead', r);
  mead = r.answer;
  const a = mead;
  check('it answers from the recordings, nothing more asked', a?.ok === true && r.misses.length === 0, a);
  check('source, years and licence are named: the USDA Cropland Data Layer through CroplandCROS, public domain',
    /USDA NASS Cropland Data Layer 2008 to 2025/.test(a.source) && /CroplandCROS/.test(a.source) && a.data_date === '2008/2025' && a.licence === 'public domain (USDA NASS)', [a.source, a.data_date, a.licence]);
  same('R1: an outline gives the 3 x 3 grid at 1/6, 1/2 and 5/6 of its box, all 9 inside this field', [a.where, a.points, a.points_read, a.spots.length], ['outline', 9, 9, 9]);
  const r1 = ring(MEAD_RING), xs = r1.map(p => p[0]), ys = r1.map(p => p[1]);
  const W = Math.min(...xs), E = Math.max(...xs), S = Math.min(...ys), N = Math.max(...ys);
  const want = [5 / 6, 1 / 2, 1 / 6].flatMap(fy => [1 / 6, 1 / 2, 5 / 6].map(fx => [+(S + (N - S) * fy).toFixed(6), +(W + (E - W) * fx).toFixed(6)]));
  same('R1: the points are where the rule puts them, north row first', a.spots, want);
  same('the years covered: 2008 to 2025, newest first, none missing', [a.years, yearsOf(a)[0], yearsOf(a).at(-1), a.field.length, a.not_read], [{ first: 2008, last: 2025 }, 2025, 2008, 18, []]);
  same('Mead: corn in odd years and soybeans in even years, all 9 points agreeing', a.field.map(f => [f.year, f.crop, f.agree]), yearsOf(a).map(y => [y, y % 2 ? 'corn' : 'soy', 9]));
  check('each year carries the class at each point, in the order of the spots', a.field.every(f => f.classes.length === 9 && f.classes.every(c => c === (f.year % 2 ? 1 : 5))));
  check('the class names are the map\'s own (USDA class list): Corn, Soybeans', a.field.every(f => f.name === (f.year % 2 ? 'Corn' : 'Soybeans') && f.mixed === false && f.unread === 0));
  check('every crop named is a crops.js id, through the crop-map lookup\'s own table', a.field.every(f => f.crop === null || isCrop(f.crop)));
  check('a whole answer is not marked partial', !('incomplete' in a));
  console.log(`mead (replayed): ${r.seconds.toFixed(1)} s, peak ${r.peakMB} MB, ${r.asked} requests`);
});

await group('Mead: the fields around it (R4 counts)', async () => {
  const n = mead?.near;
  check('the neighbour counts are there with near=1', n && n.radius_km === 3 && n.step_m === 170, n);
  same('the newest 9 years, 8 pairs of years', [n?.years, n?.pairs], [{ first: 2017, last: 2025 }, 8]);
  check('every count adds up to its n (soybeans, corn, the rest, and "other")', n && Object.values(n.after).every(row => Object.entries(row).filter(([k]) => k !== 'n').reduce((s, [, v]) => s + v, 0) === row.n));
  check('the crops are crops.js ids, or "other" for a class that is not one crop alone', n && Object.entries(n.after).every(([k, row]) => isCrop(k) && Object.keys(row).every(c => c === 'n' || c === 'other' || isCrop(c))));
  same('around Mead, after corn: the map\'s own counts', n && [n.after.corn.soy, n.after.corn.corn, n.after.corn.n], [1659, 292, 2035]);
  check('the sample is large enough to show (n of 50 or more)', n?.after.corn.n >= 50);
  // The grid itself, from the lookup's own code, checked here with an independent point-in-outline test.
  const out = path.join(tempFolder('grid'), 'grid.json');
  const py = spawnSync(PYTHON, ['-c', `import json,sys,crophist as c
r=c.ring_of(sys.argv[1]);f=c.field_points(41.1795,-96.4398,r);g=c.near_points(41.1795,-96.4398,r);fp=c.field_points(43.25,-80.8,None);gp=c.near_points(43.25,-80.8,None)
open(sys.argv[2],'w').write(json.dumps({'field':f,'grid':g,'pinfield':fp,'pingrid':gp}))`, MEAD_RING, out], { cwd: LIVE_DIR, encoding: 'utf8', env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' } });
  check('the grid could be built', py.status === 0 && fs.existsSync(out), py.stderr.slice(-400));
  if (!fs.existsSync(out)) return;
  const G = JSON.parse(fs.readFileSync(out, 'utf8')), r1 = ring(MEAD_RING);
  same('the field\'s points are never in the neighbour counts: no grid point inside the outline', G.grid.filter(([y, x]) => inside(x, y, r1)).length, 0);
  same('no grid point is one of the field\'s own points', G.grid.filter(p => G.field.some(q => metres(p, q) < 1)).length, 0);
  check('the grid points that were left out are exactly those inside the outline', G.grid.length === n?.grid_points && G.grid.length < 973, [G.grid.length, n?.grid_points]);
  check('every grid point is within 3 km of the centre, and no request holds more than 1,000', G.grid.every(p => metres(p, [41.1795, -96.4398]) <= 3001) && G.grid.length <= 1000);
  same('with a pin only, no grid point within 90 m of the pin (its 9 points lie within 85 m)', G.pingrid.filter(p => metres(p, [43.25, -80.8]) <= 90).length, 0);
  same('R1 with a pin only: the pin and 8 points 60 m around it', [G.pinfield.length, G.pinfield.filter(p => Math.abs(metres(p, [43.25, -80.8]) - 60) < 1).length, G.pinfield.filter(p => metres(p, [43.25, -80.8]) < 1).length], [9, 4, 1]);
});

await group('Mead: near=0 asks the field only', async () => {
  const r = await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: 'crophist/mead' });
  contract('mead near=0', r);
  same('no neighbour counts and no neighbour requests: 9 identify calls', [r.answer?.ok, 'near' in (r.answer || {}), 'near_reason' in (r.answer || {}), r.asked], [true, false, false, 9]);
  same('the field\'s years are the same as with near=1', r.answer?.field, mead?.field);
});

await group('R1: a point outside the outline is dropped', async () => {
  const r = await runLookup('crophist', [...MEAD, '0', MEAD_CUT], { replay: 'crophist/mead' });
  contract('cut outline', r);
  const a = r.answer;
  same('8 points: the north-west one falls outside and is not read', [a?.points, a?.spots.length, a?.spots.some(([y, x]) => !inside(x, y, ring(MEAD_CUT)))], [8, 8, false]);
  same('the north-west point is the one dropped', a?.spots[0], mead?.spots[1]);
  same('still corn and soybeans in turn, now 8 of 8', a?.field.slice(0, 2).map(f => [f.crop, f.agree]), [['corn', 8], ['soy', 8]]);
});

await group('R2: a year\'s crop is the one more than half of the points show', async () => {
  const dir = copyOf('crophist/mead', 'r2');
  // 2023 at the first 5 points becomes soybeans; at the first 4 points of 2021, soybeans and at two more, winter wheat.
  let k = 0;
  alter(dir, a => a.url.includes('/identify?'), (meta, body) => {
    const j = JSON.parse(fs.readFileSync(body, 'utf8')), y = j.catalogItems.features.map(f => f.attributes.Year);
    if (k < 5) j.properties.Values[y.indexOf(2023)] = '5';
    if (k < 4) j.properties.Values[y.indexOf(2021)] = '5'; else if (k < 6) j.properties.Values[y.indexOf(2021)] = '24';
    if (k === 0) j.properties.Values[y.indexOf(2019)] = '37';
    k++;
    fs.writeFileSync(body, JSON.stringify(j));
  });
  const r = await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: dir });
  contract('r2', r);
  const y = Object.fromEntries((r.answer?.field || []).map(f => [f.year, f]));
  same('5 of 9 is more than half: that crop', [y[2023]?.crop, y[2023]?.agree, y[2023]?.mixed], ['soy', 5, false]);
  same('4 of 9 is not: the year is null ("mixed"), and says how many agreed', [y[2021]?.crop, y[2021]?.agree, y[2021]?.mixed, y[2021]?.code, y[2021]?.name], [null, 4, true, null, null]);
  same('8 of 9 still makes the year corn; the odd point is kept in the classes', [y[2019]?.crop, y[2019]?.agree, y[2019]?.classes.filter(c => c === 37).length], ['corn', 8, 1]);
});

await group('R2 with an even number of points: half is not more than half', async () => {
  const dir = copyOf('crophist/mead', 'r2even');
  // The cut outline reads 8 points; 2023 becomes soybeans at exactly 4 of them (the two north points left and the two west middle ones).
  const spots = (mead?.spots || []).slice(1, 5).map(([y, x]) => `${y},${x}`);
  const changed = alter(dir, a => a.url.includes('/identify?'), (meta, body) => {
    const g = JSON.parse(new URL(meta.url).searchParams.get('geometry'));
    if (!spots.includes(`${g.y},${g.x}`)) return;
    const j = JSON.parse(fs.readFileSync(body, 'utf8')), y = j.catalogItems.features.map(f => f.attributes.Year);
    j.properties.Values[y.indexOf(2023)] = '5';
    fs.writeFileSync(body, JSON.stringify(j));
  });
  const r = await runLookup('crophist', [...MEAD, '0', MEAD_CUT], { replay: dir });
  const y = Object.fromEntries((r.answer?.field || []).map(f => [f.year, f]));
  same('4 of 8 soybeans and 4 of 8 corn: the year is null ("mixed"), agree 4', [changed, r.answer?.points, y[2023]?.crop, y[2023]?.agree, y[2023]?.mixed], [9, 8, null, 4, true]);
});

// ---- Oxford County, Ontario: a pin, with the fields around it
let oxford;
await group('Oxford: the recorded answer', async () => {
  const r = await runLookup('crophist', [...OXFORD, '1'], { replay: 'crophist/oxford', limitS: 120 });
  contract('oxford', r);
  oxford = r.answer;
  const a = oxford;
  check('it answers from the recordings', a?.ok === true && r.misses.length === 0, a);
  check('source, years and licence: AAFC Annual Crop Inventory 2011 to 2025, Open Government Licence - Canada',
    /Annual Crop Inventory 2011 to 2025/.test(a.source) && a.data_date === '2011/2025' && a.licence === 'Open Government Licence - Canada', [a.source, a.licence]);
  same('a pin: 9 points', [a.where, a.points, a.points_read], ['pin', 9, 9]);
  same('2011 to 2025, newest first', yearsOf(a), Array.from({ length: 15 }, (_, i) => 2025 - i));
  same('the field as the map shows it, newest first', a.field.map(f => f.crop ?? f.name), ['corn', 'soy', 'corn', 'soy', 'Pasture/forages', 'Pasture/forages', 'Pasture/forages', 'Pasture/forages', 'wheat', 'soy', 'corn', 'soy', 'corn', 'Pasture/forages', 'Pasture/forages']);
  same('a class that holds several crops is named, never turned into one crop; it is not a "mixed" year', [a.field[4].crop, a.field[4].code, a.field[4].mixed], [null, 122, false]);
  same('2013: 6 of 9 points corn', [a.field[12].crop, a.field[12].agree], ['corn', 6]);
  same('the neighbours: 8 pairs of years, every pair from the map', [a.near?.pairs, a.near?.years, a.near?.after.corn.n], [8, { first: 2017, last: 2025 }, 3889]);
});

await group('a year a service does not answer is left out and named', async () => {
  const dir = copyOf('crophist/oxford', 'year');
  same('the 2016 field request answers 503 twice', alter(dir, a => isGetSamples(a, 2016, false), m => { m.replies = [{ status: 503 }]; }), 1);
  const r = await runLookup('crophist', [...OXFORD, '0'], { replay: dir });
  contract('2016 not read', r);
  const a = r.answer;
  same('2016 is left out of the years and named', [a?.ok, yearsOf(a).includes(2016), a?.not_read, a?.incomplete], [true, false, [2016], '2016 not read']);
  same('the years around it are still read', [yearsOf(a).includes(2015), yearsOf(a).includes(2017), a?.years], [true, true, { first: 2011, last: 2025 }]);
});

await group('a neighbour year that does not answer', async () => {
  const dir = copyOf('crophist/oxford', 'nearyear');
  same('the 2020 neighbour request breaks off twice', alter(dir, a => isGetSamples(a, 2020, true), m => { m.replies = [{ fail: 'connection reset' }]; }), 1);
  const r = await runLookup('crophist', [...OXFORD, '1'], { replay: dir });
  contract('2020 around not read', r);
  const a = r.answer;
  same('the pairs with 2020 are not counted, the year is named, the field keeps 2020', [a?.near?.pairs, a?.near?.not_read, a?.not_read, yearsOf(a).includes(2020)], [6, [2020], [], true]);
  check('the answer says it is partial', /around the field 2020 not read/.test(a?.incomplete || ''), a?.incomplete);
});

await group('no neighbour year answers', async () => {
  const dir = copyOf('crophist/oxford', 'nonear');
  alter(dir, a => a.method === 'POST' && fs.statSync(a.bodyFile).size > 10000, m => { m.replies = [{ status: 500 }]; });
  const r = await runLookup('crophist', [...OXFORD, '1'], { replay: dir });
  contract('no neighbours', r);
  same('near is absent and near_reason says why; the field is still read', [r.answer?.ok, 'near' in (r.answer || {}), r.answer?.near_reason, r.answer?.field.length], [true, false, 'The fields around this one could not be read on the crop map just now', 15]);
  check('the answer says it is partial', /the fields around this one not read/.test(r.answer?.incomplete || ''));
});

await group('a US point that does not answer', async () => {
  const dir = copyOf('crophist/mead', 'point');
  let k = 0;
  alter(dir, a => a.url.includes('/identify?') && k++ === 0, m => { m.replies = [{ status: 502 }]; });
  const r = await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: dir });
  contract('one point lost', r);
  same('8 of 9 points read, said so; its classes are null, and 8 still make the year', [r.answer?.points, r.answer?.points_read, r.answer?.incomplete, r.answer?.field[0].unread, r.answer?.field[0].crop], [9, 8, '1 of 9 points not read', 1, 'corn']);
});

// ---- the failures, each in plain words
await group('failures', async () => {
  failure('another country', await runLookup('crophist', ['39.9', '32.8', 'TR', '0']), /^Crop maps by year are read for Canada and the United States only$/, true);
  failure('no country', await runLookup('crophist', ['43.25', '-80.8']), /^Crop maps by year are read for Canada and the United States only$/, true);
  failure('a blank latitude', await runLookup('crophist', ['', '-80.8', 'CA', '0']), /^lat and lon are required as decimal degrees$/);
  failure('near is not 0 or 1', await runLookup('crophist', [...OXFORD, '2']), /^near must be 0 or 1$/);
  failure('an outline that is not corners', await runLookup('crophist', [...OXFORD, '0', '-80.8,43.25;-80.7']), /outline must be 3 to 200 corners/);
  failure('an outline with 2 corners', await runLookup('crophist', [...OXFORD, '0', '-80.8,43.25;-80.7,43.25']), /outline must be 3 to 200 corners/);
  const sliver = '-80.80,43.25;-80.79,43.25;-80.79,43.2505;-80.7995,43.2505;-80.7995,43.26;-80.80,43.26';   // thin strips along two edges of its box
  const tiny = await runLookup('crophist', [...OXFORD, '0', sliver]);
  failure('fewer than 3 points inside: too small to read by year', tiny, /too small to read by year/, true);
  same('too small: refused before anything is asked', tiny.asked, 0);

  const square = '-96.4400,41.1795;-96.4399,41.1795;-96.4399,41.1796;-96.4400,41.1796';   // about 8 x 11 m: smaller than one map square
  const one = await runLookup('crophist', [...MEAD, '0', square]);
  failure('a field smaller than one map square: too small, never one square read as 9 points', one, /too small to read by year/, true);
  same('smaller than one square: refused before anything is asked', one.asked, 0);
  const deadCA = copyOf('crophist/oxford', 'deadca');
  alter(deadCA, a => a.method === 'POST', m => { m.replies = [{ status: 503 }]; });
  failure('no year answers', await runLookup('crophist', [...OXFORD, '0'], { replay: deadCA }), /^The Canadian crop map \(AAFC Annual Crop Inventory\) did not answer just now; try again in a minute$/);
  const busy = copyOf('crophist/oxford', 'busy');
  alter(busy, a => a.url.endsWith('?f=json'), m => { m.replies = [{ status: 429 }]; });
  const b = await runLookup('crophist', [...OXFORD, '0'], { replay: busy });
  failure('a 429 on the list of years: asked to slow down', b, /asked us to slow down; try again in a few minutes$/);
  same('after a 429 nothing more is asked', b.asked, 1);
  const noYears = copyOf('crophist/oxford', 'noyears');
  alter(noYears, a => a.url.endsWith('?f=json'), (m, body) => fs.writeFileSync(body, JSON.stringify({ currentVersion: 11.1, folders: [], services: [] })));
  failure('no year listed', await runLookup('crophist', [...OXFORD, '0'], { replay: noYears }), /did not list any year of its map/);
  const deadUS = copyOf('crophist/mead', 'deadus');
  alter(deadUS, a => a.url.includes('/identify?'), m => { m.replies = [{ fail: 'connection reset' }]; });
  failure('no US point answers', await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: deadUS }), /^The US crop map \(USDA Cropland Data Layer\) did not answer just now; try again in a minute$/);
  const empty = copyOf('crophist/mead', 'nodata');
  alter(empty, a => a.url.includes('/identify?'), (m, body) => { const j = JSON.parse(fs.readFileSync(body, 'utf8')); j.properties.Values = j.properties.Values.map(() => 'NoData'); fs.writeFileSync(body, JSON.stringify(j)); });
  failure('no reading at any point in any year: outside the map', await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: empty }), /^The US crop map \(USDA Cropland Data Layer\) has no reading for this place$/, true);
  const hang = copyOf('crophist/oxford', 'hang');
  alter(hang, a => a.url.endsWith('?f=json'), m => { m.replies = [{ fail: 'hang' }]; });
  const h = await runLookup('crophist', [...OXFORD, '0'], { replay: hang, limitS: 8 });
  failure('a service that never answers: the lookup answers in time, in words', h, /took too long|did not answer just now/);
  check('it answered before the time limit', h.seconds < 8, h.seconds);
});

// ---- the edges found at the second check
await group('a small field: no two points read one square', async () => {
  const out = path.join(tempFolder('small'), 'small.json');
  const py = spawnSync(PYTHON, ['-c', `import json,sys,crophist as c
open(sys.argv[1],'w').write(json.dumps(c.field_points(41.1795,-96.4398,c.ring_of('-96.4401,41.1793;-96.4393,41.1793;-96.4393,41.1799;-96.4401,41.1799'))))`, out], { cwd: LIVE_DIR, encoding: 'utf8', env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' } });
  const pts = py.status === 0 ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  check('a field of about 67 x 67 m keeps 3 to 8 points, each at least 30 m from the others', pts.length >= 3 && pts.length < 9 && pts.every((p, i) => pts.every((q, j) => i === j || metres(p, q) >= 29.9)), [pts.length, py.stderr.slice(-300)]);
});

await group('a US place no year of the map covers (Hawaii)', async () => {
  // The service's own answer at 20.0 N, 155.5 W, asked by hand on 2026-11-15 at
  // https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/identify (returnCatalogItems=true): no raster, no values.
  const dir = copyOf('crophist/mead', 'hawaii');
  alter(dir, a => a.url.includes('/identify?'), (m, body) => fs.writeFileSync(body, JSON.stringify({ objectId: 0, name: 'Pixel', value: 'NoData', location: { x: -17310180.81835404, y: 2273030.926987689, spatialReference: { wkid: 102100, latestWkid: 3857 } }, properties: {}, catalogItems: { objectIdFieldName: 'OBJECTID', features: [] }, catalogItemVisibilities: [] })));
  failure('no raster at the field: the map has no reading here, final (not "did not answer")', await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: dir }), /^The US crop map \(USDA Cropland Data Layer\) has no reading for this place$/, true);
  const err = copyOf('crophist/mead', 'errorpage');
  alter(err, a => a.url.includes('/identify?'), (m, body) => fs.writeFileSync(body, JSON.stringify({ error: { code: 500, message: 'Error performing identify', details: [] } })));
  failure('an error answer sent with status 200 is a service down, not "no reading"', await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: err }), /^The US crop map \(USDA Cropland Data Layer\) did not answer just now; try again in a minute$/);
  const html = copyOf('crophist/mead', 'htmlpage');
  alter(html, a => a.url.includes('/identify?'), (m, body) => fs.writeFileSync(body, '<html><body>Service unavailable</body></html>'));
  failure('an HTML page in place of the answer is a service down', await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: html }), /did not answer just now/);
});

await group('a year with no value at any point is not read, never "mixed"', async () => {
  const dir = copyOf('crophist/mead', 'emptyyear');
  alter(dir, a => a.url.includes('/identify?'), (m, body) => { const j = JSON.parse(fs.readFileSync(body, 'utf8')), y = j.catalogItems.features.map(f => f.attributes.Year); j.properties.Values[y.indexOf(2025)] = 'NoData'; fs.writeFileSync(body, JSON.stringify(j)); });
  const a = (await runLookup('crophist', [...MEAD, '0', MEAD_RING], { replay: dir })).answer;
  same('2025 is left out and named; the years and the source end at 2024; not partial (asking again cannot change it)', [a?.ok, yearsOf(a)[0], a?.not_read, a?.data_date, a?.years?.last, /2008 to 2024/.test(a?.source), 'incomplete' in (a || {})], [true, 2024, [2025], '2008/2024', 2024, true, false]);
});

await group('a slow neighbour read never costs the field its answer', async () => {
  const dir = copyOf('crophist/oxford', 'slownear');
  alter(dir, a => a.method === 'POST' && fs.statSync(a.bodyFile).size > 10000, m => { m.replies = [{ fail: 'hang' }]; });
  const r = await runLookup('crophist', [...OXFORD, '1'], { replay: dir, limitS: 20 });
  contract('slow neighbours', r, { allowMiss: true });
  same('the field is answered, the neighbours are said not read', [r.answer?.ok, r.answer?.field?.length, 'near' in (r.answer || {}), r.answer?.near_reason], [true, 15, false, 'The fields around this one could not be read on the crop map just now']);
  check('within the time limit', r.seconds < 20, r.seconds);
});

// ---- the files: plain words, the table imported and not copied
await group('the files', async () => {
  const files = ['scripts/live/crophist.py', 'scripts/test_crophist.mjs'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  same('no tool names', files.filter(([, t]) => flagged(t).length).map(([f]) => f), []);
  same('the app works by fixed rules: no word says it learns or predicts', files.filter(([, t]) => t.split('\n').some(line => !line.includes('no word says') && /\blearn|predict|forecast/i.test(line))).map(([f]) => f), []);
  same('no date written before 14 November 2026', files.filter(([, t]) => [...t.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)].some(m => `${m[1]}${m[2]}${m[3]}` < '20261114')).map(([f]) => f), []);
  const py = files[0][1];
  check('the class table is the crop-map lookup\'s own, imported, never copied', /from cropsnear import ACI, CDL, WHO, table/.test(py) && /table\("cropsnear_map\.json"\)/.test(py) && !/"147"|"Corn for grain"/.test(py));
  check('every request goes through common.http, and the lookup answers through common.run', !/urllib\.request|requests\b|socket/.test(py) && /common\.run\(main, LIMIT_S/.test(py) && /^import common/m.test(py));
  const metas = fs.readdirSync(path.join(ROOT, 'scripts/fixtures/live/crophist')).flatMap(d => fs.statSync(path.join(ROOT, 'scripts/fixtures/live/crophist', d)).isDirectory() ? fs.readdirSync(path.join(ROOT, 'scripts/fixtures/live/crophist', d)).filter(n => n.endsWith('.json')).map(n => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/live/crophist', d, n), 'utf8'))) : []);
  check('every recording names its address and the day it was recorded, from the live service', metas.length === 43 && metas.every(m => /^https:\/\/(pdi\.scinet\.usda\.gov|agriculture\.canada\.ca)\//.test(m.url) && /^2026-11-15T/.test(m.recorded) && m.hand_made === false));
});

clearTimeout(watchdog);
finish();
