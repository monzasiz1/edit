require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const db = require('./db');
const webPush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';

const vapidKeys = {
  publicKey: 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA',
  privateKey: 'ykcxE-Qb14LxNI0WDxBZf8gVnX3Lkz0qWxNF4Ia4v1s',
};
webPush.setVapidDetails('mailto:vorsitzender@gutschlag.de', vapidKeys.publicKey, vapidKeys.privateKey);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/login'));

app.use(session({
  store: new PgSession({ pool: db, tableName: 'session', createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  if (req.session.user) {
    req.session.user.is_admin = [true, 1, '1', 'true', 'on'].includes(req.session.user.is_admin);
  }
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/penalties', require('./routes/penalties'));
app.use('/users', require('./routes/users'));
app.use('/ranking', require('./routes/ranking'));
app.use('/export', require('./routes/exportseite'));
app.use('/logout', require('./routes/logout'));
app.use('/profil', require('./routes/profile'));

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!req.session.user) return res.status(403).send('Nicht eingeloggt');

  db.query('UPDATE users SET push_subscription = $1 WHERE id = $2', [subscription, req.session.user.id])
    .then(() => res.status(200).send('Push gespeichert'))
    .catch(err => {
      console.error('Fehler beim Speichern', err);
      res.status(500).send('Fehler beim Speichern');
    });
});

async function sendPushNotification(userId, title, message) {
  try {
    const result = await db.query('SELECT push_subscription FROM users WHERE id = $1', [userId]);
    const pushSubscription = result.rows[0]?.push_subscription;
    if (!pushSubscription) return;

    await webPush.sendNotification(pushSubscription, JSON.stringify({
      title, body: message, icon: '/icons/logo-192.png', badge: '/icons/logo-192.png'
    }));
  } catch (err) {
    console.error('Push Fehler:', err);
  }
}

app.post('/add-penalty', async (req, res) => {
  const { userId, amount, event } = req.body;
  await db.query('INSERT INTO penalties (user_id, amount, event) VALUES ($1, $2, $3)', [userId, amount, event]);
  await sendPushNotification(userId, 'Neue Strafe erhalten', `Du hast €${amount} für "${event}" bekommen.`);
  res.status(200).send('Strafe + Push');
});

app.use((req, res) => res.status(404).render('404', { title: 'Seite nicht gefunden' }));

app.listen(PORT, () => console.log(`✅ Server läuft auf http://localhost:${PORT}`));
