// The words of the strategy comparison (js/compare.js): what each plan may offer, what to check locally, the facets of each plan, the
// three strategies, the months the soil is bare, when the crops grown now are most exposed, and why a crop or a plan was left out.
// Pure: no page, no storage, no network. Every sentence about farming names its source; a figure comes from the engine's own numbers.
// Checked by scripts/test_engine.mjs (no "NaN", no "undefined", no promise: "may" and "can help", never "will").

export const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const listOf = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const cap = text => text ? text[0].toUpperCase() + text.slice(1) : text;
const them = n => n === 1 ? 'it' : 'them';
const many = names => names.length > 1 || /s$/.test(names[0] ?? '');   // "soybeans fix", "alfalfa fixes"

// The sources named in the words, written out once.
export const CITE = Object.freeze({
  omafra: 'OMAFRA Publication 811, Agronomy Guide for Field Crops',
  erosion: 'Government of Ontario, Soil erosion: causes and effects',
  nrcs: 'USDA NRCS, soil health principles',
  fao56: 'FAO-56, Table 22',
  faowater: 'FAO Irrigation Water Management Training Manual 3 and FAO-56',
  crophalo: 'Crophalo’s own crop scale',
  statcanWho: 'Statistics Canada',
  fao: 'FAOSTAT',
});

// The source named for soil wash-off fits the field's country: Canada keeps Ontario's guide, the United States names its own soil service, anywhere else Ontario's guide is said as a general one.
export const erosionCite = country => { const cc = String(country ?? '').toUpperCase(); return cc === 'CA' || !cc ? CITE.erosion : cc === 'US' ? CITE.nrcs : `a general guide to soil erosion, ${CITE.erosion.split(',')[0]}`; };
// ---- why a crop or a plan was left out (the farmer's own limits and goals, and Crophalo's rule for Ontario without a crop map)
export const LEFT_WHY = Object.freeze({
  avoid: one => `you said you will not grow ${one ? 'it' : 'them'}`,
  noDrill: () => 'you have no drill for small seed, and hay crops and cover crops need one',
  sell: one => `${one ? 'it does' : 'they do'} not fit what you said you can sell`,
  market: one => `you asked to sell what you already sell, and ${one ? 'it is' : 'they are'} neither your own crop, nor grown widely (${CITE.fao}), nor common around the field`,
  listed: () => `the crop map could not check what farmers grow around this field, so only field crops that ${CITE.statcanWho} lists for Ontario are offered`,
});
export const leftLine = (key, names) => `${cap(listOf(names))} ${names.length === 1 ? 'was' : 'were'} left out of the ideas: ${LEFT_WHY[key](names.length === 1)}.`;
export const COVER_LEFT = 'The cover-crop version of your rotation was left out: you have no drill for small seed.';
export const LISTED_GAP = `The crop map could not check what farmers grow around this field, so only field crops that ${CITE.statcanWho} lists for Ontario are offered.`;
export const NITROGEN_EVIDENCE = 'You asked for less fertiliser to buy, so nitrogen left by legumes in a plan counts for up to 5 of its 100 points.';
export const keptOwn = 'Your own rotation is shown as it is: the limits you set only shape the new ideas.';

