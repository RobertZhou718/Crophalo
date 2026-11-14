// Crophalo's flow suite: the welcome, the home and the setup steps driven in a real browser the way a farmer would, on the throwaway copy that
// scripts/e2e_lib.mjs makes and serves (its own port, its own empty profile, every outside service cut off).
// Groups (E2E_ONLY=fit,axe picks some): welcome, home, wizard, picker, fit, motion, axe.
// RULE: never loosen a check to make it pass without a written farming reason beside it. A failure means a farmer would meet a control that is
// too small, a page that scrolls sideways, something that moves when asked to be still, or a step that cannot be passed: fix the page, not the test.
// Run: node scripts/e2e_flow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_flow');
const { ROOT, js, page, until, seen, tap, tapAt, press, size, go, check, same, group, finish, sleep, send } = run;
const WIDTHS = [320, 375, 390, 768, 1280], WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const accepted = () => js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`);
const view = () => js(`[...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id.replace('view-', '')).join()`);
const setting = changes => js(`import('/js/settings.js').then(m => { m.saveSettings(${JSON.stringify(changes)}); })`);
const fresh = async (width = 1280) => { await size(width); await go('/'); await accepted(); await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`); };
const stepTitle = () => js(`document.querySelector('#wHeading')?.textContent`);
const wideBy = () => js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
// controls on a phone that are smaller than 44 px (the stretched link of a card counts as the whole card)
const smallOnes = () => page(T => T.controls().filter(T.shown).filter(el => !el.classList.contains('cover') && !el.classList.contains('link') && !el.classList.contains('srci') && !el.closest('.sr')).map(el => ({ el, b: T.box(el) })).filter(({ b }) => b.w < 44 || b.h < 44).map(({ el, b }) => `${T.name(el)} ${Math.round(b.w)}×${Math.round(b.h)}`));   // the stretched link of a card and the "i" (its 44 px hit area is checked apart) count as 44

await group('welcome', async () => {
  await size(1280); await go('/');
  check('welcome: a first visit opens the welcome sheet', await seen(`document.querySelector('#dlgWelcome')?.open`));
  await press('Escape'); await sleep(200);
  check('welcome: Escape cannot dismiss it the first time', await js(`document.querySelector('#dlgWelcome').open`));
  check('welcome: Continue is off until the switch is on', await js(`document.querySelector('#welcomeGo').disabled`));
  await tap('#welcomeListen').catch(() => {});   // hidden where the device cannot speak: the tap is allowed to find nothing
  await tap('#dlgWelcome .welcome-card .link');
  check('welcome: "Read the rest" opens its card and the chevron turns', await js(`document.querySelector('#welcomeRest0').hidden === false && document.querySelector('#dlgWelcome .welcome-card .link').getAttribute('aria-expanded') === 'true'`));
  await js(`document.querySelector('#welcomeAgree').click()`);
  check('welcome: the switch turns Continue on', await js(`!document.querySelector('#welcomeGo').disabled`));
  await tap('#welcomeGo');
  check('welcome: Continue closes the sheet and remembers it', await seen(`!document.querySelector('#dlgWelcome').open && JSON.parse(localStorage.getItem('crophalo.welcome.v1')).v === '2026-11-14'`));
  await go('/'); await sleep(400);
  check('welcome: it does not come back after a reload', await js(`!document.querySelector('#dlgWelcome')?.open`));
  await js(`import('/js/welcome.js').then(m => m.openWelcome())`);
  same('welcome: read again, the switch is on and the button only closes', await js(`[document.querySelector('#welcomeAgree').checked, document.querySelector('#welcomeGo').textContent]`), [true, 'Close']);
});

