const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Logo-Pfad anpassen, falls dein Logo woanders liegt!
const LOGO_PATH = path.join(__dirname, '../public/logo.png');

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
}

function drawLogo(doc) {
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, 50, 35, { width: 70 });
  }
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

    // Logo und Titel
    drawLogo(doc);
    doc.fontSize(18).text('Strafenkonto für ' + req.session.user.username, 130, 50);
    doc.moveDown(2);

    // Tabellenkopf
    const tableTop = doc.y + 10;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Datum', 50, tableTop);
    doc.text('Grund', 120, tableTop);
    doc.text('Veranstaltung', 260, tableTop);
    doc.text('Betrag (€)', 430, tableTop, { width: 60, align: 'right' });

    doc.font('Helvetica');
    let y = tableTop + 18;
    let total = 0;
    penalties.forEach((p) => {
      if (y > 730) {
        doc.addPage();
        y = 50;
      }
      doc.text(formatDate(p.date), 50, y);
      doc.text(p.type || '-', 120, y);
      doc.text(p.event || '-', 260, y, { width: 160 });
      doc.text(Number(p.amount).toFixed(2), 430, y, { width: 60, align: 'right' });
      total += Number(p.amount);
      y += 18;
    });

    // Gesamtsumme
    doc.font('Helvetica-Bold');
    doc.text('Gesamtbetrag:', 260, y + 10);
    doc.text(total.toFixed(2) + ' €', 430, y + 10, { width: 60, align: 'right' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
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

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="strafen_${user.username}.pdf"`);
    doc.pipe(res);

    // Logo und Titel
    drawLogo(doc);
    doc.fontSize(18).text('Strafenkonto für ' + user.username, 130, 50);
    doc.moveDown(2);

    // Tabellenkopf
    const tableTop = doc.y + 10;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Datum', 50, tableTop);
    doc.text('Grund', 120, tableTop);
    doc.text('Veranstaltung', 260, tableTop);
    doc.text('Betrag (€)', 430, tableTop, { width: 60, align: 'right' });

    doc.font('Helvetica');
    let y = tableTop + 18;
    let total = 0;
    penalties.forEach((p) => {
      if (y > 730) {
        doc.addPage();
        y = 50;
      }
      doc.text(formatDate(p.date), 50, y);
      doc.text(p.type || '-', 120, y);
      doc.text(p.event || '-', 260, y, { width: 160 });
      doc.text(Number(p.amount).toFixed(2), 430, y, { width: 60, align: 'right' });
      total += Number(p.amount);
      y += 18;
    });

    // Gesamtsumme
    doc.font('Helvetica-Bold');
    doc.text('Gesamtbetrag:', 260, y + 10);
    doc.text(total.toFixed(2) + ' €', 430, y + 10, { width: 60, align: 'right' });

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
      'SELECT p.date, p.type, p.event, p.amount, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
    doc.pipe(res);

    // Logo und Titel
    drawLogo(doc);
    doc.fontSize(18).text('Alle Strafen', 130, 50);
    doc.moveDown(2);

    // Tabellenkopf
    const tableTop = doc.y + 10;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Benutzer', 50, tableTop);
    doc.text('Datum', 120, tableTop);
    doc.text('Grund', 190, tableTop);
    doc.text('Veranstaltung', 320, tableTop);
    doc.text('Betrag (€)', 490, tableTop, { width: 60, align: 'right' });

    doc.font('Helvetica');
    let y = tableTop + 18;
    let total = 0;
    penalties.forEach((p) => {
      if (y > 730) {
        doc.addPage();
        y = 50;
      }
      doc.text(p.username, 50, y);
      doc.text(formatDate(p.date), 120, y);
      doc.text(p.type || '-', 190, y);
      doc.text(p.event || '-', 320, y, { width: 160 });
      doc.text(Number(p.amount).toFixed(2), 490, y, { width: 60, align: 'right' });
      total += Number(p.amount);
      y += 18;
    });

    // Gesamtsumme
    doc.font('Helvetica-Bold');
    doc.text('Gesamtbetrag:', 320, y + 10);
    doc.text(total.toFixed(2) + ' €', 490, y + 10, { width: 60, align: 'right' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

module.exports = router;
