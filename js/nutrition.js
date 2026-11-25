(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Nutrition = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LBS_TO_KG = 0.45359237;
  const KG_TO_LBS = 2.20462262;
  const CM_PER_FOOT = 30.48;
  const CM_PER_INCH = 2.54;

  const MACRO_SPLITS = {
    cut:      { protein: 0.40, carbs: 0.30, fat: 0.30 },
    maintain: { protein: 0.30, carbs: 0.40, fat: 0.30 },
    bulk:     { protein: 0.30, carbs: 0.45, fat: 0.25 }
  };

  function round1(val) {
    return Math.round((Number(val) || 0) * 10) / 10;
  }

  function roundInt(val) {
    return Math.round(Number(val) || 0);
  }

  function lbsToKg(lbs) {
    const n = parseFloat(lbs);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * LBS_TO_KG * 100) / 100;
  }

  function kgToLbs(kg) {
    const n = parseFloat(kg);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * KG_TO_LBS * 10) / 10;
  }

  function ftInToCm(ft, inches) {
    const f = parseFloat(ft) || 0;
    const i = parseFloat(inches) || 0;
    return Math.round(((f * CM_PER_FOOT) + (i * CM_PER_INCH)) * 10) / 10;
  }

  function cmToFtIn(cm) {
    const c = parseFloat(cm) || 175;
    const totalInches = Math.round(c / CM_PER_INCH);
    const ft = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return { ft, inches };
  }

  function resolveWeightKg(profile) {
    if (!profile) return 70;
    if (Number.isFinite(parseFloat(profile.weightKg)) && parseFloat(profile.weightKg) > 0) {
      return parseFloat(profile.weightKg);
    }
    const raw = parseFloat(profile.weight);
    if (!Number.isFinite(raw) || raw <= 0) return 70;
    return profile.weightUnit === 'lbs' ? lbsToKg(raw) : raw;
  }

  function resolveHeightCm(profile) {
    if (!profile) return 175;
    if (Number.isFinite(parseFloat(profile.heightCm)) && parseFloat(profile.heightCm) >= 50) {
      return parseFloat(profile.heightCm);
    }
    if (profile.heightUnit === 'ft') {
      const explicitFt = parseFloat(profile.heightFt);
      const rawH = parseFloat(profile.height);
      const explicitIn = parseFloat(profile.heightIn ?? profile.heightInches);
      if (Number.isFinite(explicitFt) && explicitFt >= 1 && explicitFt <= 9) {
        return ftInToCm(explicitFt, Number.isFinite(explicitIn) ? explicitIn : 0);
      }
      if (Number.isFinite(rawH) && rawH >= 1 && rawH <= 9) {
        return ftInToCm(rawH, Number.isFinite(explicitIn) ? explicitIn : 0);
      }
      if (Number.isFinite(rawH) && rawH >= 50) {
        return rawH;
      }
      return 175;
    }
    const h = parseFloat(profile.height);
    return (Number.isFinite(h) && h >= 50) ? h : 175;
  }

  function normalizeProfile(rawProfile) {
    if (!rawProfile || typeof rawProfile !== 'object') return null;
    const weightUnit = rawProfile.weightUnit === 'lbs' ? 'lbs' : 'kg';
    const heightUnit = rawProfile.heightUnit === 'ft' ? 'ft' : 'cm';
    const weightKg = resolveWeightKg(rawProfile);
    const heightCm = resolveHeightCm(rawProfile);
    const ftIn = cmToFtIn(heightCm);

    const displayWeight = weightUnit === 'lbs'
      ? (Number.isFinite(parseFloat(rawProfile.weight)) && rawProfile.weightUnit === 'lbs' && !rawProfile.weightKg ? parseFloat(rawProfile.weight) : kgToLbs(weightKg))
      : Math.round(weightKg * 10) / 10;

    const normalized = {
      ...rawProfile,
      age: parseInt(rawProfile.age, 10) || 25,
      gender: rawProfile.gender === 'female' ? 'female' : 'male',
      weightUnit,
      weightKg: Math.round(weightKg * 100) / 100,
      weight: displayWeight,
      heightUnit,
      heightCm: Math.round(heightCm * 10) / 10,
      height: heightUnit === 'ft' ? (parseFloat(rawProfile.heightFt) || ftIn.ft) : Math.round(heightCm * 10) / 10,
      heightFt: heightUnit === 'ft' ? (Number.isFinite(parseFloat(rawProfile.heightFt)) ? parseFloat(rawProfile.heightFt) : (parseFloat(rawProfile.height) <= 9 ? parseFloat(rawProfile.height) : ftIn.ft)) : ftIn.ft,
      heightIn: heightUnit === 'ft' ? (Number.isFinite(parseFloat(rawProfile.heightIn ?? rawProfile.heightInches)) ? parseFloat(rawProfile.heightIn ?? rawProfile.heightInches) : ftIn.inches) : ftIn.inches,
      heightInches: heightUnit === 'ft' ? (Number.isFinite(parseFloat(rawProfile.heightIn ?? rawProfile.heightInches)) ? parseFloat(rawProfile.heightIn ?? rawProfile.heightInches) : ftIn.inches) : ftIn.inches,
      activityLevel: parseFloat(rawProfile.activityLevel) || 1.55,
      goal: ['cut', 'maintain', 'bulk'].includes(rawProfile.goal) ? rawProfile.goal : 'maintain'
    };

    const plan = calculateTDEE(normalized);
    if (!normalized.tdee || normalized.tdee < 800) {
      normalized.tdee = plan.tdee;
      normalized.protein = plan.protein;
      normalized.carbs = plan.carbs;
      normalized.fat = plan.fat;
    }
    return normalized;
  }

  function calculateBMR(input) {
    const age = parseInt(input?.age, 10) || 25;
    const gender = input?.gender === 'female' ? 'female' : 'male';
    const weightKg = resolveWeightKg(input);
    const heightCm = resolveHeightCm(input);
    const base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
    return gender === 'female' ? base - 161 : base + 5;
  }

  function calculateTDEE(input) {
    const bmr = calculateBMR(input);
    const activity = parseFloat(input?.activityLevel) || 1.55;
    const goal = ['cut', 'maintain', 'bulk'].includes(input?.goal) ? input.goal : 'maintain';
    const maintenanceTdee = Math.round(bmr * activity);

    let adjustment = 0;
    if (goal === 'cut') {
      adjustment = -Math.min(500, Math.round(maintenanceTdee * 0.20));
    } else if (goal === 'bulk') {
      adjustment = Math.max(150, Math.min(300, Math.round(maintenanceTdee * 0.12)));
    }

    const tdee = Math.max(1200, Math.round(maintenanceTdee + adjustment));
    const s = MACRO_SPLITS[goal] || MACRO_SPLITS.maintain;

    return {
      bmr: Math.round(bmr),
      maintenanceTdee,
      tdee,
      protein: Math.round((tdee * s.protein) / 4),
      carbs: Math.round((tdee * s.carbs) / 4),
      fat: Math.round((tdee * s.fat) / 9)
    };
  }

  function calculateNutritionTargets(profile) {
    if (!profile) {
      return {
        tdee: 2000, protein: 150, carbs: 220, fat: 73,
        water: 2500, fiber: 28, sugar: 50, sodium: 2300
      };
    }

    const age = parseInt(profile.age, 10) || 25;
    const gender = profile.gender === 'female' ? 'female' : 'male';
    const weightKg = resolveWeightKg(profile);
    const activity = parseFloat(profile.activityLevel) || 1.55;
    const goal = ['cut', 'maintain', 'bulk'].includes(profile.goal) ? profile.goal : 'maintain';
    const computed = calculateTDEE(profile);
    const tdee = (Number.isFinite(parseInt(profile.tdee, 10)) && parseInt(profile.tdee, 10) >= 800)
      ? parseInt(profile.tdee, 10)
      : computed.tdee;

    const waterBasePerKg = gender === 'male' ? 35 : 31;
    let activityWaterAdd = 0;
    if (activity >= 1.9) activityWaterAdd = 1200;
    else if (activity >= 1.725) activityWaterAdd = 800;
    else if (activity >= 1.55) activityWaterAdd = 500;
    else if (activity >= 1.375) activityWaterAdd = 250;

    let water = Math.round((weightKg * waterBasePerKg) + activityWaterAdd);
    if (goal === 'cut') water += 300;
    else if (goal === 'bulk') water += 400;

    water = Math.round(water / 50) * 50;
    water = Math.max(1800, Math.min(5000, water));

    const fiberFromCals = (tdee / 1000) * 14;
    const genderAgeFiber = (gender === 'male') ? (age <= 50 ? 38 : 30) : (age <= 50 ? 25 : 21);
    let fiber = Math.round((fiberFromCals * 0.65) + (genderAgeFiber * 0.35));
    if (goal === 'cut') fiber += 3;
    fiber = Math.max(20, Math.min(50, fiber));

    const sugarPct = (goal === 'cut') ? 0.08 : 0.10;
    let sugar = Math.round((tdee * sugarPct) / 4);
    if (gender === 'female') sugar = Math.min(sugar, Math.round((tdee * 0.09) / 4));
    sugar = Math.max(25, Math.min(85, sugar));

    let sodium = 2300;
    if (activity >= 1.9) sodium = 3200;
    else if (activity >= 1.725) sodium = 2800;
    else if (activity >= 1.55) sodium = 2500;
    else if (activity <= 1.2) sodium = 2000;

    if (weightKg > 90) sodium += 200;
    if (goal === 'cut') sodium = Math.max(1800, sodium - 200);

    return {
      tdee,
      protein: profile.protein || computed.protein,
      carbs: profile.carbs || computed.carbs,
      fat: profile.fat || computed.fat,
      water,
      fiber,
      sugar,
      sodium
    };
  }

  function parseServingGrams(product) {
    if (!product) return null;
    const qty = parseFloat(product.serving_quantity);
    const unit = String(product.serving_quantity_unit || '').toLowerCase().trim();
    if (Number.isFinite(qty) && qty > 0) {
      if (!unit || unit === 'g' || unit === 'gr' || unit === 'gram' || unit === 'grams' || unit === 'ml') {
        return qty;
      }
      if (unit === 'oz' || unit === 'fl oz') {
        return Math.round(qty * 28.3495 * 10) / 10;
      }
      if (unit === 'cl') return qty * 10;
      if (unit === 'dl') return qty * 100;
      if (unit === 'l' || unit === 'kg') return qty * 1000;
    }

    const str = String(product.serving_size || '');
    const m = str.match(/(\d+(?:[.,]\d+)?)\s*(ml|mL|g|gr|grams?|oz)\b/i);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      const u = m[2].toLowerCase();
      if (Number.isFinite(val) && val > 0) {
        if (u === 'oz') return Math.round(val * 28.3495 * 10) / 10;
        return val;
      }
    }
    return null;
  }

  function computeBarcodeNutrition(product) {
    const nut = (product && product.nutriments) || {};
    const name = product?.product_name || product?.product_name_en || product?.generic_name || 'Packaged Item';
    const brand = product?.brands ? ` (${product.brands})` : '';
    const rawServingLabel = product?.serving_size ? String(product.serving_size).trim() : '';
    const servingGrams = parseServingGrams(product);

    const hasServingKcal = nut['energy-kcal_serving'] != null || nut['energy-kj_serving'] != null;
    const cal100 = Number(nut['energy-kcal_100g'] ?? nut['energy-kcal_value'] ?? (nut['energy-kj_100g'] != null ? nut['energy-kj_100g'] / 4.184 : 0)) || 0;
    const prot100 = Number(nut.proteins_100g ?? nut.proteins_value ?? 0) || 0;
    const carbs100 = Number(nut.carbohydrates_100g ?? nut.carbohydrates_value ?? 0) || 0;
    const fat100 = Number(nut.fat_100g ?? nut.fat_value ?? 0) || 0;
    const fiber100 = Number(nut.fiber_100g ?? nut.fiber_value ?? 0) || 0;
    const sugar100 = Number(nut.sugars_100g ?? nut.sugars_value ?? 0) || 0;
    const sodiumG100 = Number(nut.sodium_100g ?? (nut.salt_100g != null ? nut.salt_100g / 2.5 : 0)) || 0;

    let calories, protein, carbs, fat, fiber, sugar, sodium, weightGrams, serving;

    if (hasServingKcal && (rawServingLabel || servingGrams)) {
      const sCal = nut['energy-kcal_serving'] != null
        ? Number(nut['energy-kcal_serving'])
        : Number(nut['energy-kj_serving']) / 4.184;
      const ratio = servingGrams ? (servingGrams / 100) : 1;

      calories = roundInt(sCal);
      protein = round1(nut.proteins_serving != null ? nut.proteins_serving : prot100 * ratio);
      carbs = round1(nut.carbohydrates_serving != null ? nut.carbohydrates_serving : carbs100 * ratio);
      fat = round1(nut.fat_serving != null ? nut.fat_serving : fat100 * ratio);
      fiber = round1(nut.fiber_serving != null ? nut.fiber_serving : fiber100 * ratio);
      sugar = round1(nut.sugars_serving != null ? nut.sugars_serving : sugar100 * ratio);
      const sSodG = nut.sodium_serving != null
        ? Number(nut.sodium_serving)
        : (nut.salt_serving != null ? Number(nut.salt_serving) / 2.5 : sodiumG100 * ratio);
      sodium = roundInt(sSodG * 1000);
      weightGrams = servingGrams || 100;
      serving = rawServingLabel || `${weightGrams}g`;
    } else if (servingGrams && servingGrams > 0) {
      const ratio = servingGrams / 100;
      calories = roundInt(cal100 * ratio);
      protein = round1(prot100 * ratio);
      carbs = round1(carbs100 * ratio);
      fat = round1(fat100 * ratio);
      fiber = round1(fiber100 * ratio);
      sugar = round1(sugar100 * ratio);
      sodium = roundInt(sodiumG100 * ratio * 1000);
      weightGrams = servingGrams;
      serving = rawServingLabel || `${servingGrams}g`;
    } else {
      calories = roundInt(cal100);
      protein = round1(prot100);
      carbs = round1(carbs100);
      fat = round1(fat100);
      fiber = round1(fiber100);
      sugar = round1(sugar100);
      sodium = roundInt(sodiumG100 * 1000);
      weightGrams = 100;
      serving = '100g';
    }

    return {
      food: {
        name: name + brand,
        aliases: [],
        category: 'packaged',
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sugar,
        sodium,
        serving,
        weight_grams: weightGrams,
        unit: 'serving'
      },
      ingredients: [],
      quantity: 1,
      totalCalories: calories,
      totalProtein: protein,
      totalCarbs: carbs,
      totalFat: fat,
      totalFiber: fiber,
      totalSugar: sugar,
      totalSodium: sodium
    };
  }

  function recalcParsedItemTotals(item) {
    if (!item || !item.food) return item;
    const qty = parseFloat(item.quantity) || 1;
    item.quantity = qty;
    item.totalCalories = roundInt((item.food.calories || 0) * qty);
    item.totalProtein = round1((item.food.protein || 0) * qty);
    item.totalCarbs = round1((item.food.carbs || 0) * qty);
    item.totalFat = round1((item.food.fat || 0) * qty);
    item.totalFiber = round1((item.food.fiber || 0) * qty);
    item.totalSugar = round1((item.food.sugar || 0) * qty);
    item.totalSodium = roundInt((item.food.sodium || 0) * qty);
    return item;
  }

  function scaleFoodServings(item, newGrams) {
    if (!item || !item.food) return item;
    const g = parseFloat(newGrams);
    if (!Number.isFinite(g) || g <= 0 || !item.food.weight_grams) return item;
    const ratio = g / item.food.weight_grams;
    item.food.calories = roundInt((item.food.calories || 0) * ratio);
    item.food.protein = round1((item.food.protein || 0) * ratio);
    item.food.carbs = round1((item.food.carbs || 0) * ratio);
    item.food.fat = round1((item.food.fat || 0) * ratio);
    item.food.fiber = round1((item.food.fiber || 0) * ratio);
    item.food.sugar = round1((item.food.sugar || 0) * ratio);
    item.food.sodium = roundInt((item.food.sodium || 0) * ratio);
    item.food.weight_grams = g;
    item.food.serving = `${g}g`;
    return recalcParsedItemTotals(item);
  }

  function syncItemFromIngredients(item) {
    if (!item || !item.food || !Array.isArray(item.ingredients)) return item;
    const qty = parseFloat(item.quantity) || 1;
    const sums = item.ingredients.reduce((acc, ing) => {
      acc.calories += Number(ing.calories) || 0;
      acc.protein += Number(ing.protein) || 0;
      acc.carbs += Number(ing.carbs) || 0;
      acc.fat += Number(ing.fat) || 0;
      acc.fiber += Number(ing.fiber) || 0;
      acc.sugar += Number(ing.sugar) || 0;
      acc.sodium += Number(ing.sodium) || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 });

    item.food.calories = roundInt(sums.calories / qty);
    item.food.protein = round1(sums.protein / qty);
    item.food.carbs = round1(sums.carbs / qty);
    item.food.fat = round1(sums.fat / qty);
    item.food.fiber = round1(sums.fiber / qty);
    item.food.sugar = round1(sums.sugar / qty);
    item.food.sodium = roundInt(sums.sodium / qty);
    return recalcParsedItemTotals(item);
  }

  function scaleIngredientWeight(item, ingIndex, newGrams) {
    if (!item || !Array.isArray(item.ingredients) || !item.ingredients[ingIndex]) return item;
    const ing = item.ingredients[ingIndex];
    const g = parseFloat(newGrams);
    if (!Number.isFinite(g) || g <= 0 || !ing.weight_grams) return item;
    const ratio = g / ing.weight_grams;
    ing.calories = roundInt((ing.calories || 0) * ratio);
    ing.protein = round1((ing.protein || 0) * ratio);
    ing.carbs = round1((ing.carbs || 0) * ratio);
    ing.fat = round1((ing.fat || 0) * ratio);
    ing.fiber = round1((ing.fiber || 0) * ratio);
    ing.sugar = round1((ing.sugar || 0) * ratio);
    ing.sodium = roundInt((ing.sodium || 0) * ratio);
    ing.weight_grams = g;
    ing.serving = `${g}g`;
    return syncItemFromIngredients(item);
  }

  function addDaysStr(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function computeStreaks({ loggedDates = [], totalsByDate = {}, weightDates = [], proteinTarget = 0, prevLongest = 0, todayStr }) {
    const validMealSet = new Set(
      loggedDates.filter(d => {
        const t = totalsByDate[d];
        return t ? t.meals > 0 : true;
      })
    );

    const yesterdayStr = addDaysStr(todayStr, -1);
    let anchor = null;
    if (validMealSet.has(todayStr)) anchor = todayStr;
    else if (validMealSet.has(yesterdayStr)) anchor = yesterdayStr;

    let currentStreak = 0;
    let cursor = anchor;
    while (cursor && validMealSet.has(cursor)) {
      currentStreak++;
      cursor = addDaysStr(cursor, -1);
    }

    const sortedMeals = [...validMealSet].sort();
    let maxMealRun = 0;
    let run = 0;
    let prevDate = null;
    for (const d of sortedMeals) {
      if (prevDate && addDaysStr(prevDate, 1) === d) {
        run++;
      } else {
        run = 1;
      }
      if (run > maxMealRun) maxMealRun = run;
      prevDate = d;
    }
    const longestStreak = Math.max(prevLongest || 0, currentStreak, maxMealRun);

    let proteinStreak = 0;
    if (proteinTarget > 0) {
      const threshold = proteinTarget * 0.9;
      let pAnchor = null;
      if ((totalsByDate[todayStr]?.protein || 0) >= threshold) pAnchor = todayStr;
      else if ((totalsByDate[yesterdayStr]?.protein || 0) >= threshold) pAnchor = yesterdayStr;

      let pCur = pAnchor;
      while (pCur && (totalsByDate[pCur]?.protein || 0) >= threshold) {
        proteinStreak++;
        pCur = addDaysStr(pCur, -1);
      }
    }

    const validWeightSet = new Set(weightDates);
    let wAnchor = null;
    if (validWeightSet.has(todayStr)) wAnchor = todayStr;
    else if (validWeightSet.has(yesterdayStr)) wAnchor = yesterdayStr;

    let weightLogStreak = 0;
    let wCur = wAnchor;
    while (wCur && validWeightSet.has(wCur)) {
      weightLogStreak++;
      wCur = addDaysStr(wCur, -1);
    }

    return {
      currentStreak,
      longestStreak,
      lastLogDate: sortedMeals.length ? sortedMeals[sortedMeals.length - 1] : null,
      proteinStreak,
      weightLogStreak
    };
  }

  return {
    LBS_TO_KG,
    KG_TO_LBS,
    lbsToKg,
    kgToLbs,
    ftInToCm,
    cmToFtIn,
    resolveWeightKg,
    resolveHeightCm,
    normalizeProfile,
    calculateBMR,
    calculateTDEE,
    calculateNutritionTargets,
    parseServingGrams,
    computeBarcodeNutrition,
    recalcParsedItemTotals,
    scaleFoodServings,
    syncItemFromIngredients,
    scaleIngredientWeight,
    computeStreaks
  };
}));
