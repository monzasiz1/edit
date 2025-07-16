const PUBLIC_VAPID_KEY = 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA';

console.log('🧪 Aktueller Pfad:', window.location.pathname);
console.log('🔁 Registriere Service Worker unter: /service-worker.js');

if ('serviceWorker' in navigator && 'PushManager' in window) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(async function (registration) {
      console.log('✅ Service Worker registriert:', registration);

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
          console.log('🔐 Push-Subscription gesendet');
        } else {
          console.error('❌ Fehler beim Senden:', response.statusText);
        }
      } else {
        console.log('📬 Bereits abonniert.');
      }
    })
    .catch(error => {
      console.error('❌ SW-Fehler:', error);
    });
} else {
  console.warn('⚠️ Kein SW oder PushManager.');
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
