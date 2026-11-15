// Crophalo's spot card: the floating card on the map that tells about the place or the outline: Weather, Area and Sun.
// Pure parts live in js/cardplace.js. The rest builds the card, drags it and fills its tabs; it asks the map for what it needs and never reaches into it.
// Checked by scripts/test_spot.mjs (js/cardplace.js) and scripts/e2e_map.mjs (opens, tabs, drag, arrows, Escape, stays inside, the phone's bottom card).
import { areaWords, slopeWords, pinWords } from './geo.js';
import { getForecast, conditionWords, fieldwork, dayName, degrees } from './weather.js';
import { sunEvents, clock, timesAreWords, shadowRatio, heightWords } from './sun.js';
import { initListen } from './listen.js';
import { srcButton } from './srci.js';
import { motionOff } from './motion.js';

import { clampCard, placeCard, MARGIN, TOP, WIDE, NARROW_BELOW, STACK_ROOM } from './cardplace.js';
export { clampCard, placeCard };
const GRIP = 16, GRIP_BIG = 64;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- the card
let card = null, ctx = null, opener = null, tab = 'weather', followTimer = 0;
export const spotOpen = () => !!card;
export const spotTab = () => tab;

function tabsNow() { return ctx.ring() ? ['weather', 'area', 'sun'] : ['weather', 'sun']; }
const TAB_WORDS = { weather: 'Weather', area: 'Area', sun: 'Sun' };
function title() {
  const pin = ctx.pin(), name = String(pin?.name || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 2).join(', ');
  return tab === 'area' && !pin?.name ? 'Your outlined area' : name || 'This spot';
}

export function openSpot(context, wanted = 'weather', from = null) {
  ctx = context; opener = from || document.activeElement;
  const have = tabsNow(); tab = have.includes(wanted) ? wanted : 'weather';
  closeSpot(false);
  card = document.createElement('section');
  card.className = 'spot'; card.setAttribute('role', 'dialog'); card.tabIndex = -1; card.setAttribute('aria-labelledby', 'spotTitle');
  card.style.opacity = '0';   // built now (its words are in the page), seen in the next frame once it has its place (see settle); opacity, not visibility, so its words still read as text
  ctx.box.append(card); ctx.box.classList.add('spot-open');
  draw(); settle(true);
  ctx.say(`Weather card opened for ${title()}`.replace('Weather', tab === 'area' ? 'Area' : tab === 'sun' ? 'Sun' : 'Weather'));
}
export function closeSpot(refocus = true) {
  if (!card) return;
  cancelAnimationFrame(raf); clearTimeout(timer); pendingFirst = false;
  card.remove(); card = null; ctx?.box.classList.remove('spot-open');
  if (refocus && opener?.isConnected) opener.focus();
}
// The place or the outline changed: the card follows the pin, and is rebuilt if its tabs changed.
export function refreshSpot() {
  if (!card) return;
  if (!tabsNow().includes(tab)) tab = 'weather';
  draw(); settle(false);
}

function draw() {
  const have = tabsNow();
  card.innerHTML = `<header class="spot-head"><span class="spot-grip" role="button" tabindex="0" aria-label="Move this card. Use the arrow keys, or drag."><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <h3 id="spotTitle">${esc(title())}</h3><button type="button" class="btn sm" data-spot="done">Done</button></header>
    <div class="spot-tabs" role="tablist" aria-label="About this spot">${have.map(t => `<button type="button" role="tab" id="spotTab-${t}" aria-controls="spotPanel" aria-selected="${t === tab}" tabindex="${t === tab ? 0 : -1}" data-tab="${t}">${TAB_WORDS[t]}</button>`).join('')}</div>
    <div class="spot-panel" id="spotPanel" role="tabpanel" aria-labelledby="spotTab-${tab}" tabindex="0"></div>`;
  wire(); fill();
}
function wire() {
  card.querySelector('[data-spot=done]').addEventListener('click', () => closeSpot());
  const tabs = card.querySelector('.spot-tabs');
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) pick(b.dataset.tab, true); });
  tabs.addEventListener('keydown', e => {
    const have = tabsNow(), i = have.indexOf(tab), step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); pick(have[e.key === 'Home' ? 0 : have.length - 1], true); return; }
    if (step) { e.preventDefault(); pick(have[(i + step + have.length) % have.length], true); }
  });
  const grip = card.querySelector('.spot-grip');
  grip.addEventListener('pointerdown', dragStart);
  grip.addEventListener('keydown', e => {
    const step = e.shiftKey ? GRIP_BIG : GRIP, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return; e.preventDefault(); e.stopPropagation(); moveBy(dx, dy);
  });
  card.querySelector('.spot-head h3').addEventListener('pointerdown', dragStart);
}
function pick(next, focus) {
  tab = next; draw();
  if (focus) card.querySelector(`[data-tab=${next}]`).focus();
}

