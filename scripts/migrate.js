require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../api/db');

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0]?.cnt > 0;
}

function parseJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

async function runMigration() {
  console.log('[Migrate] Applying base schema...');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '001_schema.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await db.query(stmt);
  }

  console.log('[Migrate] Verifying versioned columns on existing tables...');
  if (!(await columnExists('profiles', 'updated_at_ms'))) {
    await db.query('ALTER TABLE profiles ADD COLUMN updated_at_ms BIGINT NOT NULL DEFAULT 0');
    await db.query('UPDATE profiles SET updated_at_ms = COALESCE(UNIX_TIMESTAMP(updated_at) * 1000, UNIX_TIMESTAMP() * 1000) WHERE updated_at_ms = 0');
  }

  if (!(await columnExists('weight_logs', 'updated_at_ms'))) {
    await db.query('ALTER TABLE weight_logs ADD COLUMN updated_at_ms BIGINT NOT NULL DEFAULT 0');
    await db.query('UPDATE weight_logs SET updated_at_ms = UNIX_TIMESTAMP() * 1000 WHERE updated_at_ms = 0');
  }

  if (!(await columnExists('weight_logs', 'deleted'))) {
    await db.query('ALTER TABLE weight_logs ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0');
  }

  await db.query('ALTER TABLE weight_logs MODIFY COLUMN weight DECIMAL(6,2) NOT NULL');

  if (!(await columnExists('user_stats', 'updated_at_ms'))) {
    await db.query('ALTER TABLE user_stats ADD COLUMN updated_at_ms BIGINT NOT NULL DEFAULT 0');
    await db.query('UPDATE user_stats SET updated_at_ms = COALESCE(UNIX_TIMESTAMP(updated_at) * 1000, UNIX_TIMESTAMP() * 1000) WHERE updated_at_ms = 0');
  }

  console.log('[Migrate] Backfilling legacy diary_entries into diary_items...');
  const [diaryRows] = await db.query('SELECT user_id, date_str, data, UNIX_TIMESTAMP(updated_at) * 1000 AS ts FROM diary_entries');
  for (const row of diaryRows) {
    const dayData = parseJson(row.data, {});
    const fallbackTs = Number(row.ts) || Date.now();
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) {
      const list = Array.isArray(dayData[meal]) ? dayData[meal] : [];
      for (const item of list) {
        if (!item || !item.name) continue;
        const itemId = String(item.id || crypto.randomUUID()).slice(0, 64);
        const itemTs = item.updated_at || (item.timestamp ? new Date(item.timestamp).getTime() : fallbackTs) || fallbackTs;
        await db.query(
          `INSERT IGNORE INTO diary_items (user_id, item_id, date_str, meal_type, data, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [row.user_id, itemId, row.date_str, meal, JSON.stringify({ ...item, id: itemId, updated_at: itemTs }), itemTs]
        );
      }
    }
  }

  console.log('[Migrate] Backfilling legacy waterLogs from user_stats into water_entries...');
  const [statsRows] = await db.query('SELECT user_id, counters, updated_at_ms FROM user_stats');
  for (const row of statsRows) {
    const counters = parseJson(row.counters, {});
    const waterLogs = counters?.waterLogs;
    if (waterLogs && typeof waterLogs === 'object') {
      for (const [dateStr, log] of Object.entries(waterLogs)) {
        const entries = Array.isArray(log?.entries) ? log.entries : [];
        entries.forEach((e, idx) => {
          const entryId = String(e.id || `legacy_${dateStr}_${idx}`).slice(0, 64);
          const entryTs = Number(e.updated_at) || (e.time ? new Date(e.time).getTime() : Number(row.updated_at_ms)) || Date.now();
          db.query(
            `INSERT IGNORE INTO water_entries (user_id, entry_id, date_str, ml, logged_at, updated_at, deleted)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [row.user_id, entryId, dateStr, Number(e.ml) || 0, e.time || new Date(entryTs).toISOString(), entryTs]
          ).catch(() => {});
        });
      }
    }
  }

  console.log('[Migrate] Backfilling legacy coach_conversations into coach_threads...');
  const [coachRows] = await db.query('SELECT user_id, data, UNIX_TIMESTAMP(updated_at) * 1000 AS ts FROM coach_conversations');
  for (const row of coachRows) {
    const coach = parseJson(row.data, {});
    const convs = Array.isArray(coach?.conversations) ? coach.conversations : [];
    const activeId = coach?.activeConvId || null;
    const fallbackTs = Number(row.ts) || Date.now();
    for (const c of convs) {
      if (!c || !c.id) continue;
      const msgs = Array.isArray(c.messages)
        ? c.messages.map((m, idx) => ({
            id: m.id || `legacy_${c.id}_${idx}`,
            role: m.role,
            text: m.text,
            createdAt: Number(m.createdAt) || (fallbackTs + idx)
          }))
        : [];
      await db.query(
        `INSERT IGNORE INTO coach_threads (user_id, conv_id, title, messages, active_flag, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [row.user_id, String(c.id).slice(0, 64), String(c.title || 'New Chat').slice(0, 160), JSON.stringify(msgs), c.id === activeId ? 1 : 0, Number(c.updated_at) || fallbackTs]
      );
    }
  }

  console.log('[Migrate] Complete!');
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Error:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
