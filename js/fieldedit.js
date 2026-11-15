// Editing a field on the board: move its corners (mouse, finger and keyboard), split it with a line, bring outlines in from a map file, and save the fields out.
// The corner and file words are pure and tested; the page part takes one env object (the map, the edit bar, commit and toast) so it stores nothing itself.
// Checked by scripts/test_sim.mjs (the pure parts) and scripts/e2e_farm.mjs (the edit modes in a browser).
import { esc } from './words.js';
import { areaHa } from './geo.js';
import { areaWords } from './farmunits.js';
import * as S from './simulate.js';
import * as IO from './farmio.js';

const NAVY = '#0b2545', RED = '#d70015';
// ---- pure: the corner list
export function removeAt(ring, i) {
  if (!Number.isInteger(i) || i < 0 || i >= ring.length) return { refused: 'Tap or Tab to a corner first.' };
  if (ring.length <= S.LIMITS.corners[0]) return { refused: 'A field needs at least 3 corners.' };
  return { ring: ring.filter((_, k) => k !== i), index: Math.min(i, ring.length - 2) };
}
export function addAfter(ring, i) {
  if (ring.length >= S.LIMITS.corners[1]) return { refused: 'Up to 100 corners.' };
  const k = Number.isInteger(i) && i >= 0 && i < ring.length ? i : ring.length - 1, a = ring[k], b = ring[(k + 1) % ring.length], lonB = b[1] + 360 * Math.round((a[1] - b[1]) / 360);
  return { ring: [...ring.slice(0, k + 1), [S.round5((a[0] + b[0]) / 2), S.round5(((a[1] + lonB) / 2 + 540) % 360 - 180)], ...ring.slice(k + 1)], index: k + 1 };
}
// "4 corners · 12.3 ha", or what is wrong in plain words; ok when the outline can be saved.
export function cornerStatus(farm, field, ring, units = 'metric') {
  const issue = S.outlineIssue(ring, units), n = `${ring.length} corner${ring.length === 1 ? '' : 's'}`;
  if (issue) return { ok: false, words: `${n} · ${issue}` };
  const check = S.checkNewOutline(farm, ring, { ignore: field.id, units });
  if (!check.ok && check.ask === 'far') return { ok: false, words: `${n} · ${check.reason}` };
  const ha = areaWords(areaHa(ring) * (1 - field.waterShare), units);
  return { ok: true, words: `${n} · ${ha}${check.overlap ? ` · overlaps ${check.overlap.name} by about ${check.overlap.ha.toFixed(1)} ha` : ''}`, note: check.note };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const btn = (act, label, cls = 'btn lg') => `<button type="button" class="${cls}" data-bar="${act}">${esc(label)}</button>`;
const download = (name, text, type) => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch { return false; }
};

// ---- the bar that stands over the foot of the board while an edit is going on
function showBar(env, html, label) { env.bar.innerHTML = html; env.bar.hidden = false; env.bar.setAttribute('aria-label', label); }
export function hideBar(env) { env.bar.hidden = true; env.bar.innerHTML = ''; env.layer.clearLayers(); env.map.off('click', env._tap); env._tap = null; if (env._key) { document.removeEventListener('keydown', env._key, true); env._key = null; } }

