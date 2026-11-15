// The frame of the 3D view as markup: the picture's place with its skeleton (a still sketch of the land, "Building your field in 3D…", a progress line,
// Back to the Map), the camera buttons, and the legend and words beside the picture. My farm puts it on screen in the same moment as the tap, before any 3D file loads.
// Pure: no page, no network. Checked by scripts/e2e_3d_open.mjs (a skeleton within 100 ms of the tap; it shimmers only under Full) and scripts/e2e_farm3d.mjs.
import { esc } from './words.js';
import { SWITCH_ON } from './shade3d.js';
import { SWITCHES, OSM_CREDIT } from './land3d-data.js';

export const LEGEND = Object.freeze([
  { id: 'standing', name: 'Standing plants', mark: '<path d="M6 20V6M12 20V3M18 20V7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>' },
  { id: 'residue', name: 'Residue left after harvest', mark: '<path d="M3 17l7-2M12 18l8-2M5 21l6-1M14 12l6-1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>' },
  { id: 'bare', name: 'Bare soil', mark: '<path d="M3 18h18M3 13h18" stroke="currentColor" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round" fill="none"/>' },
]);
export const legendFor = cover => cover?.kind === 'standing' || cover?.kind === 'young' ? 'standing' : cover?.kind || null;
export const KEYS_WORDS = 'Arrow keys move the view around the field. Plus and minus zoom. 0 goes back to the first view.';
export const FIRST_STEP = 'Loading the 3D tools';

