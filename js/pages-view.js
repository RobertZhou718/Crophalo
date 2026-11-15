// Crophalo's info pages as pure markup: Privacy (two tabs: on your device, with each Delete beside its line and the backup; sent to other services), Limitations (cards and a few chips), and Settings (one calm page of grouped cards).
// Privacy's tabs have roving arrow keys; each choice is a segmented control; each delete asks twice. The page glue is js/pages-info.js.
// Pure: functions of plain data that return text. Nothing is read from the page.
// Checked by scripts/test_pages.mjs (every recipient named, the three sureness levels, the four unit pickers and their samples, every settings tab, plain-text escaping).
import { esc } from './words.js';
import { SENT, NO_ACCOUNT, NOT_BACKUP, PRIVACY_TABS } from './privacy.js';
import { DIMS, sampleLines } from './units.js';
import { CURRENCIES, fxNote } from './currency.js';
import { SETTING_CHOICES } from './settings.js';
import { installCardHtml } from './offline.js';
import { settingsRemindersHTML, remindListHTML } from './remind.js';
import { SURE_WORDS } from './report-view.js';

export const PAGE_LEADS = Object.freeze({ privacy: 'What stays on your device, and what is sent out.', limits: 'What Crophalo cannot know.', settings: 'Kept on this device.', data: 'Where every number comes from.' });

export const tabsHTML = (tabs, current, label) => `<div class="pg-tabs" role="tablist" aria-label="${esc(label)}">${tabs.map(t => `<button type="button" role="tab" class="tab" id="pgtab-${t.id}" aria-controls="pgpanel" aria-selected="${t.id === current}" tabindex="${t.id === current ? 0 : -1}" data-pgtab="${t.id}">${esc(t.label)}</button>`).join('')}</div>`;
const panel = (id, body, cls = '') => `<div class="pgpanel${cls ? ' ' + cls : ''}" id="pgpanel" role="tabpanel" aria-labelledby="pgtab-${id}" tabindex="0">${body}</div>`;
// A segmented control: radios in a group; the pressed one is checked. data-set names the setting, data-val the value.
export const segHTML = (name, label, choices, current) => `<div class="field"><span id="lab-${esc(name)}">${esc(label)}</span><div class="seg" role="radiogroup" aria-labelledby="lab-${esc(name)}">${choices.map(([v, t]) => `<button type="button" role="radio" aria-checked="${v === current}" tabindex="${v === current ? 0 : -1}" data-set="${esc(name)}" data-val="${esc(v)}">${esc(t)}</button>`).join('')}</div></div>`;

// ---- Privacy
export function privacyHTML(tab, counts) {
  const tabs = tabsHTML(PRIVACY_TABS, tab, 'Parts of Privacy');
  if (tab === 'sent') return `${tabs}${panel(tab, `<h2>Sent to other services</h2><p class="lead">To build a report, your field’s position goes to the services below. Nothing here includes your name, because Crophalo does not have it.</p>
    <div class="tbl" role="region" tabindex="0" aria-label="What each service receives"><table class="sent-table"><thead><tr><th scope="col">Service</th><th scope="col">What it receives</th><th scope="col">Why</th></tr></thead><tbody>${SENT.map(r => `<tr><th scope="row">${esc(r.service)}</th><td data-label="What it receives">${esc(r.gets)}</td><td data-label="Why">${esc(r.why)}</td></tr>`).join('')}</tbody></table></div>`)}`;
  const c = counts ?? {}, n = (v, one, many) => `${v ?? 0} ${v === 1 ? one : many}`;
  const rows = [['farms', 'Your farms and what-ifs', n(c.farms, 'farm', 'farms')], ['notes', 'Notes, to-do and crop history', `${n(c.notes, 'note', 'notes')}, ${n(c.todo, 'to-do job', 'to-do jobs')}, ${n(c.record, 'crop-history entry', 'crop-history entries')}`], ['answers', 'Remembered answers and costs', 'What you told Crophalo about each place'], ['everything', 'Everything', 'All of the above, your reminders, your settings and the saved copy of the app']];
  return `${tabs}${panel('device', `<h2>On your device</h2>
    <section class="st-card" aria-labelledby="pvAcct"><h2 id="pvAcct">No account</h2><p class="st-note">${esc(NO_ACCOUNT)}</p><div data-slot="signin"></div></section>
    <section class="st-card" aria-labelledby="pvKept"><h2 id="pvKept">What is kept here</h2><ul class="st-list" id="keptList">${rows.map(([id, label, what]) => `<li class="st-row"><span class="st-l">${esc(label)}<small>${esc(what)}</small></span><button type="button" class="btn danger" data-erase="${id}" data-label="Delete" aria-label="Delete: ${esc(label)}">Delete</button></li>`).join('')}</ul><p class="st-note">${esc(NOT_BACKUP)}</p><p class="sr" id="eraseLive" role="status" aria-live="polite"></p></section>
    <section class="st-card" aria-labelledby="bkT"><h2 id="bkT">Keep a copy</h2><p class="st-note">Everything you saved, in one file. Open it on the other computer with Restore.</p>
      <div class="st-row"><span class="st-l">Fields, notes, answers and settings</span><span class="btnrow"><button type="button" class="btn" data-backup>Download a backup file</button><button type="button" class="btn" data-restore>Restore from a backup file</button></span><input type="file" accept="application/json,.json" class="sr" id="restoreFile" aria-label="Choose a backup file to restore" tabindex="-1" aria-hidden="true"></div>
      <div id="restoreAsk" role="status" aria-live="polite"></div></section>`, 'cards')}`;
}

