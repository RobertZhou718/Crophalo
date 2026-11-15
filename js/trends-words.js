// Crophalo's "Trends on this land" card, its words: every title, rule, sentence and note the card shows, in one table, so no screen can drift from it. Counts of real years only: no chance, no forecast, no promise.
// Pure: strings and small functions of numbers. The agronomy lines name their source key (js/sources.js, js/sources.more.js); a line without one says it is Crophalo's own rule.
// Checked by scripts/test_trends.mjs (every sentence on the recorded Barrie and Oxford records, the banned words, the trend wording only when the t rule is met).
const num = (v, d = 0) => { const t = Math.abs(v).toFixed(d).replace(/\.0+$/, ''); return (v < 0 && /[1-9]/.test(t) ? '−' : '') + t; };
const signed = (v, d = 0) => (v > 0 && /[1-9]/.test(num(v, d)) ? '+' : '') + num(v, d);
const list = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export const TW = Object.freeze({
  title: 'Trends on this land',
  lead: 'How the weather and the land around your field have changed, year by year. Each chart counts real years. A dashed line is drawn only when the change over the years is clearly bigger than the swing from one year to the next.',
  past: 'Past weather, not a forecast.',
  numbers: 'The numbers',
  year: 'Year',
  month: 'Month',
  notRead: 'Not read',
  none: 'No frost',
  noRecord: 'The weather record is not read yet, so there are no trends to show.',
  reading: 'Reading…',
  area: 'The weather is for a square about 50 km wide. Which part of your field dries out, floods or freezes first is not in this record: you know that from walking it.',
  rule: 'A trend is named when the straight line through at least 10 years is at least twice its own uncertainty (the same rule as the land history). Otherwise the card says there is no clear trend.',
  local: 'Before you change anything because of a trend, compare it with your own records and ask farmers near you or a local adviser.',
  // the trend sentence of a row, in the row's own unit; null slope means too few years
  trendClear: (word, size, unit) => `Over the years: ${word}, by about ${size}${unit ? ` ${unit}` : ''} every 10 years. A clear trend.`,
    trendNone: 'No clear trend: the years swing more than they move.',
  trendShort: n => `Only ${n} ${n === 1 ? 'year' : 'years'} read: too few to call a trend.`,
  yearsWord: (n, a, b) => `${n} ${n === 1 ? 'year' : 'years'}, ${a}–${b}`,

  heat: {
    title: 'Hot days for your crops',
    unit: 'days', axis: 'days', up: 'more hot days', down: 'fewer hot days',
    // limits: [{ names: ['Corn'], heat: 32 }]
    line: lims => `Heat lines Crophalo uses for your crops: ${list(lims.map(l => `${l.heat} °C for ${list(l.names)}`))}. The chart shows days at or above ${lims[0].heat} °C.`,
    lineAny: 'Days at or above 32 °C, the hot-day line of “Weather here since 2001” (no crop of your rotation was read).',
    said: (parts, a, b) => `In a middle year, ${a} to ${b}: ${list(parts)}.`,
    part: (med, heat) => `${med === '0' ? 'no days' : `about ${med} ${med === '1' ? 'day' : 'days'}`} at ${heat} °C or more`,
    estimate: 'Each crop’s heat line is Crophalo’s own estimate for the region, not a published figure. A local adviser may use another one.',
    col: lim => `Days at ${lim.heat} °C or more`,
  },
  springFrost: {
    title: 'Last frost of spring',
    unit: 'days', axis: 'day of the year', up: 'later', down: 'earlier',
    line: 'The last night below 0 °C before midsummer, year by year.',
    said: (med, a, b) => `The last spring frost came about ${med} in a middle year, ${a} to ${b}.`,
    none: 'No spring frost in the years read.',
    col: 'Last spring frost',
  },
  autumnFrost: {
    title: 'First frost of autumn',
    unit: 'days', axis: 'day of the year', up: 'later', down: 'earlier',
    line: 'The first night below 0 °C after midsummer, year by year.',
    said: (med, a, b) => `The first autumn frost came about ${med} in a middle year, ${a} to ${b}.`,
    none: 'No autumn frost in the years read.',
    station: 'Checked against 35 Environment and Climate Change Canada stations in Ontario (2001 to 2025): on NASA’s record the first autumn frost came a middle 11 days later than at the stations, while the last spring frost agreed within about a day. So at the stations the first frost came about 11 days before the dates shown here, and low, cold spots can freeze earlier still.',
    // when js/climate.js counts the autumn date with its station margin (C.frostMargin > 0), the dates shown are already moved to the stations' middle
    lineMargin: m => `The first night after midsummer below ${m} °C on NASA’s record, year by year (see the note below).`,
    corrected: m => `NASA’s night lows run warm in autumn, so here an autumn night under ${m} °C counts as the first frost, not 0 °C. Read that way, the date sits in the middle of what 35 Environment and Climate Change Canada stations in Ontario recorded (2001 to 2025). Low, cold spots can freeze earlier still.`,
    stationFar: 'This date is NASA’s own for the 50 km square. In Ontario, a check against 35 weather stations found NASA’s first autumn frost a middle 11 days late; low, cold spots can freeze earlier still.',
    col: 'First autumn frost',
  },
  heavy: {
    title: 'Heavy rain',
    unit: 'days', axis: 'days', up: 'more days of 20 mm or more', down: 'fewer days of 20 mm or more',
    line: 'Days with 20 mm of rain or more (the whole bar) and with 50 mm or more (the dark part), year by year.',
    said: (m20, m50, a, b) => `Days of 20 mm or more: about ${m20} a year, ${a} to ${b}. Days of 50 mm or more came ${m50}.`,
    m50: (n, of) => `in ${n} of ${of} years`,
    soil: 'Rain of this size on bare or thinly covered soil can carry topsoil away; living plants and crop residue slow it down.',
    satellite: 'Satellite rain joins two missions (TRMM until 2014, then GPM), so check a trend in heavy rain against a rain gauge near you.',
    col20: 'Days of 20 mm or more', col50: 'Days of 50 mm or more',
  },
  dry: {
    title: 'Dry spells',
    unit: 'days', axis: 'days', up: 'longer dry spells', down: 'shorter dry spells',
    line: 'The longest run of days with less than 1 mm of rain, in the growing months (April to September), year by year.',
    said: (med, top, topYear, a, b) => `The longest dry spell lasted about ${med} days in a middle year, ${a} to ${b}. The longest was ${top} days, in ${topYear}.`,
    col: 'Longest dry spell (days)',
  },
  balance: {
    title: 'Rain against water given off',
    unit: 'mm', axis: 'mm',
    line: 'Rain minus the water the land gives off to the air (soil and plants together), month by month in a middle year. Below the line, the land gives off more than it gets.',
    said: (short, top, topMonth) => short.length ? `In a middle year the land gives off more water than the rain brings in ${short.length === 1 ? `one month: ${short[0]}${top ? ` (${top} mm short)` : ''}` : `${short.length} months: ${list(short)}${top ? `, most in ${topMonth} (${top} mm short)` : ''}`}.` : 'In a middle year the rain brings at least as much as the land gives off, in every month.',
    what: 'The water given off is NASA POWER’s figure from NASA’s weather model (MERRA-2), for the whole 50 km square. It is not one crop’s water use and not a measurement in your field.',
    none: 'The water the land gives off was not read for this spot, so no balance is shown.',
    colRain: 'Rain (mm)', colEt: 'Given off (mm)', colBal: 'Rain minus given off (mm)',
  },
  stored: {
    title: 'Water stored in the region',
    unit: 'cm', axis: 'cm', up: 'more water stored', down: 'less water stored',
    line: 'The yearly average of the water stored in the ground, soil, snow and rivers over a region about 300 km wide, against NASA’s 2004 to 2009 average.',
    said: (n, a, b) => `${n} years read, ${a} to ${b}.`,
    gap: 'The GRACE satellites ended in 2017 and GRACE-FO began in 2018: the months in between have no data and are never filled in. A year counts with at least 6 months read; the running year is left out until it is over.',
    regional: 'This is the whole region, not a well or the soil of your field. The monthly record is under “What NASA satellites see”.',
    col: 'Yearly average (cm)', colMonths: 'Months read',
    none: 'The water-storage record was not read for this spot.',
  },
  green: {
    title: 'Greenness at its peak',
    unit: '', axis: 'greenness (NDVI)', up: 'greener at the peak', down: 'less green at the peak',
    line: 'How green the land round your place was at its greenest in each growing season (NDVI: 0 is bare ground, about 0.8 is thick green crop).',
    said: (med, a, b) => `The peak greenness was about ${med} in a middle season, ${a} to ${b}.`,
    patch: 'A 2 km patch round your place, from NASA’s MODIS pictures at 250 m: it can include roads, woods or a neighbour’s field.',
    col: 'Peak greenness',
    none: 'The greenness history did not answer, so none is shown.',
  },
  soil: {
    title: 'Soil moisture',
    unit: 'days', axis: 'days', up: 'more dry-soil days', down: 'fewer dry-soil days',
    line: 'Days in the growing months (April to September) when the root zone was less than 40 % wet, year by year: Crophalo’s own line for dry soil, on NASA POWER’s root-zone wetness from NASA’s weather model.',
    said: (med, top, topYear, a, b) => `Dry-soil days: ${med === '0' ? 'none' : `about ${med}`} in a middle year, ${a} to ${b}. The most was ${top}, in ${topYear}.`,
    smap: 'NASA’s SMAP satellite has measured soil moisture only since 2015, too few years for a trend on its own. Its newest reading is under “What NASA satellites see”.',
    col: 'Dry-soil days',
  },
  trendCol: 'Trend line',
  // the one-page part (js/trends-view.js trendsPartHTML): at most four sentences when opened, the rest under "Show more"
  partLead: 'What the record of this place shows over the years: past weather, not a forecast.',
  partClear: (title, word, size, unit, a, b, src) => `${title}: ${word}, by about ${size}${unit ? ` ${unit}` : ''} every 10 years (${a}–${b}, ${src}).`,
  partNone: (a, b) => `No clear trend from ${a} to ${b}: the years swing more than they move.`,
  partSource: (a, b) => `From NASA POWER, ${a}–${b}.`,
  more: 'Show more',
  spokenChart: (title, said, trend) => `${title}. ${said} ${trend}`,
});
export const fmt = Object.freeze({ num, signed, list });
