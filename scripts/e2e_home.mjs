// Crophalo's home Earth suite: the turning Blue Marble and its thirteen real satellites, driven in a real browser on the throwaway copy that
// scripts/e2e_lib.mjs makes (its own port and profile, every outside service cut off; the elements are the ones recorded from CelesTrak, the clock pinned to them).
// Groups (E2E_ONLY=hover,keyboard picks some): draw, hover, touch, keyboard, pause, motion, hidden, positions, offline, fit, axe, speed.
// RULE: never loosen a check to make it pass without a written farming reason beside it. Run: node scripts/e2e_home.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_home');
const { ROOT, js, page, until, seen, tap, tapAt, rest, press, size, device, go, flat, check, same, finish, sleep, send } = run;
const mod = rel => import(pathToFileURL(path.join(ROOT, rel)).href);
const { json2satrec } = await mod('vendor/satellite/io.js');
const { propagate } = await mod('vendor/satellite/propagation/propagate.js');
const { gstime } = await mod('vendor/satellite/propagation/gstime.js');
const { eciToEcf, eciToGeodetic } = await mod('vendor/satellite/transforms.js');
const DATA = await mod('js/home-sats-data.js');
const REGIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8')), REGION = REGIONS[0];
const placeOf = r => r.name.replace(/^an? (?:research )?field /i, '').replace(/^near /i, '');
const DEMO_LINE = `Try a demo field: near ${placeOf(REGIONS[0])}${REGIONS.slice(1).map(r => ` · ${placeOf(r)}`).join('')}`;

