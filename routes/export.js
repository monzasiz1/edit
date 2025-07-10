const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const path = require('path');

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

// Funktion zum Hinzufügen des Logos in das PDF (mit Fehlerbehandlung)
function drawLogo(doc) {
  try {
    const LOGO_PATH = path.join(__dirname, '../public/logo.png');
    doc.image(LOGO_PATH, 50, 30, { width: 100 });
  } catch (err) {
    console.warn('Logo konnte nicht geladen werden:', err.message);
  }
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

    // DEBUG: Entfernen wenn alles läuft
    console.log('Exportiere eigene Strafen:', penalties);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="meine_strafen.pdf"');
    doc.pipe(res);

    // Logo einfügen
    drawLogo(doc);

    doc.fontSize(22).font('Helvetica-Bold').text('Strafenkonto für ' + req.session.user.username, { align: 'center' });
    doc.moveDown(1);

    // Tabellenkopf
    doc.fontSize(14).font('Helvetica-Bold')
      .text('Datum', 50, doc.y, { continued: true })
      .text(' | ', { continued: true })
      .text('Strafart', { continued: true })
      .text(' | ', { continued: true })
      .text('Grund', { continued: true })
      .text(' | ', { continued: true })
      .text('Betrag', 500, doc.y);
    doc.moveDown();

    // Inhalt
    doc.fontSize(12).font('Helvetica');
    penalties.forEach(penalty => {
      const amount = parseFloat(penalty.amount) || 0;
      doc.text(formatDate(penalty.date), 50, doc.y, { continued: true })
        .text(' | ', { continued: true })
        .text(penalty.type || '-', { continued: true })
        .text(' | ', { continued: true })
        .text(penalty.reason || '-', { continued: true })
        .text(' | ', { continued: true })
        .text(amount.toFixed(2) + ' €', 500, doc.y);
      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren Ihrer Strafen.');
  }
});

// Admin: Alle Strafen eines Users als PDF
router.get('/user/:id', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Keine Rechte');

  try {
    const user = (await db.query('SELECT username FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).send('User nicht gefunden');

    const penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.params.id]
    )).rows;

    // DEBUG: Entfernen wenn alles läuft
    console.log(`Exportiere Strafen von User ${user.username}:`, penalties);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="strafen_${user.username}.pdf"`);
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(22).font('Helvetica-Bold').text('Strafenkonto für ' + user.username, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold')
      .text('Datum', 50, doc.y, { continued: true })
      .text(' | ', { continued: true })
      .text('Strafart', { continued: true })
      .text(' | ', { continued: true })
      .text('Grund', { continued: true })
      .text(' | ', { continued: true })
      .text('Betrag', 500, doc.y);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica');
    penalties.forEach(penalty => {
      const amount = parseFloat(penalty.amount) || 0;
      doc.text(formatDate(penalty.date), 50, doc.y, { continued: true })
        .text(' | ', { continued: true })
        .text(penalty.type || '-', { continued: true })
        .text(' | ', { continued: true })
        .text(penalty.reason || '-', { continued: true })
        .text(' | ', { continued: true })
        .text(amount.toFixed(2) + ' €', 500, doc.y);
      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren der User-Strafen.');
  }
});

// Admin: Alle Strafen aller Nutzer als PDF
router.get('/all', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Keine Rechte');

  try {
    const penalties = (await db.query(
      'SELECT p.date, p.reason, p.type, p.amount, p.event, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    // DEBUG: Entfernen wenn alles läuft
    console.log('Exportiere alle Strafen:', penalties);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Alle Strafen', { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).font('Helvetica-Bold')
      .text('User', 50, doc.y, { continued: true })
      .text(' | ', { continued: true })
      .text('Datum', { continued: true })
      .text(' | ', { continued: true })
      .text('Strafart', { continued: true })
      .text(' | ', { continued: true })
      .text('Grund', { continued: true })
      .text(' | ', { continued: true })
      .text('Betrag', 500, doc.y);
    doc.moveDown();

    doc.fontSize(12).font('Helvetica');
    penalties.forEach(penalty => {
      const amount = parseFloat(penalty.amount) || 0;
      doc.text(penalty.username, 50, doc.y, { continued: true })
        .text(' | ', { continued: true })
        .text(formatDate(penalty.date), { continued: true })
        .text(' | ', { continued: true })
        .text(penalty.type || '-', { continued: true })
        .text(' | ', { continued: true })
        .text(penalty.reason || '-', { continued: true })
        .text(' | ', { continued: true })
        .text(amount.toFixed(2) + ' €', 500, doc.y);
      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren aller Strafen.');
  }
});

module.exports = router;
