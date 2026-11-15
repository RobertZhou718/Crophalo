// Crophalo's layer motion and the value under the pin, the pure parts: which days a time-lapse plays and how long each is held, one pixel of a NASA tile read from its palette, the colours of NASA's own colormap read back as values,
// the words under the colour bar ("Greenness here: 0.62 · 9 Nov"), the order fires fade in, and how many are in view. Pure: nothing here asks the network or reads the page.
// Checked by scripts/test_layeranim.mjs (the real colormaps NASA publishes, a real NASA tile, the day walk, every sentence).
import { newest, stepBy, addDays } from './gibs.js';
import { tileOf } from './nasabase.js';
import { unfilter } from './terrain-math.js';

// Full: each picture held 700 ms (longer when there are few, up to 1.4 s) with a 300 ms cross-fade. Less: 900 ms each, no fade. Still: nothing plays by itself.
export const PLAY = { days: 30, minFrames: 6, maxFrames: 8, holdMs: 700, holdMaxMs: 1400, budgetMs: 16000, holdLessMs: 900, fadeMs: 300, loadWaitMs: 4000 };
export const holdFor = n => Math.max(PLAY.holdMs, Math.min(PLAY.holdMaxMs, Math.round(PLAY.budgetMs / Math.max(1, n)) - PLAY.fadeMs));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDay = d => (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}` : '');

// The days a time-lapse plays, oldest first, ending at the newest image: every image NASA has in the 30 days that end on the newest (a daily layer plays about 30);
// when that is under six (greenness: one picture of its own every eight days), the last eight images instead. A day NASA has no image for is skipped. Pure.
export function frames(ranges, layer, today) {
  const last = newest(ranges, today); if (!last) return [];
  const floor = addDays(last, -(PLAY.days - 1)), all = [last];
  for (let to = stepBy(ranges, last, -1, layer.step, today); to && to >= floor; to = stepBy(ranges, to, -1, layer.step, today)) all.push(to);
  if (all.length >= PLAY.minFrames) return all.reverse();
  while (all.length < PLAY.maxFrames) { const to = stepBy(ranges, all.at(-1), -1, layer.step, today); if (!to) break; all.push(to); }
  return all.reverse();
}
export const coversDays = days => days.length > 1 && (Date.parse(days.at(-1)) - Date.parse(days[0])) / 864e5 <= PLAY.days - 1;   // the frames lie inside the last 30 days: the button may say so

// ---- one pixel of a NASA tile. GIBS sends 8-bit palette pictures; reading the palette entry itself (not the colour a canvas shows) keeps the see-through entries apart:
// "no rain to speak of" and "no data" are both clear on the map, and only the palette says which. Returns [r, g, b, alpha] of the entry. Pure, given inflate (bytes → the inflated bytes).
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
export async function palettePixel(bytes, px, py, inflate) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 33 || PNG_SIG.some((v, i) => b[i] !== v)) throw new Error('not a PNG');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength), parts = [];
  let width = 0, height = 0, depth = 0, colour = 0, interlace = 0, palette = null, alpha = null;
  for (let at = 8; at + 8 <= b.length;) {
    const len = view.getUint32(at), type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]), data = b.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = b[at + 16]; colour = b[at + 17]; interlace = b[at + 20]; }
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') alpha = data;
    else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  if (colour !== 3 || ![1, 2, 4, 8].includes(depth) || interlace !== 0 || !palette || !parts.length) throw new Error('not a palette picture');
  if (!(px >= 0 && px < width && py >= 0 && py < height)) throw new Error('outside the picture');
  const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let off = 0; for (const p of parts) { joined.set(p, off); off += p.length; }
  const stride = Math.ceil((width * depth) / 8), raw = new Uint8Array(await inflate(joined));
  if (raw.length < height * (stride + 1)) throw new Error('the picture is cut short');
  const rows = unfilter(raw.subarray(0, (py + 1) * (stride + 1)), stride, py + 1, 1), byte = rows[py * stride + ((px * depth) >> 3)];
  const i = depth === 8 ? byte : (byte >> (8 - depth - ((px * depth) & 7))) & ((1 << depth) - 1);
  if (i * 3 + 2 >= palette.length) throw new Error('outside the palette');
  return [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2], alpha && i < alpha.length ? alpha[i] : 255];
}

// ---- NASA's colormap, read back: a tile is a palette picture whose colours are exactly the colormap's, so a pixel's colour says its value. The see-through entries are kept, marked:
// nodata (NASA has no value there) or clear (a value under the bottom of the scale, such as rain under 0.1 mm/h). Pure.
const num = t => { const v = parseFloat(t); return Number.isFinite(v) ? v : t.trim().startsWith('-') ? -Infinity : Infinity; };
export function parseColormap(xml, cm) {
  const maps = String(xml ?? '').split(/<ColorMap\b/).slice(1), want = [cm?.title, cm?.alt].filter(Boolean), out = [], hidden = [];
  for (const m of maps) {
    const title = /title="([^"]*)"/.exec(m)?.[1] ?? '';
    const entries = [];
    for (const e of m.matchAll(/<ColorMapEntry\b([^>]*)\/>/g)) {
      const a = e[1], rgb = /rgb="(\d+),(\d+),(\d+)"/.exec(a), v = /\bvalue="\[([^,\]]+),([^)\]]+)[)\]]"/.exec(a);
      if (!rgb) continue;
      const key = `${rgb[1]},${rgb[2]},${rgb[3]}`, see = /transparent="true"/.test(a), nodata = /nodata="true"/.test(a);
      if (see || nodata) { if (!hidden.some(h => h.rgb === key)) hidden.push({ rgb: key, lo: v ? num(v[1]) : null, hi: v ? num(v[2]) : null, kind: title, at: null, nodata, clear: !nodata }); continue; }
      if (!v || (want.length && !want.includes(title))) continue;
      entries.push({ rgb: key, lo: num(v[1]), hi: num(v[2]), kind: title });
    }
    out.push(...entries.map((e, i) => ({ ...e, at: entries.length > 1 ? i / (entries.length - 1) : 0 })));   // at: where on the colour bar (0 to 1)
  }
  return [...out, ...hidden];
}
// The entry of a pixel: its colour, and whether it is see-through (alpha under 16). An alpha that is not given counts as opaque.
export function valueAt(entries, r, g, b, alpha = 255) {
  const key = `${r},${g},${b}`, clearPx = alpha < 16, hit = entries.find(e => e.rgb === key && (e.at === null) === clearPx);
  if (!hit) return null;
  if (hit.at === null) return { value: null, lo: hit.lo, hi: hit.hi, kind: hit.kind, at: null, open: false, nodata: hit.nodata, clear: hit.clear };
  const mid = Number.isFinite(hit.lo) && Number.isFinite(hit.hi) ? (hit.lo + hit.hi) / 2 : Number.isFinite(hit.lo) ? hit.lo : hit.hi;
  return { value: mid, lo: hit.lo, hi: hit.hi, kind: hit.kind, at: hit.at, open: !(Number.isFinite(hit.lo) && Number.isFinite(hit.hi)) };
}
const fix1 = v => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const digits = (layer, v) => (layer.id === 'ndvi' ? v.toFixed(2) : layer.id === 'smap' ? v.toFixed(2) : layer.id === 'temp' ? String(Math.round(v)) : fix1(v));
// "Greenness here: 0.62 · 9 Nov", the rain as the day's average rate with about how much fell, or, when nothing could be read, the plain reason. Pure.
export function hereWords(layer, hit, day, why = '') {
  const on = day ? ` · ${shortDay(day)}` : '';
  if (!hit) return `No value for your pin${why ? `: ${why}` : ''}.`;
  if (hit.nodata) return `No value for your pin: ${HERE_WHY.nodata}.`;
  if (hit.clear) return `${layer.here}: ${layer.clear ?? 'under the bottom of the scale'}${on}`;
  const v = layer.cm?.kelvin ? hit.value - 273.15 : hit.value;
  if (layer.id === 'rain') {
    const snow = /snow/i.test(hit.kind ?? ''), name = snow ? 'Snow here' : layer.here, water = snow ? ' of water' : '';
    if (hit.open) return `${name}: ${fix1(Number.isFinite(hit.lo) ? hit.lo : v)} mm/h${water} or more on average that day${on}`;
    return `${name}: ${fix1(v)} mm/h${water} on average that day (about ${fix1(v * 24)} mm)${on}`;
  }
  return `${layer.here}: ${hit.open ? 'about ' : ''}${digits(layer, v)}${layer.unit}${on}`;
}
export const HERE_WHY = Object.freeze({ nopin: 'drop a pin first', nodata: 'no image at the pin on this day', blocked: 'the browser did not allow reading the picture', down: 'NASA did not answer' });

// ---- fires: appear in the order they were seen, the newest few get a halo, and the count in view
export function fireOrder(points, total = 2400) {
  const sorted = [...(points ?? [])].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)), n = sorted.length || 1;
  return sorted.map((p, i) => ({ p, delay: Math.round((i / n) * total), newest: i >= sorted.length - 5 }));
}
export const inView = (points, b) => (points ?? []).filter(p => p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e).length;
export const countWords = (n, hours = 24) => (n === 0 ? `No hot spot was detected in view in the last ${hours} h` : `${n} hot spot${n === 1 ? '' : 's'} in view in the last ${hours} h`);
export const PLAY_WORDS = Object.freeze({
  play: 'Play the last 30 days', playN: n => `Play the last ${n} images`, pause: 'Pause', replay: 'Play again',
  still: 'Playing by itself is off (Still motion). Use Earlier and Later to step.',
  few: 'NASA has only one image of this layer to play.',
  frame: (name, day) => `${name}: ${shortDay(day)}`,
  progress: (i, n, day) => `${i} of ${n} · ${shortDay(day)}`,
});

// The tile at a zoom and the pixel inside it (0 to 255) that a place falls on: what is read to find the value under the pin. Pure.
export function pixelOf(lat, lon, z) {
  const t = tileOf(lat, lon, z), n = 2 ** z, la = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
  const fx = ((lon + 180) / 360) * n - t.x, fy = ((1 - Math.asinh(Math.tan(la)) / Math.PI) / 2) * n - t.y;
  return { z, x: t.x, y: t.y, px: Math.min(255, Math.max(0, Math.floor(fx * 256))), py: Math.min(255, Math.max(0, Math.floor(fy * 256))) };
}