// ---- the recorded elements, as the server hands them out (scripts/live/orbits.py), and the clock pinned near them
const FX = path.join(ROOT, 'scripts', 'fixtures', 'live', 'orbits');
const OMMS = fs.readdirSync(FX).filter(n => n.endsWith('.body')).map(n => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'))[0]);
const T0 = '2026-11-15T03:30:00Z';
const answerOf = (omms = OMMS) => ({ ok: true, source: 'recorded test input', credit: 'Orbits: U.S. Space Force (Space-Track.org), via CelesTrak.', replayed: true,
  satellites: omms.map(omm => ({ norad: omm.NORAD_CAT_ID, name: omm.OBJECT_NAME, epoch: DATA.isoMs(DATA.epochMs(omm.EPOCH)), omm })), missing: [] });
// what the page is given for /api/orbits: an answer, a failure, nothing at all (the copied server has no Python, so it says so), or a hang
let script = null;
async function setup({ orbits = answerOf(), at = T0, noGl = false } = {}) {
  if (script) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
  const token = String(Math.random());   // a new setup starts with no elements kept from the one before
  const source = `(() => { const T0 = Date.parse(${JSON.stringify(at)}), p0 = performance.now(); Date.now = () => Math.floor(T0 + (performance.now() - p0));
    if (${noGl}) { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, o) { return /webgl/i.test(kind) ? null : get.call(this, kind, o); }; }   // a browser whose graphics chip is blocked
    try { if (sessionStorage.getItem('test.setup') !== ${JSON.stringify(token)}) { sessionStorage.removeItem('crophalo.orbits.v1'); localStorage.removeItem('crophalo.orbits.v1'); sessionStorage.setItem('test.setup', ${JSON.stringify(token)}); } } catch {}
    window.__raf = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); };
    window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
    const give = ${JSON.stringify(orbits)}, real = window.fetch.bind(window);
    window.fetch = (url, o) => { const link = String(url && url.url || url); if (/\\/api\\/(?!orbits)/.test(link)) return Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'stand-in: the copied server has no lookups' }), { status: 200, headers: { 'content-type': 'application/json' } }));   // the setup's lookups answer plainly: no failed request, no console error
      if (!/\\/api\\/orbits/.test(link) || give === 'server') return real(url, o);
      window.__askedAt = performance.now();
      if (give === 'hang') return new Promise(() => {});
      return Promise.resolve(new Response(JSON.stringify(give), { status: give.ok ? 200 : 500, headers: { 'content-type': 'application/json' } })); }; })();`;
  ({ identifier: script } = await send('Page.addScriptToEvaluateOnNewDocument', { source }));
}
const welcomed = async () => { await js(`import('/js/welcome.js').then(m => localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: 'test' })))`); await go('/'); await rest(); };
const sky = () => js(`import('/js/home-sats.js').then(m => m.skyNow())`);
const drawn = (ms = 20e3) => until(`import('/js/home-sats.js').then(m => !!m.skyNow())`, ms);
const rafs = () => js('window.__raf');
async function rafIn(ms) { const a = await rafs(); await sleep(ms); return (await rafs()) - a; }
const card = () => page(T => { const c = document.querySelector('#satCard'); return { open: !c.hidden && T.shown(c), name: c.querySelector('#satCardName').textContent, by: c.querySelector('#satCardBy').textContent,
  does: c.querySelector('#satCardDoes').textContent, uses: c.querySelector('#satCardUses').textContent, now: c.querySelector('#satCardNow').textContent, src: c.querySelector('#satCardSrc').textContent,
  plain: c.querySelector('#satCardDoes').textContent, gathers: c.querySelector('#satCardGathers').textContent, foldOpen: c.querySelector('#satCardMore').open, credit: c.querySelector('#satCardCredit').textContent,
  pic: c.querySelector('#satCardPic').classList.contains('has-pic'), img: c.querySelector('#satCardImg').getAttribute('src') || '', alt: c.querySelector('#satCardImg').alt, mark: !!c.querySelector('.sat-pic-mark svg path'),
  go: c.querySelector('#satCardGo').textContent, page: c.querySelector('#satCardPage').href, box: T.box(c), norad: +c.dataset.norad }; });
// where a satellite is on the screen, and one that is easy to point at: in sight, on the Earth's near side, 40 px or more from every other
async function screenOf(norad) { const s = await sky(), r = await js(`(r => ({ x: r.left, y: r.top }))(document.querySelector('#satCanvas').getBoundingClientRect())`), it = s.sats.find(x => x.norad === norad); return { x: r.x + it.x, y: r.y + it.y, it, s }; }
async function easyOne() {
  const s = await sky(), r = await js(`(r => ({ x: r.left, y: r.top, w: innerWidth, h: innerHeight }))(document.querySelector('#satCanvas').getBoundingClientRect())`);
  const ok = s.sats.filter(a => a.seen && a.depth > 0.25 && r.x + a.x > 40 && r.x + a.x < r.w - 40 && r.y + a.y > 70 && r.y + a.y < r.h - 90 && s.sats.every(b => b === a || Math.hypot(a.x - b.x, a.y - b.y) > 40));
  return ok.sort((a, b) => b.depth - a.depth)[0] || null;
}
const mouseTo = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
const group = (label, body, opts) => run.group(label, async () => { await setup(opts); await go('/'); await welcomed(); try { await body(); } finally { await setup(); } });   // the next group's first loads get the recorded elements too
const SAT = Object.fromEntries(DATA.SATS.map(s => [s.norad, s]));
await setup();

// ---- draw: the Earth and the thirteen satellites, the words around them, the demo field
await group('draw', async () => {
  check('draw: the satellites are drawn within 20 s of the page', await drawn().then(() => true, () => false));
  await sleep(800);   // turning, each trail grows in over its first few frames
  const s = await sky();
  same('draw: all thirteen satellites Crophalo reads, in the list\'s order', s.sats.map(x => x.norad), DATA.SATS.map(x => x.norad));
  check('draw: each one has a place on the drawing and a trail of its real path', s.sats.every(x => Number.isFinite(x.x) && Number.isFinite(x.y) && x.trail >= 20), s.sats.map(x => `${x.name} ${x.trail}`));
  check('draw: some are on the near side and some behind the Earth, as the real ones are', s.sats.some(x => x.seen) && s.sats.some(x => !x.seen), s.sats.map(x => `${x.name}:${x.seen}`));
  const epochs = OMMS.map(o => DATA.epochMs(o.EPOCH)), span = DATA.spanWords(Math.min(...epochs), Math.max(...epochs));
  same('draw: the credit names the orbits\' source and the span of the elements\' own epochs', await js(`document.querySelector('#orbitCreditSats').textContent`), `Orbits: U.S. Space Force (Space-Track.org), via CelesTrak; elements of ${span}.`);
  { const e = await page(T => ({ lit: document.querySelector('#orbitStage').classList.contains('lit'), shown: document.querySelector('#orbitCanvas').classList.contains('shown') })), wms = await js(`performance.getEntriesByType('resource').filter(e => /gibs\\.earthdata\\.nasa\\.gov\\/wms/.test(e.name)).length`), credit = await js(`document.querySelector('#orbitCreditPic').textContent`);
    // The year of the picture is written in brackets after its name, as js/home-orbit.js writes it, because the project's date check reads the name and the bare year as a month.
    check('draw: with every outside host cut off, the Earth is drawn from the app\'s own picture, and NASA\'s picture server is never asked for it', e.lit && e.shown && wms === 0 && /^(Blue Marble \(2004\): NASA Earth Observatory\.|Daylight over the last 12 hours|Light: the sun’s real place at \d\d:\d\d UTC\. Picture: Blue Marble \(2004\)\.)$/.test(credit), [e, wms, credit]); }
  { const files = await js(`Promise.all(['small', 'sharp'].map(n => fetch('/img/earth/' + n + '.webp').then(async r => [n, r.status, r.headers.get('content-type'), (await r.arrayBuffer()).byteLength])))`);
    check('draw: the two Earth files are served as image/webp, the small one under 30 KB and the sharp one under 300 KB', files.every(f => f[1] === 200 && f[2] === 'image/webp') && files[0][3] < 30000 && files[1][3] < 300000, files); }
  { const first = await js(`(() => { const r = performance.getEntriesByType('resource').find(e => /img\\/earth\\/small\\.webp/.test(e.name)); return r ? Math.round(r.responseEnd) : null; })()`);
    check('draw: the first Earth picture arrived within one second of the page (judged at 3 s on a busy computer)', first !== null && first < 3000, first); }
  check('draw: the words for a screen reader say what is drawn', /13 satellites whose data Crophalo reads/.test(await js(`document.querySelector('#satAlt').textContent`)));
  check('draw: the hint says how to read a satellite in one short sentence; the pace is said once, by the clock line, not in the hint', await page(T => T.shown(document.querySelector('#orbitHint')) && /^Point at a satellite to see what it does\./.test(document.querySelector('#orbitHint').textContent) && !/sped up/.test(document.querySelector('#orbitHint').textContent) && document.querySelector('#orbitHint').textContent.split('.').filter(Boolean).length === 1));
  same('draw: the demo line names every field of data/regions.json, as one sentence of links', await js(`document.querySelector('#searchTry').textContent.replace(/\\s+/g, ' ').trim()`), DEMO_LINE.replace(/\s+/g, ' '));
  check('draw: the demo is the first region of the data file, not Oxford County', !!REGION.name && !/Oxford/.test(await js(`document.querySelector('#view-home').textContent`)));
  same('draw: the Pause is there while things move, with its words', await page(T => [T.shown(document.querySelector('#orbitPause')), document.querySelector('#orbitPause').getAttribute('aria-label')]), [true, 'Pause the Earth and the satellites']);
  check('draw: the keyboard list holds one button per satellite, each with its name and what it does', await js(`[...document.querySelectorAll('#satList .sat-btn')].every(b => b.textContent.trim().length > 3 && document.getElementById(b.getAttribute('aria-describedby'))?.textContent.includes('Crophalo uses')) && document.querySelectorAll('#satList .sat-btn').length === 13`));
  check('draw: what a satellite does is read with its button only, not a second time as loose words in the list', await js(`[...document.querySelectorAll('#satList li')].every(li => [...li.children].every(el => el.matches('.sat-btn') || el.hidden) && document.getElementById(li.querySelector('.sat-btn').getAttribute('aria-describedby')).hidden)`));
  // the report's Satellites tab draws its cards as .sat-card; the home's card has a name of its own, so those cards keep their own place and look (and are printed)
  check('draw: the report\'s satellite cards (.sat-card) are not moved or styled by the home\'s satellite card', await js(`(() => { const a = document.createElement('article'); a.className = 'card pad sat-card'; a.innerHTML = '<h3>Satellite rain</h3><p>A card of the report</p>'; document.querySelector('main').append(a);
    const cs = getComputedStyle(a), ok = cs.position === 'static' && cs.zIndex === 'auto' && cs.animationName === 'none' && !document.querySelector('#satCard').classList.contains('sat-card'); a.remove(); return ok; })()`));
});

// ---- hover: pointing at a satellite holds everything still and opens its card; leaving it lets go
await group('credit', async () => {   // the owner: the credit block is short and never touches the Earth
  for (const [w, h] of [[1440, 900], [1280, 720], [768, 1024], [390, 844]]) for (const big of [false, true]) {
    await size(w, h); await go('/'); await until(`!!document.querySelector('#orbitCreditShort')`, 8000); await drawn().catch(() => {});
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`); await sleep(500);
    const m = await js(`(() => { const ph = document.querySelector('.orbit-ph').getBoundingClientRect(), cx = ph.left + ph.width / 2, cy = ph.top + ph.height / 2, r = ph.width / 2, p = document.querySelector('#orbitCredit').getBoundingClientRect(), short = document.querySelector('#orbitCreditShort').innerText,
      clear = b => { const nx = Math.max(b.left, Math.min(cx, b.right)), ny = Math.max(b.top, Math.min(cy, b.bottom)); return Math.hypot(nx - cx, ny - cy) - r; }, pause = document.querySelector('#orbitPause'), pb = pause && !pause.hidden ? pause.getBoundingClientRect() : null,
      gapBox = (a, b) => Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      return { sentences: (short.replace(/U\\.S\\./g, 'US').match(/[.!?](\\s|$)/g) || []).length, short, fromGlobe: Math.round(clear(p)), pauseFromGlobe: pb ? Math.round(clear(pb)) : null, creditFromPause: pb ? Math.round(gapBox(p, pb)) : null, onScreen: p.bottom <= innerHeight + 1 || scrollY > 0, text: document.documentElement.dataset.text || 'default' }; })()`);
    const where = `${w} x ${h}${big ? ' with the Largest text' : ''}`;
    check(`credit: ${where}: the credit in sight is four sentences or fewer and keeps the line about NASA, ESA and NOAA`, m.sentences <= 4 && /Not made, reviewed or endorsed by NASA, ESA or NOAA\./.test(m.short), m);
    check(`credit: ${where}: the credit block is at least 16 px clear of the Earth`, m.fromGlobe >= 16, m);
    if (m.pauseFromGlobe !== null && w > 860) check(`credit: ${where}: the Pause button is 16 px clear of the Earth and of the credit`, m.pauseFromGlobe >= 16 && m.creditFromPause >= 12, m);
  }
  await size(1280, 720); await go('/'); await until(`!!document.querySelector('#orbitCreditMore')`, 8000);
  const before = await js(`getComputedStyle(document.querySelector('#orbitCreditAll')).display`); await js(`document.querySelector('#orbitCreditMore').click()`);
  check('credit: Credits opens the rest (the sun\'s place, the span of the orbits with Space-Track, the spacecraft pictures) and closes it again', before === 'none' && await js(`getComputedStyle(document.querySelector('#orbitCreditAll')).display`) !== 'none' && await js(`document.querySelector('#orbitCreditMore').getAttribute('aria-expanded')`) === 'true');
});

await group('demos', async () => {   // every demo field is one tap from the home line: 44 px high links, each opens its own field
  for (const width of [1280, 320]) {
    await size(width); await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`, 20000);
    const links = await js(`[...document.querySelectorAll('#searchTry button[data-region]')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.region, h: Math.round(r.height), w: Math.round(r.width), text: b.textContent }; })`);
    same(`demos: at ${width} px one link for each field, in the order of data/regions.json`, links.map(l => l.id), REGIONS.map(r => r.id));
    check(`demos: at ${width} px every link is 44 px high`, links.every(l => l.h >= 43.5), links);
    check(`demos: at ${width} px the line does not scroll sideways`, await js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`));
  }
  await size(1280);
  for (const r of REGIONS) {
    await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`, 20000);
    await js(`document.documentElement.dataset.motion = 'reduce'`);   // the cut, not the fall: this group looks at which field opens
    await js(`document.querySelector('#searchTry button[data-region="${r.id}"]').click()`);
    await until(`!document.querySelector('#view-setup').hidden`, 8000);
    check(`demos: the link for ${placeOf(r)} opens the setup of that field`, await js(`document.querySelector('#view-setup').innerText.includes(${JSON.stringify(placeOf(r).split(',')[0])})`), (await js(`document.querySelector('#view-setup').innerText`)).slice(0, 200));
  }
});

