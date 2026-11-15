// Crophalo's Look ahead words that do not depend on a screen: the fixed lines (the note box, the skill line, what is not simulated, the explainer of each horizon), the sentences of the next-2-weeks headline built from counts of runs, and the check that
// a headline never says a chance. Every sentence is a count with its denominator ("19 of 51 runs"), hurt first. No yields, no money, no "%" and no word that sounds like a chance. Pure: strings and functions of numbers.
// Checked by scripts/test_future.mjs (every sentence, the order, and the banned words in every headline).
import { plural } from './history.js';
import { aboutInTen } from './future.js';

export const NOTE_BOX = ['Possible futures, not a promise.', 'Weather models are run many times, each with tiny changes. Each run is one possible future. We lay your plan over each one with the same checks as the land history and count how many are hurt, close calls or fine. A count of runs is not the chance it happens: the runs can all be wrong together. No yields, no money.'];
export const I_CARD = 'Possible futures from weather and climate models, laid over your plan. A count of model runs, not the chance it happens. No yields, no money.';
export const SKILL = 'Seasonal forecasts of warmth are often of some use. Seasonal forecasts of rain are often no better than the usual years, except in parts of the tropics. We could not check how well this forecast has done here, so read it as a hint, not a plan.';
export const NOT_SIMULATED = 'Yields, money, pests and diseases, hail, wind, floods, and the field’s own microclimate.';
export const EXPLAINERS = Object.freeze({
  weeks: 'From the weather forecast. Good for the next few days, less sure each day after. Days 10 to 14 are a rough guide.',
  season: 'From the European seasonal forecast. It says whether the coming months lean warmer, cooler, wetter or drier than usual. It cannot say what happens on any one day.',
  outlook: 'Nobody can forecast the weather two years out. This is the usual weather for your place, moved by what seasonal and climate models expect.',
  years: 'From climate models. They show the kind of years the 2040s may bring if emissions keep rising fast (the high path). They do not forecast the weather of any real year.',
});
export const HORIZONS = Object.freeze([{ id: 'weeks', label: 'Next 2 weeks', sure: 'Most sure' }, { id: 'season', label: 'This season', sure: '' }, { id: 'outlook', label: 'Next 2 years', sure: '' }, { id: 'years', label: 'Years ahead', sure: 'Rough guide' }]);
export const THIN_LINES = 'Thin lines: less sure after day 7; a rough guide after day 10.';
export const DISAGREE = 'The forecast models disagree. When models disagree, the weather is hard to call this far ahead. Look again in a day or two: forecasts usually come closer together as the day nears.';
export const modelNote = f => (f.matched ? '' : `${f.label}: its own weather, not matched to NASA’s here (${f.matchReason || 'too few days shared with NASA’s record'}): its nights may run warmer or colder than NASA’s record.`);

