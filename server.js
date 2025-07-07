
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');


const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'defaultsecret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production'
  }
}));


// Benutzer verfügbar machen in Views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// View-Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Routen
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const penaltyRoutes = require('./routes/penalties');
const usersRoutes = require('./routes/users');
const exportRoutes = require('./routes/export');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/penalties', penaltyRoutes);
app.use('/users', usersRoutes);
app.use('/export', exportRoutes);

// Service Worker
app.get('/register-sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register-sw.js'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});


