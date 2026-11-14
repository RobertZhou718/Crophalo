// Crophalo's toast: one short line at the foot of the screen, sometimes with one button (Undo). A new line replaces the old one.
// Nothing here is pure: it changes the page.
// Checked by scripts/e2e_flow.mjs (the line shows and goes; Undo brings a deleted saved field back).

let timer = 0, undo = null;
const box = () => document.getElementById('toast');

export function hideToast() {
  clearTimeout(timer);
  undo = null;
  box().classList.remove('show');
}

// Show a line for ms milliseconds. With action and onAction it carries one button; pressing it runs onAction once and hides the line.
export function toast(text, { action = '', onAction = null, ms = 4000 } = {}) {
  const line = box();
  clearTimeout(timer);
  line.textContent = text;
  undo = null;
  if (action && onAction) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn sm'; button.textContent = action;
    undo = () => { hideToast(); onAction(); };
    button.addEventListener('click', undo);
    line.append(button);
  }
  line.classList.add('show');
  timer = setTimeout(hideToast, ms);
}

// The button of the line now showing, for the keyboard's undo (Ctrl or Cmd with Z). True when there was one to run.
export function runToastAction() { if (!undo) return false; undo(); return true; }