// drawn icons, not font characters: a turning arrow has no glyph in most fonts and cost the page a slow first layout
const ICON = {
  left: '<path d="M4 5v5h5"/><path d="M4.6 10A8 8 0 1 1 6 16.3"/>',
  right: '<path d="M20 5v5h-5"/><path d="M19.4 10A8 8 0 1 0 18 16.3"/>',
  in: '<path d="M12 5v14M5 12h14"/>',
  out: '<path d="M5 12h14"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
const TOOLS = [['left', 'Turn left'], ['right', 'Turn right'], ['in', 'Zoom in'], ['out', 'Zoom out']];

// words: null while nothing is known yet (grey lines take their place, and there is no canvas yet); else { label, legend (the legend id shown), lines: [{ cls, text }], aria, stamp }
// compact: My farm, whose top row already shows the date, the plan and Planned: the label line is kept for screen readers only, never drawn a second time
// back: a Back to the Map button in the skeleton
// The shade: a switch, the hour shown (when it is on) and the words the shade job gives, with "Shade figures are about, to the half hour." The hour range is filled by the page from the day's sunrise and sunset.
export function shadeHTML(ids, on = false) {
  return `<section class="f3d-shade" aria-labelledby="${ids}-shade-h">
      <h3 id="${ids}-shade-h">Shade</h3>
      <label class="f3d-sw"><input type="checkbox" data-shade${on ? ' checked' : ''}><span>Show the shade of the land</span></label>
      <div class="f3d-hour"${on ? '' : ' hidden'}><label for="${ids}-hour">Hour shown</label><input type="range" id="${ids}-hour" data-hour step="10" min="0" max="1440" value="720" aria-describedby="${ids}-hour-out"><output id="${ids}-hour-out" class="f3d-hour-out"></output></div>
      <div class="f3d-shade-words" data-shade-words aria-live="polite"><p class="f3d-sw-words">${esc(on ? SWITCH_ON : 'Switch it on to see where the shade of the land falls at an hour you pick. It is worked out from the height map, so it needs the heights.')}</p></div>
    </section>`;
}
// The "Details on the land" switches: one checkbox for each, with the words of its state beneath (filled by the page as the maps answer); the credit OpenStreetMap asks for shows only while its map is drawn.
export function landHTML(ids, choice = {}) {
  return `<section class="f3d-land" aria-labelledby="${ids}-land-h">
      <h3 id="${ids}-land-h">Details on the land</h3>
      <p class="f3d-land-hint">Switch on what you want to see. Each one is read from its map only when you switch it on, and says so when it cannot be read.</p>
      <ul class="f3d-switches">${SWITCHES.filter(s => s.id !== 'shade').map(s => `<li><label class="f3d-sw"><input type="checkbox" data-land="${s.id}"${choice[s.id] === true ? ' checked' : ''}><span>${esc(s.name)}</span></label><small class="f3d-lw-words" data-land-words="${s.id}">${esc(s.line)}</small></li>`).join('')}</ul>
      <p class="f3d-land-credit" hidden><a href="${esc(OSM_CREDIT.href)}" target="_blank" rel="noopener noreferrer">${esc(OSM_CREDIT.text)}</a></p>
      <p class="sr f3d-land-say" role="status" aria-live="polite"></p>
    </section>`;
}
export function shellHTML({ ids = 'f3d', compact = false, words = null, back = false, shade = null, land = null } = {}) {
  const side = words
    ? `<ul class="f3d-legend" aria-label="What the shapes mean">${LEGEND.map(l => `<li class="${l.id === words.legend ? 'is-on' : ''}"${l.id === words.legend ? ' aria-current="true"' : ''}><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${l.mark}</svg><span>${l.name}</span></li>`).join('')}</ul>
      <div class="f3d-words" aria-live="polite">${words.lines.filter(l => !l.more).map(l => `<p${l.cls ? ` class="${l.cls}"` : ''}>${esc(l.text)}</p>`).join('')}</div>
      <details class="f3d-more"><summary>Show more</summary><div class="f3d-more-body"><div class="f3d-more-lines">${words.lines.filter(l => l.more).map(l => `<p${l.cls ? ` class="${l.cls}"` : ''}>${esc(l.text)}</p>`).join('')}</div><p class="f3d-keys" id="${ids}-keys">${KEYS_WORDS}</p></div></details>`
    : `<div class="f3d-legend f3d-sk-rows" aria-hidden="true"><span class="sk pill"></span><span class="sk pill"></span><span class="sk pill"></span></div>
      <div class="f3d-words f3d-sk-rows" aria-hidden="true"><span class="sk title"></span><span class="sk"></span><span class="sk"></span><span class="sk"></span></div>`;
  return `<div class="f3d${compact ? ' f3d-compact' : ''}${words ? '' : ' f3d-boot'}" data-state="building">
    ${compact ? (words ? `<p class="f3d-label sr" id="${ids}-label">${words.label}</p>` : '') : `<div class="f3d-bar"><p class="f3d-label" id="${ids}-label">${words ? words.label : '<span class="sk title" aria-hidden="true"></span>'}</p></div>`}
    <div class="f3d-main">
      <div class="f3d-stage" tabindex="0" role="application" aria-label="${esc(words?.aria || '3D view of the field, being built')}" aria-describedby="${words ? `${ids}-label ` : ''}${ids}-keys" aria-busy="true" ${words?.stamp || ''}>
        ${words ? '<canvas class="f3d-canvas" aria-hidden="true"></canvas>' : ''}
        <div class="f3d-sk" role="status">
          <div class="f3d-sk-land" aria-hidden="true"><span class="sk f3d-sk-slab"></span><span class="sk f3d-sk-field"></span></div>
          <div class="f3d-sk-card">
            <p class="f3d-sk-title">Building your field in 3D…</p>
            <div class="f3d-sk-bar" role="progressbar" aria-label="Building the 3D view" aria-valuemin="0" aria-valuemax="100" aria-valuenow="5" aria-valuetext="${FIRST_STEP}"><i style="transform: scaleX(.05)"></i></div>
            <p class="f3d-sk-step" aria-hidden="true">${FIRST_STEP}</p>
            ${back ? '<button type="button" class="btn lg f3d-back" data-act="back">Back to the Map</button>' : ''}
          </div>
        </div>
        <div class="f3d-tools" role="group" aria-label="Camera">${TOOLS.map(([act, name]) => `<button type="button" class="f3d-btn" data-act="${act}" aria-label="${name}" disabled>${icon(act)}</button>`).join('')}<button type="button" class="f3d-btn f3d-reset" data-act="reset" disabled>Reset view</button></div>
        <p class="f3d-wait" role="status" hidden></p>
      </div>
      <div class="f3d-side">
        ${side}
        ${words ? '' : `<p class="f3d-keys" id="${ids}-keys">${KEYS_WORDS}</p>`}
        ${shade !== null && words ? shadeHTML(ids, shade) : ''}
        ${land && words ? landHTML(ids, land) : ''}
      </div>
    </div>
  </div>`;
}
