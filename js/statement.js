// Crophalo's season weather record: what the weather did around one field this season, ranked against every season since 2001, on one page to print
// for a bank, an insurer or a landlord after a bad year. RANKS ONLY: never a loss, a yield, a money verdict or "once in 50 years". A day with no reading
// is never counted as 0 mm of rain, and a season with too many missing days is left out of the ranking instead of being guessed.
// Checked by scripts/test_statement.mjs (joint ranks, missing days, the season across New Year, every row, the drought words, the banned words).
/*
 * Pure: ranks, the season window, the rows, the drought line and the sheet's markup. No page, no storage, no network.
 *
 * Daily series it reads (plain data, aligned to day 0 = series.start): { start: '2001-01-01', rain: [mm|null], rainModel: [mm|null], tmax: [°C|null], tmin: [°C|null] }
 * rain is the satellite rain; rainModel is NASA's model rain, used for every year when the satellite rain is not there for this season and at least ten past ones.
 */
import { esc } from './words.js';

export const FIRST_YEAR = 2001, MIN_DAYS = 30, MISSING_SHARE = 0.1, DRY_MM = 1, HOT_C = 35, FROST_C = 0;
export const FIXED_LINE = 'Public weather data for an area about 50 km wide around this field. Not a measurement on your field, not a loss assessment, not an official record.';
export const FOOTER = 'Ranks only: this record says nothing about yields or money.';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad = n => String(n).padStart(2, '0');
const ms = day => Date.parse(day + 'T00:00:00Z'), toDay = t => new Date(t).toISOString().slice(0, 10);
const addDays = (day, n) => toDay(ms(day) + n * 864e5);
const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const shift = (day, years) => { const y = +day.slice(0, 4) + years, m = +day.slice(5, 7), d = Math.min(+day.slice(8), m === 2 && !leap(y) ? 28 : MONTH_DAYS[m - 1] + (m === 2 && leap(y) ? 1 : 0)); return `${y}-${pad(m)}-${pad(d)}`; };   // the same calendar day, years away; 29 February falls on the 28th
export const shortDay = day => `${+day.slice(8)} ${MON[+day.slice(5, 7) - 1]}`;
export const longDay = day => `${shortDay(day)} ${day.slice(0, 4)}`;
const fin = v => typeof v === 'number' && Number.isFinite(v);

// ---- the season: the newest one sown on or before today
// { start, end, soFar, label }: the crop's sowing day to its ripening here (the farmer's own dates win); a season across New Year is one ("2025–26").
export function seasonWindow({ today, sowDay, harvestDay, sowDoy, harvestDoy }) {
  const dayOfYear = doy => { let d = Math.round(doy), m = 0; if (!(d >= 1 && d <= 365)) return null; while (d > MONTH_DAYS[m]) d -= MONTH_DAYS[m++]; return `${pad(m + 1)}-${pad(d)}`; };
  let start = null, end = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(sowDay ?? '')) { start = sowDay; end = /^\d{4}-\d{2}-\d{2}$/.test(harvestDay ?? '') && harvestDay > sowDay ? harvestDay : null; }
  else if (fin(sowDoy)) {
    const md = dayOfYear(sowDoy); if (!md) return null;
    start = `${today.slice(0, 4)}-${md}`; if (start > today) start = `${+today.slice(0, 4) - 1}-${md}`;
  }
  if (!start || start > today) return null;
  if (!end && fin(harvestDoy) && fin(sowDoy)) end = addDays(start, ((Math.round(harvestDoy) - Math.round(sowDoy)) % 365 + 365) % 365 || 1);
  end ??= addDays(start, 180);
  const soFar = end > today; if (soFar) end = today;
  const y1 = start.slice(0, 4), y2 = end.slice(0, 4);
  return { start, end, soFar, label: y1 === y2 ? y1 : `${y1}–${y2.slice(2)}` };
}
// The same calendar days, back to 2001: [{ start, end }] newest first, the season itself first. A season that begins before 2001 is not offered.
export function pastWindows(win) {
  const out = [], first = +win.start.slice(0, 4) - 1;
  out.push({ start: win.start, end: win.end, year: +win.start.slice(0, 4), now: true });
  for (let y = first; y >= FIRST_YEAR; y--) out.push({ start: shift(win.start, y - +win.start.slice(0, 4)), end: shift(win.end, y - +win.start.slice(0, 4)), year: y, now: false });
  return out;
}

