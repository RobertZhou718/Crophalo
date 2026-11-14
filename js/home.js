// Crophalo's home screen: the two big buttons, the place search with its list, the demo region cards, the farmer's saved fields
// (cards on the page and the Saved sheet) and the satellite-lens picture. Nothing is sent anywhere until a place is searched for or chosen.
// Nothing here is pure: it reads and changes the page. The pure parts live in places.js and saved.js.
// Checked by scripts/e2e.mjs (the list and its keys, the messages, the demo card, the Saved sheet with delete and undo, the still lens).
import { esc } from './words.js';
import { parseCoords, coordText, matchRegions, loadRegions, geocode } from './places.js';
import { presetOf } from './crops.js';
import { readSaved, removeSaved, restoreSaved, savedDate } from './saved.js';
import { initListen } from './listen.js';
import { toast, hideToast, runToastAction } from './toast.js';
import { motionOff } from './motion.js';

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const WORDS = {
  said: 'Find your field. If you are standing in your field now, press: I am at my field. Or press: Find it on the map, and tap your field. Or type the name of a town.',
  asking: 'Asking your device for its location…',
  noGeo: 'Your browser can’t share its location. Search instead.',
  denied: 'Location is switched off for this site. Allow it in your browser settings, or search for a place or paste coordinates instead.',
  failed: 'Your device could not find its position (weak signal or timed out). Move outdoors and try again, or search for a place.',
  here: 'Where I am now',
  empty: 'Type a place, an address, or coordinates like 42.03, -93.62.',
  looking: 'Looking for places…',
  none: 'No match. Try a nearby town, add the country, or paste coordinates.',
  downDemo: 'The place-search service is unreachable. The demo regions above still work.',
  down: 'The place-search service is unreachable. You can still paste coordinates or pick on the map.',
  coords: 'Coordinates', useCoords: 'Use these coordinates', demo: 'Demo regions', demoSub: 'Demo region: a ready starting point', places: 'Places',
  noRegions: 'Demo regions could not load. Search for your own place above, or reload the page.',
  openRegion: 'Open this region', openReport: 'Open report', saved: 'Saved', open: 'Open', del: 'Delete',
  nothing: 'Nothing saved yet. Open a report and choose Save to keep a field here. Saved fields live only in this browser.',
  deleted: 'Saved field deleted', undo: 'Undo', savedLabel: 'Saved fields',
  micOff: 'Voice typing could not start. Type the place instead.',
};
const LOCATE_MS = 12e3, UNDO_MS = 15e3, HOME_SAVED = 6;

let go = { place() {}, mapPick() {}, saved() {} };   // where a choice leads; the page shell says where, in initHome
let regions = [];

// ---- the search and its list
let rows = [], active = -1, asked = 0;   // the options now in the list, the highlighted one, and a count that makes a late answer stale
const input = () => $('#searchInput'), list = () => $('#searchList');
const setMsg = text => { $('#searchMsg').textContent = text; };

const coordRow = at => ({ title: coordText(at.lat, at.lon), sub: WORDS.useCoords, pick: () => go.place({ lat: at.lat, lon: at.lon, name: coordText(at.lat, at.lon), from: 'coords' }) });
const regionRow = region => ({ title: region.name, sub: WORDS.demoSub, pick: () => openRegion(region) });
const placeRow = place => ({ title: place.title, sub: place.sub, pick: () => go.place({ lat: place.lat, lon: place.lon, name: place.title, place: place.sub, from: 'search' }) });
const openRegion = region => go.place({ lat: region.lat, lon: region.lon, name: region.name, place: region.country, region: region.id, demo: true, rotation: region.rotation, defaults: region.defaults, from: 'region' });

