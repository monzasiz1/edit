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

// Funktion zum Hinzufügen des Logos in das PDF
function drawLogo(doc) {
  const LOGO_PATH = path.join(__dirname, '../public/logo.png'); // Pfad zum Logo
  doc.image(LOGO_PATH, 50, 30, { width: 100 });  // Position und Größe des Logos
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

    // Logo in das PDF einfügen
    drawLogo(doc);

    // Titel
    doc.fontSize(22).font('Helvetica-Bold').text('Strafenkonto für ' + req.session.user.username, {
      align: 'center'
    });
    doc.moveDown(1);

    // Tabelle der Strafen
    doc.fontSize(12).font('Helvetica');
    doc.text('Datum', 50, doc.y, { continued: true }).text(' | ', { continued: true });
    doc.text('Strafart', { continued: true }).text(' | ', { continued: true });
    doc.text('Grund', { continued: true }).text(' | ', { continued: true });
    doc.text('Betrag', 500, doc.y);

    penalties.forEach(penalty => {
      doc.text(formatDate(penalty.date), 50, doc.y);
      doc.text(penalty.type || '-', { continued: true });
      doc.text(penalty.reason, { continued: true });
      doc.text(penalty.amount.toFixed(2) + ' €', 500, doc.y);
      doc.moveDown();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

// Admin: Alle Strafen eines Users als PDF
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

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="strafen_${user.username}.pdf"`);
    doc.pipe(res);

    // Logo in das PDF einfügen
    drawLogo(doc);

    // Titel
    doc.fontSize(22).font('Helvetica-Bold').text('Strafenkonto für ' + user.username, {
      align: 'center'
    });
    doc.moveDown(1);

    // Tabelle der Strafen
    doc.fontSize(12).font('Helvetica');
    doc.text('Datum', 50, doc.y, { continued: true }).text(' | ', { continued: true });
    doc.text('Strafart', { continued: true }).text(' | ', { continued: true });
    doc.text('Grund', { continued: true }).text(' | ', { continued: true });
    doc.text('Betrag', 500, doc.y);

    penalties.forEach(penalty => {
      // Sicherstellen, dass amount als Zahl behandelt wird
      const amount = parseFloat(penalty.amount);
      if (!isNaN(amount)) {
        doc.text(formatDate(penalty.date), 50, doc.y);
        doc.text(penalty.type || '-', { continued: true });
        doc.text(penalty.reason || '-', { continued: true });
        doc.text(amount.toFixed(2) + ' €', 500, doc.y); // Ausgabe des Betrags mit 2 Dezimalstellen
        doc.moveDown();
      } else {
        console.warn(`Ungültiger Betrag für Strafe ID ${penalty.id}: ${penalty.amount}`);
      }
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
  }
});


// Admin: Alle Strafen aller Nutzer als PDF
router.get('/all', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Keine Rechte');

  try {
    const penalties = (await db.query(
      'SELECT p.date, p.reason, p.type, p.event, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
    doc.pipe(res);

    // Logo in das PDF einfügen
    drawLogo(doc);

    // Titel
    doc.fontSize(12).font('Helvetica');

// Tabelle Kopfzeile
doc.fontSize(14).font('Helvetica-Bold').text('Datum', 50, doc.y, { continued: true })
   .text(' | ', { continued: true })
   .text('Strafart', { continued: true })
   .text(' | ', { continued: true })
   .text('Grund', { continued: true })
   .text(' | ', { continued: true })
   .text('Betrag', 500, doc.y);
doc.moveDown(1);

// Tabelle Inhalt
penalties.forEach(penalty => {
  const amount = parseFloat(penalty.amount);
  if (!isNaN(amount)) {
    doc.text(formatDate(penalty.date), 50, doc.y);
    doc.text(penalty.type || '-', { continued: true });
    doc.text(penalty.reason || '-', { continued: true });
    doc.text(amount.toFixed(2) + ' €', 500, doc.y);
    doc.moveDown();
  }
});


    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

module.exports = router;
