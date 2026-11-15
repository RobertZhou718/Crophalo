// The browser suite for the halo family: the rotation halo draws and eases between plans, the answer card assembles in calm steps, option cards reorder and unfold, the ants of a finished
// outline march three times; each plays once with the allowed kind of motion, the state changes before the motion, everything is off under both still switches, and no tap waits more than 200 ms
// on a slowed phone. The page under test is design/fx-halo-demo.html. Run: node scripts/e2e_fx_halo.mjs   (pictures: E2E_SHOTS=<a folder outside the project>)
import os from 'node:os';
import { openRun } from './e2e_lib.mjs';
// Why the 200 ms limit below is not judged on a swamped computer: it times the page's own thread, which a machine running several times more work than it has threads stretches
// by itself (scripts/e2e_engine_worker.mjs keeps the same rule). That the screen changes at all after the press is always judged.
const busy = os.loadavg()[0] > 3 * os.cpus().length;

const run = await openRun('fx_halo');
const { js, page, until, tap, size, device, go, flat, shot, check, same, group, finish, sleep, send } = run;
const PAGE = '/design/fx-halo-demo.html';
const EASE_RE = /cubic-bezier\(0?\.2, ?0?\.8, ?0?\.2, ?1\)/;
const open = async (w = 1280) => { await size(w); await go(PAGE); await until('window.ready === true', 10000); };
const ANIMS = `(() => document.getAnimations().map(a => { const t = a.effect?.getTiming?.() || {}, kf = a.effect?.getKeyframes?.() || []; return { name: a.animationName || '', id: a.id, duration: t.duration, delay: t.delay, iterations: t.iterations === Infinity ? 'infinite' : t.iterations, easing: t.easing, state: a.playState, target: String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? a.effect?.target?.tagName ?? ''), scope: a.effect?.target?.closest?.('[id]')?.id ?? '', frames: kf.map(k => ({ opacity: k.opacity ?? null, transform: k.transform ?? null, clipPath: k.clipPath ?? null, offset: k.offset, dash: k.strokeDashoffset ?? null })) }; }))()`;
const calm = (anims, label) => {
  for (const a of anims) {
    const tag = `${label}: ${a.id || a.name} on ${a.target}`;
    const tf = a.frames.map(f => f.transform).filter(Boolean).join(' ') + ' ' + a.frames.map(f => f.clipPath).filter(Boolean).join(' ');
    check(`${tag}: no scale past full size, no rotate, no skew`, !/rotate|skew|perspective/.test(tf) && [...tf.matchAll(/scale[XY]?\(([-\d.]+)/g)].every(m => +m[1] <= 1.0001), tf);
    const ops = a.frames.map(f => f.opacity).filter(v => v !== null).map(Number);
    check(`${tag}: opacity only climbs or only falls`, ops.every((v, i) => i === 0 || v >= ops[i - 1] - 1e-9) || ops.every((v, i) => i === 0 || v <= ops[i - 1] + 1e-9), ops);
    check(`${tag}: its curve is linear or the one out-curve`, !a.easing || a.easing === 'linear' || EASE_RE.test(a.easing), a.easing);
    check(`${tag}: it never runs over 5 s or for ever`, a.duration <= 5000 && a.iterations !== 'infinite', [a.duration, a.iterations]);
  }
};
const groupCount = (anims, id) => anims.filter(a => a.id === id && a.scope === 'halo').length;
const settle = async () => { await until(`document.getAnimations().every(a => a.playState !== 'running')`, 9000).catch(() => {}); await sleep(60); };

await group('halo: the rotation draws year by year', async () => {
  await open();
  const early = (await js(ANIMS)).filter(a => a.scope === 'halo' || a.scope === ''), arcs = early.filter(a => a.id === 'fxh-arc');
  check('while it draws, the arcs are drawn by their dash: 700 ms for a year, 600 ms for an inner arc, from nothing to all', arcs.length >= 3 && arcs.some(a => a.duration === 700) && arcs.some(a => a.duration === 600) && arcs.every(a => Number(a.frames[0].dash) > 0 && Number(a.frames[1].dash) === 0), arcs.slice(0, 2));
  check('years follow one another 380 ms apart', (d => d.length === 3 && d[0] === 0 && d[1] === 380 && d[2] === 760)([...new Set(arcs.filter(a => a.duration === 700).map(a => a.delay))].sort((x, y) => x - y)), arcs.map(a => a.delay));
  check('pictures fade in over 350 ms, the year numbers over 160 ms at most (they are words)', early.some(a => a.id === 'fxh-pic' && a.duration === 350) && early.filter(a => a.id === 'fxh-year').every(a => a.duration <= 160), early.filter(a => /pic|year/.test(a.id)).map(a => [a.id, a.duration]));
  calm(early, 'halo draw');
  await settle();
  same('afterwards nothing is left running', (await js(ANIMS)).filter(a => a.state === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(a.target) || a.name.startsWith('fx-'))).length, 0);
  same('three years, three pictures, three year numbers, a cover arc and a second-crop arc', await js(`(() => { const h = document.querySelector('#halo'); return [h.querySelectorAll('.fx-season').length, h.querySelectorAll('.fx-pic').length, [...h.querySelectorAll('.fx-year')].map(t => t.textContent).join(' '), h.querySelectorAll('.fx-arc.cover').length, h.querySelectorAll('.fx-arc.second').length]; })()`), [3, 3, '2027 2028 2029', 1, 1]);
  await until(`[...document.querySelectorAll('#halo .fx-arc')].every(p => p.style.strokeDasharray === '')`, 3000).catch(() => {});
  check('the arcs are complete once drawn: no dash left on them', await js(`[...document.querySelectorAll('#halo .fx-arc')].every(p => p.style.strokeDasharray === '')`));
  check('a screen reader gets the whole rotation as words, and the pictures are named', await js(`document.querySelector('#halo svg').getAttribute('aria-label') === 'Proposed plan: Corn in 2027, soybeans in 2028 with a cover crop after, winter wheat in 2029, then soybeans.' && document.querySelectorAll('#halo .fx-pic title').length === 3`));
  check('the small halo shows arcs only (no pictures or numbers), for the farm\'s 44 px discs', await js(`(() => { const h = document.querySelector('#haloSmall'); return h.querySelectorAll('.fx-arc').length >= 3 && h.querySelectorAll('.fx-pic').length === 0 && h.querySelector('svg').getAttribute('width') === '44'; })()`));
  await shot('halo-proposed-1280.png');
});

