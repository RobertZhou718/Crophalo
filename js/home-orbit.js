// Crophalo's home Earth: NASA's Blue Marble turning on a WebGL globe behind the first screen, with the real satellites of js/home-sats.js
// around it. One clock here drives all that moves: Full turns, Less redraws once a minute, Still never moves; Pause, a hidden tab and a
// screen scrolled away stop it. Pure: easeIn(), the shader text. The rest draws on the page and asks NASA GIBS for the picture.
// Checked by scripts/e2e_home.mjs (turning, pausing, the three motion levels, the hidden tab, offline) and scripts/e2e.mjs (fit, still, offline).
import { motionOff, motionLess } from './motion.js';
import { EARTH_SMALL, EARTH_SHARP, loadBitmap, loadPicture } from './home-picture.js';
import { askOrbits, PRELOAD } from './home-orbits-ask.js';
import { PACE, MAX_AHEAD_MS, cameraRa, lonUnder, sunView, clockWords, nowButtonWords, hintWords } from './home-time.js';

const D = Math.PI / 180, LAT = 22;   // seen from 22° north; the camera stands still in space and the Earth turns under it (js/home-time.js)
const TILE = 512, CLOCK_MS = 500;
export const easeIn = t => t * t * (3 - 2 * t);   // smooth at both ends, never past its end

// ---- WebGL: the disk worked out per pixel, an orthographic view as the satellites are drawn (js/home-sats-data.js project())
const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
precision PREC float;
uniform vec2 uSize;uniform vec2 uC;uniform float uR;uniform vec2 uLL;uniform sampler2D uWorld;uniform sampler2D uPrev;uniform float uMix;uniform vec3 uSun;uniform float uFloor;uniform float uSeam;
const float PI=3.14159265;
void main(){
  vec2 px=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);vec2 d=px-uC;vec2 q=vec2(d.x,-d.y)/uR;float r2=dot(q,q);vec3 sky=vec3(.56,.74,1.);
  if(r2>1.){float a=exp(-(sqrt(r2)-1.)*uR/max(4.,uR*.04))*.5;gl_FragColor=vec4(sky*a,a);return;}
  float z=sqrt(1.-r2);float sp=sin(uLL.x),cp=cos(uLL.x);
  float lat=asin(clamp(z*sp+q.y*cp,-1.,1.));float u=(uLL.y+atan(q.x,z*cp-q.y*sp))/(2.*PI)+.5;
  vec2 uv=vec2(fract(u),.5-lat/PI);
#ifdef GL_OES_standard_derivatives
  if(uSeam>0.){vec2 uv2=vec2(fract(u+.5)-.5,uv.y);if(fwidth(uv.x)>fwidth(uv2.x)+1e-5)uv=uv2;}
