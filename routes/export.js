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

// Logo mit Abstand (kleiner, mit Abstand nach unten)
function drawLogo(doc) {
  try {
    const LOGO_PATH = path.join(__dirname, '../public/logo.png');
    doc.image(LOGO_PATH, 50, 30, { width: 60 });
    doc.moveDown();
    doc.moveDown();
    doc.moveDown(); // Mehr Abstand nach unten
  } catch (err) {
    console.warn('Logo konnte nicht geladen werden:', err.message);
    doc.moveDown(2);
  }
}

// Tabellarische Kopfzeile
function drawTableHeader(doc, y) {
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Datum', 50, y)
    .text('Strafart', 130, y)
    .text('Grund', 230, y)
    .text('Betrag (€)', 450, y, { align: 'right' });
  doc.moveTo(50, y + 15)
    .lineTo(550, y + 15)
    .stroke();
}

// Eine Zeile
function drawTableRow(doc, y, penalty) {
  doc.fontSize(11).font('Helvetica')
    .text(formatDate(penalty.date), 50, y)
    .text(penalty.type || '-', 130, y)
    .text(penalty.reason || '-', 230, y, { width: 200 })
    .text((parseFloat(penalty.amount) || 0).toFixed(2), 450, y, { width: 80, align: 'right' });
}

function drawSumRow(doc, y, sum) {
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Summe', 230, y)
    .text(sum.toFixed(2) + ' €', 450, y, { width: 80, align: 'right' });
  doc.moveTo(50, y + 15)
    .lineTo(550, y + 15)
    .stroke();
}

// =============================
// Eigenes Strafregister exportieren (Mitglied/Admin)
router.get('/me', requireLogin, async (req, res) => {
  try {
    const penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.session.user.id]
    )).rows;

    let sum = 0;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="meine_strafen.pdf"');
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Strafenkonto für ' + req.session.user.username, { align: 'center' });
    doc.moveDown(2);

    let y = doc.y;
    drawTableHeader(doc, y);
    y += 25;

    penalties.forEach(penalty => {
      if (y > 720) { // neue Seite ab ca. Zeile 35
        doc.addPage();
        y = 50;
        drawTableHeader(doc, y);
        y += 25;
      }
      drawTableRow(doc, y, penalty);
      sum += parseFloat(penalty.amount) || 0;
      y += 20;
    });

    // Gesamtsumme
    y += 10;
    drawSumRow(doc, y, sum);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren Ihrer Strafen.');
  }
});

// =============================
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

    let sum = 0;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="strafen_${user.username}.pdf"`);
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Strafenkonto für ' + user.username, { align: 'center' });
    doc.moveDown(2);

    let y = doc.y;
    drawTableHeader(doc, y);
    y += 25;

    penalties.forEach(penalty => {
      if (y > 720) {
        doc.addPage();
        y = 50;
        drawTableHeader(doc, y);
        y += 25;
      }
      drawTableRow(doc, y, penalty);
      sum += parseFloat(penalty.amount) || 0;
      y += 20;
    });

    y += 10;
    drawSumRow(doc, y, sum);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren der User-Strafen.');
  }
});

// =============================
// Admin: Alle Strafen aller Nutzer als PDF
router.get('/all', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Keine Rechte');

  try {
    const penalties = (await db.query(
      'SELECT p.date, p.reason, p.type, p.amount, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    let sum = 0;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Alle Strafen', { align: 'center' });
    doc.moveDown(2);

    // Kopfzeile für alle mit Username
    let y = doc.y;
    doc.fontSize(12).font('Helvetica-Bold')
      .text('User', 50, y)
      .text('Datum', 120, y)
      .text('Strafart', 200, y)
      .text('Grund', 290, y)
      .text('Betrag (€)', 450, y, { align: 'right' });
    doc.moveTo(50, y + 15)
      .lineTo(550, y + 15)
      .stroke();
    y += 25;

    penalties.forEach(penalty => {
      if (y > 720) {
        doc.addPage();
        y = 50;
        doc.fontSize(12).font('Helvetica-Bold')
          .text('User', 50, y)
          .text('Datum', 120, y)
          .text('Strafart', 200, y)
          .text('Grund', 290, y)
          .text('Betrag (€)', 450, y, { align: 'right' });
        doc.moveTo(50, y + 15)
          .lineTo(550, y + 15)
          .stroke();
        y += 25;
      }
      doc.fontSize(11).font('Helvetica')
        .text(penalty.username, 50, y)
        .text(formatDate(penalty.date), 120, y)
        .text(penalty.type || '-', 200, y)
        .text(penalty.reason || '-', 290, y, { width: 150 })
        .text((parseFloat(penalty.amount) || 0).toFixed(2), 450, y, { width: 80, align: 'right' });
      sum += parseFloat(penalty.amount) || 0;
      y += 20;
    });

    y += 10;
    doc.fontSize(12).font('Helvetica-Bold')
      .text('Summe', 290, y)
      .text(sum.toFixed(2) + ' €', 450, y, { width: 80, align: 'right' });
    doc.moveTo(50, y + 15)
      .lineTo(550, y + 15)
      .stroke();

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren aller Strafen.');
  }
});

module.exports = router;
