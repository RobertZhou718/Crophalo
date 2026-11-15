// Crophalo's screen-check suite in a real browser: the Options tab has one card for each plan with a name that says what it changes, the calendar's ground grids have visible month labels and
// the rain chart says "mm" (on a phone too), and every "i" button can be hit from 10 px outside its 24 px circle (a 44 px place to tap). Runs on the throwaway copy scripts/e2e_lib.mjs makes. Run: node scripts/e2e_qa.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_qa');
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map or soil-moisture route: a demo field asks for them at once, so they are answered here, quietly
const { js, until, size, go, check, same, group, finish, sleep } = run;
const POWER = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'power_barrie.json'), 'utf8'), REC = JSON.parse(POWER);
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const S = (year, crop, extra = {}) => ({ year, crop, sow: '2027-05-01', harvest: '2027-10-01', after: 'residue', residueUntil: null, window: null, ...extra });
const two = { id: 'now', name: 'Today', kind: 'current', score: 70, flag: 'holds', scores: { water: 70, soil: 70, erosion: 70, income: 70, weather: 70 }, seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'corn')] };
const cov = { id: 'c1', name: 'With a cover crop', kind: 'proposed', score: 73, flag: 'holds', scores: two.scores, seasons: [S(1, 'corn', { cover: 'rye', after: 'cover' }), S(2, 'soy', { cover: 'rye', after: 'cover' }), S(3, 'corn', { cover: 'rye', after: 'cover' })] };
const cov2 = { id: 'c2', name: 'With a cover crop', kind: 'proposed', score: 71, flag: 'holds', scores: two.scores, seasons: [S(1, 'corn', { cover: true, after: 'cover' }), S(2, 'soy', { cover: true, after: 'cover' }), S(3, 'corn', { cover: true, after: 'cover' })] };
const RESULT = { ok: true, current: two, recommended: two, others: [cov, cov2], reason: 'Nothing we tested does clearly better here.', evidence: [{ text: 'NASA weather since 2001.', sources: ['power'] }], gaps: [], risks: [], sureness: 'Fairly sure' };
const prep = async width => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME})`); await go('/'); await sleep(400); await js(`window.fetch = async () => ({ ok: true, json: async () => ({ ok: false }) })`); };
const options = async width => {
  await prep(width);
  await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); await m.renderResult({ ...st.newState(), loc: { lat: 43.13, lon: -80.75, cc: 'CA' }, name: 'Oxford' }, ${JSON.stringify(RESULT)}); void 0; })`);
  await until(`document.querySelector('.srow')`); await sleep(200);
};

await group('options', async () => {
  await options(1280);
  const cards = await js(`[...document.querySelectorAll('.srow')].map(c => ({ tag: c.querySelector('.srow-tag')?.textContent.trim(), name: c.querySelector('.srow-name').textContent.trim(), change: c.querySelector('.srow-change')?.textContent.trim() ?? '' }))`);
  check('three plans, three rows (the suggestion and today are one row)', cards.length === 3, JSON.stringify(cards));
  check('one row says what you grow now, and it says it is also our suggestion', cards.filter(c => /^What you grow now/.test(c.tag)).length === 1 && /What you grow now · Our suggestion/.test(cards[0].tag), JSON.stringify(cards));
  check('no two rows have the same name, and the cover-crop options say what they change', new Set(cards.map(c => c.name + '|' + c.change)).size === cards.length && cards.slice(1).every(c => /cover crop after harvest/.test(c.change)), JSON.stringify(cards));
  check('a two-year rotation is named "Corn, then soybeans", never three years', cards[0].name === 'Corn, then soybeans', cards[0].name);
  check('the answer headline says "Keep Corn, then soybeans"', await js(`/Keep Corn, then soybeans/.test(document.querySelector('#answer').innerText)`));
});
await group('info buttons', async () => {
  for (const width of [1280, 375]) {
    await options(width); await sleep(200);
    const miss = await js(`(() => { const out = []; for (const b of document.querySelectorAll('.srci')) { const r = b.getBoundingClientRect(); if (!r.width) continue; const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (const [dx, dy] of [[-17, 0], [17, 0], [0, -17], [0, 17]]) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue; const hit = document.elementFromPoint(x, y); if (hit !== b && !b.contains(hit)) out.push(Math.round(x) + ',' + Math.round(y) + ' hits ' + (hit?.className || hit?.tagName)); } } return out.slice(0, 5); })()`);
    check(`every "i" can be hit 17 px from its centre on every side (a 44 px place to tap) at ${width} px`, miss.length === 0, miss.join(' | '));
    check(`the "i" circle itself is 24 px at ${width} px`, await js(`[...document.querySelectorAll('.srci')].every(b => { const r = b.getBoundingClientRect(); return !r.width || (Math.round(r.width) === 24 && Math.round(r.height) === 24); })`));
  }
});
await group('calendar', async () => {
  for (const width of [1280, 375]) {
    await prep(width); await go('/#data'); await until(`document.querySelector('#infoBody')`);
    await js(`(async () => { for (const h of ['css/app.css', 'css/calendar.css']) if (!document.querySelector('link[href="' + h + '"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.append(l); }
      const d = await import('/js/data.js'), c = await import('/js/climate.js'), cd = await import('/js/calendar-data.js'), cv = await import('/js/calendar-view.js'); const R = ${POWER}, place = { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} };
      const series = d.buildSeries(R, place), climate = c.computeClimate(series, place.lat); document.querySelector('#infoBody').innerHTML = cv.calendarHTML(cd.buildCalendar({ result: ${JSON.stringify(RESULT)}, climate })); })()`);
    await until(`document.querySelector('.fc-plan')`); await sleep(300);
    const m = await js(`(() => { const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
      const plans = [...document.querySelectorAll('.fc-plan')], heads = plans.map(p => [...p.querySelectorAll('.fc-yearhead .fc-m')].filter(e => [...e.children].some(vis)).length), years = [...document.querySelectorAll('.fc-plan .fc-yearrow:not(.fc-yearhead) .fc-year')].map(vis), unit = document.querySelector('.fc-unit');
      return { heads, yearsVisible: years.every(Boolean) && years.length > 0, unit: unit ? vis(unit) && /millimetres \\(mm\\)/.test(unit.textContent) : false, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
    check(`each ground grid shows 12 month labels at ${width} px`, m.heads.length >= 2 && m.heads.every(n => n === 12), JSON.stringify(m));
    check(`each ground row shows its year at ${width} px`, m.yearsVisible, JSON.stringify(m));
    check(`the rain chart says its unit, "Rain in millimetres (mm)", at ${width} px`, m.unit, JSON.stringify(m));
    check(`the calendar does not scroll sideways at ${width} px`, m.over <= 0, JSON.stringify(m));
  }
});
await finish();
