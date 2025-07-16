const PUBLIC_VAPID_KEY = 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA';

console.log('🧪 Aktueller Pfad:', window.location.pathname);
console.log('🔁 Registriere Service Worker unter: /service-worker.js');

// iOS-Erkennung + Installationshinweis
const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isStandalone = ('standalone' in navigator) && navigator.standalone;

if (isIos && !isStandalone) {
  alert('📱 Um Push-Benachrichtigungen zu erhalten, installiere diese App über „Teilen“ > „Zum Home-Bildschirm“.');
}

// Haupt-Logik für Push
if ('serviceWorker' in navigator && 'PushManager' in window) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(async function (registration) {
      console.log('✅ Service Worker registriert:', registration);

      // Warten bis aktiv (besonders bei iOS wichtig)
      if (!registration.active) {
        await new Promise(resolve => {
          const interval = setInterval(() => {
            if (registration.active) {
              clearInterval(interval);
              resolve();
            }
          }, 100);
        });
      }

      // Push-Freigabe anfordern, falls noch nicht erfolgt
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('🔕 Push nicht erlaubt vom Benutzer.');
          return;
        }
      }

      const existingSubscription = await registration.pushManager.getSubscription();
      if (!existingSubscription) {
        const newSub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(PUBLIC_VAPID_KEY)
        });

        const response = await fetch('/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSub)
        });

        if (response.ok) {
          console.log('🔐 Push-Subscription gesendet und gespeichert.');
        } else {
          console.error('❌ Fehler beim Senden der Subscription:', response.statusText);
        }
      } else {
        console.log('📬 Benutzer ist bereits für Push abonniert.');
      }
    })
    .catch(function (error) {
      console.error('❌ SW-Fehler:', error);
    });
} else {
  console.warn('⚠️ Service Worker oder Push API wird nicht unterstützt.');
}

// Hilfsfunktion
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
