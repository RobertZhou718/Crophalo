// Crophalo's NASA GIBS map layers, the facts and the pure parts: the four layers the map offers (plant greenness, soil moisture, rain rate, land temperature) with their tile address, their legend colours and words;
// the dates NASA has an image for (read from its DescribeDomains answer, up to yesterday, snapping across gaps); and the tile address of a day. Pure: nothing here asks the network or reads the page.
// Colours are 10 evenly spaced entries of NASA's own colormaps (colormaps/v1.3, read 14 November 2026). Checked by scripts/test_gibs.mjs (real DescribeDomains answers, the date rules, the tile addresses, the legends, every sentence).
export const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const DOMAINS = layer => `${GIBS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=${layer.gibs}&TILEMATRIXSET=${layer.tms}`;
export const tileTemplate = layer => `${GIBS}/${layer.gibs}/default/{time}/${layer.tms}/{z}/{y}/{x}.png`;
export const tileUrl = (layer, date, z = 1, x = 0, y = 0) => `${GIBS}/${layer.gibs}/default/${date}/${layer.tms}/${z}/${y}/${x}.png`;   // a Leaflet tile is z/y/x on this server

export const LAYERS = Object.freeze([
  { id: 'ndvi', gibs: 'MODIS_Terra_NDVI_8Day', tms: 'GoogleMapsCompatible_Level9', native: 9, name: 'Plant greenness', sub: 'MODIS Terra, 250 m, an 8-day average', step: 8,
    stops: ['#f1ecec', '#e5dbce', '#c0b097', '#ac8d73', '#b0cf68', '#80b006', '#4e9401', '#217800', '#006000', '#001801'], low: '0 · bare', high: '1.0 · dense crops', note: '' },
  { id: 'smap', gibs: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', tms: 'GoogleMapsCompatible_Level6', native: 6, name: 'Soil moisture', sub: 'SMAP root zone, 9 km, daily', step: 1,
    stops: ['#ffa200', '#ffe500', '#acd500', '#008200', '#00d6ae', '#00b2ff', '#000cff', '#00009e', '#181864', '#505050'], low: '0 · dry', high: '0.7+ · saturated', note: 'Coarse satellite pixels (9 km). Zoom out for the regional picture.' },
  { id: 'rain', gibs: 'IMERG_Precipitation_Rate', tms: 'GoogleMapsCompatible_Level6', native: 6, name: 'Rain rate', sub: 'GPM IMERG, 10 km, daily', step: 1,
    stops: ['#00764e', '#00971f', '#2db800', '#99d900', '#fad200', '#ff6c1f', '#ff1313', '#c80000', '#7d0000', '#330000'], low: '0.1 mm/h', high: '53+ mm/h', note: 'Light blue to purple shows snow, on the same mm/h scale.' },
  { id: 'temp', gibs: 'MODIS_Terra_Land_Surface_Temp_Day', tms: 'GoogleMapsCompatible_Level7', native: 7, name: 'Land temperature', sub: 'MODIS Terra, 1 km, daytime', step: 1,
    stops: ['#c900ff', '#5900ff', '#0024ff', '#00b3ff', '#33ff89', '#95ff00', '#ffff00', '#ffac00', '#ff5500', '#ff0100'], low: '−73 °C', high: '+77 °C', note: 'One pass a day: clouds leave gaps.' },
]);
// The fifth entry is not a picture but points: the spots the VIIRS satellites saw hotter than their surroundings in the last 24 hours (NASA FIRMS, asked of our own server: /api/firms). Not in LAYERS, which are the picture layers.
export const FIRES = Object.freeze({ id: 'fires', kind: 'points', name: 'Fires and hot spots', sub: 'VIIRS NOAA-20 and NOAA-21, 375 m, last 24 hours', step: 1,
  colours: Object.freeze({ high: '#c4320a', nominal: '#f08c1a', low: '#f2d16b' }),
  words: Object.freeze({ high: 'High confidence', nominal: 'Nominal confidence', low: 'Low confidence (often not a fire)' }),
  note: 'A fire under cloud, or between satellite passes, is not seen. No spot does not mean there is no fire.' });
