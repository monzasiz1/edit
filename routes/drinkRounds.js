const express = require('express');
const router = express.Router();
const pool = require('../db');

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

router.get('/', isAuthenticated, async (req, res) => {
    try {
        let drinksResult = await pool.query('SELECT * FROM drinks WHERE active = TRUE ORDER BY name');
        let drinks = drinksResult.rows;

        // If no drinks are found, insert some default ones for development
        if (drinks.length === 0) {
            console.log("No drinks found. Inserting default drinks...");
            await pool.query("INSERT INTO drinks (name, price) VALUES ('Bier', 2.50), ('Cola', 2.00), ('Wasser', 1.50) ON CONFLICT (name) DO NOTHING;");
            drinksResult = await pool.query('SELECT * FROM drinks WHERE active = TRUE ORDER BY name');
            drinks = drinksResult.rows;
        }

        res.render('drinkRounds', { 
            title: 'Getränkerunden', 
            path: '/drinkrounds', 
            user: req.user,
            drinks: drinks,
        });
    } catch (err) {
        console.error('Error fetching drink rounds data:', err);
        res.status(500).send('Server Error');
    }
});

// Route to handle adding a new drink round
router.post('/add', isAuthenticated, async (req, res) => {
    const { rounds } = req.body;
    const userId = req.user.id;

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