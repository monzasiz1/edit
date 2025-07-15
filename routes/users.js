const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  let admin = req.session.user && req.session.user.is_admin;
  if (
    admin === true ||
    admin === 1 ||
    admin === "1" ||
    admin === "true" ||
    admin === "on"
  ) {
    return next();
  }
  return res.redirect('/login');
}

router.get('/', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username, is_admin FROM users ORDER BY username')).rows;
  users.forEach(u => u.is_admin = !!(
    u.is_admin === true ||
    u.is_admin === 1 ||
    u.is_admin === "1" ||
    u.is_admin === "true" ||
    u.is_admin === "on"
  ));
  res.render('users', { user: req.session.user, users });
});

// Nutzer bearbeiten (Form)
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const result = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
  const userToEdit = result.rows[0];
  userToEdit.is_admin = !!(
    userToEdit.is_admin === true ||
    userToEdit.is_admin === 1 ||
    userToEdit.is_admin === "1" ||
    userToEdit.is_admin === "true" ||
    userToEdit.is_admin === "on"
  );
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
    userToEdit.is_admin = !!(
      userToEdit.is_admin === true ||
      userToEdit.is_admin === 1 ||
      userToEdit.is_admin === "1" ||
      userToEdit.is_admin === "true" ||
      userToEdit.is_admin === "on"
    );
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

  // SESSION AKTUALISIEREN, falls Admin sich selbst ändert!
  if (req.session.user && String(req.session.user.id) === String(req.params.id)) {
    const { rows } = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.params.id]);
    if (rows.length) {
      const userRow = rows[0];
      req.session.user = {
        id: userRow.id,
        username: userRow.username,
        is_admin: !!(
          userRow.is_admin === true ||
          userRow.is_admin === 1 ||
          userRow.is_admin === "1" ||
          userRow.is_admin === "true" ||
          userRow.is_admin === "on"
        )
      };
      await new Promise(resolve => req.session.save(resolve));
    }
  }
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
