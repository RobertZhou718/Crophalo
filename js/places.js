// Crophalo's places: reading coordinates a farmer types or pastes, the demo regions, and the place search.
// Pure: parseCoords(), coordText(), matchRegions(), placeRows(). The rest asks the network or reads the device's storage.
// Checked by scripts/test_places.mjs (every coordinate format, the minus-sign rule, the region match, the place rows).
import { countryName } from './words.js';

// ---- coordinates
export const MINUS_MSG = 'The minus sign and the letter disagree (a minus means south or west). Take the minus sign off, or change the letter, and try again.';
const N = String.raw`\d+(?:\.\d+)?`, S = String.raw`-?\d+(?:\.\d+)?`;
const DECIMAL = new RegExp(String.raw`^([-+−])?\s*(${N})\s*(?:°|º)?$`);
const DMS = new RegExp(String.raw`^([-+−])?\s*(\d+)\s*(?:°|º)\s*(${N})\s*['′’]\s*(?:(${N})\s*(?:"|″|”|'')?)?$`);
const LINKS = [   // each finds latitude then longitude inside a map link
  new RegExp(String.raw`[#?&]map=${N}/(${S})/(${S})`),                         // openstreetmap.org/#map=15/42.03/-93.62
  new RegExp(String.raw`[?&]mlat=(${S})(?:&[^#]*?)?&mlon=(${S})`),             // openstreetmap.org/?mlat=42.03&mlon=-93.62
  new RegExp(String.raw`!3d(${S})!4d(${S})`),                                  // the pin of a Google link
  new RegExp(String.raw`@(${S}),(${S})`),                                      // the centre of a Google link
  new RegExp(String.raw`[?&](?:q|ll|query|center)=(?:loc:)?(${S})(?:,|%2C)\s*(${S})`, 'i'),
];

// One half of a pair: "42.03", "-93.62°", "42°01'48\"N", "W 93.62" → { value, minus, letter } or null.
function readPart(text) {
  let rest = text.trim().toUpperCase(), letter = '';
  const lead = /^([NSEW])\s*(?=[-+−\d])/.exec(rest), tail = /([NSEW])$/.exec(rest);
  if (lead && tail) return null;   // two letters on one number
  if (lead) { letter = lead[1]; rest = rest.slice(lead[0].length); } else if (tail) { letter = tail[1]; rest = rest.slice(0, -1).trim(); }
  const dms = DMS.exec(rest), dec = dms ? null : DECIMAL.exec(rest);
  if (!dms && !dec) return null;
  const minus = /[-−]/.test((dms || dec)[1] || '');
  const value = dms ? +dms[2] + +dms[3] / 60 + +(dms[4] || 0) / 3600 : +dec[2];
  if (dms && (+dms[3] >= 60 || +(dms[4] || 0) >= 60)) return null;
  return { value, minus, letter };
}
function splitPair(text) {   // the two halves of a pair, by its comma or semicolon, else by the one space that leaves two readable halves
  const marks = text.split(/[,;]/);
  if (marks.length === 2) return marks.map(readPart);
  if (marks.length > 2) return [null, null];
  for (const gap of text.matchAll(/\s+/g)) {
    const a = readPart(text.slice(0, gap.index)), b = readPart(text.slice(gap.index + gap[0].length));
    if (a && b) return [a, b];
  }
  return [null, null];
}

// What a farmer typed or pasted, read as a place: { lat, lon }, or { reason } when the text is coordinates with a mistake
// worth explaining, or null when it is not coordinates at all (then it is a place name to search for).
export function parseCoords(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 400) return null;
  if (/^(https?:\/\/|www\.)/i.test(raw)) {
    for (const link of LINKS) { const m = link.exec(raw); if (m) return inRange(+m[1], +m[2]); }
    return null;
  }
  let [a, b] = splitPair(raw);
  if (!a || !b) return null;
  for (const part of [a, b]) if (part.minus && /[NE]/.test(part.letter)) return { reason: MINUS_MSG };
  const across = part => /[EW]/.test(part.letter), up = part => /[NS]/.test(part.letter);
  if ((across(a) && across(b)) || (up(a) && up(b))) return null;
  if (across(a) || up(b)) [a, b] = [b, a];   // "93.62 W, 42.03 N": the letters say which is which
  const signed = part => (part.minus || /[SW]/.test(part.letter) ? -1 : 1) * part.value;
  return inRange(signed(a), signed(b));
}
const inRange = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

