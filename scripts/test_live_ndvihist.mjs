// Crophalo's offline suite for the greenness history lookup (scripts/live/ndvihist.py): NASA GIBS's list of days and its map tiles are replaced by hand-made answers in their real formats (a DescribeDomains list; 256 px palette pictures
// whose palette entries are NASA's own greenness scale, read from the lookup's own table), so no internet is needed. The live check is scripts/live_check_ndvihist.mjs, by hand.
// RULE: never loosen a check here without a written farming reason beside it. A season with too few readings shown as brown, or a trend written where the numbers show none, would tell someone buying land something the satellite never saw. Run: node scripts/test_live_ndvihist.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, LIVE_DIR } from './live_testlib.mjs';

const NOW = '2026-11-18T12:00:00Z', GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best', LAYER = 'MODIS_Terra_L3_NDVI_16Day', TMS = 'GoogleMapsCompatible_Level9';
const SOURCE = fs.readFileSync(path.join(LIVE_DIR, 'ndvihist.py'), 'utf8');
const MIDS = JSON.parse('[' + /STEP_MIDS = \[([^\]]*)\]/.exec(SOURCE)[1].replace(/\s+/g, ' ') + ']');   // NASA's scale, read from the lookup itself: entry k stands for MIDS[k - 1]
const idxOf = value => MIDS.findIndex(v => Math.abs(v - value) < 1e-9) + 1;
const at = value => { const k = idxOf(value); if (!k) throw new Error('not a step of the scale: ' + value); return k; };
const tileOf = (lat, lon, z = 9) => { const n = 2 ** z, fx = (lon + 180) / 360 * n, r = lat * Math.PI / 180, fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n, x = Math.floor(fx), y = Math.floor(fy); return { x, y, col: Math.min(255, Math.floor((fx - x) * 256)), row: Math.min(255, Math.floor((fy - y) * 256)) }; };
// a 256 px palette picture the way GIBS makes them: 8 bits a dot, a palette of 256 entries, no georeference
function png(idx) {
  const raw = Buffer.alloc(256 * 257); for (let r = 0; r < 256; r++) { raw[r * 257] = 0; idx.copy(raw, r * 257 + 1, r * 256, r * 256 + 256); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0); return Buffer.concat([len, body, crc]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(256, 0); head.writeUInt32BE(256, 4); head[8] = 8; head[9] = 3;
  const palette = Buffer.alloc(768); for (let k = 0; k < 256; k++) { palette[k * 3] = k; palette[k * 3 + 1] = 255 - k; palette[k * 3 + 2] = 40; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('PLTE', palette), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// the 16-day days of a year (it starts again each 1 January), as NASA lists them
const days = year => { const out = []; for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += 16 * 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
const domains = (first = 2000, last = 2026) => `<Domain>${Array.from({ length: last - first + 1 }, (_, i) => { const y = first + i, d = days(y); return `${y === 2000 ? `${y}-03-05` : d[0]}/${y === 2026 ? `${y}-10-16` : d.at(-1)}/P16D`; }).join(',')}</Domain>`;
const tileUrl = (day, t) => `${GIBS}/${LAYER}/default/${day}/${TMS}/9/${t.y}/${t.x}.png`;
const domainsUrl = `${GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=${LAYER}&TILEMATRIXSET=${TMS}`;
const OXFORD = { lat: 43.13, lon: -80.75 }, SOUTH = { lat: -35.3, lon: 149.1 };
const inNorth = d => { const m = +d.slice(5, 7); return m >= 4 && m <= 9; };
// peak(year) is the season's greenest reading (a step of the scale) or null for no picture at all; shape(day, year) can change one composite
function build({ place = OXFORD, peak = () => at(0.6051), only = null, flat = at(0.4013), shape = null, windowOf = inNorth, domainsText = null, broken = [], years = [2001, 2025], failDomains = false } = {}) {
  const t = tileOf(place.lat, place.lon), answers = path.join(tempFolder('ndvihist'), 'answers'), cache = new Map();
  addAnswer(answers, failDomains ? { url: domainsUrl, status: 503, body: 'down' } : { url: domainsUrl, body: domainsText ?? domains() });
  for (let year = years[0] - 1; year <= years[1]; year++) for (const day of days(year)) {
    if (!windowOf(day, year)) continue;
    const season = year, p = peak(season), j = days(year).indexOf(day), k = (shape ? shape(day, season, j) : null) ?? (p == null ? 0 : j === 13 ? p : flat);
    const key = [k, p == null].join();
    if (!cache.has(key)) {   // the picture: the 9 by 9 patch round the point holds the value, everything else the greenest step, so only the patch can be read
      const idx = Buffer.alloc(256 * 256, 142);
      for (let r = t.row - 4; r <= t.row + 4; r++) for (let c = t.col - 4; c <= t.col + 4; c++) if (r >= 0 && r < 256 && c >= 0 && c < 256) idx[r * 256 + c] = typeof k === 'function' ? k(r, c) : k;
      cache.set(key, png(idx));
    }
    addAnswer(answers, broken.some(b => day.startsWith(b)) ? { url: tileUrl(day, t), body: 'not a picture' } : { url: tileUrl(day, t), body: cache.get(key), headers: { 'content-type': 'image/png' } });
  }
  return answers;
}
const run = (place, answers, extra = {}) => runLookup('ndvihist', [String(place.lat), String(place.lon)], { replay: answers, now: NOW, ...extra });
const EARLY = at(0.5963), MID = at(0.6651), HIGH = at(0.7751), LOW = at(0.4989);
const stepped = (a, b) => year => (year <= 2010 ? a : year <= 2017 ? (a + b >> 1) : b);

await group('a greener land', async () => {
  const r = await run(OXFORD, build({ peak: year => stepped(EARLY, HIGH)(year) })), a = r.answer;
  contract('ndvihist', r, { maxMB: 300 });
  check('it is a good answer, with no login asked for (the greenness record is open)', a?.ok === true, a);
  same('twenty-five seasons, 2001 to 2025, oldest first, none in the year not yet over', [a.seasons.length, a.seasons[0].year, a.seasons.at(-1).year, a.data_date], [25, 2001, 2025, '2001/2025']);
  same('each season has its peak (a step of NASA\'s scale, to three decimals), the day of that composite, how many composites were read and how many there are', [a.seasons[0].peak, a.seasons[0].peak_date.slice(0, 4), a.seasons[0].n, a.seasons[0].of, a.seasons[0].partial], [0.596, '2001', 12, 12, false]);
  same('the peak day is the composite that holds it (the fourteenth of the year, at the end of July)', a.seasons[0].peak_date.slice(5), '07-28');
  same('the window is April to September, 9 by 9 dots of 250 m (about 2 km)', [a.window, a.pixel_m, a.patch_km], ['April to September', 250, 2]);
  same('the early and the recent seasons, with how many, and the change', [a.early, a.recent, a.change.kind], [{ from: 2001, to: 2010, mean: 0.6, n: 10 }, { from: 2018, to: 2025, mean: 0.78, n: 8 }, 'greener']);
  same('the sentence is made of those numbers and the advice is the note\'s', [a.sentence, a.advice], ['The land here is greener at its peak since 2018 than in 2001–2010 (about 0.78 now, 0.60 then).', 'This often means fields nearby started to be watered or changed crop: ask the seller.']);
  check('nothing is missing, so no "incomplete", and no season is without or partial', !('incomplete' in a) && a.years_without.length === 0 && a.partial_years.length === 0);
  check('the source names MODIS, the 16-day product and GIBS; the units explain the scale', /MODIS/.test(a.source) && /16-day/.test(a.source) && /Global Imagery Browse/.test(a.source) && /0 is bare ground/.test(a.units), a.source);
  check('the note says it is a patch, not the field, and that a gap is left out, never brown', /about 2 km/.test(a.note) && /never counted as brown/.test(a.note), a.note);
  same('one request for the list of days and one for each composite: 25 seasons of 12', r.asked, 1 + 25 * 12);
});

await group('a steady land, a browner land, and a season that was brown', async () => {
  const steady = await run(OXFORD, build({ peak: () => at(0.6651) })), s = steady.answer;
  contract('steady', steady);
  same('the same peak every year is steady, and nothing is said about water or crops', [s.change.kind, s.sentence, s.advice, s.browner_years], ['steady', 'Peak greenness has been steady since 2001.', null, []]);
  const dip = await run(OXFORD, build({ peak: year => (year === 2012 ? LOW : at(0.6651)) })), d = dip.answer;
  same('one season clearly below the rest is named, and the land is still steady', [d.change.kind, d.browner_years, d.sentence], ['steady', [2012], 'Peak greenness has been steady since 2001; browner seasons: 2012.']);
  const browner = await run(OXFORD, build({ peak: year => stepped(HIGH, EARLY)(year) })), b = browner.answer;
  same('a land that peaks lower now is browner, said with its numbers and no advice about neighbours', [b.change.kind, b.sentence, b.advice], ['browner', 'The land here is browner at its peak since 2018 than in 2001–2010 (about 0.60 now, 0.78 then).', null]);
  const small = await run(OXFORD, build({ peak: year => (year > 2010 ? at(0.6751) : at(0.6651)) })), m = small.answer;
  check('a difference of one step (0.01) is inside the year-to-year swing: steady, not a trend', m.change.kind === 'steady' && m.change.needed >= 0.04, m.change);
});

await group('seasons with gaps are said, never made up', async () => {
  const gappy = await run(OXFORD, build({ peak: () => at(0.6651), shape: (day, year, j) => (year === 2003 && j !== 13 && j !== 12 ? 0 : year === 2005 && j > 11 ? 0 : null) })), g = gappy.answer;
  contract('gaps', gappy);
  same('a season with two readings is left out and named, never counted as 0 or as brown', [g.years_without, g.seasons.some(s => s.year === 2003), g.seasons_read], [[2003], false, 24]);
  same('a season with fewer than seven in ten of its composites is kept, said to be partial, and its peak is the greenest it had', [g.partial_years, g.seasons.find(s => s.year === 2005).partial, g.seasons.find(s => s.year === 2005).n, g.seasons.find(s => s.year === 2005).of], [[2005], true, 6, 12]);
  check('the answer says what is missing, in words', /no greenness for 2003/.test(g.incomplete), g.incomplete);
  const bare = await run(OXFORD, build({ peak: year => (year === 2004 ? null : at(0.6651)) })), p = bare.answer;
  same('a season of pictures with no data at all (cloud, snow) is a season without, not a 0', [p.years_without, p.seasons.some(s => s.year === 2004)], [[2004], false]);
  const half = await run(OXFORD, build({ peak: () => at(0.6651), shape: (day, year) => (year === 2007 ? ((r, c) => ((r + c) % 3 === 0 ? 0 : at(0.5963))) : null) })), h = half.answer;
  check('with some dots of the patch empty the median is of the dots that have a value (about two thirds of 81)', h.ok === true && h.seasons.find(s => s.year === 2007).peak === 0.596 && h.seasons.find(s => s.year === 2007).valid_pixels >= 20, h.seasons?.find(s => s.year === 2007));
  const thin = await run(OXFORD, build({ peak: () => at(0.6651), shape: (day, year) => (year === 2007 ? ((r, c) => ((r + c) % 8 === 0 ? at(0.9051) : 0)) : null) })), t = thin.answer;
  same('a patch with fewer than 20 dots of data (a lake, a town edge) gives no reading for that composite, so the season has none', [t.years_without.includes(2007), t.seasons.some(s => s.year === 2007)], [true, false]);
  const few = await run(OXFORD, build({ peak: year => (year >= 2018 ? at(0.6651) : null) })), f = few.answer;
  check('under ten seasons with a reading: no answer, with the count, never a guess', f.ok === false && /only 8 seasons/.test(f.reason) && /takes 10/.test(f.reason), f);
  check('a failure is plain and holds no address', !/https?:|gibs\.earthdata/.test(JSON.stringify(f)));
});

await group('the service failing', async () => {
  const down = await run(OXFORD, build({ failDomains: true }));
  contract('days list down', down, { allowMiss: true });
  check('no list of days: said plainly, not final', down.answer.ok === false && /did not list the days/.test(down.answer.reason) && !down.answer.final, down.answer);
  const empty = await run(OXFORD, build({ domainsText: '<Domain></Domain>' }));
  check('an empty list is the same answer', empty.answer.ok === false && /did not list the days/.test(empty.answer.reason), empty.answer);
  const one = await run(OXFORD, build({ broken: [`${2010}-07-12`] })), o = one.answer;
  check('one picture that cannot be read costs that reading only: the season still counts and the answer says so', o.ok === true && o.seasons.find(s => s.year === 2010).n === 11 && /1 reading/.test(o.incomplete), o.incomplete);
  const all = await run(OXFORD, build({ broken: ['20'] }));
  check('every picture unreadable: "try again", not final', all.answer.ok === false && /could not be read just now/.test(all.answer.reason) && !all.answer.final, all.answer);
});

await group('the south, the tropics and the arguments', async () => {
  const south = await run(SOUTH, build({ place: SOUTH, windowOf: day => { const m = +day.slice(5, 7); return m >= 10 || m <= 3; }, peak: () => at(0.6651), years: [2001, 2025], shape: null })), s = south.answer;
  contract('south', south);
  check('in the south the season is October to March, named by the year it ends: the season of 2001 starts the October before', s.ok === true && s.window === 'October to March' && s.seasons[0].year === 2001 && s.seasons.at(-1).year === 2025 && Number(s.seasons[0].peak_date.slice(0, 4)) <= 2001, s.ok ? [s.window, s.seasons[0]] : s);
  const tropic = { lat: 5, lon: 30 }, t = tileOf(5, 30);
  const tr = await run(tropic, build({ place: tropic, windowOf: (day, year) => year >= 2000, peak: () => at(0.6651) })), r = tr.answer;
  check('in the tropics the season is 64 days either side of the last full year\'s greenest time, found from its composites', r.ok === true && /64 days either side/.test(r.window) && r.seasons.length >= 10, r.ok ? r.window : r);
  for (const [name, args, why] of [['no arguments', [], /required as decimal degrees/], ['text', ['x', '1'], /required as decimal degrees/], ['too far north', ['89', '10'], /lat must be/]]) {
    const x = await runLookup('ndvihist', args, { replay: build(), now: NOW });
    check(`${name}: refused in plain words before anything is asked`, x.answer?.ok === false && why.test(x.answer.reason) && x.asked === 0, x.answer);
  }
});

finish();
