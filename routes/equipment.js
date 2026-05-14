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

    // Statistik fuer Zeugwart-Bereich (eintragsbasiert, matcht die Cards)
    const totalEntries = equipmentRows.length;
    const assignedEntries = equipmentRows.filter(e => (e.assignments || []).length > 0).length;
    const freeEntries = totalEntries - assignedEntries;
    // Stueckzahlen (Summe quantity)
    const totalPieces = equipmentRows.reduce((sum, e) => sum + (parseInt(e.quantity, 10) || 0), 0);
    const assignedPieces = assignmentsListResult.rows.reduce(
      (sum, a) => sum + (parseInt(a.quantity, 10) || 0), 0
    );
    const categoriesCount = categoriesResult.rows.length;
    const membersWithEquipment = usersWithEquipment.length;
    const holdersInUse = holdersWithEquipment.length;
    const equipmentStats = {
      totalEntries,
      assignedEntries,
      freeEntries,
      totalPieces,
      assignedPieces,
      categoriesCount,
      membersWithEquipment,
      holdersInUse,
    };

    // Inbox: offene Anfragen (Defekt-Meldungen, Rueckgabe-Anmeldungen) und Langzeit-Ausgaben
    let inboxRequests = [];
    let longOutCount = 0;
    let inboxCounts = { defect: 0, return: 0, longOut: 0, total: 0 };
    try {
      const reqRes = await db.query(`
        SELECT er.id, er.type, er.note, er.created_at,
               e.id AS equipment_id, e.name AS equipment_name,
               COALESCE(NULLIF(ea.serial_number, ''), e.serial_number) AS serial_number,
               u.id AS user_id, u.username, u.full_name
          FROM equipment_requests er
          LEFT JOIN equipment e ON er.equipment_id = e.id
          LEFT JOIN equipment_assignments ea ON er.assignment_id = ea.id
          LEFT JOIN users u ON er.user_id = u.id
         WHERE er.status = 'open'
         ORDER BY er.created_at DESC
         LIMIT 50
      `);
      inboxRequests = reqRes.rows;
      const longOutRes = await db.query(`
        SELECT COUNT(*)::int AS c
          FROM equipment_assignments
         WHERE returned_at IS NULL
           AND assigned_at < NOW() - INTERVAL '90 days'
      `);
      longOutCount = longOutRes.rows[0]?.c || 0;
      inboxCounts.defect = inboxRequests.filter(r => r.type === 'defect').length;
      inboxCounts.return = inboxRequests.filter(r => r.type === 'return').length;
      inboxCounts.longOut = longOutCount;
      inboxCounts.total = inboxCounts.defect + inboxCounts.return + inboxCounts.longOut;
    } catch (e) {
      console.warn('[equipment] Inbox konnte nicht geladen werden:', e.message);
    }

    res.render('equipment', {
      layout: 'layout',
      equipment: equipmentRows,
      categories: categoriesResult.rows.map(decorateCategory),
      usersWithEquipment,
      holdersWithEquipment,
      bodyPartLabels: BODY_PART_LABELS,
      equipmentStats,
      inboxRequests,
      inboxCounts,
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

// ===== EQUIPMENT-REQUESTS (Defekt / Rueckgabe-Anmeldung) =====
// Jeder eingeloggte Nutzer darf eigene Requests anlegen (fuer Teile die ihm zugewiesen sind).
router.post('/request', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const userId = req.session.user.id;
    const type = (req.body.type || '').toString();
    if (!['defect', 'return'].includes(type)) {
      return res.redirect('/profil?error=Ungültiger%20Anfragetyp');
    }
    const assignmentId = parseInt(req.body.assignment_id, 10);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.redirect('/profil?error=Zuweisung%20fehlt');
    }
    const note = (req.body.note || '').toString().slice(0, 1000);

    // Pruefen: gehoert die Zuweisung dem User und ist noch aktiv?
    const a = await db.query(
      `SELECT id, equipment_id, user_id FROM equipment_assignments
        WHERE id = $1 AND returned_at IS NULL`,
      [assignmentId]
    );
    const row = a.rows[0];
    if (!row) return res.redirect('/profil?error=Zuweisung%20nicht%20gefunden');
    const isAdmin = req.session.user.is_admin;
    const canManage = await userHasPerm(userId, 'can_manage_equipment');
    if (row.user_id !== userId && !isAdmin && !canManage) {
      return res.redirect('/profil?error=Keine%20Berechtigung');
    }

    // Doppelte offene Anfrage gleichen Typs vermeiden
    const dup = await db.query(
      `SELECT id FROM equipment_requests
        WHERE assignment_id = $1 AND type = $2 AND status = 'open'
        LIMIT 1`,
      [assignmentId, type]
    );
    if (dup.rows.length) {
      return res.redirect('/profil?success=Anfrage%20liegt%20bereits%20vor');
    }

    await db.query(
      `INSERT INTO equipment_requests
         (equipment_id, assignment_id, user_id, type, status, note)
       VALUES ($1, $2, $3, $4, 'open', $5)`,
      [row.equipment_id, assignmentId, userId, type, note]
    );
    const msg = type === 'defect' ? 'Defekt%20gemeldet' : 'Rückgabe%20angemeldet';
    res.redirect('/profil?success=' + msg);
  } catch (err) {
    console.error('[equipment/request]', err);
    res.redirect('/profil?error=Fehler');
  }
});

