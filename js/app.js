(function() {
  'use strict';

  const App = {
    currentView: 'dashboard',
    previousScreen: 'auth',

    async init() {
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
      this.bindLegalPages();
      this.bindGlobalEvents();
      this.initTheme();

      Auth.onAuthStateChanged((user) => this.onAuthChanged(user));
      await Auth.initSession();

      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    onAuthChanged(user) {
      if (!user) {
        if (window.AICoach && typeof window.AICoach.resetMemory === 'function') {
          window.AICoach.resetMemory();
        }
        this.showScreen('auth');
        return;
      }

      if (window.AICoach && typeof window.AICoach.reload === 'function') {
        window.AICoach.reload();
      }
      if (window.Goals && typeof window.Goals.init === 'function') {
        window.Goals.init();
      }

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
      if (screen === 'auth' || screen === 'onboarding' || screen === 'app') {
        this.previousScreen = screen;
      }
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const map = {
        auth: 'auth-screen',
        onboarding: 'onboarding-screen',
        app: 'app-shell',
        privacy: 'privacy-screen',
        terms: 'terms-screen'
      };
      const el = document.getElementById(map[screen]);
      if (el) {
        el.classList.add('active');
        if (screen === 'privacy' || screen === 'terms') {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    bindLegalPages() {
      const openPrivacy = () => this.showScreen('privacy');
      const openTerms = () => this.showScreen('terms');
      const returnFromLegal = () => this.showScreen(this.previousScreen || 'auth');

      ['nav-privacy-btn', 'landing-privacy-link', 'header-privacy-btn', 'app-privacy-link'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', openPrivacy);
      });
      ['nav-terms-btn', 'landing-terms-link', 'header-terms-btn', 'app-terms-link'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', openTerms);
      });

      document.getElementById('privacy-back-btn')?.addEventListener('click', returnFromLegal);
      document.getElementById('terms-back-btn')?.addEventListener('click', returnFromLegal);
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
        const labelSpan = loginBtn?.querySelector('span');
        if (loginBtn) {
          loginBtn.disabled = true;
          if (labelSpan) labelSpan.textContent = 'Signing in...';
          else loginBtn.textContent = 'Signing in...';
        }
        const r = await Auth.signIn(email, pw);
        if (loginBtn) {
          loginBtn.disabled = false;
          if (labelSpan) labelSpan.textContent = 'Sign In';
          else loginBtn.textContent = 'Sign In';
        }
        if (!r.success) { Utils.showToast(r.error, 'error'); return; }
        Utils.showToast('Signed in successfully', 'success');
      });

      document.getElementById('auth-signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const pw = document.getElementById('signup-password').value;
        if (!name || !email || !pw) { Utils.showToast('Please fill all fields', 'warning'); return; }
        if (pw.length < 6) { Utils.showToast('Password must be at least 6 characters', 'warning'); return; }
        const signupBtn = e.target.querySelector('button[type="submit"]');
        const labelSpan = signupBtn?.querySelector('span');
        if (signupBtn) {
          signupBtn.disabled = true;
          if (labelSpan) labelSpan.textContent = 'Creating account...';
          else signupBtn.textContent = 'Creating account...';
        }
        const r = await Auth.signUp(name, email, pw);
        if (signupBtn) {
          signupBtn.disabled = false;
          if (labelSpan) labelSpan.textContent = 'Get Started';
          else signupBtn.textContent = 'Get Started';
        }
        if (!r.success) { Utils.showToast(r.error, 'error'); return; }
        Utils.showToast('Account created', 'success');
      });

      document.getElementById('logout-btn').addEventListener('click', () => {
        App._showConfirm('Sign Out', 'Are you sure you want to sign out?', async () => {
          await Auth.signOut();
          Utils.showToast('Signed out', 'info');
        });
      });

      document.getElementById('reset-data-btn')?.addEventListener('click', () => {
        App._showConfirm(
          'Reset All Data',
          'This will delete all your meals, macros, weight logs, achievements, and settings. You will need to set up your profile again.\n\nThis cannot be undone.',
          async () => {
            await Store.resetAllData();
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
        Utils.showToast('Your targets are saved. Ready to log meals.', 'success', 4000);
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
      const stored = localStorage.getItem('caltrack_theme');
      const saved = stored === 'dark' ? 'dark' : 'cream';
      document.documentElement.setAttribute('data-theme', saved);
      this.updateThemeIcon(saved);

      document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'cream';
        const next = current === 'dark' ? 'cream' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('caltrack_theme', next);
        this.updateThemeIcon(next);
        if (this.currentView === 'analytics' && window.Analytics) {
          window.Analytics.refresh();
        }
      });
    },

    updateThemeIcon(theme) {
      const btn = document.getElementById('theme-toggle-btn');
      if (!btn) return;
      btn.textContent = '';

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

      if (theme === 'dark') {
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '4');
        const rays = document.createElementNS(ns, 'path');
        rays.setAttribute('d', 'M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1');
        svg.appendChild(circle);
        svg.appendChild(rays);
        btn.setAttribute('title', 'Switch to Cream theme');
      } else {
        const moon = document.createElementNS(ns, 'path');
        moon.setAttribute('d', 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z');
        svg.appendChild(moon);
        btn.setAttribute('title', 'Switch to Ink Black theme');
      }

      btn.appendChild(svg);
    },

    _showConfirm(title, message, onConfirm, confirmText) {
      const modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-modal-title').textContent = title;
      document.getElementById('confirm-modal-msg').textContent = message;
      const okBtn = document.getElementById('confirm-modal-ok');
      okBtn.textContent = confirmText || 'Confirm';

      if (confirmText === 'Delete Everything') {
        okBtn.style.background = 'var(--danger)';
        okBtn.style.color = '#FFFFFF';
        okBtn.style.borderColor = 'var(--danger)';
      } else {
        okBtn.style.background = '';
        okBtn.style.color = '';
        okBtn.style.borderColor = '';
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
    }
  };

  document.addEventListener('DOMContentLoaded', () => App.init());
})();
