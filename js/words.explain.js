// The words of the Data page's "How to read Crophalo" folds and of the word cards ("i" beside a word on other screens): plain text only, every agronomy line with its source.
// Pure: tables of text and the measured figures they quote. The markup is built from them in js/explain.js.
// Checked by scripts/test_explain.mjs (no banned word, a source on every statement, the station figures equal the ones written in the accuracy run's files).

// ---- the outside references these folds name that are not in the source table (js/sources.js); the others are named by their key there
export const REFS = Object.freeze({
  eccc: { name: 'Environment and Climate Change Canada, historical climate data', who: 'Environment and Climate Change Canada', url: 'https://climate.weather.gc.ca/' },
  nasaveg: { name: 'NASA Earth Observatory: Measuring Vegetation (NDVI and EVI)', who: 'NASA', url: 'https://science.nasa.gov/earth/earth-observatory/measuring-vegetation-ndvi-evi/' },
  sare: { name: 'Managing Cover Crops Profitably, 3rd edition (SARE)', who: 'Sustainable Agriculture Research and Education, a USDA programme', url: 'https://www.sare.org/resources/managing-cover-crops-profitably-3rd-edition/' },
  agronomy: { name: 'Ontario Agronomy Guide for Field Crops (OMAFRA)', who: 'Ontario Ministry of Agriculture, Food and Agribusiness', url: 'https://www.ontario.ca/document/agronomy-guide-field-crops' },
});

// ---- the frost check against the stations: the figures of the accuracy run over Ontario, NASA POWER minus each station, 35 stations, daily records 2001 to 2025
export const FROST_CHECK = Object.freeze({
  stations: 35, years: '2001 to 2025', firstBefore: 11, offBefore: 19, within5Before: 9, firstAfter: -1, offAfter: 9, within5After: 17,
  lastSpring: -1, temp: 0.3, rain: 0, rainTolerance: 15, margin: 2.5, reachKm: 300, barrieBefore: 'Oct 31', barrieAfter: 'Oct 19',
});