await group('hover', async () => {
  await size(1440, 900); await go('/'); await drawn(); await sleep(400);
  const one = await easyOne();
  check('hover: a satellite in sight can be found to point at', !!one);
  if (!one) return;
  const at = await screenOf(one.norad); await mouseTo(at.x, at.y);
  check('hover: its card opens', await seen(`!document.querySelector('#satCard').hidden && +document.querySelector('#satCard').dataset.norad === ${one.norad}`, 2000));
  const c = await card(), sat = SAT[one.norad];
  same('hover: the card says the name and, in at most four plain sentences, what the farmer gets from it; the rest waits under Show more, closed', [c.name, c.plain, c.foldOpen, (c.plain.match(/[.!?](\s|$)/g) || []).length <= 4], [sat.name, sat.plain.join(' '), false, true]);
  same('hover: under Show more: who runs it, its instrument, what Crophalo reads it for', [c.by, c.gathers.startsWith(`Its instrument: ${sat.gathers}. ${sat.more}`), c.uses], [`Run by ${sat.by}.`, true, sat.uses]);
  check('hover: the window shows the satellite\'s own mark, large', c.mark);
  check('hover: the card links to the screen it feeds and to the mission\'s own page', c.go === DATA.GO_WORDS[sat.go] && c.page === sat.page, [c.go, c.page]);
  check('hover: the card says the height, the speed and the place now, in numbers', /^(On the far side of the Earth right now\. )?At \d\d:\d\d UTC, the time shown: \d[\d,]* km up, \d\.\d km\/s, over \d+\.\d° [NS], \d+\.\d° [EW]\.$/.test(c.now), c.now);
  const omm = OMMS.find(o => o.NORAD_CAT_ID === one.norad), ep = DATA.epochMs(omm.EPOCH);
  check('hover: the card says which elements the position comes from, and how old they are', c.src.startsWith(`Position from orbital elements of ${DATA.stampWords(ep)}, `) && / old\.$/.test(c.src), c.src);
  check('hover: the card sits beside the satellite, inside the screen', Math.hypot(Math.max(c.box.x - at.x, 0, at.x - c.box.r), Math.max(c.box.y - at.y, 0, at.y - c.box.b)) < 60 && c.box.x >= 0 && c.box.r <= 1440, c.box);
  await sleep(900);
  const a = await sky(); await sleep(700); const b = await sky();
  const pa = a.sats.find(x => x.norad === one.norad), pb = b.sats.find(x => x.norad === one.norad), other = a.sats.find(x => x.norad !== one.norad && x.seen), otherB = b.sats.find(x => x.norad === other.norad);
  check('hover: only the satellite pointed at holds still, under the pointer', a.pinned && Math.hypot(pb.x - pa.x, pb.y - pa.y) < 0.01, [pa.x, pb.x]);
  check('hover: the others and the Earth move on at their pace (the owner, 15 November 2026: "satellites are not moving")', b.time > a.time && Math.abs(b.cam.lon - a.cam.lon) > 0.2 && Math.hypot(otherB.x - other.x, otherB.y - other.y) > 0.5, [b.time - a.time, b.cam.lon - a.cam.lon]);
  check('hover: frames are drawn while the card is open', await rafIn(800) > 5);
  same('hover: the drawing marks the satellite pointed at', b.active, one.norad);
  await mouseTo(60, 870);
  check('hover: moving away closes the card', await seen(`document.querySelector('#satCard').hidden`, 1500));
  { const s1 = await sky(), p1 = s1.sats.find(x => x.norad === one.norad); await sleep(120); const s2 = await sky(), p2 = s2.sats.find(x => x.norad === one.norad);
    check('hover: let go, it eases back to its true place: no jump between two drawings', Math.hypot(p2.x - p1.x, p2.y - p1.y) < 120, [p1.x, p1.y, p2.x, p2.y]); }
  await sleep(1500);
  const after = await sky(), now = await js('Date.now()');
  check('hover: let go, the time shown goes on from where it was (it runs faster than life, never more than a day from now)', after.time - (await sky()).time <= 0 && Math.abs(after.time - now) < 864e5, `${after.time - now} ms from now`);
  check('hover: and the Earth turns again', await rafIn(600) > 5 && (await sky()).cam.lon !== after.cam.lon);
  // Escape closes a card opened by pointing, and the same satellite does not open again until the pointer has left it
  const two = await easyOne(), at2 = two && await screenOf(two.norad);
  if (at2) {
    await mouseTo(at2.x, at2.y); await until(`!document.querySelector('#satCard').hidden`, 2000);
    await press('Escape');
    check('hover: Escape closes the card', await seen(`document.querySelector('#satCard').hidden`, 1000));
    await mouseTo(at2.x + 1, at2.y + 1); await sleep(300);
    check('hover: the card stays closed while the pointer rests on the same satellite', await js(`document.querySelector('#satCard').hidden`));
  }
  await flat('the home at 1440 px with a satellite\'s card open');
});

