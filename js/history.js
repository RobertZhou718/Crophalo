// Crophalo's land history, the record and its sentences: what the public weather record says happened on this land since 2001, counted from NASA POWER's daily series that the report already loaded.
// It states facts and gaps only: counts as "N of M years", never a chance; no verdict on the land and no money (js/history-view.js and scripts/test_history.mjs keep the money words out). Past weather, not a forecast.
// Pure: buildHistory(), the lines and strips, inShort(), the spoken sentence for each figure, the plain-text copy. No page, no storage, no network, no clock (the year of "today" is passed in).
// Checked by scripts/test_history.mjs on the recorded NASA POWER answer for Barrie (the counts by hand on a made-up record, the gaps, a short record, the banned words).
export const MIN_YEARS = 10, FULL_YEAR_DAYS = 330, FIRST_YEAR_NOTE = 'NASA weather since 2001, for a square about 50 km wide.';
export const LINES = Object.freeze({
  dry: { label: 'Dry years', short: 'a dry season', kind: 'hatch', not: 'dry years' },
  lateFrost: { label: 'Late spring frost', short: 'a late spring frost', kind: 'dots', not: 'frost after the usual last one' },
  earlyFrost: { label: 'Early autumn frost', short: 'an early autumn frost', kind: 'dots', not: 'early autumn frost' },
  hot: { label: 'Hot summers (10 days or more of 35 °C)', short: 'a hot summer', kind: 'solid', not: 'days of 35 °C' },
  dryspell: { label: 'A month or more without rain in the growing months', short: 'a month without rain', kind: 'hatch', not: 'a month without rain' },
  downpour: { label: 'Downpours (50 mm or more in a day)', short: 'a downpour (50 mm or more)', kind: 'lines', not: 'downpours of 50 mm' },
});
export const ORDER = Object.freeze(['dry', 'lateFrost', 'earlyFrost', 'hot', 'dryspell', 'downpour']);
export const RULES = Object.freeze({
  dry: 'A dry season has a quarter less rain than usual in the growing months, April to September.',
  lateFrost: 'A night below 0 °C at least 10 days after the usual last frost of spring.',
  earlyFrost: 'A first night below 0 °C at least 10 days before the usual first frost of autumn.',
  hot: 'Ten days or more of 35 °C or above in June, July and August.',
  dryspell: '30 days in a row with less than 1 mm of rain, in April to September.',
  downpour: 'A day with 50 mm or more of rain.',
});
const fin = v => typeof v === 'number' && Number.isFinite(v);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const median = list => { const a = [...list].sort((x, y) => x - y), m = a.length >> 1; return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : NaN; };
const mean = list => list.reduce((s, v) => s + v, 0) / list.length;
const num = (v, d = 1) => v.toFixed(d).replace(/\.0$/, '');
const dayOfYear = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
const dateWords = doy => { const d = new Date(Date.UTC(2001, 0, doy)); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };   // a day of a common year, in words
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One year of the record: the figures the lines are judged on, or null when the year is not read well enough to count.
function seasonOf(y, rows) {
  const both = rows.filter(r => fin(r.hi) && fin(r.lo)).length, rainN = rows.filter(r => fin(r.rain)).length;
  if (both < FULL_YEAR_DAYS || rainN < FULL_YEAR_DAYS) return null;
  let grow = 0, growN = 0, spell = 0, longest = 0, heat = 0, down = 0, last = null, first = null, tSum = 0, tN = 0, rainTotal = 0;
  for (const r of rows) {
    if (fin(r.rain)) { rainTotal += r.rain; if (r.rain >= 50) down++; }
    if (fin(r.hi) && fin(r.lo)) { tSum += (r.hi + r.lo) / 2; tN++; }
    const grows = r.m >= 4 && r.m <= 9;
    if (grows) { if (fin(r.rain)) { grow += r.rain; growN++; } if (fin(r.rain) && r.rain < 1) { spell++; longest = Math.max(longest, spell); } else spell = 0; }
    if (r.m >= 6 && r.m <= 8 && fin(r.hi) && r.hi >= 35) heat++;
    if (fin(r.lo) && r.lo < 0) { if (r.m <= 7) last = r.doy; else if (r.m >= 8 && first === null) first = r.doy; }
  }
  return { year: y, grow: growN >= 150 ? grow : null, longestDry: longest, heat, down, last, first, meanT: tSum / tN, rainTotal };
}
// Straight-line fit with its t-statistic: slope per year and whether it is clearly more than the year-to-year swing (t of 2 or more).
export function trendOf(points) {
  const n = points.length; if (n < MIN_YEARS) return null;
  const mx = mean(points.map(p => p[0])), my = mean(points.map(p => p[1]));
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0), sxy = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  if (!sxx) return null;
  const slope = sxy / sxx, resid = points.reduce((s, p) => s + (p[1] - (my + slope * (p[0] - mx))) ** 2, 0), se = Math.sqrt(resid / (n - 2) / sxx);
  return { slope, t: se > 0 ? slope / se : (slope ? Infinity : 0) };
}

