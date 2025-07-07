const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// Login-Seite
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login POST
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = { id: user.id, username: user.username, is_admin: user.is_admin };
    return res.redirect('/dashboard');
  }
  res.render('login', { error: 'Benutzername oder Passwort falsch.' });
});

// Registrierung anzeigen
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Registrierung POST
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('register', { error: 'Bitte alle Felder ausfüllen.' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    await db.query('INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)', [username, hash, false]);
    res.redirect('/login');
  } catch (err) {
    res.render('register', { error: 'Benutzername existiert bereits.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Startseite weiterleiten
router.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

module.exports = router;
