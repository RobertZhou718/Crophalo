// The logic behind My farm: outlines, the farms store and its cleaner, plans per field, the trash, undo, and the four farm values.
// Pure: no page, no storage, no network. The scores come from the crop engine through ONE function, setEngine(); until it is set every score says "not read yet".
// Checked by scripts/test_sim.mjs (the farm cases: the cleaner, plans, natural order, split, files, the trash, redraw and undo).
import { areaHa, selfCrosses, insideRing, unwrapRing, wrapLon } from './geo.js';

// ---- limits (the numbers a farm keeps; each is shown to the farmer as a refusal with its number)
export const FARMS_KEY = 'crophalo.farms.v1';
export const LIMITS = Object.freeze({
  farms: 8, fields: 40, corners: [3, 100], areaHa: [0.05, 5000], scenarios: 6, seasons: 4, nameFarm: 60, nameField: 40,
  nearKm: 10, farKm: 50, trash: 5, trashDays: 30, mapFileBytes: 5e6, undoSteps: 12, undoMs: 5 * 60e3, cornerUndo: 60,
});
const DAY_MS = 864e5, R = 6371008.8, RAD = Math.PI / 180;
const WATER = ['none', 'limited', 'full'], TILLAGE = ['conventional', 'reduced', 'notill'], TEXTURE = ['sand', 'loam', 'silt', 'clay'], ORGANIC = ['low', 'med', 'high'];
const LOOKS = ['board', 'photo', 'light', '3d'], TABS = ['board', 'fields', 'year'], VARIETY = ['short', 'medium', 'long'];
export const WATER_WORDS = Object.freeze({ none: 'Rainfed', limited: 'Limited irrigation', full: 'Irrigated as needed' });
const ID_RE = /^[a-z0-9_-]{1,40}$/i, ID_OK = { test: v => typeof v === 'string' && ID_RE.test(v) && !(v in Object.prototype) }, MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const own = (t, k) => typeof k === 'string' && Object.hasOwn(t, k);
const num = (v, lo, hi, dflt = null) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? +v : NaN; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const pick = (v, list, dflt) => list.includes(v) ? v : dflt;
const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const r = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
export const round5 = v => r(v, 5);

// ---- outlines: flat-metre geometry around one origin, so a field far from the equator or across the date line is still right
export function frame(pts) {   // pts are [lat, lon]; the frame remembers its origin so rings go there and back exactly
  const ring = unwrapRing(pts), lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length, lon0 = ring[0][1], k = Math.cos(lat0 * RAD);
  return {
    lat0, lon0, to: ([lat, lon]) => [R * (lon - lon0) * RAD * k, R * (lat - lat0) * RAD],
    back: ([x, y]) => [round5(lat0 + y / R / RAD), round5(wrapLon(lon0 + x / (R * k) / RAD))],
    ring: ring.map(([lat, lon]) => [R * (lon - lon0) * RAD * k, R * (lat - lat0) * RAD]),
  };
}
export function distanceM(a, b) {   // metres between two [lat, lon] points (haversine, short way round)
  const dLat = (b[0] - a[0]) * RAD, dLon = ((((b[1] - a[1]) % 360) + 540) % 360 - 180) * RAD, h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearingDeg(from, to) {   // 0 = north, clockwise
  const p1 = from[0] * RAD, p2 = to[0] * RAD, dl = ((((to[1] - from[1]) % 360) + 540) % 360 - 180) * RAD;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
}
const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
export const compassWord = deg => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// A point inside the outline for the token and the field's key: the middle of the widest stretch across the field at its middle height.
export function interiorPoint(pts) {
  const f = frame(pts), xy = f.ring, ys = xy.map(p => p[1]), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  let best = null;
  for (const dy of [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4]) {   // a few rows near the middle: the first gives a stretch, the widest wins
    const y = mid + dy * (Math.max(...ys) - Math.min(...ys)), xs = [];
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best.w) best = { w: xs[i + 1] - xs[i], x: (xs[i] + xs[i + 1]) / 2, y };
    if (best && dy === 0) break;
  }
  return best ? f.back([best.x, best.y]) : [round5(pts[0][0]), round5(pts[0][1])];
}
export const fieldKey = ([lat, lon]) => `${r(lat, 4).toFixed(4)},${r(lon, 4).toFixed(4)}`;   // a field is filed by its interior point to 4 decimals (about 11 m)

// How much of two outlines is shared, in hectares, by sampling a fine grid over the box they share ("about": good to a few percent).
export function overlapHa(a, b) {
  const f = frame([...a, ...b]), A = f.ring.slice(0, a.length), B = f.ring.slice(a.length), hit = (xy, x, y) => { let inside = false; for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) { const [xi, yi] = xy[i], [xj, yj] = xy[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
  const box = xy => [Math.min(...xy.map(p => p[0])), Math.max(...xy.map(p => p[0])), Math.min(...xy.map(p => p[1])), Math.max(...xy.map(p => p[1]))];
  const [ax0, ax1, ay0, ay1] = box(A), [bx0, bx1, by0, by1] = box(B), x0 = Math.max(ax0, bx0), x1 = Math.min(ax1, bx1), y0 = Math.max(ay0, by0), y1 = Math.min(ay1, by1);
  if (x1 <= x0 || y1 <= y0) return 0;
  const N = 120, dx = (x1 - x0) / N, dy = (y1 - y0) / N;
  let n = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = x0 + (i + 0.5) * dx, y = y0 + (j + 0.5) * dy; if (hit(A, x, y) && hit(B, x, y)) n++; }
  return (n * dx * dy) / 1e4;
}

// Douglas-Peucker: the outline with at most `max` corners, keeping the shape (the tolerance grows until it fits).
export function simplifyRing(pts, max = LIMITS.corners[1]) {
  if (pts.length <= max) return pts.slice();
  const f = frame(pts), xy = f.ring, n = xy.length;
  let far = 0, dm = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(xy[i][0] - xy[0][0], xy[i][1] - xy[0][1]); if (d > dm) { dm = d; far = i; } }
  const run = (lo, hi, tol, keep) => {   // keep[] marks the corners that stay between lo and hi
    let idx = -1, md = tol;
    const [x1, y1] = xy[lo % n], [x2, y2] = xy[hi % n], len = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let i = lo + 1; i < hi; i++) { const [x, y] = xy[i % n], d = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / len; if (d > md) { md = d; idx = i; } }
    if (idx >= 0) { keep.add(idx % n); run(lo, idx, tol, keep); run(idx, hi, tol, keep); }
  };
  for (let tol = 0.5; tol < 1e5; tol *= 1.5) {
    const keep = new Set([0, far]); run(0, far, tol, keep); run(far, n, tol, keep);
    if (keep.size <= max) return [...keep].sort((a, b) => a - b).map(i => pts[i]);
  }
  return pts.slice(0, max);
}

// What is wrong with a field outline, in plain words with the number that failed, or '' when it is fine. (geo.js gives the maths.)
export function outlineIssue(pts, units = 'metric') {
  const us = units === 'us', small = LIMITS.areaHa[0];
  if (!Array.isArray(pts) || pts.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 90)) return 'The outline could not be read.';
  if (pts.length < LIMITS.corners[0]) return 'It needs at least 3 corners.';
  if (pts.length > LIMITS.corners[1]) return 'Up to 100 corners.';
  if (selfCrosses(pts)) return 'Its edges cross. Draw it again, going round the field.';
  const ha = areaHa(pts);
  if (ha < small) return us ? 'Smaller than 0.12 acres.' : 'Smaller than 0.05 ha.';
  if (ha > LIMITS.areaHa[1]) return 'Too large to read the terrain for.';
  return '';
}

