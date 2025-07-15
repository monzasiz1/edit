const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');

// Admin-Middleware
function requireAdmin(req, res, next) {
  const a = req.session.user && req.session.user.is_admin;
  if (a === true || a === 1 || a === '1' || a === 'true' || a === 'on') {
    return next();
  }
  res.redirect('/login');
}

// Übersicht
router.get('/', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username, is_admin FROM users ORDER BY username')).rows;
  users.forEach(u => {
    u.is_admin = !!(u.is_admin === true || u.is_admin === 1 || u.is_admin === '1' || u.is_admin === 'true' || u.is_admin === 'on');
  });
  res.render('users', { user: req.session.user, users });
});

// Bearbeiten-Form
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
  const userToEdit = rows[0];
  userToEdit.is_admin = !!(userToEdit.is_admin === true || userToEdit.is_admin === 1 || userToEdit.is_admin === '1' || userToEdit.is_admin === 'true' || userToEdit.is_admin === 'on');
  res.render('users_edit', { user: req.session.user, userToEdit, error: null });
});

// Speichern
router.post('/edit/:id', requireAdmin, async (req, res) => {
  const { username, password, is_admin } = req.body;
  if (!username) {
    const { rows } = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
    return res.render('users_edit', {
      user: req.session.user,
      userToEdit: rows[0],
      error: 'Benutzername darf nicht leer sein!'
    });
  }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET username=$1, password=$2, is_admin=$3 WHERE id=$4', [username, hash, is_admin==='on', req.params.id]);
  } else {
    await db.query('UPDATE users SET username=$1, is_admin=$2 WHERE id=$3', [username, is_admin==='on', req.params.id]);
  }

  // Wenn du dich selbst geändert hast, Session neu setzen
  if (String(req.session.user.id) === req.params.id) {
    const { rows } = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
    const u = rows[0];
    req.session.regenerate(err => {
      req.session.user = {
        id: u.id,
        username: u.username,
        is_admin: !!u.is_admin
      };
      req.session.save(() => res.redirect('/users'));
    });
  } else {
    res.redirect('/users');
  }
});

// Löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.redirect('/users');
});

// Hinzufügen
router.get('/add', requireAdmin, (req, res) => {
  res.render('users_add', { user: req.session.user, error: null });
});
router.post('/add', requireAdmin, async (req, res) => {
  const { username, password, is_admin } = req.body;
  if (!username || !password) {
    return res.render('users_add', { user: req.session.user, error: 'Bitte alle Felder ausfüllen!' });
  }
  const exists = (await db.query('SELECT 1 FROM users WHERE username = $1', [username])).rowCount > 0;
  if (exists) {
    return res.render('users_add', { user: req.session.user, error: 'Benutzername bereits vergeben!' });
  }
  const hash = await bcrypt.hash(password, 10);
  await db.query('INSERT INTO users (username, password, is_admin) VALUES ($1,$2,$3)', [username, hash, is_admin==='on']);
  res.redirect('/users');
});

module.exports = router;
