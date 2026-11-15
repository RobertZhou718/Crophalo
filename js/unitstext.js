// Crophalo's display-time units for sentences: the report, weather, calendar and field texts carry metric figures inside their words ("35 °C or more", "20 mm", "28 km", "40,802 ha"); this module turns them into the farmer's units (js/units.js has the choice and the formatters) when the text reaches the screen.
// Pure: no page, no storage, no network. One text in, one text out. A figure is changed only when a metric unit stands right after it; a year, a count, a score, a date or a percentage is never touched. A temperature DIFFERENCE ("2 °C colder", "moved by 1.2 °C") is multiplied by 1.8 and has no 32 added;
// degree days ("1,828 degree days" becomes "3,290 °F degree days") are multiplied by 1.8 and marked °F, so a second run finds nothing to change; a ratio ("89 of every 100 mm") keeps its numbers (a ratio has no unit) and changes only the word.
// Checked by scripts/test_unitstext.mjs. Exports: localiseText(text, units, opts), localiseDetailed(text, units, opts), localiseDeep(value, units), metricLeft(text).
import { BUSHEL_LB } from './units.js';

const MM_PER_IN = 25.4, FT_PER_M = 3.280839895, MI_PER_KM = 0.621371192, AC_PER_HA = 2.4710538147, LB_PER_KG = 2.2046226218, SHORT_TON_PER_T = 1.10231131092, LB_PER_KG_HA = 0.89217913, MPH_PER_MS = 2.2369362921;
const NUM = '[−-]?\\d[\\d,]*(?:\\.\\d+)?';
const num = s => Number(String(s).replace(/,/g, '').replace('−', '-'));
const fin = v => typeof v === 'number' && Number.isFinite(v);
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// a figure written the way the units module writes it: thousands commas, a real minus sign, never "−0", a trailing ".0" dropped
const plain = (v, digits = 0) => { const t = Math.abs(v).toFixed(digits), [i, d] = t.split('.'), body = group(i) + (d && /[1-9]/.test(d) ? '.' + d.replace(/0+$/, '') : ''); return (v < 0 && /[1-9]/.test(t) ? '−' : '') + body; };
const pick = (v, small, big) => (Math.abs(v) < 0.1 ? 2 : Math.abs(v) < 10 ? small : big);
const nearest5 = v => Math.round(v / 5) * 5;
const CROPS = [['soybean', 'soy'], ['corn', 'corn'], ['maize', 'corn'], ['winter wheat', 'wheat'], ['spring wheat', 'swheat'], ['wheat', 'wheat'], ['barley', 'barley'], ['sorghum', 'sorghum']];
const cropIn = text => { const t = text.toLowerCase(), hits = CROPS.filter(([w]) => t.includes(w)).map(([, id]) => id); return new Set(hits).size === 1 ? hits[0] : ''; };
const DIFF_AFTER = /^\s*(colder|hotter|warmer|cooler|higher|lower)\b/i, DIFF_BEFORE = /(\bby\s|±\s?|\+\s?)$/i;
const ALL = Object.freeze({ rain: 'in', temp: 'F', area: 'imperial', yield: 'bu' });