// The field's name from where it lies: "North field", "South-east field", "Home field" at the pin, and "East field 2" when taken.
export function nameForField(pin, pts, taken = []) {
  const mid = interiorPoint(pts), here = insideRing(pin[0], pin[1], pts) || distanceM(pin, mid) < 40;
  const base = here ? 'Home field' : `${compassWord(bearingDeg(pin, mid))} field`, used = new Set(taken.map(t => String(t).toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) if (!used.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  return base;
}

// ---- seasons: the northern season is the calendar year; the southern one runs July to June and is written "2025-26" (with the en dash)
export const southOf = lat => lat < 0;
export function seasonNow(lat, date = new Date()) {   // the season the date is in: its start year
  const y = date.getFullYear(), m = date.getMonth();
  return southOf(lat) ? (m >= 6 ? y : y - 1) : y;
}
export const seasonLabel = (lat, year) => southOf(lat) ? `${year}–${String(year + 1).slice(2)}` : String(year);
export const seasonMonths = lat => southOf(lat) ? [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];   // month numbers (0 = January) in season order
export const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

// ---- the cleaner: every read goes through here, so a bad farm or field is dropped and nothing ever throws
const cleanPoint = p => Array.isArray(p) && p.length === 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]) && Math.abs(+p[0]) <= 90 && Math.abs(+p[1]) <= 180 ? [round5(+p[0]), round5(+p[1])] : null;
export function cleanRing(raw) {
  if (!Array.isArray(raw)) return null;
  const ring = raw.map(cleanPoint);
  if (ring.some(p => !p)) return null;
  const [a, z] = [ring[0], ring[ring.length - 1]];
  if (ring.length > 3 && a && z && a[0] === z[0] && a[1] === z[1]) ring.pop();   // a closing corner repeated is not a corner
  return outlineIssue(ring) ? null : ring;
}
const cleanSecond = (raw, cropOk) => raw && typeof raw === 'object' && ID_OK.test(raw.crop || '') && cropOk(raw.crop) ? { crop: raw.crop, sowing: MD.test(raw.sowing || '') ? raw.sowing : null, variety: pick(raw.variety, VARIETY, null) } : null;
export function cleanSeason(raw, cropOk = () => true) {
  if (!raw || typeof raw !== 'object' || !ID_OK.test(raw.crop || '') || !cropOk(raw.crop)) return null;
  return { crop: raw.crop, cover: ID_OK.test(raw.cover || '') && cropOk(raw.cover) ? raw.cover : null, sowing: MD.test(raw.sowing || '') ? raw.sowing : null, variety: pick(raw.variety, VARIETY, null), second: cleanSecond(raw.second, cropOk) };
}
// A plan: 1 to 4 seasons; trailing empty years are dropped; no seasons means no plan (null).
export function cleanPlan(raw, cropOk = () => true) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.seasons)) return null;
  const seasons = raw.seasons.slice(0, LIMITS.seasons).map(s => cleanSeason(s, cropOk));
  while (seasons.length && !seasons[seasons.length - 1]) seasons.pop();
  if (!seasons.length || seasons.some(s => !s)) return null;
  return { start: num(raw.start, 2000, 2100, null) ?? 0, water: pick(raw.water, WATER, null), seasons };
}
const cleanSoil = raw => raw && typeof raw === 'object' && TEXTURE.includes(raw.texture) ? { texture: raw.texture, om: ORGANIC.includes(raw.om) ? raw.om : typeof raw.om === 'number' ? num(raw.om, 0, 30, 'med') : 'med', source: text(raw.source, 60), assumed: raw.assumed === true } : null;
const cleanTerrain = raw => {
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Number.isFinite(+raw.slope)) return null;
  return { v: 1, slope: num(raw.slope, 0, 200), p90: num(raw.p90, 0, 200, 0), steep: num(raw.steep, 0, 1, 0), hMin: num(raw.hMin, -500, 9000, null), hMax: num(raw.hMax, -500, 9000, null), res: num(raw.res, 0, 1000, null), rough: num(raw.rough, 0, 100, null),
    aspect: num(raw.aspect, 0, 360, null), low: cleanPoint(raw.low), high: cleanPoint(raw.high), source: text(raw.source, 80), kind: pick(raw.kind, ['DTM', 'DSM'], 'DTM') };
};
const cleanMarks = raw => {
  const g = raw && typeof raw === 'object' ? raw : {}, a = cleanPoint(g.down?.[0]), b = cleanPoint(g.down?.[1]);
  const out = { down: a && b ? [a, b] : null, low: cleanPoint(g.low), high: cleanPoint(g.high), slope: num(g.slope, 0, 60, null) };
  return out.down || out.low || out.high || out.slope != null ? out : null;
};
const cleanSoilTest = raw => {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of Object.keys(raw).slice(0, 12)) if (/^[a-z]{1,12}$/i.test(k) && typeof raw[k] === 'number' && Number.isFinite(raw[k])) out[k] = raw[k];
  return Object.keys(out).length ? out : null;
};

// ---- the report's plans, as the report hands them over (Plan = { id, name, kind, seasons[{ year, crop, sow, harvest, after, residueUntil, window }] })
const DAY_OK = v => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const [y, m, d] = v.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d)); return y >= 2000 && y <= 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
export const isDay = DAY_OK;
export function cleanContractPlan(raw, cropOk = () => true) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.seasons)) return null;
  const seasons = raw.seasons.slice(0, 6).map(x => {
    if (!x || typeof x !== 'object' || !ID_OK.test(x.crop || '') || !cropOk(x.crop) || !DAY_OK(x.sow) || !DAY_OK(x.harvest)) return null;
    const w = x.window && DAY_OK(x.window.earliest) && DAY_OK(x.window.latest) ? { earliest: x.window.earliest, latest: x.window.latest } : null;
    const day = v => DAY_OK(v) ? v : null, id = v => ID_OK.test(v || '') && cropOk(v) ? v : null, sec = x.second && typeof x.second === 'object' && id(x.second.crop) && DAY_OK(x.second.sow) && DAY_OK(x.second.harvest) ? { ok: x.second.ok === true, crop: x.second.crop, sow: x.second.sow, harvest: x.second.harvest } : null;
    // what the crop engine knows about the ground goes with the season: the residue left, the stage lengths, the spring day a winter crop grows again, a cover crop, a second crop
    return { year: Math.round(num(x.year, 2000, 2100, +x.sow.slice(0, 4))), crop: x.crop, sow: x.sow, harvest: x.harvest, after: pick(x.after, ['residue', 'cover', 'bare'], 'bare'), residueUntil: day(x.residueUntil), window: w,
      residue: num(x.residue, 0, 1, null), stages: Array.isArray(x.stages) && x.stages.length === 4 && x.stages.every(v => Number.isFinite(v) && v >= 0 && v <= 400) ? x.stages.map(Number) : null, variety: pick(x.variety, ['s', 'm', 'l'], null),
      wake: day(x.wake), cover: id(x.cover), coverFrom: day(x.coverFrom), coverUntil: day(x.coverUntil), second: sec, timing: text(x.timing, 240) };
  });
  if (!seasons.length || seasons.some(x => !x)) return null;
  const sc = raw.scores && typeof raw.scores === 'object' ? Object.fromEntries(['water', 'soil', 'erosion', 'income', 'weather'].map(k => [k, num(raw.scores[k], 0, 100, null)])) : null;
  const evidence = stressLine(raw.evidence);
  return { id: ID_OK.test(raw.id || '') ? raw.id : 'plan', name: text(raw.name, 60) || 'Plan', kind: raw.kind === 'proposed' ? 'proposed' : 'current', seasons,
    score: num(raw.score, 0, 100, null), scores: sc, flag: pick(raw.flag, ['holds', 'borderline', 'fails'], null), fit: text(raw.fit, 40), why: text(raw.why, 400), bareMonths: num(raw.bareMonths, 0, 12, null), role: pick(raw.role, ['suggest', 'chosen', 'now'], null), ...(evidence ? { evidence } : {}),
    slots: Array.isArray(raw.slots) && raw.slots.length && raw.slots.length <= 12 && raw.slots.every(c => ID_OK.test(c || '') && cropOk(c)) ? raw.slots.slice() : null };   // the crop cycle the engine planned: its seasons repeat it over three years or more
}
// The report's own past-years line ("No stress thresholds crossed in 24 of 25 tested years…") with its rules and sources, kept with the plan so My farm
// says what the report said; every other line of evidence stays in the report.
function stressLine(raw) {
  const e = Array.isArray(raw) ? raw.find(x => x && typeof x.text === 'string' && /^No stress thresholds crossed in \d+/.test(x.text)) : null;
  if (!e) return null;
  return [{ text: text(e.text, 400), rules: (Array.isArray(e.rules) ? e.rules : []).map(r => text(r, 200)).filter(Boolean).slice(0, 8), sources: (Array.isArray(e.sources) ? e.sources : []).filter(v => typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v)).slice(0, 8) }];
}
export function cleanReport(raw, cropOk = () => true) {
  if (!raw || typeof raw !== 'object') return null;
  const current = cleanContractPlan(raw.current, cropOk), proposed = cleanContractPlan(raw.proposed, cropOk);
  if (!current && !proposed) return null;
  return { current, proposed, date: DAY_OK(raw.date) ? raw.date : null, at: num(raw.at, 0, 4e12, 0) };
}

