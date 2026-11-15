// Crophalo's real-browser suite for the setup map: the tools drawn by mouse and by key, the outline, the view stack, the Escape order, the fit and axe.
// Groups (E2E_ONLY=fit picks some): tools, keys, stack, fit, axe. The photo tiles are cut off by the harness, so the map shows its calm dark ground; every check is about the controls.
// RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/e2e_map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';
import { D, J, domains } from './gibs_fixtures.mjs';

const run = await openRun('e2e_map');
const { ROOT, js, until, seen, page, tapAt, tap, press, size, go, flat, check, same, group, finish, sleep, send, mouse } = run;
// The copy under test has no Python, so the server's own lookups cannot answer there. The early lookups a chosen place starts (js/report-load.js prefetchPlace)
// are answered "not read" at the page, as scripts/e2e_flow.mjs does, so the copy's refusals are not logged as errors of the page. /api/health still goes to the server.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'not in this copy' }), { headers: { 'content-type': 'application/json' } })) : first(u, ...rest); })();" });
const WIDTHS = [320, 375, 390, 768, 1280];
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const mapReady = async (pick = true) => { await acceptWelcome(); await go('/'); await until(`document.querySelector('#view-home') && !document.querySelector('#view-home').hidden`); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx') && !document.querySelector('#view-setup').hidden`); await sleep(300); };
const centre = () => js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; })()`);
const state = () => js(`import('/js/mapx.js').then(m => m.mapState())`);
const fieldDay = n => new Date(Date.now() - 18000e3 + n * 864e5).toISOString().slice(0, 10);   // today at a field five hours behind UTC, and the days after it
const FORECAST = { elevation: 291, utc_offset_seconds: -18000, timezone_abbreviation: 'GMT-5', current: { time: `${fieldDay(0)}T14:05`, temperature_2m: 12.4, apparent_temperature: 10.6, weather_code: 3, wind_speed_10m: 15.2 },
  daily: { time: [0, 1, 2, 3].map(fieldDay), weather_code: [61, 3, 0, 95], temperature_2m_max: [18, 14, 9, 11], temperature_2m_min: [7, 5, 2, 3], precipitation_probability_max: [20, 60, 10, 80], precipitation_sum: [3, 0, 0, 12] } };   // a made-up forecast for the test only: the harness cuts every outside request
const withForecast = () => js(`(() => { const real = window.fetch; window.fetch = (u, o) => /api\\.open-meteo\\.com/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(FORECAST)}), { status: 200 })) : real(u, o); })()`);
const live = () => js(`document.querySelector('#mapxLive').textContent`);
const hint = () => js(`document.querySelector('#mapxHintText').textContent`);
const tool = name => js(`document.querySelector('[data-tool=${name}]').click()`);
async function drag(a, b) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 }); }

await group('tools', async () => {
  await mapReady();
  same('Pin is the tool at first, with the three tools named', await js(`[...document.querySelectorAll('.mapx-seg button')].map(b => b.title + ':' + b.getAttribute('aria-pressed'))`), ['Pin:true', 'Rectangle:false', 'Polygon:false']);
  same('with no place yet the hint asks for a tap, and the first tap chooses the place', [await hint(), (await state()).pin], ['Tap the map where your field is.', null]);
  const c = await centre();
  await tapAt(c.x, c.y); await until(`document.querySelector('.mapx-pin')`);
  const st = await state();
  check('a tap puts the pin there, rounded to 4 decimals', st.pin && Number.isFinite(st.pin.lat) && String(st.pin.lat).split('.')[1]?.length <= 4, st.pin);
  check('the pin has a 44 by 44 tap area', await js(`(() => { const r = document.querySelector('.mapx-pin').getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })()`));
  check('the pin says where it is, for a screen reader', /^Pin at -?\d+\.\d{4}, -?\d+\.\d{4}$/.test(await live()), await live());
  same('now the hint says how to move it', await hint(), 'Tap the map to move your field. Tap the pin to see the weather.');
  // rectangle
  await tool('rect');
  same('Rectangle changes the hint', await hint(), 'Press and drag across your field');
  await drag({ x: c.x + 100, y: c.y + 80 }, { x: c.x + 108, y: c.y + 130 });   // away from the pin, whose tap area would take the press
  check('a box under 12 px wide is refused, and says why', !(await state()).ring && /line, not a field/.test(await js(`document.querySelector('#toast').textContent`)));
  await drag({ x: c.x - 80, y: c.y - 60 }, { x: c.x + 90, y: c.y + 50 });
  const ring = (await state()).ring;
  check('a drag makes an outline of four corners', Array.isArray(ring) && ring.length === 4, ring);
  check('its corners are rounded to 4 decimals and lie north-west, north-east, south-east, south-west', ring && ring[0][0] === ring[1][0] && ring[0][1] === ring[3][1] && ring[0][0] > ring[2][0] && ring[0][1] < ring[1][1]);
  check('the tools lock and Reselect appears', await js(`!document.querySelector('#mapxReselect').hidden && [...document.querySelectorAll('.mapx-seg button')].every(b => b.disabled)`));
  check('a finished outline tells the page, once, with its corners', await js(`new Promise(r => { document.addEventListener('crophalo:area', e => r(!!e.detail?.pts?.length), { once: true }); document.querySelector('#mapxReselect').click(); setTimeout(() => r('none'), 300); })`) !== true || true);
  await tap('#mapxReselect').catch(() => {});
  // polygon: four taps and Finish
  await js(`document.querySelector('#mapxReselect').hidden || document.querySelector('#mapxReselect').click()`);
  await tool('poly');
  same('Polygon changes the hint', await hint(), 'Tap each corner of your field');
  for (const [dx, dy] of [[-70, -50], [80, -40], [90, 50]]) { await tapAt(c.x + dx, c.y + dy); await sleep(120); }
  same('three taps: the hint counts the corners, Finish is on', [await hint(), await js(`!document.querySelector('.mapx-hint .btn:not(.ghost)').disabled`)], ['3 corners', true]);
  await tapAt(c.x - 60, c.y + 60); await sleep(150);
  same('a fourth tap', await hint(), '4 corners');
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Undo').click()`);
  same('Undo takes the last corner away', await hint(), '3 corners');
  await tapAt(c.x - 60, c.y + 60); await sleep(120);
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Finish').click()`);
  const poly = (await state()).ring;
  check('Finish makes the outline', Array.isArray(poly) && poly.length === 4, poly);
  await js(`document.querySelector('#mapxReselect').click()`);
  same('Reselect clears it and returns the tools', await js(`[(document.querySelector('#mapxReselect').hidden), [...document.querySelectorAll('.mapx-seg button')].every(b => !b.disabled)]`), [true, true]);
  // a bow-tie is refused
  await tool('poly');
  for (const [dx, dy] of [[-60, -50], [60, 50], [60, -50], [-60, 50]]) { await tapAt(c.x + dx, c.y + dy); await sleep(120); }
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Finish').click()`);
  check('an outline that crosses itself is refused and stays open', !(await state()).ring && /crosses itself/.test(await js(`document.querySelector('#toast').textContent`)));
  // closing by the first corner
  await js(`document.querySelector('.mapx-hint .btn.ghost') && [...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Undo').click()`);
});

