const BADGES = [
  { id: 'first_log', name: 'First Log', icon: '🍽️', desc: 'Log your first meal' },
  { id: 'streak_3', name: '3-Day Streak', icon: '🔥', desc: '3 consecutive days logged' },
  { id: 'streak_7', name: '7-Day Streak', icon: '🔥', desc: '7 consecutive days logged' },
  { id: 'streak_30', name: '30-Day Warrior', icon: '💪', desc: '30 consecutive days logged' },
  { id: 'bullseye', name: 'Bullseye', icon: '🎯', desc: 'Hit exact calorie target (±50)' },
  { id: 'protein_pro', name: 'Protein Pro', icon: '🥩', desc: 'Hit protein target 5 days in a row' },
  { id: 'data_nerd', name: 'Data Nerd', icon: '📊', desc: 'Log weight 7 days in a row' },
  { id: 'full_day', name: 'Full Day', icon: '📅', desc: 'Log all 4 meal types in one day' },
  { id: 'century', name: 'Century Club', icon: '💯', desc: 'Log 100 total meals' },
  { id: 'consistency', name: 'Consistency King', icon: '🏆', desc: 'Stay within targets for 7 days' },
  { id: 'early_bird', name: 'Early Bird', icon: '🌅', desc: 'Log breakfast before 9 AM' },
  { id: 'quick_logger', name: 'Quick Logger', icon: '⚡', desc: 'Use food scanner 10 times' }
];

window.Achievements = {
  badges: BADGES,

  init() {
    document.addEventListener('meal-logged', (e) => this.onMealLogged(e.detail?.date));
    document.addEventListener('check-achievements', () => this.checkAll());
  },

  onMealLogged(loggedDate) {
    const computed = Store.getComputedStreaks();
    Store.saveStreakData({
      currentStreak: computed.currentStreak,
      longestStreak: computed.longestStreak,
      lastLogDate: computed.lastLogDate
    });
    this.checkAll(loggedDate);
  },

  checkAll(checkDate) {
    const ach = Store.getAchievements();
    const computed = Store.getComputedStreaks();
    const profile = Store.getProfile();
    const today = Utils.todayStr();
    const evalDate = checkDate || today;
    const totals = Store.getDayTotals(evalDate);

    const unlock = (id) => {
      if (!ach[id]?.unlocked) {
        ach[id] = { unlocked: true, unlockedDate: today, updated_at: Date.now() };
        const b = this.badges.find(badge => badge.id === id);
        if (b) Utils.showToast(`🏆 Badge Unlocked: ${b.name}!`, 'success', 4000);
      }
    };

    if (Store.getTotalMeals() >= 1) unlock('first_log');
    if (computed.currentStreak >= 3 || computed.longestStreak >= 3) unlock('streak_3');
    if (computed.currentStreak >= 7 || computed.longestStreak >= 7) unlock('streak_7');
    if (computed.currentStreak >= 30 || computed.longestStreak >= 30) unlock('streak_30');

    if (profile && totals.meals > 0 && Math.abs(totals.calories - profile.tdee) <= 50) unlock('bullseye');

    const diary = Store.getDiary(evalDate);
    if (diary.breakfast.length > 0 && diary.lunch.length > 0 && diary.dinner.length > 0 && diary.snacks.length > 0) unlock('full_day');

    if (Store.getTotalMeals() >= 100) unlock('century');

    if (evalDate === today && diary.breakfast.length > 0 && new Date().getHours() < 9) unlock('early_bird');
    if (Store.getNlpCount() >= 10) unlock('quick_logger');

    if (computed.proteinStreak >= 5) unlock('protein_pro');
    if (computed.weightLogStreak >= 7) unlock('data_nerd');

    if (profile) {
      let c = 0;
      const startOffset = Store.getDayTotals(today).meals > 0 ? 0 : 1;
      for (let i = startOffset; i < startOffset + 7; i++) {
        const t = Store.getDayTotals(Utils.addDays(today, -i));
        if (t.meals > 0 && Math.abs(t.calories - profile.tdee) / profile.tdee <= 0.15) c++;
        else break;
      }
      if (c >= 7) unlock('consistency');
    }

    Store.saveAchievements(ach);
  },

  render() {
    const streak = Store.getComputedStreaks();
    document.getElementById('streak-display').textContent = streak.currentStreak;

    const hero = document.querySelector('.streak-hero');
    if (streak.currentStreak > 0) {
      hero.classList.add('active');
      document.getElementById('streak-message').textContent =
        streak.currentStreak >= 7 ? "You're on fire! Keep it going!" :
        streak.currentStreak >= 3 ? 'Great consistency! Keep building!' :
        'Nice start! Log tomorrow to continue!';
    } else {
      hero.classList.remove('active');
      document.getElementById('streak-message').textContent = 'Log a meal to start your streak!';
    }

    const ach = Store.getAchievements();
    const grid = document.getElementById('badges-grid');
    grid.textContent = '';

    this.badges.forEach(badge => {
      const unlocked = ach[badge.id]?.unlocked;
      const card = document.createElement('div');
      card.className = `badge-card ${unlocked ? 'unlocked' : 'locked'}`;

      const iconEl = document.createElement('span');
      iconEl.className = 'badge-icon';
      iconEl.textContent = badge.icon;

      const nameEl = document.createElement('span');
      nameEl.className = 'badge-name';
      nameEl.textContent = badge.name;

      const descEl = document.createElement('span');
      descEl.className = 'badge-desc';
      descEl.textContent = badge.desc;

      card.appendChild(iconEl);
      card.appendChild(nameEl);
      card.appendChild(descEl);

      if (unlocked && ach[badge.id]?.unlockedDate) {
        const dateEl = document.createElement('span');
        dateEl.className = 'badge-date';
        dateEl.textContent = ach[badge.id].unlockedDate;
        card.appendChild(dateEl);
      }

      grid.appendChild(card);
    });
  }
};