// The record from the daily series (js/data.js buildSeries): { ok, years, first, last, counted, through, usual, flags, counts, strips, trends, short } or { ok: false, reason }.
export function buildHistory(series, { today = null } = {}) {
  const days = series?.days;
  if (!Array.isArray(days) || !days.length || !series.T2M_MAX || !series.T2M_MIN) return { ok: false, reason: 'The weather record is not read yet, so there is no land history to show.' };
  const rain = series.rain ?? series.PRECTOTCORR, by = new Map();
  for (let i = 0; i < days.length; i++) {
    const s = String(days[i]); if (!/^\d{8}$/.test(s)) continue;
    const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8), v = x => (fin(x) ? x : NaN);
    if (!by.has(y)) by.set(y, []);
    by.get(y).push({ m, doy: dayOfYear(y, m, d), hi: v(series.T2M_MAX[i]), lo: v(series.T2M_MIN[i]), rain: v(rain?.[i]) });
  }
  const years = [...by.keys()].sort((a, b) => a - b), seasons = [], skipped = [];
  for (const y of years) { const s = seasonOf(y, by.get(y)); if (s) seasons.push(s); else skipped.push(y); }
  if (!seasons.length) return { ok: false, reason: 'No year of the weather record is complete enough to count, so there is no land history to show.' };
  const first = seasons[0].year, last = seasons.at(-1).year, counted = seasons.length;
  const growUsual = mean(seasons.filter(s => s.grow !== null).map(s => s.grow)), lastUsual = median(seasons.filter(s => s.last !== null).map(s => s.last)), firstUsual = median(seasons.filter(s => s.first !== null).map(s => s.first));
  const haveLast = seasons.filter(s => s.last !== null).length >= counted / 2, haveFirst = seasons.filter(s => s.first !== null).length >= counted / 2;
  const flagOf = {
    dry: s => s.grow !== null && s.grow < 0.75 * growUsual, lateFrost: s => haveLast && s.last !== null && s.last >= lastUsual + 10,
    earlyFrost: s => haveFirst && s.first !== null && s.first <= firstUsual - 10, hot: s => s.heat >= 10, dryspell: s => s.longestDry >= 30, downpour: s => s.down >= 1,
  };
  const applies = { dry: Number.isFinite(growUsual), lateFrost: haveLast, earlyFrost: haveFirst, hot: true, dryspell: true, downpour: true };
  const counts = {}, strips = {}, marked = {};
  for (const id of ORDER) {
    if (!applies[id]) { counts[id] = null; continue; }
    const cells = seasons.map(s => ({ year: s.year, state: id === 'dry' && s.grow === null ? 'none' : flagOf[id](s) ? 'marked' : 'clear' }));
    strips[id] = cells; marked[id] = cells.filter(c => c.state === 'marked').map(c => c.year);
    counts[id] = { n: marked[id].length, of: cells.filter(c => c.state !== 'none').length, years: marked[id] };
  }
  const todayYear = today ? +String(today).slice(0, 4) : null, notOver = todayYear && !by.has(todayYear) ? null : todayYear && by.get(todayYear) && !seasons.some(s => s.year === todayYear) ? todayYear : null;
  const trends = { temp: trendOf(seasons.map(s => [s.year, s.meanT])), rain: trendOf(seasons.map(s => [s.year, s.rainTotal])) };
  return { ok: true, first, last, counted, through: series.through ?? null, skipped, notOver, short: counted < MIN_YEARS,
    usual: { grow: growUsual, lastFrost: haveLast ? lastUsual : null, firstFrost: haveFirst ? firstUsual : null }, counts, strips, trends, seasons };
}

