// Crophalo's Listen buttons: the device reads a text aloud; pressing the same button again stops it. Only one speaks at a time.
// Nothing here is pure: it uses the device's own voice. Nothing is sent anywhere.
// Checked by scripts/e2e_flow.mjs (the button shows only where the device can speak; pressing it twice ends as it began).
import { readSettings } from './settings.js';

const RATE = { normal: 1, slow: 0.8, fast: 1.25 }, STOP = 'Stop';
let talking = null;   // the button that is speaking now

export const canSpeak = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function settle() {   // the button goes back to its own words
  if (!talking) return;
  talking.classList.remove('talking');
  talking.querySelector('.t').textContent = talking.dataset.say;
  talking = null;
}
export function stopSpeaking() { if (canSpeak()) speechSynthesis.cancel(); settle(); }

// Make a hidden .listen button work: it shows itself only where the device can speak. text is the words, or a function that gives them.
export function initListen(button, text) {
  if (!button || !canSpeak()) return;
  button.hidden = false;
  button.dataset.say = button.querySelector('.t').textContent;
  button.addEventListener('click', () => {
    const mine = talking === button;
    stopSpeaking();
    if (mine) return;
    const say = new SpeechSynthesisUtterance(typeof text === 'function' ? text() : text);
    say.lang = 'en';
    say.rate = RATE[readSettings().listen] ?? 1;
    say.onend = say.onerror = () => { if (talking === button) settle(); };
    talking = button;
    button.classList.add('talking');
    button.querySelector('.t').textContent = STOP;
    speechSynthesis.speak(say);
  });
}
