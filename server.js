require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const db = require('./db'); // Dein PG-Pool für PostgreSQL
const webPush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';

// VAPID-Schlüssel für Push-Benachrichtigungen
const vapidKeys = {
  publicKey: 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA',  // Ersetze dies mit deinem VAPID Public Key
  privateKey: 'ykcxE-Qb14LxNI0WDxBZf8gVnX3Lkz0qWxNF4Ia4v1s', // Ersetze dies mit deinem VAPID Private Key
};
webPush.setVapidDetails(
  'mailto:vorsitzender@gutschlag.de',  // Deine E-Mail-Adresse
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Setzt EJS als View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Session mit PG-Store ────────────────────────────────────────────────
app.use(session({
  store: new PgSession({
    pool: db,                   // PG-Pool
    tableName: 'session',       // Tabelle für Sitzungen
    createTableIfMissing: true, // automatisch anlegen
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,              // auf true, wenn HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 1 Tag
  }
}));

// Admin-Flag stets Boolean
app.use((req, res, next) => {
  if (req.session.user) {
    const a = req.session.user.is_admin;
    req.session.user.is_admin = [true,1,'1','true','on'].includes(a);
  }
  next();
});

// User in EJS verfügbar machen
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// ─── Deine Routen ────────────────────────────────────────────────────────
app.use('/',      require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/penalties', require('./routes/penalties'));
app.use('/users',     require('./routes/users'));
app.use('/ranking',   require('./routes/ranking'));
app.use('/export',    require('./routes/exportseite'));
app.use('/logout',    require('./routes/logout'));
app.use('/profil',    require('./routes/profile'));

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Seite nicht gefunden' });
});

// Route zum Speichern der Push-Subscription
app.post('/save-push-subscription', (req, res) => {
  const subscription = req.body;

  // Speichern der Push-Subscription in der DB (z. B. in der Tabelle 'users')
  db.query('UPDATE users SET push_subscription = $1 WHERE id = $2', [subscription, req.session.user.id])
    .then(() => res.status(200).send('Push-Subscription gespeichert'))
    .catch(err => {
      console.error('Fehler beim Speichern der Subscription', err);
      res.status(500).send('Fehler beim Speichern der Subscription');
    });
});

// Funktion zum Senden einer Push-Nachricht
async function sendPushNotification(userId, title, message) {
  try {
    // Hole die Push-Subscription des Nutzers aus der DB
    const user = await db.query('SELECT push_subscription FROM users WHERE id = $1', [userId]);
    const pushSubscription = user.rows[0].push_subscription;

    if (!pushSubscription) {
      console.log('Kein Push-Abonnement gefunden');
      return;
    }

    // Payload für die Push-Nachricht
    const notificationPayload = JSON.stringify({
      title: title,
      body: message,
      icon: '/icons/logo-192.png',
      badge: '/icons/logo-192.png'
    });

    // Sende die Push-Nachricht
    await webPush.sendNotification(pushSubscription, notificationPayload);
    console.log('Push-Nachricht erfolgreich gesendet');
  } catch (err) {
    console.error('Fehler beim Senden der Push-Nachricht', err);
  }
}

// Beispiel: Route für das Hinzufügen einer Strafe
app.post('/add-penalty', async (req, res) => {
  const { userId, amount, event } = req.body;

  // Füge die Strafe zur Datenbank hinzu
  await db.query('INSERT INTO penalties (user_id, amount, event) VALUES ($1, $2, $3)', [userId, amount, event]);

  // Sende eine Push-Benachrichtigung an den Nutzer
  const title = 'Neue Strafe erhalten';
  const message = `Du hast eine Strafe von €${amount} für das Event "${event}" erhalten.`;

  await sendPushNotification(userId, title, message);

  res.status(200).send('Strafe hinzugefügt und Benachrichtigung gesendet');
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
