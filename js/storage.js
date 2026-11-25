window.Store = {
  _key(n) { return 'caltrack_' + n; },
  _get(n) { try { return JSON.parse(localStorage.getItem(this._key(n))); } catch { return null; } },
  _set(n, v, skipSync = false) {
    try {
      localStorage.setItem(this._key(n), JSON.stringify(v));
    } catch (e) {
      console.warn('[Store] localStorage quota warning:', e.message);
    }
    if (!skipSync && !n.startsWith('session') && !n.startsWith('dirty_') && !n.startsWith('sync_cursor_')) {
      this.triggerSync();
    }
  },
  _remove(n) { localStorage.removeItem(this._key(n)); },

  _syncTimeout: null,
  _syncing: false,
  _pendingAgain: false,
  _lastTs: 0,

  _nextTs() {
    const now = Date.now();
    this._lastTs = now > this._lastTs ? now : this._lastTs + 1;
    return this._lastTs;
  },

  _emptyDirty() {
    return {
      profile: false,
      diaryItems: [],
      waterEntries: [],
      weightDates: [],
      stats: false,
      coachThreads: []
    };
  },

  _getDirty(userId) {
    const d = this._get('dirty_' + userId);
    return d ? { ...this._emptyDirty(), ...d } : this._emptyDirty();
  },

  _saveDirty(userId, dirty) {
    this._set('dirty_' + userId, dirty, true);
  },

  _markDirty(userId, category, recordKey) {
    if (!userId) return;
    const dirty = this._getDirty(userId);
    if (category === 'profile' || category === 'stats') {
      dirty[category] = true;
    } else if (Array.isArray(dirty[category]) && recordKey) {
      if (!dirty[category].includes(recordKey)) {
        dirty[category].push(recordKey);
      }
    }
    this._saveDirty(userId, dirty);
  },

  _ensureLegacyMigrated(userId) {
    if (!userId) return;
    const itemMap = this._get('diary_items_' + userId) || {};
    let migratedDiary = false;

    const oldPrefix = this._key('diary_' + userId + '_');
    const oldKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(oldPrefix)) oldKeys.push(k);
    }
    for (const k of oldKeys) {
      const dateStr = k.replace(oldPrefix, '');
      try {
        const dayObj = JSON.parse(localStorage.getItem(k));
        if (dayObj && typeof dayObj === 'object') {
          ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(meal => {
            (dayObj[meal] || []).forEach(item => {
              if (!item || !item.name) return;
              const id = item.id || Utils.uuid();
              const ts = Number(item.updated_at) || (item.timestamp ? new Date(item.timestamp).getTime() : Date.now()) || Date.now();
              if (!itemMap[id]) {
                itemMap[id] = {
                  id,
                  date_str: dateStr,
                  meal_type: meal,
                  data: { ...item, id, updated_at: ts },
                  updated_at: ts,
                  deleted: false
                };
                this._markDirty(userId, 'diaryItems', id);
                migratedDiary = true;
              }
            });
          });
        }
      } catch {
        // Skip corrupt legacy entry
      }
      localStorage.removeItem(k);
    }
    if (migratedDiary) {
      this._set('diary_items_' + userId, itemMap, true);
    }

    const waterMap = this._get('water_entries_' + userId) || {};
    let migratedWater = false;
    const oldWaterPrefix = this._key('water_' + userId + '_');
    const oldWaterKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(oldWaterPrefix)) oldWaterKeys.push(k);
    }
    for (const k of oldWaterKeys) {
      const dateStr = k.replace(oldWaterPrefix, '');
      try {
        const wlog = JSON.parse(localStorage.getItem(k));
        (wlog?.entries || []).forEach((e, idx) => {
          const eid = e.id || `w_${dateStr}_${idx}`;
          const ts = Number(e.updated_at) || (e.time ? new Date(e.time).getTime() : Date.now()) || Date.now();
          if (!waterMap[eid]) {
            waterMap[eid] = {
              id: eid,
              date_str: dateStr,
              ml: Number(e.ml) || 0,
              time: e.time || new Date(ts).toISOString(),
              updated_at: ts,
              deleted: false
            };
            this._markDirty(userId, 'waterEntries', eid);
            migratedWater = true;
          }
        });
      } catch {
        // Ignore corrupt entry
      }
      localStorage.removeItem(k);
    }
    if (migratedWater) {
      this._set('water_entries_' + userId, waterMap, true);
    }
  },

  triggerSync() {
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(() => this.syncToServer(), 1200);
  },

  async syncWithServer() {
    await this.syncFromServer();
    const s = this.getSession();
    if (!s) return;
    const dirty = this._getDirty(s.id);
    const hasPending = dirty.profile || dirty.stats ||
      dirty.diaryItems.length > 0 || dirty.waterEntries.length > 0 ||
      dirty.weightDates.length > 0 || dirty.coachThreads.length > 0;
    if (hasPending) {
      await this.syncToServer();
    }
  },

  async syncToServer() {
    const s = this.getSession();
    if (!s) return;
    if (this._syncing) {
      this._pendingAgain = true;
      return;
    }
    this._syncing = true;
    const userId = s.id;
    this._ensureLegacyMigrated(userId);

    const dirty = this._getDirty(userId);
    const since = Number(this._get('sync_cursor_' + userId)) || 0;
    const sentAtTs = {};

    const payload = { since };

    if (dirty.profile) {
      const p = this.getProfile();
      if (p) {
        payload.profile = p;
        sentAtTs.profile = Number(p.updated_at) || 0;
      }
    }

    if (dirty.diaryItems.length > 0) {
      const itemMap = this._get('diary_items_' + userId) || {};
      payload.diaryItems = [];
      sentAtTs.diaryItems = {};
      for (const id of dirty.diaryItems) {
        if (itemMap[id]) {
          payload.diaryItems.push(itemMap[id]);
          sentAtTs.diaryItems[id] = Number(itemMap[id].updated_at) || 0;
        }
      }
    }

    if (dirty.waterEntries.length > 0) {
      const waterMap = this._get('water_entries_' + userId) || {};
      payload.waterEntries = [];
      sentAtTs.waterEntries = {};
      for (const id of dirty.waterEntries) {
        if (waterMap[id]) {
          payload.waterEntries.push(waterMap[id]);
          sentAtTs.waterEntries[id] = Number(waterMap[id].updated_at) || 0;
        }
      }
    }

    if (dirty.weightDates.length > 0) {
      const allWeight = this._getRawWeightRecords(userId);
      payload.weightLogs = [];
      sentAtTs.weightDates = {};
      for (const d of dirty.weightDates) {
        const rec = allWeight.find(r => (r.date_str || r.date) === d);
        if (rec) {
          payload.weightLogs.push(rec);
          sentAtTs.weightDates[d] = Number(rec.updated_at) || 0;
        }
      }
    }

    if (dirty.stats) {
      const statsObj = this._buildStatsPayload(userId);
      payload.stats = statsObj;
      sentAtTs.stats = statsObj.updated_at;
    }

    if (dirty.coachThreads.length > 0) {
      const coachData = this.getCoachData() || { conversations: [] };
      const threads = coachData.conversations || [];
      payload.coachThreads = [];
      sentAtTs.coachThreads = {};
      for (const cid of dirty.coachThreads) {
        const thread = threads.find(t => t.id === cid);
        if (thread) {
          payload.coachThreads.push({
            ...thread,
            active: thread.id === coachData.activeConvId
          });
          sentAtTs.coachThreads[cid] = Number(thread.updated_at) || 0;
        }
      }
    }

    const hasAnything = Boolean(
      payload.profile ||
      (payload.diaryItems && payload.diaryItems.length) ||
      (payload.waterEntries && payload.waterEntries.length) ||
      (payload.weightLogs && payload.weightLogs.length) ||
      payload.stats ||
      (payload.coachThreads && payload.coachThreads.length)
    );

    if (!hasAnything) {
      this._syncing = false;
      return;
    }

    try {
      const res = await fetch('/api/data/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.warn('[Sync] Server returned', res.status);
        return;
      }
      const data = await res.json();

      // Clear only records that were not edited again while request was in flight
      const latestDirty = this._getDirty(userId);
      if (sentAtTs.profile != null) {
        const curP = this.getProfile();
        if (!curP || (Number(curP.updated_at) || 0) <= sentAtTs.profile) {
          latestDirty.profile = false;
        }
      }
      if (sentAtTs.diaryItems) {
        const curMap = this._get('diary_items_' + userId) || {};
        latestDirty.diaryItems = latestDirty.diaryItems.filter(id => {
          const curTs = Number(curMap[id]?.updated_at) || 0;
          return curTs > (sentAtTs.diaryItems[id] || 0);
        });
      }
      if (sentAtTs.waterEntries) {
        const curW = this._get('water_entries_' + userId) || {};
        latestDirty.waterEntries = latestDirty.waterEntries.filter(id => {
          const curTs = Number(curW[id]?.updated_at) || 0;
          return curTs > (sentAtTs.waterEntries[id] || 0);
        });
      }
      if (sentAtTs.weightDates) {
        const curWeights = this._getRawWeightRecords(userId);
        latestDirty.weightDates = latestDirty.weightDates.filter(d => {
          const cur = curWeights.find(r => (r.date_str || r.date) === d);
          const curTs = Number(cur?.updated_at) || 0;
          return curTs > (sentAtTs.weightDates[d] || 0);
        });
      }
      if (sentAtTs.stats != null) {
        const curStatsTs = Number(this._get('stats_ts_' + userId)) || 0;
        if (curStatsTs <= sentAtTs.stats) latestDirty.stats = false;
      }
      if (sentAtTs.coachThreads) {
        const curThreads = this.getCoachData()?.conversations || [];
        latestDirty.coachThreads = latestDirty.coachThreads.filter(cid => {
          const t = curThreads.find(c => c.id === cid);
          const curTs = Number(t?.updated_at) || 0;
          return curTs > (sentAtTs.coachThreads[cid] || 0);
        });
      }
      this._saveDirty(userId, latestDirty);

      this._applyServerMerge(userId, data);
    } catch (e) {
      console.warn('[Sync] Failed to sync to server:', e.message);
    } finally {
      this._syncing = false;
      if (this._pendingAgain) {
        this._pendingAgain = false;
        this.triggerSync();
      }
    }
  },

  async syncFromServer() {
    const s = this.getSession();
    if (!s) return;
    const userId = s.id;
    this._ensureLegacyMigrated(userId);

    const since = Number(this._get('sync_cursor_' + userId)) || 0;
    try {
      const res = await fetch(`/api/data/sync?since=${encodeURIComponent(since)}`, {
        method: 'GET',
        credentials: 'same-origin'
      });
      if (!res.ok) {
        console.warn('[Sync] Server returned', res.status);
        return;
      }
      const data = await res.json();
      this._applyServerMerge(userId, data);
    } catch (e) {
      console.warn('[Sync] Failed to sync from server:', e.message);
    }
  },

  _applyServerMerge(userId, data) {
    if (!data || typeof data !== 'object') return;

    if (data.profile) {
      const localProfile = this.getProfile();
      const merged = window.SyncMerge
        ? window.SyncMerge.mergeLwwRecord(localProfile, data.profile)
        : data.profile;
      const normalized = window.Nutrition ? window.Nutrition.normalizeProfile(merged) : merged;
      this._set('profile_' + userId, normalized, true);
    }

    if (Array.isArray(data.diaryItems) && data.diaryItems.length > 0) {
      const localMap = this._get('diary_items_' + userId) || {};
      const localArr = Object.values(localMap);
      const mergedArr = window.SyncMerge
        ? window.SyncMerge.mergeRecordListById(localArr, data.diaryItems, 'id')
        : data.diaryItems;
      const nextMap = {};
      mergedArr.forEach(rec => { nextMap[rec.id] = rec; });
      this._set('diary_items_' + userId, nextMap, true);
    }

    if (Array.isArray(data.waterEntries) && data.waterEntries.length > 0) {
      const localMap = this._get('water_entries_' + userId) || {};
      const localArr = Object.values(localMap);
      const mergedArr = window.SyncMerge
        ? window.SyncMerge.mergeRecordListById(localArr, data.waterEntries, 'id')
        : data.waterEntries;
      const nextMap = {};
      mergedArr.forEach(rec => { nextMap[rec.id] = rec; });
      this._set('water_entries_' + userId, nextMap, true);
    }

    if (Array.isArray(data.weightLogs) && data.weightLogs.length > 0) {
      const localWeights = this._getRawWeightRecords(userId);
      const mergedWeights = window.SyncMerge
        ? window.SyncMerge.mergeRecordListById(localWeights, data.weightLogs, 'date_str')
        : data.weightLogs;
      this._set('weight_' + userId, mergedWeights, true);
    }

    if (data.stats) {
      const localStats = this._buildStatsPayload(userId);
      const mergedStats = window.SyncMerge
        ? window.SyncMerge.mergeStats(localStats, data.stats)
        : data.stats;
      this._set('ach_' + userId, mergedStats.achievements || {}, true);
      this._set('freq_' + userId, mergedStats.food_freq || {}, true);
      if (mergedStats.counters) {
        if (mergedStats.counters.nlp != null) this._set('nlpc_' + userId, mergedStats.counters.nlp, true);
        if (mergedStats.counters.meals != null) this._set('tm_' + userId, mergedStats.counters.meals, true);
        if (mergedStats.counters.waterGoal != null) {
          this._set('water_goal_' + userId, mergedStats.counters.waterGoal, true);
          this._set('water_goal_ts_' + userId, mergedStats.counters.waterGoalUpdatedAt || 0, true);
        }
      }
      if (mergedStats.streaks) {
        this._set('streak_' + userId, mergedStats.streaks, true);
      }
      this._set('stats_ts_' + userId, mergedStats.updated_at || Date.now(), true);
    }

    if (Array.isArray(data.coachThreads) && data.coachThreads.length > 0) {
      const localCoach = this.getCoachData() || { conversations: [], activeConvId: null };
      const mergedThreads = window.SyncMerge
        ? window.SyncMerge.mergeCoachThreads(localCoach.conversations || [], data.coachThreads)
        : data.coachThreads;
      const visible = mergedThreads.filter(t => !t.deleted);
      const activeFromRemote = data.coachThreads.find(t => t.active && !t.deleted)?.id;
      const activeId = (localCoach.activeConvId && visible.some(t => t.id === localCoach.activeConvId))
        ? localCoach.activeConvId
        : (activeFromRemote || visible[0]?.id || null);
      this._set('coach_convs_' + userId, { conversations: mergedThreads, activeConvId: activeId }, true);
    }

    if (data.serverTime) {
      this._set('sync_cursor_' + userId, Number(data.serverTime), true);
    }
  },

  _buildStatsPayload(userId) {
    const streak = this._get('streak_' + userId) || { currentStreak: 0, longestStreak: 0, lastLogDate: null };
    return {
      streaks: streak,
      achievements: this._get('ach_' + userId) || {},
      counters: {
        nlp: this._get('nlpc_' + userId) || 0,
        meals: this._get('tm_' + userId) || 0,
        waterGoal: this._get('water_goal_' + userId) || 2500,
        waterGoalUpdatedAt: Number(this._get('water_goal_ts_' + userId)) || 0
      },
      food_freq: this._get('freq_' + userId) || {},
      updated_at: Number(this._get('stats_ts_' + userId)) || 0
    };
  },

  getCoachData() {
    const s = this.getSession();
    if (!s) return null;
    const raw = this._get('coach_convs_' + s.id);
    if (!raw) return null;
    const convs = Array.isArray(raw.conversations) ? raw.conversations : [];
    return {
      conversations: convs,
      activeConvId: raw.activeConvId || null
    };
  },

  saveCoachData(conversations, activeConvId, changedThreadIds = []) {
    const s = this.getSession();
    if (!s) return;
    this._set('coach_convs_' + s.id, { conversations, activeConvId }, true);
    changedThreadIds.forEach(cid => this._markDirty(s.id, 'coachThreads', cid));
    this.triggerSync();
  },

  setSession(u) { this._set('session', u, true); },
  getSession() { return this._get('session'); },
  clearSession() { this._remove('session'); },

  getProfile() {
    const s = this.getSession();
    if (!s) return null;
    const raw = this._get('profile_' + s.id);
    if (!raw) return null;
    return window.Nutrition ? window.Nutrition.normalizeProfile(raw) : raw;
  },

  saveProfile(p) {
    const s = this.getSession();
    if (!s || !p) return;
    const normalized = window.Nutrition ? window.Nutrition.normalizeProfile(p) : { ...p };
    normalized.updated_at = this._nextTs();
    this._set('profile_' + s.id, normalized, true);
    this._markDirty(s.id, 'profile');
    this.triggerSync();
  },

  _emptyDay() { return { breakfast: [], lunch: [], dinner: [], snacks: [] }; },

  getDiary(dateStr) {
    const s = this.getSession();
    if (!s) return this._emptyDay();
    this._ensureLegacyMigrated(s.id);
    const map = this._get('diary_items_' + s.id) || {};
    const day = this._emptyDay();
    Object.values(map).forEach(rec => {
      if (!rec || rec.deleted || rec.date_str !== dateStr) return;
      if (day[rec.meal_type]) {
        day[rec.meal_type].push(rec.data);
      }
    });
    return day;
  },

  addDiaryItem(dateStr, mealType, itemData) {
    const s = this.getSession();
    if (!s) return null;
    this._ensureLegacyMigrated(s.id);
    const map = this._get('diary_items_' + s.id) || {};
    const id = itemData.id || Utils.uuid();
    const ts = this._nextTs();
    const cleanData = { ...itemData, id, updated_at: ts };
    map[id] = {
      id,
      date_str: dateStr,
      meal_type: mealType,
      data: cleanData,
      updated_at: ts,
      deleted: false
    };
    this._set('diary_items_' + s.id, map, true);
    this._markDirty(s.id, 'diaryItems', id);
    this.triggerSync();
    return cleanData;
  },

  deleteDiaryItem(dateStr, mealType, itemId) {
    const s = this.getSession();
    if (!s) return;
    this._ensureLegacyMigrated(s.id);
    const map = this._get('diary_items_' + s.id) || {};
    const ts = this._nextTs();
    if (map[itemId]) {
      map[itemId] = {
        ...map[itemId],
        deleted: true,
        updated_at: ts
      };
    } else {
      map[itemId] = {
        id: itemId,
        date_str: dateStr,
        meal_type: mealType,
        data: {},
        deleted: true,
        updated_at: ts
      };
    }
    this._set('diary_items_' + s.id, map, true);
    this._markDirty(s.id, 'diaryItems', itemId);
    this.triggerSync();
  },

  saveDiary(dateStr, data) {
    const s = this.getSession();
    if (!s || !data) return;
    this._ensureLegacyMigrated(s.id);
    const map = this._get('diary_items_' + s.id) || {};
    const incomingIds = new Set();
    const ts = this._nextTs();

    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(meal => {
      (data[meal] || []).forEach(item => {
        if (!item) return;
        const id = item.id || Utils.uuid();
        incomingIds.add(id);
        map[id] = {
          id,
          date_str: dateStr,
          meal_type: meal,
          data: { ...item, id, updated_at: Number(item.updated_at) || ts },
          updated_at: Number(item.updated_at) || ts,
          deleted: false
        };
        this._markDirty(s.id, 'diaryItems', id);
      });
    });

    Object.values(map).forEach(rec => {
      if (rec && !rec.deleted && rec.date_str === dateStr && !incomingIds.has(rec.id)) {
        map[rec.id] = { ...rec, deleted: true, updated_at: ts };
        this._markDirty(s.id, 'diaryItems', rec.id);
      }
    });

    this._set('diary_items_' + s.id, map, true);
    this.triggerSync();
  },

  getDayTotals(dateStr) {
    const d = this.getDiary(dateStr);
    const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, meals: 0 };
    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(m => {
      d[m].forEach(i => {
        t.calories += Number(i.calories) || 0;
        t.protein += Number(i.protein) || 0;
        t.carbs += Number(i.carbs) || 0;
        t.fat += Number(i.fat) || 0;
        t.fiber += Number(i.fiber) || 0;
        t.sugar += Number(i.sugar) || 0;
        t.sodium += Number(i.sodium) || 0;
        t.meals++;
      });
    });
    return t;
  },

  getLoggedDates() {
    const s = this.getSession();
    if (!s) return [];
    this._ensureLegacyMigrated(s.id);
    const map = this._get('diary_items_' + s.id) || {};
    const dates = new Set();
    Object.values(map).forEach(rec => {
      if (rec && !rec.deleted && rec.date_str) dates.add(rec.date_str);
    });
    return Array.from(dates).sort();
  },

  _getRawWeightRecords(userId) {
    const list = this._get('weight_' + userId);
    if (!Array.isArray(list)) return [];
    return list.map(w => ({
      date: w.date_str || w.date,
      date_str: w.date_str || w.date,
      weight: parseFloat(w.weight),
      updated_at: Number(w.updated_at) || 0,
      deleted: Boolean(w.deleted)
    })).filter(w => w.date_str && Number.isFinite(w.weight));
  },

  getWeightLog() {
    const s = this.getSession();
    if (!s) return [];
    return this._getRawWeightRecords(s.id)
      .filter(w => !w.deleted)
      .sort((a, b) => a.date_str.localeCompare(b.date_str));
  },

  recordWeight(dateStr, weightKg) {
    const s = this.getSession();
    if (!s) return;
    const records = this._getRawWeightRecords(s.id);
    const ts = this._nextTs();
    const idx = records.findIndex(r => r.date_str === dateStr);
    const nextRec = {
      date: dateStr,
      date_str: dateStr,
      weight: Math.round(parseFloat(weightKg) * 100) / 100,
      updated_at: ts,
      deleted: false
    };
    if (idx >= 0) records[idx] = nextRec;
    else records.push(nextRec);

    this._set('weight_' + s.id, records, true);
    this._markDirty(s.id, 'weightDates', dateStr);
    this.triggerSync();
  },

  saveWeightLog(l) {
    const s = this.getSession();
    if (!s || !Array.isArray(l)) return;
    const ts = this._nextTs();
    const records = l.map(w => {
      const d = w.date_str || w.date;
      this._markDirty(s.id, 'weightDates', d);
      return {
        date: d,
        date_str: d,
        weight: parseFloat(w.weight),
        updated_at: Number(w.updated_at) || ts,
        deleted: Boolean(w.deleted)
      };
    });
    this._set('weight_' + s.id, records, true);
    this.triggerSync();
  },

  getComputedStreaks() {
    const s = this.getSession();
    if (!s) return { currentStreak: 0, longestStreak: 0, lastLogDate: null, proteinStreak: 0, weightLogStreak: 0 };
    const stored = this._get('streak_' + s.id) || { currentStreak: 0, longestStreak: 0, lastLogDate: null };
    const profile = this.getProfile();
    const dates = this.getLoggedDates();
    const totalsByDate = {};
    dates.forEach(d => { totalsByDate[d] = this.getDayTotals(d); });
    const weightDates = this.getWeightLog().map(w => w.date_str);

    if (window.Nutrition) {
      return window.Nutrition.computeStreaks({
        loggedDates: dates,
        totalsByDate,
        weightDates,
        proteinTarget: profile?.protein || 0,
        prevLongest: stored.longestStreak || 0,
        todayStr: Utils.todayStr()
      });
    }
    return stored;
  },

  getStreakData() {
    return this.getComputedStreaks();
  },

  saveStreakData(d) {
    const s = this.getSession();
    if (!s) return;
    this._set('streak_' + s.id, d, true);
    this._set('stats_ts_' + s.id, this._nextTs(), true);
    this._markDirty(s.id, 'stats');
    this.triggerSync();
  },

  getAchievements() { const s = this.getSession(); return s ? (this._get('ach_' + s.id) || {}) : {}; },
  saveAchievements(d) {
    const s = this.getSession();
    if (!s) return;
    this._set('ach_' + s.id, d, true);
    this._set('stats_ts_' + s.id, this._nextTs(), true);
    this._markDirty(s.id, 'stats');
    this.triggerSync();
  },

  getFoodFrequency() { const s = this.getSession(); return s ? (this._get('freq_' + s.id) || {}) : {}; },
  incrementFoodFreq(name) {
    const s = this.getSession();
    if (!s) return;
    const f = this.getFoodFrequency();
    f[name] = (f[name] || 0) + 1;
    this._set('freq_' + s.id, f, true);
    this._set('stats_ts_' + s.id, this._nextTs(), true);
    this._markDirty(s.id, 'stats');
    this.triggerSync();
  },

  getFrequentFoods(limit = 10) {
    const f = this.getFoodFrequency();
    return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
  },

  getRecentFoods(limit = 10) {
    const s = this.getSession();
    if (!s) return [];
    this._ensureLegacyMigrated(s.id);
    const map = this._get('diary_items_' + s.id) || {};
    const items = [];
    Object.values(map).forEach(rec => {
      if (!rec || rec.deleted) return;
      items.push({ ...rec.data, date: rec.date_str, mealType: rec.meal_type });
    });
    items.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return items.slice(0, limit);
  },

  getNlpCount() { const s = this.getSession(); return s ? (this._get('nlpc_' + s.id) || 0) : 0; },
  incrementNlpCount() {
    const s = this.getSession();
    if (!s) return;
    this._set('nlpc_' + s.id, this.getNlpCount() + 1, true);
    this._set('stats_ts_' + s.id, this._nextTs(), true);
    this._markDirty(s.id, 'stats');
    this.triggerSync();
  },

  getTotalMeals() { const s = this.getSession(); return s ? (this._get('tm_' + s.id) || 0) : 0; },
  incrementTotalMeals(c = 1) {
    const s = this.getSession();
    if (!s) return;
    this._set('tm_' + s.id, this.getTotalMeals() + c, true);
    this._set('stats_ts_' + s.id, this._nextTs(), true);
    this._markDirty(s.id, 'stats');
    this.triggerSync();
  },

  getWaterLog(dateStr) {
    const s = this.getSession();
    const goal = this.getWaterGoal();
    if (!s) return { total: 0, goal, entries: [] };
    this._ensureLegacyMigrated(s.id);
    const map = this._get('water_entries_' + s.id) || {};
    const entries = Object.values(map)
      .filter(e => e && !e.deleted && e.date_str === dateStr)
      .sort((a, b) => (Number(a.updated_at) || 0) - (Number(b.updated_at) || 0));
    const total = entries.reduce((sum, e) => sum + (Number(e.ml) || 0), 0);
    return { total, goal, entries };
  },

  resetWaterForDate(dateStr) {
    const s = this.getSession();
    if (!s) return;
    this._ensureLegacyMigrated(s.id);
    const map = this._get('water_entries_' + s.id) || {};
    const ts = this._nextTs();
    Object.values(map).forEach(e => {
      if (e && !e.deleted && e.date_str === dateStr) {
        map[e.id] = { ...e, deleted: true, updated_at: ts };
        this._markDirty(s.id, 'waterEntries', e.id);
      }
    });
    this._set('water_entries_' + s.id, map, true);
    this.triggerSync();
  },

  addWater(dateStr, ml) {
    const s = this.getSession();
    if (!s) return { total: 0, goal: 2500, entries: [] };
    this._ensureLegacyMigrated(s.id);
    const map = this._get('water_entries_' + s.id) || {};
    const id = Utils.uuid();
    const ts = this._nextTs();
    map[id] = {
      id,
      date_str: dateStr,
      ml: Math.round(Number(ml) || 0),
      time: new Date().toISOString(),
      updated_at: ts,
      deleted: false
    };
    this._set('water_entries_' + s.id, map, true);
    this._markDirty(s.id, 'waterEntries', id);
    this.triggerSync();
    return this.getWaterLog(dateStr);
  },

  setWaterGoal(ml) {
    const s = this.getSession();
    if (!s) return;
    const ts = this._nextTs();
    this._set('water_goal_' + s.id, ml, true);
    this._set('water_goal_ts_' + s.id, ts, true);
    this._set('stats_ts_' + s.id, ts, true);
    this._markDirty(s.id, 'stats');
    this.triggerSync();
  },

  getWaterGoal() {
    const s = this.getSession();
    return s ? (this._get('water_goal_' + s.id) || 2500) : 2500;
  },

  async resetAllData() {
    const s = this.getSession();
    if (!s) return;
    const prefix = 'caltrack_';
    const userId = s.id;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && key.includes(userId)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    try {
      await fetch('/api/data/reset', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch {
      // Best effort server reset
    }
  }
};
