// Crophalo's Field tab on screen, as pure markup: "Your land" as a list of tiles (soil, your soil test, slope, height, size, spot), the outline (drawn or estimated, always said),
// each with its "i". A figure not read says "Not read yet" with the reason; nothing is filled in.
// Pure: functions of plain data (js/field-data.js, js/outline.js) that return text. Checked by scripts/test_field_tab.mjs.
import { esc } from './words.js';
import { infoButton } from './report-view.js';
import { landTiles } from './field-data.js';
import { outlineSVG } from './outline.js';

const tile = t => `<div class="land-tile" data-land="${esc(t.id)}"><dt>${esc(t.term)} ${infoButton(t.sources, t.figure || t.term)}</dt><dd><b class="land-val">${esc(t.value)}</b><span class="cap">${esc(t.text)}</span></dd></div>`;
export function fieldHTML({ state, dem = null, outline = null, loading = false, soilTestHTML = '' }) {
  const tiles = landTiles({ state, dem: loading ? null : dem, outline });
  const fig = outlineSVG(outline, { label: outline?.estimated ? 'An estimated outline of the field, north up' : 'The outline you drew, north up' });
  return `<section class="rv-sec" aria-labelledby="fdTitle"><h2 id="fdTitle">Your land</h2>
    <p class="lead">What Crophalo knows about the ground itself, and where each figure comes from.</p>
    ${loading ? '<p class="cap" role="status" aria-live="polite">Reading the height map for slope and height…</p>' : ''}
    <div class="land-wrap">${fig ? `<figure class="land-fig">${fig}<figcaption class="cap">${outline.estimated ? 'Estimated: a 10 ha square round your pin, because no outline was drawn.' : 'The outline you drew.'}</figcaption></figure>` : ''}
      <dl class="land-list">${tiles.map(tile).join('')}</dl></div>${soilTestHTML ? `<div id="stHost" class="land-soiltest"><p class="cap" id="stStatus" role="status" aria-live="polite"></p>${soilTestHTML}</div>` : ''}</section>`;
}
