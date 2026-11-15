// Starting a farm without a report: where it is (my place, a tap on the map, a search or pasted coordinates), its name, how its fields get water, then its first field.
// The place search is the app's one place search (places.js), asked only on Return or the Search button, never while typing. The words and checks are pure and tested.
// Checked by scripts/test_sim.mjs (the pure parts) and scripts/e2e_farm.mjs (the three steps in a browser).
import { esc } from './words.js';
import { parseCoords, coordText, matchRegions, loadRegions, geocode } from './places.js';
import { readSaved, savedDate } from './saved.js';
import * as S from './simulate.js';

export const STEP_WORDS = Object.freeze({ one: 'Step 1 of 3', two: 'Step 2 of 3', three: 'Step 3 of 3' });
export const MSG = Object.freeze({
  none: 'No match. Try a nearby town, add the country, or paste coordinates.', badCoords: 'Could not read those coordinates. Try 42.03, -93.62', empty: 'Type a town, or paste coordinates.',
  down: 'The place search could not be reached. Check the internet connection, or paste coordinates.', noName: 'Give the farm a name.',
  noLocation: 'Your device did not share where you are. Search for a place, or tap the map.', noGeo: 'This device cannot tell where you are. Search for a place, or tap the map.',
});
// A place from what the farmer typed, using only what this device knows: coordinates, then the demo regions. null means "ask the search".
export function readTyped(text, regions = []) {
  const t = String(text ?? '').trim();
  if (!t) return { error: MSG.empty };
  const at = parseCoords(t);
  if (at?.reason) return { error: at.reason };
  if (at) return { place: { lat: at.lat, lon: at.lon, label: coordText(at.lat, at.lon), name: '' } };
  const found = matchRegions(regions, t);
  return { regions: found.map(r => ({ lat: r.lat, lon: r.lon, label: `${r.name}, ${r.country}`, name: r.name, irrigation: r.defaults?.irrigation || 'none' })) };
}
// A farm name suggested from the place: the first part of its label, held to 60 characters.
export function nameFromPlace(place) {
  const first = String(place?.name || place?.label || '').split(',')[0].trim();
  return (!first || /^-?\d/.test(first) ? 'My farm' : first).slice(0, S.LIMITS.nameFarm);   // a spot given as coordinates gets a plain name to change
}
const WATER = [['none', 'Rainfed'], ['limited', 'Limited irrigation'], ['full', 'Irrigated as needed']];

