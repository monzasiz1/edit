const PUBLIC_VAPID_KEY = 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA';

console.log('🧪 Aktueller Pfad:', window.location.pathname);
console.log('🔁 Registriere Service Worker unter: /service-worker.js');

// iOS-Erkennung + Installationshinweis
const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isStandalone = ('standalone' in navigator) && navigator.standalone;

if (isIos && !isStandalone) {
  alert('📱 Um Push-Benachrichtigungen zu erhalten, installiere diese App über „Teilen“ > „Zum Home-Bildschirm“.');
}

// Warte auf Button-Click
document.addEventListener('DOMContentLoaded', async () => {
  const button = document.getElementById('enablePush');
  if (!button) return;

  button.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('❌ Push API wird nicht unterstützt.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('🔕 Push wurde nicht erlaubt.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('✅ Service Worker registriert:', registration);

      const sub = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(PUBLIC_VAPID_KEY)
      });

      const response = await fetch('/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });

      if (response.ok) {
        alert('🔔 Push aktiviert!');
      } else {
        console.error('❌ Fehler beim Senden der Subscription:', response.statusText);
        alert('❌ Fehler beim Speichern der Subscription.');
      }
    } catch (err) {
      console.error('❌ Fehler bei Push:', err);
      alert('❌ Push-Fehler: ' + err.message);
    }
  });
});

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
