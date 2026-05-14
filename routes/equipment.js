const express = require('express');
const router = express.Router();
const db = require('../db');
const { EQUIPMENT_ICONS, getIconSvg, getIconEmoji } = require('./_equipment_icons');
const { BODY_PART_LABELS, mapEquipmentToBodyParts } = require('./_equipment_slots');

function decorateCategory(cat) {
  if (!cat) return cat;
  return { ...cat, icon_svg: getIconSvg(cat.icon), icon_emoji: getIconEmoji(cat.icon) };
}

// Pfad in res.locals exponieren (für aktive Nav + bedingtes Laden von /dev-center.css im Layout)
router.use((req, res, next) => {
  res.locals.path = req.baseUrl + req.path;
  next();
});

// ── Berechtigungsprüfung ──────────────────────────────────────────
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

async function requireEquipmentAccess(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.is_admin) return next();
  if (
    (await userHasPerm(req.session.user.id, 'can_manage_equipment')) ||
    (await userHasPerm(req.session.user.id, 'can_assign_equipment'))
  ) return next();
  res.status(403).send('Keine Berechtigung');
}

async function requireEquipmentManage(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.is_admin) return next();
  if (await userHasPerm(req.session.user.id, 'can_manage_equipment')) return next();
  res.status(403).send('Keine Berechtigung');
}