// The next-2-weeks headline from counts. field: the field's name; below0 / belowHard: runs with a night below 0 °C / below the crop's hard-frost line (-2 °C for young corn); of: the runs; by: a day in words ("Thu 14");
// model: "European". All numbers are runs, never shares.
export function weekHeadline({ field = 'your field', model = 'forecast', of, below0 = 0, belowHard = 0, hot = 0, by = '', hardLine = '−2 °C', crop = 'young corn' } = {}) {
  if (!(of > 0)) return 'There are no forecast runs to count here.';
  const lines = [];
  if (below0 > 0) lines.push(`${below0} of ${of} ${model} runs bring a night below 0 °C to ${field}${by ? ` by ${by}` : ''}.${belowHard > 0 ? ` ${belowHard} of them go below ${hardLine}, the line where ${crop} is hurt.` : ''}`);
  if (hot > 0) lines.push(`${hot} of ${of} ${model} runs bring heat that counts to ${field}${by ? ` by ${by}` : ''}.`);
  return lines.length ? lines.join(' ') : `All ${of} runs are fine: no frost or heat that counts. That is good news. The forecast can still change, so look again before you sow.`;
}
export const nothingInGround = (next, reach) => `Nothing in your plan is in the ground in the next 2 weeks, so there is nothing to check.${next ? ` Your next sowing is ${next}.` : ''}${reach ? ` The 2-week forecast reaches it from ${reach}.` : ''}`;
export const nothingThisSeason = next => `Nothing in your plan is in the ground this season, so there is nothing to check.${next ? ` Your next sowing is ${next}.` : ''}`;
export const cannotCheck = (field, of) => `Frost and heat on ${field} cannot be checked yet: the forecast temperatures are missing for the days that matter in all ${of} runs. This is not a sign of no frost or heat.`;
// The counts of a model for the tiles, hurt first, then close calls, then fine, never added together.
export const tileWords = t => [t.hurt ? `${t.hurt} hurt` : '', t.close ? `${t.close} close ${t.close === 1 ? 'call' : 'calls'}` : '', t.fine ? `${t.fine} fine` : '', t.nodata ? `${t.nodata} with no data` : ''].filter(Boolean).join(', ') || 'no runs';
export const runsWords = (t, model) => `${model}: ${tileWords(t)} of ${t.runs} ${t.runs === 1 ? 'run' : 'runs'}.`;
// Words that sound like a chance. A headline never has one (the fixed note box says what a count is not, and is not a headline).
export const CHANCE_WORDS = /%|\bchance\b|\blikel(y|ihood)\b|\bprobabl(y|e|ility)\b|\bexpected\b|\bodds\b|\bpercent\b|\bforecast(s)? (says|shows) it will\b/i;
export { plural };

// ---- the 24-month table's words: a lean needs two thirds of the runs or models to agree, and it is always a count
export const KIND_WORDS = Object.freeze({ seasonal: 'Seasonal forecast', trend: 'Usual + trend', usual: 'Usual only', unavailable: 'Not available' });
export function leanWords(row) {
  if (!row || row.kind === 'unavailable') return 'Not available';
  const unit = row.kind === 'seasonal' ? 'runs' : 'models', l = row.lean ?? { word: null, n: 0, of: 0 };
  if (!l.of) return 'Usual month, no model';
  if (l.word) return `${l.word[0].toUpperCase()}${l.word.slice(1)} · ${l.word} in ${l.n} of ${l.of} ${unit}`;
  return `No clear lean · warmer in ${l.warm ?? 0}, cooler in ${l.cool ?? 0} of ${l.of} ${unit}`;
}
export const OUTLOOK_HINT = 'Counts of model runs or models, never a chance.';
export const NO_YEARS = 'Too few NASA years here for this month.';
export function kindsLine(span, monthNames) {
  const [fy, fm] = span.from.split('-').map(Number), [ty, tm] = span.to.split('-').map(Number), a = `${monthNames[fm - 1]} ${fy}`, b = `${monthNames[tm - 1]} ${ty}`;
  return `${a}${span.n > 1 ? ` to ${b}` : ''} (${span.n} ${span.n === 1 ? 'month' : 'months'}): ${span.kind === 'seasonal' ? 'the usual month, moved by the European seasonal forecast' : span.kind === 'trend' ? 'the usual month, moved by the trend of the climate models' : span.kind === 'usual' ? 'the usual month only' : 'not available'}.`;
}

// ---- years ahead: counts of the past years each climate model hurts, beside the years as they really were
export function yearsHeadline({ plan, field, around = 2045, years, min, max, models, real }) {
  if (!(years > 0) || !(models > 0)) return 'There are no climate models to count here.';
  const range = min === max ? `${min} times` : `${min} to ${max} times`;
  return `${plan} on ${field}, around ${around}, high path: your ${years} past seasons, changed the way each climate model says, are hurt ${range} out of ${years}, across ${models} models.${Number.isFinite(real) ? ` As they really were: hurt in ${real} of ${years}.` : ''}`;
}
export const YEARS_LIMITS = Object.freeze([
  'Each model’s copy reuses the same real years, shifted. It does not invent longer droughts than those years held. Only one emissions path is shown; a middle path is not available yet.',
  'Each climate model’s change for one month comes from only 10 of its years (2041 to 2050), so part of it is chance: read the spread across the models, not one model.',
  'Each model is one vote: model weather is never averaged across models.',
]);
export const warmingLine = (lo, hi) => `Warming of daytime highs by the 2040s here: +${lo.toFixed(1)} to +${hi.toFixed(1)} °C, depending on the model.`;