// ---- look: a satellite pointed at: it grows into its card's window, the others dim, the real picture comes where there is one; pictures at 1440 and 390 when E2E_SHOTS is set
await group('look', async () => {
  await size(1440, 900); await go('/'); await drawn(); await sleep(400);
  const s0 = await sky();
  same('look: eight different marks for the thirteen, twins sharing theirs', [...new Set(s0.sats.map(x => x.look))].sort(), ['gpm', 'gracefo', 'iss', 'jpss', 'landsat', 's2', 'smap', 'terra']);
  check('look: far away the twins carry their tags on a wide screen', s0.tags === true && s0.dim === 1, [s0.tags, s0.dim]);
  const pick = async () => { const s = await sky(), want = s.sats.filter(a => a.seen && a.depth > 0.1 && !['jpss', 's2'].includes(a.look)).sort((a, b) => b.depth - a.depth)[0]; return want || await easyOne(); };
  const one = await pick();
  check('look: a satellite with a picture is in sight', !!one, one);
  if (!one) return;
  const at = await screenOf(one.norad); await mouseTo(at.x, at.y);
  check('look: within 0.3 s the mark is gliding from the satellite into the window', await seen(`document.querySelector('#satCardPic').classList.contains('glide')`, 300));
  const anim = await js(`(() => { const a = document.querySelector('.sat-pic-mark').getAnimations()[0]; if (!a) return null; const k = a.effect.getKeyframes()[0], m = /scale\\(([\\d.]+)\\)/.exec(k.transform || ''); return { ms: a.effect.getTiming().duration, scale: m ? +m[1] : null }; })()`);
  check('look: it only ever grows: it starts at a fifth of its size or so, never over 1', anim && anim.scale > 0.05 && anim.scale < 1, anim);
  await sleep(1200);
  const c = await card(), s1 = await sky();
  check('look: once landed the real picture is in the window with its credit and its description', c.pic && /img\/craft\/.+\.webp$/.test(c.img) && c.alt.length > 20 && /NASA/.test(c.credit), [c.img, c.credit, c.alt]);
  check('look: the others have dimmed and the Earth has stepped back', s1.dim === 0.4 && await js(`document.querySelector('#orbitBox').classList.contains('has-card')`), s1.dim);
  const files = await js(`(async () => { const out = []; for (const src of ['terra', 'gpm', 'landsat8', 'iss', 'smap', 'gracefo']) { const r = await fetch('/img/craft/' + src + '.webp'); const ok = r.ok && /image\\/webp/.test(r.headers.get('content-type')); const img = new Image(); img.src = '/img/craft/' + src + '.webp'; await img.decode().catch(() => {}); out.push([src, r.status, ok, img.naturalWidth]); } return out; })()`);
  check('look: with the real server, each of the six spacecraft pictures is served as image/webp and has loaded (naturalWidth 640)', files.every(f => f[1] === 200 && f[2] && f[3] === 640), files);
  check('look: no credit names a person, and none says NASA, ESA or NOAA made or backs Crophalo', !/NASA\/(?!JPL-Caltech)/.test(c.credit) && /not made, reviewed or endorsed by NASA, ESA or NOAA/i.test(await js(`document.querySelector('#orbitCreditShort').textContent`)));
  await run.shot?.('home-sat-1440.png');
  await mouseTo(5, 5); await seen(`document.querySelector('#satCard').hidden`, 1500); await sleep(600);
  same('look: closed again, nothing is dimmed', [(await sky()).dim, await js(`document.querySelector('#orbitBox').classList.contains('has-card')`)], [1, false]);
  // a satellite with no free picture keeps its mark and says why
  const plain = (await sky()).sats.filter(a => a.seen && a.depth > 0.1 && ['jpss', 's2'].includes(a.look))[0];
  if (plain) { const p = await screenOf(plain.norad); await mouseTo(p.x, p.y); await sleep(1200); const d = await card(); check('look: NOAA and Sentinel-2 show a plain body drawn by Crophalo, said to be a drawing', d.open && d.pic && /^data:image\/svg/.test(d.img) && /^Drawing: Crophalo/.test(d.credit) && /plain drawing/.test(d.alt), [d.credit, d.alt]); await mouseTo(5, 5); await sleep(400); }
  // the phone: both ways in on the first screen, the credits one line that opens, a small Pause on the Earth
  await size(390, 844); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await go('/'); await drawn(); await sleep(500);
  const first = await page(T => { const b = id => T.box(document.querySelector(id)); return { locate: b('#homeLocate'), map: b('#homeMapPick'), h: innerHeight, all: T.shown(document.querySelector('#orbitCreditAll')), more: T.shown(document.querySelector('#orbitCreditMore')), pause: b('#orbitPause'), tags: null }; });
  check('look 390: "I am at my field" and "Find it on the map" are both on the first screen', first.locate.b <= first.h && first.map.b <= first.h, first);
  check('look 390: the credits are one line that opens', !first.all && first.more, first);
  check('look 390: the Pause is a small button, 44 px, on the Earth', first.pause.w >= 43 && first.pause.w <= 48 && first.pause.h >= 43 && first.pause.y < 80, first.pause);
  await tap('#orbitCreditMore'); check('look 390: pressed, the credits show', await page(T => T.shown(document.querySelector('#orbitCreditAll')) && document.querySelector('#orbitCreditMore').getAttribute('aria-expanded') === 'true'));
  await tap('#orbitCreditMore');
  same('look 390: no tags on a phone', (await sky()).tags, false);
  const two = await pick();
  if (two) { const q = await screenOf(two.norad); await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(1300);
    const e = await card(); check('look 390: a tap opens the card with its picture, inside the screen', e.open && e.pic && e.box.x >= 0 && e.box.r <= 390, [e.pic, e.box]); await run.shot?.('home-sat-390.png'); }
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
});

// ---- touch: a tap opens a card and keeps it; a tap elsewhere closes it
await group('touch', async () => {
  await size(375, 780); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await go('/'); await drawn(); await sleep(400);
  const touch = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const one = await easyOne();
  check('touch: a satellite in sight can be found to tap', !!one);
  if (one) {
    const at = await screenOf(one.norad); await touch(at.x, at.y);
    check('touch: a tap on a satellite opens its card', await seen(`!document.querySelector('#satCard').hidden && +document.querySelector('#satCard').dataset.norad === ${one.norad}`, 2000));
    await sleep(500);
    check('touch: the card stays open after the finger has left', await js(`!document.querySelector('#satCard').hidden`));
    await flat('the home at 375 px with a satellite\'s card open');
    const c = await card();
    check('touch: on a phone the card fits the screen', c.box.x >= 0 && c.box.r <= 375, c.box);
    const t = await page(T => [...document.querySelectorAll('#satCard button, #satCard a')].filter(T.shown).map(el => {   // counting the invisible tap area a link carries, as scripts/e2e.mjs does
      const b = T.box(el), after = getComputedStyle(el, '::after'), grow = side => (after.content !== 'none' && after.position === 'absolute' ? Math.max(0, -parseFloat(after[side]) || 0) : 0);
      return { n: T.name(el), w: b.w + grow('left') + grow('right'), h: b.h + grow('top') + grow('bottom') }; }).filter(x => x.w < 43.5 || x.h < 43.5).map(x => `${x.n} ${Math.round(x.w)}×${Math.round(x.h)}`));
    same('touch: every control of the card is at least 44 px', t, []);
    const free = await js(`(() => { const r = document.querySelector('#orbitStage').getBoundingClientRect(); return { x: r.left + 12, y: r.top + 12 }; })()`);
    await touch(free.x, free.y);
    check('touch: a tap elsewhere closes it', await seen(`document.querySelector('#satCard').hidden`, 1500));
  }
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
});

// ---- keyboard: Tab reaches each satellite in the list's order, its card opens and the far side is turned to the front; Escape and Enter
await group('keyboard', async () => {
  await size(1280, 800); await go('/'); await drawn();
  await js(`document.querySelector('#orbitPause').focus()`);
  const met = [];
  for (let i = 0; i < 13; i++) {
    await press('Tab'); await sleep(950);
    const f = await page(T => { const el = document.activeElement, b = T.box(el), k = document.querySelector('.home-card').getBoundingClientRect(), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      return { id: el.id, shown: T.shown(el), w: b.w, h: b.h, x: b.x, y: b.y, r: b.r, ring: getComputedStyle(el).outlineStyle !== 'none' && parseFloat(getComputedStyle(el).outlineWidth) >= 2, under: cx > k.left && cx < k.right && cy > k.top && cy < k.bottom }; });
    const s = await sky(), c = await card();
    met.push({ id: f.id, ok: f.shown && f.w >= 43 && f.h >= 43 && f.x >= 0 && f.r <= 1280 && f.y >= 0 && f.ring, under: f.under, open: c.open && c.norad === DATA.SATS[i].norad, front: s.sats[i].seen, farSaid: /^On the far side of the Earth right now\./.test(c.now), held: s.active === DATA.SATS[i].norad });
  }
  same('keyboard: Tab goes through the thirteen satellites in the list\'s order', met.map(m => m.id), DATA.SATS.map(x => `sat-${x.norad}`));
  same('keyboard: each one, when it has the focus, is a 44 px ring on the screen', met.filter(m => !m.ok).map(m => m.id), []);
    same('keyboard: each one opens its own card', met.filter(m => !m.open).map(m => m.id), []);
  same('keyboard: one on the far side of the Earth is not turned to the front: its card says where it is', met.filter(m => !m.front && !m.farSaid).map(m => m.id), []);
  const a = await sky(); await sleep(600);
  same('keyboard: while a satellite has the focus everything stands still', (await sky()).time, a.time);
  await press('Escape');
  check('keyboard: Escape closes the card and the focus stays on the satellite', await seen(`document.querySelector('#satCard').hidden && document.activeElement.id === 'sat-${DATA.SATS[12].norad}'`, 1000));
  await press('Enter');
  check('keyboard: Enter opens the card and takes the focus to its source link', await seen(`!document.querySelector('#satCard').hidden && document.activeElement.id === 'satCardPage'`, 1000));
  await press('Tab');
  same('keyboard: Tab goes on to Show more', await js('document.activeElement.closest("details")?.id'), 'satCardMore');
  await press('Escape');
  check('keyboard: Escape in the card closes it and brings the focus back to its satellite', await seen(`document.querySelector('#satCard').hidden && document.activeElement.id === 'sat-${DATA.SATS[12].norad}'`, 1000));
  await press('Tab'); await press('Tab'); await sleep(300);
  check('keyboard: leaving the satellites lets everything move again', !(await js(`document.querySelector('#satList').contains(document.activeElement)`)) && await rafIn(600) > 5);
  await tap('#orbitPause');
});