await group('halo: easing between the current and the proposed plan', async () => {
  await open(); await settle();
  await tap('#showCur');
  const now = await js(`[document.querySelector('#halo svg').getAttribute('aria-label'), document.querySelector('#halo svg').getAttribute('data-changed'), document.getElementById('showCur').getAttribute('aria-pressed')]`);
  same('the state changes at once: the words and the button', [now[0].startsWith('Current plan: Corn in 2027, soybeans in 2028, corn in 2029'), now[1], now[2]], [true, '1,2', 'true']);
  const a = (await js(ANIMS)).filter(x => x.scope === 'halo' || x.scope === ''), arcs = a.filter(x => x.id === 'fxh-arc' && /fx-arc/.test(x.target) && x.scope === 'halo');
  check('only the years that differ are drawn again: two outer arcs, the year that stayed is not touched', arcs.filter(x => x.duration === 700).length === 2 && arcs.every(x => x.delay === 0), arcs.map(x => [x.duration, x.delay]));
  check('the cover and second-crop arcs are gone from the current plan', await js(`document.querySelectorAll('#halo .fx-arc.cover, #halo .fx-arc.second').length`) === 0);
  calm(a, 'halo plan change');
  await settle();
  await tap('#showProp');
  const back = await js(ANIMS);
  check('back to the proposed plan: the two years that differ draw again, with their cover and second-crop arcs', groupCount(back, 'fxh-arc') === 4, groupCount(back, 'fxh-arc'));
  await settle();
  same('and it rests', (await js(ANIMS)).filter(x => x.state === 'running' && (/^fxh-/.test(x.id) || /fx-/.test(x.target) || x.name.startsWith('fx-'))).length, 0);
});

