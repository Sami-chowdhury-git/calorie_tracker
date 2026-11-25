const BADGES = [
  {
    id: 'first_log',
    name: 'First Log',
    desc: 'Log your first meal',
    paths: [
      ['path', { d: 'M6 4v7a2 2 0 0 0 4 0V4M8 13v7M16 4v16M16 4c2.5 0 4 2.5 4 5.5S18 14 16 14' }]
    ]
  },
  {
    id: 'streak_3',
    name: '3-Day Streak',
    desc: '3 consecutive days logged',
    paths: [
      ['path', { d: 'M12 3c2 3 5 5.5 5 10a5 5 0 1 1-10 0c0-2.8 1.4-4.8 2.8-6.4.4 1.6 1.5 2.4 2.2 2.4V3z' }]
    ]
  },
  {
    id: 'streak_7',
    name: '7-Day Streak',
    desc: '7 consecutive days logged',
    paths: [
      ['circle', { cx: '12', cy: '12', r: '9' }],
      ['path', { d: 'M12 7c1.4 2.1 3.2 3.8 3.2 6.4a3.2 3.2 0 1 1-6.4 0c0-1.7.8-3 1.7-4 .3 1 1 1.5 1.5 1.5V7z' }]
    ]
  },
  {
    id: 'streak_30',
    name: '30-Day Warrior',
    desc: '30 consecutive days logged',
    paths: [
      ['path', { d: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z' }],
      ['path', { d: 'M9 12l2 2 4-4' }]
    ]
  },
  {
    id: 'bullseye',
    name: 'Bullseye',
    desc: 'Hit exact calorie target (+/-50)',
    paths: [
      ['circle', { cx: '12', cy: '12', r: '8' }],
      ['circle', { cx: '12', cy: '12', r: '3.5' }],
      ['path', { d: 'M12 2v2M12 20v2M2 12h2M20 12h2' }]
    ]
  },
  {
    id: 'protein_pro',
    name: 'Protein Pro',
    desc: 'Hit protein target 5 days in a row',
    paths: [
      ['path', { d: 'M12 3l7 4v10l-7 4-7-4V7l7-4z' }],
      ['path', { d: 'M9 12h6M12 9v6' }]
    ]
  },
  {
    id: 'data_nerd',
    name: 'Data Nerd',
    desc: 'Log weight 7 days in a row',
    paths: [
      ['path', { d: 'M4 19h16' }],
      ['path', { d: 'M6 15l4-5 4 3 4-6' }],
      ['circle', { cx: '18', cy: '7', r: '1.5' }]
    ]
  },
  {
    id: 'full_day',
    name: 'Full Day',
    desc: 'Log all 4 meal types in one day',
    paths: [
      ['rect', { x: '4', y: '5', width: '16', height: '15', rx: '2' }],
      ['path', { d: 'M8 3v4M16 3v4M4 10h16' }],
      ['path', { d: 'M9 15l2 2 4-4' }]
    ]
  },
  {
    id: 'century',
    name: 'Century Club',
    desc: 'Log 100 total meals',
    paths: [
      ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '2' }],
      ['path', { d: 'M7 9v6' }],
      ['rect', { x: '10', y: '9', width: '3', height: '6', rx: '1' }],
      ['rect', { x: '15', y: '9', width: '3', height: '6', rx: '1' }]
    ]
  },
  {
    id: 'consistency',
    name: 'Consistency',
    desc: 'Stay within targets for 7 days',
    paths: [
      ['path', { d: 'M4 18h16M5 18L3.5 8l5 4L12 5l3.5 7 5-4L19 18z' }]
    ]
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    desc: 'Log breakfast before 9 AM',
    paths: [
      ['path', { d: 'M12 4v3M5.6 8.6l2.1 2.1M18.4 8.6l-2.1 2.1M3 16h18' }],
      ['path', { d: 'M7 16a5 5 0 0 1 10 0M5 20h14' }]
    ]
  },
  {
    id: 'quick_logger',
    name: 'Quick Logger',
    desc: 'Use AI or barcode scanner 10 times',
    paths: [
      ['path', { d: 'M13 3L5 14h6l-1 7 9-11h-6l0-7z' }]
    ]
  }
];

function createBadgeSvg(shapes) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('svg-icon');

  shapes.forEach(([tag, attrs]) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    svg.appendChild(el);
  });
  return svg;
}

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
        if (b) Utils.showToast(`Badge Unlocked: ${b.name}`, 'success', 4000);
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
        streak.currentStreak >= 7 ? 'Steady streak active. Keep logging daily.' :
        streak.currentStreak >= 3 ? 'Consistent multi-day tracking active.' :
        'First day active. Log tomorrow to continue your streak.';
    } else {
      hero.classList.remove('active');
      document.getElementById('streak-message').textContent = 'Log a meal to start your streak.';
    }

    const ach = Store.getAchievements();
    const grid = document.getElementById('badges-grid');
    grid.textContent = '';

    this.badges.forEach((badge, idx) => {
      const unlocked = ach[badge.id]?.unlocked;
      const card = document.createElement('div');
      card.className = `badge-card ${unlocked ? 'unlocked' : 'locked'}`;
      card.style.animationDelay = `${idx * 30}ms`;

      const iconEl = document.createElement('span');
      iconEl.className = 'badge-icon';
      iconEl.appendChild(createBadgeSvg(badge.paths));

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
