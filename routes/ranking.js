const express = require('express');
const router = express.Router();
const db = require('../db');  // Deine DB-Verbindung

// Route für das Ranking
router.get('/', async (req, res) => {
  try {
    // Alle Benutzer und die Summe ihrer Strafenbeträge abrufen
    const users = await db.query(`
      SELECT u.id, u.username, COALESCE(SUM(p.amount), 0) AS total_penalty_amount
      FROM users u
      LEFT JOIN penalties p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY total_penalty_amount DESC
    `);

    // Aktuell eingeloggten Benutzer und Adminrechte aus der Session holen
    const isAdmin = req.session.user && req.session.user.is_admin;
    const userId = req.session.user ? req.session.user.id : null;

    // Alle Benutzer an das Template übergeben
    res.render('ranking', { users: users.rows, userId, isAdmin });
  } catch (err) {
    console.error(err);  // Fehler in der Konsole ausgeben
    res.status(500).send('Server Error');
  }
});

module.exports = router;
