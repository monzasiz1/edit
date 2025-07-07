const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

// Middleware: Login-Check
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Eigenes Strafregister exportieren (Mitglied/Admin)
router.get('/me', requireLogin, async (req, res) => {
  const penalties = (await db.query(
    'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
    [req.session.user.id]
  )).rows;

  // PDF generieren
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="meine_strafen.pdf"');
  doc.pipe(res);
  doc.fontSize(18).text('Strafenkonto für ' + req.session.user.username);
  doc.moveDown();
  penalties.forEach(penalty => {
    doc.fontSize(12).text(`${penalty.date}: ${penalty.reason}`);
  });
  doc.end();
});

// Admin: Alle Strafen für einen User als PDF
router.get('/user/:id', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.redirect('/login');
  const user = (await db.query('SELECT username FROM users WHERE id = $1', [req.params.id])).rows[0];
  const penalties = (await db.query(
    'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
    [req.params.id]
  )).rows;

  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="strafen_${user.username}.pdf"`);
  doc.fontSize(18).text('Strafenkonto für ' + user.username);
  doc.moveDown();
  penalties.forEach(penalty => {
    doc.fontSize(12).text(`${penalty.date}: ${penalty.reason}`);
  });
  doc.end();
});

// Admin: Alle Strafen aller Nutzer als Gesamt-PDF
router.get('/all', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.redirect('/login');
  const penalties = (await db.query(
    'SELECT p.date, p.reason, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
  )).rows;

  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
  doc.fontSize(18).text('Alle Strafen');
  doc.moveDown();
  penalties.forEach(penalty => {
    doc.fontSize(12).text(`${penalty.username}: ${penalty.date} – ${penalty.reason}`);
  });
  doc.end();
});

module.exports = router;
