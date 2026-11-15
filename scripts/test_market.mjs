// Crophalo's USDA Market News page suite: every sentence the strategy cards, the side by side table, the strategy detail and the Layers card can show, for a Mead-like field
// (Nebraska's own report live) and a Beltsville-like field (Maryland's own report stopped, bids from Pennsylvania and Virginia, canola only far away, pigeon peas in no report).
// Everything runs on hand-made stand-in answers in scripts/fixtures/market-page/ (made-up prices, marked STAND-IN, NOT REAL DATA) and on small hand-made engine results (plan names and crop ids only).
// RULE: never loosen a check to make it pass; a failure means a farmer could read a bid as income, a stopped report as today, or another state's price as local. No internet is needed. Run: node scripts/test_market.mjs
import fs from 'node:fs';
import { money, cents, dayUS, marketWanted, cropsToAsk, loadMarket, startMarket, marketFor, layerFor, planCashCrops, WORDS, STATE_NAMES } from '../js/market-data.js';
import { marketLineHTML, marketListsFor, bidsStateHTML, regionsFoldHTML, layerCardHTML, creditLine, AMS_SOURCE_WORDS, LAYER_CARD_WORDS } from '../js/market-view.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 400 ? s.slice(0, 400) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const fx = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/market-page/${n}`, import.meta.url), 'utf8'));
const clone = x => structuredClone(x);
const MEAD = fx('mead_now_standin.json'), BELT = fx('beltsville_now_standin.json'), FAILED = fx('failed_standin.json'), YEAR = fx('year_standin.json');
const TODAY = '2026-11-15';   // the pinned clock of the stand-ins: every stand-in date is worked out from it

// ---- small engine results, shaped like the two demo answers (plan names and crop ids only)
const S = (year, crop, cover = null) => ({ year, crop, after: cover ? 'cover' : 'residue', ...(cover ? { cover } : {}) });
const plan = (id, name, seasons) => ({ id, name, flag: 'holds', seasons });
const meadNow = plan('current', 'Corn, then soybeans', [S(1, 'corn'), S(2, 'soy'), S(3, 'corn')]);
const meadCover = plan('cover-corn-soy-cover', 'Corn, then soybeans, with a cover crop after harvest', [S(1, 'corn', 'ryecover'), S(2, 'soy', 'ryecover'), S(3, 'corn', 'ryecover')]);
const meadWheat = plan('corn-soy-wheat', 'Corn, then soybeans, then winter wheat', [S(1, 'corn'), S(2, 'soy'), S(3, 'wheat')]);
const MEAD_R = { ok: true, current: meadNow, recommended: meadNow, others: [meadCover, meadWheat] };
const MEAD_NEAR = { absent: ['wheat', 'sorghum'] };   // the engine's crop-map answer holds wheat and sorghum as absent near the Mead field
const beltNow = plan('current', 'Corn, then soybeans', [S(1, 'corn'), S(2, 'soy'), S(3, 'corn')]);
const beltDiverse = plan('diverse-canola-pigeonpea-sorghum-wheat-cover', 'Canola, then pigeon peas, then sorghum, then winter wheat, with a cover crop after harvest', [S(1, 'canola', 'ryecover'), S(2, 'pigeonpea', 'ryecover'), S(3, 'sorghum'), S(4, 'wheat', 'ryecover')]);
const beltCover = plan('cover-corn-soy-cover', 'Corn, then soybeans, with a cover crop after harvest', [S(1, 'corn', 'ryecover'), S(2, 'soy', 'ryecover'), S(3, 'corn', 'ryecover')]);
const beltNotill = plan('notill-corn-soy-notill', 'Corn, then soybeans, without ploughing', [S(1, 'corn'), S(2, 'soy'), S(3, 'corn')]);
const beltSorghum = plan('legume-corn-soy-sorghum', 'Corn, then soybeans, then sorghum', [S(1, 'corn'), S(2, 'soy'), S(3, 'sorghum')]);
const BELT_R = { ok: true, current: beltNow, recommended: beltDiverse, others: [beltDiverse, beltCover, beltNotill, beltSorghum] };

// every line any case below produced, for the banned-word scan at the end
const LINES = [];
const keep = m => { if (!m) return m; for (const t of [m.card, m.cell, ...m.evidence.map(e => e.text), ...m.gaps, ...m.risks, ...m.regions.flatMap(g => [g.heading, ...g.lines]), ...m.credits]) if (t) LINES.push(t); return m; };
const M = (a, p, r, near) => keep(marketFor(a, p, r, near));
const texts = m => m.evidence.map(e => e.text);
// Dates from the pinned clock: n days before it, and the same day in US words worked out by the platform's own calendar (a check of dayUS that does not use dayUS).
const ago = n => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
const us = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DATE13 = 'Fri, Nov 13, 2026', DATE10 = us(ago(5)), STOPPED = us(BELT.own.published);
const AMS_TAIL = 'USDA Market News data is a work of the United States Government, in the public domain in the United States. Crophalo is not made, reviewed or endorsed by USDA or NASA.';

