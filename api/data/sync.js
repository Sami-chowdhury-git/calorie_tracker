const db = require('../db');
const { authenticateRequest } = require('../_lib/auth');
const { applySecurityAndCors, validateOriginForMutation } = require('../_lib/cors');
const SyncMerge = require('../../js/sync-merge');

const VALID_MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snacks']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SYNC_BYTES = 4 * 1024 * 1024;

let syncSchemaReady = false;

async function ensureSyncSchema() {
  if (syncSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS diary_items (
      user_id VARCHAR(36) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      date_str VARCHAR(10) NOT NULL,
      meal_type VARCHAR(16) NOT NULL,
      data JSON NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item_id),
      INDEX idx_diary_items_user_date (user_id, date_str),
      INDEX idx_diary_items_user_updated (user_id, updated_at),
      CONSTRAINT diary_items_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS water_entries (
      user_id VARCHAR(36) NOT NULL,
      entry_id VARCHAR(64) NOT NULL,
      date_str VARCHAR(10) NOT NULL,
      ml INT NOT NULL,
      logged_at VARCHAR(40) NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, entry_id),
      INDEX idx_water_user_date (user_id, date_str),
      INDEX idx_water_user_updated (user_id, updated_at),
      CONSTRAINT water_entries_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coach_threads (
      user_id VARCHAR(36) NOT NULL,
      conv_id VARCHAR(64) NOT NULL,
      title VARCHAR(160) NOT NULL,
      messages JSON NOT NULL,
      active_flag TINYINT(1) NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, conv_id),
      INDEX idx_coach_threads_user_updated (user_id, updated_at),
      CONSTRAINT coach_threads_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  syncSchemaReady = true;
}

function parseJsonCol(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

async function fetchUserSnapshot(userId, since = 0) {
  const sinceTs = Number(since) || 0;

  const [rows] = await db.query(
    `SELECT
      (SELECT JSON_OBJECT('data', data, 'updated_at_ms', updated_at_ms)
       FROM profiles WHERE user_id = ? LIMIT 1) AS profile_json,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT('id', item_id, 'date_str', date_str, 'meal_type', meal_type, 'data', data, 'updated_at', updated_at, 'deleted', deleted)
       ) FROM diary_items WHERE user_id = ? AND updated_at > ?) AS diary_json,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT('id', entry_id, 'date_str', date_str, 'ml', ml, 'time', logged_at, 'updated_at', updated_at, 'deleted', deleted)
       ) FROM water_entries WHERE user_id = ? AND updated_at > ?) AS water_json,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT('date', date_str, 'date_str', date_str, 'weight', weight, 'updated_at', updated_at_ms, 'deleted', deleted)
       ) FROM weight_logs WHERE user_id = ? AND updated_at_ms > ?) AS weight_json,
      (SELECT JSON_OBJECT('streaks', streaks, 'achievements', achievements, 'counters', counters, 'food_freq', food_freq, 'updated_at_ms', updated_at_ms)
       FROM user_stats WHERE user_id = ? LIMIT 1) AS stats_json,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT('id', conv_id, 'title', title, 'messages', messages, 'active', active_flag, 'updated_at', updated_at, 'deleted', deleted)
       ) FROM coach_threads WHERE user_id = ? AND updated_at > ?) AS coach_json`,
    [userId, userId, sinceTs, userId, sinceTs, userId, sinceTs, userId, userId, sinceTs]
  );

  const row = rows[0] || {};
  const profileRow = parseJsonCol(row.profile_json, null);
  const diaryItemRows = parseJsonCol(row.diary_json, []) || [];
  const waterRows = parseJsonCol(row.water_json, []) || [];
  const weightRows = parseJsonCol(row.weight_json, []) || [];
  const sRow = parseJsonCol(row.stats_json, null);
  const coachRows = parseJsonCol(row.coach_json, []) || [];

  let profile = null;
  if (profileRow) {
    const pData = parseJsonCol(profileRow.data, null);
    const pTs = Number(profileRow.updated_at_ms) || 0;
    if (pData && pTs >= sinceTs) {
      profile = { ...pData, updated_at: pTs || Number(pData.updated_at) || 0 };
    }
  }

  let stats = null;
  if (sRow) {
    const sTs = Number(sRow.updated_at_ms) || 0;
    if (sTs >= sinceTs || sinceTs === 0) {
      stats = {
        streaks: parseJsonCol(sRow.streaks, {}),
        achievements: parseJsonCol(sRow.achievements, {}),
        counters: parseJsonCol(sRow.counters, {}),
        food_freq: parseJsonCol(sRow.food_freq, {}),
        updated_at: sTs
      };
    }
  }

  return {
    serverTime: Date.now(),
    profile,
    diaryItems: diaryItemRows.map(r => ({
      id: r.id,
      date_str: r.date_str,
      meal_type: r.meal_type,
      data: parseJsonCol(r.data, {}),
      updated_at: Number(r.updated_at) || 0,
      deleted: Boolean(r.deleted)
    })),
    waterEntries: waterRows.map(r => ({
      id: r.id,
      date_str: r.date_str,
      ml: Number(r.ml) || 0,
      time: r.time,
      updated_at: Number(r.updated_at) || 0,
      deleted: Boolean(r.deleted)
    })),
    weightLogs: weightRows.map(r => ({
      date: r.date_str,
      date_str: r.date_str,
      weight: parseFloat(r.weight),
      updated_at: Number(r.updated_at) || 0,
      deleted: Boolean(r.deleted)
    })),
    stats,
    coachThreads: coachRows.map(r => ({
      id: r.id,
      title: r.title,
      messages: parseJsonCol(r.messages, []),
      active: Boolean(r.active),
      updated_at: Number(r.updated_at) || 0,
      deleted: Boolean(r.deleted)
    }))
  };
}

async function handleSync(req, res, userId) {
  if (req.method === 'GET') {
    const since = Math.max(0, parseInt(req.query?.since || '0', 10) || 0);
    const snapshot = await fetchUserSnapshot(userId, since);
    return res.json(snapshot);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_SYNC_BYTES) {
      return res.status(413).json({ error: 'Sync payload exceeds maximum size' });
    }

    const { profile, diaryItems, waterEntries, weightLogs, stats, coachThreads, since } = body;
    const nowMs = Date.now();
    const ops = [];

    if (profile && typeof profile === 'object') {
      const incomingTs = Number(profile.updated_at) || nowMs;
      const cleanProfile = { ...profile, updated_at: incomingTs };
      ops.push(db.query(
        `INSERT INTO profiles (user_id, data, updated_at_ms)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           data = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(data), data),
           updated_at_ms = GREATEST(updated_at_ms, VALUES(updated_at_ms))`,
        [userId, JSON.stringify(cleanProfile), incomingTs]
      ));
    }

    if (Array.isArray(diaryItems)) {
      for (const item of diaryItems) {
        if (!item || !item.id || !DATE_RE.test(String(item.date_str || '')) || !VALID_MEALS.has(item.meal_type)) {
          continue;
        }
        const updatedAt = Number(item.updated_at) || nowMs;
        const deleted = item.deleted ? 1 : 0;
        ops.push(db.query(
          `INSERT INTO diary_items (user_id, item_id, date_str, meal_type, data, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             date_str = IF(VALUES(updated_at) >= updated_at, VALUES(date_str), date_str),
             meal_type = IF(VALUES(updated_at) >= updated_at, VALUES(meal_type), meal_type),
             data = IF(VALUES(updated_at) >= updated_at, VALUES(data), data),
             deleted = IF(VALUES(updated_at) >= updated_at, VALUES(deleted), deleted),
             updated_at = GREATEST(updated_at, VALUES(updated_at))`,
          [userId, String(item.id).slice(0, 64), item.date_str, item.meal_type, JSON.stringify(item.data || {}), updatedAt, deleted]
        ));
      }
    }

    if (Array.isArray(waterEntries)) {
      for (const entry of waterEntries) {
        if (!entry || !entry.id || !DATE_RE.test(String(entry.date_str || ''))) {
          continue;
        }
        const updatedAt = Number(entry.updated_at) || nowMs;
        const deleted = entry.deleted ? 1 : 0;
        const ml = Math.max(0, Math.min(10000, parseInt(entry.ml || '0', 10) || 0));
        ops.push(db.query(
          `INSERT INTO water_entries (user_id, entry_id, date_str, ml, logged_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             date_str = IF(VALUES(updated_at) >= updated_at, VALUES(date_str), date_str),
             ml = IF(VALUES(updated_at) >= updated_at, VALUES(ml), ml),
             logged_at = IF(VALUES(updated_at) >= updated_at, VALUES(logged_at), logged_at),
             deleted = IF(VALUES(updated_at) >= updated_at, VALUES(deleted), deleted),
             updated_at = GREATEST(updated_at, VALUES(updated_at))`,
          [userId, String(entry.id).slice(0, 64), entry.date_str, ml, String(entry.time || new Date().toISOString()).slice(0, 40), updatedAt, deleted]
        ));
      }
    }

    if (Array.isArray(weightLogs)) {
      for (const w of weightLogs) {
        const dateStr = w?.date_str || w?.date;
        if (!w || !DATE_RE.test(String(dateStr || ''))) continue;
        const val = parseFloat(w.weight);
        if (!Number.isFinite(val) || val < 20 || val > 400) continue;
        const updatedAt = Number(w.updated_at) || nowMs;
        const deleted = w.deleted ? 1 : 0;
        ops.push(db.query(
          `INSERT INTO weight_logs (user_id, date_str, weight, updated_at_ms, deleted)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             weight = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(weight), weight),
             deleted = IF(VALUES(updated_at_ms) >= updated_at_ms, VALUES(deleted), deleted),
             updated_at_ms = GREATEST(updated_at_ms, VALUES(updated_at_ms))`,
          [userId, dateStr, val, updatedAt, deleted]
        ));
      }
    }

    await Promise.all(ops);

    if (stats && typeof stats === 'object') {
      const [existingRows] = await db.query(
        'SELECT streaks, achievements, counters, food_freq, updated_at_ms FROM user_stats WHERE user_id = ?',
        [userId]
      );
      const existingStats = existingRows[0]
        ? {
            streaks: parseJsonCol(existingRows[0].streaks, {}),
            achievements: parseJsonCol(existingRows[0].achievements, {}),
            counters: parseJsonCol(existingRows[0].counters, {}),
            food_freq: parseJsonCol(existingRows[0].food_freq, {}),
            updated_at: Number(existingRows[0].updated_at_ms) || 0
          }
        : {};

      const merged = SyncMerge.mergeStats(existingStats, {
        ...stats,
        updated_at: Number(stats.updated_at) || nowMs
      });

      await db.query(
        `INSERT INTO user_stats (user_id, streaks, achievements, counters, food_freq, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           streaks = VALUES(streaks),
           achievements = VALUES(achievements),
           counters = VALUES(counters),
           food_freq = VALUES(food_freq),
           updated_at_ms = VALUES(updated_at_ms)`,
        [
          userId,
          JSON.stringify(merged.streaks || {}),
          JSON.stringify(merged.achievements || {}),
          JSON.stringify(merged.counters || {}),
          JSON.stringify(merged.food_freq || {}),
          merged.updated_at || nowMs
        ]
      );
    }

    if (Array.isArray(coachThreads)) {
      for (const thread of coachThreads) {
        if (!thread || !thread.id) continue;
        const convId = String(thread.id).slice(0, 64);
        const [existing] = await db.query(
          'SELECT conv_id, title, messages, active_flag, updated_at, deleted FROM coach_threads WHERE user_id = ? AND conv_id = ?',
          [userId, convId]
        );

        const existingObj = existing[0]
          ? {
              id: existing[0].conv_id,
              title: existing[0].title,
              messages: parseJsonCol(existing[0].messages, []),
              updated_at: Number(existing[0].updated_at) || 0,
              deleted: Boolean(existing[0].deleted)
            }
          : null;

        const incomingObj = {
          id: convId,
          title: String(thread.title || 'New Chat').slice(0, 160),
          messages: Array.isArray(thread.messages) ? thread.messages : [],
          updated_at: Number(thread.updated_at) || nowMs,
          deleted: Boolean(thread.deleted)
        };

        const merged = existingObj
          ? SyncMerge.mergeCoachThreads([existingObj], [incomingObj])[0]
          : incomingObj;

        await db.query(
          `INSERT INTO coach_threads (user_id, conv_id, title, messages, active_flag, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             messages = VALUES(messages),
             active_flag = VALUES(active_flag),
             updated_at = VALUES(updated_at),
             deleted = VALUES(deleted)`,
          [
            userId,
            convId,
            String(merged.title || 'New Chat').slice(0, 160),
            JSON.stringify(merged.messages || []),
            thread.active ? 1 : 0,
            merged.updated_at || nowMs,
            merged.deleted ? 1 : 0
          ]
        );
      }
    }

    const sinceCursor = Math.max(0, parseInt(since || '0', 10) || 0);
    const snapshot = await fetchUserSnapshot(userId, sinceCursor);
    return res.json({ success: true, ...snapshot });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = async (req, res) => {
  applySecurityAndCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST' && !validateOriginForMutation(req)) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }

  const user = await authenticateRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    return await handleSync(req, res, user.id);
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      try {
        await ensureSyncSchema();
        return await handleSync(req, res, user.id);
      } catch (retryErr) {
        console.error('Sync retry error:', retryErr);
        return res.status(500).json({ error: 'Server error' });
      }
    }
    console.error('Sync error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
