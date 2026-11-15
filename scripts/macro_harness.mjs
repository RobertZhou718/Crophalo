// NOT YET RUN: written against scripts/e2e_lib.mjs's openRun() and never started; the first browser run of scripts/e2e_macro.mjs is the first proof of it.
// The shared browser groups every package's motion suite uses: atLevel, inputAt, assertComplete, assertNoLongFrames, captureFrames, fit320 and chainMs, each given the run that
// openRun() answers (called "page" here). Pure: decodePng() only, also checked by scripts/test_macro.mjs. The rest drives the page of that run, and only it.
import zlib from 'node:zlib';
import { flashCount } from './macro_flash.mjs';

const CORE = `import('/js/macro-core.js')`;
const sleep = ms => new Promise(done => setTimeout(done, ms));

// ---- pure: a PNG picture from the browser (8-bit RGB or RGBA, not interlaced) to { width, height, data } with four bytes a pixel
export function decodePng(buf) {
  const b = Buffer.from(buf);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG picture');
  let at = 8, width = 0, height = 0, type = 0, depth = 0, interlace = 0; const parts = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at), kind = b.toString('latin1', at + 4, at + 8), body = b.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'IDAT') parts.push(body);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`a PNG this reader does not know (depth ${depth}, type ${type}, interlace ${interlace})`);
  const raw = zlib.inflateSync(Buffer.concat(parts)), bpp = type === 6 ? 4 : 3, stride = width * bpp, out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride), row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const guess = filter === 1 ? a : filter === 2 ? up : filter === 3 ? (a + up) >> 1 : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? up : c) : 0;
      row[x] = (src[x] + guess) & 255;
    }
    for (let x = 0; x < width; x++) { const o = (y * width + x) * 4; out[o] = row[x * bpp]; out[o + 1] = row[x * bpp + 1]; out[o + 2] = row[x * bpp + 2]; out[o + 3] = bpp === 4 ? row[x * bpp + 3] : 255; }
    [prev, row] = [row, prev];
  }
  return { width, height, data: out };
}

// ---- the level: 'full', 'less', 'still' (the setting) or 'device' (the device's reduce-motion). keep: also store it, so a reload keeps it.
export async function atLevel(page, lvl, { keep = false } = {}) {
  await page.device(lvl === 'device' ? { 'prefers-reduced-motion': 'reduce' } : undefined);
  return page.js(`(async () => {
    const h = document.documentElement, lvl = ${JSON.stringify(lvl)};
    if (lvl === 'less') h.dataset.motion = 'less'; else if (lvl === 'still') h.dataset.motion = 'reduce'; else delete h.dataset.motion;
    if (${keep}) { const { SETTING_CHOICES, SETTINGS_KEY } = await import('/js/settings.js'), three = SETTING_CHOICES.motion.includes('less');
      const value = lvl === 'less' ? (three ? 'less' : 'device') : lvl === 'still' ? (three ? 'still' : 'reduce') : (three ? 'full' : 'device');
      const kept = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); kept.motion = value; localStorage.setItem(SETTINGS_KEY, JSON.stringify(kept)); }
    return (await ${CORE}).level();
  })()`);
}

// ---- a key, a click or a wheel once the named scene is at `fraction` of its time; answers what ran before and within one frame after
export async function inputAt(page, sceneName, fraction, kind = 'key') {
  const at = await page.until(`(async () => { const p = (await ${CORE})._peek().find(s => s.name === ${JSON.stringify(sceneName)}); return p && p.k >= ${Number(fraction)} ? p.k : false; })()`, 8000).catch(() => null);
  const before = await page.js(`(async () => (await ${CORE}).running())()`);
  const focus0 = await page.js('document.activeElement?.outerHTML?.slice(0, 80) || ""'), y0 = await page.js('scrollY');
  if (kind === 'key') await page.press('Tab');
  else if (kind === 'click') await page.tapAt(2, 2);
  else if (kind === 'wheel') await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 200, deltaX: 0, deltaY: 120 });
  else throw new Error(`inputAt: no input called ${kind}`);
  const after = await page.js(`(async () => { const c = await ${CORE}; await new Promise(done => requestAnimationFrame(() => done())); return c.running(); })()`);
  const acted = kind === 'key' ? (await page.js('document.activeElement?.outerHTML?.slice(0, 80) || ""')) !== focus0 : kind === 'wheel' ? (await page.js('scrollY')) !== y0 || (await page.js('document.documentElement.scrollHeight <= innerHeight')) : true;
  return { at, before, after, acted };
}

