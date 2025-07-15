const CACHE_NAME = 'Spiessbuch-v1'; // Cache-Name
const urlsToCache = [
  '/',
  '/style.css',
  '/manifest.json',
  '/icons/logo-192.png',
  '/icons/logo-512.png',
  '/offline.html' // Optional: Offline-Seite für Fehlerfälle
];

// Installations-Ereignis: Caching der angegebenen Ressourcen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching resources for offline use');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())  // Service Worker sofort aktivieren
  );
});

// Aktivierungs-Ereignis: Alte Caches entfernen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME)  // Lösche alte Caches
          .map(k => caches.delete(k))  // Lösche sie
      );
    })
  );
});

// Fetch-Ereignis: Rückgabe von gecachten Antworten oder Netzwerkanfragen
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))  // Fallback zu Netzwerk, wenn nicht im Cache
      .catch(err => {
        // Fallback für Fehler, wie z. B. bei Offline-Modus
        console.error('Fetch failed, serving cached content', err);
        return caches.match('/offline.html');  // Optional: Eine offline.html-Seite für Fehlerfälle bereitstellen
      })
  );
});

// Push-Ereignis: Benachrichtigung empfangen und anzeigen
self.addEventListener('push', function(event) {
  const data = event.data.json(); // Das Push-Event enthält die Nachricht im JSON-Format
  const title = data.title || 'Neue Benachrichtigung';  // Titel der Benachrichtigung
  const options = {
    body: data.body || 'Hier ist eine Push-Nachricht.', // Text der Benachrichtigung
    icon: '/icons/logo-192.png', // Icon für die Benachrichtigung
    badge: '/icons/logo-192.png' // Badge für die Benachrichtigung
  };

  // Benachrichtigung anzeigen
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Benachrichtigungs-Klick-Ereignis: Aktion nach Klick auf die Benachrichtigung
self.addEventListener('notificationclick', function(event) {
  event.notification.close();  // Benachrichtigung schließen

  // Öffne das Dashboard (kann nach Bedarf geändert werden)
  event.waitUntil(
    clients.openWindow('/dashboard') // Beispiel: Öffne das Dashboard der App
  );
});
