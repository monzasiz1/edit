require('dotenv').config();
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');

// Routen-Imports
const rankingRoutes = require('./routes/ranking');
const exportRoutes = require('./routes/exportseite');

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

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));


// Admin-Bool immer normalisieren, falls User eingeloggt
app.use((req, res, next) => {
  if (req.session.user) {
    let a = req.session.user.is_admin;
    req.session.user.is_admin = (
      a === true ||
      a === 1 ||
      a === "1" ||
      a === "true" ||
      a === "on"
    );
  }
  next();
});

// User global verfügbar
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Routen
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/penalties', require('./routes/penalties'));
app.use('/users', require('./routes/users'));
app.use('/ranking', rankingRoutes);
app.use('/export', require('./routes/exportseite'));
app.use('/logout', require('./routes/logout'));
app.use('/profil', require('./routes/profile'));




// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Seite nicht gefunden' });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
