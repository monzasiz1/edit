require('dotenv').config();
const db = require('./db');
(async () => {
  const cols = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='equipment_assignments' ORDER BY ordinal_position
  `);
  console.log('equipment_assignments cols:');
  cols.rows.forEach(r => console.log('  ', r.column_name, r.data_type));

  const eq = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='equipment' ORDER BY ordinal_position
  `);
  console.log('equipment cols:', eq.rows.map(r => r.column_name));

  const all = await db.query('SELECT * FROM equipment_assignments ORDER BY id DESC LIMIT 10');
  console.log('assignments rows:', JSON.stringify(all.rows, null, 2));

  const users = await db.query('SELECT id, username FROM users');
  console.log('users:', users.rows);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
