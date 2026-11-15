// The browser suite for My farm and the 3D look together (software drawing): the Oxford demo field opens in My farm, and at each of the three demo dates and under both plans
// Map -> 3D -> Map shows 3D the very same field, plan, date and ground state the board shows, loses nothing on the way back, falls back with the plain sentence when
// the device cannot draw 3D, and never scrolls sideways at 1280 and 375. The plans and the ground-cover answers are the crop engine's own (scripts/fixtures/engine-plans.mjs).
// RULE: never loosen a check here to make it pass without a written farming reason beside it. Run: node scripts/e2e_farm3d_link.mjs
import { openRun } from './e2e_lib.mjs';
import { realReport } from './fixtures/engine-plans.mjs';
import * as EN from '../js/engine.js';

const run = await openRun('farm3d_link');
const { js, page, until, tap, size, device, go, flat, shot, check, same, finish, sleep, send } = run;
// Each group is a second visit: the welcome sheet was read once and is out of the way (scripts/e2e_flow.mjs drives the welcome itself).
const group = (label, body) => run.group(label, async () => { await js(`import('/js/welcome.js').then(m => localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: 'test' })))`); await go('/'); await body(); });
// The copy under test has no Python, so the NASA picture lookup is cut off at the page as it is in scripts/e2e_farm.mjs: the board then says "Observed: not read yet".
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, o) => /^[/]api[/]hlsndvi/.test(String(u)) ? Promise.reject(new Error('down')) : first(u, o); })();" });
// The report's two plans as the crop engine makes them on the weather recorded for the demo place, and the engine's own three days of the walkthrough.
const { report: REAL } = await realReport(), KD = EN.keyDates(REAL.current, REAL.proposed);
const REPORT_JS = JSON.stringify(REAL);
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);
// a software renderer answers the board's "can this device draw 3D" probe with its own name, and the board then keeps to the map by design. This test needs the 3D look to open,
// so the probe (a canvas that is not on the page) is told a graphics chip's name; the 3D view's own canvas (on the page) still tells the truth and gets the lighter settings.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const was = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 37446 && this.canvas && !this.canvas.isConnected ? 'ANGLE (Test graphics chip)' : was.call(this, p); }; } })()` });
const ENGINE_GROUND = `import('/js/engine.js').then(E => window.__farm.setGround(E.groundOn))`;   // what the page start hands My farm
const open = async (withGround = true) => {
  await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${REPORT_JS}); })`);
  await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`, 15000); await sleep(300);
  await js(withGround ? ENGINE_GROUND : 'window.__farm.setGround(null)'); await sleep(150);
};
// what the board holds now: the field, the plan, the date and the ground it answers for them
const board = () => page(T => {
  const ui = window.__farm._ui, st = JSON.parse(localStorage.getItem('crophalo.farms.v1')), f = st.farms.flatMap(x => x.fields).find(x => x.id === ui.fieldId), plan = f?.report?.[ui.planKind] ?? null;
  const g = plan ? window.__farm.groundOf(plan, ui.date) : null;
  return { fieldId: ui.fieldId, fieldName: document.querySelector('#fwField').selectedOptions[0].textContent.split(' · ')[0], planKind: ui.planKind, planName: plan?.name ?? null, date: ui.date, dateWords: document.querySelector('#fwTime').textContent.trim(), chip: document.querySelector('#fwLabel').textContent.trim(), ground: g, view: ui.view };
});
const threeNow = () => page(T => {
  const s = document.querySelector('#fw3d .f3d-stage'); if (!s) return null;
  return { field: s.dataset.field, plan: s.dataset.plan, date: s.dataset.date, ground: s.dataset.ground, crop: s.dataset.crop, stage: s.dataset.stage, label: s.dataset.label, aria: s.getAttribute('aria-label'), labelText: document.querySelector('#fw3d .f3d-label')?.textContent.trim().replace(/\s+/g, ' '), cover: document.querySelector('#fw3d .f3d-cover')?.textContent.trim(),
    legend: [...document.querySelectorAll('#fw3d .f3d-legend li.is-on')].map(l => l.textContent.trim()), hidden: document.querySelector('#fw3d').hidden, canvases: document.querySelectorAll('#fw3d canvas').length };
});
const LEGEND_OF = { crop: 'Standing plants', cover: 'Standing plants', residue: 'Residue left after harvest', bare: 'Bare soil' };
const monthDay = iso => { const [y, m, d] = iso.split('-').map(Number); return new RegExp(`^.*\\b${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}\\w* ${y}\\b`); };
async function seeThree(label) {
  await tap('#fwThreeBtn');
  await until(`document.querySelector('#fw3d .f3d-stage') && !document.querySelector('#fw3d').hidden && document.querySelectorAll('#fw3d canvas').length === 1`, 40000);
  await sleep(400);
}
async function sameAsBoard(label, b) {
  const t = await threeNow();
  check(`${label}: 3D opened and the Map is out of the way`, !!t && !t.hidden && t.canvases === 1 && (await js(`document.querySelector('#fwMap').hidden`)), t);
  if (!t) return;
  same(`${label}: the field is the board's field`, t.field, b.fieldId);
  check(`${label}: the field's name is in the 3D sentence for a screen reader`, t.aria.includes(b.fieldName), [t.aria, b.fieldName]);
  same(`${label}: the plan is the board's plan`, t.plan, b.planKind);
  // the line beside the picture names the plan the way the board's toolbar and its two cards do (Current plan, Proposed plan); the engine's long name of the plan stays on the board's card
  check(`${label}: the plan is written beside the picture, in the board's words`, (t.labelText || '').includes(b.planKind === 'current' ? 'Current plan' : 'Proposed plan'), [t.labelText, b.planName]);
  same(`${label}: the date is the board's date`, t.date, b.date);
  check(`${label}: the date is written beside the picture, in the same day`, monthDay(b.date).test(t.labelText || ''), [t.labelText, b.date]);
  same(`${label}: the ground state is the board's ground state`, t.ground, b.ground?.state ?? 'none');
  same(`${label}: and its crop and stage`, [t.crop, t.stage], [b.ground?.crop ?? '', String(b.ground?.stage ?? '')]);
  same(`${label}: "Planned" or "Observed" is written on 3D as it is on the board`, t.label, b.ground?.label ?? '');
  same(`${label}: the board's chip says the same word`, b.chip, b.ground?.label ?? 'not read yet');
  check(`${label}: the 3D legend marks what the board's ground state is`, b.ground ? t.legend.length === 1 && t.legend[0] === LEGEND_OF[b.ground.state] : t.legend.length === 0, [t.legend, b.ground]);
  if (b.ground?.crop === 'wheat') check(`${label}: the words name the crop`, /wheat/i.test(t.cover || ''), t.cover);
  if (b.ground?.state === 'residue') check(`${label}: the words say residue`, /residue/i.test(t.cover || ''), t.cover);
  if (b.ground?.state === 'bare') check(`${label}: the words say bare soil`, /bare soil/i.test(t.cover || ''), t.cover);
}

