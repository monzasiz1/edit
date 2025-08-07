// db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render verlangt SSL
  keepAlive: true,                    // Verbindung offen halten
  max: 10,                             // max. gleichzeitige Verbindungen
  idleTimeoutMillis: 30000,            // 30s Leerlauf → Verbindung schließen
  connectionTimeoutMillis: 10000       // 10s Timeout beim Verbinden
});

module.exports = pool;
