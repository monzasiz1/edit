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
  if (req.session.user.is_admin) {
    // Admin sieht alle Nutzer (und kann z.B. Adminfunktionen nutzen)
    const users = (await db.query('SELECT id, username, is_admin FROM users ORDER BY username')).rows;
    res.render('dashboard', { user: req.session.user, users });
  } else {
    // Normale Nutzer sehen ihre Strafen
    const penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC', 
      [req.session.user.id]
    )).rows;
    res.render('dashboard', { user: req.session.user, penalties });
  }
});

module.exports = router;