// ---- Limitations: what Crophalo cannot know, in a few cards. The first lines say it; "Show more" holds the rest.
const icon = id => `<svg class="ic lim-ic" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
const LIM_CARDS = Object.freeze([
  { id: 'weather', icon: 'cloud', title: 'Weather is for a wide area', say: 'One number covers a square about 50 km wide. Your field can be colder, wetter or windier.',
    more: ['The square is about 30 miles wide.', 'A valley floor can be colder than the square says, a hill windier, a coast milder. A second weather record is read beside NASA for the coldest night.', 'When your field’s height is known and differs from the square’s by 100 m or more, the temperatures are moved to it.'] },
  { id: 'sat', icon: 'globe', title: 'Satellites see big squares', say: 'Satellites see squares 30 m to 300 km wide, not your field alone.',
    more: ['Each figure says how wide its square is.', 'A regional value is one figure for a whole square, never a pattern inside your field.'] },
  { id: 'soil', icon: 'soil', title: 'Soil is from maps', say: 'Soil comes from maps. A soil test is better.',
    more: ['What crops need, and the yields nearby, are rules of thumb and map estimates.', 'Where nothing was measured, Crophalo says the soil is assumed and the answer is less sure.', 'Crop checks cover Canada and the United States.'] },
  { id: 'price', icon: 'scale', title: 'Prices are averages', say: 'Prices are averages, not what you will be paid.', more: ['They are national or world averages from the latest year published.'] },
  { id: 'data', icon: 'lock', title: 'Your data stays here', say: 'No account. Your field’s position goes to NASA and other services.', link: ['#privacy', 'See Privacy'],
    more: ['Your answers stay on this device.', 'To build a report, only the field’s position is sent, never your name.'] },
]);
export const NOT_KNOWN = Object.freeze(['Pests and diseases this year', 'Seed and fertiliser supply', 'What a buyer pays', 'Local rules and contracts', 'Your machines', 'Greenhouses', 'More than two crops a year']);
export const NOT_KNOWN_MORE = Object.freeze(['The exact days of your seed', 'Cold hollows inside the field', 'Crops outside Canada and the United States']);
const fold = (id, lines) => (lines.length ? `<details class="lim-fold" id="lf-${id}"><summary>Show more</summary>${lines.map(t => `<p>${esc(t)}</p>`).join('')}</details>` : '');
export function limitsHTML() {
  const sure = Object.entries(SURE_WORDS);
  return `<aside class="lim-decide" aria-labelledby="lmA"><h2 id="lmA">You decide</h2><p>Crophalo is a guide. Talk to someone who knows your area before you change what you plant.</p></aside>
    <div class="lim-grid">${LIM_CARDS.map(c => `<section class="lim-card" aria-labelledby="lc-${c.id}">${icon(c.icon)}<h2 id="lc-${c.id}">${esc(c.title)}</h2><p>${esc(c.say)}</p>${c.link ? `<p><a href="${esc(c.link[0])}">${esc(c.link[1])}</a></p>` : ''}${fold(c.id, c.more)}</section>`).join('')}
      <section class="lim-card" aria-labelledby="lc-sure">${icon('shieldok')}<h2 id="lc-sure">How sure is it?</h2><p>Every answer says how sure it is. Check the few things it lists.</p>
        <details class="lim-fold" id="lf-sure"><summary>Show more</summary><ul class="sure-list">${sure.map(([level, words]) => `<li><span class="chip ${level === 'Very sure' ? 'ok' : level === 'Fairly sure' ? '' : 'warn'}">${esc(level)}</span> ${esc(words)}</li>`).join('')}</ul>
        <p>A score helps you compare plans on your field. It is not a yield and not a chance of success.</p></details></section></div>
    <section class="lim-not" aria-labelledby="lmN"><h2 id="lmN">What Crophalo does not know</h2><ul class="lim-chips">${NOT_KNOWN.map(t => `<li class="chip">${esc(t)}</li>`).join('')}</ul><details class="lim-fold" id="lf-not"><summary>Show more</summary><ul class="lim-chips">${NOT_KNOWN_MORE.map(t => `<li class="chip">${esc(t)}</li>`).join('')}</ul></details></section>`;
}

// ---- Settings: ONE calm list, the way a phone's settings read. Sections with a small title; each setting one row: its name and one short help line on the left, its control on the right, thin rules between rows;
// every choice group on one line, the chosen part filled blue with white bold words. Nothing repeats its section's title.
const choicesOf = (key, words) => SETTING_CHOICES[key].map((v, i) => [v, words[i]]);
// A row: the name and its help on the left (the name carries the id the control is labelled by), the control on the right.
const row = (id, name, help, control, cls = '') => `<div class="stx-row${cls ? ' ' + cls : ''}"><div class="stx-t"><span class="stx-n" id="lab-${esc(id)}">${esc(name)}</span>${help ? `<small class="stx-h">${esc(help)}</small>` : ''}</div><div class="stx-c">${control}</div></div>`;
const segCtl = (name, choices, current, { quick = false, none = false } = {}) => `<div class="seg" role="radiogroup" aria-labelledby="lab-${esc(name)}">${choices.map(([v, t], i) => `<button type="button" role="radio" aria-checked="${v === current}" tabindex="${v === current || (none && i === 0) ? 0 : -1}" ${quick ? `data-quick="${esc(v)}"` : `data-set="${esc(name)}" data-val="${esc(v)}"`}>${esc(t)}</button>`).join('')}</div>`;
const segRow = (name, label, help, choices, current, opts) => row(name, label, help, segCtl(name, choices, current, opts));
const section = (id, title, body) => `<section class="st-card stx-sec" aria-labelledby="sx-${id}"><h2 id="sx-${id}">${esc(title)}</h2><div class="stx-list">${body}</div></section>`;
const line = (text, id = '') => `<p class="st-note"${id ? ` id="${id}"` : ''}>${esc(text)}</p>`;
export const unitSystem = u => (u.rain === 'mm' && u.temp === 'C' && u.area === 'metric' && u.yield === 't' ? 'metric' : u.rain === 'in' && u.temp === 'F' && u.area === 'imperial' && u.yield === 'bu' ? 'imperial' : 'mixed');
// "25 mm of rain · 18 °C · 40 ha": what the choices look like, in one line
export const exampleLine = (u, lines) => { const by = Object.fromEntries(lines); return `${by.Rain} of rain · ${by.Temperature} · ${by['A field'].split(' at ')[0]}`; };
export const SETTINGS_TABS = Object.freeze([{ id: 'general', label: 'General' }, { id: 'accessibility', label: 'Accessibility' }, { id: 'reminders', label: 'Reminders' }, { id: 'api', label: 'API connections' }]);
export const SETTINGS_TAB_IDS = SETTINGS_TABS.map(t => t.id);
export function settingsHTML(ctx = {}, tab = 'general') {
  const s = ctx.settings ?? {}, u = ctx.units ?? {}, system = unitSystem(u), cur = s.currency ?? 'USD', n = ctx.reminders?.length ?? 0;
  const unitsMoney = section('units', 'Units and money', `${segRow('u:system', 'Measuring system', system === 'mixed' ? 'You chose some units yourself. Pick Metric or US to set them all.' : 'Follows your country until you change it.', [['metric', 'Metric'], ['imperial', 'US']], system, { quick: true, none: system === 'mixed' })}
    <p class="st-example" aria-label="What the units look like">${esc(exampleLine(u, sampleLines(u, ctx.moneySample)))}</p>
    <details class="st-fold" id="stEach"><summary>Choose each unit</summary>
      ${segRow('u:rain', 'Rain', '', [['mm', 'mm'], ['in', 'in']], u.rain)}${segRow('u:temp', 'Temperature', '', [['C', '°C'], ['F', '°F']], u.temp)}${segRow('u:area', 'Area and distance', '', [['metric', 'ha · m · km/h'], ['imperial', 'acres · ft · mph']], u.area)}${segRow('u:yield', 'Yield', '', [['t', 't/ha'], ['bu', 'bu · t/acre']], u.yield)}
    </details>
    ${row('cur', 'Currency', 'Prices are published in US dollars.', `<select id="curSel" aria-labelledby="lab-cur">${CURRENCIES.map(([c, nm]) => `<option value="${c}"${c === cur ? ' selected' : ''}>${esc(`${c} · ${nm}`)}</option>`).join('')}</select>`)}
    ${cur === 'USD' ? '' : line(fxNote(cur, ctx.rates), 'fxNote')}`);
  const reading = section('read', 'Reading', `${segRow('text', 'Text size', 'Makes every word bigger.', choicesOf('text', ['Default', 'Larger', 'Largest']), s.text)}
    ${segRow('contrast', 'Contrast', 'Stronger colours and edges.', choicesOf('contrast', ['Standard', 'High']), s.contrast)}
    ${segRow('links', 'Links', 'Underline every link.', choicesOf('links', ['Standard', 'Underlined']), s.links)}`);
  const movement = section('move', 'Movement and sound', `${segRow('motion', 'Motion', 'Full: all animations. Less: quick fades only. Still: nothing moves.', choicesOf('motion', ['Full', 'Less', 'Still']), s.motion)}${ctx.deviceStill ? '<p class="st-note" role="status" id="motionDevice">Your device asks for less motion, so Crophalo keeps still.</p>' : ''}
    ${segRow('listen', 'Listening speed', 'How fast Crophalo reads a page aloud.', choicesOf('listen', ['Normal', 'Slower', 'Faster']), s.listen)}
    ${row('sample', 'Hear how Crophalo sounds', '', '<button type="button" class="btn" data-sample>Hear a sample</button>')}`);
  const remind = section('remind', 'Reminders', `<p class="st-note" id="remindCount">${n ? `${n} ${n === 1 ? 'reminder' : 'reminders'} set. They stay on this device.` : 'They stay on this device.'}</p>
    <div id="remindList">${remindListHTML(ctx.reminders ?? [], ctx.nowLocal ?? '2000-01-01T00:00')}</div><div id="remindWays">${settingsRemindersHTML(ctx.remindState)}</div>
    ${row('delrem', 'Remove every reminder', '', '<button type="button" class="btn danger" data-erase="reminders" data-label="Delete all reminders">Delete all reminders</button>')}`);
  const device = section('device', 'This device', `${installCardHtml()}
    ${row('reset', 'Reset settings', 'Puts units, currency, listening, motion, text size, contrast and link style back to their defaults.', '<button type="button" class="btn ghost danger" data-reset-settings>Reset settings</button>')}`);
  const tabs = tabsHTML(SETTINGS_TABS, tab, 'Parts of Settings');
  const body = tab === 'accessibility' ? `<div class="st stx"><div class="stx-col">${reading}</div><div class="stx-col">${movement}</div></div>`
    : tab === 'reminders' ? `<div class="st stx one"><div class="stx-col">${remind}</div></div>`
    : tab === 'api' ? '<div class="adm-in"><div id="admRoot"><h2 class="adm-title">API connections</h2></div></div>'
    : `<div class="st stx"><div class="stx-col">${unitsMoney}</div><div class="stx-col">${device}</div></div>`;
  return `${tabs}${panel(tab, body)}`;
}
export const PRIVACY_TAB_IDS = PRIVACY_TABS.map(t => t.id);
