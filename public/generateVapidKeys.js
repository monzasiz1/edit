const webPush = require('web-push');

// Generiere VAPID-Schlüssel
const vapidKeys = webPush.generateVAPIDKeys();
console.log(vapidKeys); // Ausgabe der Public und Private Keys