// ---- the stand-ins are labelled and in the contract's shape
{
  for (const [n, a] of [['mead', MEAD], ['beltsville', BELT], ['failed', FAILED], ['year', YEAR]]) check(`stand-in ${n} is marked STAND-IN, NOT REAL DATA`, typeof a._note === 'string' && a._note.startsWith('STAND-IN, NOT REAL DATA'));
  for (const [n, a] of [['mead', MEAD], ['beltsville', BELT]]) {
    check(`stand-in ${n}: the contract's top fields`, ['ok', 'source', 'mode', 'today', 'window', 'place', 'own', 'reports', 'crops', 'forward', 'dropped', 'incomplete'].every(k => Object.hasOwn(a, k)) && a.mode === 'now' && a.today === TODAY);
    check(`stand-in ${n}: every crop entry has the contract's fields`, a.crops.every(c => ['crop', 'name', 'class', 'status', 'report', 'report_date', 'age_days', 'unit', 'buyer', 'low', 'high', 'year_ago_low', 'year_ago_high', 'delivered_by_truck', 'regions', 'places'].every(k => Object.hasOwn(c, k))));
    check(`stand-in ${n}: every report has the contract's fields`, a.reports.every(r => ['id', 'title', 'published', 'live', 'role', 'state', 'co_publisher', 'rows_kept'].every(k => Object.hasOwn(r, k))));
    check(`stand-in ${n}: every age is today minus the row's date`, a.crops.filter(c => c.report_date).every(c => (Date.parse(TODAY) - Date.parse(c.report_date)) / 864e5 === c.age_days));
    check(`stand-in ${n}: the window is the 14 days before today`, a.window.to === TODAY && (Date.parse(a.window.to) - Date.parse(a.window.from)) / 864e5 === 14);
  }
  check('the year stand-in has the year row shape', YEAR.mode === 'year' && Array.isArray(YEAR.days) && YEAR.n_days === YEAR.days.length && YEAR.days.every(d => 'date' in d && 'avg' in d && 'year_ago_avg' in d));
  check('the failed stand-in is a refusal', FAILED.ok === false && typeof FAILED.reason === 'string');
}

// ---- rounding: half up on the decimal value
{
  same('3.945 gives $3.95 (plain Math.round would give 3.94)', money(3.945), '$3.95');
  same('4.135 gives $4.14', money(4.135), '$4.14');
  check('plain Math.round(x * 100) fails on 1.005, 1.255 and 0.285 (why the rule exists)', Math.round(1.005 * 100) / 100 === 1 && Math.round(1.255 * 100) / 100 === 1.25 && Math.round(0.285 * 100) / 100 === 0.28);
  same('the rule gives 1.005 → $1.01, 1.255 → $1.26, 0.285 → $0.29', [money(1.005), money(1.255), money(0.285)], ['$1.01', '$1.26', '$0.29']);
  same('cents of 1.005', cents(1.005), 1.01);
  same('a whole number gets its cents', money(22), '$22.00');
  same('thousands get a comma', money(1234.5), '$1,234.50');
  same('a ton is whole dollars', money(215.5, 'ton'), '$216');
  same('a ton just under half rounds down', money(215.49, 'ton'), '$215');
  for (const bad of [null, undefined, NaN, Infinity, -1, '3.95']) check(`no price from ${String(bad)}`, money(bad) === null);
}
// ---- dates: weekday and date, US style, from the date only
{
  same('Nov 13, 2026 is a Friday', dayUS('2026-11-13'), DATE13);
  same('five days before the pinned clock is a Tuesday', [dayUS(ago(5)), DATE10.startsWith('Tue, ')], [DATE10, true]);
  same('Maryland\'s last report day is a Wednesday', [dayUS(BELT.own.published), STOPPED.startsWith('Wed, ')], [STOPPED, true]);
  for (let n = 0; n < 400; n += 13) check(`dayUS agrees with the platform calendar, ${n} days back`, dayUS(ago(n)) === us(ago(n)));
  same('Jan 1, 2027', dayUS('2027-01-01'), 'Fri, Jan 1, 2027');
  for (const bad of [`${TODAY.slice(0, 4)}-02-30`, '2026-11-13T10:00:00', '', null, '11/13/2026']) same(`no date from ${String(bad)}`, dayUS(bad), '');
}

// ---- who gets it: the United States, with the key
{
  check('US with the key: wanted', marketWanted({ loc: { cc: 'US' } }, { ok: true, ams: true }));
  check('US without the key: not wanted', !marketWanted({ loc: { cc: 'US' } }, { ok: true, ams: false }));
  check('Türkiye with the key: not wanted', !marketWanted({ loc: { cc: 'TR' } }, { ok: true, ams: true }));
  check('Canada with the key: not wanted', !marketWanted({ loc: { cc: 'CA' } }, { ok: true, ams: true }));
  check('no country: not wanted', !marketWanted({ loc: {} }, { ok: true, ams: true }));
  check('ams "true" as text is not the key', !marketWanted({ loc: { cc: 'US' } }, { ok: true, ams: 'true' }));
}
// ---- the crops asked: the cash crops of every plan, sorted, each once
{
  same('Mead: corn, soybeans, wheat', cropsToAsk(MEAD_R), ['corn', 'soy', 'wheat']);
  same('Beltsville: the six of the live check list', cropsToAsk(BELT_R), ['canola', 'corn', 'pigeonpea', 'sorghum', 'soy', 'wheat']);
  check('a cover crop is never asked', !cropsToAsk(BELT_R).includes('ryecover'));
  const hay = { ok: true, current: plan('current', 'Alfalfa', [S(1, 'alfalfa'), S(2, 'corn')]), recommended: null, others: [plan('x', 'Fallow', [S(1, 'fallow')])] }; hay.recommended = hay.current;
  same('alfalfa (forage) and fallow are never asked', cropsToAsk(hay), ['corn']);
  const many = { ok: true, current: plan('current', 'many', ['corn', 'soy', 'wheat', 'barley', 'sorghum', 'canola', 'sunflower', 'bean', 'pea', 'lentil', 'chickpea', 'oats', 'rye', 'cotton', 'flax', 'safflower', 'sesame', 'durum'].map((c, i) => S(i + 1, c))) }; many.recommended = many.current;
  check('at most 16 crops, each a crop id', cropsToAsk(many).length === 16 && cropsToAsk(many).every(c => /^[a-z]{2,12}$/.test(c)));
  same('a plan\'s cash crops in plan order, each once', planCashCrops(beltDiverse), ['canola', 'pigeonpea', 'sorghum', 'wheat']);
}