export function cleanField(raw, cropOk = () => true) {
  if (!raw || typeof raw !== 'object') return null;
  const ring = cleanRing(raw.ring);
  if (!ring) return null;
  const mid = interiorPoint(ring), shape = areaHa(ring), water = num(raw.waterShare, 0, 0.9, 0), garden = raw.kind === 'garden' && ID_OK.test(raw.tree || '') && cropOk(raw.tree);
  return {
    id: ID_OK.test(raw.id || '') ? raw.id : '', key: /^-?\d+\.\d{4},-?\d+\.\d{4}$/.test(raw.key || '') ? raw.key : fieldKey(mid), name: text(raw.name, LIMITS.nameField) || 'Field', ring,
    waterShare: water, area: r(shape * (1 - water), 2), terrain: cleanTerrain(raw.terrain), soil: cleanSoil(raw.soil), kind: garden ? 'garden' : 'rot', tree: garden ? raw.tree : null,
    marks: cleanMarks(raw.marks), soilTest: cleanSoilTest(raw.soilTest), estimated: raw.estimated === true, report: cleanReport(raw.report),
  };
}
const cleanScenario = (raw, i, cropOk) => {
  const g = raw && typeof raw === 'object' ? raw : {}, plans = {};
  if (g.plans && typeof g.plans === 'object') for (const id of Object.keys(g.plans).slice(0, LIMITS.fields)) if (ID_OK.test(id)) { const p = cleanPlan(g.plans[id], cropOk); if (p) plans[id] = p; }
  const base = i === 0;
  return { id: base ? 'base' : ID_OK.test(g.id || '') ? g.id : `what-if-${i}`, name: base ? 'My plan' : text(g.name, 40) || `What-if ${i}`, rain: base ? 0 : Math.round(num(g.rain, -40, 30, 0) / 5) * 5, temp: base ? 0 : Math.round(num(g.temp, -2, 4, 0) * 2) / 2, plans };
};
export function cleanFarm(raw, cropOk = () => true) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = num(raw.pin?.lat, -90, 90), lon = num(raw.pin?.lon, -180, 180);
  if (lat == null || lon == null || !ID_OK.test(raw.id || '')) return null;
  const seen = new Set(), fields = [];
  for (const f of (Array.isArray(raw.fields) ? raw.fields : []).slice(0, LIMITS.fields)) {
    const c = cleanField(f, cropOk);
    if (!c || !c.id || seen.has(c.id)) continue;
    seen.add(c.id); fields.push(c);
  }
  const ids = new Set(), scenarios = [], given = Array.isArray(raw.scenarios) ? raw.scenarios : [];
  for (const [i, s] of (given[0]?.id === 'base' ? given : [{ id: 'base' }, ...given]).slice(0, LIMITS.scenarios).entries()) {
    const c = cleanScenario(s, scenarios.length, cropOk);
    if (ids.has(c.id)) continue;
    ids.add(c.id); scenarios.push(c);
  }
  const now = Date.now(), pr = raw.practice && typeof raw.practice === 'object' ? raw.practice : {}, prefs = raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {};
  for (const s of scenarios) for (const id of Object.keys(s.plans)) if (!seen.has(id)) delete s.plans[id];   // a plan for a field that is gone
  return {
    id: raw.id, name: text(raw.name, LIMITS.nameFarm) || 'My farm', pin: { lat: r(lat, 4), lon: r(lon, 4), label: text(raw.pin?.label, 200), cc: /^[A-Za-z]{2}$/.test(raw.pin?.cc || '') ? raw.pin.cc.toUpperCase() : '' },
    created: num(raw.created, 0, 4e12, now), updated: num(raw.updated, 0, 4e12, now),
    practice: { irrigation: pick(pr.irrigation, WATER, 'none'), tillage: pick(pr.tillage, TILLAGE, 'reduced'), livestock: pr.livestock === true, labour: pick(pr.labour, ['low', 'medium', 'high'], 'medium'), coverOK: pr.coverOK !== false },
    prio: pick(raw.prio, ['balanced', 'income', 'soil', 'water', 'safe'], 'balanced'), avoid: (Array.isArray(raw.avoid) ? raw.avoid : []).filter(c => ID_OK.test(c || '') && cropOk(c)).slice(0, 12),
    soil: cleanSoil(raw.soil), fields, scenarios, active: scenarios.some(s => s.id === raw.active) ? raw.active : 'base',
    trash: (Array.isArray(raw.trash) ? raw.trash : []).map(t => { const f = cleanField(t?.field, cropOk); return f && f.id ? { field: f, plans: cleanTrashPlans(t.plans, cropOk), at: num(t.at, 0, 4e12, now) } : null; }).filter(Boolean).slice(0, LIMITS.trash),
    tz: text(raw.tz, 60), prefs: { shade: prefs.shade === true, look: pick(prefs.look, LOOKS, 'board'), tab: pick(prefs.tab, TABS, 'board'), hud: prefs.hud !== false, tips: Math.round(num(prefs.tips, 0, 99, 0)), checked: text(prefs.checked, 64), objects: Array.isArray(prefs.objects) ? prefs.objects.slice(0, 200).filter(o => o && typeof o === 'object' && !Array.isArray(o)).map(o => JSON.parse(JSON.stringify(o))) : [], objectSize: pick(prefs.objectSize, ['real', 'big', 'huge'], 'real') },
  };
}
function cleanTrashPlans(raw, cropOk) {
  const out = {};
  if (raw && typeof raw === 'object') for (const id of Object.keys(raw).slice(0, LIMITS.scenarios)) if (ID_OK.test(id)) { const p = cleanPlan(raw[id], cropOk); if (p) out[id] = p; }
  return out;
}
// The whole store: version 1, the active farm, up to 8 farms. A string, null or nonsense gives an empty store.
export function cleanStore(raw, cropOk = () => true) {
  let g = raw;
  if (typeof g === 'string') { try { g = JSON.parse(g); } catch { g = null; } }
  const farms = [], ids = new Set();
  if (g && typeof g === 'object') for (const f of (Array.isArray(g.farms) ? g.farms : []).slice(0, LIMITS.farms)) { const c = cleanFarm(f, cropOk); if (c && !ids.has(c.id)) { ids.add(c.id); farms.push(c); } }
  const deleted = [];   // farms deleted lately, kept whole for 30 days (up to 5) so their fields can come back
  if (g && typeof g === 'object') for (const d of (Array.isArray(g.deleted) ? g.deleted : []).slice(0, LIMITS.trash)) { const c = cleanFarm(d?.farm, cropOk); if (c && !ids.has(c.id) && !deleted.some(x => x.farm.id === c.id)) deleted.push({ farm: c, at: num(d.at, 0, 4e12, Date.now()) }); }
  return { v: 1, active: farms.some(f => f.id === g?.active) ? g.active : farms[0]?.id ?? '', farms, deleted };
}
export const emptyStore = () => ({ v: 1, active: '', farms: [], deleted: [] });

// Read and write through a storage object (the page's localStorage, or any stand-in with getItem and setItem).
export function loadStore(storage, cropOk) {
  try { return cleanStore(storage.getItem(FARMS_KEY), cropOk); } catch { return emptyStore(); }   // blocked or broken storage: an empty farm board, never an error
}
export function saveStore(storage, store) {
  try { storage.setItem(FARMS_KEY, JSON.stringify(store)); return { ok: true }; } catch { return { ok: false, reason: 'Your device is full, so this could not be saved.' }; }
}

// ---- ids
export function newId(prefix, taken, now = Date.now(), random = Math.random) {
  const used = new Set(taken);
  for (let i = 0; i < 50; i++) { const id = `${prefix}${now.toString(36)}${Math.floor(random() * 46656).toString(36)}`; if (!used.has(id)) return id; }
  let n = 1; while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// ---- store operations: each takes a store and returns { store, ... } or { refused: 'plain words' }; nothing is changed in place
const mapFarm = (store, id, fn) => ({ ...store, farms: store.farms.map(f => f.id === id ? fn(f) : f) });
const touch = (farm, now) => ({ ...farm, updated: now });
export const getFarm = (store, id = store.active) => store.farms.find(f => f.id === id) || null;
export const getField = (farm, id) => farm?.fields.find(f => f.id === id) || null;
export const activeScenario = farm => farm.scenarios.find(s => s.id === farm.active) || farm.scenarios[0];
export const planOf = (farm, fieldId, scenarioId = 'base') => farm.scenarios.find(s => s.id === scenarioId)?.plans[fieldId] ?? null;

export function addFarm(store, { name, lat, lon, label = '', cc = '', irrigation = 'none' }, { now = Date.now(), random = Math.random } = {}) {
  if (store.farms.length >= LIMITS.farms) return { refused: 'You have the most farms Crophalo keeps (8).' };
  const nm = text(name, LIMITS.nameFarm);
  if (!nm) return { refused: 'Give the farm a name.' };
  const id = newId('f', store.farms.map(f => f.id), now, random);
  const farm = cleanFarm({ id, name: nm, pin: { lat, lon, label, cc }, created: now, updated: now, practice: { irrigation, tillage: 'reduced', coverOK: true }, prefs: { look: 'board' } });
  if (!farm) return { refused: 'That place could not be read.' };
  return { store: { ...store, farms: [...store.farms, farm], active: id }, farm };
}
export function removeFarm(store, id) {
  const farms = store.farms.filter(f => f.id !== id);
  return { ...store, farms, active: store.active === id ? farms[0]?.id ?? '' : store.active };
}
export const renameFarm = (store, id, name, now = Date.now()) => text(name, LIMITS.nameFarm) ? { store: mapFarm(store, id, f => touch({ ...f, name: text(name, LIMITS.nameFarm) }, now)) } : { refused: 'Give the farm a name.' };
export const setFarmPrefs = (store, id, prefs, now = Date.now()) => ({ store: cleanStore(mapFarm(store, id, f => touch({ ...f, prefs: { ...f.prefs, ...prefs } }, now)), () => true) });

// What a new outline needs before it joins the farm: the checks in the order the farmer meets them. Returns { ok, ring, ask } where ask is a question to put first.
export function checkNewOutline(farm, ring, { ignore = '', units = 'metric' } = {}) {
  const issue = outlineIssue(ring, units);
  if (issue) return { ok: false, refused: issue };
  if (farm.fields.filter(f => f.id !== ignore).length >= LIMITS.fields && !ignore) return { ok: false, refused: 'A farm holds up to 40 fields.' };
  const mid = interiorPoint(ring), km = distanceM([farm.pin.lat, farm.pin.lon], mid) / 1000;
  if (km > LIMITS.farKm) return { ok: false, ask: 'far', km: Math.round(km), reason: `This outline is ${Math.round(km)} km from the farm pin. NASA weather squares are about 50 km wide, so it needs its own farm.` };
  let worst = null;
  for (const f of farm.fields) if (f.id !== ignore) { const ha = overlapHa(ring, f.ring); if (ha >= 0.05 && (!worst || ha > worst.ha)) worst = { name: f.name, ha }; }
  const note = km > LIMITS.nearKm ? `${Math.round(km)} km from the farm pin: this field's weather may differ.` : '';
  return { ok: true, overlap: worst ? { name: worst.name, ha: r(worst.ha, 1), words: `This overlaps ${worst.name} by about ${worst.ha.toFixed(1)} ha. Keep both?` } : null, note, km };
}

export function addField(store, farmId, { ring, name, waterShare = 0, terrain = null, soil = null }, { now = Date.now(), random = Math.random } = {}) {
  const farm = getFarm(store, farmId);
  if (!farm) return { refused: 'That farm could not be found.' };
  if (farm.fields.length >= LIMITS.fields) return { refused: 'A farm holds up to 40 fields.' };
  const clean = cleanRing(ring);
  if (!clean) return { refused: outlineIssue(ring) || 'The outline could not be read.' };
  const id = newId('x', [...farm.fields.map(f => f.id), ...farm.trash.map(t => t.field.id)], now, random);
  const field = cleanField({ id, name: text(name, LIMITS.nameField) || nameForField([farm.pin.lat, farm.pin.lon], clean, farm.fields.map(f => f.name)), ring: clean, waterShare, terrain, soil });
  return { store: mapFarm(store, farmId, f => touch({ ...f, fields: [...f.fields, field] }, now)), field };
}

export function renameField(store, farmId, fieldId, name, now = Date.now()) {
  const nm = text(name, LIMITS.nameField);
  if (!nm) return { refused: 'Give the field a name.' };
  const farm = getFarm(store, farmId), old = getField(farm, fieldId);
  if (!old) return { refused: 'That field could not be found.' };
  return { store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === fieldId ? { ...x, name: nm } : x) }, now)), was: old.name };
}

