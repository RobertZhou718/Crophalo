// Crophalo's satellites on the home Earth: the thirteen whose data Crophalo reads, each where it is now (SGP4 on its orbital elements, with
// satellite.js) with a trail of its real path; pointing, a tap or Tab holds all still and opens its card. Pure sums: readAll(), place(), home-sats-data.js.
// Checked by scripts/e2e_home.mjs (hover, keyboard, touch, Escape, Pause, the motion levels, positions against SGP4, offline, fit, axe, speed).
import { json2satrec } from '../vendor/satellite/io.js';
import { sgp4 } from '../vendor/satellite/propagation/sgp4.js';
import { gstime } from '../vendor/satellite/propagation/gstime.js';
import { eciToEcf, eciToGeodetic } from '../vendor/satellite/transforms.js';
import { hintWords as paceHint } from './home-time.js';
import { askOrbits } from './home-orbits-ask.js';
import { SATS, WORDS, GO_WORDS, MARKS, markSvg, glideFrom, EARTH_KM, epochMs, isoMs, ageState, ageWords, stampWords, spanWords, clockWords, latWords, lonWords, kmWords, speedWords, project, hidden, cardPlace } from './home-sats-data.js';

const STEP_MS = 20e3, TRAIL = 25, BANDS = 8, HIT = 22, GLOW = 26;   // the trail: the last 8 minutes of each path, a point every 20 s, fading in 8 steps
const SHARP = 1100;   // the satellites' canvas, at most this many pixels a side (about 1.2 million in all); at 1,654 a side (a laptop screen 1,440 px wide at 2x) the page drew only 20 to 27 frames a second
const TAG_FONT = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, Arial, sans-serif', DIM = .4, DIM_MS = 240, GROW = .8, BACK_MS = 400;   // with a card open the others fade to DIM and the one pointed at grows by GROW
const FONT = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, Arial, sans-serif';
const JD = ms => ms / 864e5 + 2440587.5, R2D = 180 / Math.PI, $ = id => document.getElementById(id), pause = () => new Promise(done => setTimeout(done));
let sky = null, witnessNow = null;   // witnessNow: during the Descent only the satellite that passes over the place stays, with a line to it (js/macro-descent.js)
export const setWitness = w => { witnessNow = w; };
let placesAt = () => [];
export const positionsAt = ms => placesAt(ms);   // where each satellite is at a real moment (km, fixed to the Earth), whatever moment the home shows: the Witness is worked out for the real present

// ---- the elements: asked at once by the Earth (js/home-orbits-ask.js), from our own server, which asks CelesTrak at most every 12 hours for every visitor together
// { list: the satellites that can be drawn, left: those that cannot and why, total: how many are still at work for Crophalo }, a few at a time so the page never waits
export async function readAll(answer, now = Date.now()) {
  const got = new Map((answer?.ok && Array.isArray(answer.satellites) ? answer.satellites : []).map(s => [s?.norad, s])), list = [], left = [];
  let total = 0;
  for (const [i, sat] of SATS.entries()) {
    if (i && !(i % 4)) await pause();
    if (sat.until && now > Date.parse(sat.until)) continue;   // its work for Crophalo's data has ended
    total++;
    const s = got.get(sat.norad), epoch = epochMs(s?.omm?.EPOCH);
    if (!s || !Number.isFinite(epoch)) { left.push({ sat, why: 'none' }); continue; }
    if (ageState(now - epoch) === 'gone') { left.push({ sat, why: 'old', epoch }); continue; }
    let rec = null; try { rec = json2satrec({ ...s.omm, EPOCH: isoMs(epoch) }); } catch { rec = null; }
    if (!rec || rec.error) { left.push({ sat, why: 'none' }); continue; }
    list.push({ sat, rec, epoch, trail: new Map(), now: null, at: null, pts: [] });
  }
  return { list, left, total };
}
// One satellite at moment t, fixed to the Earth, in Earth radii (null when SGP4 cannot place it)
function where(it, t, gmst = gstime(JD(t))) {
  const r = sgp4(it.rec, (JD(t) - it.rec.jdsatepoch) * 1440);
  if (!r || !r.position || !Number.isFinite(r.position.x)) return null;
  const e = eciToEcf(r.position, gmst);
  return { x: e.x / EARTH_KM, y: e.y / EARTH_KM, z: e.z / EARTH_KM, eci: r.position, v: r.velocity, gmst };
}
// Every satellite at t on the view cam, with its trail (at most `fresh` new trail points each, so a first drawing is quick)
export function place(items, cam, t, fresh = Infinity) {
  const g = gstime(JD(t)), k = Math.floor(t / STEP_MS);
  for (const it of items) {
    it.now = where(it, t, g); it.at = it.now && project(cam, it.now); it.seen = !!it.at && !hidden(cam, it.at);
    for (const slot of it.trail.keys()) if (slot <= k - TRAIL || slot > k) it.trail.delete(slot);
    it.pts = it.at ? [it.at] : [];
    for (let i = 0, made = 0; it.at && i < TRAIL - 1; i++) {
      let p = it.trail.get(k - i);
      if (p === undefined) { if (made++ >= fresh) break; p = where(it, (k - i) * STEP_MS); it.trail.set(k - i, p); }
      if (!p) break;
      it.pts.push(project(cam, p));
    }
  }
}

