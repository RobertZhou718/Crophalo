// Crophalo's texts that leave the app as words: the short text a basic phone can read (one message, or the few that its warnings need) and the long
// message for a chat or an email. Warnings are never dropped; notes and the soil test are left out unless ticked; a "What did you notice?" note never goes.
// Pure: no page, no storage, no network. The sheet that shows them is js/discuss.js's neighbour in the report; this file is only the words.
// Checked by scripts/test_sharetext.mjs (the message counter, the plain forms, a frost week, a 70-letter Turkish text, the long message line by line).
/*
 *
 * The report these functions read is plain data (the report object does not exist yet), shaped as:
 * { name, place: { label, lat, lon, ha }, madeOn: 'YYYY-MM-DD', garden: bool,
 * suggestion: { headline: 'Try corn, then soybeans', warning, why, score, years: ['Corn', 'Soybeans'] } | null, nowScore, sowLine: 'Sow wheat from 12 Oct' | '',
 * warnings: [{ kind: 'frost'|'heat'|'rain'|'wind'|'storm', days: ['Mon','Tue'], value: '-3C' | '38C' | '25mm' | '55kmh', danger?: true }],
 * frostNormal: 'text', checkFirst: ['...'], notes: [{ text, kind }], soilTestLines: ['pH 6.4 (near neutral)'], backupNote: '' }
 */

// A score is a number from the report engine. A plan that does not suit here has none (null), and a missing score is never printed as 0.
export const isScore = v => typeof v === 'number' && Number.isFinite(v);

// ---- counting what a phone will charge for
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTRA = '^{}\\[~]|€\f';   // each of these takes two places
const GSM_SET = new Set(GSM), EXTRA_SET = new Set(GSM_EXTRA);
export const LIMITS = { gsmOne: 160, gsmPart: 153, ucsOne: 70, ucsPart: 67 };
// { units, parts, ucs, perMessage }: how many places the text takes, in how many messages, and whether a letter outside the basic set makes it 70 per message.
export function smsCount(text) {
  const t = String(text ?? ''); let gsm = 0, ucs = false;
  for (const ch of t) { if (GSM_SET.has(ch)) gsm += 1; else if (EXTRA_SET.has(ch)) gsm += 2; else { ucs = true; break; } }
  if (!ucs) { const parts = gsm === 0 ? 0 : gsm <= LIMITS.gsmOne ? 1 : Math.ceil(gsm / LIMITS.gsmPart); return { units: gsm, parts, ucs: false, perMessage: parts > 1 ? LIMITS.gsmPart : LIMITS.gsmOne }; }
  const units = t.length, parts = units <= LIMITS.ucsOne ? 1 : Math.ceil(units / LIMITS.ucsPart);   // t.length counts UTF-16 places, as the network does
  return { units, parts, ucs: true, perMessage: parts > 1 ? LIMITS.ucsPart : LIMITS.ucsOne };
}
const PLAIN = [[/\s*°\s*C\b/g, 'C'], [/\s*°\s*F\b/g, 'F'], [/\s*°/g, ''], [/[−–—‑]/g, '-'], [/→/g, '>'], [/…/g, '...'], [/[‘’′]/g, "'"], [/[“”″]/g, '"'], [/×/g, 'x'], [/·/g, '-'], [/ /g, ' ']];
// Symbols a basic phone cannot show, in the plain forms it can ("−2 °C" → "-2C"). The farmer's own letters stay as they are: they are their words.
export const plainSms = text => PLAIN.reduce((t, [from, to]) => t.replace(from, to), String(text ?? ''));

// ---- dates
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const shortDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? `${+day.slice(8)} ${MON[+day.slice(5, 7) - 1]}` : '';
export const longDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? `${+day.slice(8)} ${MONTH[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}` : '';
const at4 = v => (Math.round(+v * 1e4) / 1e4).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
export const position = place => Number.isFinite(+place?.lat) && Number.isFinite(+place?.lon) ? `${at4(place.lat)},${at4(place.lon)}` : '';

// ---- warnings
export const WARNING_ORDER = Object.freeze(['frost', 'heat', 'rain', 'wind', 'storm']);
const LABEL = { frost: 'FROST', heat: 'HEAT', rain: 'RAIN', wind: 'WIND', storm: 'STORM' };
const clean = (list) => (Array.isArray(list) ? list : []).filter(w => w && Object.hasOwn(LABEL, w.kind));
// A Danger heat-index warning replaces plain heat; the rest keep the order frost, heat, heavy rain, wind, thunderstorm.
export function orderedWarnings(list) {
  const all = clean(list), danger = all.some(w => w.kind === 'heat' && w.danger);
  return all.filter(w => !(w.kind === 'heat' && !w.danger && danger)).sort((a, b) => WARNING_ORDER.indexOf(a.kind) - WARNING_ORDER.indexOf(b.kind));
}
export const tinyWarning = w => plainSms(`${w.danger ? 'DANGER ' : ''}${LABEL[w.kind]} ${(w.days ?? []).join(',')}${w.value ? ` ${w.value}` : ''}`.replace(/\s+/g, ' ').trim());
export const warningLine = w => {   // the long form, one line each
  const days = (w.days ?? []).join(', '), what = { frost: 'Frost', heat: w.danger ? 'Danger: dangerous heat' : 'Heat', rain: 'Heavy rain', wind: 'Strong wind', storm: 'Thunderstorm' }[w.kind];
  return `${what}${days ? ` ${days}` : ''}${w.value ? `: ${w.value}` : ''}`;
};

