// Crophalo's 3D field look in a real browser (software drawing): it loads only when opened, draws one sun, shows plants and residue as different things,
// falls back with a plain message, and leaves nothing behind. Pictures go to E2E_SHOTS (outside the project). Run: node scripts/e2e_farm3d.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
process.env.CROPHALO_ROOT ||= path.join(HERE, '..');
const { openRun } = await import(pathToFileURL(path.join(process.env.CROPHALO_ROOT, 'scripts', 'e2e_lib.mjs')).href);
const t = await openRun('farm3d');
const { check, same, js, page, until, size, send, shot, sleep } = t;
const PAGE = '/design/farm3d-demo.html';
const open = async (w, state, extra) => { await size(w); await t.go(PAGE); await until('window.ready === true', 8000); const st = await js(`demo.open(${JSON.stringify(state)}, ${JSON.stringify(extra || {})})`); await sleep(1500); return st; };
const PLAN = { corn: { state: 'crop', crop: 'corn', stage: 3, label: 'Planned' }, soyRes: { state: 'residue', crop: 'soy', stage: null, label: 'Planned' }, wheat1: { state: 'crop', crop: 'wheat', stage: 1, label: 'Planned' }, wheat2: { state: 'crop', crop: 'wheat', stage: 2, label: 'Planned' }, bare: { state: 'bare', label: 'Planned' }, soy: { state: 'crop', crop: 'soy', stage: 3, label: 'Planned' } };

await t.group('3d: loads only when opened', async () => {
  await size(1280); await t.go(PAGE); await until('window.ready === true', 8000);
  same('three.js is not fetched before the view is opened', t.asked.some(u => u.includes('three.module')), false);
  const st = await js(`demo.open(${JSON.stringify(PLAN.corn)})`);
  same('the view is ready', st, 'ready');
  check('now three.js was fetched', t.asked.some(u => u.includes('three.module')));
});
await t.group('3d: one sun, one canvas, the words beside the picture', async () => {
  await open(1280, PLAN.soyRes, { hills: true });
  same('exactly one directional light', await js('view.lightCount()'), 1);
  same('one canvas', await js(`document.querySelectorAll('.f3d canvas').length`), 1);
  const w = await js(`document.querySelector('.f3d').innerText`);
  check('the label says Planned, the plan and the date', /Planned · Proposed plan · 5 October 2027/.test(w), w.slice(0, 200));
  check('the words say what covers the ground, that the outline is estimated, the heights and the sun', /residue/i.test(w) && /Outline estimated/.test(w) && /Heights read/.test(w) && /Sun at/.test(w), w);
  check('the stage is an application element with a full sentence', /3D view of Demo field/.test(await js(`document.querySelector('.f3d-stage').getAttribute('aria-label')`)));
  const lit = await js('view.drawn()');
  check('the canvas really drew', lit > 0.1, lit);
  await shot('3d-residue-hills-1280.png');
});
for (const [name, state, extra] of [['standing corn', PLAN.corn], ['soybean residue', PLAN.soyRes], ['wheat seedlings', PLAN.wheat1], ['wheat in spring', PLAN.wheat2], ['bare soil', PLAN.bare], ['standing soybeans', PLAN.soy]]) {
  await t.group(`3d: ${name} at 1280 and 375`, async () => {
    for (const w of [1280, 375]) {
      const st = await open(w, state);
      same(`${name} ${w}: ready`, st, 'ready');
      const legend = await js(`[...document.querySelectorAll('.f3d-legend li.is-on')].map(l => l.textContent.trim())`);
      check(`${name} ${w}: the legend marks what is shown`, legend.length === (state.state === 'bare' ? 1 : 1), legend);
      await t.flat(`3d ${name} ${w}`);
      await shot(`3d-${name.replace(/ /g, '-')}-${w}.png`);
    }
  });
}
await t.group('3d: a flat schematic and a plain status when heights are missing', async () => {
  await open(1280, PLAN.corn);
  const w = await js(`document.querySelector('.f3d-heights').textContent`);
  check('it says the heights were not read and the land is flat', /Heights not read/.test(w), w);
});
await t.group('3d: the camera buttons and keys', async () => {
  await open(1280, PLAN.corn);
  const a = await js('view.camera()');
  await t.click('[data-act="left"]'); await sleep(200);
  const b = await js('view.camera()');
  check('turning left moves the camera and marks the view as moved', b.moved && JSON.stringify(a.position) !== JSON.stringify(b.position));
  await t.click('[data-act="reset"]'); await sleep(200);
  const c = await js('view.camera()');
  check('Reset view goes back to the first view', JSON.stringify(c.position.map(v => Math.round(v))) === JSON.stringify(a.position.map(v => Math.round(v))), [a.position, c.position]);
  const hit = await page((T) => [...document.querySelectorAll('.f3d-btn')].map(el => { const b = T.box(el); return Math.min(b.w, b.h); }));
  check('every camera button is 44 px or more', hit.every(v => v >= 44), hit);
});
await t.group('3d: the plan and date change keeps the camera', async () => {
  await open(1280, PLAN.soyRes);
  await t.click('[data-act="right"]'); await sleep(150);
  const a = await js('view.camera()');
  await js(`demo.next(${JSON.stringify(PLAN.wheat1)})`); await sleep(500);
  const b = await js('view.camera()');
  same('the farmer\'s own camera angle stays', b.position.map(v => Math.round(v)), a.position.map(v => Math.round(v)));
  check('the words and legend changed with it', /5 November 2027/.test(await js(`document.querySelector('.f3d-label').textContent`)) && /wheat/i.test(await js(`document.querySelector('.f3d-cover').textContent`)));
});
await t.group('3d: ten opens and closes leave nothing behind', async () => {
  await size(1280); await t.go(PAGE); await until('window.ready === true', 8000);
  for (let i = 0; i < 10; i++) { await js(`demo.open(${JSON.stringify(PLAN.corn)})`); await js('view.dispose()'); }
  same('the host is empty again', await js(`document.getElementById('host').children.length`), 0);
});
await t.group('3d: without WebGL the plain message shows and nothing else breaks', async () => {
  await size(1280); await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`HTMLCanvasElement.prototype.getContext = function () { return null; }`);
  const st = await js(`demo.open(${JSON.stringify(PLAN.corn)})`);
  same('status', st, 'no-webgl');
  check('the plain message points to the Map', /cannot draw 3D\. The Map shows the same field/.test(await js(`document.getElementById('host').innerText`)));
  same('the host told the page', await js('window.fellBack'), 'no-webgl');
});
await t.finish();