export const layerOf = id => (id === FIRES.id ? FIRES : LAYERS.find(l => l.id === id) ?? null);
export const FIRES_URL = (lat, lon) => `/api/firms?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`;
export const fireRadius = frp => (frp == null ? 4 : Math.max(4, Math.min(12, 3 + Math.sqrt(Math.max(0, frp)))));   // bigger fire, bigger dot, between 4 and 12 px
const pad = n => String(n).padStart(2, '0');
export const fireTime = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso ?? '')); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}, ${pad(m[4])}:${m[5]} UTC` : ''; };
// The words under the points: what was seen, how many, and plainly that none seen is not none burning.
export function fireWords(a) {
  if (!a || a.ok === false) return `${WORDS.down}. ${WORDS.retry}`;
  const n = a.count ?? 0, newestAt = fireTime(a.newest);
  const head = n === 0 ? 'The satellites saw no fire or hot spot within about 250 km of the map centre in the last 24 hours.' : `${n} spot${n === 1 ? '' : 's'} seen within about 250 km of the map centre in the last 24 hours${a.shown < n ? `; the nearest ${a.shown} are drawn` : ''}.`;
  return `${head}${newestAt ? ` Newest satellite pass in the data: ${newestAt}.` : ''}${a.incomplete ? ` ${a.incomplete}.` : ''} ${FIRES.note}`;
}

export const legendGradient = layer => `linear-gradient(90deg, ${layer.stops.join(', ')})`;

export const WORDS = Object.freeze({
  down: 'Not available right now: NASA\'s image server did not answer',
  retry: 'Try again later.',
  empty: 'NASA has no image for this part of the map on this date. Try another date or move the map.',
  waiting: 'Looking for the dates NASA has an image for…',
  snapped: (asked, got) => `NASA has no image for ${dateWords(asked)}. Showing ${dateWords(got)}, the nearest day it has.`,
  none: 'NASA has no image of this layer yet.',
});

// ---- days
const DAY = 864e5;
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const num = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dateWords = d => (isDay(d) ? `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');
export const addDays = (d, n) => iso(num(d) + n);

// The dates NASA has an image for: the Domain of a DescribeDomains answer, "start/end/P1D,start/end/P1D,…", as [{ from, to, every }] in days. Anything that is not a plain day range is left out.
export function parseDomains(xml) {
  const m = /<Domain>([^<]*)<\/Domain>/.exec(String(xml ?? ''));
  if (!m) return [];
  const out = [];
  for (const part of m[1].split(',')) {
    const [from, to, period] = part.trim().split('/');
    const every = /^P(\d{1,3})D$/.exec(period ?? '');
    if (isDay(from) && isDay(to) && num(from) <= num(to) && every && +every[1] >= 1) out.push({ from, to, every: +every[1] });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : 1));
}
const has = (ranges, d) => ranges.some(r => d >= r.from && d <= r.to && (num(d) - num(r.from)) % r.every === 0);
// The days of the ranges that are not after `last`, as numbers (a long record is thousands of days, so ranges are walked, never listed).
function nearest(ranges, d, dir, last) {   // dir: -1 the nearest on or before d, 1 the nearest on or after, 0 the nearest either side (the earlier on a tie)
  const n = num(d), cap = last ? num(last) : Infinity;
  let before = null, after = null;
  for (const r of ranges) {
    const a = num(r.from), b = Math.min(num(r.to), cap);
    if (a > b) continue;
    if (n >= a) { const k = Math.floor((Math.min(n, b) - a) / r.every); const c = a + k * r.every; if (c <= n && (before === null || c > before)) before = c; }
    if (n <= b) { const k = Math.max(0, Math.ceil((n - a) / r.every)); const c = a + k * r.every; if (c >= n && c <= b && (after === null || c < after)) after = c; }
  }
  if (dir < 0) return before === null ? null : iso(before);
  if (dir > 0) return after === null ? null : iso(after);
  if (before === null) return after === null ? null : iso(after);
  if (after === null) return iso(before);
  return n - before <= after - n ? iso(before) : iso(after);
}
// The newest day with an image that is not after yesterday (GIBS lists today and tomorrow before their images are filled in). today: 'YYYY-MM-DD' (UTC).
export const newest = (ranges, today) => (isDay(today) ? nearest(ranges, addDays(today, -1), -1, addDays(today, -1)) : null);
export const oldest = ranges => (ranges.length ? ranges[0].from : null);
export const snap = (ranges, d, today, dir = 0) => (isDay(d) && isDay(today) ? nearest(ranges, d, dir, addDays(today, -1)) : null);
// One step earlier or later: `days` before or after, then the nearest day with an image in that direction; null when there is none that way.
export function stepBy(ranges, d, dir, days, today) {
  if (!isDay(d) || !isDay(today)) return null;
  const to = nearest(ranges, addDays(d, dir * days), dir < 0 ? -1 : 1, addDays(today, -1));
  return to && to !== d ? to : null;
}
export const minOf = ranges => oldest(ranges), maxOf = (ranges, today) => newest(ranges, today), hasDay = has;

// The words under a layer's colour bar: the ends, in plain words.
export const legendWords = layer => `${layer.low} to ${layer.high}`;
export const buttonWords = (on) => (on.length === 0 ? 'Layers' : on.length === 1 ? layerOf(on[0])?.name ?? 'Layers' : `${on.length} layers`);