function showList(open) {
  list().hidden = !open;
  input().setAttribute('aria-expanded', open);
  if (!open) setActive(-1);
}
function setActive(index) {
  active = index;
  $$('[role=option]', list()).forEach((row, i) => row.setAttribute('aria-selected', i === index));
  const row = index >= 0 ? $(`#searchOpt${index}`) : null;
  if (row) { input().setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' }); } else input().removeAttribute('aria-activedescendant');
}
// Draw the groups: [{ label, rows, busy }]. A busy group shows three grey rows where its places will come.
function draw(groups) {
  rows = groups.flatMap(group => group.rows);
  active = -1; input().removeAttribute('aria-activedescendant');   // a new list starts with nothing chosen, so Search never takes a row from the old one
  let n = 0;
  list().innerHTML = groups.map((group, g) => `
    <div role="group" aria-labelledby="searchGrp${g}">
      <div class="sugg-cap" id="searchGrp${g}">${esc(group.label)}</div>
      ${group.rows.map(row => `<button type="button" role="option" class="sugg-row" id="searchOpt${n}" data-i="${n++}" aria-selected="false" tabindex="-1"><b>${esc(row.title)}</b><small>${esc(row.sub)}</small></button>`).join('')}
      ${group.busy ? '<div class="sugg-sk" aria-hidden="true"><i class="sk title"></i><i class="sk"></i></div>'.repeat(3) : ''}
    </div>`).join('');
  showList(groups.length > 0);
}
function typed() {   // while typing: only what this device already knows, never the network
  asked++;
  setMsg('');
  const text = input().value.trim(), groups = [];
  if (text.length >= 2) {
    const at = parseCoords(text), found = matchRegions(regions, text);
    if (at && !at.reason) groups.push({ label: WORDS.coords, rows: [coordRow(at)] });
    if (found.length) groups.push({ label: WORDS.demo, rows: found.map(regionRow) });
  }
  draw(groups);
}
function take(row) { showList(false); setMsg(''); row.pick(); }
async function search() {
  if (!list().hidden && rows[active]) return take(rows[active]);
  const text = input().value.trim();
  if (!text) { draw([]); return setMsg(WORDS.empty); }
  const at = parseCoords(text);
  if (at?.reason) { draw([]); return setMsg(at.reason); }
  if (at) return take(coordRow(at));
  const mine = ++asked, found = matchRegions(regions, text).map(regionRow), demo = found.length ? [{ label: WORDS.demo, rows: found }] : [];
  draw([...demo, { label: WORDS.places, rows: [], busy: true }]);
  setMsg(WORDS.looking);
  let places;
  try { places = await geocode(text); }
  catch { if (mine === asked) { draw(demo); setMsg(found.length ? WORDS.downDemo : WORDS.down); } return; }
  if (mine !== asked) return;   // the farmer has typed on: this answer is for an older question
  if (places.length === 1 && !found.length) return take(placeRow(places[0]));
  draw([...demo, ...(places.length ? [{ label: WORDS.places, rows: places.map(placeRow) }] : [])]);
  setMsg(places.length ? '' : WORDS.none);
}
function runSearch(text) { input().value = text; input().focus(); showList(false); search(); }

function initSearch() {
  const field = input(), box = $('#searchBox');
  $('#searchForm').addEventListener('submit', event => { event.preventDefault(); search(); });
  field.addEventListener('input', typed);
  field.addEventListener('focus', () => { if (rows.length) showList(true); });
  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!list().hidden) { event.preventDefault(); showList(false); } return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!rows.length) return;
    event.preventDefault();
    if (list().hidden) showList(true);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    setActive(active < 0 ? (step > 0 ? 0 : rows.length - 1) : (active + step + rows.length) % rows.length);   // wraps at both ends
  });
  list().addEventListener('mousedown', event => event.preventDefault());   // a press on a row keeps the typing place in the field
  list().addEventListener('click', event => { const row = event.target.closest('[role=option]'); if (row) take(rows[+row.dataset.i]); });
  document.addEventListener('click', event => { if (!box.contains(event.target)) showList(false); });
  for (const link of $$('#searchTry .link')) link.addEventListener('click', () => runSearch(link.textContent));
  initVoice();
}