// ---- reading the series
const index = (series, day) => Math.round((ms(day) - ms(series.start)) / 864e5);
const slice = (series, key, w) => { const a = series?.[key], i = index(series, w.start), j = index(series, w.end); if (!Array.isArray(a) || i < 0 || j > a.length - 1 || j < i) return null; const out = []; for (let k = i; k <= j; k++) out.push(fin(a[k]) ? a[k] : null); return out; };
const known = v => v.filter(fin), usable = v => v && v.length > 0 && v.filter(x => x === null).length <= v.length * MISSING_SHARE;
export const daysWithData = (series, win, key = 'rain') => { const s = slice(series, key, win); return s ? known(s).length : 0; };
export const canOffer = (series, win) => !!win && (daysWithData(series, win, 'rain') >= MIN_DAYS || daysWithData(series, win, 'rainModel') >= MIN_DAYS);

// the measures, each over a list of days where null is a missing day
const sum = v => Math.round(known(v).reduce((a, b) => a + b, 0) * 10) / 10;
export function longestDry(v) { let best = 0, run = 0; for (const x of v) { if (fin(x) && x < DRY_MM) { run++; best = Math.max(best, run); } else run = 0; } return best; }   // a missing day ends the run: an unknown day is not a dry one
const maxOf = v => known(v).length ? Math.max(...known(v)) : null;
const countOf = (v, test) => known(v).filter(test).length;
const toF = c => c * 9 / 5 + 32;

