// Crophalo's field card: one page on paper for the cab or the store-room wall, for someone without a smartphone. The answer, the year-by-year plan, the
// frost line, what to check first (with empty boxes to tick by hand), and where the figures came from. Notes and the soil test are NEVER on it.
// Pure: outlineSVG(), fieldCardHTML(). printFieldCard() puts the card in a hidden print host, prints it alone and takes it away again; it needs the page.
// Checked by scripts/test_sharetext.mjs (the card's words, that notes and the soil test never appear, a garden's card, the outline's shape).
import { esc } from './words.js';
import { orderedWarnings, warningLine, position, longDay, GUIDE, isScore } from './sharetext.js';

// The field's outline as a small figure, north up. Longitude is squeezed by the cosine of the latitude so a square field looks square.
export function outlineSVG(area, size = 150) {
  const pts = Array.isArray(area?.pts) ? area.pts.filter(p => Array.isArray(p) && p.every(Number.isFinite)) : [];
  if (pts.length < 3) return '';
  const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180), xy = pts.map(([la, lo]) => [lo * k, -la]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1e-9, h = maxY - minY || 1e-9, pad = 14, scale = (size - 2 * pad) / Math.max(w, h);
  const ox = (size - w * scale) / 2 - minX * scale, oy = (size - h * scale) / 2 - minY * scale;
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * scale + ox).toFixed(1)} ${(y * scale + oy).toFixed(1)}`).join('') + 'Z';
  return `<svg class="fc-outline" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="The field's outline, north up"><path d="${d}" fill="#e3eedf" stroke="#1b5e20" stroke-width="2" stroke-linejoin="round"/>
    <path d="M${size - 14} 26V10M${size - 14} 10l-4 7M${size - 14} 10l4 7" fill="none" stroke="#333" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><text x="${size - 14}" y="38" font-size="10" text-anchor="middle" fill="#333">N</text></svg>`;
}
const ref = refs => Array.isArray(refs) && refs.length ? `<sup>${refs.filter(Number.isFinite).join(',')}</sup>` : '';
// The card's markup. report is the plain shape described in js/sharetext.js, plus sources: [{ name, who, url }] and suggestion.refs: [1, 2].
export function fieldCardHTML(report) {
  const r = report ?? {}, s = r.suggestion, w = orderedWarnings(r.warnings), where = [r.place?.label, position(r.place), Number.isFinite(+r.place?.ha) ? `${(+r.place.ha).toFixed(1)} ha` : ''].filter(Boolean).join(' · ');
  const fig = outlineSVG(r.area) || `<p class="fc-nofig">No outline drawn. The answer is for the place at ${esc(position(r.place))}.</p>`;
  const answer = r.garden
    ? `<h2>${esc(r.name || 'My field')}</h2><p class="fc-head">A tree or bush crop</p><p>There is no rotation to compare. Its weather, frost, rain, slope and soil are in the full report.</p>`
    : `<h2>Our suggestion</h2><p class="fc-head">${esc(s?.headline ?? 'Keep what you grow')}${ref(s?.refs)}</p>${s?.warning ? `<p class="fc-warn">${esc(s.warning)}</p>` : ''}${s?.why ? `<p>${esc(s.why)}</p>` : ''}${isScore(s?.score) ? `<p class="fc-score">Score ${Math.round(s.score)} out of 100${isScore(r.nowScore) ? ` (what you grow now: ${Math.round(r.nowScore)})` : ''}. A guide, not a chance of success.</p>` : ''}`;
  return `<article class="field-card"><header><p class="fc-brand">CROPHALO FIELD CARD</p><h1>${esc(r.name || 'My field')}</h1><p class="fc-where">${esc(where)}</p><p class="fc-made">Made ${esc(longDay(r.madeOn))}</p></header>
    <section class="fc-top"><div class="fc-figure">${fig}</div><div class="fc-answer">${answer}</div></section>
    ${!r.garden && Array.isArray(r.strategies) && r.strategies.length > 1 ? `<section><h3>${r.strategies.length === 3 ? 'Three strategies compared' : 'Strategies compared'}</h3><ul class="fc-strat">${r.strategies.map(x => `<li><b>${esc(x.roleWords ?? 'Option')}:</b> ${esc(x.headline)}${isScore(x.score) ? ` (score ${Math.round(x.score)} out of 100)` : x.flag === 'fails' ? ' (does not suit this place)' : ''}</li>`).join('')}</ul></section>` : ''}
    ${w.length ? `<section class="fc-box"><h3>Weather warnings this week</h3><ul>${w.map(x => `<li>${esc(warningLine(x))}</li>`).join('')}</ul></section>` : ''}
    ${!r.garden && Array.isArray(s?.years) && s.years.length ? `<section><h3>Year by year</h3><ol>${s.years.map(y => `<li>${esc(y)}</li>`).join('')}</ol></section>` : ''}
    ${r.frostNormal ? `<section><h3>Frost in a normal year</h3><p>${esc(r.frostNormal)}</p></section>` : ''}
    ${Array.isArray(r.checkFirst) && r.checkFirst.length ? `<section><h3>Check first</h3><ul class="fc-check">${r.checkFirst.map(x => `<li><span class="fc-boxmark" aria-hidden="true"></span>${esc(x)}</li>`).join('')}</ul></section>` : ''}
    <footer><p>${esc(GUIDE)}</p>${r.backupNote ? `<p>${esc(r.backupNote)}</p>` : ''}<p>Made ${esc(longDay(r.madeOn))} from NASA and other public data. Weather changes: check again before you sow.</p>
      ${Array.isArray(r.sources) && r.sources.length ? `<ol class="fc-sources">${r.sources.map(x => `<li>${esc([x.name, x.who, x.url].filter(Boolean).join('. '))}</li>`).join('')}</ol>` : ''}</footer></article>`;
}
// Print the card alone: its markup goes into a hidden host, the page gets one class that hides everything else, the title becomes the card's, and afterwards all of it is put back.
export function printFieldCard(doc, win, report) {
  const host = doc.createElement('div'), title = doc.title, root = doc.documentElement;
  host.id = 'printHost'; host.className = 'print-host'; host.innerHTML = fieldCardHTML(report);
  doc.body.append(host); root.classList.add('print-card'); doc.title = `Crophalo field card – ${report?.name || 'My field'}`;
  const done = () => { host.remove(); root.classList.remove('print-card'); doc.title = title; win.removeEventListener('afterprint', done); };
  win.addEventListener('afterprint', done);
  win.print();
  return done;   // called by the page too if the browser never says afterprint
}
