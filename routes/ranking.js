const express = require('express');
const router = express.Router();
const db = require('../db'); // Deine DB-Verbindung

router.get('/', async (req, res) => {
  try {
    // Alle Benutzer und deren Strafen zählen
    const users = await db.query(`
      SELECT u.id, u.username, COALESCE(SUM(p.amount), 0) AS total_penalty_amount
      FROM users u
      LEFT JOIN penalties p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY total_penalty_amount DESC
    `);

    // Aktuell eingeloggten Benutzer und Adminrechte überprüfen
    const isAdmin = req.session.user && req.session.user.is_admin;
    const userId = req.session.user ? req.session.user.id : null;

    res.render('ranking', { users: users.rows, userId });
  } catch (err) {
    console.error(err);  // Fehler in der Konsole ausgeben
    res.status(500).send('Server Error');
  }
});

module.exports = router;
