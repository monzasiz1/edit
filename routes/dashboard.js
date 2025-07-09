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
  let penalties = null;

  // Admin sieht nur seine eigenen Strafen
  penalties = (await db.query(
    `SELECT p.*, a.username AS admin
     FROM penalties p
     LEFT JOIN users a ON p.admin_id = a.id
     WHERE p.user_id = $1
     ORDER BY p.date DESC`,
    [req.session.user.id]
  )).rows;

  res.render('dashboard', {
    layout: 'layout',
    user: req.session.user,
    penalties,   // Zeigt die Strafen des Nutzers an (inkl. Admin-Name)
    title: 'Dashboard'
  });
});

module.exports = router;
