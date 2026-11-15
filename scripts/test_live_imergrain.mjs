// Crophalo's offline suite for the satellite-rain lookup (scripts/live/imergrain.py): NASA's catalogue, token service and data service are replaced by hand-made answers in their real formats
// (the cell and the values' shape taken from a real answer for Oxford County), so no internet and no login is needed. The live check is scripts/live_check_imergrain.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A day nobody read shown as 0 mm of rain, or a total over days that were never read, would tell a farmer the field was dry. Run: node scripts/test_live_imergrain.mjs
import path from 'node:path';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, URS_TOKEN } from './live_testlib.mjs';

const NOW = '2026-11-18T12:00:00Z', CMR = 'https://cmr.earthdata.nasa.gov/search/granules.json';
const day = n => new Date(Date.UTC(2026, 10, 18) - n * 864e5).toISOString().slice(0, 10);   // n days before the pinned today
const DAYS = Array.from({ length: 30 }, (_, k) => day(30 - k));                           // the 30 days the lookup reads: 30 days ago .. yesterday
const stamp = d => d.replace(/-/g, '');
const link = (run, d) => `https://opendap.earthdata.nasa.gov/collections/C27237548${run === 'L' ? '59' : '50'}-GES_DISC/granules/GPM_3IMERGD${run}.07%3A3B-DAY-${run}.MS.MRG.3IMERG.${stamp(d)}-S000000-E235959.V07C.nc4`;
const entry = (run, d) => ({ title: `GPM_3IMERGD${run}.07:3B-DAY-${run}.MS.MRG.3IMERG.${stamp(d)}-S000000-E235959.V07C.nc4`, time_start: `${d}T00:00:00.000Z`,
  links: [{ rel: 'http://esipfed.org/ns/fedsearch/1.1/data#', href: 'https://data.gesdisc.earthdata.nasa.gov/x.nc4' }, { rel: 'http://esipfed.org/ns/fedsearch/1.1/service#', href: link(run, d) }] });
