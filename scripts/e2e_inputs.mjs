// Crophalo's step-4 suite in a real browser: "What do you want most?" with its goals and the folded "What limits you": the demo's answers chosen, each choice saved and
// said in one line, the fold kept open, focus kept on the control, keys, 44 px, no sideways scroll at 320 and 1280 with the largest text, Full, Less and Still, and axe.
// RULE: never loosen a check to make it pass; a failure is a step a farmer would find confusing. Run: node scripts/e2e_inputs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_inputs');
const { ROOT, js, until, tap, press, size, go, check, same, group, finish, sleep } = run;
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
// every outside lookup answers "not read" at once, so the step never waits on the network
const STUB = `window.fetch = (f => async (url, ...rest) => /\\/api\\//.test(url) ? ({ ok: true, json: async () => ({ ok: false }) }) : f(url, ...rest))(window.fetch);`;
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
const kept = () => js(`JSON.parse(sessionStorage.getItem('crophalo.session')).state`);
const heading = () => js(`document.querySelector('#wHeading')?.textContent`);
const live = () => js(`document.querySelector('#view-setup > [role=status]')?.textContent ?? ''`);
const focused = () => js(`(() => { const a = document.activeElement; return a ? (a.id ? '#' + a.id : a.name ? a.name + '=' + a.value : a.dataset.till ? 'till=' + a.dataset.till : a.tagName) : ''; })()`);
async function step4(width = 1280, big = false) {
  await size(width); await go('/');
  await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); ${big ? `localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: 'xlarge' }));` : ''}`);
  await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`);
  await tap('#homeRegions .cover'); await until(`!document.querySelector('#view-setup').hidden`);
  for (let i = 0; i < 3; i++) { await js(`document.querySelector('#wNext').click()`); await sleep(150); }
  await until(`document.querySelector('#wHeading')?.textContent === 'What do you want most?'`);
}
const openFold = async () => { if (!await js(`document.querySelector('#foldMore').open`)) await js(`document.querySelector('#foldMore summary').click()`); await sleep(120); };

