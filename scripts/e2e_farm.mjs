// The My farm browser suite: a report's field opens at once on the map, one date, one finding, Compare plans, the Map and 3D switch, editing (E2E_ONLY picks groups).
// The ground-cover answers in "compare" come from a stand-in written in this file, so the screen's words can be checked before the engine answers; the app ships none.
// RULE: never loosen a check here to make it pass without a written farming reason beside it. Run: node scripts/e2e_farm.mjs
import { openRun } from './e2e_lib.mjs';
import { REPORT } from './fixtures/demo-plans.mjs';

const run = await openRun('e2e_farm');
const { js, page, until, seen, tap, press, size, device, go, flat, shot, check, same, group, finish, sleep } = run;
const REPORT_JS = JSON.stringify(REPORT);
const open = async () => { await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${REPORT_JS}); })`); await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`); await sleep(300); };
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);
// the stand-in: states chosen by date from the plans' own harvest dates, only to see the words drawn
const STAND_IN = `window.__farm.setGround((plan, date) => { const w = plan.seasons.find(s => s.crop === 'wheat'); if (date <= '2028-10-05') return { state: 'residue', crop: null, stage: null, label: 'Planned', note: 'Soybean stalks lie on the ground after the harvest.' }; if (date < '2029-04-01') return w ? { state: 'cover', crop: 'wheat', stage: 1, label: 'Planned', note: 'Young winter wheat covers the rows.' } : { state: 'residue', crop: null, stage: null, label: 'Planned', note: 'Stalks and stubble.' }; return w ? { state: 'crop', crop: 'wheat', stage: 3, label: 'Planned', note: 'Winter wheat is growing.' } : { state: 'bare', crop: null, stage: null, label: 'Planned', note: 'Bare until corn is sown.' }; })`;

await group('empty', async () => {
  await js(`import('/js/app.js').then(m => m.show('farm'))`);
  await until(`!document.querySelector('#view-farm').hidden && document.querySelector('#fwEmpty') && !document.querySelector('#fwEmpty').hidden`);
  check('empty: says how a field arrives', /Add to my farm/.test(await text('#fwEmpty')), await text('#fwEmpty'));
  same('empty: Compare plans is off', await js(`document.querySelector('#fwCompare').disabled`), true);
  same('empty: one h1 named My farm', await js(`[...document.querySelectorAll('#view-farm h1')].map(h => h.textContent)`), ['My farm']);
});

