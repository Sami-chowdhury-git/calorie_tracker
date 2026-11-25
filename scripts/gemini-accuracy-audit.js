require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.AUDIT_BASE_URL || 'https://caltrack-amber.vercel.app';

// Reference weighed meals anchored to USDA FoodData Central standard values
const REFERENCE_MEALS = [
  {
    description: '150g grilled skinless chicken breast and 200g cooked white rice',
    expected: { calories: 508, protein: 52.0, carbs: 56.0, fat: 6.0 }
  },
  {
    description: '100g hard boiled eggs and 60g whole wheat bread',
    expected: { calories: 303, protein: 20.4, carbs: 27.9, fat: 12.6 }
  },
  {
    description: '80g raw rolled oats, 250ml whole milk, and 120g banana',
    expected: { calories: 571, protein: 23.0, carbs: 93.7, fat: 14.2 }
  },
  {
    description: '150g baked Atlantic salmon fillet and 150g steamed broccoli',
    expected: { calories: 364, protein: 36.6, carbs: 10.8, fat: 19.6 }
  },
  {
    description: '330ml Coca-Cola classic',
    expected: { calories: 139, protein: 0.0, carbs: 35.0, fat: 0.0 }
  }
];

function extractCookies(res) {
  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

function buildMealPrompt(desc) {
  return `You are a certified nutrition expert. Analyze the meal description below and calculate accurate nutritional values from your knowledge.

Meal: "${desc}"

Return ONLY a valid JSON array. No markdown, no explanation, no code fences. Each element:
[
  {
    "name": "Food item name",
    "quantity": 1,
    "calories": 150,
    "protein": 10.0,
    "carbs": 20.0,
    "fat": 5.0,
    "fiber": 3.0,
    "sugar": 2.0,
    "sodium": 220,
    "weight_grams": 200,
    "serving": "200g"
  }
]`;
}

async function runAudit() {
  const email = `ai_audit_${Date.now()}@example.com`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AI Accuracy Auditor', email, password: 'AuditPassword123!' })
  });
  const signupJson = await signupRes.json();
  if (!signupRes.ok || !signupJson.success) {
    throw new Error(`Signup failed: ${signupRes.status} ${JSON.stringify(signupJson)}`);
  }
  const cookieHeader = extractCookies(signupRes);

  const results = [];
  for (const meal of REFERENCE_MEALS) {
    const res = await fetch(`${BASE_URL}/api/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildMealPrompt(meal.description) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' }
      })
    });

    if (!res.ok) {
      throw new Error(`Gemini proxy failed (${res.status}): ${await res.text()}`);
    }
    const payload = await res.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    const predicted = items.reduce((acc, it) => {
      acc.calories += Number(it.calories) || 0;
      acc.protein += Number(it.protein) || 0;
      acc.carbs += Number(it.carbs) || 0;
      acc.fat += Number(it.fat) || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const calErr = Math.abs(predicted.calories - meal.expected.calories);
    const calPctErr = (calErr / meal.expected.calories) * 100;
    const protErr = Math.abs(predicted.protein - meal.expected.protein);
    const carbsErr = Math.abs(predicted.carbs - meal.expected.carbs);
    const fatErr = Math.abs(predicted.fat - meal.expected.fat);

    results.push({
      meal: meal.description,
      expected: meal.expected,
      predicted: {
        calories: Math.round(predicted.calories),
        protein: Math.round(predicted.protein * 10) / 10,
        carbs: Math.round(predicted.carbs * 10) / 10,
        fat: Math.round(predicted.fat * 10) / 10
      },
      absError: {
        calories: Math.round(calErr),
        caloriePct: Math.round(calPctErr * 10) / 10,
        proteinG: Math.round(protErr * 10) / 10,
        carbsG: Math.round(carbsErr * 10) / 10,
        fatG: Math.round(fatErr * 10) / 10
      }
    });
  }

  // Test rate limit headers & cleanup session
  await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieHeader }
  });

  const n = results.length;
  const summary = {
    auditedAt: new Date().toISOString(),
    targetUrl: BASE_URL,
    mealCount: n,
    meanAbsoluteErrorCalories: Math.round((results.reduce((s, r) => s + r.absError.calories, 0) / n) * 10) / 10,
    meanAbsolutePercentageErrorCalories: Math.round((results.reduce((s, r) => s + r.absError.caloriePct, 0) / n) * 10) / 10,
    meanAbsoluteErrorProteinG: Math.round((results.reduce((s, r) => s + r.absError.proteinG, 0) / n) * 10) / 10,
    meanAbsoluteErrorCarbsG: Math.round((results.reduce((s, r) => s + r.absError.carbsG, 0) / n) * 10) / 10,
    meanAbsoluteErrorFatG: Math.round((results.reduce((s, r) => s + r.absError.fatG, 0) / n) * 10) / 10,
    results
  };

  fs.mkdirSync(path.join(__dirname, '..', 'audit-reports'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'audit-reports', 'gemini-accuracy.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

runAudit().catch(err => {
  console.error('AI Accuracy Audit failed:', err);
  process.exit(1);
});
