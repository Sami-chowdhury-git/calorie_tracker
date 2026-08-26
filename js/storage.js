/* ═══════════════════════════════════════════ */
/* STORAGE — localStorage + MySQL sync layer   */
/* ═══════════════════════════════════════════ */

window.Store = {
  _key(n) { return 'caltrack_' + n; },
  _get(n) { try { return JSON.parse(localStorage.getItem(this._key(n))); } catch { return null; } },
  _set(n, v, skipSync = false) { 
    localStorage.setItem(this._key(n), JSON.stringify(v)); 
    if (!skipSync && !n.startsWith('session') && !n.startsWith('users')) this.triggerSync();
  },
  _remove(n) { localStorage.removeItem(this._key(n)); },

  /* ── Sync Engine ── */
  _syncTimeout: null,
  _syncing: false,

  triggerSync() {
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(() => this.syncToServer(), 2000);
  },

  async syncToServer() {
    const s = this.getSession();
    if (!s || this._syncing) return;
    this._syncing = true;

    const waterLogs = {};
    const waterPrefix = this._key('water_' + s.id + '_');
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(waterPrefix)) {
        const dateStr = k.replace(waterPrefix, '');
        waterLogs[dateStr] = this.getWaterLog(dateStr);
      }
    }

    const payload = {
      profile: this.getProfile(),
      diary: [],
      weight: this.getWeightLog(),
      stats: {
        streaks: this.getStreakData(),
        achievements: this.getAchievements(),
        counters: {
          nlp: this.getNlpCount(),
          meals: this.getTotalMeals(),
          proteinStreak: this.getProteinStreakData(),
          weightLogStreak: this.getWeightLogStreak(),
          waterLogs,
          waterGoal: this.getWaterGoal()
        },
        food_freq: this.getFoodFrequency()
      },
      coach: this.getCoachData()
    };

    const dates = this.getLoggedDates();
    for (const d of dates) {
      payload.diary.push({ date_str: d, data: this.getDiary(d) });
    }

    try {
      await fetch('/api/data/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + s.id
        },
        body: JSON.stringify(payload)
      });
      console.log('[Sync] Data synced to MySQL');
    } catch (e) {
      console.warn('[Sync] Failed to sync to server:', e.message);
    } finally {
      this._syncing = false;
    }
  },

  async syncFromServer() {
    const s = this.getSession();
    if (!s) return;
    try {
      const res = await fetch('/api/data/sync', {
        headers: { 'Authorization': 'Bearer ' + s.id }
      });
      if (!res.ok) { console.warn('[Sync] Server returned', res.status); return; }
      const data = await res.json();

      if (data.profile) this._set('profile_' + s.id, data.profile, true);

      if (data.weight && Array.isArray(data.weight)) {
        this._set('weight_' + s.id, data.weight.map(w => ({ date: w.date_str, weight: parseFloat(w.weight) })), true);
      }

      if (data.diary && Array.isArray(data.diary)) {
        data.diary.forEach(d => {
          const parsed = typeof d.data === 'string' ? JSON.parse(d.data) : d.data;
          this._set('diary_' + s.id + '_' + d.date_str, parsed, true);
        });
      }

      if (data.stats) {
        const st = data.stats;
        if (st.streaks) {
          const streaks = typeof st.streaks === 'string' ? JSON.parse(st.streaks) : st.streaks;
          this._set('streak_' + s.id, streaks, true);
        }
        if (st.achievements) {
          const ach = typeof st.achievements === 'string' ? JSON.parse(st.achievements) : st.achievements;
          this._set('ach_' + s.id, ach, true);
        }
        if (st.food_freq) {
          const freq = typeof st.food_freq === 'string' ? JSON.parse(st.food_freq) : st.food_freq;
          this._set('freq_' + s.id, freq, true);
        }
        if (st.counters) {
          const c = typeof st.counters === 'string' ? JSON.parse(st.counters) : st.counters;
          if (c.nlp != null) this._set('nlpc_' + s.id, c.nlp, true);
          if (c.meals != null) this._set('tm_' + s.id, c.meals, true);
          if (c.proteinStreak) this._set('ps_' + s.id, c.proteinStreak, true);
          if (c.weightLogStreak) this._set('ws_' + s.id, c.weightLogStreak, true);
          if (c.waterLogs) {
            Object.entries(c.waterLogs).forEach(([dateStr, wlog]) => {
              this._set('water_' + s.id + '_' + dateStr, wlog, true);
            });
          }
          if (c.waterGoal) {
            this._set('water_goal_' + s.id, c.waterGoal, true);
          }
        }
      }

      if (data.coach) {
        const coach = typeof data.coach === 'string' ? JSON.parse(data.coach) : data.coach;
        this._set('coach_convs_' + s.id, coach, true);
      }

      console.log('[Sync] Data synced from MySQL');
    } catch (e) {
      console.warn('[Sync] Failed to sync from server:', e.message);
    }
  },

  /* ── Coach Conversations ── */
  getCoachData() {
    const s = this.getSession();
    if (!s) return null;
    try {
      const raw = localStorage.getItem('caltrack_coach_convs_' + s.id);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  /* ── Users (kept local for backward compat) ── */
  getUsers() { return this._get('users') || {}; },
  saveUser(email, data) { const u = this.getUsers(); u[email] = data; this._set('users', u, true); },

  /* ── Session ── */
  setSession(u) { this._set('session', u, true); },
  getSession() { return this._get('session'); },
  clearSession() { this._remove('session'); },

  /* ── Profile ── */
  getProfile() { const s = this.getSession(); return s ? this._get('profile_' + s.id) : null; },
  saveProfile(p) { const s = this.getSession(); if (s) this._set('profile_' + s.id, p); },

  /* ── Diary ── */
  _emptyDay() { return { breakfast: [], lunch: [], dinner: [], snacks: [] }; },
  getDiary(dateStr) {
    const s = this.getSession();
    return s ? (this._get('diary_' + s.id + '_' + dateStr) || this._emptyDay()) : this._emptyDay();
  },
  saveDiary(dateStr, data) {
    const s = this.getSession();
    if (s) this._set('diary_' + s.id + '_' + dateStr, data);
  },

  getDayTotals(dateStr) {
    const d = this.getDiary(dateStr);
    const t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, meals: 0 };
    ['breakfast','lunch','dinner','snacks'].forEach(m => {
      d[m].forEach(i => {
        t.calories += i.calories || 0;
        t.protein += i.protein || 0;
        t.carbs += i.carbs || 0;
        t.fat += i.fat || 0;
        t.fiber += i.fiber || 0;
        t.sugar += i.sugar || 0;
        t.sodium += i.sodium || 0;
        t.meals++;
      });
    });
    return t;
  },

  getLoggedDates() {
    const s = this.getSession(); if (!s) return [];
    const prefix = this._key('diary_' + s.id + '_');
    const dates = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) dates.push(k.replace(prefix, ''));
    }
    return dates.sort();
  },

  /* ── Weight ── */
  getWeightLog() { const s = this.getSession(); return s ? (this._get('weight_' + s.id) || []) : []; },
  saveWeightLog(l) { const s = this.getSession(); if (s) this._set('weight_' + s.id, l); },

  /* ── Streak ── */
  getStreakData() {
    const s = this.getSession();
    return s ? (this._get('streak_' + s.id) || { currentStreak: 0, lastLogDate: null, longestStreak: 0 }) :
      { currentStreak: 0, lastLogDate: null, longestStreak: 0 };
  },
  saveStreakData(d) { const s = this.getSession(); if (s) this._set('streak_' + s.id, d); },

  /* ── Achievements ── */
  getAchievements() { const s = this.getSession(); return s ? (this._get('ach_' + s.id) || {}) : {}; },
  saveAchievements(d) { const s = this.getSession(); if (s) this._set('ach_' + s.id, d); },

  /* ── Food frequency ── */
  getFoodFrequency() { const s = this.getSession(); return s ? (this._get('freq_' + s.id) || {}) : {}; },
  incrementFoodFreq(name) {
    const f = this.getFoodFrequency(); f[name] = (f[name] || 0) + 1;
    const s = this.getSession(); if (s) this._set('freq_' + s.id, f);
  },
  getFrequentFoods(limit = 10) {
    const f = this.getFoodFrequency();
    return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
  },
  getRecentFoods(limit = 10) {
    const dates = this.getLoggedDates().reverse();
    const items = [];
    for (const dateStr of dates) {
      if (items.length >= limit) break;
      const diary = this.getDiary(dateStr);
      ['breakfast','lunch','dinner','snacks'].forEach(meal => {
        diary[meal].forEach(item => {
          items.push({ ...item, date: dateStr, mealType: meal });
        });
      });
    }
    items.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return items.slice(0, limit);
  },

  /* ── Counters ── */
  getNlpCount() { const s = this.getSession(); return s ? (this._get('nlpc_' + s.id) || 0) : 0; },
  incrementNlpCount() { const s = this.getSession(); if (s) this._set('nlpc_' + s.id, this.getNlpCount() + 1); },

  getTotalMeals() { const s = this.getSession(); return s ? (this._get('tm_' + s.id) || 0) : 0; },
  incrementTotalMeals(c = 1) { const s = this.getSession(); if (s) this._set('tm_' + s.id, this.getTotalMeals() + c); },

  /* ── Protein streak ── */
  getProteinStreakData() {
    const s = this.getSession();
    return s ? (this._get('ps_' + s.id) || { streak: 0, lastDate: null }) : { streak: 0, lastDate: null };
  },
  saveProteinStreakData(d) { const s = this.getSession(); if (s) this._set('ps_' + s.id, d); },

  /* ── Weight log streak ── */
  getWeightLogStreak() {
    const s = this.getSession();
    return s ? (this._get('ws_' + s.id) || { streak: 0, lastDate: null }) : { streak: 0, lastDate: null };
  },
  saveWeightLogStreak(d) { const s = this.getSession(); if (s) this._set('ws_' + s.id, d); },

  /* ── Water Tracking ── */
  getWaterLog(dateStr) {
    const s = this.getSession(); if (!s) return { total: 0, goal: 2500, entries: [] };
    return this._get('water_' + s.id + '_' + dateStr) || { total: 0, goal: 2500, entries: [] };
  },
  saveWaterLog(dateStr, data) {
    const s = this.getSession(); if (s) this._set('water_' + s.id + '_' + dateStr, data);
  },
  addWater(dateStr, ml) {
    const log = this.getWaterLog(dateStr);
    log.total += ml;
    log.entries.push({ ml, time: new Date().toISOString() });
    this.saveWaterLog(dateStr, log);
    return log;
  },
  setWaterGoal(ml) {
    const s = this.getSession(); if (s) this._set('water_goal_' + s.id, ml);
  },
  getWaterGoal() {
    const s = this.getSession(); return s ? (this._get('water_goal_' + s.id) || 2500) : 2500;
  },

  /* ── Reset all user data ── */
  resetAllData() {
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
    keysToRemove.push(`caltrack_coach_convs_${userId}`);
    keysToRemove.forEach(k => localStorage.removeItem(k));
    this._remove('profile_' + userId);

    // Also clear from the MySQL database
    fetch('/api/data/reset', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + userId }
    }).catch(() => {});
  },
};
