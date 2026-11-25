(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SyncMerge = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function mergeLwwRecord(localRec, remoteRec) {
    if (!localRec && !remoteRec) return null;
    if (!localRec) return { ...remoteRec };
    if (!remoteRec) return { ...localRec };
    const localTs = Number(localRec.updated_at) || 0;
    const remoteTs = Number(remoteRec.updated_at) || 0;
    return remoteTs >= localTs ? { ...remoteRec } : { ...localRec };
  }

  function mergeRecordListById(localList = [], remoteList = [], idField = 'id') {
    const map = new Map();

    const apply = (rec) => {
      if (!rec || !rec[idField]) return;
      const key = String(rec[idField]);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...rec });
        return;
      }
      const existingTs = Number(existing.updated_at) || 0;
      const incomingTs = Number(rec.updated_at) || 0;
      if (incomingTs > existingTs) {
        map.set(key, { ...rec });
      } else if (incomingTs === existingTs) {
        // Deterministic tie-breaker: preserve tombstones so deletions aren't silently resurrected
        if (rec.deleted && !existing.deleted) {
          map.set(key, { ...rec });
        } else if (!existing.deleted) {
          map.set(key, { ...rec });
        }
      }
    };

    localList.forEach(apply);
    remoteList.forEach(apply);

    return Array.from(map.values());
  }

  function mergeAchievements(localAch = {}, remoteAch = {}) {
    const merged = {};
    const allKeys = new Set([...Object.keys(localAch || {}), ...Object.keys(remoteAch || {})]);

    for (const id of allKeys) {
      const a = localAch?.[id];
      const b = remoteAch?.[id];
      if (!a && !b) continue;
      if (!a) { merged[id] = { ...b }; continue; }
      if (!b) { merged[id] = { ...a }; continue; }

      const unlocked = Boolean(a.unlocked || b.unlocked);
      let unlockedDate = a.unlockedDate || b.unlockedDate || null;
      if (a.unlockedDate && b.unlockedDate) {
        unlockedDate = a.unlockedDate <= b.unlockedDate ? a.unlockedDate : b.unlockedDate;
      }
      const updatedAt = Math.max(Number(a.updated_at) || 0, Number(b.updated_at) || 0);
      merged[id] = { unlocked, unlockedDate, updated_at: updatedAt };
    }

    return merged;
  }

  function mergeFoodFrequency(localFreq = {}, remoteFreq = {}) {
    const merged = { ...(localFreq || {}) };
    for (const [name, count] of Object.entries(remoteFreq || {})) {
      const localCount = Number(merged[name]) || 0;
      const remoteCount = Number(count) || 0;
      merged[name] = Math.max(localCount, remoteCount);
    }
    return merged;
  }

  function mergeStats(localStats = {}, remoteStats = {}) {
    const lc = localStats.counters || {};
    const rc = remoteStats.counters || {};

    const localWaterGoalTs = Number(lc.waterGoalUpdatedAt) || 0;
    const remoteWaterGoalTs = Number(rc.waterGoalUpdatedAt) || 0;
    const waterGoal = remoteWaterGoalTs >= localWaterGoalTs
      ? (rc.waterGoal || lc.waterGoal || 2500)
      : (lc.waterGoal || rc.waterGoal || 2500);

    const ls = localStats.streaks || {};
    const rs = remoteStats.streaks || {};

    return {
      achievements: mergeAchievements(localStats.achievements, remoteStats.achievements),
      food_freq: mergeFoodFrequency(localStats.food_freq, remoteStats.food_freq),
      streaks: {
        currentStreak: Math.max(Number(ls.currentStreak) || 0, Number(rs.currentStreak) || 0),
        longestStreak: Math.max(Number(ls.longestStreak) || 0, Number(rs.longestStreak) || 0),
        lastLogDate: (ls.lastLogDate && rs.lastLogDate)
          ? (ls.lastLogDate >= rs.lastLogDate ? ls.lastLogDate : rs.lastLogDate)
          : (ls.lastLogDate || rs.lastLogDate || null)
      },
      counters: {
        nlp: Math.max(Number(lc.nlp) || 0, Number(rc.nlp) || 0),
        meals: Math.max(Number(lc.meals) || 0, Number(rc.meals) || 0),
        waterGoal,
        waterGoalUpdatedAt: Math.max(localWaterGoalTs, remoteWaterGoalTs)
      },
      updated_at: Math.max(Number(localStats.updated_at) || 0, Number(remoteStats.updated_at) || 0)
    };
  }

  function mergeCoachMessages(localMsgs = [], remoteMsgs = [], maxMessages = 60) {
    const seen = new Map();
    const order = [];

    const add = (msg, idx) => {
      if (!msg || typeof msg.text !== 'string') return;
      const key = msg.id ? `id:${msg.id}` : `fb:${msg.role}:${msg.createdAt || idx}:${msg.text.slice(0, 64)}`;
      if (!seen.has(key)) {
        const normalized = {
          id: msg.id || null,
          role: msg.role,
          text: msg.text,
          createdAt: Number(msg.createdAt) || idx
        };
        seen.set(key, normalized);
        order.push(normalized);
      }
    };

    localMsgs.forEach((m, i) => add(m, i));
    remoteMsgs.forEach((m, i) => add(m, localMsgs.length + i));

    order.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return order.slice(-maxMessages);
  }

  function mergeCoachThreads(localThreads = [], remoteThreads = []) {
    const map = new Map();

    const apply = (thread) => {
      if (!thread || !thread.id) return;
      const existing = map.get(thread.id);
      if (!existing) {
        map.set(thread.id, {
          ...thread,
          messages: Array.isArray(thread.messages) ? [...thread.messages] : []
        });
        return;
      }

      const existingTs = Number(existing.updated_at) || 0;
      const incomingTs = Number(thread.updated_at) || 0;
      const newer = incomingTs >= existingTs ? thread : existing;

      // If deleted after last edit, honor deletion; otherwise merge message timelines
      if (newer.deleted) {
        map.set(thread.id, {
          ...newer,
          messages: mergeCoachMessages(existing.messages, thread.messages)
        });
      } else {
        map.set(thread.id, {
          id: thread.id,
          title: newer.title || existing.title || 'New Chat',
          messages: mergeCoachMessages(existing.messages, thread.messages),
          updated_at: Math.max(existingTs, incomingTs),
          deleted: false
        });
      }
    };

    (localThreads || []).forEach(apply);
    (remoteThreads || []).forEach(apply);

    return Array.from(map.values()).sort((a, b) => (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0));
  }

  return {
    mergeLwwRecord,
    mergeRecordListById,
    mergeAchievements,
    mergeFoodFrequency,
    mergeStats,
    mergeCoachMessages,
    mergeCoachThreads
  };
}));
