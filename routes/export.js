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

// Eigenes Strafregister exportieren (Mitglied/Admin)
router.get('/', requireLogin, async (req, res) => {
  let users = [];
  if (req.session.user.is_admin) {
    const result = await db.query('SELECT id, username FROM users ORDER BY username');
    users = result.rows;
  }
  res.render('export', { user: req.session.user, users });
});


    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="meine_strafen.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Strafenkonto für ' + req.session.user.username);
    doc.moveDown();

    let y = doc.y;
    penalties.forEach((penalty, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(12).text(
        `${formatDate(penalty.date)} [${penalty.type || '-'} @ ${penalty.event || '-'}]: ${penalty.reason}`,
        50,
        y
      );
      y += 20;
    });

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

    doc.fontSize(18).text('Strafenkonto für ' + user.username);
    doc.moveDown();

    let y = doc.y;
    penalties.forEach((penalty) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(12).text(
        `${formatDate(penalty.date)} [${penalty.type || '-'} @ ${penalty.event || '-'}]: ${penalty.reason}`,
        50,
        y
      );
      y += 20;
    });

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
      'SELECT p.date, p.reason, p.type, p.event, u.username FROM penalties p JOIN users u ON p.user_id = u.id ORDER BY u.username, p.date DESC'
    )).rows;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="alle_strafen.pdf"');
    doc.pipe(res);

    doc.fontSize(18).text('Alle Strafen');
    doc.moveDown();

    let y = doc.y;
    penalties.forEach((penalty) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(12).text(
        `${penalty.username}: ${formatDate(penalty.date)} [${penalty.type || '-'} @ ${penalty.event || '-'}] – ${penalty.reason}`,
        50,
        y
      );
      y += 20;
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Exportieren');
  }
});

module.exports = router;