// ---- the short text
// Cut a line at a word so that fit(candidate) is true; add "..." when something was cut. null when not even a few words fit.
function cutToFit(prefix, line, fit) {
  const words = line.split(' ');
  for (let n = words.length; n >= 1; n--) { const cut = words.slice(0, n).join(' '), text = prefix + cut + (n < words.length ? '...' : ''); if (fit(text)) return n >= 2 || n === words.length ? text : null; }
  return null;
}
// { text, parts, ucs, units, holdsPosition, dropped }. All warnings come first and are never dropped: when they alone need more than one message the
// text goes in as many as they need and nothing else is added. Otherwise each further part is added only while the whole still fits one message.
export function shortText(report, { withPosition = true } = {}) {
  const warnings = orderedWarnings(report?.warnings).map(tinyWarning), nl = '\n';
  const base = warnings.join(nl), one = t => smsCount(t).parts <= 1;
  const out = { holdsPosition: false, dropped: [] };
  if (warnings.length && !one(base)) { const c = smsCount(base); return { ...out, text: base, parts: c.parts, ucs: c.ucs, units: c.units }; }
  let text = base;
  const add = (line, label, { cut = false } = {}) => {
    if (!line) return;
    const joined = text ? text + nl : '';
    if (one(joined + line)) { text = joined + line; return true; }
    if (cut) { const c = cutToFit(joined, line, one); if (c) { text = c; return true; } }
    out.dropped.push(label); return false;
  };
  const sug = report?.suggestion, name = String(report?.name ?? '').trim();
  const line = sug?.headline ? plainSms(`${name ? `${name}: ` : ''}${sug.headline}`) : report?.garden && name ? plainSms(name) : '';
  add(line, 'suggestion', { cut: true });
  add(plainSms(report?.sowLine ?? ''), 'sowing');
  const pos = withPosition ? position(report?.place) : '';
  if (pos && add(`Field at ${pos}`, 'position')) out.holdsPosition = true;
  add(`Crophalo ${shortDay(report?.madeOn)}`.trim(), 'date');
  const c = smsCount(text);
  return { ...out, text, parts: c.parts, ucs: c.ucs, units: c.units };
}

// ---- the long message
export const GUIDE = 'A guide, not advice. You decide. Check with farmers near you or your farm adviser before you change anything.';
export const MAX_NOTES = 5, NOTE_CHARS = 300;
// The words for a chat or an email, line by line. link goes last; ticks: notes and soilTest, both off unless true.
export function longMessage(report, { notes = false, soilTest = false, link = '' } = {}) {
  const r = report ?? {}, L = [];
  const where = [r.place?.label, position(r.place), Number.isFinite(+r.place?.ha) ? `${(+r.place.ha).toFixed(1)} ha` : ''].filter(Boolean).join(' · ');
  L.push(`Crophalo: ${r.name || 'My field'}`);
  if (where) L.push(where);
  const w = orderedWarnings(r.warnings);
  if (w.length) L.push('', 'Weather warnings this week (forecast):', ...w.map(x => `- ${warningLine(x)}`));
  const s = r.suggestion;
  if (r.garden) L.push('', 'A tree or bush crop has no options to compare. Its weather, frost, rain, slope and soil are in the report.');
  else if (s) {
    L.push('', `Our suggestion: ${s.headline}`);
    if (s.warning) L.push(s.warning);
    if (s.why) L.push(`Why: ${s.why}`);
    if (isScore(s.score)) L.push(`It scores ${Math.round(s.score)} out of 100.${isScore(r.nowScore) ? ` What you grow now scores ${Math.round(r.nowScore)}.` : ''}`);
    if (Array.isArray(s.years) && s.years.length) L.push('', 'Year by year:', ...s.years.map((y, i) => `${i + 1}. ${y}`));
  }
  const strat = Array.isArray(r.strategies) ? r.strategies.filter(x => x?.headline) : [];
  if (!r.garden && strat.length > 1) L.push('', `${strat.length === 3 ? 'Three strategies' : `${strat.length} strategies`} compared:`, ...strat.map(x => `- ${x.roleWords ?? 'Option'}: ${x.headline}${isScore(x.score) ? ` (score ${Math.round(x.score)})` : x.flag === 'fails' ? ' (does not suit this place)' : ''}`));
  if (r.frostNormal) L.push('', `Frost in a normal year: ${r.frostNormal}`);
  if (Array.isArray(r.checkFirst) && r.checkFirst.length) L.push('', 'Check first:', ...r.checkFirst.map(x => `- ${x}`));
  const mine = notes ? (Array.isArray(r.notes) ? r.notes : []).filter(n => n && n.kind !== 'notice' && String(n.text ?? '').trim()).slice(0, MAX_NOTES).map(n => String(n.text).trim().slice(0, NOTE_CHARS)) : [];
  if (mine.length) L.push('', 'My notes:', ...mine.map(x => `- ${x}`));
  if (soilTest && Array.isArray(r.soilTestLines) && r.soilTestLines.length) L.push('', `My soil test: ${r.soilTestLines.join(', ')}`);
  if (r.backupNote) L.push('', r.backupNote);
  L.push('', GUIDE, `Made ${longDay(r.madeOn)} from NASA and other public data. Weather changes: check again before you sow.`);
  if (link) L.push('', `Open it in Crophalo: ${link}`);
  return L.join('\n').replace(/^\n+/, '');
}
// The line the sheet shows under the box: "112 of 160 characters: fits in one text message."
export function countLine(text) {
  const c = smsCount(text), n = c.units;
  const base = c.parts <= 1 ? `${n} of ${c.perMessage} characters: fits in one text message.` : `${n} characters: sent as ${c.parts} text messages.`;
  return c.ucs ? `${base} Letters such as ı, ş or ğ, or signs such as °, make a text message hold ${LIMITS.ucsOne} characters instead of ${LIMITS.gsmOne}.` : base;
}
