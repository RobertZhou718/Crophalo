// Crophalo's week of the Weather tab beyond the seven day tiles: the alerts (frost, heat, heavy rain, strong wind, thunderstorm, each with its days and what to do) or the sentence that the week is quiet, the soil temperature, the water the air takes from the field against the rain forecast,
// and the words of the calm-day rule. Figures follow the farmer's units (°F and inches for a field in the United States). A day or a figure that was not read is said, never filled in: a quiet week is said only when all seven days were read.
// Pure: no page, no network. Checked by scripts/test_weather_week.mjs (every threshold, the quiet week, the soil and water lines, °F and inches, a missing forecast).
import { ALERTS } from './remind-plan.js';
import { fmtTemp, fmtRain } from './units.js';
import { CALM } from './weather-data.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = date => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
const known = d => [d.tmin, d.tmax, d.rain].every(fin);
const list = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
// What each alert says and asks: the figure that crossed the line is in the sentence, in the farmer's units.
export const ALERT_WORDS = Object.freeze({
  frost: { label: 'Frost', say: (d, u) => `the night falls to ${fmtTemp(Math.min(...d.map(x => x.tmin)), u)} or lower. Tender plants, flowers and young shoots can be hurt. Cover them if you can.` },
  heat: { label: 'Very hot', say: (d, u) => `up to ${fmtTemp(Math.max(...d.map(x => x.tmax)), u)}. Crops in flower and animals can be stressed. Water early in the day if you irrigate.` },
  rain: { label: 'Heavy rain', say: (d, u) => `up to ${fmtRain(Math.max(...d.map(x => x.rain)), u)} of rain in one day. Fieldwork can wait, and water can pool or wash soil away on slopes.` },
  wind: { label: 'Strong wind', say: (d, u) => `gusts to ${Math.round(Math.max(...d.map(x => x.wind)) * (u?.area === 'imperial' ? 0.621371 : 1))} ${u?.area === 'imperial' ? 'mph' : 'km/h'}. Spraying and tall or young crops are at risk.` },
  storm: { label: 'Thunderstorm', say: () => 'a thunderstorm is forecast. Keep people and machines out of open fields.' },
});
// The alerts of the week, in the order frost, heat, heavy rain, wind, thunderstorm; each names its days. The thresholds are the reminder plan's own (ALERTS).
export function weekAlerts(days, units = {}) {
  const week = (Array.isArray(days) ? days : []).filter(d => d && typeof d.date === 'string'), out = [];
  for (const kind of Object.keys(ALERT_WORDS)) {
    const rule = ALERTS[kind], hit = week.filter(d => { try { return rule.test({ tmin: fin(d.tmin) ? d.tmin : Infinity, tmax: fin(d.tmax) ? d.tmax : -Infinity, rain: fin(d.rain) ? d.rain : 0, wind: fin(d.wind) ? d.wind : 0, code: fin(d.code) ? d.code : 0 }); } catch { return false; } });
    if (hit.length) out.push({ kind, label: ALERT_WORDS[kind].label, days: hit.map(d => dayName(d.date)), dates: hit.map(d => d.date), words: `${list(hit.map(d => dayName(d.date)))}: ${ALERT_WORDS[kind].say(hit, units)}` });
  }
  return out;
}
export const QUIET = 'No frost, heat, heavy rain or strong wind is forecast in the next 7 days.';
// The line under the days: the alerts, or the quiet week when all seven days were read, or why neither can be said.
export function weekStatus(days, units = {}) {
  const week = (Array.isArray(days) ? days : []), alerts = weekAlerts(week, units);
  if (alerts.length) return { alerts, quiet: '' };
  const read = week.filter(known).length;
  return { alerts: [], quiet: read >= 7 ? QUIET : read ? `Only ${read} of the next 7 days were read, so a quiet week cannot be said.` : '' };
}
// The soil temperature 6 cm down this week, from the hourly forecast: the average of the days that have 22 of 24 hours, and its range.
export function soilLine(week, units = {}) {
  const v = (Array.isArray(week?.soilT) ? week.soilT : []).map(d => d.value).filter(fin);
  if (!v.length) return 'Soil temperature (6 cm down) is not read for this week.';
  const mean = v.reduce((a, b) => a + b, 0) / v.length, lo = Math.min(...v), hi = Math.max(...v);
  return `Soil temperature 6 cm down: about ${fmtTemp(mean, units)} on average this week, from ${fmtTemp(lo, units)} to ${fmtTemp(hi, units)} (${v.length} ${v.length === 1 ? 'day' : 'days'} read).`;
}
// The water the air takes from the field (FAO-56 evapotranspiration) against the rain forecast, for the 7 days; both need all seven days, or nothing is added up.
export function waterLine(week, units = {}) {
  const w = week?.water;
  if (!w || !fin(w.et0) || !fin(w.rain)) return `Water loss is not worked out: it needs all 7 days of the forecast${w && w.days ? ` (${w.days} were read)` : ''}.`;
  const cmp = w.et0 > w.rain ? 'More water leaves the field than the forecast brings.' : 'The forecast brings more rain than the air takes.';
  return `Water the air takes from the field this week: about ${fmtRain(w.et0, units)}. Rain forecast: ${fmtRain(w.rain, units)}. ${cmp}`;
}
export const CALM_WORDS = `A day is calm and dry when it has under ${CALM.rain} mm of rain, a rain chance under ${CALM.chance} in 100, wind under ${CALM.wind} km/h, a night above ${CALM.frost} °C and a day under ${CALM.heat} °C, and every one of these was read. It is a weather check only: fieldwork may be possible on other days.`;
// The block under the day tiles, as markup.
export function weekBlockHTML(week, units, esc) {
  const st = weekStatus(week?.days, units);
  const alerts = st.alerts.length ? `<ul class="wk-alerts">${st.alerts.map(a => `<li class="wk-alert is-${a.kind}"><b>${esc(a.label)}</b> ${esc(a.words)}</li>`).join('')}</ul>` : st.quiet ? `<p class="cap wk-quiet">${esc(st.quiet)}</p>` : '';
  return `${alerts}<p class="cap wk-soil">${esc(soilLine(week, units))}</p><p class="cap wk-water">${esc(waterLine(week, units))}</p>
    <details class="fold-card" id="wkCalm"><summary><span class="t">How we pick the calm, dry days</span></summary><div class="fold-b"><p>${esc(CALM_WORDS)}</p></div></details>`;
}
