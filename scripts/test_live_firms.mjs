// Crophalo's offline suite for the fires lookup (scripts/live/firms.py): NASA FIRMS's two 24-hour files (VIIRS on NOAA-20 and NOAA-21) are replaced by hand-made files in their real format (the same header, the same columns,
// made-up detections round the field), so no internet is needed. The live check is scripts/live_check_firms.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A fire shown that was never seen, or "no fire" said where the satellites only saw none, would alarm or reassure a farmer wrongly. Run: node scripts/test_live_firms.mjs
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract } from './live_testlib.mjs';

const BASE = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire', J1 = `${BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv`, J2 = `${BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv`;
const HEAD = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight';
const NOW = '2026-11-18T12:00:00Z', DAY = '2026-11-17';
const row = ({ lat, lon, date = DAY, time = '0554', sat = 'N20', conf = 'nominal', frp = 2.1, dn = 'N' }) => `${lat},${lon},321.8,0.45,0.63,${date},${time},${sat},${conf},2.0NRT,262.3,${frp},${dn}`;
const file = rows => [HEAD, ...rows.map(row)].join('\n') + '\n';
const OX = ['43.13', '-80.75'];
function build({ j1 = [], j2 = [], fail = [], raw = {} } = {}) {
  const answers = path => path;   // eslint placeholder
  const dir = tempFolder('firms'), folder = `${dir}/answers`;
  for (const [url, rows, name] of [[J1, j1, 'J1'], [J2, j2, 'J2']]) addAnswer(folder, fail.includes(name) ? { url, status: 503, body: 'down' } : { url, body: raw[name] ?? file(rows) });
  return folder;
}
const run = (args, folder, extra = {}) => runLookup('firms', args, { replay: folder, now: NOW, ...extra });

await group('a good answer for Oxford County', async () => {
  const j1 = [
    { lat: 43.29, lon: -79.98, sat: 'N20', frp: 1.7 },                                   // about 70 km away
    { lat: 43.14, lon: -80.74, sat: 'N20', conf: 'high', frp: 12.4, dn: 'D', time: '1815' },  // close
    { lat: 50.0, lon: -80.75 },                                                           // north of the box
    { lat: 43.13, lon: -70.0 },                                                           // east of the box
    { lat: -33.0, lon: 150.0 },                                                           // the other side of the world
  ];
  const j2 = [{ lat: 43.2, lon: -80.6, sat: 'N21', conf: 'low', frp: 0.6, time: '0720' }, { lat: 42.5, lon: -81.0, sat: 'N21', time: '0810' }];
  const r = await run(OX, build({ j1, j2 })), a = r.answer;
  contract('firms', r);
  check('it is a good answer, with no login asked for (the files are open)', a?.ok === true, a);
  same('only the spots inside the box are given: four of the seven', [a.count, a.shown, a.points.length], [4, 4, 4]);
  same('nearest first: the close one, then the others by distance', a.points.map(p => p.lat), [43.14, 43.2, 43.29, 42.5].sort((x, y) => 0) && [43.14, 43.2, 43.29, 42.5]);
  same('a spot has its place, its time in UTC, its power, its confidence, its satellite and whether it was night', a.points[0], { lat: 43.14, lon: -80.74, time: `${DAY}T18:15Z`, frp: 12.4, confidence: 'high', satellite: 'NOAA-20', night: false });
  same('the confidence counts', a.by_confidence, { high: 1, nominal: 2, low: 1 });
  same('both satellites were read, and the newest spot of the files is named', [a.satellites, a.newest, a.data_date], [['NOAA-20', 'NOAA-21'], `${DAY}T18:15Z`, DAY]);
  check('the box is about 250 km each way and wider in longitude by the cosine of the latitude', a.box.n - a.box.s === 5 && a.box.e - a.box.w > 6.5 && a.box.e - a.box.w < 7.5, a.box);
  check('the source names FIRMS, VIIRS, both satellites and the 375 m; the units say what a point is', /FIRMS/.test(a.source) && /VIIRS/.test(a.source) && /NOAA-20 and NOAA-21/.test(a.source) && /375 m/.test(a.units), a.source);
  check('the answer says plainly what the satellites cannot see, and that no spot is not no fire', /under cloud/.test(a.coverage) && /does not mean there is no fire/.test(a.coverage) && a.coverage === a.note.slice(-a.coverage.length), a.coverage);
  check('a whole answer carries no "incomplete"', !('incomplete' in a));
});