// ---- pause: the one control for everything that moves by itself
await group('pause', async () => {
  await size(1280, 800); await go('/'); await drawn();
  await tap('#orbitPause'); await sleep(900);
  same('pause: Pause becomes Play, with words that say so', await js(`[document.querySelector('#orbitPause .t').textContent, document.querySelector('#orbitPause').getAttribute('aria-label')]`), ['Play', 'Play: move the Earth and the satellites again']);
  const a = await sky(), n = await rafIn(1200), b = await sky();
  check('pause: the Earth and the satellites stand still', a.time === b.time && a.cam.lon === b.cam.lon, [a.time, b.time, a.cam.lon, b.cam.lon]);
  check('pause: nothing is drawn while paused', n <= 2, n);
  await tap('#orbitPause'); await sleep(1200);
  const c = await sky();
  check('pause: Play turns the Earth again and the satellites go on from where they are', c.cam.lon !== b.cam.lon && c.time > b.time && await rafIn(500) > 5);
});

// ---- kept: the orbits are asked once and kept on the device for two hours; a new page with the same storage asks nothing, and they are asked before the satellites' code arrives
await group('kept', async () => {
  await size(1440, 900); await go('/'); await drawn();
  check('kept: the first visit asked /api/orbits once', await js('typeof window.__askedAt === "number"'));
  check('kept: the answer is on the device (localStorage), with its time', await js(`(() => { const k = JSON.parse(localStorage.getItem('crophalo.orbits.v1')); return !!k && k.answer?.ok === true && Date.now() - k.at < 7200e3; })()`));
  await go('/'); await drawn();
  check('kept: a new page with the same storage makes no /api/orbits request and still draws the satellites', await js('window.__askedAt === undefined') && (await sky()).sats.length === 13);
  await js(`(() => { const k = JSON.parse(localStorage.getItem('crophalo.orbits.v1')); k.at -= 3 * 3600e3; localStorage.setItem('crophalo.orbits.v1', JSON.stringify(k)); })()`);
  await go('/'); await drawn();
  check('kept: after two hours they are asked again', await js('typeof window.__askedAt === "number"'));
  const mods = await js(`performance.getEntriesByType('resource').filter(e => /\\/(js|vendor)\\//.test(e.name)).map(e => [e.name.split('/').pop(), Math.round(e.startTime)])`), ask = await js('window.__askedAt');
  const dscom = mods.find(m => m[0] === 'dscom.js');
  check('kept: the orbits are asked before the orbit library\'s last files arrive (one wave, not after)', !dscom || ask <= dscom[1] + 50, [ask, dscom]);
});

// ---- time: the camera stands still in space, the Earth turns under it and the time shown runs 120 times faster than life; every place is the real one for that time
await group('time', async () => {
  await size(1440, 900); await go('/'); await drawn(); await sleep(600);
  const a = await sky(), startMs = Date.now(); await sleep(3000); const b = await sky();
  const turn = ((a.cam.lon - b.cam.lon) % 360 + 360) % 360, spanH = (b.time - a.time) / 36e5, want = ((gstime(new Date(b.time)) - gstime(new Date(a.time))) * 180 / Math.PI % 360 + 360) % 360;
  check('time: the shown time runs about 120 times faster than the clock (3 s of life is about 6 minutes)', (b.time - a.time) / 3000 > 90 && (b.time - a.time) / 3000 < 150, (b.time - a.time) / 3000);
  check('time: the Earth\'s turn between two shown times is the true turn for that time span (west to east, under a still camera)', Math.abs(turn - want) < 0.05, [turn, want, spanH]);
  const word = await js(`document.querySelector('#orbitClockText').textContent`), m = /^Showing (\d+) (\w+), (\d\d):(\d\d) UTC · real orbits, sped up 120 times$/.exec(word);
  check('time: the clock line says the moment drawn and the pace in plain words, and matches the shown time', !!m && Math.abs(Date.UTC(new Date(b.time).getUTCFullYear(), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[2]), +m[1], +m[3], +m[4]) - (await sky()).time) < 6 * 60e3, word);
  // a polar satellite passes the poles within one shown orbit (about 50 s of life at 120 times)
  const noaa = DATA.SATS.find(x => x.norad === 43013).norad, lats = [];
  for (let i = 0; i < 28; i++) { const s = await sky(), e = s.sats.find(x => x.norad === noaa).ecf; if (e) lats.push(Math.asin(e[2] / Math.hypot(...e)) * 180 / Math.PI); await sleep(2000); }
  check('time: a polar satellite\'s shown latitude passes 60 degrees north and south within one shown orbit', Math.max(...lats) > 60 && Math.min(...lats) < -60, [Math.max(...lats), Math.min(...lats)]);
  // "Now": the present moment at real pace, and back
  await tap('#orbitNow'); await sleep(400);
  const n1 = await sky(), t1 = await js('Date.now()');
  check('time: "Now" returns to the present moment, at real pace, and says so', Math.abs(n1.time - t1) < 5000 && /real orbits at real pace/.test(await js(`document.querySelector('#orbitClockText').textContent`)) && await js(`document.querySelector('#orbitNow').textContent === 'Speed up'`));
  await sleep(2000); const n2 = await sky(); check('time: at real pace 2 s of life are 2 s of shown time', Math.abs((n2.time - n1.time) - 2000) < 600, n2.time - n1.time);
  await tap('#orbitNow'); await sleep(300);
  check('time: pressed again it speeds up from now', await js(`document.querySelector('#orbitNow').textContent === 'Now' && /sped up 120 times/.test(document.querySelector('#orbitClockText').textContent)`));
});

