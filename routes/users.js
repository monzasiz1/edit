const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// Middleware: Nur Admins dürfen hierhin
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
  next();
}

// Nutzer-Übersicht
router.get('/', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username, is_admin FROM users ORDER BY username')).rows;
  res.render('users', { user: req.session.user, users });
});

// Nutzer bearbeiten (Form)
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const result = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
  const userToEdit = result.rows[0];
  res.render('users_edit', { user: req.session.user, userToEdit, error: null });
});

// Nutzer bearbeiten (POST)
router.post('/edit/:id', requireAdmin, async (req, res) => {
  const { username, password, is_admin } = req.body;
  let error = null;
  if (!username) error = 'Benutzername darf nicht leer sein!';
  if (error) {
    const result = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
    const userToEdit = result.rows[0];
    return res.render('users_edit', { user: req.session.user, userToEdit, error });
  }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'UPDATE users SET username = $1, password = $2, is_admin = $3 WHERE id = $4',
      [username, hash, is_admin === 'on', req.params.id]
    );
  } else {
    await db.query(
      'UPDATE users SET username = $1, is_admin = $2 WHERE id = $3',
      [username, is_admin === 'on', req.params.id]
    );
  }
  res.redirect('/users');
});

// Nutzer löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.redirect('/users');
});

module.exports = router;
