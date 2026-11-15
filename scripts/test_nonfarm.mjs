// The pins-that-are-not-fields suite: js/nearby.js (the crop map's class at the pin), js/engine.js (no score and no plan until the farmer says it is a field),
// js/near-load.js (the farmer's word reaches the engine), js/state.js (the word is kept with the place) and js/joins.js (the answer reaches the report).
// Run: node scripts/test_nonfarm.mjs   (no network)
import * as N from '../js/nearby.js';
import * as E from '../js/engine.js';
import { engineSpot } from '../js/near-load.js';
import { cleanLoc } from '../js/state.js';
import { getOptions } from '../js/joins.js';
import { barrie, TODAY } from './hand_climates.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const { C } = barrie();
const state = { rotation: { preset: 'corn-soy', custom: [], garden: null, second: {} }, farm: { irrigation: 'none', tillage: 'reduced', livestock: false, coverOK: true, labor: false }, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, soilTest: null, avoid: [], prio: [3, 3, 3, 3, 3] };
const MAP = (country, code, name, extra = {}) => ({ ok: true, country, year: 2025, box: { north: 44.5, south: 44.3, east: -79.7, west: -79.9 }, cropland_ha: 40000, crops: [{ crop: 'corn', share: 0.3, ha: 12000 }, { crop: 'soy', share: 0.3, ha: 12000 }], wider: [], classes: [], pin: { code, name }, ...extra });
const spotOf = (answer, more = {}) => ({ lat: 44.4, lon: -79.78, country: answer.country, ...N.spotFields(answer), today: TODAY, ...more });

// ---- the classes: by the map's own class names
const US = { 63: 'forest', 141: 'forest', 142: 'forest', 143: 'forest', 64: 'shrubland', 152: 'shrubland', 65: 'barren land', 131: 'barren land', 82: 'developed land', 121: 'developed land', 122: 'developed land', 123: 'developed land', 124: 'developed land', 87: 'wetland', 190: 'wetland', 195: 'wetland', 112: 'ice or snow' };
for (const [code, w] of Object.entries(US)) same(`US class ${code} reads as ${w}`, N.notField(MAP('US', +code, 'x'))?.word, w);
const CA = { 200: 'forest', 210: 'forest', 220: 'forest', 230: 'forest', 50: 'shrubland', 30: 'barren land', 34: 'developed land', 80: 'wetland', 85: 'wetland', 110: 'natural grassland' };
for (const [code, w] of Object.entries(CA)) same(`Canada class ${code} reads as ${w}`, N.notField(MAP('CA', +code, 'x'))?.word, w);
ok('farmland and pasture are never "not a field": corn, soybeans, alfalfa, fallow, hay, pasture, orchards, greenhouses', [[1, 'US'], [5, 'US'], [36, 'US'], [61, 'US'], [37, 'US'], [176, 'US'], [66, 'US'], [122, 'CA'], [121, 'CA'], [131, 'CA'], [35, 'CA'], [158, 'CA'], [188, 'CA'], [130, 'CA']].every(([c, k]) => N.notField(MAP(k, c, 'x')) === null));
ok('water is the hard refusal, not a question: classes 83, 111 (US) and 20 (Canada) are not "not a field"', [[83, 'US'], [111, 'US'], [20, 'CA']].every(([c, k]) => N.notField(MAP(k, c, 'x')) === null && N.spotFields(MAP(k, c, 'x')).water === true));
ok('no pin class read, or no map: nothing is asked', N.notField({ ...MAP('US', 141, 'x'), pin: null }) === null && N.notField({ ok: false }) === null && N.notField(null) === null && N.notField(MAP('TR', 141, 'x')) === null);
same('the sentence says what the map shows and the year', N.notField(MAP('US', 141, 'Deciduous Forest')).text, 'The USDA crop map of 2025 shows forest at this place, not a field.');
same('Canada: the same sentence with the Canadian map', N.notField(MAP('CA', 220, 'Broadleaf')).text, 'The Canadian crop map (Agriculture and Agri-Food Canada) of 2025 shows forest at this place, not a field.');

// ---- the engine: no plan without the farmer's word, the normal plan with it
const forest = MAP('US', 141, 'Deciduous Forest');
const asked = E.optionsFor(state, C, spotOf(forest), { today: TODAY });
ok('forest at the pin: no score, no plan, the sentence and two ways on', asked.current === null && asked.recommended === null && asked.others.length === 0 && asked.notFarmland === true && asked.askField?.actions.join() === 'move-pin,carry-on' && asked.askField.code === 141 && asked.askField.word === 'forest', JSON.stringify(asked).slice(0, 200));
ok('the reason says what the map shows and that nothing is scored until the farmer says which', /^The USDA crop map of 2025 shows forest at this place, not a field\. Crophalo gives no score or plan until you say which\.$/.test(asked.reason), asked.reason);
const carried = E.optionsFor(state, C, spotOf(forest, { fieldOk: true }), { today: TODAY });
ok('with the farmer\'s word: the normal answer, one line kept at the top', carried.recommended && carried.current && carried.others.length >= 1 && carried.fieldNote === 'The crop map shows forest here; you said it is your field.' && !carried.notFarmland && !carried.askField);
const plain = E.optionsFor(state, C, spotOf(MAP('US', 1, 'Corn')), { today: TODAY });
ok('a farm pin: unchanged, no note, no question', plain.recommended && !('fieldNote' in plain) && !('askField' in plain));
const lake = E.optionsFor(state, C, spotOf(MAP('US', 111, 'Open Water')), { today: TODAY });
ok('a lake is still the hard refusal, with or without the word', lake.notFarmland === true && !lake.askField && E.optionsFor(state, C, spotOf(MAP('US', 111, 'Open Water'), { fieldOk: true }), { today: TODAY }).notFarmland === true);
const none = E.optionsFor(state, C, { lat: 44.4, lon: -79.78, country: 'FR', today: TODAY }, { today: TODAY });
ok('no crop map at all: nothing changes', none.recommended && !('askField' in none) && !('fieldNote' in none));
ok('a word with no question (fieldOk true, nothing at the pin) adds no note', !('fieldNote' in E.optionsFor(state, C, { ...spotOf(MAP('US', 1, 'Corn')), fieldOk: true }, { today: TODAY })));

