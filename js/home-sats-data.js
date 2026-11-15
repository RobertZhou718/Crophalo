// Crophalo's satellites on the home Earth: the thirteen whose data Crophalo reads, what each does (from its NASA or ESA mission page),
// what Crophalo reads from it, and the sums that put it on the drawing. Pure: no page, no network, no clock.
// Checked by scripts/test_live_orbits.mjs (the list is the server's, every card has its words, the sums) and scripts/e2e_home.mjs.

const D = Math.PI / 180;
export const EARTH_KM = 6371.0088;   // the drawn globe is a sphere of the Earth's mean radius
export const OLD_DAYS = 3, GONE_DAYS = 14;   // elements this old may put a satellite tens of km off; this old, it is not drawn

// go: the screen a card links to, 'map' (the setup map, with its Layers) or 'demo' (the demo field's report)
const HLS = 'Through NASA HLS: the report’s Greenness of your field card and My farm’s observed ground.';
const S2 = { look: 's2', gathers: 'MSI', more: 'The MultiSpectral Instrument: 13 bands of light, 10 to 60 m to a dot, across 290 km.',
  plain: ['Shows how green your own field is.', 'It takes sharp colour pictures of farmland.', 'Crophalo uses them, with Landsat, for the Greenness of your field card.'],
  by: 'ESA, for the EU’s Copernicus programme', does: 'ESA’s Sentinel-2 satellites photograph the land in 13 colours, 10 to 60 m to a dot, to watch farming, forests and how land changes.',
  uses: 'Through NASA HLS, with Landsat: the report’s Greenness of your field card and My farm’s observed ground.', go: 'demo',
  page: 'https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Facts_and_figures', pageWords: 'ESA’s page about Sentinel-2' };
const GRACE = { gathers: 'the microwave ranging system', more: 'The two craft fly about 220 km apart and measure the distance between them all the time.',
  plain: ['Shows if your region is gaining or losing water.', 'Two satellites fly as a pair and feel the weight of the water below them.', 'Crophalo uses them for the Regional water storage card.'],
  by: 'NASA and GFZ, Germany', uses: 'The report’s Regional water storage card.', go: 'demo', page: 'https://science.nasa.gov/mission/grace-fo/', pageWords: 'NASA’s page about GRACE-FO' };
