// The My farms list and Farm settings: open another farm, add one, rename it, move its pin, say how its fields get water, delete it (it waits 30 days in Recently deleted).
// Everything is drawn from the store through one env object; the changes themselves are pure operations in simulate.js.
// Checked by scripts/test_sim.mjs (the operations) and scripts/e2e_farm.mjs (the list and the settings in a browser).
import { esc } from './words.js';
import { areaWords } from './geo.js';
import * as S from './simulate.js';

const WATER = [['none', 'Rainfed'], ['limited', 'Limited irrigation'], ['full', 'Irrigated as needed']], TILLAGE = [['conventional', 'Conventional'], ['reduced', 'Reduced'], ['notill', 'No-till']];
const dayWords = at => { const d = new Date(at); return `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getFullYear()}`; };
const head = (title, sub, close = true) => `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">${esc(title)}</h2>${sub ? `<p class="fw-sub">${esc(sub)}</p>` : ''}</div>${close ? '<button type="button" class="btn lg" id="fwClose">Close</button>' : ''}</div>`;

export function renderFarms(env) {
  const { store, farm } = env.get(), p = env.node, most = store.farms.length >= S.LIMITS.farms, gone = S.pruneDeletedFarms(store.deleted || []);
  p.innerHTML = `${head('My farms', `${store.farms.length} farm${store.farms.length === 1 ? '' : 's'} on this device`)}
  <ul class="fw-list fw-farms">${store.farms.map(f => `<li><button type="button" class="btn lg fw-row" data-open="${esc(f.id)}" ${f.id === farm?.id ? 'aria-current="true"' : ''}><span><b>${esc(f.name)}</b><br><small>${esc(f.pin.label || `${f.pin.lat}, ${f.pin.lon}`)}</small><br><small>${esc(S.farmSummary(f, ha => areaWords(ha)))}</small></span>${f.id === farm?.id ? '<span class="fw-tickmark" aria-hidden="true">✓</span><span class="sr">, open now</span>' : ''}</button></li>`).join('')}</ul>
  <div class="fw-actions"><button type="button" class="btn lg primary" data-act="add" ${most ? 'disabled' : ''}>+ Add a farm</button><button type="button" class="btn lg" data-act="settings" ${farm ? '' : 'disabled'}>Farm settings</button></div>
  ${most ? '<p class="fw-muted">You have the most farms Crophalo keeps (8).</p>' : ''}
  ${gone.length ? `<h3>Recently deleted farms</h3><p class="fw-muted">Kept on this device for 30 days. A farm comes back with its fields and plans.</p><ul class="fw-list">${gone.map(d => `<li><span><b>${esc(d.farm.name)}</b><br><small>${esc(S.farmSummary(d.farm, ha => areaWords(ha)))} · deleted ${dayWords(d.at)}</small></span><button type="button" class="btn lg" data-restore="${esc(d.farm.id)}" aria-label="Restore ${esc(d.farm.name)}">Restore</button></li>`).join('')}</ul>` : ''}`;
  p.querySelector('#fwClose').onclick = () => env.close();
  for (const b of p.querySelectorAll('[data-open]')) b.onclick = () => env.open(b.dataset.open);
  p.querySelector('[data-act=add]').onclick = () => env.add();
  p.querySelector('[data-act=settings]').onclick = () => env.settings();
  for (const b of p.querySelectorAll('[data-restore]')) b.onclick = () => {
    const res = S.restoreFarm(env.get().store, b.dataset.restore); if (res.refused) return env.toast(res.refused);
    env.commit(res.store, `${res.farm.name} is back, with its fields.`, false, res.farm.id);
  };
  p.querySelector('#fwPanelTitle').focus();
}

