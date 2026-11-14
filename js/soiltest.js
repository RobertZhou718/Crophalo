// Crophalo's lab soil test: what a farmer types from a lab report, cleaned to known ranges, put into plain bands (acid, salty, low) and
// compared with what each crop takes. Nothing here is used unless a soil test was typed in; a crop with no published limit is never ruled out.
// Pure: no page, no storage, no network. The form that fills it is js/soiltestui.js.
// Checked by scripts/test_soil.mjs (the ranges, the strings, the parts, every band edge, the vetoes before the cautions, a crop with no limit).
import { TEST_PH, TEST_SAL, cropName } from './crops.js';

export const FIELDS = ['ph', 'om', 'n', 'p', 'k', 'ec', 'clay', 'sand', 'silt'];
export const RANGES = { ph: [3, 10], om: [0, 60], ec: [0, 60], n: [0, 5000], p: [0, 5000], k: [0, 5000], clay: [0, 100], sand: [0, 100], silt: [0, 100] };
export const METHODS = ['olsen', 'bray', 'mehlich3', 'unsure'], NP_UNITS = ['mgkg', 'ppm'], EC_UNITS = ['dsm', 'mscm'];   // mg/kg and ppm are the same number; so are dS/m and mS/cm: the choice only names what the lab wrote
export const FIRST_YEAR = 1990, FIRST_DATE = `${FIRST_YEAR}-01-01`, PARTS_TOLERANCE = 5;   // a lab test from 1990 on
const DECIMAL = /^\d{1,6}(?:\.\d{1,6})?$/;   // plain digits only: no "0x10", no "1e3", no sign, no spaces inside

// A typed value as a number, or null. Only text or a plain finite number counts; two decimals are kept.
export function readNumber(raw) {
  const text = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? raw.trim().replace(',', '.') : '';
  return DECIMAL.test(text) ? Math.round(Number(text) * 100) / 100 : null;
}
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const validDay = text => /^\d{4}-\d{2}-\d{2}$/.test(text) && iso(Date.parse(text + 'T00:00:00Z')) === text;
const tomorrow = now => iso(now + 864e5);

// Why a typed value cannot be used, in plain words; '' when it can (or when nothing was typed).
export const FIELD_LABEL = { ph: 'pH', om: 'Organic matter', n: 'Nitrate', p: 'Phosphorus', k: 'Potassium', ec: 'Salt', clay: 'Clay', sand: 'Sand', silt: 'Silt' };
export function fieldProblem(field, raw) {
  if (raw === '' || raw == null) return '';
  const v = readNumber(raw), [lo, hi] = RANGES[field];
  if (v === null) return `${FIELD_LABEL[field]} needs a plain number, like ${field === 'ph' ? '6.4' : '3.2'}.`;
  return v < lo || v > hi ? `${FIELD_LABEL[field]} is expected between ${lo} and ${hi}. Check the number on your report.` : '';
}
export function partsProblem(parts) {
  const given = ['clay', 'sand', 'silt'].map(k => readNumber(parts[k])).filter(v => v !== null);
  const sum = given.reduce((a, b) => a + b, 0);
  if (given.length === 3 && Math.abs(sum - 100) > PARTS_TOLERANCE) return `The three parts add up to ${Math.round(sum * 100) / 100}. They should add up to about 100, so they are left out until they do.`;
  if (given.length === 2 && sum > 100 + PARTS_TOLERANCE) return `Two parts already add up to ${Math.round(sum * 100) / 100}, more than 100. They are left out until they fit.`;
  return '';
}

// Everything typed, cleaned: { ...numbers, method, units, date, share } or null when nothing usable was typed.
export function cleanSoilTest(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const field of FIELDS) { const v = readNumber(raw[field]); if (v !== null && v >= RANGES[field][0] && v <= RANGES[field][1]) out[field] = v; }
  if (partsProblem(out)) for (const k of ['clay', 'sand', 'silt']) delete out[k];
  if (typeof raw.date === 'string' && validDay(raw.date) && raw.date >= FIRST_DATE && raw.date <= tomorrow(now)) out.date = raw.date;
  if (!FIELDS.some(f => f in out)) return null;
  out.method = METHODS.includes(raw.method) ? raw.method : 'unsure';
  out.units = { np: NP_UNITS.includes(raw.units?.np) ? raw.units.np : 'mgkg', ec: EC_UNITS.includes(raw.units?.ec) ? raw.units.ec : 'dsm' };
  out.share = raw.share === true;
  return out;
}