// ---- the facets of one plan
export const FACET_NONE = 'Not worked out: this plan does not suit this place, so it has no figures.';
export const FACET_BROKEN = 'Not worked out: a figure this needs is missing for this plan.';
export const facetWords = Object.freeze({
  nitrogen: (legumes, n) => legumes.length ? `${cap(listOf(legumes))} ${many(legumes) ? 'fix' : 'fixes'} nitrogen from the air and may leave some for the crop after ${many(legumes) ? 'them' : 'it'} (${n} of 100 on ${CITE.crophalo}).` : 'No crop in this plan fixes nitrogen from the air, so the next crop gets none from it.',
  nitrogenSource: `${CITE.crophalo} (nitrogen the next crop can count on); ${CITE.omafra} for legume nitrogen credits`,
  organic: (n, tillage, cover) => `Plant matter left for the soil: ${n} of 100 on ${CITE.crophalo}, with ${tillage}${cover ? ' and the cover crop' : ''}.`,
  organicSource: `${CITE.crophalo}, adjusted for tillage`,
  tillage: { conventional: 'ploughing', reduced: 'reduced tillage', notill: 'no ploughing' },
  pest: (changes, turns, same) => same ? 'The same crop every year gives its pests and diseases no break.' : `The plant family changes in ${changes} of ${turns} turns from one crop to the next, which can help break pest and disease cycles (${CITE.omafra}).`,
  pestSource: `Crophalo’s rule on plant families (the crop table); ${CITE.omafra} on crop rotation`,
  forage: (n, names, livestock) => `${names.length ? `${cap(listOf(names))} can be fed to animals. ` : ''}Feed value ${n} of 100 on ${CITE.crophalo}. ${livestock ? 'You keep animals, so feed value counts as income here.' : 'Feed value counts only if you keep animals or sell hay or straw.'}`,
  forageSource: `${CITE.crophalo} (feed value)`,
  market: (parts, map) => `Share of the farmland around the field: ${listOf(parts)} (${map}). A crop many farmers near you grow is usually easier to sell, but ask a buyer.`,
  marketNone: 'Not worked out: what farmers grow around the field was not read, so how easy each crop is to sell here is not known.',
  marketShare: (name, per100) => `${name} ${per100} in 100`,
  waterUse: (need, rain) => `About ${need} mm of water a season for a full crop, against about ${rain} mm of rain in that season in a normal year.`,
  waterUseSource: `${CITE.faowater}; NASA POWER rain`,
  infiltration: (n, covered) => `An index of ${n} of 100 from root depth (${CITE.fao56}), how much of the year the ground is covered (about ${covered} days in 100) and tillage. It is not a measurement of how fast water soaks in.`,
  infiltrationSource: `Crophalo’s own index; ${CITE.nrcs} (living roots, soil cover, less tillage)`,
});

// ---- what a plan may offer (kind, text), from its own numbers against what is grown now
export const benefitWords = Object.freeze({
  erosion: (b, b0, country) => `Can help hold the soil: it would be bare ${+b < 0.5 ? 'under a month' : `about ${b} months`} a year instead of about ${b0}, so heavy rain may take less of it (${erosionCite(country)}).`,
  soil: (s, s0) => `May build soil health: the soil score is ${s} against ${s0} for what you grow now.`,
  organic: (o, o0) => `May leave more plant matter for the soil: ${o} against ${o0} of 100 on ${CITE.crophalo}.`,
  nitrogen: names => `${cap(listOf(names))} may leave some nitrogen for the next crop, so it may need less fertiliser (${CITE.omafra}).`,
  pest: (p, p0) => `Can help break pest and disease cycles: the crop family changes more often (pest break ${p} against ${p0} now; ${CITE.omafra}).`,
  water: (w, w0) => `May use less water: about ${w} mm a season instead of ${w0}.`,
  infiltration: (i, i0) => `Deeper roots, more cover or less tillage can help rain soak in (index ${i} against ${i0}; ${CITE.nrcs}).`,
  forage: names => `Can add feed for animals, or hay or straw to sell${names.length ? ` (${listOf(names)})` : ''}.`,
  income: (i, i0) => `May add income on typical crop values, a rough guide and not your prices: ${i} against ${i0}.`,
  weather: (w, w0) => `May stand up better to heat, frost and drought: weather safety ${w} against ${w0} now.`,
  calmer: (y, y0, of) => `May cross fewer stress lines: no line was crossed in ${y} of ${of} tested years, against ${y0} for what you grow now.`,
  best: (label, v, v0) => `It offers no clear gain over what you grow now on these numbers; its best part is ${label}: ${v} against ${v0}.`,
  // what you grow now
  known: 'You already grow and sell these crops, so seed, machinery and buyers may already be in place.',
  strong: (label, v) => `It can keep a strong ${label} score here: ${v} of 100.`,
  breaks: 'The crop family changes every year, which can help break pest and disease cycles.',
});
export const PART_LABELS = Object.freeze({ water: 'water fit', soil: 'soil health', erosion: 'wash-off protection', income: 'income', weather: 'weather safety' });

