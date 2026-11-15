// Crophalo's real-browser suite for the setup map's three tools, Pin, Rectangle and Corners, by mouse, by finger and by keys: every state, undo, cancel, editing, the area chip, what is said, the targets, the fit and the three motion levels.
// Groups (E2E_ONLY=touch picks some): pin, rect, poly, touch, keys, edit, lose, pinway, zoomguard, units, names, precise, phone, layout, motion, axe. Every input is real (mouse, finger, key): no check calls element.click() on a map control.
// RULE: never loosen a check here without a written farming reason beside it: a farmer in the field must be able to place, outline, fix and use the field with any hand. Run: node scripts/e2e_maptools.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_maptools');
const { ROOT, js, until, seen, tap, tapAt, rest, press, size, go, flat, check, same, group, finish, sleep, send, shot, point, dragMouse, dblclickAt, wheel, touchOn, touchTap, swipe, pinch } = run;
// The copy under test has no Python, so the server's own lookups cannot answer there: the early lookups a chosen place starts are answered "not read" at the page (as scripts/e2e_map.mjs does), so the copy's refusals are not logged as errors of the page.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'not in this copy' }), { headers: { 'content-type': 'application/json' } })) : first(u, ...rest); })();" });
const WOOD = { lat: 43.0981, lon: -80.7869 };   // real fields south-west of Woodstock, Ontario: their grid runs about 40 degrees off north
const WIDTHS = [320, 375, 390, 768, 1280];
const UA = await js('navigator.userAgent');
const lang = locale => send('Emulation.setUserAgentOverride', { userAgent: UA, acceptLanguage: locale });
await lang('en-CA');   // a Canadian browser: acres come first, hectares second (the units group changes it)

// ---- what the page is asked
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const MAP = `(await import('/js/mapbase.js')).baseNow().leaflet()`;
async function open(where = WOOD, zoom = 16) {   // the setup for a place, the map at that zoom, nothing else on it
  await acceptWelcome(); await go('/');
  await js(`(async () => { const w = await import('/js/wizard.js'); w.setPlace(${where ? JSON.stringify({ lat: where.lat, lon: where.lon, name: 'Test field' }) : 'null'}); (await import('/js/app.js')).show('setup'); })()`);
  await until(`!!document.querySelector('#mapx .leaflet-container') && !document.querySelector('#view-setup').hidden`);
  await sleep(300);
  await js(`(async () => { const map = ${MAP}; map.setView([${(where || WOOD).lat}, ${(where || WOOD).lon}], ${zoom}, { animate: false }); return 1; })()`);
  await sleep(300); await rest();
}
const S = () => js(`import('/js/mapx.js').then(m => JSON.parse(JSON.stringify(m.mapState())))`);
const zoomNow = () => js(`(async () => ${MAP}.getZoom())()`);
const giveField = async () => { const cc = await mid(); for (const p of [{ x: cc.x - 70, y: cc.y + 40 }, { x: cc.x + 60, y: cc.y + 40 }, { x: cc.x + 10, y: cc.y - 50 }]) { await touchTap(p.x, p.y); await sleep(400); } await sleep(500); };   // a drawn field for the setup (three taps with the Rectangle armed): Next needs one
const centreLL = () => js(`(async () => { const c = ${MAP}.getCenter(); return [c.lat, c.lng]; })()`);
const xy = (lat, lon) => js(`(async () => { const map = ${MAP}, r = map.getContainer().getBoundingClientRect(), p = map.latLngToContainerPoint([${lat}, ${lon}]); return { x: r.left + p.x, y: r.top + p.y }; })()`);
const ll = (x, y) => js(`(async () => { const map = ${MAP}, r = map.getContainer().getBoundingClientRect(), q = map.containerPointToLatLng([${x} - r.left, ${y} - r.top]); return [q.lat, q.lng]; })()`);
const drift = c0 => js(`(async () => { const map = ${MAP}, p = map.latLngToContainerPoint(${JSON.stringify(c0)}), s = map.getSize(); return Math.hypot(p.x - s.x / 2, p.y - s.y / 2); })()`);   // how far the old centre now is from the centre, in px
const still = () => until(`(async () => { const map = ${MAP}; return !map._animatingZoom && !map._panAnim?._inProgress && !map._flyToFrame; })()`, 4000).catch(() => {});   // the map has stopped moving
const mid = () => js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; })()`);
const centreOf = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
const words = () => js(`document.querySelector('#mapxHintText')?.textContent ?? ''`);
const said = () => js(`document.querySelector('#mapxLive').textContent`);
const toastNow = () => js(`document.querySelector('#toast').classList.contains('show') ? document.querySelector('#toast').firstChild?.textContent ?? '' : ''`);
const attr = (sel, name) => js(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
const looks = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.closest('[hidden]') || !e.getClientRects().length) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; })()`);
const boxState = () => js(`[document.querySelector('#mapx').dataset.tool, document.querySelector('#mapx').dataset.state]`);
const bar = act => `#mapxHint [data-act=${act}]`;
const area = ring => js(`import('/js/geo.js').then(g => g.areaHa(${JSON.stringify(ring)}))`);
// the corners' angles on the screen, from unrounded pixels (the map's own pixel points are whole numbers)
const angles = ring => js(`(async () => { const map = ${MAP}, p = ${JSON.stringify(ring)}.map(q => map.project(q, map.getZoom())); return p.map((c, i) => { const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length], u = [a.x - c.x, a.y - c.y], v = [b.x - c.x, b.y - c.y]; return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; }); })()`);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const tool = name => tap(`.mapx-seg [data-tool=${name}]`);
const fingerOn = async sel => { const c = await centreOf(sel); if (!c) throw new Error(`no ${sel} to touch`); await touchTap(c.x, c.y); };
const pinTip = async () => { const s = await S(); return xy(s.pin.lat, s.pin.lon); };
async function mouseDraw(points, pause = 140) { for (const p of points) { await tapAt(p.x, p.y); await sleep(pause); } }
async function focusMap() {   // into the map with the Tab key, the way a keyboard farmer arrives
  await js(`document.querySelector('#wBack').focus()`);
  for (let i = 0; i < 4 && !(await js(`document.activeElement?.id === 'mapx'`)); i++) await press('Tab');
}
const notBody = () => js(`document.activeElement !== document.body && document.activeElement !== null`);
const ANIMS = `document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target && document.querySelector('#mapx').contains(a.effect.target) && !a.effect.target.closest('.mapx-busy'))`;   // the loading sign's turning ring is the house sign, it turns only while the map loads and is not a motion of the drawing
const animsNow = () => js(`${ANIMS}.map(a => { const t = a.effect.getTiming(), k = a.effect.getKeyframes(); return { name: a.animationName || a.transitionProperty || 'script', props: [...new Set(k.flatMap(f => Object.keys(f).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))], ms: +t.duration || 0, delay: +t.delay || 0, iter: t.iterations === Infinity ? 'Infinity' : t.iterations, el: a.effect.target.className?.baseVal ?? a.effect.target.className ?? '' }; })`);
const COLOURS = ['color', 'backgroundColor', 'background-color', 'borderColor', 'border-color', 'outlineColor', 'outline-color', 'boxShadow', 'box-shadow', 'fill', 'stroke', 'filter'];   // a shade may change under Less: it is not a movement
// what the showing toast covers of the map's bar and the setup's Next button (an empty list: nothing)
const UNDER_TOAST = `(() => { const t = document.querySelector('#toast'); if (!t.classList.contains('show')) return ['no toast']; const a = t.getBoundingClientRect(); return ['#mapxHint', '#wNext'].filter(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); return a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom; }); })()`;

