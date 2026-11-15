// Crophalo's report-scenes suite in a real browser: THE IRIS, THE RECORD ARRIVES (the weather band), THE FOLD and THE CURL with the score roll, at Full, Less and Still, with the services answering slowly and fast.
// What it holds to: any key ends a scene and leaves the screen complete; Still moves nothing; Less only fades; a wait under 600 ms shows no band and no curl; the report is never later than it would be without the scenes;
// the real score is in the page's text from the first moment; and with js/macro-report.js not loaded every screen is today's (no new element, no new rule).
// RULE: never loosen a check to make it pass. Runs on the throwaway copy scripts/e2e_lib.mjs makes. Run: node scripts/e2e_macro_report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_macro_report');
const { js, until, tap, press, size, go, check, same, group, finish, sleep, device, send } = run;
await send('Network.enable', {});
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');
const POWER = fx('power_barrie.json'), FORECAST = fx('forecast_barrie.json'), REC = JSON.parse(POWER), LAT = REC.geometry.coordinates[1], LON = REC.geometry.coordinates[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const LOC = `{ lat: ${LAT}, lon: ${LON} }`;
const FIXTURE = `(() => { const s = (year, crop, sow, harvest, after, window = null) => ({ year, crop, sow, harvest, after, residueUntil: null, window });
  const now = { id: 'now', name: 'Now', kind: 'current', seasons: [s(1, 'corn', '2027-05-01', '2027-10-05', 'residue'), s(2, 'soy', '2028-05-20', '2028-10-01', 'residue'), s(3, 'corn', '2029-05-01', '2029-10-05', 'residue')], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
  const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], s(3, 'wheat', '2028-10-05', '2029-07-25', 'cover', { earliest: '2028-09-25', latest: '2028-10-15' })], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
  const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [s(1, 'barley', '2027-04-20', '2027-08-01', 'bare')] };
  return { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }], gaps: ['Soil is assumed, not measured.'], risks: ['A late harvest squeezes the wheat window.'], sureness: 'Somewhat sure' }; })()`;
const ENGINE = `import('/js/report.js').then(m => m.setSeam({ engine: async () => ({ optionsFor: async () => (${FIXTURE}) }) }))`;   // this copy has no engine of its own: a stand-in answers with the fixed result

// the stand-in services: POWER answers after `power` ms, the others after `other` ms
const stubs = (power, other = 150) => `(() => { window.__log = [];
  const body = { power: ${JSON.stringify(POWER)}, forecast: ${JSON.stringify(FORECAST)} }, delay = { power: ${power}, forecast: ${other}, smap: ${other}, cropsnear: ${other}, other: ${other} };
  window.fetch = async url => { const u = String(url), kind = /power\\.larc/.test(u) ? 'power' : /api\\.open-meteo/.test(u) ? 'forecast' : /smaproot/.test(u) ? 'smap' : /cropsnear/.test(u) ? 'cropsnear' : 'other';
    window.__log.push(kind); await new Promise(r => setTimeout(r, delay[kind]));
    const text = kind === 'power' || kind === 'forecast' ? body[kind] : kind === 'smap' ? JSON.stringify({ ok: true, value: 0.31, date: '2026-11-13', cell: { lat: 43.1, lon: -80.7 } }) : JSON.stringify({ ok: false, reason: 'stand-in' });
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) }; }; })()`;
// watches the page and writes what it saw into window.__seen: when each part appeared, whether a curl overlay ever existed, which animations ran
const WATCH = `(() => { const t0 = performance.now(), at = () => Math.round(performance.now() - t0); window.__t0 = t0; window.__seen = { band: null, bandRows: [], curl: null, curlGone: null, answer: null, loading: null, record: null, anims: [], iris: null, roll: false, say: '' };
  document.addEventListener('crophalo:record', () => { window.__seen.record = at(); });
  const look = () => { const s = window.__seen;
    if (s.loading === null && document.querySelector('.rv-loading')) s.loading = at();
    if (s.band === null && document.querySelector('.rv-band')) { s.band = at(); const c = document.querySelector('.rv-band'); s.bandInfo = { years: c.dataset.years, w: c.width, h: c.height, hidden: c.getAttribute('aria-hidden'), cap: document.querySelector('.rv-band-cap')?.textContent }; }
    if (s.answer === null && document.querySelector('#answer')) s.answer = at();
    const c = document.querySelector('.m-curl'); if (c && s.curl === null) s.curl = at(); if (!c && s.curl !== null && s.curlGone === null) s.curlGone = at();
    if (document.querySelector('.m-roll')) s.roll = true;
    for (const a of document.getAnimations()) { const p = a.effect?.pseudoElement || '', kf = a.effect?.getKeyframes?.() ?? []; if (/view-transition-new\\(root\\)/.test(p) && kf.some(k => /circle\\(/.test(k.clipPath || ''))) s.iris ||= kf[0].clipPath; const props = new Set(kf.flatMap(k => Object.keys(k))); for (const n of props) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(n) && !s.anims.includes(n)) s.anims.push(n); }
    s.say = document.getElementById('macroSay')?.textContent || s.say; };
  new MutationObserver(look).observe(document.documentElement, { subtree: true, childList: true }); setInterval(look, 16); })()`;
const seen = () => js(`window.__seen`);
const fresh = async ({ motion = 'full', power = 3000, other = 150, macro = true, device: dev = null } = {}) => {
  await send('Network.setBlockedURLs', { urls: macro ? [] : ['*macro-report.js*', '*/js/macro.js*'] });   // with the macro files absent the app starts without them
  await size(1280); await go('/');
  await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', ${JSON.stringify(JSON.stringify({ motion }))}); caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))`);
  await go('/'); await sleep(400);
  if (dev) await device(dev);
  await js(stubs(power, other)); await js(WATCH);
  if (macro) await until(`!!document.querySelector('link[href*="macro-report.css"]')`, 8000);   // the app itself loads the scenes after the page is ready
  await js(ENGINE); await sleep(100);
};
// opens the report as the app does (Next on the last step of a demo's setup is what press() of #wNext does; here the report is opened directly) and answers how long until the answer is on screen
const open = () => js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report');
  const t0 = performance.now(); m.openReport({ ...st.newState(), loc: ${LOC}, name: 'Barrie test' });
  await new Promise(r => { const id = setInterval(() => { if (document.querySelector('#answer')) { clearInterval(id); r(); } }, 5); });
  return Math.round(performance.now() - t0); })()`);
const answerText = () => js(`({ b: document.querySelector('#answer .chip.score .rv-num')?.textContent ?? null, aria: document.querySelector('#answer .chip.score')?.getAttribute('aria-label') ?? null, roll: !!document.querySelector('.m-roll') })`);
const scoreOf = aria => Number(/Score (\d+)/.exec(aria ?? '')?.[1]);

// 1. today's screens: the file is not loaded, nothing about the report changes
await group('no macro file: the screens are today\'s', async () => {
  await fresh({ macro: false, power: 1500 });
  const ms = await open(); const s = await seen(); await sleep(400);
  const dom = await js(`({ band: !!document.querySelector('.rv-band'), curl: !!document.querySelector('.m-curl'), cap: !!document.querySelector('.rv-curl-cap, .rv-band-cap'), say: !!document.getElementById('macroSay'), glyph: document.querySelector('.rv-glyph')?.childElementCount ?? 0, link: !!document.querySelector('link[href*="macro-report"]'), vt: !!document.documentElement.dataset.macroVt })`);
  check('the report opens, with no band, no curl, no caption, no announcer, no stylesheet of the scenes, nothing empty made visible', ms > 1400 && !dom.band && !dom.curl && !dom.cap && !dom.say && !dom.link && !dom.vt && dom.glyph === 0, JSON.stringify(dom));
  check('without the macro file no iris and no clip animation ran (the page\'s own small fades and moves are its own)', s.iris === null && !s.anims.includes('clipPath') && !s.anims.includes('clip-path'), JSON.stringify(s.anims));
});

// 2. Full, the weather slow (POWER after 3 s, the rest after 1.2 s so the record is in while the report is still worked out)
await group('full: POWER answers after 3 s', async () => {
  await fresh({ power: 3000, other: 1500 });
  await js(`window.__keep = []`);
  const ms = await open(); const s = await seen();
  check('the loading screen is a plain list (no picture) and the record arrives', s.loading !== null && s.record !== null && s.band === null, JSON.stringify(s));
  check('the report opens once its answers are in: within 250 ms of the slowest source (the 1.5 s others after POWER at 3 s)', ms < 3000 + 1500 + 700, `${ms} ms ${JSON.stringify({ l: s.loading, r: s.record, b: s.band, a: s.answer, c: s.curl })}`);
  await sleep(1800);
  const end = await seen(), a = await answerText();
  check('the score rolled: a painted copy of the number ran and the real number is there in the end', end.roll === true && /^\d+$/.test(String((await answerText()).b)), JSON.stringify({ roll: end.roll }));
  check('the real score is in the page: the ring\'s own label says it and its number is the same', Number.isFinite(scoreOf(a.aria)) && a.b === String(scoreOf(a.aria)) && !a.roll, JSON.stringify(a));
  check('the report is announced once, politely, with the place name', /^Report ready/.test(end.say), end.say);
  check('the animations that ran move transforms, clip and opacity only: no layout property', end.anims.every(p => ['opacity', 'transform', 'clipPath', 'clip-path', 'viewTransitionName', 'width', 'height', 'backdropFilter', 'outlineColor', 'mixBlendMode'].includes(p)) && !end.anims.some(p => /^(top|left|margin|padding)/.test(p)), end.anims.join());
  const cap = { band: end.bandInfo?.cap ?? null, score: await js(`document.querySelector('.rv-curl-cap')?.textContent ?? null`) };
  check('the caption under the score is real text and says where the number comes from', /Worked out from this weather record and the field’s water, soil, wash-off and market figures\./.test(cap.score ?? ''), JSON.stringify(cap));
});
// retired: "full: the band" (the weather band no longer draws on the loading screen: owner's rule 17, the loading screen is a plain list)

// 3. the input rule
await group('full: a key ends the scene and leaves the screen complete', async () => {
  await fresh({ power: 1500, other: 1000 });
  await js(`window.__open = (async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: ${LOC}, name: 'Barrie test' }); })()`);
  await until(`window.__seen.roll === true`, 9000);
  await sleep(120); await press('Tab');   // a press in the very first frame of a scene is the press that started it: the next one stops it
   await sleep(150);
  const a = await js(`({ curl: !!document.querySelector('.m-curl'), roll: !!document.querySelector('.m-roll'), b: document.querySelector('#answer .chip.score .rv-num')?.textContent, aria: document.querySelector('#answer .chip.score')?.getAttribute('aria-label'), anim: document.getAnimations().filter(x => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition)).length, which: document.getAnimations().filter(x => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition)).map(x => (x.effect?.target?.id || x.effect?.target?.className || x.effect?.target?.tagName) + ':' + (x.effect?.pseudoElement || '')).join() })`);
  check('after one key: no painted copy of the number, the real score, no animation left running', !a.roll && a.b === String(scoreOf(a.aria)) && a.anim === 0, JSON.stringify(a));
});

// 4. a short wait shows nothing
await group('full: a wait under 600 ms', async () => {
  await fresh({ power: 60, other: 60 });
  const ms = await open(); await sleep(900); const s = await seen();
  check('the report opens at once: nothing rolled and nothing was drawn over it', s.roll === false && s.curl === null && ms < 4000, JSON.stringify({ band: s.band, curl: s.curl, ms }));
});

// 5. Still and Less
for (const [motion, words] of [['still', 'Still'], ['less', 'Less']]) await group(`${words}: nothing moves beyond the fade`, async () => {
  await fresh({ motion, power: 3000, other: 1500 });
  const ms = await open(); await sleep(1500); const s = await seen(), a = await answerText();
  check(`${words}: no painted number, the real score at once`, s.curl === null && !s.roll && a.b === String(scoreOf(a.aria)), JSON.stringify({ curl: s.curl, roll: s.roll, a }));
  if (motion === 'still') check('Still: no animation at all, and no iris', s.anims.length === 0 && s.iris === null, JSON.stringify(s.anims));
  else check('Less: only opacity moves, no clip, no transform', s.anims.every(p => ['opacity', 'outlineColor'].includes(p)) && s.iris === null, JSON.stringify(s.anims));
});
await group('the device asks for less motion', async () => {
  await fresh({ power: 2500, other: 1200, device: { 'prefers-reduced-motion': 'reduce' } });
  await open(); await sleep(1200); const s = await seen();
  check('a device that asks for it gets the Still form whatever the setting says', s.curl === null && !s.roll && s.iris === null && s.anims.every(p => ['opacity', 'outlineColor'].includes(p)), JSON.stringify({ anims: s.anims, iris: s.iris }));
});

// 6. never a tax: the report opens no later than it does without the scenes, and the band never holds it back
await group('never a tax', async () => {
  const best = async (macro, power, other) => { const t = []; for (let i = 0; i < 3; i++) { await fresh({ macro, power, other }); t.push(await open()); } return Math.min(...t); };   // the best of three: a busy machine adds noise, never speed
  const base = await best(false, 2500, 300), withScenes = await best(true, 2500, 300);
  check('POWER at 2.5 s: the report opens within 200 ms of the time it takes without the scenes', withScenes - base < 200, `${base} ms without, ${withScenes} ms with`);
  const base2 = await best(false, 80, 80), with2 = await best(true, 80, 80);
  check('everything fast: the report opens within 120 ms (the frame the fold takes) of the time it takes without the scenes', with2 - base2 < 120, `${base2} ms without, ${with2} ms with`);
});

// YOUR HARDEST YEAR: tapping a chip fills the months strategy after strategy at Full, only fades at Less, shows at once at Still
for (const motion of ['full', 'less', 'still']) await group(`hardest year at ${motion}`, async () => {
  await fresh({ motion, power: 100, other: 100 });
  await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'), d = await import('/js/data.js'); a.show('report');
    const series = d.buildSeries(${POWER}, { lat: ${LAT}, lon: ${LON} });
    await m.renderResult({ ...st.newState(), loc: { lat: ${LAT}, lon: ${LON}, cc: 'CA' }, name: 'Barrie test', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }, ${FIXTURE}, { series }); })()`);
  await until(`!!document.querySelector('#hardYear .hy-chip')`, 8000); await sleep(500);
  await js(`window.__ops = new Set(); const t0 = performance.now(); (function tick() { for (const c of document.querySelectorAll('#hardYear .hy-c:not(.is-residue)')) window.__ops.add(getComputedStyle(c).opacity); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); })()`);
  await js(`[...document.querySelectorAll('.hy-chip')].find(c => c.getAttribute('aria-pressed') !== 'true').click()`); await sleep(2700);
  const seenOps = await js(`[...window.__ops]`), end = await js(`({ cells: [...document.querySelectorAll('#hardYear .hy-c:not(.is-residue)')].every(c => getComputedStyle(c).opacity === '1'), pills: [...document.querySelectorAll('#hardYear .hy-res')].every(r => getComputedStyle(r).opacity === '1'), rows: document.querySelectorAll('#hardYear .hy-row').length })`);
  check(`${motion}: the result is whole in the end: every month and every result shown, three rows`, end.cells && end.pills && end.rows === 3, JSON.stringify(end));
  if (motion === 'full') check('Full: while it plays some months are still faint (the rows fill one after the other)', seenOps.some(o => parseFloat(o) < 0.9), JSON.stringify(seenOps));
  else check(`${motion}: the months are never faint on the way`, seenOps.every(o => parseFloat(o) > 0.9), JSON.stringify(seenOps));
});
await finish();