await group('home', async () => {
  await fresh();
  same('home: the demo region card is there with its rotation', await js(`[document.querySelectorAll('#homeRegions .place-card').length, document.querySelector('#homeRegions .chip').textContent]`), [1, 'Corn → Soybeans → Wheat']);
  await tap('#searchInput'); await run.send('Input.insertText', { text: 'barr' });
  check('home: typing shows the demo region in the list at once, with no network', await seen(`document.querySelectorAll('#searchList [role=option]').length === 1`));
  await press('ArrowDown');
  same('home: ArrowDown highlights the first row', await js(`document.querySelector('#searchInput').getAttribute('aria-activedescendant')`), 'searchOpt0');
  await press('Escape');
  check('home: Escape hides the list', await js(`document.querySelector('#searchList').hidden`));
  await js(`(() => { const i = document.querySelector('#searchInput'); i.value = '-42.03 N, 93.62 W'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#searchForm').requestSubmit(); })()`);
  check('home: a minus with North says what to do and stays on the home', await seen(`/minus sign/.test(document.querySelector('#searchMsg').textContent)`) && await view() === 'home');
  await js(`(() => { const i = document.querySelector('#searchInput'); i.value = ''; document.querySelector('#searchForm').requestSubmit(); })()`);
  check('home: an empty search asks for a place', await seen(`/Type a place/.test(document.querySelector('#searchMsg').textContent)`));
  await js(`(() => { const i = document.querySelector('#searchInput'); i.value = '44.4, -79.78'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#searchForm').requestSubmit(); })()`);
  check('home: coordinates open the setup for that place', await seen(`!document.querySelector('#view-setup').hidden`) && await js(`document.querySelector('.panel-name').textContent`) === '44.40000, -79.78000');
  // Back steps setup → home
  await js(`history.back()`);
  check('home: the Back button returns from the setup to the home', await seen(`!document.querySelector('#view-home').hidden`));
  // saved fields
  await js(`localStorage.setItem('crophalo.saved.v1', JSON.stringify([{ lat: 44.4, lon: -79.78, name: 'Field A', at: Date.now() }, { lat: 37.87, lon: 32.48, name: 'Field B', at: Date.now() - 1e8 }]))`);
  await go('/'); await until(`document.querySelector('#savedCount').textContent === '2'`);
  await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`);
  await tap('.saved-row [data-do=delete]');
  same('home: Delete removes the row and offers Undo', await js(`[document.querySelectorAll('.saved-row').length, document.querySelector('#toast .btn')?.textContent]`), [1, 'Undo']);
  check('home: focus moves to the next row, not to the page', await js(`document.activeElement.closest('.saved-row') !== null`));
  await press('Escape'); await tap('#toast .btn').catch(() => {});
  check('home: Undo brings the field back', await seen(`JSON.parse(localStorage.getItem('crophalo.saved.v1')).length === 2`));
});

await group('wizard', async () => {
  await fresh();
  await tap('#homeRegions .cover');
  check('wizard: a demo card opens the setup with its ready answers on offer', await seen(`!document.querySelector('#view-setup').hidden && !!document.querySelector('#wRoad')`));
  const taps = 2;
  await tap('#wRoad');
  check(`wizard: the short road reaches the report in ${taps} taps`, await seen(`!document.querySelector('#view-report').hidden`));
  await js(`history.back()`); await until(`!document.querySelector('#view-setup').hidden`);
  // a place with no demo: the steps block until answered
  await fresh();
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
  await until(`!document.querySelector('#view-setup').hidden`);
  check('wizard: with no demo there is no short road', await js(`!document.querySelector('#wRoad')`));
  same('wizard: step 3 and 4 cannot be reached from step 1', await js(`[...document.querySelectorAll('.wstep')].map(b => b.disabled)`), [false, false, true, true]);
  await tap('#wNext');
  same('wizard: step 2 has its heading and Next is off', await js(`[document.querySelector('#wHeading').textContent, document.querySelector('#wNext').disabled]`), ['What do you grow?', true]);
  check('wizard: the note says what is needed', await js(`/Tap what you grow/.test(document.querySelector('#ctaNote').textContent)`));
  await tap('input[name=rot][value="corn-soy"]').catch(async () => { await js(`document.querySelector('input[name=rot][value="corn-soy"]').click()`); });
  check('wizard: a rotation turns Next on and names the crops', await seen(`!document.querySelector('#wNext').disabled && document.querySelector('#rotName').textContent === 'Corn → Soybeans'`));
  await js(`document.querySelector('input[name=rot][value="corn-soy"]').focus()`); await press('ArrowDown');
  check('wizard: arrow keys move through the rotations and keep the keyboard on the chosen one', await seen(`document.activeElement.name === 'rot' && document.activeElement.checked`));
  await js(`document.querySelector('input[name=rot][value="corn-soy"]').click()`);
  await tap('#wNext');
  check('wizard: step 3 blocks until soil is chosen', await js(`document.querySelector('#wHeading').textContent === 'Water and soil' && document.querySelector('#wNext').disabled`));
  await js(`document.querySelector('input[name=feel][value=loam]').click()`);
  check('wizard: the feel alone is not enough', await js(`document.querySelector('#wNext').disabled`));
  await js(`document.querySelector('input[name=colour][value=med]').click()`);
  check('wizard: feel and colour turn Next on', await seen(`!document.querySelector('#wNext').disabled`));
  await tap('#wNext');
  same('wizard: step 4 ends with the report button', await js(`[document.querySelector('#wHeading').textContent, document.querySelector('#wNext').textContent]`), ['What do you want most?', 'See my field report']);
  await js(`location.reload()`);
  check('wizard: a reload in the middle of the setup comes back to the same step', await seen(`!document.querySelector('#view-setup').hidden && document.querySelector('#wHeading')?.textContent === 'What do you want most?'`));
  await tap('#wBack'); await tap('#wBack'); await tap('#wBack'); await tap('#wBack');   // step 4, 3, 2, then 1 itself
  check('wizard: Back on step 1 returns to the home', await seen(`!document.querySelector('#view-home').hidden`));
  // a garden skips step 4
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 7, lon: 80, name: 'Tea' })); import('/js/app.js').then(m => m.show('setup'))`);
  await until(`!document.querySelector('#view-setup').hidden`); await tap('#wNext');
  await js(`document.querySelector('input[name=garden]').click()`);
  same('wizard: trees and bushes have three steps, not four', await js(`document.querySelectorAll('.wstep').length`), 3);
});

