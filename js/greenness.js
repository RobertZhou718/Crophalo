// Crophalo's greenness history for the land history page: how green the land round your place was at its peak in each growing season since 2001, from NASA's MODIS 16-day greenness. A season with too few clear readings is a gap, never 0 and never a
// made-up peak; the lookup's own sentence and advice are shown as it gave them, and with no sentence only the seasons are shown. It is always said to be a 2 km patch round your place (250 m pixels) that can include roads, towns or woods.
// Pure: cleanGreenness(), greenLines(), greenChartSVG(). loadGreenness() asks the server's route once, in the background: the first time it can take 80 seconds, and the page never waits for it.
// Checked by scripts/test_greenness.mjs (a stand-in in the lookup's real shape: the steady Oxford answer, a browner and a greener one, gaps, partial seasons, hostile input).
import { esc } from './words.js';
import { once, spotKey } from './memo.js';
import { plainReason } from './satellites2-data.js';
import { apiUrl } from './api.js';

export const PATCH_WORDS = 'This is a 2 km patch round your place, read in 250 m pixels. It can include roads, towns or woods.';
export const READING_WORDS = 'Reading the greenness history from NASA’s satellite pictures. The first time this can take up to 80 seconds; the page does not wait for it.';
export const GREEN_DOWN = 'The greenness history did not answer, so none is shown.';
const fin = v => typeof v === 'number' && Number.isFinite(v);
const text = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
const year = v => (Number.isInteger(v) && v >= 1990 && v <= 2100 ? v : null);

