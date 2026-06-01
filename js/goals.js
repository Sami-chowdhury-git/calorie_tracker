/* ═══════════════════════════════════════════ */
/* GOALS — Recalculate TDEE & Macro Adjustment */
/* ═══════════════════════════════════════════ */

window.Goals = (() => {
  let calculatedTDEE = 0;
  let calculatedMacros = { protein: 0, carbs: 0, fat: 0 };

  function init() {
    // Pre-fill from existing profile
    const profile = Store.getProfile();
    if (profile) {
      const age = document.getElementById('goal-age');
      const gender = document.getElementById('goal-gender');
      const weight = document.getElementById('goal-weight');
      const height = document.getElementById('goal-height');
      const heightUnit = document.getElementById('goal-height-unit');
      const heightInchesGroup = document.getElementById('goal-height-inches-group');
      const heightInches = document.getElementById('goal-height-inches');
      const activity = document.getElementById('goal-activity');
      const goalType = document.getElementById('goal-type');

      if (age && profile.age) age.value = profile.age;
      if (gender && profile.gender) gender.value = profile.gender;
      if (weight && profile.weight) weight.value = profile.weight;
      if (height && profile.height) height.value = profile.height;
      if (heightUnit && profile.heightUnit) {
        heightUnit.value = profile.heightUnit;
        if (heightInchesGroup) {
          heightInchesGroup.classList.toggle('hidden', profile.heightUnit !== 'ft');
        }
      }
      if (heightInches && profile.heightInches !== undefined) heightInches.value = profile.heightInches;
      if (activity && profile.activityLevel) activity.value = profile.activityLevel;
      if (goalType && profile.goal) goalType.value = profile.goal;

      // Populate local state
      calculatedTDEE = profile.tdee || 2000;
      calculatedMacros = {
        protein: profile.protein || 150,
        carbs: profile.carbs || 220,
        fat: profile.fat || 73
      };
    }

    // Recalculate button
    document.getElementById('recalc-btn')?.addEventListener('click', recalculate);

    // Height unit toggle listener
    document.getElementById('goal-height-unit')?.addEventListener('change', (e) => {
      document.getElementById('goal-height-inches-group')?.classList.toggle('hidden', e.target.value !== 'ft');
    });

    // Sliders
    ['protein', 'carbs', 'fat'].forEach(macro => {
      const slider = document.getElementById(`slider-${macro}`);
      if (slider) {
        slider.addEventListener('input', () => {
          document.getElementById(`slider-${macro}-val`).textContent = `${slider.value}g`;
        });
      }
    });

    // AI validate
    document.getElementById('validate-macros-btn')?.addEventListener('click', validateWithAI);

    // Apply goals
    document.getElementById('apply-goals-btn')?.addEventListener('click', applyGoals);
  }

  function recalculate() {
    const age = parseInt(document.getElementById('goal-age').value);
    const gender = document.getElementById('goal-gender').value;
    const weight = parseFloat(document.getElementById('goal-weight').value);
    const height = parseFloat(document.getElementById('goal-height').value);
    const heightUnit = document.getElementById('goal-height-unit')?.value || 'cm';
    const heightInches = parseFloat(document.getElementById('goal-height-inches')?.value || 0);
    const activity = parseFloat(document.getElementById('goal-activity').value);
    const goal = document.getElementById('goal-type').value;

    if (!age || !weight || !height) {
      Utils.showToast('Please fill in all fields', 'error');
      return;
    }

    // Convert imperial height to cm
    let hCm = height;
    if (heightUnit === 'ft') {
      hCm = (height * 30.48) + (heightInches * 2.54);
    }

    // Mifflin-St Jeor
    let bmr = 10 * weight + 6.25 * hCm - 5 * age;
    bmr += gender === 'male' ? 5 : -161;

    let tdee = Math.round(bmr * activity);

    // Dynamic Goal adjustment based on calculated TDEE
    let adjustment = 0;
    if (goal === 'cut') {
      adjustment = -Math.min(500, Math.round(tdee * 0.20)); // 20% deficit, max 500
    } else if (goal === 'bulk') {
      adjustment = Math.max(100, Math.min(300, Math.round(tdee * 0.10))); // 10% surplus, min 100, max 300
    }
    tdee = Math.round(tdee + adjustment);
    tdee = Math.max(1200, tdee);

    // Macro splits
    const splits = {
      cut: { p: 0.40, c: 0.30, f: 0.30 },
      maintain: { p: 0.30, c: 0.40, f: 0.30 },
      bulk: { p: 0.30, c: 0.45, f: 0.25 }
    };
    const s = splits[goal] || splits.maintain;

    calculatedTDEE = tdee;
    calculatedMacros = {
      protein: Math.round((tdee * s.p) / 4),
      carbs: Math.round((tdee * s.c) / 4),
      fat: Math.round((tdee * s.f) / 9),
    };

    // Show results
    document.getElementById('recalc-tdee').textContent = `${tdee} kcal`;
    document.getElementById('recalc-result').classList.remove('hidden');

    // Set sliders
    const pSlider = document.getElementById('slider-protein');
    const cSlider = document.getElementById('slider-carbs');
    const fSlider = document.getElementById('slider-fat');
    pSlider.value = calculatedMacros.protein;
    cSlider.value = calculatedMacros.carbs;
    fSlider.value = calculatedMacros.fat;
    document.getElementById('slider-protein-val').textContent = `${calculatedMacros.protein}g`;
    document.getElementById('slider-carbs-val').textContent = `${calculatedMacros.carbs}g`;
    document.getElementById('slider-fat-val').textContent = `${calculatedMacros.fat}g`;

    // Hide previous AI feedback
    document.getElementById('ai-macro-feedback').classList.add('hidden');

    Utils.showToast(`New TDEE: ${tdee} kcal`, 'success');
    if (window.lucide) lucide.createIcons();
  }

  async function validateWithAI() {
    const btn = document.getElementById('validate-macros-btn');
    const feedbackEl = document.getElementById('ai-macro-feedback');
    const protein = parseInt(document.getElementById('slider-protein').value);
    const carbs = parseInt(document.getElementById('slider-carbs').value);
    const fat = parseInt(document.getElementById('slider-fat').value);
    const totalCals = protein * 4 + carbs * 4 + fat * 9;
    const profile = Store.getProfile();

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Checking...';
    if (window.lucide) lucide.createIcons();

    try {
      const result = await Gemini.validateMacros({
        tdee: calculatedTDEE,
        protein, carbs, fat, totalCals,
        goal: document.getElementById('goal-type').value,
        weight: parseFloat(document.getElementById('goal-weight').value),
        age: parseInt(document.getElementById('goal-age').value),
        gender: document.getElementById('goal-gender').value || profile?.gender || 'female',
      });

      feedbackEl.textContent = result.feedback;
      feedbackEl.className = `ai-feedback ${result.isGood ? 'good' : 'bad'}`;
      feedbackEl.classList.remove('hidden');
    } catch (err) {
      feedbackEl.textContent = 'Could not validate macros. Try again later.';
      feedbackEl.className = 'ai-feedback bad';
      feedbackEl.classList.remove('hidden');
      console.error('Macro validation error:', err);
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="sparkles"></i> AI Check';
    if (window.lucide) lucide.createIcons();
  }

  function applyGoals() {
    const protein = parseInt(document.getElementById('slider-protein').value);
    const carbs = parseInt(document.getElementById('slider-carbs').value);
    const fat = parseInt(document.getElementById('slider-fat').value);
    const totalCals = protein * 4 + carbs * 4 + fat * 9;

    const profile = Store.getProfile();
    if (!profile) return;

    // Update profile
    profile.tdee = totalCals;
    profile.protein = protein;
    profile.carbs = carbs;
    profile.fat = fat;
    profile.age = parseInt(document.getElementById('goal-age').value) || profile.age;
    profile.gender = document.getElementById('goal-gender').value || profile.gender;
    profile.weight = parseFloat(document.getElementById('goal-weight').value) || profile.weight;
    profile.height = parseFloat(document.getElementById('goal-height').value) || profile.height;
    profile.heightUnit = document.getElementById('goal-height-unit')?.value || 'cm';
    profile.heightInches = parseFloat(document.getElementById('goal-height-inches')?.value || 0);
    profile.activityLevel = parseFloat(document.getElementById('goal-activity').value) || profile.activityLevel;
    profile.goal = document.getElementById('goal-type').value || profile.goal;

    Store.saveProfile(profile);
    Utils.showToast(`Goals updated! New target: ${totalCals} kcal`, 'success');

    // Refresh dashboard if visible
    if (window.Dashboard && typeof window.Dashboard.refresh === 'function') {
      window.Dashboard.refresh();
    }
  }

  return { init, recalculate };
})();
