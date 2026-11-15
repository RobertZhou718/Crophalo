// Crophalo's Privacy page: what stays on this device, what is sent out and to whom, and the buttons that delete what is kept (each asks twice). The farmer sees every recipient and what it gets.
// Pure: SENT, storageCounts(), GROUPS, makeArmer(), eraseGroup(), eraseEverything(), privacyTabs(). The page glue (js/pages-info.js) draws and listens.
// Checked by scripts/test_pages.mjs (the table names every recipient, the two-tap rule and its 5 s, every delete clears what it says, Delete everything clears keys, session, caches and timers together).
export const ARM_MS = 5000, PUSH_WAIT_MS = 3000;
// Push is turned off with a time limit: a browser with no worker never answers, and that must not hold the deleting back.
const within = (promise, ms = PUSH_WAIT_MS) => Promise.race([Promise.resolve(promise), new Promise((_, no) => setTimeout(no, ms))]);
// Every recipient and what it gets, for what this build really sends. The position is always rounded as the service is asked.
export const SENT = Object.freeze([
  { service: 'NASA POWER', gets: 'Your field’s position, to four decimals.', why: 'Daily weather since 2001, and the satellite rain it carries.' },
  { service: 'The Crophalo data server', gets: 'Your field’s position, to four decimals, and the country your place line names (for the crop map of farms nearby); for the height map the box round the field, never its outline. Some lookups round the position further, to their satellite’s grid, before they ask.', why: 'To ask NASA’s soil-moisture, rain, ground-temperature and greenness services, the water-storage record, the national crop maps and the height maps for you, with the NASA login kept on the server. It does not know your name.' },
  { service: 'Open-Meteo', gets: 'Your field’s position, rounded to about 100 m.', why: 'The forecast for the next days, and the back-up weather record when NASA POWER does not answer.' },
  { service: 'Esri map pictures', gets: 'The part of the map in view.', why: 'The satellite pictures under the map and on the region cards.' },
  { service: 'OpenStreetMap place search (Nominatim)', gets: 'The place you typed, or a position to find its name.', why: 'Finding a town or an address. Only when you press Search.' },
  { service: 'Frankfurter exchange rates', gets: 'Nothing about you or your field.', why: 'Today’s rates, only if you choose a currency other than US dollars.' },
  { service: 'Your browser’s push service (Google, Apple, Mozilla or Microsoft)', gets: 'Each reminder’s name and time, and the address your browser gives for push. Not your field’s place, crops or notes.', why: 'Showing a reminder when Crophalo is closed. Only when you turn push on.' },
  { service: 'Your browser’s speech service', gets: 'Your voice, when you use voice typing in Chrome.', why: 'Turning speech into text. Listen reads aloud with your device’s own voice and sends nothing.' },
]);
export const NO_ACCOUNT = 'Crophalo has no sign-in and no profile. Nobody at Crophalo can see your answers: they stay in this browser unless you choose to share or export them. Anyone who gets a shared link can see the field details and answers inside it.';
export const NOT_BACKUP = 'This is browser storage. It is not a backup: clearing your browser data, or a different phone, will not have it. To keep a copy or move it, use Move to another computer in Settings.';

// ---- what is kept, with live counts
const countOf = (storage, key) => { try { const v = JSON.parse(storage.getItem(key)); return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0; } catch { return 0; } };
export function storageCounts(storage = globalThis.localStorage) {
  return { saved: countOf(storage, 'crophalo.saved.v1'), farms: countOf(storage, 'crophalo.farms.v1'), notes: countOf(storage, 'crophalo.notes.v1'), record: countOf(storage, 'crophalo.record.v1'), reminders: countOf(storage, 'crophalo.remind.v1'), answers: countOf(storage, 'crophalo.answers.v1') + countOf(storage, 'crophalo.costs.v1') };
}
const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
export const keptLines = c => [n(c.saved, 'saved field', 'saved fields'), n(c.farms, 'farm', 'farms'), `${n(c.notes, 'note', 'notes')} and ${n(c.record, 'crop-history entry', 'crop-history entries')}`, n(c.reminders, 'reminder', 'reminders'),
  'Your answers for places you have been, your costs, and your settings', 'A saved copy of the app, so it opens without internet'];

// ---- the delete buttons
export const GROUPS = Object.freeze([
  { id: 'saved', label: 'Saved fields', keys: ['crophalo.saved.v1'] }, { id: 'farms', label: 'Your farms and what-ifs', keys: ['crophalo.farms.v1'] },
  { id: 'notes', label: 'Notes and crop history', keys: ['crophalo.notes.v1', 'crophalo.record.v1'] }, { id: 'answers', label: 'Remembered answers and costs', sub: 'What you told Crophalo about each place', keys: ['crophalo.answers.v1', 'crophalo.costs.v1'] },
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
export const PRIVACY_TABS = Object.freeze([{ id: 'device', label: 'On your device' }, { id: 'sent', label: 'Sent to other services' }, { id: 'choices', label: 'Your choices' }]);
