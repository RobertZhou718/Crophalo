// The offline suite of the big animations' groundwork: js/macro-core.js (curves, times, levels, may(), the chain budget, play-once, the camera, rolls, stopAll, the input rule,
// the quality step), js/hooks.js, js/macro.js with no scene module, js/macro-view.js with no page, the written rules (scripts/macro_rules.mjs) and the flash check (scripts/macro_flash.mjs).
// No browser: the page and the device are small stand-ins. RULE: never loosen a check here without a written reason beside it. Run: node scripts/test_macro.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
async function group(name, run) { try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const wait = ms => new Promise(done => setTimeout(done, ms));

// ---- the stand-ins: a page with an html element, a body, listeners and elements just real enough; a device whose reduce-motion setting can be switched
const shown = {}, device = { matches: false }, listeners = {}, listenerOpts = {};
let observed = null;
globalThis.matchMedia = query => (/prefers-reduced-motion:\s*reduce/.test(query) ? device : { matches: false });
globalThis.MutationObserver = class { constructor(fn) { observed = fn; } observe() {} };
const textNode = v => ({ nodeType: 3, kids: [], attrs: {}, parent: null, data: String(v), get textContent() { return this.data; } });
function el(tag = 'div') {
  const e = {
    tagName: tag.toUpperCase(), kids: [], attrs: {}, style: {}, dataset: {}, on: {}, className: '', parent: null, hidden: false, anims: [],
    get childNodes() { return this.kids; },
    get textContent() { return this.kids.map(k => k.textContent).join(''); },
    set textContent(v) { for (const c of this.kids) c.parent = null; this.kids = []; const t = String(v); if (t) this.append(textNode(t)); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    append(...k) { for (const c of k) { if (c.parent && c.parent !== this) c.parent.kids = c.parent.kids.filter(x => x !== c); c.parent = this; this.kids.push(c); } },
    replaceChildren(...k) { for (const c of this.kids) c.parent = null; this.kids = []; this.append(...k); },
    remove() { if (this.parent) this.parent.kids = this.parent.kids.filter(c => c !== this); this.parent = null; },
    contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; },
    focus() { page.activeElement = this; },
    addEventListener(type, fn) { (this.on[type] ||= []).push(fn); },
    click() { for (const fn of this.on.click || []) fn({ type: 'click', target: this }); },
    closest(sel) { for (let n = this; n; n = n.parent) { if (sel === '[data-macro-control]' && 'data-macro-control' in n.attrs) return n; if (sel === '[hidden]' && n.hidden) return n; } return null; },
    animate(frames, options) { const a = { frames, options, finished: Promise.resolve(), finish() {}, cancel() {} }; this.anims.push(a); return a; },
    getAnimations() { return []; },
  };
  return e;
}
const all = node => [node, ...node.kids.flatMap(all)];
const rootAnims = [];
const page = {
  documentElement: { dataset: shown, animate(frames, options) { rootAnims.push({ frames, options }); return { finished: Promise.resolve() }; } }, hidden: false, readyState: 'complete', body: el('body'), head: el('head'), activeElement: null, shownView: null,
  addEventListener(type, fn, opts) { (listeners[type] ||= []).push(fn); (listenerOpts[type] ||= []).push(opts); },
  removeEventListener(type, fn) { const i = (listeners[type] || []).indexOf(fn); if (i >= 0) { listeners[type].splice(i, 1); listenerOpts[type].splice(i, 1); } },
  dispatchEvent(event) { for (const fn of [...(listeners[event.type] || [])]) fn(event); return true; },
  createElement: el, createElementNS: (ns, tag) => el(tag),
  querySelector: sel => (sel === 'main' ? null : sel === '.view:not([hidden])' ? page.shownView : sel.startsWith('#') ? all(page.body).find(n => n.attrs.id === sel.slice(1) || n.id === sel.slice(1)) || null : null),
  querySelectorAll: sel => (sel === '[style*="view-transition-name"]' ? all(page.body).filter(n => n.style?.viewTransitionName) : []),
  getElementById: id => all(page.body).find(n => n.id === id || n.attrs.id === id) || null,
};
globalThis.document = page;
const send = (type, target = page.body, extra = {}) => page.dispatchEvent({ type, target, ...extra });

const core = await import(pathToFileURL(path.join(ROOT, 'js', 'macro-core.js')).href);
const fx = await import(pathToFileURL(path.join(ROOT, 'js', 'fx.js')).href);
const { EASE, ease, T, SCENES, level, onLevel, may, scene, stopAll, running, chain, once, claimCamera, releaseCamera, cameraOwner, quality, phone, say, roll, playbar, interrupts, stagger, _clock } = core;

// the clock: frames come only when the suite says, and time moves only when it says
let now = 1000; const frames = [];
_clock.now = () => now; _clock.frame = fn => frames.push(fn); _clock.canFrame = () => true;
const frame = (ms = 16) => { now += ms; for (const fn of frames.splice(0)) fn(now); };
const frameFor = (ms, step = 16) => { for (let t = 0; t < ms; t += step) frame(step); };
const setLevel = lv => { device.matches = lv === 'device'; if (lv === 'less') shown.motion = 'less'; else if (lv === 'still') shown.motion = 'reduce'; else delete shown.motion; };

// ---- the curves (PROOF 1: every EASE sampled at 1,000 points stays in 0..1)
await group('curves', async () => {
  const points = Object.entries(EASE).filter(([, v]) => v.startsWith('cubic-bezier')).map(([k, v]) => [k, v.slice(13, -1).split(',').map(Number)]);
  same('the five named curves', Object.keys(EASE), ['ARRIVE', 'GLIDE', 'LEAVE', 'FADE', 'EVEN']);
  same('their values', [EASE.ARRIVE, EASE.GLIDE, EASE.LEAVE, EASE.FADE, EASE.EVEN], ['cubic-bezier(.16, 1, .3, 1)', 'cubic-bezier(.65, 0, .35, 1)', 'cubic-bezier(.4, 0, 1, 1)', 'cubic-bezier(0, 0, .2, 1)', 'linear']);
  check('PROOF 1a: every control point of every EASE is inside 0..1, so no curve can bounce', points.length === 4 && points.every(([, p]) => p.length === 4 && p.every(v => v >= 0 && v <= 1)), points);
  for (const name of ['arrive', 'glide', 'leave', 'fade', 'even']) {
    const f = ease[name]; let inside = true, climbs = true, last = -1;
    for (let i = 0; i <= 1000; i++) { const v = f(i / 1000); if (!(v >= 0 && v <= 1)) inside = false; if (v < last - 1e-9) climbs = false; last = v; }
    check(`PROOF 1b: ease.${name} sampled at 1,001 points stays in 0..1`, inside);
    check(`ease.${name} only climbs: nothing pulls back`, climbs);
    same(`ease.${name} starts at 0, ends at 1, and is held there outside 0..1`, [f(0), f(1), f(-2), f(3), f(NaN)], [0, 1, 0, 1, 0]);
  }
  check('arrive starts fast and lands softly; leave starts slowly', ease.arrive(0.2) > 0.5 && ease.leave(0.2) < 0.1, [ease.arrive(0.2), ease.leave(0.2)]);
  check('glide is even at both ends: half way is half way', Math.abs(ease.glide(0.5) - 0.5) < 1e-6 && Math.abs(ease.glide(0.25) + ease.glide(0.75) - 1) < 1e-6);
  const known = (x1, y1, x2, y2, t) => { const u = 1 - t; return [3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3, 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3]; };
  check('the functions are the same curves as the strings (checked against points on the curve)', [0.1, 0.3, 0.6, 0.9].every(t => { const [x, y] = known(0.16, 1, 0.3, 1, t); return Math.abs(ease.arrive(x) - y) < 1e-6; }));
});

// ---- the named times, and the stylesheet's copy of them
await group('times and tokens', async () => {
  same('the named times', [T.QUICK, T.LESS_MAX, T.STEP, T.TURN, T.HOLD, T.STAGGER, T.OPEN_MAX, T.FLIGHT, T.FLIGHT_PHONE, T.AUTO_MAX, T.PRESS_MAX, T.SKIP_UNDER, T.FAST_FORWARD, T.BEAT, T.YEAR, T.MONTH, T.MONTH_FILM, T.DAY], [160, 200, 320, 560, 120, 60, 2000, 3200, 2100, 4800, 5000, 600, 200, 150, 400, 750, 900, 8000]);
  check('the table cannot be changed by a scene', Object.isFrozen(T) && Object.isFrozen(EASE) && Object.isFrozen(SCENES));
  same('siblings arrive 60 ms apart, the ninth and later with the eighth', [0, 1, 7, 8, 20, -3].map(stagger), [0, 60, 420, 420, 420, 0]);
  const css = read('css/macro.css'), tok = Object.fromEntries([...css.matchAll(/(--m-[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const asCss = k => '--m-t-' + k.toLowerCase().replace(/_/g, '-');
  same('every named time of the script is a custom property of css/macro.css with the same value', Object.entries(T).filter(([k]) => k !== 'STAGGER_MAX').filter(([k, v]) => tok[asCss(k)] !== `${v}ms`).map(([k]) => k), []);
  same('every named curve too', Object.entries(EASE).filter(([k, v]) => tok['--m-ease-' + k.toLowerCase()] !== v).map(([k]) => k), []);
  check('the record scale and the rings palette are there, and none of them is the action blue', ['--m-rec-cold', '--m-rec-hot', '--m-ring-cool', '--m-ring-warm', '--m-ring-gap'].every(k => /^#[0-9a-f]{6}$/i.test(tok[k] || '')) && !Object.values(tok).some(v => /#0a63d8/i.test(v)));
  check('every Full rule of the stylesheet sits under no-preference and html:not([data-motion])', /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html:not\(\[data-motion\]\)\[data-macro-vt=full\]::view-transition-group/.test(css));
  check('Less rules sit under html[data-motion=less] and last T.QUICK', /html\[data-motion=less\]\[data-macro-vt\]::view-transition-group\(\*\)[\s\S]*?animation-duration: var\(--m-t-quick\)/.test(css));
  check('the shared defaults reach only transitions started by become() (html[data-macro-vt]), so nothing else in the app changes', [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*::view-transition[^{]*)\{/g)].every(m => m[1].split(',').every(s => /data-macro-vt/.test(s))));
  check('the play bar\'s buttons are at least 44 px', /\.m-ctl\s*\{[^}]*min-height:\s*var\(--touch\)/.test(css));
});

// ---- the levels (the one reading is fx.js level(), re-exported)
await group('levels', async () => {
  check('level() is the very function of fx.js', level === fx.level);
  setLevel('full'); same('Full: nothing asked', level(), 'full');
  setLevel('less'); same('Less: html[data-motion=less]', level(), 'less');
  setLevel('still'); same('Still: html[data-motion=reduce]', level(), 'still');
  setLevel('device'); same('the device\'s reduce-motion setting is Still, whatever the setting', level(), 'still');
  shown.motion = 'less'; same('even when the setting says Less', level(), 'still');
  setLevel('full');
});

// ---- may(): the one decision (PROOF 2: may() returns Still under the device setting)
await group('may', async () => {
  setLevel('device'); same('PROOF 2: may() returns Still under the device setting', may('curl').level, 'still');
  same('and for a film too', may('record-film').level, 'still');
  setLevel('less'); same('Less gives Less', may('curl').level, 'less');
  setLevel('full'); quality.reset();
  const d = may('curl');
  same('Full gives Full, with the quality\'s pixel ratio and lengths', [d.level, d.k, d.dpr, d.budgetMs], ['full', 1, 1, T.AUTO_MAX]);
  same('a scene that is not in the table never moves', may('not-a-scene').level, 'still');
  same('a film started by a press may run past 5 s: it has its play bar', may('record-film').level, 'full');
  same('a longer ms is cut to the declared length (560 ms), which fits', [may('turn', { ms: T.AUTO_MAX + 1 }).level, may('turn', { ms: T.AUTO_MAX + 1 }).ms], ['full', SCENES.turn.ms]);
  // the ceiling as it is played, counted in frames, is in "after review: the chain"; the over-budget case is PROOF 3
});

// ---- the chain budget (PROOF 3: chain() refuses a scene that does not fit)
await group('chain', async () => {
  setLevel('full'); quality.reset();
  same('a chain never started has the whole budget', chain('nowhere').left(), T.AUTO_MAX);
  chain('tab').start();
  now += 3000;
  same('3 s after its screen change, 1.8 s are left', chain('tab').left(), 1800);
  check('fits() says the same', chain('tab').fits(1800) && !chain('tab').fits(1801));
  same('PROOF 3: the Rings (3.96 s) do not fit in what is left, so they get their Less form', may('rings').level, 'less');
  same('a short scene of the same chain still fits', may('relief').level, 'full');
  now += 2000;
  same('the budget never goes below 0', chain('tab').left(), 0);
  same('a new screen change starts the clock again', (chain('tab').start(), may('rings').level), 'full');
  const began = chain('report').began();
  const s = scene({ name: 'fold', end() {} }); s.play();
  check('a scene that is its screen change (at 0) starts its chain when it plays', chain('report').began() === now && began !== now);
  stopAll('test');
  same('the declared table passes its own rules: lengths, films and every chain under 4.8 s', (await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_rules.mjs')).href)).tableProblems(), []);
  const ends = {}; for (const s2 of Object.values(SCENES)) if (s2.auto && s2.screen !== null && typeof s2.at === 'number') ends[s2.screen] = Math.max(ends[s2.screen] ?? 0, s2.at + s2.ms);
  check('the Weather tab: the turn and the Rings end at 4.28 s; Compare at 4.52 s; the report at 1.4 s', ends.tab === 4520 && SCENES.rings.at + SCENES.rings.ms === 4280 && ends.report === 1400, ends);
  check('every film is pressed and has controls, every auto scene is 4.8 s or less', Object.values(SCENES).every(s2 => (s2.ms > T.PRESS_MAX ? !s2.auto && s2.controls : s2.ms <= T.AUTO_MAX)));
});

// ---- play once per visit (PROOF 4: once() is per visit)
await group('once', async () => {
  same('PROOF 4: the first time yes, then no, in this visit', [once('home:first-light'), once('home:first-light'), once('report:curl'), once('report:curl')], [true, false, true, false]);
  same('keys are words: 1 and "1" are one key', [once(1), once('1')], [true, false]);
  const fresh = await import(pathToFileURL(path.join(ROOT, 'js', 'macro-core.js')).href + '?visit=2');
  same('a new visit (a reload: a fresh module) plays it again, because nothing is stored', fresh.once('home:first-light'), true);
  check('nothing is kept in storage: the module never names it', !/localStorage|sessionStorage|indexedDB/.test(read('js/macro-core.js')));
});

// ---- the one camera (PROOF 5: claimCamera is exclusive)
await group('camera', async () => {
  const lost = []; page.addEventListener('crophalo:camera', e => lost.push(e.detail));
  same('PROOF 5: the Descent takes the camera, then the Lift is refused while it holds it', [claimCamera('descent'), claimCamera('lift'), claimCamera('closeup'), cameraOwner()], [true, false, false, 'descent']);
  same('asking again as the holder is still yes', claimCamera('descent'), true);
  same('only the holder can give it back', [releaseCamera('lift'), releaseCamera('descent'), cameraOwner()], [false, true, null]);
  same('the close-up takes a free camera; another close-up claim is still yes', [claimCamera('closeup'), claimCamera('closeup')], [true, true]);
  same('a Descent takes it from the close-up, and the close-up is told to close', [claimCamera('descent'), cameraOwner(), lost.at(-1)], [true, 'descent', { owner: 'descent', lost: 'closeup' }]);
  same('nothing and nobody cannot claim it', [claimCamera(''), claimCamera(undefined), releaseCamera('')], [false, false, false]);
  releaseCamera('descent');
});

// ---- rolls (PROOF 6: roll() ends on fx.formatRoll's string)
await group('roll', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  const n = el('b'); n.textContent = '12,480';
  const r = roll(n, 12480);
  same('PROOF 6a: its final string is fx.formatRoll\'s, with the page\'s rounding', [r.final, fx.formatRoll(12480), roll(null, 7.25, { decimals: 1 }).final, fx.formatRoll(7.25, 1)], ['12,480', '12,480', fx.formatRoll(7.25, 1), fx.formatRoll(7.25, 1)]);
  frame();   // arms: the event that started it is behind us
  frame(T.STEP);
  const [painted, real] = n.kids;
  check('while it rolls, the painted copy is hidden from readers and the real value is in the text, whole, from the start', painted?.attrs['aria-hidden'] === 'true' && real?.className === 'sr' && real?.textContent === '12,480', n.kids.map(k => [k.attrs, k.className, k.textContent]));
  check('the painted copy shows a number on its way, never past the end, in a reserved width', /^[\d,]+$/.test(painted.textContent) && Number(painted.textContent.replace(/,/g, '')) < 12480 && painted.style.minWidth === '6ch', painted.textContent);
  frameFor(SCENES.roll.ms + 100);
  same('PROOF 6b: it ends on that very string, as plain text again', n.textContent, '12,480');
  same('and the roll is no longer running', running(), []);
  const m = el('b'); m.textContent = 'Score 71 of 100';
  roll(m, 71); frame(); frame(T.STEP);
  check('the words around the number stay as they are while it rolls', m.kids[0].textContent.startsWith('Score ') && m.kids[0].textContent.endsWith(' of 100'), m.kids[0]?.textContent);
  stopAll('input');
  same('an input shows the number at once', m.textContent, 'Score 71 of 100');
  const wrong = el('b'); wrong.textContent = '72';
  const w = roll(wrong, 71);
  const wrongKids = [...wrong.kids];
  same('never a lie: a value the page does not print is not rolled', [w.rolled, wrong.textContent, wrong.kids.length === 1 && wrong.kids[0] === wrongKids[0]], [false, '72', true]);
  setLevel('still');
  const still = el('b'); still.textContent = '71'; const stillKids = [...still.kids], before = _clock.rafCalls; const sr = roll(still, 71);
  same('at Still nothing rolls, the element is not touched and no frame is asked for', [sr.rolled, still.textContent, still.kids.length === 1 && still.kids[0] === stillKids[0], _clock.rafCalls - before], [false, '71', true, 0]);
  setLevel('full');
});

// ---- scenes at the three levels, stopAll, running
await group('scenes', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  const seen = [], ended = []; let host = el('div');
  const s = scene({ name: 'answer-rise', host, paint: k => seen.push(k), end: () => ended.push('end') });
  const done = s.play();
  same('Full: it runs on the shared clock', [running(), s.form], [['answer-rise'], 'full']);
  frameFor(T.STEP + 64);
  check('paint gets k from 0 to 1, climbing, time-based', seen.length >= 10 && seen.every((k, i) => i === 0 || k >= seen[i - 1]) && seen.at(-1) === 1 && seen[0] < 0.2, seen);
  same('end() is called once at the end, and it stops running before its still beat', [ended, running()], [['end'], []]);
  same('done says how it ended, after the T.HOLD beat', await Promise.race([done, wait(T.HOLD + 400).then(() => 'late')]), 'end');
  setLevel('less'); host = el('div'); const lessEnd = [];
  const l = scene({ name: 'answer-rise', host, paint: () => lessEnd.push('painted'), end: () => lessEnd.push('end') }); const ld = l.play();
  same('Less: end() at once, no paint, and the host fades in T.QUICK, opacity only', [lessEnd, host.anims.map(a => [a.frames, a.options.duration, a.options.easing])], [['end'], [[[{ opacity: 0 }, { opacity: 1 }], 160, EASE.FADE]]]);
  same('Less ends when its fade does', await ld, 'less');
  setLevel('still'); host = el('div'); const stillEnd = []; const before = _clock.rafCalls;
  const st = scene({ name: 'answer-rise', host, paint: () => stillEnd.push('painted'), end: () => stillEnd.push('end') });
  same('Still: end() at once, no fade, no frame asked for (no frame loop from macro files)', [await st.play(), stillEnd, host.anims.length, _clock.rafCalls - before], ['still', ['end'], 0, 0]);
  setLevel('full');
  const order = [];
  const a = scene({ name: 'fold', end: () => order.push('fold end') }), cam = scene({ name: 'descent', end: () => order.push('descent end'), stop: why => order.push(`descent stop: ${why}`) });
  a.play(); cam.play(); frame();
  same('stopAll() ends every running scene and answers how many', [stopAll('timers'), running()], [2, []]);
  same('a DOM scene draws its end; a camera scene does what its own stop() says instead', order, ['fold end', 'descent stop: timers']);
  same('stopAll() with nothing running is 0', stopAll(), 0);
  const big1 = scene({ name: 'curl', end() {} }); big1.play();
  same('one big move per screen: a second big scene on the report while the Curl runs gets its Less form', may('curl').level, 'less');
  stopAll('test');
  const throws = scene({ name: 'relief', paint() { throw new Error('a scene that fails'); }, end() { order.push('relief end'); } });
  const saved = globalThis.reportError; globalThis.reportError = () => {};
  const td = throws.play(); frame(); frame();
  globalThis.reportError = saved;
  same('a scene that throws is ended with its finished state, and the screen goes on', [await td, order.at(-1), running()], ['error', 'relief end', []]);
});

// ---- the input rule (pure part and the listener)
await group('input', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  const plain = el('p'), bar = el('div'); bar.setAttribute('data-macro-control', ''); const inBar = el('button'); bar.append(inBar);
  same('every press, key, wheel and touch interrupts', ['pointerdown', 'keydown', 'wheel', 'touchstart'].map(type => interrupts({ type, target: plain })), [true, true, true, true]);
  same('scroll, click and key-up are not interrupts (show() scrolls by itself)', ['scroll', 'click', 'keyup', 'focus'].map(type => interrupts({ type, target: plain })), [false, false, false, false]);
  same('a press on a scene\'s own Pause and Skip is not an interrupt', interrupts({ type: 'pointerdown', target: inBar }), false);
  same('nothing at all is not an interrupt', [interrupts(null), interrupts({})], [false, false]);
  const ends = [];
  chain('tab').start();   // a fresh tab opening, so the Rings fit in the budget
  const s = scene({ name: 'rings', host: el('div'), paint() {}, end: () => ends.push('rings end') }); s.play();
  send('pointerdown');
  same('the event that started a scene does not end it: the listener counts from one frame after play()', running(), ['rings']);
  frame();
  send('keydown', plain);
  same('a key in the next frame ends it at once, with its end state', [running(), ends], [[], ['rings end']]);
  check('the listener is on document, in the capture phase, passive, for all four inputs', ['pointerdown', 'keydown', 'wheel', 'touchstart'].every(t => (listeners[t] || []).length === 1));
  const ctl = el('div');
  const film = scene({ name: 'record-film', host: el('div'), paint() {}, end: () => ends.push('film end'), controls: { host: ctl, words: { pause: 'Pause the years', skip: 'Skip to 2025' } } }); film.play(); frame(); frame(T.YEAR);
  send('wheel', inBar);
  same('a press inside the play bar leaves the film running', running(), ['record-film']);
  send('touchstart', plain);
  same('any other input skips a film to its end', [running(), ends.at(-1)], [[], 'film end']);
  const camEnds = [];
  const cam = scene({ name: 'lift', end: () => camEnds.push('end'), stop: why => camEnds.push(why) }); cam.play(); frame();
  page.hidden = true; send('visibilitychange');
  same('a hidden tab ends a camera scene at its final view (its end(), not the interrupt\'s stop())', [running(), camEnds], [[], ['end']]);
  page.hidden = false;
  chain('tab').start(); const s2 = scene({ name: 'rings', paint() {}, end() {} }); s2.play(); frame();
  same('a scene is running before the event', running(), ['rings']);
  send('crophalo:stop-timers');
  same('crophalo:stop-timers ends everything', running(), []);
});

// ---- the play bar
await group('play bar', async () => {
  setLevel('full'); stopAll('test');
  const ctl = el('div'), steps = [];
  const film = scene({ name: 'year-grows', paint() {}, end() {}, steps: { count: 3, at: i => steps.push(i) }, controls: { host: ctl, words: { pause: 'Pause the year', play: 'Play', skip: 'Skip to December' } } });
  film.play(); frame();
  const bar = ctl.kids[0], [pause, skip] = bar?.kids || [];
  same('a film gets Pause and Skip with its own words, each marked as a control of the scene', [bar?.attrs.role, pause?.textContent, skip?.textContent, pause?.attrs['data-macro-control'], skip?.attrs['data-macro-control'], pause?.className], ['group', 'Pause the year', 'Skip to December', '', '', 'btn m-ctl']);
  pause.click(); const k1 = core._peek()[0]?.k; frame(T.MONTH); const k2 = core._peek()[0]?.k;
  same('Pause stops the clock and its name says Play, with no pressed state as well (never "Play, pressed")', [film.paused, pause.textContent, pause.attrs['aria-pressed'] ?? null, k1 === k2], [true, 'Play', null, true]);
  pause.click(); frame(T.MONTH);
  check('Play goes on from where it was', !film.paused && core._peek()[0]?.k > k2);
  skip.click();
  same('Skip ends it, and the bar goes', [running(), ctl.kids.length], [[], 0]);
  setLevel('less'); const ctl2 = el('div'), host2 = el('div'), seen = [];
  const lf = scene({ name: 'year-grows', host: host2, end: () => seen.push('end'), steps: { count: 2, at: i => seen.push(i) }, controls: { host: ctl2, words: { step: 'Next month' } } });
  lf.play();
  const stepBtn = ctl2.kids[0]?.kids[0];
  same('Less: the screen is complete at once, and a film becomes Step through', [seen, stepBtn?.textContent], [['end'], 'Next month']);
  stepBtn.click(); stepBtn.click(); stepBtn.click();
  same('one step per press, round again after the last, each a T.QUICK fade', [seen, host2.anims.filter(a => a.options.duration === T.QUICK).length], [['end', 0, 1, 0], 4]);
  setLevel('full');
  same('no host, no bar', playbar(null, film), null);
});

// ---- the quality step
await group('quality', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  same('a laptop starts high', [quality().low, quality().k, quality().slices], [false, 1, 72]);
  for (let i = 0; i < 29; i++) quality.feed(30);
  same('29 slow frames are not yet judged', quality().low, false);
  quality.feed(30);
  same('the thirtieth closes the window: a median over 22 ms steps down to pixel ratio 1, lengths x 0.7, 36 slices', [quality().low, quality().dpr, quality().k, quality().slices], [true, 1, 0.7, 36]);
  now += 9999; same('still low after 9.999 s', quality().low, true);
  now += 1; same('back up after 10 calm seconds', quality().low, false);
  quality.reset(); for (let i = 0; i < 30; i++) quality.feed(i < 16 ? 16 : 40);
  same('the median decides, not one slow frame: 16 of 30 frames fast', quality().low, false);
  quality.reset(); for (let i = 0; i < 30; i++) quality.feed(i < 14 ? 16 : 40);
  same('16 of 30 slow: down', quality().low, true);
  quality.reset();
  globalThis.innerWidth = 400; same('a phone (under 600 px) starts low', [phone(), quality().low], [true, true]);
  globalThis.innerWidth = 1280; same('a laptop window is not a phone', phone(), false);
  Object.defineProperty(globalThis.navigator, 'deviceMemory', { value: 2, configurable: true });
  same('under 4 GB starts low, without being a phone', [phone(), quality().low], [false, true]);
  delete globalThis.navigator.deviceMemory; delete globalThis.innerWidth;
  chain('tab').start(); const s = scene({ name: 'relief', paint() {}, end() {} }); s.play(); for (let i = 0; i < 32; i++) frame(30);
  same('the conductor watches the first 30 frames of a scene by itself', quality().low, true);
  stopAll('test'); quality.reset();
});

// ---- the announcer, and a change of level
await group('say and onLevel', async () => {
  stopAll('test');
  const { hooks } = await import(pathToFileURL(path.join(ROOT, 'js', 'hooks.js')).href);
  hooks.report(() => {}, { loading: false, to: 'overview' });   // a screen change, counted by the hooks
  same('one polite sentence per screen change', [say('Report ready for Mead, Nebraska.'), say('Another sentence.')], [true, false]);
  const region = page.getElementById('macroSay');
  same('through one visually hidden status region the conductor adds once', [region?.attrs.role, region?.attrs['aria-live'], region?.className, region?.textContent], ['status', 'polite', 'sr', 'Report ready for Mead, Nebraska.']);
  hooks.view(() => {}, { from: 'report', to: 'farm' });
  same('the next screen change may speak again, in the same region', [say('My farm.'), all(page.body).filter(n => n.id === 'macroSay').length], [true, 1]);
  setLevel('full'); const heard = [];
  const off = onLevel(lv => heard.push(lv));
  chain('tab').start(); const s = scene({ name: 'rings', paint() {}, end() {} }); s.play(); frame();
  same('the Rings are running at Full', running(), ['rings']);
  shown.motion = 'less'; observed?.();
  same('a change of level ends every running scene and tells onLevel the new level', [running(), heard], [[], ['less']]);
  off(); setLevel('full'); observed?.();
  same('a listener taken off hears nothing more', heard, ['less']);
});

// ---- hooks.js: with no motion module, every update simply runs
await group('hooks', async () => {
  const { hooks, setHook } = await import(pathToFileURL(path.join(ROOT, 'js', 'hooks.js')).href);
  same('the six hooks (step added for the setup step turn)', Object.keys(hooks), ['view', 'report', 'tab', 'place', 'farmView', 'step']);
  let ran = 0;
  same('with no wrapper the update runs at once and its answer comes back', [hooks.view(() => { ran++; return 'shown'; }, { from: 'home', to: 'setup' }), ran], ['shown', 1]);
  const seen = [];
  const off = setHook('view', (update, info) => { seen.push(info.to); if (info.to !== 'farm') return false; update(); return true; });
  hooks.view(() => seen.push('update'), { to: 'farm' }); hooks.view(() => seen.push('plain'), { to: 'data' });
  same('a wrapper takes the changes it wants and leaves the rest to run plainly', seen, ['farm', 'update', 'data', 'plain']);
  const order = [];
  const off2 = setHook('view', update => { order.push('newest'); update(); return true; });
  hooks.view(() => order.push('update'), { to: 'farm' });
  same('the newest wrapper is asked first', order, ['newest', 'update']);
  off2(); off();
  setHook('tab', () => { throw new Error('a broken module'); });
  let tabRan = 0; hooks.tab(() => tabRan++, {});
  same('a wrapper that throws is passed over: the update still runs, once', tabRan, 1);
  setHook('tab', update => { update(); throw new Error('after'); });
  hooks.tab(() => tabRan++, {});
  same('one that throws after running it does not run it twice', tabRan, 2);
  setHook('tab', update => { update(); update(); return true; });
  hooks.tab(() => tabRan++, {});
  same('an update runs once however often a wrapper calls it', tabRan, 3);
  same('setHook(name, null) takes every wrapper off', [setHook('tab', null), (hooks.tab(() => tabRan++, {}), tabRan)], [true, 4]);
  same('an unknown hook or a wrapper that is not a function is refused', [setHook('nope', () => true), setHook('view', 'x')], [false, false]);
  check('hooks.js names no motion module and keeps no timer', !/macro-|setTimeout|requestAnimationFrame|document/.test(read('js/hooks.js').split('\n').filter(l => !l.startsWith('//')).join('\n')));
});

// ---- js/macro.js: with no scene module in the folder it changes nothing
await group('macro.js', async () => {
  const before = { head: page.head.kids.length, body: page.body.kids.length, inputs: ['pointerdown', 'keydown', 'wheel', 'touchstart'].map(t => (listeners[t] || []).length) };
  const asked = [];
  const m = await import(pathToFileURL(path.join(ROOT, 'js', 'macro.js')).href + '?missing');
  const out = await m.start({ importer: name => { asked.push(name); return Promise.reject(new Error(`Cannot find module macro-${name}.js`)); } });
  // The report's scenes, the page turns and Home's own two scenes have landed, so LANDED names them (a package that lands its module adds its one name there). Home's group asks
  // the generic turn first, then the fall to the field and First Light (js/macro-descent.js, js/macro-light.js); 'home' itself has no module in the folder, so it is never asked
  // and no missing file is logged. Changed on purpose when the new home landed its two scenes.
  same('only landed modules are asked for at the start, Home\'s group in its order, so no missing file is ever logged', [out.loaded, asked, m.LANDED], [[], ['turn', 'descent', 'light'], ['report', 'turn', 'setup', 'descent', 'light']]);
  check('every landed module is in the folder', m.LANDED.every(name => fs.existsSync(path.join(ROOT, 'js', `macro-${name}.js`))));
  const mL = await import(pathToFileURL(path.join(ROOT, 'js', 'macro.js')).href + '?landed'), askedL = [];
  const outL = await mL.start({ landed: ['turn', 'home', 'descent'], importer: name => { askedL.push(name); return Promise.reject(new Error(`Cannot find module macro-${name}.js`)); } });
  same('a landed module that fails is passed over: nothing is loaded', outL.loaded, []);
  same('Home\'s modules are asked for first, the generic turn before them', askedL, ['turn', 'home', 'descent']);
  same('and nothing on the page changed: no stylesheet, no new part, no new listener on the input', { head: page.head.kids.length, body: page.body.kids.length, inputs: ['pointerdown', 'keydown', 'wheel', 'touchstart'].map(t => (listeners[t] || []).length) }, before);
  same('start() is started once', await m.start(), out);
  const m2 = await import(pathToFileURL(path.join(ROOT, 'js', 'macro.js')).href + '?present');
  let started = 0;
  const out2 = await m2.start({ landed: ['home', 'descent'], importer: name => (name === 'home' ? Promise.resolve({ start: () => started++ }) : Promise.reject(new Error('missing'))) });
  same('a module that is there is loaded, its start() called once, and the stylesheet comes with it, once', [out2.loaded, started, page.head.kids.filter(k => /macro\.css$/.test(k.href || '')).length], [['home'], 1, 1]);
  const saved = globalThis.document; delete globalThis.document;
  const m3 = await import(pathToFileURL(path.join(ROOT, 'js', 'macro.js')).href + '?nopage');
  same('with no page at all it does nothing', await m3.start(), { loaded: [] });
  globalThis.document = saved;
  // 'light' (First Light) joined Home's group with the new home, on purpose.
  same('the views and their modules, in the order they are fetched', m.VIEW_SCENES, { home: ['turn', 'home', 'descent', 'light'], setup: ['setup', 'layers'], report: ['record', 'report', 'pullback', 'compare', 'weather', 'calendar', 'sats', 'field', 'farm'], farm: ['farm', 'lift', 'sun', 'history'] });
  check('no scene module is named as a plain import, so the page\'s own checks and the offline copy never look for a file that is not there yet', !/import\(\s*['"]\.\/macro-/.test(read('js/macro.js')));
});

// ---- js/macro-view.js with no page: Still is the plain update
await group('macro-view', async () => {
  const view = await import(pathToFileURL(path.join(ROOT, 'js', 'macro-view.js')).href);
  same('the four exports', ['become', 'nameOnce', 'proxyOutline', 'rectOf'].map(k => typeof view[k]), ['function', 'function', 'function', 'function']);
  same('rectOf: the box and its centre', view.rectOf({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 40 }) }), { x: 10, y: 20, w: 100, h: 40, cx: 60, cy: 40 });
  same('rectOf of nothing is null', view.rectOf(null), null);
  setLevel('still'); let ran = 0;
  same('at Still become() runs the update and nothing else', [await view.become(() => ran++, { names: { 'field-shape': el() } }), ran], ['none', 1]);
  setLevel('full');
  same('with no view transitions in the browser, Full runs the update (its fade is proved in "after review: become()")', [await view.become(() => ran++), ran], ['fallback', 2]);
  const a = el(), b = el();
  view.nameOnce(a, 'field-shape'); view.nameOnce(b, 'field-shape');
  same('nameOnce keeps a name on one element only', [a.style.viewTransitionName, b.style.viewTransitionName], ['', 'field-shape']);
  const p = view.proxyOutline([[110, 220], [150, 220], [150, 260]], { x: 100, y: 200, w: 60, h: 80 });
  same('proxyOutline: a hidden drawing at its place, the outline relative to it', [p?.attrs['aria-hidden'], p?.attrs.viewBox, p?.style.left, p?.kids[0]?.attrs.d], ['true', '0 0 60 80', '100px', 'M10 20 L50 20 L50 60 Z']);
  same('and none for too few points', view.proxyOutline([[1, 1]], { x: 0, y: 0, w: 1, h: 1 }), null);
});

// ---- the written rules: the real files pass, and each rule catches a broken example
await group('rules', async () => {
  const rules = await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_rules.mjs')).href);
  const files = rules.macroFiles();
  check('the rules reach every macro file there is', ['js/hooks.js', 'js/macro-core.js', 'js/macro-probe.js', 'js/macro-view.js', 'js/macro.js', 'css/macro.css'].every(f => files.some(x => x.rel === f)), files.map(f => f.rel));
  same('the macro files of this folder break none of the rules (the twelve and the thirteenth)', rules.scanMacro(), []);
  check('the reason for the rule set is its first line', read('scripts/macro_rules.mjs').startsWith('// Big moves at Full were asked for by the owner on 15 November 2026; they live only in macro files, which are held to these rules instead.'));
  const breaks = (rule, rel, text) => rules.fileProblems({ rel, text }).some(p => p.rule === rule);
  const cases = [
    [1, 'js/macro-x.js', "scene({ name: 'nope', ms: T.STEP }).play();", 'a scene that is not in SCENES'],
    [1, 'js/macro-x.js', 'scene(spec).play();', 'a scene with no written name'],
    [2, 'js/macro-x.js', "scene({ name: 'record-film', paint() {}, end() {} });", 'a film with no controls'],
    [4, 'js/macro-x.js', 'setInterval(draw, T.STEP);', 'setInterval'],
    [4, 'css/macro-x.css', '.a { animation-iteration-count: infinite; }', 'an animation for ever'],
    [5, 'css/macro.css', ':root { --m-ease-odd: cubic-bezier(.3, 1.6, .5, 1); }', 'a curve that passes its end'],
    [5, 'js/macro-x.js', "el.classList.add('shake');", 'a banned name'],
    [6, 'js/macro-x.js', "el.style.transform = 'scale(1.2)';", 'a scale past full size'],
    [7, 'js/macro-farm.js', "el.style.transform = 'rotateX(30deg)';", 'rotateX outside the Lift'],
    [8, 'js/macro-x.js', 'el.animate(frames, { duration: 300 });', 'a written duration'],
    [8, 'js/macro-x.js', 'setTimeout(done, 250);', 'a written wait'],
    [8, 'css/macro-x.css', '.a { transition: opacity 300ms; }', 'a written time in a stylesheet'],
    [9, 'js/macro-x.js', "fetch('/api/power');", 'a fetch'],
    [9, 'js/macro-x.js', "localStorage.setItem('crophalo.x', '1');", 'storage'],
    [9, 'js/macro-x.js', "const u = 'https://example.org/x.js';", 'an outside address'],
    [9, 'js/macro-x.js', 'scene({ name: \'rings\', paint(k) { ctx.getImageData(0, 0, 1, 1); }, end() {} });', 'pixels read inside a frame'],
    [10, 'js/macro-x.js', "ctx.fillStyle = '#ff0000';", 'a written colour in a script'],
    [10, 'css/macro-x.css', '.a { color: #123456; }', 'a written colour in a package stylesheet'],
    [11, 'js/macro-x.js', "label.textContent = 'Your profit this year';", 'a money word'],
    [12, 'js/macro-x.js', "addEventListener('scroll', () => stopAll());", 'scroll as an interrupt'],
  ];
  for (const [rule, rel, text, what] of cases) check(`rule ${rule} catches ${what}`, breaks(rule, rel, text), rules.fileProblems({ rel, text }));
  const fine = [
    ['js/macro-lift.js', "el.style.transform = `perspective(${P}px) rotateX(${A}deg)`;", 'rotateX and perspective in the Lift'],
    ['js/macro-x.js', "scene({ name: 'record-film', ms: 25 * T.YEAR, controls: { host, words }, paint() {}, end() {} });", 'a film made of named years, with controls'],
    ['css/macro.css', ':root { --m-rec-cold: #5f6b78; }', 'the record scale in css/macro.css'],
    ['js/macro-x.js', "const ns = 'http://www.w3.org/2000/svg'; list.pop();", 'the drawing namespace, and an array\'s pop()'],
    ['js/macro-x.js', '// a comment may say bounce, Infinity, fetch, #ff0000 or 300 ms\nconst a = 1;', 'words in a comment'],
  ];
  for (const [rel, text, what] of fine) same(`no false alarm: ${what}`, rules.fileProblems({ rel, text }), []);
  same('rule 2: an auto scene over 4.8 s, and a long scene with no press', rules.tableProblems({ a: { screen: 's', ms: 6000, phone: 6000, auto: true, at: 0, controls: false } }).map(p => p.rule), [2, 2, 3]);
  same('rule 3: two scenes of one screen change that end after 4.8 s together', rules.tableProblems({ a: { screen: 's', ms: 3000, phone: 3000, auto: true, at: 0 }, b: { screen: 's', ms: 2000, phone: 2000, auto: true, at: 2900 } }).map(p => p.rule), [3]);
  same('rule 3 leaves scenes that wait for data to the budget at run time', rules.tableProblems({ a: { screen: 's', ms: 3000, phone: 3000, auto: true, at: 0 }, b: { screen: 's', ms: 2000, phone: 2000, auto: true, at: null } }), []);
});

// ---- the flash check (PROOF 7: a 4 Hz flicker fails, a single 300 ms rise is one change)
await group('flash', async () => {
  const { flashCount, changesOf } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_flash.mjs')).href);
  const W = 682, H = 256, flat = v => ({ width: W, height: H, lum: new Float32Array(W * H).fill(v) });
  const film = (ms, fn, fps = 60) => Array.from({ length: Math.round(ms / 1000 * fps) + 1 }, (_, i) => ({ t: i * 1000 / fps, ...flat(fn(i * 1000 / fps)) }));
  const flicker = flashCount(film(1000, t => (Math.floor(t / 125) % 2 ? 0.9 : 0.05)));
  same('PROOF 7a: a 4 Hz flicker over the whole screen fails', [flicker.fail, flicker.pairs >= 2], [true, true]);
  const rise = flashCount(film(1200, t => 0.05 + 0.85 * Math.min(1, Math.max(0, (t - 200) / 300))));
  same('PROOF 7b: a single 300 ms dark-to-light rise is one change, and passes', [rise.fail, rise.changes, rise.pairs], [false, 1, 0]);
  check('and its change took at least 300 ms', rise.quickest >= 290, rise.quickest);
  const one = flashCount(film(1000, t => (t > 200 && t < 600 ? 0.9 : 0.05)));
  same('one flash (up and back once) is one pair: under the limit, passes', [one.fail, one.pairs], [false, 1]);
  const small = flashCount(film(1000, t => (Math.floor(t / 125) % 2 ? 0.12 : 0.05)));
  same('a flicker under 10 % is not a change at all', [small.fail, small.changes], [false, 0]);
  const bright = flashCount(film(1000, t => (Math.floor(t / 125) % 2 ? 1 : 0.85)));
  same('a flicker whose darker end is over 0.8 does not count', bright.fail, false);
  const half = (t, f) => { const fr = flat(0.05); if (Math.floor(t / 125) % 2) for (let y = 0; y < H; y++) fr.lum.fill(0.9, y * W, y * W + 341); return { t, ...fr }; };
  const local = flashCount(Array.from({ length: 61 }, (_, i) => half(i * 1000 / 60)));
  same('a flicker in one 341 x 256 block fails there, and names the block', [local.fail, local.worst?.col, local.worst?.row, local.blocks], [true, 0, 0, 2]);
  const rgba = v => { const data = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; } return { width: W, height: H, data }; };
  const shot = flashCount(Array.from({ length: 61 }, (_, i) => ({ t: i * 1000 / 60, ...rgba(Math.floor(i / 7.5) % 2 ? 240 : 20) })));
  same('screen pictures (RGBA bytes) are read as relative luminance: the same flicker fails', shot.fail, true);
  same('no frames, no flash', flashCount([]).fail, false);
  same('a slow ramp is one change however many frames it takes', changesOf(Array.from({ length: 100 }, (_, i) => [i * 10, i / 100])).length, 1);
});

// ---- the harness's one pure part: reading the browser's PNG pictures for the flash check
await group('harness', async () => {
  const { decodePng } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_harness.mjs')).href);
  const zlib = await import('node:zlib');
  const chunk = (kind, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); return Buffer.concat([len, Buffer.from(kind, 'latin1'), body, Buffer.alloc(4)]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(2, 0); head.writeUInt32BE(2, 4); head[8] = 8; head[9] = 6;
  const rows = Buffer.from([0, 10, 20, 30, 255, 40, 50, 60, 255, 1, 5, 5, 5, 255, 10, 10, 10, 0]);   // row 1 unfiltered; row 2 "sub": each byte adds the pixel before
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  const pic = decodePng(png);
  same('a 2 x 2 picture with two kinds of row filter is read back byte for byte', [pic.width, pic.height, [...pic.data]], [2, 2, [10, 20, 30, 255, 40, 50, 60, 255, 5, 5, 5, 255, 15, 15, 15, 255]]);
  let refused = false; try { decodePng(Buffer.from('not a picture at all')); } catch { refused = true; }
  check('anything that is not a PNG is refused', refused);
});

// ======== after review (15 November 2026): each group below would have caught one of the review's findings

// ---- the chain clock is started by the screen change, never reset by a scene that comes late
await group('after review: the chain', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  chain('report').start(); now += 4700;
  same('100 ms before the end of a chain, a scene declared at 0 is judged by what is left', [may('curl').level, may('curl').budgetMs], ['less', 100]);
  const curl = scene({ name: 'curl', end() {} }); curl.play();
  same('and playing it does not give the chain a fresh budget', [chain('report').left(), may('score-roll').level], [100, 'less']);
  stopAll('test'); now += 1000;
  const fold = scene({ name: 'fold', end() {} }); fold.play();
  same('a chain that is spent (4.8 s are over) starts again with the scene that is its next change', [chain('report').began(), chain('report').left()], [now, T.AUTO_MAX]);
  stopAll('test'); now += 4600;
  scene({ name: 'curl', end() {} }).play();
  same('a scene at 0 that follows the change 4.6 s later does not restart it', [chain('report').left(), may('score-roll').level], [200, 'less']);
  stopAll('test');
  scene({ name: 'fold', end() {} }).play({ change: true });
  same('play({ change: true }) is a new screen change of a chain still running', [chain('report').began(), chain('report').left()], [now, T.AUTO_MAX]);
  stopAll('test');
  same('a scene that follows its change, on a chain never started, counts the chain as started that long ago', [chain('loading').began(), may('pullback').budgetMs], [null, T.AUTO_MAX - SCENES.pullback.at]);
  scene({ name: 'pullback', end() {} }).play();
  same('and playing it starts the chain there', chain('loading').began(), now - SCENES.pullback.at);
  stopAll('test');
  const view = await import(pathToFileURL(path.join(ROOT, 'js', 'macro-view.js')).href);
  now += 6000; setLevel('still');
  await view.become(() => {}, { scene: 'iris' });
  same('become() is the screen change: the Iris starts the loading chain, not the page\'s', [chain('loading').began(), chain('loading').left()], [now, T.AUTO_MAX]);
  setLevel('full');
  same('a spec may make a scene stricter, never looser: auto: false does not take an auto scene out of the budget', (chain('tab').start(), now += 4700, may('rings', { auto: false }).level), 'less');
  same('and auto: true makes a pressed film follow the auto rules', may('record-film', { auto: true }).level, 'less');
  chain('tab').start(); now += 840;
  same('a scene exactly on the budget plays (3,960 ms with 3,960 left)', [may('rings').level, may('rings').budgetMs], ['full', 3960]);
  now += 1;
  same('and 1 ms over it gets its Less form', may('rings').level, 'less');
  chain('tab').start(); const ks = [];
  const long = scene({ name: 'relief', ms: 99999, paint: k => ks.push(k), end() {} }); long.play();
  frame(SCENES.relief.ms / 2);
  check('the declared length is the ceiling of what is played: half of 900 ms is half way', Math.abs(ks.at(-1) - 0.5) < 1e-9, ks);
  frame(SCENES.relief.ms / 2);
  same('and at 900 ms it is over, not at 99,999', [ks.at(-1), running()], [1, []]);
});

// ---- the input rule, after review
await group('after review: input', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  same('the listener is on document, in the capture phase and passive, for all four inputs', ['pointerdown', 'keydown', 'wheel', 'touchstart'].map(t => listenerOpts[t]?.[0]), Array(4).fill({ capture: true, passive: true }));
  const plain = el('p'), ctl = el('div'), filmHost = el('div'), ends = [];
  const film = scene({ name: 'record-film', host: filmHost, paint() {}, end: () => ends.push('film end'), controls: { host: ctl } }); film.play(); frame();
  send('keydown', plain, { key: 'Tab' }); send('keydown', plain, { key: 'Shift' });
  same('Tab and a bare Shift on their way to the play bar leave a Full film running', running(), ['record-film']);
  chain('tab').start(); const rings = scene({ name: 'rings', paint() {}, end: () => ends.push('rings end') }); rings.play(); frame();
  send('keydown', plain, { key: 'Tab' });
  same('the same Tab still ends every other scene (the literal rule)', [running(), ends.at(-1)], [['record-film'], 'rings end']);
  send('keydown', plain, { key: 'a' });
  same('any other key skips the film to its end', [running(), ends.at(-1)], [[], 'film end']);
  const skipBar = el('div'); const f2 = scene({ name: 'record-film', paint() {}, end() {}, controls: { host: skipBar } }); f2.play(); frame();
  const [pauseBtn, skipBtn] = skipBar.kids[0].kids; skipBtn.focus(); skipBtn.click();
  same('when Skip ends a film, focus goes to the bar\'s place, never to the page', [page.activeElement === skipBar, skipBar.attrs.tabindex, skipBar.kids.length, pauseBtn.attrs['aria-pressed'] ?? null], [true, '-1', 0, null]);
  const back = el('button'), f3bar = el('div'); const f3 = scene({ name: 'year-grows', paint() {}, end() {}, controls: { host: f3bar, back } }); f3.play(); frame();
  f3bar.kids[0].kids[1].focus(); f3.skip();
  same('or to controls.back when the scene names the control that started it', page.activeElement === back, true);
  const nobar = scene({ name: 'record-film', paint() {}, end() {} }); nobar.play();
  same('a film with nowhere to put Pause and Skip gets its Less form', [nobar.form, running()], ['less', []]);
  stopAll('test');
  const hidden = scene({ name: 'record-film', paint() {}, end() {}, controls: { host: el('div') } }); hidden.play(); frame();
  page.hidden = true; send('visibilitychange'); page.hidden = false;
  same('a hidden tab pauses a film; it does not end it', [hidden.paused, running()], [true, ['record-film']]);
  hidden.skip();
  chain('tab').start(); const early = scene({ name: 'rings', paint() {}, end() {} }); early.play();
  send('pointerdown', plain, { timeStamp: now - 5 });
  same('the press that started a scene (earlier than play()) does not end it', running(), ['rings']);
  send('pointerdown', plain, { timeStamp: now + 1 });
  same('a press after play() ends it even before its first frame', running(), []);
  const anims = []; const host = el('div'); host.getAnimations = () => [{ finish: () => anims.push('finish'), commitStyles: () => anims.push('commitStyles'), cancel: () => anims.push('cancel') }];
  chain('report').start(); const dom = scene({ name: 'answer-rise', host, paint() {}, end() {} }); dom.play(); frame();
  send('wheel', plain);
  same('an interrupt finishes, keeps and then cancels every Web Animation under the host', anims, ['finish', 'commitStyles', 'cancel']);
});

// ---- quality and lengths, after review
await group('after review: quality and lengths', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  for (let i = 0; i < 30; i++) quality.feed(22);
  same('a median of exactly 22 ms is not slow', quality().low, false);
  quality.reset(); quality.watch(); for (let i = 0; i < 20; i++) quality.feed(40);
  quality.watch(); for (let i = 0; i < 30; i++) quality.feed(16);
  same('a new scene starts a new window: the last scene\'s 20 slow frames are not judged with its fast ones', quality().low, false);
  quality.reset(); for (let i = 0; i < 30; i++) quality.feed(30);
  chain('report').start(); const ks = [];
  const s = scene({ name: 'answer-rise', paint: k => ks.push(k), end() {} }); s.play();
  same('low quality on a laptop: the length is x 0.7', may('answer-rise').ms, SCENES['answer-rise'].ms * 0.7);
  frame(200); const at200 = ks.at(-1); frame(30);
  check('and the scene is played at that length (224 ms, not 320)', at200 < 1 && at200 > 0.85 && ks.at(-1) === 1, [at200, ks.at(-1)]);
  stopAll('test'); quality.reset();
  globalThis.innerWidth = 400;
  same('on a phone the table\'s phone length is the length: the Descent is 2.1 s, not 1.47 s', [may('descent').ms, may('descent').k], [2100, 1]);
  for (let i = 0; i < 30; i++) quality.feed(30);
  same('a phone whose frames were measured slow takes x 0.7 as well', may('descent').ms, 2100 * 0.7);
  quality.reset(); delete globalThis.innerWidth;
  const saved = _clock.canFrame; _clock.canFrame = () => false;
  same('with no frames at all, Full plays its Still form', may('curl').level, 'still');
  _clock.canFrame = saved;
});

// ---- the camera, after review
await group('after review: the camera', async () => {
  same('the Lift holds it: the Descent is refused', [claimCamera('lift'), claimCamera('descent'), cameraOwner()], [true, false, 'lift']);
  let threw = false, answer = null; try { answer = claimCamera('constructor'); } catch { threw = true; }
  same('a name of the object prototype is refused, not thrown on', [threw, answer, cameraOwner()], [false, false, 'lift']);
  releaseCamera('lift');
});

// ---- rolls, after review
await group('after review: rolls', async () => {
  setLevel('full'); quality.reset(); stopAll('test');
  const rich = el('span'), b = el('b'), small = el('small'); b.textContent = '71'; small.textContent = ' of 100'; rich.append(b, small);
  const r = roll(rich, 71); frame(); frame(T.STEP);
  const real = rich.kids[1];
  check('while it rolls, the page\'s own nodes are what a reader hears, in the hidden copy', real?.className === 'sr' && real.kids[0] === b && real.kids[1] === small, rich.kids.map(k => k.tagName));
  frameFor(SCENES.roll.ms + 100);
  same('at the end the element has its own nodes back, markup and all', [r.rolled, rich.kids.length, rich.kids[0] === b, rich.kids[1] === small, rich.textContent], [true, 2, true, true, '71 of 100']);
  const year = el('p'); year.textContent = 'Year 2001: 1 frost';
  roll(year, 1); frame(); frame(T.STEP);
  check('the figure is found where it stands as a number, not inside 2001', year.kids[0]?.textContent.startsWith('Year 2001: ') && year.kids[0].textContent.endsWith(' frost'), year.kids[0]?.textContent);
  stopAll('input');
  const inside = el('p'); inside.textContent = '17'; const twice = el('p'); twice.textContent = '1 field, 1 farm';
  same('a value that is only inside another number, or there twice, is not rolled', [roll(inside, 7).rolled, roll(twice, 1).rolled, inside.textContent, twice.textContent], [false, false, '17', '1 field, 1 farm']);
  const low = el('p'); low.textContent = 'Low -3'; const seen = [];
  roll(low, -3); frame();
  for (let i = 0; i < 60; i++) { frame(16); if (low.kids[0]?.attrs?.['aria-hidden'] === 'true') seen.push(low.kids[0].textContent); }
  check('a roll toward a figure below zero never shows -0', seen.length > 3 && !seen.some(t => /-0(?![\d.,])/.test(t)) && seen.at(-1) !== undefined, seen.slice(0, 6));
  stopAll('test');
  setLevel('less');
  const lessEl = el('b'); lessEl.textContent = '71'; const lessKid = lessEl.kids[0];
  const lr = roll(lessEl, 71);
  same('at Less nothing rolls and the element is not touched', [lr.rolled, lessEl.kids[0] === lessKid, lessEl.kids.length], [false, true, 1]);
  setLevel('still');
  const stillRich = el('span'), sb = el('b'); sb.textContent = '71'; stillRich.append(sb);
  same('at Still the element keeps its markup', [roll(stillRich, 71).rolled, stillRich.kids[0] === sb], [false, true]);
  setLevel('full');
});

// ---- the announcer, after review
await group('after review: say', async () => {
  const { hooks } = await import(pathToFileURL(path.join(ROOT, 'js', 'hooks.js')).href);
  hooks.tab(() => {}, { from: 'overview', to: 'weather' });
  same('a screen change that starts no chain may still speak', say('Weather tab.'), true);
  hooks.view(() => {}, { to: 'report' });
  const first = say('Report ready.');
  scene({ name: 'fold', end() {} }).play({ change: true });
  same('a sentence said before the change\'s scene plays still counts: a second one in the same change is dropped', [first, say('A second sentence.')], [true, false]);
  stopAll('test');
  hooks.place(() => hooks.view(() => {}, { to: 'setup' }), null);
  same('a hook called inside another hook\'s update is the same screen change', [say('Opening the map.'), say('Setup.')], [true, false]);
  page.getElementById('macroSay')?.remove();
  hooks.view(() => {}, { to: 'farm' });
  same('a region laid just now is empty at first', [say('My farm.'), page.getElementById('macroSay')?.textContent], [true, '']);
  await wait(0);
  same('and gets its sentence on the next tick, so readers hear it', page.getElementById('macroSay')?.textContent, 'My farm.');
});

// ---- hooks, after review
await group('after review: hooks', async () => {
  const { hooks, setHook, changes } = await import(pathToFileURL(path.join(ROOT, 'js', 'hooks.js')).href);
  const off = setHook('view', update => { update(); return true; });
  let caught = null; try { hooks.view(() => { throw new Error('the update failed'); }, {}); } catch (e) { caught = e.message; }
  same('an error of the update that comes out of a wrapper reaches the caller, as with no wrapper', caught, 'the update failed');
  off();
  const off2 = setHook('view', update => { try { update(); } catch { /* the wrapper reports it itself */ } return true; });
  let quiet = 'none'; try { hooks.view(() => { throw new Error('handled'); }, {}); } catch (e) { quiet = e.message; }
  same('one the wrapper has handled itself is not thrown twice', quiet, 'none');
  off2();
  const n = changes(); hooks.view(() => {}, {}); hooks.tab(() => {}, {});
  same('every outermost hook call is one screen change', changes() - n, 2);
});

// ---- js/macro.js, after review
await group('after review: macro.js', async () => {
  const m = await import(pathToFileURL(path.join(ROOT, 'js', 'macro.js')).href + '?async');
  let unhandled = 0; const onU = () => unhandled++; process.on('unhandledRejection', onU);
  const reported = [], saved = globalThis.reportError; globalThis.reportError = e => reported.push(e?.message);
  await m.start({ landed: ['home'], importer: () => Promise.resolve({ start: async () => { throw new Error('async start failed'); } }) });
  await wait(20);
  process.off('unhandledRejection', onU); globalThis.reportError = saved;
  same('a module whose async start() fails is reported and never rejects into the page', [unhandled, reported], [0, ['async start failed']]);
});

// ---- become(): the native path, with a stand-in for the browser's view transitions
await group('after review: become()', async () => {
  const view = await import(pathToFileURL(path.join(ROOT, 'js', 'macro-view.js')).href);
  setLevel('full'); quality.reset(); stopAll('test');
  const calls = []; let mode = 'run', last = null;
  page.startViewTransition = arg => {
    if (mode === 'throw') { const e = new Error('the document is not ready'); e.name = 'InvalidStateError'; throw e; }
    const update = typeof arg === 'function' ? arg : arg.update;
    calls.push({ form: typeof arg === 'function' ? 'plain' : 'options', types: typeof arg === 'function' ? null : arg.types, names: all(page.body).filter(n => n.style?.viewTransitionName).map(n => n.style.viewTransitionName), flag: shown.macroVt });
    let ran = false, end; const finished = new Promise(r => { end = r; });
    const run = () => { if (ran) return; ran = true; vt.updates++; try { update(); } catch { /* the page reports it */ } };
    const vt = { updates: 0, skipped: 0, ready: Promise.resolve(), finished, skipTransition() { vt.skipped++; run(); end(); }, finish() { run(); end(); } };
    if (mode === 'run') queueMicrotask(run);   // the browser runs the update after it has taken its picture
    last = vt; return vt;
  };
  const a = el('div'); page.body.append(a);
  let runs = 0;
  const p1 = view.become(() => runs++, { names: { 'field-shape': a }, scene: 'chapter-turn' });
  await wait(0);
  same('Full with no type support: the one-argument form, the names set on their elements, the flag on the page', [calls.at(-1).form, calls.at(-1).names, calls.at(-1).flag, runs], ['plain', ['field-shape'], 'full', 1]);
  last.finish();
  same('at the end it answers "transition", and the names and the flag are gone', [await p1, a.style.viewTransitionName, shown.macroVt ?? null, runs], ['transition', '', null, 1]);
  globalThis.ViewTransition = class {}; Object.defineProperty(globalThis.ViewTransition.prototype, 'types', { get() { return null; }, configurable: true });
  const p2 = view.become(() => {}, { types: ['forward'], scene: 'chapter-turn', iris: { x: 10, y: 20 } });
  await wait(0);
  same('with type support: the options form, with its types', [calls.at(-1).form, calls.at(-1).types], ['options', ['forward']]);
  check('the iris opens on the new picture once ready', rootAnims.some(r => r.options?.pseudoElement === '::view-transition-new(root)' && /circle\(0px at 10px 20px\)/.test(r.frames?.clipPath?.[0] || '')), rootAnims);
  last.finish(); await p2; delete globalThis.ViewTransition;
  mode = 'hold'; runs = 0;
  const p3 = view.become(() => runs++, { scene: 'chapter-turn' });
  await wait(fx.VT_GUARD_MS + 40);
  same('a transition that has not run its update in 80 ms is skipped, and the update runs once', [last.skipped >= 1, runs], [true, 1]);
  await p3;
  same('and still once when it ends', runs, 1);
  mode = 'run';
  const p4 = view.become(() => {}, { scene: 'chapter-turn' }); await wait(0);
  frame(); send('keydown', page.body, { key: 'a' });
  same('an input during a Full transition skips it', [last.skipped, running().includes('chapter-turn')], [1, false]);
  await p4;
  const b = el('div'); page.body.append(b);
  mode = 'hold';
  const p5 = view.become(() => {}, { names: { 'field-shape': b }, scene: 'chapter-turn' });
  const firstVt = last;
  setLevel('less'); mode = 'run';
  const p6 = view.become(() => {}, { scene: 'chapter-turn' }); await wait(0);
  same('a Less change while a Full one is in flight starts with no name left on any element', [calls.at(-1).names, calls.at(-1).flag], [[], 'less']);
  send('keydown', page.body, { key: 'a' });
  same('an input during a Less transition skips it too', last.skipped, 1);
  firstVt.finish(); await p5; await p6;
  same('and no listener of it is left behind', ['pointerdown', 'keydown', 'wheel', 'touchstart'].map(t => (listeners[t] || []).length), [1, 1, 1, 1]);
  setLevel('full'); mode = 'throw'; runs = 0;
  same('a transition the browser refuses to start: the update runs, the flag goes, "fallback"', [await view.become(() => runs++, { scene: 'chapter-turn' }), runs, shown.macroVt ?? null], ['fallback', 1, null]);
  setLevel('less');
  same('the same at Less', [await view.become(() => runs++, { scene: 'chapter-turn' }), runs, shown.macroVt ?? null], ['fallback', 2, null]);
  setLevel('full'); mode = 'run';
  const errors = [], savedReport = globalThis.reportError; globalThis.reportError = e => errors.push(e?.message);
  const p7 = view.become(() => { throw new Error('half drawn'); }, { scene: 'chapter-turn' }); await wait(0); last.finish();
  same('an update that throws: reported once, and become() answers "error"', [await p7, errors], ['error', ['half drawn']]);
  globalThis.reportError = savedReport;
  const c = el('div'), d2 = el('div'); page.body.append(c, d2); c.style.viewTransitionName = 'field-title';   // a name set by other code, not by nameOnce()
  view.nameOnce(d2, 'field-title');
  same('nameOnce also takes the name off an element whose own style carries it', [c.style.viewTransitionName, d2.style.viewTransitionName], ['', 'field-title']);
  view.nameOnce(d2, '');
  delete page.startViewTransition;
  const shownV = el('section'), classes = new Set(); shownV.classList = { add: c => classes.add(c), remove: (...c) => c.forEach(x => classes.delete(x)) };
  page.shownView = shownV; globalThis.requestAnimationFrame = fn => fn(0);   // fx.arrive() asks the browser for its next frame
  same('with no view transitions, Full runs the update and the new view arrives today\'s way (fx.arrive)', [await view.become(() => {}, { scene: 'chapter-turn' }), classes.has('fx-arrive')], ['fallback', true]);
  setLevel('less');
  same('and at Less it fades in over T.QUICK, opacity only', [await view.become(() => {}, { scene: 'chapter-turn' }), shownV.anims.at(-1)?.frames, shownV.anims.at(-1)?.options.duration], ['fallback', [{ opacity: 0 }, { opacity: 1 }], T.QUICK]);
  setLevel('full'); delete globalThis.requestAnimationFrame; page.shownView = null;
});

// ---- the written rules, after review
await group('after review: rules', async () => {
  const rules = await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_rules.mjs')).href);
  const breaks = (rule, rel, text) => rules.fileProblems({ rel, text }).some(p => p.rule === rule);
  const cases = [
    [1, 'js/macro-x.js', 'become(() => draw());', 'become() with no scene written'],
    [2, 'js/macro-x.js', "scene({ name: 'rings', auto: false, paint() {}, end() {} });", 'an auto scene that makes itself not auto'],
    [4, 'js/macro-x.js', 'const o = { duration: T.TURN, iterations: 1e9 };', 'a huge iteration count'],
    [4, 'css/macro-x.css', '.a { animation-iteration-count: 99999; }', 'a huge iteration count in a stylesheet'],
    [4, 'js/macro-x.js', 'const f = () => { draw(); setTimeout(f, T.BEAT); };', 'a timer that starts itself again'],
    [4, 'js/macro-x.js', 'function f() { draw(); setTimeout(() => f(), T.BEAT); }', 'a function that starts itself again by a timer'],
    [5, 'js/macro-x.js', 'const easeOutBounce = t => t;', 'a bounce inside a longer name'],
    [5, 'js/macro-x.js', 'const springElastic = 1;', 'an elastic inside a longer name'],
    [5, 'js/macro-x.js', 'const backOvershoot = 1;', 'an overshoot inside a longer name'],
    [5, 'js/macro-x.js', 'const popIn = 1;', 'a pop as part of a name'],
    [6, 'js/macro-x.js', "h1.style.transform = 'scale(' + (1 + k) + ')';", 'a scale built by joining strings'],
    [6, 'js/macro-x.js', "h1.style.fontSize = '40px';", 'a font size from a script'],
    [6, 'css/macro-x.css', '@keyframes grow { from { transform: scale(.6); } to { transform: scale(1); } }', 'a keyframe that scales'],
    [13, 'css/macro-bad.css', '.m-a { animation: rise var(--m-t-turn) var(--m-ease-arrive); }', 'a stylesheet animation outside the level switches'],
    [13, 'css/macro-x.css', '@media (prefers-reduced-motion: no-preference) { html:not([data-motion]) .x { animation: x var(--m-t-day); } }', 'an 8 s stylesheet animation'],
    [13, 'css/macro-x.css', 'html[data-motion=less] .a { transition: transform var(--m-t-quick); }', 'a Less transition that moves more than opacity'],
    [13, 'css/macro-x.css', 'html[data-motion=less] .a { animation-duration: var(--m-t-turn); }', 'a Less animation over 200 ms'],
    [13, 'js/macro-x.js', "document.querySelector('h2').animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.TURN });", '.animate() outside the conductor'],
    [13, 'js/macro-x.js', 'const f = () => { draw(); requestAnimationFrame(f); };', 'a frame loop of its own'],
    [13, 'js/macro-x.js', 'document.startViewTransition(() => draw());', 'a view transition outside become()'],
    [13, 'js/macro-x.js', 'setTimeout(close, 25 * T.YEAR);', 'a product of named times outside a scene'],
    [13, 'js/macro-x.js', 'setTimeout(close, T.DAY);', 'T.DAY outside a scene'],
  ];
  for (const [rule, rel, text, what] of cases) check(`rule ${rule} catches ${what}`, breaks(rule, rel, text), rules.fileProblems({ rel, text }));
  const fine = [
    ['js/macro-x.js', "const debounce = fn => fn; el.showPopover(); addEventListener('popstate', go);", 'a debounce, a popover and popstate'],
    ['css/macro-x.css', '@keyframes fade { from { opacity: 0; } to { opacity: 1; } } html[data-motion=less] .a { animation: fade var(--m-t-quick) var(--m-ease-fade); }', 'a Less fade of opacity in T.QUICK'],
    ['css/macro-x.css', 'html[data-motion=reduce] .a { animation: none !important; }', 'Still turning an animation off'],
    ['js/macro-x.js', 'ctx.scale(dpr, dpr);', 'a canvas scaled to the pixel ratio'],
    ['js/macro-x.js', "become(() => draw(), { scene: 'chapter-turn' });", 'become() with its scene written'],
  ];
  for (const [rel, text, what] of fine) same(`no false alarm: ${what}`, rules.fileProblems({ rel, text }), []);
  const css = read('css/macro.css');
  check('a named heading\'s pictures keep their size while its box travels', /::view-transition-old\(field-title\)[\s\S]*?object-fit:\s*none/.test(css));
  check('at Full every picture of a transition (a heading included) fades in T.QUICK', /data-macro-vt=full\]::view-transition-old\(\*\),\s*html:not\(\[data-motion\]\)\[data-macro-vt=full\]::view-transition-new\(\*\)\s*\{\s*animation-duration:\s*var\(--m-t-quick\)/.test(css));
});

// ---- the flash check, after review
await group('after review: flash', async () => {
  const { flashCount } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_flash.mjs')).href);
  const W = 682, H = 512;
  const corner = Array.from({ length: 61 }, (_, i) => { const t = i * 1000 / 60, lum = new Float32Array(W * H).fill(0.05); if (Math.floor(t / 125) % 2) for (let y = 169; y < 344; y++) lum.fill(0.9, y * W + 241, y * W + 441); return { t, width: W, height: H, lum }; });
  const c = flashCount(corner);
  same('a flicker of 200 x 175 px on the corner of four blocks is caught (by a grid moved half a block)', [c.fail, c.worst?.offset?.some(v => v > 0)], [true, true]);
  const rgbaOf = (w, h, [r, g, b]) => { const data = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; } return { width: w, height: h, data }; };
  const red = rgbaOf(341, 256, [255, 0, 0]), grey = rgbaOf(341, 256, [127, 127, 127]);
  const rf = flashCount(Array.from({ length: 61 }, (_, i) => { const t = i * 1000 / 60; return { t, ...(Math.floor(t / 125) % 2 ? red : grey) }; }));
  same('a red flash against a grey of the same brightness is caught as saturated red', [rf.fail, rf.worst?.kind], [true, 'red']);
  const slow = flashCount(Array.from({ length: 5 }, (_, i) => ({ t: i * 250, width: 4, height: 4, lum: new Float32Array(16).fill(i % 2 ? 0.9 : 0.05) })));
  same('pictures 250 ms apart cannot show a 4 Hz flicker: a fail that says it could not judge', [slow.fail, slow.judged, /too far apart/.test(slow.reason || '')], [true, false, true]);
});

// ---- the harness and the hooks notes, after review
await group('after review: harness and hooks notes', async () => {
  const harness = await import(pathToFileURL(path.join(ROOT, 'scripts', 'macro_harness.mjs')).href);
  same('chainMs(page) works as the plan writes it: act is optional', harness.chainMs.length, 1);
  check('captureFrames says it is below the browser\'s frame rate', /BELOW THE BROWSER'S FRAME RATE/.test(read('scripts/macro_harness.mjs')));
  // The hooks are now in the app's own files, so these checks read the code where they are applied (js/app.js show() and js/report.js setTab()), not the papers that described them.
  const wrapped = (rel, open, close) => { const t = read(rel), at = t.indexOf(open); return at < 0 ? '' : t.slice(at, t.indexOf(close, at)); };
  // The wrapper's info now also carries wasPage (the page turns tell one info page from another by it), so its closing line reads '}, { from, to: view, page, wasPage: was });'.
  check('hook 3: the scroll and the focus are inside the wrapped update of show()', /scrollTo\(0, 0\); focusHeading\(\)/.test(wrapped('js/app.js', 'hooks.view(() => {', '}, { from, to: view, page, wasPage: was });')));
  check('hook 3: nothing that fetches is inside the wrapped update of show()', !/import\(|showReport\(|openFarm\(|openAdmin\(|loadMap\(/.test(wrapped('js/app.js', 'hooks.view(() => {', '}, { from, to: view, page, wasPage: was });')));
  // Changed on purpose: the report is one page now, with no tabs (the report as one page in the farmer's questions: "the tabs and sliders are gone"), so setTab() and its hooks.tab call are gone;
  // the report's screen changes (loading, failed, ready) still go through hooks.report, and hooks.tab stays a name in js/hooks.js that no caller needs.
  check('hook 5: the one-page report never calls hooks.tab, and its screen changes go through hooks.report', !/hooks\.tab\(/.test(read('js/report.js')) && /hooks\.report\(update, /.test(read('js/report.js')));
  check('the app imports js/motion-wire.js only when the file is there', !/import\(['"]\.\/motion-wire\.js['"]\)/.test(read('js/app.js')) || fs.existsSync(path.join(ROOT, 'js', 'motion-wire.js')));
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