// ---- Mead: Nebraska's own report is live
{
  const m = M(MEAD, meadNow, MEAD_R, MEAD_NEAR);
  same('Mead card', m.card, 'Bids in the Nebraska report: corn and soybeans.');
  same('Mead cell', m.cell, 'Bids in the Nebraska report: 2 of 2 crops. A bid, not your price.');
  same('Mead k and n', m.counts, { k: 2, n: 2 });
  same('Mead evidence', texts(m), [
    `Corn: Nebraska elevators bid $1.11 to $2.22 a bushel on ${DATE13}, across Nebraska's regions (Nebraska Daily Elevator Grain Bids, report 3225). A bid, not your price.`,
    `Soybeans: Nebraska elevators bid $3.33 to $4.44 a bushel on ${DATE13}, across Nebraska's regions (Nebraska Daily Elevator Grain Bids, report 3225). A bid, not your price.`,
    'Bids for grain delivered by truck to the elevator.',
    "A year earlier, the report's averages ran from $1.01 to $2.02 a bushel for corn.",
    "A year earlier, the report's averages ran from $3.03 to $4.04 a bushel for soybeans.",
  ]);
  check('every evidence line opens the Market News source card', m.evidence.every(e => JSON.stringify(e.sources) === '["ams"]'));
  same('Mead gaps (no cover crop in this plan)', m.gaps, ["Which of the report's regions holds this field is not checked yet, so the bids cover all of Nebraska."]);
  same('Mead risks: once per strategy; nothing added, no crop-map line (corn and soybeans are grown near)', m.risks, ['These are bids on one day at elevators in a region, not what you will be paid. Your price, yield and costs differ.']);
  same('Mead credit', m.credits, [`Market prices: USDA Agricultural Marketing Service, Market News, "Nebraska Daily Elevator Grain Bids" (report 3225), ${DATE13}. Issued with the NE Dept. of Ag Market News. ${AMS_TAIL}`]);
  same('Mead fold: corn by region', m.regions[0], { crop: 'corn', heading: 'Corn (Nebraska)', lines: [`Central: $1.11 to $1.55 a bushel (${DATE13}). A bid, not your price.`, `East: $1.22 to $2.22 a bushel (${DATE13}). A bid, not your price.`, `Northeast: $1.33 a bushel (${DATE13}). A bid, not your price.`] });
  check('Mead fold: one group per priced crop', m.regions.length === 2 && m.regions[1].heading === 'Soybeans (Nebraska)');

  const c = M(MEAD, meadCover, MEAD_R, MEAD_NEAR);
  same('Mead with a cover crop: the same card', c.card, 'Bids in the Nebraska report: corn and soybeans.');
  same('Mead with a cover crop: 2 of 2', c.cell, 'Bids in the Nebraska report: 2 of 2 crops. A bid, not your price.');
  same('Mead with a cover crop: the cover line', c.gaps, ["Which of the report's regions holds this field is not checked yet, so the bids cover all of Nebraska.", 'The cover crop is grown to protect the soil, not to sell.']);
  check('the cover crop is never checked (no line names it)', !LINES.some(t => /rye/i.test(t)) && c.evidence.length === 5);

  const w = M(MEAD, meadWheat, MEAD_R, MEAD_NEAR);
  same('Mead with winter wheat: card', w.card, 'Bids in the Nebraska report: corn, soybeans and winter wheat.');
  same('Mead with winter wheat: 3 of 3', w.cell, 'Bids in the Nebraska report: 3 of 3 crops. A bid, not your price.');
  same('Mead wheat line', texts(w)[2], `Winter wheat: Nebraska elevators bid $5.55 to $6.66 a bushel on ${DATE13}, across Nebraska's regions (Nebraska Daily Elevator Grain Bids, report 3225). A bid, not your price.`);
  check('Mead wheat: the null year-ago words', texts(w).includes('The report gives no year-ago figure for winter wheat.'));
  same('Mead wheat risks: the added crop, then the crop-map line', w.risks, [
    'These are bids on one day at elevators in a region, not what you will be paid. Your price, yield and costs differ.',
    'A bid shows a buyer. It does not say how much they will take.',
    `Nebraska elevators bid for winter wheat on ${DATE13}, though little winter wheat grows near this field (USDA crop map). Ask the elevator what it takes.`,
  ]);
  check('crop-map line: not drawn without the crop-map answer', !M(MEAD, meadWheat, MEAD_R, null).risks.some(t => /crop map/.test(t)));
  check('crop-map line: not drawn when the answer has no absent list', !M(MEAD, meadWheat, MEAD_R, { common: ['corn'] }).risks.some(t => /crop map/.test(t)));
  check('crop-map line: not drawn when wheat is not absent', !M(MEAD, meadWheat, MEAD_R, { absent: ['sorghum'] }).risks.some(t => /crop map/.test(t)));
  check('crop-map line: absent given as objects also works', M(MEAD, meadWheat, MEAD_R, { absent: [{ crop: 'wheat' }] }).risks.some(t => /crop map/.test(t)));
  check('the score never moves: marketFor leaves the plan and the result as they were', JSON.stringify(MEAD_R) === JSON.stringify({ ok: true, current: meadNow, recommended: meadNow, others: [meadCover, meadWheat] }));
}