// Redraw or move corners: the field keeps its id, name, plan, soil and notes; the terrain is cleared (read again); marks that fall outside the new outline go;
// when the old key point falls outside, the key moves and { moved } says so, so the field's own records and reminders can be re-filed (and put back by Undo).
export function redrawField(store, farmId, fieldId, ring, { now = Date.now() } = {}) {
  const farm = getFarm(store, farmId), old = getField(farm, fieldId), clean = cleanRing(ring);
  if (!old) return { refused: 'That field could not be found.' };
  if (!clean) return { refused: outlineIssue(ring) || 'The outline could not be read.' };
  const [kl, ko] = old.key.split(',').map(Number), keyInside = insideRing(kl, ko, clean);
  const key = keyInside ? old.key : fieldKey(interiorPoint(clean)), droppedMarks = [], marks = old.marks ? { ...old.marks } : null;
  if (marks) {
    for (const k of ['low', 'high']) if (marks[k] && !insideRing(marks[k][0], marks[k][1], clean)) { droppedMarks.push(k); marks[k] = null; }
    if (marks.down && !marks.down.every(p => insideRing(p[0], p[1], clean) || nearRing(p, clean, 15))) { droppedMarks.push('down'); marks.down = null; }
  }
  const field = cleanField({ ...old, ring: clean, key, terrain: null, marks });
  const fix = { 'low': 'low spot', 'high': 'high point', 'down': 'downhill arrow' }, lost = droppedMarks.map(k => fix[k]);
  return {
    store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === fieldId ? field : x) }, now)), field,
    moved: key !== old.key ? { from: old.key, to: key } : null,
    lostMarks: lost.length ? `Your ${lost.join(' and ')} fell outside the new outline, so ${lost.length > 1 ? 'they were' : 'it was'} removed.` : '',
  };
}
function nearRing(p, ring, m) {   // is the point within m metres of the outline (so an arrow end drawn at the edge is not lost)
  const f = frame([p, ...ring]), [px, py] = f.ring[0], xy = f.ring.slice(1);
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length], dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) <= m) return true;
  }
  return false;
}

// Delete: the field and its plans go to the trash (the last 5, kept 30 days); the farm keeps nothing else of it.
export function deleteField(store, farmId, fieldId, { now = Date.now() } = {}) {
  const farm = getFarm(store, farmId), field = getField(farm, fieldId);
  if (!field) return { refused: 'That field could not be found.' };
  const plans = {};
  for (const s of farm.scenarios) if (s.plans[fieldId]) plans[s.id] = s.plans[fieldId];
  const trash = [{ field, plans, at: now }, ...pruneTrash(farm.trash, now)].slice(0, LIMITS.trash);
  return { store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.filter(x => x.id !== fieldId), scenarios: f.scenarios.map(s => { const p = { ...s.plans }; delete p[fieldId]; return { ...s, plans: p }; }), trash }, now)), field };
}
export const pruneTrash = (trash, now = Date.now()) => trash.filter(t => now - t.at <= LIMITS.trashDays * DAY_MS);
export function restoreField(store, farmId, fieldId, { now = Date.now() } = {}) {
  const farm = getFarm(store, farmId), item = farm?.trash.find(t => t.field.id === fieldId);
  if (!item) return { refused: 'That field could not be brought back.' };
  if (farm.fields.length >= LIMITS.fields) return { refused: 'A farm holds up to 40 fields.' };
  const taken = farm.fields.some(f => f.id === fieldId);
  const id = taken ? newId('x', farm.fields.map(f => f.id), now) : fieldId, field = { ...item.field, id };
  return { store: mapFarm(store, farmId, f => touch({ ...f, fields: [...f.fields, field], trash: f.trash.filter(t => t.field.id !== fieldId), scenarios: f.scenarios.map(s => item.plans[s.id] ? { ...s, plans: { ...s.plans, [id]: item.plans[s.id] } } : s) }, now)), field };
}

// Split: ringA keeps the field (id, name, key, notes), ringB becomes "<name> 2" with the same plan in every scenario, the same soil and soil test, and the marks inside it.
export function splitField(store, farmId, fieldId, rings, { now = Date.now(), random = Math.random } = {}) {
  const farm = getFarm(store, farmId), field = getField(farm, fieldId);
  if (!field) return { refused: 'That field could not be found.' };
  if (farm.fields.length >= LIMITS.fields) return { refused: 'A farm holds up to 40 fields.' };
  const [a, b] = rings.map(cleanRing);
  if (!a || !b) return { refused: 'One half would be smaller than the smallest field Crophalo keeps.' };
  const [big, small] = areaHa(a) >= areaHa(b) ? [a, b] : [b, a], share = field.waterShare;
  const marksIn = (marks, ring) => marks ? cleanMarks({ down: marks.down && marks.down.every(p => insideRing(p[0], p[1], ring)) ? marks.down : null, low: marks.low && insideRing(marks.low[0], marks.low[1], ring) ? marks.low : null, high: marks.high && insideRing(marks.high[0], marks.high[1], ring) ? marks.high : null, slope: marks.slope }) : null;
  const keeper = cleanField({ ...field, ring: big, terrain: null, marks: marksIn(field.marks, big), waterShare: share });
  const taken = farm.fields.map(f => f.name), baseName = field.name.replace(/ \d+$/, '');
  let n = 2; while (taken.some(t => t.toLowerCase() === `${baseName} ${n}`.toLowerCase())) n++;
  const id = newId('x', [...farm.fields.map(f => f.id), ...farm.trash.map(t => t.field.id)], now, random);
  const second = cleanField({ ...field, id, key: undefined, name: text(`${baseName} ${n}`, LIMITS.nameField), ring: small, terrain: null, marks: marksIn(field.marks, small), waterShare: share });
  if (!keeper || !second) return { refused: 'One half would be smaller than the smallest field Crophalo keeps.' };
  const next = mapFarm(store, farmId, f => touch({ ...f, fields: [...f.fields.map(x => x.id === fieldId ? keeper : x), second], scenarios: f.scenarios.map(s => s.plans[fieldId] ? { ...s, plans: { ...s.plans, [id]: s.plans[fieldId] } } : s) }, now));
  return { store: next, kept: keeper, added: second, words: `${field.name} split in two: ${keeper.name} and ${second.name}` };
}

// Bring in several outlines at once: rows from farmio's reader, each { name, ring }; the ones that fit are added in order.
export function addFields(store, farmId, rows, { now = Date.now(), random = Math.random } = {}) {
  let cur = store, added = [];
  const farm0 = getFarm(store, farmId);
  if (!farm0) return { refused: 'That farm could not be found.' };
  for (const row of rows) {
    const farm = getFarm(cur, farmId), res = addField(cur, farmId, { ring: row.ring, name: row.name || undefined }, { now, random: () => random() });
    if (res.refused) { if (farm.fields.length >= LIMITS.fields) break; continue; }
    cur = res.store; added.push(res.field);
  }
  return { store: cur, added };
}

