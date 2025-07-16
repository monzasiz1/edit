// service-worker.js
const CACHE_NAME = 'Spiessbuch-v1';
const urlsToCache = [
  '/',
  '/style.css',
  '/manifest.json',
  '/icons/logo-192.png',
  '/icons/logo-512.png',
  '/offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request)).catch(() => caches.match('/offline.html'))
  );
});

// 💬 PUSH erhalten und anzeigen
self.addEventListener('push', function(event) {
  const data = event.data?.json() || {};
  const title = data.title || 'Neue Benachrichtigung';
  const options = {
    body: data.body || 'Es gibt Neuigkeiten.',
    icon: '/icons/logo-192.png',
    badge: '/icons/logo-192.png',
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 💡 Bei Klick → richtige Seite öffnen
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(event.notification.data.url)) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data.url);
    })
  );
});
