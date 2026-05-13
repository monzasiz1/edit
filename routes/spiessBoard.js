const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const KATALOG_PATH = path.join(__dirname, '../public/strafenkatalog.pdf');

const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../public')),
    filename: (_req, _file, cb) => cb(null, 'strafenkatalog.pdf')
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Nur PDF-Dateien erlaubt'));
  }
}).single('katalog_pdf');

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.is_admin) return next();
  return res.status(403).send('Nur Spieße!');
}

function parseEuro(value) {
  if (value === undefined || value === null) return NaN;
  const normalized = String(value).replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function readRankingBlurEnabledSetting() {
  const settingResult = await db.query(
    `SELECT value FROM app_settings WHERE key = 'ranking_blur_enabled' LIMIT 1`
  );

  if (settingResult.rowCount === 0) {
    return true;
  }

  return [true, 1, '1', 'true', 'on'].includes(settingResult.rows[0].value);
}

router.get('/', requireAdmin, async (req, res) => {
  try {
    const rankingBlurEnabled = await readRankingBlurEnabledSetting();
    const penaltiesCatalog = (await db.query(
      `
        SELECT id, label, amount_under18, amount_over18, is_active, sort_order
        FROM penalty_catalog
        ORDER BY sort_order ASC, label ASC
      `
    )).rows;

    penaltiesCatalog.forEach(item => {
      item.amount_under18 = Number(item.amount_under18);
      item.amount_over18 = Number(item.amount_over18);
    });

    const eventCatalog = (await db.query(
      `SELECT id, label, sort_order, is_active FROM event_catalog ORDER BY sort_order ASC, label ASC`
    )).rows;

    const editId = Number.parseInt(req.query.edit, 10);
    const editCatalogItem = Number.isInteger(editId)
      ? penaltiesCatalog.find(item => item.id === editId) || null
      : null;

    const editEventId = Number.parseInt(req.query.edit_event, 10);
    const editEventItem = Number.isInteger(editEventId)
      ? eventCatalog.find(item => item.id === editEventId) || null
      : null;

    res.render('spiess_board', {
      title: 'Spießboard',
      path: '/spiess-board',
      rankingBlurEnabled,
      penaltiesCatalog,
      editCatalogItem,
      eventCatalog,
      editEventItem,
      strafenkatalogExists: fs.existsSync(KATALOG_PATH),
      saved: req.query.saved === '1',
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Fehler beim Laden der Board-Einstellungen:', err);
    res.status(500).send('Server Error');
  }
});

router.post('/ranking-visibility', requireAdmin, async (req, res) => {
  try {
    const rankingBlurEnabled = req.body.ranking_blur_enabled === 'on' ? 'true' : 'false';

    await db.query(
      `
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('ranking_blur_enabled', $1, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [rankingBlurEnabled]
    );

    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error('Fehler beim Speichern der Board-Einstellungen:', err);
    res.status(500).send('Server Error');
  }
});

router.post('/penalty-catalog', requireAdmin, async (req, res) => {
  try {
    const label = (req.body.label || '').trim();
    const amountUnder18 = parseEuro(req.body.amount_under18);
    const amountOver18 = parseEuro(req.body.amount_over18);
    const sortOrder = Number.parseInt(req.body.sort_order, 10) || 0;
    const isActive = req.body.is_active === 'on';

    if (!label || !Number.isFinite(amountUnder18) || !Number.isFinite(amountOver18)) {
      return res.redirect(`/spiess-board?error=${encodeURIComponent('Bitte gültige Katalogdaten eintragen')}`);
    }

    await db.query(
      `
        INSERT INTO penalty_catalog (label, amount_under18, amount_over18, is_active, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (label)
        DO UPDATE SET
          amount_under18 = EXCLUDED.amount_under18,
          amount_over18 = EXCLUDED.amount_over18,
          is_active = EXCLUDED.is_active,
          sort_order = EXCLUDED.sort_order
      `,
      [label, amountUnder18, amountOver18, isActive, sortOrder]
    );

    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error('Fehler beim Speichern des Strafenkatalogs:', err);
    res.status(500).send('Server Error');
  }
});

router.post('/penalty-catalog/:id/edit', requireAdmin, async (req, res) => {
  try {
    const penaltyId = Number.parseInt(req.params.id, 10);
    const label = (req.body.label || '').trim();
    const amountUnder18 = parseEuro(req.body.amount_under18);
    const amountOver18 = parseEuro(req.body.amount_over18);
    const sortOrder = Number.parseInt(req.body.sort_order, 10) || 0;
    const isActive = req.body.is_active === 'on';

    if (!Number.isInteger(penaltyId) || !label || !Number.isFinite(amountUnder18) || !Number.isFinite(amountOver18)) {
      return res.redirect(`/spiess-board?error=${encodeURIComponent('Bitte gültige Katalogdaten eintragen')}`);
    }

    await db.query(
      `
        UPDATE penalty_catalog
        SET label = $1,
            amount_under18 = $2,
            amount_over18 = $3,
            is_active = $4,
            sort_order = $5
        WHERE id = $6
      `,
      [label, amountUnder18, amountOver18, isActive, sortOrder, penaltyId]
    );

    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error('Fehler beim Bearbeiten des Strafenkatalogs:', err);
    res.status(500).send('Server Error');
  }
});

router.post('/penalty-catalog/:id/toggle', requireAdmin, async (req, res) => {
  try {
    await db.query(
      `UPDATE penalty_catalog SET is_active = NOT is_active WHERE id = $1`,
      [req.params.id]
    );
    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error('Fehler beim Umschalten des Katalogeintrags:', err);
    res.status(500).send('Server Error');
  }
});

router.post('/penalty-catalog/:id/delete', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM penalty_catalog WHERE id = $1', [req.params.id]);
    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error('Fehler beim Löschen des Katalogeintrags:', err);
    res.status(500).send('Server Error');
  }
});

// ---- Event-Katalog ----
router.post('/event-catalog', requireAdmin, async (req, res) => {
  try {
    const label = (req.body.label || '').trim();
    const sortOrder = Number.parseInt(req.body.sort_order, 10) || 0;
    if (!label) return res.redirect(`/spiess-board?error=${encodeURIComponent('Bezeichnung fehlt')}`);
    await db.query(
      `INSERT INTO event_catalog (label, sort_order) VALUES ($1, $2) ON CONFLICT (label) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [label, sortOrder]
    );
    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/event-catalog/:id/edit', requireAdmin, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const label = (req.body.label || '').trim();
    const sortOrder = Number.parseInt(req.body.sort_order, 10) || 0;
    if (!label) return res.redirect(`/spiess-board?error=${encodeURIComponent('Bezeichnung fehlt')}`);
    await db.query(
      `UPDATE event_catalog SET label = $1, sort_order = $2 WHERE id = $3`,
      [label, sortOrder, id]
    );
    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/event-catalog/:id/delete', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM event_catalog WHERE id = $1', [req.params.id]);
    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/strafenkatalog-upload', requireAdmin, (req, res) => {
  pdfUpload(req, res, (err) => {
    if (err) {
      return res.redirect(`/spiess-board?error=${encodeURIComponent(err.message || 'Upload fehlgeschlagen')}`);
    }
    if (!req.file) {
      return res.redirect(`/spiess-board?error=${encodeURIComponent('Keine Datei ausgewählt')}`);
    }
    res.redirect('/spiess-board?saved=1');
  });
});

router.post('/strafenkatalog-delete', requireAdmin, (req, res) => {
  try {
    if (fs.existsSync(KATALOG_PATH)) {
      fs.unlinkSync(KATALOG_PATH);
    }
    res.redirect('/spiess-board?saved=1');
  } catch (err) {
    console.error('Fehler beim Löschen des Strafenkatalogs:', err);
    res.redirect(`/spiess-board?error=${encodeURIComponent('Löschen fehlgeschlagen')}`);
  }
});

module.exports = router;
