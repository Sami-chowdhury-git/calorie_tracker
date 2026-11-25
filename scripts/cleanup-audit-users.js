require('dotenv').config();
const db = require('../api/db');

async function cleanup() {
  const [res] = await db.query(
    `DELETE FROM users
     WHERE email LIKE 'pw\\_%@example.com'
        OR email LIKE 'k6\\_vu\\_%@example.com'
        OR email LIKE 'ai\\_audit\\_%@example.com'
        OR email LIKE 'sync\\_audit\\_%@example.com'`
  );
  console.log('[Cleanup] Removed audit test users:', res.affectedRows);
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Cleanup] Failed:', err);
    process.exit(1);
  });
