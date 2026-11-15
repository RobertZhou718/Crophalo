// Crophalo's suite for the layer motion and the value under the pin (js/layeranim.js): the days a time-lapse plays and how long each is held, one pixel of a real NASA tile read from its palette, NASA's real colormaps read back
// as values, the words under the colour bar, the order fires fade in and the count in view. RULE: never loosen a check here without a written farming reason beside it (a value shown as read must be read, a dry day must read as dry
// and not as missing, and a spot missing from the count must never read as none burning).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { D, domains } from './gibs_fixtures.mjs';
import { LAYERS, layerOf, parseDomains, COLORMAP, addDays, hasDay, newest } from '../js/gibs.js';
import { frames, coversDays, holdFor, palettePixel, parseColormap, valueAt, hereWords, shortDay, fireOrder, inView, countWords, pixelOf, PLAY, PLAY_WORDS, HERE_WHY } from '../js/layeranim.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const real = id => parseDomains(domains(layerOf(id).gibs));
const cm = id => parseColormap(fs.readFileSync(new URL(`./fixtures/gibs/colormap_${layerOf(id).cm.name}.xml`, import.meta.url), 'utf8'), layerOf(id).cm);
const TODAY = D('20261115');

// the days of a time-lapse. The owner asked for "Play the last 30 days": a daily layer plays every day NASA has in the 30 days that end on its newest image (it played only the last eight before, under the same words)
for (const id of ['rain', 'smap', 'temp']) {
  const days = frames(real(id), layerOf(id), TODAY), last = newest(real(id), TODAY), want = Array.from({ length: 30 }, (_, i) => addDays(last, i - 29)).filter(d => hasDay(real(id), d));
  same(`${id}: a daily layer plays every day NASA has in the 30 days ending on its newest image, oldest first, a missing day skipped`, days, want);
  check(`${id}: that is most of the 30 days, and the button may say "the last 30 days"`, days.length >= 25 && coversDays(days), days.length);
}
const ndvi = frames(real('ndvi'), layerOf('ndvi'), TODAY);
check('greenness (one picture of its own every eight days) has under six in 30 days, so it plays its last eight images, eight days apart', ndvi.length === PLAY.maxFrames && ndvi.every((d, i) => i === 0 || d === addDays(ndvi[i - 1], 8)) && ndvi.at(-1) === newest(real('ndvi'), TODAY), ndvi);
check('and the button then says how many images, not "30 days"', !coversDays(ndvi) && PLAY_WORDS.playN(ndvi.length) === 'Play the last 8 images');
same('no dates, no frames', frames([], layerOf('rain'), TODAY), []);
same('a picture is held 700 ms when there are 30, longer when there are few (1.4 s at most), never shorter', [holdFor(30), holdFor(8), holdFor(2), holdFor(200)], [700, 1400, 1400, 700]);
check('30 days take about half a minute under Full motion', Math.abs(30 * (holdFor(30) + PLAY.fadeMs) - 30000) <= 1000 && PLAY.fadeMs === 300 && PLAY.holdLessMs === 900);
check('a day is shown short', shortDay(D('20261109')) === '9 Nov' && shortDay('nope') === '');