// ---- plans
// Plant: one crop for the first season (or a whole rotation), kept per scenario. A tree choice changes the field itself, so a what-if refuses it.
export function setPlan(store, farmId, fieldId, plan, { scenario = 'base', now = Date.now(), cropOk = () => true } = {}) {
  const farm = getFarm(store, farmId), field = getField(farm, fieldId), clean = cleanPlan(plan, cropOk);
  if (!field) return { refused: 'That field could not be found.' };
  if (!clean) return { refused: 'Choose a crop first.' };
  if (!farm.scenarios.some(s => s.id === scenario)) return { refused: 'That what-if could not be found.' };
  const out = mapFarm(store, farmId, f => touch({ ...f, scenarios: f.scenarios.map(s => s.id === scenario ? { ...s, plans: { ...s.plans, [fieldId]: clean } } : s) }, now));
  return { store: out, plan: clean };
}
export function clearPlan(store, farmId, fieldId, { scenario = 'base', now = Date.now() } = {}) {
  return { store: mapFarm(store, farmId, f => touch({ ...f, scenarios: f.scenarios.map(s => { if (s.id !== scenario) return s; const p = { ...s.plans }; delete p[fieldId]; return { ...s, plans: p }; }) }, now)) };
}
export function setTree(store, farmId, fieldId, tree, { scenario = 'base', now = Date.now(), cropOk = () => true } = {}) {
  if (scenario !== 'base') return { refused: 'Trees and bushes change the field itself, so they are chosen in My plan, not in a what-if.' };
  if (tree !== null && !(ID_OK.test(tree || '') && cropOk(tree))) return { refused: 'That tree or bush could not be found.' };
  const farm = getFarm(store, farmId);
  if (!getField(farm, fieldId)) return { refused: 'That field could not be found.' };
  return { store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === fieldId ? { ...x, kind: tree ? 'garden' : 'rot', tree: tree || null } : x), scenarios: tree ? f.scenarios.map(s => { const p = { ...s.plans }; delete p[fieldId]; return { ...s, plans: p }; }) : f.scenarios }, now)) };
}
// Copy one field's rotation to the fields ticked (their plans are replaced). Tree fields are left out; in a what-if the trees stay as they are.
export function copyPlan(store, farmId, fromId, toIds, { scenario = 'base', now = Date.now() } = {}) {
  const farm = getFarm(store, farmId), plan = planOf(farm, fromId, scenario);
  if (!plan) return { refused: 'Choose a crop first.' };
  const targets = toIds.filter(id => id !== fromId && getField(farm, id)?.kind === 'rot');
  if (!targets.length) return { refused: 'Tick at least one field.' };
  const out = mapFarm(store, farmId, f => touch({ ...f, scenarios: f.scenarios.map(s => s.id === scenario ? { ...s, plans: { ...s.plans, ...Object.fromEntries(targets.map(id => [id, JSON.parse(JSON.stringify(plan))])) } } : s) }, now));
  return { store: out, count: targets.length };
}
export const setFieldSoil = (store, farmId, fieldId, soil, now = Date.now()) => ({ store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === fieldId ? { ...x, soil: cleanSoil(soil) } : x) }, now)) });
export const setFieldTerrain = (store, farmId, fieldId, terrain, now = Date.now()) => ({ store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === fieldId ? { ...x, terrain: cleanTerrain(terrain) } : x) }, now)) });
export const setMarks = (store, farmId, fieldId, marks, now = Date.now()) => ({ store: mapFarm(store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === fieldId ? { ...x, marks: cleanMarks(marks) } : x) }, now)) });

// The crop of this season on a field, from its plan (the first season of the rotation when the plan has started, else null).
export function thisSeasonCrop(farm, field, { scenario = 'base', year } = {}) {
  if (field.kind === 'garden') return field.tree;
  const plan = planOf(farm, field.id, scenario);
  if (!plan) return null;
  const y = year ?? plan.start, i = plan.start ? ((y - plan.start) % plan.seasons.length + plan.seasons.length) % plan.seasons.length : 0;
  return plan.seasons[i].crop;
}

// ---- undo: the last 12 changes kept 5 minutes, each the whole store as it was (stores are never changed in place, so a snapshot is cheap)
export function makeUndo({ steps = LIMITS.undoSteps, ms = LIMITS.undoMs } = {}) {
  let list = [];
  const fresh = now => list.filter(e => now - e.at <= ms);
  return {
    push(store, label, now = Date.now(), extra = null) { list = [...fresh(now), { store, label, at: now, extra }].slice(-steps); },
    take(now = Date.now()) { list = fresh(now); return list.pop() ?? null; },
    peek(now = Date.now()) { const l = fresh(now); return l[l.length - 1] ?? null; },
    size: (now = Date.now()) => fresh(now).length,
    clear() { list = []; },
  };
}

// ---- scores: read from the crop engine through ONE function. Nothing here works a score out; "not read yet" is the honest answer until the engine is set.
let ENGINE = null;
export const setEngine = e => { ENGINE = e && typeof e === 'object' ? e : null; };
export const engineReady = () => !!ENGINE;
export const fitWord = score => !Number.isFinite(score) ? '' : score >= 70 ? 'Good fit' : score >= 50 ? 'OK fit' : 'Poor fit';
// engine.score({ farm, field, plan, scenario }) -> { score 0-100, parts{water,soil,income,safety}, bareMonths 0-12, sales { perYear|null, withPrice, of }, years { hurt, close, total, hurtYears[] }, status }
export function readScore(farm, field, scenario = 'base') {
  const plan = planOf(farm, field.id, scenario);
  if (field.kind === 'garden') return { state: 'trees', words: 'Trees and bushes are not scored' };
  if (!plan) return { state: 'unplanted', words: 'Not planted' };
  if (!ENGINE?.score) return { state: 'unread', words: 'No score yet' };
  let res;
  try { res = ENGINE.score({ farm, field, plan, scenario }); } catch { return { state: 'unread', words: 'No score yet' }; }
  if (!res || typeof res !== 'object') return { state: 'unread', words: 'No score yet' };
  if (res.state === 'needs-soil') return { state: 'needs-soil', words: 'Needs a soil' };
  if (res.state === 'waiting') return { state: 'waiting', words: 'Waiting for weather' };
  if (!Number.isFinite(res.score)) return { state: 'unread', words: 'No score yet' };
  const score = Math.round(num(res.score, 0, 100)), years = res.years && Number.isFinite(res.years.total) ? { hurt: num(res.years.hurt, 0, 99, 0), close: num(res.years.close, 0, 99, 0), total: num(res.years.total, 0, 99, 0), hurtYears: (Array.isArray(res.years.hurtYears) ? res.years.hurtYears : []).filter(Number.isFinite).slice(0, 40) } : null;
  return { state: 'scored', score, fit: fitWord(score), words: `${score} · ${fitWord(score)}`, parts: res.parts && typeof res.parts === 'object' ? res.parts : null,
    bareMonths: Number.isFinite(res.bareMonths) ? num(res.bareMonths, 0, 12) : null, sales: res.sales && typeof res.sales === 'object' ? res.sales : null, years, suits: res.suits ?? null };
}
// The crop packets of the Plant sheet: engine.crops({ farm, field }) -> [{ id, word, tone good|warn|bad, nearby, traits[] }], best first. Without the engine, nothing is invented.
export function cropChoices(farm, field) {
  if (!ENGINE?.crops) return { ready: false, list: [] };
  try {
    const list = (ENGINE.crops({ farm, field }) || []).filter(c => c && ID_OK.test(c.id || '')).map(c => ({ id: c.id, word: text(c.word || '', 60), tone: pick(c.tone, ['good', 'warn', 'bad'], 'warn'), nearby: c.nearby === true, traits: (Array.isArray(c.traits) ? c.traits : []).map(t => text(t, 80)).filter(Boolean).slice(0, 5) }));
    return { ready: true, list };
  } catch { return { ready: false, list: [] }; }
}

// ---- the four values over the fields (by size); every one carries how many fields it counts, and "not read yet" when none can be counted
export function farmValues(farm, scenario = farm.active) {
  const rows = farm.fields.filter(f => f.kind === 'rot').map(f => ({ f, s: readScore(farm, f, scenario) })), scored = rows.filter(x => x.s.state === 'scored');
  const wavg = (list, pickv) => { const w = list.reduce((a, x) => a + x.f.area, 0); return w > 0 ? list.reduce((a, x) => a + pickv(x) * x.f.area, 0) / w : null; };
  const bare = scored.filter(x => x.s.bareMonths != null), sold = scored.filter(x => x.s.sales && Number.isFinite(x.s.sales.perYear)), hurt = scored.filter(x => x.s.years);
  const score = scored.length ? Math.round(wavg(scored, x => x.s.score)) : null;
  const hurtYears = new Set(hurt.flatMap(x => x.s.years.hurtYears)), total = hurt.length ? Math.max(...hurt.map(x => x.s.years.total)) : 0;
  return {
    fields: rows.length, scored: scored.length, planted: rows.filter(x => x.s.state !== 'unplanted').length,
    score: score == null ? null : { value: score, fit: fitWord(score), words: `${score} · ${fitWord(score)}` },
    bare: bare.length ? { months: r(wavg(bare, x => x.s.bareMonths), 1), of: bare.length } : null,
    sales: sold.length ? { perYear: Math.round(sold.reduce((a, x) => a + x.s.sales.perYear, 0)), counted: sold.length, of: scored.length } : null,
    past: hurt.length ? { hurtYears: hurtYears.size, total, list: [...hurtYears].sort((a, b) => a - b) } : null,
  };
}

// ---- the Fields table rows (one per field, natural order) with the words each cell shows
export function fieldRows(farm, { scenario = farm.active, units = 'metric', year } = {}) {
  return naturalSort(farm.fields.map(f => f)).map(f => {
    const s = readScore(farm, f, scenario), crop = thisSeasonCrop(farm, f, { scenario, year });
    return { id: f.id, name: f.name, ha: f.area, crop, water: f.kind === 'garden' ? null : WATER_WORDS[planOf(farm, f.id, scenario)?.water ?? farm.practice.irrigation], fit: s, kind: f.kind, tree: f.tree };
  });
}

// ---- natural order: "Field 2" before "Field 10", numbers by value, case ignored
export function naturalCompare(a, b) {
  const x = String(a?.name ?? a).toLowerCase().match(/\d+|\D+/g) || [], y = String(b?.name ?? b).toLowerCase().match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const nx = /^\d/.test(x[i]), ny = /^\d/.test(y[i]);
    if (nx && ny) { const d = +x[i] - +y[i]; if (d) return d; }
    else if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}
