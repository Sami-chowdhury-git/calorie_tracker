/* ═══════════════════════════════════════════ */
/* GOALS — Recalculate TDEE & Apply Goals     */
/* ═══════════════════════════════════════════ */

window.Goals = (() => {
  let calculatedTDEE = 0;
  let calculatedMacros = { protein: 0, carbs: 0, fat: 0 };

  function init() {
    const profile = Store.getProfile();
    if (profile) {
      const age = document.getElementById('goal-age');
      const gender = document.getElementById('goal-gender');
      const weight = document.getElementById('goal-weight');
      const height = document.getElementById('goal-height');
      const heightUnit = document.getElementById('goal-height-unit');
      const activity = document.getElementById('goal-activity');
      const goalType = document.getElementById('goal-type');

      if (age && profile.age) age.value = profile.age;
      if (gender && profile.gender) gender.value = profile.gender;
      if (weight && profile.weight) weight.value = profile.weight;
      if (heightUnit && profile.heightUnit) {
        heightUnit.value = profile.heightUnit;
        toggleHeightInputs(profile.heightUnit);
      }
      if (profile.heightUnit === 'ft') {
        const ftEl = document.getElementById('goal-height-ft');
        const inEl = document.getElementById('goal-height-in');
        if (ftEl && profile.heightFt !== undefined) ftEl.value = profile.heightFt;
        if (inEl && profile.heightIn !== undefined) inEl.value = profile.heightIn;
      } else {
        if (height && profile.height) height.value = profile.height;
      }
      if (activity && profile.activityLevel) activity.value = profile.activityLevel;
      if (goalType && profile.goal) goalType.value = profile.goal;

      calculatedTDEE = profile.tdee || 2000;
      calculatedMacros = {
        protein: profile.protein || 150,
        carbs: profile.carbs || 220,
        fat: profile.fat || 73
      };
    }

    // Recalculate button
    document.getElementById('recalc-btn')?.addEventListener('click', recalculate);

    // Height unit toggle
    document.getElementById('goal-height-unit')?.addEventListener('change', (e) => {
      toggleHeightInputs(e.target.value);
    });

    // Apply goals
    document.getElementById('apply-goals-btn')?.addEventListener('click', applyGoals);
  }

  function toggleHeightInputs(unit) {
    const cmGroup = document.getElementById('goal-height-cm-group');
    const ftGroup = document.getElementById('goal-height-ft-group');
    if (unit === 'ft') {
      // Hide the cm input but keep the unit select visible
      if (cmGroup) {
        const mainInput = cmGroup.querySelector('#goal-height');
        if (mainInput) mainInput.style.display = 'none';
      }
      if (ftGroup) ftGroup.classList.remove('hidden');
    } else {
      if (cmGroup) {
        const mainInput = cmGroup.querySelector('#goal-height');
        if (mainInput) mainInput.style.display = '';
      }
      if (ftGroup) ftGroup.classList.add('hidden');
    }
  }

  function recalculate() {
    const age = parseInt(document.getElementById('goal-age').value);
    const gender = document.getElementById('goal-gender').value;
    const weight = parseFloat(document.getElementById('goal-weight').value);
    const heightUnit = document.getElementById('goal-height-unit')?.value || 'cm';
    const activity = parseFloat(document.getElementById('goal-activity').value);
    const goal = document.getElementById('goal-type').value;

    if (isNaN(age) || age < 13 || age > 100) {
      Utils.showToast('Please enter a valid age (13–100 years)', 'warning');
      return;
    }

    if (isNaN(weight) || weight < 20 || weight > 300) {
      Utils.showToast('Please enter a valid weight (20–300 kg)', 'warning');
      return;
    }

    let hCm;
    if (heightUnit === 'ft') {
      const ft = parseFloat(document.getElementById('goal-height-ft')?.value || 0);
      const inches = parseFloat(document.getElementById('goal-height-in')?.value || 0);
      if (isNaN(ft) || ft < 1 || ft > 7) { Utils.showToast('Feet must be between 1 and 7 ft', 'warning'); return; }
      if (isNaN(inches) || inches < 0 || inches > 11) { Utils.showToast('Inches must be between 0 and 11 in', 'warning'); return; }
      hCm = (ft * 30.48) + (inches * 2.54);
    } else {
      hCm = parseFloat(document.getElementById('goal-height').value);
      if (isNaN(hCm) || hCm < 50 || hCm > 250) { Utils.showToast('Please enter a valid height (50–250 cm)', 'warning'); return; }
    }

    // Mifflin-St Jeor
    let bmr = 10 * weight + 6.25 * hCm - 5 * age;
    bmr += gender === 'male' ? 5 : -161;

    let tdee = Math.round(bmr * activity);

    // Dynamic Goal adjustment
    let adjustment = 0;
    if (goal === 'cut') {
      adjustment = -Math.min(500, Math.round(tdee * 0.20));
    } else if (goal === 'bulk') {
      adjustment = Math.max(100, Math.min(300, Math.round(tdee * 0.10)));
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
    document.getElementById('recalc-protein').textContent = calculatedMacros.protein;
    document.getElementById('recalc-carbs').textContent = calculatedMacros.carbs;
    document.getElementById('recalc-fat').textContent = calculatedMacros.fat;
    document.getElementById('recalc-result').classList.remove('hidden');

    Utils.showToast(`New TDEE: ${tdee} kcal`, 'success');
    if (window.lucide) lucide.createIcons();
  }

  function applyGoals() {
    const profile = Store.getProfile();
    if (!profile) return;

    const age = parseInt(document.getElementById('goal-age').value);
    if (isNaN(age) || age < 13 || age > 100) {
      Utils.showToast('Please enter a valid age (13–100 years)', 'warning');
      return;
    }

    const weight = parseFloat(document.getElementById('goal-weight').value);
    if (isNaN(weight) || weight < 20 || weight > 300) {
      Utils.showToast('Please enter a valid weight (20–300 kg)', 'warning');
      return;
    }

    const heightUnit = document.getElementById('goal-height-unit')?.value || 'cm';
    if (heightUnit === 'ft') {
      const ft = parseFloat(document.getElementById('goal-height-ft')?.value || 0);
      const inches = parseFloat(document.getElementById('goal-height-in')?.value || 0);
      if (isNaN(ft) || ft < 1 || ft > 7) { Utils.showToast('Feet must be between 1 and 7 ft', 'warning'); return; }
      if (isNaN(inches) || inches < 0 || inches > 11) { Utils.showToast('Inches must be between 0 and 11 in', 'warning'); return; }
    } else {
      const hCm = parseFloat(document.getElementById('goal-height').value);
      if (isNaN(hCm) || hCm < 50 || hCm > 250) { Utils.showToast('Please enter a valid height (50–250 cm)', 'warning'); return; }
    }

    profile.tdee = calculatedTDEE;
    profile.protein = calculatedMacros.protein;
    profile.carbs = calculatedMacros.carbs;
    profile.fat = calculatedMacros.fat;
    profile.age = age || profile.age;
    profile.gender = document.getElementById('goal-gender').value || profile.gender;
    profile.weight = parseFloat(document.getElementById('goal-weight').value) || profile.weight;
    profile.heightUnit = heightUnit;
    if (heightUnit === 'ft') {
      profile.heightFt = parseFloat(document.getElementById('goal-height-ft')?.value || 0);
      profile.heightIn = parseFloat(document.getElementById('goal-height-in')?.value || 0);
      profile.height = (profile.heightFt * 30.48) + (profile.heightIn * 2.54);
    } else {
      profile.height = parseFloat(document.getElementById('goal-height').value) || profile.height;
    }
    profile.activityLevel = parseFloat(document.getElementById('goal-activity').value) || profile.activityLevel;
    profile.goal = document.getElementById('goal-type').value || profile.goal;

    Store.saveProfile(profile);
    const targets = Utils.calculateNutritionTargets(profile);
    if (targets && targets.water) {
      Store.setWaterGoal(targets.water);
    }
    Utils.showToast(`Goals updated! New target: ${calculatedTDEE} kcal`, 'success');

    if (window.Dashboard && typeof window.Dashboard.refresh === 'function') {
      window.Dashboard.refresh();
    }
  }

  return { init, recalculate };
})();