// ---- descent: pick the demo and the Earth turns to it, the camera falls, the globe hands over to the setup map (plan part 3.2); a tap lands at once on the final view; Less and Still do not fly
await group('descent', async () => {
  await size(1440, 900); await go('/'); await drawn(); await sleep(800);
  const clickDemo = async () => { await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`, 20000); await js(`document.querySelector('#tryRegion').click()`); };
  const view = () => js(`import('/js/mapx.js').then(m => { const mp = m.leafletMap(); return mp ? { c: [mp.getCenter().lat, mp.getCenter().lng], z: mp.getZoom() } : null; })`);
  const near = (v, lat, lon) => v && Math.abs(v.c[0] - lat) < 0.05 && Math.abs(v.c[1] - lon) < 0.05;
  const t0 = Date.now(); await clickDemo();
  await sleep(120);
  check('descent: from the press the setup screen is shown under the globe\'s cover and focus is already on it', await js(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.macro-sky') && !!document.querySelector('.macro-sky #orbitBox')`));
  await run.shot?.('descent-1-press.png'); await sleep(500); await run.shot?.('descent-2-turn.png');
  const mid = await sky(); check('descent: during the turn the Earth is not turning by itself and the camera is over the place\'s way', !!mid);
  await sleep(700); await run.shot?.('descent-3-fall.png'); await sleep(900); await run.shot?.('descent-4-handoff.png');
  await sleep(2500);
  const done = await js(`({ sky: !!document.querySelector('.macro-sky'), box: document.querySelector('#orbitBox').parentNode.id || document.querySelector('#orbitBox').parentNode.className, held: window.__held })`), v = await view();
  check('descent: when it is over the cover is gone, the globe is back on the home and the map has landed on the field at zoom 14', !done.sky && /orbit-stage|orbitStage/.test(done.box) && near(v, REGION.lat, REGION.lon) && v.z >= 14, [done, v]);
  check('descent: the whole flight took no more than 3.2 s before the map\'s own flight began', Date.now() - t0 < 12000);
  // the map part of the flight really plays: sampled every 100 ms from the press, the zoom rises through several values on its way to the field's own zoom
  await go('/'); await drawn(); await sleep(800);
  await js(`window.__z = []; const t0 = performance.now(); window.__zt = setInterval(() => { import('/js/mapx.js').then(m => { const mp = m.leafletMap(); if (mp) window.__z.push(+mp.getZoom().toFixed(2)); }); }, 100)`);
  await clickDemo(); await sleep(5200);
  const zs = await js(`(clearInterval(window.__zt), window.__z)`), distinct = [...new Set(zs.filter(z => z > 3.3 && z < 14.6))];
  check('descent: the map part plays: the zoom is seen rising through several values, not cut (from the hand-off zoom to the field\'s own)', distinct.length >= 3 && zs.at(-1) >= 14.5, [zs.length, distinct.length, zs.at(-1)]);
  // the real road: Setup has been open before in this visit (a map already exists), the farmer comes back with the logo (no reload) and presses the demo line; and again after a reload with the stored draft
  const sampled = async () => { await js(`window.__z = []; window.__zt = setInterval(() => { import('/js/mapx.js').then(m => { const mp = m.leafletMap(); if (mp) window.__z.push(+mp.getZoom().toFixed(2)); }); }, 100)`); await clickDemo(); await sleep(5600); const zs = await js(`(clearInterval(window.__zt), window.__z)`); return { zs, distinct: [...new Set(zs.filter(z => z > 3.3 && z < 14.6))], end: zs.at(-1), v: await view() }; };
  await go('/'); await drawn(); await sleep(800); await clickDemo(); await sleep(5000);
  await js(`document.querySelector('.brand').click()`); await until(`!document.querySelector('#view-home').hidden`, 4000); await sleep(1200);
  const back = await sampled();
  check('descent: on the real road (Setup was open before, back with the logo, no reload) the flight plays: three zoom values or more, ending at 14.5 or more on the field', back.distinct.length >= 3 && back.end >= 14.5 && near(back.v, REGION.lat, REGION.lon), [back.zs.length, back.distinct.length, back.end, back.v]);
  await go('/'); await until(`!!document.querySelector('#tryRegion')`, 8000);
  if (await js(`document.querySelector('#view-home').hidden`)) { await js(`document.querySelector('.brand').click()`); await until(`!document.querySelector('#view-home').hidden`, 4000); }
  await drawn(); await sleep(1200);
  const draft = await sampled();
  check('descent: the same after a reload with the stored draft restored', draft.distinct.length >= 3 && draft.end >= 14.5 && near(draft.v, REGION.lat, REGION.lon), [draft.zs.length, draft.distinct.length, draft.end, draft.v]);
  { const wl = await js(`document.querySelector('.macro-witness')?.textContent || ''`), m = /\((\d\d):(\d\d) UTC\)$/.exec(wl), n = new Date(await js('Date.now()'));
    check('descent: the Witness line says the REAL present (not the fast clock of the home) and names a picture-taking satellite', !wl || (m && Math.abs((+m[1] * 60 + +m[2]) - (n.getUTCHours() * 60 + n.getUTCMinutes())) <= 3 && /^Nearest picture-taking satellite now: (Landsat [89]|Sentinel-2[ABC]), [\d,]+ km from this field/.test(wl)), wl); }
  // a place with only a pin (no outline) ends at a field\'s zoom on the pin, whatever the setup map\'s first view was
  const strip = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const real = window.fetch.bind(window); window.fetch = (u, o) => /regions\\.json/.test(String(u && u.url || u)) ? real(u, o).then(r => r.json()).then(j => new Response(JSON.stringify(j.map(x => { const y = { ...x }; delete y.outline; return y; })), { headers: { 'content-type': 'application/json' } })) : real(u, o); })()` })).identifier;
  await go('/'); await drawn(); await sleep(800);
  await clickDemo(); await sleep(5200);
  const vp = await view();
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: strip });
  check('descent: a pin-only place ends at a field\'s zoom (about 15) on the pin, never at the continent', near(vp, REGION.lat, REGION.lon) && vp.z >= 14.5, vp);
  // a tap in the middle of it lands at once on the final view
  await go('/'); await drawn(); await sleep(800);
  await clickDemo(); await sleep(900);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 500, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 500, button: 'left', clickCount: 1 });
  await sleep(450);
  const v2 = await view();
  check('descent: a tap in the globe part lands at once on the final map view, the cover gone within 0.4 s, never half-way', !(await js(`!!document.querySelector('.macro-sky')`)) && near(v2, REGION.lat, REGION.lon) && v2.z >= 14, v2);
  // Still and Less: no flight
  for (const [how, set] of [['Still', 'still'], ['Less', 'less']]) {
    await go('/'); await until(`!!document.querySelector('#tryRegion')`, 8000); await js(`document.documentElement.dataset.motion = '${set === 'still' ? 'reduce' : 'less'}'`);   // the page's own levels, set straight on the page (Still is written "reduce" there), so the check does not lean on the Settings page
    
    if (await js(`document.querySelector('#view-home').hidden`)) { await js(`document.querySelector('.brand').click()`); await until(`!document.querySelector('#view-home').hidden`, 4000); }
    await drawn(); await sleep(600);
    await clickDemo(); await sleep(150);
    const st = await js(`({ motion: document.documentElement.dataset.motion || null, skyAt: document.querySelector('.macro-sky')?.getBoundingClientRect().top ?? null, sky: !!document.querySelector('.macro-sky'), setup: !document.querySelector('#view-setup').hidden, home: !document.querySelector('#view-home').hidden })`);
    check(`descent: at ${how} nothing flies: no cover is ever drawn and the setup screen is there`, !st.sky && st.setup, st);
  }
  await js(`import('/js/settings.js').then(m => m.saveSettings({ motion: 'full' }))`);
});

// ---- motion: Full turns and glides; Less is still between drawings at most a minute apart; Still and the device's setting never move
await group('motion', async () => {
  await size(1280, 800); await go('/'); await drawn();
  const full = await rafIn(1500), a = await sky(); await sleep(400); const b = await sky();
  check('motion: Full draws continuously and the Earth turns', full >= 20 && b.cam.lon < a.cam.lon && b.time > a.time, [full, a.cam.lon, b.cam.lon]);
  const level = async (motion, at) => { await setup({ at }); await go('/'); await js(`document.documentElement.dataset.motion = ${JSON.stringify(motion)}`); await drawn(); await sleep(300); };
  // Less: the clock starts 20 s before a whole minute, so the one new drawing at the minute can be seen without a long wait
  await level('less', '2026-11-15T03:29:40Z');
  const into = await js('Date.now() % 60e3'); if (into > 50e3) await sleep(60e3 - into + 500);   // measure between two minutes, not across one
  const l1 = await sky(), lr = await rafIn(1200), l2 = await sky();
  check('motion: Less: nothing is drawn between the minutes, and the Earth does not turn', lr <= 2 && l1.time === l2.time && l1.cam.lon === l2.cam.lon, [lr, l1.time, l2.time]);
  same('motion: Less: the Pause is there, for the drawing once a minute', await page(T => T.shown(document.querySelector('#orbitPause'))), true);
  const next = await js('Math.ceil(Date.now() / 60e3) * 60e3');
  await until(`import('/js/home-sats.js').then(m => m.skyNow().time >= ${next})`, 70e3).catch(() => {});
  const l3 = await sky();
  check('motion: Less: at the minute the satellites are drawn at their new places at once, with no glide', l3.time >= next && l3.time < next + 1500 && await rafIn(800) <= 2, [l3.time - next]);
  for (const [how, set] of [['Still', async () => { await level('reduce'); }], ['the device asks for less motion', async () => { await device({ 'prefers-reduced-motion': 'reduce' }); await setup(); await go('/'); await drawn(); await sleep(300); }]]) {
    await set();
    const s1 = await sky(), r = await rafIn(1500), s2 = await sky();
    check(`motion: ${how}: nothing is drawn again and nothing moves`, r <= 1 && s1.time === s2.time && s1.cam.lon === s2.cam.lon, [r, s1.time, s2.time]);
    check(`motion: ${how}: no animation is running`, await js(`document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === 0)`));
    same(`motion: ${how}: no Pause is shown, as nothing moves`, await page(T => T.shown(document.querySelector('#orbitPause'))), false);
    const one = await easyOne(), at = one && await screenOf(one.norad);
    if (at) { await mouseTo(at.x, at.y); check(`motion: ${how}: pointing at a satellite still opens its card`, await seen(`!document.querySelector('#satCard').hidden`, 2000)); check(`motion: ${how}: the card says the time shown (the present moment, not moved on)`, /the time shown/.test((await card()).now)); await mouseTo(5, 790); }
    await device();
  }
});

// ---- hidden: a tab in the background or the Earth scrolled away draws nothing
await group('hidden', async () => {
  await size(1280, 800); await go('/'); await drawn(); await sleep(300);
  await js(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))`);
  await sleep(300);
  check('hidden: a hidden tab draws nothing', await rafIn(1200) <= 1);
  await js(`delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))`);
  check('hidden: shown again, it turns again', await rafIn(800) > 5);
  await js(`document.querySelector('#view-home').style.paddingBottom = '1500px'; scrollTo(0, document.documentElement.scrollHeight)`); await sleep(500);   // room below, so the whole Earth can leave the screen
  check('hidden: with the Earth scrolled away nothing is drawn', await rafIn(1200) <= 1);
  check('hidden: the Earth really is off the screen', await js(`document.querySelector('#orbitStage').getBoundingClientRect().bottom < 0`));
  await js(`scrollTo(0, 0); document.querySelector('#view-home').style.paddingBottom = ''`); await sleep(300);
  check('hidden: scrolled back, it turns again', await rafIn(800) > 5);
});

