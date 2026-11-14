// Crophalo's two data downloads of a report: a table of the options as CSV, and every figure the report holds as JSON. A farmer's notes go in the JSON as
// words only (never the picture), the crop history never does, and a garden has no options to compare.
// Pure: csvOf(), jsonOf(), fileName(). The download itself is the page's job.
// Checked by scripts/test_sharetext.mjs (the columns, the quoting, a formula in a cell, the guard for a garden, what the JSON holds and leaves out).
export const CSV_HEADER = Object.freeze(['Option', 'Type', 'Score for you', 'Water fit', 'Soil health', 'Soil wash-off', 'Income', 'Weather safety', 'Pest break', 'Bare-soil months', 'Crop water need mm/yr', 'Soil wash-off level']);
export const NO_OPTIONS = 'A garden has no options to compare, so there is no table.', NO_REPORT = 'Open the report first, then export it.';
const GUARD = /^[=+\-@\t\r]/;
// A cell as text, always quoted; a text that a spreadsheet would run as a formula gets an apostrophe in front. Numbers are written as they are.
export const cell = v => typeof v === 'number' && Number.isFinite(v) ? `"${v}"` : `"${(GUARD.test(String(v ?? '')) ? "'" : '') + String(v ?? '').replace(/"/g, '""')}"`;
export const fileName = (name, ext) => `crophalo-${String(name || 'field').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'field'}.${ext}`;
// report: { name, garden, options: [{ name, type, score, scores: { water, soil, erosion, income, weather }, pestBreak, bareMonths, waterNeedMm, erosionExposure }], weatherSource, advice }
export function csvOf(report) {
  if (!report) return { ok: false, message: NO_REPORT };
  if (report.garden || !Array.isArray(report.options) || !report.options.length) return { ok: false, message: NO_OPTIONS };
  const rows = [CSV_HEADER, ...report.options.map(o => [o.name, o.type, o.score, o.scores?.water, o.scores?.soil, o.scores?.erosion, o.scores?.income, o.scores?.weather, o.pestBreak, o.bareMonths, o.waterNeedMm, o.erosionExposure])];
  const text = [...rows.map(r => r.map(cell).join(',')), ['Weather source', report.weatherSource ?? 'NASA POWER'].map(cell).join(','), ['Advice', report.advice ?? 'A guide, not advice. You decide.'].map(cell).join(',')].join('\r\n') + '\r\n';
  return { ok: true, text, name: fileName(report.name, 'csv'), type: 'text/csv;charset=utf-8' };
}
// report (plain data): { generated, inputs (the serialised state), soil, terrain, climate, thisYear, garden, strategies, notes: [{ date, text, photo, kind }], live: {...} }
export function jsonOf(report, now = Date.now()) {
  if (!report) return { ok: false, message: NO_REPORT };
  const notes = (Array.isArray(report.notes) ? report.notes : []).map(n => ({ date: String(n?.date ?? ''), text: String(n?.text ?? ''), photo: n?.photo === true, kind: String(n?.kind ?? 'free') }));
  const body = { generated: new Date(now).toISOString(), tool: 'Crophalo', disclaimer: 'A guide, not advice. You decide.', inputs: report.inputs ?? null, soil: report.soil ?? null, terrain: report.terrain ?? null, climate: report.climate ?? null, thisYear: report.thisYear ?? null,
    garden: report.garden ?? null, strategies: report.strategies ?? [], notes, live: report.live ?? {} };
  return { ok: true, text: JSON.stringify(body, null, 2), name: fileName(report.name, 'json'), type: 'application/json' };
}
