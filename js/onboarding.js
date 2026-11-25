window.Onboarding = {
  currentStep: 1,
  totalSteps: 5,
  data: {
    name: '', age: 25, gender: 'male', weight: 70, height: 175, heightInches: 0,
    weightUnit: 'kg', heightUnit: 'cm', activityLevel: 1.55, goal: 'maintain'
  },

  init() {
    document.querySelectorAll('.ob-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ob-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.data.gender = btn.dataset.value;
      });
    });

    document.getElementById('ob-height-unit').addEventListener('change', (e) => {
      const isFt = e.target.value === 'ft';
      this.data.heightUnit = e.target.value;
      document.getElementById('ob-height-inches-group').classList.toggle('hidden', !isFt);
      const hInput = document.getElementById('ob-height');
      hInput.min = isFt ? 1 : 50;
      hInput.max = isFt ? 7 : 250;
      hInput.placeholder = isFt ? '5' : '175';
    });

    document.getElementById('ob-weight-unit').addEventListener('change', (e) => {
      const newUnit = e.target.value;
      const oldUnit = this.data.weightUnit;
      const wInput = document.getElementById('ob-weight');
      const currentVal = parseFloat(wInput.value);
      if (newUnit !== oldUnit && Number.isFinite(currentVal) && currentVal > 0 && window.Nutrition) {
        wInput.value = newUnit === 'lbs'
          ? window.Nutrition.kgToLbs(currentVal)
          : window.Nutrition.lbsToKg(currentVal);
      }
      this.data.weightUnit = newUnit;
      wInput.min = newUnit === 'lbs' ? 44 : 20;
      wInput.max = newUnit === 'lbs' ? 660 : 300;
      wInput.placeholder = newUnit === 'lbs' ? '154' : '70';
    });

    document.querySelectorAll('.ob-selection-card[data-level]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.ob-selection-card[data-level]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.data.activityLevel = parseFloat(card.dataset.level);
      });
    });

    document.querySelectorAll('.ob-selection-card[data-goal]').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.ob-selection-card[data-goal]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.data.goal = card.dataset.goal;
      });
    });

    document.getElementById('ob-next-btn').addEventListener('click', () => {
      if (this.validateStep(this.currentStep)) this.goToStep(this.currentStep + 1);
    });
    document.getElementById('ob-back-btn').addEventListener('click', () => {
      this.goToStep(this.currentStep - 1);
    });
    document.getElementById('ob-finish-btn').addEventListener('click', () => this.finish());

    const session = Auth.getCurrentUser();
    if (session && session.name) {
      document.getElementById('ob-name').value = session.name;
      this.data.name = session.name;
    }
  },

  goToStep(step) {
    if (step < 1 || step > this.totalSteps) return;

    this.collectData(this.currentStep);

    document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.onboarding-step[data-step="${step}"]`).classList.add('active');

    document.getElementById('ob-progress-fill').style.width = `${(step / this.totalSteps) * 100}%`;
    document.querySelectorAll('.ob-dot').forEach(dot => {
      const ds = parseInt(dot.dataset.step, 10);
      dot.classList.remove('active', 'completed');
      if (ds < step) dot.classList.add('completed');
      else if (ds === step) dot.classList.add('active');
    });

    document.getElementById('ob-back-btn').classList.toggle('hidden', step === 1);
    document.getElementById('ob-next-btn').classList.toggle('hidden', step === this.totalSteps);
    document.getElementById('ob-finish-btn').classList.toggle('hidden', step !== this.totalSteps);

    if (step === 5) this.showResults();

    this.currentStep = step;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  collectData(step) {
    if (step === 1) {
      this.data.name = document.getElementById('ob-name').value.trim();
      const ageVal = parseInt(document.getElementById('ob-age').value, 10);
      this.data.age = (!isNaN(ageVal) && ageVal >= 13 && ageVal <= 100) ? ageVal : 25;
    } else if (step === 2) {
      this.data.weightUnit = document.getElementById('ob-weight-unit').value === 'lbs' ? 'lbs' : 'kg';
      this.data.heightUnit = document.getElementById('ob-height-unit').value === 'ft' ? 'ft' : 'cm';
      const wVal = parseFloat(document.getElementById('ob-weight').value);
      this.data.weight = (!isNaN(wVal) && wVal > 0) ? wVal : (this.data.weightUnit === 'lbs' ? 154 : 70);
      const hVal = parseFloat(document.getElementById('ob-height').value);
      this.data.height = (!isNaN(hVal) && hVal > 0) ? hVal : (this.data.heightUnit === 'ft' ? 5 : 175);
      const inVal = parseFloat(document.getElementById('ob-height-inches').value);
      this.data.heightInches = (!isNaN(inVal) && inVal >= 0 && inVal <= 11) ? inVal : 0;
    }
  },

  validateStep(step) {
    if (step === 1) {
      if (!document.getElementById('ob-name').value.trim()) {
        Utils.showToast('Please enter your name', 'warning'); return false;
      }
      const ageVal = parseInt(document.getElementById('ob-age').value, 10);
      if (isNaN(ageVal) || ageVal < 13 || ageVal > 100) {
        Utils.showToast('Please enter a valid age (13–100 years)', 'warning'); return false;
      }
    }
    if (step === 2) {
      const w = parseFloat(document.getElementById('ob-weight').value);
      const isLbs = this.data.weightUnit === 'lbs';
      const minW = isLbs ? 44 : 20;
      const maxW = isLbs ? 660 : 300;
      if (isNaN(w) || w < minW || w > maxW) {
        Utils.showToast(`Please enter a valid weight (${minW}–${maxW} ${this.data.weightUnit})`, 'warning'); return false;
      }

      const h = parseFloat(document.getElementById('ob-height').value);
      if (this.data.heightUnit === 'ft') {
        const ft = h;
        const inches = parseFloat(document.getElementById('ob-height-inches').value) || 0;
        if (isNaN(ft) || ft < 1 || ft > 7) {
          Utils.showToast('Feet must be between 1 and 7 ft', 'warning'); return false;
        }
        if (isNaN(inches) || inches < 0 || inches > 11) {
          Utils.showToast('Inches must be between 0 and 11 in', 'warning'); return false;
        }
      } else {
        if (isNaN(h) || h < 50 || h > 250) {
          Utils.showToast('Please enter a valid height (50–250 cm)', 'warning'); return false;
        }
      }
    }
    if (step === 3 && !document.querySelector('.ob-selection-card[data-level].active')) {
      Utils.showToast('Please select your activity level', 'warning'); return false;
    }
    if (step === 4 && !document.querySelector('.ob-selection-card[data-goal].active')) {
      Utils.showToast('Please select your goal', 'warning'); return false;
    }
    return true;
  },

  calculateTDEE() {
    return window.Nutrition.calculateTDEE(this.data);
  },

  showResults() {
    this.collectData(this.currentStep);
    const r = this.calculateTDEE();
    Utils.animateNumber(document.getElementById('ob-tdee-value'), r.tdee, 1500);
    Utils.animateNumber(document.getElementById('ob-protein-value'), r.protein, 1200);
    Utils.animateNumber(document.getElementById('ob-carbs-value'), r.carbs, 1200);
    Utils.animateNumber(document.getElementById('ob-fat-value'), r.fat, 1200);
  },

  finish() {
    this.collectData(this.currentStep);
    const r = this.calculateTDEE();
    const rawProfile = {
      ...this.data,
      weightKg: window.Nutrition.toKg ? window.Nutrition.toKg(this.data.weight, this.data.weightUnit) : window.Nutrition.resolveWeightKg(this.data),
      heightCm: window.Nutrition.resolveHeightCm(this.data),
      heightFt: this.data.heightUnit === 'ft' ? this.data.height : undefined,
      heightIn: this.data.heightUnit === 'ft' ? this.data.heightInches : undefined,
      tdee: r.tdee,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      completedAt: new Date().toISOString()
    };
    const profile = window.Nutrition.normalizeProfile(rawProfile);
    Store.saveProfile(profile);
    const targets = Utils.calculateNutritionTargets(profile);
    if (targets && targets.water) {
      Store.setWaterGoal(targets.water);
    }
    document.dispatchEvent(new CustomEvent('onboarding-complete', { detail: profile }));
  }
};