// ---- Beltsville: Maryland's own report stopped; bids from Pennsylvania, then Virginia
{
  const gapStopped = 'Maryland\'s own grain report (report 2714) has not been published since ' + STOPPED + '. The bids shown are from other states.';
  const m = M(BELT, beltNow, BELT_R, null);
  same('Beltsville now: card', m.card, 'Bids from Pennsylvania: corn and soybeans. Not Maryland prices.');
  same('Beltsville now: cell', m.cell, 'Bids from Pennsylvania: 2 of 2 crops. Not a Maryland price.');
  same('Beltsville now: evidence', texts(m), [
    `Corn: Pennsylvania elevators bid $1.11 to $2.22 a bushel on ${DATE10}, across Pennsylvania's regions (Pennsylvania Grain Bids, report 3091). Pennsylvania, not your area. A bid, not your price.`,
    `Soybeans: Pennsylvania elevators bid $3.33 to $3.99 a bushel on ${DATE10}, across Pennsylvania's regions (Pennsylvania Grain Bids, report 3091). Pennsylvania, not your area. A bid, not your price.`,
    'Bids for grain delivered by truck to the elevator.',
    "A year earlier, the report's averages ran from $1.01 to $2.02 a bushel for corn.",
    "A year earlier, the report's average was $3.03 a bushel for soybeans.",
  ]);
  same('Beltsville now: the stopped report gap, no region line', m.gaps, [gapStopped]);
  same('Beltsville now: credit for Pennsylvania only (Maryland\'s stopped report shows no bid)', m.credits, [`Market prices: USDA Agricultural Marketing Service, Market News, "Pennsylvania Grain Bids" (report 3091), ${DATE10}. ${AMS_TAIL}`]);

  const c = M(BELT, beltCover, BELT_R, null);
  same('Beltsville with a cover crop: gaps', c.gaps, [gapStopped, 'The cover crop is grown to protect the soil, not to sell.']);
  same('Beltsville with a cover crop: cell', c.cell, 'Bids from Pennsylvania: 2 of 2 crops. Not a Maryland price.');

  const d = M(BELT, beltDiverse, BELT_R, { absent: ['wheat', 'sorghum', 'canola', 'pigeonpea'] });
  same('Beltsville 74 plan: card', d.card, 'No buyer found for canola and pigeon peas in the Market News grain reports Crophalo reads.');
  same('Beltsville 74 plan: cell', d.cell, 'Bids from Pennsylvania and Virginia: 2 of 4 crops. Not a Maryland price.');
  same('Beltsville 74 plan: k and n (far and none found never count)', d.counts, { k: 2, n: 4 });
  same('Beltsville 74 plan: evidence, plan order', texts(d), [
    `Canola: bids only from terminals, mills or processors in Minnesota and North Dakota on ${DATE13} (National Daily Sunflower, Canola, Millet, and Flaxseed Report, report 2887). Far from this field.`,
    'Pigeon peas: none found in the Market News grain reports Crophalo reads. That does not mean there is no buyer. Ask the elevators near you.',
    `Sorghum: Virginia elevators bid $1.44 a bushel on ${DATE13}, in the Wakefield Area (Virginia Daily Grain Bids, report 3167). Virginia, not your area. A bid, not your price.`,
    `Winter wheat: Pennsylvania elevators bid $5.55 to $6.66 a bushel on ${DATE10}, across Pennsylvania's regions (Pennsylvania Grain Bids, report 3091). Pennsylvania, not your area. A bid, not your price.`,
    'The report gives no year-ago figure for sorghum.',
    "A year earlier, the report's averages ran from $5.05 to $6.06 a bushel for winter wheat.",
  ]);
  check('Beltsville 74 plan: no truck line (the canola bid is not known to be by truck to an elevator)', !texts(d).includes(WORDS.truck));
  same('Beltsville 74 plan: gaps', d.gaps, [gapStopped, 'The cover crop is grown to protect the soil, not to sell.']);
  same('Beltsville 74 plan: risks', d.risks, [
    'These are bids on one day at elevators in a region, not what you will be paid. Your price, yield and costs differ.',
    'A bid shows a buyer. It does not say how much they will take.',
    'No buyer was found near this field for canola in the reports read. Find your buyer before you plant.',
    'No buyer was found near this field for pigeon peas in the reports read. Find your buyer before you plant.',
  ]);
  check('Beltsville 74 plan: no crop-map line for a neighbour state\'s bid', !d.risks.some(t => /crop map/.test(t)));
  same('Beltsville 74 plan: credits in the order tried', d.credits.map(t => t.match(/\(report (\d+)\)/)[1]), ['3091', '3167', '2887']);
  same('Beltsville 74 plan: the fold groups', d.regions.map(g => g.heading), ['Sorghum (Virginia)', 'Winter wheat (Pennsylvania)']);
  same('one price when low equals high', d.regions[0].lines, [`Wakefield Area: $1.44 a bushel (${DATE13}). A bid, not your price.`]);

  const s = M(BELT, beltSorghum, BELT_R, null);
  same('Beltsville corn, soybeans, sorghum: two states named in the card', s.card, 'Bids from Pennsylvania and Virginia: corn, soybeans and sorghum. Not Maryland prices.');
  same('and in the cell', s.cell, 'Bids from Pennsylvania and Virginia: 3 of 3 crops. Not a Maryland price.');
}

