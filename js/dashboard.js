



window.Dashboard = {
  init() {
    document.getElementById('quick-add-btn').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('open-meal-log'));
    });
    document.getElementById('dash-view-diary-btn').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'diary' } }));
    });

    
    document.getElementById('dash-edit-macros-btn')?.addEventListener('click', () => {
      const form = document.getElementById('custom-macros-form');
      const isHidden = form.classList.contains('hidden');
      form.classList.toggle('hidden');
      if (isHidden) {
        
        const profile = Store.getProfile();
        if (profile) {
          document.getElementById('custom-calories').value = profile.tdee || '';
          document.getElementById('custom-protein').value = profile.protein || '';
          document.getElementById('custom-carbs').value = profile.carbs || '';
          document.getElementById('custom-fat').value = profile.fat || '';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });

    
    document.getElementById('custom-macros-save-btn')?.addEventListener('click', () => {
      const calories = parseInt(document.getElementById('custom-calories').value);
      const protein = parseInt(document.getElementById('custom-protein').value);
      const carbs = parseInt(document.getElementById('custom-carbs').value);
      const fat = parseInt(document.getElementById('custom-fat').value);

      if (!calories || calories < 800) {
        Utils.showToast('Please enter valid calories (min 800)', 'warning');
        return;
      }

      const profile = Store.getProfile();
      if (!profile) return;

      profile.tdee = calories;
      if (protein > 0) profile.protein = protein;
      if (carbs > 0) profile.carbs = carbs;
      if (fat > 0) profile.fat = fat;

      Store.saveProfile(profile);
      document.getElementById('custom-macros-form').classList.add('hidden');
      Utils.showToast(`Custom macros saved! Target: ${calories} kcal`, 'success');
      this.refresh();
    });

    
    document.querySelectorAll('.water-btn[data-ml]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ml = parseInt(btn.dataset.ml);
        const today = Utils.todayStr();
        Store.addWater(today, ml);
        this.renderWaterTracker();
        Utils.showToast(`💧 Added +${ml}ml water`, 'success', 2000);
      });
    });

    document.getElementById('water-custom-btn')?.addEventListener('click', () => {
      const input = window.prompt('Enter water amount in ml (e.g. 350):', '250');
      if (input !== null && input.trim() !== '') {
        const ml = parseInt(input);
        if (!isNaN(ml) && ml > 0 && ml <= 5000) {
          const today = Utils.todayStr();
          Store.addWater(today, ml);
          this.renderWaterTracker();
          Utils.showToast(`💧 Added +${ml}ml water`, 'success', 2000);
        } else {
          Utils.showToast('Please enter a valid amount (1–5000 ml)', 'warning');
        }
      }
    });

    document.getElementById('water-reset-btn')?.addEventListener('click', () => {
      const today = Utils.todayStr();
      Store.saveWaterLog(today, { total: 0, goal: Store.getWaterGoal(), entries: [] });
      this.renderWaterTracker();
      Utils.showToast('Water reset for today', 'info', 2000);
    });
  },

  refresh() {
    const profile = Store.getProfile();
    if (!profile) return;
    const session = Auth.getCurrentUser();

    
    const firstName = (session?.name || profile.name || 'there').split(' ')[0];
    document.getElementById('greeting-text').textContent = `${Utils.getGreeting()}, ${firstName}`;
    document.getElementById('current-date').textContent = Utils.formatDate(Utils.todayStr());

    
    const t = Store.getDayTotals(Utils.todayStr());
    const target = profile.tdee;
    const remaining = Math.max(0, target - t.calories);

    
    this.updateRing('calorie-ring-fill', 85, t.calories / target);
    document.getElementById('calories-remaining').textContent = Utils.formatNum(remaining);
    document.getElementById('calories-consumed').textContent = Utils.formatNum(t.calories);
    document.getElementById('calories-target').textContent = Utils.formatNum(target);

    
    const rf = document.getElementById('calorie-ring-fill');
    rf.classList.remove('warning', 'danger');
    if (t.calories / target > 1) rf.classList.add('danger');
    else if (t.calories / target > 0.8) rf.classList.add('warning');

    
    this.updateMacro('protein', t.protein, profile.protein);
    this.updateMacro('carbs', t.carbs, profile.carbs);
    this.updateMacro('fat', t.fat, profile.fat);

    
    const targets = Utils.calculateNutritionTargets(profile);
    this.renderMicronutrients(t, targets);
    this.renderWaterTracker(targets);

    
    document.getElementById('meals-logged-count').textContent = t.meals;
    document.getElementById('dash-streak-count').textContent = Store.getStreakData().currentStreak;
    const ach = Store.getAchievements();
    document.getElementById('dash-badges-count').textContent = Object.values(ach).filter(b => b.unlocked).length;

    
    this.renderMealsPreview();
  },

  renderMicronutrients(totals, targets) {
    const profile = Store.getProfile();
    const t = targets || Utils.calculateNutritionTargets(profile);

    const fiberEl = document.getElementById('fiber-consumed');
    const sugarEl = document.getElementById('sugar-consumed');
    const sodiumEl = document.getElementById('sodium-consumed');

    const fiberTargetEl = document.getElementById('fiber-target');
    const sugarTargetEl = document.getElementById('sugar-target');
    const sodiumTargetEl = document.getElementById('sodium-target');

    const fiberBar = document.getElementById('fiber-bar-fill');
    const sugarBar = document.getElementById('sugar-bar-fill');
    const sodiumBar = document.getElementById('sodium-bar-fill');

    const fiber = Math.round((totals.fiber || 0) * 10) / 10;
    const sugar = Math.round((totals.sugar || 0) * 10) / 10;
    const sodium = Math.round(totals.sodium || 0);

    const fiberTarget = t.fiber || 28;
    const sugarLimit = t.sugar || 50;
    const sodiumLimit = t.sodium || 2300;

    if (fiberEl) fiberEl.textContent = fiber;
    if (sugarEl) sugarEl.textContent = sugar;
    if (sodiumEl) sodiumEl.textContent = sodium;

    if (fiberTargetEl) fiberTargetEl.textContent = `${fiberTarget}g`;
    if (sugarTargetEl) sugarTargetEl.textContent = `<${sugarLimit}g`;
    if (sodiumTargetEl) sodiumTargetEl.textContent = `<${sodiumLimit}mg`;

    if (fiberBar) {
      const pct = Math.min(100, Math.round((fiber / fiberTarget) * 100));
      fiberBar.style.width = `${pct}%`;
    }
    if (sugarBar) {
      const pct = Math.min(100, Math.round((sugar / sugarLimit) * 100));
      sugarBar.style.width = `${pct}%`;
      if (sugar > sugarLimit) sugarBar.classList.add('exceeded');
      else sugarBar.classList.remove('exceeded');
    }
    if (sodiumBar) {
      const pct = Math.min(100, Math.round((sodium / sodiumLimit) * 100));
      sodiumBar.style.width = `${pct}%`;
      if (sodium > sodiumLimit) sodiumBar.classList.add('exceeded');
      else sodiumBar.classList.remove('exceeded');
    }
  },

  renderWaterTracker(targets) {
    const today = Utils.todayStr();
    const water = Store.getWaterLog(today);
    const profile = Store.getProfile();
    const t = targets || Utils.calculateNutritionTargets(profile);
    const goal = t.water || water.goal || Store.getWaterGoal() || 2500;
    const total = water.total || 0;

    const currentEl = document.getElementById('water-current');
    const goalEl = document.getElementById('water-goal-display');
    const barEl = document.getElementById('water-progress-bar');
    const badgeEl = document.getElementById('water-percent-badge');

    if (currentEl) currentEl.textContent = Utils.formatNum(total);
    if (goalEl) goalEl.textContent = Utils.formatNum(goal);

    const pct = Math.min(100, Math.round((total / goal) * 100));
    if (barEl) barEl.style.width = `${pct}%`;
    if (badgeEl) {
      badgeEl.textContent = `${pct}%`;
      if (pct >= 100) badgeEl.classList.add('goal-reached');
      else badgeEl.classList.remove('goal-reached');
    }
  },

  updateRing(id, radius, progress) {
    const el = document.getElementById(id);
    const circ = Utils.ringCircumference(radius);
    el.style.strokeDasharray = circ;
    el.style.strokeDashoffset = Utils.ringOffset(radius, Math.min(progress, 1));
  },

  updateMacro(macro, consumed, target) {
    const ringId = macro + '-ring-fill';
    this.updateRing(ringId, 32, consumed / target);
    document.getElementById(macro + '-consumed').textContent = Math.round(consumed);
    document.getElementById(macro + '-target').textContent = Math.round(target);

    const el = document.getElementById(ringId);
    el.classList.remove('warning', 'danger');
    if (consumed / target > 1) el.classList.add('danger');
    else if (consumed / target > 0.8) el.classList.add('warning');
  },

  renderMealsPreview() {
    const diary = Store.getDiary(Utils.todayStr());
    const container = document.getElementById('dash-meals-list');
    const all = [];
    ['breakfast','lunch','dinner','snacks'].forEach(m => {
      diary[m].forEach(item => all.push({ ...item, meal: m }));
    });

    if (all.length === 0) {
      container.innerHTML = '<div class="empty-state-mini"><i data-lucide="plus-circle"></i><p>No meals logged yet. Tap + to add your first meal!</p></div>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    container.innerHTML = all.slice(-5).map(item => `
      <div class="meal-preview-item">
        <div class="meal-preview-info">
          <span class="meal-preview-name">${item.name}</span>
          <span class="meal-preview-meal">${item.meal}</span>
        </div>
        <span class="meal-preview-cals">${item.calories} kcal</span>
      </div>
    `).join('');
  },
};
