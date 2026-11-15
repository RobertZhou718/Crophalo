// The style sheet of the info pages (Data, Privacy, Limitations, Settings, Service status) is asked for the first time one of them is drawn.
// Until it has arrived the page's body is kept out of sight (it still takes its place), so the first picture is never the page without its look. A sheet that never comes (offline) lets the page show after 1.5 s.
// Checked in a page by scripts/e2e_pages.mjs, which opens each info page and waits for css/pages.css before it measures.
export function pageStyle(href, node) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector(`link[rel=stylesheet][href="${href}"]`);
  if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }
  if (link.sheet || !node) return;
  const was = node.style.visibility; node.style.visibility = 'hidden';
  const show = () => { if (node.style.visibility === 'hidden') node.style.visibility = was; };
  link.addEventListener('load', show, { once: true }); link.addEventListener('error', show, { once: true }); setTimeout(show, 1500);
}