// ---------------------------------------------------------------- the pin, by mouse
await group('rect', async () => {
  await open(WOOD, 16);
  const c = await mid(), c0 = await centreLL();
  await tool('rect'); await sleep(200);
  same('Rectangle is armed, its words fit a mouse', [await boxState(), await words()], [['rect', 'armed'], 'Draw your field here: drag a rectangle, or click its corners.']);
  check('the highlight slides to the pressed tool', await js(`(() => { const seg = document.querySelector('.mapx-seg'), b = seg.querySelector('[aria-pressed=true]'); return seg.classList.contains('slide') && Math.abs(parseFloat(seg.style.getPropertyValue('--x')) - b.offsetLeft) <= 1 && Math.abs(parseFloat(seg.style.getPropertyValue('--w')) - b.offsetWidth) <= 1; })()`));
  await sleep(250);
  check('the pin dims and steps out of the way while drawing', await js(`(() => { const p = document.querySelector('.mapx-pin'), cs = getComputedStyle(p); return +cs.opacity <= .45 && cs.pointerEvents === 'none' && p.tabIndex === -1 && p.getAttribute('aria-hidden') === 'true'; })()`));
  // three clicks, turned about 40 degrees like the fields here
  const A = { x: c.x - 300, y: c.y + 40 }, B = { x: c.x - 130, y: c.y - 103 }, P = { x: c.x - 20, y: c.y + 30 };   // left of the middle: the card on the right does not cover it, so the view has no reason to move
  const [la, lb, lp] = [await ll(A.x, A.y), await ll(B.x, B.y), await ll(P.x, P.y)];
  await tapAt(A.x, A.y); await sleep(150);
  same('one click is the first corner, never a scolding', [await boxState(), await words(), await toastNow()], [['rect', 'drawing'], 'Click the next corner along the same side.', '']);
  same('and it is said', await said(), 'First corner set.');
  await point({ x: c.x - 180, y: c.y - 40 }); await sleep(120);
  check('a guide line runs to the pointer with its length at its middle', await looks('path.mapx-guide') && /^[\d,.]+ (m|km|ft|mi)$/.test(await js(`document.querySelector('.mapx-len')?.dataset.text ?? ''`)), await js(`document.querySelector('.mapx-len')?.dataset.text ?? 'no label'`));
  await tapAt(B.x, B.y); await sleep(150);
  same('the second click sets the side', await words(), 'Click the far side of your field.');
  check('the side is said with its length', /^Side set, [\d,.]+ (metres|feet|km|mi)\. Now the far side\.$/.test(await said()), await said());
  await point({ x: P.x - 20, y: P.y - 10 }); await point(P); await sleep(150);
  check('the rectangle grows with the pointer: a preview fill and the live chip', await looks('path.mapx-fillpre') && /^≈ [\d,.]+ acres? · [\d,.]+ ha$/.test(await js(`document.querySelector('#mapxChip')?.textContent ?? ''`)), await js(`document.querySelector('#mapxChip')?.textContent ?? 'no chip'`));
  await tapAt(P.x, P.y); await sleep(300);
  const s = await S();
  check('the third click finishes a 4-corner outline', Array.isArray(s.ring) && s.ring.length === 4, s.ring);
  const ang = s.ring ? await angles(s.ring) : [];
  check('every corner is square: 90 degrees, give or take half a degree', ang.length === 4 && ang.every(a => near(a, 90, 0.5)), ang);
  const want = await js(`import('/js/geo.js').then(g => g.areaHa(g.threePointRect(${JSON.stringify(la)}, ${JSON.stringify(lb)}, ${JSON.stringify(lp)})))`), got = s.ring ? await area(s.ring) : 0;
  check('its area is the turned rectangle through the three clicks (within 1%)', want > 0 && Math.abs(got - want) / want < 0.01, [got, want]);
  same('the tool goes back to Pin and the outline is selected with its handles', [await boxState(), await js(`document.querySelectorAll('.mapx-handle').length`)], [['pin', 'finished'], 4]);
  check('one message says the area in both units and the corners', /^Field outlined: [\d,.]+ acres?, [\d,.]+ hectares?, 4 corners\./.test(await said()), await said());
  same('the Area card opens beside the map, on its Area tab', await js(`document.querySelector('.spot [aria-selected=true]')?.textContent ?? null`), 'Area');
  check('the view did not jump for an outline drawn where the card does not cover it (the centre within 1 px)', (await drift(c0)) <= 1, await drift(c0));
  await shot('rect-finished-1280.png');
  await tap(bar('undo')); await sleep(200);
  const u = await S();
  same('Undo after the finish goes back to the side-set step, with a real mouse click', [u.ring, u.draft?.length, await words()], [null, 2, 'Click the far side of your field.']);
  await tap(bar('cancel')); await sleep(200);
  same('Cancel removes the drawing, the Rectangle stays armed (there is no Pin), with an Undo', [await boxState(), await toastNow()], [['rect', 'armed'], 'Rectangle drawing removed.']);
  await tap('#toast .btn'); await sleep(200);
  same('the toast\'s Undo brings the drawing and its tool back', [(await S()).draft?.length, await boxState()], [2, ['rect', 'drawing']]);
  check('and the keyboard is back on the map, not lost with the toast', await js(`document.querySelector('#mapx').contains(document.activeElement)`));
  await tap(bar('cancel')); await sleep(150); await tool('rect'); await sleep(150);
  // the quick north-up box by a mouse drag, and the map does not pan under it
  const c1 = await centreLL();
  await dragMouse({ x: c.x - 320, y: c.y - 80 }, { x: c.x - 90, y: c.y + 90 }, { steps: 10 }); await sleep(300);   // where the card does not cover it: any move of the view would be the drag's
  const box = (await S()).ring;
  check('a press-and-drag draws a north-up box of four corners', Array.isArray(box) && box.length === 4 && box[0][0] === box[1][0] && box[0][1] === box[3][1], box);
  check('the map did not pan under the box', (await drift(c1)) <= 1, await drift(c1));
  await tool('rect'); await sleep(150);
  check('pressing Rectangle over an outline keeps the old one as a ghost', await looks('path.mapx-ghost'));
  await dragMouse({ x: c.x + 150, y: c.y + 120 }, { x: c.x + 158, y: c.y + 190 }, { steps: 6 }); await sleep(200);
  same('a box with a side under 12 px is refused in words, and the old outline stays', [await words(), JSON.stringify((await S()).ring) === JSON.stringify(box)], ['That is a line, not a field. Drag a wider box.', true]);
  await press('Escape'); await sleep(150);
  same('Escape restores the old outline at rest', [await boxState(), JSON.stringify((await S()).ring) === JSON.stringify(box)], [['pin', 'idle'], true]);
});

