const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const musicUploadDir = path.resolve(__dirname, '../public/uploads/music');
if (!fs.existsSync(musicUploadDir)) {
  fs.mkdirSync(musicUploadDir, { recursive: true });
}

const instrumentPartsMap = {
  Flöten: ['', 'Sopran 1', 'Sopran 2', 'Sopran 3', 'Altflöte'],
  Trommeln: [''],
  Lyra: ['', 'Sopran 1', 'Sopran 2', 'Sopran 3', 'Altflöte', 'Tenor', 'Bass'],
  Andere: ['']
};

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, musicUploadDir);
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

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.redirect('/music?error=' + encodeURIComponent('Zugriff verweigert.'));
  }
  next();
}

router.get('/', requireLogin, async (req, res) => {
  try {
    const selectedInstrument = (req.query.instrument || '').trim();
    const selectedPart = (req.query.part || '').trim();
    const selectedSearch = (req.query.search || '').trim();

    const instrumentPartsMap = {
      Flöten: ['', 'Sopran 1', 'Sopran 2', 'Sopran 3', 'Altflöte'],
      Trommeln: [''],
      Lyra: ['', 'Sopran 1', 'Sopran 2', 'Sopran 3', 'Altflöte', 'Tenor', 'Bass'],
      Andere: ['']
    };

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

    if (!selectedInstrument) {
      const countsResult = await db.query(`
        SELECT COALESCE(instrument, 'Andere') AS instrument, COUNT(*) AS count
        FROM music_pieces
        GROUP BY COALESCE(instrument, 'Andere')
      `);

      const instrumentCounts = {
        all: 0,
        Flöten: 0,
        Trommeln: 0,
        Lyra: 0,
        Andere: 0
      };
      countsResult.rows.forEach(row => {
        const count = parseInt(row.count, 10);
        instrumentCounts[row.instrument] = (instrumentCounts[row.instrument] || 0) + count;
        instrumentCounts.all += count;
      });

      return res.render('music', {
        user: req.session.user,
        title: 'Notenverwaltung',
        path: '/music',
        showInstrumentHome: true,
        instrumentCounts,
        hasPassword,
        selectedSearch: selectedSearch,
        messageSuccess: req.query.success || null,
        messageError: req.query.error || null
      });
    }

    const filters = [];
    const params = [];

    params.push(selectedInstrument);
    filters.push(`mp.instrument = $${params.length}`);

    if (selectedPart) {
      params.push(selectedPart);
      filters.push(`mp.part = $${params.length}`);
    }

    if (selectedSearch) {
      params.push(`%${selectedSearch}%`);
      filters.push(`LOWER(mp.title) LIKE LOWER($${params.length})`);
    }

    const piecesResult = await db.query(`
      SELECT mp.*, u.username AS uploaded_by_name
      FROM music_pieces mp
      LEFT JOIN users u ON mp.uploaded_by = u.id
      WHERE ${filters.join(' AND ')}
      ORDER BY LOWER(mp.part) ASC, LOWER(mp.title) ASC, LOWER(mp.composer) ASC
    `, params);

    res.render('music', {
      user: req.session.user,
      title: 'Notenverwaltung',
      path: '/music',
      pieces: piecesResult.rows,
      selectedInstrument,
      selectedPart,
      selectedSearch,
      availableParts: instrumentPartsMap[selectedInstrument] || [''],
      showPartTabs: (instrumentPartsMap[selectedInstrument] || []).length > 1,
      showInstrumentHome: false,
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
      showInstrumentHome: false,
      selectedSearch: '',
      showPartTabs: false,
      messageSuccess: null,
      messageError: 'Fehler beim Laden der Noten.'
    });
  }
});

router.get('/file/:filename', requireLogin, async (req, res) => {
  const filename = path.basename(req.params.filename || '');
  const filePath = path.resolve(musicUploadDir, filename);
  const relative = path.relative(musicUploadDir, filePath);

  if (!filename || filename.includes('..') || relative.startsWith('..') || path.basename(filename) !== filename) {
    return res.status(400).send('Ungültiger Dateiname');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.error('Musikdatei nicht gefunden:', filePath, err && err.code);
      return res.status(404).render('404', { title: 'Datei nicht gefunden', path: '/music' });
    }

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(filePath, (sendErr) => {
      if (sendErr) {
        console.error('Fehler beim Senden der Musikdatei:', sendErr);
        if (!res.headersSent) {
          res.status(500).render('404', { title: 'Datei nicht gefunden', path: '/music' });
        }
      }
    });
  });
});

function userCanManagePiece(req, piece) {
  return req.session.user && (req.session.user.is_admin || piece.uploaded_by === req.session.user.id);
}

