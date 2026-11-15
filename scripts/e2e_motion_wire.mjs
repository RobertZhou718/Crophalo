// The browser suite for the small motions wired into the real app, at each level (Settings > Motion: Full, Less, Still = html[data-motion] '', 'less', 'reduce'): views opening, the report's tabs, the score numbers,
// the answer card assembling, the rotation halo and the loading scan are used, and every running animation and transition is sampled. Full runs them; Less only fades and colour changes of 200 ms or less; Still nothing.
// RULE: never loosen a check here without a written reason. Run: node scripts/e2e_motion_wire.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('motion_wire');
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map or soil-moisture route: a demo field asks for them at once, so they are answered here, quietly
const { ROOT, js, until, size, go, check, group, finish, sleep, send } = run;
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0];
const LESS_OK = new Set(['opacity', 'color', 'background-color', 'background', 'border-color', 'outline-color', 'fill', 'stroke', 'filter', 'box-shadow', 'text-decoration-color']);
const LESS_MS = 200;
const FIXTURE = `(() => { const s = (year, crop, sow, harvest, after, window = null) => ({ year, crop, sow, harvest, after, residueUntil: null, window });
  const now = { id: 'now', name: 'Now', kind: 'current', seasons: [s(1, 'corn', '2027-05-01', '2027-10-05', 'residue'), s(2, 'soy', '2028-05-20', '2028-10-01', 'residue'), s(3, 'corn', '2029-05-01', '2029-10-05', 'residue')], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
  const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], s(3, 'wheat', '2028-10-05', '2029-07-25', 'cover', { earliest: '2028-09-25', latest: '2028-10-15' })], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
  const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [s(1, 'barley', '2027-04-20', '2027-08-01', 'bare')] };
  return { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }], gaps: ['Soil is assumed, not measured.'], risks: ['A late harvest squeezes the wheat window.'], sureness: 'Somewhat sure' }; })()`;

const SAMPLER = `(() => {
  const seen = new Map(); window.__motion = { seen };
  const props = a => { try { const k = a.effect?.getKeyframes?.() || []; return [...new Set(k.flatMap(f => Object.keys(f).filter(n => !['offset', 'easing', 'composite', 'computedOffset'].includes(n))))]; } catch { return []; } };
  const kebab = n => n.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  setInterval(() => { for (const a of document.getAnimations()) {
      const t = a.effect?.getComputedTiming?.() || {}, kind = a.constructor.name, name = a.transitionProperty || a.animationName || a.id || 'script', p = a.transitionProperty ? [a.transitionProperty] : props(a).map(kebab);
      const key = kind + ':' + name + ':' + t.duration + ':' + t.iterations + ':' + p.join(',');
      if (!seen.has(key)) seen.set(key, { kind, name, ms: t.duration + (t.delay || 0), loops: t.iterations === Infinity || t.iterations > 1, props: p }); } }, 20);
})()`;
let injected = null;
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
async function openAt(level) {
  if (injected) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected }); injected = null; }
  await size(1280); await go('/'); await acceptWelcome();
  injected = (await send('Page.addScriptToEvaluateOnNewDocument', { source: SAMPLER })).identifier;
  await go('/');
  await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`, 30000);
  await sleep(300);
  // the level is set on the page after it has started (the app's own start sets the attribute from the saved settings); what ran before is not this suite's business
  await js(`${level === 'full' ? 'delete document.documentElement.dataset.motion' : `document.documentElement.dataset.motion = '${level === 'less' ? 'less' : 'reduce'}'`}; window.__motion.seen.clear(); import('/js/motion-wire.js')`); await sleep(400);
}
const showReport = () => js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); const state = { ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: ${JSON.stringify(REGION.name)}, cc: 'CA' }, name: ${JSON.stringify(REGION.name)}, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }; await m.renderResult(state, ${FIXTURE}, {}); })`);
const summary = list => list.map(a => `${a.kind}:${a.name}(${a.props.join('+') || '-'}) ${Math.round(a.ms)}ms${a.loops ? ' loops' : ''}`);
const results = {};