// ---------------------------------------------------------------- the polygon, by mouse
await group('poly', async () => {
  await open(WOOD, 16);
  const c = await mid();
  await tool('poly'); await sleep(150);
  same('Corners is armed, its words fit a mouse', await words(), 'Click each corner of your field.');
  const pts = [{ x: c.x - 170, y: c.y - 110 }, { x: c.x + 150, y: c.y - 120 }, { x: c.x + 170, y: c.y + 110 }, { x: c.x - 150, y: c.y + 120 }];
  await tapAt(pts[0].x, pts[0].y); await sleep(150);
  same('the first corner', [await words(), await said()], ['Click the next corner.', 'Corner 1 added.']);
  await tapAt(pts[1].x, pts[1].y); await sleep(150); await tapAt(pts[2].x, pts[2].y); await sleep(150);
  same('from three corners the words offer the close', await words(), 'Click the next corner, or click the first corner to finish.');
  check('the third corner says the area so far', /^Corner 3 added, about [\d,.]+ acres?, [\d,.]+ hectares? so far\.$/.test(await said()), await said());
  await point({ x: pts[3].x + 10, y: pts[3].y - 10 }); await sleep(120);
  check('the guide line, the closing line and a light fill follow the pointer', await looks('path.mapx-guide') && await looks('path.mapx-closing') && await looks('path.mapx-fillpre'));
  check('the drawing is really drawn: its lines and dots are not squeezed out of sight', await js(`['mapx-draft', 'mapx-dots'].every(p => { const s = document.querySelector('.leaflet-' + p + '-pane > svg'); return s && Math.abs(s.getBoundingClientRect().width - +s.getAttribute('width')) < 1 && s.getBoundingClientRect().height > 100; })`), await js(`['mapx-draft', 'mapx-dots'].map(p => { const s = document.querySelector('.leaflet-' + p + '-pane > svg'); return s ? [s.getAttribute('width'), Math.round(s.getBoundingClientRect().width)] : 'none'; })`));
  const chip = await js(`(() => { const e = document.querySelector('#mapxChip'); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, text: e.textContent }; })()`);
  check('the live chip sits by the pointer: 16 px right and below', !!chip && /^≈ [\d,.]+ acres? · [\d,.]+ ha$/.test(chip.text) && near(chip.x, pts[3].x + 10 + 16, 3) && near(chip.y, pts[3].y - 10 + 16, 3), chip);
  check('the first corner shows its close ring', await looks('path.mapx-ring'));
  await tapAt(pts[3].x, pts[3].y); await sleep(150);
  await point({ x: pts[0].x + 14, y: pts[0].y + 14 }); await sleep(150);
  same('20 px from the first corner the magnet takes it: closing', (await boxState())[1], 'closing');
  same('the words say a click closes it, and the cursor is a hand', [await words(), await js(`getComputedStyle(document.querySelector('#mapxCanvas')).cursor`)], ['Click to close the outline.', 'pointer']);
  await tapAt(pts[0].x + 14, pts[0].y + 14); await sleep(300);
  const s = await S();
  check('a click 20 px from the first corner closes the outline with its 4 corners', Array.isArray(s.ring) && s.ring.length === 4, s.ring);
  await tap(bar('undo')); await sleep(200);
  same('Undo after the close opens it again with every corner', [(await S()).draft?.length, (await S()).ring, await said()], [4, null, 'Outline open again, 4 corners.']);
  await tap(bar('finish')); await sleep(300);
  check('Finish closes it, by a real mouse click', (await S()).ring?.length === 4);
  await tap(bar('done')); await sleep(200);
  same('Done ends the editing: the handles go, the outline rests', [await boxState(), await js(`document.querySelectorAll('.mapx-handle').length`)], [['pin', 'idle'], 0]);
  // Start again, then a double click finishes
  await tapAt(c.x, c.y); await sleep(250);
  same('a click on the outline selects it again', (await boxState())[1], 'finished');
  await tap('[data-spot=again]'); await sleep(250);
  same('Start again removes the outline with an Undo, and arms the tool that made it', [await toastNow(), await boxState(), (await S()).ring], ['Outline removed.', ['poly', 'armed'], null]);
  await mouseDraw(pts.slice(0, 3));
  await dblclickAt(c.x - 120, c.y + 90); await sleep(300);
  same('a double click adds that corner and finishes', (await S()).ring?.length, 4);
  // a corner that would cross is refused
  await tap('[data-spot=again]').catch(() => {}); await sleep(250);
  if ((await boxState())[1] !== 'armed') { await tool('poly'); await sleep(150); }
  await mouseDraw([{ x: c.x - 150, y: c.y - 100 }, { x: c.x + 150, y: c.y - 100 }, { x: c.x + 150, y: c.y + 100 }]);
  await point({ x: c.x - 40, y: c.y - 160 }); await sleep(120);
  check('where the next line would cross, the chip says so and the cursor refuses', /Lines cross/.test(await js(`document.querySelector('#mapxChip')?.textContent ?? ''`)) && await js(`getComputedStyle(document.querySelector('#mapxCanvas')).cursor`) === 'not-allowed');
  await tapAt(c.x - 40, c.y - 160); await sleep(200);
  same('a corner whose line would cross is refused with the words, and the drawing stays open', [await words(), (await S()).draft?.length, (await S()).ring], ['Lines can\'t cross. Put this corner where they don\'t.', 3, null]);
  check('an × marks the refused spot', await looks('.mapx-x'));
});