// The text in the farmer's units. units = { rain: 'mm'|'in', temp: 'C'|'F', area: 'metric'|'imperial', yield: 't'|'bu' } (js/units.js). opts.crop: a crop id for t/ha.
export function localiseDetailed(text, units = ALL, opts = {}) {
  const changes = []; if (typeof text !== 'string' || !text) return { text: typeof text === 'string' ? text : '', changes };
  const u = units || ALL, note = (kind, from, to) => { changes.push({ kind, from, to }); return to; };
  let out = text;
  const metricTemp = u.temp === 'F', metricRain = u.rain === 'in', imperial = u.area === 'imperial', bushels = u.yield === 'bu';
  if (metricTemp) {
    // degree days first (the figure is in °C-days): ×1.8
    out = out.replace(new RegExp(`(${NUM})(\\s+)((?:growing |corn |cooling |heating )?degree[- ]days?)`, 'gi'), (m, n, sp, w) => fin(num(n)) ? note('degreedays', m, `${plain(num(n) * 1.8, 0)}${sp}°F${sp}${w}`) : m);
    out = out.replace(new RegExp(`(${NUM})(\\s?)°C([- ]days?)`, 'gi'), (m, n, sp, d) => note('degreedays', m, `${plain(num(n) * 1.8, 0)}${sp}°F${d}`));
    // then every temperature: a difference (a cue just before or after) has no 32 added, an absolute one has
    out = out.replace(new RegExp(`(${NUM})(\\s?)°C(?![A-Za-z-])`, 'g'), (m, n, sp, off) => {
      const before = out.slice(Math.max(0, off - 6), off), after = out.slice(off + m.length, off + m.length + 20), v = num(n); if (!fin(v)) return m;
      const diff = DIFF_AFTER.test(after) || DIFF_BEFORE.test(before);
      return note(diff ? 'tempdiff' : 'temp', m, diff ? `${plain(v * 1.8, Math.abs(v * 1.8) < 10 ? 1 : 0)}${sp}°F` : `${plain(v * 9 / 5 + 32, 0)}${sp}°F`);
    });
  }
  if (metricRain) {
    out = out.replace(new RegExp(`(\\d+)(\\s+of every\\s+)(\\d+)\\s?mm\\b`, 'g'), (m, a, mid, b) => note('ratio', m, `${a}${mid}${b} inches`));   // a ratio keeps its numbers; only the unit word changes
    out = out.replace(new RegExp(`(${NUM})(?:(\\s*(?:to|–|-)\\s*)(${NUM}))?\\s?mm\\b(?![\\w])(/day)?`, 'g'), (m, a, join, b, perDay) => {
      const x = num(a) / MM_PER_IN, y = b === undefined ? undefined : num(b) / MM_PER_IN; if (!fin(x) || (y !== undefined && !fin(y))) return m;
      const w = y === undefined ? plain(x, pick(x, 1, 0)) : `${plain(x, pick(x, 1, 0))}${join}${plain(y, pick(y, 1, 0))}`; return note('rain', m, `${w} in${perDay ?? ''}`);
    });
  }
  if (imperial) {
    out = out.replace(new RegExp(`(${NUM})\\s?km/h\\b`, 'g'), (m, n) => note('speed', m, `${plain(num(n) * MI_PER_KM, 0)} mph`));
    out = out.replace(new RegExp(`(${NUM})\\s?m/s\\b`, 'g'), (m, n) => note('speed', m, `${plain(num(n) * MPH_PER_MS, 0)} mph`));
    out = out.replace(new RegExp(`(${NUM})\\s?km\\b`, 'g'), (m, n) => { const v = num(n) * MI_PER_KM; return note('distance', m, `${plain(v, v < 10 ? 1 : 0)} ${plain(v, v < 10 ? 1 : 0) === '1' ? 'mile' : 'miles'}`); });
    out = out.replace(new RegExp(`(${NUM})\\s?ha\\b`, 'g'), (m, n) => { const v = num(n) * AC_PER_HA; const w = plain(v, Math.abs(v) < 100 ? 1 : 0); return note('area', m, `${w} ${w === '1' ? 'acre' : 'acres'}`); });
    out = out.replace(new RegExp(`(${NUM})\\s?m\\b(?![\\w/²])`, 'g'), (m, n) => note('length', m, `${plain(num(n) * FT_PER_M, 0)} ft`));
    out = out.replace(new RegExp(`(${NUM})\\s?kg/ha\\b`, 'g'), (m, n) => note('rate', m, `${plain(num(n) * LB_PER_KG_HA, 0)} lb/acre`));
  }
  if (bushels) out = out.replace(new RegExp(`(${NUM})\\s?t/ha\\b`, 'g'), (m, n) => { const t = num(n), id = opts.crop || cropIn(out), lb = BUSHEL_LB[id]; if (!fin(t)) return m;
    return note('yield', m, lb ? `${plain(nearest5(t * 1000 * LB_PER_KG / lb / AC_PER_HA), 0)} bushels/acre` : `${plain(t * SHORT_TON_PER_T / AC_PER_HA, 2)} tons/acre`); });
  return { text: out, changes };
}
export const localiseText = (text, units, opts) => localiseDetailed(text, units, opts).text;

// Every string inside a value (an answer object, a list of lines), copied; numbers, keys and non-text stay as they are.
export function localiseDeep(value, units, opts = {}, depth = 0) {
  if (typeof value === 'string') return localiseText(value, units, opts);
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => localiseDeep(v, units, opts, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localiseDeep(v, units, opts, depth + 1)]));
}

// The metric units still standing in a text, for the units the farmer chose: [] when none is left.
export function metricLeft(text, units = ALL) {
  const u = units || ALL, left = [], add = re => { for (const m of String(text ?? '').matchAll(re)) left.push(m[0].trim()); };
  if (u.temp === 'F') add(new RegExp(`${NUM}\\s?°C`, 'g'));
  if (u.rain === 'in') add(new RegExp(`${NUM}\\s?mm\\b`, 'g'));
  if (u.area === 'imperial') { add(new RegExp(`${NUM}\\s?(?:ha|km|km/h|m/s)\\b`, 'g')); add(new RegExp(`${NUM}\\s?m\\b(?![\\w/²])`, 'g')); add(new RegExp(`${NUM}\\s?kg/ha\\b`, 'g')); }
  if (u.yield === 'bu') add(new RegExp(`${NUM}\\s?t/ha\\b`, 'g'));
  return left;
}
