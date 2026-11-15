// Crophalo's info pages as pure markup: Privacy (on your device, sent to other services, your choices), Limitations (one flat page), and Settings (Units, Accessibility, Saved on this device,
// Reminders, Admin). Each page with tabs has a tab strip with roving arrow keys; each choice is a segmented control; each delete asks twice. The page glue is js/pages-info.js.
// Pure: functions of plain data that return text. Nothing is read from the page.
// Checked by scripts/test_pages.mjs (every recipient named, the three sureness levels, the four unit pickers and their samples, every settings tab, plain-text escaping).
import { esc } from './words.js';
import { SENT, NO_ACCOUNT, NOT_BACKUP, keptLines, GROUPS, PRIVACY_TABS } from './privacy.js';
import { DIMS, sampleLines } from './units.js';
import { CURRENCIES, fxNote } from './currency.js';
import { SETTING_CHOICES } from './settings.js';
import { installCardHtml } from './offline.js';
import { settingsRemindersHTML, remindListHTML } from './remind.js';
import { SURE_WORDS } from './report-view.js';
import { adminHTML } from './admin-view.js';

export const SETTINGS_TABS = Object.freeze([{ id: 'units', label: 'Units' }, { id: 'access', label: 'Accessibility' }, { id: 'stored', label: 'Saved on this device' }, { id: 'remind', label: 'Reminders' }, { id: 'admin', label: 'Admin' }]);
export const PAGE_LEADS = Object.freeze({ privacy: 'What stays on your device, and what is sent out.', limits: 'What Crophalo cannot do, and how to read how sure it is.', settings: 'Units, accessibility, saved data and reminders. Your choices are kept on this device.', data: 'Where every number comes from.' });

export const tabsHTML = (tabs, current, label) => `<div class="pg-tabs" role="tablist" aria-label="${esc(label)}">${tabs.map(t => `<button type="button" role="tab" class="tab" id="pgtab-${t.id}" aria-controls="pgpanel" aria-selected="${t.id === current}" tabindex="${t.id === current ? 0 : -1}" data-pgtab="${t.id}">${esc(t.label)}</button>`).join('')}</div>`;
const panel = (id, body) => `<div class="pgpanel" id="pgpanel" role="tabpanel" aria-labelledby="pgtab-${id}" tabindex="0">${body}</div>`;
// A segmented control: radios in a group; the pressed one is checked. data-set names the setting, data-val the value.
export const segHTML = (name, label, choices, current) => `<div class="field"><span id="lab-${esc(name)}">${esc(label)}</span><div class="seg" role="radiogroup" aria-labelledby="lab-${esc(name)}">${choices.map(([v, t]) => `<button type="button" role="radio" aria-checked="${v === current}" tabindex="${v === current ? 0 : -1}" data-set="${esc(name)}" data-val="${esc(v)}">${esc(t)}</button>`).join('')}</div></div>`;

// ---- Privacy
export function privacyHTML(tab, counts) {
  const tabs = tabsHTML(PRIVACY_TABS, tab, 'Parts of Privacy');
  if (tab === 'sent') return `${tabs}${panel(tab, `<h2>Sent to other services</h2><p class="lead">To build a report, your field’s position goes to the services below. Nothing here includes your name, because Crophalo does not have it.</p>
    <div class="tbl" role="region" tabindex="0" aria-label="What each service receives"><table class="sent-table"><thead><tr><th scope="col">Service</th><th scope="col">What it receives</th><th scope="col">Why</th></tr></thead><tbody>${SENT.map(r => `<tr><th scope="row">${esc(r.service)}</th><td data-label="What it receives">${esc(r.gets)}</td><td data-label="Why">${esc(r.why)}</td></tr>`).join('')}</tbody></table></div>`)}`;
  if (tab === 'choices') return `${tabs}${panel(tab, `<h2>Your choices</h2><p class="lead">Everything Crophalo keeps is on this device, so you can remove it here. Each button asks once more before it deletes.</p>
    <ul class="gl choices-list">${GROUPS.map(g => `<li class="row"><span>${esc(g.label)}${g.sub ? `<br><small>${esc(g.sub)}</small>` : ''}</span>${g.again ? `<button type="button" class="btn" data-open-welcome>Read it again</button>` : `<button type="button" class="btn danger" data-erase="${g.id}" data-label="Delete">Delete</button>`}</li>`).join('')}</ul>
    <p class="cap">A deleted item cannot be brought back, unless you made a backup file first (Settings, Saved on this device).</p>`)}`;
  return `${tabs}${panel('device', `<h2>On your device</h2>
    <section class="card pad" aria-labelledby="pvAcct"><h3 id="pvAcct">No account</h3><p>${esc(NO_ACCOUNT)}</p><div data-slot="signin"></div></section>
    <section class="card pad" aria-labelledby="pvKept"><h3 id="pvKept">What is kept here</h3><ul id="keptList">${keptLines(counts).map(l => `<li>${esc(l)}</li>`).join('')}</ul><p class="cap">${esc(NOT_BACKUP)}</p></section>`)}`;
}