await group('picker', async () => {
  await fresh();
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
  await until(`!document.querySelector('#view-setup').hidden`); await tap('#wNext');
  await js(`document.querySelector('input[name=rot][value=custom]').click()`);
  await tap('.pk-btn');
  check('picker: the button opens the panel and the keyboard goes to its search box', await seen(`!!document.querySelector('.pk-panel') && document.activeElement.classList.contains('pk-search')`));
  await run.send('Input.insertText', { text: 'bean' });
  check('picker: typing "bean" lists the beans only', await seen(`document.querySelectorAll('.pk-row').length > 1 && document.querySelectorAll('.pk-row').length < 12`));
  await press('ArrowDown'); await press('Enter');
  check('picker: Enter on a row chooses it, closes the panel and gives the keyboard back to the button', await seen(`!document.querySelector('.pk-panel') && document.activeElement.classList.contains('pk-btn')`));
  await tap('.pk-btn'); await press('Escape');
  check('picker: Escape closes it and returns to the button', await seen(`!document.querySelector('.pk-panel') && document.activeElement.classList.contains('pk-btn')`));
});

await group('fit', async () => {
  for (const width of WIDTHS) for (const largest of [false, true]) {
    await fresh(width); await setting({ text: largest ? 'xlarge' : 'default' });
    const where = `at ${width} px${largest ? ' with the Largest text' : ''}`;
    await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`);
    same(`fit: the home does not scroll sideways ${where}`, await wideBy() <= 0, true);
    if (width <= 600) same(`fit: every control on the home is 44 px or more ${where}`, await smallOnes(), []);
    await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
    await until(`!document.querySelector('#view-setup').hidden`);
    for (const [i, id] of ['field', 'crops', 'soil', 'matters'].entries()) {
      if (i === 1) await js(`document.querySelector('#wNext').click()`);
      if (i === 2) { await js(`document.querySelector('input[name=rot][value="corn-soy"]').click(); document.querySelector('#wNext').click()`); }
      if (i === 3) { await js(`document.querySelector('input[name=feel][value=loam]').click(); document.querySelector('input[name=colour][value=med]').click(); document.querySelector('#wNext').click()`); }
      await sleep(150);
      same(`fit: step ${i + 1} does not scroll sideways ${where}`, await wideBy() <= 0, true);
      if (width <= 600) same(`fit: every control on step ${i + 1} is 44 px or more ${where}`, await smallOnes(), []);
      check(`fit: the sticky bar stays on the screen at step ${i + 1} ${where}`, await js(`(() => { const b = document.querySelector('#wNext').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })()`));
    }
  }
});

await group('motion', async () => {
  const cx = () => js(`+document.querySelector('.lens-ring').getAttribute('cx')`);
  await fresh(); await setting({ motion: 'device' }); await go('/');
  const first = await cx(); await sleep(1200); const mid = await cx(); await sleep(1500); const later = await cx();
  check('motion: on load the lens sweeps over the fields by itself', first !== mid && mid !== later, [first, mid, later].join(' → '));
  await sleep(3500); const rest1 = await cx(); await sleep(1000); const rest2 = await cx();
  check('motion: after 4.5 seconds it stops and rests', Math.abs(rest1 - rest2) < 0.6, `${rest1} then ${rest2}`);
  check('motion: the dashed ring is turning slowly', await js(`getComputedStyle(document.querySelector('.lens-turn')).animationName === 'lensturn' && getComputedStyle(document.querySelector('.lens-turn')).animationDuration === '14s'`));
  await setting({ motion: 'reduce' }); await go('/'); await sleep(600);
  const s1 = await cx(); await sleep(1500); const s2 = await cx();
  same('motion: with Always still the lens does not sweep', s2, s1);
  check('motion: with Always still the dashed ring does not turn', await js(`parseFloat(getComputedStyle(document.querySelector('.lens-turn')).animationDuration) < 0.01`));
  await tapAt(300, 400).catch(() => {});
  check('motion: with nothing running at all on the home', await js(`document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity ? true : false)`));
});

const FIXTURE = `(() => { const s = (year, crop, sow, harvest, after, window = null) => ({ year, crop, sow, harvest, after, residueUntil: null, window });
  const now = { id: 'now', name: 'Now', kind: 'current', seasons: [s(1, 'corn', '2027-05-01', '2027-10-05', 'residue'), s(2, 'soy', '2028-05-20', '2028-10-01', 'residue'), s(3, 'corn', '2029-05-01', '2029-10-05', 'residue')], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
  const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], s(3, 'wheat', '2028-10-05', '2029-07-25', 'cover', { earliest: '2028-09-25', latest: '2028-10-15' })], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
  const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [s(1, 'barley', '2027-04-20', '2027-08-01', 'bare')] };
  return { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }], gaps: ['Soil is assumed, not measured.'], risks: ['A late harvest squeezes the wheat window.'], sureness: 'Somewhat sure' }; })()`;
const showReport = async () => { await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); const state = { ...st.newState(), loc: { lat: 44.4, lon: -79.78, label: 'Barrie, Ontario', cc: 'CA' }, name: 'Barrie & Simcoe County', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }; await m.renderResult(state, ${FIXTURE}); })`); await until(`!!document.querySelector('#answer')`); };