await group('report', async () => {
  await open();
  const r = await js('window.__res');
  check('report: the hand-off answers with a farm and a field', r?.farmId && r?.fieldId, r);
  same('report: My farm is on screen at once', await js(`document.title`), 'My farm · Crophalo');
  same('report: the field is chosen', await js(`document.querySelector('#fwField').value === window.__res.fieldId`), true);
  check('report: the field is named and marked estimated', /\(estimated\)/.test(await js(`document.querySelector('#fwField').selectedOptions[0].textContent`)), await js(`document.querySelector('#fwField').selectedOptions[0].textContent`));
  check('report: ONE visible date', (await js(`[...document.querySelectorAll('#fwHud time')].length`)) === 1);
  same('report: its date is the one handed over', await text('#fwTime'), '5 Oct 2028');
  same('report: no ground answer yet, so the label says so', await text('#fwLabel'), 'not read yet');
  check('report: the finding says "not read yet", never a made-up state', /not read yet/.test(await text('#fwFinding')) && !/bare|residue|wheat/i.test(await text('#fwFinding')), await text('#fwFinding'));
  same('report: the finding is one line of words ending in a full stop', /\.$/.test(await text('#fwFinding')), true);
  check('report: Compare plans is there and ready', await js(`!document.querySelector('#fwCompare').disabled && document.querySelector('#fwCompare').textContent.trim() === 'Compare plans'`));
  check('report: the board is a real map with the field drawn', await js(`!!document.querySelector('#fwMap.leaflet-container') && document.querySelectorAll('#fwMap path.fw-field').length === 1`));
  check('report: the chosen field has a gold halo', await js(`document.querySelectorAll('#fwMap path.fw-halo').length === 1`));
  check('report: "you are here" marker is named', await js(`!!document.querySelector('#fwMap [aria-label^="You are here: the pin of"]')`));
  check('report: the token is a named button', /^Barrie|^North|^Home|field/i.test(await js(`document.querySelector('.fw-token')?.getAttribute('aria-label') || ''`)), await js(`document.querySelector('.fw-token')?.getAttribute('aria-label')`));
  check('report: the field is visible inside the map', await js(`(() => { const m = document.querySelector('#fwMap').getBoundingClientRect(), p = document.querySelector('#fwMap path.fw-field').getBoundingClientRect(); return p.width > 40 && p.left >= m.left - 1 && p.right <= m.right + 1; })()`));
  check('report: no props, sales or exports in the first view', !/\bsales\b|\bexport|\bprops\b|\bcsv\b/i.test(await text('#fw')), '');
  // a repeat add never makes a second field
  await js(`window.__farm.addFromReport(${REPORT_JS})`); await sleep(200);
  same('report: a repeat add keeps one field', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields.length`), 1);
  same('report: and one farm', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms.length`), 1);
  same('report: the field is stored as estimated', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields[0].estimated`), true);
  await shot('farm-first-open-1280.png');
  // 44 px targets
  const small = await js(`[...document.querySelectorAll('#fw button, #fw select')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5) && !b.closest('.leaflet-control-attribution'); }).map(b => b.id || b.className)`);
  same('report: every button is at least 44 px', small, []);
});

await group('compare', async () => {
  await open(); await js(STAND_IN); await sleep(100);
  same('compare: with an answer the chip says Planned', await text('#fwLabel'), 'Planned');
  check('compare: the finding names both plans in one sentence', /^On 5 Oct 2028 the current plan has .+ and the proposed plan has .+\.$|^On 5 Oct 2028 both plans have/.test(await text('#fwFinding')), await text('#fwFinding'));
  await tap('#fwCompare'); await until(`!document.querySelector('#fwPanel').hidden`);
  same('compare: the button says it is open', await js(`document.querySelector('#fwCompare').getAttribute('aria-expanded')`), 'true');
  same('compare: focus moves into the panel heading', await js(`document.activeElement?.id`), 'fwPanelTitle');
  same('compare: three dates', await js(`[...document.querySelectorAll('.fw-step span')].map(s => s.textContent)`), ['Soybean harvest', 'Fall establishment', 'Spring growth']);
  same('compare: their dates', await js(`[...document.querySelectorAll('.fw-step small')].map(s => s.textContent)`), ['5 Oct 2028', '11 Nov 2028', '15 May 2029']);
  same('compare: two plans on one date', await js(`[...document.querySelectorAll('.fw-card h3')].map(h => h.textContent)`), ['Current plan', 'Proposed plan']);
  same('compare: ONE visible date line', await js(`document.querySelectorAll('.fw-onedate time').length`), 1);
  check('compare: every state is written Planned', await js(`[...document.querySelectorAll('.fw-card .fw-label')].every(l => /^(Planned|Observed)$/.test(l.textContent)) && document.querySelectorAll('.fw-card .fw-label').length === 2`));
  const t = await text('.fw-cards');
  check('compare: residue on the current side on harvest day', /Crop residue/.test(t) && /Soybean stalks/.test(t), t);
  await tap('.fw-step[data-i="1"]'); await sleep(100);
  check('compare: fall establishment: wheat covers the proposed field, residue stays on the current one', /Young winter wheat/.test(await text('.fw-cards')), await text('.fw-cards'));
  same('compare: the date chip follows', await text('#fwTime'), '11 Nov 2028');
  await tap('#fwNext'); await sleep(100);
  same('compare: the stepper goes to spring', await text('#fwTime'), '15 May 2029');
  check('compare: spring: wheat is growing', /Winter wheat is growing/.test(await text('.fw-cards')));
  same('compare: Next is off on the last date', await js(`document.querySelector('#fwNext').disabled`), true);
  const cav = await text('.fw-caveat');
  check('compare: the planting window is written with its dates', /Planting window for Winter wheat: 20 Sep 2028 to 15 Oct 2028/.test(cav), cav);
  check('compare: the late-harvest caveat is there', /late soybean harvest squeezes it/i.test(cav) && /inside the window/.test(cav), cav);
  const open2 = await js(`document.querySelector('.fw-fold').open`);
  same('compare: the assumptions are written (in a fold)', open2, false);
  await js(`document.querySelector('.fw-fold').open = true`);
  const asm = await text('.fw-fold');
  check('compare: loam assumed, rain-fed, estimated outline', /loam, assumed/.test(asm) && /rain-fed/.test(asm) && /Outline: estimated, a square of 10\.0 ha/.test(asm), asm);
  await shot('farm-compare-1280.png');
  await press('Escape'); await sleep(100);
  same('compare: Escape closes the panel', await js(`document.querySelector('#fwPanel').hidden`), true);
  same('compare: and focus returns to the button', await js(`document.activeElement?.id`), 'fwCompare');
  same('compare: the date chosen stays', await text('#fwTime'), '15 May 2029');
  const small = await js(`(() => { document.querySelector('#fwCompare').click(); return [...document.querySelectorAll('#fwPanel button')].filter(b => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(b => b.id || b.className); })()`);
  same('compare: every panel button is at least 44 px', small, []);
});

await group('switch', async () => {
  await open(); await js(STAND_IN);
  await js(`document.querySelector('#fwCompare').click()`); await tap('.fw-step[data-i="1"]');
  await js(`document.querySelector('#fwCompare').click()`);
  const before = await js(`({ f: document.querySelector('#fwField').value, d: document.querySelector('#fwTime').textContent })`);
  await js(`window.__farm.setView3d(() => { throw new Error('no 3D here'); })`);
  await js(`Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value() { return { getExtension: () => null }; }, configurable: true }); 0`);
  await tap('#fwThreeBtn'); await sleep(500);
  const msg = await text('#fwStatus');
  check('switch: with no 3D drawing the board stays and says why', /This device cannot draw 3D|could not load/.test(msg || ''), msg);
  same('switch: still on the map', await js(`document.querySelector('#fwMapBtn').getAttribute('aria-pressed')`), 'true');
  same('switch: the field and the date survive', await js(`({ f: document.querySelector('#fwField').value, d: document.querySelector('#fwTime').textContent })`), before);
  check('switch: the map still has its field', await js(`document.querySelectorAll('#fwMap path.fw-field').length === 1`));
  // a 3D view that draws: the stand-in is the page's own function
  await js(`window.__farm.setView3d((data, node) => { node.dataset.got = JSON.stringify({ field: data.field.id, planKind: data.planKind, date: data.date, ground: data.ground?.state ?? null }); node.textContent = '3D'; return { ok: true, update(next) { node.dataset.got = JSON.stringify({ field: next.field.id, planKind: next.planKind, date: next.date, ground: next.ground?.state ?? null }); }, dispose() {} }; })`);
  await tap('#fwThreeBtn'); await sleep(300);
  same('switch: the 3D node opens', await js(`!document.querySelector('#fw3d').hidden && document.querySelector('#fwMap').hidden`), true);
  const got = JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`));
  same('switch: 3D receives the field, the plan and the date chosen', [got.field, got.planKind, got.date], [await js('window.__res.fieldId'), 'proposed', '2028-11-11']);
  same('switch: and what covers the ground then', got.ground, 'cover');
  await js(`window.__farm._ui.date = '2029-05-15'; window.__farm.render()`); await sleep(100);
  same('switch: a change of date while in 3D reaches the 3D view by update()', JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`)).date, '2029-05-15');
  await js(`window.__farm._ui.date = '2028-11-11'; window.__farm.render()`);
  await tap('#fwMapBtn'); await sleep(200);
  same('switch: back on the map, nothing lost', await js(`({ f: document.querySelector('#fwField').value, d: document.querySelector('#fwTime').textContent, m: document.querySelectorAll('#fwMap path.fw-field').length })`), { ...before, m: 1 });
});

await group('edit', async () => {
  await open();
  await tap('#fwEditBtn'); await until(`!document.querySelector('#fwEditMenu').hidden`);
  same('edit: the occasional tools sit under Edit field', await js(`[...document.querySelectorAll('#fwEditMenu button')].map(b => b.textContent)`), ['Rename', 'Recently deleted', 'Delete']);
  check('edit: Delete is red', await js(`getComputedStyle(document.querySelector('#fwEditMenu .fw-danger')).color`) !== await js(`getComputedStyle(document.querySelector('#fwEditMenu button')).color`));
  await press('Escape'); same('edit: Escape closes the menu and focus returns', await js(`document.activeElement.id`), 'fwEditBtn');
  await tap('#fwEditBtn'); await tap('[data-edit=rename]'); await until(`!document.querySelector('#fwPanel').hidden`);
  await js(`document.querySelector('#fwName').value = ''`); await js(`document.querySelector('#fwRename').requestSubmit()`);
  same('edit: an empty name is refused in words', await text('#fwNameErr'), 'Give the field a name.');
  await js(`document.querySelector('#fwName').value = 'Creek bottom'`); await js(`document.querySelector('#fwRename').requestSubmit()`); await sleep(200);
  check('edit: renamed, with Undo', /^Creek bottom/.test(await js(`document.querySelector('#fwField').selectedOptions[0].textContent`)) && /Renamed to Creek bottom/.test(await text('#fwToast')), await text('#fwToast'));
  await tap('#fwUndo'); await sleep(200);
  check('edit: Undo puts the name back', !/Creek/.test(await js(`document.querySelector('#fwField').selectedOptions[0].textContent`)));
  await tap('#fwEditBtn'); await tap('[data-edit=delete]'); await until(`document.querySelector('#fwDoDelete')`);
  check('edit: the confirmation says what is removed', /Delete .+\?/.test(await text('#fwPanelTitle')) && /Recently deleted for 30 days/.test(await text('#fwPanel')), await text('#fwPanel'));
  check('edit: the red Delete button', await js(`getComputedStyle(document.querySelector('#fwDoDelete')).backgroundColor`) !== await js(`getComputedStyle(document.querySelector('#fwKeep')).backgroundColor`));
  await tap('#fwDoDelete'); await sleep(300);
  same('edit: the board is empty again', await js(`!document.querySelector('#fwEmpty').hidden`), true);
  await tap('#fwUndo'); await sleep(300);
  same('edit: Undo brings the field back', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
  await tap('#fwEditBtn'); await tap('[data-edit=delete]'); await tap('#fwDoDelete'); await sleep(300);
  await js(`document.querySelector('#fwEmpty') && 1`); await js(`document.querySelector('#fwEditBtn').disabled = false`);
  await js(`document.querySelector('#fwEditBtn').click()`); await js(`document.querySelector('[data-edit=recent]').click()`); await until(`document.querySelector('[data-restore]')`);
  check('edit: Recently deleted lists it', /deleted/.test(await text('.fw-list')), await text('.fw-list'));
  await tap('[data-restore]'); await sleep(300);
  same('edit: Restore brings it back with its plan', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
  same('edit: its report plans came with it', await js(`!document.querySelector('#fwCompare').disabled`), true);
  await go('/'); await js(`document.querySelector('#navFarm').click()`); await until(`document.querySelector('#fwFinding')?.textContent.length > 5`); await sleep(300);
  same('edit: after a reload the field is still there', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
});

await group('fit', async () => {
  for (const w of [320, 375, 1280]) {
    await size(w); await go('/'); await open(); await js(STAND_IN); await js(`document.documentElement.dataset.text = 'xlarge'`);
    await flat(`farm ${w}`);
    await js(`document.querySelector('#fwCompare').click()`); await sleep(150); await flat(`compare ${w}`);
    if (w === 375) await shot('farm-compare-375.png');
    await js(`document.querySelector('#fwClose')?.click()`);
    if (w === 375) await shot('farm-first-open-375.png');
  }
});

await finish();
