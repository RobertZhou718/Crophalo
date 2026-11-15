// Crophalo's one state object: what the farmer has told the app about one field, and the check that every saved or shared copy of it
// must pass before it is used. Nothing from a link or from storage is trusted: a value is rebuilt from known parts only.
// Pure: no page, no storage, no network.
// Checked by scripts/test_state.mjs (defaults, every range, a hostile link, the round trip through a link).
import { own } from './words.js';
import { isCrop, isGarden, isPreset } from './crops.js';
import { cleanGoals, cleanLimits, newLimits } from './inputs.js';

export const STATE_VERSION = 1;
export const IRRIGATION = ['none', 'limited', 'full'], TILLAGE = ['conventional', 'reduced', 'notill'], SOIL_MODES = ['auto', 'manual', 'assumed', 'map'];   // map: a soil map's texture that a demo field comes with
export const TEXTURES = ['sand', 'loam', 'silt', 'clay'], ORGANIC = ['low', 'med', 'high'];   // what the four feel tiles and three colour swatches stand for
export const PRIORITIES = ['water', 'soil', 'erosion', 'income', 'weather'];
export const PRIORITY_SETS = {   // the weights for Water fit, Soil health, Soil wash-off, Income, Weather safety
  balanced: [3, 3, 3, 3, 3], moisture: [5, 3, 2, 2, 4], soil: [2, 5, 4, 2, 3], erosion: [2, 4, 5, 2, 3], income: [2, 2, 2, 5, 3], weather: [4, 3, 3, 2, 5],
};
export const MAX_CUSTOM = 12, MAX_AVOID = 60, LABEL_MAX = 200, NAME_MAX = 120, PRESET_MAX = 40;

// A new state: nothing is chosen that the farmer did not choose. Soil and rotation start empty; only the farm habits and the priorities have defaults.
// goals (what else matters: 'forage', 'nitrogen', 'market') start empty and limits start with no limit (js/inputs.js).
export function newState() {
  return {
    loc: null, area: null, name: '',
    rotation: { preset: null, custom: [], garden: null, second: {} },
    farm: { irrigation: null, tillage: 'reduced', livestock: false, coverOK: true, labor: false },
    soil: { mode: null, texture: null, om: null, omPct: null },
    soilTest: null, avoid: [], prio: [...PRIORITY_SETS.balanced], prioPreset: 'balanced', goals: [], limits: newLimits(),
    sc: { rainPct: 0, tempC: 0 }, touched: { rotation: false, farm: false }, timing: {},
  };
}

// ---- small cleaners
const finite = v => typeof v === 'number' && Number.isFinite(v);
const num = v => typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
const text = (v, most) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, most) : '';
const within = (v, lo, hi) => finite(num(v)) && num(v) >= lo && num(v) <= hi ? num(v) : null;
const oneOf = (list, v, fallback = null) => typeof v === 'string' && list.includes(v) ? v : fallback;
const flag = (v, fallback) => typeof v === 'boolean' ? v : fallback;
const round4 = v => Math.round(v * 1e4) / 1e4;
const round5 = v => Math.round(v * 1e5) / 1e5;   // an outline corner: about 1 m, so a corner dragged at a close zoom lands where it was dropped (the pin keeps 4)
const ids = (list, keep, most) => [...new Set(Array.isArray(list) ? list.filter(id => typeof id === 'string' && own(Object.fromEntries([[id, 1]]), id) && keep(id)) : [])].slice(0, most);