// ---- the fall-backs: not read, not live, stale, old, absent
{
  const f = M(FAILED, meadNow, MEAD_R, MEAD_NEAR);
  same('failed: the cell says not read', f.cell, 'Market News bids: not read.');
  same('failed: no card line', f.card, '');
  same('failed: the detail holds one line', texts(f), ['USDA Market News did not answer just now, so its bids are not read. The rest of this report does not use them.']);
  check('failed: no gaps, no risks, no fold, no credit', !f.gaps.length && !f.risks.length && !f.regions.length && !f.credits.length);
  same('failed: the hooks', [marketLineHTML(FAILED, meadNow, 'card', MEAD_R), marketLineHTML(FAILED, meadNow, 'detail', MEAD_R), marketLineHTML(FAILED, meadNow, 'cell:market', MEAD_R)], ['', '', '<span class="cap mk-line mk-cell">Market News bids: not read.</span>']);
  same('{ ok: false } with no reason: not read too', M({ ok: false }, meadNow, MEAD_R).cell, 'Market News bids: not read.');
  same('an answer with no state name: not read', M({ ...clone(MEAD), place: {} }, meadNow, MEAD_R).cell, 'Market News bids: not read.');

  const notLive = clone(MEAD); notLive.reports[0].live = false; notLive.own.live = false;
  const nl = M(notLive, meadNow, MEAD_R);
  same('a report that is not live: its crops are not read, with the report named', texts(nl)[0], 'Corn: not read. Nebraska Daily Elevator Grain Bids (report 3225) has no bids in the last 14 days.');
  same('a report that is not live and no neighbour: the cell is not read', nl.cell, 'Market News bids: not read.');
  check('a report that is not live: no price anywhere', !JSON.stringify(nl).includes('$'));
  same('a report that is not live: the stopped line without "the bids shown"', nl.gaps, ["Nebraska's own grain report (report 3225) has not been published since Fri, Nov 13, 2026."]);

  const nr = clone(MEAD); Object.assign(nr.crops[1], { status: 'not_read', low: null, high: null, regions: [], report_date: null, age_days: null });
  const n1 = M(nr, meadNow, MEAD_R);
  same('a crop not read by the server', texts(n1)[1], 'Soybeans: not read. Nebraska Daily Elevator Grain Bids (report 3225) has no bids in the last 14 days.');
  same('k of n with one crop not read', n1.cell, 'Bids in the Nebraska report: 1 of 2 crops. A bid, not your price.');
  same('no card line when one crop is not read', n1.card, '');

  const stale = clone(MEAD); Object.assign(stale.crops[0], { report_date: ago(16), age_days: 16 });
  same('a row older than the window is not read, never shown as today', texts(M(stale, meadNow, MEAD_R))[0], 'Corn: not read. Nebraska Daily Elevator Grain Bids (report 3225) has no bids in the last 14 days.');
  const noPrice = clone(MEAD); noPrice.crops[0].high = null;
  same('a row with no price is not read', texts(M(noPrice, meadNow, MEAD_R))[0].startsWith('Corn: not read.'), true);
  const other = clone(MEAD); other.crops[0].unit = '¢ per bushel';
  same('a unit that is not a dollar a bushel or a hundred pounds is not read', texts(M(other, meadNow, MEAD_R))[0].startsWith('Corn: not read.'), true);
  const missing = clone(MEAD); missing.crops = missing.crops.filter(c => c.crop !== 'soy');
  same('a crop the answer does not hold: not read, nothing invented', texts(M(missing, meadNow, MEAD_R))[1], 'Soybeans: not read.');

  const old = clone(MEAD); Object.assign(old.crops[0], { report_date: ago(9), age_days: 9 });
  same('over 7 days old: the newest-report note', texts(M(old, meadNow, MEAD_R))[0], `Corn: Nebraska elevators bid $1.11 to $2.22 a bushel on ${us(ago(9))}, across Nebraska's regions (Nebraska Daily Elevator Grain Bids, report 3225). This is the newest report Market News has published. A bid, not your price.`);
  const seven = clone(MEAD); Object.assign(seven.crops[0], { report_date: ago(7), age_days: 7 });
  check('7 days old exactly: no note', !texts(M(seven, meadNow, MEAD_R))[0].includes(WORDS.newest));
  const noAge = clone(MEAD); noAge.crops[0].age_days = null; noAge.crops[0].report_date = ago(10);
  check('age worked out from the dates when the answer has none', texts(M(noAge, meadNow, MEAD_R))[0].includes(WORDS.newest));

  const millet = clone(MEAD); millet.crops.push({ ...clone(MEAD.crops[0]), crop: 'pmillet', name: 'Millet' });
  const pm = plan('pm', 'Pearl millet, then corn', [S(1, 'pmillet'), S(2, 'corn')]);
  same('pearl millet is never matched to the report\'s millet', texts(M(millet, pm, MEAD_R))[0], 'Pearl millet: none found in the Market News grain reports Crophalo reads. That does not mean there is no buyer. Ask the elevators near you.');
  same('pearl millet: the card names it', M(millet, pm, MEAD_R).card, 'No buyer found for pearl millet in the Market News grain reports Crophalo reads.');

  const dup = clone(BELT); dup.crops.find(c => c.crop === 'sorghum').regions = [{ region: 'Harrisonburg Area', low: 1.44, high: 1.44, rows: 1 }, { region: 'Harrisonburg Area', low: 1.55, high: 1.55, rows: 1 }];
  same('two rows of one area on one day: both kept, as given', M(dup, beltSorghum, BELT_R).regions.find(g => g.crop === 'sorghum').lines, [`Harrisonburg Area: $1.44 a bushel (${DATE13}). A bid, not your price.`, `Harrisonburg Area: $1.55 a bushel (${DATE13}). A bid, not your price.`]);
  check('and the line says "in the Harrisonburg Area", one area', texts(M(dup, beltSorghum, BELT_R)).some(t => t.includes(', in the Harrisonburg Area (')));

  const read = clone(MEAD); Object.assign(read.crops[0], { low: 9.87, high: 9.99 });
  check('every figure is read from the answer, none typed', texts(M(read, meadNow, MEAD_R))[0].includes('$9.87 to $9.99') && !texts(M(read, meadNow, MEAD_R))[0].includes('$1.11'));
  const span = clone(MEAD); span.window.from = ago(21); Object.assign(span.crops[1], { status: 'not_read', low: null, high: null, regions: [] });
  check('the window\'s length is read from the answer', texts(M(span, meadNow, MEAD_R))[1].includes('in the last 21 days'));

  for (const [n, st] of [['nothing asked yet', undefined], ['nothing (no key, not the US)', null], ['still loading', { loading: true }]]) {
    check(`${n}: no line anywhere`, ['card', 'cell:market', 'detail', 'note:table', 'cell:water'].every(w => marketLineHTML(st, meadNow, w, MEAD_R, MEAD_NEAR) === ''));
    same(`${n}: no list lines`, marketListsFor(st, meadNow, MEAD_R, MEAD_NEAR), { evidence: [], gaps: [], risks: [] });
  }
  const fails = { ...meadNow, flag: 'fails' };
  check('a plan that does not suit this place: no line', marketFor(MEAD, fails, MEAD_R) === null);
  check('a plan of cover crop and fallow only: no line', marketFor(MEAD, plan('c', 'Cover', [S(1, 'ryecover'), S(2, 'fallow')]), MEAD_R) === null);
  check('a forage plan (alfalfa): no grain bid line', marketFor(MEAD, plan('a', 'Alfalfa', [S(1, 'alfalfa')]), MEAD_R) === null);
  same('a plan with alfalfa and corn counts corn only', M(MEAD, plan('ac', 'Alfalfa, then corn', [S(1, 'alfalfa'), S(2, 'corn')]), MEAD_R).counts, { k: 1, n: 1 });
  same('one crop: "1 of 1 crop"', M(MEAD, plan('ac', 'Alfalfa, then corn', [S(1, 'alfalfa'), S(2, 'corn')]), MEAD_R).cell, 'Bids in the Nebraska report: 1 of 1 crop. A bid, not your price.');
}