// ---- Move corners
export function startCorners(env) {
  const { farm, field } = env.get(), L = env.L;
  let ring = field.ring.map(p => [...p]), chosen = 0;
  const undoList = [];
  const push = () => { undoList.push(ring.map(p => [...p])); if (undoList.length > S.LIMITS.cornerUndo) undoList.shift(); };
  env.say(`Moving the corners of ${field.name}. Tab to a corner, then use the arrow keys. Drag a corner with the mouse or a finger. Done saves, Cancel leaves the field as it was.`);
  const poly = L.polygon(ring, { color: NAVY, weight: 4, fillOpacity: .15, interactive: false }).addTo(env.layer), halo = L.polygon(ring, { color: '#fff', weight: 9, opacity: .8, fill: false, interactive: false }).addTo(env.layer);
  halo.bringToBack();
  let handles = [];
  const status = () => cornerStatus(env.get().farm, field, ring, env.units?.() || 'metric');
  const redraw = () => {
    const st = status();
    poly.setLatLngs(ring); halo.setLatLngs(ring); poly.setStyle({ color: st.ok ? NAVY : RED, dashArray: st.ok ? null : '6 6' });
    const line = env.bar.querySelector('.fw-editline'); if (line) { line.textContent = st.words; line.classList.toggle('is-bad', !st.ok); }
    const done = env.bar.querySelector('[data-bar=done]'); if (done) done.disabled = !st.ok;
    env.bar.querySelector('[data-bar=undo]').disabled = !undoList.length; env.bar.querySelector('[data-bar=remove]').disabled = ring.length <= 3;
  };
  const build = () => {
    for (const h of handles) h.remove();
    handles = ring.map((p, i) => {
      const icon = L.divIcon({ className: 'fw-handlewrap', html: `<button type="button" class="fw-handle${i === chosen ? ' is-chosen' : ''}" data-i="${i}" aria-label="Corner ${i + 1} of ${ring.length}. Arrow keys move it. Delete removes it."><i></i></button>`, iconSize: [44, 44], iconAnchor: [22, 22] });
      const m = L.marker(p, { icon, draggable: true, keyboard: false, autoPan: false }).addTo(env.layer);
      m.on('dragstart', () => { push(); chosen = i; });
      m.on('drag', () => { const ll = m.getLatLng(); ring[i] = [S.round5(ll.lat), S.round5(ll.lng)]; redraw(); });
      m.on('dragend', () => { if (same(undoList[undoList.length - 1], ring)) undoList.pop(); build(); focusHandle(i); });
      m.on('click', () => { chosen = i; build(); focusHandle(i); });
      return m;
    });
    redraw();
  };
  const focusHandle = i => env.layer && env.map.getContainer().querySelector(`.fw-handle[data-i="${i}"]`)?.focus();
  const nudge = (i, dx, dy) => {   // pixels on the screen, so a nudge means the same at any zoom
    push(); const pt = env.map.latLngToContainerPoint(ring[i]), ll = env.map.containerPointToLatLng(L.point(pt.x + dx, pt.y + dy));
    ring[i] = [S.round5(ll.lat), S.round5(ll.lng)]; build(); focusHandle(i);
  };
  const remove = () => { const r = removeAt(ring, chosen); if (r.refused) return env.toast(r.refused); push(); ring = r.ring; chosen = r.index; build(); env.say(`Corner removed. ${ring.length} left.`); focusHandle(chosen); };
  const add = () => { const r = addAfter(ring, chosen); if (r.refused) return env.toast(r.refused); push(); ring = r.ring; chosen = r.index; build(); env.say(`Corner added. ${ring.length} corners.`); focusHandle(chosen); };
  const undo = () => { const was = undoList.pop(); if (!was) return; ring = was; chosen = Math.min(chosen, ring.length - 1); build(); env.say('Undone'); };
  const leave = () => { hideBar(env); env.finish(); };
  showBar(env, `<p class="fw-editline" role="status"></p><div class="fw-editbtns">${btn('undo', 'Undo', 'btn lg')}${btn('add', 'Add corner')}${btn('remove', 'Remove corner')}${btn('done', 'Done', 'btn lg primary')}${btn('cancel', 'Cancel')}</div>`, 'Move corners');
  env.bar.querySelector('[data-bar=undo]').title = 'Undo the last corner change';
  env.bar.onclick = e => {
    const b = e.target.closest('[data-bar]'); if (!b) return;
    ({ undo, add, remove, cancel: leave, done: () => {
      if (same(ring, field.ring)) { env.toast('No change.'); return leave(); }
      const res = S.redrawField(env.get().store, farm.id, field.id, ring);
      if (res.refused) return env.toast(res.refused);
      env.commit(res.store, `${field.name}: corners moved`); hideBar(env); env.finish(res.lostMarks);
    } })[b.dataset.bar]?.();
  };
  env._key = e => {   // Delete removes the chosen corner, Ctrl or Cmd+Z undoes, Escape cancels; arrows move the corner that has focus
    const h = document.activeElement?.closest?.('.fw-handle'), i = h ? +h.dataset.i : -1;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leave(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (i >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); chosen = i; remove(); }
    else if (i >= 0 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); chosen = i; const d = e.shiftKey ? 20 : 4; nudge(i, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); }
    else if (i >= 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); chosen = i; build(); focusHandle(i); }
  };
  document.addEventListener('keydown', env._key, true);
  env.map.fitBounds(L.polygon(ring).getBounds().pad(0.5), { animate: false, maxZoom: 18, paddingBottomRight: [0, 90] });
  build(); focusHandle(0);
}

