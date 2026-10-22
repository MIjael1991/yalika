/* La plataforma no guarda páginas privadas ni datos de negocio en caché. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tienes un pendiente en Yalika', {
      body: data.body || '',
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      tag: data.tag || 'yalika-aviso',
      renotify: true,
      requireInteraction: true,
      vibrate: [250, 120, 250, 120, 400],
      data: { url: data.url || '/inicio', taskId: data.taskId || null },
      actions: data.taskId
        ? [
            { action: 'done', title: 'Ya lo hice' },
            { action: 'later', title: 'Para después' },
          ]
        : [],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || '/life';
  const taskId = event.notification.data?.taskId;

  function openApp() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);

      if (existing) {
        existing.navigate(requestedUrl);
        return existing.focus();
      }

      return self.clients.openWindow(requestedUrl);
    });
  }

  // «Ya lo hice» desde la notificación: se marca hecha sin abrir la app.
  if (event.action === 'done' && taskId) {
    event.waitUntil(
      fetch('/api/yalika/task/' + encodeURIComponent(taskId) + '/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
        .then((response) => (response.ok ? undefined : openApp()))
        .catch(() => openApp()),
    );
    return;
  }

  event.waitUntil(openApp());
});
