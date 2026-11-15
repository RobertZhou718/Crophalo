// Crophalo's offline suite for the spot card's pure parts: the weather reader and the card's placement (the sun is checked in scripts/test_sun.mjs).
// RULE: never loosen a check here without a written farming reason beside it. A wrong sunrise or a rain that was never read would be shown to a farmer as fact. Run: node scripts/test_spot.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const load = f => import(pathToFileURL(path.join(ROOT, 'js', f)).href);
const wx = await load('weather.js'), card = await load('cardplace.js'), { cleanPlace, forecastUrl, cachedJSON } = await load('data.js');

// ---- the weather
const RAW = { elevation: 291.0, utc_offset_seconds: -14400, timezone_abbreviation: 'GMT-4',
  current: { time: '2026-11-14T14:05', temperature_2m: 12.4, apparent_temperature: 10.6, weather_code: 3, wind_speed_10m: 15.2 },
  daily: { time: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'], weather_code: [61, 3, 0, 95], temperature_2m_max: [18, 14, 9, 11], temperature_2m_min: [7, 5, 2, null], precipitation_probability_max: [20, 60, null, 80], precipitation_sum: [3, 0, 0, 12] } };
const f = wx.parseForecast(RAW);
same('a full answer is read as it stands', [f.now.temp, f.now.feels, f.now.wind, f.now.code, f.days.length, f.elevation, f.offsetS, f.updated, f.today], [12.4, 10.6, 15.2, 3, 4, 291, -14400, '14:05', '2026-11-14']);
same('a reading that was not taken is unknown, never zero', [f.days[3].lo, f.days[2].pop], [null, null]);
same('a missing temperature stays unknown', wx.parseForecast({ ...RAW, current: { time: '2026-11-14T14:05', weather_code: 3 } }).now.temp, null);
same('text where a number belongs is unknown', wx.parseForecast({ ...RAW, current: { temperature_2m: '12', wind_speed_10m: NaN } }).now, { temp: null, feels: null, wind: null, code: null });
same('nonsense is no forecast', [wx.parseForecast(null), wx.parseForecast({}), wx.parseForecast({ daily: { time: [] } }), wx.parseForecast('x')], [null, null, null, null]);
same('the words for the weather codes', [0, 3, 61, 95, 99, 12, 'x'].map(wx.conditionWords), ['Clear sky', 'Overcast', 'Light rain', 'Thunderstorm', 'Thunderstorm with hail', '', '']);
const SHARED_URL = forecastUrl(cleanPlace(44.38941, -79.69031));
same('the card asks for the very address the report and My farm ask for, so a place is asked once', [SHARED_URL === forecastUrl({ lat: 44.3894, lon: -79.6903 }), /latitude=44\.389&longitude=-79\.690/.test(SHARED_URL)], [true, true]);
check('the exact spot never leaves the device: three decimals at most, about a hundred metres', !/44\.38941|79\.69031|44\.3894[^0-9]/.test(SHARED_URL));
// the shared answer (days back and ahead) is cut to today and three days, by the field's own clock
{
  const day = (n) => new Date(Date.parse(RAW.daily.time[0] + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const back = [-3, -2, -1].map(day), ahead = [4, 5, 6].map(day), pad = (list, v) => [...Array(3).fill(v), ...list, ...Array(3).fill(v)];
  const SHARED = { ...RAW, hourly: { time: ['x'] }, daily: Object.fromEntries(Object.entries(RAW.daily).map(([k, list]) => [k, k === 'time' ? [...back, ...list, ...ahead] : pad(list, 99)])) };
  const noon = Date.parse(RAW.daily.time[0] + 'T18:05:00Z');   // 14:05 at the field, whose clock is four hours behind
  const cut = wx.cutForecast(SHARED, noon);
  same('the cut keeps today and the next three days, whatever the answer holds before and after', [cut.daily.time, cut.daily.temperature_2m_max, 'hourly' in cut], [RAW.daily.time, RAW.daily.temperature_2m_max, false]);
  same('today is the field\'s own date: at 22:00 UTC the field (four hours behind) is still on the same day, at 03:00 UTC the next morning it is still the day before', [wx.cutForecast(SHARED, Date.parse(RAW.daily.time[0] + 'T22:00:00Z')).daily.time[0], wx.cutForecast(SHARED, Date.parse(day(1) + 'T03:00:00Z')).daily.time[0]], [RAW.daily.time[0], RAW.daily.time[0]]);
  same('an answer that does not hold today, or is not a forecast, is no cut', [wx.cutForecast({ ...SHARED, daily: { ...SHARED.daily, time: back } }, noon), wx.cutForecast(null), wx.cutForecast({ daily: {} })], [null, null, null]);
  same('the cut reads as the card always read it', wx.parseForecast(cut).days.map(d => d.hi), [18, 14, 9, 11]);
  wx.forgetForecasts(); let calls = 0, t = noon;
  const ask = async () => { calls++; return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify(SHARED) }; };
  const a = await wx.getForecast(44.3894, -79.6903, { ask, now: () => t, caches: null }); t += 9 * 60e3;
  const b = await wx.getForecast(44.38941, -79.69031, { ask, now: () => t, caches: null });
  same('the same place asks once in ten minutes', [calls, a.ok, b.ok, a.days.length], [1, true, true, 4]);
  // the report asks for the same address at the same moment: one request between the two
  wx.forgetForecasts(); calls = 0;
  const [one, two] = await Promise.all([wx.getForecast(44.3894, -79.6903, { ask, now: () => t, caches: null }), cachedJSON(SHARED_URL, { keep: 1e3, limit: 5e3 }, { fetch: ask, now: () => t, caches: null })]);
  same('the card and the report asking at once make ONE request', [calls, one.ok, two.json.elevation], [1, true, 291]);
  t += 11 * 60e3; await wx.getForecast(44.3894, -79.6903, { ask, now: () => t, caches: null });
  same('after ten minutes it asks again', calls, 2);
  await wx.getForecast(44.6, -79.7, { ask, now: () => t, caches: null });
  same('another place asks for itself', calls, 3);
  const bad = await wx.getForecast(1, 2, { ask: async () => ({ ok: false, status: 503, headers: { get: () => null } }), now: () => t, caches: null });
  same('a failing service is a plain reason, not a made-up forecast', [bad.ok, bad.reason], [false, 'The weather service answered with an error.']);
  const down = await wx.getForecast(3, 4, { ask: async () => { throw new Error('offline'); }, now: () => t, caches: null });
  same('no connection is said plainly', [down.ok, down.reason], [false, 'The weather service did not answer.']);
  const junk = await wx.getForecast(5, 6, { ask: async () => ({ ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ hello: 1 }) }), now: () => t, caches: null });
  same('an answer that is not a forecast is refused', junk.ok, false);
  same('a place with no position is refused in words, with nothing asked', [(await wx.getForecast(NaN, 3, { ask, now: () => t, caches: null })).reason, calls], ['This place has no position Crophalo can read.', 3]);
}
same('the weekday is read from the date itself', [wx.dayName('2026-11-14'), wx.dayName('2026-11-15')], ['Sat', 'Sun']);
same('degrees', [wx.degrees(12.4), wx.degrees(-0.4), wx.degrees(null)], ['12°', '-0°'.replace('-0', '0'), 'not available']);
// the fieldwork rule
same('calm and dry', wx.fieldwork({ pop: 20, mm: 0.4 }, 12).ok, true);
same('rain likely at 50 per cent', wx.fieldwork({ pop: 50, mm: 0 }, 5), { ok: false, words: 'Not a calm, dry day: rain is likely.' });
same('rain likely at 2 mm', wx.fieldwork({ pop: 10, mm: 2 }, 5).ok, false);
same('too windy at 25 km/h', wx.fieldwork({ pop: 0, mm: 0 }, 25), { ok: false, words: 'Not a calm, dry day: too windy.' });
same('both reasons are named', wx.fieldwork({ pop: 80, mm: 9 }, 40).words, 'Not a calm, dry day: rain is likely and too windy.');
same('with no wind or rain reading it does not say yes', [wx.fieldwork({ pop: 0, mm: 0 }, null).ok, wx.fieldwork({ pop: null, mm: null }, 3).ok, wx.fieldwork(null, 3).ok], [null, null, null]);
check('a missing probability but a dry total still counts as dry', wx.fieldwork({ pop: null, mm: 0 }, 5).ok === true);
// ---- the card's placement
{
  const box = { w: 700, h: 600 }, size = { w: 340, h: 380 };
  const inside = p => p.left >= 8 && p.top >= 56 && p.left + size.w <= box.w - 8 && p.top + size.h <= box.h - 8;
  same('a card dragged out of the map is brought back inside', card.clampCard({ left: -50, top: -50 }, size, box), { left: 8, top: 56 });
  same('and from the far corner', card.clampCard({ left: 999, top: 999 }, size, box), { left: 352, top: 212 });
same('a card beside the pin stays clear of the view buttons', card.clampCard({ left: 999, top: 100 }, size, box, 8, 56, card.STACK_ROOM).left, 300);
  const pinAt = { x: 200, y: 300 }, p = card.placeCard({ anchor: pinAt, size, box });
  check('beside the pin, on the side with room, inside the map', inside(p) && !p.bottom && p.left > pinAt.x, p);
  check('it does not cover the pin', !(p.left < pinAt.x + 22 && p.left + size.w > pinAt.x - 22 && p.top < pinAt.y + 8 && p.top + size.h > pinAt.y - 44), p);
  const r = card.placeCard({ anchor: { x: 600, y: 300 }, size, box });
  check('a pin near the right edge puts the card on its left', inside(r) && r.left + size.w < 600, r);
  const wide = { w: 1000, h: 700 }, o = card.placeCard({ anchor: { x: 400, y: 300 }, size, box: wide, avoid: [{ left: 430, top: 200, w: 220, h: 200 }] });
  check('with an outline right of the pin the card goes to the pin\'s left, clear of both', o.left + size.w <= 400 - 22 && !o.bottom, o);
  same('on a map under 520 px wide the card lies along the bottom', card.placeCard({ anchor: pinAt, size: { w: 300, h: 300 }, box: { w: 400, h: 500 } }), { left: 8, top: 192, bottom: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