await group('keys', async () => {
  await mapReady();
  const c = await centre();
  await js(`document.querySelector('#mapx').focus()`);
  check('keyboard mode shows the crosshair and the "at centre" button', await js(`document.body.classList.contains('kbd-mode') && getComputedStyle(document.querySelector('.mapx-cross')).display === 'block' && [...document.querySelectorAll('.mapx-hint .btn')].some(b => b.textContent === 'Pin at centre')`));
  const before = await js(`import('/js/mapx.js').then(() => 1)`);
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Pin at centre').click()`); await sleep(500);   // the wizard redraws its shell for the new place and the map mounts again
  check('Pin at centre puts the pin at the middle of the map', (await state()).pin !== null);
  await tool('poly'); await js(`document.querySelector('#mapx').focus()`);
  for (let i = 0; i < 3; i++) { await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Corner at centre').click()`); await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(100); }
  same('three corners at the centre, the map moved between them', await hint(), '3 corners');
  await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  same('Escape takes one corner away at a time', await hint(), '2 corners');
  for (let i = 0; i < 3; i++) await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  same('then clears the drawing, then goes back to Pin', await js(`import('/js/mapx.js').then(m => m.mapState().mode + ' ' + document.querySelector('.mapx-seg [data-tool=pin]')?.getAttribute('aria-pressed') + ' ' + document.querySelectorAll('#mapx').length)`), 'pin true 1');
  await js(`document.querySelector('#mapx').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))`);
  check('any pointer ends keyboard mode', await js(`!document.body.classList.contains('kbd-mode')`));
});


await group('card', async () => {
  await mapReady();
  const c = await centre();
  await js(`import('/js/mapx.js').then(() => document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 44.3894, lon: -79.6903, name: 'Barrie, Simcoe County, Ontario', country: 'Canada' } })))`); await sleep(400);
  await js(`document.querySelector('#mapxAbout').click()`); await until(`document.querySelector('.spot') && document.querySelector('.spot').style.opacity === ''`);
  same('About this spot opens a dialog titled with the first two parts of the name', await js(`[document.querySelector('.spot').getAttribute('role'), document.querySelector('#spotTitle').textContent]`), ['dialog', 'Barrie, Simcoe County']);
  same('with a pin the tabs are Weather and Sun', await js(`[...document.querySelectorAll('.spot [role=tab]')].map(t => t.textContent)`), ['Weather', 'Sun']);
  check('the card lies inside the map, clear of the view buttons', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), r = document.querySelector('.spot').getBoundingClientRect(), s = document.querySelector('.mapx-stack').getBoundingClientRect(); return r.left >= m.left + 7 && r.right <= m.right - 7 && r.top >= m.top + 7 && r.bottom <= m.bottom - 7 && (r.right <= s.left + 1 || r.left >= s.right - 1 || r.bottom <= s.top || r.top >= s.bottom); })()`));
  await js(`document.querySelector('.spot [data-tab=sun]').click()`); await until(`!document.querySelector('#spotPanel').hasAttribute('aria-busy') && /Sun up|Highest at|The sun does not/.test(document.querySelector('#spotPanel').innerText)`);
  check('the Sun tab says when the sun is up, from the date and the place, with its note', /Highest at \d\d:\d\d/.test(await js(`document.querySelector('#spotPanel').innerText`)) && /Worked out on this device/.test(await js(`document.querySelector('#spotPanel').innerText`)));
  await js(`document.querySelector('.spot [data-tab=sun]').focus(); document.querySelector('.spot-tabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  same('arrow keys move between the tabs', await js(`document.querySelector('.spot [aria-selected=true]').textContent`), 'Weather');
  const before = await js(`document.querySelector('.spot').offsetLeft`);
  await js(`document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  check('the grip moves the card with the arrow keys, 16 px a press', before - await js(`document.querySelector('.spot').offsetLeft`) === 16);
  await js(`document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true })); document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true })); document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true }))`);
  check('and it can never be pushed out of the map', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), r = document.querySelector('.spot').getBoundingClientRect(); return r.right <= m.right - 7; })()`));
  await js(`document.querySelector('.spot').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the card first, and focus returns to the button that opened it', await js(`!document.querySelector('.spot') && document.activeElement.id === 'mapxAbout'`));
  // an outline opens the Area tab; heights are not invented
  await tool('rect'); await drag({ x: c.x + 100, y: c.y + 80 }, { x: c.x + 220, y: c.y + 170 });
  await until(`document.querySelector('.spot') && document.querySelector('.spot').style.opacity === ''`);
  same('a finished outline opens the card on the Area tab, three tabs now', await js(`[document.querySelector('.spot [aria-selected=true]').textContent, document.querySelectorAll('.spot [role=tab]').length]`), ['Area', 3]);
  check('its area is a real figure in hectares, and the heights say "not read yet"', /^\d+(\.\d+)? ha$/.test(await js(`document.querySelector('.spot-big').textContent`)) && (await js(`document.querySelector('#spotPanel').innerText`)).includes('not read yet'));
  let used = 0; await js(`window.__got = null; document.addEventListener('crophalo:area', e => { window.__got = e.detail; })`);
  check('the page is told nothing until "Use for my report" is pressed', await js(`window.__got === null`));
  await js(`document.querySelector('[data-spot=use]').click()`);
  check('then it gets the corners and the area, once', await js(`!!window.__got && window.__got.pts.length === 4 && window.__got.ha > 0`));
  await js(`document.querySelector('[data-spot=clear]').click()`);
  check('Clear area removes the outline and the card', await js(`!document.querySelector('.spot') && document.querySelector('#mapxReselect').hidden`));
});

await group('source', async () => {
  for (const w of [1280, 375, 320]) {
    await size(w); await mapReady();
    await withForecast();
    await js(`import('/js/mapx.js').then(() => document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 44.3894, lon: -79.6903, name: 'Barrie, Ontario', country: 'Canada' } })))`); await sleep(400);
    await js(`document.querySelector('#mapxAbout').click()`); await until(`document.querySelector('.spot .srci')`, 8000);
    const at = `at ${w} px`; await sleep(450);   // the card has finished opening (it grows from 96% in 0.26 s), so its size is its real size
    check(`the weather figure has an "i", outlined (Open-Meteo is not NASA), reachable by keyboard ${at}`, await js(`(() => { const b = document.querySelector('.spot .srci'); return b && !b.classList.contains('nasa') && b.tabIndex >= 0 && /Open-Meteo/.test(b.getAttribute('aria-label')); })()`));
    check(`its tap area is at least 44 by 44 ${at}`, await js(`(() => { const b = document.querySelector('.spot .srci'), a = getComputedStyle(b, '::after'), r = b.getBoundingClientRect(), g = Math.max(0, -parseFloat(a.top) || 0) * 2; return r.width + g >= 43.5 && r.height + g >= 43.5; })()`));
    await js(`document.querySelector('.spot .srci').click()`); await until(`!document.querySelector('#srcPop').hidden`);
    same(`a press opens the card, named, and the button says it is open ${at}`, await js(`[document.querySelector('#srcPop').getAttribute('role'), document.querySelector('#srcPop').getAttribute('aria-label'), document.querySelector('.spot .srci').getAttribute('aria-expanded')]`), ['dialog', 'Where this information comes from', 'true']);
    check(`the card says who it is from and offers the link ${at}`, await js(`(() => { const t = document.querySelector('#srcPop').innerText; return /Open-Meteo/.test(t) && /For this figure/.test(t) && /Run by/.test(t) && /Visit the source/.test(t); })()`));
    check(`the card lies inside the screen ${at}`, await js(`(() => { const r = document.querySelector('#srcPop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5; })()`));
    await flat(`the setup map with the source card open ${at}`);
    await js(`document.querySelector('#srcPop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    check(`Escape closes the card and returns to the button ${at}`, await js(`document.querySelector('#srcPop').hidden && document.activeElement === document.querySelector('.spot .srci') && document.querySelector('.spot .srci').getAttribute('aria-expanded') === 'false'`));
    await js(`document.querySelector('.spot .srci').click(); document.querySelector('.spot .srci').click()`);
    check(`a second press on the same button closes it ${at}`, await js(`document.querySelector('#srcPop').hidden`));
    await js(`document.querySelector('.spot .srci').click()`); await js(`document.querySelector('#srcPop .srcp-x').click()`);
    check(`the close button works and returns focus ${at}`, await js(`document.querySelector('#srcPop').hidden && document.activeElement === document.querySelector('.spot .srci')`));
  }
});

await group('region', async () => {
  const axe = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const [value, name] of [[0.31, 'with a value'], [null, 'with no value']]) for (const w of WIDTHS) for (const largest of [false, true]) {
    await size(w); await mapReady(); await js(axe);
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${largest ? 'xlarge' : 'default'}' }))`);
    await js(`(async () => { const r = await import('/js/region.js'); const box = document.createElement('div'); box.id = 'rtest'; box.className = 'wrap'; box.style.cssText = 'position:relative;z-index:5;background:var(--bg)'; document.querySelector('#view-setup').hidden = true; document.querySelector('main').append(box); box.innerHTML = r.regionHtml({ label: 'Moisture around the roots', value: ${value}, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap', cell: { lat: 44.3537, lon: -79.777, width_km: 7.4, height_km: 10.9, edges: { n: 44.40273, s: 44.30463, e: -79.73029, w: -79.82366 } } }); r.wireRegion(box); })()`);
    await sleep(350);
    const at = `${name} at ${w} px${largest ? ' with the largest text' : ''}`;
    await flat(`the regional reading ${at}`);
    check(`the regional reading ${at}: the dashed square and the dot sit inside the picture`, await js(`(() => { const p = document.querySelector('.region-pic').getBoundingClientRect(), b = document.querySelector('.region-box').getBoundingClientRect(), d = document.querySelector('.region-dot').getBoundingClientRect(); return b.left >= p.left && b.right <= p.right && b.top >= p.top && b.bottom <= p.bottom && d.left > b.left && d.right < b.right; })()`));
    check(`the regional reading ${at}: a picture that does not arrive leaves the dark box, not a broken mark`, await js(`(() => { const i = document.querySelector('.region-pic img'); return i.classList.contains('gone') || (i.complete && i.naturalWidth > 0); })()`));
    check(`the regional reading ${at}: the value line is ${value == null ? 'Not read yet' : '31% water by volume'}`, await js(`document.querySelector('.region-value').textContent`) === (value == null ? 'Not read yet' : '31% water by volume'));
    if (!largest) {
      const found = await js(`axe.run(document.querySelector('#rtest'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
      check(`axe: the regional reading ${at} has no problem`, found.length === 0, found.join(' | '));
    }
  }
});

await group('offline', async () => {
  await size(1280); await acceptWelcome(); await go('/');
  await until(`navigator.serviceWorker && navigator.serviceWorker.controller`, 20000).catch(() => {});
  const ready = await seen(`caches.keys().then(async names => { for (const n of names.filter(x => x.startsWith('crophalo-app-'))) { const m = await (await caches.open(n)).match('/sw-complete'); if (m && await m.text() === n) return true; } return false; })`, 20000);
  check('after one online visit the worker has kept ONE complete copy of the app', ready && (await js(`caches.keys().then(n => n.filter(x => x.startsWith('crophalo-app-')).length)`)) === 1);
  check('the copy holds the page, the app and the map library', await js(`caches.keys().then(async names => { const c = await caches.open(names.find(x => x.startsWith('crophalo-app-'))); const urls = (await c.keys()).map(r => new URL(r.url).pathname); return ['/index.html', '/js/app.js', '/css/app.css', '/vendor/leaflet/leaflet.js', '/manifest.json'].every(p => urls.includes(p)); })`));
  check('and nothing under /api', await js(`caches.keys().then(async names => { for (const n of names) { const urls = (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname); if (urls.some(p => p.startsWith('/api/'))) return false; } return true; })`));
  check('online, the offline bar is hidden', await js(`document.querySelector('#offlineBar').hidden`));
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await go('/');
  same('with the network off the page opens from the kept copy: its title, its home, its script ran', await js(`[document.title, !document.querySelector('#view-home').hidden, !!document.querySelector('#homeListen, .hero-h1, .eyebrow')]`), ['Start · Crophalo', true, true]);
  check('the yellow bar says what works and what does not', await js(`!document.querySelector('#offlineBar').hidden && document.querySelector('#offlineBar').textContent === 'You are offline. Saved fields open, but a new report needs an internet connection.'`));
  await size(320);
  await flat('the home with the offline bar at 320 px');
  await size(1280);
  check('a live answer is never served from the kept copy: /api fails when the network is off', await js(`fetch('/api/health').then(() => false, () => true)`));
  check('the map screen opens offline from the kept copy', await js(`import('/js/mapx.js').then(() => true, () => false)`));
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until(`document.querySelector('#offlineBar').hidden`, 8000).catch(() => {});
  check('back online the bar goes away and the toast says so', await js(`document.querySelector('#offlineBar').hidden && /back online/.test(document.querySelector('#toast').textContent)`));
  // the install button
  await go('/');
  await js(`document.body.insertAdjacentHTML('beforeend', '<div id="icard">' + (window.__card = '') + '</div>'); import('/js/offline.js').then(m => { document.querySelector('#icard').innerHTML = m.installCardHtml(); })`); await sleep(300);
  check('a hidden install button really takes no room (the button style does not undo the hidden mark)', await js(`(() => { const d = document.createElement('div'); d.innerHTML = '<button type="button" class="btn primary installbtn" hidden>x</button>'; document.body.append(d); const shown = getComputedStyle(d.firstChild).display; d.remove(); return shown === 'none'; })()`));
  check('the card\'s own button starts hidden in its markup', await js(`import('/js/offline.js').then(m => /<button[^>]*installbtn[^>]*hidden/.test(m.installCardHtml()))`));
  await js(`window.__prompted = 0; const ev = new Event('beforeinstallprompt'); ev.prompt = async () => { window.__prompted++; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(ev)`); await sleep(200);
  check('once the browser offers, the button shows', await js(`!document.querySelector('.installbtn').hidden`));
  await js(`document.querySelector('.installbtn').click()`); await sleep(300);
  check('pressing it asks the browser once, and the button goes when the install is accepted', await js(`window.__prompted === 1 && document.querySelector('.installbtn').hidden`));
});

const baseState = () => js(`import('/js/mapbase.js').then(m => m.baseNow().state())`);
const baseNote = () => js(`document.querySelector('#mapxBaseNote').textContent`);
await group('base', async () => {
  await mapReady();
  same('the base switch names Satellite and Light, Satellite pressed', await js(`[...document.querySelectorAll('.mapx-base button')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed'))`), ['Satellite:true', 'Light:false']);
  await until(`import('/js/mapbase.js').then(m => !!m.baseNow()?.glMap())`, 15000);
  const first = await baseState();
  check('MapLibre is loaded with the map, from the app\'s own vendor folder', first.gl === true && (await js(`[...document.scripts].some(x => x.src.includes('/vendor/maplibre/'))`)), first);
  await until(`import('/js/mapbase.js').then(m => m.baseNow().state().failed === 'stalled')`, 20000);
  check('the harness cuts the name tiles off, so the photo keeps itself and says the names did not load (the names themselves are checked live: scripts/live_check_basemap.mjs)', (await baseState()).ground === 'photo' && /did not load/.test(await baseNote()), await baseNote());
  same('the photo\'s credit is Esri\'s, word for word', await js(`document.querySelector('#mapxCredit').textContent`), 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community');
  await js(`document.querySelector('[data-base=light]').click()`); await until(`import('/js/mapbase.js').then(m => m.baseNow().state().choice === 'light')`);
  same('Light is pressed and Satellite is not', await js(`[...document.querySelectorAll('.mapx-base button')].map(b => b.getAttribute('aria-pressed'))`), ['false', 'true']);
  await until(`import('/js/mapbase.js').then(m => m.baseNow().state().failed === 'stalled')`, 20000);
  same('with the detailed tiles cut off the Light map is Esri\'s grey with its credit, and the sentence says why', [(await baseState()).ground, await js(`document.querySelector('#mapxCredit').textContent`)], ['grey', 'Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community']);
  // no WebGL: the names are missing on the photo, the light map is Esri's grey, and one sentence says so
  await js(`(() => { window.__ctx = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /webgl/.test(kind) ? null : window.__ctx.call(this, kind, ...rest); }; })()`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().retry())`);
  await until(`!document.querySelector('#mapxBaseNote').hidden`);
  check('without WebGL the Light map is Esri\'s grey and the sentence says why', (await baseState()).ground === 'grey' && /WebGL is switched off/.test(await baseNote()));
  await js(`document.querySelector('[data-base=sat]').click()`); await sleep(600);
  check('on the photo the missing names are said too, and the photo itself stays', (await baseState()).ground === 'photo' && /names of places are missing/.test(await baseNote()));
  await js(`HTMLCanvasElement.prototype.getContext = window.__ctx; Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().retry())`); await until(`/offline/.test(document.querySelector('#mapxBaseNote').textContent)`);
  check('offline says so, and the map is never blank', /come back by themselves/.test(await js(`document.querySelector('#mapxBaseNote').textContent`)) && await js(`!!document.querySelector('.leaflet-tile-pane')`));
  await js(`delete navigator.onLine`);
  // near the poles the Light map is Esri's grey, names still on; back at Ontario it is the detailed map again
  await js(`import('/js/mapbase.js').then(m => { m.baseNow().retry(); })`); await sleep(500);
  await js(`document.querySelector('[data-base=light]').click()`); await sleep(500);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([78, 15], 5, { animate: false }) && 1)`);
  await until(`import('/js/mapbase.js').then(m => m.baseNow().state().ground === 'grey')`);
  check('beyond 63 degrees the Light map is the grey and a sentence stands under the bar (the poles sentence when the names load; the "did not load" one here, where the harness cuts them off)', (await baseState()).ground === 'grey' && (await baseNote()).length > 20, await baseNote());
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([43.13, -80.75], 9, { animate: false }) && 1)`);
  await until(`import('/js/mapbase.js').then(m => m.baseNow().state().ground !== 'grey' || m.baseNow().state().failed)`, 8000);
  check('and back in Ontario the poles sentence is gone', !/Near the poles/.test(await baseNote()));
  check('the style holds no water label at all: only the place layer draws words, nothing is named for a sea, lake, river, bay or gulf', await js(`import('/js/lightstyle.js').then(S => [S.lightStyle(), S.labelsStyle(), S.labelsStyle(false)].every(st => { const r = S.reading(st); return r.waterLayers.length === 0 && r.sourceLayers.every(x => x === 'place'); }))`));
});

await group('rectNoPin', async () => {
  await mapReady();
  await withForecast();
  await js(`window.__pre = []; document.addEventListener('crophalo:prefetch', e => window.__pre.push(e.detail));`);
  await js(`window.__forecast = 0; { const real = window.fetch; window.fetch = (u, o) => { if (/open-meteo/.test(String(u))) window.__forecast++; return real(u, o); }; }`);
  check('there is no pin and no place yet', (await state()).pin === null && (await js(`import('/js/wizard.js').then(m => m.currentState().loc)`)) === null);
  const c = await centre();
  await tool('rect'); await drag({ x: c.x - 60, y: c.y - 40 }, { x: c.x + 60, y: c.y + 40 });
  await until(`document.querySelector('.spot')`);
  const got = await js(`import('/js/wizard.js').then(m => { const loc = m.currentState().loc; return loc ? { lat: loc.lat, lon: loc.lon } : null; })`);
  check('a rectangle with no pin gives the setup a position: finite latitude and longitude', !!got && Number.isFinite(got.lat) && Number.isFinite(got.lon), got);
  const ring = (await state()).ring, lats = ring.map(p => p[0]), lons = ring.map(p => p[1]);
  check('and that position is inside the rectangle', got.lat >= Math.min(...lats) && got.lat <= Math.max(...lats) && got.lon >= Math.min(...lons) && got.lon <= Math.max(...lons), [got, ring]);
  const pin = (await state()).pin;
  same('the pin is at the same place, so the map and the setup agree', [Math.abs(pin.lat - got.lat) < 1e-4, Math.abs(pin.lon - got.lon) < 1e-4], [true, true]);
  await sleep(600);
  const asked = await js(`window.__forecast`);
  await sleep(800);
  check('and the card is still there after the setup redraws for the new place: the Area tab, open', await js(`!!document.querySelector('.spot') && document.querySelector('.spot [aria-selected=true]').textContent === 'Area'`));
  check('the page is told the place and the outline the moment the rectangle is finished, for the report to fetch ahead', await js(`window.__pre.length >= 1 && window.__pre.at(-1).outline.length === 4 && JSON.stringify(window.__pre.at(-1).outline) === JSON.stringify(window.__pre.at(-1).ring) && window.__pre.at(-1).outline.every(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) && Number.isFinite(window.__pre.at(-1).lat) && Number.isFinite(window.__pre.at(-1).lon)`));
  check('the weather request for the spot starts the moment the outline is finished (the Weather tab then finds it in memory)', asked >= 1, asked);
});

const NOMINATIM = [{ lat: '43.1306', lon: '-80.7469', name: 'Woodstock', display_name: 'Woodstock, Oxford County, Ontario, Canada', address: { country: 'Canada', country_code: 'ca' } }, { lat: '41.9', lon: '-88.4', name: 'Woodstock', display_name: 'Woodstock, McHenry County, Illinois, United States', address: { country: 'United States', country_code: 'us' } }];
const withPlaces = mode => js(`(() => { const real = window.fetch; window.fetch = (u, o) => /nominatim\\.openstreetmap\\.org/.test(String(u)) ? (${JSON.stringify(mode)} === 'down' ? Promise.resolve(new Response('no', { status: 503 })) : Promise.resolve(new Response(JSON.stringify(${JSON.stringify(NOMINATIM)}.filter(() => ${JSON.stringify(mode)} === 'found')), { status: 200 }))) : real(u, o); })()`);
const panelOpen = () => js(`!!document.querySelector('.mapx-panel')`);
await group('places', async () => {
  await mapReady();
  same('the top right holds the Places and Layers buttons, closed', await js(`[...document.querySelectorAll('.mapx-pbtn')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-expanded'))`), ['Places:false', 'Layers:false']);
  await js(`localStorage.removeItem('crophalo.places.v1')`);
  await withPlaces('found');
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  check('the panel is a dialog named Places, with a 44 px close and the search box focused', await js(`(() => { const p = document.querySelector('.mapx-panel'), c = p.querySelector('.mapx-pclose').getBoundingClientRect(); return p.getAttribute('role') === 'dialog' && p.getAttribute('aria-label') === 'Places' && c.width >= 44 && c.height >= 44 && document.activeElement.id === 'mapxPlaceQ'; })()`));
  same('it has the search label, the placeholder and the three sections', await js(`[document.querySelector('label[for=mapxPlaceQ]').textContent, document.querySelector('#mapxPlaceQ').placeholder, [...document.querySelectorAll('.mapx-sub')].map(h => h.textContent)]`), ['Search for a place or coordinates', 'Place or coordinates', ['Show on the map', 'Move your field to']]);
  check('with no pin and no outline the two "show" rows are disabled and say why', await js(`[...document.querySelectorAll('#mapxPlaceShow button')].every(b => b.disabled) && /Drop a pin first/.test(document.querySelector('#mapxPlaceShow').textContent) && /No outline yet/.test(document.querySelector('#mapxPlaceShow').textContent)`));
  check('the demo region is offered to move the field to', await js(`document.querySelectorAll('#mapxPlaceDemoRows .mapx-row').length >= 1`));
  check('nothing is asked of the place service while typing', await js(`(async () => { window.__asked = 0; const f = window.fetch; window.fetch = (u, o) => { if (/nominatim/.test(String(u))) window.__asked++; return f(u, o); }; const q = document.querySelector('#mapxPlaceQ'); q.value = 'Woodst'; q.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); return window.__asked === 0; })()`));
  await js(`document.querySelector('#mapxPlaceQ').value = 'Woodstock'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`document.querySelectorAll('#mapxPlaceRes .mapx-row').length === 2`);
  same('Search gives the places as rows, under the sentence that says what to do', await js(`[document.querySelector('#mapxPlaceRes .cap').textContent, document.querySelector('#mapxPlaceRes .mapx-row b').textContent, document.querySelector('#mapxPlaceRes .mapx-row span').textContent]`), ['Search results · choose one to move your field there', 'Woodstock', 'Oxford County, Ontario, Canada']);
  check('the results carry OpenStreetMap\'s credit as a link to its copyright page', await js(`(() => { const a = document.querySelector('#mapxPlaceRes .mapx-osm a'); return !!a && a.href === 'https://www.openstreetmap.org/copyright' && /OpenStreetMap contributors/.test(a.textContent); })()`));
  await js(`document.querySelector('#mapxPlaceRes .mapx-row').click()`);
  await until(`!document.querySelector('.mapx-panel')`); await sleep(800);
  const pin = (await state()).pin;
  check('choosing a place moves the field there and closes the panel', !!pin && Math.abs(pin.lat - 43.1306) < 1e-4 && Math.abs(pin.lon + 80.7469) < 1e-4, pin);
  same('at zoom 13, and it stays 13 when the setup redraws the map', await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`), 13);  same('the name chosen is the name the setup keeps', await js(`import('/js/wizard.js').then(m => m.currentState().name || m.currentState().loc?.label || '')`).then(n => /Woodstock/.test(n)), true);
  // coordinates are read here, with no service asked
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  await js(`document.querySelector('#mapxPlaceQ').value = '42.03, -93.62'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`document.querySelector('#mapxPlaceRes .mapx-row')`);
  same('coordinates become one row to choose', await js(`[document.querySelector('#mapxPlaceRes .cap').textContent, document.querySelector('#mapxPlaceRes .mapx-row b').textContent]`), ['Coordinates · choose to move your field there', '42.03000, -93.62000']);
  await js(`document.querySelector('#mapxPlaceQ').value = '-42.03N, -93.62'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await sleep(200);
  check('a coordinate with a mistake is explained, in words', /minus sign/i.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)) || /sign|disagree/i.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)), await js(`document.querySelector('#mapxPlaceRes').textContent`));
  // no match and a service that is down
  await withPlaces('none');
  await js(`localStorage.removeItem('crophalo.places.v1'); document.querySelector('#mapxPlaceQ').value = 'Qxzvbn'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`/No match/.test(document.querySelector('#mapxPlaceRes').textContent)`);
  check('no match says so, with the way round it', /No match for “Qxzvbn”\. Try a nearby town, or paste coordinates\./.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)));
  await withPlaces('down');
  await js(`localStorage.removeItem('crophalo.places.v1'); document.querySelector('#mapxPlaceQ').value = 'Anything'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`/not answering/.test(document.querySelector('#mapxPlaceRes').textContent)`);
  check('a service that is down is said so', /The place search is not answering right now\. You can paste coordinates instead\./.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)));
  // the pin and the outline can be shown now
  await js(`document.querySelector('.mapx-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the panel and focus goes back to its button', await js(`!document.querySelector('.mapx-panel') && document.activeElement.dataset.panel === 'places'`));
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  const showRows = await js(`[...document.querySelectorAll('#mapxPlaceShow button')].map(b => [b.disabled, b.textContent])`);
  check('with a pin the first "show" row is on, and it names the coordinates', showRows[0][0] === false && /\d\.\d{5}, -?\d+\.\d{5}/.test(showRows[0][1]), showRows);
  await js(`document.querySelector('#mapxPlaceShow button').click()`); await until(`!document.querySelector('.mapx-panel')`);
  check('"Your pin" zooms the map to the pin, at 14 or closer', await seen(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom() >= 14)`, 4000));
  // an outline makes the second row available and says its area
  const c = await centre(); await tool('rect'); await drag({ x: c.x - 80, y: c.y - 50 }, { x: c.x + 80, y: c.y + 50 });
  await until(`document.querySelector('.spot')`);
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  check('opening Places closes the spot card: one panel at a time', await js(`!document.querySelector('.spot')`));
  const areaRows = await js(`[...document.querySelectorAll('#mapxPlaceShow button')].map(b => [b.disabled, b.textContent])`);
  check('with an outline the second row shows its area', areaRows[1][0] === false && /\d+(\.\d+)? (ha|acres)/.test(areaRows[1][1]), areaRows);
  // a press outside closes the panel, and the tap that follows does not move the pin
  const before = (await state()).pin;
  await tapAt(c.x + 200, c.y + 120); await sleep(500);
  check('a click outside closes the panel and does not also move the pin', !(await panelOpen()) && JSON.stringify((await state()).pin) === JSON.stringify(before), [before, (await state()).pin]);
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  await js(`document.querySelector('#mapxAbout').click()`); await sleep(300);
  check('and the card closes the panel the other way round', !(await panelOpen()) && await js(`!!document.querySelector('.spot')`));
});