await group('answers', async () => {
  await step4();
  const s = await kept();
  same('demo: the demo field\'s answers are chosen and nothing new is', [s.prioPreset, s.goals, s.limits, !!s.farm.irrigation], ['balanced', [], { noDrill: false, sell: [] }, true]);
  check('one line says what the chosen picture changes', /In the comparison: all five parts count the same/.test(await js(`document.querySelector('#mattersDoes').textContent`)));
  await tap('label:has(input[name=matters][value=moisture])'); await sleep(150);
  same('one tap on a picture sets its weights, and its line follows', [(await kept()).prio, await js(`document.querySelector('#mattersDoes').textContent`)], [[5, 3, 2, 2, 4], 'In the comparison: water fit counts most, then weather safety.']);
  await tap('label:has(input[name=goal][value=nitrogen])'); await sleep(150);
  same('"Less fertiliser to buy" is kept and moves soil health one step', [(await kept()).goals, (await kept()).prio], [['nitrogen'], [5, 4, 2, 2, 4]]);
  check('focus stays on the goal that was tapped', (await focused()) === 'goal=nitrogen', await focused());
  await tap('label:has(input[name=goal][value=forage])'); await sleep(150);
  check('"Feed for my animals" also keeps "I keep animals" for the other screens', (await kept()).farm.livestock === true);
  check('the limits are folded away at first', !await js(`document.querySelector('#foldMore').open`));
  await openFold();
  // the setup was shortened: the water answer stays on step 3 only, so step 4 neither asks nor shows it
  check('the water is not asked or shown again on step 4', await js(`!document.querySelector('#inWater') && !document.querySelector('input[name=water]')`));
  await tap('label:has(input[name=limit][value=noDrill])'); await sleep(150);
  check('no small-seed drill: kept, cover crops off, and the fold stays open', await js(`document.querySelector('#foldMore').open`) && (await kept()).limits.noDrill === true && (await kept()).farm.coverOK === false);
  check('focus stays on the switch', (await focused()) === 'limit=noDrill', await focused());
  check('the summary line names it', /no small-seed drill/.test(await js(`document.querySelector('#takenAs').textContent`)));
  await tap('label:has(input[name=sell][value=grain])'); await sleep(150);
  same('a market is kept', (await kept()).limits.sell, ['grain']);
  await js(`(() => { const s = document.querySelector('#avoidAdd'); s.value = 'rye'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
  check('a crop I will not grow: kept, shown as a chip, focus back on the list, and said', (await kept()).avoid.includes('rye') && await js(`!!document.querySelector('[data-unavoid=rye]')`) && (await focused()) === '#avoidAdd' && /Rye/.test(await live()), `${await focused()} ${await live()}`);
  check('it is no longer offered in the list', !await js(`!!document.querySelector('#avoidAdd option[value=rye]')`));
  await tap('[data-unavoid=rye]'); await sleep(200);
  check('the chip removes it again', !(await kept()).avoid.includes('rye') && (await focused()) === '#avoidAdd');
  await tap('#wBack'); await sleep(250);
  same('Back goes to step 3, where the water is asked', await heading(), 'Water and soil');
  await js(`document.querySelector('#wNext').click()`); await sleep(250);
  const back = await kept();
  same('back on step 4 every answer is still there', [back.goals, back.limits, back.prioPreset], [['forage', 'nitrogen'], { noDrill: true, sell: ['grain'] }, 'moisture']);
  await go('/'); await sleep(400);
  check('a reload keeps them', JSON.stringify((await kept()).goals) === '["forage","nitrogen"]');
  check('the last button is on', await js(`!document.querySelector('#wNext').disabled`));
});

await group('keys', async () => {
  await step4();
  await js(`document.querySelector('input[name=matters][value=balanced]').focus()`);
  await press('ArrowRight'); await sleep(200);
  same('an arrow key moves the one choice, and focus stays on it', [await focused(), (await kept()).prioPreset], ['matters=moisture', 'moisture']);
  await js(`document.querySelector('input[name=goal][value=market]').focus()`);
  await press(' '); await sleep(200);
  same('Space ticks a goal, focus stays on it', [await focused(), (await kept()).goals], ['goal=market', ['market']]);
  await js(`document.querySelector('#foldMore summary').focus()`); await press('Enter'); await sleep(150);
  check('Enter opens the limits', await js(`document.querySelector('#foldMore').open`));
  await js(`document.querySelector('input[name=limit][value=noDrill]').focus()`); await press(' '); await sleep(200);
  same('Space turns a switch on, focus stays on it', [await focused(), (await kept()).limits.noDrill], ['limit=noDrill', true]);
  await js(`document.querySelector('[data-till=notill]').focus()`); await press('Enter'); await sleep(200);
  same('Enter on a tillage choice', (await kept()).farm.tillage, 'notill');
  check('every choice has a description a screen reader reads with it', await js(`[...document.querySelectorAll('#setupPanel input[name=matters], #setupPanel input[name=goal], #setupPanel input[name=limit], #setupPanel input[name=sell], #setupPanel input[name=habit], #avoidAdd')].every(i => i.getAttribute('aria-describedby') && i.getAttribute('aria-describedby').split(' ').every(id => document.getElementById(id)?.textContent.trim()))`));
  check('the goals and the markets are named groups', await js(`[...document.querySelectorAll('#setupPanel .in-group[role=group]')].every(g => g.getAttribute('aria-label') || g.getAttribute('aria-labelledby'))`));
});

await group('fit', async () => {
  for (const width of [320, 1280]) for (const big of [false, true]) {
    await step4(width, big); await openFold();
    await js(`(() => { const s = document.querySelector('#avoidAdd'); s.value = 'sunflower'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
    const by = await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    check(`fit: step 4 at ${width} px${big ? ' with the largest text' : ''} does not scroll sideways`, by <= 0, `${by} px`);
    const small = await js(`[...document.querySelectorAll('#setupPanel .wbody label.tile, #setupPanel .in-row, #setupPanel .wbody .btn, #setupPanel .wbody summary, #setupPanel .wbody select, #setupPanel .seg button, #setupPanel .in-chip')].filter(e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height < 43.5).map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().height))`);
    check(`fit: every control of step 4 at ${width} px${big ? ' (largest text)' : ''} is 44 px or more`, small.length === 0, small.join('; '));
    const wide = await js(`[...document.querySelectorAll('#setupPanel .wbody *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map(e => e.className || e.tagName).slice(0, 5)`);
    check(`fit: nothing in step 4 sticks out at ${width} px${big ? ' (largest text)' : ''}`, wide.length === 0, wide.join('; '));
    await js(`localStorage.removeItem('crophalo.settings.v1')`);
  }
});

await group('motion', async () => {
  await step4(); await openFold();
  for (const [level, test] of [['', d => d > 0.2], ['less', d => d <= 0.2], ['reduce', d => d < 0.001]]) {
    await js(`document.documentElement.dataset.motion = ${JSON.stringify(level)}`); await sleep(50);
    await tap('label:has(input[name=limit][value=noDrill])'); await sleep(150);
    const d = await js(`Math.max(...getComputedStyle(document.querySelector('label:has(input[name=limit][value=noDrill]) .sw')).transitionDuration.split(',').map(parseFloat))`);
    check(`motion ${level || 'Full'}: the switch ${level === 'reduce' ? 'does not move' : level === 'less' ? 'moves in 200 ms at most' : 'slides'}, and the step still works`, test(d) && await js(`document.querySelector('#foldMore').open`), `${d} s`);
  }
  await js(`delete document.documentElement.dataset.motion`);
});

await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 320]) for (const dark of [false, true]) {
    if (dark) await run.device({ 'prefers-color-scheme': 'dark' });
    await step4(width); await openFold();
    await js(`document.querySelector('input[name=goal][value=forage]').click()`); await sleep(150);
    await js(`(() => { const s = document.querySelector('#avoidAdd'); s.value = 'flax'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
    await js(`document.querySelector('.in-limits .disc summary').click()`); await sleep(100);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  step 4 at ${width}${dark ? ' dark' : ''}: ${line}`);
    check(`axe: step 4 at ${width}${dark ? ' (dark)' : ''}: 0 problems`, found.length === 0, `${found.length} found`);
    if (dark) await run.device();
  }
});
await finish();
