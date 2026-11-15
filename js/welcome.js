// Crophalo's welcome: a sheet that says what Crophalo can and cannot do and what happens to the farmer's data. It is shown until
// accepted once, and again whenever its words change. Later it can be read again from Privacy; then it only closes.
// Nothing here is pure: it builds the sheet and reads and writes the browser's storage.
// Checked by scripts/e2e_flow.mjs (it blocks until accepted, Escape cannot dismiss it the first time, read again shows Close).
import { esc } from './words.js';
import { initListen, stopSpeaking } from './listen.js';

export const WELCOME_KEY = 'crophalo.welcome.v1';
export const WELCOME_VERSION = '2026-11-14';   // the day these words were last changed: a new date here shows the sheet to everyone again

const WORDS = {
  title: 'Welcome to Crophalo', intro: 'Please read what Crophalo can and cannot do.',
  listen: 'Listen to this page', said: 'Before you start. Crophalo is a guide. You decide what to plant.',
  more: 'Read the rest', less: 'Show less', go: 'I understand. I decide what to plant.', close: 'Close',
};
const CARDS = [   // the first sentence always shows; the rest folds under "Read the rest"
  { icon: 'i-shieldok', title: 'A guide: you decide what to plant.', first: 'You know your land best.',
    rest: 'Before you change what you plant, talk it over with someone who knows your area.' },
  { icon: 'i-globe', title: 'NASA POWER weather is for a square about 50 km wide.', first: 'Hills, valleys and coasts can differ.',
    rest: 'Satellite layers range from 30 m to about 300 km wide. Prices are national or world averages, not what you will be paid.' },
  { icon: 'i-soil', title: 'Soil comes from maps unless you test it.', first: 'A soil test is better.',
    rest: 'What crops need, and the yields nearby, are rules of thumb and map estimates from about 2020. Crophalo does not know about pests, diseases, seed supply, local rules or your machines.' },
  { icon: 'i-hand', title: 'Some things are not covered.', first: 'More than two crops a year are not worked out.',
    rest: 'Some places have little data. Every answer says “How sure is this?”: confirm the few things it lists.' },
  { icon: 'i-lock', title: 'No account: your answers stay on this device.', first: 'Your field’s position is sent to NASA and other services.',
    rest: 'They are listed under Privacy. Voice typing in Chrome sends your speech to Google to turn it into text.' },
];

let sheet = null, thisVisit = false;   // thisVisit: accepted, even where the browser refuses to store it

export function welcomeAccepted() {
  if (thisVisit) return true;
  try { return JSON.parse(localStorage.getItem(WELCOME_KEY))?.v === WELCOME_VERSION; } catch { return false; }
}
function accept() {
  thisVisit = true;
  try { localStorage.setItem(WELCOME_KEY, JSON.stringify({ v: WELCOME_VERSION, at: new Date().toISOString() })); } catch { /* blocked storage: accepted for this visit only */ }
}

function build() {
  if (!document.querySelector('link[href="css/pages.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/pages.css'; document.head.append(l); }   // the one new rule the sheet needs is there
  sheet = document.createElement('dialog');
  sheet.className = 'sheet welcome'; sheet.id = 'dlgWelcome';
  sheet.setAttribute('aria-labelledby', 'welcomeTitle'); sheet.setAttribute('aria-describedby', 'welcomeIntro');
  sheet.innerHTML = `
    <div class="welcome-body">
      <div class="welcome-top"><svg class="welcome-mark" aria-hidden="true"><use href="#logo"/></svg></div>
      <h1 id="welcomeTitle">${esc(WORDS.title)}</h1>
      <p class="welcome-intro" id="welcomeIntro">${esc(WORDS.intro)}</p>
      <button type="button" class="listen" id="welcomeListen" hidden><svg class="ic" aria-hidden="true"><use href="#i-speaker"/></svg><span class="t">${esc(WORDS.listen)}</span></button>
      <div class="welcome-cards">${CARDS.map((card, i) => `
        <section class="welcome-card inset" aria-labelledby="welcomeCard${i}">
          <span class="welcome-ic" aria-hidden="true"><svg class="ic"><use href="#${card.icon}"/></svg></span>
          <div>
            <h2 id="welcomeCard${i}">${esc(card.title)}</h2>
            <p>${esc(card.first)}</p>
            <p id="welcomeRest${i}" hidden>${esc(card.rest)}</p>
          </div>
        </section>`).join('')}
      </div>
      <button type="button" class="link welcome-more" id="welcomeMore" aria-expanded="false" aria-controls="${CARDS.map((_, i) => `welcomeRest${i}`).join(' ')}">${esc(WORDS.more)} <i class="chev" aria-hidden="true"></i></button>
    </div>
    <div class="welcome-foot">
      <button type="button" class="btn primary lg" id="welcomeGo">${esc(WORDS.go)}</button>
    </div>`;
  document.body.append(sheet);

  const go = sheet.querySelector('#welcomeGo'), more = sheet.querySelector('#welcomeMore');
  more.addEventListener('click', () => {   // one button opens all five folds, and closes them again
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', open); more.firstChild.textContent = `${open ? WORDS.less : WORDS.more} `;
    for (const p of sheet.querySelectorAll('[id^="welcomeRest"]')) p.hidden = !open;
  });
  go.addEventListener('click', () => { accept(); sheet.close(); });   // one press says it: "I understand. I decide what to plant."
  sheet.addEventListener('cancel', event => { if (!welcomeAccepted()) event.preventDefault(); });   // the first time, Escape cannot dismiss it
  sheet.addEventListener('close', () => { stopSpeaking(); if (!welcomeAccepted()) show(); });       // and if a browser closes it anyway, it comes back
  initListen(sheet.querySelector('#welcomeListen'), () => [WORDS.said, ...CARDS.map(card => `${card.title} ${card.first} ${card.rest}`)].join(' '));
}

function show() {
  const accepted = welcomeAccepted();
  sheet.querySelector('#welcomeGo').textContent = accepted ? WORDS.close : WORDS.go;   // read again later: the button only closes
  if (!sheet.open) sheet.showModal();
  sheet.querySelector('.welcome-body').scrollTop = 0;
}

// Open the sheet: at the start for a farmer who has not accepted these words, or opened again by the welcome event.
export function openWelcome() { if (!sheet) build(); show(); }
export function initWelcome() { if (!welcomeAccepted()) openWelcome(); }
