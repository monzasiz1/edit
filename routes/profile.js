const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { getIconSvg, getIconEmoji } = require('./_equipment_icons');
const { BODY_PART_LABELS, mapEquipmentToBodyParts } = require('./_equipment_slots');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer Konfiguration für Avatar Upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + req.session.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilddateien sind erlaubt!'), false);
    }
  }
});

// Profilseite
router.get('/', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  try {
    const userId = req.session.user.id;

    // User Stats laden
    const statsQuery = `
      SELECT
        COUNT(p.id) as penalties,
        COUNT(DISTINCT p.event) as events,
        COALESCE(SUM(p.amount), 0) as amount
      FROM penalties p
      WHERE p.user_id = $1
    `;
    const statsResult = await pool.query(statsQuery, [userId]);
    const userStats = statsResult.rows[0];

    // Zugewiesenes Equipment laden
    const equipmentQuery = `
      SELECT
        e.id, e.name, e.description, e.condition,
        COALESCE(NULLIF(ea.serial_number, ''), e.serial_number) AS serial_number,
        ec.name AS category_name, ec.icon AS category_icon,
        ea.assigned_at, ea.quantity, ea.notes
      FROM equipment_assignments ea
      JOIN equipment e ON ea.equipment_id = e.id
      LEFT JOIN equipment_categories ec ON e.category_id = ec.id
      WHERE ea.user_id = $1 AND ea.returned_at IS NULL
      ORDER BY ea.assigned_at DESC
    `;
    const equipmentResult = await pool.query(equipmentQuery, [userId]);
    const assignedEquipment = equipmentResult.rows.map(item => ({
      ...item,
      category_icon_svg: getIconSvg(item.category_icon),
      category_icon_emoji: getIconEmoji(item.category_icon),
    }));

    // Rollen des Users laden
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_admin, r.is_board
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
      ORDER BY r.is_admin DESC, r.is_board DESC, r.name ASC
    `;
    const rolesResult = await pool.query(rolesQuery, [userId]);
    const userRoles = rolesResult.rows;

    // Letzte Aktivitäten laden
    const activitiesQuery = `
      SELECT
        'Strafe erhalten' as text,
        TO_CHAR(created_at, 'DD.MM.YYYY HH24:MI') as time
      FROM penalties
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `;
    const activitiesResult = await pool.query(activitiesQuery, [userId]);
    const recentActivities = activitiesResult.rows;

    res.render('profil', {
      user: req.session.user,
      userStats: userStats,
      assignedEquipment: assignedEquipment,
      equipmentSlots: mapEquipmentToBodyParts(assignedEquipment),
      bodyPartLabels: BODY_PART_LABELS,
      userRoles: userRoles,
      recentActivities: recentActivities,
      nameMsg: null,
      nameErr: null,
      pwMsg: null,
      pwErr: null,
      avatarMsg: null,
      avatarErr: null
    });
  } catch (err) {
    console.error('Fehler beim Laden der Profil-Daten:', err);
    res.render('profil', {
      user: req.session.user,
      userStats: { penalties: 0, events: 0, amount: 0 },
      assignedEquipment: [],
      equipmentSlots: mapEquipmentToBodyParts([]),
      bodyPartLabels: BODY_PART_LABELS,
      userRoles: [],
      recentActivities: [],
      nameMsg: null,
      nameErr: null,
      pwMsg: null,
      pwErr: null,
      avatarMsg: null,
      avatarErr: null
    });
  }
});

// Avatar Upload
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  try {
    if (!req.file) {
      return res.redirect('/profil');
    }

    const avatarPath = '/uploads/avatars/' + req.file.filename;

    // Alten Avatar löschen falls vorhanden
    if (req.session.user.avatar) {
      const oldAvatarPath = path.join(__dirname, '../public', req.session.user.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Avatar in DB speichern
    await pool.query('UPDATE users SET avatar=$1 WHERE id=$2', [avatarPath, req.session.user.id]);

    // Session updaten
    req.session.user.avatar = avatarPath;
    await new Promise(r => req.session.save(r));

    res.redirect('/profil');
  } catch (err) {
    console.error('Avatar Upload Fehler:', err);
    res.redirect('/profil');
  }
});

// Name ändern
router.post('/name', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const neuerName = (req.body.name || '').trim();
  if (!neuerName) {
    return res.redirect('/profil');
  }
  try {
    await pool.query('UPDATE users SET username=$1 WHERE id=$2', [neuerName, req.session.user.id]);
    // Session updaten
    req.session.user.username = neuerName;
    await new Promise(r => req.session.save(r));
    res.redirect('/profil');
  } catch (err) {
    console.error(err);
    res.redirect('/profil');
  }
});

// Passwort ändern
router.post('/passwort', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { oldpw, newpw } = req.body;
  if (!oldpw || !newpw) {
    return res.redirect('/profil');
  }
  try {
    const { rows } = await pool.query('SELECT password FROM users WHERE id=$1', [req.session.user.id]);
    if (!rows[0] || !await bcrypt.compare(oldpw, rows[0].password)) {
      return res.redirect('/profil');
    }
    const hash = await bcrypt.hash(newpw, 10);
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, req.session.user.id]);
    await new Promise(r => req.session.save(r));
    res.redirect('/profil');
  } catch (err) {
    console.error(err);
    res.redirect('/profil');
  }
});

module.exports = router;
