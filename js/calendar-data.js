// Crophalo's Calendar tab, the figures: a normal year of rain, frost and hot days from the climate record, and the ground month by month under each plan (what grows,
// what is left as residue, what is covered, what is bare), with the winter-wheat sowing window and the late-harvest squeeze worked out from the plan's own dates.
// Pure: no page, no storage, no network. A date the plan does not carry is never made up; a month the plan says nothing about is left blank.
// Checked by scripts/test_calendar.mjs (the ground state on a date, the month cells, the window and the squeeze, a missing climate record, a plan with no dates).
/*
 *
 * Plan = { id, name, kind: 'current' | 'proposed', seasons: [{ year, crop, sow, harvest, after: 'residue' | 'cover' | 'bare', residueUntil, window: { earliest, latest } | null }] }  (dates 'YYYY-MM-DD')
 */
import { cropName } from './crops.js';
import { THR } from './climate.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'));
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = d => Date.parse(d + 'T00:00:00Z'), DAY = 864e5, pad = n => String(n).padStart(2, '0');
export const daysBetween = (a, b) => Math.round((day(b) - day(a)) / DAY);
export const dayWords = d => isDay(d) ? `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}` : '';
export const dayYear = d => isDay(d) ? `${dayWords(d)} ${d.slice(0, 4)}` : '';
const shortCrop = id => { try { return cropName(id, true) || String(id); } catch { return String(id); } };
const seasonsOf = plan => (Array.isArray(plan?.seasons) ? plan.seasons : []).filter(s => isDay(s?.sow) && isDay(s?.harvest) && s.harvest >= s.sow).sort((a, b) => a.sow < b.sow ? -1 : 1);

// ---- what covers the ground on a date, from the plan's seasons alone: { state: 'crop' | 'cover' | 'residue' | 'bare' | null, crop }. null = the plan says nothing yet.
export function stateOn(plan, date) {
  const list = seasonsOf(plan);
  if (!isDay(date) || !list.length) return { state: null, crop: null };
  const growing = list.find(s => s.sow <= date && date <= s.harvest);
  if (growing) return { state: 'crop', crop: growing.crop };
  const prev = [...list].reverse().find(s => s.harvest < date);
  if (!prev) return { state: null, crop: null };
  const after = ['residue', 'cover', 'bare'].includes(prev.after) ? prev.after : null;
  if (!after) return { state: null, crop: null };
  if (after === 'residue' && isDay(prev.residueUntil) && date > prev.residueUntil) return { state: 'bare', crop: null };   // residue breaks down: after its date the soil is bare
  return { state: after, crop: null };
}
export const STATE_WORDS = Object.freeze({ crop: 'a crop growing', cover: 'living cover', residue: 'crop residue (thin cover)', bare: 'bare soil' });

// ---- the months of each year of a plan: 12 equal cells per year, each with the state most of the month's sample days are in
function monthCell(plan, year, m) {
  const votes = {};
  for (const d of [1, 8, 15, 22]) { const s = stateOn(plan, `${year}-${pad(m + 1)}-${pad(d)}`); if (s.state) { const k = s.state + '|' + (s.crop ?? ''); votes[k] = (votes[k] ?? 0) + 1; } }
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (!top) return { month: m, state: null, crop: null };
  const [state, crop] = top[0].split('|');
  return { month: m, state, crop: crop || null };
}
export function planYears(plan) {
  const list = seasonsOf(plan);
  if (!list.length) return [];
  const first = +list[0].sow.slice(0, 4), last = +list.at(-1).harvest.slice(0, 4), out = [];
  for (let y = first; y <= last; y++) {
    const cells = Array.from({ length: 12 }, (_, m) => monthCell(plan, y, m));
    for (const s of list) { if (+s.sow.slice(0, 4) === y) { const c = cells[+s.sow.slice(5, 7) - 1]; c.starts = shortCrop(s.crop); c.sowDay = s.sow; } if (+s.harvest.slice(0, 4) === y) cells[+s.harvest.slice(5, 7) - 1].harvestDay = s.harvest; }
    for (const s of list) if (s.window && isDay(s.window.earliest) && isDay(s.window.latest)) for (let m = 0; m < 12; m++) {
      const a = `${y}-${pad(m + 1)}-01`, b = `${y}-${pad(m + 1)}-31`;
      if (s.window.earliest <= b && s.window.latest >= a) cells[m].window = shortCrop(s.crop);   // this month overlaps the sowing window of that crop
    }
    out.push({ year: y, cells });
  }
  return out;
}

