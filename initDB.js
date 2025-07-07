require('dotenv').config();
const pool = require('./db');

async function init() {
  // Tabelle für Benutzer
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(200) NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE
    );
  `);

  // Tabelle für Strafen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS penalties (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      date DATE DEFAULT CURRENT_DATE
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
