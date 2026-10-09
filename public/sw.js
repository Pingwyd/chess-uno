/*
 * Chess Uno service worker: notifications only (no offline caching, so deploys are never stale).
 * The page calls registration.showNotification(); clicking one focuses the open app (or opens it).
 * Server push (tab closed) is not wired up yet; see BACKLOG.md.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(scope));
    if (open) return open.focus();
    return self.clients.openWindow(scope);
  })());
});