// ---- bands, in the words a farmer reads
export const phBand = ph => ph < 5 ? 'very acid' : ph < 6 ? 'acid' : ph <= 7.5 ? 'near neutral' : ph <= 8.5 ? 'alkaline' : 'very alkaline';
export const ecBand = ec => ec < 2 ? 'not salty' : ec < 4 ? 'slightly salty' : ec < 8 ? 'moderately salty' : ec <= 16 ? 'strongly salty' : 'very strongly salty';
export const omBand = om => om < 2 ? 'low' : om <= 4 ? 'med' : 'high';
const CUTS = { olsen: [10, 20], bray: [15, 30], mehlich3: [20, 40] };
export const pBand = (p, method) => CUTS[method] ? (p < CUTS[method][0] ? 'low' : p < CUTS[method][1] ? 'medium' : 'high') : null;   // with no method named, no band is guessed
export const kBand = k => k < 100 ? 'low' : k < 200 ? 'medium' : 'high';   // nitrate gets no band: it is only a snapshot of the day the sample was taken

// A line for each typed value that has a band: what the report shows under "My soil test".
export function describe(test) {
  if (!test) return [];
  const lines = [];
  if ('ph' in test) lines.push(`pH ${test.ph} (${phBand(test.ph)})`);
  if ('om' in test) lines.push(`Organic matter ${test.om}% (${omBand(test.om)})`);
  if ('n' in test) lines.push(`Nitrate ${test.n} mg/kg (a snapshot of the day it was sampled)`);
  if ('p' in test) { const b = pBand(test.p, test.method); lines.push(`Phosphorus ${test.p} mg/kg${b ? ` (${b})` : ''}`); }
  if ('k' in test) lines.push(`Potassium ${test.k} mg/kg (${kBand(test.k)})`);
  if ('ec' in test) lines.push(`Salt ${test.ec} dS/m (${ecBand(test.ec)})`);
  return lines;
}

// ---- soil texture from the three parts: four classes, as the four feel tiles; two parts are enough
export function textureOf(test) {
  let { clay, sand, silt } = test ?? {};
  const known = [clay, sand, silt].filter(v => v !== undefined).length;
  if (known < 2) return null;
  if (known === 2) { const rest = Math.max(0, 100 - [clay, sand, silt].filter(v => v !== undefined).reduce((a, b) => a + b, 0)); if (clay === undefined) clay = rest; else if (sand === undefined) sand = rest; else silt = rest; }
  return clay >= 35 ? 'clay' : silt >= 50 && clay < 27 ? 'silt' : sand >= 70 && clay < 15 ? 'sand' : 'loam';
}
// The soil with only the typed properties replaced. Texture and organic matter must both be typed to stand alone as the farmer's own soil.
export function withSoilTest(soil, test) {
  const base = { mode: soil?.mode ?? null, texture: soil?.texture ?? null, om: soil?.om ?? null, omPct: soil?.omPct ?? null }, from = [];
  if (!test) return { soil: base, from };
  const texture = textureOf(test);
  if (texture) { base.texture = texture; from.push('texture'); }
  if ('om' in test) { base.om = omBand(test.om); base.omPct = Math.min(test.om, 30); from.push('om'); }   // the state keeps organic matter to 30%; a lab value above that is still shown as typed
  if (base.texture && base.om && from.length && (from.includes('texture') && from.includes('om'))) base.mode = 'manual';
  return { soil: base, from };
}

// ---- what a crop takes
const lower = id => cropName(id, true).toLowerCase();
const rangeWords = (a, b) => `${a}–${b}`;
// One crop against the test: { veto, notes }. Every hard limit runs before any caution is returned. null when no soil test was typed.
export function soilTestCheck(test, id) {
  if (!test) return null;
  const vetoes = [], notes = [], name = lower(id), phr = TEST_PH[id], sal = TEST_SAL[id];
  if (phr && 'ph' in test) {
    const [bestLow, bestHigh, absLow, absHigh] = phr;
    if (test.ph < absLow) vetoes.push(`Your soil test pH ${test.ph} is below what ${name} takes: they do best at pH ${rangeWords(bestLow, bestHigh)} and stop growing well under ${absLow}.`);
    else if (test.ph > absHigh) vetoes.push(`Your soil test pH ${test.ph} is above what ${name} takes: they do best at pH ${rangeWords(bestLow, bestHigh)} and stop growing well over ${absHigh}.`);
    else if (test.ph < bestLow || test.ph > bestHigh) notes.push(`Your soil test pH ${test.ph} is outside the best range for ${name} (pH ${rangeWords(bestLow, bestHigh)}). It can still grow here.`);
  }
  if (sal && 'ec' in test) {
    const [threshold, slope] = sal, half = threshold + 50 / slope;
    if (test.ec >= half) vetoes.push(`Your soil test salt level (${test.ec} dS/m) is too high for ${name}: its yield falls by half at about ${Math.round(half * 10) / 10} dS/m.`);
    else if (test.ec > threshold) notes.push(`Your soil test salt level (${test.ec} dS/m) is above what ${name} takes without loss (${threshold} dS/m). It may lose about ${Math.round((test.ec - threshold) * slope)}% of its yield.`);
  }
  return { veto: vetoes[0] ?? null, notes };
}
// A list of crops against the test: { [id]: { veto, notes } }; empty with no test.
export function soilTestChecks(test, ids) { const out = {}; if (test) for (const id of ids) out[id] = soilTestCheck(test, id); return out; }
