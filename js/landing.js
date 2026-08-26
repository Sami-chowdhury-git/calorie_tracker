/* ═══════════════════════════════════════════ */
/* LANDING — Wheel/touch driven slide show     */
/* ═══════════════════════════════════════════ */

window.Landing = {
  totalSlides: 7,
  currentSlide: 0,
  isTransitioning: false,
  touchStartY: 0,

  init() {
    const screen = document.getElementById('auth-screen');
    if (!screen) return;

    // Wheel event (PC/Mac trackpad)
    screen.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Touch events (phone/tablet)
    screen.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    screen.addEventListener('touchmove', (e) => {
      e.preventDefault(); // prevent page scroll
    }, { passive: false });

    screen.addEventListener('touchend', (e) => {
      const dy = this.touchStartY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 40) {
        if (dy > 0) this.next();
        else this.prev();
      }
    }, { passive: true });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      const screen = document.getElementById('auth-screen');
      if (!screen || !screen.classList.contains('active')) return;
      if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); this.next(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.prev(); }
    });

    // Set initial slide
    this.setSlide(0);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  onWheel(e) {
    const screen = document.getElementById('auth-screen');
    if (!screen || !screen.classList.contains('active')) return;

    e.preventDefault(); // prevent any actual scrolling

    if (this.isTransitioning) return;

    // Use deltaY to determine direction
    if (e.deltaY > 20) this.next();
    else if (e.deltaY < -20) this.prev();
  },

  next() {
    if (this.currentSlide < this.totalSlides - 1) {
      this.goToSlide(this.currentSlide + 1);
    }
  },

  prev() {
    if (this.currentSlide > 0) {
      this.goToSlide(this.currentSlide - 1);
    }
  },

  goToSlide(index) {
    if (this.isTransitioning || index === this.currentSlide) return;
    this.isTransitioning = true;
    this.setSlide(index);
    // Lock transitions for 700ms to prevent rapid scrolling
    setTimeout(() => { this.isTransitioning = false; }, 700);
  },

  setSlide(index) {
    this.currentSlide = index;

    const slides = document.querySelectorAll('.landing-slide');
    slides.forEach(slide => {
      const num = parseInt(slide.dataset.slide);
      slide.classList.remove('active', 'exit-up');
      if (num === index) {
        slide.classList.add('active');
      } else if (num < index) {
        slide.classList.add('exit-up');
      }
      // Slides after current: default state (hidden below)
    });
  }
};