// The place: finite latitude and longitude on Earth, four decimals. The only hard refusal: null means "bad place".
export function cleanLoc(raw) {
  const lat = within(raw?.lat, -90, 90), lon = within(raw?.lon, -180, 180);
  if (lat === null || lon === null) return null;
  const cc = typeof raw.cc === 'string' && /^[A-Za-z]{2}$/.test(raw.cc) ? raw.cc.toUpperCase() : '';
  const ok = raw.fieldOk, fieldOk = ok && typeof ok === 'object' && within(ok.lat, -90, 90) === round4(lat) && within(ok.lon, -180, 180) === round4(lon) && Number.isInteger(ok.code) && ok.code >= 0 && ok.code <= 255
    ? { lat: round4(lat), lon: round4(lon), code: ok.code, word: text(ok.word, 40) } : null;   // the farmer's own word that a pin the crop map calls forest or the like is a field (js/nearby.js fieldWord); gone when the pin moves
  return { lat: round4(lat), lon: round4(lon), label: text(raw.label, LABEL_MAX), cc, ...(fieldOk ? { fieldOk } : {}) };
}

// ---- the field outline: at least three real corners (kept to 5 decimals), an area above zero, a believable slope, and the pin in it (as near as its 4 decimals tell)
const inside = (lat, lon, pts) => {   // ray casting
  let yes = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ay, ax] = pts[i], [by, bx] = pts[j];
    if ((ay > lat) !== (by > lat) && lon < (bx - ax) * (lat - ay) / (by - ay) + ax) yes = !yes;
  }
  return yes;
};
// The pin is kept to 4 decimals, so it stands for a square about 11 m across: it holds when that square meets the outline (its middle inside, or an edge
// of the outline through the square). A garden smaller than the square still keeps its pin; a pin further off is still refused.
const PIN_HALF = 5e-5 + 1e-9;
function edgeInSquare([y1, x1], [y2, x2], cy, cx) {   // the edge clipped to the square round the pin (Liang-Barsky): true when any of it is left
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - (cx - PIN_HALF)], [dx, cx + PIN_HALF - x1], [-dy, y1 - (cy - PIN_HALF)], [dy, cy + PIN_HALF - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
const holdsPin = (lat, lon, pts) => inside(lat, lon, pts) || pts.some((a, i) => edgeInSquare(a, pts[(i + 1) % pts.length], lat, lon));
const shoelace = pts => Math.abs(pts.reduce((sum, [y, x], i) => { const [y2, x2] = pts[(i + 1) % pts.length]; return sum + (x * y2 - x2 * y); }, 0)) / 2;
export function cleanArea(raw, loc) {
  if (!loc || !raw || !Array.isArray(raw.pts) || raw.pts.length < 3 || raw.pts.length > 2000) return null;
  const pts = [];
  for (const p of raw.pts) {
    const lat = within(p?.[0], -90, 90), lon = within(p?.[1], -180, 180);
    if (lat === null || lon === null) return null;
    pts.push([round5(lat), round5(lon)]);
  }
  if (!(shoelace(pts) > 0) || !holdsPin(loc.lat, loc.lon, pts)) return null;
  const ha = within(raw.ha, 0, 1e6), slope = within(raw.slope, 0, 200);
  return { pts, ha: ha === null ? null : ha, slope: slope === null ? null : slope };
}

// ---- the parts that sit on the crop tables
function cleanSecond(raw) {   // a second crop in the same year, by slot of the cycle: { '0': 'oat' }
  const out = {};
  if (raw && typeof raw === 'object') for (const key of Object.keys(raw).slice(0, 8)) if (/^[0-3]$/.test(key) && typeof raw[key] === 'string' && isCrop(raw[key])) out[key] = raw[key];
  return out;
}
function cleanRotation(raw) {
  const given = raw && typeof raw === 'object' ? raw : {}, preset = typeof given.preset === 'string' ? given.preset.slice(0, PRESET_MAX) : null;
  const garden = typeof given.garden === 'string' && isGarden(given.garden) ? given.garden : null;
  return {
    preset: preset && (preset === 'custom' || isPreset(preset) || isGarden(preset)) ? preset : null,
    custom: ids(given.custom, isCrop, MAX_CUSTOM), garden, second: cleanSecond(given.second),
  };
}
function cleanSoilTest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {}, ranges = { ph: [3, 10], om: [0, 30], n: [0, 10000], p: [0, 10000], k: [0, 10000], ec: [0, 50], clay: [0, 100], sand: [0, 100], silt: [0, 100] };
  for (const [key, [lo, hi]] of Object.entries(ranges)) { const v = within(raw[key], lo, hi); if (v !== null) out[key] = v; }
  if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) out.date = raw.date;
  return Object.keys(out).length ? out : null;
}