// ---- the page part: one object in (the panel, the map, the store calls), the three steps drawn into the panel
export function startFarm(env) {
  const flow = { place: null, rows: [], msg: '', busy: false }, saved = readSaved();
  const p = env.panel; let regions = [];
  loadRegions().then(list => { regions = list; }).catch(() => { /* the demo regions are a convenience: search and coordinates still work */ });
  const head = (title, sub) => `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">${title}</h2>${sub ? `<p class="fw-sub">${esc(sub)}</p>` : ''}</div><button type="button" class="btn lg" id="fwClose">Close</button></div>`;
  const close = () => { env.closePanel(); };
  const one = () => {
    p.innerHTML = `${head('Add a field', `${STEP_WORDS.one}: where is it?`)}
    <div class="fw-place">
    <div class="bigbtns"><button type="button" class="bigbtn primary" data-st="here"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg><span><b>I am at my field</b><small>Use where I am now</small></span></button>
    <button type="button" class="bigbtn" data-st="tap"><svg class="ic" aria-hidden="true"><use href="#i-map"/></svg><span><b>Find it on the map</b><small>Tap your field</small></span></button>${saved.length ? `<button type="button" class="bigbtn" data-st="saved"><svg class="ic" aria-hidden="true"><use href="#i-bookmark"/></svg><span><b>Use a saved field</b><small>${saved.length} saved from your reports</small></span></button>` : ''}</div>
    <form id="fwPlaceForm" class="search" role="search" aria-label="Find your field"><svg class="ic search-ic" aria-hidden="true"><use href="#i-search"/></svg><input id="fwPlaceIn" type="text" aria-label="Find your field" placeholder="Town or place" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" inputmode="search" enterkeyhint="search" maxlength="200"><button type="submit" class="btn primary">Search</button></form>
    <p class="fw-muted">Everything stays on this device.</p></div>
    <p class="fw-err" id="fwPlaceMsg" role="alert">${esc(flow.msg)}</p><ul class="fw-list" id="fwPlaceRows">${flow.rows.map((r, i) => `<li><button type="button" class="btn lg fw-row" data-pick="${i}"><span><b>${esc(r.title)}</b><br><small>${esc(r.sub || '')}</small></span></button></li>`).join('')}</ul>`;
    p.querySelector('#fwClose').onclick = close;
    p.querySelector('[data-st=here]').onclick = here; p.querySelector('[data-st=tap]').onclick = tap; if (saved.length) p.querySelector('[data-st=saved]').onclick = savedList;
    p.querySelector('#fwPlaceForm').onsubmit = e => { e.preventDefault(); search(p.querySelector('#fwPlaceIn').value); };
    for (const b of p.querySelectorAll('[data-pick]')) b.onclick = () => choose(flow.rows[+b.dataset.pick].place);
    p.querySelector('#fwPlaceIn').focus();
  };
  function savedList() {
    p.innerHTML = `${head('My saved fields', 'Pick the place for the new farm')}<ul class="fw-list">${saved.map((r, i) => `<li><button type="button" class="btn lg fw-row" data-saved="${i}"><span><b>${esc(r.name)}</b><br><small>${esc(r.place)}${r.at ? ` · ${esc(savedDate(r.at))}` : ''}</small></span></button></li>`).join('')}</ul><div class="fw-actions"><button type="button" class="btn lg" data-st="back">Back</button></div>`;
    p.querySelector('#fwClose').onclick = close; p.querySelector('[data-st=back]').onclick = one;
    for (const b of p.querySelectorAll('[data-saved]')) b.onclick = () => { const r = saved[+b.dataset.saved]; choose({ lat: r.lat, lon: r.lon, label: r.place || r.name, name: r.name }); };
    p.querySelector('#fwPanelTitle').focus();
  }
  const msg = text => { flow.msg = text; const n = p.querySelector('#fwPlaceMsg'); if (n) n.textContent = text; };
  const rowsFor = list => { flow.rows = list; one(); };
  async function search(text) {   // only on Return or the Search button: nothing is sent while typing
    const typed = readTyped(text, regions);
    if (typed.error) { flow.rows = []; one(); msg(typed.error === MSG.empty ? typed.error : typed.error); return; }
    if (typed.place) return choose(typed.place);
    const demo = typed.regions.map(r => ({ title: r.name || r.label, sub: 'Demo region', place: r }));
    msg('Looking…'); flow.rows = demo; one(); msg('Looking…');
    let found;
    try { found = await geocode(text); } catch { flow.rows = demo; one(); msg(demo.length ? 'The place search could not be reached. The demo regions above work offline.' : MSG.down); return; }
    const rows = [...demo, ...found.map(f => ({ title: f.title, sub: f.sub, place: { lat: f.lat, lon: f.lon, label: [f.title, f.sub].filter(Boolean).join(', '), name: f.title } }))];
    if (rows.length === 1 && !demo.length) return choose(rows[0].place);
    flow.rows = rows; one(); msg(rows.length ? '' : MSG.none);
  }
  function here() {
    if (!navigator.geolocation) return msg(MSG.noGeo);
    msg('Asking your device…');
    navigator.geolocation.getCurrentPosition(pos => choose({ lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4), label: coordText(pos.coords.latitude, pos.coords.longitude), name: '' }), () => msg(MSG.noLocation), { timeout: 15000, maximumAge: 60000 });
  }
  function tap() { env.pickOnMap(ll => choose({ lat: +ll.lat.toFixed(4), lon: +ll.lng.toFixed(4), label: coordText(ll.lat, ll.lng), name: '' }), again => { if (again) one(); }); }
  const two = () => {
    const pl = flow.place, suggested = nameFromPlace(pl), water = flow.water || pl.irrigation || 'none';
    p.innerHTML = `${head('Name it', `${STEP_WORDS.two}`)}<p>${esc(pl.label)}</p>
    <form id="fwNameForm" class="fw-form"><label for="fwFarmName">Farm name</label><input id="fwFarmName" class="fw-input" maxlength="60" value="${esc(flow.name ?? suggested)}" autocomplete="off">
    <fieldset class="fw-radios"><legend>How do your fields get water?</legend>${WATER.map(([k, w]) => `<label><input type="radio" name="water" value="${k}" ${water === k ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>
    <p class="fw-muted">It changes which crops suit the farm. You can change it for each field later.</p><p class="fw-err" id="fwNameErr" role="alert"></p>
    <div class="fw-actions"><button type="submit" class="btn lg primary">Continue</button><button type="button" class="btn lg" data-st="back">Back</button></div></form>`;
    p.querySelector('#fwClose').onclick = close;
    p.querySelector('[data-st=back]').onclick = () => { flow.name = p.querySelector('#fwFarmName').value; flow.water = p.querySelector('input[name=water]:checked')?.value; one(); };
    p.querySelector('#fwNameForm').onsubmit = e => {
      e.preventDefault();
      const name = p.querySelector('#fwFarmName').value.trim(), irrigation = p.querySelector('input[name=water]:checked')?.value || 'none';
      if (!name) { p.querySelector('#fwNameErr').textContent = MSG.noName; return; }
      const made = env.createFarm({ name, lat: pl.lat, lon: pl.lon, label: pl.label, irrigation });
      if (made.refused) { p.querySelector('#fwNameErr').textContent = made.refused; return; }
      three(made.farm);
    };
    p.querySelector('#fwFarmName').focus();
  };
  const three = farm => {
    p.innerHTML = `${head('First field', STEP_WORDS.three)}<p>${esc(farm.name)} is ready. Add its first field now, or later.</p>
    <div class="fw-addlist"><button type="button" class="btn lg" data-st="draw">Draw it<small>Tap each corner</small></button><button type="button" class="btn lg" data-st="square">Square around the pin<small>5 ha, you can redraw it</small></button><button type="button" class="btn lg" data-st="later">Later</button></div>`;
    p.querySelector('#fwClose').onclick = close;
    p.querySelector('[data-st=draw]').onclick = () => env.startDraw();
    p.querySelector('[data-st=square]').onclick = () => env.squareAtPin(5);
    p.querySelector('[data-st=later]').onclick = close;
    p.querySelector('#fwPanelTitle').focus();
  };
  function choose(place) { flow.place = place; flow.name = undefined; flow.water = place.irrigation; two(); }
  one();
}