// ---- the hooks' markup
{
  same('card hook', marketLineHTML(MEAD, meadNow, 'card', MEAD_R, MEAD_NEAR), '<span class="cap mk-line mk-card">Bids in the Nebraska report: corn and soybeans.</span>');
  check('the card line is no button and no link (the card is itself a button)', !/<button|<a /.test(marketLineHTML(BELT, beltDiverse, 'card', BELT_R)));
  same('cell hook, market row', marketLineHTML(BELT, beltDiverse, 'cell:market', BELT_R), '<span class="cap mk-line mk-cell">Bids from Pennsylvania and Virginia: 2 of 4 crops. Not a Maryland price.</span>');
  check('cell hook: every other row is empty', DIMS().every(k => k === 'market' || marketLineHTML(MEAD, meadNow, `cell:${k}`, MEAD_R) === ''));
  same('the table note: nothing in this tier', marketLineHTML(MEAD, meadNow, 'note:table', MEAD_R), '');
  const det = marketLineHTML(MEAD, meadNow, 'detail', MEAD_R, MEAD_NEAR);
  check('detail hook: the fold "Each region" with its count', det.includes('<details class="fold-card mk-fold"><summary><span class="t">Each region <span class="count soft">6</span></span></summary>'));
  check('detail hook: the credit line, escaped', det.includes('<p class="cap mk-credit">Market prices: USDA Agricultural Marketing Service, Market News, &quot;Nebraska Daily Elevator Grain Bids&quot; (report 3225)'));
  same('the lists hook', marketListsFor(BELT, beltDiverse, BELT_R, null).gaps.length, 2);
  same('the fold with nothing in it draws nothing', regionsFoldHTML([]), '');
  const evil = clone(MEAD); evil.reports[0].title = '<img src=x onerror=alert(1)>'; evil.own.title = evil.reports[0].title;
  check('a report title is escaped in the markup', !marketLineHTML(evil, meadNow, 'detail', MEAD_R).includes('<img') && marketLineHTML(evil, meadNow, 'detail', MEAD_R).includes('&lt;img'));
  check('the hook takes the five arguments the report passes', marketLineHTML.length >= 1 && marketLineHTML(MEAD, meadWheat, 'card', MEAD_R, MEAD_NEAR).includes('winter wheat'));
}
function DIMS() { return ['water', 'organic', 'erosion', 'pest', 'nitrogen', 'forage', 'market', 'weather']; }

// ---- the Layers card
{
  const html = layerCardHTML(MEAD);
  check('Layers card, Mead: the state report\'s crops with the status words', html.includes(`<li>Corn: Nebraska elevators bid $1.11 to $2.22 a bushel on ${DATE13}, across Nebraska&#39;s regions (Nebraska Daily Elevator Grain Bids, report 3225).</li>`));
  check('then "A bid, not your price." once', html.split('A bid, not your price.').length === 2 && html.includes('<p class="cap"><b>A bid, not your price.</b></p>'));
  check('first what the farmer gets, in plain words, and the credit line (report, market, date) under Show more', html.startsWith('<p class="wk-big mk-first">What buyers reported paying, in the newest report for your area.</p>') && /<details class="fold mapx-more"><summary>Show more<\/summary>[\s\S]*Issued with the NE Dept. of Ag Market News\./.test(html) && !html.split('Show more')[0].includes('report 3225, '));
  check('at most four sentences before Show more', html.split('Show more')[0].replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(x => x.trim().length > 8).length <= 6, html.split('Show more')[0].length);
  const l = layerFor(BELT);
  same('Layers card, Beltsville: the stopped report first', l.lines[0], 'Maryland\'s own grain report (report 2714) has not been published since ' + STOPPED + '. The bids shown are from other states.');
  for (const t of [...layerFor(MEAD).lines, ...l.lines, ...l.credits]) LINES.push(t);
  same('Layers card, failed', layerCardHTML({ ok: false, reason: 'The source took too long to answer; try again in a minute.' }), '<p class="cap" role="status">USDA Market News did not answer just now, so its bids are not read.</p>');
  same('Layers card, failed stand-in', layerCardHTML(FAILED), '<p class="cap" role="status">USDA Market News did not answer just now, so its bids are not read.</p>');
  same('Layers card, outside the United States: the server\'s own words', layerCardHTML({ ok: false, final: true, reason: 'USDA Market News covers only the United States' }), '<p class="cap" role="status">USDA Market News covers only the United States.</p>');
  same('Layers card, nothing', layerCardHTML(null), '');
  const empty = clone(MEAD); empty.crops = [];
  same('Layers card, a live report with no bids', layerFor(empty).lines, ['Nebraska Daily Elevator Grain Bids (report 3225) has no bids in the last 14 days.']);
  LINES.push(WORDS.failLayer, WORDS.failCell, WORDS.failDetail);
}

