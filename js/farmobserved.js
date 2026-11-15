// What NASA's Harmonized Landsat and Sentinel-2 pictures (HLS, 30 m) actually saw on a field, set beside what the plan says should be there ("Observed" beside "Planned").
// Pure: observedFor() turns the lookup's answer into the words for one day; loadObserved() asks the server's /api/hlsndvi once for a field and keeps the answer for this visit.
// Never a made-up state: no clear picture, a day outside the pictures' window, or a lookup that did not answer each say so in words. Checked by scripts/test_sim.mjs and scripts/e2e_farm.mjs.

export const PERIOD_DAYS = 15;   // the lookup gives one clear reading for each 15-day period, so a reading is used for the 15 days after it
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const N = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
export const dayShort = iso => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}${iso.slice(0, 4) === String(new Date().getUTCFullYear()) ? '' : ` ${iso.slice(0, 4)}`}`;
// The plain words for a greenness (NDVI) reading: 0 is bare ground or dead plants, about 0.8 is thick healthy green (the lookup's own scale).
export const greenWords = v => !Number.isFinite(v) ? '' : v < 0.2 ? 'bare ground or dead plants' : v < 0.4 ? 'a little green' : v < 0.6 ? 'green and growing' : 'thick, healthy green';
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// answer: the lookup's answer, or null when it has not come. Returns { state: 'wait' | 'unread' | 'ok' | 'none' | 'outside', chip, line, detail?, pass? }.
export function observedFor(answer, iso, { waiting = false } = {}) {
  if (waiting && !answer) return { state: 'wait', chip: 'Observed: looking…', line: 'Looking for the clear NASA pictures of this field (this takes a minute).' };
  if (!answer || answer.ok !== true) return { state: 'unread', chip: 'Observed: not read yet', line: `Observed: not read yet${answer?.reason ? `. ${String(answer.reason).slice(0, 200)}` : ''}.`.replace('..', '.') };
  const w = answer.window || {}, passes = (Array.isArray(answer.passes) ? answer.passes : []).filter(p => isDay(p?.date) && Number.isFinite(p.ndvi)).sort((a, b) => a.date.localeCompare(b.date));
  if (!isDay(iso)) return { state: 'unread', chip: 'Observed: not read yet', line: 'Observed: no day is chosen.' };
  if (isDay(w.last) && iso > w.last) return { state: 'outside', chip: 'Observed: not yet', line: `Observed: ${dayShort(iso)} is after the newest day of NASA's pictures (${dayShort(w.last)}). Only the plan says what is planned for it.` };
  if (isDay(w.first) && iso < w.first) return { state: 'outside', chip: 'Observed: before the pictures', line: `Observed: NASA's pictures of this field start ${dayShort(w.first)}. ${dayShort(iso)} is before them.` };
  const before = passes.filter(p => p.date <= iso && N(iso) - N(p.date) <= PERIOD_DAYS), pass = before.at(-1);
  if (pass) {
    const age = Math.round(N(iso) - N(pass.date));
    return { state: 'ok', pass, chip: `Observed ${dayShort(pass.date)} (NASA HLS)`, line: `Observed ${dayShort(pass.date)} (NASA HLS): ${greenWords(pass.ndvi)}.`,
      detail: `Greenness (NDVI) ${pass.ndvi.toFixed(2)} from ${pass.sensor}; ${pass.clear_pixels} of ${pass.of_pixels} dots of 30 m were clear.${age ? ` The picture is ${age} day${age === 1 ? '' : 's'} before the day shown.` : ''}` };
  }
  const nu = answer.not_usable || {}, why = [nu.cloud ? 'clouds or their shadows' : '', nu.snow ? 'snow' : ''].filter(Boolean).join(' and ');
  return { state: 'none', chip: 'Observed: no clear picture', line: `Observed: no clear NASA picture of this field in the ${PERIOD_DAYS} days before ${dayShort(iso)}${why ? `: ${why} hid it` : ''}.`, detail: passes.length ? `The nearest clear picture is ${dayShort(passes.reduce((a, p) => Math.abs(N(p.date) - N(iso)) < Math.abs(N(a.date) - N(iso)) ? p : a).date)}.` : (answer.why_none || '') };
}

const kept = new Map();
export function loadObserved(lat, lon, { fetchFn = globalThis.fetch?.bind(globalThis), onDone = () => {} } = {}) {
  const key = `${(+lat).toFixed(4)},${(+lon).toFixed(4)}`;
  if (!kept.has(key)) {
    const entry = { answer: null, waiting: true };
    kept.set(key, entry);
    (async () => {
      try {
        const res = await fetchFn(`/api/hlsndvi?lat=${encodeURIComponent((+lat).toFixed(4))}&lon=${encodeURIComponent((+lon).toFixed(4))}`);
        const a = await res.json();
        entry.answer = a && typeof a === 'object' ? a : { ok: false, reason: 'The picture lookup sent an answer Crophalo could not read' };
      } catch { entry.answer = { ok: false, reason: 'The picture lookup did not answer' }; }
      entry.waiting = false; onDone(entry);
    })();
  }
  return kept.get(key);
}
export const forgetObserved = () => kept.clear();