// Zeugwart: Anfrage erledigen / ablehnen
router.post('/request/:id/resolve', requireEquipmentAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const action = (req.body.action || 'done').toString(); // 'done' | 'reject'
    const status = action === 'reject' ? 'rejected' : 'done';
    const resolutionNote = (req.body.resolution_note || '').toString().slice(0, 1000);

    // Anfrage holen, ggf. Rueckgabe automatisch durchfuehren
    const r = await db.query(
      `SELECT type, assignment_id FROM equipment_requests WHERE id = $1`,
      [id]
    );
    const reqRow = r.rows[0];
    if (!reqRow) return res.redirect('/equipment?error=Anfrage%20nicht%20gefunden');

    if (status === 'done' && reqRow.type === 'return' && reqRow.assignment_id) {
      await db.query(
        `UPDATE equipment_assignments
            SET returned_at = NOW()
          WHERE id = $1 AND returned_at IS NULL`,
        [reqRow.assignment_id]
      );
    }

    await db.query(
      `UPDATE equipment_requests
          SET status = $1,
              resolved_at = NOW(),
              resolved_by = $2,
              resolution_note = $3
        WHERE id = $4`,
      [status, req.session.user.id, resolutionNote, id]
    );

    res.redirect('/equipment?success=Anfrage%20erledigt#inbox');
  } catch (err) {
    console.error('[equipment/request/resolve]', err);
    res.redirect('/equipment?error=Fehler');
  }
});

// ===== ZEUGWART TO-DO LISTE (JSON API) =====
function todoToPayload(row, items = [], users = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    priority: row.priority || 'normal',
    due_date: row.due_date,
    done: !!row.done,
    done_at: row.done_at,
    created_at: row.created_at,
    created_by_name: row.created_by_full_name || row.created_by_username || null,
    done_by_name: row.done_by_full_name || row.done_by_username || null,
    items,
    users
  };
}

async function loadTodoLinks(todoId) {
  const it = await db.query(`
    SELECT e.id, e.name, e.serial_number
      FROM equipment_todo_items ti
      JOIN equipment e ON ti.equipment_id = e.id
     WHERE ti.todo_id = $1
     ORDER BY e.name
  `, [todoId]);
  const us = await db.query(`
    SELECT u.id, u.username, u.full_name
      FROM equipment_todo_users tu
      JOIN users u ON tu.user_id = u.id
     WHERE tu.todo_id = $1
     ORDER BY COALESCE(u.full_name, u.username)
  `, [todoId]);
  return { items: it.rows, users: us.rows };
}