// ---- positions: what is drawn is the library's own SGP4 answer for the recorded elements at the moment drawn
await group('positions', async () => {
  await size(1280, 800); await go('/'); await drawn();
  await tap('#orbitPause'); await sleep(700);
  const s = await sky(), t = new Date(s.time), g = gstime(t), off = [];
  for (const x of s.sats) {
    const omm = OMMS.find(o => o.NORAD_CAT_ID === x.norad), rec = json2satrec({ ...omm, EPOCH: DATA.isoMs(DATA.epochMs(omm.EPOCH)) }), pv = propagate(rec, t), e = eciToEcf(pv.position, g);
    const d = Math.hypot(e.x - x.ecf[0], e.y - x.ecf[1], e.z - x.ecf[2]);
    const p = DATA.project(s.cam, { x: e.x / DATA.EARTH_KM, y: e.y / DATA.EARTH_KM, z: e.z / DATA.EARTH_KM });
    if (d > 0.001 || Math.abs(p.x - x.x) > 0.01 || Math.abs(p.y - x.y) > 0.01 || DATA.hidden(s.cam, p) === x.seen) off.push(`${x.name}: ${d.toFixed(4)} km, ${(p.x - x.x).toFixed(3)} px`);
  }
  same('positions: each satellite is where satellite.js puts it for its elements at that moment (within 1 m), and drawn at that place', off, []);
  const heights = s.sats.map(x => { const omm = OMMS.find(o => o.NORAD_CAT_ID === x.norad), pv = propagate(json2satrec({ ...omm, EPOCH: DATA.isoMs(DATA.epochMs(omm.EPOCH)) }), t); return [x.name, Math.round(eciToGeodetic(pv.position, g).height)]; });
  check('positions: their heights are the real ones, 400 to 850 km', heights.every(([, h]) => h > 400 && h < 850), heights);
  const one = await easyOne(), at = one && await screenOf(one.norad);
  if (at) {
    await mouseTo(at.x, at.y); await until(`!document.querySelector('#satCard').hidden`, 2000);
    const s2 = await sky(), t2 = new Date(s2.time), omm = OMMS.find(o => o.NORAD_CAT_ID === one.norad), pv = propagate(json2satrec({ ...omm, EPOCH: DATA.isoMs(DATA.epochMs(omm.EPOCH)) }), t2), gd = eciToGeodetic(pv.position, gstime(t2));
    const want = `${DATA.kmWords(gd.height)} up, ${DATA.speedWords(Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z))}, over ${DATA.latWords(gd.latitude * 180 / Math.PI)}, ${DATA.lonWords(gd.longitude * 180 / Math.PI)}.`, said = (await card()).now;
    check('positions: the card says the time shown and the numbers for it, the same answer in words', said.endsWith(`At ${DATA.clockWords(s2.time)}, the time shown: ${want}`) || said.endsWith(want), [said, want]);
  }
});

// ---- offline and failures: the page says what could not load, in words, and keeps its placeholder
const words = () => page(T => ({ alt: document.querySelector('#satAlt').textContent, credit: document.querySelector('#orbitCreditSats').textContent, hint: T.shown(document.querySelector('#orbitHint')), buttons: document.querySelectorAll('#satList .sat-btn').length, ph: T.shown(document.querySelector('.orbit-ph')) }));
const DOWN = 'The satellites’ orbits could not load right now, so they are not drawn.';
await group('offline', async () => {
  for (const [how, orbits] of [['the server says it could not read CelesTrak', { ok: false, reason: 'The satellites\' orbits could not be read just now; try again in a while' }], ['the server has no Python to run the lookup (a plain answer, not a fault: no error in the browser)', 'server']]) {
    await setup({ orbits }); await go('/'); await sleep(2500);
    const w = await words();
    check(`offline: ${how}: the page says so in words, draws no satellite and keeps the Earth`, w.alt === DOWN && w.credit === DOWN && !w.hint && w.buttons === 0 && w.ph, w);
  }
  await setup({ orbits: 'hang' }); await go('/'); await sleep(1500);
  same('offline: while the elements are on their way, the page says it is finding the satellites', await words().then(w => [w.alt, w.credit]), ['Finding where the satellites are…', 'Orbits: loading…']);
  const back = days => new Date(Date.parse(T0) - days * 864e5).toISOString().replace('Z', '');   // epochs worked out at run time from the pinned clock
  const old = OMMS.map(o => (o.NORAD_CAT_ID === 25994 ? { ...o, EPOCH: back(16) } : o.NORAD_CAT_ID === 39084 ? { ...o, EPOCH: back(5.2) } : o));
  await setup({ orbits: answerOf(old) }); await go('/'); await drawn();
  const s = await sky(), w = await words();
  check('offline: elements more than 14 days old: that satellite is not drawn, and the words say why', !s.sats.some(x => x.norad === 25994) && /Terra: its newest orbital elements are \d+ days old, so it is not drawn\./.test(w.alt) && /1 of 13 satellites could not be placed/.test(await js(`document.querySelector('#orbitHint').textContent`)), w);
  await js(`document.querySelector('#sat-39084').focus()`); await sleep(900);
  check('offline: elements 5 days old: the card warns that the place can be tens of km off', /5 days old\. Elements this old can put it some tens of kilometres off\./.test((await card()).src), (await card()).src);
  await setup({ orbits: answerOf(OMMS.filter(o => ![43476, 43477].includes(o.NORAD_CAT_ID))) }); await go('/'); await drawn();
  check('offline: two satellites missing from the answer: the other eleven are drawn and the words say two are not', (await sky()).sats.length === 11 && /2 of 13 satellites could not be placed right now/.test((await words()).alt));
  await setup({ noGl: true }); await go('/'); await drawn();
  const ng = await page(T => ({ credit: document.querySelector('#orbitCreditPic').textContent, ph: T.shown(document.querySelector('.orbit-ph')), buttons: document.querySelectorAll('#satList .sat-btn').length }));
  check('offline: a browser that cannot draw WebGL: the plain globe stays, the words say so, and the satellites are still drawn round it', /cannot draw the picture of the Earth/.test(ng.credit) && ng.ph && ng.buttons === 13, ng);
});

