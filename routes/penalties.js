const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware: Admin-Check
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
  next();
}

// Strafenübersicht (für Admin, pro User)
router.get('/', requireAdmin, async (req, res) => {
  const penalties = (await db.query(
    'SELECT p.id, p.reason, p.date, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY p.date DESC'
  )).rows;
  res.render('penalties', { user: req.session.user, penalties });
});

// Strafe anlegen (Form)
router.get('/add', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  res.render('penalties_add', { user: req.session.user, users, error: null });
});

// Strafe anlegen (POST)
router.post('/add', requireAdmin, async (req, res) => {
  const { user_id, reason } = req.body;
  if (!user_id || !reason) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    return res.render('penalties_add', { user: req.session.user, users, error: 'Bitte alles ausfüllen!' });
  }
  await db.query(
    'INSERT INTO penalties (user_id, reason) VALUES ($1, $2)',
    [user_id, reason]
  );
  res.redirect('/penalties');
});

// Strafe löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM penalties WHERE id = $1', [req.params.id]);
  res.redirect('/penalties');
});

module.exports = router;
