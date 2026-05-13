const express = require('express');
const router = express.Router();
const db = require('../db');
const webpush = require('web-push');

// Middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.redirect('/login');
  next();
}

async function getActivePenaltyCatalog() {
  const result = await db.query(`
    SELECT id, label, amount_under18, amount_over18, sort_order
    FROM penalty_catalog
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, label ASC
  `);

  return result.rows.map(item => ({
    ...item,
    amount_under18: Number(item.amount_under18),
    amount_over18: Number(item.amount_over18)
  }));
}

async function getActiveEventCatalog() {
  const result = await db.query(`
    SELECT id, label FROM event_catalog
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, label ASC
  `);
  return result.rows;
}

// Weiterleitung auf /penalties/all
router.get('/', (req, res) => res.redirect('/penalties/all'));

// Übersicht aller Strafen (Admin)
router.get('/all', requireAdmin, async (req, res) => {
  try {
    const strafen = (await db.query(`
      SELECT 
        p.id, 
        p.type AS reason, 
        p.amount, 
        p.date AS created_at, 
        p.event,
        p.status, 
        u.username AS user_name
      FROM penalties p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.date DESC
    `)).rows;

    strafen.forEach(p => { p.amount = Number(p.amount); });

    res.render('penalties', { user: req.session.user, strafen });
  } catch (err) {
    console.error('Fehler beim Laden der Strafen:', err.message);
    res.status(500).send('Fehler beim Laden der Strafen. Bitte später erneut versuchen.');
  }
});

// Admin-Tabellenansicht
router.get('/admin', requireAdmin, async (req, res) => {
  const penalties = (await db.query(`
    SELECT p.id, p.amount, p.date, p.type, p.event, p.status, u.username, a.username AS admin
    FROM penalties p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN users a ON p.admin_id = a.id
    ORDER BY p.date DESC
  `)).rows;

  penalties.forEach(p => { p.amount = Number(p.amount); });
  res.render('penalties_admin', { user: req.session.user, penalties });
});

// Eigene Strafen (Mitglied)
router.get('/meine', requireLogin, async (req, res) => {
  const penalties = (await db.query(`
    SELECT p.id, p.amount, p.date, p.type, p.event, p.status, a.username AS admin
    FROM penalties p
    LEFT JOIN users a ON p.admin_id = a.id
    WHERE p.user_id = $1
    ORDER BY p.date DESC
  `, [req.session.user.id])).rows;

  penalties.forEach(p => { p.amount = Number(p.amount); });
  res.render('dashboard', { user: req.session.user, penalties });
});

// Formular: Neue Strafe
router.get('/add', requireAdmin, async (req, res) => {
  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  const penaltyCatalog = await getActivePenaltyCatalog();
  const eventCatalog = await getActiveEventCatalog();
  res.render('penalties_add', { users, penaltyCatalog, eventCatalog, user: req.session.user, error: null });
});

// Neue Strafe speichern + Push senden
router.post('/add', requireAdmin, async (req, res) => {
  const { user_id, type, event, amount, date, status } = req.body;

  try {
    await db.query(
      'INSERT INTO penalties (user_id, type, event, amount, date, status, admin_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [user_id, type, event, amount, date, status, req.session.user.id]
    );

    try {
      const result = await db.query('SELECT push_subscription FROM users WHERE id = $1', [user_id]);
      const subscription = result.rows[0]?.push_subscription;

      if (subscription) {
        const payload = JSON.stringify({
          title: 'Neue Strafe erhalten 🛑',
          body: `Der Spieß hat dir eine neue Strafe eingetragen.`,
          url: '/dashboard'
        });

        await webpush.sendNotification(subscription, payload);
      }
    } catch (err) {
      console.error('Push fehlgeschlagen:', err.message);
    }

    res.redirect('/penalties/all');
  } catch (e) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    const penaltyCatalog = await getActivePenaltyCatalog();
    const eventCatalog = await getActiveEventCatalog();
    res.render('penalties_add', {
      users,
      penaltyCatalog,
      eventCatalog,
      user: req.session.user,
      error: 'Fehler beim Speichern! ' + e.message
    });
  }
});

// Strafe bearbeiten (Formular)
router.get('/edit/:id', requireAdmin, async (req, res) => {
  const penaltyId = req.params.id;
  const penaltyRes = await db.query('SELECT * FROM penalties WHERE id = $1', [penaltyId]);
  if (!penaltyRes.rows[0]) return res.status(404).render('404', { user: req.session.user });

  const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
  const penaltyCatalog = await getActivePenaltyCatalog();
  const eventCatalog = await getActiveEventCatalog();

  res.render('penalties_edit', {
    penalty: penaltyRes.rows[0],
    users,
    penaltyCatalog,
    eventCatalog,
    error: null,
    user: req.session.user
  });
});

// Bearbeitung absenden
router.post('/edit/:id', requireAdmin, async (req, res) => {
  const penaltyId = req.params.id;
  const { user_id, type, event, amount, date, status } = req.body;

  try {
    await db.query(
      'UPDATE penalties SET user_id=$1, type=$2, event=$3, amount=$4, date=$5, status=$6 WHERE id=$7',
      [user_id, type, event, amount, date, status, penaltyId]
    );
    res.redirect('/penalties/all');
  } catch (e) {
    const users = (await db.query('SELECT id, username FROM users ORDER BY username')).rows;
    const penaltyCatalog = await getActivePenaltyCatalog();
    const eventCatalog = await getActiveEventCatalog();
    const penaltyRes = await db.query('SELECT * FROM penalties WHERE id = $1', [penaltyId]);

    res.render('penalties_edit', {
      penalty: penaltyRes.rows[0] || {},
      users,
      penaltyCatalog,
      eventCatalog,
      error: 'Fehler beim Speichern! ' + e.message,
      user: req.session.user
    });
  }
});

// Strafe löschen
router.post('/delete/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  await db.query('DELETE FROM penalties WHERE id = $1', [id]);
  res.redirect('/penalties/all');
});

module.exports = router;
