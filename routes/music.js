const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/music');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `music-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF-, Bild- oder Audio-Dateien sind erlaubt!'), false);
    }
  }
});

router.get('/', requireLogin, async (req, res) => {
  try {
    const selectedInstrument = (req.query.instrument || '').trim();
    const selectedPart = (req.query.part || '').trim();

    const passwordSetting = await db.query(`
      SELECT value FROM app_settings WHERE key = 'music_password_hash' LIMIT 1
    `);
    const hasPassword = passwordSetting.rows.length > 0 && passwordSetting.rows[0].value;

    if (!req.session.user.is_admin && !req.session.musicAccess) {
      return res.render('music_auth', {
        user: req.session.user,
        title: 'Notenbereich gesperrt',
        path: '/music',
        messageError: req.query.error || null,
        hasPassword
      });
    }

    const filters = [];
    const params = [];

    if (selectedInstrument) {
      params.push(selectedInstrument);
      filters.push(`mp.instrument = $${params.length}`);
    }
    if (selectedPart) {
      params.push(selectedPart);
      filters.push(`mp.part = $${params.length}`);
    }

    const piecesResult = await db.query(`
      SELECT mp.*, u.username AS uploaded_by_name
      FROM music_pieces mp
      LEFT JOIN users u ON mp.uploaded_by = u.id
      ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
      ORDER BY COALESCE(mp.instrument, 'ZZZ') ASC, LOWER(mp.title) ASC, LOWER(mp.composer) ASC
    `, params);

    res.render('music', {
      user: req.session.user,
      title: 'Notenverwaltung',
      path: '/music',
      pieces: piecesResult.rows,
      selectedInstrument,
      selectedPart,
      hasPassword,
      messageSuccess: req.query.success || null,
      messageError: req.query.error || null
    });
  } catch (err) {
    console.error('Fehler beim Laden der Noten:', err);
    res.render('music', {
      user: req.session.user,
      title: 'Notenverwaltung',
      path: '/music',
      pieces: [],
      messageSuccess: null,
      messageError: 'Fehler beim Laden der Noten.'
    });
  }
});

router.post('/upload', requireLogin, upload.single('scoreFile'), async (req, res) => {
  const title = (req.body.title || '').trim();
  const composer = (req.body.composer || '').trim();
  const description = (req.body.description || '').trim();
  const instrument = (req.body.instrument || '').trim();
  const part = (req.body.part || '').trim();

  if (!title) {
    return res.redirect('/music?error=' + encodeURIComponent('Titel darf nicht leer sein.'));
  }

  if (!req.file) {
    return res.redirect('/music?error=' + encodeURIComponent('Bitte lade eine Datei hoch.'));
  }

  try {
    const dbPath = `/uploads/music/${req.file.filename}`;
    await db.query(
      `INSERT INTO music_pieces (title, composer, description, instrument, part, filename, original_name, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [title, composer || null, description || null, instrument || null, part || null, dbPath, req.file.originalname, req.session.user.id]
    );

    res.redirect('/music?success=' + encodeURIComponent('Stück erfolgreich hochgeladen.'));
  } catch (err) {
    console.error('Fehler beim Speichern der Noten:', err);
    res.redirect('/music?error=' + encodeURIComponent('Fehler beim Speichern der Datei.'));
  }
});

router.post('/unlock', requireLogin, async (req, res) => {
  const password = (req.body.password || '').trim();
  if (!password) {
    return res.redirect('/music?error=' + encodeURIComponent('Bitte Passwort eingeben.'));
  }

  try {
    const setting = await db.query(`
      SELECT value FROM app_settings WHERE key = 'music_password_hash' LIMIT 1
    `);
    if (!setting.rows.length || !setting.rows[0].value) {
      return res.redirect('/music?error=' + encodeURIComponent('Passwort ist noch nicht gesetzt.'));
    }

    const valid = await bcrypt.compare(password, setting.rows[0].value);
    if (!valid) {
      return res.redirect('/music?error=' + encodeURIComponent('Falsches Passwort.'));
    }

    req.session.musicAccess = true;
    await new Promise((resolve) => req.session.save(resolve));
    res.redirect('/music');
  } catch (err) {
    console.error('Fehler beim Prüfen des Musik-Passworts:', err);
    res.redirect('/music?error=' + encodeURIComponent('Fehler beim Prüfen des Passworts.'));
  }
});

router.post('/password', requireLogin, async (req, res) => {
  if (!req.session.user.is_admin) {
    return res.status(403).send('Zugriff verweigert');
  }

  const newPassword = (req.body.newPassword || '').trim();
  if (!newPassword) {
    return res.redirect('/music?error=' + encodeURIComponent('Neues Passwort darf nicht leer sein.'));
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query(`
      INSERT INTO app_settings (key, value)
      VALUES ('music_password_hash', $1)
      ON CONFLICT (key) DO UPDATE SET value = $1
    `, [hash]);

    req.session.musicAccess = true;
    await new Promise((resolve) => req.session.save(resolve));
    res.redirect('/music?success=' + encodeURIComponent('Passwort wurde gespeichert.'));
  } catch (err) {
    console.error('Fehler beim Speichern des Musik-Passworts:', err);
    res.redirect('/music?error=' + encodeURIComponent('Passwort konnte nicht gespeichert werden.'));
  }
});

module.exports = router;
