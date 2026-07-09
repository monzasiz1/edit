const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware angepasst an deine native Session-Logik aus server.js
function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// Route: Getränkerunden Bierdeckel anzeigen
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Aktive Getränke aus der DB holen
        const drinksResult = await pool.query('SELECT * FROM drinks WHERE active = TRUE ORDER BY name');
        let drinks = drinksResult.rows;

        res.render('drinkRounds', { 
            title: 'Getränkerunden', 
            path: '/drinkrounds', 
            user: req.session.user,
            drinks: drinks
        });
    } catch (err) {
        console.error('Error fetching drink rounds data:', err);
        res.status(500).send('Server Error');
    }
});

// Route: Neue Getränkerunde in DB eintragen
router.post('/add', isAuthenticated, async (req, res) => {
    const { rounds } = req.body;
    const userId = req.session.user.id;

    if (!rounds || !Array.isArray(rounds)) {
        return res.status(400).json({ error: 'Ungültige Rundendaten erhalten.' });
    }

    try {
        for (const round of rounds) {
            const { drink_id, quantity } = round;
            await pool.query(
                'INSERT INTO drink_rounds (user_id, drink_id, quantity) VALUES ($1, $2, $3)',
                [userId, drink_id, quantity]
            );
        }
        res.status(200).json({ message: 'Getränkerunde(n) erfolgreich gespeichert.' });
    } catch (err) {
        console.error('Error saving drink rounds:', err);
        res.status(500).json({ error: 'Fehler beim Speichern der Getränkerunde.' });
    }
});

module.exports = router;