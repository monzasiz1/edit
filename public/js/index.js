const PUBLIC_VAPID_KEY = 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA';

console.log('🧪 Aktueller Pfad:', window.location.pathname);
console.log('🔁 Registriere Service Worker unter: /service-worker.js');

// iOS-Erkennung + Installationshinweis
const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isStandalone = ('standalone' in navigator) && navigator.standalone;

if (isIos && !isStandalone) {
  alert('📱 Um Push-Benachrichtigungen zu erhalten, installiere die App über „Teilen“ > „Zum Home-Bildschirm“.');
}

// Service Worker registrieren
let swRegistration;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(reg => {
      swRegistration = reg;
      console.log('✅ Service Worker registriert:', reg);
      createPushButton();
    })
    .catch(err => console.error('❌ Fehler bei der SW-Registrierung:', err));
} else {
  console.warn('⚠️ Service Worker wird nicht unterstützt.');
}


// Hilfsfunktion
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
