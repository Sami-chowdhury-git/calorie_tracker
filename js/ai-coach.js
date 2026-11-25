window.AICoach = (() => {
  let conversations = [];
  let activeConvId = null;
  const MAX_HISTORY = 30;

  function createSvg(paths) {
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
    paths.forEach(([tag, attrs]) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    return svg;
  }

  function init() {
    const input = document.getElementById('coach-input');
    const sendBtn = document.getElementById('coach-send-btn');

    input.addEventListener('input', () => {
      sendBtn.disabled = !input.value.trim();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);

    document.getElementById('coach-new-chat-btn')?.addEventListener('click', () => {
      createNewConversation();
    });

    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.q;
        sendBtn.disabled = false;
        sendMessage();
      });
    });

    reload();
  }

  function reload() {
    const session = Store.getSession();
    if (!session) {
      resetMemory();
      return;
    }
    loadConversations();
    const visible = conversations.filter(c => !c.deleted);
    if (visible.length === 0) {
      createNewConversation();
    } else {
      if (!activeConvId || !visible.some(c => c.id === activeConvId)) {
        activeConvId = visible[0].id;
      }
      renderTabBar();
      renderChat();
    }
  }

  function resetMemory() {
    conversations = [];
    activeConvId = null;
    const tabBar = document.getElementById('coach-tabs-bar');
    if (tabBar) tabBar.textContent = '';
    renderChat();
  }

  function loadConversations() {
    const data = Store.getCoachData();
    if (data) {
      conversations = Array.isArray(data.conversations) ? data.conversations : [];
      activeConvId = data.activeConvId || null;
    } else {
      conversations = [];
      activeConvId = null;
    }
  }

  function saveConversations(changedIds = []) {
    const session = Store.getSession();
    if (!session) return;
    const payload = conversations.map(c => ({
      ...c,
      messages: (c.messages || []).slice(-MAX_HISTORY * 2)
    }));
    Store.saveCoachData(payload, activeConvId, changedIds);
  }

  function createNewConversation() {
    const id = 'conv_' + Utils.uuid().slice(0, 12);
    const now = Date.now();
    const conv = {
      id,
      title: 'New Chat',
      messages: [],
      updated_at: now,
      deleted: false
    };
    conversations.unshift(conv);
    activeConvId = id;
    saveConversations([id]);
    renderTabBar();
    renderChat();
  }

  function switchToConversation(id) {
    activeConvId = id;
    saveConversations([]);
    renderTabBar();
    renderChat();
  }

  function deleteConversation(id) {
    const target = conversations.find(c => c.id === id);
    if (target) {
      target.deleted = true;
      target.updated_at = Date.now();
    }
    const visible = conversations.filter(c => !c.deleted);
    if (activeConvId === id) {
      activeConvId = visible.length > 0 ? visible[0].id : null;
    }
    if (visible.length === 0) {
      saveConversations([id]);
      createNewConversation();
      return;
    }
    saveConversations([id]);
    renderTabBar();
    renderChat();
  }

  function getActiveConversation() {
    return conversations.find(c => c.id === activeConvId && !c.deleted);
  }

  function renderTabBar() {
    const tabBar = document.getElementById('coach-tabs-bar');
    if (!tabBar) return;
    tabBar.textContent = '';

    const visible = conversations.filter(c => !c.deleted);
    visible.forEach(conv => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `coach-tab ${conv.id === activeConvId ? 'active' : ''}`;
      btn.dataset.convId = conv.id;
      btn.title = conv.title || 'Chat';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'coach-tab-title';
      titleSpan.textContent = conv.title || 'New Chat';
      btn.appendChild(titleSpan);

      if (visible.length > 1) {
        const closeSpan = document.createElement('span');
        closeSpan.className = 'coach-tab-close';
        closeSpan.textContent = '×';
        closeSpan.setAttribute('aria-label', `Close ${conv.title || 'chat'}`);
        closeSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteConversation(conv.id);
        });
        btn.appendChild(closeSpan);
      }

      btn.addEventListener('click', () => switchToConversation(conv.id));
      tabBar.appendChild(btn);
    });
  }

  function renderChat() {
    const chatEl = document.getElementById('coach-chat');
    if (!chatEl) return;
    chatEl.textContent = '';

    const conv = getActiveConversation();
    if (!conv || conv.messages.length === 0) {
      const welcome = document.createElement('div');
      welcome.className = 'coach-welcome';

      const botSvg = createSvg([
        ['path', { d: 'M4 5h16v11H9l-5 4V5z' }],
        ['path', { d: 'M8 10h8M8 13h5' }]
      ]);

      const h3 = document.createElement('h3');
      h3.textContent = 'MacroLens AI Coach';

      const p = document.createElement('p');
      p.textContent = 'Ask about your logged meals, remaining macro targets, hydration, weight trends, or training plan.';

      const chipsDiv = document.createElement('div');
      chipsDiv.className = 'coach-suggestion-chips';

      const suggestions = [
        [
          "Today's progress",
          'How am I doing today? Analyze my meals and macros.',
          [['path', { d: 'M4 19h16M7 15v-4M12 15V7M17 15v-7' }]]
        ],
        [
          'What to eat next',
          'What should I eat for my next meal to hit my remaining macros?',
          [['path', { d: 'M5 4v7a2 2 0 0 0 4 0V4M7 13v7M16 4v16' }]]
        ],
        [
          'Weekly analysis',
          'Analyze my eating patterns from the past week. Am I on track?',
          [['path', { d: 'M4 17l5-5 4 4 7-8M15 8h5v5' }]]
        ],
        [
          'Hydration check',
          "Am I drinking enough water today? How's my hydration?",
          [['path', { d: 'M12 3.5C12 3.5 6 10.5 6 14.5a6 6 0 0 0 12 0c0-4-6-11-6-11z' }]]
        ]
      ];

      suggestions.forEach(([label, q, paths]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip';
        chip.dataset.q = q;
        chip.appendChild(createSvg(paths));
        chip.appendChild(document.createTextNode(label));
        chip.addEventListener('click', () => {
          document.getElementById('coach-input').value = q;
          document.getElementById('coach-send-btn').disabled = false;
          sendMessage();
        });
        chipsDiv.appendChild(chip);
      });

      welcome.appendChild(botSvg);
      welcome.appendChild(h3);
      welcome.appendChild(p);
      welcome.appendChild(chipsDiv);
      chatEl.appendChild(welcome);
      return;
    }

    conv.messages.forEach(msg => {
      appendBubble(msg.text, msg.role, false);
    });
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function appendBubble(text, role, scroll = true) {
    const chatEl = document.getElementById('coach-chat');
    const welcome = chatEl.querySelector('.coach-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-message ${role}`;

    if (role === 'ai') {
      const msgText = document.createElement('div');
      msgText.className = 'msg-text';
      msgText.innerHTML = formatCoachResponse(text);
      bubble.appendChild(msgText);
    } else {
      bubble.textContent = text;
    }

    chatEl.appendChild(bubble);
    if (scroll) chatEl.scrollTop = chatEl.scrollHeight;
    return bubble;
  }

  function formatCoachResponse(text) {
    const escaped = Utils.escapeHtml(String(text ?? ''));
    const formatted = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    return Utils.sanitizeHtml(formatted, ['strong', 'em', 'br']);
  }

  function showTyping() {
    const chatEl = document.getElementById('coach-chat');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing-indicator';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'typing-dot';
      indicator.appendChild(dot);
    }
    chatEl.appendChild(indicator);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  function gatherUserContext() {
    const profile = Store.getProfile();
    const today = Utils.todayStr();
    const todayTotals = Store.getDayTotals(today);
    const diary = Store.getDiary(today);
    const streak = Store.getComputedStreaks();
    const weightLog = Store.getWeightLog();
    const freqFoods = Store.getFrequentFoods(15);
    const achievements = Store.getAchievements();
    const targets = Utils.calculateNutritionTargets(profile);
    const waterLog = Store.getWaterLog(today);
    const waterGoal = targets.water || Store.getWaterGoal();

    let ctx = '\n\nUSER DATA CONTEXT (from MacroLens app - use this to give personalized, data-driven advice):\n';
    ctx += '=== IMPORTANT: This is REAL logged data from the user\'s app. Reference specific numbers, food names, and trends when the user asks about their progress. ===\n';

    const weightUnit = profile?.weightUnit === 'lbs' ? 'lbs' : 'kg';

    if (profile) {
      const heightDisplay = profile.heightUnit === 'ft'
        ? `${profile.heightFt ?? '?'}ft ${profile.heightIn ?? 0}in (${Math.round(profile.heightCm || 0)}cm)`
        : `${Math.round(profile.heightCm || profile.height || 0)}cm`;
      ctx += '\n--- USER PROFILE ---\n';
      ctx += `Name: ${profile.name || 'User'}\n`;
      ctx += `Age: ${profile.age || '?'} years | Gender: ${profile.gender || '?'}\n`;
      ctx += `Weight: ${profile.weight || '?'}${weightUnit} | Height: ${heightDisplay}\n`;
      ctx += `Goal: ${profile.goal || 'maintain'} | Activity multiplier: ${profile.activityLevel || '?'}x\n`;
    }

    ctx += '\n--- DAILY TARGETS (personalized to this user) ---\n';
    ctx += `Calories: ${targets.tdee} kcal\n`;
    ctx += `Protein: ${targets.protein}g | Carbs: ${targets.carbs}g | Fat: ${targets.fat}g\n`;
    ctx += `Water: ${targets.water}ml | Fiber: ${targets.fiber}g | Sugar limit: ${targets.sugar}g | Sodium limit: ${targets.sodium}mg\n`;

    ctx += `\n--- TODAY'S INTAKE (${today}) ---\n`;
    ctx += `Calories consumed: ${todayTotals.calories} / ${targets.tdee} kcal (${Math.round((todayTotals.calories / targets.tdee) * 100)}%)\n`;
    ctx += `Protein: ${Math.round(todayTotals.protein)}g / ${targets.protein}g (${Math.round((todayTotals.protein / targets.protein) * 100)}%)\n`;
    ctx += `Carbs: ${Math.round(todayTotals.carbs)}g / ${targets.carbs}g (${Math.round((todayTotals.carbs / targets.carbs) * 100)}%)\n`;
    ctx += `Fat: ${Math.round(todayTotals.fat)}g / ${targets.fat}g (${Math.round((todayTotals.fat / targets.fat) * 100)}%)\n`;
    ctx += `Fiber: ${Math.round(todayTotals.fiber)}g / ${targets.fiber}g | Sugar: ${Math.round(todayTotals.sugar)}g / ${targets.sugar}g | Sodium: ${Math.round(todayTotals.sodium)}mg / ${targets.sodium}mg\n`;

    const remainCal = Math.max(0, targets.tdee - todayTotals.calories);
    const remainP = Math.max(0, targets.protein - Math.round(todayTotals.protein));
    const remainC = Math.max(0, targets.carbs - Math.round(todayTotals.carbs));
    const remainF = Math.max(0, targets.fat - Math.round(todayTotals.fat));
    ctx += `\nRemaining today: ${remainCal} kcal | P: ${remainP}g | C: ${remainC}g | F: ${remainF}g\n`;

    ctx += `Water intake: ${waterLog.total}ml / ${waterGoal}ml (${Math.round((waterLog.total / waterGoal) * 100)}%)\n`;

    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'];
    let hasMeals = false;
    mealTypes.forEach(mealType => {
      if (diary[mealType] && diary[mealType].length > 0) {
        hasMeals = true;
        ctx += `\n${mealType.charAt(0).toUpperCase() + mealType.slice(1)}:\n`;
        diary[mealType].forEach(item => {
          ctx += `  - ${item.name}`;
          if (item.quantity && item.quantity > 1) ctx += ` x${item.quantity}`;
          ctx += ` | ${item.calories} kcal | P:${Math.round(item.protein || 0)}g C:${Math.round(item.carbs || 0)}g F:${Math.round(item.fat || 0)}g`;
          if (item.fiber) ctx += ` | Fiber:${Math.round(item.fiber)}g`;
          if (item.sugar) ctx += ` | Sugar:${Math.round(item.sugar)}g`;
          if (item.sodium) ctx += ` | Sodium:${Math.round(item.sodium)}mg`;
          ctx += '\n';
        });
      }
    });
    if (!hasMeals) {
      ctx += '\nNo meals logged yet today.\n';
    }

    const loggedDates = Store.getLoggedDates().slice(-7);
    if (loggedDates.length > 1) {
      ctx += `\n--- LAST ${loggedDates.length} DAYS SUMMARY ---\n`;
      let weekCals = 0, weekP = 0, weekC = 0, weekF = 0, weekFiber = 0, weekSugar = 0, weekSodium = 0;
      let daysCount = 0;
      loggedDates.forEach(d => {
        const dt = Store.getDayTotals(d);
        const dayDiary = Store.getDiary(d);
        let mealCount = 0;
        mealTypes.forEach(m => { mealCount += dayDiary[m].length; });
        if (mealCount > 0) {
          ctx += `  ${d}: ${dt.calories} kcal (P:${Math.round(dt.protein)}g C:${Math.round(dt.carbs)}g F:${Math.round(dt.fat)}g | Fiber:${Math.round(dt.fiber)}g Sugar:${Math.round(dt.sugar)}g Sodium:${Math.round(dt.sodium)}mg) - ${mealCount} items\n`;
          weekCals += dt.calories;
          weekP += dt.protein;
          weekC += dt.carbs;
          weekF += dt.fat;
          weekFiber += dt.fiber;
          weekSugar += dt.sugar;
          weekSodium += dt.sodium;
          daysCount++;
        }
      });
      if (daysCount > 1) {
        ctx += `\n  Weekly Average: ${Math.round(weekCals / daysCount)} kcal/day | P:${Math.round(weekP / daysCount)}g C:${Math.round(weekC / daysCount)}g F:${Math.round(weekF / daysCount)}g | Fiber:${Math.round(weekFiber / daysCount)}g Sugar:${Math.round(weekSugar / daysCount)}g Sodium:${Math.round(weekSodium / daysCount)}mg\n`;
        const avgVsTarget = Math.round(weekCals / daysCount) - targets.tdee;
        if (avgVsTarget > 100) ctx += `  Averaging ${avgVsTarget} kcal ABOVE target per day\n`;
        else if (avgVsTarget < -100) ctx += `  Averaging ${Math.abs(avgVsTarget)} kcal BELOW target per day\n`;
        else ctx += '  On track - averaging within 100 kcal of target\n';
      }
    }

    ctx += '\n--- STREAKS & CONSISTENCY ---\n';
    ctx += `Current logging streak: ${streak.currentStreak} days | Longest ever: ${streak.longestStreak} days\n`;
    ctx += `Total meals logged: ${Store.getTotalMeals()}\n`;
    ctx += `AI scans used: ${Store.getNlpCount()}\n`;

    if (weightLog.length > 0) {
      ctx += '\n--- WEIGHT HISTORY ---\n';
      const toDisplay = (kg) => (weightUnit === 'lbs' ? window.Nutrition.kgToLbs(kg) : kg);
      const recent = weightLog.slice(-10);
      recent.forEach(w => {
        ctx += `  ${w.date}: ${toDisplay(w.weight)}${weightUnit}\n`;
      });
      if (weightLog.length >= 2) {
        const first = toDisplay(weightLog[0].weight);
        const last = toDisplay(weightLog[weightLog.length - 1].weight);
        const diff = (last - first).toFixed(1);
        ctx += `  Total change: ${diff > 0 ? '+' : ''}${diff}${weightUnit} (from ${first}${weightUnit} to ${last}${weightUnit} over ${weightLog.length} entries)\n`;
      }
    }

    if (freqFoods.length > 0) {
      ctx += '\n--- MOST EATEN FOODS ---\n';
      freqFoods.forEach(f => {
        ctx += `  ${f.name}: logged ${f.count} times\n`;
      });
    }

    if (achievements && Object.keys(achievements).length > 0) {
      ctx += '\n--- UNLOCKED ACHIEVEMENTS ---\n';
      const achNames = Object.keys(achievements).filter(k => achievements[k]?.unlocked);
      if (achNames.length) ctx += `  ${achNames.join(', ')}\n`;
    }

    return ctx;
  }

  async function sendMessage() {
    const input = document.getElementById('coach-input');
    const sendBtn = document.getElementById('coach-send-btn');
    const text = input.value.trim();
    if (!text) return;

    const conv = getActiveConversation();
    if (!conv) return;

    const userMsg = {
      id: Utils.uuid(),
      role: 'user',
      text,
      createdAt: Date.now()
    };

    appendBubble(text, 'user');
    conv.messages.push(userMsg);
    conv.updated_at = Date.now();

    if (conv.messages.length === 1) {
      conv.title = text.length > 30 ? text.substring(0, 30) + '...' : text;
      renderTabBar();
    }

    input.value = '';
    sendBtn.disabled = true;
    showTyping();

    try {
      const context = gatherUserContext();
      const reply = await Gemini.askCoach(text, conv.messages.slice(-MAX_HISTORY), context);
      hideTyping();
      appendBubble(reply, 'ai');
      conv.messages.push({
        id: Utils.uuid(),
        role: 'ai',
        text: reply,
        createdAt: Date.now()
      });
      conv.updated_at = Date.now();
      saveConversations([conv.id]);
    } catch (err) {
      hideTyping();
      appendBubble("Sorry, I couldn't process that. Please try again.", 'ai');
      console.error('Coach error:', err);
    }
  }

  function refresh() {
    reload();
    if (window.lucide) lucide.createIcons();
  }

  return { init, reload, resetMemory, refresh };
})();
