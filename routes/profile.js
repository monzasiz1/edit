const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = require('../db');

// Profilseite anzeigen
router.get('/', (req, res) => {
    console.log("Profilseite aufgerufen!", req.session);
    if (!req.session.user) return res.redirect('/login');
    res.render('profil', {
        user: req.session.user,
        nameMsg: null,
        nameErr: null,
        pwMsg: null,
        pwErr: null,
        noContainer: true
    });
});

// Name ändern
router.post('/name', async (req, res) => {
  console.log("Name-ändern-POST:", req.session);
  if (!req.session.user) return res.redirect('/login');
  const neuerName = req.body.name?.trim();
  if (!neuerName) {
    return res.render('profil', { user: req.session.user, nameMsg: null, nameErr: "Name darf nicht leer sein.", pwMsg: null, pwErr: null });
  }
  try {
    await pool.query('UPDATE users SET username = $1 WHERE id = $2', [neuerName, req.session.user.id]);
    req.session.user.username = neuerName;
    res.render('profil', { user: req.session.user, nameMsg: "Name wurde erfolgreich geändert.", nameErr: null, pwMsg: null, pwErr: null });
  } catch (err) {
    console.error("DB-FEHLER beim Namen ändern:", err);
    res.render('profil', { user: req.session.user, nameMsg: null, nameErr: "Fehler beim Ändern des Namens.", pwMsg: null, pwErr: null });
  }
});

// Passwort ändern
router.post('/passwort', async (req, res) => {
  console.log("Passwort-ändern-POST:", req.session);
  if (!req.session.user) return res.redirect('/login');
  const { oldpw, newpw } = req.body;
  if (!oldpw || !newpw) {
    return res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: null, pwErr: "Bitte alle Felder ausfüllen." });
  }
  try {
    const dbResult = await pool.query('SELECT password FROM users WHERE id = $1', [req.session.user.id]);
    if (!dbResult.rows[0]) throw new Error("Benutzer nicht gefunden.");
    const isMatch = await bcrypt.compare(oldpw, dbResult.rows[0].password);
    if (!isMatch) {
      return res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: null, pwErr: "Altes Passwort stimmt nicht." });
    }
    const hash = await bcrypt.hash(newpw, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.session.user.id]);
    res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: "Passwort wurde geändert!", pwErr: null });
  } catch (err) {
    console.error("DB-FEHLER beim Passwort ändern:", err);
    res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: null, pwErr: "Fehler beim Passwort-Ändern." });
  }
});

module.exports = router;