await group('link: Map to 3D to Map, three dates, both plans', async () => {
  await open();
  await tap('#fwCompare'); await until(`!document.querySelector('#fwPanel').hidden && document.querySelectorAll('.fw-step').length === 3`);
  const steps = await js(`[...document.querySelectorAll('.fw-step')].map(b => ({ label: b.querySelector('span').textContent, date: null }))`);
  same('the engine\'s three dates in the board', steps.map(s => s.label), KD.map(k => k.label));
  for (const kind of ['proposed', 'current']) {
    await js(`window.__farm._ui.planKind = ${JSON.stringify(kind)}; window.__farm.render()`);   // My farm has no button for the plan in 3D yet: the board's own state is set the way its function does
    for (let i = 0; i < 3; i++) {
      await tap(`.fw-step[data-i="${i}"]`); await sleep(150);
      const b = await board(), tag = `${kind} plan, ${steps[i].label} (${b.date})`;
      same(`${tag}: the board is on the map`, b.view, 'map');
      await seeThree(tag);
      await sameAsBoard(tag, b);
      await shot(`link-${kind}-${i}-3d-1280.png`);
      // back to the Map: nothing lost, and no 3D left behind
      await tap('#fwMapBtn'); await until(`!document.querySelector('#fwMap').hidden`, 10000); await sleep(200);
      const after = await board();
      same(`${tag}: back on the Map, the field, plan and date are as they were`, [after.fieldId, after.planKind, after.date, after.view], [b.fieldId, b.planKind, b.date, 'map']);
      same(`${tag}: the Map's chip and date are as they were`, [after.chip, after.dateWords], [b.chip, b.dateWords]);
      check(`${tag}: 3D is gone: its box is hidden and empty, its canvas freed`, await js(`document.querySelector('#fw3d').hidden && document.querySelector('#fw3d').children.length === 0`));
      check(`${tag}: the Map has its field again`, await js(`document.querySelectorAll('#fwMap path.fw-field').length === 1`));
      check(`${tag}: the Compare panel is still open`, await js(`!document.querySelector('#fwPanel').hidden`));
    }
  }
});