// ---- the sentences
const span = h => `${h.first}–${h.last}`;
export function yearsOf(h) { return `${h.counted} years, ${span(h)}`; }
export function inShort(h) {
  if (!h?.ok) return { lines: [], notSeen: '', trend: '', short: '' };
  const shown = ORDER.filter(id => h.counts[id] && h.counts[id].n > 0).sort((a, b) => h.counts[b].n - h.counts[a].n || ORDER.indexOf(a) - ORDER.indexOf(b)).slice(0, 5);
  const none = ORDER.filter(id => h.counts[id] && h.counts[id].n === 0);
  const lines = shown.length ? [`Since ${h.first}: ${shown.map(id => `${LINES[id].short} in ${h.counts[id].n} of ${h.counts[id].of} years`).join(', ')}.`] : [];
  const notSeen = none.length ? `Not seen in ${h.counted} years: ${none.map(id => LINES[id].not).join(', ')}.` : '';
  const parts = [];
  if (!h.short) {
    const T = h.trends.temp, R = h.trends.rain;
    if (T && Math.abs(T.t) >= 2) parts.push(`${T.slope > 0 ? 'Warmer' : 'Cooler'} by about ${num(Math.abs(T.slope) * 10)} °C every 10 years`);
    if (R && Math.abs(R.t) >= 2) parts.push(`${R.slope > 0 ? 'Wetter' : 'Drier'} by about ${Math.round(Math.abs(R.slope) * 10)} mm a year every 10 years`);
  }
  return { lines, notSeen, trend: parts.length ? `${parts.join('. ')}.` : '', short: h.short ? `Only ${plural(h.counted, 'year', 'years')} of weather here: too few to call a pattern.` : '' };
}
// What a screen reader hears for each line's strip, and the "More" text.
export function spokenLine(h, id) {
  const c = h.counts[id]; if (!c) return `${LINES[id].label}: not worked out here (too few years have the nights that this line needs).`;
  const when = c.years.length ? ` Years: ${c.years.length > 12 ? `${c.years.slice(0, 12).join(', ')} and ${c.years.length - 12} more` : c.years.join(', ')}.` : '';
  return `${LINES[id].label}: ${c.n} of ${c.of} years.${when}`;
}
export function moreLine(h, id) {
  const lines = [RULES[id]];
  if (id === 'dry' && Number.isFinite(h.usual.grow)) lines.push(`The usual rain in April to September is ${Math.round(h.usual.grow)} mm.`);
  if (id === 'lateFrost' && h.usual.lastFrost !== null) lines.push(`The usual last frost of spring is about ${dateWords(Math.round(h.usual.lastFrost))} here.`);
  if (id === 'earlyFrost' && h.usual.firstFrost !== null) lines.push(`The usual first frost of autumn is about ${dateWords(Math.round(h.usual.firstFrost))} here.`);
  if (h.counts[id]?.years.length) lines.push(`Years: ${h.counts[id].years.join(', ')}.`);
  return lines;
}
export const notCountedWords = h => (h?.notOver ? `${h.notOver}: not counted, the year is not over.` : '');
export const gapsWords = h => (h?.skipped?.length ? `${plural(h.skipped.length, 'year', 'years')} left out because too many days were not read (${h.skipped.slice(0, 6).join(', ')}${h.skipped.length > 6 ? ' and more' : ''}).` : '');

