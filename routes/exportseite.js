// routes/exportseite.js

const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../db');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

// ───── Middleware ──────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user?.is_admin) {
    return res.status(403).send('Nur Admins!');
  }
  next();
}

// ───── Übersichtsseite ──────────────────────────────────────────────────────
router.get('/', requireLogin, (req, res) => {
  res.render('exportseite', { title: "Export" });
});

// ───── Eigene Strafen als PDF ───────────────────────────────────────────────
router.get('/meine-pdf', requireLogin, async (req, res) => {
  await userPenaltiesPDF(req, res, req.session.user.id, req.session.user.username);
});

// ───── Eigene Strafen als CSV ───────────────────────────────────────────────
router.get('/meine-csv', requireLogin, async (req, res) => {
  try {
    const userId   = req.session.user.id;
    const userName = req.session.user.username;
    const { rows } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`,
      [userId]
    );
    rows.forEach(r =>
      Object.keys(r).forEach(k =>
        typeof r[k] === 'string' && (r[k] = r[k].replace(/\r?\n|\r/g, ' '))
      )
    );
    const parser = new Parser({ fields: ['date','event','type','amount','admin'] });
    res
      .setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`)
      .type('text/csv')
      .send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// ───── Admin: Alle Strafen als PDF ──────────────────────────────────────────
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
    res
      .setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.pdf')
      .type('application/pdf');
    doc.pipe(res);

    // Logo oben links
    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    doc.image(logoPath, doc.page.margins.left, doc.page.margins.top - 10, { width: 50 });
    doc.moveDown(2);

    // Titel
    doc.fontSize(18).text('Alle Strafen aller Mitglieder', { align: 'center' });
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(13).text('Keine Strafen vorhanden. 🎉');
      return doc.end();
    }

    // Tabelle mit klar getrennten Spalten
    await drawTable(doc, rows, [
      { label: 'Datum',      prop: 'date',      width: 80 },
      { label: 'Mitglied',   prop: 'mitglied',  width: 90 },
      { label: 'Event',      prop: 'event',     width: 100 },
      { label: 'Grund',      prop: 'type',      width: 95 },
      { label: 'Betrag (€)', prop: 'amount',    width: 70, align: 'right' },
      { label: 'Spieß',      prop: 'admin',     width: 80 }
    ]);

    // Summen‐Zeile direkt unterhalb der Tabelle
    const sumAll = rows.reduce((acc, cur) => acc + Number(cur.amount), 0);
    const sumTextAll = `Gesamtbetrag: ${sumAll.toFixed(2)} €`;
    const m = doc.page.margins.left;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(sumTextAll, m, doc.y + 5, {
        width: doc.page.width - m * 2,
        align: 'right'
      });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
});