// ---------------------------------------------------------------- by finger, on a phone
await group('touch', async () => {
  try {
    await size(375, 812); await touchOn(true); await open(WOOD, 17);
    const vh = await js('innerHeight');
    check('on the field step the map is at least 60% of the screen', (await js(`document.querySelector('#mapx').getBoundingClientRect().height`)) >= vh * 0.6 - 1, [await js(`document.querySelector('#mapx').getBoundingClientRect().height`), vh]);
    same('with a finger the words say how to draw', await words(), 'Draw your field here: drag a rectangle, or tap its corners.');
    const c = await mid(), s0 = await S();
    await js(`(async () => { ${MAP}.setZoom(16, { animate: false }); })()`); await sleep(200);   // a field of a few hectares fills the phone at 16: its corners, kept to about 1 m, keep it square to half a degree
    // the rectangle by three taps, in the drawing view
    await fingerOn('.mapx-seg [data-tool=rect]'); await sleep(400);
    same('on a phone Rectangle opens the full drawing view', [await js(`document.querySelector('#mapx').classList.contains('full')`), await boxState()], [true, ['rect', 'armed']]);
    same('its words are for a finger', await words(), 'Draw your field here: drag a rectangle, or tap its corners.');
    await shot('touch-rect-armed-375.png');
    const m = await mid(), A = { x: m.x - 110, y: m.y + 40 }, B = { x: m.x + 10, y: m.y - 70 }, P = { x: m.x + 90, y: m.y + 30 };
    const [la, lb, lp] = [await ll(A.x, A.y), await ll(B.x, B.y), await ll(P.x, P.y)];
    for (const p of [A, B, P]) { await touchTap(p.x, p.y); await sleep(250); }
    const s = await S();
    check('three taps make a turned rectangle', Array.isArray(s.ring) && s.ring.length === 4, s.ring);
    const ang = s.ring ? await angles(s.ring) : [];
    check('its corners are 90 degrees, give or take half a degree', ang.length === 4 && ang.every(a => near(a, 90, 0.5)), ang);
    const want = await js(`import('/js/geo.js').then(g => g.areaHa(g.threePointRect(${JSON.stringify(la)}, ${JSON.stringify(lb)}, ${JSON.stringify(lp)})))`), got = s.ring ? await area(s.ring) : 0;
    check('its area is the rectangle through the three taps (within 1%)', want > 0 && Math.abs(got - want) / want < 0.01, [got, want]);
    check('on a phone the result bar shows the area, with nothing to scroll', await looks('#mapxResult') && /^[\d,.]+ acres?$/.test(await js(`document.querySelector('#mapxResult .mapx-big')?.textContent ?? ''`)));
    await shot('touch-rect-result-375.png');
    // the polygon: pan and pinch keep the corners; a quick double tap is not a close; a tap 36 px off the first corner closes
    await fingerOn('.mapx-seg [data-tool=poly]'); await sleep(300);
    const q = await mid(), corners = [{ x: q.x - 100, y: q.y - 150 }, { x: q.x + 100, y: q.y - 150 }, { x: q.x + 110, y: q.y + 60 }];
    for (const p of corners) { await touchTap(p.x, p.y); await sleep(450); }
    const d0 = (await S()).draft, cz = await centreLL();
    await swipe({ x: q.x - 20, y: q.y + 150 }, { x: q.x + 40, y: q.y + 110 }, { steps: 10 }); await sleep(400);
    check('a one-finger drag pans the map while drawing', (await drift(cz)) > 20);
    same('and keeps every corner', (await S()).draft, d0);
    const zp = await zoomNow();
    await pinch({ x: q.x, y: q.y + 60 }, 120, 220, { steps: 10 }); await sleep(700); await still();
    check('a pinch zooms while drawing', (await zoomNow()) !== zp, [zp, await zoomNow()]);
    same('and keeps every corner', (await S()).draft, d0);
    await still(); await js(`(async () => { const map = ${MAP}, d = (await import('/js/mapx.js')).mapState().draft; map.setView(L.latLngBounds(d).getCenter(), ${zp}, { animate: false }); })()`); await sleep(250); await still();   // the corners in view again at the zoom they were drawn at
    const f = await S(), p0 = await xy(f.draft[0][0], f.draft[0][1]), p2 = await xy(f.draft[2][0], f.draft[2][1]);
    const fourth = { x: p0.x - 10, y: p2.y + 60 };
    await touchTap(fourth.x, fourth.y, { hold: 30 }); await touchTap(fourth.x + 3, fourth.y + 2, { hold: 30 }); await sleep(450);
    same('a quick double tap adds one corner and does not close', [(await S()).draft?.length, (await S()).state], [4, 'drawing']);
    await touchTap(p0.x + 36, p0.y); await sleep(400);
    same('a tap 36 px from the first corner closes it', [(await S()).ring?.length, (await S()).state], [4, 'finished']);
    // editing by finger: hold, then drag; a swipe that starts on a handle pans
    const r0 = (await S()).ring, h = await centreOf('.mapx-handle');
    await swipe({ x: h.x, y: h.y }, { x: h.x + 40, y: h.y + 30 }, { hold: 320, steps: 8 }); await sleep(300);
    const r1 = (await S()).ring;
    check('touch and hold a corner, then drag: the corner moves and the area changes', JSON.stringify(r1) !== JSON.stringify(r0) && (await area(r1)) !== (await area(r0)), [r0, r1]);
    await fingerOn(bar('undo')); await sleep(250);
    same('Undo puts the corner back', (await S()).ring, r0);
    const h2 = await centreOf('.mapx-handle'), cz2 = await centreLL();
    await swipe({ x: h2.x, y: h2.y }, { x: h2.x - 60, y: h2.y + 50 }, { hold: 20, steps: 8 }); await sleep(400);
    same('a quick swipe from a handle pans the map and leaves the corner where it was', [(await drift(cz2)) > 20, JSON.stringify((await S()).ring) === JSON.stringify(r0)], [true, true]);
  } finally { await touchOn(false); }
});

// ---------------------------------------------------------------- by keys only
await group('keys', async () => {
  await open(WOOD, 16);
  await focusMap();
  same('Tab reaches the map, and keyboard mode is on with its cross', [await js(`document.activeElement.id`), await js(`document.body.classList.contains('kbd-mode')`), await looks('.mapx-cross')], ['mapx', true, true]);
  same('the words are the key words, and the bar offers the step at the cross', [await words(), await looks(bar('step')), await js(`document.querySelector('${bar('step')}').textContent.trim()`)], ['Press Space to put a corner of your field at the cross.', true, 'Set corner']);
  const z = await zoomNow();
  await press('+'); await sleep(250); const zin = await zoomNow(); await press('-'); await sleep(250);
  same('plus and minus zoom', [zin, await zoomNow()], [z + 1, z]);
  await press('2'); await sleep(150);
  same('2 chooses Corners', await boxState(), ['poly', 'armed']);
  same('the keys words', await words(), 'Put the cross on a corner of your field, then press Space.');
  let lost = 0;
  for (const moves of [[], ['ArrowRight', 'ArrowRight'], ['ArrowDown', 'ArrowDown'], ['ArrowLeft', 'ArrowLeft']]) {
    for (const k of moves) { await press(k); await sleep(40); }
    await press(' '); await sleep(150);
    if (!(await notBody())) lost++;
  }
  same('Space puts four corners at the cross, and focus never falls to the page', [(await S()).draft?.length, lost, await js(`document.activeElement.id`)], [4, 0, 'mapx']);
  await press('Enter'); await sleep(300);
  same('Enter closes the outline', (await S()).ring?.length, 4);
  check('the area is said in both units with the corners', /^Field outlined: [\d,.]+ acres?, [\d,.]+ hectares?, 4 corners\./.test(await said()), await said());
  check('the card that opened for the close left the keyboard on the map', await js(`document.activeElement.id === 'mapx' && !!document.querySelector('.spot')`));
  await press('Escape'); await sleep(150);
  same('Escape first closes the card, one layer at a time', [await js(`!!document.querySelector('.spot')`), (await boxState())[1]], [false, 'finished']);
  await press('Escape'); await sleep(150);
  same('then ends the editing, nothing is lost', [await boxState(), (await S()).ring?.length], [['pin', 'idle'], 4]);
  await press('1'); await sleep(150); same('1 chooses Rectangle', (await boxState())[0], 'rect');
  // a rectangle by three Spaces
  await press('1'); await sleep(150);
  await press(' '); await sleep(120);
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight']) { await press(k); await sleep(40); }
  await press(' '); await sleep(120);
  for (const k of ['ArrowDown', 'ArrowDown']) { await press(k); await sleep(40); }
  await press(' '); await sleep(300);
  same('Space three times draws a rectangle, focus still on the map', [(await S()).ring?.length, (await S()).state, await js(`document.activeElement.id`)], [4, 'finished', 'mapx']);
  // Backspace, then Escape cancels the drawing with an Undo
  await press('2'); await sleep(120); await press(' '); await sleep(100); await press('ArrowRight'); await sleep(40); await press(' '); await sleep(120);
  await press('Backspace'); await sleep(150);
  same('Backspace takes the last corner away', (await S()).draft?.length, 1);
  await press('Escape'); await sleep(150);
  same('Escape cancels the drawing with an Undo, back to Pin', [await boxState(), await toastNow()], [['pin', 'idle'], 'Corners drawing removed.']);
  await press('z', { ctrl: true }); await sleep(150);
  same('Ctrl+Z brings it back', [(await S()).draft?.length, (await boxState())[0]], [1, 'poly']);
  await press('Escape'); await sleep(120); await press('Escape'); await sleep(120);
  // a corner by keys
  const r = (await S()).ring, inside = await js(`import('/js/geo.js').then(g => g.insidePoint(${JSON.stringify(r)}))`), on = await xy(r[0][0] + (inside[0] - r[0][0]) * 0.3, r[0][1] + (inside[1] - r[0][1]) * 0.3);
  await tapAt(on.x, on.y); await sleep(250);   // a click on the outline (away from the pin, which sits in its middle) selects it
  check('a mouse click on the map does not turn on keyboard mode', await js(`!document.body.classList.contains('kbd-mode')`));
  await js(`document.querySelector('.mapx-handle').focus()`); await press('ArrowRight'); await sleep(150);
  check('the arrows move a focused corner, and it is said', /^Corner 1 moved about \d+ m east\.$/.test(await said()), await said());
  const before = (await S()).ring.length;
  await press('Delete'); await sleep(200);
  same('Delete takes the corner away', [(await S()).ring.length, await said()], [before - 1, `Corner removed. ${before - 1} left.`]);
  await press('z', { ctrl: true }); await sleep(200);
  same('Ctrl+Z puts it back', (await S()).ring.length, before);
  check('keyboard mode came back with the keys, and focus is still in the map', await js(`document.body.classList.contains('kbd-mode') && document.querySelector('#mapx').contains(document.activeElement)`));
  // an undo on a corner brings the change back right there: the card that shows the area is brought up to date, it does not open again and take the keyboard away
  await js(`document.querySelector('.mapx-handle').focus()`);
  const r1 = (await S()).ring;
  await press('ArrowRight'); await sleep(150); await press('Insert'); await sleep(200); await press('Delete'); await sleep(200);
  for (let i = 0; i < 3; i++) { await press('z', { ctrl: true }); await sleep(200); }
  same('three Ctrl+Z on a corner undo the three changes, and the keyboard stays on a corner', [(await S()).ring, await js(`!!document.activeElement?.classList.contains('mapx-handle')`)], [r1, true]);
});

