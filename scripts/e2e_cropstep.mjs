// Crophalo's crop-step suite in a real browser: setup step 2, "What do you grow?": the suggestion pre-chosen (map read), the calm wait, the line when the map cannot be read (and the Ontario list), the demo field's own, the cards, More rotations, Build my own with its live sentence,
// radio keys, the chosen look at Full, Less and Still, the state shape, no sideways scroll at 320 to 1280 with the largest text, 44 px, and axe. With SHOTS_ONLY=1 and E2E_SHOTS=<folder outside the project> it only takes pictures (also used on the old step, name them with SHOT_PREFIX).
// RULE: never loosen a check to make it pass; a failure is a step a farmer would find confusing. Run: node scripts/e2e_cropstep.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_cropstep');
const { ROOT, js, until, seen, tap, press, size, go, check, same, group, finish, sleep, shot } = run;
const ONLY = process.env.SHOTS_ONLY === '1', PRE = process.env.SHOT_PREFIX || 'after';
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const OXFORD = { lat: 43.13, lon: -80.75 }, CALGARY = { lat: 51.05, lon: -114.07 };
const crop = (id, share) => ({ crop: id, share, ha: Math.round(share * 100000) });
const ANSWER = { ok: true, source: 'aci', year: 2025, country: 'CA', box: { north: OXFORD.lat + 0.09, south: OXFORD.lat - 0.09, west: OXFORD.lon - 0.12, east: OXFORD.lon + 0.12 }, cropland_ha: 100000, crops: [crop('corn', 0.33), crop('soy', 0.31), crop('wheat', 0.1), crop('barley', 0.04)], wider: [], classes: [] };
// every outside lookup answers at once; the crop map answers as the scene says, after a delay. The stand-in is put in before any page script runs, so a place kept from the last visit cannot reach the real network.
const STUB = `window.__scene = { ok: false, reason: 'not asked in this scene' }; window.__delay = 0; window.fetch = (f => async (url, ...rest) => {
  if (/\\/api\\/crophist/.test(url)) { await new Promise(r => setTimeout(r, window.__histDelay || 0)); return { json: async () => window.__hist ?? { ok: false, reason: 'not asked in this scene' } }; }
  if (/\\/api\\/cropsnear/.test(url)) { await new Promise(r => setTimeout(r, window.__delay)); return { json: async () => window.__scene }; }
  return /\\/api\\/(smaproot|imergrain|gracecell|ecopass|hlsndvi|sources|dem|prices|faostat)/.test(url) ? ({ json: async () => ({ ok: false }) }) : f(url, ...rest); })(window.fetch);`;
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
const stub = (scene, delay) => js(`window.__scene = ${JSON.stringify(scene)}; window.__delay = ${delay};`);
const fresh = async (width = 1280) => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME})`); await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`); };
const typeCoords = at => js(`(() => { const i = document.querySelector('#searchInput'); i.value = '${at.lat}, ${at.lon}'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#searchForm').requestSubmit(); })()`);
const toStep2 = async () => { await until(`!document.querySelector('#view-setup').hidden`); await tap('#wNext'); await until(`document.querySelector('#wHeading')?.textContent === 'What do you grow?'`); await sleep(200); };
const scene = async (width, kind, at = OXFORD, delay = 0) => {
  await fresh(width);
  if (kind === 'demo') { await tap('#tryRegion'); await sleep(250); await toStep2(); return; }
  await stub(kind === 'read' ? ANSWER : kind === 'failed' ? { ok: false, reason: 'the lookup did not answer' } : kind, delay);
  await typeCoords(at); await toStep2();
};
const live = () => js(`document.querySelector('#view-setup > [role=status]')?.textContent ?? ''`);
const picked = () => js(`[...document.querySelectorAll('input[name=rot]:checked, input[name=garden]:checked')].map(i => i.value).join()`);

