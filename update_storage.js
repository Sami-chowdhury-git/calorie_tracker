const fs = require('fs');

const storagePath = 'e:\\calories tracker\\js\\storage.js';
let storageCode = fs.readFileSync(storagePath, 'utf8');

// Insert sync logic at the beginning of the object
const syncMethods = `
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
`;

// Modify _set to trigger sync
storageCode = storageCode.replace(
  `_set(n, v) { localStorage.setItem(this._key(n), JSON.stringify(v)); },`,
  `_set(n, v, skipSync = false) { 
    localStorage.setItem(this._key(n), JSON.stringify(v)); 
    if (!skipSync && !n.startsWith('session')) this.triggerSync();
  },
${syncMethods}`
);

fs.writeFileSync(storagePath, storageCode);
console.log('storage.js updated');
