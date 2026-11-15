// Crophalo's weather band, THE RECORD ARRIVES: the daily highs of 2001 to 2025 from NASA POWER, one row a year, one column a day, coloured on a fixed scale; and the geometry of THE CURL that bends the 25 rows into 25 rings.
// The record is the report's own: the band shows the figures as they are, a missing day stays empty, and the picture never delays the report. Pure except recordBand(), which writes into the canvas it is given.
// With this file absent the report is exactly what it is without it. Checked by scripts/test_macro_record.mjs (the scale, the grid, gaps, leap days, the curl's start and end) and scripts/e2e_macro_report.mjs.
export const BAND = Object.freeze({ from: 2001, to: 2025, columns: 365, lo: -10, mid: 12, hi: 35 });
// A fixed scale, slate to amber through a pale stone; never the action blue. RGB at -10 °C, 12 °C and 35 °C: the numbers of --m-rec-cold, --m-rec-mild and --m-rec-hot in css/macro.css.
export const SCALE = Object.freeze({ lo: [95, 107, 120], mid: [184, 177, 160], hi: [212, 145, 30] });
export const CAPTION = 'Daily highs in the NASA weather square around your field (about 56 by 52 km), NASA POWER, 2001 to 2025. Scale: −10 °C to 35 °C. The 29th of February is left out.';
export const CURL_CAPTION = 'Worked out from this weather record and the field’s water, soil, wash-off and market figures.';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, t) => a + (b - a) * t;
// The colour of one daily high on the fixed scale: [r, g, b], or null when the day was not read.
export function tempColor(t, scale = SCALE, { lo = BAND.lo, mid = BAND.mid, hi = BAND.hi } = {}) {
  if (!fin(t)) return null;
  const c = Math.max(lo, Math.min(hi, t)), [a, b, k] = c <= mid ? [scale.lo, scale.mid, (c - lo) / (mid - lo)] : [scale.mid, scale.hi, (c - mid) / (hi - mid)];
  return [Math.round(lerp(a[0], b[0], k)), Math.round(lerp(a[1], b[1], k)), Math.round(lerp(a[2], b[2], k))];
}
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];   // days before each month in a common year
// The column of a date in a common year (0 to 364); the 29th of February has none.
export function columnOf(yyyymmdd) {
  const m = Math.floor(yyyymmdd / 100) % 100, d = yyyymmdd % 100;
  if (m < 1 || m > 12 || d < 1 || d > 31) return -1;
  if (m === 2 && d === 29) return -1;
  const c = CUM[m - 1] + d - 1;
  return c >= 0 && c < 365 ? c : -1;
}
// dates (YYYYMMDD numbers) and tmax (°C, NaN for a day not read) → { pixels, years, rows, columns, filled }. pixels is RGBA, rows × 365 × 4, a row a year from `from` to `to`; a day not read, a year not sent and a day after the record's end stay fully transparent.
export function bandPixels(dates, tmax, { from = BAND.from, to = BAND.to, scale = SCALE } = {}) {
  const rows = to - from + 1, columns = BAND.columns, pixels = new Uint8ClampedArray(rows * columns * 4), years = [];
  for (let y = from; y <= to; y++) years.push(y);
  let filled = 0;
  const n = Math.min(dates?.length ?? 0, tmax?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const date = dates[i], y = Math.floor(date / 10000), col = columnOf(date);
    if (y < from || y > to || col < 0) continue;
    const c = tempColor(tmax[i], scale);
    if (!c) continue;
    const o = ((y - from) * columns + col) * 4;
    pixels[o] = c[0]; pixels[o + 1] = c[1]; pixels[o + 2] = c[2]; pixels[o + 3] = 255; filled++;
  }
  return { pixels, years, rows, columns, filled };
}
// The years that have at least one day read, for the canvas's data-years attribute and the words under it.
export const yearsWithData = built => { const out = []; for (let r = 0; r < built.rows; r++) { let any = false; for (let c = 0; c < built.columns && !any; c++) any = built.pixels[(r * built.columns + c) * 4 + 3] > 0; if (any) out.push(built.years[r]); } return out; };

