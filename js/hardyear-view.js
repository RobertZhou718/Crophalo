// Crophalo's "Your hardest year" card as markup: the year chips, a row for each strategy with its twelve months and its result, the storm row, and the closed "Show more". Pure: markup from the model the report builds with js/hardyear.js.
// Checked by scripts/test_hardyear.mjs (every state and sentence) and scripts/e2e_letter.mjs (the chips, the rows, the keyboard).
import { esc } from './words.js';
import { localiseText } from './units.js';
import { WORDS } from './hardyear.js';
import { STATE_WORDS } from './calendar-data.js';

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PILL = { hurt: 'chip warn', close: 'chip', fine: 'chip good', nodata: 'chip' };
const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const monthsRow = () => `<span class="hy-months" aria-hidden="true">${LETTERS.map(l => `<i>${l}</i>`).join('')}</span>`;   // the months under the boxes, so a box is a month
const cellsHTML = cells => `<span class="hy-cells" role="img" aria-label="${esc(`What covers the ground, January to December: ${cells.map(c => `${MONTH[c.month]} ${c.state ? STATE_WORDS[c.state] : 'not said'}`).join('; ')}`)}">${cells.map(c => `<i class="hy-c is-${c.state ?? 'none'}" aria-hidden="true"></i>`).join('')}</span>`;
// model: { status: 'ok' | 'noweather' | 'toofew', chips: [{ year, words }], year, rows: [{ name, role, cells, result, reason }], storm: { n, words }, counts: [{ name, hurt, close, of }], record }
export function hardYearHTML(model) {
  const head = `<section class="hy-card card pad" id="hardYear" data-year="${model?.year ?? ''}" aria-labelledby="hyTitle"><h3 id="hyTitle">${esc(WORDS.title)}</h3>`;
  if (!model || model.status === 'noweather') return `${head}<p>${esc(WORDS.noWeather)}</p></section>`;
  if (model.status === 'toofew') return `${head}<p>${esc(WORDS.tooFew)}</p></section>`;
  const chips = model.chips.map(c => `<button type="button" class="chip hy-chip${c.year === model.year ? ' is-on' : ''}" id="hy-${c.year}" data-hy-year="${c.year}" aria-pressed="${c.year === model.year}">${c.year === model.year ? '<svg class="ic" aria-hidden="true"><use href="#i-tick"/></svg> ' : ''}${esc(c.words)}</button>`).join('');
  const pick = model.years.length > model.chips.length ? `<label class="hy-pick"><span class="sr">${esc(WORDS.pick)}</span><select data-hy-select aria-label="${esc(WORDS.pick)}"><option value="">${esc(WORDS.pick)}</option>${model.years.map(y => `<option value="${y}"${y === model.year && !model.chips.some(c => c.year === y) ? ' selected' : ''}>${y}</option>`).join('')}</select></label>` : '';
  const rows = model.rows.map(r => `<li class="hy-row"><div class="hy-name"><b>${esc(r.name)}</b> <span class="cap">${esc(r.role)}</span></div>${cellsHTML(r.cells)}${monthsRow()}<p class="hy-res"><span class="${PILL[r.result]}">${esc(WORDS[r.result])}</span> ${esc(r.reason)}</p></li>`).join('');
  const storm = model.storm?.n ? `<p class="hy-storm">${esc(model.storm.words)} <span class="cap">Covered soil is shielded from heavy raindrops that knock soil loose.</span></p>` : '';
  const counts = model.counts.map(c => `<li>${esc(c.name)}: hurt in ${c.hurt} of ${c.of} years, close call in ${c.close}.</li>`).join('');
  return `${head}<p class="lead">${esc(WORDS.lead(model.rows.length))}</p><div class="hy-chips" role="group" aria-label="Hard years">${chips}${pick}</div>
    <ul class="hy-rows" aria-live="polite">${rows}</ul>${storm}<p class="cap">${esc(WORDS.footer)}</p>
    <details class="fold-card" id="hyMore"><summary><span class="t">Show more</span></summary><div class="fold-b"><h4>${esc(WORDS.how)}</h4><p>${esc(localiseText(WORDS.howBody, model.units))}</p><h4>${esc(WORDS.judged)}</h4><p>${esc(WORDS.judgedBody)}</p>
      <h4>All years</h4><ul>${counts}</ul><p class="cap">${esc(model.record)}</p></div></details></section>`;
}
