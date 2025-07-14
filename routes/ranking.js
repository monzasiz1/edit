const express = require('express');
const router = express.Router();
const db = require('../db'); // Deine DB-Verbindung

router.get('/', async (req, res) => {
  try {
    const users = await db.query(`
      SELECT u.id, u.username, COALESCE(SUM(p.amount), 0) AS total_penalty_amount
      FROM users u
      LEFT JOIN penalties p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY total_penalty_amount DESC
    `);

    // Sicherstellen, dass total_penalty_amount immer ein gültiger Wert ist
    users.rows.forEach(user => {
      user.total_penalty_amount = parseFloat(user.total_penalty_amount) || 0;
    });

    // Gesamtsumme aller Strafen berechnen
    const sumResult = await db.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_sum FROM penalties
    `);
    const totalSum = parseFloat(sumResult.rows[0].total_sum) || 0;

    console.log(users.rows); // Ausgabe der Benutzerdaten zur Kontrolle
    console.log('Gesamtsumme aller Strafen:', totalSum);

    // Überprüfen, ob der Benutzer Admin ist
    const isAdmin = req.session.user && req.session.user.is_admin;
    const userId = req.session.user ? req.session.user.id : null;

    // Alle Benutzer an die View übergeben, einschließlich der `isAdmin`-Variable und der Gesamtsumme
    res.render('ranking', { users: users.rows, userId, isAdmin, totalSum });
  } catch (err) {
    console.error('Fehler beim Abrufen der Benutzerdaten:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
