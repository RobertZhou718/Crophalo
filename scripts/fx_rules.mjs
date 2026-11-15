// The owner's motion rules as checks on a stylesheet and its script, shared by the suites of the motion modules (css/fx-halo.css and any module after it).
// scanMotion({ css, js, appCss, label, check, same, effects, allowedLong }) runs every rule and reports through check() and same(). Used by scripts/test_fx_halo.mjs.
export const stripCss = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
export const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

export function scanMotion({ css: rawCss, js: rawJs, appCss: rawApp, label, check, same, effects = [], fxCss = '' }) {
  const CSS = stripCss(rawCss), JS = stripJs(rawJs), APP = stripCss(rawApp);
  const L = s => `${label}: ${s}`;
  const curves = [...(CSS + JS).matchAll(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g)];
  check(L('every curve in it stays inside 0 to 1 in x and y (nothing overshoots, nothing pulls back), and it uses no steps() or linear() above 1'), curves.every(m => [1, 2, 3, 4].every(i => +m[i] >= 0 && +m[i] <= 1)) && !/steps\(|linear\(\s*[^)]*\b(1\.\d*[1-9]|[2-9])/.test(CSS + JS), curves.map(m => m[0]));
  const scales = [...(CSS + JS).matchAll(/scale[XY]?\(\s*([^)]*)\)/g)].map(m => m[1].trim());
  check(L('nothing is scaled past full size'), scales.every(v => /^\$\{[^}]*\}$/.test(v) || (+v <= 1 && +v >= 0)), scales);
  check(L('nothing rotates, bounces, springs, wiggles, shakes, pops, skews or gets perspective'), !/rotate\(|bounce|spring|wiggle|shake|overshoot|\bpop\b|perspective|skew/i.test(CSS + JS), (CSS + JS).match(/rotate\(|bounce|spring|wiggle|shake|overshoot|\bpop\b|perspective|skew/i)?.[0]);
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  same(L('no press or hover rule changes a transform'), rules.filter(([, sel, body]) => /:hover|:active/.test(sel) && /transform|scale|translate/.test(body)).map(r => r[1].trim()), []);
  const sets = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)], wrong = [];
  for (const [, name, body] of sets) {
    const steps = [...body.matchAll(/([\d.%a-z,\s]+)\{([^{}]*)\}/g)].map(m => ({ at: m[1].trim() === 'from' ? 0 : m[1].trim() === 'to' ? 100 : parseFloat(m[1]), body: m[2] })).sort((a, b) => a.at - b.at);
    const series = { opacity: [], ty: [], dash: [] };
    for (const s of steps) { const o = /opacity:\s*([\d.]+)/.exec(s.body); if (o) series.opacity.push(+o[1]); const d = /stroke-dashoffset:\s*(-?[\d.]+)/.exec(s.body); if (d) series.dash.push(+d[1]); }
    for (const [k, v] of Object.entries(series)) { const up = v.every((x, i) => i === 0 || x >= v[i - 1] - 1e-9), down = v.every((x, i) => i === 0 || x <= v[i - 1] + 1e-9); if (!up && !down) wrong.push(`${name}.${k}: ${v.join(' → ')}`); }
  }
  same(L('in every set of keyframes each thing only climbs or only falls'), wrong, []);
  const jsKeyframes = [...JS.matchAll(/\.animate\(\s*\[([\s\S]*?)\]\s*,/g)].map(m => m[1]);
  const jsOpacity = jsKeyframes.map(k => [...k.matchAll(/opacity:\s*([\d.]+)/g)].map(m => +m[1]));
  check(L('script animations: opacity only climbs or only falls in each'), jsOpacity.every(v => v.every((x, i) => i === 0 || x >= v[i - 1]) || v.every((x, i) => i === 0 || x <= v[i - 1])), jsOpacity);
  check(L('script animations never scale or rotate'), jsKeyframes.every(k => !/scale|rotate|skew/.test(k)), jsKeyframes.find(k => /scale|rotate|skew/.test(k)));
  const first = /:root\s*\{([\s\S]*?)\n\}/.exec(rawApp)[1], tokens = new Set([...first.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const own = new Set([...(fxCss ? stripCss(fxCss) : '').matchAll(/(--fx-[\w-]+)\s*:/g)].map(m => m[1]));
  const used = [...new Set([...CSS.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]))];
  same(L('every var(--…) is a token of css/app.css (or a runtime value set by script: --share, --fx-step, --fx-delay, --len)'), used.filter(v => !tokens.has(v) && !own.has(v) && !['--share', '--fx-step', '--fx-delay', '--len'].includes(v)), []);
  check(L('no colour is written out in the stylesheet (no hex, rgb, hsl, oklch)'), !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/.test(CSS), CSS.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)?.[0]);
  check(L('no colour is written out in the script either'), !/#[0-9a-fA-F]{6}\b/.test(JS));
  check(L('the still switch is written for the farmer\'s setting and for the device\'s, switching off every animation and transition of every fx- class'), /html\[data-motion=reduce\]\s+\[class\*="fx-"\][\s\S]*?animation:\s*none\s*!important;\s*transition:\s*none\s*!important/.test(CSS) && /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\[class\*="fx-"\][\s\S]*?animation:\s*none\s*!important;\s*transition:\s*none\s*!important/.test(CSS));
  const anim = rules.filter(([, sel, body]) => /(^|;)\s*(animation|transition)(?!-)/.test(body) && !/none/.test(body)).map(r => r[1].trim());
  check(L('every rule that animates or transitions names an fx- class (so the still switch reaches it)'), anim.every(s => /fx-/.test(s)), anim.filter(s => !/fx-/.test(s)));
  check(L('every motion that runs in script asks still() or less() first'), effects.every(name => { const m = new RegExp(`export (?:async )?function ${name}\\b([\\s\\S]*?)(?=\\n// ----|\\nexport (?:async )?function |$)`).exec(JS); return m && /(still|less)\(\)/.test(m[1]); }), effects.filter(name => !new RegExp(`export (?:async )?function ${name}\\b[\\s\\S]*?(still|less)\\(\\)`).test(JS)));
  check(L('nothing loops for ever'), !/infinite/.test(CSS) && !/iterations:\s*Infinity/.test(JS));
  check(L('it reads and stores nothing: no network, no storage'), !/fetch\(|localStorage|sessionStorage|XMLHttpRequest|indexedDB/.test(JS));
  return { CSS, JS, sets: sets.length };
}