// ---------------------------------------------------------------- editing a finished outline, by mouse
await group('edit', async () => {
  await open(WOOD, 16);
  const c = await mid();
  await tool('rect'); await sleep(120);
  await dragMouse({ x: c.x - 140, y: c.y - 100 }, { x: c.x + 140, y: c.y + 100 }, { steps: 10 }); await sleep(300);
  const r0 = (await S()).ring, a0 = await area(r0);
  check('the finished outline has a 44 px handle on every corner', await js(`[...document.querySelectorAll('.mapx-handle')].length === 4 && [...document.querySelectorAll('.mapx-handle')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })`));
  const h = await centreOf('.mapx-handle');
  await dragMouse({ x: h.x, y: h.y }, { x: h.x - 40, y: h.y - 30 }, { steps: 8 }); await sleep(250);
  check('a mouse drag on a corner moves it at once and changes the area', (await area((await S()).ring)) !== a0);
  await tap(bar('undo')); await sleep(200);
  same('Undo puts it back', (await S()).ring, r0);
  const m = await centreOf('.mapx-mid');
  await dragMouse({ x: m.x, y: m.y }, { x: m.x, y: m.y - 50 }, { steps: 8 }); await sleep(250);
  same('dragging a "+" adds a corner where it is dropped', (await S()).ring.length, 5);
  await tap(bar('undo')); await sleep(200);
  same('Undo takes the new corner away', (await S()).ring, r0);
  const h3 = await centreOf('.mapx-handle');
  await tapAt(h3.x, h3.y); await sleep(200);
  check('clicking a corner chooses it, and Remove corner appears', await looks(bar('remove')) && await js(`!!document.querySelector('.mapx-handle[aria-pressed=true]')`));
  await tap(bar('remove')); await sleep(200);
  same('Remove corner takes it away', (await S()).ring.length, 3);
  await tap(bar('undo')); await sleep(200);
  same('and Undo brings it back', (await S()).ring, r0);
  // a corner dragged across the far side: while the lines cross the chip says so, the card fades back so the corner stays in sight, and the drop is refused
  const hs = await js(`[...document.querySelectorAll('.mapx-handle')].map(b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })`), to = { x: hs[1].x + 90, y: (hs[1].y + hs[2].y) / 2 };
  await point(hs[0]); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hs[0].x, y: hs[0].y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hs[0].x + (to.x - hs[0].x) * i / 12, y: hs[0].y + (to.y - hs[0].y) * i / 12, button: 'left', buttons: 1 }); await sleep(16); }
  await sleep(250);
  const crossing = { chip: await js(`document.querySelector('#mapxBarChip').hidden ? '' : document.querySelector('#mapxBarChip').textContent`), card: await js(`document.querySelector('.spot') ? +getComputedStyle(document.querySelector('.spot')).opacity : 1`) };
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(400);
  same('while a dragged corner makes the lines cross, the chip says "Lines cross" instead of an area', crossing.chip, 'Lines cross');
  check('and the card fades back while the corner moves, so the corner stays in sight', crossing.card < 0.5, crossing);
  same('the drop is refused in words and the outline is as it was', [(await S()).ring, await words()], [r0, 'Lines can\'t cross. Put this corner where they don\'t.']);
  check('the card comes back when the hand lets go', await js(`!document.querySelector('.spot') || +getComputedStyle(document.querySelector('.spot')).opacity === 1`));
  await tap(bar('done')); await sleep(200);
});

// ---------------------------------------------------------------- nothing is lost
await group('lose', async () => {
  await open(WOOD, 16);
  const c = await mid();
  await tool('poly'); await sleep(120);
  await mouseDraw([{ x: c.x - 100, y: c.y - 80 }, { x: c.x + 110, y: c.y - 70 }, { x: c.x + 90, y: c.y + 90 }]);
  await tool('poly'); await sleep(150);
  same('pressing the tool already pressed changes nothing', [(await S()).draft?.length, await toastNow()], [3, '']);
  await tool('rect'); await sleep(200);
  same('switching tools mid-drawing removes it with an Undo', [await toastNow(), (await boxState())[0]], ['Corners drawing removed.', 'rect']);
  await tap('#toast .btn'); await sleep(200);
  same('the Undo brings back the corners and the tool', [(await S()).draft?.length, (await boxState())[0]], [3, 'poly']);
  await tool('rect'); await sleep(150);
  const t = await centreOf('#toast');
  await point({ x: t.x - t.w / 2 + 12, y: t.y }); await sleep(6600);
  same('an Undo toast stays while the pointer is on it, past its 6 seconds', await toastNow(), 'Corners drawing removed.');
  await point({ x: 1, y: 1 }); await sleep(6400);
  same('and goes once the pointer leaves', await toastNow(), '');
  await press('z', { ctrl: true }); await sleep(150);
  same('Ctrl+Z on the map still brings the drawing back', [(await S()).draft?.length, (await boxState())[0]], [3, 'poly']);
  // a reload mid-drawing brings the draft back
  await send('Page.reload'); await until(`document.readyState === 'complete' && !!document.querySelector('#mapx .leaflet-container')`, 15000); await sleep(600);
  await js(`(async () => { if (document.querySelector('#view-setup').hidden) (await import('/js/app.js')).show('setup'); })()`); await sleep(400);
  same('after a reload the unfinished outline is back, and says so', [(await S()).draft?.length, await words()], [3, 'Your unfinished outline is back.']);
  await tap(bar('cancel')); await sleep(150);
  // a closed outline is used for the report at once (an Undo takes it back), then Start again and its Undo
  await tool('rect'); await sleep(120);
  await js(`window.__area = []; document.addEventListener('crophalo:area', e => window.__area.push(e.detail))`);
  await dragMouse({ x: c.x - 120, y: c.y - 90 }, { x: c.x + 120, y: c.y + 90 }, { steps: 10 }); await sleep(300);
  same('closing tells the page once, says so with an Undo, and the card has no second "Use for my report"', [await js(`window.__area.length`), await toastNow(), await js(`!!document.querySelector('[data-spot=use]')`)], [1, 'Your outline is used for the report.', false]);
  check('the line under Next about an unused outline never shows', !(await looks('#ctaOutline')));
  same('the card says the outline is used', await js(`document.querySelector('#spotPanel .chip')?.textContent`), 'Used in report');
  const used = await S();
  await tap('[data-spot=again]'); await sleep(250);
  same('Start again removes it with an Undo, and the page is told', [await toastNow(), await js(`window.__area.at(-1)`)], ['Outline removed.', null]);
  await tap('#toast .btn'); await sleep(250);
  same('Undo brings it back used, and sends it to the page again', [(await S()).ring, (await S()).used, await js(`window.__area.length`), await js(`window.__area.at(-1)?.pts?.length ?? 0`)], [used.ring, true, 3, 4]);
  // a reload after Use keeps the pin, the outline and the view
  await send('Page.reload'); await until(`document.readyState === 'complete' && !!document.querySelector('#mapx .leaflet-container')`, 15000); await sleep(600);
  await js(`(async () => { if (document.querySelector('#view-setup').hidden) (await import('/js/app.js')).show('setup'); })()`); await sleep(500);
  const back = await S();
  same('after a reload the pin and the used outline are back', [back.pin?.lat, back.pin?.lon, back.ring, back.used], [used.pin.lat, used.pin.lon, used.ring, true]);
  check('and the outline is in view', await js(`(async () => { const map = ${MAP}; return map.getBounds().contains(${JSON.stringify(used.ring)}); })()`));
});

