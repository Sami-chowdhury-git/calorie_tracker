/* ═══════════════════════════════════════════ */
/* STORAGE — localStorage abstraction layer    */
/* ═══════════════════════════════════════════ */

window.Store = {
  _key(n) { return 'caltrack_' + n; },
  _get(n) { try { return JSON.parse(localStorage.getItem(this._key(n))); } catch { return null; } },
  _set(n, v, skipSync = false) { 
    localStorage.setItem(this._key(n), JSON.stringify(v)); 
    if (!skipSync && !n.startsWith('session')) this.triggerSync();
  },

  _syncTimeout: null,
  triggerSync() {
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    this._syncTimeout = setTimeout(() => this.syncToServer(), 2000); // Debounce 2s
  },
  
  async syncToServer() {
    const s = this.getSession();
    if (!s) return;
    
    // Gather all local data
    const payload = {
      profile: this.getProfile(),
      diary: [],
      weight: this.getWeightLog(),
      stats: {
        streaks: this.getStreakData(),
        achievements: this.getAchievements(),
        counters: { nlp: this.getNlpCount(), meals: this.getTotalMeals() },
        food_freq: this.getFoodFrequency()
      }
    };
    
    // Gather diary entries
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
      console.log('Data synced to MySQL database successfully');
    } catch (e) {
      console.error('Failed to sync to server', e);
    }
  },

  async syncFromServer() {
    const s = this.getSession();
    if (!s) return;
    try {
      const res = await fetch('/api/data/sync', {
        headers: { 'Authorization': 'Bearer ' + s.id }
      });
      const data = await res.json();
      
      if (data.profile) this._set('profile_' + s.id, data.profile, true);
      if (data.weight) this._set('weight_' + s.id, data.weight.map(w => ({date: w.date_str, weight: w.weight})), true);
      
      if (data.diary) {
        data.diary.forEach(d => {
          this._set('diary_' + s.id + '_' + d.date_str, d.data, true);
        });
      }
      
      if (data.stats) {
        if (data.stats.streaks) this._set('streak_' + s.id, data.stats.streaks, true);
        if (data.stats.achievements) this._set('ach_' + s.id, data.stats.achievements, true);
        if (data.stats.food_freq) this._set('freq_' + s.id, data.stats.food_freq, true);
        if (data.stats.counters) {
          this._set('nlpc_' + s.id, data.stats.counters.nlp, true);
          this._set('tm_' + s.id, data.stats.counters.meals, true);
        }
      }
      console.log('Data synced from MySQL database successfully');
    } catch (e) {
      console.error('Failed to sync from server', e);
    }
  },

  _remove(n) { localStorage.removeItem(this._key(n)); },

  // Users
  getUsers() { return this._get('users') || {}; },
  saveUser(email, data) { const u = this.getUsers(); u[email] = data; this._set('users', u); },

  // Session
  setSession(u) { this._set('session', u); },
  getSession() { return this._get('session'); },
  clearSession() { this._remove('session'); },

  // Profile
  getProfile() { const s = this.getSession(); return s ? this._get('profile_' + s.id) : null; },
  saveProfile(p) { const s = this.getSession(); if (s) this._set('profile_' + s.id, p); },

  // Diary
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
    const t = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
    ['breakfast','lunch','dinner','snacks'].forEach(m => {
      d[m].forEach(i => {
        t.calories += i.calories || 0;
        t.protein += i.protein || 0;
        t.carbs += i.carbs || 0;
        t.fat += i.fat || 0;
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

  // Weight
  getWeightLog() { const s = this.getSession(); return s ? (this._get('weight_' + s.id) || []) : []; },
  saveWeightLog(l) { const s = this.getSession(); if (s) this._set('weight_' + s.id, l); },

  // Streak
  getStreakData() {
    const s = this.getSession();
    return s ? (this._get('streak_' + s.id) || { currentStreak: 0, lastLogDate: null, longestStreak: 0 }) :
      { currentStreak: 0, lastLogDate: null, longestStreak: 0 };
  },
  saveStreakData(d) { const s = this.getSession(); if (s) this._set('streak_' + s.id, d); },

  // Achievements
  getAchievements() { const s = this.getSession(); return s ? (this._get('ach_' + s.id) || {}) : {}; },
  saveAchievements(d) { const s = this.getSession(); if (s) this._set('ach_' + s.id, d); },

  // Food frequency
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

  // Counters
  getNlpCount() { const s = this.getSession(); return s ? (this._get('nlpc_' + s.id) || 0) : 0; },
  incrementNlpCount() { const s = this.getSession(); if (s) this._set('nlpc_' + s.id, this.getNlpCount() + 1); },

  getTotalMeals() { const s = this.getSession(); return s ? (this._get('tm_' + s.id) || 0) : 0; },
  incrementTotalMeals(c = 1) { const s = this.getSession(); if (s) this._set('tm_' + s.id, this.getTotalMeals() + c); },

  // Protein streak
  getProteinStreakData() {
    const s = this.getSession();
    return s ? (this._get('ps_' + s.id) || { streak: 0, lastDate: null }) : { streak: 0, lastDate: null };
  },
  saveProteinStreakData(d) { const s = this.getSession(); if (s) this._set('ps_' + s.id, d); },

  // Weight log streak
  getWeightLogStreak() {
    const s = this.getSession();
    return s ? (this._get('ws_' + s.id) || { streak: 0, lastDate: null }) : { streak: 0, lastDate: null };
  },
  saveWeightLogStreak(d) { const s = this.getSession(); if (s) this._set('ws_' + s.id, d); },

  // Reset all user data
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
    // Also remove coach conversations
    keysToRemove.push(`caltrack_coach_convs_${userId}`);
    keysToRemove.forEach(k => localStorage.removeItem(k));
    // Remove profile
    this._remove('profile_' + userId);
  },
};
