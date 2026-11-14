// Crophalo's reminder plan: which jobs the report and My farm suggest a reminder for, and on which day. It never invents a date: with no timing
// given there is no suggested day, and the farmer picks one. Every input is plain data (days of the year, forecast days); the engine's own
// answers are handed in by the caller.
// Checked by scripts/test_remind.mjs (the suggested days, the "never before tomorrow" rule, the alert lines, the date words).
/*
 * Pure: no page, no storage, no network. Days are written 'YYYY-MM-DD' and times 'YYYY-MM-DDTHH:MM' in the field's own wall-clock time.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // a year of 365 days: a day of the year has the same date every year

// ---- days
const pad = n => String(n).padStart(2, '0');
export const isDay = text => { if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false; const t = Date.parse(text + 'T00:00:00Z'); return Number.isFinite(t) && toDay(t) === text; };
const toDay = ms => new Date(ms).toISOString().slice(0, 10);
const ms = day => Date.parse(day + 'T00:00:00Z');
export const addDays = (day, n) => toDay(ms(day) + n * 864e5);
export const dayOf = text => String(text).slice(0, 10);
// 'YYYY-MM-DD' of a day of the year (1 to 365) in a given year.
export function fromDoy(doy, year) {
  let d = Math.round(doy), m = 0;
  if (!(d >= 1 && d <= 365)) return null;
  while (d > MONTH_DAYS[m]) d -= MONTH_DAYS[m++];
  return `${year}-${pad(m + 1)}-${pad(d)}`;
}
// The next date on or after today that falls on a day of the year.
export function nextOnOrAfter(doy, today) {
  const year = +today.slice(0, 4);
  for (const y of [year, year + 1]) { const day = fromDoy(doy, y); if (day && day >= today) return day; }
  return null;
}
export const weekdayOf = day => WEEKDAYS[new Date(ms(day)).getUTCDay()];
export const dayWords = day => `${weekdayOf(day)} ${+day.slice(8)} ${MONTHS[+day.slice(5, 7) - 1]}`;   // "Tuesday 10 March"
// "early", "mid" or "late" and the month, for a day of the year: "late April".
export function windowWords(doy) {
  const day = fromDoy(doy, 2001); if (!day) return '';
  const d = +day.slice(8);
  return `${d <= 10 ? 'early' : d <= 20 ? 'mid' : 'late'} ${MONTHS[+day.slice(5, 7) - 1]}`;
}
const tomorrow = today => addDays(today, 1);
// A suggested time on a day, never before tomorrow: a day that has passed or is today moves to tomorrow.
const notBeforeTomorrow = (day, today) => day < tomorrow(today) ? tomorrow(today) : day;
const job = (fields) => ({ source: 'plan', note: '', hint: '', ...fields });

// ---- the report: from the report's own timing and the frost history
const SOW_HINT = 'We suggested this day from the sowing window in your report. Change it if you like.', REPORT_HINT = 'We suggested this day from your report. Change it if you like.';
// timing: { crop, sowDoy, harvestDoy, lastSpringFrostDoy, firstAutumnFrostDoy } (any of them may be missing: then that job has no suggested day)
export function reportJobs(timing, today) {
  const crop = String(timing?.crop ?? '').trim(), name = crop ? crop.toLowerCase() : 'the crop', out = [];
  const sow = Number.isFinite(timing?.sowDoy) ? nextOnOrAfter(timing.sowDoy, today) : null;
  const at8 = day => day ? `${day}T08:00` : '';
  if (crop && sow) out.push(job({ title: `Sow ${name}`, when: at8(notBeforeTomorrow(sow, today)), kind: 'sow', note: `The usual sowing window for ${name} here starts about ${windowWords(timing.sowDoy)}.`, hint: SOW_HINT }));
  if (crop && Number.isFinite(timing?.harvestDoy)) { const h = nextOnOrAfter(timing.harvestDoy, today); if (h) out.push(job({ title: `Harvest ${name}`, when: at8(h), kind: 'harvest', note: `${crop[0].toUpperCase()}${crop.slice(1)} is usually ready about ${windowWords(timing.harvestDoy)}.`, hint: REPORT_HINT })); }
  out.push(job({ title: 'Get a soil test', when: sow ? at8(notBeforeTomorrow(addDays(sow, -30), today)) : '', kind: 'soil', note: 'Labs need time, so book it early.', hint: sow ? SOW_HINT : '' }));
  for (const [doy, label] of [[timing?.lastSpringFrostDoy, 'spring'], [timing?.firstAutumnFrostDoy, 'autumn']]) {
    if (!Number.isFinite(doy)) continue;
    const frost = nextOnOrAfter(doy, today); if (!frost) continue;
    out.push(job({ title: 'Check the frost forecast', when: at8(notBeforeTomorrow(addDays(frost, -7), today)), kind: 'frost', note: `The usual ${label === 'spring' ? 'last spring' : 'first autumn'} frost here is about ${windowWords(doy)}.`, hint: REPORT_HINT }));
  }
  return out;
}
// The "Before you switch" checklist: the soil test 30 days before sowing, the adviser 21 days before, the other two with no suggested day.
export function checklistJobs(timing, today) {
  const sow = Number.isFinite(timing?.sowDoy) ? nextOnOrAfter(timing.sowDoy, today) : null;
  const soil = reportJobs(timing, today).find(j => j.kind === 'soil');
  return [soil, job({ title: 'Talk to my adviser or seed seller', when: sow ? `${notBeforeTomorrow(addDays(sow, -21), today)}T08:00` : '', kind: 'job', hint: sow ? SOW_HINT : '' }),
    job({ title: 'Find a buyer', when: '', kind: 'job' }), job({ title: 'Try the change on one field first', when: '', kind: 'job' })];
}

// ---- the weather alerts: the evening before the first day that crosses a line
export const ALERTS = Object.freeze({
  frost: { label: 'Frost', test: d => d.tmin <= 0, value: d => `${Math.round(d.tmin)} °C` }, heat: { label: 'Very hot', test: d => d.tmax >= 35, value: d => `${Math.round(d.tmax)} °C` },
  rain: { label: 'Heavy rain', test: d => d.rain >= 20, value: d => `${Math.round(d.rain)} mm` }, wind: { label: 'Strong wind', test: d => d.wind >= 40, value: d => `${Math.round(d.wind)} km/h` },
  storm: { label: 'Thunderstorm', test: d => d.code >= 95, value: () => 'thunderstorm' },   // the weather codes 95, 96 and 99 are all thunderstorms
});
const num = v => typeof v === 'number' && Number.isFinite(v);
// forecast: [{ date, tmin, tmax, rain, wind, code }], now: 'YYYY-MM-DDTHH:MM'. One entry per alert that crosses its line and whose evening has not passed.
export function alertJobs(forecast, now) {
  const out = [], days = (Array.isArray(forecast) ? forecast : []).filter(d => d && isDay(d.date)).sort((a, b) => a.date < b.date ? -1 : 1);
  for (const [kind, rule] of Object.entries(ALERTS)) {
    const day = days.find(d => { try { return rule.test({ tmin: num(d.tmin) ? d.tmin : Infinity, tmax: num(d.tmax) ? d.tmax : -Infinity, rain: num(d.rain) ? d.rain : 0, wind: num(d.wind) ? d.wind : 0, code: num(d.code) ? d.code : 0 }); } catch { return false; } });
    if (!day) continue;
    const when = `${addDays(day.date, -1)}T18:00`;
    if (when <= now) continue;   // that evening has passed: no button
    const words = dayWords(day.date);
    out.push({ source: 'forecast', kind, title: `${rule.label} forecast ${weekdayOf(day.date)}`, when, value: rule.value(day), note: `${rule.label} was forecast for ${words}. Look at the latest forecast.`,
      hint: `The forecast says ${rule.label.toLowerCase()} on ${words}, so we suggested 6 pm the evening before. From the Open-Meteo forecast. Change it if you like.` });
  }
  return out;
}

// ---- My farm: from the field's real plan on the recorded weather, never a what-if. Only dates after today.
// plan: { crop, cover, rye, sowDay, flowerDay, harvestDay, firstFrostDay, frostRare, second: { crop, day } } with plain 'YYYY-MM-DD' days.
export function farmJobs(plan, today) {
  const crop = String(plan?.crop ?? '').toLowerCase(), out = [];
  const add = (title, day, kind, note = '') => { if (isDay(day) && day > today) out.push(job({ title, when: `${day}T08:00`, kind, note })); };
  if (crop) {
    add(`Sow ${crop}`, plan.sowDay, 'sow');
    if (isDay(plan.flowerDay)) add(`Check ${crop} at flowering`, addDays(plan.flowerDay, -5), 'flower-check');
    add(`Harvest ${crop}`, plan.harvestDay, 'harvest');
  }
  if (plan?.cover && isDay(plan.firstFrostDay) && !plan.frostRare) add(`Seed ${String(plan.cover).toLowerCase()} cover`, addDays(plan.firstFrostDay, plan.rye ? 14 : -42), 'cover-by');
  if (plan?.second?.crop && isDay(plan.second.day)) add(`Sow the second crop, ${String(plan.second.crop).toLowerCase()}`, plan.second.day, 'second-sow');
  else if (plan?.second?.crop && isDay(plan.harvestDay)) add(`Sow the second crop, ${String(plan.second.crop).toLowerCase()}`, addDays(plan.harvestDay, 7), 'second-sow');
  return out.sort((a, b) => a.when < b.when ? -1 : 1);
}
export const IMPORTANT_KINDS = Object.freeze(['sow', 'harvest']);   // their calendar entries ring a day before as well
