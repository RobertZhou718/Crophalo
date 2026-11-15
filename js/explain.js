// The Data page's "How to read Crophalo" folds as pure markup: the words explained, satellite and ground, the square-size pictures drawn from data with their table, how Crophalo decides,
// how crops help the soil, and the reminder; also the word "i" and its card for other screens. Pure: functions of plain data (js/words.explain.js, the crop and source tables) that return text.
// Checked by scripts/test_explain.mjs (every fold, every word, the pictures to scale, the table, the crop lists from the table, sources, plain-text escaping); on the page by scripts/e2e_explain.mjs.
import { esc } from './words.js';
import { SOURCES } from './sources.js';
import './sources.more.js';
import { CROPS, WHAT_IT_DOES, cropName } from './crops.js';
import { DIMS } from './engine.js';
import { SURE_WORDS } from './report-view.js';
import { EX, TERMS, REFS, FROST_CHECK, FOOTPRINTS, PANELS, ROLES, ROLE_LIMITS, EXAMPLE_FIELD_HA } from './words.explain.js';

export const DEMO_LAT = 44.4438;   // the demo field near Barrie, Ontario: the latitude that turns the grids in degrees into metres
const fin = v => typeof v === 'number' && Number.isFinite(v);
const own = (t, k) => typeof k === 'string' && Object.hasOwn(t, k);
export const refOf = key => own(REFS, key) ? REFS[key] : own(SOURCES, key) ? { name: SOURCES[key].name, who: SOURCES[key].who, url: SOURCES[key].url } : null;
export const termOf = id => TERMS.find(t => t.id === id) ?? null;
const opens = `<span class="sr"> ${esc(EX.opens)}</span>`;
export const sourcesLine = keys => { const refs = keys.map(refOf).filter(Boolean); return refs.length ? `<p class="cap ex-src"><b>${esc(EX.sourcesWord)}:</b> ${refs.map(r => `<a class="link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}${opens}</a>`).join(', ')}.</p>` : ''; };
const firstLink = key => { const r = refOf(key); return r ? `<p class="cap ex-src ex-first"><a class="link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}${opens}</a></p>` : ''; };
const sentences = text => String(text).split(/(?<=[.!?])\s+/).filter(Boolean);
// A fold opens on at most four short sentences and one link to its source; everything else is under "Show more", closed
const fold = (id, part, lead, key, body) => `<details class="fold ex-fold" id="ex-${esc(id)}"><summary><span class="t">${esc(part.title)}</span></summary><div class="fold-b ex-b">
    <p class="ex-lead">${esc(lead.join(' '))}</p>${firstLink(key)}<details class="ex-more" id="ex-${esc(id)}-more"><summary>${esc(EX.more)}</summary>${body}</details></div></details>`;
const paras = list => list.map(p => `<p>${esc(p)}</p>`).join('');

// ---- the word "i" and its card
export const wordButton = id => { const t = termOf(id); return t ? `<button type="button" class="srci wordi" data-word="${esc(t.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="What “${esc(t.word)}” means"></button>` : ''; };
export function wordCardHTML(id) {
  const t = termOf(id); if (!t) return '';
  return `<div class="srcp-top"><span class="srcp-tags"><span class="src">${esc(EX.words.title)}</span></span><button type="button" class="srcp-x" aria-label="Close"><svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <section class="srcp-src"><h2 id="wordPopTitle" class="ex-card-title">${esc(t.word)}</h2><p class="cap">${esc(t.plain)}</p>${paras(t.say)}<p class="small"><b>${esc(EX.words.usesWord)}</b> ${esc(t.where)}</p>${sourcesLine(t.src)}
    <a class="link small" href="#data" data-word-go="${esc(t.id)}">${esc(EX.words.allWords)}</a></section>`;
}
const termHTML = t => `<section class="ex-term" aria-labelledby="ex-term-${esc(t.id)}"><h3 id="ex-term-${esc(t.id)}">${esc(t.word)} <span class="ex-plain">${esc(t.plain)}</span></h3>${paras(t.say)}
    <p class="small"><b>${esc(EX.words.usesWord)}</b> ${esc(t.where)}</p>${sourcesLine(t.src)}</section>`;

// ---- (3) the square sizes: metres from data, three pictures to scale, one table
export function metresOf(fp, lat = DEMO_LAT) {
  if (fp.deg) return { w: fp.deg[0] * 111320 * Math.cos(lat * Math.PI / 180), h: fp.deg[1] * 110574 };   // one degree of longitude shrinks with latitude; of latitude it stays about 110.6 km
  return { w: fp.w, h: fp.h };
}
const fieldSide = ha => Math.sqrt(ha * 1e4);
const kmText = m => m >= 1e3 ? `${(m / 1e3).toFixed(m >= 1e5 ? 0 : 1).replace(/\.0$/, '')} km` : `${Math.round(m)} m`;
const roundNice = n => n >= 100 ? Math.round(n / 10 ** (Math.floor(Math.log10(n)) - 1)) * 10 ** (Math.floor(Math.log10(n)) - 1) : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function againstField(fp, lat = DEMO_LAT, ha = EXAMPLE_FIELD_HA) {
  const { w, h } = metresOf(fp, lat), ratio = w * h / (ha * 1e4);
  return ratio >= 1.5 ? EX.grid.holds(thousands(roundNice(ratio))) : EX.grid.across(thousands(roundNice(fieldSide(ha) / w)));
}
const D = 200, LEG = 234, VW = 250, VH = 210;   // the drawing is a 200 by 200 square; numbered keys sit to its right, and their words are in the list under the picture (it grows with the text size)
export function panelSVG(panel, lat = DEMO_LAT, ha = EXAMPLE_FIELD_HA) {
  const k = D / panel.across, c = D / 2 + 5, next = PANELS[PANELS.indexOf(panel) + 1];
  const items = panel.show.map(id => id === 'field' ? { id, short: EX.grid.fieldLabel(ha), size: `${kmText(fieldSide(ha))} across`, w: fieldSide(ha), h: fieldSide(ha), field: true } : { ...FOOTPRINTS.find(f => f.id === id), ...metresOf(FOOTPRINTS.find(f => f.id === id), lat) });
  if (next) items.push({ id: 'next', short: EX.grid.nextBox, size: kmText(next.across), w: next.across, h: next.across, next: true });
  const rows = items.length, step = Math.min(42, (VH - 20) / rows);
  const shapes = items.map(it => ({ ...it, pw: Math.max(1, it.w * k), ph: Math.max(1, it.h * k) }));
  const rect = s => `<rect x="${(c - s.pw / 2).toFixed(1)}" y="${(c - s.ph / 2).toFixed(1)}" width="${s.pw.toFixed(1)}" height="${s.ph.toFixed(1)}" class="${s.field ? 'ex-field' : s.next ? 'ex-next' : 'ex-cell'}"/>`;
  const legend = (s, i) => { const y = 16 + i * step, x0 = c + s.pw / 2, y0 = c - s.ph / 2;
    return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${LEG - 11}" y2="${y.toFixed(1)}" class="ex-lead"/><circle cx="${LEG}" cy="${y.toFixed(1)}" r="10" class="ex-key-dot"/><text x="${LEG}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle" class="ex-lab">${i + 1}</text>`; };
  const desc = shapes.map(s => `${s.short}: ${s.next ? `the next picture, ${s.size} across` : s.size}`).join('; ');
  return `<figure class="ex-panel"><svg viewBox="0 0 ${VW} ${VH}" role="img" aria-labelledby="${panel.id}-t ${panel.id}-d" focusable="false"><title id="${panel.id}-t">${esc(panel.title)}</title><desc id="${panel.id}-d">${esc(desc)}.</desc>
      <rect x="5" y="5" width="${D}" height="${D}" class="ex-frame"/>${[...shapes].sort((a, b) => b.pw * b.ph - a.pw * a.ph).map(rect).join('')}${shapes.map(legend).join('')}</svg><figcaption><span class="cap">${esc(panel.title)}</span><ol class="ex-key">${shapes.map(s => `<li><b>${esc(s.short)}</b> <span class="ex-size">${esc(s.size)}</span></li>`).join('')}</ol></figcaption></figure>`;
}
export function footprintTable(lat = DEMO_LAT, ha = EXAMPLE_FIELD_HA) {
  const [a, b, cc, d] = EX.grid.cols;
  const size = fp => fp.deg ? `${fp.size} (${kmText(metresOf(fp, lat).w)} by ${kmText(metresOf(fp, lat).h)} here)` : fp.size;
  return `<div class="tbl" role="region" tabindex="0" aria-labelledby="exGridCap"><table class="ex-table"><caption id="exGridCap">${esc(EX.grid.tableCap)}</caption><thead><tr><th scope="col">${esc(a)}</th><th scope="col">${esc(b)}</th><th scope="col">${esc(cc)}</th><th scope="col">${esc(d)}</th></tr></thead><tbody>
    ${FOOTPRINTS.map(fp => `<tr><th scope="row">${esc(fp.name)}</th><td>${esc(size(fp))}</td><td>${esc(fp.how)}</td><td>${esc(againstField(fp, lat, ha))}</td></tr>`).join('')}
    <tr><th scope="row">${esc(EX.grid.fieldRow)}</th><td>${esc(`${ha} ha, about ${kmText(fieldSide(ha))} across`)}</td><td>${esc(EX.grid.fieldHow)}</td><td></td></tr></tbody></table></div>`;
}

// ---- (5) the crops of each role, picked from the crop table itself, so the list can never drift from it
export function roleCrops(id, table = CROPS) {
  const pick = { nfix: c => c.nfix > 0, cover: c => c.type === 'cover', deep: c => c.root >= ROLE_LIMITS.deepRoot, drought: c => c.drought >= ROLE_LIMITS.drought }[id];
  if (!pick) return [];
  return Object.keys(table).filter(k => table[k].type !== 'fallow' && pick(table[k])).map(k => table === CROPS ? cropName(k, true) : table[k].name).sort((x, y) => x.localeCompare(y));
}

// ---- the whole block. opts.lat: the field's latitude (the demo field's when none); opts.frostFixed: true when the climate code reads the first autumn frost with the stations' margin
export function explainHTML(opts = {}) {
  const lat = fin(opts.lat) && Math.abs(opts.lat) < 80 ? opts.lat : DEMO_LAT, f = FROST_CHECK, G = EX.ground, R = EX.grid, C = EX.decide, L = EX.leads(f);
  const words = fold('words', EX.words, L.words(TERMS.map(t => `${t.word.charAt(0).toLowerCase()}${t.word.slice(1)}`)), 'nasaveg', TERMS.map(termHTML).join(''));
  const ground = fold('ground', G, L.ground, 'eccc', `<h3>${esc(G.gaugeHead)}</h3>${paras(G.gauge)}${sourcesLine(['power'])}
    <h3>${esc(G.checkHead)}</h3><p>${esc(G.checkLead(f))}</p><p>${esc(G.agreed(f))}</p><p>${esc(G.late(f))}</p><p>${esc(opts.frostFixed ? G.fixed(f) : G.notYet(f))}</p>${sourcesLine(['eccc', 'power'])}
    <h3>${esc(G.yoursHead)}</h3><p>${esc(G.soilTest)}</p><p>${esc(G.gauge2(f))}</p><p class="ex-local">${esc(G.local)}</p>`);
  const grid = fold('grid', R, L.grid, 'power', `<p>${esc(R.lead(EXAMPLE_FIELD_HA))}</p><div class="ex-panels" role="group" aria-label="${esc(R.figTitle)}">${PANELS.map(p => panelSVG(p, lat)).join('')}</div>${footprintTable(lat)}
    <h3>${esc(R.timeHead)}</h3><p>${esc(R.time)}</p><h3>${esc(R.sureHead)}</h3>${paras(R.sure)}${sourcesLine([...new Set(FOOTPRINTS.map(fp => fp.src))])}`);
  const decide = fold('decide', C, L.decide, 'rules', `${paras(C.how)}<h3>${esc(C.partsHead)}</h3><dl class="ex-parts">${DIMS.map(d => `<dt>${esc(d.label)}</dt><dd>${esc(d.hint)} ${esc(C.parts[d.id] ?? '')}</dd>`).join('')}</dl><p>${esc(C.extra)}</p>
    <h3>${esc(C.sureHead)}</h3><p>${esc(C.sureLead)}</p><ul class="ex-sure">${Object.entries(SURE_WORDS).map(([level, words]) => `<li><b>${esc(level)}.</b> ${esc(words)}</li>`).join('')}</ul><p>${esc(C.sureHow)}</p>
    <h3>${esc(C.localHead)}</h3><ul>${C.local.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${sourcesLine(['rules'])}`);
  const crops = fold('crops', EX.crops, L.crops, 'sare', `${ROLES.map(r => `<section class="ex-role" aria-labelledby="ex-role-${r.id}"><h3 id="ex-role-${r.id}">${esc(r.title)}</h3><p>${esc(WHAT_IT_DOES[r.id] ?? '')}</p><p>${esc(r.line)}</p>
      <p class="small"><b>${esc(EX.crops.inTable)}</b> (${esc(EX.crops.how)} ${esc(r.pick)}): ${esc(roleCrops(r.id).join(', '))}.</p>${sourcesLine(r.src)}</section>`).join('')}<p class="cap">${esc(EX.crops.note)}</p>`);
  return `<section class="ex" id="explain" aria-labelledby="exTitle"><h2 id="exTitle">${esc(EX.heading)}</h2><p class="lead">${esc(EX.lead)}</p>
    <p class="ex-remind" id="exRemind"><b>${esc(EX.remind.title)}</b> ${esc(EX.remind.text)}</p>
    <div class="folds ex-folds">${words}${ground}${grid}${decide}${crops}</div></section>`;
}

