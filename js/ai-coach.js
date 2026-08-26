/* ═══════════════════════════════════════════ */
/* AI COACH — Multi-tab Chat with App Context  */
/* ═══════════════════════════════════════════ */

window.AICoach = (() => {
  let conversations = []; // [{id, title, messages}]
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

    // New chat button
    document.getElementById('coach-new-chat-btn')?.addEventListener('click', () => {
      createNewConversation();
    });

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.q;
        sendBtn.disabled = false;
        sendMessage();
      });
    });

    // Load saved conversations
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
      const saved = localStorage.getItem(`${STORAGE_KEY}_${session.id}`);
      if (saved) {
        const data = JSON.parse(saved);
        conversations = data.conversations || [];
        activeConvId = data.activeConvId || null;
      }
    } catch (e) { conversations = []; }
  }

  function saveConversations() {
    const session = Store.getSession();
    if (!session) return;
    localStorage.setItem(`${STORAGE_KEY}_${session.id}`, JSON.stringify({
      conversations: conversations.map(c => ({
        ...c,
        messages: c.messages.slice(-MAX_HISTORY * 2)
      })),
      activeConvId
    }));
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

    // Bind tab clicks
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
          <p>I can see your MacroLens data — ask about your meals, macros, progress, or any fitness topic.</p>
          <div class="coach-suggestion-chips">
            <button class="suggestion-chip" data-q="Based on my data, how am I doing with my protein intake?">My protein intake</button>
            <button class="suggestion-chip" data-q="What should I eat to meet my remaining macros for today?">Meet my macros</button>
            <button class="suggestion-chip" data-q="How can I lose fat without losing muscle?">Fat loss tips</button>
            <button class="suggestion-chip" data-q="Analyze my eating patterns from my logged meals">Analyze my meals</button>
          </div>
        </div>
      `;
      // Rebind suggestion chips
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
      // Simple markdown-like formatting
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
    const freqFoods = Store.getFrequentFoods(10);

    // Build recent meals summary
    let todayMeals = [];
    ['breakfast','lunch','dinner','snacks'].forEach(m => {
      diary[m].forEach(item => {
        todayMeals.push(`${m}: ${item.name} (${item.calories} kcal, P:${item.protein}g C:${item.carbs}g F:${item.fat}g)`);
      });
    });

    // Get recent days
    const loggedDates = Store.getLoggedDates().slice(-7);
    let weekSummary = [];
    loggedDates.forEach(d => {
      const dt = Store.getDayTotals(d);
      weekSummary.push(`${d}: ${dt.calories} kcal (P:${Math.round(dt.protein)}g C:${Math.round(dt.carbs)}g F:${Math.round(dt.fat)}g, ${dt.meals} meals)`);
    });

    let ctx = `\n\nUSER DATA CONTEXT (from MacroLens app — use this to give personalized advice):\n`;
    if (profile) {
      ctx += `Profile: ${profile.name || 'User'}, ${profile.age || '?'}y, ${profile.gender || '?'}, ${profile.weight || '?'}kg, ${Math.round(profile.height || 0)}cm\n`;
      ctx += `Goal: ${profile.goal || 'maintain'}, Activity: ${profile.activityLevel || '?'}x, TDEE target: ${profile.tdee || '?'} kcal\n`;
      ctx += `Daily targets — Protein: ${profile.protein || '?'}g, Carbs: ${profile.carbs || '?'}g, Fat: ${profile.fat || '?'}g\n`;
    }
    ctx += `\nToday (${today}):\n`;
    ctx += `Consumed: ${todayTotals.calories} kcal (P:${Math.round(todayTotals.protein)}g C:${Math.round(todayTotals.carbs)}g F:${Math.round(todayTotals.fat)}g)\n`;
    ctx += `Remaining: ${Math.max(0, (profile?.tdee || 2000) - todayTotals.calories)} kcal\n`;
    if (todayMeals.length > 0) {
      ctx += `Today's meals:\n${todayMeals.map(m => '  - ' + m).join('\n')}\n`;
    }
    if (weekSummary.length > 0) {
      ctx += `\nLast ${weekSummary.length} days:\n${weekSummary.map(s => '  - ' + s).join('\n')}\n`;
    }
    ctx += `Logging streak: ${streak.currentStreak} days (longest: ${streak.longestStreak})\n`;
    if (weightLog.length > 0) {
      const recent = weightLog.slice(-5);
      ctx += `Recent weights: ${recent.map(w => `${w.date}: ${w.weight}kg`).join(', ')}\n`;
    }
    if (freqFoods.length > 0) {
      ctx += `Most eaten foods: ${freqFoods.map(f => `${f.name} (${f.count}x)`).join(', ')}\n`;
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

    // Auto-title from first message
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
