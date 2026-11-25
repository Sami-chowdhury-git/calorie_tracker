window.Landing = {
  init() {
    const ctaBtn = document.getElementById('landing-cta-btn');
    const navSignIn = document.getElementById('landing-nav-signin');

    const scrollToAuth = (e) => {
      if (e) e.preventDefault();
      this.scrollToAuth();
    };

    if (ctaBtn) ctaBtn.addEventListener('click', scrollToAuth);
    if (navSignIn) navSignIn.addEventListener('click', scrollToAuth);

    const featuresLink = document.querySelector('a[href="#landing-features"]');
    if (featuresLink) {
      featuresLink.addEventListener('click', (e) => {
        const target = document.getElementById('landing-features');
        if (target && typeof target.scrollIntoView === 'function') {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    this._initFeatureInteractions();
  },

  _initFeatureInteractions() {
    const cells = Array.from(document.querySelectorAll('.feature-cell'));
    if (cells.length === 0) return;

    const revealCell = (cell) => {
      cell.classList.remove('reveal-pending');
      cell.classList.add('is-visible');
    };

    cells.forEach((cell, idx) => {
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-pressed', 'false');

      const selectCell = () => {
        const wasSelected = cell.classList.contains('is-selected');
        cells.forEach(c => {
          c.classList.remove('is-selected');
          c.setAttribute('aria-pressed', 'false');
        });
        if (!wasSelected) {
          cell.classList.add('is-selected');
          cell.setAttribute('aria-pressed', 'true');
        }
        revealCell(cell);
      };

      cell.addEventListener('click', selectCell);
      cell.addEventListener('focus', () => revealCell(cell));
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCell();
        }
      });

      const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduceMotion && typeof IntersectionObserver !== 'undefined') {
        cell.classList.add('reveal-pending');
        cell.style.transitionDelay = `${(idx % 3) * 45}ms`;
      }
    });

    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            revealCell(entry.target);
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.05, rootMargin: '80px 0px' });

      cells.forEach(cell => {
        if (cell.classList.contains('reveal-pending')) {
          observer.observe(cell);
        }
      });
    }
  },

  scrollToAuth() {
    const card = document.getElementById('landing-auth-card') || document.getElementById('landing-auth-section');
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const emailEl = document.getElementById('login-email');
    if (emailEl && typeof emailEl.focus === 'function') {
      emailEl.focus({ preventScroll: true });
    }
  },

  setSlide(index) {
    if (Number(index) >= 9) {
      this.scrollToAuth();
    } else if (Number(index) <= 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const target = document.getElementById('landing-features');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }
};
