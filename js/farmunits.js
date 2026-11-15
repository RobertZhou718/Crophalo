// My farm's units: sizes and temperatures in the units the farmer chose in Settings, or the country's own when nothing is chosen (acres and degrees F for a field in the United States).
// Pure apart from reading the saved choice: js/units.js holds the rules, js/geo.js the words for a size. Checked by scripts/test_sim.mjs (units follow Settings) and scripts/e2e_farm.mjs (a US field in acres).
import { readUnits, unitsFor, fmtTemp } from './units.js';
import { areaWords as sizeWords } from './geo.js';

let country = () => '';
export const setCountry = fn => { country = typeof fn === 'function' ? fn : () => ''; };   // the farm on the board says which country its pin is in
export const unitsNow = (cc = country()) => unitsFor(readUnits(), cc);
export const areaUnit = (cc) => (unitsNow(cc).area === 'imperial' ? 'us' : 'metric');   // the word the size helpers know
export const areaWords = (ha, units) => sizeWords(ha, units || areaUnit());
export const tempWords = c => fmtTemp(c, unitsNow());