// ---- the cards the page shows that this record cannot fill yet: each says why, never a figure
export const NOT_READ = Object.freeze({
  crops: 'The replay of each crop against this weather is not joined yet, so no year is judged here.',
  modis: 'The greenness history since 2001 is not read yet: its lookup is not connected.',
  pests: 'Pest sightings nearby are not read yet.',
  slope: 'The slope is not read yet. It is read when you are online.',
  soil: 'The soil at the farm pin is not read yet.',
});
export const CHECKLIST = Object.freeze([
  ['A lab soil test: pH, nutrients and salt.', 'The soil map is 250 m wide.'],
  ['Ask neighbours and the council about flooding and wet years. Look at the field after heavy rain and in spring.', ''],
  ['Water: is there a licence or right, how deep are the wells, how much do they give?', ''],
  ['The seller’s crop records for the last 5 to 10 years, and what was grown and sprayed in the last 3 years.', ''],
  ['Field drains: are there tile drains or ditches, and do they work?', ''],
  ['Boundaries, access and rights of way: ask the land registry.', 'The field outline here is your drawing, not a legal boundary.'],
  ['Walk the field on a frosty morning and after heavy rain.', ''],
]);
export const CLOSING = 'This is a record of past weather and maps, not an inspection or a recommendation. Talk to farmers near you, a local farm adviser and a lawyer before you decide.';
export const HOW = Object.freeze([
  'Weather: NASA POWER daily weather for a square about 50 km wide, since 2001. A year counts when at least 330 days have both temperatures and rain.',
  'A line is a count of years that met its rule, always out of the years counted. Nothing here is a forecast, an inspection or a valuation.',
]);

// ---- plain text, for Copy and Print
// The "Your crops, year by year" card as plain sentences, for the page, the paper and the copied text. crops is the farm's replay of each crop on this weather (js/farmhistory.js):
// { ok: true, basis, rows: [{ field, crop, counts { fine, close, hurt, nodata, growing, judged, years }, years: [{ year, verdict, why: [text | { text, date }] }] }] }, or { ok: false, reason }, or nothing.
// Fine, close call and hurt are three different things and are never folded into one another; years not judged (no weather, still growing) are named, never counted.
export const VERDICT_CELL = Object.freeze({ hurt: 'hurt', close: 'close', fine: 'fine' });
const causeText = w => (typeof w === 'string' ? w : w && typeof w.text === 'string' ? `${w.text}${typeof w.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? `, ${causeDay(w.date)}` : ''}` : '');
const causeDay = iso => `${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1].slice(0, 3)} ${iso.slice(0, 4)}`;
export const causesOf = y => (Array.isArray(y?.why) ? y.why.map(causeText).filter(Boolean) : []);
export function cropsLines(crops) {
  if (!crops?.ok || !Array.isArray(crops.rows) || !crops.rows.length) return [crops?.reason || NOT_READ.crops];
  const list = (r, verdict) => r.years.filter(y => y.verdict === verdict).map(y => `${y.year}${causesOf(y).length ? ` (${causesOf(y).join('; ')})` : ''}`);
  const out = crops.rows.flatMap(r => {
    const c = r.counts, hurt = list(r, 'hurt'), close = list(r, 'close'), skipped = c.nodata + c.growing;
    return [`${r.field}: ${r.crop}. Fine in ${c.fine} of ${c.judged} years, a close call in ${c.close}, hurt in ${c.hurt}.`, hurt.length ? `Hurt: ${hurt.join(', ')}.` : '', close.length ? `Close call: ${close.join(', ')}.` : '', skipped ? `Not counted: ${skipped} ${skipped === 1 ? 'year' : 'years'} (no weather, or the season was not over).` : ''].filter(Boolean);
  });
  return [...out, crops.basis].filter(Boolean);
}
export function asText(h, { farm = 'Your farm', place = '', date = '', crops = null } = {}) {
  if (!h?.ok) return `${farm}: land history\n${h?.reason ?? ''}`;
  const s = inShort(h), out = [`${farm}: land history`, [place, yearsOf(h), 'weather from NASA'].filter(Boolean).join(' · '), date ? `Copied ${date}` : '', '', 'IN SHORT', ...s.lines, s.notSeen, s.trend, s.short, '', 'WEATHER ON THIS LAND'].filter(l => l !== null);
  for (const id of ORDER) out.push(`- ${spokenLine(h, id)}`);
  out.push('', 'YOUR CROPS, YEAR BY YEAR', ...cropsLines(crops), '', 'WHAT THE RECORD CANNOT TELL YOU: CHECK BEFORE YOU DECIDE');
  for (const [a, b] of CHECKLIST) out.push(`☐ ${a}${b ? ` (${b})` : ''}`);
  out.push('', ...HOW, '', 'Past weather, not a forecast. ' + CLOSING);
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