// ---- this season's headline: counts of possible seasons with the lean and the same past years without it. "About N in 10" appears only beside the real counts.
export function seasonHeadline({ plan, field, year, lean, usual, runs, years }) {
  const total = lean.runs, tenth = aboutInTen(lean.hurt, total);
  const hurt = lean.hurt ? `about ${tenth} in 10 of ${total.toLocaleString('en-US')} possible seasons are hurt (${lean.hurt.toLocaleString('en-US')})` : `none of the ${total.toLocaleString('en-US')} possible seasons is hurt`;
  const close = lean.close ? `, and ${lean.close.toLocaleString('en-US')} ${lean.close === 1 ? 'is a close call' : 'are close calls'}` : '';
  return `${plan} on ${field}, ${year}: with this forecast’s lean, ${hurt}${close} (${runs} runs × ${years} past years). The same ${years} past years with no lean: hurt in ${usual.hurt} of ${usual.runs}, close calls in ${usual.close}.`;
}
export const runByRun = (min, max, years) => (min === max ? `Run by run, ${min} of the ${years} past years ${min === 1 ? 'is' : 'are'} hurt.` : `Run by run, between ${min} and ${max} of the ${years} past years are hurt.`);
export const NOT_SEPARATE = (runs, years) => `These are ${runs} forecast runs laid over the same ${years} past years, so they are not ${(runs * years).toLocaleString('en-US')} separate outcomes.`;
export const seasonEnds = (month, names) => { const [y, m] = month.split('-').map(Number); return `The seasonal forecast ends in late ${names[m - 1]} ${y}. After that, these futures use the past years as they were.`; };
export const LOOKAHEAD_CREDIT = 'Weather data by Open-Meteo.com (CC BY 4.0), used under its free, non-commercial terms. Only your farm’s place, rounded to about 10 km, is sent. Nothing from Look ahead is saved with your farm.';
export const CLIMATE_BUTTON_NOTE = 'This reads 7 climate models and takes about 4 minutes the first time, then opens at once.';
export const OUTLOOK_TREND_NOTE = 'The usual months come from your farm’s NASA weather since 2001. The trend needs the 7 climate models, which take about 4 minutes the first time and then open at once.';
export const RULES = Object.freeze([
  ['The four ways', 'Next 2 weeks reads the weather forecast. This season reads the European seasonal forecast. Next 2 years has no forecast at all: it is the usual month, moved by what the seasonal and climate models say. Years ahead reads seven climate models.'],
  ['How model weather is put on NASA’s footing', 'Model weather is never used raw. For the next 2 weeks each model’s own run is compared with NASA’s record over the days they share, and the offset is taken off; with fewer than 5 shared days the run keeps its own weather and the page says so. A short overlap is a rough match (about ±0.5 °C). Rain is not corrected. A field’s height shifts the temperature by 6.5 °C for each 1,000 m.'],
  ['The same checks as the land history', 'Every future is judged by the same checks as your land history and your plan, and counted. It never adds models together and never plays an average.'],
  ['The limits', 'The seasonal futures reuse the same past years for every run, so their count is not that many separate outcomes. They cannot make a kind of season the past years did not hold. The climate copies move the average of each month; they do not make longer droughts or new kinds of years. The weather grid is about 50 km wide, so one field can differ.'],
  ['What this does not cover', NOT_SIMULATED],
]);
