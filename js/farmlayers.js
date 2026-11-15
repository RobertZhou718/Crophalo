// The Layers panel of My farm's 3D view: one row for each layer the 3D drawing can lay over the land, with what the farmer sees, a loading sign, a plain sentence when it cannot be read, and the source under "Show more".
// Pure: layersModel() cleans the list the 3D handle gives, layersHTML() writes the panel in the map's own Layers look (the same classes). Checked by scripts/test_farmlayers.mjs.
import { esc } from './words.js';

// What the farmer sees, one line each (the 3D drawing sends its own line; these stand in when it sends none).
export const LINES = Object.freeze({
  picture: 'The satellite picture of this field, laid over the land.',
  slope: 'How steep the ground is, steeper in darker shades.',
  sunshade: 'Where the sun and the shade fall at the time of day shown.',
  erosion: 'Where running water is most likely to carry soil away.',
  frost: 'Low spots where cold air settles on clear nights.',
  greenness: 'How green each 30 m square of this field is, from the satellite.',
  objects: 'Buildings, roads and trees around the field.',
  plants: 'The plants of the plan, drawn on the field.',
});
// picture and plants are switches; the others draw one at a time over the picture, so the panel shows them as one choice.
export const SWITCHES = Object.freeze(['picture', 'plants']);
export const LAYERS_ICON = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4 3 9l9 5 9-5z"/><path d="m3 14 9 5 9-5"/></svg>';   // the setup map's own layers icon
const STATES = ['idle', 'loading', 'ready', 'failed'];

// raw: [{ id, name, line, on, state, source, date, needs, legend }] from handle.layers(); rows without an id or a name are dropped, so no empty promise is shown.
export function layersModel(raw) {
  return (Array.isArray(raw) ? raw : []).filter(l => l && typeof l.id === 'string' && l.id && typeof l.name === 'string' && l.name.trim()).slice(0, 12).map(l => ({
    id: l.id, name: l.name.trim(), on: l.on === true, state: STATES.includes(l.state) ? l.state : 'idle', needs: l.needs === true, group: SWITCHES.includes(l.id) ? 'switch' : 'one',
    line: typeof l.line === 'string' && l.line.trim() ? l.line.trim() : LINES[l.id] || '',
    source: typeof l.source === 'string' ? l.source.trim() : '', date: typeof l.date === 'string' ? l.date.trim() : '',
    legend: typeof l.legend === 'string' ? l.legend.trim() : Array.isArray(l.legend) ? l.legend.filter(x => x && typeof x.label === 'string').slice(0, 8).map(x => ({ label: x.label.trim(), color: typeof x.color === 'string' && /^#[0-9a-f]{3,8}$|^rgb\(|^hsl\(/i.test(x.color) ? x.color : '' })) : '',
  }));
}
// The sentence under a row: what is being read while it loads, a plain sentence when it cannot be read.
export const stateWords = row => row.state === 'loading' ? `Reading ${row.name.toLowerCase()}…` : row.state === 'failed' ? `${row.name} could not be read just now. Try again later.` : '';
export const buttonWords = model => { const n = model.filter(r => r.on).length; return n ? `Layers · ${n}` : 'Layers'; };

const legendHTML = l => !l ? '' : typeof l === 'string' ? `<span class="cap fw-llegend">${esc(l)}</span>` : `<span class="fw-llegend" role="list">${l.map(x => `<span role="listitem" class="fw-lkey">${x.color ? `<i style="background:${esc(x.color)}" aria-hidden="true"></i>` : ''}${esc(x.label)}</span>`).join('')}</span>`;
// ask: the row of a layer that waits for a figure given to the 3D look My farm can make by asking (greenness: "Find weak spots") gets that button.
export function layersHTML(model, { ask = {} } = {}) {
  const row = (r, kind) => {
    const s = r.state === 'failed' && /could not/i.test(r.line) ? '' : stateWords(r), wait = r.needs && r.state === 'idle', off = wait && !ask[r.id], bad = r.state === 'failed';
    const more = r.source || r.date ? `<details class="fw-lmore"><summary>Show more</summary><p class="cap">${r.source ? `Source: ${esc(r.source)}.` : ''}${r.source && r.date ? ' ' : ''}${r.date ? `Date: ${esc(r.date)}.` : ''}</p></details>` : '';
    const input = `<input type="${kind}" ${kind === 'radio' ? 'name="fwLayerOne" ' : ''}data-layer="${esc(r.id)}"${r.on ? ' checked' : ''}${off ? ' disabled' : ''}>`;
    const status = s ? `<span class="cap fw-lstate" data-state="${r.state}"${r.state === 'loading' ? ' aria-hidden="true"' : ''}>${esc(s)}</span>${r.state === 'loading' ? `<span class="fw-lsk" role="status"><span class="sr">${esc(s)}</span><span aria-hidden="true"><i class="sk" style="width:70%"></i><i class="sk" style="width:45%"></i></span></span>` : ''}` : '';
    const button = wait && ask[r.id] ? `<button type="button" class="btn sm" data-ask="${esc(r.id)}">${esc(ask[r.id])}</button>` : '';
    return `<li><label class="mapx-lrow${r.on ? ' on' : ''}${bad || off ? ' off' : ''}">${input}<span><b>${esc(r.name)}</b>${r.line ? `<span class="cap">${esc(r.line)}</span>` : ''}${status}${r.on ? legendHTML(r.legend) : ''}</span></label>${button}${more}</li>`;
  };
  const sw = model.filter(r => r.group === 'switch').map(r => row(r, 'checkbox')).join(''), one = model.filter(r => r.group === 'one'), none = !one.some(r => r.on);
  const nothing = one.length ? `<li><label class="mapx-lrow${none ? ' on' : ''}"><input type="radio" name="fwLayerOne" data-layer=""${none ? ' checked' : ''}><span><b>Nothing over the picture</b></span></label></li>` : '';
  return `<header class="mapx-phead"><h3 id="fwLayersTitle">Layers</h3><button type="button" class="mapx-pclose" id="fwLayersClose" aria-label="Close layers"><span aria-hidden="true">×</span></button></header>
  <p class="cap">Pictures and measurements drawn over the land in 3D.</p>
  ${sw ? `<fieldset class="mapx-lset"><legend class="sr">Switches of the 3D view</legend><ul class="mapx-rows">${sw}</ul></fieldset>` : ''}
  ${one.length ? `<fieldset class="mapx-lset"><legend>Over the picture, one at a time</legend><ul class="mapx-rows">${nothing}${one.map(r => row(r, 'radio')).join('')}</ul></fieldset>` : ''}`;
}
