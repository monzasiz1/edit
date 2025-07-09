const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware: Nutzer muss eingeloggt sein
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Dashboard anzeigen
router.get('/', requireLogin, async (req, res) => {
  let users = null;
  let penalties = null;

  if (req.session.user.is_admin) {
    // Admin: Sieht alle Nutzer UND eigene Strafen
    users = (await db.query('SELECT id, username, is_admin FROM users ORDER BY username')).rows;
    penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.session.user.id]
    )).rows;
  } else {
    // Normale Nutzer sehen ihre Strafen
    penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.session.user.id]
    )).rows;
  }

  res.render('dashboard', {
    layout: 'layout',
    user: req.session.user,
    users,       // User-Liste für Admin, sonst null
    penalties,   // Eigene Strafen (immer gesetzt)
    title: 'Dashboard'
  });
});

module.exports = router;
