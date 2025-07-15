require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const db = require('./db'); // Dein PG-Pool

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';

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

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
