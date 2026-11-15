// The measuring tape of the big animations, loaded only by the browser suites: long animation frames (Chrome and Edge), frame intervals, the frames the conductor
// asked for, and the length and moving parts of every animation document.getAnimations() shows while it runs. Nothing in the app imports it.
// Not pure: it watches the page it is loaded in. Used by scripts/macro_harness.mjs; checked by scripts/e2e_macro.mjs.
import { _clock } from './macro-core.js';

let on = false, frames = 0, last = null, observer = null, raf0 = 0;
let longFrames = [], intervals = [], animations = [], seen = new WeakSet();

const nameOf = el => (el ? `${el.tagName?.toLowerCase?.() || ''}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` : '');
function look() {   // every animation not seen before: its length, its iterations, what it moves
  for (const a of globalThis.document?.getAnimations?.() || []) {
    if (seen.has(a)) continue; seen.add(a);
    const t = a.effect?.getTiming?.() || {}, kf = a.effect?.getKeyframes?.() || [];
    const props = [...new Set(kf.flatMap(k => Object.keys(k).filter(p => !['offset', 'easing', 'composite', 'computedOffset'].includes(p))))];
    animations.push({ id: a.id || a.animationName || '', duration: Number(t.duration) || 0, iterations: Number.isFinite(t.iterations) ? t.iterations : 'forever', props, target: nameOf(a.effect?.target), pseudo: a.effect?.pseudoElement || '' });
  }
}
function frame(now) {
  if (!on) return;
  if (last !== null) intervals.push(now - last);
  last = now; frames++; look();
  globalThis.requestAnimationFrame(frame);
}

export const probe = {
  start() {
    on = true; frames = 0; last = null; longFrames = []; intervals = []; animations = []; seen = new WeakSet(); raf0 = _clock.rafCalls;
    try {
      if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('long-animation-frame')) {
        observer = new PerformanceObserver(list => { for (const e of list.getEntries()) longFrames.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration ?? 0 }); });
        observer.observe({ type: 'long-animation-frame' });
      }
    } catch { observer = null; }
    look();
    globalThis.requestAnimationFrame?.(frame);
    return true;
  },
  stop() {
    on = false; look();
    try { observer?.disconnect(); } catch { /* it had stopped */ }
    observer = null;
    return { longFrames: [...longFrames], intervals: [...intervals], rafCalls: _clock.rafCalls - raf0, animations: [...animations], frames, loaf: !!globalThis.PerformanceObserver?.supportedEntryTypes?.includes('long-animation-frame') };
  },
};
