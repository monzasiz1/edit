const PUBLIC_VAPID_KEY = 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA';

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

        await fetch('/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSub)
        });
        console.log('🔐 Push-Subscription gesendet');
      } else {
        console.log('📬 Benutzer ist bereits für Push abonniert.');
      }
    })
    .catch(function (error) {
      console.error('❌ Fehler bei der Service Worker-Registrierung:', error);
    });
} else {
  console.warn('⚠️ Service Worker oder Push API wird nicht unterstützt.');
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