// ===== EQUIPMENT ÜBERSICHT =====
router.get('/', requireEquipmentAccess, async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || '';

    let query = `
      SELECT e.*,
             ec.name AS category_name, ec.icon AS category_icon,
             (SELECT COUNT(*) FROM equipment_assignments WHERE equipment_id = e.id AND returned_at IS NULL) AS assigned_count
      FROM equipment e
      LEFT JOIN equipment_categories ec ON e.category_id = ec.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (e.name ILIKE $${params.length + 1} OR e.description ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    if (category) {
      query += ` AND e.category_id = $${params.length + 1}`;
      params.push(category);
    }
    query += ` ORDER BY e.name ASC`;

    const equipmentResult = await db.query(query, params);

    const categoriesResult = await db.query(
      `SELECT * FROM equipment_categories ORDER BY name ASC`
    );

    const assignmentsListResult = await db.query(`
      SELECT
        ea.equipment_id,
        ea.quantity,
        ea.serial_number AS assignment_serial,
        ea.user_id,
        ea.holder_id,
        u.username, u.full_name,
        h.name AS holder_name, h.holder_type
      FROM equipment_assignments ea
      LEFT JOIN users u ON ea.user_id = u.id
      LEFT JOIN equipment_holders h ON ea.holder_id = h.id
      JOIN equipment e ON ea.equipment_id = e.id
      WHERE ea.returned_at IS NULL
      ORDER BY ea.assigned_at DESC
    `);

    const assignmentsByEquipment = new Map();
    assignmentsListResult.rows.forEach(row => {
      if (!assignmentsByEquipment.has(row.equipment_id)) {
        assignmentsByEquipment.set(row.equipment_id, []);
      }
      const isHolder = !!row.holder_id;
      assignmentsByEquipment.get(row.equipment_id).push({
        kind: isHolder ? 'holder' : 'user',
        name: isHolder ? row.holder_name : (row.full_name || row.username),
        type: isHolder ? (row.holder_type || 'other') : 'user',
        quantity: row.quantity,
        serial_number: row.assignment_serial || null,
      });
    });

    const equipmentRows = equipmentResult.rows.map(item => ({
      ...item,
      category_icon_svg: getIconSvg(item.category_icon),
      category_icon_emoji: getIconEmoji(item.category_icon),
      assignments: assignmentsByEquipment.get(item.id) || [],
    }));

    const userAssignmentsResult = await db.query(`
      SELECT
        u.id AS user_id, u.username, u.full_name,
        e.id AS equipment_id, e.name, e.description, e.condition,
        COALESCE(NULLIF(ea.serial_number, ''), e.serial_number) AS serial_number,
        ec.name AS category_name, ec.icon AS category_icon,
        ea.assigned_at, ea.quantity, ea.notes
      FROM equipment_assignments ea
      JOIN users u ON ea.user_id = u.id
      JOIN equipment e ON ea.equipment_id = e.id
      LEFT JOIN equipment_categories ec ON e.category_id = ec.id
      WHERE ea.returned_at IS NULL
      ORDER BY COALESCE(u.full_name, u.username) ASC, ea.assigned_at DESC
    `);

    const usersMap = new Map();
    userAssignmentsResult.rows.forEach(row => {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          id: row.user_id,
          username: row.username,
          full_name: row.full_name,
          items: [],
        });
      }
      usersMap.get(row.user_id).items.push({
        id: row.equipment_id,
        name: row.name,
        description: row.description,
        serial_number: row.serial_number,
        condition: row.condition,
        quantity: row.quantity,
        notes: row.notes,
        assigned_at: row.assigned_at,
        category_name: row.category_name,
        category_icon: row.category_icon,
        category_icon_svg: getIconSvg(row.category_icon),
      });
    });

    const usersWithEquipment = Array.from(usersMap.values()).map(u => {
      const slots = mapEquipmentToBodyParts(u.items);
      const itemSlot = new Map();
      Object.entries(slots).forEach(([slot, items]) => {
        items.forEach(it => itemSlot.set(it.id, slot));
      });
      const itemsWithSlot = u.items.map(it => ({ ...it, slot: itemSlot.get(it.id) || 'other' }));
      return { ...u, items: itemsWithSlot, slots, count: u.items.length };
    });

    const holderAssignmentsResult = await db.query(`
      SELECT
        h.id AS holder_id, h.name AS holder_name, h.holder_type,
        e.id AS equipment_id, e.name, e.description, e.condition,
        COALESCE(NULLIF(ea.serial_number, ''), e.serial_number) AS serial_number,
        ec.name AS category_name, ec.icon AS category_icon,
        ea.assigned_at, ea.quantity, ea.notes
      FROM equipment_assignments ea
      JOIN equipment_holders h ON ea.holder_id = h.id
      JOIN equipment e ON ea.equipment_id = e.id
      LEFT JOIN equipment_categories ec ON e.category_id = ec.id
      WHERE ea.returned_at IS NULL
      ORDER BY h.name ASC, ea.assigned_at DESC
    `);

    const holdersMap = new Map();
    holderAssignmentsResult.rows.forEach(row => {
      if (!holdersMap.has(row.holder_id)) {
        holdersMap.set(row.holder_id, {
          id: row.holder_id,
          name: row.holder_name,
          holder_type: row.holder_type || 'other',
          items: [],
        });
      }
      holdersMap.get(row.holder_id).items.push({
        id: row.equipment_id,
        name: row.name,
        description: row.description,
        serial_number: row.serial_number,
        condition: row.condition,
        quantity: row.quantity,
        notes: row.notes,
        assigned_at: row.assigned_at,
        category_name: row.category_name,
        category_icon: row.category_icon,
        category_icon_svg: getIconSvg(row.category_icon),
      });
    });
    const holdersWithEquipment = Array.from(holdersMap.values()).map(h => ({
      ...h, count: h.items.length,
    }));

    res.render('equipment', {
      layout: 'layout',
      equipment: equipmentRows,
      categories: categoriesResult.rows.map(decorateCategory),
      usersWithEquipment,
      holdersWithEquipment,
      bodyPartLabels: BODY_PART_LABELS,
      search,
      selectedCategory: category,
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ===== LOOKUP (QR / Seriennummer) =====
router.get('/lookup', requireEquipmentAccess, async (req, res) => {
  try {
    const raw = (req.query.code || '').toString().trim();
    if (!raw) return res.status(400).json({ error: 'no_code' });
    if (raw.length > 300) return res.status(400).json({ error: 'too_long' });

    let foundId = null;

    const urlMatch = raw.match(/\/equipment\/(\d+)/);
    if (urlMatch) {
      const r = await db.query('SELECT id FROM equipment WHERE id = $1', [urlMatch[1]]);
      if (r.rows[0]) foundId = r.rows[0].id;
    }
    // Reine Zahl: zuerst als Seriennummer exakt suchen, dann als interne ID (höchst unüblich, dass die ID zur Seriennummer passt)
    if (!foundId && /^\d+$/.test(raw)) {
      const r = await db.query(
        `SELECT e.id FROM equipment e
         WHERE LOWER(e.serial_number) = LOWER($1)
            OR EXISTS (
              SELECT 1 FROM equipment_assignments ea
              WHERE ea.equipment_id = e.id
                AND LOWER(ea.serial_number) = LOWER($1)
            )
         LIMIT 1`,
        [raw]
      );
      if (r.rows[0]) foundId = r.rows[0].id;
    }
    if (!foundId && /^\d+$/.test(raw)) {
      const r = await db.query('SELECT id FROM equipment WHERE id = $1', [raw]);
      if (r.rows[0]) foundId = r.rows[0].id;
    }
    if (!foundId) {
      const r = await db.query(
        `SELECT e.id FROM equipment e
         WHERE LOWER(e.serial_number) = LOWER($1)
            OR EXISTS (
              SELECT 1 FROM equipment_assignments ea
              WHERE ea.equipment_id = e.id
                AND LOWER(ea.serial_number) = LOWER($1)
            )
         LIMIT 1`,
        [raw]
      );
      if (r.rows[0]) foundId = r.rows[0].id;
    }
    // Nur-Ziffern-Variante (z.B. EAN-Check-Digit strippen / Code-128 mit Trennzeichen)
    if (!foundId) {
      const digits = raw.replace(/\D+/g, '');
      if (digits && digits !== raw && digits.length >= 4) {
        const r = await db.query(
          `SELECT e.id FROM equipment e
           WHERE regexp_replace(COALESCE(e.serial_number, ''), '\\D', '', 'g') = $1
              OR LOWER(e.serial_number) = LOWER($2)
              OR EXISTS (
                SELECT 1 FROM equipment_assignments ea
                WHERE ea.equipment_id = e.id
                  AND (
                    regexp_replace(COALESCE(ea.serial_number, ''), '\\D', '', 'g') = $1
                    OR LOWER(ea.serial_number) = LOWER($2)
                  )
              )
           LIMIT 2`,
          [digits, digits]
        );
        if (r.rows.length === 1) foundId = r.rows[0].id;
      }
    }
    if (!foundId) {
      const r = await db.query(
        `SELECT e.id FROM equipment e
         WHERE e.serial_number ILIKE $1 OR e.name ILIKE $1
            OR EXISTS (
              SELECT 1 FROM equipment_assignments ea
              WHERE ea.equipment_id = e.id
                AND ea.serial_number ILIKE $1
            )
         LIMIT 2`,
        [`%${raw}%`]
      );
      if (r.rows.length === 1) foundId = r.rows[0].id;
    }

    if (!foundId) return res.status(404).json({ error: 'not_found', code: raw });

    res.json({
      id: foundId,
      assignUrl: `/equipment/${foundId}/assign`,
      editUrl: `/equipment/${foundId}/edit`,
    });
  } catch (err) {
    console.error('equipment lookup error', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ===== KATEGORIEN =====
router.get('/categories', requireEquipmentManage, async (req, res) => {
  try {
    const categoriesResult = await db.query(`
      SELECT ec.*,
             (SELECT COUNT(*) FROM equipment WHERE category_id = ec.id) AS equipment_count
      FROM equipment_categories ec
      ORDER BY ec.name ASC
    `);
    res.render('equipment_categories', {
      layout: 'layout',
      categories: categoriesResult.rows.map(decorateCategory),
      availableIcons: EQUIPMENT_ICONS,
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/categories/add', requireEquipmentManage, async (req, res) => {
  try {
    const { name, icon } = req.body;
    const iconKey = (icon && String(icon).trim()) || 'box';
    await db.query(
      `INSERT INTO equipment_categories (name, icon) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [name, iconKey]
    );
    res.redirect('/equipment/categories?success=Kategorie erstellt');
  } catch (err) {
    console.error(err);
    res.redirect('/equipment/categories?error=Fehler');
  }
});

