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
    // Platz für das Logo, um es schön zu positionieren
    doc.image(LOGO_PATH, 50, 30, { width: 100 });
  }
}

// Middleware: Login-Check
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Funktion für Tabellenkopf
function generateTableHeader(doc, y) {
  doc.fontSize(12).font('Helvetica-Bold');
  doc.text('Datum', 50, y);
  doc.text('Grund', 150, y);
  doc.text('Veranstaltung', 270, y);
  doc.text('Betrag (€)', 450, y, { width: 60, align: 'right' });
  return y + 20;  // Höhe nach dem Tabellenkopf
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
    doc.fontSize(18).text('Strafenkonto für ' + req.session.user.username, 150, 80);
    doc.moveDown(2);

    let y = 120; // Beginn der Tabelle
    y = generateTableHeader(doc, y);

    let total = 0;
    penalties.forEach((p) => {
      if (y > 750) {
        doc.addPage();
        y = 50;  // Position zurücksetzen, wenn Seite voll ist
        generateTableHeader(doc, y); // Kopf nach dem Seitenumbruch erneut zeichnen
      }
      doc.font('Helvetica')
        .text(formatDate(p.date), 50, y)
        .text(p.type || '-', 150, y)
        .text(p.event || '-', 270, y)
        .text(Number(p.amount).toFixed(2), 450, y, { width: 60, align: 'right' });
      
      total += Number(p.amount);
      y += 18; // Zeilenhöhe
    });

    // Gesamtsumme
    doc.font('Helvetica-Bold');
    doc.text('Gesamtbetrag:', 270, y + 10);
    doc.text(total.toFixed(2) + ' €', 450, y + 10, { width: 60, align: 'right' });

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
    doc.fontSize(18).text('Strafenkonto für ' + user.username, 150, 80);
    doc.moveDown(2);

    let y = 120; // Beginn der Tabelle
    y = generateTableHeader(doc, y);

    let total = 0;
    penalties.forEach((p) => {
      if (y > 750) {
        doc.addPage();
        y = 50;  // Position zurücksetzen, wenn Seite voll ist
        generateTableHeader(doc, y); // Kopf nach dem Seitenumbruch erneut zeichnen
      }
      doc.font('Helvetica')
        .text(formatDate(p.date), 50, y)
        .text(p.type || '-', 150, y)
        .text(p.event || '-', 270, y)
        .text(Number(p.amount).toFixed(2), 450, y, { width: 60, align: 'right' });

      total += Number(p.amount);
      y += 18; // Zeilenhöhe
    });

    // Gesamtsumme
    doc.font('Helvetica-Bold');
    doc.text('Gesamtbetrag:', 270, y + 10);
    doc.text(total.toFixed(2) + ' €', 450, y + 10, { width: 60, align: 'right' });

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
    doc.fontSize(18).text('Alle Strafen', 150, 80);
    doc.moveDown(2);

    let y = 120; // Beginn der Tabelle
    y = generateTableHeader(doc, y);

    let total = 0;
    penalties.forEach((p) => {
      if (y > 750) {
        doc.addPage();
        y = 50;  // Position zurücksetzen, wenn Seite voll ist
        generateTableHeader(doc, y); // Kopf nach dem Seitenumbruch erneut zeichnen
      }
      doc.font('Helvetica')
        .text(p.username, 50, y)
        .text(formatDate(p.date), 120, y)
        .text(p.type || '-', 190, y)
        .text(p.event || '-', 320, y)
        .text(Number(p.amount).toFixed(2), 490, y, { width: 60, align: 'right' });

      total += Number(p.amount);
      y += 18; // Zeilenhöhe
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
