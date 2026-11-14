// Crophalo's offline suite for the SMAP root-zone lookup (scripts/live/smaproot.py): NASA's catalogue, token service and data service are replaced by hand-made answers
// in their real formats (numbers taken from a real answer for Barrie), so no internet and no login is needed. A live check is scripts/live_check_smaproot.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A wrong cell, a stale date or a made-up value would be shown to a farmer as a reading of the soil. Run: node scripts/test_live_smaproot.mjs
import path from 'node:path';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, URS_TOKEN } from './live_testlib.mjs';

const NOW = '2026-11-18T12:00:00Z', CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SPL4SMGP&sort_key=-start_date&page_size=4';
const OP = n => `https://opendap.earthdata.nasa.gov/collections/C3480440870-NSIDC_CPRD/granules/SMAP_L4_SM_gph_2026111${4 + n}T223000_Vv8013_001.h5_hash${n}`;
const CELL_M = 9008.055210146;
const SECONDS = (y, m, d, h, min) => (Date.UTC(y, m - 1, d, h, min) - Date.UTC(2000, 0, 1, 11, 58, 55, 816)) / 1000;   // seconds since the file's own epoch
const REAL = { y: 5121079.645019531, cell_lon: -79.77696990966797, x: -7697383.564941406, cell_lat: 44.35365676879883, time: SECONDS(2026, 11, 14, 22, 30), sm_rootzone: 0.10131541639566422 };   // the numbers NASA answered for Barrie, with the file of 14 November 2026 at 22:30
const DAY = d => ['2026', '11', String(10 + d)].join('-');   // a day of this month: 14, 15 ...
const entry = (n, over = {}) => ({ title: `SMAP_L4_SM_gph_2026111${4 + n}T223000_Vv8013_001.h5_hash${n}`, time_start: `${DAY(4 + n)}T21:00:00.000Z`, time_end: `${DAY(4 + n)}T23:59:59.000Z`,
  links: [{ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: 'https://data.nsidc.earthdatacloud.nasa.gov/x.h5' }, { rel: 'http://esipfed.org/ns/fedsearch/1.1/service#', title: 'OPeNDAP request URL', href: OP(n) }], ...over });