// "42.03000, -93.62000": five decimals is about one metre, more than any field needs.
export const coordText = (lat, lon) => `${(+lat).toFixed(5)}, ${(+lon).toFixed(5)}`;
// The name a spot is kept under: four decimals, about eleven metres, so the same field is the same spot.
export const spotKey = (lat, lon) => `${(+lat).toFixed(4)},${(+lon).toFixed(4)}`;

// ---- demo regions
const plain = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();   // "Türkiye" is found by "turkiye" too

// The regions whose name, country or other names hold what was typed.
export function matchRegions(regions, text) {
  const want = plain(text);
  if (want.length < 2) return [];
  return regions.filter(region => [region.name, region.country, ...(region.aliases ?? [])].some(word => plain(word).includes(want)));
}
let regionsAsked = null;
export function loadRegions() {   // asked once; a failure is asked again next time
  regionsAsked ??= fetch('data/regions.json').then(res => { if (!res.ok) throw new Error(`status ${res.status}`); return res.json(); })
    .then(list => list.filter(r => r && typeof r.id === 'string' && inRange(r.lat, r.lon)))
    .catch(e => { regionsAsked = null; throw e; });
  return regionsAsked;
}

// ---- the place search (OpenStreetMap Nominatim): asked only when the farmer presses Search, never while typing
const SEARCH = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=en&limit=6&q=';
const KEPT_KEY = 'crophalo.places.v1', KEEP_MS = 24 * 3600e3, KEPT_MAX = 20, LIMIT_MS = 12e3;

// The service's answer as rows for the list: { title, sub, lat, lon }. The country is written Crophalo's way.
export function placeRows(answer) {
  if (!Array.isArray(answer)) return [];
  return answer.map(hit => {
    const lat = +hit?.lat, lon = +hit?.lon, parts = String(hit?.display_name ?? '').split(',').map(p => p.trim()).filter(Boolean);
    if (!inRange(lat, lon) || !parts.length) return null;
    const country = countryName(hit?.address?.country ?? '', hit?.address?.country_code);
    if (country && parts.length > 1) parts[parts.length - 1] = country;
    const title = String(hit?.name || parts[0]), rest = parts.filter((p, i) => i > 0 || p !== title);
    return { title: countryName(title), sub: rest.map(p => countryName(p)).join(', '), lat, lon };
  }).filter(Boolean);
}
function readKept() { try { const kept = JSON.parse(localStorage.getItem(KEPT_KEY)); return kept && typeof kept === 'object' ? kept : {}; } catch { return {}; } }
function keep(query, rows) {
  try {
    const kept = { ...readKept(), [query]: { at: Date.now(), rows } };
    const newest = Object.entries(kept).sort((a, b) => b[1].at - a[1].at).slice(0, KEPT_MAX);
    localStorage.setItem(KEPT_KEY, JSON.stringify(Object.fromEntries(newest)));
  } catch { /* a full or blocked store costs only the saving */ }
}
// Places for a name: rows, from this device while they are a day old or less, else from the service. Throws when it cannot be reached.
export async function geocode(text) {
  const query = plain(text), hit = readKept()[query];
  if (hit && Array.isArray(hit.rows) && Date.now() - hit.at >= 0 && Date.now() - hit.at < KEEP_MS) return hit.rows;
  const res = await fetch(SEARCH + encodeURIComponent(String(text).trim()), { signal: AbortSignal.timeout(LIMIT_MS) });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const rows = placeRows(await res.json());
  keep(query, rows);
  return rows;
}