// ---- Split: two taps give the line; it is extended across the field and must cut the outline twice
export function startSplit(env) {
  const { farm, field } = env.get(), L = env.L;
  if (farm.fields.length >= S.LIMITS.fields) return env.toast('A farm holds up to 40 fields.');
  let first = null;
  const hint = () => `<p class="fw-editline" role="status">${first ? 'Now tap a point on the other side. The line goes right across the field.' : `Splitting ${esc(field.name)}. Tap a point on one side of the field.`}</p><div class="fw-editbtns">${btn('centre', "Use the map's centre")}${btn('cancel', 'Cancel')}</div>`;
  const leave = () => { hideBar(env); env.finish(); };
  const point = ll => {
    const at = [S.round5(ll.lat), S.round5(ll.lng)];
    if (!first) { first = at; L.circleMarker(at, { radius: 7, color: '#fff', weight: 2, fillColor: NAVY, fillOpacity: 1, interactive: false }).addTo(env.layer); showBar(env, hint(), 'Split'); wire(); env.say('Now tap a point on the other side. The line goes right across the field.'); return; }
    const cut = IO.splitRing(field.ring, first, at);
    if (!cut.ok) { env.toast(cut.reason); first = null; env.layer.clearLayers(); showBar(env, hint(), 'Split'); wire(); return; }
    const res = S.splitField(env.get().store, farm.id, field.id, cut.rings);
    if (res.refused) { env.toast(res.refused); return leave(); }
    env.commit(res.store, res.words); hideBar(env); env.finish(); env.say(`${res.words}. ${res.added.name} has the same plan. Records stay with ${res.kept.name}.`);
  };
  const wire = () => { env.bar.onclick = e => { const b = e.target.closest('[data-bar]'); if (!b) return; if (b.dataset.bar === 'cancel') leave(); else point(env.map.getCenter()); }; };
  env._tap = e => point(e.latlng); env.map.on('click', env._tap);
  env._key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leave(); } };
  document.addEventListener('keydown', env._key, true);
  showBar(env, hint(), 'Split'); wire(); env.say(`Splitting ${field.name}. Tap a point on one side of the field.`);
}