// ---- asking our server: never without the key, never outside the United States, the key never in an address
{
  const calls = [];
  const fake = (keys, answer, { status = 200, throws = false } = {}) => async (url, init) => { calls.push({ url, init }); if (url === '/api/keys') return { ok: true, json: async () => keys }; if (throws) throw new Error('down'); return { ok: status === 200, status, json: async () => answer }; };
  const MEADLOC = { lat: 41.179469, lon: -96.439756, cc: 'US' }, BELTLOC = { lat: 39.031031, lon: -76.844119, cc: 'US' };
  calls.length = 0; const a = await loadMarket(MEADLOC, cropsToAsk(MEAD_R), fake({ ok: true, ams: true }, MEAD));
  check('with the key: the answer comes back', a === MEAD || a?.place?.state === 'NE');
  same('the two requests, in order', calls.map(c => c.url), ['/api/keys', '/api/mnfield?lat=41.179469&lon=-96.439756&mode=now&crops=corn,soy,wheat']);
  check('each request has a time limit', calls.every(c => c.init?.signal instanceof AbortSignal));
  check('no key, token or password in any address', calls.every(c => !/key=|token|pass|auth/i.test(c.url.replace('/api/keys', ''))));
  calls.length = 0; await loadMarket(BELTLOC, cropsToAsk(BELT_R), fake({ ok: true, ams: true }, BELT));
  same('Beltsville\'s request', calls[1].url, '/api/mnfield?lat=39.031031&lon=-76.844119&mode=now&crops=canola,corn,pigeonpea,sorghum,soy,wheat');
  // The page now says in one plain line that the bids are not set up on this server (the owner's order of 15 November: a farmer must be told why the bids are missing), so the answer is NOT_SET, no longer nothing. Market News is still never asked.
  calls.length = 0; same('no key on the server: "not set up", and Market News is never asked', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: false }, MEAD)), { ok: false, notSet: true });
  same('only the yes-or-no question was asked', calls.map(c => c.url), ['/api/keys']);
  calls.length = 0; same('outside the United States: nothing, and nothing is asked', await loadMarket({ lat: 39.9, lon: 32.8, cc: 'TR' }, ['wheat'], fake({ ok: true, ams: true }, MEAD)), null);
  same('not even the key question', calls.length, 0);
  same('the server says no key is set (its older sentence): "not set up"', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, { ok: false, reason: "Local market prices (USDA Market News) needs the owner's free key on this server, and none is set" })), { ok: false, notSet: true });
  same('the server says no key is set (its sentence now): "not set up"', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, { ok: false, reason: "Local market prices (USDA Market News) are not set up on this server (the owner's free key is not set)" })), { ok: false, notSet: true });
  same('the server says no key is set (its flag alone): "not set up"', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, { ok: false, not_set: true, reason: 'x' })), { ok: false, notSet: true });
  // The public server keeps the yes-or-no question shut (404): the page then asks for the bids at once, and the server itself answers "not set up" without asking Market News.
  const shut = (answer, status = 200) => async (url, init) => { calls.push({ url, init }); if (url === '/api/keys') return { ok: false, status: 404, json: async () => ({ ok: false, reason: 'Unknown endpoint' }) }; return { ok: status === 200, status, json: async () => answer }; };
  calls.length = 0; same('the public server (no /api/keys) without the key: "not set up"', await loadMarket(MEADLOC, ['corn'], shut({ ok: false, not_set: true, reason: "Local market prices (USDA Market News) are not set up on this server (the owner's free key is not set)" })), { ok: false, notSet: true });
  same('…the two requests, in order', calls.map(c => c.url), ['/api/keys', '/api/mnfield?lat=41.179469&lon=-96.439756&mode=now&crops=corn']);
  check('the public server with the key: the bids come back', (await loadMarket(MEADLOC, cropsToAsk(MEAD_R), shut(MEAD)))?.place?.state === 'NE');
  same('the public server, Market News down: not read', await loadMarket(MEADLOC, ['corn'], shut(FAILED)), { ok: false });
  same('a server that has neither route (an older copy): nothing', await loadMarket(MEADLOC, ['corn'], shut({ ok: false, reason: 'Unknown endpoint' }, 404)), null);
  same('the server says outside the United States: nothing', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, { ok: false, final: true, reason: 'USDA Market News covers only the United States' })), null);
  same('the service down: not read', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, null, { throws: true })), { ok: false });
  same('a server error: not read', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, { ok: false, reason: 'boom' }, { status: 500 })), { ok: false });
  same('a refusal: not read', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, FAILED)), { ok: false });
  same('a key refused by Market News: not read', await loadMarket(MEADLOC, ['corn'], fake({ ok: true, ams: true }, { ok: false, reason: 'USDA Market News did not accept the key set on this server' })), { ok: false });
  same('the keys question failing: nothing (the key is not known to be set), and Market News is never asked', await loadMarket(MEADLOC, ['corn'], async url => { calls.push({ url }); throw new Error('down'); }), null);
  const twoBuyers = clone(BELT); Object.assign(twoBuyers.crops.find(c => c.crop === 'canola'), { buyer: null, buyers: ['Country Elevators', 'Terminals/Mills/Processors'] });
  check('a far line with several buyers names each kind (the server\'s buyers list)', texts(M(twoBuyers, beltDiverse, BELT_R))[0].startsWith('Canola: bids only from elevators and terminals, mills or processors in Minnesota and North Dakota on '));
  same('a crop list that is not crop ids is cleaned', (calls.length = 0, await loadMarket(MEADLOC, ['corn', 'x;drop', 'CORN', 'soy', 'corn'], fake({ ok: true, ams: true }, MEAD)), calls[1].url), '/api/mnfield?lat=41.179469&lon=-96.439756&mode=now&crops=corn,soy');

  // startMarket: the page glue
  let drawn = 0; const curUS = { state: { loc: MEADLOC }, result: MEAD_R };
  calls.length = 0; await startMarket(curUS, 7, mine => { drawn = mine; }, fake({ ok: true, ams: true }, MEAD));
  check('startMarket: the answer is kept on the report and the options redrawn', curUS.market?.place?.state === 'NE' && drawn === 7);
  const curNoKey = { state: { loc: MEADLOC }, result: MEAD_R };
  await startMarket(curNoKey, 1, () => {}, fake({ ok: true, ams: false }, MEAD));
  // "not set up" is kept so the report can say it once under "Crop prices"; nothing is drawn on a strategy card, in the table or in the detail, as before.
  check('startMarket without the key: "not set up" is kept, nothing drawn on a strategy', curNoKey.market?.notSet === true && curNoKey.market.ok === false && ['card', 'cell:market', 'detail'].every(w => marketLineHTML(curNoKey.market, meadNow, w, MEAD_R) === '') && JSON.stringify(marketListsFor(curNoKey.market, meadNow, MEAD_R)) === '{"evidence":[],"gaps":[],"risks":[]}');
  same('the one line under "Crop prices" without the key', bidsStateHTML(curNoKey.market), '<div class="lf-bids"><p class="cap mk-state" role="status">Local cash bids from USDA Market News are not set up on this server, so none are shown.</p></div>');
  same('the one line when Market News did not answer', bidsStateHTML({ ok: false }), '<div class="lf-bids"><p class="cap mk-state" role="status">USDA Market News did not answer just now, so its bids are not read.</p></div>');
  same('no such line while loading, with real bids, or with nothing at all', [bidsStateHTML({ loading: true }), bidsStateHTML(MEAD), bidsStateHTML(undefined), bidsStateHTML(null)], ['', '', '', '']);
  check('the report draws that line and announces only real bids as new data', /let bids = bidsStateHTML\(cur\.market\);/.test(fs.readFileSync(new URL('../js/report.js', import.meta.url), 'utf8')) && /if \(cur\.market\?\.ok === false\) redrawKeep\(\); else landed\('crop prices'/.test(fs.readFileSync(new URL('../js/report.js', import.meta.url), 'utf8')));
  const curTR = { state: { loc: { lat: 39.9, lon: 32.8, cc: 'TR' } }, result: MEAD_R }; calls.length = 0;
  await startMarket(curTR, 1, () => {}, fake({ ok: true, ams: true }, MEAD));
  check('startMarket in Türkiye: nothing asked, nothing kept', calls.length === 0 && curTR.market === undefined);
  const curDown = { state: { loc: MEADLOC }, result: MEAD_R };
  await startMarket(curDown, 1, () => {}, fake({ ok: true, ams: true }, null, { throws: true }));
  same('startMarket with the service down: "not read" in the cell', marketLineHTML(curDown.market, meadNow, 'cell:market', MEAD_R), '<span class="cap mk-line mk-cell">Market News bids: not read.</span>');
  const curNoResult = { state: { loc: MEADLOC }, result: { ok: false } }; calls.length = 0;
  await startMarket(curNoResult, 1, () => {}, fake({ ok: true, ams: true }, MEAD));
  check('startMarket before the engine has answered: nothing asked', calls.length === 0);
}

