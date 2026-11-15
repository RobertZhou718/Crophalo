// Crophalo's toast: one short line at the foot of the screen (or over the setup map, above its bar), sometimes with one button (Undo). A new line replaces the old one.
// A line with Undo counts down where it can be seen (the seconds, and under Full a thin bar running out) and waits while a pointer or the keyboard is on it. Nothing here is pure: it changes the page.
// Checked by scripts/e2e_flow.mjs and scripts/e2e.mjs (the line shows and goes; Undo brings a deleted saved field back), scripts/e2e_micro.mjs (the countdown, the wait, the three motion levels) and scripts/e2e_maptools.mjs (the map's undo toasts stay while pointed at).
import { motionLess } from './motion.js';

let timer = 0, undo = null, run = null, token = 0;   // run: the countdown of the line now showing, or null; token: names the line now showing
const box = () => document.getElementById('toast');

function stopRun() { clearTimeout(timer); if (!run) return; clearInterval(run.tick); run.anim?.cancel(); run = null; }

export function hideToast() {
  stopRun();
  undo = null;
  box().classList.remove('show');
}

// The farmer's pointer or keyboard is on the line: the time stops where it is and goes on from there when they leave.
function hold() { if (!run || run.paused) return; run.paused = true; run.left -= performance.now() - run.since; clearTimeout(timer); run.anim?.pause(); }
function release() { if (!run || !run.paused) return; run.paused = false; run.since = performance.now(); timer = setTimeout(hideToast, run.left); run.anim?.play(); }
let wired = false;
function wire(line) {
  if (wired) return; wired = true;
  line.addEventListener('pointerenter', hold); line.addEventListener('pointerleave', release);
  line.addEventListener('focusin', hold); line.addEventListener('focusout', event => { if (!line.contains(event.relatedTarget)) release(); });
}

// Show a line for ms milliseconds. With action and onAction it carries one button and the countdown; pressing it runs onAction once and hides the line.
// at: { left, right, bottom } in px from the screen's edges puts the line centred between left and right at that height (the setup map puts its lines
// over the map, above its own bar, so they never cover the bar's words or the Next button); without it the line stands at the foot of the screen.
// Returns a number that names this line, for isToast().
export function toast(text, { action = '', onAction = null, ms = 4000, at = null } = {}) {
  const line = box();
  stopRun();
  wire(line);
  for (const side of ['left', 'right', 'bottom']) line.style[side] = at && Number.isFinite(at[side]) ? `${Math.round(at[side])}px` : '';
  line.textContent = text;
  undo = null;
  if (action && onAction) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn sm'; button.textContent = action;
    undo = () => { hideToast(); onAction(); };
    button.addEventListener('click', undo);
    const counting = action === 'Undo';   // the seconds and the bar belong to a line you can still undo; an Open button just waits
    const secs = document.createElement('span'); secs.className = 'toast-secs'; secs.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('span'); bar.className = 'toast-count'; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i>';
    line.append(button, ...(counting ? [secs, bar] : []));
    run = { left: ms, since: performance.now(), paused: false, anim: null, tick: 0 };
    const show = () => { const left = run.paused ? run.left : run.left - (performance.now() - run.since); secs.textContent = `${Math.max(1, Math.ceil(left / 1000))} s`; };
    if (counting) { show(); run.tick = setInterval(show, 200); }
    if (!counting || motionLess()) bar.hidden = true;   // under Less and Still the bar does not run; the seconds still count
    else run.anim = bar.firstElementChild.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
  }
  line.classList.add('show');
  timer = setTimeout(hideToast, ms);
  if (run && line.matches(':hover')) hold();   // a line that appears under a still pointer waits at once
  return ++token;
}
// True while the line named by that number is the one showing.
export const isToast = n => n === token && box()?.classList.contains('show');

// The button of the line now showing, for the keyboard's undo (Ctrl or Cmd with Z). True when there was one to run.
export function runToastAction() { if (!undo) return false; undo(); return true; }
