// register-sw.js
const PUBLIC_VAPID_KEY = 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Service Worker registrieren (notwendig für PWA-Installierbarkeit)
      const reg = await navigator.serviceWorker.register('/service-worker.js');
      console.log('[SW] Registriert:', reg.scope);

      // Push-Subscription nur wenn PushManager unterstützt und Erlaubnis vorhanden
      if ('PushManager' in window && 'Notification' in window) {
        // Nur versuchen wenn Erlaubnis bereits erteilt – nie automatisch nachfragen
        if (Notification.permission !== 'granted') return;

        const swReg = await navigator.serviceWorker.ready;

        let sub = await swReg.pushManager.getSubscription();
        if (!sub) {
          sub = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(PUBLIC_VAPID_KEY)
          });
          await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub)
          });
        }
      }
    } catch (err) {
      // Nur echte Fehler loggen, keine abgelehnten Permissions
      if (err.name !== 'NotAllowedError') {
        console.error('[SW] Fehler:', err);
      }
    }
  });
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
