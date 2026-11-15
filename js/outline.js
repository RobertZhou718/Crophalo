// A field's outline as a small figure, north up, longitude squeezed by the cosine of the latitude so a square field looks square; an estimated outline is labelled so.
// Pure: outlineSVG(). Checked by scripts/test_field_tab.mjs.
import { esc } from './words.js';
// The shape is fitted into a square of its own; the north arrow and its N stand in a gutter to the right of that square, in the picture's top right corner, so they never sit on the outline.
const GUTTER = 32;
export function outlineSVG(area, { size = 160, label = '' } = {}) {
  const pts = Array.isArray(area?.pts) ? area.pts.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) : [];
  if (pts.length < 3) return '';
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180), xy = pts.map(([la, lo]) => [lo * k, -la]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1e-9, h = maxY - minY || 1e-9, pad = 16, scale = (size - 2 * pad) / Math.max(w, h), ox = (size - w * scale) / 2 - minX * scale, oy = (size - h * scale) / 2 - minY * scale;
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * scale + ox).toFixed(1)} ${(y * scale + oy).toFixed(1)}`).join('') + 'Z';
  return `<svg class="outline${area.estimated ? ' is-estimated' : ''}" viewBox="0 0 ${size + GUTTER} ${size}" width="${size + GUTTER}" height="${size}" role="img" aria-label="${esc(label || (area.estimated ? 'An estimated outline of the field, north up' : 'The outline of the field, north up'))}" focusable="false"><path class="outline-shape" d="${d}"/>
    <path class="outline-n" d="M${size + GUTTER - 16} 30V12M${size + GUTTER - 16} 12l-4 7M${size + GUTTER - 16} 12l4 7"/><text class="outline-t" x="${size + GUTTER - 16}" y="44" text-anchor="middle">N</text></svg>`;
}
