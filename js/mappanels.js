// Crophalo's map panels: the buttons at the top right of the map (Places, Layers) and the one glass card each opens under them. Only one panel is open at a time, and each has a visible close; it closes on Escape (focus
// goes back to its button), on a click outside (that tap does not also move the pin), and when focus leaves it. Nothing here knows what a panel holds: each panel is { id, label, icon, build(body, env) }.
// Not pure: it builds and listens in the page. Checked by scripts/e2e_map.mjs (the places and layers groups: open, close, Escape, outside click, one at a time).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const CLOSE_ICON = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

// ui: { box, right, host } the map's box, the container of the buttons, the container of the card. env: { say, swallow(), beforeOpen() } what the map lends.
export function initPanels(ui, env = {}) {
  const defs = new Map();
  let open = null, opener = null, built = null, card = null;
  const buttonOf = id => ui.right.querySelector(`[data-panel="${id}"]`);

  function add(def) {
    defs.set(def.id, def);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mapbtn mapx-pbtn'; b.dataset.panel = def.id; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `${def.icon ?? ''}<span class="mapx-w">${esc(def.label)}</span>`;
    ui.right.append(b);
    return b;
  }
  function show(id) {
    const def = defs.get(id); if (!def) return;
    close(false); env.beforeOpen?.(id);
    opener = buttonOf(id); open = id;
    ui.host.innerHTML = `<section class="mapx-panel" role="dialog" aria-label="${esc(def.label)}" id="mapxPanel-${esc(id)}" tabindex="-1">
      <header class="mapx-phead"><h2 id="mapxPanelTitle-${esc(id)}">${esc(def.title ?? def.label)}</h2><button type="button" class="mapx-pclose" aria-label="Close ${esc(def.label)}">${CLOSE_ICON}</button></header><div class="mapx-pbody"></div></section>`;
    card = ui.host.firstElementChild;
    card.setAttribute('aria-labelledby', `mapxPanelTitle-${id}`);
    opener?.setAttribute('aria-expanded', 'true');
    built = def.build(card.querySelector('.mapx-pbody'), env) || {};
    if (built.focus) built.focus(); else card.querySelector('input, button:not(.mapx-pclose), a')?.focus();
    if (!card.contains(document.activeElement)) card.focus();
    env.say?.(`${def.label} opened`);
  }
  function close(refocus) {
    if (!open) return;
    const was = opener, id = open;
    built?.destroy?.();
    ui.host.innerHTML = '';
    was?.setAttribute('aria-expanded', 'false');
    open = null; opener = null; built = null; card = null;
    if (refocus && was?.isConnected) was.focus();
    env.closed?.(id);
  }
  const toggle = id => (open === id ? close(true) : show(id));

  ui.right.addEventListener('click', event => { const b = event.target.closest('[data-panel]'); if (b && !b.disabled) toggle(b.dataset.panel); });
  ui.host.addEventListener('click', event => { if (event.target.closest('.mapx-pclose')) close(true); });
  ui.host.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } });
  ui.host.addEventListener('focusout', event => { if (open && event.relatedTarget && !card.contains(event.relatedTarget) && event.relatedTarget !== opener) close(false); });
  // a press outside the card and its buttons closes it, and the tap that follows is not a move of the pin
  const outside = event => { if (open && !card?.contains(event.target) && !ui.right.contains(event.target)) { close(false); env.swallow?.(); } };
  document.addEventListener('pointerdown', outside, true);
  return { add, show, close, toggle, isOpen: () => open, body: () => card?.querySelector('.mapx-pbody') ?? null, dispose() { document.removeEventListener('pointerdown', outside, true); close(false); } };
}
