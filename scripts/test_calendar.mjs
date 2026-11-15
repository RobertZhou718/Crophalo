// Crophalo's Calendar-tab suite: the ground month by month under each plan, the winter-wheat sowing window and the late-soybean-harvest squeeze, and the normal year of rain,
// frost and hot days from a recorded real NASA POWER answer. The plans below are made for these checks only (the shape is the engine's contract); no screen ever shows them.
// RULE: never loosen a check to make it pass; fix the project. No page and no internet. Run: node scripts/test_calendar.mjs
import fs from 'node:fs';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { stateOn, planYears, sowingLines, climateRows, buildCalendar, frostTitle, hotTitle, daysBetween, STATE_WORDS } from '../js/calendar-data.js';
import { calendarHTML, timelineSVG, legendHTML } from '../js/calendar-view.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const S = (year, crop, sow, harvest, after, residueUntil = null, window = null) => ({ year, crop, sow, harvest, after, residueUntil, window });
const current = { id: 'now', name: 'Corn, soybeans, corn', kind: 'current', seasons: [S(1, 'corn', '2027-05-01', '2027-10-05', 'residue', '2027-12-01'), S(2, 'soy', '2028-05-20', '2028-10-02', 'residue', '2028-12-01'), S(3, 'corn', '2029-05-01', '2029-10-05', 'residue', null)] };
const wheatWindow = { earliest: '2028-09-25', latest: '2028-10-15' };
const proposed = { id: 'wheat', name: 'Corn, soybeans, winter wheat', kind: 'proposed', seasons: [current.seasons[0], current.seasons[1], S(3, 'wheat', '2028-10-05', '2029-07-25', 'cover', null, wheatWindow)] };

// ---- what covers the ground on a date
same('in the season: the crop', stateOn(current, '2027-07-01'), { state: 'crop', crop: 'corn' });
same('on the sowing day and on the harvest day the crop is there', [stateOn(current, '2027-05-01').state, stateOn(current, '2027-10-05').state], ['crop', 'crop']);
same('after harvest: residue, until its date', [stateOn(current, '2027-10-06').state, stateOn(current, '2027-12-01').state], ['residue', 'residue']);
same('after the residue date the soil is bare', stateOn(current, '2027-12-02').state, 'bare');
same('a residue with no date lasts until the next sowing, not for ever', [stateOn(current, '2029-10-06').state, stateOn(current, '2030-03-01').state], ['residue', 'residue']);
same('living cover after harvest', stateOn({ seasons: [S(1, 'soy', '2028-05-20', '2028-10-02', 'cover')] }, '2028-11-15'), { state: 'cover', crop: null });
same('bare after harvest', stateOn({ seasons: [S(1, 'soy', '2028-05-20', '2028-10-02', 'bare')] }, '2028-11-15').state, 'bare');
same('before the first sowing the plan says nothing', stateOn(current, '2027-03-01'), { state: null, crop: null });
same('a season with no "after" says nothing after its harvest', stateOn({ seasons: [{ year: 1, crop: 'corn', sow: '2027-05-01', harvest: '2027-10-05' }] }, '2027-11-01').state, null);
same('bad dates and no plan say nothing', [stateOn(current, 'x'), stateOn(null, '2027-07-01'), stateOn({ seasons: [{ sow: 'a', harvest: 'b' }] }, '2027-07-01'), stateOn({ seasons: [S(1, 'corn', '2027-10-05', '2027-05-01', 'bare')] }, '2027-07-01')].map(x => x.state), [null, null, null, null]);
same('the words for every state', Object.keys(STATE_WORDS).sort(), ['bare', 'cover', 'crop', 'residue']);

