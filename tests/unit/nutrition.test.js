import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Nutrition = require('../../js/nutrition.js');

describe('Nutrition & TDEE Shared Module', () => {
  it('converts lbs to kg accurately without lbs-as-kg defect', () => {
    const kgProfile = { age: 25, gender: 'male', weight: 70, weightUnit: 'kg', height: 175, heightUnit: 'cm', activityLevel: 1.55, goal: 'maintain' };
    const lbsProfile = { age: 25, gender: 'male', weight: 154.3, weightUnit: 'lbs', height: 175, heightUnit: 'cm', activityLevel: 1.55, goal: 'maintain' };

    const resKg = Nutrition.calculateTDEE(kgProfile);
    const resLbs = Nutrition.calculateTDEE(lbsProfile);

    expect(Math.abs(resKg.tdee - resLbs.tdee)).toBeLessThanOrEqual(5);
    expect(Math.abs(resKg.protein - resLbs.protein)).toBeLessThanOrEqual(1);
  });

  it('converts ft/in to cm accurately across legacy and new profile shapes', () => {
    expect(Nutrition.ftInToCm(5, 9)).toBeCloseTo(175.3, 1);
    expect(Nutrition.cmToFtIn(175.3)).toEqual({ ft: 5, inches: 9 });

    const p1 = Nutrition.normalizeProfile({ age: 30, gender: 'female', weight: 140, weightUnit: 'lbs', height: 5, heightInches: 6, heightUnit: 'ft', activityLevel: 1.375, goal: 'cut' });
    expect(p1.heightCm).toBeCloseTo(167.6, 1);
    expect(p1.weightKg).toBeCloseTo(63.5, 1);
    expect(p1.heightFt).toBe(5);
    expect(p1.heightIn).toBe(6);

    const p2 = Nutrition.normalizeProfile({ age: 30, gender: 'female', weight: 63.5, weightUnit: 'kg', height: 167.6, heightUnit: 'cm', activityLevel: 1.375, goal: 'cut' });
    expect(Math.abs(p1.tdee - p2.tdee)).toBeLessThanOrEqual(3);
  });

  it('computes identical personalized targets regardless of kg/lbs unit representation', () => {
    const pKg = Nutrition.normalizeProfile({ age: 28, gender: 'male', weight: 80, weightUnit: 'kg', height: 180, heightUnit: 'cm', activityLevel: 1.725, goal: 'bulk' });
    const pLbs = Nutrition.normalizeProfile({ age: 28, gender: 'male', weight: 176.4, weightUnit: 'lbs', height: 5, heightInches: 11, heightUnit: 'ft', activityLevel: 1.725, goal: 'bulk' });

    const tKg = Nutrition.calculateNutritionTargets(pKg);
    const tLbs = Nutrition.calculateNutritionTargets(pLbs);

    expect(Math.abs(tKg.water - tLbs.water)).toBeLessThanOrEqual(50);
    expect(Math.abs(tKg.fiber - tLbs.fiber)).toBeLessThanOrEqual(1);
    expect(Math.abs(tKg.sugar - tLbs.sugar)).toBeLessThanOrEqual(1);
    expect(tKg.sodium).toBe(tLbs.sodium);
  });

  it('uses per-serving nutrition from Open Food Facts instead of forcing per-100g', () => {
    const nutellaLike = {
      product_name: 'Nutella',
      brands: 'Ferrero',
      serving_size: '15 g',
      serving_quantity: 15,
      nutriments: {
        'energy-kcal_100g': 539,
        'energy-kcal_serving': 81,
        proteins_100g: 6.3,
        proteins_serving: 0.9,
        carbohydrates_100g: 57.5,
        carbohydrates_serving: 8.6,
        fat_100g: 30.9,
        fat_serving: 4.6,
        fiber_100g: 3.4,
        sugars_100g: 56.3,
        sodium_100g: 0.043
      }
    };

    const parsed = Nutrition.computeBarcodeNutrition(nutellaLike);
    expect(parsed.totalCalories).toBe(81);
    expect(parsed.food.serving).toBe('15 g');
    expect(parsed.food.weight_grams).toBe(15);
    expect(parsed.totalProtein).toBe(0.9);
  });

  it('scales *_100g by serving grams when *_serving is omitted, or falls back to 100g label when unknown', () => {
    const barWithoutServingNut = {
      product_name: 'Protein Bar',
      serving_size: '1 bar (50 g)',
      nutriments: {
        'energy-kcal_100g': 400,
        proteins_100g: 40,
        carbohydrates_100g: 30,
        fat_100g: 10,
        fiber_100g: 8,
        sugars_100g: 2,
        sodium_100g: 0.4
      }
    };
    const scaled = Nutrition.computeBarcodeNutrition(barWithoutServingNut);
    expect(scaled.totalCalories).toBe(200);
    expect(scaled.totalProtein).toBe(20);
    expect(scaled.totalFiber).toBe(4);
    expect(scaled.totalSodium).toBe(200);
    expect(scaled.food.serving).toBe('1 bar (50 g)');

    const unknownServing = {
      product_name: 'Mystery Pack',
      nutriments: { 'energy-kcal_100g': 250, proteins_100g: 10 }
    };
    const fallback = Nutrition.computeBarcodeNutrition(unknownServing);
    expect(fallback.totalCalories).toBe(250);
    expect(fallback.food.serving).toBe('100g');
    expect(fallback.food.weight_grams).toBe(100);
  });

  it('scales fiber, sugar, and sodium alongside macros without micronutrient drift', () => {
    const item = {
      quantity: 1,
      food: { name: 'Meal', calories: 400, protein: 20, carbs: 40, fat: 10, fiber: 6, sugar: 4, sodium: 500, weight_grams: 200, serving: '200g' },
      ingredients: [
        { name: 'Rice', calories: 200, protein: 4, carbs: 44, fat: 0.5, fiber: 2, sugar: 0.2, sodium: 10, weight_grams: 150, serving: '150g' },
        { name: 'Chicken', calories: 200, protein: 30, carbs: 0, fat: 5, fiber: 0, sugar: 0, sodium: 300, weight_grams: 100, serving: '100g' }
      ],
      totalCalories: 400, totalProtein: 20, totalCarbs: 40, totalFat: 10, totalFiber: 6, totalSugar: 4, totalSodium: 500
    };

    item.quantity = 2.5;
    Nutrition.recalcParsedItemTotals(item);
    expect(item.totalCalories).toBe(1000);
    expect(item.totalFiber).toBe(15);
    expect(item.totalSugar).toBe(10);
    expect(item.totalSodium).toBe(1250);

    item.quantity = 1;
    Nutrition.scaleFoodServings(item, 400);
    expect(item.totalCalories).toBe(800);
    expect(item.totalFiber).toBe(12);
    expect(item.totalSugar).toBe(8);
    expect(item.totalSodium).toBe(1000);

    Nutrition.scaleIngredientWeight(item, 0, 300);
    expect(item.ingredients[0].fiber).toBe(4);
    expect(item.totalFiber).toBe(4);
    expect(item.totalCalories).toBe(600);
  });

  it('computes streaks deterministically and drops stale streaks after missed days', () => {
    const resActive = Nutrition.computeStreaks({
      loggedDates: ['2026-11-23', '2026-11-24', '2026-11-25'],
      totalsByDate: {
        '2026-11-23': { meals: 2, protein: 140 },
        '2026-11-24': { meals: 3, protein: 150 },
        '2026-11-25': { meals: 1, protein: 100 }
      },
      weightDates: ['2026-11-24', '2026-11-25'],
      proteinTarget: 150,
      prevLongest: 1,
      todayStr: '2026-11-25'
    });
    expect(resActive.currentStreak).toBe(3);
    expect(resActive.longestStreak).toBe(3);
    expect(resActive.weightLogStreak).toBe(2);
    expect(resActive.proteinStreak).toBe(2);

    const resBroken = Nutrition.computeStreaks({
      loggedDates: ['2026-11-20', '2026-11-21', '2026-11-22'],
      totalsByDate: {
        '2026-11-20': { meals: 2, protein: 150 },
        '2026-11-21': { meals: 2, protein: 150 },
        '2026-11-22': { meals: 2, protein: 150 }
      },
      weightDates: [],
      proteinTarget: 150,
      prevLongest: 0,
      todayStr: '2026-11-25'
    });
    expect(resBroken.currentStreak).toBe(0);
    expect(resBroken.longestStreak).toBe(3);
  });
});