// the colormaps NASA publishes, read back
for (const l of LAYERS) check(`${l.id}: the colormap parses into many entries, each with a place on the bar between 0 and 1`, cm(l.id).length > 100 && cm(l.id).every(e => e.at >= 0 && e.at <= 1), cm(l.id).length);
check('the address of a colormap names its file', COLORMAP(layerOf('ndvi')) === 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_NDVI.xml');
const N = cm('ndvi'), T = cm('temp'), R = cm('rain'), S = cm('smap');
const ndviHit = valueAt(N, 154, 110, 89);
check('a greenness colour reads back as its value (0.28 for the brown of thin cover)', ndviHit && Math.abs(ndviHit.value - 0.2826) < 0.001 && hereWords(layerOf('ndvi'), ndviHit, D('20261109')) === 'Greenness here: 0.28 · 9 Nov', ndviHit);
const tHit = valueAt(T, 0, 46, 255);
check('land temperature comes in kelvin and is shown in degrees Celsius', tHit && /^Land temperature here: -39 °C · 9 Nov$/.test(hereWords(layerOf('temp'), tHit, D('20261109'))), tHit && hereWords(layerOf('temp'), tHit, D('20261109')));
const rHit = valueAt(R, 255, 136, 20);
check('rain reads in mm/h', rHit && /^Rain here: 2\.7 mm\/h/.test(hereWords(layerOf('rain'), rHit, D('20261109'))), rHit && hereWords(layerOf('rain'), rHit, D('20261109')));
const top = valueAt(R, 58, 3, 48);
check('the open top end says "or more" (53 mm/h or more is not a number)', top && top.open && /^(Snow|Rain) here: 53 mm\/h( of water)? or more on average that day$/.test(hereWords(layerOf('rain'), top, null)), top && hereWords(layerOf('rain'), top, null));
const dry = valueAt(S, 255, 162, 0);
check('soil moisture reads in m³/m³', dry && /^Soil moisture here: 0\.0\d m³\/m³ · 1 Nov$/.test(hereWords(layerOf('smap'), dry, D('20261101'))), dry && hereWords(layerOf('smap'), dry, D('20261101')));
same('a colour that is not in the colormap is not read, never guessed', valueAt(N, 1, 2, 3), null);
same('and says so plainly, with the reason', hereWords(layerOf('ndvi'), null, D('20261109'), HERE_WHY.nodata), 'No value for your pin: no image at the pin on this day.');
check('the marker place of an entry is its place along the bar', ndviHit.at > 0 && ndviHit.at < 1 && valueAt(N, 0, 24, 1).at === 1, [ndviHit.at, valueAt(N, 0, 24, 1)?.at]);
same('rain is the average rate of the whole day, with about how much fell that day', hereWords(layerOf('rain'), rHit, D('20261109')), 'Rain here: 2.7 mm/h on average that day (about 66 mm) · 9 Nov');

// see-through entries: NASA's colormap marks "no data" and "under the bottom of the scale" apart, and both are clear on the map
const dryHit = valueAt(R, 191, 191, 191, 0), noHit = valueAt(R, 128, 128, 128, 0);
check('rain under 0.1 mm/h is a clear entry of its own, not "no data"', dryHit && dryHit.clear && !dryHit.nodata && dryHit.at === null && noHit && noHit.nodata, [dryHit, noHit]);
same('a dry day reads as dry, with its day', hereWords(layerOf('rain'), dryHit, D('20261113')), 'Rain here: under 0.1 mm/h on average that day (dry, or nearly) · 13 Nov');
same('a pixel with no data has no value, and why', hereWords(layerOf('rain'), noHit, D('20261113')), 'No value for your pin: no image at the pin on this day.');
same('greenness under 0 is water, snow or ice', hereWords(layerOf('ndvi'), valueAt(N, 225, 225, 225, 0), D('20261113')), 'Greenness here: under 0 (water, snow or ice, not plants) · 13 Nov');
same('a clear pixel of a colour NASA does not list is not read, never guessed; an opaque pixel never matches a clear entry', [valueAt(R, 1, 2, 3, 0), valueAt(R, 191, 191, 191, 255)], [null, null]);
check('the soil moisture "no data" entry is kept apart from its colours', valueAt(S, 0, 0, 0, 0)?.nodata === true && valueAt(T, 64, 64, 64, 0)?.nodata === true);

// one pixel of a real NASA tile, read from its palette (recorded fresh from GIBS: the rain of the newest day, 13 November, on the tile that holds the demo field)
const inflate = bytes => zlib.inflateSync(Buffer.from(bytes));
const tile = fs.readFileSync(new URL('./fixtures/gibs/tile_IMERG_Precipitation_Rate_6_23_17.png', import.meta.url));
const pin = pixelOf(44.4438, -79.6618, 6), under = await palettePixel(tile, pin.px, pin.py, inflate);
check('the pixel under the demo pin is a palette entry of NASA\'s rain colormap, never an unknown colour', under.length === 4 && valueAt(R, ...under) !== null, under);
const corner = await palettePixel(tile, 0, 0, inflate);
same('a see-through entry keeps its own colour in the palette: the top-left corner of this tile had no rain to speak of', corner, [191, 191, 191, 0]);
const counts = new Map(); for (let y = 0; y < 256; y += 5) for (let x = 0; x < 256; x += 5) { const p = (await palettePixel(tile, x, y, inflate)).join(); counts.set(p, (counts.get(p) ?? 0) + 1); }
check('every pixel of the tile is an entry the colormap knows (a value, dry, or no data)', [...counts.keys()].every(k => valueAt(R, ...k.split(',').map(Number)) !== null), [...counts.keys()].slice(0, 5));
// a picture made here: every row filter, a 4-bit palette, a see-through entry
function png(width, height, depth, rows, palette, alpha) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); };   // the reader does not check the CRC
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(palette.flat())), ...(alpha ? [chunk('tRNS', Buffer.from(alpha))] : []), chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]);
}
{
  const W = 6, H = 5, idx = (x, y) => (x * 3 + y * 5) % 16, stride = Math.ceil((W * 4) / 8), raw = [];
  const plain = Array.from({ length: H }, (_, y) => Array.from({ length: stride }, (_, b) => (idx(b * 2, y) << 4) | idx(b * 2 + 1, y)));
  for (let y = 0; y < H; y++) {   // filter each row with a different one of PNG's five filters
    const f = y % 5, row = plain[y], up = y ? plain[y - 1] : Array(stride).fill(0);
    raw.push(f, ...row.map((v, i) => { const a = i ? row[i - 1] : 0, b = up[i], c = i ? up[i - 1] : 0; const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return (v - [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f] + 256) & 255; }));
  }
  const palette = Array.from({ length: 16 }, (_, i) => [i * 10, 255 - i * 10, i]), made = png(W, H, 4, raw, palette, [0, 255, 128]);
  const got = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) got.push((await palettePixel(made, x, y, inflate))[0] / 10);
  same('a 4-bit palette picture with every row filter reads back exactly', got, Array.from({ length: W * H }, (_, i) => idx(i % W, Math.floor(i / W))));
  same('the see-through part of the palette is read with it', [(await palettePixel(made, 0, 0, inflate))[3], (await palettePixel(made, 1, 0, inflate))[3]], [idx(0, 0) === 0 ? 0 : idx(0, 0) === 1 ? 255 : idx(0, 0) === 2 ? 128 : 255, idx(1, 0) === 0 ? 0 : idx(1, 0) === 1 ? 255 : idx(1, 0) === 2 ? 128 : 255]);
  let bad = 0; for (const b of [Buffer.from('not a png'), png(W, H, 8, [0], palette), Buffer.concat([made.subarray(0, 33)])]) { try { await palettePixel(b, 0, 0, inflate); } catch { bad++; } }
  try { await palettePixel(made, W, 0, inflate); } catch { bad++; }
  same('what is not a palette picture, is cut short, or is asked outside the picture is refused, never read', bad, 4);
}

