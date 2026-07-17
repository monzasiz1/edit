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

// Wichtig: Ohne diesen Handler crasht der komplette Node-Prozess,
// sobald eine idle Connection im Pool von der DB getrennt wird
// (z.B. bei kurzen Netzwerkausfällen auf Render). Das erklärt die
// scheinbar zufälligen Abstürze / Timeouts.
pool.on('error', (err) => {
  console.error('Unerwarteter Fehler bei einer inaktiven PG-Client-Verbindung:', err);
});

module.exports = pool;