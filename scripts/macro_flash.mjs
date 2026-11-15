// The flash check of the big animations: flashCount(frames, { block: [341, 256] }) finds, for every 341 × 256 px block of a screen recording, the changes in relative
// luminance of 10 % or more, pairs the opposing ones, and fails at two or more pairs within any one second (the limit is three; this keeps a margin).
// Pure: it reads only the frames it is given. Used by scripts/macro_harness.mjs; checked by scripts/test_macro.mjs (a 4 Hz flicker fails, one 300 ms rise is one change).
/*
 * A frame is { t, width, height, data } with data the RGBA bytes of the picture (four per pixel), or { t, width, height, lum } with lum one relative luminance (0..1) per pixel.
 * A block is judged by its mean luminance, so a flash over a quarter of a block still moves the mean by a quarter of its size. A change counts only when its darker end is
 * below 0.8, as the general flash threshold says. Changes are found as turns of at least 10 %, so a slow ramp is one change, however many frames it takes.
 * Decisions taken after review:
 * - Four grids are judged, the plain one and three moved by half a block (across, down, both), and the worst counts, so a flash on a corner of four blocks is not
 *   shared out and lost. The moved grids judge whole blocks only; the edges are the plain grid's.
 * - The saturated red of each block is followed too (the general flash threshold counts it on its own): for a pixel whose red share R / (R + G + B) is 0.8 or more,
 *   (R - G - B) x 320 / 255, else 0; a change of 20 or more counts, in the same pairs-per-second rule. Only pictures (RGBA bytes) have it.
 * - A recording whose frames are too far apart cannot show a flicker at its own rate: when the median gap is over 50 ms or the largest over 100 ms, the answer is
 *   a fail with judged: false and the reason, never a pass.
 */
const lin = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const LUT = Float64Array.from({ length: 256 }, (_, i) => lin(i));
export const luminance = (r, g, b) => 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b];

// The saturated red of one pixel: (R - G - B) x 320 / 255 when red is 0.8 or more of it, else 0.
export const redOf = (r, g, b) => { const all = r + g + b; return all > 0 && r / all >= 0.8 ? ((r - g - b) * 320) / 255 : 0; };

// The mean luminance (and, for pictures, the mean saturated red) of each block of one frame, row by row of blocks. With no offset the last row and column may be
// partly outside the picture; a grid moved by [ox, oy] has whole blocks only.
export function blockMeans(frame, [bw, bh] = [341, 256], [ox, oy] = [0, 0]) {
  const { width: w, height: h } = frame, moved = ox > 0 || oy > 0;
  const cols = moved ? Math.max(0, Math.floor((w - ox) / bw)) : Math.ceil(w / bw), rows = moved ? Math.max(0, Math.floor((h - oy) / bh)) : Math.ceil(h / bh);
  const sum = new Float64Array(cols * rows), red = new Float64Array(cols * rows), n = new Uint32Array(cols * rows), x1 = moved ? ox + cols * bw : w, y1 = moved ? oy + rows * bh : h;
  for (let y = oy; y < y1; y++) {
    const by = Math.floor((y - oy) / bh) * cols;
    for (let x = ox; x < x1; x++) {
      const i = y * w + x, b = by + Math.floor((x - ox) / bw);
      if (frame.lum) sum[b] += frame.lum[i];
      else { const r = frame.data[i * 4], g = frame.data[i * 4 + 1], bl = frame.data[i * 4 + 2]; sum[b] += luminance(r, g, bl); red[b] += redOf(r, g, bl); }
      n[b]++;
    }
  }
  return { cols, rows, means: Array.from(sum, (s, b) => (n[b] ? s / n[b] : 0)), reds: frame.lum ? null : Array.from(red, (s, b) => (n[b] ? s / n[b] : 0)) };
}