const cmrUrl = (short, first, last) => `${CMR}?short_name=${short}&version=07&temporal=${encodeURIComponent(first + 'T00:00:00Z,' + last + 'T23:59:59Z')}&sort_key=start_date&page_size=100`;
const I = 992, J = 1331;   // the 0.1 degree square of 43.13 N, 80.75 W
const dapUrl = (url, i = I, j = J) => url + '.dap?dap4.ce=' + encodeURIComponent(`/precipitation[0][${i}][${j}];/lon[${i}];/lat[${j}];/time`).replace(/%2F/g, '/');
function dap({ precipitation, lon = -80.75, lat = 43.15, time = 17113 }, { checks = true } = {}) {
  const dmr = Buffer.from('<Dataset name="x"><Float32 name="lon"/><Float64 name="time"/><Float64 name="lat"/><Float32 name="precipitation"/></Dataset>');
  const parts = [], put = (b, v, t) => { t === 'd' ? b.writeDoubleLE(v) : b.writeFloatLE(v); parts.push(b); if (checks) parts.push(Buffer.alloc(4)); };
  put(Buffer.alloc(4), lon, 'f'); put(Buffer.alloc(8), time, 'd'); put(Buffer.alloc(8), lat, 'd'); put(Buffer.alloc(4), precipitation, 'f');
  const data = Buffer.concat(parts), head = (f, n) => Buffer.from([f, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  return Buffer.concat([head(4, dmr.length), dmr, head(4, data.length), data, head(5, 0)]);
}
// the rain of each pretend day: a true 0 on every fifth day, a real value otherwise (made up for the test only)
const RAIN = d => ((Number(d.slice(8)) % 5) === 0 ? 0 : Math.round((Number(d.slice(8)) * 0.37 + 0.2) * 100) / 100);
function build({ late = DAYS, early = [], urs = { status: 200, body: { access_token: 'tok-hand-made-2' } }, mm = RAIN, replies = {}, cmr = {} } = {}) {
  const dir = path.join(tempFolder('imergrain'), 'answers');
  const first = DAYS[0], last = DAYS[DAYS.length - 1];
  addAnswer(dir, { url: cmrUrl('GPM_3IMERGDL', first, last), body: { feed: { entry: late.map(d => entry('L', d)) } } });
  addAnswer(dir, { url: cmrUrl('GPM_3IMERGDE', first, last), body: { feed: { entry: early.map(d => entry('E', d)) } } });
  addAnswer(dir, { method: 'POST', url: URS_TOKEN, status: urs.status, body: urs.body ?? '' });
  for (const [run, list] of [['L', late], ['E', early]]) for (const d of list) {
    const url = dapUrl(link(run, d)), over = replies[d];
    addAnswer(dir, { url, ...(over || { body: dap({ precipitation: mm(d) }), headers: { 'content-type': 'application/vnd.opendap.dap4.data' } }) });
  }
  return dir;
}
const OXFORD = ['43.13', '-80.75'];
const run = (args, dir, extra = {}) => runLookup('imergrain', args, { replay: dir, login: true, now: NOW, ...extra });

await group('a good answer for Oxford County', async () => {
  const r = await run(OXFORD, build()), a = r.answer;
  contract('imergrain', r, { secrets: ['tok-hand-made-2'] });
  check('it is a good answer', a?.ok === true, a);
  same('thirty days, from 30 days before today to yesterday', [a.days.length, a.days[0][0], a.days[29][0]], [30, DAYS[0], DAYS[29]]);
  same('the period is named in data_date', a.data_date, `${DAYS[0]}/${DAYS[29]}`);
  check('every day carries its value and the run it came from', a.days.every(([d, mm, run]) => mm === RAIN(d) && run === 'late'), a.days.slice(0, 3));
  check('a true 0 mm day stays 0, and it is a value: the lookup read it', a.days.some(d => d[1] === 0 && d[2] === 'late'));
  same('the counts: all 30 from the Late Run, none from the Early Run, none first estimates, none unpublished, none unread', [a.days_read, a.late, a.early, a.first_estimate, a.not_published, a.read_errors], [30, 30, 0, [], [], 0]);
  same('the total is the sum of the days read, to 1 decimal', a.total_mm, Math.round(DAYS.reduce((s, d) => s + RAIN(d), 0) * 10) / 10);
  same('the newest day with a value is yesterday', a.newest_day, DAYS[29]);
  check('the cell is the 0.1 degree square that holds the field, with its edges and its size', a.cell.lat === 43.15 && a.cell.lon === -80.75 && a.cell.edges.s === 43.1 && a.cell.edges.n === 43.2 && a.cell.edges.w === -80.8 && a.cell.edges.e === -80.7 && Math.abs(a.cell.width_km - 8.1) < 0.2 && a.cell.height_km === 11.1, a.cell);
  check('the field lies inside the cell', a.cell.edges.s <= 43.13 && 43.13 < a.cell.edges.n && a.cell.edges.w <= -80.75 && -80.75 < a.cell.edges.e);
  check('the source names the product, its version and the centre; the units say millimetres over the day', /IMERG/.test(a.source) && /version 07/.test(a.source) && /GES DISC|Goddard/.test(a.source) && /Millimetres of rain over the whole day/.test(a.units), a.source);
  check('a whole answer carries no "incomplete" and no read errors', !('incomplete' in a) && a.read_errors === 0);
  check('the note says it is one value for a square and the first estimates may change', /not a gauge in the field/.test(a.note) && /first estimate and may change|first estimate/.test(a.note));
  same('thirty-two requests: the catalogue once (the Early Run was not needed), the token, thirty days', r.asked, 32);
  check('it never asked for a whole file', !/\.nc4(\?|$)/.test(r.stderr.replace(/\.dap\?/g, '')) || r.misses.length === 0);
});

await group('the Early Run fills the newest days', async () => {
  const lateDays = DAYS.slice(0, 28), earlyDays = DAYS.slice(28);
  const r = await run(OXFORD, build({ late: lateDays, early: earlyDays })), a = r.answer;
  contract('early run', r);
  same('28 from the Late Run, 2 from the Early Run, and the Early days are named as first estimates', [a.late, a.early, a.first_estimate, a.days_read], [28, 2, earlyDays, 30]);
  same('each day says its own run', [a.days[27][2], a.days[28][2], a.days[29][2]], ['late', 'early', 'early']);
  check('a day that both runs have is read from the Late Run only', a.days.filter(d => d[2] === 'late').length === 28);
});

await group('days that are missing or could not be read', async () => {
  const unpub = await run(OXFORD, build({ late: DAYS.slice(0, 28) })), u = unpub.answer;
  contract('unpublished days', unpub);
  same('two days NASA has not published are null with no run, never 0, and are named', [u.days[28], u.days[29], u.not_published, u.days_read], [[DAYS[28], null, null], [DAYS[29], null, null], DAYS.slice(28), 28]);
  check('the answer says it is partial, in words', /2 days not published by NASA yet/.test(u.incomplete), u.incomplete);
  check('the total counts only the 28 days read', u.total_mm === Math.round(DAYS.slice(0, 28).reduce((s, d) => s + RAIN(d), 0) * 10) / 10);
  same('a newest day with a value is the last day that was read', u.newest_day, DAYS[27]);
  const bad = DAYS[10], oneDown = await run(OXFORD, build({ replies: { [bad]: { status: 503, body: 'busy' } } })), o = oneDown.answer;
  contract('one day down', oneDown, { allowMiss: false });
  check('a day NASA did not answer for is null, counted as an error, and the other 29 are there', o.ok === true && o.days[10][1] === null && o.days_read === 29 && o.read_errors === 1, [o.days[10], o.days_read, o.read_errors]);
  check('the answer says one day could not be read just now', /1 day could not be read just now/.test(o.incomplete), o.incomplete);
  const fill = await run(OXFORD, build({ mm: d => (d === DAYS[5] ? -9999.9 : RAIN(d)) })), f = fill.answer;
  check('a day the file itself has no value for (its fill value) is null, not 0, and is not an error', f.days[5][1] === null && f.days[5][2] === null && f.read_errors === 0 && f.days_read === 29, f.days[5]);
  const silly = await run(OXFORD, build({ mm: d => (d === DAYS[6] ? 5000 : RAIN(d)) })), s = silly.answer;
  check('a rain value that cannot be right is refused: the day is null and counted as an error', s.days[6][1] === null && s.read_errors === 1, s.days[6]);
  const neg = await run(OXFORD, build({ mm: d => (d === DAYS[7] ? -3 : RAIN(d)) }));
  check('a negative rain value is refused too', neg.answer.days[7][1] === null && neg.answer.read_errors === 1, neg.answer.days[7]);
  const sans = await runLookup('imergrain', OXFORD, { replay: build({ replies: Object.fromEntries(DAYS.map(d => [d, { body: dap({ precipitation: RAIN(d) }, { checks: false }) }])) }), login: true, now: NOW });
  check('an answer without check numbers is read all the same', sans.answer.ok === true && sans.answer.days_read === 30, sans.answer);
});

await group('the whole service failing', async () => {
  const none = await run(OXFORD, build({ late: [], early: [] }));
  contract('nothing published', none, { allowMiss: true });
  check('no file at all: "not published yet", not final', none.answer.ok === false && /has not published its satellite rain/.test(none.answer.reason) && !none.answer.final, none.answer);
  const refused = await run(OXFORD, build({ urs: { status: 401 } }));
  check('a refused login is said plainly', /did not accept this computer's login/.test(refused.answer.reason), refused.answer);
  const rights = await run(OXFORD, build({ replies: Object.fromEntries(DAYS.map(d => [d, { status: 403, body: 'no' }])) }));
  check('every file refused with 403: the login may need approving for GES DISC, said in plain words', /GES DISC/.test(rights.answer.reason), rights.answer);
  const down = await run(OXFORD, build({ replies: Object.fromEntries(DAYS.map(d => [d, { status: 503, body: 'down' }])) }));
  check('every file failing is a "try again" sentence, never a list of zeros', down.answer.ok === false && /could not be read just now/.test(down.answer.reason) && !down.answer.final, down.answer);
  const off = await run(OXFORD, build({ replies: { [DAYS[0]]: { body: dap({ precipitation: 1, lat: 44.05 }) } } }));
  check('a file whose cell is not the one asked for is never read as if it were', off.answer.ok === false && /0\.1 degree grid/.test(off.answer.reason), off.answer);
  const nologin = await runLookup('imergrain', OXFORD, { replay: build(), now: NOW });
  check('with no login on the computer it says so', nologin.answer.ok === false && /No NASA Earthdata login/.test(nologin.answer.reason), nologin.answer);
});

await group('arguments', async () => {
  for (const [name, args, why] of [['none', [], /required as decimal degrees/], ['text', ['abc', '5'], /required as decimal degrees/], ['too far north', ['91', '10'], /lat must be/], ['too far east', ['44', '190'], /lon -180/]]) {
    const r = await run(args, build());
    check(`${name}: refused in plain words before anything is asked`, r.answer?.ok === false && why.test(r.answer.reason) && r.asked === 0, r.answer);
  }
});

finish();
