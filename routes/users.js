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
  let allRoles = [];
  let userRoleIds = [];
  try {
    const r = await db.query(
      `SELECT id, name, description, is_admin, is_board
       FROM roles
       ORDER BY is_admin DESC, is_board DESC, name ASC`
    );
    allRoles = r.rows;
    const ur = await db.query(
      `SELECT role_id FROM user_roles WHERE user_id = $1`,
      [req.params.id]
    );
    userRoleIds = ur.rows.map(x => x.role_id);
  } catch (e) {
    // Tabellen evtl. noch nicht da
  }
  res.render('users_edit', {
    user: req.session.user,
    userToEdit: rows[0],
    error: null,
    allRoles,
    userRoleIds,
    success: req.query.success || null,
    canManageRoles: !!(req.session.user && (req.session.user.is_admin || res.locals.canManageRoles))
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

  // Legacy-Flags <-> Rollenzuweisungen synchronisieren, damit das neue
  // Rollensystem die "Admin"-/"Vorstand"-Checkboxen direkt wiederspiegelt.
  try {
    if (isAdminChecked) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, r.id FROM roles r WHERE r.is_admin = TRUE
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [req.params.id]
      );
    } else {
      await db.query(
        `DELETE FROM user_roles
         WHERE user_id = $1
           AND role_id IN (SELECT id FROM roles WHERE is_admin = TRUE)`,
        [req.params.id]
      );
    }
    if (isBoardChecked) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, r.id FROM roles r WHERE r.is_board = TRUE
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [req.params.id]
      );
    } else {
      await db.query(
        `DELETE FROM user_roles
         WHERE user_id = $1
           AND role_id IN (SELECT id FROM roles WHERE is_board = TRUE)`,
        [req.params.id]
      );
    }
  } catch (err) {
    console.error('[users] role sync failed', err);
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
  const isAdminChecked = is_admin === 'on';
  const isBoardChecked = is_board === 'on';
  const insertRes = await db.query(
    'INSERT INTO users(username,password,is_admin,is_board) VALUES($1,$2,$3,$4) RETURNING id',
    [username, hash, isAdminChecked, isBoardChecked]
  );
  const newUserId = insertRes.rows[0].id;
  try {
    if (isAdminChecked) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, r.id FROM roles r WHERE r.is_admin = TRUE
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [newUserId]
      );
    }
    if (isBoardChecked) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, r.id FROM roles r WHERE r.is_board = TRUE
         ON CONFLICT (user_id, role_id) DO NOTHING`,
        [newUserId]
      );
    }
  } catch (err) {
    console.error('[users] role sync on add failed', err);
  }
  res.redirect('/users');
});

module.exports = router;
