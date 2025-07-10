const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Penalty = require('../models/Penalty');

router.get('/ranking', async (req, res) => {
  try {
    // Alle Benutzer laden und Strafen populieren
    const users = await User.find().populate('penalties');

    // Benutzer nach Anzahl der Strafen sortieren
    users.sort((a, b) => b.penalties.length - a.penalties.length);

    // Prüfen, ob der aktuelle Benutzer Admin ist
    const isAdmin = req.user && req.user.role === 'admin';

    // Der aktuell eingeloggte Benutzer
    const userId = req.user._id;

    // Alle Benutzer an das Template übergeben
    res.render('ranking', { users, isAdmin, userId });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