// ---------------------------------------------------------------- the pin is never in the way of drawing
await group('firstrect', async () => {
  // HELP 3's fix, kept: a first rectangle drawn with NO place chosen brings its own place, and "Go to the next step" turns on
  await open(null, 2);
  check('with no field the next step is blocked and says to draw one', await js(`document.querySelector('#wNext')?.disabled === true`) && /Draw your field on the map to go on\./.test(await js(`document.querySelector('#ctaNote')?.textContent ?? ''`)), await js(`document.querySelector('#ctaNote')?.textContent ?? ''`));
  await js(`(async () => { ${MAP}.setView([43.1, -80.75], 16, { animate: false }); })()`); await sleep(600);
  const c = await mid();
  await dragMouse({ x: c.x - 90, y: c.y - 60 }, { x: c.x + 90, y: c.y + 60 }, { steps: 8 }); await sleep(900);
  const st = await S();
  check('a first rectangle drawn with no place chosen makes a 4-corner outline and a place inside it', Array.isArray(st.ring) && st.ring.length === 4 && !!st.pin, st);
  await until(`document.querySelector('#wNext') && !document.querySelector('#wNext').disabled`, 8000).catch(() => {});
  check('"Go to the next step" is then on', await js(`document.querySelector('#wNext')?.disabled === false`), await js(`document.querySelector('#ctaNote')?.textContent ?? ''`));
});

await group('zoomguard', async () => {
  await open(WOOD, 11);
  const c = await mid();
  await tool('poly'); await sleep(150);
  same('at zoom 11 the words ask to zoom in', await words(), 'Zoom in to your field to draw it. Click it to zoom in.');
  await tapAt(c.x + 40, c.y + 30); await sleep(600);
  same('a click zooms in two levels and adds no corner', [await zoomNow(), (await S()).draft?.length ?? 0], [13, 0]);
  await open(null, 2);
  await js(`(async () => { ${MAP}.setZoom(4, { animate: false }); })()`); await sleep(200);
  same('with no outline, far out, the words ask to zoom in first', await words(), 'Zoom in to your field to draw it. Click it to zoom in.');
  const m = await mid();
  await tapAt(m.x + 30, m.y + 20); await sleep(700);
  same('a click at zoom 4 zooms in two levels and sets no place', [await zoomNow(), (await S()).pin], [6, null]);
  same('and says what to do next', await said(), 'Zoomed in. Now tap your field.');
});

// ---------------------------------------------------------------- acres and hectares
await group('units', async () => {
  same('the browser is Canadian here', await js(`navigator.languages[0]`), 'en-CA');
  await open(WOOD, 16);
  const c = await mid();
  await tool('poly'); await sleep(120);
  const pts = [{ x: c.x - 140, y: c.y - 90 }, { x: c.x + 140, y: c.y - 100 }, { x: c.x + 130, y: c.y + 100 }];
  await mouseDraw(pts);
  await point({ x: pts[0].x + 12, y: pts[0].y + 10 }); await sleep(150);
  const chip = await js(`document.querySelector('#mapxChip')?.textContent ?? ''`);
  check('in Canada the chip puts acres first', /^≈ [\d,.]+ acres? · [\d,.]+ ha$/.test(chip), chip);
  await tapAt(pts[0].x + 12, pts[0].y + 10); await sleep(700);
  const figure = await js(`document.querySelector('.spot-big .sr')?.textContent ?? ''`);
  same('the card figure is the chip\'s figure at the close, acres first', figure, chip.replace(/^≈ /, '').split(' · ')[0]);
  await js(`import('/js/settings.js').then(m => m.saveSettings({ area: 'hectares' }))`); await sleep(300);
  check('with Hectares chosen in the settings the card reads hectares first, at once', /^[\d,.]+ ha$/.test(await js(`document.querySelector('.spot-big .sr')?.textContent ?? ''`)), await js(`document.querySelector('.spot-big .sr')?.textContent ?? ''`));
  await js(`import('/js/settings.js').then(m => m.saveSettings({ area: 'auto' }))`);
  await lang('en-GB'); await open(WOOD, 16); await tool('rect'); await sleep(120);
  await dragMouse({ x: c.x - 120, y: c.y - 80 }, { x: c.x + 120, y: c.y + 80 }, { steps: 8 }); await sleep(600);
  check('elsewhere, on Automatic, hectares come first', /^[\d,.]+ ha$/.test(await js(`document.querySelector('.spot-big .sr')?.textContent ?? ''`)), await js(`document.querySelector('.spot-big .sr')?.textContent ?? ''`));
  await lang('en-CA');
  // the chip at the close and the card agree even where keeping the corners to about 1 m moves the last digit (this field reads 54.8 unrounded, 54.9 kept)
  await open(WOOD, 16); await tool('poly'); await sleep(120);
  const q = [{ x: c.x - 160, y: c.y - 120 }, { x: c.x + 150, y: c.y - 130 }, { x: c.x + 170, y: c.y + 110 }, { x: c.x - 140, y: c.y + 120 }];
  await mouseDraw(q, 150);
  await point({ x: q[0].x + 10, y: q[0].y + 8 }); await sleep(150);
  const chip2 = await js(`document.querySelector('#mapxChip')?.textContent ?? ''`);
  await tapAt(q[0].x + 10, q[0].y + 8); await sleep(700);
  same('the chip at the close shows the figure the card then shows', await js(`document.querySelector('.spot-big .sr')?.textContent ?? ''`), chip2.replace(/^≈ /, '').split(' · ')[0]);
});

// ---------------------------------------------------------------- the sentence about missing names never covers a drawing
await group('names', async () => {
  await open(WOOD, 16);
  await js(`Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); 1`);   // a field with no signal: the map says the names and the light map are missing
  await js(`import('/js/mapbase.js').then(m => { m.baseNow().retry(); return 1; })`);
  const shown = await seen(`!document.querySelector('#mapxBaseNote').hidden`, 8000);
  check('the sentence about missing names shows on the map at rest', shown && await looks('#mapxBaseNote'));
  const c = await mid();
  await tool('poly'); await sleep(150);
  { const cc = await mid(); await tapAt(cc.x - 150, cc.y + 60); await sleep(200); }
  check('it steps aside once a corner is set (it would cover corners and take their clicks)', !(await looks('#mapxBaseNote')));
  await press('Backspace'); await sleep(150);
  await mouseDraw([{ x: c.x - 150, y: c.y + 60 }, { x: c.x + 130, y: c.y + 70 }, { x: c.x + 20, y: c.y - 120 }]);
  await tapAt(c.x - 150 + 10, c.y + 60 + 8); await sleep(700);
  check('and while the outline just drawn is shown and changed', (await S()).ring && !(await looks('#mapxBaseNote')));
  await tap(bar('done')); await sleep(300);
  check('it comes back when the farmer is done with the outline', await looks('#mapxBaseNote'));
});

