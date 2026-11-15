// The browser suite for the small states of the real app, at each motion level (html[data-motion] '', 'less', 'reduce'): the undo toast counts down where it can be seen and waits while a pointer is on it,
// and "Added to My Farm" and "Copied" show on the button that was pressed. Full draws the tick and runs the bar; Less and Still only show them; the owners' screens say what happened with one event.
// RULE: never loosen a check here without a written reason. Run: node scripts/e2e_micro.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('micro');
const { ROOT, js, until, size, go, check, same, group, finish, sleep, send } = run;
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SAMPLER = `(() => { const seen = new Map(); window.__motion = { seen };
  setInterval(() => { for (const a of document.getAnimations()) { const t = a.effect?.getComputedTiming?.() || {}, el = a.effect?.target, where = el?.closest?.('#toast') ? 'toast' : el?.closest?.('.fx-tick') || el?.classList?.contains?.('fx-tick') ? 'tick' : 'other';
      const props = a.transitionProperty ? [a.transitionProperty] : (a.effect?.getKeyframes?.() || []).flatMap(f => Object.keys(f).filter(n => !['offset', 'easing', 'composite', 'computedOffset'].includes(n)));
      const key = where + ':' + (a.animationName || a.transitionProperty || a.id) + ':' + t.duration; if (!seen.has(key)) seen.set(key, { where, name: a.animationName || a.transitionProperty || a.id || 'script', ms: t.duration, easing: t.easing, props: [...new Set(props)] }); } }, 20); })()`;