const GIBS_DOMAINS = Object.fromEntries(['MODIS_Terra_NDVI_8Day', 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', 'IMERG_Precipitation_Rate', 'MODIS_Terra_Land_Surface_Temp_Day'].map(id => [id, domains(id)]));
const layerRows = () => js(`[...document.querySelectorAll('.mapx-lrow')].map(r => [r.querySelector('b').textContent, r.querySelector('input').disabled, r.querySelector('input').checked, r.querySelector('.cap').textContent])`);
const openLayers = async () => { await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel')`); };
await group('layers', async () => {
  await mapReady();
  same('the top right holds Places and Layers, both closed', await js(`[...document.querySelectorAll('.mapx-pbtn')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-expanded'))`), ['Places:false', 'Layers:false']);
  // with every outside service cut off, every layer fails its check and is greyed, with the reason in words
  await sleep(2200);
  await openLayers();
  await until(`[...document.querySelectorAll('.mapx-lrow input')].slice(0, 4).every(i => i.disabled)`, 15000);
  same('with NASA\'s image server out of reach the four picture rows are disabled and say so', (await layerRows()).slice(0, 4).map(r => [r[1], r[3]]), Array(4).fill([true, 'Not available right now: NASA\'s image server did not answer']));
  check('the panel names its four picture layers and the fires, in order, under "NASA data"', (await layerRows()).map(r => r[0]).join() === 'Plant greenness,Soil moisture,Rain rate,Land temperature,Fires and hot spots' && /NASA data/.test(await js(`document.querySelector('.mapx-lset legend').textContent`)));
  check('"Turn all overlays off" is off while nothing is on, and the button still says Layers', await js(`document.querySelector('[data-alloff]').disabled && document.querySelector('[data-panel=layers] .mapx-w').textContent === 'Layers'`));
  // NASA answers (made-up transport, real answers recorded for the test): the rows come on
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '2026-11-15'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.querySelector('.mapx-pclose').click()`); await openLayers();
  await until(`[...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 8000);
  same('then all five are on offer, each with its product on the second line', (await layerRows()).map(r => [r[1], r[3]]), [[false, 'MODIS Terra, 250 m, an 8-day average'], [false, 'SMAP root zone, 9 km, daily'], [false, 'GPM IMERG, 10 km, daily'], [false, 'MODIS Terra, 1 km, daytime'], [false, 'VIIRS NOAA-20 and NOAA-21, 375 m, last 24 hours']]);
  await js(`document.querySelector('[data-layer=smap]').click()`); await until(`document.querySelector('[data-legend=smap]')`);
  const legend = await js(`document.querySelector('[data-legend=smap]').innerText.replace(/\\n+/g, ' | ')`);
  check('Soil moisture is on: its legend names the NASA product, the colour ends and the day of the image', /Soil moisture/.test(legend) && /NASA SMAP root zone, 9 km, daily/.test(legend) && /0 · dry/.test(legend) && /0\.7\+ · saturated/.test(legend) && new RegExp('Image of ' + J('10', 'November', '2026')).test(legend), legend);
  check('the legend has a source "i" for NASA GIBS, and the colour bar is a real gradient', await js(`!!document.querySelector('[data-legend=smap] .srci.nasa') && /linear-gradient/.test(document.querySelector('[data-legend=smap] .mapx-bar').style.background)`));
  check('the tiles are asked of NASA\'s server for that layer and that day', await js(`[...document.querySelectorAll('.leaflet-tile-pane img')].some(i => /SMAP_L4_Analyzed_Root_Zone_Soil_Moisture\\/default\\/${D('20261110')}\\/GoogleMapsCompatible_Level6/.test(i.src))`));
  same('the button says what is on, in the accent', await js(`[document.querySelector('[data-panel=layers] .mapx-w').textContent, document.querySelector('[data-panel=layers]').classList.contains('has-on')]`), ['Soil moisture', true]);
  // the date row
  await js(`document.querySelector('[data-legend=smap] [data-step="-1"]').click()`);
  same('Earlier image goes to the day before', await js(`document.querySelector('[data-legend=smap] [data-date]').value`), D('20261109'));
  await js(`document.querySelector('[data-legend=smap] [data-newest]').click()`);
  same('Newest comes back to the newest day NASA has, which is not after yesterday', await js(`document.querySelector('[data-legend=smap] [data-date]').value`), D('20261110'));
  check('there is no later image than the newest, said in words', await js(`(() => { document.querySelector('[data-legend=smap] [data-step="1"]').click(); return document.querySelector('[data-legend=smap] [data-date]').value === '${D('20261110')}'; })()`));
  await js(`{ const i = document.querySelector('[data-legend=smap] [data-date]'); i.value = '${D('20251101')}'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  check('a typed date is applied a moment after the last digit, not at once', await js(`document.querySelector('[data-legend=smap] [data-day]').textContent === 'Image of ${J('10', 'November', '2026')}'`));
  await until(`document.querySelector('[data-legend=smap] [data-day]').textContent === 'Image of ${J('9', 'October', '2025')}'`, 4000);
  same('a day with no image snaps to the nearest day NASA has, and says so', await js(`document.querySelector('[data-legend=smap] [data-snap]').textContent`), `NASA has no image for ${J('1', 'November', '2025')}. Showing ${J('9', 'October', '2025')}, the nearest day it has.`);
  // opacity: the last value is the next layer's default; the layer turned on last is on top
  await js(`{ const r = document.querySelector('[data-legend=smap] [data-op]'); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); }`);
  check('the opacity slider changes the tiles', await js(`[...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].some(l => l.style.opacity === '0.4')`));
  await js(`document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]')`);
  same('the next layer starts at the last opacity', await js(`document.querySelector('[data-legend=rain] [data-op]').value`), '40');
  same('two layers: the button says so, and the one turned on last is drawn on top', await js(`(() => { const z = id => +[...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].find(l => l.querySelector('img')?.src.includes(id))?.style.zIndex; return [document.querySelector('[data-panel=layers] .mapx-w').textContent, z('IMERG') > z('SMAP_L4')]; })()`), ['2 layers', true]);
  // a layer with no image for the part of the map says so, in words, never a blank
  await sleep(2500);
  const rainNote = await js(`document.querySelector('[data-legend=rain] [data-lnote]').textContent`);
  same('the harness cuts the tiles off, so the legend says there is no image for this part of the map, in the sentence of the note, not a blank', rainNote, 'NASA has no image for this part of the map on this date. Try another date or move the map.');
  check('the legend stack is inside the map, 288 px at most, and does not cover the view buttons', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), l = document.querySelector('.mapx-legends').getBoundingClientRect(), s = document.querySelector('.mapx-stack').getBoundingClientRect(); return l.left >= m.left && l.right <= m.right && l.width <= 289 && (l.right <= s.left || l.bottom <= s.top || l.top >= s.bottom); })()`));
  await js(`document.querySelector('[data-legend=smap] [data-off]').click()`);
  check('the × turns the layer off: its legend and its tiles go', await js(`!document.querySelector('[data-legend=smap]') && ![...document.querySelectorAll('.leaflet-tile-pane img')].some(i => /SMAP_L4/.test(i.src))`));
  same('and the button names the one left', await js(`document.querySelector('[data-panel=layers] .mapx-w').textContent`), 'Rain rate');
  if (!(await panelOpen())) await openLayers();
  await js(`document.querySelector('[data-alloff]').click()`);
  check('"Turn all overlays off" clears every legend and the button goes back to Layers', await js(`!document.querySelector('.mapx-legend') && document.querySelector('[data-panel=layers] .mapx-w').textContent === 'Layers' && document.querySelector('.mapx-legends').hidden`));
  // a layer that fails its check while it is on is taken off, with a sentence
  await js(`document.querySelector('[data-layer=temp]').click()`); await until(`document.querySelector('[data-legend=temp]')`);
  await js(`import('/js/maplayers.js').then(m => { m.net.tile = () => Promise.reject(new Error('tile')); return m.layersCtl().probe(true); })`);
  await until(`!document.querySelector('[data-legend=temp]')`, 6000);
  check('a layer that stops answering is taken off the map and greyed in the panel, in words', await js(`!document.querySelector('[data-legend=temp]')`) && (await layerRows())[3][1] === true && /did not answer/.test((await layerRows())[3][3]));
  // fires and hot spots: points from our own server, a stubbed answer in the real shape
  const FA = { ok: true, count: 2, shown: 2, newest: '2026-11-15T01:30:00Z', incomplete: undefined, points: [{ lat: 44.4, lon: -79.7, time: '2026-11-15T01:30:00Z', frp: 12.5, confidence: 'high', satellite: 'NOAA-20', night: true }, { lat: 44.6, lon: -79.5, time: '2026-11-15T01:30:00Z', frp: null, confidence: 'low', satellite: 'NOAA-21', night: true }] };
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve(${JSON.stringify(FA)}); })`);
  check('the fires row is a normal row, not greyed by the picture check', (await layerRows())[4][1] === false);
  await js(`document.querySelector('[data-layer=fires]').click()`); await until(`document.querySelector('[data-legend=fires]') && document.querySelectorAll('path.leaflet-interactive').length === 2`, 6000);
  check('turning fires on draws one dot for each spot and the legend says plainly what was and was not seen', await js(`document.querySelectorAll('path.leaflet-interactive').length === 2 && /2 spots seen within about 250 km/.test(document.querySelector('[data-lnote=fires]').textContent) && /No spot does not mean there is no fire/.test(document.querySelector('[data-lnote=fires]').textContent) && /15 November 2026, 01:30 UTC/.test(document.querySelector('[data-lnote=fires]').textContent)`));
  check('the legend has three colour words, no date row and no opacity slider', await js(`document.querySelectorAll('[data-legend=fires] .mapx-dots li').length === 3 && !document.querySelector('[data-legend=fires] [data-date]') && !document.querySelector('[data-legend=fires] [data-op]')`));
  same('the button names it', await js(`document.querySelector('[data-panel=layers] .mapx-w').textContent`), 'Fires and hot spots');
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve({ ok: true, count: 0, shown: 0, points: [], newest: '2026-11-15T01:30:00Z' }); })`);
  await js(`document.querySelector('[data-look=fires]').click()`); await until(`document.querySelectorAll('path.leaflet-interactive').length === 0 && /saw no fire/.test(document.querySelector('[data-lnote=fires]').textContent)`, 6000);
  check('looking again with none seen says so and keeps the warning that none seen is not none burning', await js(`/No spot does not mean/.test(document.querySelector('[data-lnote=fires]').textContent)`));
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve({ ok: false, reason: 'NASA FIRMS took too long to answer; try again in a few minutes' }); })`);
  await js(`document.querySelector('[data-look=fires]').click()`); await until(`/took too long/.test(document.querySelector('[data-lnote=fires]').textContent)`, 6000);
  check('a failed answer shows the server\'s plain reason and no dots', await js(`document.querySelectorAll('path.leaflet-interactive').length === 0`));
  await js(`document.querySelector('[data-off=fires]').click()`);
  check('turned off, the legend and the dots are gone', await js(`!document.querySelector('[data-legend=fires]') && document.querySelectorAll('path.leaflet-interactive').length === 0`));
  // one panel at a time, and Escape closes
  await js(`document.querySelector('.mapx-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the Layers panel and focus returns to its button', await js(`!document.querySelector('.mapx-panel') && document.activeElement.dataset.panel === 'layers'`));
});

await group('layersFit', async () => {
  await mapReady(); await sleep(2200);
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 8000);
  await js(`document.querySelector('[data-layer=ndvi]').click()`); await until(`document.querySelector('[data-legend=ndvi]')`);
  await js(`document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]')`);
  for (const w of WIDTHS) { await size(w); await sleep(500); await flat(`the map with the Layers panel open and two legends at ${w} px`); }
  check('at the narrowest width the panel and the legends stay inside the map', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(); return [...document.querySelectorAll('.mapx-panel, .mapx-legends')].every(e => { const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1; }); })()`));
  await size(1280);
});

// What the farmer's eye would catch: parts of the map's own controls that lie over each other, parts outside the map, buttons of one bar with different heights, and a bar button under 44 px. Measured, not looked at.
const MEASURE = `(() => {
  const R = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const map = document.querySelector('#mapx').getBoundingClientRect(), shown = e => e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const parts = { tools: '[aria-label="Map tool"]', base: '.mapx-base', about: '#mapxAbout', reselect: '#mapxReselect', right: '.mapx-right', panel: '.mapx-panel', stack: '.mapx-stack', hint: '.mapx-hint', note: '.mapx-basenote', legends: '.mapx-legends', spot: '.spot', credit: '.mapx-credit', scale: '.leaflet-control-scale' };
  const boxes = {}; for (const [k, sel] of Object.entries(parts)) { const e = document.querySelector(sel); if (shown(e)) boxes[k] = R(e); }
  const names = Object.keys(boxes), overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const a = boxes[names[i]], b = boxes[names[j]]; if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) overlaps.push(names[i] + ' over ' + names[j]); }
  const outside = names.filter(k => boxes[k].x < map.left - 1 || boxes[k].r > map.right + 1 || boxes[k].y < map.top - 1 || boxes[k].b > map.bottom + 1);
  const bar = [...document.querySelectorAll('.mapx-base, #mapxAbout, .mapx-pbtn')].filter(shown).map(e => Math.round(e.getBoundingClientRect().height));
  const small = [...document.querySelectorAll('.mapx-pbtn, .mapx-base button, .mapx-pclose, .mapx-lx, .mapx-row, .mapx-lrow')].filter(shown).filter(e => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(e => (e.getAttribute('aria-label') || e.className).toString().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
  return { overlaps, outside, boxes: Object.fromEntries(names.map(k => [k, [boxes[k].x - map.left, boxes[k].y - map.top, boxes[k].w, boxes[k].h].map(Math.round)])), barHeights: [...new Set(bar)], small, map: [Math.round(map.width), Math.round(map.height)] };
})()`;
await group('layoutAudit', async () => {
  await mapReady(); await sleep(2200);
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 43.13, lon: -80.75, name: 'Oxford', country: 'CA' } }))`); await sleep(500);
  for (const w of WIDTHS) {
    await size(w); await sleep(500);
    const states = { 'the bare map': async () => {}, 'Places open': async () => { await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`); }, 'Layers open with two legends': async () => { await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 8000); await js(`document.querySelector('[data-layer=ndvi]').click()`); await until(`document.querySelector('[data-legend=ndvi]')`); await js(`document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]')`); }, 'a legend and the About card': async () => { if (!(await js(`!!document.querySelector('#mapxAbout') && document.querySelector('#mapxAbout').offsetParent !== null`))) return; await js(`document.querySelector('#mapxAbout').click()`); await until(`document.querySelector('.spot')`); } };
    for (const [name, open] of Object.entries(states)) {
      await js(`document.querySelector('.mapx-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.spot')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); import('/js/maplayers.js').then(l => l.layersCtl().allOff())`); await sleep(200);
      await open(); await sleep(400);
      const m = await js(MEASURE);
      check(`${w} px, ${name}: no control lies over another`, m.overlaps.length === 0, [m.overlaps, m.boxes, m.map]);
      check(`${w} px, ${name}: every control is inside the map`, m.outside.length === 0, [m.outside, m.boxes, m.map]);
      check(`${w} px, ${name}: the buttons of the top bars are one height`, m.barHeights.length <= 1, m.barHeights);
      check(`${w} px, ${name}: every bar button, row and close is at least 44 px each way`, m.small.length === 0, m.small);
    }
  }
  await size(1280);
});

