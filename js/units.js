// Crophalo's units: rain, temperature, area and distance, and yield, each chosen on its own; the country gives the default (inches, °F, acres and bushels only for the USA, Liberia and Myanmar).
// Only a dimension the farmer chose is kept. Pure: cleanUnits(), unitsFor(), and the formatters. readUnits() and saveUnits() use the browser's storage, every access in a try.
// Checked by scripts/test_pages.mjs (the sample lines of the Settings page, never "−0 °C", bushel weights, rounding to 5, a hostile stored value).
export const KEY = 'crophalo.units.v1';
export const DIMS = Object.freeze({ rain: ['mm', 'in'], temp: ['C', 'F'], area: ['metric', 'imperial'], yield: ['t', 'bu'] });
export const IMPERIAL_BY_DEFAULT = Object.freeze(['US', 'LR', 'MM']);
export const METRIC = Object.freeze({ rain: 'mm', temp: 'C', area: 'metric', yield: 't' }), IMPERIAL = Object.freeze({ rain: 'in', temp: 'F', area: 'imperial', yield: 'bu' });
export const defaultUnits = cc => ({ ...(IMPERIAL_BY_DEFAULT.includes(String(cc ?? '').toUpperCase()) ? IMPERIAL : METRIC) });
// A stored value rebuilt from known choices only.
export function cleanUnits(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [dim, list] of Object.entries(DIMS)) if (Object.hasOwn(raw, dim) && list.includes(raw[dim])) out[dim] = raw[dim];
  return out;
}
export const unitsFor = (chosen, cc) => ({ ...defaultUnits(cc), ...cleanUnits(chosen) });
export function readUnits(storage = globalThis.localStorage) { try { return cleanUnits(JSON.parse(storage.getItem(KEY))); } catch { return {}; } }
export function saveUnits(chosen, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(cleanUnits(chosen))); return true; } catch { return false; } }

// ---- formatters
const MM_PER_IN = 25.4, FT_PER_M = 3.280839895, MPH_PER_KMH = 0.621371192, ACRES_PER_HA = 2.4710538147, LB_PER_KG = 2.2046226218, SHORT_TON_PER_T = 1.10231131092;
export const BUSHEL_LB = Object.freeze({ corn: 56, sorghum: 56, soy: 60, wheat: 60, swheat: 60, durum: 60, barley: 48 });
const fin = v => typeof v === 'number' && Number.isFinite(v);
const plain = (v, digits) => { const t = Math.abs(v).toFixed(digits); return (v < 0 && /[1-9]/.test(t) ? '−' : '') + t.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };   // never "−0"
export const fmtRain = (mm, u) => !fin(mm) ? '' : u.rain === 'in' ? `${plain(mm / MM_PER_IN, mm / MM_PER_IN < 10 ? 1 : 0).replace(/\.0$/, '')} in` : `${plain(mm, 0)} mm`;
export const fmtTemp = (c, u) => !fin(c) ? '' : u.temp === 'F' ? `${plain(c * 9 / 5 + 32, 0)} °F` : `${plain(c, 0)} °C`;
export const fmtTempChange = (dc, u) => !fin(dc) ? '' : u.temp === 'F' ? `+${plain(dc * 1.8, 1)} °F` : `+${plain(dc, 1).replace(/\.0$/, '')} °C`;   // a change of temperature has no 32 to add
export const fmtArea = (ha, u) => !fin(ha) ? '' : u.area === 'imperial' ? `${plain(ha * ACRES_PER_HA, 1)} acres` : `${plain(ha, 1)} ha`;
export const fmtLength = (m, u) => !fin(m) ? '' : u.area === 'imperial' ? `${plain(m * FT_PER_M, 0)} ft` : `${plain(m, 0)} m`;
export const fmtSpeed = (kmh, u) => !fin(kmh) ? '' : u.area === 'imperial' ? `${plain(kmh * MPH_PER_KMH, 0)} mph` : `${plain(kmh, 0)} km/h`;
const nearest5 = v => Math.round(v / 5) * 5;
// Yield in t/ha, or in bushels per acre for the crops that are sold by the bushel (rounded to 5), else short tons per acre.
export function fmtYield(tPerHa, u, crop = '') {
  if (!fin(tPerHa)) return '';
  if (u.yield !== 'bu') return `${plain(tPerHa, 1)} t/ha`;
  const lb = BUSHEL_LB[crop];
  if (lb) return `${plain(nearest5(tPerHa * 1000 * LB_PER_KG / lb / ACRES_PER_HA), 0)} bushels/acre`;
  return `${plain(tPerHa * SHORT_TON_PER_T / ACRES_PER_HA, 2)} tons/acre`;
}
// "What it looks like": the six lines of the Settings page for a set of units.
export const sampleLines = (u, money = 'US$100') => [['Rain', fmtRain(25, u)], ['Temperature', fmtTemp(20, u)], ['Money', money], ['A field', `${fmtArea(10, u)} at ${fmtLength(300, u)}`], ['Wind', fmtSpeed(40, u)], ['Yield of corn', fmtYield(10, u, 'corn')]];
