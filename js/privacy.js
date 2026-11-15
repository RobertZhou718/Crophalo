// Crophalo's Privacy page: what stays on this device, what is sent out and to whom, and the buttons that delete what is kept (each asks twice). The farmer sees every recipient and what it gets.
// Pure: SENT, storageCounts(), GROUPS, makeArmer(), eraseGroup(), eraseEverything(), privacyTabs(). The page glue (js/pages-info.js) draws and listens.
// Checked by scripts/test_pages.mjs (the table names every recipient, the two-tap rule and its 5 s, every delete clears what it says, Delete everything clears keys, session, caches and timers together).
export const ARM_MS = 5000, PUSH_WAIT_MS = 3000;
// Push is turned off with a time limit: a browser with no worker never answers, and that must not hold the deleting back.
const within = (promise, ms = PUSH_WAIT_MS) => Promise.race([Promise.resolve(promise), new Promise((_, no) => setTimeout(no, ms))]);
// Every recipient and what it gets, for what this build really sends. The position is always rounded as the service is asked.
export const SENT = Object.freeze([
  { service: 'NASA POWER', gets: 'Your field’s position, to four decimals.', why: 'Daily weather since 2001, and the satellite rain it carries.' },
  { service: 'The Crophalo data server', gets: 'Your field’s position, to four decimals, and the country your place line names (for the crop map of farms nearby); for the height map the box round the field; for the crop map by year, the field’s outline, to four decimals; and the field’s outline, only when you press Find weak spots. Some lookups round the position further, to their satellite’s grid, before they ask.', why: 'To ask NASA’s soil-moisture, rain, ground-temperature and greenness services, the water-storage record, the national crop maps and the height maps for you, with the NASA login kept on the server. It does not know your name.' },
  { service: 'USDA CroplandCROS (Cropland Data Layer) and Agriculture and Agri-Food Canada (Annual Crop Inventory)', gets: 'Up to 9 points inside your field, at least 30 m apart, to six decimals, through the Crophalo data server; when Land history asks for the fields around you, also about 950 points on a grid within 3 km of the field, never inside it. Never your name or the field’s outline.', why: 'Reading what the national crop maps show on your field each year, and, as counts only, what the fields around it grew. US fields go to USDA, Canadian fields to AAFC.' },
  { service: 'NASA LP DAAC (HLS satellite pictures)', gets: 'The box around your field, through the Crophalo data server with the NASA login kept there, when you press Find weak spots. NASA’s open catalogue gets the field’s centre.', why: 'Reading how green each 30 m square inside the field looked, for Weak spots in this field.' },
  { service: 'The Crophalo data server, for the crops of past years', gets: 'The corners of the outline you drew, up to 200, each to four decimals (about 11 m). With no outline, only the place you chose.', why: 'To read the national crop map at points inside your field, for each year. Only for a field in the United States or Canada, when its report is built.' },
  { service: 'The Crophalo data server, for weak spots', gets: 'The corners of your outline, each to six decimals (about 10 cm).', why: 'To read how green each 30 m square of your field looked in NASA’s satellite pictures. Only when you press Find weak spots.' },
  { service: 'Open-Meteo', gets: 'Your field’s position, rounded to about 100 m.', why: 'The forecast for the next days, and the back-up weather record when NASA POWER does not answer.' },
  { service: 'Street map tiles (OpenFreeMap, with OpenStreetMap data)', gets: 'The part of the map in view, as tile numbers and the zoom.', why: 'The street map under your field and the names of places.' },
  { service: 'OpenStreetMap place search (Nominatim)', gets: 'The place you typed when you press Search. Also your field’s position, to four decimals, once.', why: 'Finding a town or an address, and the name of your field’s place, such as “Near Barrie, Ontario”. The position is sent only after you choose a place.' },
  { service: 'NASA map pictures (NASA GIBS)', gets: 'The part of the map in view, as a box of coordinates, and a date.', why: 'The cloud-free world picture (Blue Marble) under the setup map and the My farm map when you are zoomed out, NASA’s newest picture of a place when you switch it on, the map’s layers, and the pictures on the region cards.' },
  { service: 'USGS The National Map aerial photos', gets: 'The part of the map in view.', why: 'The sharp aerial photographs under the map when you zoom in close in the United States.' },
  { service: 'EOX map pictures (Sentinel-2 cloudless 2016)', gets: 'The part of the map in view.', why: 'The cloud-free satellite picture under the map when you zoom in close.' },
  { service: 'Height tiles (Terrain Tiles on Amazon’s open data)', gets: 'The part of the map in view, as tile numbers and the zoom.', why: 'The slope, erosion, frost pocket, sun and shade and relief layers of the setup map. Only when you turn one on.' },
  { service: 'ISRIC SoilGrids', gets: 'Your field’s place, to four decimals.', why: 'The soil mix for the erosion layer of the setup map. Only when you turn it on.' },
  { service: 'OpenStreetMap map features (Overpass, asked by the Crophalo server)', gets: 'The middle of the land in the 3D view, to four decimals, and the size of its box (3.6 km a side at most).', why: 'The buildings, roads, water, hedges, fences, power lines and tanks in the 3D view. Only when you turn one of them on.' },
  { service: 'Frankfurter exchange rates', gets: 'Nothing about you or your field.', why: 'Today’s rates, only if you choose a currency other than US dollars.' },
  { service: 'Your browser’s push service (Google, Apple, Mozilla or Microsoft)', gets: 'Each reminder’s name and time, and the address your browser gives for push. Not your field’s place, crops or notes.', why: 'Showing a reminder when Crophalo is closed. Only when you turn push on.' },
  { service: 'Your browser’s speech service', gets: 'Your voice, when you use voice typing in Chrome.', why: 'Turning speech into text. Listen reads aloud with your device’s own voice and sends nothing.' },
]);
export const NO_ACCOUNT = 'No sign-in. Your answers stay in this browser unless you share them. Anyone with a shared link sees that field and your answers.';
export const NOT_BACKUP = 'Deleted is gone for good. Clearing the browser deletes it too. Keep a copy with Download a backup file.';