// The lookup's answer rebuilt from known parts: { ok: true, seasons: [{ year, peak (0..1 | null), date, n, of, partial }], gaps: [year], partial: [year], sentence, advice, change, note } or { ok: false, reason }.
export function cleanGreenness(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.seasons)) return { ok: false, reason: plainReason(text(raw?.reason, 240), GREEN_DOWN) };
  const withoutList = Array.isArray(raw.years_without) ? raw.years_without.map(year).filter(v => v !== null) : [], partialList = Array.isArray(raw.partial_years) ? raw.partial_years.map(year).filter(v => v !== null) : [];
  const seen = new Map();
  for (const s of raw.seasons.slice(0, 60)) {
    const y = year(s?.year); if (y === null) continue;
    const peak = fin(s.peak) && s.peak >= -0.2 && s.peak <= 1 ? Math.round(s.peak * 100) / 100 : null;
    seen.set(y, { year: y, peak, date: /^\d{4}-\d{2}-\d{2}$/.test(s.peak_date ?? '') ? s.peak_date : '', n: fin(s.n) && s.n >= 0 ? Math.round(s.n) : null, of: fin(s.of) && s.of > 0 ? Math.round(s.of) : null, partial: s.partial === true || partialList.includes(y) });
  }
  for (const y of withoutList) seen.set(y, { ...(seen.get(y) ?? { year: y, date: '', n: 0, of: null }), peak: null, date: '', partial: false });   // a year the lookup names as without clear readings is a gap, whatever the list of seasons says
  const seasons = [...seen.values()].sort((a, b) => a.year - b.year);
  if (!seasons.length) return { ok: false, reason: plainReason(text(raw.reason, 240), GREEN_DOWN) };
  const change = raw.change && typeof raw.change === 'object' && ['greener', 'browner', 'steady'].includes(raw.change.kind) ? { kind: raw.change.kind, difference: fin(raw.change.difference) ? raw.change.difference : null } : null;
  return { ok: true, seasons, gaps: seasons.filter(s => s.peak === null).map(s => s.year), partial: seasons.filter(s => s.peak !== null && s.partial).map(s => s.year), sentence: text(raw.sentence, 400) || null, advice: text(raw.advice, 300) || null, change, note: text(raw.note, 300), window: text(raw.window, 40) || 'April to September', incomplete: text(raw.incomplete, 200), dataDate: text(raw.data_date, 20) };
}
// The sentences of the card, in this order: the lookup's own sentence (as given), its advice only when present, the gaps, the seasons with fewer clear readings, the 2 km patch. With no sentence the seasons alone are shown.
export function greenLines(g) {
  if (!g?.ok) return [g?.reason ?? GREEN_DOWN];
  const out = [];
  if (g.sentence) out.push(g.sentence); if (g.sentence && g.advice) out.push(g.advice);
  if (g.gaps.length) out.push(`No clear reading in ${g.gaps.join(', ')}: left as gaps, never as 0.`);
  if (g.partial.length) out.push(`Fewer clear readings in ${g.partial.join(', ')}.`);
  if (g.incomplete) out.push(g.incomplete);
  out.push(PATCH_WORDS); return out;
}
// One dot for each season's peak on a 0 to 1 scale; a gap is an empty marker on the baseline (never a dot at 0); a season with fewer clear readings is an outlined dot.
export function greenChartSVG(g, { w = 320, h = 120 } = {}) {
  const pad = { l: 30, r: 8, t: 8, b: 20 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, n = g.seasons.length, x = i => pad.l + (n === 1 ? iw / 2 : i / (n - 1) * iw), y = v => pad.t + ih - Math.max(0, Math.min(1, v)) * ih;
  const dots = g.seasons.map((s, i) => s.peak === null ? `<path class="gn-gap" d="M${(x(i) - 2.5).toFixed(1)} ${pad.t + ih - 5} l5 5 m-5 0 l5 -5"><title>${s.year}: no clear reading</title></path>` : `<circle class="gn-dot${s.partial ? ' partial' : ''}" cx="${x(i).toFixed(1)}" cy="${y(s.peak).toFixed(1)}" r="3"><title>${s.year}: ${s.peak}${s.partial ? ' (fewer clear readings)' : ''}</title></circle>`).join('');
  const ticks = [0, 0.4, 0.8].map(v => `<text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text><line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('');
  const lab = [g.seasons[0], g.seasons.at(-1)].map((s, i) => `<text class="ch-tick" x="${i ? w - pad.r : pad.l}" y="${h - 5}" text-anchor="${i ? 'end' : 'start'}">${s.year}</text>`).join('');
  return `<svg class="ch gn-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(`Peak greenness of each growing season, ${g.seasons[0].year} to ${g.seasons.at(-1).year}. 0 is bare ground and about 0.8 is thick green crop.${g.gaps.length ? ` ${g.gaps.length} ${g.gaps.length === 1 ? 'season has' : 'seasons have'} no clear reading.` : ''}`)}" focusable="false">${ticks}${dots}${lab}</svg>`;
}
export const greenTable = g => `<div class="tbl" tabindex="0" role="region" aria-label="The numbers: peak greenness by season"><table><caption class="sr">Peak greenness of each growing season</caption><thead><tr><th scope="col">Season</th><th scope="col">Peak</th><th scope="col">Clear readings</th></tr></thead><tbody>${[...g.seasons].reverse().map(s => `<tr><th scope="row">${s.year}</th><td>${s.peak === null ? 'No clear reading' : s.peak}</td><td>${s.n !== null && s.of ? `${s.n} of ${s.of}${s.partial ? ' (fewer)' : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>`;
// The card's item for the "What satellites saw" list. state: undefined (not asked), { status: 'loading' } | { status: 'error', reason } | { status: 'ok', result }.
export function greenItemHTML(state) {
  if (!state) return `<li><b>MODIS greenness since 2001:</b> Not read yet.</li>`;
  if (state.status === 'loading') return `<li><b>MODIS greenness since 2001:</b> <span role="status" aria-live="polite">${esc(READING_WORDS)}</span></li>`;
  if (state.status === 'error') return `<li><b>MODIS greenness since 2001:</b> ${esc(state.reason || GREEN_DOWN)}</li>`;
  const g = state.result, lines = greenLines(g);
  if (!g?.ok) return `<li><b>MODIS greenness since 2001:</b> ${esc(lines[0])}</li>`;
  return `<li class="gn-item"><b>MODIS greenness since 2001:</b>${greenChartSVG(g)}${lines.map(l => `<p class="cap">${esc(l)}</p>`).join('')}<details class="disc"><summary>The numbers</summary>${greenTable(g)}</details></li>`;
}
export function loadGreenness(loc, get = globalThis.fetch?.bind(globalThis)) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return Promise.resolve({ ok: false, reason: GREEN_DOWN });
  return once(spotKey('ndvihist', { lat, lon }), async () => { try { return cleanGreenness(await (await get(apiUrl(`/api/ndvihist?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`))).json()); } catch { return { ok: false, reason: GREEN_DOWN }; } });
}