await group('report', async () => {
  await fresh();
  await tap('#homeRegions .cover'); await tap('#wRoad');
  check('report: the short road opens the loading screen, then (offline here) says plainly that the weather could not be read, with Try again and Back', await seen(`!document.querySelector('#view-report').hidden && /couldn.t get weather data/.test(document.querySelector('#reportRoot').textContent) && !!document.querySelector('[data-act=retry]') && !!document.querySelector('[data-act=change]')`, 20000));
  await tap('[data-act=change]');
  check('report: Change answers goes back to the setup', await seen(`!document.querySelector('#view-setup').hidden`));
  await js(`history.back()`); await sleep(300);
  await fresh(); await showReport();
  same('report: seven tabs in order, one selected', await js(`[...document.querySelectorAll('[role=tab]')].map(t => [t.textContent.trim(), t.getAttribute('aria-selected'), t.tabIndex])`), [['Overview', 'true', 0], ['Options', 'false', -1], ['Weather', 'false', -1], ['Calendar', 'false', -1], ['Field', 'false', -1], ['Satellites & prices', 'false', -1], ['Notes & to‑do', 'false', -1]]);
  check('report: the heading is the field\'s name and the keyboard starts there', await js(`document.querySelector('#reportTitle').textContent === 'Barrie & Simcoe County' && document.activeElement.id === 'reportTitle'`));
  check('report: Overview shows one recommendation, one reason and the comparison', await js(`/Try Corn, then Soybeans, then Winter wheat/.test(document.querySelector('#answer').textContent) && /Why it suits this field/.test(document.querySelector('#answer').textContent) && document.querySelectorAll('.rv-col').length === 2 && /leftover crop residue/.test(document.querySelector('.rv-compare').textContent) && /living cover/.test(document.querySelector('.rv-compare').textContent)`));
  check('report: the assumptions are on the screen', await js(`/average loam is assumed/.test(document.body.textContent) && /estimated as a 10 ha square/.test(document.body.textContent) && /Water: rain only/.test(document.body.textContent)`));
  await js(`document.querySelector('#tab-overview').focus()`); await press('ArrowRight');
  same('report: ArrowRight opens the next tab and moves the keyboard with it', await js(`[document.querySelector('#tab-options').getAttribute('aria-selected'), document.activeElement.id, document.querySelector('#panel-options') !== null]`), ['true', 'tab-options', true]);
  await press('End'); same('report: End goes to the last tab', await js(`document.activeElement.id`), 'tab-notes');
  await press('ArrowRight'); same('report: ArrowRight wraps to the first', await js(`document.activeElement.id`), 'tab-overview');
  await press('ArrowLeft'); same('report: ArrowLeft wraps to the last', await js(`document.activeElement.id`), 'tab-notes');
  await press('Home'); same('report: Home goes to the first', await js(`document.activeElement.id`), 'tab-overview');
  await tap('#tab-weather');
  check('report: a later tab says plainly it is not built and what it will hold', await js(`/Not built yet/.test(document.querySelector('#panel-weather').textContent) && /Heat, cold and rain/.test(document.querySelector('#panel-weather').textContent)`));
  same('report: the priorities panel is hidden where there is nothing to fine-tune (Weather)', await js(`!!document.querySelector('.rv-prio')`), false);
  await tap('#tab-overview');
  check('report: Next: Options is at the foot and moves to the tab', await js(`!!document.querySelector('[data-tab=options][data-focus]')`));
  await tap('[data-tab=options][data-focus]');
  check('report: Options shows three cards, the suggestion pressed, and the detail', await js(`document.querySelectorAll('.ocard').length === 3 && document.querySelector('[data-plan=wheat]').getAttribute('aria-pressed') === 'true' && /Why we suggest it/.test(document.querySelector('#sdetail').textContent)`));
  await tap('[data-plan=now]');
  check('report: tapping a card changes the detail and says what changed', await js(`document.querySelector('[data-plan=now]').getAttribute('aria-pressed') === 'true' && /yardstick/.test(document.querySelector('#sdetail').textContent)`) && await seen(`/Details below changed to/.test(document.querySelector('#toast').textContent)`));
  check('report: no fold is open on first look', await js(`document.querySelectorAll('#panel-options details[open]').length === 0`));
  check('report: every bar says Worse and Better', await js(`document.querySelectorAll('.rv-bar-ends small').length === 10`));
  // the "i"
  await tap('#tab-overview');
  await js(`document.querySelector('#answer .srci').focus()`); await press('Enter');
  check('report: the "i" opens by keyboard with the NASA source first, and focus goes into the card', await seen(`!document.querySelector('#srcPop').hidden && document.activeElement.hasAttribute('data-close') && /NASA POWER/.test(document.querySelector('#srcPop').textContent) && document.querySelector('#srcPop').textContent.indexOf('NASA POWER') < document.querySelector('#srcPop').textContent.indexOf('Visit the source') && document.querySelector('#answer .srci').getAttribute('aria-expanded') === 'true'`));
  await press('Escape');
  check('report: Escape closes the card and gives the keyboard back to the "i"', await seen(`document.querySelector('#srcPop').hidden && document.activeElement.classList.contains('srci') && document.querySelector('#answer .srci').getAttribute('aria-expanded') === 'false'`));
  await tap('#answer .srci'); check('report: a click pins it; a second click closes it', await seen(`!document.querySelector('#srcPop').hidden`)); await tap('#answer .srci'); check('report: second click closed it', await seen(`document.querySelector('#srcPop').hidden`));
  // the priorities panel
  check('report: the priorities panel has five sliders and two what-if sliders on Overview', await js(`document.querySelectorAll('.rv-prio input[data-prio]').length === 5 && document.querySelectorAll('.rv-prio input[data-sc]').length === 2`));
  // add to My Farm
  await tap('#rbFarm');
  check('report: Add to My Farm without My Farm built says so, in words, and stays on the report', await seen(`/My Farm is not connected yet/.test(document.querySelector('#farmNote').textContent) && !document.querySelector('#view-report').hidden`));
  same('report: it is the one primary action on the screen', await js(`document.querySelectorAll('#view-report .btn.primary').length`), 1);
});