// fires
const pts = ['2026-11-15T01:00:00Z', '2026-11-15T03:00:00Z', '2026-11-15T02:00:00Z', '2026-11-15T05:00:00Z', '2026-11-15T04:00:00Z', '2026-11-15T06:00:00Z', '2026-11-15T00:00:00Z'].map((time, i) => ({ lat: 44 + i * 0.1, lon: -79, time }));
const order = fireOrder(pts);
same('fires appear in the order they were seen', order.map(o => o.p.time), [...pts.map(p => p.time)].sort());
check('the delays rise from zero and stay under the total, the newest five carry the halo', order[0].delay === 0 && order.every((o, i) => i === 0 || o.delay >= order[i - 1].delay) && order.at(-1).delay < 2400 && order.filter(o => o.newest).length === 5 && order.at(-1).newest && !order[0].newest);
same('no fires, no order', fireOrder([]), []);
same('the count in view counts only what is inside the box', inView(pts, { s: 44, n: 44.35, w: -80, e: -78 }), 4);
same('the count says what was and was not counted', [countWords(12), countWords(1), countWords(0)], ['12 hot spots in view in the last 24 h', '1 hot spot in view in the last 24 h', 'No hot spot was detected in view in the last 24 h']);
check('every sentence is plain', [...Object.values(HERE_WHY), PLAY_WORDS.play, PLAY_WORDS.playN(8), PLAY_WORDS.pause, PLAY_WORDS.replay, PLAY_WORDS.still, PLAY_WORDS.few, PLAY_WORDS.frame('Rain rate', D('20261109')), PLAY_WORDS.progress(12, 30, D('20261109')), ...LAYERS.map(l => l.span), ...LAYERS.filter(l => l.clear).map(l => l.clear)].every(t => typeof t === 'string' && t.length > 3 && !/\b(API|undefined|null|NaN)\b/.test(t)));
same('during play the legend says how far it has come', PLAY_WORDS.progress(12, 30, D('20261109')), '12 of 30 · 9 Nov');
const px = pixelOf(43.13, -80.75, 6);
check('the pixel under a place is inside its tile, at the native zoom of the layer', px.z === 6 && px.x === 17 && px.y === 23 && px.px >= 0 && px.px <= 255 && px.py >= 0 && px.py <= 255, px);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
