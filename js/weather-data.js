// Crophalo's Weather tab, the figures: everything the tab shows is worked out here from one daily record, one forecast answer and one spot.
// The climate record (2001 to last year) comes from js/climate.js, the year so far and the season's warmth from the same file, the next 7 days from js/data.js.
// Pure: no page, no storage, no network. A figure that cannot be worked out is NaN or null and the tab says "not read" for it; nothing is ever filled in.
// Checked by scripts/test_weather_tab.mjs (a recorded Barrie answer from NASA POWER, a missing forecast, every word with its denominator, the calm-day rule).
import { computeClimate, computeFrost, computeYTD, computeGDD, frostWords, hotWords, heavyWords, drySpellWords, dryYearsWords, trendWords, rainSoFarWords, soilWords, warmthWords, dateWord, SQUARE_WORDS } from './climate.js';
import { buildForecast } from './data.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_LABELS = MONTHS;
const num = (v, d = 0) => Math.abs(v).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const signed = (v, d = 0) => `${v < 0 && Number(Math.abs(v).toFixed(d)) !== 0 ? '−' : ''}${num(v, d)}`;
const attempt = f => { try { return f(); } catch { return null; } };
export const longDay = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? `${+iso.slice(8)} ${FULL[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '';
const ord = n => { const r = n % 100; return r >= 11 && r <= 13 ? `${n}th` : `${n}${['th', 'st', 'nd', 'rd'][n % 10 < 4 ? n % 10 : 0]}`; };

// ---- the whole tab's figures. series: the daily record (data.js buildSeries); climate: computeClimate(series); forecast: the raw Open-Meteo answer or null.
export function buildWeather({ series, climate, forecast = null, loc, now = Date.now() }) {
  const lat = loc?.lat ?? series?.lat;
  const C = climate ?? attempt(() => computeClimate(series, lat));
  if (!C) return { ok: false, reason: 'The weather record could not be turned into figures for this spot.' };
  const F = attempt(() => computeFrost(series, lat)), Y = attempt(() => computeYTD(series)), G = attempt(() => computeGDD(series, lat));
  const week = forecast ? attempt(() => buildForecast(forecast, now)) : null;
  const w = { ok: true, C, F, Y, G, week, through: C.through, years: C.years.length, first: C.years[0], last: C.years.at(-1), lat, lon: loc?.lon ?? series?.lon };
  w.rainSource = series?.rainSource ?? C.rainSource;
  w.facts = facts(w); w.tiles = tiles(w); w.charts = charts(w); w.days = days(week);
  return w;
}
const span = w => `${w.first}–${w.last}`;
const denominator = w => `${w.years} of ${w.last - w.first + 1} years counted`;   // years with enough readings, of the years since 2001

// ---- the climate record as plain facts, each with its count (never a chance)
function facts(w) {
  const { C, F } = w, out = [];
  const add = (id, title, value, text, sources = ['power']) => out.push({ id, title, value, text, sources });
  add('rain', 'Typical yearly rain', fin(C.med?.P) ? `${num(C.med.P)} mm` : 'Not read', fin(C.med?.P) ? `The middle of ${w.years} years (${span(w)}); ${denominator(w)}. ${rainWhere(w)}` : 'Too few rain readings to say.', w.rainSource === 'imerg' ? ['power', 'gpm'] : w.rainSource === 'era5' ? ['era5'] : ['power', 'merra2']);
  add('frost', 'Frost', F && F.years > 0 ? (fin(F.last) && fin(F.first) ? `${dateWord(F.last)} to ${dateWord(F.first)}` : F.frostYears === 0 ? 'None in the record' : 'Varies') : 'Not read', frostWords(F), F?.margin > 0 ? ['power', 'eccc'] : ['power']);
  add('free', 'Frost-free season', fin(C.med?.frostFree) ? `${num(C.med.frostFree)} days` : 'Not read', fin(C.med?.frostFree) ? `The middle of ${w.years} years: the days between the last spring frost and the first autumn frost. ${SQUARE_WORDS}` : 'Too few nights read to say.', C.frostMargin > 0 ? ['power', 'eccc'] : ['power']);
  const hot = hotWords(C, w.Y);
  add('heat', 'Hot days (32 °C or more)', fin(C.med?.heat32) ? `${num(C.med.heat32)} a year` : 'Not read', hot.text);
  add('heavy', 'Heavy rain', fin(C.med?.heavy) ? `${num(C.med.heavy, 1)} days a year` : 'Not read', heavyWords(C));
  add('dry', 'Dry spells', fin(C.med?.dryRun) ? `${num(C.med.dryRun)} days` : 'Not read', drySpellWords(C));
  add('dryyears', 'Dry years', C.dryOf > 0 ? `${C.dryYears.length} of ${C.dryOf} years` : 'Not read', C.dryOf > 0 ? `${dryYearsWords(C)} had a growing season a quarter short of rain, or clearly dry soil with below-normal rain.` : dryYearsWords(C));
  const n = C.years.length, k = Math.max(1, Math.floor(0.1 * n) + 1);
  add('cold', 'Coldest night', fin(C.coldNight) ? `${signed(C.coldNight)} °C` : 'Not read', fin(C.coldNight) ? `In a normal winter the coldest night falls to about ${signed(C.coldNight)} °C. In a cold winter (the ${ord(k)} coldest of ${n} years) it fell to about ${signed(C.coldNight10)} °C.${C.coldDiffer ? ` ${C.coldNote}` : ''}` : 'Too few nights read to say.', C.coldRecords === 2 ? ['power', 'era5land'] : ['power']);
  add('trend', 'Over the years', fin(C.trend?.P?.slope) ? trendWords(C.trend.P, 'mm', 0).split(' · ')[1] : 'Not read', `Yearly rain: ${trendWords(C.trend?.P, 'mm', 0)}. Yearly mean temperature: ${trendWords(C.trend?.T, '°C', 1)}.`);
  return out;
}
const rainWhere = w => w.rainSource === 'imerg' ? 'Rain is NASA’s satellite estimate (GPM) for a square about 10 km wide.' : w.rainSource === 'era5' ? 'Rain is from the back-up weather record.' : 'Rain is from NASA’s weather model.';

// The hot-days tile follows the comparison with the usual by now, not only the place's own average: 11 so far against a usual 6 is more hot days than usual, whatever the place's word.
export function hotTile(hot, Y) {
  const total = Y?.hot?.total, normal = Y?.hot?.normal;
  if (!hot || hot.status === 'Unknown' || !fin(total) || !fin(normal)) return hot;
  const room = Math.max(2, normal * 0.5), plain = hot.text.replace(/ So far in \d{4}: .*$/, '');
  if (total - normal >= room) return { status: hot.status === 'Risk' ? 'Risk' : 'Watch', text: `More hot days than usual: ${num(total)} so far, ${num(normal)} is normal by now. Heat can hurt crops at flowering.` };
  if (normal - total >= room) return { status: hot.status, text: `Fewer hot days than usual: ${num(total)} so far, ${num(normal)} is normal by now. ${plain.replace(/^Heat stress is rare here\.$/, '')}`.trim() };
  return hot;
}

// ---- this year so far: each tile has a name, a figure, its status word and a plain line; tone is good, watch, risk or unclear
const tone = t => ({ Good: 'good', Watch: 'watch', Risk: 'risk' }[t] ?? 'unclear');
function tiles(w) {
  const { C, Y, G } = w, out = [], year = Y?.year;
  const rain = rainSoFarWords(Y), g = Y?.gpm?.total, m = Y?.model?.total, rainTotal = fin(g) ? g : m;
  out.push({ id: 'rain', title: `Rain in ${year ?? 'this year'} so far`, value: fin(rainTotal) ? `${num(rainTotal)} mm` : 'Not read', status: rain.status, tone: tone(rain.tone), text: rain.text, sources: fin(g) ? ['gpm', 'power'] : ['merra2', 'power'] });
  const hot = hotTile(hotWords(C, Y), Y);
  out.push({ id: 'hot', title: 'Hot days (32 °C or more)', value: fin(Y?.hot?.total) ? `${num(Y.hot.total)} so far` : 'Not read', status: hot.status === 'Unknown' ? 'Not read' : hot.status, tone: tone(hot.status), text: hot.text, sources: ['power'] });
  const soil = soilWords(Y);
  out.push({ id: 'soil', title: 'Soil wetness, last 30 days', value: fin(Y?.soil?.mean) ? `${num(Y.soil.mean * 100)}%` : 'Not read', status: soil.chip || (fin(Y?.soil?.mean) ? 'Normal' : 'Not read'), tone: soil.chip ? 'watch' : fin(Y?.soil?.mean) ? 'good' : 'unclear', text: soil.text, sources: ['power'] });
  const warm = warmthWords(G);
  out.push({ id: 'warm', title: 'Warmth for crops this season', value: fin(G?.total) ? `${num(G.total)} degree days` : 'Not read', status: warm.status === 'Unknown' ? 'Not read' : warm.status, tone: tone(warm.tone), text: warm.text, sources: ['power'] });
  return out;
}

// ---- charts: each has a title, labels, series, a median where one exists, a summary in words, and its numbers for a table
function charts(w) {
  const { C } = w, out = [];
  const P = C.monthly?.P ?? [];
  if (P.some(fin)) {
    const wet = P.indexOf(Math.max(...P.filter(fin))), dry = P.indexOf(Math.min(...P.filter(fin)));
    out.push({ id: 'rainmonth', title: 'Rain by month in a normal year', unit: 'mm', labels: MONTHS, series: [{ name: 'Rain', values: P, cls: 'rain' }], sources: w.rainSource === 'era5' ? ['era5'] : ['power', 'gpm'],
      how: 'Each bar is the usual rain for that month, the middle of the years counted.', words: `${FULL[wet]} is the wettest month (about ${num(P[wet])} mm) and ${FULL[dry]} the driest (about ${num(P[dry])} mm).` });
  }
  const hi = C.monthly?.tmax ?? [], lo = C.monthly?.tmin ?? [];
  if (hi.some(fin) && lo.some(fin)) {
    const warm = hi.indexOf(Math.max(...hi.filter(fin))), cold = lo.indexOf(Math.min(...lo.filter(fin)));
    out.push({ id: 'tempmonth', title: 'Heat and cold by month in a normal year', unit: '°C', labels: MONTHS, series: [{ name: 'Daily high', values: hi, cls: 'hi' }, { name: 'Night low', values: lo, cls: 'lo' }], sources: ['power'], signed: true,
      how: 'For each month, the usual hottest part of the day and the usual coldest part of the night.', words: `${FULL[warm]} has the warmest days (about ${signed(hi[warm])} °C) and ${FULL[cold]} the coldest nights (about ${signed(lo[cold])} °C).` });
  }
  const yp = C.yearly?.P ?? [];
  if (yp.filter(fin).length >= 3) {
    out.push({ id: 'rainyear', title: `Rain each year, ${span(w)}`, unit: 'mm', labels: C.years.map(String), series: [{ name: 'Rain', values: yp, cls: 'rain' }], median: C.med.P, sources: w.rainSource === 'era5' ? ['era5'] : ['power', 'gpm'],
      how: 'Each bar is one year. The line is the middle year.', words: `The middle year is about ${num(C.med.P)} mm. The wettest of ${w.years} years had about ${num(Math.max(...yp.filter(fin)))} mm and the driest about ${num(Math.min(...yp.filter(fin)))} mm.` });
  }
  return out;
}

// ---- the next 7 days: the days the service gave, each with the calm-day rule applied only when every value is known
export const CALM = { rain: 1, chance: 40, wind: 20, frost: 0, heat: 35 };
export function isCalm(d) {
  return [d.rain, d.rainChance, d.wind, d.tmin, d.tmax].every(fin) && d.rain < CALM.rain && d.rainChance < CALM.chance && d.wind < CALM.wind && d.tmin > CALM.frost && d.tmax < CALM.heat;
}
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const rainWords = mm => !fin(mm) ? 'rain not read' : mm < 0.5 ? 'dry' : mm < 2.5 ? 'a little rain' : `${num(mm, mm < 10 ? 1 : 0)} mm`;
export const dayIcon = d => d.tmin <= 0 ? 'frost' : d.rain >= 1 ? 'rain' : d.tmax >= 32 ? 'sun' : 'leaf';
function days(week) {
  if (!week?.days?.length) return [];
  return week.days.map(d => ({ date: d.date, name: WEEKDAY[new Date(d.date + 'T00:00:00Z').getUTCDay()], hi: d.tmax, lo: d.tmin, rain: d.rain, rainText: rainWords(d.rain), icon: dayIcon(d), calm: isCalm(d) }));
}