// Voice typing, only where the browser has it. In Chrome the speech goes to Google to be turned into text; the button's title says so.
function initVoice() {
  const Hear = window.SpeechRecognition || window.webkitSpeechRecognition, mic = $('#searchMic');
  if (!Hear) return;
  let hearing = null;
  const idle = () => { hearing = null; mic.classList.remove('hearing'); mic.setAttribute('aria-label', mic.dataset.say); };
  mic.hidden = false;
  mic.dataset.say = mic.getAttribute('aria-label');
  mic.addEventListener('click', () => {
    if (hearing) { hearing.stop(); return; }
    hearing = new Hear();
    hearing.lang = 'en'; hearing.interimResults = false; hearing.maxAlternatives = 1;
    hearing.onresult = event => { const said = event.results?.[0]?.[0]?.transcript?.trim(); if (said) runSearch(said); };
    hearing.onerror = event => { if (event.error !== 'no-speech' && event.error !== 'aborted') setMsg(WORDS.micOff); };
    hearing.onend = idle;
    try { hearing.start(); mic.classList.add('hearing'); mic.setAttribute('aria-label', 'Listening. Press to stop'); } catch { idle(); setMsg(WORDS.micOff); }
  });
}

// ---- the two big buttons
function locate() {
  setMsg('');
  if (!navigator.geolocation) return setMsg(WORDS.noGeo);
  toast(WORDS.asking, { ms: LOCATE_MS + 1000 });
  navigator.geolocation.getCurrentPosition(
    spot => { hideToast(); go.place({ lat: spot.coords.latitude, lon: spot.coords.longitude, name: WORDS.here, from: 'locate' }); },
    problem => { hideToast(); setMsg(problem.code === 1 ? WORDS.denied : WORDS.failed); },
    { timeout: LOCATE_MS, maximumAge: 60e3, enableHighAccuracy: true });
}

