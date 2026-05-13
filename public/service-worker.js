const CACHE_NAME = 'spiessbuch-v4';
const OFFLINE_URL = '/offline.html';

// Dateien die beim Installieren gecacht werden
const PRE_CACHE = [
  '/',
  '/dashboard',
  '/offline.html',
  '/logo.png',
  '/icons/logo-192.png',
  '/icons/logo-512.png',
  '/manifest.json',
  '/style.css'
];

// Install: Pre-Cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

// Activate: Alte Caches löschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network-first für API/Formulare, Cache-first für Assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur eigene Requests behandeln
  if (url.origin !== self.location.origin) return;

  // POST-Requests nie cachen
  if (request.method !== 'GET') return;

  // Navigation: Network-first, Fallback auf offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Statische Assets: Cache-first, aber nur erfolgreiche Responses cachen
  if (
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?|ttf)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Standard: Network mit Cache-Fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_URL)))
  );
});

// Push-Benachrichtigungen
self.addEventListener('push', event => {
  let data = { title: 'Spießbuch', body: 'Neue Nachricht', url: '/dashboard' };
  try {
    data = event.data ? event.data.json() : data;
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/logo-192.png',
      badge: '/icons/logo-192.png',
      tag: 'spiessbuch',
      renotify: true,
      data: { url: data.url || '/dashboard' }
    })
  );
});

// Notification-Click öffnet die App
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
