// The two service-worker handlers for reminders: show a notification when a push arrives, and open or focus Crophalo when it is clicked.
// Loaded into the service worker with importScripts-free module code: sw.js imports this file. Pure: pushNotice(), safeLink(). The listeners only attach inside a worker.
// Checked by scripts/test_remind.mjs (the notice is cut and tagged; a link is kept only when it starts with "/" or "#").

export const safeLink = url => typeof url === 'string' && /^(?:\/(?!\/)|#)[^\s\\]{0,200}$/.test(url) ? url : '/';
// What a push message becomes: { title, options }. The title is cut to 80, the body to 300; the tag holds the id and time so one reminder shows once.
export function pushNotice(data) {
  const d = data && typeof data === 'object' ? data : {}, cut = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  return { title: cut(d.title, 80) || 'Crophalo reminder', options: { body: cut(d.body, 300), tag: cut(d.tag, 120) || undefined, icon: 'icons/crophalo-192.png', badge: 'icons/crophalo-192.png', data: { url: safeLink(d.url) } } };
}
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && 'registration' in self) {
  self.addEventListener('push', event => {
    let data = null; try { data = event.data?.json(); } catch { /* an unreadable message still shows the default words */ }
    const { title, options } = pushNotice(data);
    event.waitUntil(self.registration.showNotification(title, options));
  });
  self.addEventListener('notificationclick', event => {
    event.notification.close();
    const link = safeLink(event.notification.data?.url);
    event.waitUntil((async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const mine = open.find(c => new URL(c.url).origin === self.location.origin);
      if (mine) { await mine.focus(); if ('navigate' in mine) await mine.navigate(link).catch(() => {}); return; }
      await self.clients.openWindow(link);
    })());
  });
}
