// Crophalo's one vocabulary: the small text helpers every screen uses, the crop-side words (seasons, scores, flags, sureness) and the setup steps' words, in one place so no copy can drift.
// All of it is pure: no page, no storage, no network.
// Checked by scripts/test.mjs (the words section), scripts/test_crops.mjs (the crop-side words) and scripts/test_wizard.mjs (every step has its words, no empty label).

const HTML_MARKS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const OLD_TR_NAME = /\bT[uü]rk(?:ey|iye)\b/gi;   // the English spelling some sources still send, and the right one in any letter case

// Text made safe to put inside HTML, between tags or inside a quoted attribute.
export const esc = text => String(text ?? '').replace(/[&<>"']/g, mark => HTML_MARKS[mark]);

// True only for a table's own entry, so "toString" or "__proto__" can never pass as an id.
export const own = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);

// The country as Crophalo writes it. The code TR is always "Türkiye", whatever name the source gave.
export function countryName(name, code) {
  if (String(code ?? '').trim().toUpperCase() === 'TR') return 'Türkiye';
  return String(name ?? '').trim().replace(OLD_TR_NAME, 'Türkiye');
}

// ---- the crop side: what a past season, a score and a flag are called
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

// ---- the setup steps: their words, kept apart from the code so they can be read, changed and later translated in one place
export const STEPS = Object.freeze([
  { id: 'field', icon: 'i-pin', bar: 'Your field', heading: 'Is this your field?', listen: 'Step 1, your field. Move the pin onto your field on the map. You can also draw its shape. Then press Next step.' },
  { id: 'crops', icon: 'i-leaf', bar: 'Your crops', heading: 'What do you grow?', listen: 'Step 2, your crops. Tap the crops you plant, one year after the other. If you grow tea, hazelnuts or other trees, tap that instead. Then press Next step.' },
  { id: 'soil', icon: 'i-drop', bar: 'Water and soil', heading: 'Water and soil', listen: 'Step 3, water and soil. Say how your field gets water: rainfed, limited irrigation, or irrigated as needed. Then tap the soil that feels like yours, and its colour. Then press Next step.' },
  { id: 'matters', icon: 'i-scale', bar: 'What matters most', heading: 'What do you want most?', listen: 'Step 4, what matters most. Tap one picture. Then press See my field report.' },
]);

export const WATER = Object.freeze([
  { value: 'none', title: 'Rainfed', sub: 'Rain only' }, { value: 'limited', title: 'Limited irrigation', sub: 'Some water in dry spells' }, { value: 'full', title: 'Irrigated as needed', sub: 'Water whenever crops need it' },
]);
export const FEEL = Object.freeze([
  { value: 'sand', title: 'Light', sub: 'sandy, gritty' }, { value: 'loam', title: 'Loam', sub: 'mellow, mixed' }, { value: 'silt', title: 'Silty', sub: 'smooth, floury' }, { value: 'clay', title: 'Heavy', sub: 'clay, sticky' },
]);
export const COLOUR = Object.freeze([
  { value: 'low', title: 'Pale', sub: 'little organic matter' }, { value: 'med', title: 'Brown', sub: 'some organic matter' }, { value: 'high', title: 'Dark', sub: 'a lot of organic matter' },
]);
export const MATTERS = Object.freeze([   // the first of each pair is the key in the priority table
  { value: 'balanced', title: 'Balanced', icon: 'i-scale' }, { value: 'moisture', title: 'Save moisture', icon: 'i-drop' }, { value: 'soil', title: 'Build soil', icon: 'i-leaf' },
  { value: 'erosion', title: 'Stop erosion', icon: 'i-shield' }, { value: 'income', title: 'Focus on income', icon: 'i-data' }, { value: 'weather', title: 'Ride out bad years', icon: 'i-eye' },
]);
export const TILLAGE = Object.freeze([{ value: 'conventional', title: 'Conventional' }, { value: 'reduced', title: 'Min-till' }, { value: 'notill', title: 'No-till' }]);
export const HABITS = Object.freeze([
  { key: 'coverOK', title: 'I can seed cover crops', sub: 'A drill or seeder, and time for one more pass' },
  { key: 'livestock', title: 'I keep animals', sub: 'Grazing and hay are worth something to me' },
  { key: 'labor', title: 'Short on workers or machines', sub: 'Keep the plan simple' },
]);

export const PARCEL_FOR = Object.freeze({   // where a farmer looks up a parcel on their government's own map: links only, nothing is fetched from them
  US: [['USDA Web Soil Survey', 'https://websoilsurvey.nrcs.usda.gov/'], ['USDA CropScape', 'https://nassgeodata.gmu.edu/CropScape/']],
  TR: [['TKGM Parsel Sorgu', 'https://parselsorgu.tkgm.gov.tr/']],
  GB: [['RPA Rural Land Registry map', 'https://www.gov.uk/guidance/rural-land-registry-maps']],
  DE: [['Agrarportal', 'https://www.agrarportal.de/']],
  FR: [['Géoportail', 'https://www.geoportail.gouv.fr/'], ['Registre parcellaire graphique', 'https://www.geoportail.gouv.fr/donnees/registre-parcellaire-graphique-rpg-2022']],
  CA: [['Agriculture and Agri-Food Canada maps', 'https://agriculture.canada.ca/en/agriculture-and-environment/soil-and-land']],
  AU: [['Digital Atlas of Australia', 'https://digital.atlas.gov.au/']],
  IN: [['Bhunaksha', 'https://bhunaksha.nic.in/']],
});
export const PARCEL_ELSE = ['FAO GeoNetwork: find your country’s parcel map', 'https://www.fao.org/geonetwork/'];

export const WORDS = Object.freeze({
  roadTitle: 'This region comes with ready answers.', roadSub: 'The rotation, the water and the soil are filled in. You can change any answer in the steps below.',
  placeLoading: 'Finding the place…', demoChip: 'Demo region', stepLabel: (n, name) => `Step ${n} of 4: ${name}`,
  fold: 'Type coordinates or look up a parcel', coordLabel: 'Coordinates', go: 'Go', badCoords: 'Could not read those coordinates. Try 42.03, -93.62',
  parcelLead: 'Have a parcel or legal land number? Look it up on your government map, then paste the coordinates above:',
  mapMissing: 'The map is shown here.', next: 'Go to the next step', last: 'See my field report', back: 'Back',
  mine: 'Your answers stay on this device unless you share your report.',
  placeNeed: 'Tap the map or draw your field to go on.', cropsNeed: 'Tap what you grow to go on.', soilNeed: 'Tap your soil and its colour to go on.', ready: 'Ready. Your answer takes a few seconds.',
  rotName: 'Tap what you grow', rotSame: 'The same crop every year.', rotCycle: n => `${n}-year rotation, then it repeats.`,
  garden: 'They stay in the ground, so there is nothing to rotate. Crophalo will show your weather, frost, rain, slope and soil.',
  noSuggest: 'Suggestions for this spot have not been read yet. Choose from the ready rotations, or build your own.',
  ready6: 'Ready rotations', buildOwn: 'Build my own', buildSub: 'Choose each year yourself', yearN: n => `Year ${n}`, removeYear: n => `Remove year ${n}`, addYear: 'Add a year',
  yearsNote: 'Year 1 is the crop in your field now, or the one you plant next. The years then repeat in order.', chooseCrop: 'Choose a crop',
  trees: 'Crops that stay for several years: fruit, berries and asparagus', treesMore: 'More trees and bushes',
  waterQ: 'How does your field get water?', soilQ: 'What is your soil like?', tapOne: 'Tap one', feelQ: 'How does it feel in your hand?', colourQ: 'What colour is it?',
  colourAbout: 'About this', colourWhy: 'A rough guide only. If you have a soil test, type its organic matter under “I have a soil test”. It is shown in your report, but it does not change the option scores.',
  soilMapOff: 'The soil survey has not been read for this spot yet. Tap the soil that is like yours, or use an assumed soil.', soilAssume: 'Not sure: use assumed soil',
  soilMine: 'Your choice.', soilAssumed: 'Average soil is assumed. Nothing was measured, so the answer will say it is less sure. Tap your soil above if you know it.',
  more: 'More about how you farm', optional: '(optional)', takenAs: parts => `Taken as: ${parts}.`, tillage: 'Tillage',
});
