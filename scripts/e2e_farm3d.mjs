// Crophalo's browser suite for the 3D field look in a real browser (software drawing): it loads only when opened, draws one sun, shows plants and residue as different things,
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
  check('the words say what covers the ground and that the outline is estimated; the heights and the sun are under Show more', /residue/i.test(w) && /Outline estimated/.test(w) && /Heights read/.test(await js(`document.querySelector('.f3d-more').textContent`)) && /Sun at/.test(await js(`document.querySelector('.f3d-more').textContent`)), w);
  check('the stage is an application element with a full sentence', /3D view of Demo field/.test(await js(`document.querySelector('.f3d-stage').getAttribute('aria-label')`)));
  check('the height map\'s own credit and licence line is on the page while heights are drawn (Open Government Licence - Canada for the Ontario demo)', await js(`document.querySelector('.f3d-credit')?.textContent`) === 'Height map: Contains information licensed under the Open Government Licence - Canada (Natural Resources Canada).');
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
// OpenStreetMap's credit in the 3D view: the newer 3D view draws OpenStreetMap features only as its land details, which it loads itself (not from layers handed in),
// so the linked credit is its .f3d-land-credit line, shown only while one of those features is drawn. scripts/e2e_land3d.mjs checks it there (drawn, all switched off, failure).
await t.group('3d: the side panel says what is seen first, and the rest is under Show more', async () => {
  await open(1280, PLAN.corn);
  const p = await js(`(() => { const main = document.querySelector('.f3d-words'), more = document.querySelector('.f3d-more'); const count = e => (e.innerText.match(/[.!?](\\s|$)/g) || []).length; return { mainSentences: count(main), mainText: main.innerText, moreClosed: !more.open, moreText: more.textContent, hasSummary: /Show more/.test(more.querySelector('summary').textContent) }; })()`);
  check('the part shown at first holds at most four short sentences', p.mainSentences >= 1 && p.mainSentences <= 4, p);
  check('the sun, that plants are symbols and the keys are under Show more, closed at first', p.moreClosed && p.hasSummary && /The one light|Sun at|The sun is down/.test(p.moreText) && /Plants are symbols/.test(p.moreText) && /Arrow keys/.test(p.moreText) && !/Plants are symbols|Arrow keys/.test(p.mainText), p);
  check('with the heights not read, that is said at first (it matters for this field now)', /Heights not read/.test(p.mainText), p.mainText);
});
await t.group('3d: a flat schematic and a plain status when heights are missing', async () => {
  await open(1280, PLAN.corn);
  const w = await js(`document.querySelector('.f3d-heights').textContent`);
  check('it says the heights were not read and the land is flat', /Heights not read/.test(w), w);
  check('and no height map is credited where none is drawn', await js(`!document.querySelector('.f3d-credit')`));
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

await t.group('shade: where the shade of the land falls, at the hour shown, with its sentence; the first-open rules', async () => {
  await size(1280); await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`localStorage.setItem('crophalo.farm3d.land', JSON.stringify({ shade: true }))`);
  await t.go(PAGE); await until('window.ready === true', 8000);
  const st = await js(`demo.open(${JSON.stringify(PLAN.corn)}, { hills: true, ridge: true })`);
  same('shade: the view is ready with the Shade switch remembered on', [st, await js(`document.querySelector('[data-shade]').checked`)], ['ready', true]);
  await until(`window.view.shade && window.view.shade.state === 'ready'`, 30000);
  await sleep(500);
  const w1 = await js(`document.querySelector('[data-shade-words]').innerText`);
  check('shade: the shade job answered for the field at this hour, and the words say how much of it is shaded', /about \d+% of it is in the shade of (the land|the hills|trees)\./.test(w1) || /in the shade of/.test(w1), w1);
  check('shade: the sentence that must be on screen is there: "Shade figures are about, to the half hour."', w1.includes('Shade figures are about, to the half hour.'), w1);
  const stats = await js(`(async () => view.stats())()`).catch(() => null);
  const cells = await js(`(async () => { const s = await view.stats(); return s?.shadeCells ?? null; })()`);
  check('shade: hatching is drawn on the ground (cells in shade of the 45 m ridge to the south)', cells > 0, cells);
  const before = cells, wordsBefore = w1;
  await js(`(() => { const r = document.querySelector('[data-hour]'); r.value = String(+r.max - 3 * 6e5); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(2500);
  const after = await js(`(async () => (await view.stats()).shadeCells)()`), w2 = await js(`document.querySelector('[data-shade-words]').innerText`);
  check('shade: another hour gives another shade: the sun is low near sunset, so the shadow of the ridge is longer, and the words follow', after !== before && w2 !== wordsBefore, [before, after, w2.slice(0, 120)]);
  same('shade: the one shader program is still the only one after the shade changed', await js(`(async () => (await view.stats()).programs)()`), 1);
  await js(`(() => { const c = document.querySelector('[data-shade]'); c.click(); })()`);
  await sleep(800);
  same('shade: switched off it draws no hatching and says so', [await js(`(async () => (await view.stats()).shadeCells)()`), await js(`document.querySelector('[data-shade-words]').innerText`)], [0, 'Shade off.']);
  await shot('3d-shade-1280.png');
  // no heights: honest
  await js(`localStorage.setItem('crophalo.farm3d.land', JSON.stringify({ shade: true }))`);
  await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`{ const real = window.fetch.bind(window); window.fetch = (u, o) => String(u).includes('/api/dem') ? Promise.resolve(new Response('{"ok":false}', { status: 200, headers: { 'content-type': 'application/json' } })) : real(u, o); }`);   // the land heights are not read here (no live lookup in the test site)
  await js(`demo.open(${JSON.stringify(PLAN.corn)}, {})`);
  await until(`window.view.shade && window.view.shade.state !== 'off'`, 10000).catch(() => {});
  await sleep(600);
  check('shade: with no heights the shade says so and draws nothing (a missing height never shades and never clears)', /Heights not read, so the shade cannot be worked out\./.test(await js(`document.querySelector('[data-shade-words]').innerText`)) && await js(`(async () => (await view.stats()).shadeCells)()`) === 0);
  // the year replay legend
  await js(`localStorage.removeItem('crophalo.farm3d.land')`);
  await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`{ const real = window.fetch.bind(window); window.fetch = (u, o) => String(u).includes('/api/dem') ? Promise.resolve(new Response('{"ok":false}', { status: 200, headers: { 'content-type': 'application/json' } })) : real(u, o); }`);   // no live height lookup in the test site
  await js(`demo.open(${JSON.stringify(PLAN.corn)}, { pastYear: 2012 })`);
  same('legend: during the year replay the words say "2012: past weather, not today"', await js(`document.querySelector('.f3d-past').textContent`), '2012: past weather, not today');
  check('legend: any other day there is no such line (nothing empty is left on the page)', await js(`(async () => { await demo.next(${JSON.stringify(PLAN.corn)}, {}); await new Promise(r => setTimeout(r, 400)); const p = document.querySelector('.f3d-past'); return !p; })()`));
});

await t.group('shade low sun: the Mead field (Nebraska) in the morning, at noon and a low sun, plant shadows painted and the shade of the ridge', async () => {
  await size(1280); await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`localStorage.setItem('crophalo.farm3d.land', JSON.stringify({ shade: true }))`);
  await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`{ const real = window.fetch.bind(window); window.fetch = (u, o) => String(u).includes('/api/dem') ? Promise.resolve(new Response('{"ok":false}', { status: 200, headers: { 'content-type': 'application/json' } })) : real(u, o); }`);
  const MEAD = { lat: 41.179469, lon: -96.439756 };
  same('low sun: the Mead field opens', await js(`demo.open(${JSON.stringify(PLAN.corn)}, { hills: true, ridge: true, pin: ${JSON.stringify(MEAD)}, date: '2027-10-05' })`), 'ready');
  await until(`window.view.shade && window.view.shade.state === 'ready'`, 30000);
  const hours = await js(`(() => { const r = document.querySelector('[data-hour]'); return { min: +r.min, max: +r.max }; })()`);
  const setHour = async ms => { await js(`(() => { const r = document.querySelector('[data-hour]'); r.value = String(${ms}); r.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(2500); return js(`(async () => (await view.stats()).shadeCells)()`); };
  const low = await setHour(hours.min + 4 * 6e5), noon = await setHour(Math.round((hours.min + hours.max) / 2 / 6e5) * 6e5), evening = await setHour(hours.max - 4 * 6e5);
  check('low sun: the shade of the ridge to the south is wider with the sun low than at noon (cells in shade: morning, noon, evening)', low > noon && evening > noon, [low, noon, evening]);
  await setHour(hours.max - 4 * 6e5);
  await shot('3d-mead-low-sun-1280.png');
});

await t.group('motion hooks: the first view\'s facts, a time of day for the sun, the steps as events', async () => {
  await size(1280); await t.go(PAGE); await until('window.ready === true', 8000);
  await js(`{ const real = window.fetch.bind(window); window.fetch = (u, o) => String(u).includes('/api/dem') ? Promise.resolve(new Response('{"ok":false}', { status: 200, headers: { 'content-type': 'application/json' } })) : real(u, o); }`);   // no live height lookup in the test site
  await js(`window.__steps = []; document.addEventListener('f3d-step', e => window.__steps.push(e.detail.step)); window.__ready = 0; document.addEventListener('f3d-ready', () => window.__ready++);`);
  same('hooks: the view is ready', await js(`demo.open(${JSON.stringify(PLAN.corn)}, {})`), 'ready');
  const steps = await js('window.__steps');
  check('hooks: the real build steps arrive as events in build order, then ready once', await js('window.__ready') === 1 && steps.includes('land') && steps.indexOf('land') < steps.indexOf('light'), steps);
  const f = await js('view.firstView()');
  check('hooks: the first view has its tilt and field of view, and the field is inside the picture', f && f.tilt >= 50 && f.fov >= 30 && f.box.x0 > 0 && f.box.x1 < 1 && f.box.y0 > 0 && f.box.y1 < 1 && f.size.width > 100, f);
  const cam0 = await js('view.camera()'), day = await js('view.sunDay()');
  check('hooks: the shown date has a sunrise before noon before sunset', day && day.rise < day.noon && day.noon < day.set, day);
  const programs = async () => js('(async () => { const s = await view.stats(); return [s.programs, s.scenes, s.plants, s.landTriangles]; })()');
  const at = async ms => { const r = await js(`view.sun(${ms})`); await until(`window.view.sunShown === ${r.ms}`, 8000); return r; };
  const a = await at(day.rise + 30 * 60000), before = await programs(), b = await at(day.noon), c = await at(day.set - 30 * 60000);
  check('hooks: the sun at three times of day is up, from the east, the south and the west, and the words say each time', a.up && b.up && c.up && a.azimuth < b.azimuth && b.azimuth < c.azimuth && a.words !== b.words && b.words !== c.words, [a, b, c].map(x => [x.ms, Math.round(x.azimuth), Math.round(x.height)]));
  same('hooks: nothing was rebuilt while the sun moved (same scenes drawn, same plants and land, one shader program)', await programs(), before);
  same('hooks: there is still one sun light', await js('(async () => view.lightCount())()'), 1);
  const burst = await js(`(async () => { let last; for (let i = 1; i <= 40; i++) { last = view.sun(${day.rise} + i * 15 * 60000); await new Promise(r => requestAnimationFrame(r)); } return last; })()`);
  await until(`window.view.sunShown === ${burst.ms}`, 10000);
  check('hooks: a call for every frame is folded into the newest: the last time asked is on the glass', await js('window.view.sunShown') === burst.ms, burst.ms);
  const back = await js('view.sun(null)');
  check('hooks: asking for no time returns to the date\'s own sun, as Still shows it', back.ms === (await js('view.scene().momentMs')), back);
  same('hooks: the farmer\'s camera is not touched by the sun', (await js('view.camera()')).position, cam0.position);
});

await t.finish();