// ---------------------------------------------------------------- Precise: the map moves under a still cross
await group('precise', async () => {
  await open(WOOD, 16);
  await tool('poly'); await sleep(150);
  await tap(bar('precise')); await sleep(200);
  same('Precise is a pressed toggle, kept for next time, and said', [await attr(bar('precise'), 'aria-pressed'), await js(`localStorage.getItem('crophalo.map.precise')`), await said()], ['true', '1', 'Precise on. Move the map to put the cross on the spot.']);
  check('the cross shows', await looks('.mapx-cross'));
  const cross = await centreOf('.mapx-cross'), c = await mid(), spot = await ll(c.x - 120, c.y - 70);
  await tapAt(c.x - 120, c.y - 70); await sleep(600);
  const under = await ll(cross.x, cross.y);
  check('a tap glides that spot under the cross, and places nothing', near(under[0], spot[0], 3e-5) && near(under[1], spot[1], 3e-5) && !((await S()).draft?.length), [under, spot]);
  await tap(bar('step')); await sleep(200);
  const d = (await S()).draft;
  check('the step button puts the corner exactly under the cross', d?.length === 1 && near(d[0][0], under[0], 1e-5) && near(d[0][1], under[1], 1e-5), [d, under]);
  await tap(bar('precise')); await sleep(150);
  same('Precise off', [await attr(bar('precise'), 'aria-pressed'), await said()], ['false', 'Precise off.']);
});

// ---------------------------------------------------------------- on a phone: room, the drawing view, no covered button, no sideways scroll
await group('phone', async () => {
  try {
    for (const [w, largest] of [[375, false], [320, true]]) {
      await size(w, 740); await touchOn(true); await open(WOOD, 17);
      if (largest) { await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'xlarge' }))`); await sleep(300); }
      const at = `at ${w} px${largest ? ' with the largest text' : ''}`;
      const vh = await js('innerHeight'), mh = await js(`document.querySelector('#mapx').getBoundingClientRect().height`);
      check(`the field-step map is at least 60% of the screen ${at}`, mh >= vh * 0.6 - 1, [mh, vh]);
      await flat(`the field step ${at}`);
      await fingerOn('.mapx-seg [data-tool=rect]'); await sleep(400);
      check(`Rectangle opens the drawing view ${at}`, await js(`document.querySelector('#mapx').classList.contains('full')`));
      const m = await mid();
      for (const p of [{ x: m.x - 90, y: m.y + 30 }, { x: m.x + 20, y: m.y - 60 }]) { await touchTap(p.x, p.y); await sleep(300); }
      const covered = await js(`[...document.querySelectorAll('#mapxHint button')].filter(b => !b.hidden && b.getClientRects().length).filter(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(e === b || b.contains(e)); }).map(b => b.textContent.trim())`);
      same(`nothing covers a bar button ${at}`, covered, []);
      check(`every bar button is inside the screen ${at}`, await js(`[...document.querySelectorAll('#mapxHint button')].filter(b => !b.hidden && b.getClientRects().length).every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + .5 && r.top >= 0 && r.bottom <= innerHeight + .5; })`));
      await flat(`the drawing view ${at}`);
      if (!largest) {   // the phone's Back gesture closes the drawing view and keeps the drawing; the setup stays where it was
        const drawn = (await S()).draft;
        await js('history.back()'); await sleep(500);
        same(`Back closes the drawing view and keeps the drawing ${at}`, [await js(`document.querySelector('#mapx').classList.contains('full')`), (await S()).draft, await js(`!document.querySelector('#view-setup').hidden`)], [false, drawn, true]);
        await still(); await sleep(300);   // the map has its setup size again
        await fingerOn('.mapx-seg [data-tool=rect]'); await sleep(400);
        same(`pressing the tool again opens the drawing view again, the drawing still there ${at}`, [await js(`document.querySelector('#mapx').classList.contains('full')`), (await S()).draft?.length], [true, 2]);
      }
      await touchTap(m.x + 70, m.y + 60); await sleep(500);
      await flat(`the result bar ${at}`);
      check(`the result bar is whole on the screen ${at}`, await js(`(() => { const r = document.querySelector('#mapxHint').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + .5 && r.left >= 0 && r.right <= innerWidth + .5; })()`));
      await shot(`phone-result-${w}${largest ? '-xlarge' : ''}.png`);
      if (largest) await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`);
    }
    // the later steps: a view-only strip with one way back to the field
    await size(375, 740); await open(WOOD, 16); await giveField(); await sleep(300);
    await fingerOn('#wNext'); await sleep(500);
    check('on later steps the map is a strip that only shows, with a Change field button', await looks('#mapxChange') && !(await looks('.mapx-seg')) && !(await looks('#mapxHint')) && !(await looks('.mapx-stack')), [await looks('#mapxChange'), await looks('.mapx-seg'), await looks('#mapxHint'), await looks('.mapx-stack'), await js(`document.querySelector('#setupRoot')?.dataset.step`), await js(`document.querySelector('#wNext')?.disabled`)]);
    await fingerOn('#mapxChange'); await sleep(400);
    same('Change field opens the drawing view with the Rectangle armed', [await js(`document.querySelector('#mapx').classList.contains('full')`), (await boxState())[0]], [true, 'rect']);
    // a reload keeps the history entries of the page before it (a phone that dropped the tab, a pull to refresh): an old drawing-view entry must not keep the view open on Back
    await size(375, 740); await open(WOOD, 16);
    await js(`history.replaceState({ ...(history.state || {}), mapx: 'draw' }, ''); 1`);   // what a reload in the drawing view leaves behind
    await fingerOn('.mapx-seg [data-tool=rect]'); await sleep(400);
    await js('history.back()'); await sleep(500);
    same('after a reload one Back still closes the drawing view, on the setup', [await js(`document.querySelector('#mapx').classList.contains('full')`), await js(`!document.querySelector('#view-setup').hidden`)], [false, true]);
    // the smallest phone with the largest text: the tap that closes a field must never press a bar button that the result puts under the finger (a phone sends a click
    // after the tap), the view stack ends above the result bar, and the outline shows above it under no control
    await size(320, 640); await open(WOOD, 16);
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'xlarge' }))`); await sleep(300);
    await fingerOn('.mapx-seg [data-tool=rect]'); await sleep(400);
    const mm = await mid();   // the middle of the free part of the map (the toolbar block, with its date bar, is taller than it used to be)
    for (const p of [{ x: mm.x - 26, y: mm.y + 19 }, { x: mm.x + 13, y: mm.y - 20 }]) { await touchTap(p.x, p.y); await sleep(420); }
    await touchTap(mm.x + 26, mm.y + 24); await sleep(1000); await still(); await sleep(300);
    const st = await S();
    check('the third tap closes the field, and its click presses no button that appeared under it', st.ring?.length === 4 && !st.draft, st);
    const lay = await js(`(() => { const s = document.querySelector('.mapx-stack').getBoundingClientRect(), d = document.querySelector('#mapxHint').getBoundingClientRect(); return { stack: Math.round(s.bottom), bar: Math.round(d.top) }; })()`);
    check('the view stack ends above the result bar', lay.stack <= lay.bar, lay);
    const under = await js(`(async () => { const map = ${MAP}, el = map.getContainer(), r = el.getBoundingClientRect(), z = r.width / el.offsetWidth, ring = (await import('/js/mapx.js')).mapState().ring || []; return ring.map(p => { const q = map.latLngToContainerPoint(p), e = document.elementFromPoint(r.left + q.x * z, r.top + q.y * z); return e && e.closest('.leaflet-container') ? 'map' : (e?.id || e?.className || 'none').toString().slice(0, 30); }); })()`);
    same('every corner of the outline shows above the result bar, under no control', under, ['map', 'map', 'map', 'map']);
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`);
  } finally { await touchOn(false); }
});