export function renderSettings(env) {
  const { store, farm } = env.get(), p = env.node;
  if (!farm) { p.innerHTML = `${head('Farm settings', '')}<p>No farm is open.</p>`; p.querySelector('#fwClose').onclick = () => env.close(); return; }
  const pr = farm.practice;
  p.innerHTML = `${head('Farm settings', 'Name, pin, how your fields get water')}
  <form id="fwFarmForm" class="fw-form"><label for="fwFarmNameIn">Farm name</label><input id="fwFarmNameIn" class="fw-input" maxlength="60" value="${esc(farm.name)}" autocomplete="off"><p class="fw-err" id="fwFarmErr" role="alert"></p><div class="fw-actions"><button type="submit" class="btn lg primary">Save name</button></div></form>
  <h3>Pin</h3><p>${esc(farm.pin.label || '')}${farm.pin.label ? ' · ' : ''}${farm.pin.lat}, ${farm.pin.lon}</p><p class="fw-muted">The NASA weather is asked for the pin.</p><button type="button" class="btn lg" data-act="pin">Move the pin</button>
  <fieldset class="fw-radios"><legend>How do your fields get water?</legend>${WATER.map(([k, w]) => `<label><input type="radio" name="irr" value="${k}" ${pr.irrigation === k ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>
  <fieldset class="fw-radios"><legend>Tillage</legend>${TILLAGE.map(([k, w]) => `<label><input type="radio" name="till" value="${k}" ${pr.tillage === k ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>
  <fieldset class="fw-radios"><legend>Cover crops</legend><label><input type="checkbox" id="fwCover" ${pr.coverOK ? 'checked' : ''}> Cover crops are possible on this farm</label></fieldset>
  <h3>Delete</h3><p class="fw-muted">The farm, its fields and plans go to Recently deleted for 30 days.</p><button type="button" class="btn lg danger armed" data-act="delete">Delete farm</button>
  <div class="fw-actions"><button type="button" class="btn lg" data-act="back">Back to My farms</button></div>`;
  p.querySelector('#fwClose').onclick = () => env.close();
  p.querySelector('[data-act=back]').onclick = () => env.list();
  p.querySelector('#fwFarmForm').onsubmit = e => {
    e.preventDefault();
    const res = S.renameFarm(env.get().store, farm.id, p.querySelector('#fwFarmNameIn').value); if (res.refused) { p.querySelector('#fwFarmErr').textContent = res.refused; return; }
    env.apply(res.store); env.say(`Renamed to ${S.getFarm(res.store, farm.id).name}.`); renderSettings(env); p.querySelector('#fwFarmNameIn').focus();
  };
  const setPractice = change => { const res = S.setFarmPractice(env.get().store, farm.id, change); if (res.refused) return env.toast(res.refused); env.apply(res.store); env.say('Saved.'); };
  for (const r of p.querySelectorAll('input[name=irr]')) r.onchange = () => setPractice({ irrigation: r.value });
  for (const r of p.querySelectorAll('input[name=till]')) r.onchange = () => setPractice({ tillage: r.value });
  p.querySelector('#fwCover').onchange = e => setPractice({ coverOK: e.target.checked });
  p.querySelector('[data-act=pin]').onclick = () => env.pickPin(ll => {
    const res = S.moveFarmPin(env.get().store, farm.id, +ll.lat.toFixed(4), +ll.lng.toFixed(4)); if (res.refused) return env.toast(res.refused);
    env.commit(res.store, 'Pin moved. Getting the new weather…', true); if (res.words) env.say(res.words); env.settings();
  }, () => env.settings());
  p.querySelector('[data-act=delete]').onclick = () => {
    p.innerHTML = `${head(`Delete ${farm.name}?`, '', false)}<p>The farm, its ${farm.fields.length} field${farm.fields.length === 1 ? '' : 's'} and their plans are removed from this device's board. They wait under Recently deleted for 30 days, and you can undo it for a few seconds.</p><div class="fw-actions"><button type="button" class="btn lg danger armed" data-act="really">Delete</button><button type="button" class="btn lg" data-act="keep">Keep it</button></div>`;
    p.querySelector('#fwPanelTitle').focus();
    p.querySelector('[data-act=keep]').onclick = () => { renderSettings(env); p.querySelector('[data-act=delete]').focus(); };
    p.querySelector('[data-act=really]').onclick = () => { const res = S.deleteFarm(env.get().store, farm.id); if (res.refused) return env.toast(res.refused); env.commit(res.store, `${farm.name} deleted`, true, null, true); };
  };
  p.querySelector('#fwPanelTitle').focus();
}
