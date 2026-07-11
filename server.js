require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const db = require('./db');
const webPush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';

async function ensureDatabaseSchema() {
  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_board BOOLEAN DEFAULT FALSE
  `);

  // Idempotente Migration: Multi-Tenant -> Single-Tenant.
  // Entfernt club_id-Spalten und ersetzt UNIQUE(club_id, name) durch UNIQUE(name).
  await db.query(`
    DO $$
    DECLARE
      r record;
    BEGIN
      -- 1) FKs auf clubs in betroffenen Tabellen droppen + club_id-Spalten entfernen
      FOR r IN
        SELECT tbl FROM (VALUES
          ('roles'),
          ('equipment_categories'),
          ('penalty_catalog'),
          ('event_catalog'),
          ('equipment'),
          ('equipment_holders'),
          ('user_roles')
        ) AS t(tbl)
      LOOP
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=r.tbl AND column_name='club_id'
        ) THEN
          -- Bei Tabellen mit UNIQUE(club_id, name): erst Duplikate per name entfernen,
          -- damit der nachfolgende UNIQUE(name) erzeugbar ist.
          IF r.tbl IN ('roles','equipment_categories') THEN
            EXECUTE format($q$
              DELETE FROM %1$I a USING %1$I b
              WHERE a.ctid < b.ctid AND a.name = b.name
            $q$, r.tbl);
          END IF;
          EXECUTE format('ALTER TABLE %I DROP COLUMN club_id CASCADE', r.tbl);
        END IF;
      END LOOP;

      -- 2) UNIQUE-Constraints (single-tenant) idempotent sicherstellen
      FOR r IN
        SELECT * FROM (VALUES
          ('roles',                'name',  'roles_name_key'),
          ('equipment_categories', 'name',  'equipment_categories_name_key'),
          ('penalty_catalog',      'label', 'penalty_catalog_label_key'),
          ('event_catalog',        'label', 'event_catalog_label_key')
        ) AS t(tbl, col, conname)
      LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r.tbl)
           AND NOT EXISTS (
             SELECT 1 FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = cl.relnamespace
             WHERE n.nspname='public' AND cl.relname=r.tbl AND c.contype='u'
               AND array_length(c.conkey,1)=1
               AND EXISTS (
                 SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid=c.conrelid AND a.attnum=c.conkey[1] AND a.attname=r.col
               )
           )
        THEN
          BEGIN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (%I)', r.tbl, r.conname, r.col);
          EXCEPTION WHEN duplicate_object OR duplicate_table OR unique_violation THEN NULL;
          END;
        END IF;
      END LOOP;
    END$$;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_files (
      key TEXT PRIMARY KEY,
      filename TEXT,
      mimetype TEXT,
      data BYTEA NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS music_pieces (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      composer TEXT,
      description TEXT,
      instrument TEXT,
      part TEXT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT,
      file_data BYTEA,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE IF EXISTS music_pieces ADD COLUMN IF NOT EXISTS instrument TEXT;
  `);
  await db.query(`
    ALTER TABLE IF EXISTS music_pieces ADD COLUMN IF NOT EXISTS part TEXT;
  `);
  await db.query(`
    ALTER TABLE IF EXISTS music_pieces ADD COLUMN IF NOT EXISTS mimetype TEXT;
  `);
  await db.query(`
    ALTER TABLE IF EXISTS music_pieces ADD COLUMN IF NOT EXISTS file_data BYTEA;
  `);

  await db.query(`
    INSERT INTO app_settings (key, value)
    VALUES ('ranking_visible', 'true')
    ON CONFLICT (key) DO NOTHING
  `);

  await db.query(`
    INSERT INTO app_settings (key, value)
    VALUES ('ranking_blur_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS penalties (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(100),
      event VARCHAR(100),
      amount NUMERIC(10,2) DEFAULT 0,
      date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(20) DEFAULT 'offen',
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS type VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS event VARCHAR(100)
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offen'
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  `);

  await db.query(`
    ALTER TABLE penalties
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
  `);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'penalties' AND column_name = 'reason'
      ) THEN
        EXECUTE 'UPDATE penalties SET type = COALESCE(type, reason) WHERE type IS NULL';
      END IF;
    END
    $$;
  `);

  await db.query(`
    UPDATE penalties
    SET amount = 0
    WHERE amount IS NULL
  `);

  await db.query(`
    UPDATE penalties
    SET status = 'offen'
    WHERE status IS NULL OR status = ''
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS penalty_catalog (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      amount_under18 NUMERIC(10,2) NOT NULL,
      amount_over18 NUMERIC(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO penalty_catalog (label, amount_under18, amount_over18, is_active, sort_order)
    VALUES
      ('Missachtung / Diskussion mit Tambourmajor', 2.50, 5.00, TRUE, 10),
      ('Missachtung / Diskussion mit Spieß', 2.50, 5.00, TRUE, 20),
      ('Zu spät kommen 1-5 Min', 0.50, 1.00, TRUE, 30),
      ('Zu spät kommen 5-30 Min', 2.50, 5.00, TRUE, 40),
      ('Zu spät kommen ab 30 Min', 7.50, 15.00, TRUE, 50),
      ('Keine Absage / unentschuldigtes Fehlen', 10.00, 20.00, TRUE, 60),
      ('Dreckige Uniform', 2.50, 5.00, TRUE, 70),
      ('Uniform nicht korrekt getragen', 1.50, 3.00, TRUE, 80),
      ('Fehlendes Uniformteil', 2.50, 5.00, TRUE, 90),
      ('Falsches Uniformteil', 2.50, 5.00, TRUE, 100),
      ('Falsche Socken', 1.50, 3.00, TRUE, 110),
      ('Instrument vergessen / stehen lassen', 5.00, 10.00, TRUE, 120),
      ('Beleidigung', 2.50, 5.00, TRUE, 130),
      ('Spießkordel anfassen', 2.50, 5.00, TRUE, 140),
      ('Ins Spießbuch schauen', 2.00, 4.00, TRUE, 150),
      ('Orden anfassen', 1.00, 2.00, TRUE, 160),
      ('Instrument fallen lassen', 2.00, 4.00, TRUE, 170),
      ('Im Stillgestanden aus der Reihe tanzen', 3.00, 6.00, TRUE, 180),
      ('In Uniform daneben benehmen', 10.00, 20.00, TRUE, 190),
      ('Zu voll zum Spiel', 10.00, 20.00, TRUE, 200)
    ON CONFLICT (label) DO NOTHING
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS event_catalog (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO event_catalog (label, sort_order)
    VALUES
      ('Schützenfest Schiefbahn', 10),
      ('Schützenfest Willich', 20),
      ('Schützenfest Kl. Jerusalem', 30),
      ('Schützenfest Osterath', 40)
    ON CONFLICT (label) DO NOTHING
  `);

  // ===== Roles & Equipment (Zeugwart) =====
  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(120)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      can_manage_members BOOLEAN DEFAULT FALSE,
      can_manage_penalties BOOLEAN DEFAULT FALSE,
      can_view_all_penalties BOOLEAN DEFAULT FALSE,
      can_manage_equipment BOOLEAN DEFAULT FALSE,
      can_assign_equipment BOOLEAN DEFAULT FALSE,
      can_manage_roles BOOLEAN DEFAULT FALSE,
      is_board BOOLEAN DEFAULT FALSE,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, role_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      icon VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES equipment_categories(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      serial_number VARCHAR(100),
      condition VARCHAR(50) DEFAULT 'gut',
      quantity INTEGER DEFAULT 1,
      image_url TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_holders (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      holder_type VARCHAR(30) DEFAULT 'place',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_assignments (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      holder_id INTEGER REFERENCES equipment_holders(id) ON DELETE CASCADE,
      assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMP DEFAULT NOW(),
      returned_at TIMESTAMP,
      notes TEXT,
      quantity INTEGER DEFAULT 1
    )
  `);

  // Migration: Seriennummer auf Zuweisungs-Ebene (pro zugewiesenem Stueck)
  await db.query(`
    ALTER TABLE equipment_assignments
      ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100)
  `);

  // Migration: Zustand auf Zuweisungs-Ebene (pro zugewiesenem Stueck)
  await db.query(`
    ALTER TABLE equipment_assignments
      ADD COLUMN IF NOT EXISTS condition VARCHAR(40) DEFAULT 'gut'
  `);

  // Equipment-Aufgaben (Defekt-Meldungen, Rueckgabe-Anmeldungen) fuer Zeugwart
  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_requests (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
      assignment_id INTEGER REFERENCES equipment_assignments(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_equipment_requests_status
      ON equipment_requests(status)
  `);

  // Zeugwart-To-do-Liste (mit Verknuepfungen zu Equipment + Mitgliedern)
  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_todos (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority VARCHAR(10) NOT NULL DEFAULT 'normal',
      due_date DATE,
      done BOOLEAN NOT NULL DEFAULT FALSE,
      done_at TIMESTAMP,
      done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_todo_items (
      todo_id INTEGER NOT NULL REFERENCES equipment_todos(id) ON DELETE CASCADE,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, equipment_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS equipment_todo_users (
      todo_id INTEGER NOT NULL REFERENCES equipment_todos(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (todo_id, user_id)
    )
  `);
  // Fehlende Spalten nachziehen, falls die Tabelle aus einer aelteren Version stammt
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS done_at TIMESTAMP`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS done_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal'`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS due_date DATE`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS description TEXT`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
  await db.query(`ALTER TABLE equipment_todos ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_equipment_todos_done
      ON equipment_todos(done, created_at DESC)
  `);

  await db.query(`
    INSERT INTO equipment_categories (name, icon) VALUES
      ('Instrumente', 'instrument'),
      ('Uniform', 'uniform'),
      ('Zubehör', 'bag'),
      ('Noten', 'music'),
      ('Sonstiges', 'box')
    ON CONFLICT (name) DO NOTHING
  `);

  await db.query(`
    INSERT INTO roles (name, can_manage_members, can_manage_penalties, can_view_all_penalties,
                       can_manage_equipment, can_assign_equipment, can_manage_roles, is_board, is_admin)
    VALUES
      ('Mitglied',      FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
      ('Vorstand',      TRUE,  FALSE, TRUE,  FALSE, FALSE, FALSE, TRUE,  FALSE),
      ('Administrator', TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  FALSE, TRUE),
      ('Zeugwart',      FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE, FALSE, FALSE)
    ON CONFLICT (name) DO NOTHING
  `);

  // Legacy-Flags (users.is_admin / users.is_board) als Rollen-Zuweisungen
  // ueberfuehren, damit bestehende Spiess-/Vorstand-Konten direkt im neuen
  // Rollensystem erscheinen. Idempotent dank UNIQUE(user_id, role_id).
  await db.query(`
    INSERT INTO user_roles (user_id, role_id)
    SELECT u.id, r.id
    FROM users u
    JOIN roles r ON r.is_admin = TRUE
    WHERE u.is_admin = TRUE
    ON CONFLICT (user_id, role_id) DO NOTHING
  `);
  await db.query(`
    INSERT INTO user_roles (user_id, role_id)
    SELECT u.id, r.id
    FROM users u
    JOIN roles r ON r.is_board = TRUE
    WHERE u.is_board = TRUE
    ON CONFLICT (user_id, role_id) DO NOTHING
  `);

  // ===== NEU: Getränkerunden Tabellen =====
  await db.query(`
    CREATE TABLE IF NOT EXISTS drinks (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Ein "Bierdeckel" = eine gespeicherte Runde. Fasst mehrere Getränke-Positionen
  // (drink_rounds) zu einem archivierbaren Datensatz mit Nutzer, Zeitpunkt und
  // Gesamtsumme zusammen, damit der Vorstand ein Archiv aller Runden sehen kann.
  await db.query(`
    CREATE TABLE IF NOT EXISTS drink_round_batches (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS drink_rounds (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      drink_id INTEGER REFERENCES drinks(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE drink_rounds
    ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES drink_round_batches(id) ON DELETE CASCADE
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_drink_rounds_batch_id
      ON drink_rounds(batch_id)
  `);

  // Standard Getränke initial anlegen
  await db.query(`
    INSERT INTO drinks (name, price) VALUES
      ('Bier', 2.50),
      ('Cola', 2.00),
      ('Wasser', 1.50),
      ('Fanta', 2.00)
    ON CONFLICT (name) DO NOTHING
  `);
}

const vapidKeys = {
  publicKey: 'BMNz5-yJd5D66IWYpt1jP6XWdodPJF-54HxRY34-15-D8zAc24G8P3lhsx8VHDfuWKwT1ZQi-Y9l12z7irijHVA',
  privateKey: 'ykcxE-Qb14LxNI0WDxBZf8gVnX3Lkz0qWxNF4Ia4v1s',
};
webPush.setVapidDetails('mailto:vorsitzender@gutschlag.de', vapidKeys.publicKey, vapidKeys.privateKey);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/login'));

app.use(session({
  store: new PgSession({ pool: db, tableName: 'session', createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  if (req.session.user) {
    req.session.user.is_admin = [true, 1, '1', 'true', 'on'].includes(req.session.user.is_admin);
    req.session.user.is_board = [true, 1, '1', 'true', 'on'].includes(req.session.user.is_board);
  }
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Berechtigungs-Flags aus user_roles für aktuelle Session in res.locals exponieren
app.use(async (req, res, next) => {
  res.locals.canManageEquipment = false;
  res.locals.canAssignEquipment = false;
  res.locals.canManageRoles = false;
  if (req.session.user) {
    if (req.session.user.is_admin) {
      res.locals.canManageEquipment = true;
      res.locals.canAssignEquipment = true;
      res.locals.canManageRoles = true;
    } else {
      try {
        const r = await db.query(`
          SELECT
            BOOL_OR(r.can_manage_equipment) AS me,
            BOOL_OR(r.can_assign_equipment) AS ae,
            BOOL_OR(r.can_manage_roles) AS mr
          FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = $1
        `, [req.session.user.id]);
        if (r.rows[0]) {
          res.locals.canManageEquipment = !!r.rows[0].me;
          res.locals.canAssignEquipment = !!r.rows[0].ae;
          res.locals.canManageRoles = !!r.rows[0].mr;
        }
      } catch (e) {
        // Tabellen evtl. noch nicht da – ignorieren
      }
    }
  }
  next();
});

// Spieße (Admins) für alle Views verfügbar machen
app.use(async (req, res, next) => {
  if (req.session.user) {
    try {
      const result = await db.query('SELECT username FROM users WHERE is_admin = true ORDER BY username ASC');
      res.locals.admins = result.rows;
    } catch (e) {
      res.locals.admins = [];
    }
  } else {
    res.locals.admins = [];
  }
  next();
});

app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/penalties', require('./routes/penalties'));
app.use('/users', require('./routes/users'));
app.use('/ranking', require('./routes/ranking'));
app.use('/spiess-board', require('./routes/spiessBoard'));
app.use('/export', require('./routes/exportseite'));
app.use('/logout', require('./routes/logout'));
app.use('/profil', require('./routes/profile'));
app.use('/music', require('./routes/music'));
app.use('/suggestions', require('./routes/suggestions'));
app.use('/drinkrounds', require('./routes/drinkRounds'));
app.use('/equipment', require('./routes/equipment'));
app.use('/roles', require('./routes/roles'));

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!req.session.user) return res.status(403).send('Nicht eingeloggt');

  db.query('UPDATE users SET push_subscription = $1 WHERE id = $2', [subscription, req.session.user.id])
    .then(() => res.status(200).send('Push gespeichert'))
    .catch(err => {
      console.error('Fehler beim Speichern', err);
      res.status(500).send('Fehler beim Speichern');
    });
});

async function sendPushNotification(userId, title, message) {
  try {
    const result = await db.query('SELECT push_subscription FROM users WHERE id = $1', [userId]);
    const pushSubscription = result.rows[0]?.push_subscription;
    if (!pushSubscription) return;

    await webPush.sendNotification(pushSubscription, JSON.stringify({
      title, body: message, icon: '/icons/logo-192.png', badge: '/icons/logo-192.png'
    }));
  } catch (err) {
    console.error('Push Fehler:', err);
  }
}

app.post('/add-penalty', async (req, res) => {
  const { userId, amount, event } = req.body;
  await db.query('INSERT INTO penalties (user_id, amount, event) VALUES ($1, $2, $3)', [userId, amount, event]);
  await sendPushNotification(userId, 'Neue Strafe erhalten', `Du hast €${amount} für "${event}" bekommen.`);
  res.status(200).send('Strafe + Push');
});

app.use((req, res) => res.status(404).render('404', { title: 'Seite nicht gefunden' }));

ensureDatabaseSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`✅ Server läuft auf http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Fehler beim Initialisieren des Schemas:', err);
    process.exit(1);
  });