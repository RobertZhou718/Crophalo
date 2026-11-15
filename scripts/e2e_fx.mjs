// The browser suite for the small motions: each one plays once with the allowed kind of motion, state changes come before motion, nothing runs over 5 s without a way to stop it,
// everything is off under "Always still" and under the device's reduce-motion choice, and no motion costs a tap more than 200 ms on a slowed-down phone.
// The page under test is design/fx-demo.html. Run: node scripts/e2e_fx.mjs     (pictures: E2E_SHOTS=<a folder outside the project>)
import os from 'node:os';
import { openRun } from './e2e_lib.mjs';
// Why the 200 ms limit below is not judged on a swamped computer: it times the page's own thread, which a machine running several times more work than it has threads stretches
// by itself (scripts/e2e_engine_worker.mjs keeps the same rule). That the screen changes at all after the press is always judged.
const busy = os.loadavg()[0] > 3 * os.cpus().length;

const run = await openRun('fx');
const { js, page, until, tap, size, device, go, flat, shot, check, same, group, finish, sleep, send } = run;
const PAGE = '/design/fx-demo.html';
const open = async (w = 1280) => { await size(w); await go(PAGE); await until('window.ready === true', 10000); await sleep(250); };
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);
// what every running animation on the page is made of, read from the browser itself
const ANIMS = `(() => document.getAnimations().map(a => { const t = a.effect?.getTiming?.() || {}, kf = a.effect?.getKeyframes?.() || []; return { name: a.animationName || a.id || '', id: a.id, kind: a.constructor.name, duration: t.duration, iterations: t.iterations === Infinity ? 'infinite' : t.iterations, easing: t.easing, delay: t.delay, state: a.playState, target: a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? a.effect?.target?.tagName ?? '', frames: kf.map(k => ({ opacity: k.opacity ?? null, transform: k.transform ?? null, offset: k.offset, easing: k.easing })) }; }))()`;
const calm = (anims, label) => {
  for (const a of anims) {
    const tag = `${label}: ${a.name || a.id} on ${a.target}`;
    const scaled = a.frames.map(f => f.transform).filter(Boolean).join(' ');
    check(`${tag}: no scale past full size, no rotate, no skew`, !/rotate|skew|perspective/.test(scaled) && [...scaled.matchAll(/scale[XY]?\(([-\d.]+)/g)].every(m => +m[1] <= 1.0001), scaled);
    const ops = a.frames.map(f => f.opacity).filter(v => v !== null).map(Number);
    check(`${tag}: opacity only climbs or only falls`, ops.every((v, i) => i === 0 || v >= ops[i - 1] - 1e-9) || ops.every((v, i) => i === 0 || v <= ops[i - 1] + 1e-9), ops);
    check(`${tag}: its curve is linear or the one out-curve (never passes its end)`, [a.easing, ...a.frames.map(f => f.easing)].every(e => !e || e === 'linear' || /^ease/.test(e) || /cubic-bezier\((?:0?\.2, ?0?\.8, ?0?\.2, ?1|0?\.2,0?\.8,0?\.2,1)\)/.test(e)), [a.easing, a.frames.map(f => f.easing)]);
    const long = a.duration > 5000 || a.iterations === 'infinite';
    if (long) check(`${tag}: it runs over 5 s or for ever, so it is the loader's satellite and it has a pause button`, /fx-sat/.test(String(a.target)) && true, a.target);
  }
};

await group('fx: the satellite-scan loader', async () => {
  await open();
  const anims = await js(ANIMS), sat = anims.find(a => /fx-sat/.test(a.target));
  check('the satellite crosses over a 7 s pass, looping while it loads, in a straight left-to-right line', !!sat && sat.duration === 7000 && sat.iterations === 'infinite' && sat.easing === 'linear', sat);
  check('it moves left to right: its x only increases', sat && (x => x.length === 2 && x[1] > x[0])(sat.frames.map(f => +/translate\((-?[\d.]+)px/.exec(f.transform || '')?.[1])), sat?.frames);
  check('it carries a shared clock (a negative delay), so a redraw never restarts the pass', sat && sat.delay <= 0 && sat.delay > -7000, sat?.delay);
  same('twelve fields in the picture, none green before anything answers', await js(`[document.querySelectorAll('.fx-parcel').length, document.querySelectorAll('.fx-parcel.is-read').length]`), [12, 0]);
  await shot('fx-scan-start-1280.png');
  for (let i = 0; i < 3; i++) await tap('#answerBtn');
  same('three of six answered: six fields are green, the words and the progress bar say so', await js(`[document.querySelectorAll('.fx-parcel.is-read').length, document.querySelector('.fx-scan-words').textContent, document.querySelector('.fx-progress').getAttribute('aria-valuenow')]`), [6, '3 of 6 sources answered', '50']);
  check('the picture itself is hidden from a screen reader; the words and the bar carry the news', await js(`document.querySelector('.fx-scan-art').getAttribute('aria-hidden') === 'true' && document.querySelector('.fx-progress').getAttribute('role') === 'progressbar'`));
  await tap('.fx-quiet'); await sleep(150);
  check('the pause button stops the pass (and says what it does next)', (await js(ANIMS)).find(a => /fx-sat/.test(a.target))?.state === 'paused' && (await text('.fx-quiet')) === 'Play the picture');
  await tap('.fx-quiet');
  for (let i = 0; i < 3; i++) await tap('#answerBtn');
  await sleep(200);
  same('all six answered: twelve green, and the pass ends by itself', await js(`[document.querySelectorAll('.fx-parcel.is-read').length, document.querySelector('.fx-scan').classList.contains('is-done'), getComputedStyle(document.querySelector('.fx-sat')).visibility]`), [12, true, 'hidden']);
  check('nothing infinite is left running', !(await js(ANIMS)).some(a => a.iterations === 'infinite'));
});

await group('fx: numbers roll into place once, with the real number always readable', async () => {
  await size(1280); await go(PAGE); await until('window.ready === true', 10000);
  await sleep(150);
  const during = await js(`[...document.querySelectorAll('[data-roll]')].map(n => ({ visible: n.querySelector('[aria-hidden]')?.textContent ?? null, sr: n.querySelector('.fx-sr')?.textContent ?? null, full: n.innerText }))`);
  check('while rolling, the real number is there for a screen reader and the picture is counting', during.every(d => d.sr !== null) && during.some(d => d.visible !== null), during);
  await until(`[...document.querySelectorAll('[data-roll]')].every(n => n.children.length === 0)`, 8000).catch(() => {});
  same('afterwards every number is plain text again, exactly as written', await js(`[...document.querySelectorAll('[data-roll]')].map(n => [n.children.length, n.textContent])`), [[0, '12,480 mm'], [0, '86'], [0, '7.5%']]);
  same('the figures keep their units and decimals', await js(`document.querySelector('#n3').textContent`), '7.5%');
  // one trigger, one roll: another call finds nothing to do
  same('asking again rolls nothing a second time', await js(`window.fx.rollNumbers(document).nodes`), 0);
});

await group('fx: sections ease in behind a cover, once, and the words never fade', async () => {
  await open();
  check('below the fold the three sections wait under a cover', await js(`['r1', 'r2', 'r3'].every(id => document.getElementById(id).classList.contains('fx-pending'))`));
  check('nothing sets an opacity on them (their words are at full contrast whenever they can be seen)', await js(`['r1', 'r2', 'r3'].every(id => getComputedStyle(document.getElementById(id)).opacity === '1' && getComputedStyle(document.querySelector('#' + id + ' p')).opacity === '1')`));
  await js(`window.__runs = {}; for (const id of ['r1', 'r2', 'r3']) document.getElementById(id).addEventListener('transitionrun', e => { if (e.pseudoElement === '::after') window.__runs[id] = (window.__runs[id] || 0) + 1; })`);
  await js(`document.getElementById('r1').scrollIntoView({ block: 'center' })`);
  await until(`['r1', 'r2', 'r3'].filter(id => !document.getElementById(id).classList.contains('fx-pending')).length >= 2`, 8000).catch(() => {});
  check('they have come in, and the cover is gone', await js(`['r1', 'r2', 'r3'].filter(id => !document.getElementById(id).classList.contains('fx-pending')).length >= 2`));
  await js(`window.scrollTo(0, 0)`); await sleep(300); await js(`document.getElementById('r2').scrollIntoView({ block: 'center' })`); await sleep(1200);
  const runs = await js('window.__runs');
  check('each plays once: scrolling away and back does not play it again', Object.values(runs).every(n => n === 1), runs);
  calm(await js(ANIMS), 'sections');
});

await group('fx: the tab glass and the page turn', async () => {
  await open();
  await tap('#t2');
  const now = await js(`({ sel: document.getElementById('t2').getAttribute('aria-selected'), old: document.getElementById('t0').getAttribute('aria-selected'), words: document.getElementById('panelText').textContent })`);
  same('the state is chosen at once: the tab, the panel words', [now.sel, now.old, now.words], ['true', 'false', 'Calendar panel.']);
  const a = await js(ANIMS), glass = a.find(x => x.id === 'fxt-glass'), turn = a.find(x => x.id === 'fxt-turn');
  check('the glass slides in 420 ms on the one out-curve, by place and width only', !!glass && glass.duration === 420 && /cubic-bezier\(0?\.2, ?0?\.8, ?0?\.2, ?1\)/.test(glass.easing) && glass.frames.every(f => /^translateX/.test(f.transform || '')), glass);
  check('the page turns 24 px in from the side of travel (forward: from the right) over 460 ms', !!turn && turn.duration === 460 && turn.frames[0].transform === 'translateX(24px)' && turn.frames[1].transform === 'translateX(0px)', turn);
  const fade = a.find(x => x.id === 'fxt-fade');
  check('and its words are partly faded for 160 ms at most', !!fade && fade.duration <= 160, fade);
  calm(a, 'tabs');
  await sleep(700);
  await until(`Math.abs(document.querySelector('.fx-glass').getBoundingClientRect().left - document.getElementById('t2').getBoundingClientRect().left) < 1.5`, 4000).catch(() => {});
  const where = await js(`(() => { const g = document.querySelector('.fx-glass').getBoundingClientRect(), t = document.getElementById('t2').getBoundingClientRect(); return { dx: Math.abs(g.left - t.left), dw: Math.abs(g.width - t.width) }; })()`);
  check('it lands exactly on the chosen tab', where.dx < 1.5 && where.dw < 1.5, where);
  await tap('#t0'); const back = (await js(ANIMS)).filter(x => x.id === 'fxt-turn').at(-1);
  check('going back turns the other way (from the left)', back?.frames[0].transform === 'translateX(-24px)', back);
  same('the arrow keys choose too', await (async () => { await js(`document.getElementById('t0').focus()`); await run.press('ArrowRight'); await sleep(50); return js(`document.getElementById('t1').getAttribute('aria-selected')`); })(), 'true');
  await shot('fx-tabs-1280.png');
});

await group('fx: view transitions, with a plain fallback', async () => {
  await open();
  await tap('#viewBtn'); await sleep(900);
  same('the update ran: view B is shown', await js(`[document.getElementById('viewA').hidden, document.getElementById('viewB').hidden]`), [true, false]);
  const kind = await js(`typeof document.startViewTransition`);
  if (kind === 'function') {
    same('the browser\'s own transition, when a page asks for it (native: true), runs the update and says so', await js(`window.fx.transitionView(() => { document.getElementById('viewA').hidden = !document.getElementById('viewA').hidden; document.getElementById('viewB').hidden = !document.getElementById('viewB').hidden; }, { native: true })`), 'transition');
    await sleep(700);
    check('and it cleans up after itself', await js(`!document.documentElement.dataset.fxDir`));
    await js(`document.getElementById('viewA').hidden = true; document.getElementById('viewB').hidden = false; 0`);
  }
  // the fallback: a browser without view transitions gets a plain arrive (fade and rise) and the update still runs
  await js(`document.startViewTransition = undefined; 0`);
  await tap('#viewBtn'); await sleep(60);
  same('fallback: the view is updated at once', await js(`[document.getElementById('viewA').hidden, document.getElementById('viewB').hidden]`), [false, true]);
  const arr = (await js(ANIMS)).find(a => a.name === 'fx-arrive');
  check('fallback: the new view arrives with a short fade and rise, full opacity by 147 ms', !!arr && arr.duration === 420 && arr.frames.some(f => f.opacity === '1' && Math.abs(f.offset - 0.35) < 0.01) && arr.frames[0].transform === 'translateY(12px)', arr);
  await sleep(600);
  check('fallback: and it leaves nothing behind', await js(`!document.getElementById('viewA').classList.contains('fx-arrive')`));
});

await group('fx: the reading rail', async () => {
  await open();
  same('at the top it is hidden', await js(`document.getElementById('fx-rail').classList.contains('is-on')`), false);
  await js(`window.scrollTo(0, 900)`);
  await until(`document.getElementById('fx-rail').classList.contains('is-on')`, 5000).catch(() => {}); await sleep(100);
  const r = await js(`({ on: document.getElementById('fx-rail').classList.contains('is-on'), x: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#fx-rail i')).transform).a, want: scrollY / (document.documentElement.scrollHeight - innerHeight), h: document.getElementById('fx-rail').getBoundingClientRect().height })`);
  check('after 400 px it shows, 3 px tall, as long as the part read', r.on && Math.abs(r.x - r.want) < 0.02 && r.h === 3, r);
  await js(`window.scrollTo(0, 0)`); await sleep(500);
  same('and goes away again at the top', await js(`document.getElementById('fx-rail').classList.contains('is-on')`), false);
  check('the rail is not read out and takes no taps', await js(`document.getElementById('fx-rail').getAttribute('aria-hidden') === 'true' && getComputedStyle(document.getElementById('fx-rail')).pointerEvents === 'none'`));
});

await group('fx: Watch the year, with a Stop button', async () => {
  await open();
  await js(`document.getElementById('yearCard').scrollIntoView({ block: 'center' })`);
  same('it starts as "Watch the year"', await text('#yearBtn'), 'Watch the year');
  await tap('#yearBtn'); await sleep(1700);
  const mid = await js(`({ label: document.getElementById('yearBtn').textContent, passed: document.querySelectorAll('.fx-passed').length, now: document.querySelectorAll('.fx-now').length, live: document.getElementById('yearLive').textContent })`);
  check('it plays: the button is "Stop", months are passing, one is current, the live words are the calendar\'s own title', mid.label === 'Stop' && mid.passed >= 2 && mid.now === 1 && /^\w{3}: /.test(mid.live), mid);
  check('nothing is dimmed: every month keeps full opacity', await js(`[...document.querySelectorAll('#months div')].every(d => getComputedStyle(d).opacity === '1')`));
  await tap('#yearBtn'); const stopped = await js(`document.querySelectorAll('.fx-passed').length`); await sleep(900);
  same('Stop stops it where it is, and says "Watch again"', [await text('#yearBtn'), await js(`document.querySelectorAll('.fx-passed').length`) === stopped], ['Watch again', true]);
  await tap('#yearBtn'); await sleep(9700);
  same('left alone it finishes in about 9 s: twelve months passed, "Watch again"', [await js(`document.querySelectorAll('.fx-passed').length`), await text('#yearBtn')], [12, 'Watch again']);
});

await group('fx: the small states', async () => {
  await open();
  await tap('#saveBtn');
  same('saved: pressed, and says so', await js(`[document.getElementById('saveBtn').getAttribute('aria-pressed'), document.getElementById('saveBtn').classList.contains('fx-saved'), document.getElementById('liveWords').textContent]`), ['true', true, 'Saved.']);
  await tap('#saveBtn');
  same('and back', await js(`[document.getElementById('saveBtn').getAttribute('aria-pressed'), document.getElementById('liveWords').textContent]`), ['false', 'Removed from saved.']);
  await tap('#copyBtn'); await sleep(100);
  same('copied: the button says "Copied" with a tick that draws itself', await js(`[document.getElementById('copyBtn').textContent.trim(), document.querySelectorAll('#copyBtn .fx-tick').length, document.getElementById('liveWords').textContent]`), ['Copied', 1, 'Copied.']);
  check('the tick draws by its stroke only (no scale), once, 450 ms', (a => !!a && a.duration === 450 && a.iterations === 1)((await js(ANIMS)).find(x => x.name === 'fx-draw')));
  await sleep(2200);
  same('and the button goes back to its own words', await text('#copyBtn'), 'Copy link');
  await tap('#addBtn');
  same('added: "Added to your farm", marked done and not pressed twice', await js(`[document.getElementById('addBtn').textContent.trim(), document.getElementById('addBtn').getAttribute('aria-disabled')]`), ['Added to your farm', 'true']);
  check('its flash is one outline that fades, once', (a => !!a && a.iterations === 1 && a.duration === 1000)((await js(ANIMS)).find(x => x.name === 'fx-flash')));
  await tap('#toastBtn'); await sleep(300);
  const t1 = await js(`({ n: document.querySelectorAll('.fx-toast').length, words: document.querySelector('.fx-toast span').textContent, role: document.getElementById('fx-toasts').getAttribute('role'), undoH: document.querySelector('.fx-toast-undo').getBoundingClientRect().height, op: getComputedStyle(document.querySelector('.fx-toast')).opacity })`);
  check('the undo toast: one toast, in a status region, an Undo button 44 px tall, fully shown', t1.n === 1 && t1.role === 'status' && t1.undoH >= 43.5 && t1.op === '1' && t1.words === 'Field removed.', t1);
  await shot('fx-toast-1280.png');
  await tap('#toastBtn'); await sleep(100);
  same('a second message while it shows replaces the words in the same toast, with a soft glow and no bump', await js(`[document.querySelectorAll('.fx-toast').length, document.querySelector('.fx-toast span').textContent, document.querySelector('.fx-toast').classList.contains('fx-flash')]`), [1, 'Field removed again (2).', true]);
  await tap('.fx-toast-undo'); await sleep(700);
  same('Undo does its work and the toast goes', await js(`[document.getElementById('liveWords').textContent, document.querySelectorAll('.fx-toast').length]`), ['Undone.', 0]);
  await tap('#toastBtn'); await sleep(6900);
  same('left alone the toast goes by itself after 6 s', await js(`document.querySelectorAll('.fx-toast').length`), 0);
  await js(`document.getElementById('stillBtn').focus()`); await run.press('Tab');
  const focusRing = await js(`(() => { const b = document.activeElement; return b.classList.contains('fx-quiet') ? getComputedStyle(b).outlineStyle + ' ' + getComputedStyle(b).outlineWidth : 'not on the pause button: ' + b.id; })()`);
  check('a control reached by the keyboard has a clear 2 px outline', focusRing === 'solid 2px', focusRing);
  const pressed = await js(`(() => { const b = document.getElementById('answerBtn'); return getComputedStyle(b).transform; })()`);
  check('a button\'s shape never changes: no transform at rest', pressed === 'none', pressed);
});

await group('fx: every animation that ran was a calm one', async () => {
  await open();
  const seen = new Map();
  const sample = async () => { for (const a of await js(ANIMS)) seen.set(a.name + '|' + a.target + '|' + a.id, a); };
  await sample();
  await tap('#answerBtn'); await tap('#t1'); await sample(); await tap('#viewBtn'); await sample(); await tap('#saveBtn'); await tap('#copyBtn'); await tap('#addBtn'); await tap('#toastBtn'); await sleep(120); await sample();
  await js(`document.getElementById('r1').scrollIntoView({ block: 'center' })`); await sleep(200); await sample();
  await js(`document.getElementById('yearCard').scrollIntoView({ block: 'center' })`); await tap('#yearBtn'); await sleep(300); await sample();
  check('there were animations to look at', seen.size >= 6, [...seen.keys()]);
  calm([...seen.values()], 'all');
});

await group('fx: still under "Always still": nothing moves, nothing waits', async () => {
  await open();
  await js(`document.documentElement.dataset.motion = 'reduce'; 0`); await sleep(200);
  same('the covers over sections that were waiting are gone', await js(`document.querySelectorAll('.fx-pending').length`), 0);
  await js(`window.__vt = 0; const real = document.startViewTransition; if (real) document.startViewTransition = function (...a) { window.__vt++; return real.apply(this, a); }; 0`);
  await tap('#answerBtn'); await tap('#t2'); await tap('#viewBtn'); await tap('#saveBtn'); await tap('#copyBtn'); await tap('#addBtn'); await tap('#toastBtn');
  await sleep(120);
  same('no animation is running anywhere', (await js(ANIMS)).filter(a => a.state === 'running').map(a => a.name || a.id), []);
  same('the browser\'s view transition was not even asked for', await js(`window.__vt`), 0);
  const g = await js(`(() => { const g = document.querySelector('.fx-glass').getBoundingClientRect(), t = document.getElementById('t2').getBoundingClientRect(); return Math.abs(g.left - t.left) < 1.5; })()`);
  check('the tab glass is already on the chosen tab', g);
  same('the tab and its panel changed at once', await js(`[document.getElementById('t2').getAttribute('aria-selected'), document.getElementById('panelText').textContent]`), ['true', 'Calendar panel.']);
  same('the toast is shown at once, fully', await js(`getComputedStyle(document.querySelector('.fx-toast')).opacity + '|' + getComputedStyle(document.querySelector('.fx-toast')).transform`), '1|none');
  same('copied and added still tell you, with no drawing', await js(`[document.getElementById('copyBtn').textContent.trim(), document.getElementById('addBtn').textContent.trim()]`), ['Copied', 'Added to your farm']);
  const sat = await js(`getComputedStyle(document.querySelector('.fx-sat')).animationName`);
  same('the satellite is parked, not moving', sat, 'none');
  await js(`document.getElementById('yearCard').scrollIntoView({ block: 'center' })`);
  const labels = [await text('#yearBtn')];
  for (let i = 0; i < 12; i++) { await tap('#yearBtn'); labels.push(await text('#yearBtn')); }
  same('Watch the year steps one month a press: "Next month" … "Finish", never playing by itself', [labels[0], labels[1], labels[12]], ['Next month', 'Next month', 'Finish']);
  same('twelve presses have passed twelve months, and nothing ran between presses', await js(`document.querySelectorAll('.fx-passed').length`), 12);
  await tap('#yearBtn'); same('the press after December finishes it', await text('#yearBtn'), 'Watch the year');
  await js(`window.scrollTo(0, 900)`); await sleep(300);
  check('the reading rail still tells you how far you have read, without any timed fade', await js(`document.getElementById('fx-rail').classList.contains('is-on') && getComputedStyle(document.getElementById('fx-rail')).transitionDuration === '0s'`));
  same('numbers are plain from the start when still (reload and look at once)', await (async () => { await js(`document.documentElement.dataset.motion = 'reduce'`); await go(PAGE); await js(`document.documentElement.dataset.motion = 'reduce'`); return js(`[...document.querySelectorAll('[data-roll]')].map(n => n.textContent)`); })(), ['12,480 mm', '86', '7.5%']);
});

await group('fx: still under the device\'s own reduce-motion choice', async () => {
  await size(1280); await device({ 'prefers-reduced-motion': 'reduce' });
  await go(PAGE); await until('window.ready === true', 10000); await sleep(200);
  same('no cover waits over any section', await js(`document.querySelectorAll('.fx-pending').length`), 0);
  await tap('#t1'); await tap('#viewBtn'); await tap('#toastBtn'); await sleep(150);
  same('no animation is running', (await js(ANIMS)).filter(a => a.state === 'running').map(a => a.name || a.id), []);
  same('numbers are plain', await js(`[...document.querySelectorAll('[data-roll]')].map(n => n.textContent)`), ['12,480 mm', '86', '7.5%']);
  same('the satellite is parked', await js(`getComputedStyle(document.querySelector('.fx-sat')).animationName`), 'none');
  same('and Watch the year says "Next month"', await text('#yearBtn'), 'Next month');
  await device();
});

await group('fx: no motion costs a tap more than 200 ms on a slowed phone', async () => {
  await open(375);
  await send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await sleep(300);
  const measure = async (sel, done, label) => {
    await js(`(() => { window.__t = null; document.addEventListener('pointerdown', () => { window.__t0 = performance.now(); }, { capture: true, once: true }); const watcher = new MutationObserver(() => { if (${done} && window.__t === null) { window.__t = performance.now() - window.__t0; } }); watcher.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true }); window.__stop = watcher; })()`);
    await tap(sel); await sleep(500);
    const ms = await js(`window.__stop.disconnect(); window.__t`);
    check(`${label}: the screen is updated after the press`, ms !== null, ms);
    if (busy) console.log(`not judged (busy, load ${os.loadavg()[0].toFixed(0)} on ${os.cpus().length} threads)  ${label}: within 200 ms of the press  (${ms})`);
    else check(`${label}: the screen is updated within 200 ms of the press, on a 6× slower processor`, ms !== null && ms <= 200, ms);
  };
  await measure('#t1', `document.getElementById('t1').getAttribute('aria-selected') === 'true' && document.getElementById('panelText').textContent === 'Weather panel.'`, 'a tab');
  await measure('#viewBtn', `!document.getElementById('viewB').hidden`, 'a view switch');
  await measure('#saveBtn', `document.getElementById('saveBtn').getAttribute('aria-pressed') === 'true'`, 'save');
  await measure('#answerBtn', `document.querySelector('.fx-scan-words').textContent.startsWith('1 of')`, 'the loader\'s progress');
  await measure('#toastBtn', `document.querySelectorAll('.fx-toast').length === 1`, 'the undo toast');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

for (const w of [1280, 375]) {
  await group(`fx: fits at ${w} px, every control 44 px`, async () => {
    await open(w);
    await flat(`fx ${w}`);
    const small = await js(`[...document.querySelectorAll('button, [role=tab]')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.id || b.textContent.trim())`);
    same(`fx ${w}: every button and tab is at least 44 px`, small, []);
    await shot(`fx-page-${w}.png`);
  });
}
await finish();