// Writes the whole band into a canvas once (one ImageData); the scene then only reveals it by dirty rectangles. Answers the built band, or null when there is no canvas to draw on.
export function recordBand(canvas, detail, opts = {}) {
  if (!canvas || !detail?.dates || !detail?.tmax) return null;
  const built = bandPixels(detail.dates, detail.tmax, opts);
  canvas.width = built.columns; canvas.height = built.rows;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  let image;
  try { image = new ImageData(built.pixels, built.columns, built.rows); } catch { image = ctx.createImageData(built.columns, built.rows); image.data.set(built.pixels); }
  built.image = image; built.ctx = ctx;
  canvas.dataset.years = yearsWithData(built).join(' ');
  return built;
}
// Reveals row r from the left up to k (0 to 1) of its width: a partial putImageData, no read-back.
export function revealRow(built, row, k) {
  if (!built?.ctx || !built.image) return;
  const w = Math.max(0, Math.min(built.columns, Math.round(built.columns * k)));
  if (w > 0) built.ctx.putImageData(built.image, 0, 0, 0, row, w, 1);
}
// Which rows are drawn, and how far, at time ms: a row a year, 70 ms apart, each 400 ms long, even pace (the 25 rows end at 24 × 70 + 400 = 2080 ms).
export const ROW_STAGGER = 70, ROW_MS = 400;
export const bandEnd = rows => (rows - 1) * ROW_STAGGER + ROW_MS;
export function rowProgress(ms, row) { return Math.max(0, Math.min(1, (ms - row * ROW_STAGGER) / ROW_MS)); }

// THE CURL: the 25 rows of the band become the 25 rings of the score. Every cell (a row, a slice of about 5 days) has four corners in the rectangle and four on the ring; at(t) gives them at t (0 to 1).
// fromBox and toBox are { x, y, w, h } in page pixels; the ring is centred in toBox with its outer radius half the shorter side and an inner radius of 45 in 100 of it.
export function curl(fromBox, toBox, built, { slices = 72, inner = 0.45 } = {}) {
  const rows = built.rows, columns = built.columns, count = rows * slices;
  const cx = toBox.x + toBox.w / 2, cy = toBox.y + toBox.h / 2, outer = Math.min(toBox.w, toBox.h) / 2, rin = outer * inner;
  const rect = new Float32Array(count * 8), ring = new Float32Array(count * 8), colors = new Uint8ClampedArray(count * 4), cut = Array.from({ length: slices + 1 }, (_, j) => Math.round(j * columns / slices));
  for (let i = 0; i < rows; i++) for (let j = 0; j < slices; j++) {
    const k = i * slices + j, x0 = fromBox.x + fromBox.w * j / slices, x1 = fromBox.x + fromBox.w * (j + 1) / slices, y0 = fromBox.y + fromBox.h * i / rows, y1 = fromBox.y + fromBox.h * (i + 1) / rows;
    rect.set([x0, y0, x1, y0, x1, y1, x0, y1], k * 8);
    const a0 = (j / slices) * Math.PI * 2 - Math.PI / 2, a1 = ((j + 1) / slices) * Math.PI * 2 - Math.PI / 2, r0 = rin + (outer - rin) * i / rows, r1 = rin + (outer - rin) * (i + 1) / rows;
    ring.set([cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0), cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1), cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1), cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)], k * 8);
    // the cell's colour: the mean of the days read in its slice (a gap stays transparent when no day of the slice was read)
    let r = 0, g = 0, b = 0, n = 0;
    for (let c = cut[j]; c < cut[j + 1]; c++) { const o = (i * columns + c) * 4; if (built.pixels[o + 3] > 0) { r += built.pixels[o]; g += built.pixels[o + 1]; b += built.pixels[o + 2]; n++; } }
    if (n) colors.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), 255], k * 4);
  }
  const out = new Float32Array(count * 8);
  return {
    count, rows, slices, colors, rect, ring, center: { x: cx, y: cy }, radius: { inner: rin, outer },
    at(t, into = out) { const u = Math.max(0, Math.min(1, t)); for (let m = 0; m < count * 8; m++) into[m] = rect[m] + (ring[m] - rect[m]) * u; return into; },
  };
}
const hexOf = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);   // a data colour for the canvas, made from its numbers
// Draws the curl's cells at t into a 2D context (the overlay canvas); cells with no colour are skipped.
export function drawCurl(ctx, shape, t) {
  const p = shape.at(t);
  for (let k = 0; k < shape.count; k++) {
    const o = k * 4; if (!shape.colors[o + 3]) continue;
    const q = k * 8;
    ctx.fillStyle = hexOf(shape.colors[o], shape.colors[o + 1], shape.colors[o + 2]);
    ctx.beginPath(); ctx.moveTo(p[q], p[q + 1]); ctx.lineTo(p[q + 2], p[q + 3]); ctx.lineTo(p[q + 4], p[q + 5]); ctx.lineTo(p[q + 6], p[q + 7]); ctx.closePath(); ctx.fill();
  }
}
