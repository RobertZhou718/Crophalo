// Crophalo's video: thirty seconds on how Crophalo works. One player, used twice: at the top of the welcome sheet, and in the dialog that the
// top bar's "Watch the video" button opens. It never starts by itself: it plays, with its sound, only on the farmer's own press, and nothing
// of it is fetched before that press except its first picture.
// Pure: playerHTML(). The rest builds on the page. Checked by scripts/test_video.mjs.
import { esc } from './words.js';

export const VIDEO = Object.freeze({ file: 'media/crophalo-30s.mp4', poster: 'media/crophalo-30s-poster.jpg', words: 'media/crophalo-30s.vtt' });
export const WORDS = Object.freeze({
  open: 'Watch the video', title: 'How Crophalo works', close: 'Close',
  play: 'Play the video: how Crophalo works, 30 seconds',
  caption: '30 seconds: how Crophalo works. Narration: synthetic voice.',
  fold: 'Read it as text',
  // the narration, word for word (media/crophalo-30s-transcript.txt holds the same words)
  text: 'Hi, this is Crophalo. Pick your field on the map. Answer four short questions about your crops, your water and your soil. Crophalo reads your field\'s own NASA weather record, back to 2001, and shows which rotation suits it, and why. It\'s a guide. You decide what to plant. Keep the field in My Farm, and compare the plans on your map. Crophalo. Know your field before you plant.',
});

// The player: the first picture with one large Play button, the caption, and the narration as text in a fold. The words are already written into the
// picture, so the timed-words track is offered but not switched on.
export function playerHTML(id = 'vid') {
  return `<figure class="vid" data-video>
    <div class="vid-frame">
      <video class="vid-el" id="${esc(id)}" preload="none" playsinline poster="${VIDEO.poster}" aria-label="${esc(WORDS.title)}">
        <source src="${VIDEO.file}" type="video/mp4">
        <track kind="captions" srclang="en" label="English" src="${VIDEO.words}">
      </video>
      <button type="button" class="vid-play" aria-label="${esc(WORDS.play)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z"/></svg></button>
    </div>
    <figcaption class="cap vid-cap">${esc(WORDS.caption)}</figcaption>
    <details class="vid-text"><summary>${esc(WORDS.fold)}</summary><p>${esc(WORDS.text)}</p></details>
  </figure>`;
}

// ---- on the page
function needStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[href="css/video.css"]')) return;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/video.css'; document.head.append(link);
}
needStyles();   // the top bar's button needs them from the first paint

// Under Settings > Motion "Still", or the device's less-movement choice, the video waits for its own Play button even in the dialog.
const still = () => { try { return document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };

// Wire one player inside root. start() plays with the controls shown; stop() pauses and goes back to the first picture and the Play button.
export function wirePlayer(root) {
  const video = root.querySelector('[data-video] video'), play = root.querySelector('[data-video] .vid-play');
  const rest = () => { video.controls = false; play.hidden = false; };
  const start = () => {
    video.controls = true; play.hidden = true;
    const going = video.play();
    if (going?.catch) going.catch(rest);   // a browser that refuses to play leaves the Play button where it was
  };
  const stop = () => { if (!video.paused) video.pause(); if (video.currentTime || video.ended) video.load(); rest(); };   // load(): back to the first picture, nothing fetched
  play.addEventListener('click', start);
  // Playing by itself when the welcome sheet opens: with sound where the browser lets it; where it does not, without sound and with one button to turn the sound on.
  // Never under Motion Still or the device's less-movement choice.
  const auto = () => {
    if (still()) return;
    video.muted = false; video.controls = true; play.hidden = true;
    const going = video.play();
    if (going?.catch) going.catch(() => {
      video.muted = true;
      const quiet = video.play();
      if (quiet?.catch) quiet.catch(rest);
      if (!root.querySelector('.vid-sound')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary vid-sound'; b.textContent = 'Turn sound on';
        b.addEventListener('click', () => { video.muted = false; video.currentTime = 0; video.play(); b.remove(); });
        video.parentElement.append(b);
        video.addEventListener('volumechange', () => { if (!video.muted) b.remove(); });
      }
    });
  };
  video.addEventListener('ended', () => { video.load(); rest(); });
  return { video, start, stop, auto };
}

// The dialog behind the top bar's button: the same player. The press on "Watch the video" is the farmer's own press, so it plays at once (not under Still).
let dialog = null, player = null, opener = null;
export function openVideo(event) {
  dialog ??= document.getElementById('dlgVideo');
  if (!dialog) return;
  if (!player) {
    dialog.querySelector('#vidHere').innerHTML = playerHTML('vidDialog');
    player = wirePlayer(dialog);
    dialog.querySelector('#vidClose').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { player.stop(); opener?.focus(); });   // Escape and Close both end here: the video stops and the focus goes back to the button
  }
  opener = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.getElementById('navVideo');
  if (!dialog.open) dialog.showModal();
  if (!still()) player.start();
}