// ---- When to sow: for each season with a window, the window, the planned sowing day, the harvest before it, and what is left of the window when that harvest is late
export function sowingLines(plan) {
  const list = seasonsOf(plan), out = [];
  list.forEach((s, i) => {
    if (!s.window || !isDay(s.window.earliest) || !isDay(s.window.latest)) return;
    const prev = list[i - 1] ?? null, open = daysBetween(s.window.earliest, s.window.latest) + 1, h = prev?.harvest ?? null;
    let squeeze = null;
    if (h) {
      if (h > s.window.latest) squeeze = { kind: 'closed', text: `${shortCrop(prev.crop)} is harvested on ${dayYear(h)}, after the window closes on ${dayYear(s.window.latest)}. ${shortCrop(s.crop)} would be sown late or not at all.` };
      else if (h > s.window.earliest) { const left = daysBetween(h, s.window.latest) + 1; squeeze = { kind: 'squeezed', left, text: `${shortCrop(prev.crop)} is harvested on ${dayYear(h)}, so only ${left} ${left === 1 ? 'day' : 'days'} of the ${open}-day window are left, to ${dayYear(s.window.latest)}.` }; }
      else squeeze = { kind: 'open', text: `${shortCrop(prev.crop)} is harvested on ${dayYear(h)}, before the window opens, so all ${open} days of it are available.` };
    }
    const planned = isDay(s.sow) ? s.sow : null, inside = planned && planned >= s.window.earliest && planned <= s.window.latest;
    out.push({ crop: shortCrop(s.crop), cropId: s.crop, earliest: s.window.earliest, latest: s.window.latest, open, planned, plannedInside: planned ? !!inside : null, harvestBefore: h, squeeze,
      sources: ['power', 'fao', ...(s.crop === 'wheat' ? ['omafra'] : [])] });
  });
  return out;
}

// ---- the climate rows of a normal year
export function climateRows(C) {
  const m = C?.monthly;
  if (!m) return null;
  const k32 = THR.indexOf(32), hot = m.heatByMonth?.[k32] ?? [];
  return { rain: (m.P ?? []).map(v => fin(v) ? v : NaN), frost: (m.frostByMonth ?? []).map(v => fin(v) ? v : NaN), hot: hot.map(v => fin(v) ? v : NaN), years: C.years?.length ?? 0, first: C.years?.[0], last: C.years?.at(-1) };
}
export const frostTitle = (month, n) => !fin(n) ? `${FULL[month]}: not read` : n >= 8 ? `${FULL[month]}: frosty nights are normal` : n >= 1 ? `${FULL[month]}: about ${Math.round(n)} frosty ${Math.round(n) === 1 ? 'night' : 'nights'} in a normal year` : `${FULL[month]}: no frost in a normal year`;
export const hotTitle = (month, n) => !fin(n) ? `${FULL[month]}: not read` : n >= 2 ? `${FULL[month]}: about ${Math.round(n)} days above 32 °C` : `${FULL[month]}: hot days are rare`;

// ---- the whole tab. result: the engine's answer (or null); climate: computeClimate's object (or null).
export function buildCalendar({ result, climate }) {
  const plans = [];
  if (result?.current && result?.recommended) for (const [label, plan] of [['Current plan', result.current], ['Proposed plan', result.recommended]]) { const years = planYears(plan); if (years.length) plans.push({ label, plan, years, name: plan.name }); }
  const proposed = plans.find(p => p.label === 'Proposed plan');
  return { climate: climateRows(climate), plans, sowing: proposed ? sowingLines(proposed.plan) : [], hasPlans: plans.length > 0 };
}