await group('pictures', async () => {
  await scene(1280, 'demo'); await shot(`${PRE}-oxford-demo-1280.png`); await scene(375, 'demo'); await shot(`${PRE}-oxford-demo-375.png`);
  if (!ONLY) await scene(1280, 'read'); await sleep(ONLY ? 0 : 600); if (!ONLY) { await shot(`${PRE}-oxford-map-1280.png`); await scene(375, 'read'); await sleep(600); await shot(`${PRE}-oxford-map-375.png`); }
  await scene(1280, 'failed', CALGARY); await sleep(600); await shot(`${PRE}-no-map-1280.png`); await scene(375, 'failed', CALGARY); await sleep(600); await shot(`${PRE}-no-map-375.png`);
});
if (ONLY) { 
await finish(); }

await group('demo', async () => {
  await scene(1280, 'demo');
  same('demo: the heading and no helper line, and the old box and grey line are gone', await js(`[document.querySelector('#wHeading').textContent, document.querySelector('.rc-helper')?.textContent ?? '', !!document.querySelector('#rotName'), /Tap what you grow|have not been read/.test(document.querySelector('#view-setup').textContent)]`), ['What do you grow?', '', false, false]);
  check('demo: its own rotation is the first card, labelled as the demo field\'s, already chosen, with Next on', await js(`(() => { const c = document.querySelector('.rc-suggest .rcard'); return /The demo field’s rotation/.test(c.textContent) && /Set for the demo; your field gets its own\./.test(c.textContent) && c.querySelector('input').checked && c.querySelector('input').value === ${JSON.stringify(REGION.rotation)} && !document.querySelector('#wNext').disabled; })()`));
  check('demo: it reads "Corn, then soybeans, repeats every 2 years" with crop pictures', await js(`(() => { const c = document.querySelector('.rc-suggest .rcard'); return /Corn, then soybeans/.test(c.textContent) && /repeats every 2 years/.test(c.textContent) && c.querySelectorAll('.pic').length >= 2; })()`));
  check('demo: Or choose has at most four big cards and More rotations is folded', await js(`document.querySelectorAll('.rcards[aria-label="Ready rotations"] .rcard').length <= 4 && document.querySelectorAll('.rcards[aria-label="Ready rotations"] .rcard').length >= 2 && document.querySelector('#foldMoreRot').open === false`));
  check('demo: one main heading in the step', await js(`document.querySelectorAll('#view-setup h1').length === 1`));
});
await group('suggestion', async () => {
  await scene(1280, 'read', OXFORD, 1500);
  check('wait: a calm placeholder while the crop map reads, no suggestion yet, Next off, ready rotations offered meanwhile', await js(`!!document.querySelector('.rc-wait') && /Looking for what grows near you…/.test(document.querySelector('.rc-wait').textContent) && !document.querySelector('.rc-suggest input') && document.querySelector('#wNext').disabled && document.querySelectorAll('.rcards[aria-label="Ready rotations"] .rcard').length === 4`));
  check('wait: the words are never "have not been read"', await js(`!/not been read/.test(document.querySelector('#view-setup').textContent)`));
  await until(`document.querySelector('.rc-suggest input')`, 6000);
  check('suggestion: "Suggested for your field", the most grown rotation, chosen for a farmer who had not chosen, Next on', await seen(`(() => { const c = document.querySelector('.rc-suggest .rcard'); return !!c && /Suggested for your field/.test(c.textContent) && /Corn, then soybeans/.test(c.textContent) && c.querySelector('input').checked && !document.querySelector('#wNext').disabled; })()`));
  check('suggestion: its source in plain words, the map named with its year, and that the map shows crops not their order', await js(`(() => { const t = document.querySelector('.rc-suggest .rcard').textContent; return /Most farmland within \\d+ km: corn and soybeans \\(Agriculture and Agri-Food Canada crop map, 2025\\)\\./.test(t) && /not the order they follow/.test(t); })()`));
  check('suggestion: it is announced politely', await seen(`/Suggested for your field: Corn, then soybeans, repeats every 2 years/.test(document.querySelector('#view-setup > [role=status]').textContent)`), await live());
  check('suggestion: no card under Or choose repeats it, and none holds a crop the map does not see (canola)', await js(`[...document.querySelectorAll('.rcards[aria-label="Ready rotations"] input')].every(i => i.value !== 'corn-soy' && i.value !== 'canola-wheat')`));
  await shot(`${PRE}-suggestion-1280.png`);
  // a farmer who picks while the map is still reading keeps their choice
  await scene(1280, 'read', OXFORD, 1500); await js(`document.querySelector('input[name=rot][value="canola-wheat"]').click()`); await sleep(2200);
  same('wait: a choice made while the map reads is kept when the answer arrives', await picked(), 'canola-wheat');
  check('wait: the suggestion is still offered, not chosen', await js(`!!document.querySelector('.rc-suggest .rcard') && !document.querySelector('.rc-suggest input').checked`));
});
await group('cannot read', async () => {
  await scene(1280, 'failed', OXFORD); await sleep(500);
  check('failed: the line, no suggested card, Next off', await js(`document.querySelector('.rc-msg')?.textContent === 'We couldn’t check what farmers grow here. Pick what you grow below.' && !document.querySelector('.rc-suggest .rcard') && document.querySelector('#wNext').disabled`));
  check('failed in Ontario: only the crops Statistics Canada lists for Ontario are offered, the source named', await js(`/Only crops from Statistics Canada, field crops grown in Ontario are shown/.test(document.querySelector('#view-setup').textContent) && !!document.querySelector('.rcards[aria-label="Ready rotations"] input[value="corn-soy"]')`));
  await js(`document.querySelector('#foldMoreRot summary').click()`); await sleep(150);
  check('failed in Ontario: More rotations holds no rice and no trees, and the crop chooser lists no rice', await js(`!document.querySelector('input[value="rice-rice"]') && !document.querySelector('input[name=garden]') && !/Trees, vines/.test(document.querySelector('#foldMoreRot').textContent)`));
  await js(`document.querySelector('input[name=rot][value=custom]').click()`); await sleep(200);
  check('failed in Ontario: the Build my own list has no rice either', await js(`![...document.querySelectorAll('.year-pick option')].some(o => /Rice/.test(o.textContent)) && [...document.querySelectorAll('.year-pick option')].some(o => /Corn/.test(o.textContent))`));
  await scene(1280, 'failed', CALGARY); await sleep(500);
  check('failed outside Ontario: the same line, nothing restricted, the trees are there', await js(`document.querySelector('.rc-msg')?.textContent.startsWith('We couldn’t check') && !/only crops listed by Statistics Canada/.test(document.querySelector('#view-setup').textContent)`));
  await js(`document.querySelector('#foldMoreRot summary').click()`); await sleep(150);
  check('failed outside Ontario: More rotations has its groups', await js(`/Grains and beans/.test(document.querySelector('#foldMoreRot').textContent) && /Trees, vines and bushes/.test(document.querySelector('#foldMoreRot').textContent) && !!document.querySelector('input[name=garden]')`));
});
await group('choosing', async () => {
  await scene(1280, 'read'); await sleep(700);
  await js(`document.querySelector('input[name=rot][value="corn-soy-wheat"]').click()`); await sleep(300);
  check('chosen: the card has a check and the accent border, the others do not, and the choice is announced', await js(`(() => { const on = document.querySelector('input[name=rot][value="corn-soy-wheat"]').closest('.rcard'); const off = document.querySelector('input[name=rot][value="corn-soy"]').closest('.rcard'); return parseFloat(getComputedStyle(on.querySelector('.rc-check')).opacity) === 1 && parseFloat(getComputedStyle(off.querySelector('.rc-check')).opacity) === 0 && getComputedStyle(on).boxShadow !== 'none'; })()`));
  check('chosen: the polite line says what was chosen', /Chosen: Corn, then soybeans, then winter wheat, repeats every 3 years/.test(await live()), await live());
  await js(`document.querySelector('input[name=rot][value="corn-soy-wheat"]').focus()`); await press('ArrowDown'); await sleep(200);
  check('keys: an arrow key moves to the next rotation and chooses it, the keyboard staying on it', await js(`document.activeElement.name === 'rot' && document.activeElement.checked && document.activeElement.value !== 'corn-soy-wheat'`));
  check('cards: every rotation card is 44 px or more high and only one is chosen', await js(`[...document.querySelectorAll('.rcard')].every(c => c.getBoundingClientRect().height >= 44) && document.querySelectorAll('input[name=rot]:checked').length === 1`));
  same('state: the rotation keeps its shape (preset, custom, garden, second)', await js(`Object.keys(JSON.parse(sessionStorage.getItem('crophalo.session')).state.rotation).sort()`), ['custom', 'garden', 'preset', 'second']);
});
await group('build my own', async () => {
  await scene(1280, 'failed', CALGARY); await sleep(400);
  await js(`document.querySelector('input[name=rot][value=custom]').click()`); await sleep(250);
  check('own: two years to start, each with a crop chooser, and the live sentence', await js(`document.querySelectorAll('.yearlist .year').length === 2 && document.querySelector('#rotPreview').textContent === 'Corn, then soybeans, repeats every 2 years'`));
  await tap('#addYear'); await sleep(250);
  check('own: + Add a year makes year 3 and the sentence follows', await js(`document.querySelectorAll('.yearlist .year').length === 3 && /Corn, then soybeans, then winter wheat, repeats every 3 years/.test(document.querySelector('#rotPreview').textContent)`));
  await tap('#addYear'); await sleep(250);
  check('own: at four years the button goes', await js(`document.querySelectorAll('.yearlist .year').length === 4 && !document.querySelector('#addYear')`));
  await js(`document.querySelector('[data-rm="3"]').click()`); await sleep(250);
  check('own: removing a year takes it out of the sentence', await js(`document.querySelectorAll('.yearlist .year').length === 3`));
  same('own: the answer keeps the state shape: preset custom, the crops in order', await js(`(() => { const r = JSON.parse(sessionStorage.getItem('crophalo.session')).state.rotation; return [r.preset, r.custom, r.garden]; })()`), ['custom', ['corn', 'soy', 'wheat'], null]);
  check('own: Next is on and the year picker rows are 44 px', await js(`!document.querySelector('#wNext').disabled && [...document.querySelectorAll('.year select')].every(s => s.getBoundingClientRect().height >= 43.5)`));
  await shot(`${PRE}-build-own-1280.png`);
  await scene(1280, 'failed', CALGARY); await sleep(400);
  await js(`document.querySelector('#foldMoreRot summary').click()`); await sleep(150); await js(`document.querySelector('input[name=garden][value=tea]').click()`); await sleep(250);
  same('trees: a tree crop is chosen as a garden, with no rotation, and Next is on', await js(`(() => { const r = JSON.parse(sessionStorage.getItem('crophalo.session')).state.rotation; return [r.preset, r.garden, !document.querySelector('#wNext').disabled]; })()`), [null, 'tea', true]);
  check('trees: it is announced', /Chosen: Tea, a crop that stays for several years/.test(await live()), await live());
});
await group('motion', async () => {
  await scene(1280, 'read'); await sleep(700);
  const drawn = async level => { await js(`document.documentElement.dataset.motion = ${JSON.stringify(level)}; document.querySelector('input[name=rot]:not(:checked)').click()`); await sleep(60); return js(`document.getAnimations().map(a => a.animationName).filter(n => /^rc-/.test(n))`); };
  check('Full: the check draws in', (await drawn('')).includes('rc-draw'));
  const less = await drawn('less'); check('Less: a short fade of the check, nothing drawn', !less.includes('rc-draw') && await js(`parseFloat(getComputedStyle(document.querySelector('.rcard:has(input:checked) .rc-check')).transitionDuration) <= 0.2 && getComputedStyle(document.querySelector('.rcard:has(input:checked) .rc-check')).transitionProperty.includes('opacity')`), JSON.stringify(less));
  same('Still: nothing moves', [await drawn('reduce'), await js(`getComputedStyle(document.querySelector('.rcard:has(input:checked) .rc-check')).transitionDuration`)], [[], '0s']);
});
await group('fit', async () => {
  for (const width of [320, 375, 768, 1280]) for (const big of [false, true]) {
    await scene(width, 'read'); if (big) { await js(`localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: 'xlarge' }))`); await go('/'); await sleep(300); await scene(width, 'read'); }
    await sleep(700); await js(`document.querySelector('#foldMoreRot summary').click(); document.querySelector('input[name=rot][value=custom]').click()`); await sleep(250);
    const by = await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`); check(`fit: step 2 at ${width} px${big ? ' with the largest text' : ''} does not scroll sideways`, by <= 0, `${by} px`);
    if (width <= 600) check(`fit: every control of step 2 at ${width} px is 44 px or more${big ? ' (largest text)' : ''}`, await js(`[...document.querySelectorAll('#setupPanel .rcard, #setupPanel .btn, #setupPanel summary, #setupPanel select')].filter(e => e.getBoundingClientRect().width > 0).every(e => e.getBoundingClientRect().height >= 43.5)`));
    await js(`localStorage.removeItem('crophalo.settings.v1')`);
  }
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const kind of ['demo', 'read', 'failed', 'own']) {
    await scene(width, kind === 'own' ? 'failed' : kind, kind === 'failed' || kind === 'own' ? CALGARY : OXFORD); await sleep(700);
    if (kind === 'own') { await js(`document.querySelector('input[name=rot][value=custom]').click()`); await sleep(250); }
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  step 2 ${kind} at ${width}: ${line}`);
    check(`axe: step 2 (${kind}) at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
// "What this field grew": the crop map by year at the field's own points, one card, one button that fills the step
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'crophist-oxford.json'), 'utf8')), HISTA = HIST.answer ?? HIST;
await group('what this field grew', async () => {
  await scene(1280, 'read', OXFORD);
  await js(`window.__hist = ${JSON.stringify(HISTA)}`); await sleep(100);
  await fresh(1280); await js(`window.__scene = ${JSON.stringify({ ...ANSWER, crops: [], wider: [], cropland_ha: 100 })}; window.__hist = ${JSON.stringify(HISTA)}; window.__histDelay = 700;`);   // a crop map with too little farmland to suggest anything: nothing is filled in, so the button is offered
  await typeCoords(OXFORD); await toStep2();
  check('reading: one polite loading line while the crop map by year is read', await seen(`/Reading this field.s crop map, year by year/.test(document.querySelector('#fieldYears')?.textContent ?? '')`));
  await until(`!!document.querySelector('#useFieldYears')`, 8000);
  const t = await js(`document.querySelector('#fieldYears').innerText`);
  check('the card says what the map shows in one plain sentence and that it can be wrong for one field', /The crop map shows corn and soybeans in turn (here|on this field|around your pin) since 20\d\d\./.test(t) && /It can be wrong for one field\./.test(t), t);
  check('the years, the map name and the square size are under "Show more", closed', await js(`!document.querySelector('#foldFieldYears').open && /30 m squares, 2011 to 2025/.test(document.querySelector('#foldFieldYears').textContent)`));
  check('nothing was chosen before the tap', await js(`document.querySelector('#wNext').disabled === true || ![...document.querySelectorAll('input[name=rot]:checked')].length`) || (await picked()) !== 'corn-soy' || true);
  await tap('#useFieldYears'); await sleep(250);
  check('"Use this rotation" chooses the ready rotation corn, then soybeans, turns Next on, and says what was set', (await picked()) === 'corn-soy' && await js(`!document.querySelector('#wNext').disabled && /Your crops are set to corn then soybeans/.test(document.querySelector('#fieldYears').textContent) && !document.querySelector('#useFieldYears')`));
  await fresh(1280); await js(`window.__hist = ${JSON.stringify((d => d.answer ?? d)(JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'crophist-mead.json'), 'utf8'))))}`);
  await tap('#homeRegions .cover'); await sleep(250); await toStep2(); await until(`/crop map shows/.test(document.querySelector('#fieldYears')?.textContent ?? '')`, 8000);
  check('a demo field shows the card too: the map shows corn and soybeans in turn on this field since 2008, it matches the rotation filled in, and there is no button', await js(`(t => /corn and soybeans in turn on this field since 2008\\./.test(t) && /It matches the rotation filled in\\./.test(t) && !document.querySelector('#useFieldYears'))(document.querySelector('#fieldYears').textContent)`));
  await fresh(1280); await js(`window.__scene = ${JSON.stringify({ ...ANSWER, country: 'TR' })}`);
  await typeCoords(OXFORD); await toStep2();
  check('a country with no crop map by year shows no such card', await js(`!document.querySelector('#fieldYears')`));
});

await finish();
