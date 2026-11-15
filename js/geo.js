// Crophalo's outline maths: the area of a field, its corners from two or three points, the snapping of a corner, the checks an outline must pass, and the words for a size or a length.
// All of it is pure: no page, no storage, no network. The words come from the map's word table (js/mapwords.js).
// Checked by scripts/test_geo.mjs (areas against known shapes, the date line, a bow-tie, the turned rectangle, the snaps, a point inside a U, the unit words).
import { SAY } from './mapwords.js';

const R = 6371008.8;                      // mean Earth radius in metres
const RAD = Math.PI / 180;
const M_PER_DEG = R * RAD;                // metres in one degree of latitude
const SQM_PER_HA = 1e4, AC_PER_HA = 2.471054, FT_PER_M = 3.280839895;
export const MAX_CORNERS = 100, MAX_HA = 5000, MIN_HA = 0.01;
const roundTo = (v, digits) => { const k = 10 ** digits; return Math.round(v * k) / k; };

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
// The same flat frame around one point, both ways: [lat, lon] to [x, y] metres and back.
function frame(at) {
  const k = Math.cos(at[0] * RAD) || 1e-9, near = lon => lon + 360 * Math.round((at[1] - lon) / 360);
  return { to: ([lat, lon]) => [(near(lon) - at[1]) * M_PER_DEG * k, (lat - at[0]) * M_PER_DEG], back: ([x, y]) => [at[0] + y / M_PER_DEG, wrapLon(at[1] + x / (M_PER_DEG * k))] };
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
// Would the line from a to b cross one of the lines between the corners already placed (an open run of [lat, lon])? A line that only touches at a shared corner does not count.
export function edgeCrosses(pts, a, b) {
  if (!Array.isArray(pts) || pts.length < 2) return false;
  const xy = flatten([...pts, a, b]), A = xy[xy.length - 2], B = xy[xy.length - 1], same = (p, q) => p[0] === q[0] && p[1] === q[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = xy[i], q = xy[i + 1];
    if (same(p, A) || same(p, B) || same(q, A) || same(q, B)) continue;
    if (cross(A, B, p, q)) return true;
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

// A point that is surely inside the outline, for the pin: the middle of its area when that is inside, else the middle of the widest stretch
// inside the outline along the line of latitude through it (a U-shaped field has its middle outside). [lat, lon].
export function insidePoint(pts) {
  const ring = unwrapRing(pts), f = frame(ring[0]), xy = ring.map(f.to), a2 = signed(xy) * 2;
  let cx = 0, cy = 0;
  if (Math.abs(a2) < 1e-9) { cx = xy.reduce((s, p) => s + p[0], 0) / xy.length; cy = xy.reduce((s, p) => s + p[1], 0) / xy.length; }
  else for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length], c = x1 * y2 - x2 * y1; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
  if (Math.abs(a2) >= 1e-9) { cx /= 3 * a2; cy /= 3 * a2; }
  const mid = f.back([cx, cy]);
  if (insideRing(mid[0], mid[1], pts)) return mid;
  const xs = [];
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; if ((y1 > cy) !== (y2 > cy)) xs.push(x1 + (cy - y1) * (x2 - x1) / (y2 - y1)); }
  xs.sort((p, q) => p - q);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return best ? f.back([(best[0] + best[1]) / 2, cy]) : f.back(xy[0]);
}
// Where the pin goes in an outline: insidePoint brought onto the grid the pin is kept to (4 decimals, about 11 m), so the kept pin is still inside;
// the nearest grid point inside when the rounded one falls out (a narrow field); insidePoint as it is when no grid point lies inside (a garden smaller than one step). [lat, lon].
export function pinSpot(pts, digits = 4) {
  const at = insidePoint(pts), k = 10 ** digits, near = v => Math.round(v * k) / k, c = [near(at[0]), near(wrapLon(at[1]))];
  if (insideRing(c[0], c[1], pts)) return c;
  const f = frame(at);
  let best = null, bestD = Infinity;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const p = [near(c[0] + i / k), near(wrapLon(c[1] + j / k))];
    if (!insideRing(p[0], p[1], pts)) continue;
    const [x, y] = f.to(p), d = Math.hypot(x, y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best || at;
}

// The four corners of the box between two points, clockwise from the north-west one; longitudes are kept short of the date line's jump.
export function boxCorners(a, b, digits = 4) {
  const [la1, lo1] = a, [la2, lo2] = b, lo2n = lo1 + (((lo2 - lo1 + 540) % 360) - 180);   // the way round the short side
  const north = Math.max(la1, la2), south = Math.min(la1, la2), west = Math.min(lo1, lo2n), east = Math.max(lo1, lo2n);
  return [[north, west], [north, east], [south, east], [south, west]].map(([lat, lon]) => [roundTo(lat, digits), roundTo(wrapLon(lon), digits)]);
}

// The rectangle of three taps: a and b are two corners along one side, p any point on the far side. The far side is the line parallel to a-b
// through p, on whichever side p lies. Four [lat, lon] corners a, b, b', a', in the same flat frame as areaHa; null when a and b are the same point.
export function threePointRect(a, b, p) {
  const f = frame(a), B = f.to(b), P = f.to(p), len = Math.hypot(B[0], B[1]);
  if (!len) return null;
  const n = [-B[1] / len, B[0] / len], d = P[0] * n[0] + P[1] * n[1];
  return [[0, 0], B, [B[0] + d * n[0], B[1] + d * n[1]], [d * n[0], d * n[1]]].map(f.back);
}
// The distance in metres from p to the line through a and b (signed: + on the left of a to b), and the length of a-b.
export function sideOffset(a, b, p) {
  const f = frame(a), B = f.to(b), P = f.to(p), len = Math.hypot(B[0], B[1]);
  return { d: len ? (B[0] * P[1] - B[1] * P[0]) / len : 0, len };
}
// b brought onto the north-south or east-west line through a when a-b is within deg degrees of it; else b as it is. Returns { at, snapped }.
export function snapAxis(a, b, deg = 3) {
  const f = frame(a), [x, y] = f.to(b), len = Math.hypot(x, y);
  if (!len) return { at: b, snapped: false };
  const angle = Math.atan2(y, x) / RAD, axis = Math.round(angle / 90) * 90;
  if (Math.abs(angle - axis) > deg) return { at: b, snapped: false };
  const along = axis % 180 === 0 ? [x, 0] : [0, y];
  return { at: f.back(along), snapped: true };
}

// ---- snapping on the screen (points are [x, y] pixels): a right angle at the last corner, or a corner that squares the field off
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], dot = (p, q) => p[0] * q[0] + p[1] * q[1], hyp = p => Math.hypot(p[0], p[1]);
// p moved so the corner at last is a right angle, when it is within tol degrees of one and both lines are at least minLen long. Returns { at, snapped }.
export function rightAngleSnap(prev, last, p, { tol = 5, minLen = 40 } = {}) {
  const u = sub(prev, last), v = sub(p, last), lu = hyp(u), lv = hyp(v);
  if (lu < minLen || lv < minLen) return { at: p, snapped: false };
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (lu * lv)))) * 180 / Math.PI;
  if (Math.abs(angle - 90) > tol) return { at: p, snapped: false };
  const w = [-u[1] / lu, u[0] / lu], k = dot(v, w);
  return { at: [last[0] + w[0] * k, last[1] + w[1] * k], snapped: true };
}
// The one point that makes right angles at both the last corner (with the one before it) and the first corner (with the second), when it is within tol px of p.
export function squareOff(prev, last, first, second, p, tol = 12) {
  const u = sub(prev, last), s = sub(second, first);
  const det = u[0] * s[1] - u[1] * s[0];   // the two perpendiculars are parallel when the two sides are
  if (Math.abs(det) < 1e-9) return { at: p, snapped: false };
  // q - last is perpendicular to u, and q - first is perpendicular to s: u·q = u·last, s·q = s·first
  const c1 = dot(u, last), c2 = dot(s, first), q = [(c1 * s[1] - c2 * u[1]) / det, (u[0] * c2 - s[0] * c1) / det];
  return hyp(sub(q, p)) <= tol ? { at: q, snapped: true } : { at: p, snapped: false };
}

