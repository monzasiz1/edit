const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

// Hilfsfunktion zum deutschen Datumsformat
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
}

// Middleware: Login-Check
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Export Übersicht /export
router.get('/', requireLogin, async (req, res) => {
  let users = [];
  if (req.session.user.is_admin) {
    const result = await db.query('SELECT id, username FROM users ORDER BY username');
    users = result.rows;
  }
  res.render('export', { user: req.session.user, users });
});

// Eigenes Strafregister exportieren (Mitglied/Admin)
router.get('/me', requireLogin, async (req, res) => {
  try {
    const penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.session.user.id]
    )).rows;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="meine_strafen.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Strafenkonto für ' + req.session.user.username);
    doc.moveDown();

    let y = doc.y;
    penalties.forEach((penalty) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(12).text(
        `${formatDate(penalty.date)} [${penalty.type || '-'} @ ${penalty.event || '-'}]: ${penalty.reason}`,
        50,
        y
      );
      y += 20;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

// Admin: Alle Strafen eines Users als PDF
router.get('/user/:id', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Keine Rechte')_