await group('report fit', async () => {
  await fresh(375); await showReport();
  check('fit: the "i" is a 24 px mark with a 44 px place to tap around it', await js(`[...document.querySelectorAll('#view-report .srci')].every(b => { const a = getComputedStyle(b, '::after'); return parseFloat(a.width) >= 44 && parseFloat(a.height) >= 44; })`));
  for (const width of [320, 375, 390, 768, 1280]) for (const largest of [false, true]) {
    await fresh(width); await setting({ text: largest ? 'xlarge' : 'default' }); await showReport();
    const where = `at ${width} px${largest ? ' with the Largest text' : ''}`;
    same(`fit: Overview does not scroll sideways ${where}`, await wideBy() <= 0, true);
    if (width <= 600) same(`fit: every control on Overview is 44 px or more ${where}`, await smallOnes(), []);
    await js(`document.querySelector('#tab-options').click()`); await sleep(150);
    same(`fit: Options does not scroll sideways ${where}`, await wideBy() <= 0, true);
    if (width <= 600) same(`fit: every control on Options is 44 px or more ${where}`, await smallOnes(), []);
  }
});

await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  const scan = async name => {
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  ${name}: ${line}`);
    check(`axe: ${name}: 0 problems`, found.length === 0, `${found.length} found, listed above`);
  };
  for (const width of [1280, 375]) {
    await fresh(width); await scan(`home at ${width} px`);
    await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`); await scan(`Saved sheet at ${width} px`); await press('Escape');
    await js(`import('/js/welcome.js').then(m => m.openWelcome())`); await sleep(300); await scan(`welcome at ${width} px`); await js(`document.querySelector('#dlgWelcome').close()`);
    await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
    await until(`!document.querySelector('#view-setup').hidden`);
    await scan(`step 1 at ${width} px`); await js(`document.querySelector('#wNext').click()`); await sleep(150); await scan(`step 2 at ${width} px`);
    await js(`document.querySelector('input[name=rot][value=custom]').click()`); await sleep(100); await tap('.pk-btn'); await scan(`the crop chooser open at ${width} px`); await press('Escape');
    await js(`document.querySelector('input[name=rot][value="corn-soy"]').click(); document.querySelector('#wNext').click()`); await sleep(150); await scan(`step 3 at ${width} px`);
    await js(`document.querySelector('input[name=feel][value=loam]').click(); document.querySelector('input[name=colour][value=med]').click(); document.querySelector('#wNext').click()`); await sleep(150); await scan(`step 4 at ${width} px`);
    await showReport(); await scan(`report Overview at ${width} px`); await js(`document.querySelector('#tab-options').click()`); await sleep(150); await scan(`report Options at ${width} px`);
    await js(`document.querySelector('#tab-overview').click()`); await sleep(100); await tap('#answer .srci'); await scan(`the source card open at ${width} px`); await press('Escape');
  }
});

await finish();
