// Crophalo's share model: the report as plain data for the texts, the card, the adviser page and the downloads. It names three strategies (what you grow now, our suggestion or an option worth a look, and another option), not one, and
// keeps the farmer's own notes and soil test apart so each leaves only when ticked. Pure: no page, no storage, no network.
// Checked by scripts/test_sharemodel.mjs (three strategies in each output, the warnings from the forecast, the farmer's notes and the soil test only when handed in, a garden, a missing answer).
import { strategies, optionLabel, planName, optionLabels, repeatNote, coverSummary, bareInfo, hasScore, ASK_ADVISER, strategyDetail, sourceNotes, windowLines, labelParts, isKeepAnswer } from './report-view.js';
import { cropName } from './crops.js';
import { describe } from './soiltest.js';
import { shortDay } from './sharetext.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const ROLE_WORDS = { now: 'What you grow now', suggest: 'Our suggestion', worth: 'An option worth a look', another: 'Another option' };
const yearLine = s => `${cropName(s.crop, true) || s.crop}${/^\d{4}-\d{2}-\d{2}$/.test(s.sow ?? '') ? `, sow about ${shortDay(s.sow)}` : ''}${/^\d{4}-\d{2}-\d{2}$/.test(s.harvest ?? '') ? `, harvest about ${shortDay(s.harvest)}` : ''}`;
export const yearsOf = plan => (plan?.seasons ?? []).map(yearLine);
const sourcesOf = list => { const keys = [...new Set((list ?? []).flatMap(e => (Array.isArray(e?.sources) ? e.sources : [])))]; return sourceNotes(keys).map(n => ({ name: n.name, who: n.who, url: n.url })); };

