require('dotenv').config();
const pool = require('./db');

async function init() {
  await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    is_board BOOLEAN DEFAULT FALSE,
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS penalties (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    type VARCHAR(100),                -- Art der Strafe
    event VARCHAR(100),               -- Veranstaltung
    event_id INTEGER,                 -- Veranstaltung ID für Gruppierung
    created_at TIMESTAMP DEFAULT NOW() -- Zeitpunkt der Eintragung
  );
    
  `);

await pool.query(`
  CREATE TABLE IF NOT EXISTS drinks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS drink_rounds (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    drink_id INTEGER REFERENCES drinks(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    round_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

  // Optional: Standard-Admin einfügen (wenn nicht vorhanden)
  const adminName = 'admin';
  const adminPass = 'admin123'; // Bitte nach erstem Login ändern!
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(adminPass, 10);
  const res = await pool.query('SELECT * FROM users WHERE username = $1', [adminName]);
  if (res.rows.length === 0) {
    await pool.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
      [adminName, hash, true]
    );
    console.log('Admin-User erstellt: admin / admin123');
  }
  console.log('Init abgeschlossen!');
  process.exit();
}

init().catch(err => {
  console.error('Fehler beim Initialisieren:', err);
  process.exit(1);
});
