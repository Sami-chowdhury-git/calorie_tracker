const db = require('../db');

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

let tableReady = false;

async function ensureRateLimitTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key VARCHAR(128) PRIMARY KEY,
      window_start BIGINT NOT NULL,
      request_count INT NOT NULL DEFAULT 0
    )
  `);
  tableReady = true;
}

async function checkUserRateLimit(userId, action = 'gemini', maxRequests = MAX_REQUESTS_PER_WINDOW, windowMs = WINDOW_MS) {
  await ensureRateLimitTable();
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const rateKey = `${action}:${userId}`;

  await db.query(
    `INSERT INTO rate_limits (rate_key, window_start, request_count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE
       request_count = IF(window_start = VALUES(window_start), request_count + 1, 1),
       window_start = VALUES(window_start)`,
    [rateKey, windowStart]
  );

  const [rows] = await db.query(
    'SELECT window_start, request_count FROM rate_limits WHERE rate_key = ?',
    [rateKey]
  );

  const count = rows[0] ? Number(rows[0].request_count) : 1;
  const remaining = Math.max(0, maxRequests - count);
  const resetMs = windowStart + windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((resetMs - now) / 1000));

  return {
    allowed: count <= maxRequests,
    limit: maxRequests,
    remaining,
    count,
    retryAfterSec
  };
}

module.exports = {
  checkUserRateLimit,
  MAX_REQUESTS_PER_WINDOW,
  WINDOW_MS
};
