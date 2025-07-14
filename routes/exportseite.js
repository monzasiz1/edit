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

// --- SEITE für Export-Übersicht ---
router.get('/', requireLogin, async (req, res) => {
  res.render('exportseite', { title: "Export" });
});

// --- PDF-/CSV-Export für EIGENE Strafen ---
router.get('/meine-pdf', requireLogin, async (req, res) => {
  console.log("ROUTE: /export/meine-pdf wurde aufgerufen. User:", req.session.user);
  try {
    const userId = req.session.user.id;
    const userName = req.session.user.username;
    const { rows: penalties } = await db.query(
      `SELECT p.*, a.username AS admin
       FROM penalties p
       LEFT JOIN users a ON p.admin_id = a.id
       WHERE p.user_id = $1
       ORDER BY p.date DESC`, [userId]
    );
    // PDF-Generierung
    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    res.setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(18).text(`Strafenübersicht für ${userName}`, { align: 'center' });
    doc.moveDown();
    if (penalties.length === 0) {
      doc.fontSize(13).text("Keine Strafen vorhanden. 🎉");
    } else {
      doc.fontSize(13).text(`Gesamtanzahl: ${penalties.length}`);
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').text('Datum', 60, doc.y, { continued: true })
         .text('Event', 130, doc.y, { continued: true })
         .text('Grund', 230, doc.y, { continued: true })
         .text('Betrag (€)', 330, doc.y, { continued: true })
         .text('Spieß', 420, doc.y);
      doc.font('Helvetica').moveDown(0.2);
      let sum = 0;
      penalties.forEach(p => {
        sum += Number(p.amount);
        doc.text(new Date(p.date).toLocaleDateString('de-DE'), 60, doc.y, { continued: true })
           .text(p.event, 130, doc.y, { continued: true })
           .text(p.type, 230, doc.y, { continued: true })
           .text(Number(p.amount).toFixed(2), 330, doc.y, { continued: true })
           .text(p.admin || '-', 420, doc.y);
      });
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text(`Gesamtbetrag: ${sum.toFixed(2)} €`, { align: 'right' });
    }
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
     console.error(e);  // Das zeigt dir den echten Fehler im Server-Log!
 
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
    if (penalties.length === 0) {
      doc.fontSize(13).text("Keine Strafen vorhanden. 🎉");
    } else {
      doc.fontSize(13).text(`Gesamtanzahl: ${penalties.length}`);
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').text('Datum', 40, doc.y, { continued: true })
        .text('Mitglied', 110, doc.y, { continued: true })
        .text('Event', 210, doc.y, { continued: true })
        .text('Grund', 320, doc.y, { continued: true })
        .text('Betrag (€)', 420, doc.y, { continued: true })
        .text('Spieß', 495, doc.y);
      doc.font('Helvetica').moveDown(0.2);
      let sum = 0;
      penalties.forEach(p => {
        sum += Number(p.amount);
        doc.text(new Date(p.date).toLocaleDateString('de-DE'), 40, doc.y, { continued: true })
          .text(p.mitglied, 110, doc.y, { continued: true })
          .text(p.event, 210, doc.y, { continued: true })
          .text(p.type, 320, doc.y, { continued: true })
          .text(Number(p.amount).toFixed(2), 420, doc.y, { continued: true })
          .text(p.admin || '-', 495, doc.y);
      });
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text(`Gesamtbetrag: ${sum.toFixed(2)} €`, { align: 'right' });
    }
    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    
  console.error(e);  // Das zeigt dir den echten Fehler im Server-Log!
  if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
  console.error(e);  // Das zeigt dir den echten Fehler im Server-Log!
}

});

// ALLE Strafen: CSV
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
    console.error(e);  // Das zeigt dir den echten Fehler im Server-Log!
 
}
});

// Einzeln: PDF/CSV für *beliebigen* Nutzer (Admin)
router.get('/user/:id/pdf', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Nur Admins!');
  try {
    const userId = req.params.id;
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) return res.status(404).send('Nutzer nicht gefunden.');
    const userName = userResult.rows[0].username;
    const { rows: penalties } = await db.query(
      `SELECT p.*, a.username AS admin
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
    if (penalties.length === 0) {
      doc.fontSize(13).text("Keine Strafen vorhanden. 🎉");
    } else {
      doc.fontSize(13).text(`Gesamtanzahl: ${penalties.length}`);
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').text('Datum', 60, doc.y, { continued: true })
        .text('Event', 130, doc.y, { continued: true })
        .text('Grund', 230, doc.y, { continued: true })
        .text('Betrag (€)', 330, doc.y, { continued: true })
        .text('Spieß', 420, doc.y);
      doc.font('Helvetica').moveDown(0.2);
      let sum = 0;
      penalties.forEach(p => {
        sum += Number(p.amount);
        doc.text(new Date(p.date).toLocaleDateString('de-DE'), 60, doc.y, { continued: true })
          .text(p.event, 130, doc.y, { continued: true })
          .text(p.type, 230, doc.y, { continued: true })
          .text(Number(p.amount).toFixed(2), 330, doc.y, { continued: true })
          .text(p.admin || '-', 420, doc.y);
      });
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text(`Gesamtbetrag: ${sum.toFixed(2)} €`, { align: 'right' });
    }
    doc.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
  console.error(e);  // Das zeigt dir den echten Fehler im Server-Log!
  
}

});

router.get('/user/:id/csv', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) return res.status(403).send('Nur Admins!');
  try {
    const userId = req.params.id;
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
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
    console.error(e);

  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim CSV-Export.');
  console.error(e);  // Das zeigt dir den echten Fehler im Server-Log!
}

});

module.exports = router;
