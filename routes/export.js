const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');

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

// Middleware: Admin-Check
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).send('Keine Rechte');
  }
  next();
}

// Hilfsfunktion zum Abrufen von Benutzern
async function getUsers() {
  try {
    const result = await db.query('SELECT id, username FROM users ORDER BY username');
    return result.rows;
  } catch (err) {
    console.error('Fehler beim Abrufen der Benutzer:', err);
    throw new Error('Fehler beim Laden der Benutzer');
  }
}

// Hilfsfunktion zum Erstellen von PDFs
function generatePDF(res, title, data, columns, fileName) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  doc.pipe(res);

  doc.fontSize(18).text(title);
  doc.moveDown();

  let y = doc.y;
  columns.forEach((col, index) => {
    doc.fontSize(12).text(col, 50 + (index * 120), y);
  });
  y += 20;

  data.forEach((item) => {
    if (y > 700) {
      doc.addPage();
      y = 50;
    }
    columns.forEach((col, index) => {
      doc.fontSize(12).text(item[col] || '-', 50 + (index * 120), y);
    });
    y += 20;
  });

  doc.end();
}

// Export Übersicht /export
router.get('/', requireLogin, async (req, res) => {
  let users = [];
  if (req.session.user.is_admin) {
    try {
      users = await getUsers();
    } catch (err) {
      return res.status(500).send(err.message);
    }
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

    if (!penalties.length) {
      return res.status(404).send('Keine Strafen gefunden');
    }

    const columns = ['date', 'type', 'event', 'reason'];
    const data = penalties.map(penalty => ({
      date: formatDate(penalty.date),
      type: penalty.type,
      event: penalty.event,
      reason: penalty.reason
    }));

    generatePDF(res, `Strafenkonto für ${req.session.user.username}`, data, columns, 'meine_strafen.pdf');
  } catch (err) {
    console.error('Fehler beim Exportieren der Strafen:', err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

// Admin: Alle Strafen eines Users als PDF
router.get('/user/:id', requireLogin, requireAdmin, async (req, res) => {
  try {
    const user = (await db.query('SELECT username FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).send('User nicht gefunden');

    const penalties = (await db.query(
      'SELECT * FROM penalties WHERE user_id = $1 ORDER BY date DESC',
      [req.params.id]
    )).rows;

    if (!penalties.length) {
      return res.status(404).send('Keine Strafen für diesen Benutzer gefunden');
    }

    const columns = ['date', 'type', 'event', 'reason'];
    const data = penalties.map(penalty => ({
      date: formatDate(penalty.date),
      type: penalty.type,
      event: penalty.event,
      reason: penalty.reason
    }));

    generatePDF(res, `Strafenkonto für ${user.username}`, data, columns, `strafen_${user.username}.pdf`);
  } catch (err) {
    console.error('Fehler beim Exportieren der Strafen für Benutzer:', err);
    res.status(500).send(`Fehler beim Exportieren: ${err.message}`);
  }
});

// Admin: Alle Strafen aller Nutzer als PDF
router.get('/all', requireLogin, requireAdmin, async (req, res) => {
  try {
    const penalties = (await db.query(
      'SELECT p.date, p.reason, p.type, p.event, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    if (!penalties.length) {
      return res.status(404).send('Keine Strafen gefunden');
    }

    const columns = ['username', 'date', 'type', 'event', 'reason'];
    const data = penalties.map(penalty => ({
      username: penalty.username,
      date: formatDate(penalty.date),
      type: penalty.type,
      event: penalty.event,
      reason: penalty.reason
    }));

    generatePDF(res, 'Alle Strafen', data, columns, 'alle_strafen.pdf');
  } catch (err) {
    console.error('Fehler beim Exportieren aller Strafen:', err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

module.exports = router;