await group('halo: the answer card builds in calm steps, once', async () => {
  await open(); await settle();
  await js(`window.__open = {}; const t0 = performance.now(); window.__t0 = t0; const obs = new MutationObserver(ms => { for (const m of ms) if (m.attributeName === 'class') { const n = m.target, k = n.dataset.step; if (k && n.classList.contains('fx-open') && window.__open[k] === undefined) window.__open[k] = Math.round(performance.now() - window.__t0); } }); for (const n of document.querySelectorAll('[data-step]')) obs.observe(n, { attributes: true }); 0`);
  await tap('#buildBtn'); await sleep(60);
  const early = await js(`['stepNow', 'stepTry', 'stepReason', 'stepSure'].map(id => [document.getElementById(id).classList.contains('fx-wait'), getComputedStyle(document.getElementById(id)).opacity])`);
  check('the steps wait behind a wipe, and none of them is faded: every step keeps full opacity', early.every(([wait, op]) => wait && op === '1'), early);
  await sleep(1700);
  const opened = await js('window.__open');
  check('they open in the card\'s order: now, try, reason, sureness, even though the reason arrived before the try', opened.now < opened.try && opened.try < opened.reason && opened.reason < opened.sureness, opened);
  check('each at least about 140 ms after the one before, the whole in under 1.8 s', opened.try - opened.now >= 110 && opened.reason - opened.try >= 110 && opened.sureness - opened.reason >= 110 && opened.sureness < 1800, opened);
  const tr = await js(`getComputedStyle(document.getElementById('stepNow')).transition`);
  check('each step opens by a clip wipe over 520 ms on the one curve', /clip-path 0\.52s cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/.test(tr), tr);
  same('the dial has grown to its share (70 of 100) and nothing is running', [/^70px, 100px$|^calc\(70px\), 100px$/.test(await js(`getComputedStyle(document.querySelector('.fx-dial-arc')).strokeDasharray`)), (await js(ANIMS)).filter(a => a.state === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(a.target) || a.name.startsWith('fx-'))).length], [true, 0]);
  await tap('#buildBtn'); await sleep(80);
  same('a second build on the same card does not replay: its steps stay open', await js(`document.querySelectorAll('#answer .fx-wait:not(.fx-open)').length`), 0);
  await shot('halo-answer-1280.png');
});

await group('halo: a re-rank shows the answer at once, without assembly', async () => {
  await open(); await settle();
  await tap('#rerankBtn'); await sleep(60);
  same('no step waits, nothing runs', await js(`[document.querySelectorAll('#answer .fx-wait').length, document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length]`), [0, 0]);
});

