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
    `SELECT p.id, p.amount, p.date, p.type, p.event, u.username, a.username AS admin
     FROM penalties p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN users a ON p.admin_id = a.id
     ORDER BY p.date DESC`
  )).rows;

  penalties.forEach(p => {
    p.amount = Number(p.amount);
  });

  res.render('penalties', { user: req.session.user, penalties });
});


// Strafe anlegen (Form)
router.get('/add', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  res.render('penalties_add', { user: req.session.user, users, error: null });
});

// Strafe anlegen (POST)
router.post('/add', requireAdmin, async (req, res) => {
  const { user_id, type, event, amount, date } = req.body;
  if (!user_id || !type || !event || !amount || !date || isNaN(parseFloat(amount))) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    return res.render('penalties_add', { user: req.session.user, users, error: 'Bitte alles ausfüllen und Betrag als Zahl eingeben!' });
  }

  await db.query(
    'INSERT INTO penalties (user_id, type, event, amount, date, admin_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [user_id, type, event, parseFloat(amount), date, req.session.user.id]
  );

  res.redirect('/penalties');
});

// Strafe bearbeiten (Form)
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const penalty = (await db.query('SELECT * FROM penalties WHERE id = $1', [id])).rows[0];
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  res.render('penalties_edit', { user: req.session.user, penalty, users, error: null });
});

// Strafe bearbeiten (POST)
router.post('/edit/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { user_id, type, event, amount, date } = req.body;
  if (!user_id || !type || !event || !amount || !date || isNaN(parseFloat(amount))) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    const penalty = (await db.query('SELECT * FROM penalties WHERE id = $1', [id])).rows[0];
    return res.render('penalties_edit', { user: req.session.user, penalty, users, error: 'Bitte alles ausfüllen und Betrag als Zahl eingeben!' });
  }
  await db.query(
    'UPDATE penalties SET user_id=$1, type=$2, event=$3, amount=$4, date=$5 WHERE id=$6',
    [user_id, type, event, parseFloat(amount), date, id]
  );
  res.redirect('/penalties');
});

// Strafe löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM penalties WHERE id = $1', [req.params.id]);
  res.redirect('/penalties');
});

module.exports = router;