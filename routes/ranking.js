const express = require('express');
const router = express.Router();
const db = require('../db'); // Deine DB-Verbindung

router.get('/', async (req, res) => {
  try {
    // Deine Abfrage und Logik hier
    const users = await db.query(`
      SELECT u.id, u.username, COUNT(p.id) AS penalty_count
      FROM users u
      LEFT JOIN penalties p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY penalty_count DESC
    `);

    const isAdmin = req.session.user && req.session.user.is_admin;
    const userId = req.session.user ? req.session.user.id : null;

    res.render('ranking', { users: users.rows, userId });
  } catch (err) {
    console.error(err);  // Fehler in der Konsole ausgeben
    res.status(500).send('Server Error');
  }
});

module.exports = router;  // Achte darauf, dass du den Router exportierst!
