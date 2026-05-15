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
       ORDER BY LOWER(u.username) ASC, p.date DESC`
    );

    const doc = createPdfDoc();
    res
      .setHeader('Content-Disposition', 'attachment; filename=Strafen_Gesamt.pdf')
      .type('application/pdf');
    doc.pipe(res);

    drawDocHeader(doc, 'Strafenübersicht – Gesamt', `Alle Mitglieder · ${rows.length} Eintrag${rows.length === 1 ? '' : 'e'}`);

    if (!rows.length) {
      doc.font('Helvetica').fontSize(12).fillColor(COLORS.muted)
         .text('Keine Strafen vorhanden.', { align: 'center' });
      finalizeDoc(doc);
      return;
    }

    // Gruppieren nach Mitglied (alphabetisch sortiert)
    const groups = new Map();
    rows.forEach(r => {
      const key = r.mitglied || '— unbekannt —';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const memberNames = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'de'));

    const grandTotal = rows.reduce((acc, r) => acc + Number(r.amount), 0);

    // Zusammenfassung oben
    drawSummaryBox(doc, [
      { label: 'Mitglieder', value: String(memberNames.length) },
      { label: 'Einträge', value: String(rows.length) },
      { label: 'Gesamtsumme', value: formatEuro(grandTotal), highlight: true }
    ]);

    memberNames.forEach((name, idx) => {
      const entries = groups.get(name);
      const subtotal = entries.reduce((acc, r) => acc + Number(r.amount), 0);

      ensureSpace(doc, 110);
      drawMemberHeading(doc, name, entries.length, subtotal);

      drawTable(doc, entries, [
        { label: 'Datum',      prop: 'date',   width: 70 },
        { label: 'Event',      prop: 'event',  width: 130 },
        { label: 'Grund',      prop: 'type',   width: 150 },
        { label: 'Betrag',     prop: 'amount', width: 70, align: 'right' },
        { label: 'Spieß',      prop: 'admin',  width: 90 }
      ]);

      if (idx < memberNames.length - 1) {
        doc.moveDown(1.2);
      }
    });

    // Grand Total am Ende
    doc.moveDown(0.8);
    ensureSpace(doc, 110);
    drawGrandTotal(doc, grandTotal);

    // "Zugsau" - Mitglied mit dem hoechsten Strafenbetrag
    const ranking = memberNames
      .map(name => {
        const entries = groups.get(name);
        const sum = entries.reduce((acc, r) => acc + Number(r.amount), 0);
        return { name, count: entries.length, sum };
      })
      .sort((a, b) => b.sum - a.sum || b.count - a.count);

    if (ranking.length && ranking[0].sum > 0) {
      drawZugsauBox(doc, ranking[0]);
    }

    finalizeDoc(doc);
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
    const doc = createPdfDoc();
    res
      .setHeader('Content-Disposition', `attachment; filename=Strafen_${userName.replace(/\s/g, "_")}.pdf`)
      .type('application/pdf');
    doc.pipe(res);

    drawDocHeader(doc, 'Strafenübersicht', userName);

    if (!penalties.length) {
      doc.font('Helvetica').fontSize(12).fillColor(COLORS.muted)
         .text('Keine Strafen vorhanden.', { align: 'center' });
      finalizeDoc(doc);
      return;
    }

    const sumUser = penalties.reduce((acc, cur) => acc + Number(cur.amount), 0);

    drawSummaryBox(doc, [
      { label: 'Mitglied', value: userName },
      { label: 'Einträge', value: String(penalties.length) },
      { label: 'Gesamtsumme', value: formatEuro(sumUser), highlight: true }
    ]);

    drawTable(doc, penalties, [
      { label: 'Datum',  prop: 'date',   width: 80 },
      { label: 'Event',  prop: 'event',  width: 150 },
      { label: 'Grund',  prop: 'type',   width: 160 },
      { label: 'Betrag', prop: 'amount', width: 70, align: 'right' },
      { label: 'Spieß',  prop: 'admin',  width: 90 }
    ]);

    doc.moveDown(0.8);
    ensureSpace(doc, 50);
    drawGrandTotal(doc, sumUser);

    finalizeDoc(doc);
  } catch (e) {
    if (!res.headersSent) res.status(500).send('Fehler beim PDF-Export.');
    console.error(e);
  }
}

// ───── PDF-Designsystem ───────────────────────────────────────────────────
const COLORS = {
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  subtleBg: '#f8fafc',
  headerBg: '#15803d',          // Seitenkopf bleibt sattes Gruen
  headerText: '#ffffff',
  zebra: '#f8fafc',
  // Dezente Grautoene fuer Mitglied/Tabellenkopf/Gesamtbetrag
  accent: '#f1f5f9',            // Tabellenkopf bg (sehr hell)
  accentText: '#334155',        // Tabellenkopf text
  accentDark: '#e2e8f0',        // Mitglied bg
  accentDarkText: '#1e293b',    // Mitglied text
  totalBg: '#cbd5e1',           // Gesamtbetrag bg (mittleres Grau - klar abgesetzt)
  totalText: '#000000'          // Gesamtbetrag text (schwarz, klar lesbar)
};

const PAGE_MARGIN = 42;
const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.png');

function createPdfDoc() {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 110, bottom: 60, left: PAGE_MARGIN, right: PAGE_MARGIN },
    bufferPages: true,
    info: { Title: 'Strafenübersicht', Author: 'Spießbuch' }
  });

  // Header auf jeder weiteren Seite zeichnen
  doc.on('pageAdded', () => {
    drawPageChrome(doc, { withFooter: false });
    doc.y = doc.page.margins.top;
  });

  return doc;
}

function drawPageChrome(doc) {
  const pageW = doc.page.width;
  const HEADER_H = 92;

  // Header-Streifen
  doc.save();
  doc.rect(0, 0, pageW, HEADER_H).fill(COLORS.headerBg);
  doc.restore();

  // Logo auf knapper weisser Plakette - Plakette nur so gross wie Logo + Schatten
  try {
    const logoSize = 56;
    const pad = 2;
    const badgeSize = logoSize + pad * 2;
    const badgeX = PAGE_MARGIN;
    const badgeY = (HEADER_H - badgeSize) / 2;
    const radius = 8;

    // Weicher Schatten
    doc.save();
    doc.fillColor('#000000').opacity(0.22);
    doc.roundedRect(badgeX + 2, badgeY + 2, badgeSize, badgeSize, radius).fill();
    doc.restore();

    // Weisse Plakette - knapp am Logo
    doc.save();
    doc.fillColor('#ffffff').opacity(1);
    doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, radius).fill();
    doc.restore();

    // Logo zentriert in der Plakette
    doc.image(LOGO_PATH, badgeX + pad, badgeY + pad, {
      fit: [logoSize, logoSize],
      align: 'center',
      valign: 'center'
    });
  } catch (_) { /* logo optional */ }

  // App-Name rechts neben Logo
  const textX = PAGE_MARGIN + 86;
  doc.fillColor(COLORS.headerText)
     .font('Helvetica-Bold').fontSize(18)
     .text('Spießbuch', textX, 28, { lineBreak: false });
  doc.font('Helvetica').fontSize(10).fillColor('#d1fae5')
     .text('Strafenverwaltung', textX, 52, { lineBreak: false });

  // Datum rechts
  const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.font('Helvetica').fontSize(9).fillColor('#d1fae5')
     .text(`Erstellt am ${dateStr}`, 0, 38, { width: pageW - PAGE_MARGIN, align: 'right' });

  // Reset
  doc.fillColor(COLORS.text);
}

function drawDocHeader(doc, title, subtitle) {
  drawPageChrome(doc);
  doc.y = doc.page.margins.top;

  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(22)
     .text(title, PAGE_MARGIN, doc.y, { width: doc.page.width - PAGE_MARGIN * 2 });
  if (subtitle) {
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(11).fillColor(COLORS.muted)
       .text(subtitle, { width: doc.page.width - PAGE_MARGIN * 2 });
  }
  doc.moveDown(0.7);
}

function drawSummaryBox(doc, cells) {
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;
  const height = 56;
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, height, 8).fillAndStroke(COLORS.subtleBg, COLORS.border);
  doc.restore();

  const cellW = width / cells.length;
  cells.forEach((cell, i) => {
    const cx = x + i * cellW;
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
       .text(cell.label.toUpperCase(), cx + 12, y + 10, { width: cellW - 16, characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(cell.highlight ? 16 : 13)
       .fillColor(COLORS.text)
       .text(String(cell.value || '—'), cx + 12, y + 24, { width: cellW - 16, lineBreak: false, ellipsis: true });

    // Trenner zwischen Zellen
    if (i > 0) {
      doc.save();
      doc.moveTo(cx, y + 10).lineTo(cx, y + height - 10)
         .lineWidth(0.5).strokeColor(COLORS.border).stroke();
      doc.restore();
    }
  });

  doc.y = y + height + 14;
  doc.fillColor(COLORS.text);
}

function drawMemberHeading(doc, name, count, subtotal) {
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;
  const y = doc.y;
  const h = 30;

  // Dezenter hellgruener Block - verschmilzt mit Tabellenkopf zu einer Einheit
  doc.save();
  doc.rect(x, y, width, h).fill(COLORS.accentDark);
  doc.restore();

  // Mitgliedsname links
  doc.fillColor(COLORS.accentDarkText).font('Helvetica-Bold').fontSize(13)
     .text(name, x + 12, y + 9, { width: width - 24 - 180, lineBreak: false, ellipsis: true });

  // Anzahl + Summe rechts
  const right = `${count} Eintrag${count === 1 ? '' : 'e'}  ·  ${formatEuro(subtotal)}`;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.accentDarkText)
     .text(right, x, y + 11, { width: width - 12, align: 'right', lineBreak: false });

  // KEIN Abstand zur Tabelle - sie sitzt direkt darunter und gehoert sichtbar zusammen
  doc.y = y + h;
  doc.fillColor(COLORS.text);
}

function drawGrandTotal(doc, total) {
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;
  const y = doc.y;
  const h = 38;

  doc.save();
  doc.roundedRect(x, y, width, h, 8).fill(COLORS.totalBg);
  doc.restore();

  doc.fillColor(COLORS.totalText).font('Helvetica-Bold').fontSize(12)
     .text('Gesamtbetrag', x + 16, y + 13, { width: width / 2, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(16)
     .text(formatEuro(total), x, y + 10, { width: width - 16, align: 'right', lineBreak: false });

  doc.y = y + h + 6;
  doc.fillColor(COLORS.text);
}

function drawZugsauBox(doc, top) {
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;
  const y = doc.y + 4;
  const h = 30;

  // Kompakter Streifen (etwas heller als Gesamtbetrag, damit unterscheidbar)
  doc.save();
  doc.roundedRect(x, y, width, h, 6).fill('#475569');
  doc.restore();

  // Label links
  doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(9)
     .text('Zugsau', x + 14, y + 11, { characterSpacing: 0.8, lineBreak: false });

  // Name + Details rechts
  const info = `${top.name}  ·  ${top.count} Eintrag${top.count === 1 ? '' : 'e'}  ·  ${formatEuro(top.sum)}`;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
     .text(info, x, y + 10, { width: width - 14, align: 'right', lineBreak: false, ellipsis: true });

  doc.y = y + h + 4;
  doc.fillColor(COLORS.text);
}

function formatEuro(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function finalizeDoc(doc) {
  // Footer mit Seitenzahl auf allen Seiten zeichnen
  try {
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      const pageW = doc.page.width;
      const footerY = doc.page.height - 38;

      doc.save();
      doc.moveTo(PAGE_MARGIN, footerY).lineTo(pageW - PAGE_MARGIN, footerY)
         .lineWidth(0.5).strokeColor(COLORS.border).stroke();
      doc.restore();

      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
         .text('Spießbuch · Strafenexport', PAGE_MARGIN, footerY + 8, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
         .text(`Seite ${i + 1} von ${total}`, 0, footerY + 8, { width: pageW - PAGE_MARGIN, align: 'right', lineBreak: false });
    }
  } catch (_) { /* ignore */ }
  doc.end();
}

// ───── Tabellen‐Renderer ──────────────────────────────────────────────────
function getTextHeight(doc, text, width, options = {}) {
  const savedY = doc.y;
  const h      = doc.heightOfString(text, { width, ...options });
  doc.y = savedY;
  return h;
}

function drawTable(doc, rows, columns) {
  const cellPadX = 6;
  const cellPadY = 5;
  const minRowHeight = 22;
  const tableX = PAGE_MARGIN;
  // Inhalts-Breite exakt wie Mitglied-/Gesamtbetrag-/Zugsau-Streifen
  const totalW = doc.page.width - PAGE_MARGIN * 2;

  // Spalten proportional auf totalW skalieren, damit Tabelle genauso breit ist
  const rawSum = columns.reduce((a, c) => a + c.width, 0) || 1;
  columns = columns.map(c => ({ ...c, width: (c.width / rawSum) * totalW }));

  // Spalten-Startpositionen
  const colX = [tableX];
  columns.forEach(col => colX.push(colX[colX.length - 1] + col.width));

  function drawHeader(y) {
    doc.save();
    doc.rect(tableX, y, totalW, minRowHeight).fill(COLORS.accent);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.accentText);
    columns.forEach((col, i) => {
      doc.text(col.label, colX[i] + cellPadX, y + cellPadY, {
        width: col.width - cellPadX * 2,
        align: col.align || 'left',
        lineBreak: false
      });
    });
    doc.fillColor(COLORS.text);
    return y + minRowHeight;
  }

  function formatCell(col, raw) {
    if (raw === null || raw === undefined || raw === '') return '—';
    if (col.prop === 'date')   return new Date(raw).toLocaleDateString('de-DE');
    if (col.prop === 'amount') return formatEuro(raw);
    return String(raw);
  }

  let y = doc.y;
  y = drawHeader(y);

  doc.font('Helvetica').fontSize(10);

  rows.forEach((r, i) => {
    // Zeilenhöhe berechnen
    const cellHeights = columns.map(col => {
      const val = formatCell(col, r[col.prop]);
      return getTextHeight(doc, val, col.width - cellPadX * 2) + cellPadY * 2;
    });
    const rowH = Math.max(minRowHeight, ...cellHeights);

    // Seitenumbruch?
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 10) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
      doc.font('Helvetica').fontSize(10);
    }

    // Zebra
    if (i % 2 === 0) {
      doc.save();
      doc.rect(tableX, y, totalW, rowH).fill(COLORS.zebra);
      doc.restore();
    }

    columns.forEach((col, j) => {
      const val = formatCell(col, r[col.prop]);
      const isAmount = col.prop === 'amount';
      doc.font(isAmount ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
         .fillColor(COLORS.text)
         .text(val, colX[j] + cellPadX, y + cellPadY, {
            width: col.width - cellPadX * 2,
            align: col.align || 'left'
         });
    });

    // dünne Trennlinie unten
    doc.save();
    doc.moveTo(tableX, y + rowH).lineTo(tableX + totalW, y + rowH)
       .lineWidth(0.3).strokeColor(COLORS.border).stroke();
    doc.restore();

    y += rowH;
  });

  doc.y = y + 4;
}

module.exports = router;