// ---- placement and dragging
// Asking the page for a size makes the browser lay the whole page out on the spot, in the middle of the tap that opened the card, after the outline, the pin and the setup have all changed it
// (about 0.6 s on a slow phone: the whole wait between a finished rectangle and its first figure). So the card is built unseen with its words already in, and placed in the next frame, in one pass:
// every read first, then every write. The figure is in the page at once; it is seen one frame later, in its place. A frame that never comes (a tab in the background) is covered by a short timer.
let raf = 0, timer = 0, pendingFirst = false;
function settle(first) {
  pendingFirst ||= first;
  cancelAnimationFrame(raf); clearTimeout(timer);
  const run = () => {
    cancelAnimationFrame(raf); clearTimeout(timer);
    if (!card) return;
    const opening = pendingFirst; pendingFirst = false;
    place(opening);
    if (card.style.opacity) { card.style.opacity = ''; if (opening) card.focus({ preventScroll: true }); }
  };
  raf = requestAnimationFrame(run); timer = setTimeout(run, 120);
}
const size = () => ({ w: card.offsetWidth, h: card.offsetHeight });
const boxSize = () => ({ w: ctx.box.clientWidth, h: ctx.box.clientHeight });
let spot = null;   // where the farmer left it, until the card closes
function place(first) {
  const box = boxSize(), s = size(), narrow = box.w < NARROW_BELOW;
  card.classList.toggle('bottom', narrow);
  if (narrow) { card.style.cssText = ''; card.style.left = `${MARGIN}px`; card.style.right = `${MARGIN}px`; card.style.bottom = '22px'; card.style.top = 'auto'; return; }
  card.style.right = 'auto'; card.style.bottom = 'auto'; card.style.width = `${WIDE}px`;
  const top = ctx.top?.() ?? TOP, p = spot ? clampCard(spot, size(), box, MARGIN, top, STACK_ROOM) : placeCard({ anchor: ctx.anchor(), size: { w: WIDE, h: s.h || 360 }, box, avoid: ctx.avoid(), top });
  card.style.left = `${p.left}px`; card.style.top = `${p.top}px`;
  if (first && !motionOff()) card.classList.add('spot-in');
}
function moveBy(dx, dy) {
  if (card.classList.contains('bottom')) return;
  const now = { left: card.offsetLeft + dx, top: card.offsetTop + dy }, p = clampCard(now, size(), boxSize(), MARGIN, ctx.top?.() ?? TOP, STACK_ROOM);
  spot = p; card.style.left = `${p.left}px`; card.style.top = `${p.top}px`;
}
function dragStart(event) {
  if (event.button > 0 || card.classList.contains('bottom') || event.target.closest('button')) return;
  event.preventDefault();
  const el = event.currentTarget, from = { x: event.clientX, y: event.clientY, left: card.offsetLeft, top: card.offsetTop };
  el.setPointerCapture?.(event.pointerId);
  let frame = 0;
  const move = e => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const p = clampCard({ left: from.left + e.clientX - from.x, top: from.top + e.clientY - from.y }, size(), boxSize(), MARGIN, ctx.top?.() ?? TOP, STACK_ROOM); spot = p; card.style.left = `${p.left}px`; card.style.top = `${p.top}px`; }); };   // one move per frame
  const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
export function keepInside() { if (card && !card.classList.contains('bottom')) { place(false); } else if (card) place(false); }

