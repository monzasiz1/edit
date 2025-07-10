const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
  next();
}

// /penalties leitet auf /penalties/all weiter
router.get('/', (req, res) => res.redirect('/penalties/all'));

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

// Neue Strafe anlegen (Formular anzeigen)
router.get('/add', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  res.render('penalties_add', { users, user: req.session.user, error: null });
});

// Neue Strafe anlegen (Formular absenden)
router.post('/add', requireAdmin, async (req, res) => {
  const { user_id, type, event, amount, date } = req.body;
  try {
    await db.query(
      'INSERT INTO penalties (user_id, type, event, amount, date, admin_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [user_id, type, event, amount, date, req.session.user.id]
    );
    res.redirect('/penalties/admin');
  } catch (e) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    res.render('penalties_add', { users, user: req.session.user, error: 'Fehler beim Speichern! ' + e.message });
  }
});

// Strafe bearbeiten (Formular anzeigen)
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const penaltyId = req.params.id;
  const penaltyRes = await db.query('SELECT * FROM penalties WHERE id = $1', [penaltyId]);
  if (!penaltyRes.rows[0]) return res.status(404).render('404', { user: req.session.user });
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  res.render('penalties_edit', { 
    penalty: penaltyRes.rows[0],
    users, 
    error: null,
    user: req.session.user
  });
});

// Strafe bearbeiten (Formular absenden)
router.post('/edit/:id', requireAdmin, async (req, res) => {
  const penaltyId = req.params.id;
  const { user_id, type, event, amount, date } = req.body;
  try {
    await db.query(
      'UPDATE penalties SET user_id=$1, type=$2, event=$3, amount=$4, date=$5 WHERE id=$6',
      [user_id, type, event, amount, date, penaltyId]
    );
    res.redirect('/penalties/admin');
  } catch (e) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    const penaltyRes = await db.query('SELECT * FROM penalties WHERE id = $1', [penaltyId]);
    res.render('penalties_edit', { 
      penalty: penaltyRes.rows[0] || {}, 
      users,
      error: 'Fehler beim Speichern! ' + e.message,
      user: req.session.user
    });
  }
});

// Strafe löschen
// Strafe löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  await db.query('DELETE FROM penalties WHERE id = $1', [id]);
  res.redirect('/penalties/admin');
});


// --- GANZ ZUM SCHLUSS! ---
module.exports = router;