export const naturalSort = list => [...list].sort(naturalCompare);

// ---- keyboard: the nearest field in a direction (within 60 degrees of it) from a field, by the tokens' places on the board
export function nearestInDirection(from, others, bearing) {
  let best = null;
  for (const o of others) {
    const b = bearingDeg(from.at, o.at), diff = Math.abs(((b - bearing + 540) % 360) - 180);
    if (diff > 60) continue;
    const d = distanceM(from.at, o.at);
    if (!best || d < best.d) best = { id: o.id, d };
  }
  return best?.id ?? null;
}

// ---- the seam with the 3D farm: farmFor3d(farm, { info, year, scenario }) -> { name, pin, fields[] } and nothing else.
// info(cropId) is the crop table's answer { group, days, sow (month 1-12), kind 'crop'|'cover'|'tree' } (js/crops.js); it is passed in so this file stays pure.
// The table gives one season length ("days"), not four stage lengths, so the four are that length split by the FAO-56 usual shares (15, 25, 40, 20 per cent).
const STAGE_SHARE = Object.freeze({ ini: 0.15, dev: 0.25, mid: 0.4, late: 0.2 });
export const stageLengths = days => { const d = Math.max(1, Math.round(days)), ini = Math.round(d * STAGE_SHARE.ini), dev = Math.round(d * STAGE_SHARE.dev), late = Math.round(d * STAGE_SHARE.late); return { ini, dev, mid: Math.max(1, d - ini - dev - late), late }; };
export function seasonOn(plan, date) {   // the season of a report plan that is under way on a day (sowing to harvest), else null
  return plan?.seasons.find(x => date >= x.sow && date <= x.harvest) ?? null;
}
// With a field chosen it returns what the 3D view takes: { name, pin, field { id, name, polygon, areaEstimated }, planKind, planName, date, ground }; the answer of
// ground(plan, date) goes in as given, or null (the 3D view then says "not read yet"). Without a field it describes the whole farm.
export function farmFor3d(farm, opts = {}) {
  const { fieldId = '', planKind = 'proposed', date = '', ground = null } = opts, f = fieldId ? getField(farm, fieldId) : null;
  if (!f) return farmOverview(farm, opts);
  const plan = f.report?.[planKind] ?? null;
  let g = null;
  if (plan && date && typeof ground === 'function') { try { g = ground(plan, date) ?? null; } catch { g = null; } }
  return { name: farm.name, pin: { lat: farm.pin.lat, lon: farm.pin.lon }, field: { id: f.id, name: f.name, polygon: f.ring.map(p => [p[0], p[1]]), areaEstimated: f.estimated === true },
    planKind, planName: plan?.name ?? KIND_NAMES[planKind] ?? 'Plan', date, ground: g };
}
const KIND_NAMES = { current: 'Current plan', proposed: 'Proposed plan' };
function farmOverview(farm, { info = () => null, year, scenario = 'base', fieldId = '', planKind = '', date = '', ground = null } = {}) {
  const fields = farm.fields.map(f => {
    const id = f.kind === 'garden' ? f.tree : thisSeasonCrop(farm, f, { scenario, year }), plan = planOf(farm, f.id, scenario), y = year ?? (plan?.start || new Date().getFullYear());
    const season = plan ? plan.seasons[plan.start ? ((y - plan.start) % plan.seasons.length + plan.seasons.length) % plan.seasons.length : 0] : null, ci = id ? info(id) : null;
    let crop = null;
    if (id && ci) {
      const [m, d] = season?.sowing ? season.sowing.split('-').map(Number) : [ci.sow || 4, 15];
      crop = { id, group: ci.group || 'other', sow: Date.UTC(y, m - 1, d), lengths: stageLengths(ci.days || 120), kind: f.kind === 'garden' ? 'tree' : ci.kind === 'cover' ? 'cover' : 'crop' };
    }
    const marks = f.marks, down = marks?.down ? bearingDeg(marks.down[0], marks.down[1]) : f.terrain?.aspect ?? null, pct = marks?.slope ?? f.terrain?.slope ?? null;
    const out = { id: f.id, name: f.name, polygon: f.ring.map(p => [p[0], p[1]]), crop, slope: { pct, downhill: down } };
    const rp = planKind && f.report ? f.report[planKind] : null;   // the report's plan on the chosen day: the crop under way then, and what covers the ground
    if (rp && date) {
      const on = seasonOn(rp, date), ci2 = on ? info(on.crop) : null;
      out.crop = on && ci2 ? { id: on.crop, group: ci2.group || 'other', sow: Date.parse(on.sow + 'T00:00:00Z'), lengths: stageLengths(ci2.days || 120), kind: ci2.kind === 'cover' ? 'cover' : 'crop' } : null;
      if (typeof ground === 'function') { try { out.ground = ground(rp, date) ?? null; } catch { out.ground = null; } }
    }
    return out;
  });
  const sel = { fieldId: fieldId || '', planKind: planKind || '', date: date || '' };
  return { name: farm.name, pin: { lat: farm.pin.lat, lon: farm.pin.lon }, fields, ...(fieldId ? { selected: sel } : {}) };
}

// ---- "Add to my farm" from a report: the same field every time (matched by position to 4 decimals), the current plan kept, the report's choice stored as a separate proposed plan.
export const squareAround = (lat, lon, ha) => {
  const side = Math.sqrt(ha * 1e4), dLat = side / 2 / 111195, dLon = side / 2 / (111195 * Math.cos(lat * RAD));
  return [[lat + dLat, lon - dLon], [lat + dLat, lon + dLon], [lat - dLat, lon + dLon], [lat - dLat, lon - dLon]].map(p => [round5(p[0]), round5(p[1])]);
};
export function applyReport(store, { place, area, areaEstimated, current, proposed, date, outline } = {}, { now = Date.now(), random = Math.random, cropOk = () => true } = {}) {
  const lat = num(place?.lat, -90, 90), lon = num(place?.lon, -180, 180);
  if (lat == null || lon == null) return { refused: 'That field could not be added to My farm.' };
  // the report sends the field as an object { pts, ha, slope | estimated }, or as a number of hectares with the outline beside it
  const obj = area && typeof area === 'object' ? area : null, haIn = obj ? obj.ha : area, pts = outline ?? obj?.pts;
  const drawn = pts ? cleanRing(pts) : null, ha = Number.isFinite(+haIn) && +haIn >= LIMITS.areaHa[0] && +haIn <= LIMITS.areaHa[1] ? +haIn : 10;
  const ring = drawn || cleanRing(squareAround(lat, lon, ha)), estimated = !drawn || areaEstimated === true || obj?.estimated === true;
  const slopeIn = Number.isFinite(+obj?.slope) ? +obj.slope : null;
  if (!ring) return { refused: 'That field could not be added to My farm.' };
  const key = fieldKey(interiorPoint(ring)), pinKey = fieldKey([lat, lon]);
  const report = cleanReport({ current, proposed, date, at: now }, cropOk);
  if (!report) return { refused: 'That field could not be added to My farm.' };
  const hit = f => f.key === key || (estimated && f.key === pinKey);
  for (const farm of store.farms) {   // a repeat add finds the same field
    const old = farm.fields.find(hit);
    if (!old) continue;
    const kept = { ...report, current: old.report?.current ?? report.current };   // the current plan stays as it was
    const next = mapFarm(store, farm.id, f => touch({ ...f, fields: f.fields.map(x => x.id === old.id ? { ...x, report: kept } : x) }, now));
    return { store: { ...next, active: farm.id }, farmId: farm.id, fieldId: old.id, created: false };
  }
  const near = [...store.farms].sort((a, b) => (a.id === store.active ? -1 : 0) - (b.id === store.active ? -1 : 0)).find(f => distanceM([f.pin.lat, f.pin.lon], [lat, lon]) / 1000 <= LIMITS.farKm);
  let cur = store, farmId = near?.id;
  if (!farmId) {
    const label = text(place?.name || place?.label || '', LIMITS.nameFarm) || 'My farm', made = addFarm(cur, { name: label.split(',')[0].trim() || 'My farm', lat, lon, label: place?.label || '', cc: place?.cc || '', irrigation: 'none' }, { now, random });
    if (made.refused) return { refused: made.refused };
    cur = made.store; farmId = made.farm.id;
  }
  const farm = getFarm(cur, farmId);
  if (farm.fields.length >= LIMITS.fields) return { refused: 'A farm holds up to 40 fields.' };
  const added = addField(cur, farmId, { ring, name: text(place?.fieldName || '', LIMITS.nameField) || undefined, soil: { texture: 'loam', om: 'med', source: 'assumed until the soil map answers', assumed: true } }, { now, random });
  if (added.refused) return { refused: added.refused };
  let st = mapFarm(added.store, farmId, f => touch({ ...f, fields: f.fields.map(x => x.id === added.field.id ? { ...x, estimated, report, terrain: slopeIn != null && !estimated ? cleanTerrain({ v: 1, slope: slopeIn, source: 'your drawn field' }) : x.terrain } : x) }, now));
  const cp = report.current;   // the rotation the field runs now, so the Fields table and the score have a plan to read
  if (cp) { const rot = { start: cp.seasons[0].year, water: 'none', seasons: cp.seasons.map(x => ({ crop: x.crop })) }; st = setPlan(st, farmId, added.field.id, rot, { now, cropOk }).store ?? st; }
  return { store: { ...st, active: farmId }, farmId, fieldId: added.field.id, created: true };
}