// ---- ranks in words
const ORD = n => { const r = n % 100; if (r >= 11 && r <= 13) return `${n}th`; return `${n}${['th', 'st', 'nd', 'rd'][n % 10 < 4 ? n % 10 : 0]}`; };
// Where one value stands among all (itself included): the nearer end, "lowest", "3rd lowest", "joint 2nd highest"; under 20 seasons it says how few.
export function rankWords(value, all) {
  const n = all.length;
  if (!fin(value) || n < 2) return '';
  const low = 1 + all.filter(x => x < value).length, high = 1 + all.filter(x => x > value).length, tie = all.filter(x => x === value).length > 1;
  const end = low <= high ? 'lowest' : 'highest', rank = low <= high ? low : high;
  const place = `${tie ? 'joint ' : ''}${rank === 1 ? '' : ORD(rank) + ' '}${end}`;
  return `${place} ${n < 20 ? `(only ${n} years with data)` : `of ${n} years`}`;
}
export function median(all) { const s = [...all].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

// ---- the rows
const mm = (v, unit) => unit === 'in' ? `${(v / 25.4).toFixed(1)} in` : `${Math.round(v)} mm`;
const degrees = (c, unit) => unit === 'F' ? `${Math.round(toF(c))} °F` : `${Math.round(c)} °C`;
const monthBounds = (w) => {   // the whole calendar months inside a window: [{ label, start, end }]
  const out = []; let m = w.start.slice(0, 7);
  while (m <= w.end.slice(0, 7)) {
    const y = +m.slice(0, 4), mo = +m.slice(5), first = `${m}-01`, last = `${m}-${pad(MONTH_DAYS[mo - 1] + (mo === 2 && leap(y) ? 1 : 0))}`;
    if (first >= w.start && last <= w.end) out.push({ label: MON[mo - 1], start: first, end: last, month: mo });
    m = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
  }
  return out;
};
// All rows of the record. input: { series, win (the season), units: { rain: 'mm'|'in', temp: 'C'|'F' }, backupNote, firstEstimate: days }
export function buildRows({ series, win, units = {}, backupNote = '', firstEstimate = 0 }) {
  const notes = [], windows = pastWindows(win), rows = [];
  const thisRain = slice(series, 'rain', windows[0]), satOk = usable(thisRain) && windows.slice(1).filter(w => usable(slice(series, 'rain', w))).length >= 10;
  const rainKey = satOk ? 'rain' : 'rainModel';
  if (!satOk) notes.push('Rain is from NASA’s weather model for every year, because the satellite rain is missing for this season or too few past ones.');
  const seasons = windows.map(w => ({ w, rain: slice(series, rainKey, w), tmax: slice(series, 'tmax', w), tmin: slice(series, 'tmin', w) }));
  const okRain = seasons.filter(s => usable(s.rain)), me = seasons[0];
  if (!usable(me.rain)) return { rows: [], notes: ['This season has too many days with no rain reading to rank.'], ok: false };
  const missing = me.rain.filter(x => x === null).length;
  if (missing) notes.push(`${missing} ${missing === 1 ? 'day' : 'days'} of this season had no rain reading. They are not counted as dry days, so the total may be low.`);
  const label = (a, b) => `${shortDay(a)} to ${shortDay(b)}`, put = (name, mine, all, show) => rows.push({ label: name, value: show(mine), rank: rankWords(mine, all), middle: all.length ? show(median(all)) : '' });
  put(`Rain, ${label(win.start, win.end)}`, sum(me.rain), okRain.map(s => sum(s.rain)), v => mm(v, units.rain));
  for (const mb of monthBounds(win)) {
    const part = s => { const dy = s.w.year - windows[0].year; return slice(series, rainKey, { start: shift(mb.start, dy), end: shift(mb.end, dy) }); };
    const mineM = slice(series, rainKey, mb), pastM = okRain.map(part).filter(usable).map(sum);
    if (usable(mineM) && pastM.length >= 2) put(`${mb.label} rain`, sum(mineM), pastM, v => mm(v, units.rain));
  }
  put('Longest dry spell (days in a row under 1 mm of rain)', longestDry(me.rain), okRain.map(s => longestDry(s.rain)), v => `${Math.round(v)} ${Math.round(v) === 1 ? 'day' : 'days'}`);
  const tmaxOk = seasons.filter(s => usable(s.tmax));
  if (usable(me.tmax)) {
    const whole = c => unitRound(c, units.temp);
    put('Hottest day', whole(maxOf(me.tmax)), tmaxOk.map(s => whole(maxOf(s.tmax))), v => degrees(units.temp === 'F' ? (v - 32) * 5 / 9 : v, units.temp));
    const hot = s => countOf(s.tmax, x => x >= HOT_C), pastHot = tmaxOk.slice(1, 4).some(s => hot(s) > 0);
    if (hot(me) > 0 || pastHot) put('Very hot days (35 °C or more)', hot(me), tmaxOk.map(hot), v => `${v} ${v === 1 ? 'day' : 'days'}`);
  }
  const tminOk = seasons.filter(s => usable(s.tmin));
  if (usable(me.tmin)) { const frost = s => countOf(s.tmin, x => x <= FROST_C); put('Frost nights (0 °C or colder) since sowing', frost(me), tminOk.map(frost), v => `${v} ${v === 1 ? 'night' : 'nights'}`); }
  if (units.temp === 'F') notes.push('Hottest day is ranked in whole degrees Fahrenheit.');
  if (firstEstimate > 0) notes.push('The newest days of satellite rain are a first estimate and can change.');
  if (backupNote) notes.push(backupNote);
  return { rows, notes, ok: true, years: okRain.length };
}
const unitRound = (c, unit) => unit === 'F' ? Math.round(toF(c)) : Math.round(c);

// ---- the US Drought Monitor line
const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
const CLASS = { d0: ['D0', 'abnormally dry'], d1: ['D1', 'moderate drought'], d2: ['D2', 'severe drought'], d3: ['D3', 'extreme drought'], d4: ['D4', 'exceptional drought'] };
// weeks: [{ date, d0..d4 }] (the share of the county in each class or worse); half or more of the county is the line a week must cross.
export function droughtWords({ weeks, county, state, from, to }) {
  const inside = (Array.isArray(weeks) ? weeks : []).filter(w => w && w.date >= from && w.date <= to).sort((a, b) => a.date < b.date ? -1 : 1);   // oldest first, so the worst week named is the first to reach it
  if (!inside.length || !county) return '';
  const place = `${county}${STATES[state] ? `, ${STATES[state]}` : ''}`, n = inside.length, half = k => w => fin(w[k]) && w[k] >= 50;
  const wet = inside.filter(half('d1')).length;
  if (wet === 0) { const d0 = inside.filter(half('d0')).length; return `Half or more of ${place} was not in drought (D1, moderate, or worse) in any of the season's ${n} ${n === 1 ? 'week' : 'weeks'}.${d0 ? ` It was abnormally dry (D0) for ${d0} of them.` : ''}`; }
  const worst = ['d4', 'd3', 'd2', 'd1'].find(k => inside.some(half(k))), week = inside.find(half(worst));
  const [code, words] = CLASS[worst];
  return `Half or more of ${place} was in drought (D1, moderate, or worse) for ${wet} of the season's ${n} ${n === 1 ? 'week' : 'weeks'}.${worst === 'd1' ? '' : ` At its worst, ${words} (${code}), in the week of ${longDay(week.date)}.`}`;
}
export const DROUGHT_ASK = 'For the US Drought Monitor line, your field’s position goes to the Crophalo server, which asks the US FCC for your county.';

// ---- the whole record
// input: { name, place, crop, series, win, units, backupNote, firstEstimate, drought: { weeks, county, state } | { reason } | null, madeOn, sources: [], notes: [text] (ticked) }
export function buildRecord(input) {
  const { win } = input, built = buildRows(input);
  const d = input.drought;
  const drought = d?.weeks ? droughtWords({ weeks: d.weeks, county: d.county, state: d.state, from: win.start, to: win.end }) : d?.reason ? d.reason : '';
  const sow = input.crop ? `${input.crop}, you sow about ${shortDay(win.start)}. ` : '';
  return { title: 'Crophalo season weather record', name: input.name || 'My field', place: input.place || '', seasonLine: `${sow}Season: ${longDay(win.start)} to ${longDay(win.end)}${win.soFar ? ' (the season so far)' : ''}.`, fixedLine: FIXED_LINE,
    rows: built.rows, notes: built.notes, ok: built.ok, drought, myNotes: (input.notes ?? []).map(String), madeOn: input.madeOn ?? '', sources: input.sources ?? [], footer: FOOTER };
}
// What the record offers and when: needs 30 days of this season's weather (rotations only).
export const OFFER_WORDS = 'The season weather record needs 30 days of this season’s weather.';

// ---- the sheet's markup: a table, and under 520 px each row becomes a block with the column name before each figure (CSS reads data-label)
export function recordHTML(rec) {
  const rows = rec.rows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td data-label="This season">${esc(r.value)}</td><td data-label="Rank">${esc(r.rank)}</td><td data-label="Middle season">${esc(r.middle)}</td></tr>`).join('');
  return `<article class="statement"><header><p class="st-brand">${esc(rec.title)}</p><h2>${esc(rec.name)}</h2>${rec.place ? `<p>${esc(rec.place)}</p>` : ''}<p>${esc(rec.seasonLine)}</p></header>
    <p class="st-fixed">${esc(rec.fixedLine)}</p>
    ${rec.ok ? `<table class="st-table"><thead><tr><th scope="col">What</th><th scope="col">This season</th><th scope="col">Rank</th><th scope="col">Middle season</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    ${rec.notes.length ? `<ul class="st-notes">${rec.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${rec.drought ? `<section class="st-drought"><h3>US Drought Monitor</h3><p>${esc(rec.drought)}</p></section>` : ''}
    ${rec.myNotes.length ? `<section class="st-mine"><h3>My notes (written by me)</h3><ul>${rec.myNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
    <footer><p>${esc(rec.footer)} Made ${esc(rec.madeOn ? longDay(rec.madeOn) : '')} from NASA and other public data. A guide, not advice. You decide.</p>${rec.sources.length ? `<ol class="st-sources">${rec.sources.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}</footer></article>`;
}