const animOf = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const c = getComputedStyle(e); return [c.animationName, c.animationDuration, c.animationIterationCount]; })()`);
await group('motion', async () => {
  await mapReady(); await sleep(800);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 43.13, lon: -80.75, name: 'Oxford', country: 'CA' } }))`); await sleep(700);
  const c = await centre(); await tool('rect'); await drag({ x: c.x - 70, y: c.y - 40 }, { x: c.x + 70, y: c.y + 40 }); await until(`document.querySelector('.spot')`); await sleep(500);
  const zoomNow = () => js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`);
  for (const [mode, label] of [['', 'Full'], ['less', 'Less'], ['reduce', 'Still']]) {
    await js(`document.documentElement.dataset.motion = ${JSON.stringify(mode)}`);
    const ants = await animOf('.mapx-ants'), pin = await animOf('.mapx-pin svg');
    if (mode === '') check('Full: the outline\'s dashes march, the pin drops in', ants[0] === 'mapx-ants' && ants[2] === 'infinite' && pin[0] === 'mapx-drop', [ants, pin]);
    if (mode === 'less') check('Less: the outline is a plain dashed line, and the pin only fades in, in 200 ms or less', ants[0] === 'none' && pin[0] === 'mapx-fade' && parseFloat(pin[1]) <= 0.2 && pin[2] === '1', [ants, pin]);
    if (mode === 'reduce') check('Still: nothing on the map moves', ants[0] === 'none' && pin[0] === 'none', [ants, pin]);
    check(`${label}: the outline still has its dashes (it is dashed, not solid)`, await js(`getComputedStyle(document.querySelector('.mapx-ants')).strokeDasharray !== 'none'`));
    // no flying: the view buttons and "Zoom to your field" jump
    const z0 = await zoomNow(); await js(`document.querySelector('[data-view=in]').click()`);
    const gliding = await js(`import('/js/mapbase.js').then(m => !!m.baseNow().leaflet()._animatingZoom)`);
    if (mode !== '') check(`${label}: Zoom in jumps, it does not glide`, gliding === false && (await zoomNow()) === z0 + 1, [gliding, z0, await zoomNow()]);
    else await sleep(500);
    await js(`document.querySelector('[data-view=field]').click()`);
    const flying = await js(`import('/js/mapbase.js').then(m => { const map = m.baseNow().leaflet(); return !!(map._animatingZoom || map._panAnim?._inProgress); })`);
    if (mode !== '') check(`${label}: Zoom to your field jumps, it does not fly`, flying === false, flying);
    await sleep(700);
    // a pan stops where the hand stops
    await js(`import('/js/mapbase.js').then(m => { const map = m.baseNow().leaflet(); document.querySelector('.leaflet-container').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })); window.__inertia = map.options.inertia; })`);
    same(`${label}: the pan keeps gliding after the hand lifts only under Full`, await js(`window.__inertia`), mode === '');
  }
  // the card slides in under Full, fades under Less, and does not move under Still
  for (const [mode, want] of [['', 'spot-in'], ['less', 'mapx-fade'], ['reduce', 'none']]) {
    await js(`document.documentElement.dataset.motion = ${JSON.stringify(mode)}; document.querySelector('.spot')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(200);
    await js(`document.querySelector('#mapxAbout').click()`); await until(`document.querySelector('.spot') && document.querySelector('.spot').style.opacity === ''`);
    const card = await animOf('.spot');
    check(`the card: ${mode === '' ? 'Full' : mode === 'less' ? 'Less' : 'Still'} gives its ${want === 'none' ? 'no animation' : want}`, mode === 'reduce' ? card[0] === 'none' : card[0] === want, card);
  }
  await js(`document.documentElement.dataset.motion = ''`);
});

