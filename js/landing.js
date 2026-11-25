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
