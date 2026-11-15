// The words of step 4's extra choices: what else matters to the farmer and what limits them, each with one short line on what it changes.
// Pure: plain text and small tables, kept apart from the code so they can be read, changed and later translated in one place.
// Checked by scripts/test_wizard.mjs (every choice has a title and a line, the keys match js/inputs.js and the engine's js/compare.js).

// the five parts of the score, in the order of the weights (js/state.js PRIORITIES)
export const PART_NAMES = Object.freeze(['water fit', 'soil health', 'soil wash-off', 'income', 'weather safety']);

// rank: the words of the report's lead "Ranked for what matters most to you: ..." (js/letter-view.js goalsLine)
export const GOALS = Object.freeze([
  { key: 'forage', title: 'Feed for my animals', does: 'Hay and grazing count as income, and a hay plan may be added.', rank: 'feed for your animals' },
  { key: 'nitrogen', title: 'Less fertiliser to buy', does: 'Soil health counts more, and beans, peas or clover add up to 5 points.', rank: 'less fertiliser to buy' },
  { key: 'market', title: 'Sell what I already sell', does: 'New plans use your crops, crops grown near you, or crops grown widely.', rank: 'selling what you already sell' },
]);

export const SELL = Object.freeze([
  { key: 'grain', title: 'Grain and oilseeds', sub: 'corn, wheat, soybeans, canola' },
  { key: 'feed', title: 'Hay and feed', sub: 'alfalfa, hay, feed barley and oats' },
  { key: 'veg', title: 'Vegetables', sub: 'Crophalo suggests no vegetables, so new plans keep your crops' },
]);

export const TILL_DOES = 'Sets how much straw stays on the ground, and whether a no-till plan is added.';

export const INPUT_WORDS = Object.freeze({
  doesAll: 'In the comparison: all five parts count the same.',
  doesTop: (most, then, many = false) => `In the comparison: ${most} ${many ? 'count' : 'counts'} most${then ? `, then ${then}` : ''}.`,
  alsoHead: 'Also important to me', optional: '(optional)',
  limitsHead: 'What limits you',
  machinesHead: 'Machines and people',
  noDrill: 'I have no drill or planter for small seeds', noDrillDoes: 'New plans leave out cover crops and hay seedings such as alfalfa.',
  sellHead: 'Selling', sellQ: 'I can only sell:', sellDoes: 'New plans use only crops you can sell. Tick none if you can sell anything.',
  avoidHead: 'Crops I will not grow', avoidPick: 'Add a crop I will not grow', avoidChoose: 'Choose a crop',
  avoidDoes: 'New plans never use these crops. Your own rotation stays as it is.', avoidNone: 'None yet.', avoidRemove: name => `Remove ${name}`,
  avoidAdded: name => `${name} added. New plans will not use it.`, avoidGone: name => `${name} removed.`,
  takenAs: parts => `Taken as: ${parts}.`,
  sumTill: { conventional: 'conventional tillage', reduced: 'min-till', notill: 'no-till' },
  sumDrill: 'no small-seed drill', sumLabor: 'short on workers or machines', sumSell: list => `sells only ${list}`, sumAvoid: n => `${n} ${n === 1 ? 'crop' : 'crops'} left out`,
  sumNone: 'no other limits',
  aboutHead: 'Where these rules come from',
  about: [
    'Beans, peas, clover and alfalfa take nitrogen from the air, and the next crop can use part of it (OMAFA, Agronomy Guide for Field Crops, Publication 811).',
    '“Grown widely” means more than about 5 million hectares (12 million acres) harvested a year worldwide, in FAOSTAT.',
    'Crophalo uses fixed rules, not a forecast of your yield: check any plan with a local adviser.',
  ],
});