export const SATS = Object.freeze([
  { norad: 25994, look: 'terra', gathers: 'MODIS', more: 'A camera that sees the Earth in 36 bands of light, 250 m to 1 km to a dot.',
    plain: ['Shows how green your crops are and how warm the land is.', 'It sees the whole Earth every one to two days.', 'Crophalo uses it for the Plant greenness and Land temperature map layers.'],
    name: 'Terra', by: 'NASA', does: 'Watches the Earth’s air, land and oceans; its MODIS camera sees the whole Earth every one to two days.',
    uses: 'The map’s Plant greenness and Land temperature layers, and the greenness since 2001 in Land history. The Earth on this page is Terra’s too: NASA’s Blue Marble, made from its pictures of 2004.',
    go: 'map', page: 'https://science.nasa.gov/mission/terra/',  },
  { norad: 43013, look: 'jpss', tag: '20', gathers: 'VIIRS', more: 'A camera that sees the whole Earth every day in 22 bands of light, 375 to 750 m to a dot.',
    plain: ['Shows fires and hot spots near your field.', 'It sees the whole Earth every day.', 'Crophalo uses it for the Fires and hot spots map layer.'],
    name: 'NOAA-20', by: 'NOAA, with NASA', does: 'A polar weather satellite: its VIIRS camera covers the whole Earth every day, in visible and infrared light.',
    uses: 'The map’s Fires and hot spots layer: NASA’s FIRMS finds fires in its pictures within about three hours.', go: 'map',
    page: 'https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/noaa-20', pageWords: 'NASA Earthdata’s page about NOAA-20' },
  { norad: 54234, look: 'jpss', tag: '21', gathers: 'VIIRS', more: 'A camera that sees the whole Earth every day in 22 bands of light, 375 to 750 m to a dot.',
    plain: ['Shows fires and hot spots near your field, together with NOAA-20.', 'It sees the whole Earth every day.', 'Crophalo uses it for the Fires and hot spots map layer.'],
    name: 'NOAA-21', by: 'NOAA, with NASA', does: 'Another of NOAA’s polar weather satellites, with the same VIIRS camera, covering the whole Earth every day.',
    uses: 'The map’s Fires and hot spots layer, with NOAA-20.', go: 'map',
    page: 'https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/noaa-21', pageWords: 'NASA Earthdata’s page about NOAA-21' },
  { norad: 40376, look: 'smap', gathers: 'the L-band radiometer', more: 'It reads the natural microwave energy of the ground through a 6 m spinning mesh antenna, across 1,000 km.',
    plain: ['Shows how wet your soil is.', 'It measures the water in the top soil every two to three days.', 'Crophalo uses it for the Soil moisture card and map layer.'],
    name: 'SMAP', by: 'NASA', does: 'Measures how much water is in the top layer of soil everywhere on Earth every two to three days, and whether the ground is frozen.',
    uses: 'The report’s Soil moisture around the roots card and the map’s Soil moisture layer.', go: 'map',
    page: 'https://science.nasa.gov/mission/smap/', note: 'Its radar stopped; the part Crophalo reads still works.' },
  { norad: 39574, look: 'gpm', gathers: 'GMI', more: 'A microwave radiometer that measures rain and snow across 904 km, with a rain radar beside it.',
    plain: ['Shows how much rain and snow fell on your area.', 'It measures rain from space, also where no rain gauge stands.', 'Crophalo uses it for the Satellite rain card and the Rain rate map layer.'],
    name: 'GPM Core Observatory', by: 'NASA and JAXA', does: 'Measures rain and snow with a radar and a microwave radiometer, and sets the standard the other rain satellites are calibrated to.',
    uses: 'The report’s Satellite rain card, the map’s Rain rate layer and the satellite rain in the NASA POWER weather record (NASA’s IMERG joins many rain satellites into one map).',
    go: 'map', page: 'https://gpm.nasa.gov/missions/GPM/core-observatory', pageWords: 'NASA’s page about the GPM Core Observatory' },
  { norad: 43476, look: 'gracefo', tag: '1', name: 'GRACE-FO 1', ...GRACE, does: 'One of a pair about 220 km apart that keep measuring the distance between them; it changes with the pull of gravity, which shows where water gathers or drains.' },
  { norad: 43477, look: 'gracefo', tag: '2', name: 'GRACE-FO 2', ...GRACE, does: 'The other of the pair: the distance between the two changes with the pull of gravity, which shows where water gathers or drains in the ground, rivers and ice.' },
  { norad: 39084, look: 'landsat', tag: '8', gathers: 'OLI', more: 'The Operational Land Imager photographs the land 30 m to a dot, across 185 km.',
    plain: ['Shows how green your own field is.', 'Its pictures are sharp enough to see one field.', 'Crophalo uses it for the Greenness of your field card.'],
    name: 'Landsat 8', by: 'NASA and USGS', does: 'Photographs the land in visible and infrared light, 30 m to a dot, and measures its surface temperature, to show how land changes.',
    uses: HLS, go: 'demo', page: 'https://science.nasa.gov/mission/landsat-8/' },
  { norad: 49260, look: 'landsat', tag: '9', gathers: 'OLI-2', more: 'A copy of Landsat 8’s imager: 30 m to a dot, across 185 km.',
    plain: ['Shows how green your own field is, together with Landsat 8.', 'The two see each place every eight days.', 'Crophalo uses it for the Greenness of your field card.'],
    name: 'Landsat 9', by: 'NASA and USGS', does: 'Carries on the longest record of the land seen from space; with Landsat 8 it sees each place every eight days.',
    uses: HLS, go: 'demo', page: 'https://science.nasa.gov/mission/landsat-9/' },
  { norad: 40697, tag: 'A', name: 'Sentinel-2A', ...S2, note: 'Works until 31 Dec 2026.', until: '2026-12-31T23:59:59Z' },
  { norad: 42063, tag: 'B', name: 'Sentinel-2B', ...S2 },
  { norad: 60989, tag: 'C', name: 'Sentinel-2C', ...S2 },
  { norad: 25544, look: 'iss', gathers: 'ECOSTRESS', more: 'A NASA heat camera on the outside of the Station’s Japanese module, about 70 m to a dot, across about 384 km.',
    plain: ['Shows how hot your plants and the ground are.', 'A NASA heat camera on the Space Station measures it.', 'Crophalo uses it for the Ground surface temperature card.'],
    name: 'International Space Station', short: 'Space Station', by: 'NASA and partners; ECOSTRESS is NASA JPL’s', does: 'Carries ECOSTRESS, a NASA heat camera that measures the temperature of plants and the ground, about 70 m to a dot.',
    uses: 'The report’s Ground surface temperature card.', go: 'demo', page: 'https://science.nasa.gov/mission/ecostress/', pageWords: 'NASA’s page about ECOSTRESS' },
].map(s => Object.freeze({ pageWords: `NASA’s page about ${s.name}`, ...s })));   // the mission's own page: NASA's unless named otherwise
// ---- how each one looks from far: its own small mark, 24 x 24 round its point, +x along its path. d is filled, s (if any) is stroked. The same paths, larger, are the mark in its card.
export const MARKS = Object.freeze({
  terra: { d: 'M-11 -2.2h9v4.4h-9zM-2 -.6h2v1.2h-2zM0 -3.4h6.5v6.8H0zM4.4 -6.2h.9v2.8h-.9zM3.3 -8a1.55 1.55 0 1 0 3.1 0a1.55 1.55 0 1 0 -3.1 0z', tint: '#ffe8b8' },
  jpss: { d: 'M-3.6 -2.2h7.2v4.4h-7.2zM-1.7 -8.8h3.4v5.2h-3.4zM-1.7 3.6h3.4v5.2h-3.4zM-.35 -3.6h.7v1.4h-.7zM-.35 2.2h.7v1.4h-.7zM3.6 -.7h2.8v1.4h-2.8z', tint: '#ffffff' },
  smap: { d: 'M-2 .6h4v3.6h-4zM-6 4.6h12v2.2h-12zM1.3 .8l3.4 -6.2l1 .55l-3.4 6.2z', s: 'M-3 -8a6 2.8 0 1 0 12 0a6 2.8 0 1 0 -12 0z', tint: '#ffffff' },
  gpm: { d: 'M-3 -3h6v6h-6zM-10 -4.6h2.8v9.2h-2.8zM-7.2 -.5h4.2v1h-4.2zM3 -.5h1.4v1h-1.4zM4.4 -2h7v4h-7zM-.5 -5.2h1v2.2h-1zM-2 -6.8h4v1.6h-4z', tint: '#ffffff' },
  gracefo: { d: 'M-4 -1.3h6l2 1.3l-2 1.3h-6z', tint: '#ffe8b8' },
  landsat: { d: 'M-5 -3h6.4v6h-6.4zM1 0a3.1 3.1 0 1 0 6.2 0a3.1 3.1 0 1 0 -6.2 0zM2.5 2.6l5.6 6.2l-3.4 2.3l-5.6 -6.2zM-5 -3l-4.2 -4.4l2.1 -1.6l3.9 4.2z', tint: '#f6e3bb' },
  s2: { d: 'M-4.2 -2h8.4v4h-8.4zM-1.6 -9.2h3.2v6.2h-3.2zM-1.6 3h3.2v6.2h-3.2zM-.35 -3h.7v1h-.7zM-.35 2h.7v1h-.7zM4.2 -.6h2.6v1.2h-2.6z', tint: '#ffffff' },
  iss: { d: 'M-11 -.7h22v1.4h-22zM-10.4 -6h1.8v4.8h-1.8zM-10.4 1.2h1.8v4.8h-1.8zM-7.4 -6h1.8v4.8h-1.8zM-7.4 1.2h1.8v4.8h-1.8zM5.6 -6h1.8v4.8h-1.8zM5.6 1.2h1.8v4.8h-1.8zM8.6 -6h1.8v4.8h-1.8zM8.6 1.2h1.8v4.8h-1.8zM-.9 .7h1.8v6h-1.8zM-2.6 3.4h5.2v1.1h-5.2z', tint: '#ffffff' },
});
export const markSvg = look => { const m = MARKS[look]; return m ? `<svg viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><path d="${m.d}" fill="${m.tint}"/>${m.s ? `<path d="${m.s}" fill="none" stroke="${m.tint}" stroke-width="1.4"/>` : ''}</svg>` : ''; };
// Where the large mark in the card's window starts its glide, so it leaves from the satellite's own point and grows: pt is the satellite, frame the window (same px), markW the large mark's side.
export const glideFrom = (pt, frame, markW, farW = 24) => ({ gx: pt.x - (frame.x + frame.w / 2), gy: pt.y - (frame.y + frame.h * .46), gs: Math.min(1, farW / Math.max(1, markW)) });
export const GO_WORDS = { map: 'Open the map', demo: 'Try it on the demo field' };
export const WORDS = Object.freeze({
  loading: 'Finding where the satellites are…',
  down: 'The satellites’ orbits could not load right now, so they are not drawn.',
  some: (n, of = SATS.length) => `${n} of ${of} satellites could not be placed right now, so they are not drawn.`,   // of: those still at work (Sentinel-2A leaves after its campaign)
  alt: n => `The Earth seen from space, with the ${n} satellites whose data Crophalo reads, each drawn where it is now, worked out from its orbital elements. Move to a satellite with the Tab key to read what it does.`,
  credit: when => `Orbits: U.S. Space Force (Space-Track.org), via CelesTrak; elements of ${when}.`,
  mark: 'Simple mark drawn by Crophalo; not a picture of the real craft.', noPic: 'Simple mark drawn by Crophalo; no free picture of this craft in space was found.',
  picWait: 'Picture loading…', picFail: 'Picture not loaded.', picOff: 'Picture not loaded: you are offline.',
  craft: 'Spacecraft pictures: NASA 3D Resources and NASA/JPL-Caltech; each picture’s own card says whose it is.',
  more: 'Show more', runBy: 'Run by', tool: 'Its instrument:',
  hint: moving => `${moving ? 'Moving round the Earth: the' : 'Round the Earth: the'} real satellites whose data Crophalo reads, where they are now.`,
});

