require('dotenv').config();
const mysql = require('mysql2/promise');

async function cleanup() {
  const uri = (process.env.MYSQL_URL || '').split('?')[0];
  let conn;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      conn = await mysql.createConnection({ uri, ssl: { rejectUnauthorized: false } });
      const [res] = await conn.execute(
        `DELETE FROM users
         WHERE email LIKE 'pw\\_%@example.com'
            OR email LIKE 'k6\\_vu\\_%@example.com'
            OR email LIKE 'ai\\_audit\\_%@example.com'
            OR email LIKE 'sync\\_audit\\_%@example.com'`
      );
      console.log('[Cleanup] Removed audit test users:', res.affectedRows);
      await conn.end();
      return;
    } catch (err) {
      if (conn) await conn.end().catch(() => {});
      if (err.code === 'ER_CON_COUNT_ERROR' && attempt < 5) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Cleanup] Failed:', err);
    process.exit(1);
  });
