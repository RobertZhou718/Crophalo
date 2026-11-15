// Crophalo's "why and how" suite in a real browser: on setup step 2, beside "Choose" above the ready rotations, an "i" in the house look (24 px with a 44 px place to tap) opens the small pop-over that says why and how the rotations are
// suggested (at most three sentences in sight, the rest under "Show more"); Escape closes it and gives the keyboard back to the "i". RULE: never loosen a check. Run: node scripts/e2e_why.mjs
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_why');
const { js, until, size, go, check, group, finish, sleep, press, send } = run;
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : /nominatim/.test(String(url)) ? { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } : f(url, ...r))(window.fetch);` });
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));

for (const width of [1280, 375]) await group(`why these rotations at ${width}`, async () => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {}); await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear()`); await go('/'); await sleep(500);
  await js(`import('/js/wizard.js').then(w => import('/js/app.js').then(a => { a.show('setup'); w.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field', place: 'United States' }); }))`);
  await until(`!document.querySelector('#view-setup').hidden && document.querySelector('#wNext')`, 8000); await sleep(300);
  await js(`document.querySelector('#wNext').click()`); await until(`document.querySelector('#wHeading')?.textContent === 'What do you grow?'`, 6000); await sleep(300);
  check('beside "Choose" there is an "i" in the house look: 24 px with a 44 px place to tap, named for a screen reader', await js(`(b => !!b && getComputedStyle(b).width === '24px' && parseFloat(getComputedStyle(b, '::after').width) >= 44 && /^Why and how we suggest these rotations/.test(b.getAttribute('aria-label')) && b.getAttribute('aria-haspopup') === 'dialog')(document.querySelector('h2.sub .srci[data-why=rotations]'))`));
  await js(`document.querySelector('h2.sub .srci[data-why=rotations]').click()`); await sleep(300);
  check('it opens the small pop-over: why and how in plain words, three sentences in sight, the rest under "Show more", closed at first', await js(`(p => !p.hidden && /Why these rotations/.test(p.textContent) && document.querySelectorAll('#srcPop > section > p:not(.small)').length === 3 && /Show more/.test(p.textContent) && !p.querySelector('details').open && document.querySelector('h2.sub .srci[data-why]').getAttribute('aria-expanded') === 'true')(document.querySelector('#srcPop'))`));
  check('the pop-over stays inside the screen', await js(`(r => r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0)(document.querySelector('#srcPop').getBoundingClientRect())`));
  await run.shot?.(`why-${width}`);   // with E2E_SHOTS set, a picture of the pop-over
  await js(`document.querySelector('#srcPop details summary').click()`); await sleep(150);
  check('"Show more" gives how the rotations are picked: the crop map, about 10 km, the country list, nothing chosen until a tap', await js(`(t => /within about 10 km/.test(t) && /Statistics Canada/.test(t) && /Nothing is chosen for you until you tap/.test(t))(document.querySelector('#srcPop').textContent)`));
  await press('Escape'); await sleep(200);
  check('Escape closes it and gives the keyboard back to the "i"', await js(`document.querySelector('#srcPop').hidden && document.activeElement === document.querySelector('h2.sub .srci[data-why]')`));
});
await finish();
