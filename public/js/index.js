// Überprüfen, ob der Browser Service Worker und Push API unterstützt
if ('serviceWorker' in navigator && 'PushManager' in window) {
  // Service Worker registrieren
  navigator.serviceWorker.register('/public/service-worker.js', { scope: '/' })
    .then(function(registration) {
      console.log('Service Worker erfolgreich registriert:', registration);

      // Optional: Prüfen, ob der Service Worker bereits installiert wurde
      if (registration.installing) {
        console.log('Service Worker wird installiert...');
      }

      // Optional: Informieren, wenn der Service Worker aktiv ist
      if (registration.active) {
        console.log('Service Worker ist aktiv.');
      }
    })
    .catch(function(error) {
      console.error('Fehler bei der Registrierung des Service Workers:', error);
    });
} else {
  // Falls Service Worker oder Push API nicht unterstützt wird
  console.log('Service Worker oder Push API wird in diesem Browser nicht unterstützt.');
}

// Hilfsfunktion, um den Public Key in das richtige Format umzuwandeln (Base64 -> Uint8Array)
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}