// ---- the farm list and farm settings
export const farmSummary = (farm, areaText = ha => `${ha} ha`) => `${farm.fields.length} field${farm.fields.length === 1 ? '' : 's'}${farm.fields.length ? `, ${areaText(Math.round(farm.fields.reduce((a, f) => a + f.area, 0) * 10) / 10)}` : ''}`;
export const openFarm = (store, id) => store.farms.some(f => f.id === id) ? { store: { ...store, active: id } } : { refused: 'That farm could not be found.' };
export function setFarmPractice(store, id, change, now = Date.now()) {
  const keep = cleanFarm({ ...getFarm(store, id), practice: { ...getFarm(store, id)?.practice, ...change } });
  return keep ? { store: mapFarm(store, id, f => touch({ ...f, practice: keep.practice }, now)) } : { refused: 'That farm could not be found.' };
}
// Moving the pin: the weather is asked again for the new place. Fields more than 50 km from it are counted so the farmer is told.
export function moveFarmPin(store, id, lat, lon, label = '', now = Date.now()) {
  const farm = getFarm(store, id), la = Number.isFinite(+lat) && Math.abs(+lat) <= 90 ? +lat : null, lo = Number.isFinite(+lon) && Math.abs(+lon) <= 180 ? +lon : null;
  if (!farm) return { refused: 'That farm could not be found.' };
  if (la == null || lo == null) return { refused: 'That place could not be read.' };
  const far = farm.fields.filter(f => distanceM([la, lo], interiorPoint(f.ring)) / 1000 > LIMITS.farKm).length;
  return { store: mapFarm(store, id, f => touch({ ...f, pin: { ...f.pin, lat: r(la, 4), lon: r(lo, 4), label: text(label, 200) || f.pin.label } }, now)), far, words: far ? `${far} field${far === 1 ? ' is' : 's are'} now more than 50 km from the pin. NASA weather squares are about 50 km wide.` : '' };
}
export const pruneDeletedFarms = (deleted, now = Date.now()) => deleted.filter(d => now - d.at <= LIMITS.trashDays * DAY_MS);
// Delete a farm: it goes whole to Recently deleted (the last 5, 30 days), so its fields and plans can come back.
export function deleteFarm(store, id, now = Date.now()) {
  const farm = getFarm(store, id);
  if (!farm) return { refused: 'That farm could not be found.' };
  const farms = store.farms.filter(f => f.id !== id), deleted = [{ farm, at: now }, ...pruneDeletedFarms(store.deleted || [], now)].slice(0, LIMITS.trash);
  return { store: { ...store, farms, deleted, active: store.active === id ? farms[0]?.id ?? '' : store.active }, farm };
}
export function restoreFarm(store, id, now = Date.now()) {
  const item = (store.deleted || []).find(d => d.farm.id === id);
  if (!item) return { refused: 'That farm could not be brought back.' };
  if (store.farms.length >= LIMITS.farms) return { refused: 'You have the most farms Crophalo keeps (8).' };
  const farm = store.farms.some(f => f.id === id) ? { ...item.farm, id: newId('f', store.farms.map(f => f.id), now) } : item.farm;
  return { store: { ...store, farms: [...store.farms, touch(farm, now)], deleted: store.deleted.filter(d => d.farm.id !== id), active: farm.id }, farm };
}

// ---- the three days a judge steps through: the engine's own keyDates(current, proposed) when it is there, else only what the plans themselves hold (never an invented offset)
const PLAN_HINTS = { harvest: 'The day the harvest is planned to finish.', establish: 'When the new crop has come up, from its own stage lengths.', spring: 'The day the crop grows again in spring, from its own record.' };
export function planDates(f, { keyFn = null, cropName = id => id, addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10) } = {}) {
  const r = f?.report, plan = r?.proposed || r?.current, seasons = plan?.seasons || [], one = id => cropName(id).replace(/beans$/i, 'bean');
  if (!seasons.length) return [];
  if (keyFn && r?.current && r?.proposed) {
    try { const rows = keyFn(r.current, r.proposed); if (Array.isArray(rows) && rows.length) return rows.filter(x => x && DAY_OK(x.date)).map(x => ({ id: x.key, label: x.label, date: x.date, hint: PLAN_HINTS[x.key] || '' })); } catch { /* the plain days below */ }
  }
  if (seasons.length < 2) return [{ id: 'harvest', label: `${one(seasons[0].crop)} harvest`, date: seasons[0].harvest, hint: PLAN_HINTS.harvest }];
  const prev = seasons[seasons.length - 2], last = seasons[seasons.length - 1], out = [{ id: 'harvest', label: `${one(prev.crop)} harvest`, date: prev.harvest, hint: PLAN_HINTS.harvest }];
  if (last.stages) out.push({ id: 'establish', label: `${cropName(last.crop)} established`, date: addDays(last.sow, last.stages[0]), hint: PLAN_HINTS.establish });
  if (last.wake) out.push({ id: 'spring', label: `${cropName(last.crop)} growing again in spring`, date: last.wake, hint: PLAN_HINTS.spring });
  return out;
}