// ---- bring in a map file: read here, previewed with ticks, added in one step with one Undo
export async function startImport(env, file) {
  const { farm } = env.get(), room = S.LIMITS.fields - farm.fields.length;
  let text = null;
  try { text = await file.text(); } catch { /* reported below */ }
  const res = IO.readMapFile(file.name, text, { pin: farm.pin, taken: farm.fields.map(f => f.name), room });
  if (!res.ok) { env.toast(res.reason); return; }
  const ticks = res.rows.map(r => !r.skipped);
  env.say(`${res.usable} field${res.usable === 1 ? '' : 's'} found in the file.`);
  const p = env.panel; env.openPanel('import');
  const draw = () => {
    const n = ticks.filter(Boolean).length;
    p.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">Fields in your file</h2><p class="fw-sub">${esc(file.name)}</p></div></div>
    <p>${esc(res.usable ? IO.previewLine(res.usable, res.skipped, room) : 'No field in this file can be added.')}</p>
    <div class="fw-actions"><button type="button" class="btn lg" data-imp="all">Tick all</button><button type="button" class="btn lg" data-imp="none">Untick all</button></div>
    <p class="fw-answer" id="fwTickLine" role="status">${esc(IO.tickLine(n, room))}</p>
    <ul class="fw-list">${res.rows.map((r, i) => `<li>${r.skipped ? `<span><b>${esc(r.name)}</b><br><small>Skipped. ${esc(r.skipped)}</small></span>` : `<label class="fw-tick"><input type="checkbox" data-row="${i}" ${ticks[i] ? 'checked' : ''}><span><b>${esc(r.name)}</b><br><small>${areaWords(r.ha)}${r.notes?.length ? ' · ' + esc(r.notes.join(', ')) : ''}</small></span></label>`}</li>`).join('')}</ul>
    <p class="fw-err" id="fwImpErr" role="alert"></p>
    <div class="fw-actions"><button type="button" class="btn lg primary" data-imp="add">Add the ticked fields</button><button type="button" class="btn lg" data-imp="back">Back</button></div>`;
    for (const c of p.querySelectorAll('[data-row]')) c.onchange = () => { ticks[+c.dataset.row] = c.checked; p.querySelector('#fwTickLine').textContent = IO.tickLine(ticks.filter(Boolean).length, room); };
    p.querySelector('[data-imp=all]').onclick = () => { res.rows.forEach((r, i) => { ticks[i] = !r.skipped; }); draw(); };
    p.querySelector('[data-imp=none]').onclick = () => { ticks.fill(false); draw(); };
    p.querySelector('[data-imp=back]').onclick = () => env.closePanel();
    p.querySelector('[data-imp=add]').onclick = () => {
      const chosen = res.rows.filter((r, i) => ticks[i] && !r.skipped), over = chosen.length - room;
      if (!chosen.length) { p.querySelector('#fwImpErr').textContent = 'Tick at least one field.'; return; }
      if (over > 0) { p.querySelector('#fwImpErr').textContent = `This farm has room for ${room} more field${room === 1 ? '' : 's'}. Untick ${over}.`; return; }
      const out = S.addFields(env.get().store, farm.id, chosen.map(r => ({ name: r.name, ring: r.ring })));
      if (out.refused) { p.querySelector('#fwImpErr').textContent = out.refused; return; }
      const lost = chosen.length - out.added.length;
      env.commit(out.store, `${out.added.length} field${out.added.length === 1 ? '' : 's'} added from your file${lost ? `. ${lost} could not be used` : ''}`);
      env.closePanel(); env.select(out.added[0]?.id);
    };
    p.querySelector('#fwPanelTitle').focus();
  };
  draw();
}

// ---- files out
export function saveMapFile(env) {
  const { farm } = env.get(), name = IO.fileNames(farm).geojson;
  if (download(name, IO.writeGeoJSON(farm, { cropName: env.cropName }), 'application/geo+json')) env.toast('Fields saved as a map file (GeoJSON).'); else env.toast('This browser could not save the file.');
}
export function saveTable(env) {
  const { farm } = env.get(), rows = S.fieldRows(farm).map(r => ({ name: r.name, ha: r.ha, crop: r.crop ? env.cropName(r.crop) : '', water: r.water || '', fit: r.fit.state === 'scored' ? r.fit.words : r.fit.words, hurt: '', reminders: 0 }));
  if (download(IO.fileNames(farm).csv, IO.writeCSV(rows), 'text/csv')) env.toast('Fields table saved as a spreadsheet (CSV).'); else env.toast('This browser could not save the file.');
}

// ---- adding a field: draw it, or a square of a chosen size; the same checks as moving corners, then the Plant sheet opens
export const SQUARES = Object.freeze({
  metric: [['Garden bed, 0.06 ha', 0.06], ['1 ha', 1], ['5 ha', 5], ['10 ha', 10], ['25 ha', 25], ['50 ha', 50]],
  us: [['Garden bed, 0.15 acre', 0.15 / 2.471054], ['1 acre', 1 / 2.471054], ['2.5 acres', 2.5 / 2.471054], ['10 acres', 10 / 2.471054], ['40 acres', 40 / 2.471054], ['80 acres', 80 / 2.471054], ['160 acres', 160 / 2.471054]],
});
// A square goes at the map's centre when that is within 10 km of the pin, else around the pin.
export const squareCentre = (farm, centre) => S.distanceM([farm.pin.lat, farm.pin.lon], centre) / 1000 <= S.LIMITS.nearKm ? centre : [farm.pin.lat, farm.pin.lon];
export function renderAdd(env) {
  const { farm } = env.get(), full = farm.fields.length >= S.LIMITS.fields, p = env.panel, sizes = SQUARES[env.units?.() === 'us' ? 'us' : 'metric'];
  p.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">Add a field</h2><p class="fw-sub">${full ? 'A farm holds up to 40 fields.' : `${esc(farm.name)} holds up to 40 fields.`}</p></div><button type="button" class="btn lg" id="fwClose">Close</button></div>
  <div class="fw-addlist"><button type="button" class="btn lg" data-add="draw" ${full ? 'disabled' : ''}>Draw its shape<small>Tap each corner, then Finish</small></button>
  <button type="button" class="btn lg" data-add="file" ${full ? 'disabled' : ''}>Bring in a map file<small>A .geojson or .kml file, read on this device and sent nowhere</small></button></div>
  <h3>Square around the cross</h3><p class="fw-muted">The square goes at the middle of the map, where the cross shows when you use the keyboard.</p>
  <div class="fw-sizes">${sizes.map(([label, ha]) => `<button type="button" class="btn lg" data-ha="${ha}" ${full ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>`;
  p.querySelector('#fwClose').onclick = () => env.closePanel();
  p.querySelector('[data-add=draw]').onclick = () => env.startDraw();
  p.querySelector('[data-add=file]').onclick = () => env.chooseFile();
  for (const b of p.querySelectorAll('[data-ha]')) b.onclick = () => addSquare(env, +b.dataset.ha);
  p.querySelector('#fwPanelTitle').focus();
}
function addSquare(env, ha) {
  const { farm } = env.get(), c = squareCentre(farm, [env.map.getCenter().lat, env.map.getCenter().lng]);
  proposeField(env, S.squareAround(c[0], c[1], ha));
}
// The checks in the order the farmer meets them: the outline itself, too far, an overlap (asks first), then it joins the farm and the Plant sheet opens.
export function proposeField(env, ring) {
  const { farm } = env.get(), chk = S.checkNewOutline(farm, ring, { units: env.units?.() || 'metric' });
  if (!chk.ok) { env.toast(chk.refused || chk.reason); return false; }
  const join = () => {
    const res = S.addField(env.get().store, farm.id, { ring });
    if (res.refused) { env.toast(res.refused); return; }
    env.closePanel(true); env.commit(res.store, `${res.field.name} added, ${areaWords(res.field.area)}`);
    env.say(`${res.field.name} added, ${areaWords(res.field.area)}.${chk.note ? ' ' + chk.note : ''}`); env.afterAdd(res.field.id);
  };
  if (!chk.overlap) { join(); return true; }
  const p = env.panel; env.openPanel('confirm');
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">This overlaps another field</h2></div><p>${esc(chk.overlap.words)}</p><div class="fw-actions"><button type="button" class="btn lg primary" data-keep>Keep both</button><button type="button" class="btn lg" data-cancel>Cancel</button></div>`;
  p.querySelector('#fwPanelTitle').focus();
  p.querySelector('[data-keep]').onclick = join; p.querySelector('[data-cancel]').onclick = () => env.closePanel();
  return true;
}
export function startDraw(env) {
  const L = env.L, pts = [];
  const line = L.polyline([], { color: NAVY, weight: 3, dashArray: '6 6', interactive: false }).addTo(env.layer), shape = L.polygon([], { color: NAVY, weight: 3, fillOpacity: .12, interactive: false }).addTo(env.layer), dots = L.layerGroup().addTo(env.layer);
  const leave = () => { hideBar(env); env.finish(); };
  const refresh = () => {
    dots.clearLayers(); for (const p of pts) L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: NAVY, fillOpacity: 1, interactive: false }).addTo(dots);
    line.setLatLngs(pts); shape.setLatLngs(pts.length >= 3 ? pts : []);
    const n = pts.length;
    env.bar.innerHTML = `<p class="fw-editline" role="status">${n ? `${n} corner${n === 1 ? '' : 's'}` : 'Tap each corner of your field'}</p><div class="fw-editbtns">${btn('centre', 'Corner at centre')}${btn('undo', 'Undo')}${btn('finish', 'Finish', 'btn lg primary')}${btn('cancel', 'Cancel drawing')}</div>`;
    env.bar.querySelector('[data-bar=finish]').disabled = n < 3; env.bar.querySelector('[data-bar=undo]').disabled = !n;
  };
  const add = ll => { if (pts.length >= S.LIMITS.corners[1]) return env.toast('Up to 100 corners.'); pts.push([S.round5(ll.lat), S.round5(ll.lng)]); refresh(); env.say(`Corner ${pts.length} added`); };
  const finish = () => {
    if (pts.length < 3) return env.toast('It needs at least 3 corners.');
    const issue = S.outlineIssue(pts, env.units?.() || 'metric');
    if (issue) return env.toast(issue);   // a refused outline stays on the map to be fixed with Undo
    if (proposeField(env, pts.map(p => [...p]))) { hideBar(env); env.finish(); }
  };
  env.bar.onclick = e => { const b = e.target.closest('[data-bar]'); if (!b) return; ({ centre: () => add(env.map.getCenter()), undo: () => { pts.pop(); refresh(); }, finish, cancel: leave })[b.dataset.bar]?.(); };
  env._tap = e => add(e.latlng); env.map.on('click', env._tap);
  env._key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (pts.length) { pts.pop(); refresh(); env.say(`Last corner removed. ${pts.length} left.`); } else { leave(); env.say('Drawing stopped.'); } }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && pts.length) { e.preventDefault(); pts.pop(); refresh(); }
  };
  document.addEventListener('keydown', env._key, true);
  env.bar.hidden = false; env.bar.setAttribute('aria-label', 'Draw a field'); refresh();
  env.say('Drawing a field. Tap each corner, then Finish. With the keyboard: move the map with the arrow keys, then Corner at centre.');
}
