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
app.set('layout', 'layout'); // globales Layout aktivieren

// Middlewares
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // bei HTTPS auf true setzen
}));

// User in allen Views verfügbar machen
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Routen
const authRouter = require('./routes/auth');
app.use('/', (req, res, next) => {
  // Login und Register ohne Layout (kein Menü)
  if (req.path === '/login' || req.path === '/register') {
    res.locals.layout = false;
  }
  next();
});
app.use('/', authRouter);
app.use('/dashboard', require('./routes/dashboard'));
app.use('/penalties', require('./routes/penalties'));
app.use('/users', require('./routes/users'));
app.use('/export', require('./routes/export'));
app.use('/logout', require('./routes/logout'));

// 404-Seite
app.use((req, res) => {
  res.status(404).render('404', { title: 'Seite nicht gefunden' });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
