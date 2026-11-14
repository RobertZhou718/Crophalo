// Crophalo's outline maths: the area of a field, its corners from two dragged points, the checks an outline must pass, and the words for a size.
// All of it is pure: no page, no storage, no network.
// Checked by scripts/test_geo.mjs (areas against known shapes, the date line, a bow-tie, a point on an edge, the unit words).

const R = 6371008.8;                      // mean Earth radius in metres
const RAD = Math.PI / 180;
const SQM_PER_HA = 1e4, AC_PER_HA = 2.471054;
const round4 = v => Math.round(v * 1e4) / 1e4;

// The longitude brought into -180..180.
export const wrapLon = lon => ((((lon + 180) % 360) + 360) % 360) - 180;

// Corners as [lat, lon] pairs with longitudes that never jump across the 180 degree line: each one is the copy nearest the one before it.
export function unwrapRing(pts) {
  const out = [];
  for (const [lat, lon] of pts) {
    const before = out.length ? out[out.length - 1][1] : lon;
    out.push([lat, lon + 360 * Math.round((before - lon) / 360)]);
  }
  return out;
}

// Flat metres around the first corner (an equirectangular fit: right to well under 1% for anything the size of a farm).
function flatten(pts) {
  const ring = unwrapRing(pts), lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length, k = Math.cos(lat0 * RAD);
  return ring.map(([lat, lon]) => [R * (lon - ring[0][1]) * RAD * k, R * (lat - ring[0][0]) * RAD]);
}
const signed = xy => { let s = 0; for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; s += x1 * y2 - x2 * y1; } return s / 2; };

// The area in hectares of a ring of [lat, lon] corners (the ring is closed by itself). 0 for fewer than three corners.
export function areaHa(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return 0;
  return Math.abs(signed(flatten(pts))) / SQM_PER_HA;
}

// Do two segments cross each other (touching at an end does not count)?
function cross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// True when the outline crosses itself (a bow-tie): its area would be wrong, so it is refused.
export function selfCrosses(pts) {
  const xy = flatten(pts), n = xy.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;   // the last side meets the first at their shared corner
    if (cross(xy[i], xy[(i + 1) % n], xy[j], xy[(j + 1) % n])) return true;
  }
  return false;
}

// Is the point inside the ring (the border counts as inside)?
export function insideRing(lat, lon, pts) {
  const ring = unwrapRing([[lat, lon], ...pts]), [pl, po] = ring[0], poly = ring.slice(1);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (((yi > pl) !== (yj > pl)) && po < ((xj - xi) * (pl - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The four corners of the box between two points, clockwise from the north-west one; longitudes are kept short of the date line's jump.
export function boxCorners(a, b) {
  const [la1, lo1] = a, [la2, lo2] = b, lo2n = lo1 + (((lo2 - lo1 + 540) % 360) - 180);   // the way round the short side
  const north = Math.max(la1, la2), south = Math.min(la1, la2), west = Math.min(lo1, lo2n), east = Math.max(lo1, lo2n);
  return [[north, west], [north, east], [south, east], [south, west]].map(([lat, lon]) => [round4(lat), round4(wrapLon(lon))]);
}

// Corners rounded to 4 decimals (about 11 m) as the state keeps them, with the closing corner never repeated.
export function cleanRing(pts) {
  const ring = pts.map(([lat, lon]) => [round4(lat), round4(wrapLon(lon))]);
  const [fa, fo] = ring[0] || [], [la, lo] = ring[ring.length - 1] || [];
  if (ring.length > 3 && fa === la && fo === lo) ring.pop();
  return ring;
}

// What is wrong with an outline in plain words, or '' when it is a field.
export function outlineProblem(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return 'An outline needs at least three corners.';
  if (selfCrosses(pts)) return 'The outline crosses itself. Undo the last corner, or start again.';
  if (areaHa(pts) < 0.01) return 'That area is too small to be a field. Draw a larger one.';
  return '';
}

// The size as a farmer reads it: "12.4 ha" or "30.6 acres" ("US" units), two decimals under one hectare.
export function areaWords(ha, units = 'metric') {
  const us = units === 'us', v = us ? ha * AC_PER_HA : ha, unit = us ? 'acres' : 'ha';
  return `${v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(1) : v.toFixed(2)} ${unit}`;
}

// The latitude and longitude as the pin announces them: "Pin at 44.3894, -79.6903".
export const pinWords = (lat, lon) => `Pin at ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

// The slope of the field in plain words (percent): nearly flat under 2, gently under 6, moderately under 12, else steep.
export function slopeWords(pct) {
  return pct < 2 ? 'nearly flat' : pct < 6 ? 'gently sloping' : pct < 12 ? 'moderately sloping' : 'steep';
}
