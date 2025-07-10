const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const path = require('path');
const PDFTable = require('pdfkit-table');

// Hilfsfunktion
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('de-DE');
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function drawLogo(doc) {
  try {
    const LOGO_PATH = path.join(__dirname, '../public/logo.png');
    doc.image(LOGO_PATH, 50, 30, { width: 60 });
    doc.moveDown(2);
  } catch (err) {
    doc.moveDown(2);
  }
}

// =============================
// 1. Eigenes Strafregister exportieren
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

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Strafenkonto für ' + req.session.user.username, { align: 'center' });
    doc.moveDown(2);

    // Tabelle vorbereiten
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
    // Gesamtsumme als letzte Zeile
    table.rows.push([
      {colSpan: 3, label: 'Summe', align: 'right', fontSize: 12, fontBold: true},
      {label: sum.toFixed(2) + ' €', align: 'right', fontSize: 12, fontBold: true}
    ]);

    // Tabelle ausgeben
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

// =============================
// 2. Admin: Alle Strafen eines Users als PDF
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

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Strafenkonto für ' + user.username, { align: 'center' });
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
    res.status(500).send('Fehler beim Exportieren der User-Strafen.');
  }
});

// =============================
// 3. Admin: Alle Strafen aller Nutzer als PDF
router.get('/all', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Keine Rechte');

  try {
    const penalties = (await db.query(
      'SELECT p.date, p.reason, p.type, p.amount, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
    doc.pipe(res);

    drawLogo(doc);

    doc.fontSize(18).font('Helvetica-Bold').text('Alle Strafen', { align: 'center' });
    doc.moveDown(2);

    let sum = 0;
    const table = {
      headers: [
        { label: "User", property: "username", width: 80 },
        { label: "Datum", property: "date", width: 70 },
        { label: "Strafart", property: "type", width: 80 },
        { label: "Grund", property: "reason", width: 180 },
        { label: "Betrag (€)", property: "amount", width: 80, align: "right" }
      ],
      datas: penalties.map(p => {
        const amount = parseFloat(p.amount) || 0;
        sum += amount;
        return {
          username: p.username,
          date: formatDate(p.date),
          type: p.type || "-",
          reason: p.reason || "-",
          amount: amount.toFixed(2)
        };
      }),
      rows: []
    };
    table.rows.push([
      {colSpan: 4, label: 'Summe', align: 'right', fontSize: 12, fontBold: true},
      {label: sum.toFixed(2) + ' €', align: 'right', fontSize: 12, fontBold: true}
    ]);

    await doc.table(table, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(11)
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren aller Strafen.');
  }
});

module.exports = router;