// ---- what a farmer or adviser must check locally before acting
export const reviewWords = Object.freeze({
  drainage: 'Drainage: walk the field in a wet spring. Wet spots and tile drains change which crops and sowing dates work, and the weather square and satellites cannot see them.',
  markets: names => `Markets: ask a buyer or elevator near you whether they take ${listOf(names)}, and at what price, before you sow.`,
  seed: names => `Seed and machinery: check that you can get ${listOf(names)} seed, and that your planter, drill and combine can handle ${them(names.length)}.`,
  carryOver: name => `Herbicide carry-over: check the labels of the herbicides used on the crop before ${name} for how long you must wait before sowing it.`,
  pests: names => `Local pests and diseases: ask an adviser which pests and diseases of ${listOf(names)} are a problem near you, and whether this order of crops raises them.`,
  pestsNow: 'Local pests and diseases: ask an adviser whether pests and diseases of your crops are building up in your fields.',
  insurance: (names, who) => `Crop insurance: check the final sowing dates and whether ${listOf(names)} ${names.length === 1 ? 'is' : 'are'} covered (${who}).`,
  insurers: { ontario: 'in Ontario, Agricorp', ca: 'your provincial crop insurer', us: 'USDA Risk Management Agency, through your agent', other: 'your crop insurer' },
  cover: 'Cover crop: ask a local adviser which cover crop to sow, when to sow it and when to end it, most of all before a dry spring.',
  notill: 'Without ploughing: check the planter set-up for heavy residue, and how weeds will be controlled.',
  winter: name => `Winter survival: ask farmers near you how ${name} comes through the winter here; snow cover matters most.`,
  deepCold: (name, night) => `${cap(name)} survives only under steady snow cover here: in a cold winter, about once in ten years, the coldest night is about ${night} °C (NASA POWER), and hardened winter wheat survives about −24 °C (OMAFRA Field Crop News, Winter Survival). Ask farmers near you before you sow it.`,
  hay: 'Hay: check that you have the machinery and storage for hay, and a buyer if you keep no animals.',
  borderline: 'It only just suits this field on the weather record: ask farmers near you before you try it.',
  borderlineNow: 'What you grow now only just suits this field on the weather record: ask farmers near you how it does in a drier or colder year.',
  records: 'Your own records: hold these figures against your yields and costs from past years.',
});