// ---- the shown view as words, controls and figures; with `against`, checks they are the same and says where not
const SNAP = `(() => { const v = document.querySelector('.view:not([hidden])'); if (!v) return null;
  const words = v.innerText.replace(/\\s+/g, ' ').trim();
  const controls = [...v.querySelectorAll('button, a[href], input, select, textarea, [role=tab]')].filter(e => !e.closest('[data-macro-control]') && !e.closest('[aria-hidden=true]'))
    .map(e => [e.tagName.toLowerCase(), e.type || '', (e.getAttribute('aria-label') || e.textContent).replace(/\\s+/g, ' ').trim().slice(0, 50), String(e.value ?? ''), !!e.disabled, e.getAttribute('aria-selected') || e.getAttribute('aria-pressed') || '']);
  const figures = [...v.querySelectorAll('canvas, svg[role=img], img, [role=img]')].filter(e => !e.closest('[aria-hidden=true]')).length;
  return { view: v.id, words, controls, figures }; })()`;
export async function assertComplete(page, { against = null, label = 'screen' } = {}) {
  const now = await page.js(SNAP);
  if (against) {
    page.check(`${label}: the same view`, now?.view === against.view, [now?.view, against.view]);
    page.check(`${label}: the same words`, now?.words === against.words, firstDiff(now?.words, against.words));
    page.same(`${label}: the same controls`, now?.controls, against.controls);
    page.same(`${label}: the same figures`, now?.figures, against.figures);
  }
  return now;
}
const firstDiff = (a = '', b = '') => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `${a.slice(Math.max(0, i - 30), i + 40)} | ${b.slice(Math.max(0, i - 30), i + 40)}`; };

// ---- the long frames and the frame intervals while `during` runs (Long Animation Frames exist in Chrome and Edge only)
export async function assertNoLongFrames(page, { during = () => sleep(1000), label = 'scene', wide = 0 } = {}) {
  await page.js(`(async () => { window.__macroProbe = (await import('/js/macro-probe.js')).probe; return window.__macroProbe.start(); })()`);
  await during();
  const r = await page.js('window.__macroProbe.stop()');
  const long = r.longFrames.filter(f => f.duration > 50);
  page.check(`${label}: no long animation frame over 50 ms`, !r.loaf || long.length === 0, long.slice(0, 5));
  if (wide >= 1440 && r.intervals.length >= 20) { const fast = r.intervals.filter(ms => ms < 20).length / r.intervals.length; page.check(`${label}: 95 % of frame intervals under 20 ms at ${wide} px`, fast >= 0.95, `${Math.round(fast * 100)} %`); }
  return r;
}

// ---- pictures of the screen for `ms`, as fast as the browser gives them, ready for flashCount()
// BELOW THE BROWSER'S FRAME RATE: openRun() gives no access to the browser's events, so this is a loop of Page.captureScreenshot, not the screencast the plan asks for.
// flashCount() answers "could not judge" (a fail) when the pictures came more than 50 ms apart in the median or 100 ms at the most, so a slow loop never passes.
export async function captureFrames(page, ms = 1000) {
  const frames = [], end = Date.now() + ms, t0 = Date.now();
  while (Date.now() < end) {
    const asked = Date.now(), { data } = await page.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    frames.push({ t: (asked + Date.now()) / 2 - t0, ...decodePng(Buffer.from(data, 'base64')) });
  }
  return frames;
}
export const flashOf = frames => flashCount(frames, { block: [341, 256] });

// ---- 320 px with the largest text: no sideways scroll
export async function fit320(page, where = 'screen') {
  await page.size(320);
  await page.js(`document.documentElement.dataset.text = 'xlarge'`);
  await page.flat(`${where} at 320 px, largest text`);
}

// ---- the chain: from a screen change, how long until no auto scene runs any more (0 when none ran). chainMs(page) as in the plan measures from the call itself;
// act, when given, is the screen change to make once the watch is laid (a change made before the call would be missed).
export async function chainMs(page, act = null, { ms = 6000 } = {}) {
  await page.js(`(async () => { const c = await ${CORE}; const w = window.__macroChain = { start: performance.now(), last: 0, names: new Set() };
    const tick = () => { const list = c.running(); if (list.length) { w.last = performance.now(); list.forEach(n => w.names.add(n)); } if (performance.now() - w.start < ${ms}) requestAnimationFrame(tick); }; tick(); return true; })()`);
  if (typeof act === 'function') await act();
  await sleep(ms + 100);
  return page.js(`(() => { const w = window.__macroChain; return { ms: w.last ? Math.round(w.last - w.start) : 0, scenes: [...w.names] }; })()`);
}

// ---- the app with js/macro.js blocked, as if the big animations were never there
export const blockMacro = (page, on = true) => page.send('Network.setBlockedURLs', { urls: on ? ['*/js/macro.js'] : [] });