#endif
  vec3 col=texture2D(uWorld,uv).rgb;if(uMix<1.)col=mix(texture2D(uPrev,uv).rgb,col,uMix);   // the new picture comes in over the one before, softly
  float lam=clamp(dot(vec3(q,z),uSun)*1.25+.1,0.,1.);   // the Sun's own direction for the moment shown: a day side, a night side and a soft edge between
  col*=mix(.14+.96*lam,1.,uFloor);   // uFloor 0 is the night side as it is; the Descent raises it to 1 so a field at night lands on a normally lit mapcol=mix(col,sky,pow(1.-z,3.)*.5);
  gl_FragColor=vec4(min(col,vec3(1.)),1.);
}`;

function makeGl(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch { gl = null; }
  if (!gl) return null;
  const seam = !!gl.getExtension('OES_standard_derivatives'), aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const high = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision > 0;
  const shader = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG.replace('PREC', high ? 'highp' : 'mediump'));
  if (!vs || !fs) return null;
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  const u = {}; for (const name of ['uSize', 'uC', 'uR', 'uLL', 'uWorld', 'uPrev', 'uMix', 'uSun', 'uFloor', 'uSeam']) u[name] = gl.getUniformLocation(prog, name);
  gl.uniform1i(u.uWorld, 0); gl.uniform1i(u.uPrev, 1); gl.uniform1f(u.uMix, 1); gl.uniform1f(u.uSeam, seam ? 1 : 0);
  // A picture goes up in 512 px tiles, one a frame, so no step holds the page long (under 50 ms on a 4x slower processor); mipmapped (with the seam fix) so the edge stays calm, not glittering.
  // pic: a bitmap already decoded away from the page's thread (js/home-picture.js loadBitmap), so a tile is only cut, never decoded again.
  // RGBA, the layout the browser and the graphics chip keep pictures in: an RGB texture made every tile be converted pixel by pixel on the page's own thread.
  let shown = null, prev = null, fade = null;
  async function upload(pic, { fadeMs = 0 } = {}) {
    const w = pic.naturalWidth || pic.width, h = pic.naturalHeight || pic.height, frame = () => new Promise(done => requestAnimationFrame(done));
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (let y = 0; y < h; y += TILE) for (let x = 0; x < w; x += TILE) {
      const part = await createImageBitmap(pic, x, y, Math.min(TILE, w - x), Math.min(TILE, h - y));
      await frame();
      if (gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, part); part.close?.();
      gl.bindTexture(gl.TEXTURE_2D, shown);   // frames between tiles keep drawing the whole picture there is, never the half-made one
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const pot = !(w & (w - 1)) && !(h & (h - 1)), mip = seam && pot;
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, mip ? gl.REPEAT : gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    if (mip && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
    if (shown && fadeMs > 0) {   // the finer picture comes in over the first: the one before is kept (unit 1) until the fade is done
      if (prev) gl.deleteTexture(prev);
      prev = shown; fade = { t0: performance.now(), ms: fadeMs };
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    } else if (shown) gl.deleteTexture(shown);
    shown = tex;
  }
  const mix = () => { if (!fade) return 1; const k = Math.min(1, (performance.now() - fade.t0) / fade.ms); if (k >= 1) { fade = null; if (prev) { gl.deleteTexture(prev); prev = null; } return 1; } return k * k * (3 - 2 * k); };
  return { gl, u, upload, mix, fading: () => !!fade, maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048 };
}

// ---- the Earth on the page. go: what the satellite cards link to ({ map(), demo() }).
export let theGlobe = null;   // the one Earth on the page, for the Descent (js/macro-descent.js)
export function startOrbit({ go = {} } = {}) {
  const $ = id => document.getElementById(id);
  const orbit = $('orbit'), stage = $('orbitStage'), box = $('orbitBox'), canvas = $('orbitCanvas'), pauseBtn = $('orbitPause'), credit = $('orbitCreditPic');
  if (!orbit || !stage || !box || !canvas) return null;
  const R = makeGl(canvas);
  const level = () => (motionOff() ? 'still' : motionLess() ? 'less' : 'full');
  const lowData = navigator.connection?.saveData === true || /(^|-)2g$|^3g$/.test(navigator.connection?.effectiveType || '');
  const now0 = Date.now();
  const state = { sunShift: 0, over: null, lifted: false, force: false, floor: 0, ra: cameraRa(now0), pace: PACE, paused: false, holds: new Set(), shown: now0, raf: 0, last: 0, visible: true, minute: 0, clockAt: 0,
    cam: null, size: 0, dpr: 1, z: 1, r: 0, at: { left: 0, top: 0 }, world: false, layer: null, level: level() };

  // -- where the globe sits: the stylesheet places it, in a square 2.5 radii wide for the satellites. Drawing is in screen pixels; page pixels are them / z (Larger text).
  function measure() {
    if (state.lifted) return true;   // lifted into the Descent's own layer: the size is the one it gave
    const s = stage.getBoundingClientRect(), b = box.getBoundingClientRect(), ph = stage.querySelector('.orbit-ph').getBoundingClientRect();
    if (s.width < 40 || ph.width < 20 || b.width < 20) return false;   // the home is behind another screen: keep the last measure
    const z = s.width / (stage.offsetWidth || s.width) || 1, size = b.width, dpr = Math.min(devicePixelRatio || 1, 2);
    if (Math.round(size * dpr) !== canvas.width || dpr !== state.dpr) { canvas.width = canvas.height = Math.round(size * dpr); }
    Object.assign(state, { size, dpr, z, r: ph.width / 2, at: { left: (b.left - s.left) / z, top: (b.top - s.top) / z } });
    state.layer?.resize?.(size, dpr);
    return true;
  }
  const cam = () => state.over ? { ...state.over } : ({ lat: LAT, lon: lonUnder(state.ra, state.shown), x: state.size / 2, y: state.size / 2, r: state.r });   // the Earth-fixed longitude under the middle: it falls as the Earth turns east

  // -- the clock of all that moves. shown: the moment the Earth and the satellites are drawn at; at Full it runs PACE times faster than life, from now, and never more than a day
  //    ahead (then it starts again from now). Pause or the keyboard hold it; pointing at a satellite holds only that satellite (js/home-sats.js). Less: real pace, a new drawing a minute. Still: the present moment, never again.
  const held = () => state.paused || state.holds.size > 0;
  const homeShown = () => !document.getElementById('view-home')?.hidden && !document.querySelector('dialog[open]');
  const awake = () => state.force || state.visible && document.visibilityState === 'visible' && homeShown();
  const drawsAny = () => !!(R && state.world) || !!state.layer;   // with no picture and no satellites there is nothing to move, and no Pause
  const moving = () => awake() && drawsAny() && state.level === 'full' && !held();
  const showPause = () => { if (pauseBtn) pauseBtn.hidden = state.level === 'still' || !drawsAny(); };
  const wake = () => { if (!state.raf && awake()) state.raf = requestAnimationFrame(frame); };
  const clockEl = $('orbitClockText'), nowBtn = $('orbitNow'), hintEl = $('orbitHint');
  function words(force) {   // the moment drawn and the pace, in plain words; a few times a second, never every frame
    const t = performance.now();
    if (!force && t - state.clockAt < CLOCK_MS) return; state.clockAt = t;
    const pace = state.level === 'full' ? state.pace : 1;
    if (clockEl) { const text = clockWords(state.shown, { pace, level: state.level }); if (clockEl.textContent !== text) clockEl.textContent = text; }
    if (nowBtn) { nowBtn.hidden = state.level === 'still'; nowBtn.textContent = nowButtonWords(state.level === 'full' ? state.pace : 1); }
  }
  function frame(now) {
    state.raf = 0;
    const dt = state.last ? Math.min(80, now - state.last) : 16; state.last = now; if (!moving()) state.last2 = 0;
    if (state.level === 'full' && !held()) {
      state.shown += Math.min(250, now - (state.last2 || now)) * state.pace; state.last2 = now;   // real time, not the capped frame time: a slow frame never slows the clock
      if (state.shown - Date.now() > MAX_AHEAD_MS) { state.shown = Date.now(); state.ra = cameraRa(state.shown); }   // a day ahead: start again from now
    }
    draw();
    if (moving()) state.raf = requestAnimationFrame(frame); else state.last = 0;
  }
  function draw() {
    if (!state.size && !measure()) return;
    const c = state.cam = cam();
    if (R && state.world) {
      const { gl, u } = R, k = state.dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(u.uMix, R.mix()); gl.uniform2f(u.uSize, canvas.width, canvas.height); gl.uniform2f(u.uC, c.x * k, c.y * k); gl.uniform1f(u.uR, c.r * k); gl.uniform2f(u.uLL, c.lat * D, c.lon * D); gl.uniform3fv(u.uSun, sunView(c, state.shown - state.sunShift)); gl.uniform1f(u.uFloor, state.floor);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (R.fading()) requestAnimationFrame(draw);   // a soft change of picture draws its few frames even when the Earth stands still
    }
    state.layer?.draw(c, state.shown); words();
  }
  function hold(key, on) {   // Pause or the keyboard: everything stands still where it is, at once
    if (on) state.holds.add(key); else state.holds.delete(key);
    wake();
  }
  const turnTo = () => {};   // the Earth turns by itself now; a satellite on the far side comes round, and its card says where it is
  // Less: real pace, one new drawing a minute at most, none while held
  function minute() {
    clearTimeout(state.minute);
    if (state.level !== 'less') return;
    state.minute = setTimeout(() => { if (!held() && awake()) { state.shown = Date.now(); draw(); words(true); } minute(); }, 60e3 - (Date.now() % 60e3) + 50);
  }
  function setLevel() {
    const was = state.level; state.level = level();
    if (was !== state.level && !held()) state.shown = Date.now();   // another level starts from the present moment
    if (hintEl && !hintEl.hidden) hintEl.textContent = hintWords(state.level, state.pace, matchMedia('(hover: none)').matches);
    showPause();
    orbit.dataset.motion = state.level;
    minute(); draw(); words(true); wake();
    state.layer?.level?.(state.level);
  }

  // -- Pause: everything that moves by itself
  pauseBtn?.addEventListener('click', () => {
    state.paused = !state.paused;
    hold('pause', state.paused);
    pauseBtn.setAttribute('aria-label', state.paused ? 'Play: move the Earth and the satellites again' : 'Pause the Earth and the satellites');
    pauseBtn.querySelector('.t').textContent = state.paused ? 'Play' : 'Pause';
    pauseBtn.querySelector('path').setAttribute('d', state.paused ? 'M4.5 2.8 13 8l-8.5 5.2z' : 'M4 3h3v10H4zm5 0h3v10H9z');
  });

  // -- "Now": back to the present moment at real pace; pressed again ("Speed up") the sped-up time runs from now
  nowBtn?.addEventListener('click', () => {
    state.pace = state.pace > 1 ? 1 : PACE; state.shown = Date.now(); state.ra = cameraRa(state.shown);
    draw(); words(true); state.layer?.level?.(state.level); wake();
  });

  // -- the picture after first paint; a finer one a moment later on a sharp screen
  async function loadWorld() {
    if (!R) { if (credit) credit.textContent = 'This browser cannot draw the picture of the Earth, so a plain globe stands in for it.'; return; }   // no WebGL (a blocked graphics chip)
    const load = url => (typeof createImageBitmap === 'function' && typeof fetch === 'function' ? loadBitmap(url) : loadPicture(url));
    const put = async (pic, o) => { try { await R.upload(pic, o); } finally { pic.close?.(); } };   // a bitmap's memory is freed once it is on the graphics chip
    // The Earth ships with the app, so it never waits for another server: a small picture at once, the sharp one when it has loaded, over it in 300 ms (not at Less and Still).
    try {
      await put(await load(EARTH_SMALL));
      state.world = true; stage.classList.add('lit'); canvas.classList.add('shown'); showPause();
      document.dispatchEvent(new CustomEvent('crophalo:orbit-ready'));
      if (credit) credit.textContent = 'Blue Marble (2004): NASA Earth Observatory.';
      draw(); wake();
      load(EARTH_SHARP).then(pic => put(pic, { fadeMs: state.level === 'full' ? 300 : 0 })).then(() => { draw(); wake(); }, () => { /* the first Earth stays */ });
    } catch { if (credit) credit.textContent = 'The picture of the Earth could not load right now.'; }
  }

  // -- follow the page
  new ResizeObserver(() => { if (measure()) { draw(); wake(); } }).observe(stage);
  new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; wake(); }).observe(stage);
  document.addEventListener('visibilitychange', wake);
  document.addEventListener('close', wake, true);   // a sheet in front (the welcome, Saved) closed: the Earth turns again
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', setLevel);
  new MutationObserver(setLevel).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  const home = document.getElementById('view-home');
  if (home) new MutationObserver(wake).observe(home, { attributes: true, attributeFilter: ['hidden'] });
  if (R) canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); state.world = false; stage.classList.remove('lit'); canvas.classList.remove('shown'); });
  else orbit.classList.add('no-gl');

  // -- for the Descent: the globe's canvases go into a layer of its own over the whole window, drawn from a camera the Descent gives (window pixels), and back again
  let home0 = null;
  function lift(layer, w, h) {
    if (layer) {
      if (state.lifted) return;
      home0 = { parent: box.parentNode, next: box.nextSibling, style: box.getAttribute('style') };
      const S = Math.max(w, h), dpr = Math.min(devicePixelRatio || 1, 1.5);
      layer.append(box); box.style.cssText = `position:absolute;left:0;top:0;width:${S}px;height:${S}px`;
      Object.assign(state, { lifted: true, size: S, dpr, z: 1, at: { left: 0, top: 0 } });
      canvas.width = canvas.height = Math.round(S * dpr); state.layer?.resize?.(S, dpr);
    } else if (state.lifted) {
      state.lifted = false; state.over = null; state.floor = 0;
      if (home0) { home0.parent.insertBefore(box, home0.next); if (home0.style == null) box.removeAttribute('style'); else box.setAttribute('style', home0.style); home0 = null; }
      state.size = 0; measure(); draw();
    }
  }
  const globe = {
    sunShift: ms => { state.sunShift = ms; draw(); }, lift, camera: over => { state.over = over; draw(); }, floor: f => { state.floor = f; }, force: on => { state.force = !!on; wake(); }, satAlpha: a => { const c = $('satCanvas'); if (c) c.style.opacity = a >= 1 ? '' : String(a); }, hasWorld: () => !!(R && state.world),
    cam: () => state.cam || cam(), clock: () => state.shown, level: () => state.level, pace: () => (state.level === 'full' ? state.pace : 1), moving, lowData, held, hold, turnTo, wake, draw, go,
    box: () => ({ ...state.at, size: state.size, dpr: state.dpr, z: state.z || 1 }),
    setLayer(layer) { state.layer = layer; layer.resize?.(state.size, state.dpr); layer.level?.(state.level); showPause(); draw(); wake(); },
  };
  globe.orbits = askOrbits().catch(() => null);   // the orbits are asked at once, not after the satellites' code: one wave, and the answer is kept for two hours
  for (const href of PRELOAD) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = href; document.head.append(l); }
  theGlobe = globe;
  measure(); setLevel(); loadWorld();
  // the satellites: their orbit library and their elements come after the Earth, never before the first paint
  import('./home-sats.js').then(m => m.startSats(globe)).catch(() => {
    for (const id of ['satAlt', 'orbitCreditSats']) { const el = $(id); if (el) el.textContent = 'The satellites’ orbits could not load right now, so they are not drawn.'; }
  });
  return globe;
}
