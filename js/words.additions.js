// Crop-side words of Crophalo's one vocabulary: the fixed words for a past season, the fit of a score, the flags,
// the tile status, the parts of the score, sureness, the crop chooser's groups and the lines said once per sheet.
// Pure: no page, no storage, no network. To be merged into js/words.js, the only place these words are written.
// Checked by scripts/test_crops.mjs.
import { own } from './words.js';

// ---- one crop in one past year. Fine and Close call are never added into one "came through" count: a count leads with the problem.
export const SEASON_WORDS = Object.freeze({ ok: 'Fine', close: 'Close call', hurt: 'Hurt', nodata: 'No data', growing: 'Still growing' });
const HURT_BY = Object.freeze({ 'frost-young': 'frost', 'frost-flower': 'frost', 'frost-ripe': 'frost', 'frost-jointing': 'frost', heat: 'heat', water: 'dry weather', wet: 'a wet season' });   // the replay's kinds of harm, in farmer words
// "Hurt by frost and dry weather": each cause once, in the order given; kinds nobody knows are left out.
export function hurtBy(kinds) {
  const causes = [...new Set((Array.isArray(kinds) ? kinds : [kinds]).filter(kind => own(HURT_BY, kind)).map(kind => HURT_BY[kind]))];
  return causes.length ? `Hurt by ${listOf(causes)}` : SEASON_WORDS.hurt;
}

// ---- the score: the number, then the word. "out of 100" lives in the "i" and in what a screen reader says.
// The score is rounded once, and the word goes with the number that is shown: 69.5 reads "70 · Good fit", never "70 · OK fit".
const whole = score => typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;   // null: not a score at all
export const bandWord = score => { const n = whole(score); return n === null ? '' : n >= 70 ? 'Good fit' : n >= 50 ? 'OK fit' : 'Poor fit'; };
export const scoreWords = score => whole(score) === null ? SEASON_WORDS.nodata : `${whole(score)} · ${bandWord(score)}`;                 // "71 · Good fit"
export const scoreSaid = score => whole(score) === null ? SEASON_WORDS.nodata : `${whole(score)} out of 100, ${bandWord(score)}`;       // for a screen reader and the Listen button
// A flag takes the place of the band word. Each has its own mark in pics.js, never colour alone.
export const FLAG_WORDS = Object.freeze({ fails: "Doesn't suit here", borderline: 'Only just suits', risky: 'Often hurt in past years', holds: 'Holds up' });

// ---- a tile's status, and the parts of the score (one name each on bars, sliders and chips)
export const STATUS_WORDS = Object.freeze({ good: 'Good', watch: 'Watch', risk: 'Risk', unclear: 'Unclear' });
export const PART_WORDS = Object.freeze({ water: 'Water fit', soil: 'Soil health', erosion: 'Soil wash-off', income: 'Income', weather: 'Weather safety', pest: 'Pest break' });

// ---- how sure an answer is: three levels, and the lowest is a good start, not a warning
export const SURE_WORDS = Object.freeze({ very: 'Very sure', fairly: 'Fairly sure', somewhat: 'Somewhat sure' });
export const SURE_LINES = Object.freeze({ very: 'Very sure', fairly: 'Fairly sure', somewhat: 'Somewhat sure: a few things to confirm' });

// ---- the crop chooser's groups, by the crop table's group (cover crops and fallow share the last one)
export const GROUP_WORDS = Object.freeze({ grain: 'Grains', legume: 'Beans and peas', oil: 'Oil crops', fibre: 'Fibre', root: 'Roots and tubers', sugar: 'Sugar', veg: 'Vegetables', other: 'Other crops', forage: 'Hay and grazing', cover: 'Rest', fallow: 'Rest' });

// ---- the three soil colours a farmer picks from (the swatches are in pics.js, under the same keys): darker soil usually holds more
export const SOIL_WORDS = Object.freeze({ low: 'Pale', med: 'Brown', high: 'Dark' });

// ---- said once per sheet or tab, never on every block
export const SAID_ONCE = Object.freeze({
  ask: 'Check with farmers near you or your farm adviser before you change anything.',
  past: 'Past weather, not a forecast',
  guide: 'A guide, not advice. You decide.',
});

// ---- small helpers so counts, lists and names are always written the same way
export const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;                       // "1 day", "2 days"
export const listOf = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;   // "2007, 2020, 2021 and 2025"
// A count over the record, never a chance: "6 of 26 years", "every year", "none of the 26 years", "all 12 runs".
export function countOf(n, total, word = 'year', many = word + 's') {
  if (!(total > 0)) return SEASON_WORDS.nodata;   // nothing on record: "none of the 0 years" would read as a clean record
  if (n >= total) return word === 'year' ? 'every year' : `all ${total} ${total === 1 ? word : many}`;
  return n <= 0 ? `none of the ${total} ${total === 1 ? word : many}` : `${n} of ${total} ${total === 1 ? word : many}`;
}
export const shortName = name => String(name ?? '').replace(/ \(.*\)$/, '');                                   // "Corn (maize)" → "Corn", where space is short
