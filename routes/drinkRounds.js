// routes/drinkRounds.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// ---------------------------------------------------------------------
// Routenschutz: nur eingeloggte User (Session) dürfen zugreifen
// ---------------------------------------------------------------------
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// ---------------------------------------------------------------------
// Automatische Befüllung: Wenn die Getränke-Tabelle leer ist,
// werden beim Start drei Standard-Getränke angelegt.
// (Läuft einmal beim Laden dieses Moduls, also beim Serverstart.)
// ---------------------------------------------------------------------
async function ensureDefaultDrinks() {
  try {
    const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM drinks');
    if (rows[0].count === 0) {
      await db.query(`
        INSERT INTO drinks (name, price) VALUES
          ('Bier',   2.50),
          ('Cola',   2.00),
          ('Wasser', 1.50)
        ON CONFLICT (name) DO NOTHING
      `);
      console.log('✅ Standard-Getränke (Bier, Cola, Wasser) wurden angelegt.');
    }
  } catch (err) {
    console.error('Fehler beim Prüfen/Befüllen der Getränke-Tabelle:', err);
  }
}
ensureDefaultDrinks();

// ---------------------------------------------------------------------
// GET /drinkrounds — Seite mit allen aktiven Getränken anzeigen
// ---------------------------------------------------------------------
router.get('/', requireLogin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, price FROM drinks WHERE active = TRUE ORDER BY name ASC'
    );
    res.render('drinkrounds', {
      title: 'Getränkerunde',
      drinks: result.rows,
      path: '/drinkrounds'
    });
  } catch (err) {
    console.error('Fehler beim Laden der Getränke:', err);
    res.status(500).send('Fehler beim Laden der Getränke');
  }
});

// ---------------------------------------------------------------------
// POST /drinkrounds — Runde speichern
// Erwartet JSON: { items: [ { drinkId, quantity }, ... ] }
// Für jedes Element wird ein Datensatz in drink_rounds angelegt,
// verknüpft mit der ID des aktuell eingeloggten Users.
// ---------------------------------------------------------------------
router.post('/', requireLogin, async (req, res) => {
  const { items } = req.body;
  const userId = req.session.user.id;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Keine Getränke ausgewählt.' });
  }

  // Nur gültige, positive Mengen übernehmen
  const cleanItems = items
    .map(i => ({
      drinkId: parseInt(i.drinkId, 10),
      quantity: parseInt(i.quantity, 10)
    }))
    .filter(i => Number.isInteger(i.drinkId) && Number.isInteger(i.quantity) && i.quantity > 0);

  if (cleanItems.length === 0) {
    return res.status(400).json({ error: 'Keine gültigen Mengen übermittelt.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const item of cleanItems) {
      await client.query(
        'INSERT INTO drink_rounds (user_id, drink_id, quantity) VALUES ($1, $2, $3)',
        [userId, item.drinkId, item.quantity]
      );
    }
    await client.query('COMMIT');
    res.status(200).json({ success: true, saved: cleanItems.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Fehler beim Speichern der Getränkerunde:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Runde.' });
  } finally {
    client.release();
  }
});

module.exports = router;