// ───── Admin: Alle Strafen als CSV ─────────────────────────────────────────
router.get('/alle-csv', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.date, u.username AS mitglied, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN users a ON p.admin_id = a.id
       ORDER BY p.date DESC`
    );
    rows.forEach(r =>
      Object.keys(r).forEach(k =>
        typeof r[k] === 'string' && (r[k] = r[k].replace(/\r?\n|\r/g, ' '))
      )
    );
    const parser = new Parser({ fields: ['date','mitglied','event','type','amount','admin'] });
    res
      .setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.csv')
      .type('text/csv')
      .send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// ───── Admin: Einzeluser als PDF ───────────────────────────────────────────
router.get('/user/:id/pdf', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { rowCount, rows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    await userPenaltiesPDF(req, res, userId, rows[0].username);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
});

// ───── Admin: Einzeluser als CSV ──────────────────────────────────────────
router.get('/user/:id/csv', requireLogin, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { rowCount, rows: userRows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    const userName = userRows[0].username;

    const { rows } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`,
      [userId]
    );
    rows.forEach(r =>
      Object.keys(r).forEach(k =>
        typeof r[k] === 'string' && (r[k] = r[k].replace(/\r?\n|\r/g, ' '))
      )
    );
    const parser = new Parser({ fields: ['date','event','type','amount','admin'] });
    res
      .setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`)
      .type('text/csv')
      .send(parser.parse(rows));
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// ───── Funktion für User-PDFs ─────────────────────────────────────────────
async function userPenaltiesPDF(req, res, userId, userName) {
  try {
    const { rows: penalties } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`,
      [userId]
    );
    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    res
      .setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.pdf`)
      .type('application/pdf');
    doc.pipe(res);

    // Logo oben links
    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    doc.image(logoPath, doc.page.margins.left, doc.page.margins.top - 10, { width: 50 });
    doc.moveDown(2);

    // Titel
    doc.fontSize(18).text(`Strafenübersicht für ${userName}`, { align: 'center' });
    doc.moveDown();

    if (!penalties.length) {
      doc.fontSize(13).text('Keine Strafen vorhanden. 🎉');
      return doc.end();
    }

    // Tabelle mit klar getrennten Spalten
    await drawTable(doc, penalties, [
      { label: 'Datum',      prop: 'date',      width: 80 },
      { label: 'Event',      prop: 'event',     width: 120 },
      { label: 'Grund',      prop: 'type',      width: 120 },
      { label: 'Betrag (€)', prop: 'amount',    width: 100, align: 'right' },
      { label: 'Spieß',      prop: 'admin',     width: 80 }
    ]);

    // Summen‐Zeile direkt unterhalb der Tabelle
    const sumUser = penalties.reduce((acc, cur) => acc + Number(cur.amount), 0);
    const sumTextUser = `Gesamtbetrag: ${sumUser.toFixed(2)} €`;
    const m2 = doc.page.margins.left;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(sumTextUser, m2, doc.y + 5, {
        width: doc.page.width - m2 * 2,
        align: 'right'
      });

    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
}

// ───── Tabellen‐Renderer ──────────────────────────────────────────────────
function getTextHeight(doc, text, width, options = {}) {
  const savedY = doc.y;
  const h      = doc.heightOfString(text, { width, ...options });
  doc.y = savedY;
  return h;
}

async function drawTable(doc, rows, columns) {
  const tableTop     = doc.y + 10;
  const minRowHeight = 24;
  const colSpacing   = 10; // Abstand zwischen den Spalten
  const colX         = [doc.page.margins.left];

  // Spalten-Startpositionen berechnen mit Abstand
  columns.forEach(col => {
    const lastX = colX[colX.length - 1];
    colX.push(lastX + col.width + colSpacing);
  });

  // Kopfzeile
  function header(y) {
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111');
    columns.forEach((col, i) =>
      doc.text(col.label, colX[i], y, { width: col.width, align: col.align || 'left' })
    );
    doc.moveTo(colX[0], y + minRowHeight - 8)
       .lineTo(colX[columns.length - 1] + columns[columns.length -1].width, y + minRowHeight - 8)
       .stroke();
    doc.font('Helvetica').fontSize(11);
  }

  let y = tableTop;
  header(y);
  y += minRowHeight;

  // Zeilen
  rows.forEach((r, i) => {
    const heights = columns.map(col => {
      let val = r[col.prop];
      if (col.prop === 'date')   val = new Date(val).toLocaleDateString('de-DE');
      if (col.prop === 'amount') val = Number(val).toFixed(2);
      return getTextHeight(doc, val || '-', col.width) + 8;
    });
    const rowHeight = Math.max(minRowHeight, ...heights);

    // Seitenumbruch?
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = doc.page.margins.top;
      header(y);
      y += minRowHeight;
    }

    // Zebra-Striping
    if (i % 2 === 1) {
      doc.rect(colX[0], y - 3,
               colX[columns.length - 1] + columns[columns.length -1].width - colX[0],
               rowHeight)
         .fill('#e7f3e6')
         .fillColor('#111');
    }

    // Werte zeichnen
    columns.forEach((col, j) => {
      let val = r[col.prop];
      if (col.prop === 'date')   val = new Date(val).toLocaleDateString('de-DE');
      if (col.prop === 'amount') val = Number(val).toFixed(2);
      doc.fillColor('#111')
         .text(val || '-', colX[j], y, { width: col.width, align: col.align || 'left' });
    });

    y += rowHeight;
  });

  // doc.y ans Ende der Tabelle setzen
  doc.y = y;
}

module.exports = router;
