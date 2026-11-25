window.Goals = (() => {
  let calculatedTDEE = 0;
  let calculatedMacros = { protein: 0, carbs: 0, fat: 0 };
  let bound = false;

  function init() {
    const profile = Store.getProfile();
    if (profile) {
      const age = document.getElementById('goal-age');
      const gender = document.getElementById('goal-gender');
      const weight = document.getElementById('goal-weight');
      const weightUnit = document.getElementById('goal-weight-unit');
      const height = document.getElementById('goal-height');
      const heightUnit = document.getElementById('goal-height-unit');
      const activity = document.getElementById('goal-activity');
      const goalType = document.getElementById('goal-type');

      if (age && profile.age) age.value = profile.age;
      if (gender && profile.gender) gender.value = profile.gender;
      if (weightUnit) weightUnit.value = profile.weightUnit === 'lbs' ? 'lbs' : 'kg';
      if (weight && profile.weight) {
        weight.value = profile.weightUnit === 'lbs'
          ? window.Nutrition.kgToLbs(profile.weightKg || window.Nutrition.resolveWeightKg(profile))
          : (profile.weightKg || profile.weight);
      }
      if (heightUnit && profile.heightUnit) {
        heightUnit.value = profile.heightUnit;
        toggleHeightInputs(profile.heightUnit);
      }
      if (profile.heightUnit === 'ft') {
        const ftEl = document.getElementById('goal-height-ft');
        const inEl = document.getElementById('goal-height-in');
        const ftIn = window.Nutrition.cmToFtIn(profile.heightCm || window.Nutrition.resolveHeightCm(profile));
        if (ftEl) ftEl.value = profile.heightFt ?? ftIn.ft;
        if (inEl) inEl.value = profile.heightIn ?? profile.heightInches ?? ftIn.inches;
      } else {
        if (height) height.value = profile.heightCm || profile.height || 175;
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

    if (!bound) {
      bound = true;
      document.getElementById('recalc-btn')?.addEventListener('click', recalculate);
      document.getElementById('goal-height-unit')?.addEventListener('change', (e) => {
        toggleHeightInputs(e.target.value);
      });
      document.getElementById('goal-weight-unit')?.addEventListener('change', (e) => {
        const wEl = document.getElementById('goal-weight');
        const val = parseFloat(wEl?.value);
        if (wEl && Number.isFinite(val) && val > 0 && window.Nutrition) {
          wEl.value = e.target.value === 'lbs'
            ? window.Nutrition.kgToLbs(val)
            : window.Nutrition.lbsToKg(val);
        }
      });
      document.getElementById('apply-goals-btn')?.addEventListener('click', applyGoals);
    }
  }

  function toggleHeightInputs(unit) {
    const cmGroup = document.getElementById('goal-height-cm-group');
    const ftGroup = document.getElementById('goal-height-ft-group');
    if (unit === 'ft') {
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

  function readAndValidateInputs() {
    const age = parseInt(document.getElementById('goal-age').value, 10);
    const gender = document.getElementById('goal-gender').value === 'female' ? 'female' : 'male';
    const weight = parseFloat(document.getElementById('goal-weight').value);
    const weightUnit = document.getElementById('goal-weight-unit')?.value === 'lbs' ? 'lbs' : 'kg';
    const heightUnit = document.getElementById('goal-height-unit')?.value === 'ft' ? 'ft' : 'cm';
    const activity = parseFloat(document.getElementById('goal-activity').value);
    const goal = document.getElementById('goal-type').value;

    if (isNaN(age) || age < 13 || age > 100) {
      Utils.showToast('Please enter a valid age (13–100 years)', 'warning');
      return null;
    }

    const minW = weightUnit === 'lbs' ? 44 : 20;
    const maxW = weightUnit === 'lbs' ? 660 : 300;
    if (isNaN(weight) || weight < minW || weight > maxW) {
      Utils.showToast(`Please enter a valid weight (${minW}–${maxW} ${weightUnit})`, 'warning');
      return null;
    }

    let heightFt, heightIn, heightCm;
    if (heightUnit === 'ft') {
      heightFt = parseFloat(document.getElementById('goal-height-ft')?.value || 0);
      heightIn = parseFloat(document.getElementById('goal-height-in')?.value || 0);
      if (isNaN(heightFt) || heightFt < 1 || heightFt > 7) {
        Utils.showToast('Feet must be between 1 and 7 ft', 'warning');
        return null;
      }
      if (isNaN(heightIn) || heightIn < 0 || heightIn > 11) {
        Utils.showToast('Inches must be between 0 and 11 in', 'warning');
        return null;
      }
      heightCm = window.Nutrition.ftInToCm(heightFt, heightIn);
    } else {
      heightCm = parseFloat(document.getElementById('goal-height').value);
      if (isNaN(heightCm) || heightCm < 50 || heightCm > 250) {
        Utils.showToast('Please enter a valid height (50–250 cm)', 'warning');
        return null;
      }
      const ftIn = window.Nutrition.cmToFtIn(heightCm);
      heightFt = ftIn.ft;
      heightIn = ftIn.inches;
    }

    const weightKg = weightUnit === 'lbs' ? window.Nutrition.lbsToKg(weight) : weight;

    return {
      age,
      gender,
      weight,
      weightUnit,
      weightKg,
      heightUnit,
      heightCm,
      heightFt,
      heightIn,
      heightInches: heightIn,
      height: heightUnit === 'ft' ? heightFt : heightCm,
      activityLevel: activity,
      goal
    };
  }

  function recalculate() {
    const inputs = readAndValidateInputs();
    if (!inputs) return;

    const result = window.Nutrition.calculateTDEE(inputs);
    calculatedTDEE = result.tdee;
    calculatedMacros = {
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat
    };

    document.getElementById('recalc-tdee').textContent = `${result.tdee} kcal`;
    document.getElementById('recalc-protein').textContent = calculatedMacros.protein;
    document.getElementById('recalc-carbs').textContent = calculatedMacros.carbs;
    document.getElementById('recalc-fat').textContent = calculatedMacros.fat;
    document.getElementById('recalc-result').classList.remove('hidden');

    Utils.showToast(`New TDEE: ${result.tdee} kcal`, 'success');
    if (window.lucide) lucide.createIcons();
  }

  function applyGoals() {
    const profile = Store.getProfile();
    if (!profile) return;

    const inputs = readAndValidateInputs();
    if (!inputs) return;

    const result = window.Nutrition.calculateTDEE(inputs);
    calculatedTDEE = result.tdee;
    calculatedMacros = {
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat
    };

    const updated = window.Nutrition.normalizeProfile({
      ...profile,
      ...inputs,
      tdee: calculatedTDEE,
      protein: calculatedMacros.protein,
      carbs: calculatedMacros.carbs,
      fat: calculatedMacros.fat
    });

    Store.saveProfile(updated);
    const targets = Utils.calculateNutritionTargets(updated);
    if (targets && targets.water) {
      Store.setWaterGoal(targets.water);
    }
    Utils.showToast(`Goals updated! New target: ${calculatedTDEE} kcal`, 'success');

    if (window.Dashboard && typeof window.Dashboard.refresh === 'function') {
      window.Dashboard.refresh();
    }
    if (window.Analytics && typeof window.Analytics.refresh === 'function') {
      window.Analytics.refresh();
    }
  }

  return { init, recalculate };
})();