let injected = null;
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
async function openAt(level) {
  if (injected) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected }); injected = null; }
  await size(1280); await go('/'); await acceptWelcome();
  injected = (await send('Page.addScriptToEvaluateOnNewDocument', { source: SAMPLER })).identifier;
  await go('/');
  await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`, 30000);
  await sleep(300);
  await js(`${level === 'full' ? 'delete document.documentElement.dataset.motion' : `document.documentElement.dataset.motion = '${level === 'less' ? 'less' : 'reduce'}'`}; window.__motion.seen.clear(); import('/js/motion-wire.js')`); await sleep(400);
}
const seen = () => js(`[...window.__motion.seen.values()]`);
const secs = () => js(`document.querySelector('#toast .toast-secs')?.textContent ?? null`);
const showing = () => js(`document.getElementById('toast').classList.contains('show')`);
const stateButton = `(() => { document.querySelector('#probe')?.remove(); const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'probe'; b.textContent = 'Press me'; document.body.prepend(b); return true; })()`;

for (const level of ['full', 'less', 'still']) {
  await group(`small states at level ${level}`, async () => {
    await openAt(level);
    // ---- the undo toast
    await js(`import('/js/toast.js').then(m => { window.__undone = 0; m.toast('Saved field removed.', { action: 'Undo', onAction: () => { window.__undone++; }, ms: 3000 }); })`); await sleep(250);
    check('the toast shows its words, the Undo button and the seconds left (3 s)', await showing() && /Saved field removed/.test(await js(`document.getElementById('toast').textContent`)) && await js(`!!document.querySelector('#toast .btn')`) && ['3 s', '2 s'].includes(await secs()), await secs());
    await sleep(1300);
    check('the seconds count down as time passes', ['2 s', '1 s'].includes(await secs()), await secs());
    const during = (await seen()).filter(a => a.where === 'toast' && a.ms > 1);
    if (level === 'full') check('Full: a thin bar runs out over the 3 s, in a straight line, by width only (scaleX from 1 to 0)', during.some(a => a.ms === 3000 && a.easing === 'linear' && a.props.includes('transform')), during);
    else check(`${level === 'less' ? 'Less' : 'Still'}: no bar runs; the seconds still count (nothing in the toast moves for more than 200 ms)`, during.every(a => a.ms <= 200) && await js(`document.querySelector('#toast .toast-count')?.hidden === true`), during);
    // waiting while a pointer is on it
    await js(`document.getElementById('toast').dispatchEvent(new PointerEvent('pointerenter'))`);
    const frozen = await secs(); await sleep(2600);
    check('while the pointer is on the line it waits: still showing after its 3 s, and the seconds have not moved', await showing() && await secs() === frozen, [frozen, await secs()]);
    await js(`document.getElementById('toast').dispatchEvent(new PointerEvent('pointerleave'))`);
    await until(`!document.getElementById('toast').classList.contains('show')`, 5000);
    check('when the pointer leaves it goes on from where it was and then goes', !await showing() && await js('window.__undone') === 0);
    // undo by the button and by the keyboard
    await js(`import('/js/toast.js').then(m => m.toast('Removed.', { action: 'Undo', onAction: () => { window.__undone++; }, ms: 3000 }))`); await sleep(200);
    await js(`document.querySelector('#toast .btn').click()`);
    check('the Undo button runs the undo once and hides the line', await js('window.__undone') === 1 && !await showing());
    await js(`import('/js/toast.js').then(m => { m.toast('Removed again.', { action: 'Undo', onAction: () => { window.__undone++; }, ms: 3000 }); window.__ran = m.runToastAction(); })`);
    check('the keyboard\'s undo (Ctrl or Cmd with Z) still works', await js('window.__ran === true && window.__undone') === 2);
    await js(`import('/js/toast.js').then(m => m.toast('A plain line.', { ms: 600 }))`); await sleep(250);
    check('a plain line has no countdown', await js(`!document.querySelector('#toast .toast-secs') && !document.querySelector('#toast .toast-count')`));
    await until(`!document.getElementById('toast').classList.contains('show')`, 3000);
    // ---- Added and Copied, on the pressed button
    for (const [what, label] of [['added', 'Added to My Farm'], ['copied', 'Copied']]) {
      await js(stateButton); await js(`window.__motion.seen.clear()`);
      await js(`document.dispatchEvent(new CustomEvent('crophalo:did', { detail: { what: ${JSON.stringify(what)}, button: document.getElementById('probe') } }))`); await sleep(700);
      const state = await js(`(() => { const b = document.getElementById('probe'); return { text: b.textContent.trim(), tick: !!b.querySelector('.fx-tick'), disabled: b.getAttribute('aria-disabled') }; })()`);
      check(`${what}: the pressed button shows a tick and "${label}"${what === 'added' ? ' and is no longer pressable' : ''}`, state.tick && state.text === label && (what === 'copied' || state.disabled === 'true'), state);
      const ticks = (await seen()).filter(a => a.where === 'tick' && a.ms > 1);
      if (level === 'full') check(`Full: the ${what} tick draws itself (dash offset, 450 ms)`, ticks.some(a => a.props.some(p => /stroke-?dash/i.test(p)) && a.ms === 450), ticks);
      else check(`${level === 'less' ? 'Less' : 'Still'}: the ${what} tick is simply there, drawn (nothing animates it)`, (level === 'less' ? ticks.every(t => t.ms <= 200 && t.props.every(p => ['color', 'opacity', 'background-color'].includes(p))) : ticks.length === 0), ticks);   // Less allows a colour change of 200 ms at most (the motion rule); Still allows none
      if (what === 'copied') { await sleep(2000); check('copied: the button goes back to its own words after two seconds', await js(`document.getElementById('probe').textContent.trim()`) === 'Press me'); }
      await js(`document.getElementById('probe').remove()`);
    }
  });
}
await group('the owners\' screens say what happened', async () => {
  await openAt('full');
  const rep = read('js/report.js'), hist = read('js/history-view.js'), hasDiscuss = fs.existsSync(path.join(ROOT, 'js/discuss.js'));   // the Share screen's file is in another folder until the merge: its two checks run after it
  check('the report says "added" with its button when My Farm has taken the field', /crophalo:did[^)]*what: 'added', button: btn/.test(rep), 'report.js');
  check('the land history says "copied" with its button once the text is on the clipboard', /clipboard\.writeText\(text\); document\.dispatchEvent\(new CustomEvent\('crophalo:did', \{ detail: \{ what: 'copied', button: a/.test(hist), 'history-view.js');
  if (!hasDiscuss) console.log('micro: js/discuss.js is not in this folder yet, so its two copyText checks were not run');
  else {
  const r = await js(`(async () => { const m = await import('/js/discuss.js'); await import('/js/motion-wire.js'); document.body.prepend(Object.assign(document.createElement('button'), { id: 'probe2', className: 'btn', textContent: 'Copy' }));
    const got = await m.copyText('hello', { navigator: { clipboard: { writeText: async () => {} } }, document }, null, document.getElementById('probe2'));
    await new Promise(r => setTimeout(r, 300)); return [got, document.getElementById('probe2').textContent.trim(), !!document.querySelector('#probe2 .fx-tick')]; })()`);
  same('discuss.js copyText, given the button, answers copied and the button shows Copied with its tick', r, ['copied', 'Copied', true]);
  const r2 = await js(`(async () => { const m = await import('/js/discuss.js'); const b = document.createElement('button'); b.textContent = 'Copy'; document.body.append(b);
    const got = await m.copyText('hello', { navigator: {}, document }, null, b); await new Promise(r => setTimeout(r, 200)); return [got, b.textContent]; })()`);
  same('when nothing can be copied it says failed and the button is left alone', r2, ['failed', 'Copy']);
  }
});
await finish();