// ---------------------------------------------------------------- targets and the layout of every state
const MEASURE = `(() => {
  const R = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const map = document.querySelector('#mapx').getBoundingClientRect(), shown = e => e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
  const parts = { tools: '.mapx-seg', base: '.mapx-base', about: '#mapxAbout', right: '.mapx-right', panel: '.mapx-panel', stack: '.mapx-stack', bar: '#mapxHint', sentence: '.mapx-basenote', legends: '.mapx-legends', spot: '.spot', credit: '.mapx-credit', scale: '.leaflet-control-scale' };
  const boxes = {}; for (const [k, sel] of Object.entries(parts)) { const e = document.querySelector(sel); if (shown(e)) boxes[k] = R(e); }
  const names = Object.keys(boxes), overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const a = boxes[names[i]], b = boxes[names[j]]; if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) overlaps.push(names[i] + ' over ' + names[j]); }
  const outside = names.filter(k => boxes[k].x < map.left - 1 || boxes[k].r > map.right + 1 || boxes[k].y < map.top - 1 || boxes[k].b > map.bottom + 1);
  const small = [...document.querySelectorAll('.mapx-seg button, #mapxHint button, .mapx-handle, .mapx-stack button, #mapxChange')].filter(shown).filter(e => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(e => (e.getAttribute('aria-label') || e.textContent.trim() || e.className).toString().slice(0, 24) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
  return { overlaps, outside, small, boxes: Object.fromEntries(names.map(k => [k, [boxes[k].x - map.left, boxes[k].y - map.top, boxes[k].w, boxes[k].h].map(Math.round)])) };
})()`;
await group('layout', async () => {
  for (const w of WIDTHS) {
    await size(w); await open(WOOD, 16);
    const checkLayout = async name => { const m = await js(MEASURE); check(`${w} px, ${name}: no control lies over another`, m.overlaps.length === 0, [m.overlaps, m.boxes]); check(`${w} px, ${name}: every control is inside the map`, m.outside.length === 0, [m.outside, m.boxes]); check(`${w} px, ${name}: every tool, bar button, handle and view button is at least 44 by 44`, m.small.length === 0, m.small); };
    await checkLayout('idle with a pin');
    await tool('poly'); await sleep(400);
    const c = await mid();
    await mouseDraw([{ x: c.x - 80, y: c.y - 60 }, { x: c.x + 80, y: c.y - 60 }, { x: c.x + 70, y: c.y + 60 }]);
    await checkLayout(w < 600 ? 'drawing, in the drawing view' : 'drawing');
    await press('Enter'); await sleep(500);
    await checkLayout('finished, with the result');
    await shot(`layout-finished-${w}.png`);
  }
});

// ---------------------------------------------------------------- the three motion levels
await group('motion', async () => {
  await open(WOOD, 16);
  const c = await mid();
  await js(`document.documentElement.dataset.motion = ''`);
  await tool('poly'); await sleep(450);
  await mouseDraw([{ x: c.x - 120, y: c.y - 90 }, { x: c.x + 120, y: c.y - 90 }, { x: c.x + 120, y: c.y + 90 }, { x: c.x - 120, y: c.y + 90 }]);
  await press('Enter'); await sleep(60);
  const close = await animsNow();
  check('Full: the close marches the dashes once while they seal to solid', close.some(a => a.props.some(p => /strokeDash|stroke-dash/.test(p)) && a.ms >= 500 && a.ms <= 800 && a.iter === 1), close);
  check('Full: nothing on the map loops', close.every(a => a.iter !== 'Infinity'), close.filter(a => a.iter === 'Infinity'));
  await sleep(1000);
  same('Full: the close is over within one second', (await animsNow()).filter(a => !/spot/.test(a.el)).length, 0);
  await tap(bar('done')).catch(() => {}); await sleep(200);
  // Less: only short fades, and the wheel zoom jumps
  await js(`document.documentElement.dataset.motion = 'less'`);
  await tap('.mapx-seg [data-tool=pin]').catch(() => {}); await sleep(100);   // the tool button, not the map (the map carries data-tool too)
  await open(WOOD, 16); await js(`document.documentElement.dataset.motion = 'less'`); await sleep(100);
  const lessSeen = [];
  await tapAt(c.x + 140, c.y - 100); await sleep(30); lessSeen.push(...await animsNow());
  await tool('poly'); await sleep(250);
  for (const p of [{ x: c.x - 120, y: c.y - 90 }, { x: c.x + 120, y: c.y - 90 }, { x: c.x + 120, y: c.y + 90 }]) { await tapAt(p.x, p.y); await sleep(20); lessSeen.push(...await animsNow()); await sleep(120); }
  await press('Enter'); await sleep(30); lessSeen.push(...await animsNow());
  const moving = lessSeen.filter(a => a.props.some(p => p !== 'opacity' && !COLOURS.includes(p)) || a.ms + a.delay > 200);
  check('Less: every motion on the map is a fade of 200 ms or less', lessSeen.length > 0 && moving.length === 0, moving.length ? moving : 'nothing faded at all');
  const z = await zoomNow();
  await wheel(c.x, c.y, -240); await sleep(120);
  same('Less: a wheel zoom jumps, it does not glide', [await js(`(async () => !!${MAP}._animatingZoom)()`), (await zoomNow()) > z], [false, true]);
  // Still: nothing moves at all while drawing and closing
  await open(WOOD, 16); await js(`document.documentElement.dataset.motion = 'reduce'`); await sleep(100);
  const stillSeen = [];
  await tapAt(c.x - 140, c.y + 100); await sleep(20); stillSeen.push(...await animsNow());
  await tool('poly'); await sleep(100); stillSeen.push(...await animsNow());
  for (const p of [{ x: c.x - 120, y: c.y - 90 }, { x: c.x + 120, y: c.y - 90 }, { x: c.x + 120, y: c.y + 90 }]) { await tapAt(p.x, p.y); await sleep(20); stillSeen.push(...await animsNow()); }
  await press('Enter'); await sleep(20); stillSeen.push(...await animsNow());
  same('Still: no animation runs on the map during a drawing and its close', stillSeen, []);
  await js(`document.documentElement.dataset.motion = ''`);
});

// ---------------------------------------------------------------- axe, while drawing and with the result
await group('axe', async () => {
  const axe = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const w of [1280, 375]) {
    await size(w); await open(WOOD, 16); await js(axe);
    const c = await mid();
    await tool('poly'); await sleep(300);
    await mouseDraw([{ x: c.x - 80, y: c.y - 70 }, { x: c.x + 80, y: c.y - 70 }, { x: c.x + 80, y: c.y + 70 }]);
    const run1 = await js(`axe.run(document.querySelector('#view-setup'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
    check(`axe: drawing at ${w} px has no problem`, run1.length === 0, run1.join(' | '));
    await press('Enter'); await sleep(600);
    const run2 = await js(`axe.run(document.querySelector('#view-setup'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
    check(`axe: the finished outline with its handles at ${w} px has no problem`, run2.length === 0, run2.join(' | '));
  }
});

await finish();