function parseIdList(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return Array.from(new Set(
    arr.map(v => parseInt(v, 10)).filter(Number.isInteger)
  ));
}

// Eigene Seite: Zeugwart-To-do-Liste
router.get('/todos', requireEquipmentAccess, async (req, res) => {
  try {
    let todos = [];
    let allEquipmentForTodos = [];
    let allUsersForTodos = [];
    try {
      const tRes = await db.query(`
        SELECT t.id, t.title, t.description, t.priority, t.due_date,
               t.done, t.done_at, t.created_at,
               cu.username AS created_by_username, cu.full_name AS created_by_full_name,
               du.username AS done_by_username,    du.full_name AS done_by_full_name
          FROM equipment_todos t
          LEFT JOIN users cu ON t.created_by = cu.id
          LEFT JOIN users du ON t.done_by    = du.id
         ORDER BY t.done ASC,
                  CASE t.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                  t.due_date NULLS LAST,
                  t.created_at DESC
         LIMIT 500
      `);
      todos = tRes.rows;
      todos.forEach(t => {
        t.created_by_name = t.created_by_full_name || t.created_by_username || '';
        t.done_by_name    = t.done_by_full_name    || t.done_by_username    || '';
      });
      if (todos.length) {
        const ids = todos.map(t => t.id);
        const linkItems = await db.query(`
          SELECT ti.todo_id, e.id, e.name, e.serial_number
            FROM equipment_todo_items ti
            JOIN equipment e ON ti.equipment_id = e.id
           WHERE ti.todo_id = ANY($1::int[])
           ORDER BY e.name
        `, [ids]);
        const linkUsers = await db.query(`
          SELECT tu.todo_id, u.id, u.username, u.full_name
            FROM equipment_todo_users tu
            JOIN users u ON tu.user_id = u.id
           WHERE tu.todo_id = ANY($1::int[])
           ORDER BY COALESCE(u.full_name, u.username)
        `, [ids]);
        const itemsByTodo = {};
        linkItems.rows.forEach(r => {
          (itemsByTodo[r.todo_id] = itemsByTodo[r.todo_id] || []).push({ id: r.id, name: r.name, serial_number: r.serial_number });
        });
        const usersByTodo = {};
        linkUsers.rows.forEach(r => {
          (usersByTodo[r.todo_id] = usersByTodo[r.todo_id] || []).push({ id: r.id, username: r.username, full_name: r.full_name });
        });
        todos.forEach(t => {
          t.items = itemsByTodo[t.id] || [];
          t.users = usersByTodo[t.id] || [];
        });
      }
      const allEqRes = await db.query(`SELECT id, name, serial_number FROM equipment ORDER BY name`);
      allEquipmentForTodos = allEqRes.rows;
      const allUsRes = await db.query(`
        SELECT id, username, full_name FROM users ORDER BY COALESCE(full_name, username)
      `);
      allUsersForTodos = allUsRes.rows;
    } catch (e) {
      console.warn('[equipment/todos] Laden fehlgeschlagen:', e.message);
    }

    res.render('equipment_todos', {
      layout: 'layout',
      todos,
      allEquipmentForTodos,
      allUsersForTodos,
      path: '/equipment/todos',
      success: req.query.success,
      error: req.query.error
    });
  } catch (err) {
    console.error('[equipment/todos:list]', err);
    res.status(500).send('Server Error');
  }
});