// ---- the farmer's word: kept with the place, valid for that pin and that class only
const loc = { lat: 44.4, lon: -79.78, label: 'Barrie', cc: 'US' }, nf = N.notField(forest), word = N.fieldWord(loc, nf);
same('the word is the pin, the class and what the map showed', word, { lat: 44.4, lon: -79.78, code: 141, word: 'forest' });
same('the state keeps the word with the place (reload, saved link)', cleanLoc({ ...loc, fieldOk: word }).fieldOk, word);
ok('a word for another pin is dropped when the place is cleaned', cleanLoc({ ...loc, lat: 44.41, fieldOk: word }).fieldOk === undefined);
ok('junk in the word is dropped', cleanLoc({ ...loc, fieldOk: { lat: 44.4, lon: -79.78, code: 'x', word: 1 } }).fieldOk === undefined && cleanLoc({ ...loc, fieldOk: 'yes' }).fieldOk === undefined);
const near = N.spotFields(forest);
ok('the spot the engine is asked with carries the word only for this pin and this class', engineSpot({ loc: { ...loc, fieldOk: word } }, near).fieldOk === true && engineSpot({ loc }, near).fieldOk === undefined && engineSpot({ loc: { ...loc, lat: 44.5, fieldOk: word } }, near).fieldOk === undefined && engineSpot({ loc: { ...loc, fieldOk: { ...word, code: 63 } } }, near).fieldOk === undefined);
ok('the word survives a round trip through the saved state', JSON.stringify(cleanLoc(JSON.parse(JSON.stringify({ ...loc, fieldOk: word }))).fieldOk) === JSON.stringify(word));

// ---- the report's side: the question reaches it
const got = await getOptions(state, C, spotOf(forest), () => E, { today: TODAY });
ok('getOptions hands the question on: not ok, notFarmland, askField with the two actions', got.ok === false && got.notFarmland === true && got.askField?.actions.length === 2 && /not a field/.test(got.reason), JSON.stringify(got).slice(0, 200));
const got2 = await getOptions(state, C, spotOf(forest, { fieldOk: true }), () => E, { today: TODAY });
ok('getOptions with the word: ok, the plans, and the one line', got2.ok === true && got2.fieldNote === 'The crop map shows forest here; you said it is your field.' && !!got2.recommended);
const BANNED = /NaN|undefined|null|\[object|%|likely|probab|chance|guarantee/i;
ok('no bad words in the question or the note', !BANNED.test(asked.reason + JSON.stringify(asked.askField)) && !BANNED.test(carried.fieldNote));

// ---- the one-page report draws the question and the farmer's word (js/report.js, js/wizard.js): read from the files themselves, since they draw into a page
{
  const fs = await import('node:fs'), src = f => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), rp = src('report.js'), wz = src('wizard.js');
  ok('the report draws the map\'s sentence and the two buttons only when the answer carries askField', /if \(!ready && r\?\.askField\)/.test(rp) && rp.includes("fieldOk: 'This is my field: carry on'") && rp.includes("movePin: 'Draw my field'") && /data-act="fieldok"/.test(rp) && /data-act="movepin"/.test(rp) && /esc\(r\.reason\)/.test(rp));
  ok('"This is my field: carry on" writes fieldWord(loc, askField) into the place, keeps it like a change of place, and works the report out again', /act === 'fieldok'\) \{ const word = fieldWord\(cur\.state\.loc, cur\.result\?\.askField\);[^\n]*cur\.state\.loc = \{ \.\.\.cur\.state\.loc, fieldOk: word \}; setFieldOk\(word\); return void openReport\(cur\.state\)/.test(rp) && /export function setFieldOk\(word\) \{[^\n]*state\.loc = \{ \.\.\.state\.loc, fieldOk: word \}; keep\(\);/.test(wz));
  ok('"Move the pin to my field" sets nothing and goes back to the step where the pin is placed', /act === 'movepin'\) \{ toPlaceStep\(\); return seam\.change\(cur\.state\); \}/.test(rp) && /export function toPlaceStep\(\) \{ at = 0;/.test(wz));
  ok('after the word the note is shown at the top of the report', /rv-fieldnote" role="note">\$\{esc\(r\.fieldNote\)\}/.test(rp) && rp.indexOf('${note}${answerHTML(') > 0);
  // the chain the button starts, end to end on the engine: the answer's askField makes the word, the word is kept, and the engine answers with the note
  const word2 = N.fieldWord(state.loc ?? loc, got.askField), kept = cleanLoc({ ...(state.loc ?? loc), fieldOk: word2 });
  const again = await getOptions({ ...state, loc: kept }, C, engineSpot({ ...state, loc: kept }, N.spotFields(forest)), () => E, { today: TODAY });
  ok('the word made from the answer\'s askField brings the plans back with the note', !!word2 && again.ok === true && /you said it is your field/.test(again.fieldNote ?? ''), JSON.stringify([word2, again.reason]).slice(0, 200));
}
console.log(`nonfarm: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
