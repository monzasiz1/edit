// Überprüfe, ob der Browser Service Worker und Push API unterstützt
if ('serviceWorker' in navigator && 'PushManager' in window) {
  // Service Worker registrieren
  navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
    console.log('Service Worker erfolgreich registriert:', registration);

    // Anfrage nach Berechtigung für Push-Benachrichtigungen
    return Notification.requestPermission().then(function(permission) {
      if (permission === 'granted') {
        console.log('Berechtigung für Push-Benachrichtigungen erhalten');

        // Nachdem die Berechtigung erteilt wurde, registriere den Nutzer für Push-Benachrichtigungen
        return registration.pushManager.subscribe({
          userVisibleOnly: true,  // Push-Nachrichten müssen für den Benutzer sichtbar sein
          applicationServerKey: urlB64ToUint8Array('BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA')  // VAPID Public Key
        }).then(function(subscription) {
          console.log('Push-Subscription erhalten', subscription);

          // Speichere die Push-Subscription im Backend (z. B. in der DB)
          return fetch('/save-push-subscription', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
              'Content-Type': 'application/json'
            }
          }).then(response => response.json())
            .then(data => console.log('Subscription gespeichert:', data))
            .catch(error => console.error('Fehler beim Speichern der Subscription:', error));
        });
      }
    });
  }).catch(function(error) {
    console.log('Fehler bei der Service Worker Registrierung:', error);
  });
} else {
  console.log('Push-Benachrichtigungen oder Service Worker werden in diesem Browser nicht unterstützt.');
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
