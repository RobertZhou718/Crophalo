// NOT YET RUN: the browser suite of the big animations' groundwork, written and never started. Run it only through the shared browser lock: node scripts/e2e_macro.mjs
// It proves the shared groups on the app as it is: with js/macro.js blocked every screen is today's; with no scene module, start() changes nothing; Less is on the page before its
// first paint; one level everywhere; input wins, Pause and Skip, Less fades only, Still moves nothing, the chain, long frames, flashing, 320 px and one sentence a screen change.
import { openRun } from './e2e_lib.mjs';
import { atLevel, inputAt, assertComplete, assertNoLongFrames, captureFrames, flashOf, fit320, chainMs, blockMacro } from './macro_harness.mjs';

const run = await openRun('macro');
const { js, go, size, until, sleep, check, same, group, finish, send, press, asked } = run;
const CORE = `import('/js/macro-core.js')`;
const SCREENS = [['home', "show('home')"], ['setup', "show('setup')"], ['report', "show('report')"], ['farm', "show('farm')"], ['data', "location.hash = '#data'"], ['privacy', "location.hash = '#privacy'"], ['limits', "location.hash = '#limits'"], ['settings', "location.hash = '#settings'"]];
const open = async how => { await js(`(async () => { const { show } = await import('/js/app.js'); ${how}; return true; })()`); await sleep(400); };
const tour = async () => { const out = {}; for (const [name, how] of SCREENS) { await open(how); out[name] = await assertComplete(run); } return out; };
const ANIMS = `document.getAnimations().map(a => { const t = a.effect?.getTiming?.() || {}, kf = a.effect?.getKeyframes?.() || []; return { id: a.id || a.animationName || '', duration: Number(t.duration) || 0, props: [...new Set(kf.flatMap(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))] }; })`;
// a test scene laid in the page: the conductor's own rules, without any package's scene
const lay = (name, extra = '') => js(`(async () => { const c = await ${CORE}; const host = document.createElement('div'); host.id = 'macroTestHost'; host.textContent = 'test scene'; document.body.append(host);
  const bar = document.createElement('div'); bar.id = 'macroTestBar'; document.body.append(bar); c.chain(c.SCENES[${JSON.stringify(name)}].screen).start();
  window.__ended = 0; window.__s = c.scene({ name: ${JSON.stringify(name)}, host, paint(k) { host.dataset.k = String(k); host.style.opacity = String(0.5 + k / 2); }, end() { window.__ended++; host.style.opacity = '1'; }, controls: { host: bar, words: { pause: 'Pause', play: 'Play', skip: 'Skip' } }, steps: { count: 3, at(i) { host.dataset.step = String(i); } } ${extra} });
  window.__s.play(); return c.running(); })()`);

await group('blocked: with js/macro.js blocked every screen is today\'s', async () => {
  await blockMacro(run, true); await go('/');
  const blocked = await tour();
  await blockMacro(run, false); await go('/'); await sleep(2500);   // long enough for start() to have run, when the app loads it
  const open2 = await tour();
  for (const [name] of SCREENS) same(`${name}: words, controls and figures are the same with js/macro.js blocked`, open2[name], blocked[name]);
  same('with no scene module in the folder, css/macro.css is never fetched', asked.filter(u => /\/css\/macro/.test(u)), []);
});

await group('start(): with no scene module it changes nothing', async () => {
  await go('/'); const before = await tour();
  const out = await js(`(async () => (await import('/js/macro.js')).start())()`);
  same('nothing was loaded', out.loaded, []);
  const after = await tour();
  for (const [name] of SCREENS) same(`${name}: the same after start()`, after[name], before[name]);
  same('no stylesheet of the big animations is on the page', await js(`document.querySelectorAll('link[href*="macro"]').length`), 0);
  same('no animation of the big animations is running', await js(`(async () => (await ${CORE}).running())()`), []);
});

await group('Less is on the page before its first paint', async () => {
  await go('/'); await atLevel(run, 'less', { keep: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `requestAnimationFrame(() => { window.__firstFrameMotion = document.documentElement.dataset.motion || ''; });` });
  await go('/');
  const three = await js(`(async () => (await import('/js/settings.js')).SETTING_CHOICES.motion.includes('less'))()`);
  if (three) same('the first frame already has data-motion="less" (the pre-paint script)', await js('window.__firstFrameMotion'), 'less');
  else check('this copy has no Less setting yet: the pre-paint hook comes with Full, Less and Still', true);
  await atLevel(run, 'still', { keep: true }); await go('/');
  same('the first frame of Still has data-motion="reduce"', await js('window.__firstFrameMotion'), 'reduce');
});

await group('one level everywhere', async () => {
  for (const lvl of ['full', 'less', 'still', 'device']) {
    await go('/'); await atLevel(run, lvl);
    const r = await js(`(async () => { const c = await ${CORE}, fx = await import('/js/fx.js'), m = await import('/js/motion.js'); return [c.level(), fx.level(), m.motionOff(), m.motionQuiet()]; })()`);
    const want = lvl === 'device' ? 'still' : lvl;
    same(`${lvl}: the conductor, fx.js and motion.js agree`, r, [want, want, want === 'still', want !== 'full']);
  }
});