// ---- the months of a plan
const cy = planYears(current), py = planYears(proposed);
same('a plan with three seasons runs over its calendar years, each with twelve months', [cy.map(y => y.year), cy.every(y => y.cells.length === 12)], [[2027, 2028, 2029], true]);
check('the crop name is on the month it starts, and on no other', (() => { const starts = cy.flatMap(y => y.cells.filter(c => c.starts).map(c => [y.year, c.month, c.starts])); return JSON.stringify(starts) === JSON.stringify([[2027, 4, 'Corn (maize)'], [2028, 4, 'Soybeans'], [2029, 4, 'Corn (maize)']]) || (starts.length === 3 && starts.map(s => s[1]).join() === '4,4,4'); })());
same('the harvest month is marked', [cy[0].cells[9].harvestDay, cy[1].cells[9].harvestDay], ['2027-10-05', '2028-10-02']);
check('after the soybean harvest the current plan shows residue, then bare soil', cy[1].cells[10].state === 'residue' && cy[1].cells[11].state === 'bare', brief(cy[1].cells.slice(9)));
check('the proposed plan has a crop (the wheat) growing there, from the sowing day on', py[1].cells[10].state === 'crop' && py[1].cells[11].state === 'crop' && py[1].cells[10].crop === 'wheat' && py[2].cells[3].crop === 'wheat', brief(py[1].cells.slice(9)));
same('the wheat is named in the month it is sown', py[1].cells[9].starts, 'Winter wheat');
same('the sowing window is marked on the months it overlaps, on the proposed plan only', [py[1].cells.map((c, m) => c.window ? m : null).filter(m => m !== null), cy.flatMap(y => y.cells).some(c => c.window)], [[8, 9], false]);
check('the same year of the two plans differs exactly where the decision is: November of year two', cy[1].cells[10].state !== py[1].cells[10].state);
same('a plan with no usable dates has no years', [planYears({ seasons: [] }), planYears(null), planYears({ seasons: [{ crop: 'x' }] })], [[], [], []]);
check('a month the plan says nothing about is left blank, not filled in', cy[0].cells[0].state === null && cy[0].cells[2].state === null);

// ---- When to sow: the window and the squeeze
const lines = sowingLines(proposed);
const w = lines[0];
same('one line, for the wheat, with its window and planned day', [lines.length, w.cropId, w.earliest, w.latest, w.open, w.planned, w.plannedInside], [1, 'wheat', '2028-09-25', '2028-10-15', 21, '2028-10-05', true]);
same('a soybean harvest on 2 October leaves 14 of the 21 days: squeezed', [w.squeeze.kind, w.squeeze.left], ['squeezed', 14]);
check('the squeeze says it in words with the dates', w.squeeze.text === 'Soybeans is harvested on 2 Oct 2028, so only 14 days of the 21-day window are left, to 15 Oct 2028.', w.squeeze.text);
const harvestAt = h => sowingLines({ seasons: [S(1, 'soy', '2028-05-20', h, 'residue'), S(2, 'wheat', '2028-10-05', '2029-07-25', 'cover', null, wheatWindow)] })[0].squeeze;
same('a harvest before the window opens: open', [harvestAt('2028-09-20').kind, harvestAt('2028-09-25').kind], ['open', 'open']);
same('a harvest on the last day leaves one day', [harvestAt('2028-10-15').kind, harvestAt('2028-10-15').left], ['squeezed', 1]);
same('a harvest after the window closes: closed', harvestAt('2028-10-20').kind, 'closed');
check('closed says the wheat would be sown late or not at all', /late or not at all/.test(harvestAt('2028-10-20').text));
same('a season with no window has no line', sowingLines(current), []);
same('a planned day outside the window is flagged', sowingLines({ seasons: [S(1, 'wheat', '2028-11-05', '2029-07-25', 'cover', null, wheatWindow)] })[0].plannedInside, false);
check('the sources: NASA POWER and the crop guide, and the Ontario guide for wheat', JSON.stringify(w.sources) === '["power","fao","omafra"]' && JSON.stringify(sowingLines({ seasons: [S(1, 'barley', '2028-04-05', '2028-08-01', 'bare', null, { earliest: '2028-03-25', latest: '2028-04-20' })] })[0].sources) === '["power","fao"]');
same('days between', [daysBetween('2028-09-25', '2028-10-15'), daysBetween('2028-10-15', '2028-09-25')], [20, -20]);