// ---- time in words, always UTC like the elements
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = n => String(n).padStart(2, '0');
export const clockWords = ms => { const d = new Date(ms); return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`; };
export const dayWords = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const stampWords = ms => `${dayWords(ms)}, ${clockWords(ms)}`;
// The span of the elements' epochs: "14 Nov 2026, 08:49 to 20:15 UTC", or with both days when they differ.
export const spanWords = (from, to) => (dayWords(from) === dayWords(to) ? `${dayWords(from)}, ${clockWords(from).slice(0, 5)}${to - from >= 60e3 ? ` to ${clockWords(to)}` : ' UTC'}` : `${stampWords(from)} to ${stampWords(to)}`);
export function ageWords(ms) {   // how old the elements are: "40 minutes", "8 hours", "2 days"
  const min = Math.max(0, Math.round(ms / 60e3)), h = Math.round(ms / 3600e3), d = Math.floor(ms / 864e5);
  return min < 60 ? `${min} minute${min === 1 ? '' : 's'}` : h < 48 ? `${h} hour${h === 1 ? '' : 's'}` : `${d} days`;
}
// CelesTrak writes EPOCH with six digits after the second ('2026-11-14T08:49:22.988352', UTC); browsers read three, so it is cut here
export function epochMs(text) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?Z?$/.exec(String(text ?? '').trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] || '0').padEnd(3, '0').slice(0, 3));
  return new Date(t).getUTCDate() === +m[3] ? t : NaN;
}
export const isoMs = ms => new Date(ms).toISOString();   // '2026-11-14T08:49:22.988Z', as the orbit library reads it in every browser
export const ageState = ms => (ms > GONE_DAYS * 864e5 ? 'gone' : ms > OLD_DAYS * 864e5 ? 'old' : 'ok');

// ---- places and numbers, in words
export const latWords = lat => `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;
export const lonWords = lon => `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
export const kmWords = km => `${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;   // the thousands by hand: toLocaleString woke the browser's number formatting on the first card, 25 ms
export const speedWords = kms => `${kms.toFixed(1)} km/s`;

// ---- the drawing: an orthographic view, as the globe's shader draws it. cam: { lat, lon } in the middle of the disk, centre { x, y } and
// radius r in px. p: a point fixed to the Earth (x to 0° E on the equator, y to 90° E, z north), in Earth radii.
export function project(cam, p) {
  const sl = Math.sin(cam.lat * D), cl = Math.cos(cam.lat * D), so = Math.sin(cam.lon * D), co = Math.cos(cam.lon * D);
  const fwd = p.x * co + p.y * so, east = -p.x * so + p.y * co;   // towards the middle meridian, and east of it
  return { x: cam.x + cam.r * east, y: cam.y - cam.r * (cl * p.z - sl * fwd), depth: sl * p.z + cl * fwd };
}
// A point is hidden when the Earth stands between it and the eye: on the far side, and inside the disk.
export const hidden = (cam, at) => at.depth < 0 && (at.x - cam.x) ** 2 + (at.y - cam.y) ** 2 < cam.r * cam.r;
// Where the card goes beside a satellite at (x, y): on the side with room, inside the box { w, h } with a margin.
export function cardPlace(x, y, card, box, gap = 22, margin = 12) {
  const right = x + gap + card.w <= box.w - margin, left = x - gap - card.w >= margin;
  if (box.w < 600 || (!right && !left)) {   // a narrow screen: under the satellite (or over it), in the middle of the width
    const below = y + gap + card.h <= box.h - margin;
    return { x: Math.max(margin, (box.w - card.w) / 2), y: below ? y + gap : Math.max(margin, y - gap - card.h) };
  }
  return { x: right ? x + gap : x - gap - card.w, y: Math.max(margin, Math.min(box.h - margin - card.h, y - card.h / 2)) };
}
