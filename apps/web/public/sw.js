/* La plataforma no guarda páginas privadas ni datos de negocio en caché. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || '/life';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);

      if (existing) {
        existing.navigate(requestedUrl);
        return existing.focus();
      }

      return self.clients.openWindow(requestedUrl);
    }),
  );
});
