window.Utils = {
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  },

  formatDiaryDate(dateStr) {
    if (this.isToday(dateStr)) return `Today — ${this._shortDate(dateStr)}`;
    if (this.isYesterday(dateStr)) return `Yesterday — ${this._shortDate(dateStr)}`;
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.toLocaleDateString('en-US',{weekday:'short'})} — ${this._shortDate(dateStr)}`;
  },

  _shortDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  formatShortDate(dateStr) {
    if (this.isToday(dateStr)) return 'Today';
    if (this.isYesterday(dateStr)) return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  },

  animateNumber(el, target, duration = 800, suffix = '') {
    const start = parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0;
    const startTime = performance.now();
    const diff = target - start;
    const step = (ts) => {
      const p = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = this.formatNum(Math.round(start + diff * ease)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  ringOffset(radius, progress) {
    const circ = 2 * Math.PI * radius;
    return circ - circ * Math.min(Math.max(progress, 0), 1);
  },

  ringCircumference(radius) {
    return 2 * Math.PI * radius;
  },

  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'check-circle', warning: 'alert-triangle', error: 'x-circle', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-content"><i data-lucide="${icons[type] || 'info'}"></i><span>${message}</span></div>`;
    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  },

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },

  formatNum(n) {
    return Math.round(n).toLocaleString('en-US');
  },

  addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  getDayName(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  },

  isToday(dateStr) { return dateStr === this.todayStr(); },

  isYesterday(dateStr) { return dateStr === this.addDays(this.todayStr(), -1); },

  calculateNutritionTargets(profile) {
    if (!profile) return {
      tdee: 2000, protein: 150, carbs: 220, fat: 73,
      water: 2500, fiber: 28, sugar: 50, sodium: 2300
    };

    const age = parseInt(profile.age) || 25;
    const gender = profile.gender || 'male';
    let weightKg = parseFloat(profile.weight) || 70;
    if (profile.weightUnit === 'lbs') weightKg = weightKg * 0.453592;

    let heightCm = parseFloat(profile.height) || 175;
    if (profile.heightUnit === 'ft') {
      const ft = parseFloat(profile.heightFt || profile.height) || 5;
      const inch = parseFloat(profile.heightIn || profile.heightInches) || 9;
      heightCm = (ft * 30.48) + (inch * 2.54);
    }

    const activity = parseFloat(profile.activityLevel) || 1.55;
    const goal = profile.goal || 'maintain';
    const tdee = profile.tdee || 2000;

    
    let waterBasePerKg = gender === 'male' ? 35 : 31;
    let activityWaterAdd = 0;
    if (activity >= 1.9) activityWaterAdd = 1200;
    else if (activity >= 1.725) activityWaterAdd = 800;
    else if (activity >= 1.55) activityWaterAdd = 500;
    else if (activity >= 1.375) activityWaterAdd = 250;

    let water = Math.round((weightKg * waterBasePerKg) + activityWaterAdd);
    if (goal === 'cut') water += 300;
    else if (goal === 'bulk') water += 400;

    water = Math.round(water / 50) * 50;
    water = Math.max(1800, Math.min(5000, water));

    
    let fiberFromCals = (tdee / 1000) * 14;
    let genderAgeFiber = (gender === 'male') ? (age <= 50 ? 38 : 30) : (age <= 50 ? 25 : 21);
    let fiber = Math.round((fiberFromCals * 0.65) + (genderAgeFiber * 0.35));
    if (goal === 'cut') fiber += 3;
    fiber = Math.max(20, Math.min(50, fiber));

    
    let sugarPct = (goal === 'cut') ? 0.08 : 0.10;
    let sugar = Math.round((tdee * sugarPct) / 4);
    if (gender === 'female') sugar = Math.min(sugar, Math.round((tdee * 0.09) / 4));
    sugar = Math.max(25, Math.min(85, sugar));

    
    let sodium = 2300;
    if (activity >= 1.9) sodium = 3200;
    else if (activity >= 1.725) sodium = 2800;
    else if (activity >= 1.55) sodium = 2500;
    else if (activity <= 1.2) sodium = 2000;

    if (weightKg > 90) sodium += 200;
    if (goal === 'cut') sodium = Math.max(1800, sodium - 200);

    return {
      tdee,
      protein: profile.protein || Math.round((tdee * 0.30) / 4),
      carbs: profile.carbs || Math.round((tdee * 0.40) / 4),
      fat: profile.fat || Math.round((tdee * 0.30) / 9),
      water,
      fiber,
      sugar,
      sodium
    };
  },
};