// ---- Limitations: one flat page
export function limitsHTML() {
  const sure = Object.entries(SURE_WORDS);
  return `<section class="lim" aria-labelledby="lmA"><h2 id="lmA">A guide, not an order</h2>
      <p><b>You decide what to plant.</b> You know your land best. Before you change what you plant, talk it over with someone who knows your area.</p>
      <p><b>No account.</b> Your answers stay on this device. To get your data, your field’s position is sent to NASA and the other services listed under Privacy.</p></section>
    <section class="lim" aria-labelledby="lmB"><h2 id="lmB">Data limits</h2>
      <p><b>Weather is for a 50 km square: your field can differ.</b> NASA weather is one number for a square about 50 km wide. A valley floor can be colder than the square says, a hill windier, a coast milder. A second weather record is read beside NASA for the coldest night, and a cold hollow can still be several degrees colder than both. Rain from space can read wetter than rain gauges in dry valleys behind mountains.</p>
      <p><b>Satellite layers are not the size of your field.</b> They range from 30 m to about 300 km wide. Each figure says how wide its square is. A regional value is one figure for a whole square, never a pattern inside your field.</p>
      <p><b>Soil comes from maps unless you test it.</b> A soil test is better. What crops need, and the yields nearby, are rules of thumb and map estimates. Where nothing was measured, Crophalo says the soil is assumed and the answer is less sure.</p></section>
    <section class="lim" aria-labelledby="lmC"><h2 id="lmC">Not covered</h2><p>Crophalo does not know about:</p>
      <ul><li>Pests and diseases this year.</li><li>Seed and fertiliser supply, and what a buyer pays.</li><li>Local rules, contracts and your machines.</li><li>More than two crops a year, or crops grown side by side.</li><li>Greenhouses.</li><li>The exact days of your seed.</li><li>Cold hollows and what happens inside the field.</li></ul></section>
    <section class="lim" aria-labelledby="lmD"><h2 id="lmD">How sure is this?</h2>
      <p>Every answer says how sure it is, and why. Confirm the few things it lists before you act.</p>
      <ul class="sure-list">${sure.map(([level, words]) => `<li><span class="chip ${level === 'Very sure' ? 'ok' : level === 'Fairly sure' ? '' : 'warn'}">${esc(level)}</span> ${esc(words)}</li>`).join('')}</ul>
      <p class="cap">A score is a guide to compare plans on your field. It is not a yield and not a chance of success. Crophalo’s crop rules are tested against expected answers; that does not prove the advice on your farm.</p></section>`;
}