await group('input wins: a key, a click and a wheel at 10 %, 50 % and 90 %', async () => {
  for (const kind of ['key', 'click', 'wheel']) for (const at of [0.1, 0.5, 0.9]) {
    await go('/'); await atLevel(run, 'full');
    await lay('three-futures');
    const r = await inputAt(run, 'three-futures', at, kind);
    same(`${kind} at ${at * 100} %: within one frame nothing runs`, [r.before, r.after], [['three-futures'], []]);
    same(`${kind} at ${at * 100} %: the scene drew its end state once`, await js('window.__ended'), 1);
    check(`${kind} at ${at * 100} %: the input did what it does anyway (it was not prevented)`, r.acted);
  }
});

await group('Pause and Skip: over 5 s, 44 px, by Tab, Space and Enter', async () => {
  await go('/'); await atLevel(run, 'full'); await lay('record-film');
  const sizes = await js(`[...document.querySelectorAll('#macroTestBar button')].map(b => { const r = b.getBoundingClientRect(); return [b.textContent, Math.round(r.width) >= 44 && Math.round(r.height) >= 44]; })`);
  same('Pause and Skip, each at least 44 px', sizes, [['Pause', true], ['Skip', true]]);
  let reached = false; for (let i = 0; i < 60 && !reached; i++) { await press('Tab'); reached = await js(`document.activeElement?.textContent === 'Pause' && !!document.activeElement.closest('#macroTestBar')`); }
  check('Pause is reached by Tab (and Tab does not stop the film)', reached && (await js(`(async () => (await ${CORE}).running())()`)).includes('record-film'));
  await press(' '); await sleep(100);
  const k1 = await js(`document.getElementById('macroTestHost').dataset.k`); await sleep(1000); const k2 = await js(`document.getElementById('macroTestHost').dataset.k`);
  same('Space pauses: the frame a second later is the same', k1, k2);
  await press('Tab'); await press('Enter'); await sleep(200);
  same('Enter on Skip leaves the finished state, and the bar goes', [await js(`(async () => (await ${CORE}).running())()`), await js('window.__ended'), await js(`document.querySelectorAll('#macroTestBar button').length`)], [[], 1, 0]);
});

await group('Less: only fades of 200 ms or less', async () => {
  await go('/'); await atLevel(run, 'less');
  await lay('rings');
  const anims = await js(ANIMS);
  check('every animation lasts 200 ms or less and moves only opacity', anims.length >= 1 && anims.every(a => a.duration <= 200 && a.props.every(p => p === 'opacity')), anims);
  same('the end state is drawn at once', await js('window.__ended'), 1);
  await lay('record-film');
  same('a film becomes Step through', await js(`[...document.querySelectorAll('#macroTestBar button')].map(b => b.textContent)`), ['Step through']);
});

await group('Still and the device setting: nothing moves', async () => {
  for (const lvl of ['still', 'device']) {
    await go('/'); await atLevel(run, lvl);
    const r = await assertNoLongFrames(run, { label: `${lvl}`, during: async () => { await lay('rings'); await sleep(600); } });
    same(`${lvl}: no frame asked for by the conductor`, r.rafCalls, 0);
    same(`${lvl}: no animation`, (await js(ANIMS)).length, 0);
    same(`${lvl}: the end state is there`, await js('window.__ended'), 1);
  }
});

await group('the chain: auto motion ends within 4.8 s of each screen change', async () => {
  for (const lvl of ['full', 'less', 'still']) {
    await go('/'); await atLevel(run, lvl);
    for (const [name, how] of SCREENS) {
      const r = await chainMs(run, () => open(how), { ms: 5200 });
      check(`${lvl}: ${name}: the chain is 4.8 s or less`, r.ms <= 4800, r);
    }
  }
});

await group('no long frames and no flashing during a scene', async () => {
  await go('/'); await size(1440); await atLevel(run, 'full');
  await assertNoLongFrames(run, { label: 'a test scene at 1440 px', wide: 1440, during: async () => { await lay('rings'); await sleep(1500); } });
  await go('/'); await lay('rings');
  const frames = await captureFrames(run, 1500), f = flashOf(frames);
  check('the flash check over the scene: no block has two pairs of opposing changes in a second (and the pictures came close enough to judge)', !f.fail && f.judged && frames.length >= 8, { pairs: f.pairs, frames: frames.length, judged: f.judged, reason: f.reason });
});

await group('fit: 320 px with the largest text', async () => {
  for (const [name, how] of SCREENS) { await go('/'); await open(how); await fit320(run, name); }
  await go('/'); await atLevel(run, 'full'); await size(320); await lay('record-film'); await run.flat('a film with its play bar at 320 px');
});

await group('one polite sentence per screen change', async () => {
  await go('/');
  const r = await js(`(async () => { const c = await ${CORE}, { hooks } = await import('/js/hooks.js'); hooks.view(() => {}, { to: 'report' });   // one screen change, counted by the hooks
    const said = [c.say('Report ready.'), c.say('A second sentence.')]; await new Promise(done => setTimeout(done, 50));   // a region laid just now is filled on the next tick
    return [...said, document.querySelectorAll('#macroSay').length, document.getElementById('macroSay')?.textContent]; })()`);
  same('the first is said, the second is not, in one status region', r, [true, false, 1, 'Report ready.']);
});

await finish();
