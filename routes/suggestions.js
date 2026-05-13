const express = require('express');
const router = express.Router();
const db = require('../db');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireBoard(req, res, next) {
  if (!req.session.user?.is_board) return res.redirect('/dashboard');
  next();
}

router.get('/', requireLogin, async (req, res) => {
  res.render('suggestions', {
    user: req.session.user,
    suggestionStatus: req.query.status || null,
    title: 'Ideen & Vorschläge',
    path: '/suggestions'
  });
});

router.get('/admin', requireLogin, requireBoard, async (req, res) => {
  const suggestions = (await db.query('SELECT id, message, created_at FROM suggestions ORDER BY created_at DESC')).rows;
  res.render('suggestions_admin', {
    user: req.session.user,
    suggestions,
    title: 'Vorschläge Admin',
    path: '/suggestions/admin'
  });
});

router.post('/', requireLogin, async (req, res) => {
  const message = String(req.body.message || '').trim();

  if (!message) {
    return res.redirect('/suggestions?status=empty');
  }

  try {
    await db.query('INSERT INTO suggestions (message) VALUES ($1)', [message]);
    return res.redirect('/suggestions?status=sent');
  } catch (err) {
    console.error('Fehler beim Speichern des Vorschlags:', err);
    return res.redirect('/suggestions?status=error');
  }
});

router.post('/:id/delete', requireBoard, async (req, res) => {
  try {
    await db.query('DELETE FROM suggestions WHERE id = $1', [req.params.id]);
    return res.redirect('/suggestions/admin');
  } catch (err) {
    console.error('Fehler beim Löschen des Vorschlags:', err);
    return res.redirect('/suggestions/admin');
  }
});

module.exports = router;