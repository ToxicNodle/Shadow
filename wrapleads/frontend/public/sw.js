// WrapOS Service Worker — handles Web Push notifications
// Scope: / (root, catches all push events)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'WrapOS', body: event.data.text() };
  }

  const title = payload.title || 'WrapOS';
  const options = {
    body: payload.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || 'wrapos-notification',
    requireInteraction: payload.requireInteraction === true,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const focused = clients.find((c) => c.focus);
      if (focused) {
        focused.focus();
        focused.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