const dapUrl = (op, row, col) => op + '.dap?dap4.ce=' + encodeURIComponent(`/Geophysical_Data/sm_rootzone[${row}][${col}];/cell_lat[${row}][${col}];/cell_lon[${row}][${col}];/x[${col}];/y[${row}];/time`).replace(/%2F/g, '/');
function dap(values = REAL, { checks = true, trim = 0 } = {}) {   // a DAP4 answer: the description chunk, the values chunk, the closing chunk
  const dmr = Buffer.from(`<Dataset name="x"><Float64 name="y"/><Float32 name="cell_lon"/><Float64 name="x"/><Float32 name="cell_lat"/><Float64 name="time"><Attribute name="units" type="String"><Value>seconds since ${['2000', '01', '01'].join('-')} 11:58:55.816</Value></Attribute></Float64><Group name="Geophysical_Data"><Float32 name="sm_rootzone"/></Group></Dataset>`);
  const parts = [];
  for (const [k, t] of [['y', 'd'], ['cell_lon', 'f'], ['x', 'd'], ['cell_lat', 'f'], ['time', 'd'], ['sm_rootzone', 'f']]) {
    const b = Buffer.alloc(t === 'd' ? 8 : 4); t === 'd' ? b.writeDoubleLE(values[k]) : b.writeFloatLE(values[k]); parts.push(b); if (checks) parts.push(Buffer.alloc(4));
  }
  const data = Buffer.concat(parts), head = (flags, n) => Buffer.from([flags, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const out = Buffer.concat([head(4, dmr.length), dmr, head(4, data.length), data, head(5, 0)]);
  return trim ? out.subarray(0, out.length - trim) : out;
}
function folder({ entries = [entry(0)], urs = { status: 200, body: { access_token: 'tok-hand-made-1' } }, daps = {} } = {}) {
  const dir = path.join(tempFolder('smaproot'), 'answers');
  addAnswer(dir, { url: CMR, body: { feed: { entry: entries } } });
  addAnswer(dir, { method: 'POST', url: URS_TOKEN, status: urs.status, body: urs.body ?? '' });
  for (const [url, ans] of Object.entries(daps)) addAnswer(dir, { url, ...ans });
  return dir;
}
const good = (op = OP(0), values = REAL, row = 243, col = 1073) => ({ [dapUrl(op, row, col)]: { body: dap(values), headers: { 'content-type': 'application/vnd.opendap.dap4.data' } } });
const run = (args, dir, extra = {}) => runLookup('smaproot', args, { replay: dir, login: true, now: NOW, ...extra });
const BARRIE = ['44.4', '-79.78'];

await group('a good answer for Barrie', async () => {
  const r = await run(BARRIE, folder({ daps: good() })), a = r.answer;
  contract('smaproot', r, { secrets: ['tok-hand-made-1'] });
  check('it is a good answer', a?.ok === true, a);
  same('the value is NASA\'s value, to 4 decimals, between 0 and 1', a.value, 0.1013);
  same('its date is the day of the file, not the day of the lookup', [a.date, a.data_date], ['2026-11-14', '2026-11-14']);
  same('the square is called 9 km and the file is named', [a.km, a.granule], [9, 'SMAP_L4_SM_gph_20261114T223000_Vv8013_001.h5']);
  check('the source names the product, its version and who distributes it', /SPL4SMGP/.test(a.source) && /version 8/.test(a.source) && /National Snow and Ice Data Center/.test(a.source), a.source);
  check('the units say it is a share of the soil\'s volume for the whole root zone', /Volume of water per volume of soil/.test(a.units) && /0 to 100 cm/.test(a.units), a.units);
  same('the cell is the file\'s own cell centre', [a.cell.lat, a.cell.lon], [44.3537, -79.777]);
  const e = a.cell.edges;
  check('the field lies inside the cell\'s edges', e.s < 44.4 && 44.4 <= e.n && e.w < -79.78 && -79.78 < e.e, e);
  check('the edges are a box of latitudes and longitudes: about 7.4 km wide and 10.9 km tall here, not a 9 km square', Math.abs(a.cell.width_km - 7.4) < 0.3 && Math.abs(a.cell.height_km - 10.9) < 0.3, [a.cell.width_km, a.cell.height_km]);
  check('the note says the cell is not a square', /not a square/.test(a.note));
  same('the age of the data is counted in whole days from the (pinned) clock', a.age_days, 3);   // 14 November 22:30 to 18 November 12:00
  same('three requests were sent: the catalogue, the token and the one cell', r.asked, 3);
  check('it never asked for the whole file', r.misses.length === 0 && !/\.h5(\?|$)/.test(r.stderr));
});

await group('NASA has no value for the square', async () => {
  const sea = { y: -4504.02783203125, cell_lon: -30.015560150146484, x: -2896089.8959960938, cell_lat: -0.035305414348840714, time: REAL.time, sm_rootzone: -9999 };   // what NASA answered for a cell of the open Atlantic
  const r = await run(['0', '-30'], folder({ daps: good(OP(0), sea, 812, 1606) }));
  contract('open water', r, { allowMiss: true });
  check('open water gives no value, says why, and is final (asking again cannot help)', r.answer?.ok === false && r.answer.final === true && /open water or ice/.test(r.answer.reason), r.answer);
  const odd = await run(BARRIE, folder({ daps: good(OP(0), { ...REAL, sm_rootzone: 1.4 }) }));
  check('a value outside the file\'s own valid range is refused, not shown', odd.answer?.ok === false, odd.answer);
  const neg = await run(BARRIE, folder({ daps: good(OP(0), { ...REAL, sm_rootzone: -0.3 }) }));
  check('a negative value is refused too', neg.answer?.ok === false, neg.answer);
});

await group('the catalogue and the files', async () => {
  const none = await run(BARRIE, folder({ entries: [] }));
  contract('no file', none, { allowMiss: true });
  check('no file in the catalogue is a plain, non-final failure', none.answer.ok === false && /no recent SMAP/.test(none.answer.reason) && !none.answer.final, none.answer);
  const future = await run(BARRIE, folder({ entries: [entry(0, { time_start: '2026-11-25T21:00:00.000Z' })], daps: good() }));
  check('a file dated after today is not used', future.answer.ok === false && /no recent SMAP/.test(future.answer.reason), future.answer);
  const noLink = await run(BARRIE, folder({ entries: [entry(0, { links: [] })] }));
  check('a file with no data-service link is not used', noLink.answer.ok === false, noLink.answer);
  const back = await run(BARRIE, folder({ entries: [entry(1), entry(0)], daps: { [dapUrl(OP(1), 243, 1073)]: { status: 503, body: 'busy' }, ...good(OP(0)) } }));
  check('when the newest file does not answer, the one before it is read, and the answer says which', back.answer.ok === true && /h5$/.test(back.answer.granule) && back.answer.granule.includes('20261114'), back.answer);
});

await group('the login and the service failing', async () => {
  const refused = await run(BARRIE, folder({ urs: { status: 401 }, daps: good() }));
  contract('login refused', refused, { allowMiss: true });
  check('a refused login is said plainly', /did not accept this computer's login/.test(refused.answer.reason), refused.answer);
  const gone = await run(BARRIE, folder({ daps: { [dapUrl(OP(0), 243, 1073)]: { status: 403, body: 'no' } } }));
  check('a refusal by the data service says the login is not allowed this data', gone.answer.ok === false && /login/.test(gone.answer.reason), gone.answer);
  const down = await run(BARRIE, folder({ daps: { [dapUrl(OP(0), 243, 1073)]: { status: 503, body: 'down' } } }));
  check('a data service that is down is a "try again" sentence, not final', down.answer.ok === false && !down.answer.final && /did not answer just now/.test(down.answer.reason), down.answer);
  const cut = await run(BARRIE, folder({ daps: good(OP(0), REAL).__proto__ && { [dapUrl(OP(0), 243, 1073)]: { body: dap(REAL, { trim: 20 }) } } }));
  check('an answer cut short is refused, not guessed at', cut.answer.ok === false, cut.answer);
  const sans = await run(BARRIE, folder({ daps: { [dapUrl(OP(0), 243, 1073)]: { body: dap(REAL, { checks: false }) } } }));
  check('an answer without check numbers is read all the same (both forms are valid)', sans.answer.ok === true && sans.answer.value === 0.1013, sans.answer);
  const bad = await runLookup('smaproot', BARRIE, { replay: folder({ daps: good() }), now: NOW });
  check('with no login on the computer it says so', bad.answer.ok === false && /No NASA Earthdata login/.test(bad.answer.reason), bad.answer);
});

await group('the grid is checked against the file itself', async () => {
  const east = { ...REAL, x: REAL.x + CELL_M };   // a file whose cell is one column east of the one the grid's definition names
  const r = await run(BARRIE, folder({ daps: { ...good(OP(0), east, 243, 1073), ...good(OP(0), REAL, 243, 1072) } }));
  check('when the first cell is not the one that holds the place, the next is asked for and used', r.answer?.ok === true && r.answer.cell.col === 1072 && r.answer.value === 0.1013, r.answer);
  same('and that took four requests: the catalogue, the token and two cells', r.asked, 4);
  const far = { ...REAL, x: REAL.x + 3.4 * CELL_M, y: REAL.y };
  const r2 = await run(BARRIE, folder({ daps: { ...good(OP(0), far, 243, 1073) } }), {});
  check('a file that is nowhere near the place is never read as if it were', r2.answer.ok === false, r2.answer);
});

await group('arguments', async () => {
  for (const [name, args, why] of [['none', [], /required as decimal degrees/], ['text', ['abc', '5'], /required as decimal degrees/], ['a blank', ['', '5'], /required as decimal degrees/], ['too far north', ['89', '10'], /lat must be -85\.\.85/], ['too far east', ['44', '190'], /lon -180\.\.180/]]) {
    const r = await run(args, folder({ daps: good() }), {});
    check(`${name}: refused in plain words before anything is asked`, r.answer?.ok === false && why.test(r.answer.reason) && r.asked === 0, r.answer);
  }
});

finish();