await group('no spot, one file down, both down, odd files', async () => {
  const quiet = await run(OX, build({ j1: [{ lat: -10, lon: 20 }], j2: [] })), q = quiet.answer;
  contract('quiet', quiet);
  check('no spot near the field is a good answer with nothing in it, and it does not say there was no fire', q.ok === true && q.count === 0 && q.points.length === 0 && /does not mean there is no fire/.test(q.note), q);
  const one = await run(OX, build({ j1: [{ lat: 43.14, lon: -80.74 }], fail: ['J2'] })), o = one.answer;
  contract('one file down', one);
  check('one file that does not come is named, and the other one is still given', o.ok === true && o.count === 1 && o.satellites.join() === 'NOAA-20' && /NOAA-21 file did not come/.test(o.incomplete), o);
  const none = await run(OX, build({ fail: ['J1', 'J2'] }));
  contract('both down', none, { allowMiss: true });
  check('both files down: "try again", not final', none.answer.ok === false && /could not be read just now/.test(none.answer.reason) && !none.answer.final, none.answer);
  const junk = await run(OX, build({ raw: { J1: 'not,a,fire,file\n1,2,3,4\n', J2: file([{ lat: 43.14, lon: -80.74 }]) } })), j = junk.answer;
  check('a file in another form is refused as that file, the other still counts', j.ok === true && j.count === 1 && /NOAA-20 file did not come/.test(j.incomplete), j);
  const rough = await run(OX, build({ raw: { J1: [HEAD, 'x,y,1,1,1,d,t,N20,high,2,1,1,N', row({ lat: 43.14, lon: -80.74, frp: 'oops' }), row({ lat: 43.14, lon: -80.74, conf: 'strange' }), row({ lat: 'nan', lon: 3 })].join('\n'), J2: file([]) } })), z = rough.answer;
  check('broken lines are skipped, a power that is not a number is left empty and an odd confidence reads as nominal', z.ok === true && z.count === 2 && z.points[0].frp === null && z.points[1].confidence === 'nominal', z.points);
  const many = await run(OX, build({ j1: Array.from({ length: 700 }, (_, i) => ({ lat: 43.13 + (i % 100) * 0.01, lon: -80.75 + Math.floor(i / 100) * 0.01 })), j2: [] })), m = many.answer;
  same('seven hundred spots: all counted, the nearest six hundred shown', [m.count, m.shown, m.points.length], [700, 600, 600]);
  check('memory stays small however long the file is (the file is read a line at a time)', many.peakMB < 120, many.peakMB);
  const dateline = await run(['-17.7', '179.9'], build({ j1: [{ lat: -17.7, lon: -179.9 }, { lat: -17.7, lon: 178.0 }, { lat: -17.7, lon: 170.0 }], j2: [] })), d = dateline.answer;
  check('across the date line a spot 0.2 degrees east of the field is near, 170 is not', d.ok === true && d.count === 2 && d.points.some(p => p.lon === -179.9), d.points);
});

await group('the files are kept, and arguments', async () => {
  const cache = tempFolder('firmscache'), b = build({ j1: [{ lat: 43.14, lon: -80.74 }], j2: [] }), first = await run(OX, b, { cache }), second = await run(['43.5', '-80.5'], b, { cache });
  same('a second field asks nobody: the kept files are read again', [first.answer.ok, second.answer.ok, first.asked, second.asked], [true, true, 2, 0]);
  const wide = await run([...OX, '5'], build({ j1: [{ lat: 47.0, lon: -80.75 }], j2: [] })), w = wide.answer;
  check('a wider half width reaches further: five degrees takes in the spot four degrees north', w.ok === true && w.count === 1 && w.box.n === 48.13, w.box);
  for (const [name, args, why] of [['none', [], /required as decimal degrees/], ['text', ['x', '1'], /required as decimal degrees/], ['too far north', ['91', '1'], /lat must be/], ['a half width too big', [...OX, '40'], /must be 0\.1\.\.5/]]) {
    const r = await run(args, build());
    check(`${name}: refused in plain words before anything is asked`, r.answer?.ok === false && why.test(r.answer.reason) && r.asked === 0, r.answer);
  }
});

finish();