// ---- what is kept, with live counts
const countOf = (storage, key) => { try { const v = JSON.parse(storage.getItem(key)); return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0; } catch { return 0; } };
export function storageCounts(storage = globalThis.localStorage) {
  return { saved: countOf(storage, 'crophalo.saved.v1'), farms: countOf(storage, 'crophalo.farms.v1'), notes: countOf(storage, 'crophalo.notes.v1'), todo: countOf(storage, 'crophalo.todo.v1'), record: countOf(storage, 'crophalo.record.v1'), reminders: countOf(storage, 'crophalo.remind.v1'), answers: countOf(storage, 'crophalo.answers.v1') + countOf(storage, 'crophalo.costs.v1') };
}
const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
export const keptLines = c => [n(c.saved, 'saved field', 'saved fields'), n(c.farms, 'farm', 'farms'), `${n(c.notes, 'note', 'notes')}, ${n(c.todo ?? 0, 'to-do job', 'to-do jobs')} and ${n(c.record, 'crop-history entry', 'crop-history entries')}`, n(c.reminders, 'reminder', 'reminders'),
  'Your answers for places you have been, your costs, and your settings', 'A saved copy of the app, so it opens without internet'];

// ---- the delete buttons
export const GROUPS = Object.freeze([
  { id: 'saved', label: 'Saved fields', keys: ['crophalo.saved.v1'] }, { id: 'farms', label: 'Your farms and what-ifs', keys: ['crophalo.farms.v1'] },
  { id: 'notes', label: 'Notes, to-do and crop history', keys: ['crophalo.notes.v1', 'crophalo.todo.v1', 'crophalo.record.v1'] }, { id: 'answers', label: 'Remembered answers and costs', sub: 'What you told Crophalo about each place', keys: ['crophalo.answers.v1', 'crophalo.costs.v1'] },
  { id: 'reminders', label: 'Reminders', sub: 'Push is turned off too', keys: ['crophalo.remind.v1'] }, { id: 'everything', label: 'Everything', sub: 'All of the above, your reminders, your settings, and the saved copy of the app', keys: [] },
  { id: 'welcome', label: 'The welcome page', sub: 'Read it again', keys: ['crophalo.welcome.v1'], again: true },
]);
// The two-tap rule: the first press arms the button, a second press within 5 seconds deletes, and after 5 seconds it disarms by itself.
export function makeArmer(now = () => Date.now()) {
  let armed = null;
  return {
    press(id) {
      const t = now();
      if (armed && armed.id === id && t - armed.at <= ARM_MS) { armed = null; return 'delete'; }
      armed = { id, at: t }; return 'armed';
    },
    expire() { if (armed && now() - armed.at > ARM_MS) { const id = armed.id; armed = null; return id; } return null; },
    armed: () => armed?.id ?? null,
  };
}
// Delete one group. env: { local, session, caches, stopTimers, pushOff }. Returns the list of what was done, in words.
export async function eraseGroup(id, env = {}) {
  const g = GROUPS.find(x => x.id === id), done = [];
  if (!g || id === 'everything') return done;
  for (const k of g.keys) try { env.local?.removeItem(k); done.push(k); } catch { /* storage that cannot be written cannot be erased either */ }
  if (id === 'reminders') { try { env.stopTimers?.(); done.push('timers'); } catch { /* none running */ } try { await within(env.pushOff?.()); done.push('push'); } catch { /* push was not on */ } }
  return done;
}
// Delete everything this browser keeps for Crophalo: every key, this tab's session, the saved copy of the app, the timers and push, together.
export async function eraseEverything(env = {}) {
  const done = [];
  try { env.stopTimers?.(); done.push('timers'); } catch { /* none running */ }
  for (const [name, store] of [['local', env.local], ['session', env.session]]) {
    if (!store) continue;
    try { const keys = []; for (let i = 0; i < store.length; i++) { const k = store.key(i); if (typeof k === 'string' && k.startsWith('crophalo.')) keys.push(k); } for (const k of keys) store.removeItem(k); done.push(name); } catch { /* unreadable store */ }
  }
  try { const names = await within(env.caches?.keys?.() ?? []) ?? []; for (const c of names.filter(x => String(x).startsWith('crophalo'))) await env.caches.delete(c); done.push('caches'); } catch { /* no caches */ }
  try { await within(env.pushOff?.()); done.push('push'); } catch { /* push was not on */ }   // last, and with a time limit
  return done;
}
export const PRIVACY_TABS = Object.freeze([{ id: 'device', label: 'On your device' }, { id: 'sent', label: 'Sent to other services' }]);