// ---- (1) the words: two plain sentences, then where Crophalo uses it, then the sources (keys of js/sources.js or REFS)
export const TERMS = Object.freeze([
  { id: 'et', word: 'Evapotranspiration', plain: 'water lost to the air',
    say: ['It is the water a field loses to the air: what dries out of the soil plus what the crop gives off through its leaves.', 'On hot, dry and windy days a crop loses more, so it needs more rain or more water stored in the soil.'],
    where: 'Each crop’s water need in Crophalo’s crop table is this loss over its season, from FAO’s crop water tables; the Water fit score compares it with your usual rain. NASA POWER’s daily figure for the water the land loses is read with your weather, and the Weather tab’s “Trends on this land” sets it against your rain, month by month.',
    src: ['fao56', 'faowater', 'power'] },
  { id: 'anomaly', word: 'Soil moisture anomaly', plain: 'wetter or drier than usual',
    say: ['It is how much wetter or drier the soil is now than it usually is in the same weeks of the year.', 'A figure alone says little: the same wetness can be normal in one place and dry in another.'],
    where: 'The Weather tab compares the root-zone wetness of the last 30 days with the usual for those weeks in earlier years of the NASA record, and says “Drier than usual” or “Wetter than usual” when the two differ by more than 4 points.',
    src: ['power', 'smap'] },
  { id: 'ndvi', word: 'NDVI (greenness)', plain: 'how green the field looks from space',
    say: ['NDVI compares the red light and the near-infrared light a field sends back: green leaves take in red light and send back near-infrared, so a higher number means more living green leaves.', 'Bare rock, sand or snow reads about 0.1 or less, grass about 0.2 to 0.3 and thick forest about 0.6 to 0.8; cloud, snow and water are not low greenness, so Crophalo leaves them out.'],
    where: 'The Satellites tab shows your field’s greenness from NASA HLS pictures (30 m dots) for the last 12 months, and Land history shows each season’s greenest point since 2001 from NASA MODIS (250 m dots).',
    src: ['nasaveg', 'hls'] },
  { id: 'frost', word: 'Frost risk', plain: 'how often a frost hits a crop',
    say: ['A frost night is a night when the air falls to 0 °C or below; it can kill young plants in spring and stop a crop before it is ripe in autumn.', 'Frost risk is how often, in past years, such a night came after a crop was sown or before it was harvested.'],
    where: 'The Weather tab gives the usual last spring frost and first autumn frost over the years since 2001, and the Weather safety score counts the years a frost would have hit each crop.',
    src: ['power', 'rules'] },
  { id: 'balance', word: 'Water balance', plain: 'water in against water out',
    say: ['A water balance adds up the water that comes in (rain, water stored in the soil, watering) and the water that goes out (the crop’s loss to the air, runoff and drainage).', 'When more goes out than comes in, the soil dries and the crop runs short of water.'],
    where: 'For each crop, Crophalo adds 80 % of the usual rain in its season, the soil water left from the months before sowing and any watering you said you have, and compares that with the crop’s water need. If it covers less than about 6 of every 10 mm the crop needs, the crop is left out unless you water.',
    src: ['fao56', 'rules'] },
  { id: 'gdd', word: 'Growing degree days', plain: 'the warmth a crop gets',
    say: ['Crops grow faster in warm weather, and degree days count that warmth: each day adds how far its average temperature is above 10 °C.', 'Added up through the season, they show whether there is enough warmth for a crop to ripen.'],
    where: 'The Weather tab’s “Warmth for crops this season” counts degree days the corn way (base 10 °C, highs counted up to 30 °C) and says Warmer or Cooler when this season is more than 6 % off the earlier years.',
    src: ['nch40', 'power'] },
  { id: 'rootzone', word: 'Root zone', plain: 'the soil the roots reach',
    say: ['The root zone is the layer of soil a crop’s roots reach and drink from, often about the top metre.', 'Water deeper than the roots cannot help the crop, and a deep-rooted crop can reach water a shallow one cannot.'],
    where: 'NASA POWER and NASA SMAP give the wetness of the root zone (SMAP: the top metre, for a 9 km square). The crop table gives each crop’s rooting depth from FAO’s tables, and a deeper root lets a crop use more of the water stored before sowing.',
    src: ['smap', 'power', 'fao56'] },
  { id: 'lst', word: 'Land-surface temperature', plain: 'how hot the ground and leaves are',
    say: ['It is how hot the ground and the leaves themselves are, read from space by the heat they give off; it is not the air temperature a weather station measures in the shade.', 'On a sunny afternoon dry or bare ground can be hotter than the air, while a crop with enough water stays cooler because it is losing water to the air.'],
    where: 'The Satellites tab shows NASA ECOSTRESS readings of your field’s own 70 m square on each clear pass in the last 60 days, day and night kept apart.',
    src: ['ecostress'] },
]);

// ---- the word "i" on other screens: which heading carries which word (data attributes the screens already write)
export const WORD_SPOTS = Object.freeze([
  { sel: '[data-fact="frost"] > h3', id: 'frost' }, { sel: '[data-fact="free"] > h3', id: 'frost' },
  { sel: '[data-tile="warm"] > h3', id: 'gdd' }, { sel: '[data-tile="soil"] > h3', id: 'anomaly' },
  { sel: '[data-fact="dry"] > h3', id: 'et' }, { sel: '[data-fact="dryyears"] > h3', id: 'balance' },
  // a satellite card is one closed line whose heading sits in its summary (js/satcard.js): the word's "i" goes on the first line inside the card, never into the summary itself
  { sel: '[data-card="smap"] .sat-fold > p:first-of-type', id: 'rootzone' }, { sel: '[data-card="hls"] .sat-fold > p:first-of-type', id: 'ndvi' }, { sel: '[data-card="ecostress"] .sat-fold > p:first-of-type', id: 'lst' },
]);

