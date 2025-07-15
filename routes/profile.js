const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');

// Profilseite
router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('profil', {
    user: req.session.user,
    nameMsg: null,
    nameErr: null,
    pwMsg: null,
    pwErr: null
  });
});

// Name ändern
router.post('/name', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const neuerName = (req.body.name || '').trim();
  if (!neuerName) {
    return res.render('profil', { user: req.session.user, nameMsg: null, nameErr: 'Name darf nicht leer sein.', pwMsg: null, pwErr: null });
  }
  try {
    await pool.query('UPDATE users SET username=$1 WHERE id=$2', [neuerName, req.session.user.id]);
    // Session updaten
    req.session.user.username = neuerName;
    await new Promise(r => req.session.save(r));
    res.render('profil', { user: req.session.user, nameMsg: 'Name wurde erfolgreich geändert.', nameErr: null, pwMsg: null, pwErr: null });
  } catch (err) {
    console.error(err);
    res.render('profil', { user: req.session.user, nameMsg: null, nameErr: 'Fehler beim Ändern des Namens.', pwMsg: null, pwErr: null });
  }
});

// Passwort ändern
router.post('/passwort', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { oldpw, newpw } = req.body;
  if (!oldpw || !newpw) {
    return res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: null, pwErr: 'Bitte alle Felder ausfüllen.' });
  }
  try {
    const { rows } = await pool.query('SELECT password FROM users WHERE id=$1', [req.session.user.id]);
    if (!rows[0] || !await bcrypt.compare(oldpw, rows[0].password)) {
      return res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: null, pwErr: 'Altes Passwort stimmt nicht.' });
    }
    const hash = await bcrypt.hash(newpw, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.session.user.id]);
    await new Promise(r => req.session.save(r));
    res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: 'Passwort wurde geändert!', pwErr: null });
  } catch (err) {
    console.error(err);
    res.render('profil', { user: req.session.user, nameMsg: null, nameErr: null, pwMsg: null, pwErr: 'Fehler beim Passwort-Ändern.' });
  }
});

module.exports = router;