// ---- what each tab says
// The "i" button and its card are the shared ones (js/srci.js); the page listens for every button, so the card needs no wiring of its own.
function fill() {
  const panel = card.querySelector('#spotPanel');
  ({ weather: fillWeather, area: fillArea, sun: fillSun })[tab](panel);
}
async function fillWeather(panel) {
  const pin = ctx.pin();
  if (!pin) { panel.innerHTML = '<p class="cap">Drop a pin first: tap the map where your field is.</p>'; return; }
  panel.setAttribute('aria-busy', 'true'); panel.innerHTML = '<p class="spot-wait"><i class="dot busy" aria-hidden="true"></i> Getting the weather here…</p>';
  const mine = card, got = await getForecast(pin.lat, pin.lon);
  if (card !== mine || tab !== 'weather') return;   // the farmer moved on while it came
  panel.removeAttribute('aria-busy');
  if (!got.ok) { panel.innerHTML = `<p>Could not read the weather here. ${esc(got.reason)} Try again in a moment.</p>`; return; }
  const t = got.days[0], now = got.now, calm = fieldwork(t, now.wind);
  const rain = t.pop == null ? '' : ` · ${Math.round(t.pop)}% chance of rain`, mm = t.mm == null ? '' : ` · ${t.mm.toFixed(t.mm < 10 ? 1 : 0)} mm`;
  const word = conditionWords(now.code);
  panel.innerHTML = `<p class="spot-now"><span class="spot-temp">${esc(degrees(now.temp))}</span> <span>${esc(word)}</span></p>
    <p class="cap">${now.feels == null ? '' : `Feels like ${esc(degrees(now.feels))}`}${now.wind == null ? '' : ` · wind ${Math.round(now.wind)} km/h`}</p>
    <p><button type="button" class="listen" id="spotListen" hidden><svg class="ic" aria-hidden="true"><use href="#i-speaker"/></svg><span class="t">Listen</span></button></p>
    <p>Today high ${esc(degrees(t.hi))}, low ${esc(degrees(t.lo))}${rain}${mm} ${srcButton('forecast', got.updated ? `Updated at ${got.updated}, local time at the field. The forecast for the 1 km square around your pin.` : 'The forecast for the 1 km square around your pin.')}</p>
    ${got.updated ? `<p class="cap">Updated at ${esc(got.updated)}, local time at the field.</p>` : ''}
    <p class="cap spot-credit"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a></p>
    <p class="spot-calm ${calm.ok === true ? 'ok' : calm.ok === false ? 'no' : ''}">${esc(calm.words)}</p>
    <ul class="spot-days">${got.days.slice(1).map(d => `<li><b>${esc(dayName(d.date))}</b> <span>${esc(conditionWords(d.code))}</span> <span>${esc(degrees(d.hi))} / ${esc(degrees(d.lo))}</span></li>`).join('')}</ul>
    <dl class="spot-rows"><div><dt>Height</dt><dd>${got.elevation == null ? 'not available' : `${Math.round(got.elevation)} m (weather model)`}</dd></div><div><dt>Spot</dt><dd>${esc(pinWords(pin.lat, pin.lon).replace('Pin at ', ''))}</dd></div></dl>`;
  initListen(panel.querySelector('#spotListen'), () => `${word}, ${degrees(now.temp)}. ${calm.words}`);
}
function fillArea(panel) {
  const info = ctx.areaInfo();
  if (!info) { panel.innerHTML = '<p class="cap">Draw an outline to see its area.</p>'; return; }
  panel.innerHTML = `<p class="spot-big">${esc(areaWords(info.ha, ctx.units()))}</p><p><span class="chip ${info.used ? 'on' : ''}">${info.used ? 'Used in report' : 'Selected area'}</span></p>
    <dl class="spot-rows"><div><dt>Elevation</dt><dd>not read yet</dd></div><div><dt>Slope of the field</dt><dd>not read yet</dd></div><div><dt>Corners</dt><dd>${info.corners}</dd></div></dl>
    <p class="cap">Heights for the outline come from the height map once that lookup is switched on. Crophalo does not guess them.</p>
    <div class="btnrow"><button type="button" class="btn primary" data-spot="use"${info.used ? ' disabled' : ''}>Use for my report</button><button type="button" class="btn" data-spot="clear">Clear area</button></div>`;
  panel.querySelector('[data-spot=use]').addEventListener('click', () => ctx.use());
  panel.querySelector('[data-spot=clear]').addEventListener('click', () => { closeSpot(false); ctx.clear(); });
}
async function fillSun(panel) {
  const pin = ctx.pin();
  if (!pin) { panel.innerHTML = '<p class="cap">Drop a pin first: tap the map where your field is.</p>'; return; }
  panel.setAttribute('aria-busy', 'true'); panel.innerHTML = '<p class="spot-wait"><i class="dot busy" aria-hidden="true"></i> Reading the field\'s clock…</p>';
  const mine = card, got = await getForecast(pin.lat, pin.lon);
  if (card !== mine || tab !== 'sun') return;
  panel.removeAttribute('aria-busy');
  const known = got.ok && got.offsetS != null && got.today, opts = known ? { offsetMin: got.offsetS / 60, lon: pin.lon } : { lon: pin.lon };
  const [y, m, d] = (known ? got.today : new Date().toISOString().slice(0, 10)).split('-').map(Number);
  const ev = sunEvents({ y, m, d }, pin.lat, pin.lon), shadow = shadowRatio(ev.noonHeight);
  const hours = Math.floor(ev.daylightMinutes / 60), mins = Math.round(ev.daylightMinutes % 60), day = mins ? `${hours} h ${mins} min` : `${hours} h`;
  const rows = ev.state === 'day' ? '<p>The sun does not set today.</p>' : ev.state === 'night' ? '<p>The sun does not rise today.</p>'
    : `<dl class="spot-rows"><div><dt>Sun up</dt><dd>${clock(ev.rise, opts)}</dd></div><div><dt>Sun down</dt><dd>${clock(ev.set, opts)}</dd></div><div><dt>Daylight</dt><dd>${day}</dd></div></dl>`;
  panel.innerHTML = `${rows}<p>Highest at ${clock(ev.noon, opts)}, ${heightWords(ev.noonHeight)} above the horizon.${shadow ? ` On flat ground a 1 m post casts a ${shadow.toFixed(1)} m shadow then.` : ''}</p>
    <p class="cap">${known ? timesAreWords({ offsetMin: opts.offsetMin }) : 'The field\'s clock could not be read, so these are sun times (noon is when the sun is highest).'} Worked out on this device from the date and the place.</p>`;
}