// The changes of one series of [t, luminance]: each a move of at least `step` between two turning points, with its start, end and direction.
// A change starts at the last moment the value sat at its low (or high) and ends at the first moment it reached its new high (or low), so "quickest" is honest.
export function changesOf(series, { step = 0.1, darkBelow = 0.8 } = {}) {
  const out = []; if (series.length < 2) return out;
  const push = (a, b) => { const d = b.v - a.v; if (Math.abs(d) >= step && Math.min(a.v, b.v) < darkBelow) out.push({ from: a.last, to: b.first, dir: Math.sign(d), size: Math.abs(d) }); };
  const at = p => ({ v: p[1], first: p[0], last: p[0] });
  let lo = at(series[0]), hi = at(series[0]), anchor = null, peak = null, dir = 0;
  for (const p of series.slice(1)) {
    const v = p[1];
    if (dir === 0) {   // not yet moving: watch the lowest and highest so far
      if (v < lo.v) lo = at(p); else if (v === lo.v) lo.last = p[0];
      if (v > hi.v) hi = at(p); else if (v === hi.v) hi.last = p[0];
      if (v - lo.v >= step) { dir = 1; anchor = lo; peak = at(p); } else if (hi.v - v >= step) { dir = -1; anchor = hi; peak = at(p); }
      continue;
    }
    if ((v - peak.v) * dir > 0) { peak = at(p); continue; }   // still going the same way
    if (v === peak.v) { peak.last = p[0]; continue; }        // holding at the turn
    if (Math.abs(v - peak.v) >= step) { push(anchor, peak); anchor = peak; peak = at(p); dir = -dir; }   // it has turned
  }
  if (dir !== 0) push(anchor, peak);
  return out;
}

// The most pairs of opposing changes that end within one second of each other.
function pairsInASecond(changes, windowMs = 1000) {
  let most = 0;
  for (let i = 0; i < changes.length; i++) { let n = 0; for (let j = i; j < changes.length && changes[j].to - changes[i].to < windowMs; j++) n++; most = Math.max(most, Math.floor(n / 2)); }
  return most;
}

export function flashCount(frames, { block = [341, 256], step = 0.1, limit = 2, redStep = 20, medianGap = 50, largestGap = 100 } = {}) {
  const list = (frames || []).filter(f => f && f.width > 0 && f.height > 0).sort((a, b) => a.t - b.t);
  if (!list.length) return { fail: false, judged: false, pairs: 0, changes: 0, quickest: null, blocks: 0, worst: null };
  const gaps = list.slice(1).map((f, i) => f.t - list[i].t).sort((a, b) => a - b), median = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : 0, largest = gaps.at(-1) ?? 0;
  if (median > medianGap || largest > largestGap) return { fail: true, judged: false, reason: `frames too far apart to see a flicker (median ${Math.round(median)} ms, largest ${Math.round(largest)} ms)`, pairs: 0, changes: 0, quickest: null, blocks: 0, worst: null };
  const [bw, bh] = block, offsets = [[0, 0], [Math.floor(bw / 2), 0], [0, Math.floor(bh / 2)], [Math.floor(bw / 2), Math.floor(bh / 2)]];
  let worst = null, pairs = 0, changes = 0, quickest = null, blocks = 0;
  for (const offset of offsets) {
    const grids = list.map(f => blockMeans(f, block, offset)), { cols, rows } = grids[0];
    if (!offset[0] && !offset[1]) blocks = cols * rows;
    for (let b = 0; b < cols * rows; b++) {
      const kinds = [['luminance', changesOf(grids.map((g, i) => [list[i].t, g.means[b] ?? 0]), { step })]];
      if (grids[0].reds) kinds.push(['red', changesOf(grids.map((g, i) => [list[i].t, g.reds[b] ?? 0]), { step: redStep, darkBelow: Infinity })]);
      for (const [kind, found] of kinds) {
        const p = pairsInASecond(found);
        if (kind === 'luminance') for (const c of found) { const ms = c.to - c.from; if (quickest === null || ms < quickest) quickest = ms; }
        if (p > pairs || (p === pairs && found.length > changes)) { pairs = p; changes = found.length; worst = { col: b % cols, row: Math.floor(b / cols), offset, kind, changes: found }; }
      }
    }
  }
  return { fail: pairs >= limit, judged: true, pairs, changes, quickest, blocks, worst };
}
