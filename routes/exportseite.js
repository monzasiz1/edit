const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

// Middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user?.is_admin) return res.status(403).send('Nur Admins!');
  next();
}

// Übersichtsseite
router.get('/', requireLogin, (req, res) => {
  res.render('exportseite', { title: "Export" });
});

// Eigene Strafen als PDF
router.get('/meine-pdf', requireLogin, async (req, res) => {
  await userPenaltiesPDF(req, res, req.session.user.id, req.session.user.username, false);
});

// Eigene Strafen als CSV
router.get('/meine-csv', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userName = req.session.user.username;
    const { rows } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1 ORDER BY p.date DESC`, [userId]
    );
    // Feldinhalte als einfache Strings ohne Umbrüche:
    rows.forEach(r => {
      Object.keys(r).forEach(k => r[k] = typeof r[k] === 'string' ? r[k].replace(/\r?\n|\r/g, ' ') : r[k]);
    });
    const parser = new Parser({ fields: ['date', 'event', 'type', 'amount', 'admin'] });
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`);
    res.set('Content-Type', 'text/csv');
    res.send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// Admin: Alle Strafen als PDF
router.get('/alle-pdf', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.date, u.username AS mitglied, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN users a ON p.admin_id = a.id
       ORDER BY p.date DESC`
    );
    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    res.setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(18).text(`Alle Strafen aller Mitglieder`, { align: 'center' });
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(13).text("Keine Strafen vorhanden. 🎉");
      doc.end();
      return;
    }

    await drawTable(doc, rows, [
      { label: "Datum",    prop: "date",     width: 70 },
      { label: "Mitglied", prop: "mitglied", width: 90 },
      { label: "Event",    prop: "event",    width: 105 },
      { label: "Grund",    prop: "type",     width: 80 },
      { label: "Betrag (€)",prop: "amount",  width: 55, align: "right" },
      { label: "Spieß",    prop: "admin",    width: 70 }
    ]);
    // Summe
    const sum = rows.reduce((a, b) => a + Number(b.amount), 0);
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(13).text(`Gesamtbetrag: ${sum.toFixed(2)} €`, doc.page.width - 220, doc.y, { align: 'right' });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
});

// Admin: Alle Strafen als CSV
router.get('/alle-csv', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.date, u.username AS mitglied, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN users a ON p.admin_id = a.id
       ORDER BY p.date DESC`
    );
    rows.forEach(r => {
      Object.keys(r).forEach(k => r[k] = typeof r[k] === 'string' ? r[k].replace(/\r?\n|\r/g, ' ') : r[k]);
    });
    const parser = new Parser({ fields: ['date', 'mitglied', 'event', 'type', 'amount', 'admin'] });
    res.setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.csv');
    res.set('Content-Type', 'text/csv');
    res.send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// Admin: Einzeluser als PDF
router.get('/user/:id/pdf', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    const userName = userResult.rows[0].username;
    await userPenaltiesPDF(req, res, userId, userName, true);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
});

// Admin: Einzeluser als CSV
router.get('/user/:id/csv', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    const userName = userResult.rows[0].username;
    const { rows } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1 ORDER BY p.date DESC`, [userId]
    );
    rows.forEach(r => {
      Object.keys(r).forEach(k => r[k] = typeof r[k] === 'string' ? r[k].replace(/\r?\n|\r/g, ' ') : r[k]);
    });
    const parser = new Parser({ fields: ['date', 'event', 'type', 'amount', 'admin'] });
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`);
    res.set('Content-Type', 'text/csv');
    res.send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// ======= User/Einzel-PDF-Export (mit automatischem Umbruch) =========
async function userPenaltiesPDF(req, res, userId, userName, isAdminView) {
  try {
    const { rows: penalties } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`, [userId]
    );
    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(18).text(`Strafenübersicht für ${userName}`, { align: 'center' });
    doc.moveDown();

    if (!penalties.length) {
      doc.fontSize(13).text("Keine Strafen vorhanden. 🎉");
      doc.end();
      return;
    }

    await drawTable(doc, penalties, [
      { label: "Datum",   prop: "date",   width: 80 },
      { label: "Event",   prop: "event",  width: 120 },
      { label: "Grund",   prop: "type",   width: 120 },
      { label: "Betrag (€)",prop: "amount", width: 70, align: "right" },
      { label: "Spieß",   prop: "admin",  width: 90 }
    ]);
    // Summe
    const sum = penalties.reduce((a, b) => a + Number(b.amount), 0);
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(13).text(`Gesamtbetrag: ${sum.toFixed(2)} €`, doc.page.width - 200, doc.y, { align: 'right' });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
}

// =========== Tabellen-Renderer mit automatischem Umbruch ==============
function getTextHeight(doc, text, width, options = {}) {
  const savedY = doc.y;
  const h = doc.heightOfString(text, { width, ...options });
  doc.y = savedY;
  return h;
}

async function drawTable(doc, rows, columns) {
  const tableTop = doc.y + 10;
  const minRowHeight = 24;
  const colX = [35];
  for (const col of columns) colX.push(colX[colX.length-1] + col.width);

  function header(y) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111');
    columns.forEach((col, i) => {
      doc.text(col.label, colX[i], y, { width: col.width, align: col.align || 'left' });
    });
    doc.moveTo(colX[0], y + minRowHeight - 8).lineTo(colX[columns.length], y + minRowHeight - 8).stroke();
    doc.font('Helvetica').fontSize(11);
  }

  let y = tableTop;
  header(y); y += minRowHeight;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // Spaltenhöhen ermitteln für den höchsten Feldtext
    let rowHeights = columns.map((col, j) => {
      let val = r[col.prop];
      if (col.prop === "date") val = new Date(val).toLocaleDateString('de-DE');
      if (col.prop === "amount") val = Number(val).toFixed(2);
      return getTextHeight(doc, val ? String(val) : "-", col.width) + 8;
    });
    let rowHeight = Math.max(minRowHeight, ...rowHeights);

    // Seitenumbruch bei Bedarf
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage(); y = 50; header(y); y += minRowHeight;
    }

    // Zebra-Style
    if (i % 2 === 1) {
      doc.rect(colX[0], y - 3, colX[columns.length] - colX[0], rowHeight).fill('#e7f3e6').fillColor('#111');
    }
    // Werte
    columns.forEach((col, j) => {
      let val = r[col.prop];
      if (col.prop === "date") val = new Date(val).toLocaleDateString('de-DE');
      if (col.prop === "amount") val = Number(val).toFixed(2);
      doc.fillColor('#111').text(val ? String(val) : "-", colX[j], y, { width: col.width, align: col.align || 'left' });
    });
    y += rowHeight;
  }
}

module.exports = router;