router.post('/categories/:id/delete', requireEquipmentManage, async (req, res) => {
  try {
    const checkResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM equipment WHERE category_id = $1`,
      [req.params.id]
    );
    if (parseInt(checkResult.rows[0].cnt) > 0) {
      return res.redirect('/equipment/categories?error=Kategorie wird noch verwendet');
    }
    await db.query(`DELETE FROM equipment_categories WHERE id = $1`, [req.params.id]);
    res.redirect('/equipment/categories?success=Kategorie gelöscht');
  } catch (err) {
    console.error(err);
    res.redirect('/equipment/categories?error=Fehler');
  }
});

// ===== ADD =====
router.get('/add', requireEquipmentManage, async (req, res) => {
  try {
    const categoriesResult = await db.query(
      `SELECT * FROM equipment_categories ORDER BY name ASC`
    );
    res.render('equipment_add', {
      layout: 'layout',
      categories: categoriesResult.rows.map(decorateCategory)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/add', requireEquipmentManage, async (req, res) => {
  try {
    const { name, category_id, description, serial_number, condition, quantity, notes } = req.body;
    await db.query(
      `INSERT INTO equipment (category_id, name, description, serial_number, condition, quantity, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [category_id || null, name, description, serial_number, condition, quantity || 1, notes]
    );
    res.redirect('/equipment?success=Equipment hinzugefügt');
  } catch (err) {
    console.error(err);
    res.redirect('/equipment/add?error=Fehler');
  }
});