await group('link: a change of date while in 3D reaches the 3D look, and the farmer\'s camera stays', async () => {
  await open();
  await tap('#fwCompare'); await until(`document.querySelectorAll('.fw-step').length === 3`);
  await tap('.fw-step[data-i="0"]'); await sleep(150);
  await seeThree('update');
  await tap('[data-act="right"]'); await sleep(300);
  const first = await threeNow();
  await tap('.fw-step[data-i="2"]'); await sleep(900);
  const b = await board(), t = await threeNow();
  same('update: 3D follows the board to the spring date without opening again', [t.date, t.ground, t.crop], [b.date, b.ground.state, b.ground.crop]);
  check('update: it is still the one canvas', t.canvases === 1);
  check('update: the words changed with the date', t.labelText !== first.labelText && /wheat/i.test(t.cover), [first.labelText, t.labelText]);
  await tap('#fwNext').catch(() => {});
});

await group('link: with no ground answer 3D says so, as the board does', async () => {
  await open(false);
  await seeThree('no answer');
  const b = await board(), t = await threeNow();
  same('no answer: the board says "not read yet"', b.chip, 'not read yet');
  check('no answer: 3D says "Not read yet" too, and draws no ground state', /^Not read yet/.test(t.labelText) && t.ground === 'none' && t.legend.length === 0 && /Not read yet/.test(t.cover), t);
});

await group('link: where the device cannot draw 3D the board says so and keeps working', async () => {
  await open();
  const before = await board();
  await js(`Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value() { return null; }, configurable: true }); 0`);
  await tap('#fwThreeBtn'); await sleep(600);
  same('fallback: the plain sentence', await text('#fwStatus'), 'This device cannot draw 3D. The board shows the same things.');
  same('fallback: still on the Map, the Map button chosen', await js(`document.querySelector('#fwMapBtn').getAttribute('aria-pressed')`), 'true');
  check('fallback: the Map is shown with its field', await js(`!document.querySelector('#fwMap').hidden && document.querySelectorAll('#fwMap path.fw-field').length === 1 && document.querySelector('#fw3d').hidden`));
  same('fallback: the field, the plan and the date are as they were', (({ fieldId, planKind, date }) => [fieldId, planKind, date])(await board()), [before.fieldId, before.planKind, before.date]);
  await tap('#fwCompare'); await until(`!document.querySelector('#fwPanel').hidden`);
  check('fallback: Compare plans still works', await js(`document.querySelectorAll('.fw-step').length === 3`));
});

for (const w of [1280, 375]) {
  await group(`link: nothing scrolls sideways at ${w} px, Map and 3D`, async () => {
    await size(w); await go('/'); await open();
    await tap('#fwCompare'); await until(`document.querySelectorAll('.fw-step').length === 3`);
    await flat(`link Map ${w}`);
    if (await js(`!!document.querySelector('#fwLower') && getComputedStyle(document.querySelector('#fwLower')).display !== 'none'`)) { await tap('#fwLower'); await sleep(150); }   // on a phone the Compare sheet is lowered first, as a farmer does, so the toolbar shows
    await seeThree(`fit ${w}`);
    await flat(`link 3D ${w}`);
    const small = await js(`[...document.querySelectorAll('#fw3d button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.textContent.trim() || b.getAttribute('aria-label'))`);
    same(`link 3D ${w}: every 3D button is at least 44 px`, small, []);
    check(`link 3D ${w}: the picture and its words fit inside the screen`, await js(`(() => { const r = document.querySelector('#fw3d').getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5; })()`));
    await shot(`link-3d-${w}.png`);
  });
}
await finish();