// ---- Settings
const choicesOf = (key, words) => SETTING_CHOICES[key].map((v, i) => [v, words[i]]);
export function settingsHTML(tab, ctx = {}) {
  const tabs = tabsHTML(SETTINGS_TABS, tab, 'Parts of Settings'), s = ctx.settings ?? {}, u = ctx.units ?? {};
  if (tab === 'access') return `${tabs}${panel(tab, `<h2>Accessibility</h2>
    ${segHTML('text', 'Text size', choicesOf('text', ['Default', 'Larger', 'Largest']), s.text)}<p class="cap">Makes everything on the page bigger, not only the words, and every label still fits its box. Your browser’s own zoom also works.</p>
    ${segHTML('contrast', 'Contrast', choicesOf('contrast', ['Standard', 'High']), s.contrast)}<p class="cap">Darker grey text and stronger lines.</p>
    ${segHTML('links', 'Links', choicesOf('links', ['Standard', 'Always underlined']), s.links)}
    ${segHTML('motion', 'Motion', choicesOf('motion', ['Follow my device', 'Always still']), s.motion)}<p class="cap">Always still stops every animation on the page.</p>
    ${segHTML('listen', 'Listening speed', choicesOf('listen', ['Normal', 'Slower', 'Faster']), s.listen)}<p><button type="button" class="btn" data-sample>Hear a sample</button> <span class="cap">This is how Crophalo sounds when it reads your report aloud.</span></p>`)}`;
  if (tab === 'stored') return `${tabs}${panel(tab, `<h2>Saved on this device</h2><p class="lead">Your saved data stays on this device. See it or delete it in <a href="#privacy/choices">Privacy</a>.</p>
    <section class="card pad" aria-labelledby="bkT"><h3 id="bkT">Move to another computer</h3><p>Your saved fields, notes, crop history, answers and settings in one file. On the other computer, open Crophalo, go to Settings and choose “Restore from a backup file”.</p>
      <div class="btnrow"><button type="button" class="btn" data-backup>Download a backup file</button><button type="button" class="btn" data-restore>Restore from a backup file</button><input type="file" accept="application/json,.json" class="sr" id="restoreFile" tabindex="-1" aria-hidden="true"></div>
      <div id="restoreAsk" role="status" aria-live="polite"></div></section>
    ${installCardHtml()}
    <section class="card pad" aria-labelledby="rsT"><h3 id="rsT">Reset settings</h3><p>Puts units, currency, listening, motion, text size, contrast and link style back to their defaults.</p><p><button type="button" class="btn danger solid" data-reset-settings>Reset settings</button></p></section>`)}`;
  if (tab === 'remind') return `${tabs}${panel(tab, `<h2>Reminders</h2><p class="lead" id="remindCount">${ctx.reminders?.length ?? 0} ${ctx.reminders?.length === 1 ? 'reminder' : 'reminders'} set. They stay on this device.</p>
    <div id="remindList">${remindListHTML(ctx.reminders ?? [], ctx.nowLocal ?? '2000-01-01T00:00')}</div><div id="remindWays">${settingsRemindersHTML(ctx.remindState)}</div>
    <p><button type="button" class="btn danger" data-erase="reminders" data-label="Delete all reminders">Delete all reminders</button></p>`)}`;
  if (tab === 'admin') return `${tabs}${panel(tab, adminHTML(ctx.sources))}`;
  const picks = DIMS;
  return `${tabs}${panel('units', `<h2>Units</h2><p class="lead">Choose each unit on its own: acres with millimetres and °C is fine. The default follows your country.</p>
    <div class="field"><span id="lab-quick">All units at once</span><div class="seg" role="group" aria-labelledby="lab-quick"><button type="button" data-quick="metric" aria-pressed="${picks.rain.includes(u.rain) && u.rain === 'mm' && u.temp === 'C' && u.area === 'metric' && u.yield === 't'}">mm · °C · ha</button><button type="button" data-quick="imperial" aria-pressed="${u.rain === 'in' && u.temp === 'F' && u.area === 'imperial' && u.yield === 'bu'}">in · °F · acres</button></div></div>
    <h3>One at a time</h3>${segHTML('u:rain', 'Rain', [['mm', 'mm'], ['in', 'in']], u.rain)}${segHTML('u:temp', 'Temperature', [['C', '°C'], ['F', '°F']], u.temp)}${segHTML('u:area', 'Area and distance', [['metric', 'ha · m · km/h'], ['imperial', 'acres · ft · mph']], u.area)}${segHTML('u:yield', 'Yield', [['t', 't/ha'], ['bu', 'bushels · tons/acre']], u.yield)}
    <h3>Money</h3><p class="cap">Crop prices are published in US dollars. Choose your currency to see prices, income and your own costs in it.</p>
    <div class="field"><label for="curSel"><span>Currency</span></label><select id="curSel">${CURRENCIES.map(([c, n]) => `<option value="${c}"${c === (s.currency ?? 'USD') ? ' selected' : ''}>${esc(`${c} · ${n}`)}</option>`).join('')}</select></div><p class="cap" id="fxNote">${esc(fxNote(s.currency ?? 'USD', ctx.rates))}</p>
    <h3>What it looks like</h3><dl class="sample">${sampleLines(u, ctx.moneySample).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`)}`;
}
export const SETTINGS_TAB_IDS = SETTINGS_TABS.map(t => t.id), PRIVACY_TAB_IDS = PRIVACY_TABS.map(t => t.id);