// Corners rounded as the state keeps them (4 decimals is about 11 m, 5 about 1 m), with the closing corner never repeated.
export function cleanRing(pts, digits = 4) {
  const ring = pts.map(([lat, lon]) => [roundTo(lat, digits), roundTo(wrapLon(lon), digits)]);
  const [fa, fo] = ring[0] || [], [la, lo] = ring[ring.length - 1] || [];
  if (ring.length > 3 && fa === la && fo === lo) ring.pop();
  return ring;
}

// What is wrong with an outline in plain words, or '' when it is a field. order says which unit the size limit is told in.
export function outlineProblem(pts, order = 'hectares') {
  if (!Array.isArray(pts) || pts.length < 3) return 'An outline needs at least three corners.';
  if (pts.length > MAX_CORNERS) return SAY.no.tooMany;
  if (selfCrosses(pts)) return 'The outline crosses itself. Undo the last corner, or start again.';
  const ha = areaHa(pts);
  if (ha < MIN_HA) return 'That area is too small to be a field. Draw a larger one.';
  if (ha > MAX_HA) return SAY.no.tooBig(areaPair(MAX_HA, order).first);
  return '';
}

// The size as a farmer reads it: "12.4 ha" or "30.6 acres" ("US" units), two decimals under one hectare.
export function areaWords(ha, units = 'metric') {
  const us = units === 'us', v = us ? ha * AC_PER_HA : ha, unit = us ? 'acres' : 'ha';
  return `${v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(1) : v.toFixed(2)} ${unit}`;
}

