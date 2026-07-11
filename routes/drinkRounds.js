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
// Routenschutz: nur Admins dürfen Getränke archivieren
// ---------------------------------------------------------------------
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).json({ error: 'Nur Admins dürfen Getränke archivieren.' });
  }
  next();
}

// ---------------------------------------------------------------------
// Routenschutz: nur Vorstand/Admin dürfen das Bierdeckel-Archiv einsehen
// ---------------------------------------------------------------------
function requireBoard(req, res, next) {
  const u = req.session.user;
  if (!u || !(u.is_board || u.is_admin)) {
    return res.status(403).send('Nur für den Vorstand.');
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

    // Aktuelle Preise serverseitig nachschlagen (nicht den Werten des Clients
    // vertrauen), um die Gesamtsumme des Bierdeckels korrekt zu berechnen.
    const drinkIds = cleanItems.map(i => i.drinkId);
    const priceResult = await client.query(
      'SELECT id, price FROM drinks WHERE id = ANY($1::int[])',
      [drinkIds]
    );
    const priceById = {};
    priceResult.rows.forEach(r => { priceById[r.id] = parseFloat(r.price); });

    let total = 0;
    for (const item of cleanItems) {
      const price = priceById[item.drinkId];
      if (price === undefined) continue;
      total += price * item.quantity;
    }

    // Batch anlegen: Ein Bierdeckel = eine gespeicherte Runde,
    // damit sie später im Archiv als ein Eintrag erscheint.
    const batchResult = await client.query(
      'INSERT INTO drink_round_batches (user_id, total) VALUES ($1, $2) RETURNING id',
      [userId, total.toFixed(2)]
    );
    const batchId = batchResult.rows[0].id;

    for (const item of cleanItems) {
      await client.query(
        'INSERT INTO drink_rounds (user_id, drink_id, quantity, batch_id) VALUES ($1, $2, $3, $4)',
        [userId, item.drinkId, item.quantity, batchId]
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, saved: cleanItems.length, batchId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Fehler beim Speichern der Getränkerunde:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Runde.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------
// GET /drinkrounds/archive — Bierdeckel-Archiv für den Vorstand
// Zeigt alle gespeicherten Runden (Batches) mit Nutzer, Zeitpunkt,
// enthaltenen Getränken und Gesamtsumme, neueste zuerst.
// ---------------------------------------------------------------------
router.get('/archive', requireLogin, requireBoard, async (req, res) => {
  try {
    const batchesResult = await db.query(`
      SELECT b.id, b.total, b.created_at, u.username, u.full_name
      FROM drink_round_batches b
      LEFT JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC
    `);
    const batches = batchesResult.rows;

    const itemsResult = await db.query(`
      SELECT dr.batch_id, dr.quantity, d.name, d.price
      FROM drink_rounds dr
      JOIN drinks d ON d.id = dr.drink_id
      WHERE dr.batch_id IS NOT NULL
      ORDER BY d.name ASC
    `);

    const itemsByBatch = {};
    itemsResult.rows.forEach(row => {
      if (!itemsByBatch[row.batch_id]) itemsByBatch[row.batch_id] = [];
      itemsByBatch[row.batch_id].push(row);
    });

    batches.forEach(b => { b.items = itemsByBatch[b.id] || []; });

    res.render('drinkroundsArchive', {
      title: 'Bierdeckel-Archiv',
      batches,
      path: '/drinkrounds/archive'
    });
  } catch (err) {
    console.error('Fehler beim Laden des Archivs:', err);
    res.status(500).send('Fehler beim Laden des Archivs');
  }
});

// ---------------------------------------------------------------------
// POST /drinkrounds/drinks — Neues Getränk anlegen
// Erwartet JSON: { name, price }
// Jeder eingeloggte User darf das. Existiert der Name bereits (auch
// inaktiv/archiviert), wird er reaktiviert und der Preis übernommen.
// ---------------------------------------------------------------------
router.post('/drinks', requireLogin, async (req, res) => {
  const { name, price } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanPrice = parseFloat(price);

  if (!cleanName) {
    return res.status(400).json({ error: 'Bitte einen Namen angeben.' });
  }
  if (!Number.isFinite(cleanPrice) || cleanPrice < 0) {
    return res.status(400).json({ error: 'Ungültiger Preis.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO drinks (name, price, active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, active = TRUE
       RETURNING id, name, price`,
      [cleanName, cleanPrice.toFixed(2)]
    );
    res.status(200).json({ success: true, drink: result.rows[0] });
  } catch (err) {
    console.error('Fehler beim Hinzufügen des Getränks:', err);
    res.status(500).json({ error: 'Fehler beim Hinzufügen des Getränks.' });
  }
});

// ---------------------------------------------------------------------
// PATCH /drinkrounds/drinks/:id — Name und/oder Preis eines Getränks ändern
// Erwartet JSON: { name?, price? } — mind. eins von beiden.
// Jeder eingeloggte User darf das.
// ---------------------------------------------------------------------
router.patch('/drinks/:id', requireLogin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Ungültige Getränke-ID.' });
  }

  const hasName = typeof req.body.name === 'string';
  const hasPrice = req.body.price !== undefined && req.body.price !== null && req.body.price !== '';

  const cleanName = hasName ? req.body.name.trim() : null;
  const cleanPrice = hasPrice ? parseFloat(req.body.price) : null;

  if (!hasName && !hasPrice) {
    return res.status(400).json({ error: 'Nichts zu ändern übermittelt.' });
  }
  if (hasName && !cleanName) {
    return res.status(400).json({ error: 'Name darf nicht leer sein.' });
  }
  if (hasPrice && (!Number.isFinite(cleanPrice) || cleanPrice < 0)) {
    return res.status(400).json({ error: 'Ungültiger Preis.' });
  }

  try {
    const result = await db.query(
      `UPDATE drinks
       SET name = COALESCE($1, name),
           price = COALESCE($2, price)
       WHERE id = $3
       RETURNING id, name, price`,
      [cleanName, hasPrice ? cleanPrice.toFixed(2) : null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Getränk nicht gefunden.' });
    }
    res.status(200).json({ success: true, drink: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation auf name
      return res.status(400).json({ error: 'Ein Getränk mit diesem Namen existiert bereits.' });
    }
    console.error('Fehler beim Aktualisieren des Getränks:', err);
    res.status(500).json({ error: 'Fehler beim Aktualisieren des Getränks.' });
  }
});

// ---------------------------------------------------------------------
// DELETE /drinkrounds/drinks/:id — Getränk archivieren (nur Admins)
// Soft-Delete (active = FALSE), damit bereits gespeicherte Runden in
// der Historie erhalten bleiben.
// ---------------------------------------------------------------------
router.delete('/drinks/:id', requireLogin, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Ungültige Getränke-ID.' });
  }

  try {
    const result = await db.query(
      'UPDATE drinks SET active = FALSE WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Getränk nicht gefunden.' });
    }
    res.status(200).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Fehler beim Archivieren des Getränks:', err);
    res.status(500).json({ error: 'Fehler beim Archivieren des Getränks.' });
  }
});

module.exports = router;