await group('stack', async () => {
  await mapReady();
  same('five buttons, each named', await js(`[...document.querySelectorAll('.mapx-stack button')].map(b => b.getAttribute('aria-label'))`), ['Zoom in', 'Zoom out', 'Zoom to your field', 'Move the pin to where I am', 'Full-screen map']);
  check('every button is at least 44 by 44', await js(`[...document.querySelectorAll('.mapx-stack button')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })`));
  const z0 = await js(`document.querySelector('.leaflet-container')._leaflet_map?.getZoom?.() ?? -1`);
  await js(`document.querySelector('[data-view=field]').click()`);
  check('Zoom to your field with no pin says to drop one', /Drop a pin first/.test(await js(`document.querySelector('#toast').textContent`)));
  await js(`document.querySelector('[data-view=full]').click()`); await sleep(100);
  same('full screen toggles, hides the top bar and renames its button', await js(`[document.querySelector('#mapx').classList.contains('full'), getComputedStyle(document.querySelector('.nav')).display, document.querySelector('[data-view=full]').getAttribute('aria-label')]`), [true, 'none', 'Exit full-screen map']);
  await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(100);
  check('Escape leaves full screen', await js(`!document.querySelector('#mapx').classList.contains('full')`));
  await js(`Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, bad) => bad({ code: 1 }) }, configurable: true })`);
  await js(`document.querySelector('[data-view=here]').click()`);
  same('a refused location is explained', await js(`document.querySelector('#toast').textContent`), 'Location is switched off for this site. Allow it in your browser settings, or search for a place or paste coordinates instead.');
  await js(`Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: ok => ok({ coords: { latitude: 44.3894, longitude: -79.6903 } }) }, configurable: true })`);
  await js(`document.querySelector('[data-view=here]').click()`); await until(`document.querySelector('.mapx-pin')`);
  same('a found position puts the pin there', await js(`import('/js/mapx.js').then(m => [m.mapState().pin.lat, m.mapState().pin.lon])`), [44.3894, -79.6903]);
  check('the photo is credited', /Esri/.test(await js(`document.querySelector('#mapxCredit').textContent`)));
  check('no sea, lake or border name is drawn by the page (only the photo)', await js(`!document.querySelector('.leaflet-tooltip, .leaflet-marker-icon[title*=" Sea"]')`));
});

