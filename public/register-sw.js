if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        // Registrierung erfolgreich
        // console.log('ServiceWorker registered:', reg);
      })
      .catch(err => {
        // Registrierung fehlgeschlagen
        // console.warn('ServiceWorker registration failed:', err);
      });
  });
}
