



window.AICoach = (() => {
  let conversations = []; 
  let activeConvId = null;
  const MAX_HISTORY = 30;
  const STORAGE_KEY = 'caltrack_coach_convs';

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

    
    loadConversations();
    renderTabBar();

    if (conversations.length === 0) {
      createNewConversation();
    } else {
      switchToConversation(activeConvId || conversations[0].id);
    }
  }

  function loadConversations() {
    const session = Store.getSession();
    if (!session) return;
    try {
      const data = Store._get('coach_convs_' + session.id);
      if (data) {
        conversations = data.conversations || [];
        activeConvId = data.activeConvId || null;
      }
    } catch (e) { conversations = []; }
  }

  function saveConversations() {
    const session = Store.getSession();
    if (!session) return;
    Store._set('coach_convs_' + session.id, {
      conversations: conversations.map(c => ({
        ...c,
        messages: c.messages.slice(-MAX_HISTORY * 2)
      })),
      activeConvId
    });
  }

  function createNewConversation() {
    const id = 'conv_' + Date.now();
    const conv = {
      id,
      title: 'New Chat',
      messages: []
    };
    conversations.unshift(conv);
    activeConvId = id;
    saveConversations();
    renderTabBar();
    renderChat();
  }

  function switchToConversation(id) {
    activeConvId = id;
    saveConversations();
    renderTabBar();
    renderChat();
  }

  function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (activeConvId === id) {
      activeConvId = conversations.length > 0 ? conversations[0].id : null;
    }
    if (conversations.length === 0) {
      createNewConversation();
      return;
    }
    saveConversations();
    renderTabBar();
    renderChat();
  }

  function getActiveConversation() {
    return conversations.find(c => c.id === activeConvId);
  }

  function renderTabBar() {
    const tabBar = document.getElementById('coach-tabs-bar');
    if (!tabBar) return;

    tabBar.innerHTML = conversations.map(conv => `
      <button class="coach-tab ${conv.id === activeConvId ? 'active' : ''}" 
              data-conv-id="${conv.id}" title="${conv.title}">
        <span class="coach-tab-title">${conv.title}</span>
        ${conversations.length > 1 ? `<span class="coach-tab-close" data-close-id="${conv.id}">&times;</span>` : ''}
      </button>
    `).join('');

    
    tabBar.querySelectorAll('.coach-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('coach-tab-close')) {
          e.stopPropagation();
          deleteConversation(e.target.dataset.closeId);
          return;
        }
        switchToConversation(tab.dataset.convId);
      });
    });
  }

  function renderChat() {
    const chatEl = document.getElementById('coach-chat');
    chatEl.innerHTML = '';

    const conv = getActiveConversation();
    if (!conv || conv.messages.length === 0) {
      chatEl.innerHTML = `
        <div class="coach-welcome">
          <i data-lucide="bot"></i>
          <h3>Hey! I'm your AI fitness coach 💪</h3>
          <p>I have full access to your MacroLens data — your meals, macros, calories, water intake, weight history, and progress. Ask me anything!</p>
          <div class="coach-suggestion-chips">
            <button class="suggestion-chip" data-q="How am I doing today? Analyze my meals and macros.">📊 Today's progress</button>
            <button class="suggestion-chip" data-q="What should I eat for my next meal to hit my remaining macros?">🍽️ What to eat next</button>
            <button class="suggestion-chip" data-q="Analyze my eating patterns from the past week. Am I on track?">📈 Weekly analysis</button>
            <button class="suggestion-chip" data-q="Am I drinking enough water today? How's my hydration?">💧 Hydration check</button>
          </div>
        </div>
      `;
      
      chatEl.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          document.getElementById('coach-input').value = chip.dataset.q;
          document.getElementById('coach-send-btn').disabled = false;
          sendMessage();
        });
      });
      if (typeof lucide !== 'undefined') lucide.createIcons();
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
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function showTyping() {
    const chatEl = document.getElementById('coach-chat');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
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
    const streak = Store.getStreakData();
    const weightLog = Store.getWeightLog();
    const freqFoods = Store.getFrequentFoods(15);
    const achievements = Store.getAchievements();
    const targets = Utils.calculateNutritionTargets(profile);
    const waterLog = Store.getWaterLog(today);
    const waterGoal = Store.getWaterGoal();

    let ctx = `\n\nUSER DATA CONTEXT (from MacroLens app — use this to give personalized, data-driven advice):\n`;
    ctx += `=== IMPORTANT: This is REAL logged data from the user's app. Reference specific numbers, food names, and trends when the user asks about their progress. ===\n`;

    if (profile) {
      ctx += `\n--- USER PROFILE ---\n`;
      ctx += `Name: ${profile.name || 'User'}\n`;
      ctx += `Age: ${profile.age || '?'} years | Gender: ${profile.gender || '?'}\n`;
      ctx += `Weight: ${profile.weight || '?'}${profile.weightUnit === 'lbs' ? 'lbs' : 'kg'} | Height: ${Math.round(profile.height || 0)}${profile.heightUnit === 'ft' ? 'ft' : 'cm'}\n`;
      ctx += `Goal: ${profile.goal || 'maintain'} | Activity multiplier: ${profile.activityLevel || '?'}x\n`;
    }

    ctx += `\n--- DAILY TARGETS (personalized to this user) ---\n`;
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
          ctx += `\n`;
        });
      }
    });
    if (!hasMeals) {
      ctx += `\nNo meals logged yet today.\n`;
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
          ctx += `  ${d}: ${dt.calories} kcal (P:${Math.round(dt.protein)}g C:${Math.round(dt.carbs)}g F:${Math.round(dt.fat)}g | Fiber:${Math.round(dt.fiber)}g Sugar:${Math.round(dt.sugar)}g Sodium:${Math.round(dt.sodium)}mg) — ${mealCount} items\n`;
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
        if (avgVsTarget > 100) ctx += `  ⚠️ Averaging ${avgVsTarget} kcal ABOVE target per day\n`;
        else if (avgVsTarget < -100) ctx += `  ⚠️ Averaging ${Math.abs(avgVsTarget)} kcal BELOW target per day\n`;
        else ctx += `  ✅ On track — averaging within 100 kcal of target\n`;
      }
    }

    ctx += `\n--- STREAKS & CONSISTENCY ---\n`;
    ctx += `Current logging streak: ${streak.currentStreak} days | Longest ever: ${streak.longestStreak} days\n`;
    ctx += `Total meals logged: ${Store.getTotalMeals()}\n`;
    ctx += `AI scans used: ${Store.getNlpCount()}\n`;

    if (weightLog.length > 0) {
      ctx += `\n--- WEIGHT HISTORY ---\n`;
      const recent = weightLog.slice(-10);
      recent.forEach(w => {
        ctx += `  ${w.date}: ${w.weight}kg\n`;
      });
      if (weightLog.length >= 2) {
        const first = weightLog[0];
        const last = weightLog[weightLog.length - 1];
        const diff = (last.weight - first.weight).toFixed(1);
        ctx += `  Total change: ${diff > 0 ? '+' : ''}${diff}kg (from ${first.weight}kg to ${last.weight}kg over ${weightLog.length} entries)\n`;
      }
    }

    if (freqFoods.length > 0) {
      ctx += `\n--- MOST EATEN FOODS ---\n`;
      freqFoods.forEach(f => {
        ctx += `  ${f.name}: logged ${f.count} times\n`;
      });
    }

    if (achievements && Object.keys(achievements).length > 0) {
      ctx += `\n--- UNLOCKED ACHIEVEMENTS ---\n`;
      const achNames = Object.keys(achievements);
      ctx += `  ${achNames.join(', ')}\n`;
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

    appendBubble(text, 'user');
    conv.messages.push({ role: 'user', text });

    
    if (conv.messages.length === 1) {
      conv.title = text.length > 30 ? text.substring(0, 30) + '…' : text;
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
      conv.messages.push({ role: 'ai', text: reply });
      saveConversations();
    } catch (err) {
      hideTyping();
      appendBubble('Sorry, I couldn\'t process that. Please try again.', 'ai');
      console.error('Coach error:', err);
    }
  }

  function refresh() {
    if (window.lucide) lucide.createIcons();
  }

  return { init, refresh };
})();
