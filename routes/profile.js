const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const bcrypt  = require('bcrypt');

// Profilseite anzeigen
router.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('profil', {
    user: req.session.user,
    nameMsg: null, nameErr: null,
    pwMsg: null,    pwErr: null,
    noContainer: true
  });
});

// Name ändern
router.post('/name', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const neuerName = (req.body.name || '').trim();
  if (!neuerName) {
    return res.render('profil', { 
      user: req.session.user,
      nameMsg: null, nameErr: 'Name darf nicht leer sein.',
      pwMsg: null,    pwErr: null,
      noContainer: true
    });
  }
  await pool.query('UPDATE users SET username = $1 WHERE id = $2', [neuerName, req.session.user.id]);

  // Session neu anlegen, damit Username sofort greift und nicht ausgeloggt wird
  const { rows } = await pool.query('SELECT id, username, is_admin FROM users WHERE id = $1', [req.session.user.id]);
  const userRow = rows[0];
  req.session.regenerate(err => {
    if (err) console.error('Session.regenerate-Fehler:', err);
    req.session.user = {
      id:       userRow.id,
      username: userRow.username,
      is_admin: userRow.is_admin
    };
    req.session.save(err => {
      if (err) console.error('Session.save-Fehler:', err);
      res.render('profil', {
        user: req.session.user,
        nameMsg: 'Name wurde erfolgreich geändert.',
        nameErr: null, pwMsg: null, pwErr: null,
        noContainer: true
      });
    });
  });
});

// Passwort ändern
router.post('/passwort', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { oldpw, newpw } = req.body;
  if (!oldpw || !newpw) {
    return res.render('profil', {
      user: req.session.user,
      nameMsg: null, nameErr: null,
      pwMsg: null, pwErr: 'Bitte alle Felder ausfüllen.',
      noContainer: true
    });
  }
  const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [req.session.user.id]);
  if (!rows[0] || !(await bcrypt.compare(oldpw, rows[0].password))) {
    return res.render('profil', {
      user: req.session.user,
      nameMsg: null, nameErr: null,
      pwMsg: null, pwErr: 'Altes Passwort stimmt nicht.',
      noContainer: true
    });
  }
  const hash = await bcrypt.hash(newpw, 10);
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.session.user.id]);
  res.render('profil', {
    user: req.session.user,
    nameMsg: null, nameErr: null,
    pwMsg: 'Passwort wurde geändert!',
    pwErr: null,
    noContainer: true
  });
});

module.exports = router;
