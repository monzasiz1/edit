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

  // --- SESSION AKTUALISIEREN, falls Admin sich selbst ändert!
  if (req.session.user && req.session.user.id == req.params.id) {
    const result = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
    req.session.user = result.rows[0];
  }
  // ---

  res.redirect('/users');
});

// Nutzer löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.redirect('/users');
});

// Nutzer hinzufügen (Formular anzeigen)
router.get('/add', requireAdmin, (req, res) => {
  res.render('users_add', { user: req.session.user, error: null });
});
// Nutzer hinzufügen (Formular absenden)
router.post('/add', requireAdmin, async (req, res) => {
  const { username, password, is_admin } = req.body;
  let error = null;
  if (!username || !password) {
    error = 'Benutzername und Passwort dürfen nicht leer sein!';
    return res.render('users_add', { user: req.session.user, error });
  }
  // Prüfen, ob Name schon existiert
  const exists = (await db.query('SELECT 1 FROM users WHERE username = $1', [username])).rowCount > 0;
  if (exists) {
    error = 'Benutzername existiert bereits!';
    return res.render('users_add', { user: req.session.user, error });
  }
  const hash = await bcrypt.hash(password, 10);
  await db.query(
    'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
    [username, hash, is_admin === 'on']
  );
  res.redirect('/users');
});

module.exports = router;