// ---- the time bar: the season, its twelve months in season order, and the one date the board shows (the 15th of the month chosen)
const pad2 = n => String(n).padStart(2, '0');
export function seasonOfDate(lat, iso) {   // the start year of the season a day is in (the calendar year in the north, July to June in the south)
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  return southOf(lat) ? (m >= 7 ? y : y - 1) : y;
}
export function monthIndexOf(lat, iso) { return seasonMonths(lat).indexOf(+iso.slice(5, 7) - 1); }   // 0..11 in season order
export function monthDate(lat, seasonYear, idx) {   // the 15th of the idx-th month of a season
  const i = Math.min(11, Math.max(0, Math.round(idx))), m0 = seasonMonths(lat)[i], y = seasonYear + (southOf(lat) && i >= 6 ? 1 : 0);
  return `${y}-${pad2(m0 + 1)}-15`;
}
export function shiftSeason(iso, n) {   // the same month and day n seasons later (29 February becomes 28)
  const y = +iso.slice(0, 4) + n, m = +iso.slice(5, 7), d = +iso.slice(8, 10), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${Math.min(2100, Math.max(2000, y))}-${pad2(m)}-${pad2(Math.min(d, last))}`;
}
export const monthWord = iso => `${MONTH_NAMES[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
// What the plate under a field says about the month: "Growing (corn) in June". g is the engine's answer for the day; null when it has none.
export function plateWord(g, cropName = id => id, month = '') {
  if (!g || !g.state) return '';
  const crop = g.crop ? ` (${String(cropName(g.crop)).toLowerCase()})` : '';
  const word = g.state === 'crop' ? (g.stage === 0 || g.stage === 1 ? 'Sown' : g.stage === 5 ? 'Harvest' : 'Growing') : g.state === 'cover' ? 'Cover crop' : g.state === 'residue' ? 'Stubble' : 'Bare soil';
  return `${word}${g.state === 'bare' ? '' : crop}${month ? ` in ${month}` : ''}`;
}

// ---- judging one crop's season on one year of recorded weather: Fine, Close call or Hurt (counts of real years, never a chance)
// season { crop, sow, harvest, stages: [initial, development, mid, late] days } with the days of the year being judged; series the daily record of js/data.js
// (days 'YYYYMMDD', T2M_MIN, T2M_MAX, rain, lastDate); crop the crop table's row (frost 0-1, heat °C, water mm, maxGs mm, fam, group);
// ctx { irrigationMm, holdMm (water the soil holds), shiftC (a what-if), usual { ratio, hotDays } (the usual year here) }.
// Every rule that needs a figure the record or the plan does not hold says so in `notes` and is not judged: nothing is guessed.
const HEAVY_DAY_MM = 20;   // a day with this much rain or more is a heavy-rain day (the climate record's own line)
const DAYN = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
const ISO = n => new Date(n * 864e5).toISOString().slice(0, 10);
export const VERDICT_WORDS = Object.freeze({ fine: 'Fine', close: 'Close call', hurt: 'Hurt', nodata: 'No data', growing: 'Still growing' });
export function seasonInYear(season, year) {   // the same sowing and harvest days, moved to a weather year: a season is keyed by its HARVEST year ("2026-27" when it crosses New Year)
  const sy = +season.sow.slice(0, 4), hy = +season.harvest.slice(0, 4);
  return { ...season, sow: `${year - (hy - sy)}${season.sow.slice(4)}`, harvest: `${year}${season.harvest.slice(4)}` };
}
export const seasonLabel2 = (season, year) => { const s = seasonInYear(season, year); return s.sow.slice(0, 4) === s.harvest.slice(0, 4) ? String(year) : `${s.sow.slice(0, 4)}\u2013${s.harvest.slice(2, 4)}`; };
export function judgeSeason(season, series, crop, ctx = {}) {
  const none = (verdict, note) => ({ verdict, causes: [], notes: note ? [note] : [] });
  if (!season || !DAY_OK(season.sow) || !DAY_OK(season.harvest) || !series || !Array.isArray(series.days) || !crop) return none('nodata', 'There is no plan or no weather to judge.');
  const index = new Map(series.days.map((d, i) => [d, i])), key = n => ISO(n).replace(/-/g, ''), at = (arr, n) => { const i = index.get(key(n)); return i == null ? NaN : arr?.[i]; };
  const sow = DAYN(season.sow), harvest = DAYN(season.harvest), real = [series.lastDate?.T2M_MAX, series.lastDate?.T2M_MIN].filter(Boolean).map(d => DAYN(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`));
  if (!real.length || harvest > Math.min(...real)) return none('growing');
  let missing = 0; const days = harvest - sow + 1;
  for (let n = sow; n <= harvest; n++) if (!Number.isFinite(at(series.T2M_MIN, n)) || !Number.isFinite(at(series.T2M_MAX, n))) missing++;
  if (days <= 0 || missing > 0.05 * days) return none('nodata', 'More than 5% of this season\'s days have no weather.');
  const shift = Number.isFinite(ctx.shiftC) ? ctx.shiftC : 0, notes = [], low = n => at(series.T2M_MIN, n) + shift, high = n => at(series.T2M_MAX, n) + shift;
  const raw = [], add = (severity, kind, n, text, value = null) => raw.push({ severity, kind, date: ISO(n), text, value });
  const st = Array.isArray(season.stages) && season.stages.length === 4 && season.stages.every(Number.isFinite) ? season.stages : null;
  if (!st) notes.push('The crop\'s stage lengths are not known, so the frost and heat rules that depend on a stage were not judged.');
  const tender = crop.frost < 0.3, winter = crop.frost >= 0.7 && crop.group === 'grain';
  let hotDays = null;
  if (st) {
    const young0 = sow + 6, young1 = sow + st[0] - 1, mid0 = sow + st[0] + st[1], mid1 = mid0 + st[2] - 1, late1 = Math.min(harvest, mid1 + st[3]);
    if (tender) {
      const onlyHard = crop.id === 'corn';   // corn's first 30 days: only a hard frost counts
      for (let n = young0; n <= young1; n++) { const v = low(n); if (v <= -2) add('hit', 'frost-young', n, 'Frost on young plants', v); else if (v < 0 && !(onlyHard && n < sow + 30)) add('close', 'frost-young', n, 'Frost on young plants', v); }
      for (let n = mid0; n <= mid1; n++) { const v = low(n); if (v < 0) add('hit', 'frost-flowering', n, 'Frost at flowering', v); }
      for (let n = mid1 + 1; n <= late1; n++) { const v = low(n); if (v <= -2) add('hit', 'frost-ripening', n, 'Frost before ripe', v); else if (v < 0) add('close', 'frost-ripening', n, 'Frost before ripe', v); }
    }
    if (winter) {   // a winter cereal flowers at the end of its mid stage (the crop table's own rule: ten days before it ends), early to mid June in southern Ontario
      const flower = crop.fl === 'end' ? mid1 - 10 : mid0;
      for (let n = flower - 40; n <= flower - 10; n++) { const v = low(n); if (v <= -4) add('hit', 'frost-winter', n, 'A hard frost before flowering', v); }
      for (let n = flower; n <= mid1; n++) { const v = low(n); if (v <= -2) add('hit', 'frost-flowering', n, 'Frost at flowering', v); }
      notes.push('Winter survival is not judged: it needs snow cover, which this record does not have.');
    }
    if (Number.isFinite(crop.heat) && crop.heat < 60) {
      const line = crop.heat + 2; let hot = 0, first = null;
      for (let n = mid0; n <= mid1; n++) if (high(n) >= line) { hot++; first ??= n; }
      hotDays = hot;
      const usual = Number.isFinite(ctx.usual?.hotDays) ? ctx.usual.hotDays : 0;
      if (hot >= 3 && hot - usual >= 3) add('hit', 'heat-flowering', first, `Heat at flowering (${hot} days of ${line} °C or more)`);
      if (!Number.isFinite(ctx.usual?.hotDays)) notes.push('The usual number of hot days here is not known, so heat is judged on its own.');
    }
  }
  // water: 0.8 of the season's rain, the water the soil holds, any watering; against what the crop needs (a warmer what-if needs 4% more per degree)
  let rain = 0; for (let n = sow; n <= harvest; n++) { const v = at(series.rain, n); if (Number.isFinite(v)) rain += v; }
  const irr = Number.isFinite(ctx.irrigationMm) ? ctx.irrigationMm : 0, hold = Number.isFinite(ctx.holdMm) ? ctx.holdMm : 0, fallow = Number.isFinite(ctx.fallowBonusMm) ? Math.min(120, Math.max(0, ctx.fallowBonusMm)) : 0, need = crop.water * (1 + 0.04 * shift), ratio = (0.8 * rain + hold + irr + fallow) / need, hard = irr > 0 ? 0.45 : 0.6;
  if (Number.isFinite(ratio)) {
    if (ratio < hard) add('hit', 'dry', harvest, `A dry season (${Math.round(ratio * 100)}% of the water the crop needs)`);
    else if (ratio < 0.75 && Number.isFinite(ctx.usual?.ratio) && ctx.usual.ratio - ratio >= 0.1) add('close', 'dry', harvest, `A dry season (${Math.round(ratio * 100)}% of the water the crop needs)`);
  }
  if (Number.isFinite(crop.maxGs)) { if (rain > crop.maxGs) add('close', 'wet', harvest, `A very wet season (${Math.round(rain)} mm)`); }
  else notes.push('Very wet seasons are not judged for this crop.');
  // one line per kind of trouble in a year: its worst night (or day), and how many nights it happened on
  const causes = [];
  for (const kind of [...new Set(raw.map(c => c.kind))]) {
    const same = raw.filter(c => c.kind === kind), hits = same.filter(c => c.severity === 'hit'), pool = hits.length ? hits : same, first = pool[0];
    if (first.value == null) { causes.push({ severity: first.severity, kind, date: first.date, text: first.text }); continue; }
    const worst = pool.reduce((a, c) => (c.value < a.value ? c : a), first);
    causes.push({ severity: hits.length ? 'hit' : 'close', kind, date: worst.date, text: `${first.text} (${worst.value.toFixed(1)} °C${same.length > 1 ? `, ${same.length} nights` : ''})`, nights: same.length });
  }
  // things that come in most years here are said once by the caller, not counted: the kinds it names are left out of the verdict and kept apart
  const skip = new Set(Array.isArray(ctx.ignoreKinds) ? ctx.ignoreKinds : []), noted = causes.filter(c => skip.has(c.kind));
  causes.splice(0, causes.length, ...causes.filter(c => !skip.has(c.kind)));
  // notes that carry no verdict: heavy rain on bare ground after the harvest, and rain days that are only a first satellite estimate
  let heavyBare = 0, firstEstimate = 0;
  if (Number.isFinite(ctx.bareAfterDays) && ctx.bareAfterDays > 0) for (let n = harvest + 1; n <= harvest + ctx.bareAfterDays; n++) { const v = at(series.rain, n); if (Number.isFinite(v) && v >= HEAVY_DAY_MM) heavyBare++; }
  if (Array.isArray(series.IMERG_FRESH)) for (let n = sow; n <= harvest; n++) { const v = at(series.IMERG_FRESH, n); if (v > 0) firstEstimate++; }
  if (heavyBare) notes.push(`Heavy rain (${HEAVY_DAY_MM} mm or more) fell on bare ground on ${heavyBare} day${heavyBare === 1 ? '' : 's'} before the next sowing. It is not counted as hurt.`);
  if (firstEstimate) notes.push(`${firstEstimate} rain day${firstEstimate === 1 ? ' is' : 's are'} still a first satellite estimate.`);
  return { verdict: causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine', causes, noted, heavyBare, firstEstimate, notes, rain: Math.round(rain), ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null, hotDays };
}
// The season on every weather year of the record; years the season could not be judged in say why. Returns [{ year, verdict, causes, notes }].
export function judgeYears(season, series, crop, ctx = {}, years = []) {
  return years.map(year => ({ year, ...judgeSeason(seasonInYear(season, year), series, crop, ctx) }));
}
// The counts of a list of verdicts: only years that could be judged count in the denominator, and none of them is a guess.
export function countVerdicts(list) {
  const c = { fine: 0, close: 0, hurt: 0, nodata: 0, growing: 0 };
  for (const x of list) if (Object.hasOwn(c, x.verdict)) c[x.verdict]++;
  return { ...c, judged: c.fine + c.close + c.hurt, years: list.length };
}

// One crop of a plan on every weather year, with the usual year here worked out from the record itself (the median water ratio and hot days at flowering over the years that could be
// judged, with no what-if applied) and then used for the "10 points below the usual year" and "3 more hot days than usual" rules.
const median = list => { const v = list.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
export function judgeCrop(season, series, crop, ctx = {}, years = []) {
  const base = judgeYears(season, series, crop, { ...ctx, shiftC: 0, usual: null, ignoreKinds: [] }, years), usual = { ratio: median(base.map(x => x.ratio)), hotDays: median(base.map(x => x.hotDays)) };
  const withUsual = { ...ctx, usual: { ratio: usual.ratio ?? undefined, hotDays: usual.hotDays ?? undefined } }, first = judgeYears(season, series, crop, withUsual, years);
  // a kind of trouble found in more than half of the years that could be judged is the normal climate of the place: said once, not counted year by year
  const judged = first.filter(y => ['fine', 'close', 'hurt'].includes(y.verdict)), count = {};
  for (const y of judged) for (const k of new Set([...y.causes, ...y.noted].map(c => c.kind))) count[k] = (count[k] || 0) + 1;
  const chronic = Object.keys(count).filter(k => count[k] > judged.length / 2);
  const list = chronic.length ? judgeYears(season, series, crop, { ...withUsual, ignoreKinds: chronic }, years) : first;
  return { years: list, usual, chronic, counts: countVerdicts(list) };
}
