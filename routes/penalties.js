const express = require('express');
const router = express.Router();
const db = require('../db');

// Leitet /penalties auf /penalties/all (Grid/Modal)
router.get('/', (req, res) => res.redirect('/penalties/all'));

// Middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
  next();
}

// Alle Nutzer + deren Strafen GRUPPIERT (für moderne Übersicht/Modal)
router.get('/all', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  const penalties = (await db.query(`
    SELECT p.*, u.username 
    FROM penalties p 
    JOIN users u ON p.user_id = u.id 
    ORDER BY u.username, p.date DESC
  `)).rows;
  // Pro User gruppieren
  const grouped = users.map(user => ({
    id: user.id,
    username: user.username,
    penalties: penalties.filter(p => p.user_id === user.id)
  }));
  res.render('penalties', { users: grouped, user: req.session.user });
});

// Flat Admin-Tabellenansicht (für klassische Tabelle)
router.get('/admin', requireAdmin, async (req, res) => {
  const penalties = (await db.query(
    `SELECT p.id, p.amount, p.date, p.type, p.event, u.username, a.username AS admin
     FROM penalties p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN users a ON p.admin_id = a.id
     ORDER BY p.date DESC`
  )).rows;
  penalties.forEach(p => { p.amount = Number(p.amount); });
  res.render('penalties_admin', { user: req.session.user, penalties });
});

// Eigene Strafen (User)
router.get('/meine', requireLogin, async (req, res) => {
  const penalties = (await db.query(
    `SELECT p.id, p.amount, p.date, p.type, p.event, a.username AS admin
     FROM penalties p
     LEFT JOIN users a ON p.admin_id = a.id
     WHERE p.user_id = $1
     ORDER BY p.date DESC`, [req.session.user.id]
  )).rows;
  penalties.forEach(p => { p.amount = Number(p.amount); });
  res.render('dashboard', { user: req.session.user, penalties });
});

// Strafe anlegen/bearbeiten/löschen wie gehabt...
// ...

module.exports = router;