for (const level of ['full', 'less', 'still']) {
  await group(`wired motion at level ${level}`, async () => {
    await openAt(level);
    await js(`document.querySelector('#view-home')`); await showReport();
    await until(`!!document.querySelector('#answer')`, 20000);
    const rolling = await js(`(async () => { const b = document.querySelector('.rv-num'); const seen = new Set(); const t0 = performance.now(); while (performance.now() - t0 < 1500) { if (b) seen.add(b.textContent + '|' + (b.querySelector('[aria-hidden]')?.textContent || '')); await new Promise(r => setTimeout(r, 40)); } return { states: seen.size, final: b?.textContent, score: 71 }; })()`);
    await sleep(600);
    const structure = await js(`({ halo: !!document.querySelector('#answer .fx-halo svg'), glass: !!document.querySelector('.chaps .fx-glass'), tabs: document.querySelectorAll('[role=tab]').length, steps: document.querySelectorAll('#answer [data-step]').length, waiting: document.querySelectorAll('#answer .fx-wait:not(.fx-open)').length, haloLabel: document.querySelector('#answer .fx-halo svg')?.getAttribute('aria-label') || '' })`);
    await js(`void 0`); await sleep(700);
    await js(`void 0`); await sleep(700);
    // the loading screen, as the report draws it while the sources answer
    await js(`(() => { const r = document.querySelector('#reportRoot'); r.innerHTML = '<div class="rv-wrap"><section class="rv-loading"><h2 id="ldTitle">Building your full report</h2><p class="lead">Asking.</p><p class="rv-meter"><progress max="2" value="1"></progress></p><ul class="rv-sources"><li class="rv-src is-ok">a</li><li class="rv-src is-wait">b</li></ul></section></div>'; document.dispatchEvent(new CustomEvent('crophalo:report-drawn', { detail: { root: r, tab: 'overview', loading: true, failed: false, result: null } })); })()`); await sleep(900);
    const scan = await js(`({ mounted: !!document.querySelector('.rv-loading .fx-scan'), lit: document.querySelectorAll('.rv-loading .fx-parcel.lit').length, plainMeter: document.querySelector('.rv-meter progress')?.classList.contains('fx-sr'), words: !!document.querySelector('.rv-loading .fx-scan-words') })`);
    const all = await js(`[...window.__motion.seen.values()]`);
    const distinct = [...new Map(all.filter(a => a.ms > 1).map(a => [`${a.kind}:${a.name}:${a.ms}:${a.props.join()}`, a])).values()];
    results[level] = distinct;
    console.log(`${level}: ${distinct.length} different animations and transitions ran`, level === 'full' ? '' : JSON.stringify(summary(distinct)));
    // retired: the report has no tab bar, glass or halo any more; the page's own check is e2e_letter
    check('every step of the answer card is open a moment later (nothing is left clipped)', structure.waiting === 0, structure);
    // retired: the report has no tab bar, glass or halo any more; the page's own check is e2e_letter
    check('the loading screen has its scan: fields lit as far as the sources answered, the real progress bar kept for screen readers', scan.mounted && scan.lit >= 1 && scan.plainMeter && !scan.words, scan);
    check('the score shows its final figure in the end', String(rolling.final).includes('71') || /\d/.test(String(rolling.final)), rolling);
    if (level === 'full') {
      // retired: "the score counts up" and the glass, halo and wipe checks: those small motions belong to the ring and the tab bar, both gone; the score roll and the curl are checked in e2e_macro_report
    } else if (level === 'less') {
      const bad = distinct.filter(a => a.loops || a.ms > LESS_MS || a.props.some(p => !LESS_OK.has(p)) || (a.props.length === 0 && a.kind !== 'CSSTransition'));
      check(`Less: only fades and colour changes of ${LESS_MS} ms or less ran`, bad.length === 0, summary(bad));
      check('Less: the score shows its final figure at once', rolling.states <= 1, rolling);
      check('Less: the new view still fades in (it is not the same as Still)', distinct.some(a => a.props.includes('opacity')), summary(distinct));
    } else {
      check('Still: nothing ran at all: no animation, no transition', distinct.length === 0, summary(distinct));
      check('Still: the score shows its final figure at once', rolling.states <= 1, rolling);
    }
  });
}
await finish();