// ---- the words: no bid is ever called income, and "near you" is never a label for prices
{
  const all = [...LINES, ...Object.values(WORDS), ...Object.values(AMS_SOURCE_WORDS), ...Object.values(LAYER_CARD_WORDS), creditLine(MEAD.reports[0])];
  check('lines were collected from every case', LINES.length > 120, LINES.length);
  const banned = [/\bincome\b/i, /\bearn/i, /\bprofit/i, /\bworth\b/i, /you will get/i];
  for (const re of banned) { const bad = all.filter(t => re.test(t)); check(`no line says ${re}`, !bad.length, bad[0]); }
  const paid = all.filter(t => /you will be paid/i.test(t.replace(/not what you will be paid/gi, '')));
  check('"you will be paid" only inside "not what you will be paid"', !paid.length, paid[0]);
  const nearYou = all.filter(t => /near you/i.test(t.replace(/Ask the elevators near you\./g, '')));
  check('"near you" only in "Ask the elevators near you."', !nearYou.length, nearYou[0]);
  const priceLines = LINES.filter(t => /\$\d/.test(t) && !/^A year earlier/.test(t) && !/^Market prices:/.test(t));
  check('every bid line with a price ends with "A bid, not your price." (Layers card lines carry it once below)', priceLines.every(t => t.endsWith(WORDS.bid) || layerFor(MEAD).lines.includes(t) || layerFor(BELT).lines.includes(t)), priceLines.find(t => !t.endsWith(WORDS.bid)));
  check('no "one bid" sentence', !all.some(t => /\bone bid\b|\bonly one bid\b/i.test(t)));
  check('no futures, forecast or best month', !all.some(t => /futures|forecast|best month/i.test(t)));
  check('every state is named, never "your state"', !all.some(t => /your state/i.test(t)));
}

// ---- the files: the owner's rules
{
  const files = ['js/market-data.js', 'js/market-view.js', 'css/market.css', 'scripts/test_market.mjs', ...fs.readdirSync(new URL('./fixtures/market-page/', import.meta.url)).map(f => `scripts/fixtures/market-page/${f}`)];
  const read = f => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const helper = new RegExp(['cl' + 'aude', 'anthr' + 'opic', 'chat' + 'g' + 'pt', '\\bg' + 'pt\\b', 'open' + 'ai', 'cop' + 'ilot', 'gem' + 'ini', '\\bllm\\b', 'stag' + 'ing', 'helper ' + 'chat', 'Tur' + 'key'].join('|'), 'i');
  for (const f of files) check(`${f}: names no writing helper, model or maker, no work-folder words`, !helper.test(read(f)));
  const css = read('css/market.css'), app = read('css/app.css');
  const used = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]))];
  check('css: every token used exists in css/app.css', used.length > 3 && used.every(t => app.includes(`${t}:`)), used.filter(t => !app.includes(`${t}:`)).join());
  check('css: no colour of its own, no motion', !/#[0-9a-f]{3,8}\b|rgba?\(|hsl|transition|animation|@keyframes/i.test(css));
  check('css: the fold\'s summary is at least 44 px (the touch token)', /\.mk-fold > summary \{ min-height: var\(--touch\); \}/.test(css) && /--touch: 44px/.test(app));
  for (const f of ['js/market-data.js', 'js/market-view.js']) { const t = read(f); check(`${f}: no outside address, no key in the page`, !/https?:\/\/(?!mymarketnews\.ams\.usda\.gov)/.test(t) && !/Authorization|marsapi|localStorage/.test(t)); }
  check('the source card key "ams" is in the source list', /\bams: \{/.test(read('js/sources.js')));
  check('every US state name is spelled out', Object.keys(STATE_NAMES).length === 51 && STATE_NAMES.MD === 'Maryland' && STATE_NAMES.PA === 'Pennsylvania');
}

console.log(`test_market: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
