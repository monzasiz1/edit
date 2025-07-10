const express = require('express');
const router = express.Router();
const db = require('../db');  // Deine DB-Verbindung
const PDFDocument = require('pdfkit');
const path = require('path');
const PDFTable = require('pdfkit-table');  // Sicherstellen, dass pdfkit-table installiert ist

// Funktion zur Formatierung des Datums
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
}

// Middleware: Sicherstellen, dass der Benutzer eingeloggt ist
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Funktion zum Hinzufügen des Logos
function drawLogo(doc) {
  try {
    const LOGO_PATH = path.join(__dirname, '../public/logo.png');
    doc.image(LOGO_PATH, 50, 30, { width: 60 });
    doc.moveDown(2);
  } catch (err) {
    doc.moveDown(2); // Falls es kein Logo gibt, nichts tun
  }
}

// =============================
// 1. Eigenes Strafregister exportieren
router.get('/me', requireLogin, async (req, res) => {
  try {
    const penalties = (await db.query(
      'SELECT date, type, reason, amount FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.session.user.id]
    )).rows;

    if (!penalties.length) {
      return res.status(404).send('Keine Strafen gefunden');
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="meine_strafen.pdf"');
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Strafenkonto für ' + req.session.user.username, { align: 'center' });
    doc.moveDown(2);

    let sum = 0;
    const table = {
      headers: [
        { label: "Datum", property: "date", width: 70 },
        { label: "Strafart", property: "type", width: 80 },
        { label: "Grund", property: "reason", width: 220 },
        { label: "Betrag (€)", property: "amount", width: 80, align: "right" }
      ],
      datas: penalties.map(p => {
        const amount = parseFloat(p.amount) || 0;
        sum += amount;
        return {
          date: formatDate(p.date),
          type: p.type || "-",
          reason: p.reason || "-",
          amount: amount.toFixed(2)
        };
      }),
      rows: []
    };
    table.rows.push([
      {colSpan: 3, label: 'Summe', align: 'right', fontSize: 12, fontBold: true},
      {label: sum.toFixed(2) + ' €', align: 'right', fontSize: 12, fontBold: true}
    ]);

    await doc.table(table, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(11)
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren Ihrer Strafen.');
  }
});

module.exports = router;
