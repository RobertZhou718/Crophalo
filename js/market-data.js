// Crophalo's USDA Market News bids for each crop of each compared strategy, as plain sentences. United States fields only, and only when this server holds the owner's free key.
// A bid is a price on one day at a place. It is never income, it never enters a score or a ranking, and a figure that was not read is said to be "not read", never an old or typical price.
// Every number in a sentence is read from the server's answer (GET /api/mnfield, mode now) at run time; none is typed here. Prices are rounded half up to the cent (money()).
// Pure but for loadMarket() and startMarket(), which ask our own server only (the key stays on the server). The markup is js/market-view.js. Checked by scripts/test_market.mjs.
import { cropOf, cropName } from './crops.js';
import { plainReason } from './satellites2-data.js';
import { apiUrl } from './api.js';

// ---- small helpers
const fin = v => typeof v === 'number' && Number.isFinite(v);
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const dayNumber = d => (isDay(d) ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5 : NaN);
const lowerFirst = t => (t ? t[0].toLowerCase() + t.slice(1) : t);
export const listWords = items => (items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const STATUSES = ['own', 'neighbour', 'far', 'none_found', 'not_read'];
const SHOWN = ['own', 'neighbour', 'far'];
const MILLETS = new Set(['pmillet', 'fmillet']);   // never the report's "Millet" (proso)
const NEWEST_NOTE_AFTER = 7;   // days: past this the line says it is the newest report published

// The fifty states and the District of Columbia, by postal code, to say a report's state and a national report's buyer states in words.
export const STATE_NAMES = Object.freeze({
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
});
const BUYER_WORDS = Object.freeze({ 'Country Elevators': 'elevators', 'Terminals/Mills/Processors': 'terminals, mills or processors', 'Del Warehouse (Grower)': 'warehouses' });
const UNIT_WORDS = Object.freeze({ '$ per bushel': 'a bushel', '$ per hundred pounds': 'a hundred pounds' });

// ---- the fixed words (the sentences with read values are built below)
export const WORDS = Object.freeze({
  failCell: 'Market News bids: not read.',
  failDetail: 'USDA Market News did not answer just now, so its bids are not read. The rest of this report does not use them.',
  failLayer: 'USDA Market News did not answer just now, so its bids are not read.',
  bid: 'A bid, not your price.',
  first: 'What buyers reported paying, in the newest report for your area.',
  newest: 'This is the newest report Market News has published.',
  truck: 'Bids for grain delivered by truck to the elevator.',
  cover: 'The cover crop is grown to protect the soil, not to sell.',
  oneDay: 'These are bids on one day at elevators in a region, not what you will be paid. Your price, yield and costs differ.',
  takes: 'A bid shows a buyer. It does not say how much they will take.',
});
// The server's own refusals that mean "this piece is absent here", not "it failed": no key on the server, and a place outside the United States.
export const ABSENT_REASONS = Object.freeze([/needs the owner[’']s free key on this server, and none is set/, /^USDA Market News covers only the United States/]);
const absentReason = reason => typeof reason === 'string' && ABSENT_REASONS.some(x => x.test(reason));

// ---- rounding and dates
// Round half up on the decimal value: 3.945 gives 3.95 (plain Math.round(x * 100) gives 3.94, because 3.945 × 100 is 394.49999999999994 in binary).
export const cents = x => Math.round(Number((x * 100).toPrecision(12))) / 100;
export const wholeDollars = x => Math.round(Number(Number(x).toPrecision(12)));
// "$3.95" (a bushel, a hundred pounds) or, with unit 'ton', "$215" (whole dollars). Not a finite number, or below zero: null (the caller says "not read").
export function money(x, unit = 'bushel') {
  if (!fin(x) || x < 0) return null;
  if (unit === 'ton') return `$${wholeDollars(x).toLocaleString('en-US')}`;
  return `$${cents(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Mon, Nov 16, 2026" from "2026-11-16" (date only, no time zone). Anything else: ''.
export function dayUS(iso) {
  if (!isDay(iso)) return '';
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10), t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
  return `${DOW[t.getUTCDay()]}, ${MON[m - 1]} ${d}, ${y}`;
}
export const daysBetween = (a, b) => { const n = dayNumber(b) - dayNumber(a); return Number.isFinite(n) ? n : null; };

// ---- who gets this piece at all
// The field is in the United States and the server holds the Market News key. state: the app's state ({ loc: { cc } }) or a place ({ cc }); keys: the answer of GET /api/keys.
export function marketWanted(state, keys) {
  const cc = String(state?.loc?.cc ?? state?.cc ?? '').toUpperCase();
  return cc === 'US' && keys?.ams === true && keys?.ok !== false;
}
// The cash crops of a plan, in plan order, each once (a cover crop, a forage crop and fallow are never asked).
const isCash = id => typeof id === 'string' && cropOf(id)?.type === 'cash';
export function planCashCrops(plan) {
  const out = [];
  for (const s of Array.isArray(plan?.seasons) ? plan.seasons : []) for (const id of [s?.crop, s?.second && s.second.ok !== false ? s.second.crop : null]) if (isCash(id) && !out.includes(id)) out.push(id);
  return out;
}
export const planCrops = plan => (Array.isArray(plan?.seasons) ? plan.seasons : []).map(s => s?.crop).filter(c => typeof c === 'string');
export const hasCover = plan => (Array.isArray(plan?.seasons) ? plan.seasons : []).some(s => s && (s.cover || s.after === 'cover' || cropOf(s.crop)?.type === 'cover'));
const plansOf = result => { const out = []; for (const p of [result?.current, result?.recommended, ...(Array.isArray(result?.others) ? result.others : [])]) if (p && !out.some(q => q === p || (p.id !== undefined && q.id === p.id))) out.push(p); return out; };
// The crops to ask for: the cash crops of every plan in the report, sorted, each once, at most 16, each a Crophalo crop id.
export function cropsToAsk(result) {
  const all = new Set();
  for (const p of plansOf(result)) for (const id of planCashCrops(p)) if (/^[a-z]{2,12}$/.test(id)) all.add(id);
  return [...all].sort().slice(0, 16);
}

// ---- asking our server (never Market News itself: the key stays on the server and never appears in an address)
// Answers: null when the piece is absent here (not the United States, no key); { ok: false } on any failure; else the server's answer.
export async function loadMarket(place, crops, fetcher = globalThis.fetch?.bind(globalThis)) {
  if (String(place?.cc ?? '').toUpperCase() !== 'US' || !fin(place?.lat) || !fin(place?.lon) || typeof fetcher !== 'function') return null;
  let keys = null;
  try { const r = await fetcher(apiUrl('/api/keys'), { signal: AbortSignal.timeout(15e3) }); keys = r?.ok ? await r.json() : null; } catch { keys = null; }
  if (!keys) return null;   // the server did not say it holds the key: the piece is absent, as without the key
  if (!marketWanted({ cc: place.cc }, keys)) return null;
  const list = (Array.isArray(crops) ? crops : []).filter(c => typeof c === 'string' && /^[a-z]{2,12}$/.test(c));
  const url = apiUrl(`/api/mnfield?lat=${encodeURIComponent(place.lat)}&lon=${encodeURIComponent(place.lon)}&mode=now&crops=${[...new Set(list)].sort().slice(0, 16).join(',')}`);   // through apiUrl by hand: the address is kept in a name first
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(100e3) });
    let a = null; try { a = await r.json(); } catch { a = null; }
    if (a && a.ok === false && absentReason(a.reason)) return null;
    if (!r?.ok || !a || a.ok !== true || a.mode !== 'now') return { ok: false };
    return a;
  } catch { return { ok: false }; }
}
// The page glue, the same shape as the rough money line: asked after the engine has answered, so it never delays the first view. cur.market: undefined (absent), { loading: true }, { ok: false } or the answer.
export async function startMarket(cur, mine, redraw, fetcher) {
  if (!cur?.result?.ok || !cur.state?.loc) return;
  if (String(cur.state.loc.cc ?? '').toUpperCase() !== 'US') { cur.market = undefined; return; }
  cur.market = { loading: true };
  const answer = await loadMarket(cur.state.loc, cropsToAsk(cur.result), fetcher);
  cur.market = answer ?? undefined;
  if (typeof redraw === 'function') redraw(mine);
}

// ---- reading the answer
const reportOf = (answer, id) => (Array.isArray(answer?.reports) ? answer.reports : []).find(r => r && r.id === id) ?? (answer?.own?.id === id ? answer.own : null);
const windowDays = answer => daysBetween(answer?.window?.from, answer?.window?.to);
const okAnswer = a => a?.ok === true && isDay(a.today) && typeof a.place?.state_name === 'string' && a.place.state_name && Array.isArray(a.crops);
const ageOf = (e, today) => (fin(e.age_days) ? e.age_days : daysBetween(e.report_date, today));
const shownName = (id, e) => { const n = cropName(id, true); return n || (typeof e?.name === 'string' ? e.name : String(id)); };
// One crop as the page uses it: the server's status, checked again here, so a stopped report, a stale row or a missing price can never be read as today's bid.
export function cropStatus(answer, id) {
  const e = (answer.crops ?? []).find(c => c && c.crop === id) ?? null;
  const base = { crop: id, name: shownName(id, e), entry: e, report: null, status: 'not_read' };
  if (!e) return base;
  let status = STATUSES.includes(e.status) ? e.status : 'not_read';
  const report = e.report != null ? reportOf(answer, e.report) : null;
  if (MILLETS.has(id) && status !== 'not_read') status = 'none_found';
  if (SHOWN.includes(status)) {
    const age = ageOf(e, answer.today), span = windowDays(answer);
    if (!report || report.live !== true || typeof report.title !== 'string' || !dayUS(e.report_date) || !fin(age) || age < 0) status = 'not_read';
    else if (status !== 'far' && (!fin(span) || age > span || !fin(e.low) || !fin(e.high) || e.low > e.high || !Object.hasOwn(UNIT_WORDS, e.unit) || money(e.low) === null)) status = 'not_read';
    else if (status === 'neighbour' && !STATE_NAMES[report.state]) status = 'not_read';
  }
  return { ...base, report, status, age: ageOf(e, answer.today) };
}
const priceWords = e => { const a = money(e.low), b = money(e.high), u = UNIT_WORDS[e.unit]; return `${a === b ? a : `${a} to ${b}`} ${u}`; };
const regionNames = e => [...new Set((Array.isArray(e.regions) ? e.regions : []).map(r => r?.region).filter(r => typeof r === 'string' && r))];
const whereWords = (e, stateName) => { const names = regionNames(e); return names.length === 1 ? `in the ${names[0]}` : `across ${stateName}'s regions`; };
const placeWords = places => listWords((Array.isArray(places) ? places : []).filter(p => typeof p === 'string' && p).map(p => STATE_NAMES[p] ?? p));
const reportWords = r => `${r.title}, report ${r.id}`;
// The buyers of a far line, from `delivery_point` as printed: the one buyer, or, when the newest day has several, the server's `buyers` list.
const buyerWords = e => {
  const all = (typeof e.buyer === 'string' && e.buyer ? [e.buyer] : Array.isArray(e.buyers) ? e.buyers : []).filter(b => typeof b === 'string' && b);
  return all.length ? listWords([...new Set(all.map(b => BUYER_WORDS[b] ?? b))]) : 'buyers';
};
// The status words of one crop (the table of the specification). tail: the price line ends with "A bid, not your price."
export function statusLine(answer, c, { tail = true } = {}) {
  const e = c.entry, r = c.report, Crop = c.name, own = answer.place.state_name, newest = fin(c.age) && c.age > NEWEST_NOTE_AFTER ? ` ${WORDS.newest}` : '';
  if (c.status === 'own') return `${Crop}: ${own} elevators bid ${priceWords(e)} on ${dayUS(e.report_date)}, ${whereWords(e, own)} (${reportWords(r)}).${newest}${tail ? ` ${WORDS.bid}` : ''}`;
  if (c.status === 'neighbour') { const other = STATE_NAMES[r.state]; return `${Crop}: ${other} elevators bid ${priceWords(e)} on ${dayUS(e.report_date)}, ${whereWords(e, other)} (${reportWords(r)}). ${other}, not your area.${newest}${tail ? ` ${WORDS.bid}` : ''}`; }
  if (c.status === 'far') { const buyer = buyerWords(e), places = placeWords(e.places); return `${Crop}: bids only from ${buyer}${places ? ` in ${places}` : ''} on ${dayUS(e.report_date)} (${reportWords(r)}). Far from this field.${newest}`; }
  if (c.status === 'none_found') return `${Crop}: none found in the Market News grain reports Crophalo reads. That does not mean there is no buyer. Ask the elevators near you.`;
  const span = windowDays(answer);
  return r && typeof r.title === 'string' && fin(r.id) && fin(span) && span > 0 ? `${Crop}: not read. ${r.title} (report ${r.id}) has no bids in the last ${span} days.` : `${Crop}: not read.`;
}
const yearAgoLine = c => {
  const e = c.entry, lo = e.year_ago_low, hi = e.year_ago_high, u = UNIT_WORDS[e.unit], crop = lowerFirst(c.name);
  if (!fin(lo) || !fin(hi) || money(lo) === null || money(hi) === null) return `The report gives no year-ago figure for ${crop}.`;
  return money(lo) === money(hi) ? `A year earlier, the report's average was ${money(lo)} ${u} for ${crop}.` : `A year earlier, the report's averages ran from ${money(lo)} to ${money(hi)} ${u} for ${crop}.`;
};
// The credit line of one report used (part 5 of the specification).
export function creditLine(r) {
  const co = typeof r?.co_publisher === 'string' && r.co_publisher ? ` Issued with the ${r.co_publisher}.` : '', day = dayUS(r?.published);
  return `Market prices: USDA Agricultural Marketing Service, Market News, "${r.title}" (report ${r.id})${day ? `, ${day}` : ''}.${co} USDA Market News data is a work of the United States Government, in the public domain in the United States. Crophalo is not made, reviewed or endorsed by USDA or NASA.`;
}
const ownStoppedLine = (answer, anyNeighbour) => {
  const own = answer.own, day = dayUS(own?.published);
  if (!own || own.live === true || !fin(own.id) || !day) return '';
  return `${answer.place.state_name}'s own grain report (report ${own.id}) has not been published since ${day}.${anyNeighbour ? ' The bids shown are from other states.' : ''}`;
};
// The states of the reports whose bids a plan shows, in the order the server tried them.
const neighbourStates = (answer, list) => {
  const ids = new Set(list.filter(c => c.status === 'neighbour').map(c => c.report.id));
  return (answer.reports ?? []).filter(r => r && ids.has(r.id)).map(r => STATE_NAMES[r.state]).filter((s, i, a) => s && a.indexOf(s) === i);
};
const liveNeighbourStates = answer => (answer.reports ?? []).filter(r => r?.role === 'neighbour' && r.live === true && fin(r.rows_kept) && r.rows_kept > 0).map(r => STATE_NAMES[r.state]).filter((s, i, a) => s && a.indexOf(s) === i);
const absentSet = near => new Set((Array.isArray(near?.absent) ? near.absent : []).map(x => (typeof x === 'string' ? x : x?.crop)).filter(x => typeof x === 'string'));
const crops = n => (n === 1 ? 'crop' : 'crops');

// Everything one plan shows: { card, cell, evidence: [{ text, sources: ['ams'] }], gaps, risks, regions: [{ crop, heading, lines }], credits, counts: { k, n } }.
// null: nothing at all (no answer yet, the piece is absent, a plan that does not suit, a plan with no cash crop).
export function marketFor(answer, plan, result, near) {
  if (!answer || answer.loading || !plan || plan.flag === 'fails') return null;
  const ids = planCashCrops(plan);
  if (!ids.length) return null;
  const empty = { card: '', cell: '', evidence: [], gaps: [], risks: [], regions: [], credits: [], counts: { k: 0, n: ids.length } };
  if (!okAnswer(answer)) return { ...empty, failed: true, cell: WORDS.failCell, evidence: [{ text: WORDS.failDetail, sources: ['ams'] }] };
  const list = ids.map(id => cropStatus(answer, id)), State = answer.place.state_name, ownLive = answer.own?.live === true;
  const of = (...st) => list.filter(c => st.includes(c.status)), names = cs => listWords(cs.map(c => lowerFirst(c.name)));
  // the card line: the first case that applies
  let card = '';
  if (of('none_found', 'far').length) card = `No buyer found for ${names(of('none_found', 'far'))} in the Market News grain reports Crophalo reads.`;
  else if (of('own').length === list.length) card = `Bids in the ${State} report: ${names(list)}.`;
  else if (of('own', 'neighbour').length === list.length && of('neighbour').length) card = `Bids from ${listWords(neighbourStates(answer, list))}: ${names(list)}. Not ${State} prices.`;
  // the table cell, second line
  const n = list.length;
  let cell = '', k = 0;
  if (ownLive) { k = of('own').length; cell = `Bids in the ${State} report: ${k} of ${n} ${crops(n)}. ${WORDS.bid}`; }
  else { const states = neighbourStates(answer, list), named = states.length ? states : liveNeighbourStates(answer); k = of('neighbour').length; cell = named.length ? `Bids from ${listWords(named)}: ${k} of ${n} ${crops(n)}. Not a ${State} price.` : WORDS.failCell; }
  // the detail
  const evidence = list.map(c => ({ text: statusLine(answer, c), sources: ['ams'] }));
  const shown = of('own', 'neighbour', 'far'), priced = of('own', 'neighbour');
  if (priced.length && shown.every(c => c.entry.delivered_by_truck === true)) evidence.push({ text: WORDS.truck, sources: ['ams'] });
  for (const c of priced) evidence.push({ text: yearAgoLine(c), sources: ['ams'] });
  const gaps = [];
  if (of('own').length) gaps.push(`Which of the report's regions holds this field is not checked yet, so the bids cover all of ${State}.`);
  const stopped = ownStoppedLine(answer, of('neighbour').length > 0); if (stopped) gaps.push(stopped);
  if (hasCover(plan)) gaps.push(WORDS.cover);
  const risks = [], now = new Set(planCrops(result?.current)), absent = absentSet(near);
  if (priced.length) risks.push(WORDS.oneDay);
  if (priced.some(c => !now.has(c.crop))) risks.push(WORDS.takes);
  for (const c of of('none_found', 'far')) risks.push(`No buyer was found near this field for ${lowerFirst(c.name)} in the reports read. Find your buyer before you plant.`);
  for (const c of of('own')) if (absent.has(c.crop)) risks.push(`${State} elevators bid for ${lowerFirst(c.name)} on ${dayUS(c.entry.report_date)}, though little ${lowerFirst(c.name)} grows near this field (USDA crop map). Ask the elevator what it takes.`);
  // the fold "Each region": one line per region and crop, as the server gave them (two rows of one region on one day are both kept)
  const regions = priced.map(c => ({ crop: c.crop, heading: `${c.name} (${c.status === 'own' ? State : STATE_NAMES[c.report.state]})`,
    lines: (c.entry.regions ?? []).filter(r => r && typeof r.region === 'string' && fin(r.low) && fin(r.high) && money(r.low) !== null && r.low <= r.high)
      .map(r => `${r.region}: ${money(r.low) === money(r.high) ? money(r.low) : `${money(r.low)} to ${money(r.high)}`} ${UNIT_WORDS[c.entry.unit]} (${dayUS(c.entry.report_date)}). ${WORDS.bid}`) })).filter(g => g.lines.length);
  const used = new Set(shown.map(c => c.report.id));
  const credits = (answer.reports ?? []).filter(r => r && used.has(r.id) && typeof r.title === 'string').map(creditLine);
  return { card, cell, evidence, gaps, risks, regions, credits, counts: { k, n } };
}

// ---- the Layers card ("Local cash prices (USDA Market News)"): the state report's crops with the same status words
// { lines, bid, credits } or { failed: true, line } or null (nothing to add: the card keeps its own coverage words).
export function layerFor(answer) {
  if (!answer) return null;
  if (answer.ok === false && absentReason(answer.reason)) return { failed: true, line: plainReason(answer.reason, 'The cash bids did not answer.').replace(/\.?$/, '.') };   // the server's own words for "no key" and "not the United States"
  if (!okAnswer(answer)) return { failed: true, line: WORDS.failLayer };
  const list = (answer.crops ?? []).filter(c => c && typeof c.crop === 'string' && cropOf(c.crop)?.type === 'cash').map(c => cropStatus(answer, c.crop));
  const lines = [], stopped = ownStoppedLine(answer, list.some(c => c.status === 'neighbour'));
  if (stopped) lines.push(stopped);
  for (const c of list) lines.push(statusLine(answer, c, { tail: false }));
  const span = windowDays(answer), own = answer.own;
  if (!list.length && own?.live === true && fin(span) && span > 0) lines.push(`${own.title} (report ${own.id}) has no bids in the last ${span} days.`);
  if (!lines.length) return { failed: true, line: WORDS.failCell };
  const priced = list.filter(c => c.status === 'own' || c.status === 'neighbour'), used = new Set(list.filter(c => SHOWN.includes(c.status)).map(c => c.report.id));
  return { lines, bid: priced.length ? WORDS.bid : '', credits: (answer.reports ?? []).filter(r => r && used.has(r.id) && typeof r.title === 'string').map(creditLine) };
}
