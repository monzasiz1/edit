const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

// Middleware für Login
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

// =================== USER-PDF ===================
router.get('/meine-pdf', requireLogin, async (req, res) => {
  await userPenaltiesPDF(req, res, req.session.user.id, req.session.user.username, false);
});
// =================== USER-CSV ===================
router.get('/meine-csv', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userName = req.session.user.username;
    const { rows } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1 ORDER BY p.date DESC`, [userId]
    );
    const parser = new Parser({ fields: ['date', 'event', 'type', 'amount', 'admin'] });
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`);
    res.set('Content-Type', 'text/csv');
    res.send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// =================== ADMIN-GESAMT-PDF ===================
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

    // Tabelle
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
// =================== ADMIN-GESAMT-CSV ===================
router.get('/alle-csv', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.date, u.username AS mitglied, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN users a ON p.admin_id = a.id
       ORDER BY p.date DESC`
    );
    const parser = new Parser({ fields: ['date', 'mitglied', 'event', 'type', 'amount', 'admin'] });
    res.setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.csv');
    res.set('Content-Type', 'text/csv');
    res.send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// =================== ADMIN-EINZEL-PDF ===================
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
// =================== ADMIN-EINZEL-CSV ===================
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
    const parser = new Parser({ fields: ['date', 'event', 'type', 'amount', 'admin'] });
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`);
    res.set('Content-Type', 'text/csv');
    res.send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// ============ Zentrale Tabellenfunktion ===========
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

// ========== UNIVERSAL: PDFKit-Tabelle (ohne Modul!) ==========
async function drawTable(doc, rows, columns) {
  const tableTop = doc.y + 10;
  const rowHeight = 24;
  const colX = [35];
  for (const col of columns) colX.push(colX[colX.length-1] + col.width);

  // Kopfzeile
  function header(y) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111');
    columns.forEach((col, i) => {
      doc.text(col.label, colX[i], y, { width: col.width, align: col.align || 'left' });
    });
    doc.moveTo(colX[0], y + rowHeight - 8).lineTo(colX[columns.length], y + rowHeight - 8).stroke();
    doc.font('Helvetica').fontSize(11);
  }

  let y = tableTop;
  header(y); y += rowHeight;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Seitenumbruch & Header auf neuer Seite
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage(); y = 50; header(y); y += rowHeight;
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
      doc.fillColor('#111').text(val || "-", colX[j], y, { width: col.width, align: col.align || 'left' });
    });
    y += rowHeight;
  }
}

module.exports = router;