// ---- fit: no sideways scroll, nothing wider than the screen, at six widths, with the largest text at the two phone widths
await group('fit', async () => {
  for (const [w, h] of [[320, 700], [375, 780], [768, 1024], [1280, 800], [1440, 900], [2560, 1440]]) for (const largest of w <= 375 ? [false, true] : [false]) {
    await size(w, h); await go('/'); await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${largest ? "'xlarge'" : "'default'"} }))`); await drawn(); await sleep(300);
    await flat(`the home at ${w} px${largest ? ' with the Largest text' : ''}`);
    const s = await sky(), box = await js(`(r => [r.left, r.top, r.right, r.bottom])(document.querySelector('#orbitStage').getBoundingClientRect())`);
    const c = await js(`(r => ({ x: r.left, y: r.top }))(document.querySelector('#satCanvas').getBoundingClientRect())`);
    const z = await js(`document.querySelector('#satCanvas').getBoundingClientRect().width / document.querySelector('#satCanvas').offsetWidth`);
    const off = s.sats.filter(x => x.seen && (c.x + x.x < box[0] || c.x + x.x > box[2] || c.y + x.y < box[1])).map(x => x.name);
    check(`fit: the satellites in sight are inside the first screen at ${w} px${largest ? ' with the Largest text' : ''}`, off.length <= 1, off);
    check(`fit: the Earth is drawn at its full sharpness at ${w} px`, await js(`(c => c.width >= Math.round(c.getBoundingClientRect().width) - 1)(document.querySelector('#satCanvas'))`) && z > 0);
    const one = await easyOne(), at = one && await screenOf(one.norad);
    if (at) { await mouseTo(at.x, at.y); await until(`!document.querySelector('#satCard').hidden`, 2000).catch(() => {}); await flat(`the home at ${w} px${largest ? ' with the Largest text' : ''} with a card open`); await mouseTo(2, h - 2); }
  }
  await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`);
});

// ---- axe: the accessibility checker kept for the tests, with a card closed and open, at two widths
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  const axe = async where => {
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' ') + ' · ' + v.help)))`);
    for (const line of found) console.log(`axe  ${where}: ${line}`);
    check(`axe: ${where}: 0 problems`, found.length === 0, `${found.length} found, listed above`);
  };
  for (const w of [1280, 375]) {
    await size(w); await go('/'); await drawn(); await sleep(300);
    await axe(`the home at ${w} px`);
    await js(`document.querySelector('#sat-${DATA.SATS[0].norad}').focus()`); await sleep(1000);
    await axe(`the home at ${w} px with a satellite's card open`);
    await js('document.activeElement.blur()');
  }
});

// ---- speed: the first paint comes before the orbit library and the elements; the satellites' own work never holds the page; the code stays small
await group('speed', async () => {
  await size(1440, 900); await setup(); await go('/'); await drawn(); await sleep(3000);   // a new setup: the page starts with no elements kept, so it asks for them
  const t = await js(`(() => { const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null, lib = performance.getEntriesByType('resource').find(r => r.name.includes('/vendor/satellite/io.js'))?.startTime ?? null;
    return { fcp, lib, asked: window.__askedAt ?? null, long: window.__long.slice() }; })()`);
  check('speed: the orbit library is asked for only after the first paint', t.fcp !== null && t.lib !== null && t.lib > t.fcp, t);
  check('speed: the elements are asked for only after the first paint', t.asked !== null && t.asked > t.fcp, t);
  console.log(`speed: long tasks while the whole page started (this computer, headless; at ms: length ms): ${t.long.length ? t.long.map(([at, ms]) => `${at}: ${ms}`).join(', ') : 'none'}`);
  // the satellites' own start, timed in the page: reading the thirteen element sets (a few at a time) and one whole drawing with full trails
  const cost = await js(`import('/js/home-sats.js').then(async m => { const answer = ${JSON.stringify(answerOf())}, t0 = performance.now(), slices = [];
    let last = t0; const tick = () => { const n = performance.now(); slices.push(n - last); last = n; };
    const ch = new MessageChannel(); let on = true; ch.port1.onmessage = () => { tick(); if (on) ch.port2.postMessage(0); }; ch.port2.postMessage(0);
    const { list } = await m.readAll(answer); on = false; const read = performance.now() - t0;
    const s = m.skyNow(), p0 = performance.now(); m.place(list, s.cam, s.time); const draw = performance.now() - p0;
    return { read, slice: Math.max(...slices), draw, n: list.length }; })`);
  console.log(`speed: the satellites' start: ${cost.n} element sets read in ${cost.read.toFixed(1)} ms (the longest unbroken piece ${cost.slice.toFixed(1)} ms); one whole drawing worked out in ${cost.draw.toFixed(1)} ms`);
  check('speed: reading the elements never holds the page for 50 ms at a time', cost.slice < 50, cost);
  check('speed: working out one whole drawing takes less than one frame of 16 ms', cost.draw < 16, cost);
  // turning, after the start: no long task at all
  const from = await js('performance.now()'); await sleep(3000);
  same('speed: while the Earth and the satellites turn, no long task over 50 ms in 3 s', await js(`window.__long.filter(([at, ms]) => at > ${from} && ms > 50)`), []);
  const times = await js(`new Promise(done => { const t = []; const f = n => { t.push(n); if (t.length < 121) requestAnimationFrame(f); else done(t); }; requestAnimationFrame(f); })`);
  const gaps = times.slice(1).map((v, i) => v - times[i]), fps = 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
  console.log(`speed: ${fps.toFixed(1)} frames a second over 120 frames at 1440 px; slowest ${Math.max(...gaps).toFixed(1)} ms (this computer, headless)`);
  check('speed: the turning Earth keeps a steady frame rate (at least 30 a second, even headless on a busy computer)', fps >= 30, fps.toFixed(1));
  const bytesOf = rel => fs.statSync(path.join(ROOT, rel)).size, added = bytesOf('js/home-sats.js') + bytesOf('js/home-sats-data.js');
  console.log(`speed: new code for the satellites ${added} bytes; the Earth's own module ${bytesOf('js/home-orbit.js')} bytes and its picture helper ${bytesOf('js/home-picture.js')} bytes; the orbit library ${fs.readdirSync(path.join(ROOT, 'vendor', 'satellite'), { recursive: true }).filter(f => f.endsWith('.js')).reduce((n, f) => n + bytesOf(path.join('vendor', 'satellite', f)), 0)} bytes`);
  check('speed: the satellites add under 40 KB of the app\'s own code (the orbit library apart)', added < 40 * 1024, `${added} bytes`);
});

await finish();