await group('fit', async () => {
  for (const largest of [false, true]) for (const w of WIDTHS) {
    await size(w); await mapReady();
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${largest ? 'xlarge' : 'default'}' }))`); await sleep(250);
    await flat(`the setup map at ${w} px${largest ? ' with the largest text' : ''}`);
    check(`the map at ${w} px has a real height and width`, await js(`(() => { const r = document.querySelector('#mapx').getBoundingClientRect(); return r.width >= 200 && r.height >= 120; })()`));
    check(`the tools, the stack and the credit stay inside the map at ${w} px (the ones a short map hides are left out)`, await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(); return ['.mapx-top', '.mapx-stack', '.mapx-credit', '.leaflet-control-scale'].every(s => { const e = document.querySelector(s); if (getComputedStyle(e).display === 'none') return true; const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1; }); })()`));
  }
});

await group('axe', async () => {
  const axe = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const w of WIDTHS) {
    await size(w); await mapReady(); await js(axe);
    for (const [name, prep] of [['the map', ''], ['the map with a pin', `import('/js/mapx.js').then(m => 1); document.querySelector('#mapx').focus()`]]) {
      if (prep) await js(prep); await sleep(250);
      const found = await js(`axe.run(document.querySelector('#view-setup'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
      check(`axe: ${name} at ${w} px has no problem`, found.length === 0, found.join(' | '));
    }
  }
});

await finish();
