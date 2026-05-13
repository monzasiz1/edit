const express = require('express');
const router = express.Router();
const db = require('../db');

// Pfad in res.locals exponieren (für aktive Nav + bedingtes Laden von /dev-center.css im Layout)
router.use((req, res, next) => {
  res.locals.path = req.baseUrl + req.path;
  next();
});

async function userHasPerm(userId, column) {
  const r = await db.query(
    `SELECT 1 FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1 AND r.${column} = TRUE
     LIMIT 1`,
    [userId]
  );
  return r.rows.length > 0;
}

async function requireRoleManagement(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.is_admin) return next();
  if (await userHasPerm(req.session.user.id, 'can_manage_roles')) return next();
  res.status(403).send('Keine Berechtigung');
}

// ===== ÜBERSICHT =====
router.get('/', requireRoleManagement, async (req, res) => {
  try {
    const rolesResult = await db.query(`
      SELECT r.*,
             (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) AS member_count
      FROM roles r
      ORDER BY r.is_admin DESC, r.is_board DESC, r.name ASC
    `);
    res.render('roles', {
      layout: 'layout',
      roles: rolesResult.rows,
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/add', requireRoleManagement, async (req, res) => {
  res.render('roles_add', { layout: 'layout' });
});

router.post('/add', requireRoleManagement, async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const perms = Array.isArray(permissions) ? permissions : (permissions ? [permissions] : []);
    await db.query(`
      INSERT INTO roles (
        name, description,
        can_manage_members, can_manage_penalties, can_view_all_penalties,
        can_manage_equipment, can_assign_equipment, can_manage_roles,
        is_board, is_admin
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (name) DO NOTHING
    `, [
      name, description,
      perms.includes('can_manage_members'),
      perms.includes('can_manage_penalties'),
      perms.includes('can_view_all_penalties'),
      perms.includes('can_manage_equipment'),
      perms.includes('can_assign_equipment'),
      perms.includes('can_manage_roles'),
      perms.includes('is_board'),
      perms.includes('is_admin')
    ]);
    res.redirect('/roles?success=Rolle erstellt');
  } catch (err) {
    console.error(err);
    res.redirect('/roles/add?error=Fehler beim Erstellen');
  }
});

router.get('/:id/edit', requireRoleManagement, async (req, res) => {
  try {
    const roleResult = await db.query(`SELECT * FROM roles WHERE id = $1`, [req.params.id]);
    if (roleResult.rows.length === 0) return res.status(404).send('Rolle nicht gefunden');
    res.render('roles_edit', { layout: 'layout', role: roleResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/:id/edit', requireRoleManagement, async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const perms = Array.isArray(permissions) ? permissions : (permissions ? [permissions] : []);
    await db.query(`
      UPDATE roles SET
        name = $1, description = $2,
        can_manage_members = $3, can_manage_penalties = $4, can_view_all_penalties = $5,
        can_manage_equipment = $6, can_assign_equipment = $7, can_manage_roles = $8,
        is_board = $9, is_admin = $10
      WHERE id = $11
    `, [
      name, description,
      perms.includes('can_manage_members'),
      perms.includes('can_manage_penalties'),
      perms.includes('can_view_all_penalties'),
      perms.includes('can_manage_equipment'),
      perms.includes('can_assign_equipment'),
      perms.includes('can_manage_roles'),
      perms.includes('is_board'),
      perms.includes('is_admin'),
      req.params.id
    ]);
    res.redirect('/roles?success=Rolle aktualisiert');
  } catch (err) {
    console.error(err);
    res.redirect(`/roles/${req.params.id}/edit?error=Fehler`);
  }
});

router.post('/:id/delete', requireRoleManagement, async (req, res) => {
  try {
    const checkResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM user_roles WHERE role_id = $1`,
      [req.params.id]
    );
    if (parseInt(checkResult.rows[0].cnt) > 0) {
      return res.redirect('/roles?error=Rolle wird noch verwendet');
    }
    await db.query(`DELETE FROM roles WHERE id = $1`, [req.params.id]);
    res.redirect('/roles?success=Rolle gelöscht');
  } catch (err) {
    console.error(err);
    res.redirect('/roles?error=Fehler beim Löschen');
  }
});

router.post('/assign', requireRoleManagement, async (req, res) => {
  try {
    const { user_id, role_id } = req.body;
    const roleCheck = await db.query(`SELECT id FROM roles WHERE id = $1`, [role_id]);
    if (roleCheck.rows.length === 0) return res.status(403).send('Ungültige Rolle');
    await db.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [user_id, role_id]
    );
    res.redirect(`/users/${user_id}/edit?success=Rolle zugewiesen`);
  } catch (err) {
    console.error(err);
    res.redirect('/users?error=Fehler');
  }
});

router.post('/unassign', requireRoleManagement, async (req, res) => {
  try {
    const { user_id, role_id } = req.body;
    await db.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [user_id, role_id]);
    res.redirect(`/users/${user_id}/edit?success=Rolle entfernt`);
  } catch (err) {
    console.error(err);
    res.redirect('/users?error=Fehler');
  }
});

module.exports = router;