// ---- (3) one field, many square sizes: each dataset's square, how Crophalo brings it to the field (the lookups of scripts/live/ and js/data.js), its source key
// w and h in metres east-west and north-south; deg: a grid in degrees, turned into metres at the field's latitude
export const EXAMPLE_FIELD_HA = 40;
export const FOOTPRINTS = Object.freeze([
  { id: 'grace', short: 'GRACE, GRACE-FO', name: 'NASA GRACE and GRACE-FO water stored in the ground', size: 'about 300 km', w: 300e3, h: 300e3, src: 'grace',
    how: 'One 0.5° cell of NASA JPL’s mascon solution, month by month; each value stands for a whole region about 300 km across.' },
  { id: 'power', short: 'NASA POWER', name: 'NASA POWER daily weather', size: 'about 50 km', deg: [0.625, 0.5], src: 'power',
    how: 'The value of the 0.5° by 0.625° square that holds the field, every day since 2001; temperatures are moved to your field’s height.' },
  { id: 'imerg', short: 'GPM IMERG', name: 'NASA GPM IMERG rain', size: 'about 10 km', deg: [0.1, 0.1], src: 'gpm',
    how: 'The 0.1° square that holds the field, one value a day for the last 30 days (Satellites tab). The rain record since 2001 reaches Crophalo through NASA POWER, at POWER’s square.' },
  { id: 'smap', short: 'SMAP', name: 'NASA SMAP soil moisture', size: '9 km', w: 9e3, h: 9e3, src: 'smap',
    how: 'The 9 km square that holds the field, from the newest file.' },
  { id: 'modispatch', short: 'MODIS patch', name: 'NASA MODIS greenness, the patch read', size: 'about 2 km', w: 2e3, h: 2e3, src: 'gibs',
    how: 'For Land history: the middle (median) value of the 250 m dots in a patch about 2 km round the field, at each season’s greenest point since 2001.' },
  { id: 'modislst', short: 'MODIS 1 km', name: 'NASA MODIS land temperature', size: '1 km', w: 1e3, h: 1e3, src: 'gibs',
    how: 'A picture layer on the map only; it is not turned into a number for your field.' },
  { id: 'modis', short: 'MODIS · soil map', name: 'NASA MODIS greenness dot, and the ISRIC SoilGrids soil map', size: '250 m', w: 250, h: 250, src: 'soilgrids',
    how: 'One MODIS dot is 250 m. The soil map is read for the one 250 m dot at the field’s spot, top 30 cm.' },
  { id: 'hlsbox', short: 'HLS 3 × 3', name: 'NASA HLS (Landsat and Sentinel-2), the box read', size: '90 m', w: 90, h: 90, src: 'hls',
    how: 'A box of 3 by 3 dots round the field’s spot; dots under cloud, cloud shadow, snow or water are left out, never read as low greenness.' },
  { id: 'ecostress', short: 'ECOSTRESS', name: 'NASA ECOSTRESS ground temperature', size: '70 m', w: 70, h: 70, src: 'ecostress',
    how: 'The field’s own 70 m square on each clear pass.' },
  { id: 'dot30', short: 'HLS dot · heights', name: 'NASA HLS dot, and the height map', size: '30 m', w: 30, h: 30, src: 'dem',
    how: 'One HLS dot is 30 m. Heights come from the finest free height map at the place: lidar of 1 to 2 m where Canada or the US has it, else Copernicus GLO-30 or NASA’s NASADEM (made from the SRTM radar), both 30 m.' },
]);
// the three pictures: each to scale inside itself, each the small dashed box of the one before
export const PANELS = Object.freeze([
  { id: 'p1', across: 400e3, title: 'A region 400 km across', show: ['grace', 'power'] },
  { id: 'p2', across: 12e3, title: 'Zoomed in: 12 km across', show: ['imerg', 'smap', 'modispatch', 'modislst'] },
  { id: 'p3', across: 1.2e3, title: 'Zoomed in again: 1.2 km across', show: ['modis', 'hlsbox', 'ecostress', 'dot30', 'field'] },
]);

