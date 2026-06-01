/* ═══════════════════════════════════════════ */
/* AI COACH — Fitness Q&A Chat with Gemini     */
/* ═══════════════════════════════════════════ */

window.AICoach = (() => {
  let chatHistory = [];
  const MAX_HISTORY = 20;

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

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.q;
        sendBtn.disabled = false;
        sendMessage();
      });
    });

    // Load chat history from localStorage
    const session = Store.getSession();
    if (session) {
      const saved = localStorage.getItem(`caltrack_coach_${session.id}`);
      if (saved) {
        try {
          chatHistory = JSON.parse(saved);
          renderHistory();
        } catch (e) { chatHistory = []; }
      }
    }
  }

  function renderHistory() {
    const chatEl = document.getElementById('coach-chat');
    // Remove welcome if there's history
    if (chatHistory.length > 0) {
      const welcome = chatEl.querySelector('.coach-welcome');
      if (welcome) welcome.remove();

      chatHistory.forEach(msg => {
        appendBubble(msg.role === 'user' ? msg.text : msg.text, msg.role);
      });
    }
  }

  function appendBubble(text, role) {
    const chatEl = document.getElementById('coach-chat');
    // Remove welcome on first message
    const welcome = chatEl.querySelector('.coach-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-message ${role}`;

    if (role === 'ai') {
      const msgText = document.createElement('div');
      msgText.className = 'msg-text';
      msgText.textContent = text;
      bubble.appendChild(msgText);
    } else {
      bubble.textContent = text;
    }

    chatEl.appendChild(bubble);
    chatEl.scrollTop = chatEl.scrollHeight;
    return bubble;
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

  async function sendMessage() {
    const input = document.getElementById('coach-input');
    const sendBtn = document.getElementById('coach-send-btn');
    const text = input.value.trim();
    if (!text) return;

    // Show user message
    appendBubble(text, 'user');
    chatHistory.push({ role: 'user', text });

    input.value = '';
    sendBtn.disabled = true;
    showTyping();

    try {
      const reply = await Gemini.askCoach(text, chatHistory.slice(-MAX_HISTORY));
      hideTyping();
      appendBubble(reply, 'ai');
      chatHistory.push({ role: 'ai', text: reply });
      saveHistory();
    } catch (err) {
      hideTyping();
      appendBubble('Sorry, I couldn\'t process that. Please try again.', 'ai');
      console.error('Coach error:', err);
    }
  }

  function saveHistory() {
    const session = Store.getSession();
    if (session) {
      // Keep only last N messages
      const toSave = chatHistory.slice(-MAX_HISTORY * 2);
      localStorage.setItem(`caltrack_coach_${session.id}`, JSON.stringify(toSave));
    }
  }

  function refresh() {
    // Re-init icons after view switch
    if (window.lucide) lucide.createIcons();
  }

  return { init, refresh };
})();
