const express = require('express');
const router = express.Router();
const db = require('../db'); // Deine DB-Verbindung

router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const isAdmin = req.session.user && req.session.user.is_admin;
    const userId = req.session.user ? req.session.user.id : null;

    const settingResult = await db.query(
      `SELECT value FROM app_settings WHERE key = 'ranking_blur_enabled' LIMIT 1`
    );
    const rankingBlurEnabled = settingResult.rowCount === 0
      ? true
      : [true, 1, '1', 'true', 'on'].includes(settingResult.rows[0].value);

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

    // Alle Benutzer an die View übergeben, einschließlich der `isAdmin`-Variable und der Gesamtsumme
    res.render('ranking', {
      users: users.rows,
      userId,
      isAdmin,
      totalSum,
      rankingBlurEnabled,
      title: 'Ranking',
      path: '/ranking'
    });
  } catch (err) {
    console.error('Fehler beim Abrufen der Benutzerdaten:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
