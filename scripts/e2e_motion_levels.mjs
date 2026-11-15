// The browser suite for the three motion levels (Settings > Motion: Full, Less, Still = html[data-motion] '', 'less', 'reduce'), on the fx and fx-halo demo pages: every control is used at each level and every running animation and transition is sampled.
// Full must run the scan, the glass, the arcs and the rolling numbers; Less only fades and colour changes of 200 ms or less, nothing that loops, slides, draws or rolls; Still nothing at all.
// RULE: never loosen a check here without a written reason. Run: node scripts/e2e_motion_levels.mjs
import { openRun } from './e2e_lib.mjs';

const run = await openRun('motion_levels');
const { js, until, size, go, check, group, finish, sleep, send } = run;
const LESS_OK = new Set(['opacity', 'color', 'background-color', 'background', 'border-color', 'outline-color', 'fill', 'stroke', 'filter', 'box-shadow', 'text-decoration-color']);   // colour, opacity and the press / focus states
const LESS_MS = 200;

const SAMPLER = `(() => {
  const seen = new Map(), M = window.__motion = { seen, rolled: false, first: {} };
  const props = a => { try { const k = a.effect?.getKeyframes?.() || []; return [...new Set(k.flatMap(f => Object.keys(f).filter(n => !['offset', 'easing', 'composite', 'computedOffset'].includes(n))))]; } catch { return []; } };
  const kebab = n => n.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  setInterval(() => { for (const a of document.getAnimations()) {
      const t = a.effect?.getComputedTiming?.() || {}, kind = a.constructor.name, name = a.transitionProperty || a.animationName || 'script', p = a.transitionProperty ? [a.transitionProperty] : props(a).map(kebab);
      const key = kind + ':' + name + ':' + t.duration + ':' + t.iterations + ':' + p.join(',');
      if (!seen.has(key)) seen.set(key, { kind, name, ms: t.duration + (t.delay || 0), loops: t.iterations === Infinity || t.iterations > 1, props: p }); } }, 20);
})()`;
let injected = null;
async function openAt(level, page) {
  if (injected) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
  injected = (await send('Page.addScriptToEvaluateOnNewDocument', { source: (level === 'full' ? '' : `new MutationObserver((m, o) => { if (document.documentElement) { document.documentElement.dataset.motion = '${level === 'less' ? 'less' : 'reduce'}'; o.disconnect(); } }).observe(document, { childList: true });`) + SAMPLER })).identifier;
  await size(1280); await go(page); await until('window.ready === true', 20000);
}
const click = sel => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const report = () => js(`[...window.__motion.seen.values()]`);
const finishRolled = n => js(`['n1','n2','n3'].every(id => /^[0-9.,]+/.test(document.getElementById(id).textContent))`);

async function useFxDemo() {
  await sleep(300);
  await click('#answerBtn'); await sleep(150); await click('#answerBtn'); await sleep(150);
  await click('#t1'); await sleep(250); await click('#t2'); await sleep(250);
  await click('#viewBtn'); await sleep(300); await click('#viewBtn'); await sleep(300);
  await click('#saveBtn'); await sleep(200); await click('#copyBtn'); await sleep(250); await click('#addBtn'); await sleep(250);
  await click('#toastBtn'); await sleep(300); await click('#toastBtn'); await sleep(300);
  await click('#yearBtn'); await sleep(600);
  await js(`scrollTo(0, document.body.scrollHeight * 0.6)`); await sleep(900);
  await js(`window.year?.stop?.()`).catch(() => {});
}
async function useHaloDemo() {
  await sleep(500);
  await click('#showCur'); await sleep(300); await click('#showProp'); await sleep(500);
  await click('#buildBtn'); await sleep(900);
  await click('#rerankBtn'); await sleep(300); await click('#reorderBtn'); await sleep(300); await click('#addBtn'); await sleep(400);
  await js(`document.querySelector('#opts .opt')?.click()`); await sleep(500);
  await click('#antsBtn'); await sleep(600);
}
const summary = list => list.map(a => `${a.kind}:${a.name}(${a.props.join('+') || '-'}) ${Math.round(a.ms)}ms${a.loops ? ' loops' : ''}`);

const results = {};
for (const level of ['full', 'less', 'still']) {
  await group(`motion level ${level}`, async () => {
    const all = [];
    await openAt(level, '/design/fx-demo.html');
    const numbersAtOnce = await js(`['n1', 'n2', 'n3'].map(id => document.getElementById(id).textContent)`);
    await useFxDemo(); all.push(...await report());
    await openAt(level, '/design/fx-halo-demo.html');
    await useHaloDemo(); all.push(...await report());
    const distinct = [...new Map(all.filter(a => a.ms > 1).map(a => [`${a.kind}:${a.name}:${a.ms}:${a.props.join()}`, a])).values()];   // an animation of 0.001 ms is the finished state, not motion
    results[level] = distinct;
    console.log(`${level}: ${distinct.length} different animations and transitions ran`, level === 'full' ? '' : JSON.stringify(summary(distinct)));
    if (level === 'full') {
      check('Full: the scan loops (the satellite crossing the picture)', distinct.some(a => a.loops && /fx-pass/.test(a.name)), summary(distinct));
      check('Full: things slide (the glass, the toast, the new view): transform animates', distinct.some(a => a.props.includes('transform')), summary(distinct));
      check('Full: the arcs draw themselves (dash offset or dash length animates)', distinct.some(a => a.props.some(p => /stroke-dash/.test(p))), summary(distinct));
      check('Full: the answer steps open by a wipe (clip-path)', distinct.some(a => a.props.includes('clip-path')), summary(distinct));
    } else {
      const bad = distinct.filter(a => a.loops || a.ms > LESS_MS || a.props.some(p => !LESS_OK.has(p)) || (a.props.length === 0 && a.kind !== 'CSSTransition'));
      if (level === 'less') {
        check(`Less: only fades and colour changes of ${LESS_MS} ms or less ran: nothing loops, slides, draws or sweeps`, bad.length === 0, summary(bad));
        check('Less: it still fades something (it is not the same as Still)', distinct.some(a => a.props.includes('opacity') || a.props.some(p => /color|fill|stroke$/.test(p))), summary(distinct));
      } else {
        check('Still: nothing ran at all, in any control of either page', distinct.length === 0, summary(distinct));
      }
    }
  });
}
await group('motion level: numbers and the year', async () => {
  for (const level of ['full', 'less', 'still']) {
    await openAt(level, '/design/fx-demo.html');
    await js(`window.__samples = []; const t0 = performance.now(); const id = setInterval(() => { window.__samples.push(['n1','n2','n3'].map(i => document.getElementById(i).textContent).join('|')); if (performance.now() - t0 > 1500) clearInterval(id); }, 40); document.getElementById('n1').scrollIntoView(); 0`);
    await sleep(1800);
    const distinct = (await js(`[...new Set(window.__samples)]`)).length;
    if (level === 'full') check('Full: the numbers roll (the text changes on its way to the final figure)', distinct > 2, distinct);
    else check(`${level === 'less' ? 'Less' : 'Still'}: the numbers show their final figure at once (the text never changes)`, distinct === 1, distinct);
    if (level !== 'full') {
      await js(`document.getElementById('yearBtn').click()`); await sleep(300);
      const after = await js(`[document.getElementById('yearBtn').textContent, document.querySelectorAll('.fx-passed').length]`);
      check(`${level === 'less' ? 'Less' : 'Still'}: "Watch the year" goes one month at a press, it is not a 9 s run`, /Next month/.test(after[0]) && after[1] <= 1, after);
    }
  }
});
await finish();