// ---- (5) how crops help the soil: the plain words are the crop table's own (WHAT_IT_DOES in js/crops.js); here the sourced line and how the crops are picked from the table
export const ROLES = Object.freeze([
  { id: 'nfix', title: 'Nitrogen-fixing crops', pick: 'crops the table gives some nitrogen for the next crop',
    line: 'Legumes carry bacteria in small lumps on their roots that take nitrogen from the air; part of it can stay in the soil for the next crop, while a crop hauled off as grain takes much of it away.', src: ['sare', 'agronomy'] },
  { id: 'cover', title: 'Cover crops', pick: 'the cover crops of the table',
    line: 'A cover crop grown between main crops keeps the ground covered against rain and wind, adds plant matter to the soil and can take up nitrogen that would otherwise wash away.', src: ['sare', 'erosion'] },
  { id: 'deep', title: 'Deep-rooting crops', pick: 'crops whose roots reach 1.5 m or deeper in the table (FAO’s rooting depths where FAO lists the crop)',
    line: 'Deep roots can reach water and nutrients below the reach of shallow crops, and the channels they leave can help rain soak in.', src: ['sare', 'fao56'] },
  { id: 'drought', title: 'Drought-tolerant crops', pick: 'crops with a drought tolerance of 0.65 or more in the table (from FAO’s yield response to water)',
    line: 'FAO’s yield response factor shows how much a crop’s yield falls when it is short of water: a crop with a low factor loses less in a dry year.', src: ['faoky', 'ecocrop'] },
]);
export const ROLE_LIMITS = Object.freeze({ deepRoot: 1.5, drought: 0.65 });

