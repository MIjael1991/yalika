/*
 * Avisos de Tequio al celular (solo para las pantallas de /tequio/).
 * El aviso llega vacío: aquí se le pide a Yalika lo pendiente y se muestra. No guarda páginas
 * ni datos en caché.
 */
const INBOX = '/api/yalika/presente/push/inbox';
const ICON = '/app-icon-192.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function showPending() {
  let items = [];
  try {
    const response = await fetch(INBOX, { credentials: 'include', cache: 'no-store' });
    if (response.ok) items = await response.json();
  } catch {
    // Sin conexión: se muestra el aviso general.
  }
  if (!Array.isArray(items) || !items.length) {
    // Siempre hay que mostrar algo al recibir un aviso.
    return self.registration.showNotification('Tequio', {
      body: 'Tienes novedades. Toca para ver.',
      icon: ICON,
      badge: ICON,
      tag: 'tequio',
      data: { url: '/tequio' },
    });
  }
  await Promise.all(
    items.map((item) =>
      self.registration.showNotification(item.title || 'Tequio', {
        body: item.body || '',
        icon: ICON,
        badge: ICON,
        tag: item.tag || undefined,
        data: { url: item.url || '/tequio' },
      }),
    ),
  );
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPending());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/tequio';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client);
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