// Everything rebuilt from known values. Returns { ok: true, state } or { ok: false, reason }. A hostile or broken input never throws.
export function checkSerialized(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'bad place' };
  const loc = cleanLoc(raw.loc);
  if (!loc) return { ok: false, reason: 'bad place' };
  const base = newState(), farm = raw.farm && typeof raw.farm === 'object' ? raw.farm : {}, soil = raw.soil && typeof raw.soil === 'object' ? raw.soil : {};
  const sc = raw.sc && typeof raw.sc === 'object' ? raw.sc : {};
  const rain = within(sc.rainPct, -40, 30), temp = within(sc.tempC, 0, 4);
  const prio = Array.isArray(raw.prio) && raw.prio.length === PRIORITIES.length && raw.prio.every(v => Number.isInteger(v) && v >= 0 && v <= 5) ? [...raw.prio] : base.prio;
  const livestock = flag(farm.livestock, false), goals = cleanGoals(raw.goals, livestock);   // an old state's "I keep animals" is the goal "Feed for my animals"
  const state = {
    loc, area: cleanArea(raw.area, loc), name: text(raw.name, NAME_MAX),
    rotation: cleanRotation(raw.rotation),
    farm: { irrigation: oneOf(IRRIGATION, farm.irrigation), tillage: oneOf(TILLAGE, farm.tillage, base.farm.tillage), livestock: livestock || goals.includes('forage'), coverOK: flag(farm.coverOK, true), labor: flag(farm.labor, false) },
    soil: { mode: oneOf(SOIL_MODES, soil.mode), texture: oneOf(TEXTURES, soil.texture), om: oneOf(ORGANIC, soil.om), omPct: within(soil.omPct, 0, 30) },
    soilTest: cleanSoilTest(raw.soilTest), avoid: ids(raw.avoid, isCrop, MAX_AVOID), prio,
    prioPreset: own(PRIORITY_SETS, raw.prioPreset) ? raw.prioPreset : null, goals, limits: cleanLimits(raw.limits),
    sc: { rainPct: rain !== null && rain % 5 === 0 ? rain : 0, tempC: temp !== null && temp * 2 === Math.round(temp * 2) ? temp : 0 },
    touched: { rotation: false, farm: false }, timing: {},   // timing is rebuilt by the module that owns it; here it can only be empty
  };
  return { ok: true, state };
}

// ---- the share link: the state as it travels after "#s=", base64url of JSON
const toUrl = b64 => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), fromUrl = s => s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4);
export function serialize(state, { withSoilTest = false } = {}) {
  const { loc, area, name, rotation, farm, soil, avoid, prio, prioPreset, goals, limits, sc, timing } = state;
  const body = { v: STATE_VERSION, loc, area, name, rotation, farm, soil, avoid, prio, prioPreset, goals, limits, sc, timing, ...(withSoilTest && state.soilTest ? { soilTest: state.soilTest } : {}) };
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return toUrl(btoa(binary));
}
// A link's hash ("#s=…") back into a checked state; { ok: false } when it cannot be read.
export function fromLink(hash) {
  const m = /^#s=([A-Za-z0-9_-]{1,200000})$/.exec(String(hash ?? ''));
  if (!m) return { ok: false, reason: 'not a link' };
  try {
    const binary = atob(fromUrl(m[1])), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (parsed?.v !== STATE_VERSION) return { ok: false, reason: 'unknown version' };
    const checked = checkSerialized(parsed);
    if (checked.ok && !checked.state.name) checked.state.name = 'Shared field';
    return checked;
  } catch { return { ok: false, reason: 'unreadable' }; }
}