// ---- cards: a demo region and a saved field share one shape
// A satellite photo around the point (Esri World Imagery), 640 by 360: about 14 km across.
function photo(lat, lon) {
  const up = 0.036, across = up * (16 / 9) / Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const box = [lon - across, lat - up, lon + across, lat + up].map(v => v.toFixed(4)).join(',');
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${box}&bboxSR=4326&imageSR=3857&size=640,360&format=jpg&f=image`;
}
const card = ({ id, lat, lon, onPhoto, title, text, chip, action }) => `
  <article class="card act place-card">
    <div class="card-top"><img class="card-pic" alt="" loading="lazy" decoding="async" width="640" height="360" src="${esc(photo(lat, lon))}">${onPhoto ? `<span class="pic-chip">${esc(onPhoto)}</span>` : ''}</div>
    <div class="card-b">
      <h3>${esc(title)}</h3>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${chip ? `<p><span class="chip">${esc(chip)}</span></p>` : ''}
      <p><button type="button" class="link cover" data-id="${esc(id)}" aria-label="${esc(`${action}: ${title}`)}">${esc(action)} <span aria-hidden="true">›</span></button></p>
    </div>
  </article>`;

async function initRegions() {
  const grid = $('#homeRegions');
  grid.innerHTML = '<div class="sk-card" aria-hidden="true"><i class="sk title"></i><i class="sk"></i><i class="sk"></i><i class="sk pill"></i></div>';
  try { regions = await loadRegions(); } catch { regions = []; }
  if (!regions.length) { grid.innerHTML = `<p class="cap">${esc(WORDS.noRegions)}</p>`; return; }
  grid.innerHTML = regions.map(region => card({ id: region.id, lat: region.lat, lon: region.lon, onPhoto: region.country, title: region.name,
    text: region.blurb ?? '', chip: presetOf(region.rotation)?.label ?? '', action: WORDS.openRegion })).join('');
  grid.addEventListener('click', event => { const id = event.target.closest('.cover')?.dataset.id, region = regions.find(r => r.id === id); if (region) openRegion(region); });
}

// ---- saved fields: the cards on the home, the count in the bar, the sheet
function drawSaved() {
  const all = readSaved(), n = all.length;
  $('#savedCount').textContent = n ? String(n) : '';
  if (n) $('#navSaved').removeAttribute('aria-label'); else $('#navSaved').setAttribute('aria-label', WORDS.savedLabel);   // with a count its name is its words, "Saved 2", so the spoken name holds what is on the screen
  $('#homeSaved').hidden = !n;
  $('#homeSavedGrid').innerHTML = all.slice(0, HOME_SAVED).map(field => card({ id: field.key, lat: field.lat, lon: field.lon,
    onPhoto: savedDate(field.at) && `${WORDS.saved} ${savedDate(field.at)}`, title: field.name, text: field.summary, action: WORDS.openReport })).join('');
  $('#savedList').innerHTML = !n ? `<p>${esc(WORDS.nothing)}</p>` : `<ul class="gl saved-list">${all.map(field => `
    <li class="row saved-row" data-key="${esc(field.key)}">
      <div class="saved-t"><b>${esc(field.name)}</b><small>${esc([field.place, savedDate(field.at)].filter(Boolean).join(' · '))}</small>${field.summary ? `<p>${esc(field.summary)}</p>` : ''}</div>
      <div class="btnrow"><button type="button" class="btn" data-do="open" aria-label="${esc(`${WORDS.open} ${field.name}`)}">${WORDS.open}</button><button type="button" class="btn danger" data-do="delete" aria-label="${esc(`${WORDS.del} ${field.name}`)}">${WORDS.del}</button></div>
    </li>`).join('')}</ul>`;
}
function openSaved(key) {
  const field = readSaved().find(f => f.key === key);
  if (!field) return;
  $('#dlgSaved').close();
  go.saved(field);
}
function deleteSaved(key) {
  const order = $$('#savedList .saved-row').map(row => row.dataset.key), at = order.indexOf(key), gone = removeSaved(key);
  if (!gone) return;
  drawSaved();
  const next = order[at + 1] ?? order[at - 1];   // focus goes to the next row's button, so the keyboard keeps its place
  ($(`#savedList .saved-row[data-key="${CSS.escape(next ?? '')}"] .btn`) ?? $('#dlgSavedDone')).focus();
  toast(WORDS.deleted, { action: WORDS.undo, ms: UNDO_MS, onAction: () => { restoreSaved(gone); drawSaved(); } });
}
function initSaved() {
  drawSaved();
  $('#navSaved').addEventListener('click', drawSaved);   // another tab may have saved or deleted since
  $('#savedList').addEventListener('click', event => {
    const button = event.target.closest('[data-do]'), key = button?.closest('.saved-row')?.dataset.key;
    if (key) (button.dataset.do === 'open' ? openSaved : deleteSaved)(key);
  });
  $('#homeSavedGrid').addEventListener('click', event => { const key = event.target.closest('.cover')?.dataset.id; if (key) openSaved(key); });
  document.addEventListener('keydown', event => {   // Ctrl or Cmd with Z brings a deleted field back while its line still shows
    if (event.key.toLowerCase() !== 'z' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;   // in a field the keys undo the typing
    if (runToastAction()) event.preventDefault();
  });
  addEventListener('storage', event => { if (event.key === null || event.key === 'crophalo.saved.v1') drawSaved(); });
}

// ---- the lens: a patchwork of fields; a round window over it shows how green each one is, as a satellite sees it
const LENS = { w: 640, h: 172, r: 58, sweepMs: 4500, cols: [58, 92, 60, 82, 44, 96, 52, 62, 70], rows: [44, 76, 40] };
const DULL = ['#dfe3c8', '#e9e0c9', '#c6d1a4', '#d8cba8', '#bccb9d'], GREEN = ['#f0d560', '#c9dd6c', '#8fc647', '#4fa32e'];   // bare soil to full crop
function initLens() {
  const svg = $('#lens');
  if (!svg) return;
  let seed = 20261114;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };   // the same patchwork every visit
  const gap = 3, fields = [];
  let y = gap;
  for (const high of LENS.rows) {
    let x = gap;
    for (const wide of LENS.cols) { fields.push({ x, y, w: wide - gap, h: high - gap, dull: Math.floor(next() * DULL.length), green: Math.floor(next() * GREEN.length) }); x += wide; }
    y += high;
  }
  const patch = (f, fill) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="3" fill="${fill}"/>`;
  svg.innerHTML = `
    <defs>
      <pattern id="lensRows" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><path d="M0 3.5h7" stroke="#6b5a2e" stroke-opacity=".16"/></pattern>
      <clipPath id="lensEye"><circle r="${LENS.r}"/></clipPath>
    </defs>
    ${fields.map(f => patch(f, DULL[f.dull])).join('')}
    <rect width="${LENS.w}" height="${LENS.h}" fill="url(#lensRows)"/>
    <g clip-path="url(#lensEye)">${fields.map(f => patch(f, GREEN[f.green])).join('')}</g>
    <circle class="lens-turn" r="${LENS.r - 7}"/><circle class="lens-ring" r="${LENS.r}"/>`;
  const eye = $('#lensEye circle', svg), ring = $('.lens-ring', svg), turn = $('.lens-turn', svg);
  const put = (x, yy) => { for (const c of [eye, ring, turn]) { c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', yy.toFixed(1)); } };
  const rest = [LENS.w * 0.83, LENS.h * 0.46], path = [[0.16, 0.38], [0.34, 0.68], [0.52, 0.3], [0.68, 0.64], [0.83, 0.46]].map(([x, y]) => [LENS.w * x, LENS.h * y]);   // a path across the patchwork
  let px = path[0][0], py = path[0][1], target = path[0], steered = false, onScreen = true, last = 0, began = 0, raf = 0;
  put(...rest);
  // On load the lens sweeps by itself for 4.5 s: it eases toward each point of the path (x += (tx - x) * min(1, dt * 4)), then rests where it began its rest and
  // follows the pointer or finger (the same ease at 10 when steered). It never sweeps under Always still or the device's reduce-motion; it still follows a pointer then.
  const tick = now => {
    raf = 0;
    if (!onScreen) { last = 0; return; }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016; last = now; began ||= now;
    const t = now - began;
    if (!steered) {
      const stage = Math.min(path.length - 1, Math.floor(t / (LENS.sweepMs / path.length)));
      target = t >= LENS.sweepMs ? rest : path[stage];
    }
    const k = Math.min(1, dt * (steered ? 10 : 4));
    px += (target[0] - px) * k; py += (target[1] - py) * k; put(px, py);
    const settled = Math.abs(target[0] - px) < 0.3 && Math.abs(target[1] - py) < 0.3;
    if (steered || t < LENS.sweepMs || !settled) raf = requestAnimationFrame(tick); else { put(target[0], target[1]); last = 0; }
  };
  const go = () => { if (!raf && onScreen && (steered || !motionOff())) raf = requestAnimationFrame(tick); };   // still: nothing starts by itself
  const follow = event => {
    steered = true;
    const frame = svg.getBoundingClientRect();
    target = [(event.clientX - frame.left) / frame.width * LENS.w, (event.clientY - frame.top) / frame.height * LENS.h];
    if (motionOff()) { px = target[0]; py = target[1]; put(px, py); return; }   // still: it goes where it is pointed, with no travelling
    go();
  };
  svg.addEventListener('pointermove', follow); svg.addEventListener('pointerdown', follow);
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { onScreen = entries.some(e => e.isIntersecting); svg.classList.toggle('lens-paused', !onScreen); if (onScreen) go(); }, { threshold: 0.1 }).observe(svg);
  if (!motionOff()) { px = path[0][0]; py = path[0][1]; put(px, py); go(); }
}

// ---- start. where: { place(spot), mapPick(), saved(field) } says what each choice opens.
export function initHome(where) {
  go = { ...go, ...where };
  initListen($('#homeListen'), WORDS.said);
  $('#homeLocate').addEventListener('click', locate);
  $('#homeMapPick').addEventListener('click', () => go.mapPick());
  initSearch();
  initRegions();
  initSaved();
  initLens();
}