// ---- both units: which comes first, and the words for an area and a length
// 'acres' or 'hectares': the setting when it names one, else acres where the browser's region is the US or Canada.
export function unitsOrder(setting = 'auto', locale = '') {
  if (setting === 'acres' || setting === 'hectares') return setting;
  const region = (/^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2})\b/i.exec(String(locale)) || [])[1]?.toUpperCase();
  return region === 'US' || region === 'CA' ? 'acres' : 'hectares';
}
const commas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function amount(v) {   // under 1: two decimals; under 100: one; else whole, with thousands commas
  if (v < 1 && v.toFixed(2) !== '1.00') return v.toFixed(2);
  if (v < 100 && v.toFixed(1) !== '100.0') return v.toFixed(1).replace(/^1\.0$/, '1');
  return commas(Math.round(v));
}
// The area in both units: { first: '24.9 acres', second: '10.1 ha', spoken: '24.9 acres, 10.1 hectares', value, unit } (value and unit are the first's).
export function areaPair(ha, order = 'hectares') {
  const U = SAY.units, ac = amount(Math.max(0, ha) * AC_PER_HA), he = amount(Math.max(0, ha));
  const acres = `${ac} ${ac === '1' ? U.acre : U.acres}`, hect = `${he} ${U.ha}`, hectSaid = `${he} ${he === '1' ? U.hectare : U.hectares}`;
  return order === 'acres'
    ? { first: acres, second: hect, spoken: `${acres}, ${hectSaid}`, value: Math.max(0, ha) * AC_PER_HA, unit: ac === '1' ? U.acre : U.acres }
    : { first: hect, second: acres, spoken: `${hectSaid}, ${acres}`, value: Math.max(0, ha), unit: U.ha };
}
// A length: '312 m', '1.24 km' or, where acres come first, '1,024 ft', '1.2 mi'. spoken: true writes the units out.
export function lengthWords(m, order = 'hectares', spoken = false) {
  const U = SAY.units;
  if (order === 'acres') { const ft = m * FT_PER_M; return ft < 5280 ? `${commas(Math.round(ft))} ${spoken ? U.feet : U.ft}` : `${(ft / 5280).toFixed(1)} ${U.mi}`; }
  return m < 1000 ? `${Math.round(m)} ${spoken ? U.metres : U.m}` : `${(m / 1000).toFixed(2)} ${U.km}`;
}
// The ground distance in metres between two [lat, lon] points (flat frame: right for anything the size of a farm).
export function metres(a, b) { const f = frame(a), [x, y] = f.to(b); return Math.hypot(x, y); }
// The compass word for a move from a to b (east, north-west...).
export function direction(a, b) { const f = frame(a), [x, y] = f.to(b), deg = (Math.atan2(x, y) / RAD + 360) % 360; return SAY.dirs[Math.round(deg / 45) % 8]; }

// The latitude and longitude as the pin announces them: "Pin at 44.3894, -79.6903".
export const pinWords = (lat, lon) => `Place at ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

// The slope of the field in plain words (percent): nearly flat under 2, gently under 6, moderately under 12, else steep.
export function slopeWords(pct) {
  return pct < 2 ? 'nearly flat' : pct < 6 ? 'gently sloping' : pct < 12 ? 'moderately sloping' : 'steep';
}
