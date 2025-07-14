const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const createTable = require('pdfkit-table').default; // pdfkit-table v2

// Middleware für Login
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// --- SEITE für Export-Übersicht ---
router.get('/', requireLogin, async (req, res) => {
  res.render('exportseite', { title: "Export" });
});

// --- PDF-/CSV-Export für EIGENE Strafen ---
router.get('/meine-pdf', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userName = req.session.user.username;
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

    let sum = 0;
    const tableRows = penalties.map(p => {
      sum += Number(p.amount);
      return [
        new Date(p.date).toLocaleDateString('de-DE'),
        p.event,
        p.type,
        Number(p.amount).toFixed(2),
        p.admin || '-'
      ];
    });

    const table = {
      headers: ['Datum', 'Event', 'Grund', 'Betrag (€)', 'Spieß'],
      rows: tableRows,
      options: {
        width: 520,
        columnSpacing: 6,
        padding: 6,
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
        prepareRow: (row, i) => doc.font('Helvetica').fontSize(11).fillColor(i % 2 ? '#333' : '#111'),
      }
    };

    await createTable(doc, table);

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(13).text(`Gesamtbetrag: ${sum.toFixed(2)} €`, { align: 'right' });
    doc.end();

  } catch (e) {
    console.error("Fehler beim PDF-Export:", e);
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
  }
});

router.get('/meine-csv', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userName = req.session.user.username;
    const { rows: penalties } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`, [userId]
    );
    const parser = new Parser({ fields: ['date', 'event', 'type', 'amount', 'admin'] });
    const csv = parser.parse(penalties);
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`);
    res.set('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// --- EXPORT für ADMIN ---

// ALLE Strafen: PDF
router.get('/alle-pdf', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Nur Admins!');
  try {
    const { rows: penalties } = await db.query(
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

    if (!penalties.length) {
      doc.fontSize(13).text("Keine Strafen vorhanden. 🎉");
      doc.end();
      return;
    }

    let sum = 0;
    const tableRows = penalties.map(p => {
      sum += Number(p.amount);
      return [
        new Date(p.date).toLocaleDateString('de-DE'),
        p.mitglied,
        p.event,
        p.type,
        Number(p.amount).toFixed(2),
        p.admin || '-'
      ];
    });

    const table = {
      headers: ['Datum', 'Mitglied', 'Event', 'Grund', 'Betrag (€)', 'Spieß'],
      rows: tableRows,
      options: {
        width: 540,
        columnSpacing: 5,
        padding: 5,
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
        prepareRow: (row, i) => doc.font('Helvetica').fontSize(11).fillColor(i % 2 ? '#222' : '#111'),
      }
    };

    await createTable(doc, table);

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(13).text(`Gesamtbetrag: ${sum.toFixed(2)} €`, { align: 'right' });
    doc.end();

  } catch (e) {
    console.error("Fehler beim PDF-Export:", e);
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
  }
});

router.get('/alle-csv', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Nur Admins!');
  try {
    const { rows: penalties } = await db.query(
      `SELECT p.date, u.username AS mitglied, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN users a ON p.admin_id = a.id
       ORDER BY p.date DESC`
    );
    const parser = new Parser({ fields: ['date', 'mitglied', 'event', 'type', 'amount', 'admin'] });
    const csv = parser.parse(penalties);
    res.setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.csv');
    res.set('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

// Einzeln: PDF/CSV für *beliebigen* Nutzer (Admin)
router.get('/user/:id/pdf', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Nur Admins!');
  try {
    const userId = req.params.id;
    const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    const userName = userResult.rows[0].username;
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

    let sum = 0;
    const tableRows = penalties.map(p => {
      sum += Number(p.amount);
      return [
        new Date(p.date).toLocaleDateString('de-DE'),
        p.event,
        p.type,
        Number(p.amount).toFixed(2),
        p.admin || '-'
      ];
    });

    const table = {
      headers: ['Datum', 'Event', 'Grund', 'Betrag (€)', 'Spieß'],
      rows: tableRows,
      options: {
        width: 520,
        columnSpacing: 6,
        padding: 6,
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
        prepareRow: (row, i) => doc.font('Helvetica').fontSize(11).fillColor(i % 2 ? '#333' : '#111'),
      }
    };

    await createTable(doc, table);

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(13).text(`Gesamtbetrag: ${sum.toFixed(2)} €`, { align: 'right' });
    doc.end();

  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
});

router.get('/user/:id/csv', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Nur Admins!');
  try {
    const userId = req.params.id;
    const userResult = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    const userName = userResult.rows[0].username;
    const { rows: penalties } = await db.query(
      `SELECT p.date, p.event, p.type, p.amount, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`, [userId]
    );
    const parser = new Parser({ fields: ['date', 'event', 'type', 'amount', 'admin'] });
    const csv = parser.parse(penalties);
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.csv`);
    res.set('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
    console.error(e);
  }
});

module.exports = router;
