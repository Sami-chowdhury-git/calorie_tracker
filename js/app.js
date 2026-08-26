



(function() {
  'use strict';

  const App = {
    currentView: 'dashboard',

    init() {
      Landing.init();
      Onboarding.init();
      Dashboard.init();
      MealLogger.init();
      Diary.init();
      Analytics.init();
      Achievements.init();
      Goals.init();
      AICoach.init();

      this.bindAuthForms();
      this.bindNavigation();
      this.bindGlobalEvents();
      this.initTheme();

      Auth.onAuthStateChanged((user) => this.onAuthChanged(user));

      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    onAuthChanged(user) {
      if (!user) { this.showScreen('auth'); return; }
      const profile = Store.getProfile();
      if (!profile) {
        this.showScreen('onboarding');
        const ni = document.getElementById('ob-name');
        if (ni && user.name) ni.value = user.name;
      } else {
        this.showScreen('app');
        const savedView = localStorage.getItem('caltrack_current_view') || 'dashboard';
        this.navigateTo(savedView);
      }
    },

    showScreen(screen) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const map = { auth:'auth-screen', onboarding:'onboarding-screen', app:'app-shell' };
      const el = document.getElementById(map[screen]);
      if (el) el.classList.add('active');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    bindAuthForms() {
      document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-login-form').classList.add('hidden');
        document.getElementById('auth-signup-form').classList.remove('hidden');
      });
      document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-signup-form').classList.add('hidden');
        document.getElementById('auth-login-form').classList.remove('hidden');
      });

      document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pw = document.getElementById('login-password').value;
        if (!email || !pw) { Utils.showToast('Please fill all fields', 'warning'); return; }
        const loginBtn = e.target.querySelector('button[type="submit"]');
        if (loginBtn) { loginBtn.disabled = true; loginBtn.textContent = 'Signing in…'; }
        const r = await Auth.signIn(email, pw);
        if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; }
        if (!r.success) { Utils.showToast(r.error, 'error'); return; }
        Utils.showToast('Welcome back!', 'success');
      });

      document.getElementById('auth-signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const pw = document.getElementById('signup-password').value;
        if (!name || !email || !pw) { Utils.showToast('Please fill all fields', 'warning'); return; }
        if (pw.length < 6) { Utils.showToast('Password must be at least 6 characters', 'warning'); return; }
        const signupBtn = e.target.querySelector('button[type="submit"]');
        if (signupBtn) { signupBtn.disabled = true; signupBtn.textContent = 'Creating account…'; }
        const r = await Auth.signUp(name, email, pw);
        if (signupBtn) { signupBtn.disabled = false; signupBtn.textContent = 'Sign Up'; }
        if (!r.success) { Utils.showToast(r.error, 'error'); return; }
        Utils.showToast('Welcome! 🎉', 'success');
      });

      document.getElementById('logout-btn').addEventListener('click', () => {
        App._showConfirm('Sign Out', 'Are you sure you want to sign out?', () => {
          Auth.signOut();
          Utils.showToast('Signed out', 'info');
        });
      });

      document.getElementById('reset-data-btn')?.addEventListener('click', () => {
        App._showConfirm('⚠️ Reset ALL Data',
          'This will delete all your meals, macros, weight logs, achievements, and settings. You will need to set up your profile again.\n\nThis cannot be undone!',
          () => {
            Store.resetAllData();
            Utils.showToast('All data has been reset', 'info');
            setTimeout(() => window.location.reload(), 500);
          },
          'Delete Everything'
        );
      });
    },

    bindNavigation() {
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => this.navigateTo(item.dataset.view));
      });
    },

    navigateTo(view) {
      this.currentView = view;
      localStorage.setItem('caltrack_current_view', view);
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
      if (nav) nav.classList.add('active');

      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const el = document.getElementById(view + '-view');
      if (el) el.classList.add('active');

      switch (view) {
        case 'dashboard': Dashboard.refresh(); break;
        case 'diary': Diary.render(); break;
        case 'analytics': Analytics.refresh(); Goals.init(); break;
        case 'coach': AICoach.refresh(); break;
        case 'achievements': Achievements.render(); break;
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    bindGlobalEvents() {
      document.addEventListener('onboarding-complete', () => {
        this.showScreen('app');
        this.navigateTo('dashboard');
        Utils.showToast("Your plan is ready! Let's start tracking! 🎉", 'success', 4000);
      });
      document.addEventListener('navigate', (e) => this.navigateTo(e.detail.view));
      document.addEventListener('meal-logged', () => {
        if (this.currentView === 'dashboard') Dashboard.refresh();
      });

      
      document.addEventListener('keydown', (e) => {
        if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') {
          if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
            e.preventDefault();
          }
        }
      });
      document.addEventListener('input', (e) => {
        if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') {
          if (e.target.value.includes('-')) {
            e.target.value = e.target.value.replace(/-/g, '');
          }
        }
      });
    },

    initTheme() {
      const saved = localStorage.getItem('caltrack_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      this.updateThemeIcon(saved);

      document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        const btn = document.getElementById('theme-toggle-btn');
        btn.classList.add('switching');
        setTimeout(() => btn.classList.remove('switching'), 500);

        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('caltrack_theme', next);
        this.updateThemeIcon(next);
      });
    },

    updateThemeIcon(theme) {
      const btn = document.getElementById('theme-toggle-btn');
      if (!btn) return;
      btn.innerHTML = theme === 'dark'
        ? '<i data-lucide="moon"></i>'
        : '<i data-lucide="sun"></i>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    _showConfirm(title, message, onConfirm, confirmText) {
      const modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-modal-title').textContent = title;
      document.getElementById('confirm-modal-msg').textContent = message;
      const okBtn = document.getElementById('confirm-modal-ok');
      okBtn.textContent = confirmText || 'Confirm';
      
      if (confirmText === 'Delete Everything') {
        okBtn.style.background = 'var(--danger)';
      } else {
        okBtn.style.background = '';
      }
      modal.classList.remove('hidden');

      const cleanup = () => {
        modal.classList.add('hidden');
        okBtn.onclick = null;
        document.getElementById('confirm-modal-cancel').onclick = null;
        modal.onclick = null;
      };

      okBtn.onclick = () => { cleanup(); onConfirm(); };
      document.getElementById('confirm-modal-cancel').onclick = cleanup;
      modal.onclick = (e) => { if (e.target === modal) cleanup(); };
    },
  };

  document.addEventListener('DOMContentLoaded', () => App.init());
})();