// Neue To-do anlegen
router.post('/todos', requireEquipmentAccess, async (req, res) => {
  try {
    const title = (req.body.title || '').toString().trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'title_required' });
    const description = (req.body.description || '').toString().slice(0, 2000);
    let priority = (req.body.priority || 'normal').toString();
    if (!['low', 'normal', 'high'].includes(priority)) priority = 'normal';
    const dueDate = (req.body.due_date || '').toString().trim() || null;
    const equipmentIds = parseIdList(req.body.equipment_ids);
    const userIds = parseIdList(req.body.user_ids);

    const ins = await db.query(`
      INSERT INTO equipment_todos (title, description, priority, due_date, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, description, priority, due_date, done, done_at, created_at
    `, [title, description, priority, dueDate, req.session.user.id]);
    const todo = ins.rows[0];

    if (equipmentIds.length) {
      const values = equipmentIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(
        `INSERT INTO equipment_todo_items (todo_id, equipment_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [todo.id, ...equipmentIds]
      );
    }
    if (userIds.length) {
      const values = userIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(
        `INSERT INTO equipment_todo_users (todo_id, user_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [todo.id, ...userIds]
      );
    }
    const links = await loadTodoLinks(todo.id);
    res.json({ ok: true, todo: todoToPayload(todo, links.items, links.users) });
  } catch (err) {
    console.error('[equipment/todos:create]', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// To-do bearbeiten (Titel, Beschreibung, Priorit., Faelligkeit, Verknuepfungen)
router.post('/todos/:id/edit', requireEquipmentAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
    const title = (req.body.title || '').toString().trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'title_required' });
    const description = (req.body.description || '').toString().slice(0, 2000);
    let priority = (req.body.priority || 'normal').toString();
    if (!['low', 'normal', 'high'].includes(priority)) priority = 'normal';
    const dueDate = (req.body.due_date || '').toString().trim() || null;
    const equipmentIds = parseIdList(req.body.equipment_ids);
    const userIds = parseIdList(req.body.user_ids);

    const upd = await db.query(`
      UPDATE equipment_todos
         SET title = $1, description = $2, priority = $3, due_date = $4
       WHERE id = $5
       RETURNING id, title, description, priority, due_date, done, done_at, created_at
    `, [title, description, priority, dueDate, id]);
    if (!upd.rows.length) return res.status(404).json({ error: 'not_found' });

    await db.query(`DELETE FROM equipment_todo_items WHERE todo_id = $1`, [id]);
    await db.query(`DELETE FROM equipment_todo_users WHERE todo_id = $1`, [id]);
    if (equipmentIds.length) {
      const values = equipmentIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(
        `INSERT INTO equipment_todo_items (todo_id, equipment_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [id, ...equipmentIds]
      );
    }
    if (userIds.length) {
      const values = userIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await db.query(
        `INSERT INTO equipment_todo_users (todo_id, user_id) VALUES ${values}
         ON CONFLICT DO NOTHING`,
        [id, ...userIds]
      );
    }
    const links = await loadTodoLinks(id);
    res.json({ ok: true, todo: todoToPayload(upd.rows[0], links.items, links.users) });
  } catch (err) {
    console.error('[equipment/todos:edit]', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// To-do erledigt/offen umschalten
router.post('/todos/:id/toggle', requireEquipmentAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
    const cur = await db.query(`SELECT done FROM equipment_todos WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'not_found' });
    const newDone = !cur.rows[0].done;
    const userId = req.session.user && req.session.user.id ? req.session.user.id : null;
    await db.query(`
      UPDATE equipment_todos
         SET done = $1,
             done_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
             done_by = CASE WHEN $1 THEN $2 ELSE NULL END
       WHERE id = $3
    `, [newDone, userId, id]);
    res.json({ ok: true, done: newDone });
  } catch (err) {
    console.error('[equipment/todos:toggle]', err);
    res.status(500).json({ error: 'server_error', message: String(err && err.message || err), code: err && err.code });
  }
});

// To-do loeschen
router.post('/todos/:id/delete', requireEquipmentAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
    await db.query(`DELETE FROM equipment_todos WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[equipment/todos:delete]', err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