router.get('/edit/:id', requireLogin, async (req, res) => {
  const pieceId = parseInt(req.params.id, 10);
  if (Number.isNaN(pieceId)) {
    return res.redirect('/music?error=' + encodeURIComponent('Ungültige Stück-ID.'));
  }

  try {
    const pieceResult = await db.query(`
      SELECT mp.*, u.username AS uploaded_by_name
      FROM music_pieces mp
      LEFT JOIN users u ON mp.uploaded_by = u.id
      WHERE mp.id = $1
    `, [pieceId]);

    if (!pieceResult.rows.length) {
      return res.redirect('/music?error=' + encodeURIComponent('Stück nicht gefunden.'));
    }

    const piece = pieceResult.rows[0];
    if (!userCanManagePiece(req, piece)) {
      return res.redirect('/music?error=' + encodeURIComponent('Zugriff verweigert.'));
    }

    const hasPassword = (await db.query(`SELECT value FROM app_settings WHERE key = 'music_password_hash' LIMIT 1`)).rows.length > 0;
    if (!req.session.user.is_admin && !req.session.musicAccess) {
      return res.render('music_auth', {
        user: req.session.user,
        title: 'Notenbereich gesperrt',
        path: '/music',
        messageError: req.query.error || null,
        hasPassword
      });
    }

    res.render('music_edit', {
      user: req.session.user,
      title: 'Stück bearbeiten',
      path: '/music/edit/' + piece.id,
      piece,
      availableParts: instrumentPartsMap[piece.instrument] || [''],
      messageSuccess: req.query.success || null,
      messageError: req.query.error || null
    });
  } catch (err) {
    console.error('Fehler beim Laden der Stück-Bearbeitung:', err);
    res.redirect('/music?error=' + encodeURIComponent('Fehler beim Laden des Stücks.'));
  }
});

router.post('/edit/:id', requireLogin, upload.none(), async (req, res) => {
  const pieceId = parseInt(req.params.id, 10);
  if (Number.isNaN(pieceId)) {
    return res.redirect('/music?error=' + encodeURIComponent('Ungültige Stück-ID.'));
  }

  const title = (req.body.title || '').trim();
  const composer = (req.body.composer || '').trim();
  const description = (req.body.description || '').trim();
  const part = (req.body.part || '').trim();

  if (!title) {
    return res.redirect('/music/edit/' + pieceId + '?error=' + encodeURIComponent('Titel darf nicht leer sein.'));
  }

  try {
    const pieceResult = await db.query(`SELECT uploaded_by, instrument FROM music_pieces WHERE id = $1`, [pieceId]);
    if (!pieceResult.rows.length) {
      return res.redirect('/music?error=' + encodeURIComponent('Stück nicht gefunden.'));
    }

    const piece = pieceResult.rows[0];
    if (!userCanManagePiece(req, piece)) {
      return res.redirect('/music?error=' + encodeURIComponent('Zugriff verweigert.'));
    }

    await db.query(`
      UPDATE music_pieces
      SET title = $1, composer = $2, description = $3, part = $4
      WHERE id = $5
    `, [title, composer || null, description || null, part || null, pieceId]);

    res.redirect('/music?success=' + encodeURIComponent('Stück erfolgreich aktualisiert.'));
  } catch (err) {
    console.error('Fehler beim Bearbeiten der Stück:', err);
    res.redirect('/music/edit/' + pieceId + '?error=' + encodeURIComponent('Fehler beim Speichern der Änderungen.'));
  }
});

router.post('/delete/:id', requireLogin, async (req, res) => {
  const pieceId = parseInt(req.params.id, 10);
  if (Number.isNaN(pieceId)) {
    return res.redirect('/music?error=' + encodeURIComponent('Ungültige Stück-ID.'));
  }

  try {
    const pieceResult = await db.query(`SELECT filename, uploaded_by FROM music_pieces WHERE id = $1`, [pieceId]);
    if (!pieceResult.rows.length) {
      return res.redirect('/music?error=' + encodeURIComponent('Stück nicht gefunden.'));
    }

    const piece = pieceResult.rows[0];
    if (!userCanManagePiece(req, piece)) {
      return res.redirect('/music?error=' + encodeURIComponent('Zugriff verweigert.'));
    }

    const filename = path.basename(piece.filename);
    const filePath = path.join(musicUploadDir, filename);
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr && unlinkErr.code !== 'ENOENT') {
        console.error('Fehler beim Löschen der Musikdatei:', filePath, unlinkErr);
      }
    });

    await db.query(`DELETE FROM music_pieces WHERE id = $1`, [pieceId]);
    res.redirect('/music?success=' + encodeURIComponent('Stück erfolgreich gelöscht.'));
  } catch (err) {
    console.error('Fehler beim Löschen der Stück:', err);
    res.redirect('/music?error=' + encodeURIComponent('Fehler beim Löschen des Stücks.'));
  }
});

router.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  try {
    const passwordSetting = await db.query(`
      SELECT value FROM app_settings WHERE key = 'music_password_hash' LIMIT 1
    `);
    const hasPassword = passwordSetting.rows.length > 0 && passwordSetting.rows[0].value;

    res.render('music_admin', {
      user: req.session.user,
      title: 'Noten-Admin',
      path: '/music/admin',
      hasPassword,
      messageSuccess: req.query.success || null,
      messageError: req.query.error || null
    });
  } catch (err) {
    console.error('Fehler beim Laden des Admin-Panels:', err);
    res.render('music_admin', {
      user: req.session.user,
      title: 'Noten-Admin',
      path: '/music/admin',
      hasPassword: false,
      messageSuccess: null,
      messageError: 'Fehler beim Laden des Admin-Bereichs.'
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
    const redirectTarget = req.query.from === 'admin' ? '/music/admin' : '/music';
    return res.redirect(redirectTarget + '?error=' + encodeURIComponent('Neues Passwort darf nicht leer sein.'));
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
    const redirectTarget = req.query.from === 'admin' ? '/music/admin' : '/music';
    res.redirect(redirectTarget + '?success=' + encodeURIComponent('Passwort wurde gespeichert.'));
  } catch (err) {
    console.error('Fehler beim Speichern des Musik-Passworts:', err);
    const redirectTarget = req.query.from === 'admin' ? '/music/admin' : '/music';
    res.redirect(redirectTarget + '?error=' + encodeURIComponent('Passwort konnte nicht gespeichert werden.'));
  }
});

module.exports = router;