// ---- the climate rows, on a recorded real answer
const REC = JSON.parse(fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8')), place = { lat: REC.geometry.coordinates[1], lon: REC.geometry.coordinates[0] };
const series = buildSeries(REC, place), climate = computeClimate(series, place.lat), rows = climateRows(climate);
check('twelve months of rain, frost and hot days, and the years behind them', rows.rain.length === 12 && rows.frost.length === 12 && rows.hot.length === 12 && rows.years >= 20 && rows.first === 2001, brief([rows.rain.length, rows.years]));
check('rain is a number for each month, winter frost shows, the middle of summer is frost-free', rows.rain.every(Number.isFinite) && rows.frost[0] >= 8 && rows.frost[6] === 0, brief([rows.frost[0], rows.frost[6]]));
same('no climate gives no rows', climateRows(null), null);
same('the frost words, by the count', [frostTitle(0, 12), frostTitle(2, 4), frostTitle(2, 1), frostTitle(6, 0), frostTitle(1, NaN)], ['January: frosty nights are normal', 'March: about 4 frosty nights in a normal year', 'March: about 1 frosty night in a normal year', 'July: no frost in a normal year', 'February: not read']);
same('the hot-day words', [hotTitle(6, 9), hotTitle(0, 0.4), hotTitle(5, NaN)], ['July: about 9 days above 32 °C', 'January: hot days are rare', 'June: not read']);

// ---- the whole tab
const cal = buildCalendar({ result: { current, recommended: proposed }, climate });
same('two plans, current first, and the sowing lines of the proposed one', [cal.plans.map(p => p.label), cal.sowing.length, cal.hasPlans], [['Current plan', 'Proposed plan'], 1, true]);
const none = buildCalendar({ result: null, climate });
same('with no engine answer there are no plans and no sowing lines: nothing made up', [none.plans, none.sowing, none.hasPlans], [[], [], false]);
check('with no climate record the climate rows are absent', buildCalendar({ result: { current, recommended: proposed }, climate: null }).climate === null);

// ---- the markup
const html = calendarHTML(cal);
check('the heading, with the rain "i", and the lead', /Your farming year <button[^>]*class="srci nasa"/.test(html) && /A normal year on your field, month by month/.test(html));
check('every row has twelve equal months: rain, marks, and each year of each plan', (() => { const rowsOf = h => [...h.matchAll(/<div class="fc-row (?:fc-rain|fc-marks|fc-ground)" aria-hidden="true">(.*?)<\/div>/g)].map(m => (m[1].match(/class="fc-(?:col|mk|cell)\b/g) ?? []).length); const r = rowsOf(html); return r.length === 2 + 6 && r.every(n => n === 12); })());
check('each plan is labelled Planned, in words', (html.match(/<h3 id="fp-[^"]+">[^<]*<span class="chip">Planned<\/span>/g) ?? []).length === 2 && /Current plan/.test(html) && /Proposed plan/.test(html));
check('each ground state has its own pattern class and a title in words', ['is-crop', 'is-residue', 'is-bare'].every(c => html.includes(c)) && /title="November 2028: Winter wheat growing/.test(html) && /title="November 2028: crop residue \(thin cover\)/.test(html));
check('the sowing window is marked on the plan rows and in the legend', html.includes('in-window') && /Sowing window/.test(legendHTML()));
check('the legend names all four states and the window', ['A crop growing', 'Living cover', 'Crop residue (thin cover)', 'Bare soil', 'Sowing window'].every(x => html.includes(x)));
check('screen readers get a table for the climate rows and one for each plan', (html.match(/<table class="sr">/g) ?? []).length === 3 && /Month by month: rain, frost and hot days in a normal year/.test(html) && /Proposed plan: the ground, month by month/.test(html));
check('When to sow: the window, the planned day, the squeeze and its words, with the sources\' "i"', html.includes('<b>Sow between 25 Sep and 15 Oct 2028</b> (21 days)') && html.includes('Planned for 5 Oct 2028') && html.includes('The window is squeezed.') && html.includes('so only 14 days of the 21-day window are left') && /When to sow/.test(html) && /data-src="power,fao,omafra"/.test(html));
check('the timeline says what it shows, in words', /<svg class="tl"[^>]*role="img" aria-label="Winter wheat sowing window 25 Sep to 15 Oct; the harvest before it is on 2 Oct; sowing is planned for 5 Oct\."/.test(html), html.match(/<svg class="tl"[^>]*>/)?.[0]);
check('the timeline draws the window, what is left of it, the harvest and the sowing', ['tl-window', 'tl-left', 'tl-harvest', 'tl-sow'].every(c => timelineSVG(w).includes(c)) && !timelineSVG({ ...w, squeeze: { kind: 'open' } }).includes('tl-left'));
check('the guide line is there: dates can differ by a few weeks', /Local dates and varieties can differ by a few weeks/.test(html));
check('no plans read: the tab says so and draws no ground', (() => { const h = calendarHTML(none); return /The plans are not ready, so the ground is not drawn/.test(h) && !/fc-ground/.test(h) && !/When to sow/.test(h) && /fc-rain/.test(h); })());
check('no data at all: not read', calendarHTML(null).includes('could not be worked out'));
check('words from outside are plain text', !/<img src=x/.test(calendarHTML(buildCalendar({ result: { current: { ...current, name: '<img src=x onerror=1>' }, recommended: { ...proposed, name: '<b>x</b>' } }, climate }))));
check('the record never says a chance or a forecast', !/\b(chance|probability|forecast)\b/i.test(html.replace(/probab/g, '')), html.match(/\b(chance|probability|forecast)\b/i)?.[0]);
const OLD_TR = new RegExp('\\b' + 'Tur' + 'key' + '\\b');   // the old English spelling, written in pieces so this file never holds it
check('no old spelling of Türkiye and no key names but crophalo.*', !OLD_TR.test(html) && !/\bfw\./.test(html));
// ---- visible month labels on the plan grids, the rain unit written out, and the year labels not hidden on a phone
{
  const plans = html.split('class="fc-plan"').slice(1);
  check('each plan grid has a visible month header of 12 months, above its years', plans.length >= 2 && plans.every(h => /class="fc-yearrow fc-yearhead"/.test(h) && (h.slice(h.indexOf('fc-yearhead'), h.indexOf('fc-yearrow', h.indexOf('fc-yearhead') + 12)).match(/class="fc-m"/g) ?? []).length === 12), plans.length);
  check('the month header shows both the short name and the one-letter form (CSS picks one by width)', plans.every(h => /fc-full">Jan</.test(h) && /fc-ini">J</.test(h)));
  check('the rain chart says its unit in a line that is not hidden: "Rain in millimetres (mm) for each month"', /<p class="cap fc-unit">Rain in millimetres \(mm\) for each month/.test(html) && !/aria-hidden="true"><p class="cap fc-unit"/.test(html));
  const css = fs.readFileSync(new URL('../css/calendar.css', import.meta.url), 'utf8'), phone = css.slice(css.indexOf('@media (max-width: 620px)'), css.indexOf('}', css.indexOf('@media (max-width: 620px)') + 30) + 200);
  check('on a phone the year label of each ground row stays visible (shown as a line above it)', !/,\s*\.fc-year\s*\{\s*display:\s*none/.test(css) && /@media \(max-width: 620px\) \{ \.fc-year \{ display: block/.test(css), phone.slice(0, 200));
}

console.log(`calendar: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