export async function startSats(globe) {
  const orbit = $('orbit'), stage = $('orbitStage'), canvas = $('satCanvas'), list = $('satList'), card = $('satCard'), alt = $('satAlt'), line = $('orbitCreditSats'), hint = $('orbitHint');
  if (!orbit || !stage || !canvas || !list || !card) return null;
  const say = text => { if (alt) alt.textContent = text; };
  say(WORDS.loading); if (line) line.textContent = 'Orbits: loading…';
  let answer = null; try { answer = await (globe.orbits ?? askOrbits()); } catch { answer = null; }
  const { list: items, left, total } = await readAll(answer);
  if (!items.length) { say(WORDS.down); if (line) line.textContent = WORDS.down; return null; }

  // -- the words: the credit with the elements' epochs, the text for screen readers, what could not be drawn
  const epochs = items.map(i => i.epoch);
  if (line) line.textContent = WORDS.credit(spanWords(Math.min(...epochs), Math.max(...epochs)));
  const gone = left.filter(l => l.why === 'old').map(l => `${l.sat.name}: its newest orbital elements are ${ageWords(Date.now() - l.epoch)} old, so it is not drawn.`);
  say([WORDS.alt(items.length), left.length ? WORDS.some(left.length, total) : '', ...gone].filter(Boolean).join(' '));
  const hintWords = lv => `${paceHint(lv, globe.pace(), matchMedia('(hover: none)').matches)}${left.length ? ' ' + WORDS.some(left.length, total) : ''}`;

  // -- one button per satellite for the keyboard and screen readers, unseen until it has the focus. Its description is read with the button
  //    only (hidden, so a screen reader moving line by line does not hear it a second time).
  list.innerHTML = items.map(({ sat }) => `<li><button type="button" class="sat-btn" id="sat-${sat.norad}" data-norad="${sat.norad}" aria-describedby="satd-${sat.norad}" aria-controls="satCard" aria-expanded="false"><span class="sr">${sat.name}, ${sat.by}</span></button><span id="satd-${sat.norad}" hidden>${sat.plain.join(' ')}</span></li>`).join('');
  const btnOf = it => $(`sat-${it.sat.norad}`), itemOf = el => items.find(it => String(it.sat.norad) === el?.dataset?.norad);

  placesAt = ms => items.map(it => { const n = where(it, ms); return { norad: it.sat.norad, name: it.sat.name, ecf: n ? [n.x * EARTH_KM, n.y * EARTH_KM, n.z * EARTH_KM] : null }; });

  // -- drawing: the far side first, cut by the disk, then the near side; all trails in a few fading strokes
  const ctx = canvas.getContext('2d');
  let size = 0, dpr = 1, glow = null, tags = false, dim = 1, dimFrom = 1, dimTo = 1, dimT0 = 0;
  const paths = {};   // each look's mark as paths, made once
  for (const [look, m] of Object.entries(MARKS)) paths[look] = { d: new Path2D(m.d), s: m.s ? new Path2D(m.s) : null, tint: m.tint };
  const setDim = to => { dimFrom = dim; dimTo = to; dimT0 = performance.now(); };
  const dimNow = () => { if (globe.level() !== 'full' || !globe.moving()) return dimTo; const k = Math.min(1, (performance.now() - dimT0) / DIM_MS); return dimFrom + (dimTo - dimFrom) * k * k * (3 - 2 * k); };
  function resize(s, d) {   // this canvas is drawn afresh every frame: on a sharp screen it is kept to SHARP px a side, which a laptop's graphics chip redraws 60 times a second
    if (!s) return;
    size = s; tags = orbit.clientWidth >= 768; dpr = Math.min(d, Math.max(1, SHARP / s)); canvas.width = canvas.height = Math.round(s * dpr);
    glow = document.createElement('canvas'); glow.width = glow.height = Math.round(GLOW * dpr);
    const g = glow.getContext('2d'), c = glow.width / 2, grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,.62)'); grad.addColorStop(.35, 'rgba(255,255,255,.2)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, glow.width, glow.width);
  }
  function trails(front, k, list = items) {
    for (let b = 0; b < BANDS; b++) {
      ctx.beginPath(); let any = false;
      for (const { pts } of list) {
        const n = pts.length - 1, a0 = Math.floor(b * n / BANDS), a1 = Math.floor((b + 1) * n / BANDS);
        for (let i = a0; i < a1; i++) { const a = pts[i], c = pts[i + 1]; if ((a.depth + c.depth >= 0) !== front) continue; ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); any = true; }
      }
      if (!any) continue;
      const fade = (1 - b / BANDS) ** 1.5 * k;
      ctx.lineWidth = 5; ctx.strokeStyle = `rgba(255,255,255,${(.14 * fade).toFixed(3)})`; ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = `rgba(255,255,255,${(.8 * fade).toFixed(3)})`; ctx.stroke();
    }
  }
  function heads(front, k, list = items) {   // each satellite as its own small mark, along its path, in a soft light; twins carry a small tag; the one pointed at is larger, the others fainter
    const grow = 1 + GROW * (1 - dim) / (1 - DIM);
    for (const it of list) {
      const { at, pts, sat } = it;
      if (!at || (at.depth >= 0) !== front) continue;
      const on = it === active, p = paths[sat.look];
      ctx.globalAlpha = k * (on ? 1 : dim);
      ctx.drawImage(glow, at.x - GLOW / 2, at.y - GLOW / 2, GLOW, GLOW);
      ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(pts[1] ? Math.atan2(at.y - pts[1].y, at.x - pts[1].x) : 0); if (on) ctx.scale(grow, grow);
      ctx.fillStyle = p.tint; ctx.fill(p.d); if (p.s) { ctx.strokeStyle = p.tint; ctx.lineWidth = 1.4; ctx.stroke(p.s); }
      ctx.restore();
      if (tags && sat.tag) { ctx.font = TAG_FONT; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(sat.tag, at.x + 10, at.y - 10); }
    }
    ctx.globalAlpha = 1;
  }
  // At Full only the satellite pointed at holds still, under the pointer (pin); the Earth and the others move on. Let go, it eases back to its true place in BACK_MS, never a jump.
  let pin = null, ret = null;
  function hold() {
    if (pin && active?.at) { active.at = { ...active.at, x: pin.x, y: pin.y, depth: Math.max(active.at.depth, .01) }; active.pts = [active.at]; active.seen = true; }
    if (ret) {
      const it = ret.it, k = Math.min(1, (performance.now() - ret.t0) / BACK_MS), e = k * k * (3 - 2 * k);
      if (k >= 1 || !it.at || it === active) ret = null;
      else { it.at = { ...it.at, x: ret.x + (it.at.x - ret.x) * e, y: ret.y + (it.at.y - ret.y) * e, depth: e < .5 ? Math.max(it.at.depth, .01) : it.at.depth }; it.pts = it.pts.slice(0, 1).map(() => it.at); }
    }
  }
  const letGo = () => { if (pin && active?.at) ret = { it: active, x: pin.x, y: pin.y, t0: performance.now() }; pin = null; };
  function mark(it) {   // the one pointed at: a ring, and its name away from its card
    if (!it?.at) return;
    const { x, y } = it.at, name = it.sat.short || it.sat.name;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(7,13,24,.6)'; ctx.beginPath(); ctx.arc(x, y, 24, 0, 2 * Math.PI); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.font = FONT; const w = ctx.measureText(name).width + 18, h = 24;
    let tx = side === 'right' ? x - 31 - w : side === 'left' ? x + 31 : x - w / 2, ty = side === 'below' ? y - 31 - h : side === 'above' ? y + 31 : y - h / 2;
    tx = Math.max(4, Math.min(size - w - 4, tx)); ty = Math.max(4, Math.min(size - h - 4, ty));
    ctx.fillStyle = 'rgba(7,13,24,.84)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(tx, ty, w, h, 12); else ctx.rect(tx, ty, w, h); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(name, tx + 9, ty + h / 2 + .5);
  }
  function draw(cam, t) {
    if (!size || !glow) return;
    place(items, cam, t, globe.level() === 'full' ? 4 : Infinity);   // turning: trails grow in over a few frames; still: whole at once
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(cam.x, cam.y, cam.r, 0, 2 * Math.PI); ctx.clip('evenodd');
    dim = dimNow(); hold();
    const w = witnessNow && items.find(it => it.sat.norad === witnessNow.norad);
    if (witnessNow) {   // the Descent: only the Witness, its trail and a thin line from it to the place, drawing itself
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      if (w?.at) { trails(true, 1, [w]); heads(true, 1, [w]); const p = witnessNow.place && project(cam, witnessNow.place), k = Math.min(1, Math.max(0, witnessNow.k || 0));
        if (p) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(w.at.x, w.at.y); ctx.lineTo(w.at.x + (p.x - w.at.x) * k, w.at.y + (p.y - w.at.y) * k); ctx.stroke(); ctx.restore(); } }
      sky = { time: t, cam, level: globe.level(), dim: 1, tags, pinned: false, active: null, sats: [] }; return;
    }
    const others = active ? items.filter(it => it !== active) : items, one = active ? [active] : [];
    trails(false, .5 * dim, others); trails(false, .5, one); heads(false, .55); ctx.restore();
    trails(true, dim, others); trails(true, 1, one); heads(true, 1); mark(active);
    sky = { time: t, cam, level: globe.level(), dim, tags, pinned: !!pin, active: active?.sat.norad ?? null, sats: items.map(it => ({ norad: it.sat.norad, name: it.sat.name, look: it.sat.look, x: it.at?.x ?? null, y: it.at?.y ?? null,
      depth: it.at?.depth ?? null, seen: it.seen, ecf: it.now && [it.now.x * EARTH_KM, it.now.y * EARTH_KM, it.now.z * EARTH_KM], trail: it.pts.length })) };
    follow();
  }

  // -- the card: by pointing (closes on leaving), a tap or click (stays), or the keyboard
  const F = id => card.querySelector('#' + id);
  let active = null, mode = null, side = '', later = 0, dismissed = null, quiet = false;
  function fill(it) {
    const s = it.sat, n = it.now, t = globe.clock(), g = n && eciToGeodetic(n.eci, n.gmst), age = Date.now() - it.epoch, far = n && it.at && !it.seen;   // the numbers are for the time shown; the age of the elements is counted from now
    F('satCardName').textContent = s.name; F('satCardDoes').textContent = s.plain.join(' ');
    F('satCardBy').textContent = `${WORDS.runBy} ${s.by}.`; F('satCardGathers').textContent = `${WORDS.tool} ${s.gathers}. ${s.more}${s.note ? ' ' + s.note : ''}`; F('satCardUses').textContent = s.uses;
    const goTo = F('satCardGo'); goTo.textContent = GO_WORDS[s.go] || GO_WORDS.map; goTo.dataset.go = s.go;
    F('satCardNow').textContent = g ? `${far ? 'On the far side of the Earth right now. ' : ''}At ${clockWords(t)}, the time shown: ${kmWords(g.height)} up, ${speedWords(Math.hypot(n.v.x, n.v.y, n.v.z))}, over ${latWords(g.latitude * R2D)}, ${lonWords(g.longitude * R2D)}.` : 'Its position could not be worked out just now.';
    F('satCardSrc').textContent = `Position from orbital elements of ${stampWords(it.epoch)}, ${ageWords(age)} old.${ageState(age) === 'old' ? ' Elements this old can put it some tens of kilometres off.' : ''}`;
    const page = F('satCardPage'); page.href = s.page; page.firstChild.textContent = s.pageWords;
  }
  // -- the card's dark window: the satellite's own mark, large, and over it the real picture where there is one (js/home-craft.js, loaded on the first pointing)
  const pic = F('satCardPic'), win = pic.querySelector('.sat-pic-win'), big = pic.querySelector('.sat-pic-mark'), img = F('satCardImg'), cap = F('satCardCredit');
  let craft, landed = Promise.resolve(), spot = null;
  const loadCraft = () => (craft ||= import('./home-craft.js').catch(() => null));
  function picture(it) {
    const s = it.sat, has = s.look !== 'jpss' && s.look !== 's2';
    big.innerHTML = markSvg(s.look); pic.classList.remove('has-pic', 'glide'); img.hidden = true; img.removeAttribute('src'); img.alt = '';
    cap.textContent = has ? WORDS.picWait : WORDS.noPic;
    loadCraft().then(c => { if (active !== it) return; if (c) c.show({ pic, img, cap }, s, landed, () => active === it); else if (has) cap.textContent = navigator.onLine === false ? WORDS.picOff : WORDS.picFail; });   // no module: the mark stays, with its words
  }
  function startGlide() {   // the mark leaves the satellite's own point and grows into the window (Full only)
    if (!spot) return;
    const g = glideFrom(spot.pt, { x: spot.at.x + win.offsetLeft, y: spot.at.y + win.offsetTop, w: win.offsetWidth, h: win.offsetHeight }, big.offsetWidth);
    big.style.setProperty('--gx', `${g.gx.toFixed(1)}px`); big.style.setProperty('--gy', `${g.gy.toFixed(1)}px`); big.style.setProperty('--gs', g.gs.toFixed(3));
    pic.classList.add('glide');
    landed = new Promise(done => { const end = () => { clearTimeout(t); big.removeEventListener('animationend', end); pic.classList.remove('glide'); done(); }; big.addEventListener('animationend', end); const t = setTimeout(end, 800); });
  }
  function open(it, how, glide = true) {
    clearTimeout(later);
    const fresh = !active;
    letGo();
    active = it; mode = how; landed = Promise.resolve(); F('satCardMore').open = false; fill(it); picture(it); card.hidden = false; card.dataset.norad = it.sat.norad;
    for (const b of list.querySelectorAll('[aria-expanded=true]')) if (b !== btnOf(it)) b.setAttribute('aria-expanded', 'false');   // only the buttons that change
    btnOf(it).setAttribute('aria-expanded', 'true');
    if (globe.level() === 'full' && how !== 'focus' && it.at) { pin = { x: it.at.x, y: it.at.y }; globe.hold('card', false); } else globe.hold('card', true);   // Less, Still and the keyboard: all stands still, as before
    $('orbitBox')?.classList.add('has-card'); setDim(DIM); follow();
    if (fresh && glide && globe.level() === 'full') startGlide();
    globe.wake();
  }
  function close() {
    clearTimeout(later);
    if (!active) return;
    letGo(); active = null; mode = null; card.hidden = true;
    for (const b of list.querySelectorAll('[aria-expanded=true]')) b.setAttribute('aria-expanded', 'false');
    pic.classList.remove('glide'); $('orbitBox')?.classList.remove('has-card'); setDim(1);
    globe.hold('card', false); globe.wake();
  }
  const closeSoon = () => { clearTimeout(later); later = setTimeout(close, 160); };
  function follow() {   // the card beside its satellite, the focused button on it, as the view turns (page px = screen px / z)
    const focused = itemOf(document.activeElement?.closest?.('.sat-btn')), b = globe.box();
    if (focused?.at) btnOf(focused).style.transform = `translate(${Math.round(b.left + focused.at.x / b.z - HIT)}px, ${Math.round(b.top + focused.at.y / b.z - HIT)}px)`;
    if (!active?.at || card.hidden) return;
    const o = orbit.getBoundingClientRect(), s = stage.getBoundingClientRect(), x = (s.left - o.left) / b.z + b.left + active.at.x / b.z, y = (s.top - o.top) / b.z + b.top + active.at.y / b.z;
    // what is in sight: the part of the home that is on the glass now. The card stays inside it (it scrolls inside itself when it is taller), and it never covers the search card.
    const z = b.z || 1, rel = r => ({ x: (r.left - o.left) / z, y: (r.top - o.top) / z, w: r.width / z, h: r.height / z });
    const seeTop = Math.max(0, -o.top / z) + 8, seeBottom = Math.min(orbit.clientHeight, (innerHeight - o.top) / z) - 8, room = Math.max(120, seeBottom - seeTop);
    const cr0 = document.querySelector('.hero-credit'), c0 = cr0 && cr0.getBoundingClientRect().height ? rel(cr0.getBoundingClientRect()) : null, above = c0 ? c0.y - 12 - seeTop : room, fit = above >= 220 ? Math.min(room, above) : room;   // room above the credit lines, when there is enough of it
    card.style.maxHeight = `${Math.floor(fit)}px`; card.style.overflowY = 'auto';
    const ch = Math.min(card.offsetHeight, fit), cw = card.offsetWidth;
    const at = cardPlace(x, y, { w: cw, h: ch }, { w: orbit.clientWidth, h: orbit.clientHeight });
    at.y = Math.max(seeTop, Math.min(at.y, seeBottom - ch));
    const cr = document.querySelector('.hero-credit'), credit = cr && cr.getBoundingClientRect().height ? rel(cr.getBoundingClientRect()) : null;   // the credit lines stay whole: the card goes above them
    if (credit && at.x < credit.x + credit.w + 8 && at.x + cw > credit.x - 8 && at.y + ch > credit.y - 12) at.y = Math.max(seeTop, credit.y - 12 - ch);
    const hc = document.querySelector('.home-card'), avoid = hc && !hc.hidden ? rel(hc.getBoundingClientRect()) : null;
    if (avoid && at.x < avoid.x + avoid.w + 12 && at.x + cw > avoid.x - 12 && at.y < avoid.y + avoid.h + 12 && at.y + ch > avoid.y - 12) {   // the search card is under it: to the right of it where there is room, else below it, else above it
      if (avoid.x + avoid.w + 12 + cw <= orbit.clientWidth - 8) at.x = avoid.x + avoid.w + 12;
      else if (avoid.y + avoid.h + 12 + ch <= seeBottom) at.y = avoid.y + avoid.h + 12;
      else if (avoid.y - 12 - ch >= seeTop) at.y = avoid.y - 12 - ch;
    }
    side = at.y > y ? 'below' : at.y + ch < y ? 'above' : at.x > x ? 'right' : 'left';
    card.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`; spot = { pt: { x, y }, at };
  }
  function hit(event) {   // the nearest satellite in sight within 22 px of the pointer, never one behind the Earth
    if (event.target.closest?.('.home-card, .hero-credit, .orbit-card, a, button, input, label')) return null;
    const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left) * size / (r.width || 1), y = (event.clientY - r.top) * size / (r.height || 1);
    let best = null, d = HIT * HIT;
    for (const it of items) if (it.seen && it.at) { const e = (it.at.x - x) ** 2 + (it.at.y - y) ** 2; if (e < d) { d = e; best = it; } }
    return best;
  }
  orbit.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    const it = hit(event);
    stage.style.cursor = it ? 'pointer' : '';
    if (it) { clearTimeout(later); if (it !== dismissed && it !== active) open(it, 'hover'); }
    else { dismissed = null; if (mode === 'hover' && !card.contains(event.target)) closeSoon(); }
  }, { passive: true });
  orbit.addEventListener('pointerenter', loadCraft, { once: true, passive: true }); orbit.addEventListener('pointerdown', loadCraft, { once: true, passive: true });
  orbit.addEventListener('pointerleave', () => { stage.style.cursor = ''; if (mode === 'hover') closeSoon(); });
  card.addEventListener('pointerenter', () => clearTimeout(later));
  card.addEventListener('pointerleave', () => { if (mode === 'hover') closeSoon(); });
  orbit.addEventListener('click', event => {   // a tap or click: on a satellite it opens and stays; elsewhere it closes
    if (card.contains(event.target) || event.target.closest('a, button, input, label, select, textarea, .home-card')) return;
    const it = hit(event);
    if (it) open(it, 'pin'); else if (active && mode !== 'focus') close();
  });
  document.addEventListener('pointerdown', event => { if (active && mode === 'pin' && !orbit.contains(event.target)) close(); });
  const back = to => { if (to && document.activeElement !== to) { quiet = true; to.focus(); quiet = false; } };
  F('satClose').addEventListener('click', () => { const to = mode === 'focus' || card.contains(document.activeElement) ? btnOf(active) : null; dismissed = active; close(); back(to); });
  F('satCardGo').addEventListener('click', event => { const to = event.currentTarget.dataset.go; close(); (to === 'demo' ? globe.go.demo : globe.go.map)?.(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active) return;
    const to = card.contains(document.activeElement) || list.contains(document.activeElement) ? btnOf(active) : null;
    dismissed = active; close(); back(to);
  });
  // Tab: each satellite in turn opens its card; one behind the Earth, off the screen or under the words' card is turned to the front
  const underCard = (x, y) => {   // x, y on the stage in page px; the card is drawn over the Earth, so a satellite there could not be seen with the focus
    const s = stage.getBoundingClientRect(), r = orbit.querySelector('.home-card')?.getBoundingClientRect(), z = globe.box().z;
    return !!r && x >= (r.left - s.left) / z - HIT / 2 && x <= (r.right - s.left) / z + HIT / 2 && y >= (r.top - s.top) / z - HIT / 2 && y <= (r.bottom - s.top) / z + HIT / 2;
  };
  list.addEventListener('focusin', event => {
    const it = itemOf(event.target.closest('.sat-btn'));
    if (!it) return;
    globe.hold('focus', true);
    const b = globe.box(), x = b.left + (it.at?.x ?? -1e5) / b.z, y = b.top + (it.at?.y ?? -1e5) / b.z;
    const turn = (!it.seen || x < HIT || y < HIT || x > stage.clientWidth - HIT || y > stage.clientHeight - HIT || underCard(x, y)) && !!it.now;
    if (turn) globe.turnTo(Math.atan2(it.now.y, it.now.x) * R2D);
    loadCraft();
    if (!quiet) open(it, 'focus', !turn); else follow();
    globe.wake();
  });
  const inZone = el => !!el && (list.contains(el) || card.contains(el));
  for (const el of [list, card]) el.addEventListener('focusout', event => { if (!inZone(event.relatedTarget)) { globe.hold('focus', false); if (mode === 'focus') close(); } });
  list.addEventListener('click', event => {   // Enter or Space: into the card, to its link
    const it = itemOf(event.target.closest('.sat-btn'));
    if (it) { open(it, 'focus'); F('satCardPage').focus(); }
  });

  const home = $('view-home');
  if (home) new MutationObserver(() => { if (home.hidden) close(); }).observe(home, { attributes: true, attributeFilter: ['hidden'] });   // another screen: no card left holding the Earth
  const craftLine = $('orbitCreditCraft'); if (craftLine) craftLine.textContent = WORDS.craft;
  if (hint) { hint.textContent = hintWords(globe.level()); hint.hidden = false; }
  globe.setLayer({ draw, resize, level: lv => { if (hint) hint.textContent = hintWords(lv); if (pin && lv !== 'full') { pin = null; globe.hold('card', true); } if (active) fill(active); } });
  return { items };
}

// What was drawn last, for the checks: the moment, the view, each satellite's place (on the page, and fixed to the Earth in km)
export const skyNow = () => sky && JSON.parse(JSON.stringify(sky));
