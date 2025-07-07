require('dotenv').config();
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');

const app = express();

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';

// EJS & Layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');

// Middlewares
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

// --- Hier einfügen (macht user überall im Template verfügbar) ---
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});
// ---------------------------------------------------------------

// Routen
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
// usw.

app.use('/penalties', require('./routes/penalties'));
app.use('/users', require('./routes/users'));
app.use('/export', require('./routes/export'));

// 404-Fehlerseite
app.use((req, res) => {
  res.status(404).render('404', { layout: 'layout', user: req.session.user });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