// Warnings from the next days of the forecast: frost (a night at 0 °C or below), heat (35 °C or more), heavy rain (25 mm or more in a day). Each names its days; none when the forecast was not read.
export function warningsFrom(days) {
  const list = Array.isArray(days) ? days : [], out = [];
  const frost = list.filter(d => fin(d.lo) && d.lo <= 0), heat = list.filter(d => fin(d.hi) && d.hi >= 35), rain = list.filter(d => fin(d.rain) && d.rain >= 25);
  if (frost.length) out.push({ kind: 'frost', days: frost.map(d => d.name), value: `${Math.round(Math.min(...frost.map(d => d.lo)))}C` });
  if (heat.length) out.push({ kind: 'heat', days: heat.map(d => d.name), value: `${Math.round(Math.max(...heat.map(d => d.hi)))}C` });
  if (rain.length) out.push({ kind: 'rain', days: rain.map(d => d.name), value: `${Math.round(Math.max(...rain.map(d => d.rain)))}mm` });
  return out;
}
// One strategy as the share outputs read it.
export function strategyOf(plan, result, role, labels) {
  const d = strategyDetail(plan, result), bare = bareInfo(plan);
  return { role, roleWords: ROLE_WORDS[role] ?? 'Option', headline: labels?.get(plan) ?? optionLabel(plan, result), crops: planName(plan), repeats: repeatNote(plan), years: yearsOf(plan), score: hasScore(plan) ? Math.round(plan.score) : null, scores: plan.scores ?? null,
    flag: plan.flag ?? null, why: d.why.join(' '), catch: d.risks[0] ?? '', gaps: d.gaps, risks: d.risks, benefits: d.benefits.map(b => b.text), bareMonths: bare ? bare.n : null, evidence: d.evidence.map(e => e.text) };
}
// state: the farmer's answers; result: the engine's answer; weather: the report's weather (days), notes: [{ date, text, photo, kind }] the farmer chose to include.
export function buildShareReport({ state, result, weather = null, notes = [], madeOn = '', baseNote = '' } = {}) {
  const loc = state?.loc ?? {}, garden = !!state?.rotation?.garden, ha = fin(state?.area?.ha) ? state.area.ha : null;
  const base = { name: state?.name || loc.label || 'My field', place: { label: loc.label ?? '', lat: loc.lat, lon: loc.lon, ha }, area: state?.area?.pts ? { pts: state.area.pts } : null, madeOn, garden, warnings: warningsFrom(weather?.days), notes: Array.isArray(notes) ? notes : [],
    soilTestLines: describe(state?.soilTest), backupNote: baseNote || weather?.note || '', sources: [], suggestion: null, strategies: [], options: [], nowYears: [], nowScore: null, sowLine: '', frostNormal: '', checkFirst: [], supportLine: '' };
  if (!result?.recommended || result.ok === false) return base;
  const labels = optionLabels(result), st = strategies(result), keep = isKeepAnswer(result), rec = keep ? st.first[1] ?? null : result.recommended;
  const strategiesList = st.first.map(p => strategyOf(p, result, st.roles.get(p), labels));
  const sug = keep ? { headline: `Keep ${planName(result.current)}`, years: yearsOf(result.current), score: hasScore(result.current) ? Math.round(result.current.score) : null, why: result.reason ?? '', catch: strategyDetail(result.current, result).risks[0] ?? '', gaps: strategyDetail(result.current, result).gaps }
    : { headline: `Try ${optionLabel(result.recommended, result)}`, years: yearsOf(result.recommended), score: hasScore(result.recommended) ? Math.round(result.recommended.score) : null, why: result.reason ?? '', catch: strategyDetail(result.recommended, result).risks[0] ?? '', gaps: strategyDetail(result.recommended, result).gaps, warning: windowLines(result.recommended).map(w => `${w.crop} should go in between ${w.earliest} and ${w.latest}.`).join(' ') };
  const first = (rec ?? result.recommended)?.seasons?.find(s => /^\d{4}-\d{2}-\d{2}$/.test(s.sow ?? ''));
  const frostLine = (Array.isArray(result.evidence) ? result.evidence : []).map(e => e?.text).find(t => typeof t === 'string' && /frost/i.test(t)) ?? '';
  const risks = [...strategyDetail(rec ?? result.recommended, result).risks, ...(Array.isArray(result.risks) ? result.risks : [])].filter((t, i, a) => a.indexOf(t) === i).slice(0, 4);
  return { ...base, suggestion: garden ? null : sug, strategies: garden ? [] : strategiesList, options: garden ? [] : strategiesList.filter(s => s.role !== 'now').map(s => ({ headline: s.headline, years: s.years, score: s.score, why: s.why, catch: s.catch, gaps: s.gaps })),
    nowYears: yearsOf(result.current), nowScore: hasScore(result.current) ? Math.round(result.current.score) : null, sowLine: first ? `Sow ${cropName(first.crop, true).toLowerCase()} from ${shortDay(first.sow)}` : '', frostNormal: frostLine, checkFirst: [...risks, ASK_ADVISER].slice(0, 5),
    sources: sourcesOf(result.evidence), supportLine: 'Crophalo supports your judgment. It does not replace it, or local advice.' };
}
// The weather record the way the season record reads it: { start, rain (satellite rain), rainModel, tmax, tmin }, day 0 = start, a day with no value null (never 0). null when the days are not one run.
const val = v => (fin(v) && v > -900 ? v : null), dash = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
export function statementSeries(series) {
  const days = series?.days; if (!Array.isArray(days) || days.length < 2) return null;
  const start = dash(String(days[0])), end = dash(String(days.at(-1))), span = Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 864e5) + 1;
  if (span !== days.length) return null;
  const col = key => (Array.isArray(series[key]) ? series[key].map(val) : days.map(() => null));
  return { start, rain: col('IMERG_PRECTOT'), rainModel: col('PRECTOTCORR'), tmax: col('T2M_MAX'), tmin: col('T2M_MIN') };
}
// The table of strategies for the spreadsheet (csvOf): the three first, then the others.
export function csvReport(shared, result) {
  if (!shared || shared.garden || !result?.recommended) return shared?.garden ? { name: shared.name, garden: true } : null;
  const st = strategies(result), labels = optionLabels(result);
  return { name: shared.name, garden: false, weatherSource: 'NASA POWER', options: [...st.first, ...st.more].map(p => { const b = bareInfo(p); return { name: labels.get(p) ?? optionLabel(p, result), type: p === result.current || p.id === result.current?.id ? 'What you grow now' : st.roles.get(p) ? ROLE_WORDS[st.roles.get(p)] : 'Option', score: hasScore(p) ? Math.round(p.score) : '', scores: p.flag === 'fails' ? null : p.scores ?? null, pestBreak: fin(p.pest) ? p.pest : '', bareMonths: b ? b.n : '', waterNeedMm: '', erosionExposure: p.erosionLevel ?? '' }; }) };
}
