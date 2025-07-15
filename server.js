require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PGStore = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const pool = require('./db');

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

// Session-Store in Postgres
app.use(session({
  store: new PGStore({
    pool,                // deine pg-Pool-Instanz
    tableName: 'session' // die Tabelle legst du mit `CREATE TABLE session (…)` an
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,       // in Produktion auf true setzen, wenn HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Tage
  }
}));

// Admin-Flag immer als Boolean normalisieren
app.use((req, res, next) => {
  if (req.session.user) {
    const a = req.session.user.is_admin;
    req.session.user.is_admin = (
      a === true ||
      a === 1 ||
      a === '1' ||
      a === 'true' ||
      a === 'on'
    );
  }
  next();
});

// Session‑User in alle Views injizieren
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Deine Routen
app.use('/',       require('./routes/auth'));
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