// ---- the folds: title, the spoken sentence, and the text of each part
export const EX = Object.freeze({
  heading: 'How to read Crophalo',
  lead: 'Six short parts: the words the screens use, how sure the figures are, and where your own knowledge decides.',
  listen: 'Listen', sourcesWord: 'Sources', opens: '(opens in a new tab)',
  remind: { title: 'You decide.', text: 'Crophalo is a guide to think with. It does not replace your own judgement or a local adviser. You know best how your soil drains, what buyers near you pay, the machines and help you have, and the pests on farms around you. Before you change what you plant, talk to someone who knows your area.' },
  more: 'Show more',
  leads: f => ({
    words: names => [`Eight words the screens use, each in two plain sentences: ${names.join(', ')}.`, 'Each one says where Crophalo uses it.'],
    ground: ['A gauge measures one spot, and a satellite or a weather model gives one figure for a whole square, so your field can differ.', `We checked Crophalo’s weather against ${f.stations} weather stations in Ontario, ${f.years}.`, `Temperature (a middle ${f.temp} °C apart), rain (a middle ${f.rain} %) and the last spring frost (a middle ${Math.abs(f.lastSpring)} day apart) agreed.`, `The first autumn frost did not: NASA’s record put it a middle ${f.firstBefore} days too late.`],
    grid: ['Each kind of data comes in squares of its own size, from 300 km down to 30 m.', 'Crophalo takes the square that holds your field.', 'A big square’s figure is never drawn as a pattern inside your field.'],
    decide: ['Crophalo does not use a trained model.', 'It uses fixed, written rules and counts over NASA’s daily weather since 2001, your soil and your answers.', 'It says how sure it is, and why.'],
    crops: ['Some crops help the soil in their own way: nitrogen-fixing, cover, deep-rooting and drought-tolerant crops.', 'The crops in Crophalo’s table that have each role are listed.'],
  }),
  words: { title: 'Words explained', say: 'Eight words the screens use, each in two plain sentences, with where Crophalo uses it.', usesWord: 'Where Crophalo uses it:', allWords: 'All the words, on the Data page' },
  ground: { title: 'Satellite and ground', say: 'A gauge measures one spot; a satellite or a weather model gives one figure for a whole square, so your field can differ, and your own soil test and rain gauge make the answer better.',
    gaugeHead: 'What each one sees',
    gauge: ['A rain gauge or a thermometer measures one spot, exactly, and only that spot.', 'A satellite measures a whole square from above. NASA POWER’s weather is a model that joins satellite and ground readings into one figure a day for a square about 50 km wide.', 'So your field can differ from both: a low spot can be colder on a clear night, a hill windier, and a summer storm can miss a gauge or hit only your field.'],
    checkHead: 'Our own check against 35 weather stations',
    checkLead: f => `Crophalo’s weather was checked against the daily records of ${f.stations} Environment and Climate Change Canada weather stations in Ontario, ${f.years}, each against NASA POWER’s square that holds it, counted the same way.`,
    agreed: f => `Most of it agreed: the yearly mean temperature (NASA a middle ${f.temp} °C warmer), the yearly rain (a middle difference of ${f.rain} %) and the last spring frost (a middle ${Math.abs(f.lastSpring)} day apart).`,
    late: f => `The first autumn frost did not: on NASA’s record it came a middle ${f.firstBefore} days later than at the stations, and ${f.offBefore} of the ${f.stations} stations were more than 10 days off. On the clear, still nights that bring the first frost, a field cools more than the average of a 50 km square.`,
    fixed: f => `So, within ${f.reachKm} km of those stations, Crophalo counts a night under ${f.margin} °C on NASA’s record as the first autumn frost. On the same ${f.stations} stations the middle difference became ${Math.abs(f.firstAfter)} day, and ${f.within5After} of them (${f.within5Before} before) are now within 5 days. Near Barrie the first autumn frost moves from about ${f.barrieBefore} to about ${f.barrieAfter}. The words beside it say that low, cold spots can get frost two weeks earlier, or more. Farther from the stations, the date is NASA’s own.`,
    notYet: f => `Until the correction for this is in your copy of Crophalo, read the first autumn frost on the Weather tab as likely to come about ${f.firstBefore} days earlier in Ontario, and earlier still in low, cold spots.`,
    yoursHead: 'How your own readings help',
    soilTest: 'Your soil test: in the water and soil step, open “I have a soil test” and type what your lab report says. Each number you type replaces the soil map’s guess, the crop limits for pH and salt are checked, and the answer can become more sure.',
    gauge2: f => `Your rain gauge: Crophalo cannot read it yet. Compare your yearly total with “Typical yearly rain” on the Weather tab. If they differ by more than ${f.rainTolerance} %, the limit the station check used, read the water scores with care and tell your adviser.`,
    local: 'Where your knowledge decides: frost hollows, wet spots and windy hills inside your field are not in any of these squares.' },
  grid: { title: 'One field, many square sizes', say: 'Each kind of data comes in squares of its own size, from 300 km down to 30 m; Crophalo takes the square that holds your field, and a big square’s figure is never drawn as a pattern inside your field.',
    lead: f => `Each picture is drawn to scale, centred on the field; in truth the field sits somewhere inside each square. The field is an example of ${f} ha. The dashed box is the next picture.`,
    figTitle: 'Data square sizes around one field', fieldLabel: f => `Example field, ${f} ha`, nextBox: 'next picture',
    tableCap: 'The same in words', cols: ['Data', 'Square', 'How Crophalo brings it to your field', 'Against the example field'],
    holds: n => `One square holds about ${n} fields of this size`, across: n => `About ${n} of its squares across the field`, fieldRow: 'Your field', fieldHow: 'The outline you draw; its slope is worked out from the height map inside the outline.',
    timeHead: 'Days, months and seasons',
    time: 'Daily values are grouped: for each month, the middle (median) of the years since 2001 gives a normal year, and seasons are counted from each crop’s sowing to its harvest. Counts are written as counts, like “in 4 of 25 years”, never as a chance.',
    sureHead: 'What the size means for how sure it is',
    sure: ['A figure from a big square is one number for the whole square: every field in that SMAP square gets the same soil moisture, and every field in that GRACE and GRACE-FO region the same water storage trend. So it is never drawn as a pattern inside your field.', 'The smaller the square, the more it says about your own field. The bigger the square, the more your own eyes, your gauge and your soil test matter.'] },
  decide: { title: 'How Crophalo decides', say: 'Crophalo does not use a trained model: it uses fixed, written rules and counts over NASA’s daily weather since 2001, your soil and your answers, and it says how sure it is and why.',
    how: ['Crophalo does not use a trained model. It applies fixed, written rules and counts to NASA’s daily weather since 2001, the soil and your answers. The same answers always give the same result, and each step can be read and checked.', 'Other tools look for patterns with statistics or with models trained on many fields. Crophalo keeps to medians and counts for your one place: with about 25 years of one place there are few examples to learn from, and a rule can be checked against its published source and tested against expected answers. Where Crophalo speaks of a trend over the years, it uses one plain statistical test: a straight line through at least 10 years, called clear only when the rise or fall is at least twice its own uncertainty (t of 2 or more).', 'The rain and temperature sliders on the report run the same rules on a drier or wetter (−40 % to +30 % rain) or warmer (up to +4 °C) version of your weather.'],
    partsHead: 'The five parts of the score, and what moves them',
    parts: { water: 'Moves with the crop’s water need against your usual rain, the soil water left from before sowing and your watering. Crops that need less score higher; a cover crop’s own water use counts against it.',
      soil: 'Moves with the plant matter each crop leaves, the nitrogen legumes add, rooting depth, the months the ground is covered and how many crop families the rotation has. Bare fallow lowers it; less tillage keeps more plant matter.',
      erosion: 'Moves with the months the ground is bare, weighted by the rain and heavy-rain days of those months, your slope and your soil. Months with frozen ground count less.',
      income: 'Moves with a rough value for each crop from the crop table (not today’s prices), feed value if you keep livestock, and the cost of watering.',
      weather: 'Moves with the hot days in each crop’s season, the years a frost would have hit it and the dry years, softened by your watering.' },
    extra: 'Your priorities (0 to 5 for each part) set how much each part counts. A tenth of the score is the pest break: neighbouring crops of different families break pest and disease cycles. More crops, cover crops and second crops take a little off for the extra work, more if you said you are short on workers or machines. If you ticked “Less fertiliser to buy”, legumes in the plan add up to 5 points.',
    sureHead: 'How sure is this?',
    sureLead: 'Every answer gives one of three levels. It is never a chance of success.',
    sureHow: 'The level rises when a suggestion scores well ahead (8 points is “clearly”, 15 “well ahead”), when the soil comes from a soil map or your test, when the weather is NASA’s, and when the slope is measured on a field you drew. It falls when the soil is assumed. A change is only suggested when it scores at least 8 points ahead of what you grow now.',
    localHead: 'Where local knowledge decides',
    local: ['How your soil drains: tile drains, wet spots and ponding are not in the soil map.', 'Markets: which buyers are near, what they pay and any contracts.', 'Machines and help: a planter, a combine head, storage and the hands to do the work.', 'Pests and diseases in the neighbourhood this year, and local rules.'] },
  crops: { title: 'How crops help the soil', say: 'Nitrogen-fixing crops, cover crops, deep-rooting crops and drought-tolerant crops each help the soil in their own way; the crops in Crophalo’s table that have each role are listed.',
    inTable: 'In Crophalo’s crop table', how: 'Picked from the table:', note: 'These are rules of thumb for whole regions. Whether a crop does this on your field depends on your soil, your weather and how it is grown.' },
});
