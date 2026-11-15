// Crophalo's Places panel on the setup map: a place or coordinates searched for (asked of the place service only when Search is pressed, never while typing), "Show on the map" (your pin, your outlined area)
// and "Move your field to" (the demo region). Choosing a place moves the field there at zoom 13. Pure: resultsHtml(), pinRow(), areaRow(), MESSAGES. The panel itself uses js/places.js and the map's own callbacks.
// Checked by scripts/test_mapplaces.mjs (the rows and the sentences) and scripts/e2e_map.mjs (the places group: search, coordinates, no match, a failing service, the pin and the outline, one panel at a time).
import { parseCoords, coordText, matchRegions, loadRegions, geocode } from './places.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const MESSAGES = Object.freeze({
  looking: 'Looking for places…',
  results: 'Search results · choose one to move your field there',
  none: query => `No match for “${String(query).slice(0, 80)}”. Try a nearby town, or paste coordinates.`,
  down: 'The place search is not answering right now. You can paste coordinates instead.',
  coords: 'Coordinates · choose to move your field there',
  mic: 'Voice typing could not start. Type the place instead.',
  noPin: 'Drop a pin first: tap the map where your field is.', noArea: 'No outline yet. Use the Rectangle or Polygon tool.',
});
// The place search is OpenStreetMap's Nominatim: its data must be credited next to the results, with a link to the licence.
export const OSM_CREDIT = '<p class="cap mapx-osm">Places: \u00a9 <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></p>';
export const PLACE_ICON = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>';
const MIC = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

// Rows the farmer can choose: { title, sub, lat, lon } each as a button that carries its place.
export const resultsHtml = rows => `<ul class="mapx-rows">${rows.map((r, i) => `<li><button type="button" class="mapx-row" data-go="${i}"><b>${esc(r.title)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ''}</button></li>`).join('')}</ul>`;
export const pinRow = pin => pin ? { title: 'Your pin', sub: coordText(pin.lat, pin.lon) } : null;
export const areaRow = (ha, words) => (Number.isFinite(ha) && ha > 0 ? { title: 'Your outlined area', sub: words } : null);

// env: { map(), pin(), ring(), areaWords(), goTo(spot), say, toast } lent by the map.
export function placesPanel(env) {
  return { id: 'places', label: 'Places', icon: PLACE_ICON, build(body) {
    body.innerHTML = `<form class="mapx-search" role="search" id="mapxPlaceForm"><label class="sr" for="mapxPlaceQ">Search for a place or coordinates</label>
        <input id="mapxPlaceQ" type="search" name="q" placeholder="Place or coordinates" autocomplete="off" enterkeyhint="search" spellcheck="false">
        <button type="button" class="mapx-mic" id="mapxPlaceMic" aria-label="Say a place" hidden>${MIC}</button><button type="submit" class="btn primary sm">Search</button></form>
      <div class="mapx-res" id="mapxPlaceRes" role="status" aria-live="polite"></div>
      <h4 class="mapx-sub">Show on the map</h4><ul class="mapx-rows" id="mapxPlaceShow"></ul>
      <div id="mapxPlaceDemo" hidden><h4 class="mapx-sub">Move your field to</h4><div id="mapxPlaceDemoRows"></div></div>`;
    const q = body.querySelector('#mapxPlaceQ'), res = body.querySelector('#mapxPlaceRes'), show = body.querySelector('#mapxPlaceShow');
    let rows = [], regions = [], asked = 0, hearing = null, alive = true;
    const say = text => { res.textContent = text; };
    const draw = (head, list, credit = false) => { rows = list; res.innerHTML = `<p class="cap">${esc(head)}</p>${resultsHtml(list)}${credit ? OSM_CREDIT : ''}`; };
    const showRows = () => {
      const pin = pinRow(env.pin()), area = areaRow(env.areaHa?.(), env.areaWords?.()), li = (kind, row, off, why) => `<li><button type="button" class="mapx-row" data-show="${kind}"${off ? ' disabled' : ''}><b>${esc(row?.title ?? (kind === 'pin' ? 'Your pin' : 'Your outlined area'))}</b><span>${esc(row?.sub ?? why)}</span></button></li>`;
      show.innerHTML = li('pin', pin, !pin, MESSAGES.noPin) + li('area', area, !area, MESSAGES.noArea);
    };
    showRows();
    loadRegions().then(list => { if (!alive) return; regions = list; const here = body.querySelector('#mapxPlaceDemo'); here.hidden = !list.length;
      body.querySelector('#mapxPlaceDemoRows').innerHTML = resultsHtml(list.map(r => ({ title: r.name, sub: r.country }))); }, () => {});

    async function search(text) {
      const word = String(text ?? '').trim(); if (!word) return;
      const mine = ++asked, at = parseCoords(word);
      if (at?.reason) { say(at.reason); return; }
      if (at) { draw(MESSAGES.coords, [{ title: coordText(at.lat, at.lon), sub: 'Latitude, longitude', lat: at.lat, lon: at.lon }]); return; }
      say(MESSAGES.looking);
      let found;
      try { found = await geocode(word); } catch { if (mine === asked && alive) say(MESSAGES.down); return; }
      if (mine !== asked || !alive) return;
      found.length ? draw(MESSAGES.results, found, true) : say(MESSAGES.none(word));
    }
    body.querySelector('#mapxPlaceForm').addEventListener('submit', event => { event.preventDefault(); search(q.value); });
    const pick = row => { if (row) env.goTo({ lat: row.lat, lon: row.lon, name: row.title, country: '' }); };
    body.addEventListener('click', event => {
      const go = event.target.closest('[data-go]');
      if (go) { const inDemo = !!go.closest('#mapxPlaceDemoRows'); pick(inDemo ? regions[+go.dataset.go] : rows[+go.dataset.go]); return; }
      const on = event.target.closest('[data-show]');
      if (on) env.show(on.dataset.show);
    });
    const Hear = window.SpeechRecognition || window.webkitSpeechRecognition, mic = body.querySelector('#mapxPlaceMic');
    if (Hear) {   // voice typing, only where the browser has it (in Chrome the speech goes to Google to be turned into text)
      mic.hidden = false; mic.title = 'Voice typing: in some browsers the speech is sent to the browser maker to be turned into text';
      mic.addEventListener('click', () => {
        if (hearing) { hearing.stop(); return; }
        hearing = new Hear(); hearing.lang = 'en'; hearing.interimResults = false; hearing.maxAlternatives = 1;
        hearing.onresult = event => { const said = event.results?.[0]?.[0]?.transcript?.trim(); if (said) { q.value = said; search(said); } };
        hearing.onerror = event => { if (event.error !== 'no-speech' && event.error !== 'aborted') say(MESSAGES.mic); };
        hearing.onend = () => { hearing = null; mic.classList.remove('hearing'); };
        try { hearing.start(); mic.classList.add('hearing'); } catch { hearing = null; say(MESSAGES.mic); }
      });
    }
    return { focus: () => q.focus(), destroy() { alive = false; try { hearing?.abort(); } catch { /* already stopped */ } } };
  } };
}
export { matchRegions };
