const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware: Admin-Check
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
  next();
}

// Helper function to query users
async function getUsers() {
  try {
    return await db.query('SELECT id, username FROM users ORDER BY username');
  } catch (err) {
    console.error("Fehler beim Abrufen der Benutzer:", err);
    return [];
  }
}

// Strafenübersicht (für Admin, pro User)
router.get('/', requireAdmin, async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Fehler beim Abrufen der Strafenübersicht:", err);
    res.status(500).send("Fehler beim Abrufen der Strafenübersicht.");
  }
});

// Strafe anlegen (Form)
router.get('/add', requireAdmin, async (req, res) => {
  try {
    const users = (await getUsers()).rows;
    res.render('penalties_add', { user: req.session.user, users, error: null });
  } catch (err) {
    res.status(500).send('Fehler beim Laden der Benutzer für das Formular.');
  }
});

// Strafe anlegen (POST)
router.post('/add', requireAdmin, async (req, res) => {
  const { user_id, type, event, amount, date } = req.body;
  if (!user_id || !type || !event || !amount || !date || isNaN(parseFloat(amount))) {
    const users = (await getUsers()).rows;
    return res.render('penalties_add', { user: req.session.user, users, error: 'Bitte alles ausfüllen und Betrag als Zahl eingeben!' });
  }

  try {
    await db.query(
      'INSERT INTO penalties (user_id, type, event, amount, date, admin_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [user_id, type, event, parseFloat(amount), date, req.session.user.id]
    );
    res.redirect('/penalties');
  } catch (err) {
    console.error("Fehler beim Hinzufügen der Strafe:", err);
    res.status(500).send('Fehler beim Hinzufügen der Strafe');
  }
});

// Strafe bearbeiten (Form)
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const penalty = (await db.query('SELECT * FROM penalties WHERE id = $1', [id])).rows[0];
    const users = (await getUsers()).rows;
    res.render('penalties_edit', { user: req.session.user, penalty, users, error: null });
  } catch (err) {
    res.status(500).send('Fehler beim Laden der Strafe zum Bearbeiten.');
  }
});

// Strafe bearbeiten (POST)
router.post('/edit/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { user_id, type, event, amount, date } = req.body;
  if (!user_id || !type || !event || !amount || !date || isNaN(parseFloat(amount))) {
    const users = (await getUsers()).rows;
    const penalty = (await db.query('SELECT * FROM penalties WHERE id = $1', [id])).rows[0];
    return res.render('penalties_edit', { user: req.session.user, penalty, users, error: 'Bitte alles ausfüllen und Betrag als Zahl eingeben!' });
  }
  try {
    await db.query(
      'UPDATE penalties SET user_id=$1, type=$2, event=$3, amount=$4, date=$5 WHERE id=$6',
      [user_id, type, event, parseFloat(amount), date, id]
    );
    res.redirect('/penalties');
  } catch (err) {
    res.status(500).send('Fehler beim Bearbeiten der Strafe');
  }
});

// Strafe löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM penalties WHERE id = $1', [req.params.id]);
    res.redirect('/penalties');
  } catch (err) {
    res.status(500).send('Fehler beim Löschen der Strafe');
  }
});

// Strafenübersicht für eingeloggte User (eigene Strafen inkl. Admin-Name)
router.get('/meine', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const penalties = (await db.query(
      `SELECT p.id, p.amount, p.date, p.type, p.event, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`,
      [req.session.user.id]
    )).rows;

    penalties.forEach(p => {
      p.amount = Number(p.amount);
    });

    res.render('dashboard', { user: req.session.user, penalties });
  } catch (err) {
    console.error("Fehler beim Abrufen der eigenen Strafen:", err);
    res.status(500).send('Fehler beim Abrufen deiner Strafen');
  }
});

module.exports = router;
