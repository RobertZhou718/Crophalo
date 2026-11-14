// Crophalo's welcome: a sheet that says what Crophalo can and cannot do and what happens to the farmer's data. It is shown until
// accepted once, and again whenever its words change. Later it can be read again from Privacy; then it only closes.
// Nothing here is pure: it builds the sheet and reads and writes the browser's storage.
// Checked by scripts/e2e_flow.mjs (it blocks until accepted, Escape cannot dismiss it the first time, read again shows Close).
import { esc } from './words.js';
import { initListen, stopSpeaking } from './listen.js';

export const WELCOME_KEY = 'crophalo.welcome.v1';
export const WELCOME_VERSION = '2026-11-14';   // the day these words were last changed: a new date here shows the sheet to everyone again

const WORDS = {
  chip: 'Read this first', title: 'Welcome to Crophalo',
  intro: 'Crophalo helps you think about what to plant next, using NASA weather since 2001 and recent satellite data for your own field. Please read what it can and cannot do.',
  doesLabel: 'What Crophalo does', does: ['NASA weather for your field', 'Crops that grow near you', 'A reason for every idea'],
  listen: 'Listen to this page', said: 'Before you start. Crophalo is a guide. You decide what to plant.',
  more: 'Read the rest', agree: 'I understand Crophalo is a guide, and I decide what to plant.', go: 'Continue', close: 'Close',
};
const CARDS = [   // the first sentence always shows; the rest folds under "Read the rest"
  { icon: 'i-shieldok', title: 'A guide: you decide what to plant.', first: 'You know your land best.',
    rest: 'Before you change what you plant, talk it over with someone who knows your area.' },
  { icon: 'i-globe', title: 'Weather is for a 50 km square: your field can differ.', first: 'Hills, valleys and coasts can differ at your field.',
    rest: 'Satellite layers range from 30 m to about 300 km wide. Prices are national or world averages, not what you will be paid.' },
  { icon: 'i-soil', title: 'Soil comes from maps unless you test it.', first: 'A soil test is better.',
    rest: 'What crops need, and the yields nearby, are rules of thumb and map estimates from about 2020. Crophalo does not know about pests, diseases, seed supply, local rules or your machines.' },
  { icon: 'i-hand', title: 'Some things are not covered.', first: 'More than two crops a year, or crops grown side by side, are not worked out.',
    rest: 'Some places have little data. Every answer says “How sure is this?”: confirm the few things it lists.' },
  { icon: 'i-lock', title: 'No account: your answers stay on this device.', first: 'To get your data, your field’s position is sent to NASA and the other services listed under Privacy.',
    rest: 'Voice typing in Chrome sends your speech to Google to turn it into text.' },
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
  sheet = document.createElement('dialog');
  sheet.className = 'sheet welcome'; sheet.id = 'dlgWelcome';
  sheet.setAttribute('aria-labelledby', 'welcomeTitle'); sheet.setAttribute('aria-describedby', 'welcomeIntro');
  sheet.innerHTML = `
    <div class="welcome-body">
      <div class="welcome-top"><svg class="welcome-mark" aria-hidden="true"><use href="#logo"/></svg><span class="chip">${esc(WORDS.chip)}</span></div>
      <h2 id="welcomeTitle">${esc(WORDS.title)}</h2>
      <p class="welcome-intro" id="welcomeIntro">${esc(WORDS.intro)}</p>
      <ul class="chips" aria-label="${esc(WORDS.doesLabel)}">${WORDS.does.map(word => `<li class="chip ok">${esc(word)}</li>`).join('')}</ul>
      <button type="button" class="listen" id="welcomeListen" hidden><svg class="ic" aria-hidden="true"><use href="#i-speaker"/></svg><span class="t">${esc(WORDS.listen)}</span></button>
      <div class="welcome-cards">${CARDS.map((card, i) => `
        <section class="welcome-card inset" aria-labelledby="welcomeCard${i}">
          <span class="welcome-ic" aria-hidden="true"><svg class="ic"><use href="#${card.icon}"/></svg></span>
          <div>
            <h3 id="welcomeCard${i}">${esc(card.title)}</h3>
            <p>${esc(card.first)}</p>
            <button type="button" class="link" aria-expanded="false" aria-controls="welcomeRest${i}">${esc(WORDS.more)} <i class="chev" aria-hidden="true"></i></button>
            <p id="welcomeRest${i}" hidden>${esc(card.rest)}</p>
          </div>
        </section>`).join('')}
      </div>
    </div>
    <div class="welcome-foot">
      <label class="swrow"><span>${esc(WORDS.agree)}</span><input type="checkbox" role="switch" class="sr" id="welcomeAgree"><i class="sw" aria-hidden="true"></i></label>
      <button type="button" class="btn primary lg" id="welcomeGo" disabled>${esc(WORDS.go)}</button>
    </div>`;
  document.body.append(sheet);

  const agree = sheet.querySelector('#welcomeAgree'), go = sheet.querySelector('#welcomeGo');
  for (const more of sheet.querySelectorAll('.welcome-card .link')) more.addEventListener('click', () => {
    const open = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', open);
    sheet.querySelector('#' + more.getAttribute('aria-controls')).hidden = !open;
  });
  agree.addEventListener('change', () => { go.disabled = !agree.checked; });
  go.addEventListener('click', () => { if (!agree.checked) return; accept(); sheet.close(); });
  sheet.addEventListener('cancel', event => { if (!welcomeAccepted()) event.preventDefault(); });   // the first time, Escape cannot dismiss it
  sheet.addEventListener('close', () => { stopSpeaking(); if (!welcomeAccepted()) show(); });       // and if a browser closes it anyway, it comes back
  initListen(sheet.querySelector('#welcomeListen'), () => [WORDS.said, ...CARDS.map(card => `${card.title} ${card.first} ${card.rest}`)].join(' '));
}

function show() {
  const accepted = welcomeAccepted(), agree = sheet.querySelector('#welcomeAgree'), go = sheet.querySelector('#welcomeGo');
  agree.checked = accepted;
  go.disabled = !accepted;
  go.textContent = accepted ? WORDS.close : WORDS.go;   // read again later: the switch is already on and the button only closes
  if (!sheet.open) sheet.showModal();
  sheet.querySelector('.welcome-body').scrollTop = 0;
}

// Open the sheet: at the start for a farmer who has not accepted these words, or from Privacy > Your choices > "Read it again".
export function openWelcome() { if (!sheet) build(); show(); }
export function initWelcome() { if (!welcomeAccepted()) openWelcome(); }
