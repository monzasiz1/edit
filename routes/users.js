const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.is_admin) return next();
  return res.redirect('/login');
}

function requireAdminOrBoard(req, res, next) {
  if (req.session.user && (req.session.user.is_admin || req.session.user.is_board)) return next();
  return res.redirect('/login');
}

router.get('/', requireAdminOrBoard, async (req, res) => {
  const users = (await db.query('SELECT id, username, is_admin, is_board FROM users ORDER BY username')).rows;
  res.render('users', { user: req.session.user, users });
});

router.get('/edit/:id', requireAdminOrBoard, async (req, res) => {
  const { rows } = await db.query('SELECT id, username, is_admin, is_board FROM users WHERE id=$1', [req.params.id]);
  res.render('users_edit', {
    user: req.session.user,
    userToEdit: rows[0],
    error: null
  });
});

router.post('/edit/:id', requireAdminOrBoard, async (req, res) => {
  const { username, password, is_admin, is_board } = req.body;
  if (!username) {
    return res.render('users_edit', { user: req.session.user, userToEdit: { id: req.params.id, username, is_admin, is_board }, error: 'Benutzername darf nicht leer sein!' });
  }

  const isAdminChecked = is_admin === 'on';
  const isBoardChecked = is_board === 'on';

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET username=$1, password=$2, is_admin=$3, is_board=$4 WHERE id=$5',
                   [username, hash, isAdminChecked, isBoardChecked, req.params.id]);
  } else {
    await db.query('UPDATE users SET username=$1, is_admin=$2, is_board=$3 WHERE id=$4',
                   [username, isAdminChecked, isBoardChecked, req.params.id]);
  }

  // Session updaten, falls eigener Account
  if (String(req.session.user.id) === String(req.params.id)) {
    const { rows } = await db.query('SELECT id, username, is_admin, is_board FROM users WHERE id=$1', [req.params.id]);
    const u = rows[0];
    req.session.user = { id: u.id, username: u.username, is_admin: u.is_admin, is_board: u.is_board };
    await new Promise(r => req.session.save(r));
  }

  res.redirect('/users');
});

router.post('/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.redirect('/users');
});

router.get('/add', requireAdmin, (req, res) => {
  res.render('users_add', { user: req.session.user, error: null });
});

router.post('/add', requireAdmin, async (req, res) => {
  const { username, password, is_admin, is_board } = req.body;
  if (!username || !password) {
    return res.render('users_add', { user: req.session.user, error: 'Benutzername und Passwort dürfen nicht leer sein!' });
  }
  const exists = (await db.query('SELECT 1 FROM users WHERE username=$1', [username])).rowCount > 0;
  if (exists) {
    return res.render('users_add', { user: req.session.user, error: 'Benutzername existiert bereits!' });
  }
  const hash = await bcrypt.hash(password, 10);
  await db.query('INSERT INTO users(username,password,is_admin,is_board) VALUES($1,$2,$3,$4)', [username, hash, is_admin === 'on', is_board === 'on']);
  res.redirect('/users');
});

module.exports = router;
