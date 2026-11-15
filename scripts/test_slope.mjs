// Crophalo's slope suite: the slope the height map gives for a drawn field reaches the comparison of strategies. The Mead demo field with its recorded height answer (scripts/fixtures/dem_mead.json,
// USGS 3DEP lidar, as the app's own height lookup gave it) and its recorded NASA POWER answer: the wash-off score and its sentence use the field's own slope; a field whose slope is not read keeps the old sentence.
// RULE: never loosen a check to make it pass. No network. Run: node scripts/test_slope.mjs
import fs from 'node:fs';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { optionsFor } from '../js/engine.js';
import { newState, cleanArea } from '../js/state.js';
import { readyAnswers } from '../js/steps.js';
import { loadDem } from '../js/field-data.js';
import * as RL from '../js/report-load.js';
import { strategies } from '../js/report-view.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const region = JSON.parse(read('../data/regions.json')).find(r => r.id === 'mead-field');
const S = buildSeries(JSON.parse(read('./fixtures/power_mead.json')), { lat: region.lat, lon: region.lon }), C = computeClimate(S, S.lat, { today: '2026-11-14' });
const base = { ...newState(), loc: { lat: Math.round(region.lat * 1e4) / 1e4, lon: Math.round(region.lon * 1e4) / 1e4, label: region.country, cc: 'US' } };
const ring = region.outline.slice(0, -1).map(([lo, la]) => [la, lo]);
const state = { ...base, ...readyAnswers(base, { ...region, demo: true }) };
state.area = cleanArea({ pts: ring, ha: region.area_ha }, state.loc);
const run = st => optionsFor(st, C, { lat: st.loc.lat, lon: st.loc.lon, country: 'US' }, { today: '2026-11-14' });
const plans = r => [r.current, ...r.others];
const words = r => JSON.stringify([r.evidence, r.risks, r.sureWhy, plans(r).map(p => [p.evidence, p.review, p.gaps])]);

check('the Mead demo field is drawn', !!state.area && state.area.pts.length >= 4);
// the recorded height answer, through the app's own lookup
const DEM = read('./fixtures/dem_mead.json');
const dem = await loadDem(state.loc, state.area, async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => DEM, json: async () => JSON.parse(DEM) }));
check('the height lookup gives the Mead field a slope under 2 in 100', dem.ok && dem.slope > 0 && dem.slope < 2, JSON.stringify([dem.ok, dem.slope, dem.reason]));

// before the height answer: the old sentence stays, said plainly
const before = run(state);
check('a field whose slope is not read keeps the sentence "Slope not read, so a medium slope is used"', /Slope not read, so a medium slope is used/.test(words(before)) && /Slope: not read for your field/.test(words(before)));

// the height answer is handed to the field before the strategies are compared
check('the report has one way to hand the height answer to the field: slopeInto(state, dem)', typeof RL.slopeInto === 'function');
const st2 = structuredClone(state), took = RL.slopeInto?.(st2, dem);
check('the drawn field takes the slope of the height answer', took === true && st2.area.slope === dem.slope, JSON.stringify(st2.area?.slope));
const after = run(st2);
check('with the slope read, no line says "Slope not read"', !/Slope not read|Slope: not read/.test(words(after)), words(after).match(/Slope[^"]{0,80}/)?.[0]);
check('with the slope read, the evidence names the field\'s own slope and the sureness says it was measured', /Land sloping about 0\.\d in 100/.test(words(after)) && /Slope: measured on your drawn field/.test(words(after)));
check('wash-off on this nearly flat field is medium or lower for the three strategies the farmer compares', strategies(after).first.length === 3 && strategies(after).first.every(p => ['low', 'medium'].includes(p.erosionLevel)) && !after.risks.some(t => /wash-off[^.]*high/.test(t)), JSON.stringify(strategies(after).first.map(p => [p.id, p.erosionLevel])));
check('the wash-off score rises with the real slope', plans(after).every((p, i) => p.scores.erosion > plans(before)[i].scores.erosion), JSON.stringify([plans(before).map(p => p.scores.erosion), plans(after).map(p => p.scores.erosion)]));

// what must not take a slope
{ const s = structuredClone(state); check('a height answer that failed leaves the field as it was', RL.slopeInto?.(s, { ok: false, reason: 'x' }) === false && s.area.slope == null); }
{ const s = structuredClone(state); check('a field too small for a slope leaves the field as it was', RL.slopeInto?.(s, { ok: true, slope: null, tooSmall: true }) === false && s.area.slope == null); }
{ const s = { ...structuredClone(state), area: null }; check('a pin with no drawn field takes no slope (its square is only an estimate)', RL.slopeInto?.(s, dem) === false && s.area === null); }

// the report asks the height map when it opens and uses "Refresh the report" for a late answer
{ const src = read('../js/report.js');
  check('the report asks the height map for a drawn field when it opens', /if \(cur\.state\.area\) getDem\(loc, outlineOf\(cur\.state\)\)/.test(src));
  check('a height answer that lands before the strategies are compared is used at once; a later one waits for "Refresh the report"', /cur\.loading && !cur\.worked\) useDem\(\);\s*else \{ cur\.late\.set\(SLOPE_NEWS, useDem\); paintFresh\(\); \}/.test(src));
  check('refreshing with the slope works the strategies out again', /needsWork = \[\.\.\.cur\.late\.keys\(\)\]\.some\(k => \/crops\|soil survey\|slope\/\.test\(k\)\)/.test(src) && /SLOPE_NEWS = '[^']*slope[^']*'/.test(src));
  check('the line "New data has arrived" is put back whenever the ready report is drawn, so a slope that landed while the strategies were being compared is offered', /afterPanel\(r\);\n  markPart\(\);\n  paintFresh\(\);/.test(src)); }
console.log(`slope: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