// ===== EDIT =====
router.get('/:id/edit', requireEquipmentManage, async (req, res) => {
  try {
    const equipmentResult = await db.query(
      `SELECT * FROM equipment WHERE id = $1`, [req.params.id]
    );
    if (equipmentResult.rows.length === 0) return res.status(404).send('Equipment nicht gefunden');

    const categoriesResult = await db.query(
      `SELECT * FROM equipment_categories ORDER BY name ASC`
    );

    res.render('equipment_edit', {
      layout: 'layout',
      equipment: equipmentResult.rows[0],
      categories: categoriesResult.rows.map(decorateCategory)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/:id/edit', requireEquipmentManage, async (req, res) => {
  try {
    const { name, category_id, description, serial_number, condition, quantity, notes } = req.body;
    await db.query(
      `UPDATE equipment SET
         category_id = $1, name = $2, description = $3,
         serial_number = $4, condition = $5, quantity = $6, notes = $7
       WHERE id = $8`,
      [category_id || null, name, description, serial_number, condition, quantity, notes, req.params.id]
    );
    res.redirect('/equipment?success=Equipment aktualisiert');
  } catch (err) {
    console.error(err);
    res.redirect(`/equipment/${req.params.id}/edit?error=Fehler`);
  }
});

router.post('/:id/delete', requireEquipmentManage, async (req, res) => {
  try {
    await db.query(`DELETE FROM equipment WHERE id = $1`, [req.params.id]);
    res.redirect('/equipment?success=Equipment gelöscht');
  } catch (err) {
    console.error(err);
    res.redirect('/equipment?error=Fehler beim Löschen');
  }
});

// ===== ASSIGN =====
router.get('/:id/assign', requireEquipmentAccess, async (req, res) => {
  try {
    const equipmentResult = await db.query(`SELECT * FROM equipment WHERE id = $1`, [req.params.id]);
    if (equipmentResult.rows.length === 0) return res.status(404).send('Equipment nicht gefunden');

    const membersResult = await db.query(
      `SELECT id, username, full_name FROM users ORDER BY COALESCE(full_name, username) ASC`
    );
    const holdersResult = await db.query(
      `SELECT id, name, holder_type FROM equipment_holders ORDER BY name ASC`
    );
    const assignmentsResult = await db.query(`
      SELECT ea.*,
             u.username, u.full_name,
             h.name AS holder_name, h.holder_type
      FROM equipment_assignments ea
      LEFT JOIN users u ON ea.user_id = u.id
      LEFT JOIN equipment_holders h ON ea.holder_id = h.id
      WHERE ea.equipment_id = $1 AND ea.returned_at IS NULL
      ORDER BY ea.assigned_at DESC
    `, [req.params.id]);

    res.render('equipment_assign', {
      layout: 'layout',
      equipment: equipmentResult.rows[0],
      members: membersResult.rows,
      holders: holdersResult.rows,
      assignments: assignmentsResult.rows,
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/:id/assign', requireEquipmentAccess, async (req, res) => {
  try {
    const { target, quantity, notes, serial_number } = req.body;
    const assignedBy = req.session.user.id;
    const serialClean = (serial_number || '').toString().trim().slice(0, 100) || null;

    if (!target || typeof target !== 'string' || !target.includes(':')) {
      return res.redirect(`/equipment/${req.params.id}/assign?error=Ziel%20fehlt`);
    }
    const [kind, rawId] = target.split(':');
    const targetId = parseInt(rawId, 10);
    if (!Number.isInteger(targetId)) {
      return res.redirect(`/equipment/${req.params.id}/assign?error=Ung%C3%BCltiges%20Ziel`);
    }

    let userId = null;
    let holderId = null;

    if (kind === 'user') {
      const check = await db.query(`SELECT 1 FROM users WHERE id = $1`, [targetId]);
      if (check.rows.length === 0) {
        return res.redirect(`/equipment/${req.params.id}/assign?error=Mitglied%20unbekannt`);
      }
      userId = targetId;
    } else if (kind === 'holder') {
      const check = await db.query(`SELECT 1 FROM equipment_holders WHERE id = $1`, [targetId]);
      if (check.rows.length === 0) {
        return res.redirect(`/equipment/${req.params.id}/assign?error=Lagerort%20unbekannt`);
      }
      holderId = targetId;
    } else {
      return res.redirect(`/equipment/${req.params.id}/assign?error=Ung%C3%BCltiges%20Ziel`);
    }

    await db.query(
      `INSERT INTO equipment_assignments (equipment_id, user_id, holder_id, assigned_by, quantity, notes, serial_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, userId, holderId, assignedBy, quantity || 1, notes, serialClean]
    );
    res.redirect(`/equipment/${req.params.id}/assign?success=Zugewiesen`);
  } catch (err) {
    console.error(err);
    res.redirect(`/equipment/${req.params.id}/assign?error=Fehler`);
  }
});

// ===== LAGERORT INLINE ANLEGEN =====
router.post('/:id/assign/holder', requireEquipmentAccess, async (req, res) => {
  try {
    const equipmentId = req.params.id;
    const name = (req.body.name || '').trim();
    const holderType = (req.body.holder_type || 'place').trim();
    const allowedTypes = ['place', 'vehicle', 'external', 'other'];
    const safeType = allowedTypes.includes(holderType) ? holderType : 'other';

    if (!name) return res.redirect(`/equipment/${equipmentId}/assign?error=Name%20fehlt`);
    if (name.length > 150) return res.redirect(`/equipment/${equipmentId}/assign?error=Name%20zu%20lang`);

    await db.query(
      `INSERT INTO equipment_holders (name, holder_type) VALUES ($1, $2)`,
      [name, safeType]
    );
    res.redirect(`/equipment/${equipmentId}/assign?success=Lagerort%20angelegt`);
  } catch (err) {
    console.error(err);
    res.redirect(`/equipment/${req.params.id}/assign?error=Fehler`);
  }
});

// ===== RÜCKGABE =====
router.post('/assignment/:id/return', requireEquipmentAccess, async (req, res) => {
  try {
    await db.query(`UPDATE equipment_assignments SET returned_at = NOW() WHERE id = $1`, [req.params.id]);
    const assignmentResult = await db.query(
      `SELECT equipment_id FROM equipment_assignments WHERE id = $1`,
      [req.params.id]
    );
    const equipmentId = assignmentResult.rows[0]?.equipment_id;
    res.redirect(`/equipment/${equipmentId}/assign?success=Zurückgegeben`);
  } catch (err) {
    console.error(err);
    res.redirect('/equipment?error=Fehler');
  }
});

// ===== ZUWEISUNG BEARBEITEN =====
router.post('/assignment/:id/edit', requireEquipmentAccess, async (req, res) => {
  try {
    const { serial_number, quantity, notes } = req.body;
    const serialClean = (serial_number || '').toString().trim().slice(0, 100) || null;
    const qty = parseInt(quantity, 10);
    const safeQty = Number.isInteger(qty) && qty > 0 ? qty : 1;
    const notesClean = (notes || '').toString().slice(0, 2000);

    const r = await db.query(
      `UPDATE equipment_assignments
         SET serial_number = $1, quantity = $2, notes = $3
       WHERE id = $4
       RETURNING equipment_id`,
      [serialClean, safeQty, notesClean, req.params.id]
    );
    const equipmentId = r.rows[0]?.equipment_id;
    if (!equipmentId) return res.redirect('/equipment?error=Zuweisung%20nicht%20gefunden');
    res.redirect(`/equipment/${equipmentId}/assign?success=Zuweisung%20aktualisiert`);
  } catch (err) {
    console.error(err);
    res.redirect('/equipment?error=Fehler');
  }
});

module.exports = router;