await group('halo: option cards reorder by translation and unfold from the tapped card', async () => {
  await open(); await settle();
  const before = await js(`[...document.querySelectorAll('#opts [data-flip]')].map(n => n.dataset.flip + ':' + Math.round(n.getBoundingClientRect().top))`);
  await tap('#reorderBtn');
  const after = await js(`[...document.querySelectorAll('#opts [data-flip]')].map(n => n.dataset.flip)`);
  same('the order is changed at once (state first): C, A, D, B', after, ['c', 'a', 'd', 'b']);
  const a = await js(ANIMS), flips = a.filter(x => x.id === 'fxh-flip');
  check('every card that moved glides from its old place by translation only, 460 ms, on the one curve', flips.length >= 3 && flips.every(f => f.duration === 460 && EASE_RE.test(f.easing) && f.frames.every(k => /^translate\(/.test(k.transform)) && /translate\(0px, 0px\)/.test(f.frames[1].transform)), flips.slice(0, 2));
  calm(a, 'flip');
  await sleep(700);
  same('and it rests with the cards in their new order', [(await js(ANIMS)).filter(x => x.state === 'running' && (/^fxh-/.test(x.id) || /fx-/.test(x.target) || x.name.startsWith('fx-'))).length, await js(`[...document.querySelectorAll('#opts [data-flip]')].map(n => n.dataset.flip)`)], [0, ['c', 'a', 'd', 'b']]);
  await tap('#addBtn');
  const b = await js(ANIMS), fresh = b.filter(x => x.id === 'fxh-new');
  check('a new card rises 12 px with a fade that is full by 35% of its 380 ms, and the others make room by gliding', fresh.length === 1 && fresh[0].duration === 380 && fresh[0].frames[0].transform === 'translateY(12px)' && fresh[0].frames.some(f => f.opacity === '1' && Math.abs(f.offset - 0.35) < 0.01) && b.filter(x => x.id === 'fxh-flip').length >= 4, [fresh, b.filter(x => x.id === 'fxh-flip').length]);
  calm(b, 'flip new');
  await sleep(700);
  await tap('#opts [data-flip="b"]');
  same('the detail is shown at once', await js(`[document.getElementById('detail').hidden, document.getElementById('detailText').textContent]`), [false, 'Details for B · Cover crop mix.']);
  const u = (await js(ANIMS)).find(x => x.id === 'fxh-unfold');
  check('it unfolds from the card by clip and translate, 520 ms, never scaling', !!u && u.duration === 520 && EASE_RE.test(u.easing) && /^inset\(/.test(u.frames[0].clipPath) && /inset\(0px 0px 0px 0px/.test(u.frames[1].clipPath) && /translateY/.test(u.frames[0].transform) && !/scale/.test(JSON.stringify(u.frames)), u);
  calm(await js(ANIMS), 'unfold');
  await sleep(700);
  same('and it rests, fully shown', [(await js(ANIMS)).filter(x => x.state === 'running' && (/^fxh-/.test(x.id) || /fx-/.test(x.target) || x.name.startsWith('fx-'))).length, await js(`getComputedStyle(document.getElementById('detail')).opacity`)], [0, '1']);
});

await group('halo: the marching ants march three times, then rest', async () => {
  await open(); await settle();
  await tap('#antsBtn'); await sleep(100);
  const a = (await js(ANIMS)).find(x => x.name === 'fx-march');
  check('three passes of 900 ms, linear, moving the dash only', !!a && a.duration === 900 && a.iterations === 3 && a.easing === 'linear' && a.frames.every(f => f.opacity === null && f.transform === null), a);
  same('the outline keeps its stroke and its shape', await js(`getComputedStyle(document.getElementById('outline')).strokeDasharray`), '6px, 4px');
  await sleep(3000);
  same('then they rest: no class, no animation, a solid line', await js(`[document.getElementById('outline').classList.contains('fx-ants'), document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length, getComputedStyle(document.getElementById('outline')).strokeDasharray]`), [false, 0, 'none']);
  await tap('#antsBtn'); await sleep(100);
  same('one trigger plays it once: pressing again marches nothing', await js(`document.getElementById('outline').classList.contains('fx-ants')`), false);
});

await group('halo: every animation that ran was a calm one', async () => {
  await open();
  const seen = new Map(), sample = async () => { for (const a of await js(ANIMS)) seen.set(a.id + a.name + a.target + a.delay, a); };
  await sample(); await sleep(900); await sample();
  await tap('#showCur'); await sample(); await tap('#showProp'); await sample();
  await tap('#buildBtn'); await sleep(300); await sample();
  await tap('#reorderBtn'); await sample(); await tap('#addBtn'); await sample(); await sleep(700);
  await tap('#opts [data-flip="a"]'); await sample(); await tap('#antsBtn'); await sleep(150); await sample();
  check('there were animations to look at', seen.size >= 10, seen.size);
  calm([...seen.values()], 'all');
});

await group('halo: still under "Always still": everything is already where it ends', async () => {
  await open(); await sleep(300);
  await js(`document.documentElement.dataset.motion = 'reduce'; 0`); await sleep(200);
  same('what was drawing has finished at once, the arcs are complete', await js(`[document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length, [...document.querySelectorAll('#halo .fx-arc')].every(p => p.style.strokeDasharray === '')]`), [0, true]);
  await tap('#showCur'); await sleep(60);
  same('a plan change is instant: the words change, nothing runs', await js(`[document.querySelector('#halo svg').getAttribute('aria-label').startsWith('Current plan'), document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length]`), [true, 0]);
  await tap('#buildBtn'); await sleep(60);
  same('the answer is built at once: no step waits, the dial is full', await js(`[document.querySelectorAll('#answer .fx-wait:not(.fx-open)').length, /^(calc\\(70px\\)|70px), 100px$/.test(getComputedStyle(document.querySelector('.fx-dial-arc')).strokeDasharray)]`), [0, true]);
  const wait = await js(`getComputedStyle(document.getElementById('stepNow')).clipPath`);
  check('and nothing is clipped', wait === 'none', wait);
  await tap('#reorderBtn'); await tap('#addBtn'); await tap('#opts [data-flip="a"]'); await tap('#antsBtn'); await sleep(120);
  same('cards reorder, a card is added and a detail opens, with nothing running; the ants do not march', await js(`[document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length, document.getElementById('outline').classList.contains('fx-ants'), document.getElementById('detail').hidden]`), [0, false, false]);
});

await group('halo: still under the device\'s own reduce-motion choice', async () => {
  await size(1280); await device({ 'prefers-reduced-motion': 'reduce' });
  await go(PAGE); await until('window.ready === true', 10000); await sleep(200);
  same('the halo is drawn complete with nothing running', await js(`[document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length, document.querySelectorAll('#halo .fx-arc').length]`), [0, 5]);
  await tap('#buildBtn'); await tap('#reorderBtn'); await tap('#antsBtn'); await sleep(150);
  same('answer, reorder and ants are all still', await js(`[document.getAnimations().filter(a => a.playState === 'running' && (/^fxh-/.test(a.id) || /fx-/.test(String(a.effect?.target?.className?.baseVal ?? a.effect?.target?.className)) || String(a.animationName || '').startsWith('fx-'))).length, document.querySelectorAll('#answer .fx-wait:not(.fx-open)').length, document.getElementById('outline').classList.contains('fx-ants')]`), [0, 0, false]);
  await device();
});

await group('halo: no motion costs a tap more than 200 ms on a slowed phone', async () => {
  await open(375); await sleep(3000);
  await send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(300);
  const measure = async (sel, done, label) => {
    await js(`(() => { window.__t = null; document.addEventListener('pointerdown', () => { window.__t0 = performance.now(); }, { capture: true, once: true }); const w = new MutationObserver(() => { if (${done} && window.__t === null) window.__t = performance.now() - window.__t0; }); w.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true }); window.__w = w; })()`);
    await tap(sel); await sleep(600);
    const ms = await js(`window.__w.disconnect(); window.__t`);
    check(`${label}: the screen is updated after the press`, ms !== null, ms);
    if (busy) console.log(`not judged (busy, load ${os.loadavg()[0].toFixed(0)} on ${os.cpus().length} threads)  ${label}: within 200 ms of the press  (${ms})`);
    else check(`${label}: the screen is updated within 200 ms of the press, on a 6× slower processor`, ms !== null && ms <= 200, ms);
  };
  await measure('#showCur', `document.getElementById('showCur').getAttribute('aria-pressed') === 'true' && document.querySelector('#halo svg').getAttribute('aria-label').startsWith('Current plan')`, 'a plan change');
  await measure('#reorderBtn', `document.querySelector('#opts [data-flip]').dataset.flip === 'c'`, 'a reorder');
  await measure('#opts [data-flip="a"]', `!document.getElementById('detail').hidden`, 'an unfold');
  await measure('#antsBtn', `document.getElementById('outline').classList.contains('fx-ants')`, 'the ants');
  await measure('#buildBtn', `document.getElementById('stepNow').classList.contains('fx-open')`, 'the answer\'s first step');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

for (const w of [1280, 375]) {
  await group(`halo: fits at ${w} px, every control 44 px`, async () => {
    await open(w); await sleep(300);
    await flat(`halo ${w}`);
    same(`halo ${w}: every button and option is at least 44 px`, await js(`[...document.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.id || b.textContent.trim())`), []);
    await shot(`halo-page-${w}.png`);
  });
}
await finish();