// ---- the three strategies to compare first
export const OPPORTUNITY_WORDS = Object.freeze({ pest: 'can help interrupt pest cycles', water: 'may reduce water demand', infiltration: 'can help rain soak in', income: 'may add or keep income', soil: 'may build soil health' });
export const strategyWords = Object.freeze({
  now: 'What you grow now: every other strategy is compared with it.',
  suggest: opp => `Our suggestion: it passes every check and leads clearly; it ${OPPORTUNITY_WORDS[opp]}.`,
  worth: opp => `The best other option: our answer is to keep what you grow now, and this is the closest idea; it ${OPPORTUNITY_WORDS[opp]}.`,
  another: opp => `A different kind of change, for comparison: it ${OPPORTUNITY_WORDS[opp]}.`,
});
// A strategy built with a crop the nearby-crops rule had left out (js/engine.js relaxes the rule only when it leaves too few other rotations): said on that strategy, never silently.
const haWords = v => (v >= 10 ? Number(v.toPrecision(2)) : Math.max(1, Math.round(v))).toLocaleString('en-US');
export const rareWords = Object.freeze({
  some: (crop, ha) => `${crop} is grown on about ${haWords(ha)} ha nearby`,
  little: crop => `the crop map shows only a little ${crop} nearby`,
  none: (crop, country) => `the crop map shows no ${crop} near this field, but farmers in ${/^United /.test(country) ? 'the ' : ''}${country} grow it`,
  lead: parts => `Less common near you: ${parts.join('; ')}.`,
  leadNone: parts => `Not seen near you: ${parts.join('; ')}.`,
  left: crops => `This strategy is the exception: without ${listOf(crops)} Crophalo found too few other rotations to compare here.`,
});
// The answer is to keep what is grown now although an option scores higher: why, in one sentence each (the engine suggests a change only from a clear lead, js/engine.js STRONG).
export const keepWords = Object.freeze({
  close: (n, listed) => `It scores ${n} ${n === 1 ? 'point' : 'points'} higher, which is too small a difference to change what works${listed ? '; it is listed below as an option worth a look' : ''}.`,
  other: (name, score, why) => `${name} scores ${score}, but ${why}, so it is an idea to ask farmers near you about, not our suggestion.`,
  rare: 'it uses a crop that is less common near you',
  just: 'it only just suits this field',
});
export const fewWords = Object.freeze({
  lead: n => n === 1 ? 'Only what you grow now can be compared here' : `Only ${n} strategies can be compared here`,
  fails: n => `${n} other ${n === 1 ? 'idea does' : 'ideas do'} not suit this place`,
  cold: n => `${n} other ${n === 1 ? 'idea holds' : 'ideas hold'} a winter crop that survives only under steady snow cover here`,
  sameKind: 'the other ideas are the same kind of change as the one shown',
  limits: 'the limits you set left other crops out',
  none: 'Crophalo found no other rotation for this place',
  join: (lead, why) => `${lead}: ${listOf(why)}. Ask farmers near you or an adviser for other ideas.`,
});

// ---- the months the soil is bare
// years: how many years of the rotation each month is bare in (12 counts); of: the years of the rotation. Months with the same count are said together.
export function bareWords(years, of) {
  const groups = new Map(); years.forEach((n, m) => { if (n > 0) { if (!groups.has(n)) groups.set(n, []); groups.get(n).push(MONTH_NAMES[m]); } });
  const tail = ' (from the usual crop calendar on your normal weather).';
  if (!groups.size) return `The soil is covered in every month${tail}`;
  const parts = [...groups].sort((a, b) => b[0] - a[0]).map(([n, months]) => `${listOf(months)} ${of === 1 ? 'every year' : n === of ? `in every year of the rotation` : `in ${n} of every ${of} years`}`);
  return `Bare soil in ${listOf(parts)}${tail}`;
}

// ---- when the crops grown now are most exposed, counted year by year on the field's weather record
export const exposureWords = Object.freeze({
  stage: { up: 'coming up', flower: 'flowering and filling', fill: 'filling grain', bare: 'bare soil' },
  hazard: { frostSpring: 'frost after sowing', frostAutumn: 'frost before it ripens', heat: 'heat', dry: 'a dry month', heavy: 'heavy rain on bare soil' },
  frostSpring: (crop, n, of, month) => `${crop}: a frost after sowing, while it comes up (FAO-56 first stage), in ${n} of ${of} years, most often in ${month}.`,
  frostAutumn: (crop, n, of, month) => `${crop}: a frost before it starts to ripen (FAO-56 late stage), in ${n} of ${of} years, most often in ${month}.`,
  heat: (crop, line, n, of, months) => `${crop}: 3 or more days of ${line} °C or more in ${months}, when it flowers and fills (FAO-56 mid-season stage), in ${n} of ${of} years.`,
  dry: (crop, n, of, month) => `${crop}: ${month}, when it fills grain, had under half its usual rain in ${n} of ${of} years.`,
  heavy: (month, n, of) => `Heavy rain on bare soil: ${month}, when the soil is often bare, had a day of 20 mm of rain or more in ${n} of ${of} years.`,
  none: of => `No frost, heat, dry-month or heavy-rain line was crossed at these crops’ sensitive stages in the ${of} tested years.`,
  rule: 'Counted year by year on the field’s NASA weather record; the stages come from the FAO-56 crop calendar for this field. The 3-day heat line, the half-rain line and counting heavy rain only in months above 0 °C are Crophalo’s own.',
});
export { listOf as listWords };
