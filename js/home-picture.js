// Crophalo's home picture of the Earth: NASA's Blue Marble, kept in the app as two files of our own so the home never waits for another server: a small one
// that shows at once and the sharp one that follows. Where they came from, and when: img/earth/README.md. loadBitmap() and loadPicture() decode a picture before it is used.
// Checked by scripts/e2e_home.mjs (the Earth draws at once with every outside host cut off) and scripts/e2e.mjs.
export const EARTH_SMALL = 'img/earth/small.webp', EARTH_SHARP = 'img/earth/sharp.webp';

// A picture for drawing, fetched as a file and decoded into a bitmap away from the page's own thread. (Cutting tiles out of an <img> decoded the
// whole picture again on the page's thread for each tile: 60 to 100 ms each, 300 ms and more on a slow processor.)
export async function loadBitmap(url, { signal } = {}) {
  const res = await fetch(url, { signal, credentials: 'same-origin' });
  if (!res.ok) throw new Error('the picture did not load');
  const file = await res.blob();
  try { return await createImageBitmap(file); } catch {   // a browser that cannot decode a file into a bitmap: the same file as an <img>, no second request
    const here = URL.createObjectURL(file);
    try { return await loadPicture(here, { signal }); } finally { URL.revokeObjectURL(here); }
  }
}

// A picture loaded for drawing as an <img>: crossorigin, so WebGL may read it (for a browser that cannot decode a file into a bitmap).
export function loadPicture(url, { signal } = {}) {
  return new Promise((done, fail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; img.decoding = 'async';
    if ('fetchPriority' in img) img.fetchPriority = 'low';
    const stop = () => { img.src = ''; fail(new Error('stopped')); };
    signal?.addEventListener('abort', stop, { once: true });
    img.onload = () => { signal?.removeEventListener('abort', stop); (img.decode ? img.decode() : Promise.resolve()).then(() => done(img), () => done(img)); };
    img.onerror = () => { signal?.removeEventListener('abort', stop); fail(new Error('the picture did not load')); };
    img.src = url;
  });
}
