/* ═══════════════════════════════════════════ */
/* GEMINI — Google Gemini AI Integration       */
/* ═══════════════════════════════════════════ */

window.Gemini = {
  // No API key here — it's stored in .env (local) and Vercel env vars (production).
  // All requests go through /api/gemini serverless proxy.

  async _fetch(body) {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res;
  },

  _normalize(item) {
    const qty = item.quantity || 1;
    return {
      food: {
        name: item.name || 'Unknown Food',
        aliases: [],
        category: 'ai-detected',
        calories: Math.round((item.calories || 0) / qty),
        protein: parseFloat(((item.protein || 0) / qty).toFixed(1)),
        carbs: parseFloat(((item.carbs || 0) / qty).toFixed(1)),
        fat: parseFloat(((item.fat || 0) / qty).toFixed(1)),
        fiber: parseFloat(((item.fiber || item.fiber_g || 0) / qty).toFixed(1)),
        sugar: parseFloat(((item.sugar || item.sugar_g || 0) / qty).toFixed(1)),
        sodium: Math.round((item.sodium || item.sodium_mg || 0) / qty),
        serving: item.serving || (item.weight_grams ? `${item.weight_grams}g` : '1 serving'),
        weight_grams: item.weight_grams || null,
        unit: 'serving',
      },
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients.map(ing => ({
            name: ing.name || 'Unknown',
            quantity: ing.quantity || 1,
            calories: Math.round(ing.calories || 0),
            protein: parseFloat((ing.protein || 0).toFixed(1)),
            carbs: parseFloat((ing.carbs || 0).toFixed(1)),
            fat: parseFloat((ing.fat || 0).toFixed(1)),
            fiber: parseFloat((ing.fiber || ing.fiber_g || 0).toFixed(1)),
            sugar: parseFloat((ing.sugar || ing.sugar_g || 0).toFixed(1)),
            sodium: Math.round(ing.sodium || ing.sodium_mg || 0),
            serving: ing.serving || (ing.weight_grams ? `${ing.weight_grams}g` : '1 serving'),
            weight_grams: ing.weight_grams || null,
          }))
        : [],
      quantity: qty,
      totalCalories: Math.round(item.calories || 0),
      totalProtein: parseFloat((item.protein || 0).toFixed(1)),
      totalCarbs: parseFloat((item.carbs || 0).toFixed(1)),
      totalFat: parseFloat((item.fat || 0).toFixed(1)),
      totalFiber: parseFloat(((item.fiber || item.fiber_g || 0)).toFixed(1)),
      totalSugar: parseFloat(((item.sugar || item.sugar_g || 0)).toFixed(1)),
      totalSodium: Math.round(item.sodium || item.sodium_mg || 0),
    };
  },

  _parseJSON(text) {
    if (!text) return null;
    const trimmed = text.trim();
    
    // First try standard cleaning of code block fences
    const cleaned = trimmed.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // If that fails, extract the first matching JSON block {...} or [...]
      const braceMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (braceMatch) {
        try {
          return JSON.parse(braceMatch[0]);
        } catch (e2) {
          console.error("Failed to parse extracted JSON brace match:", braceMatch[0], e2);
        }
      }
      console.error("JSON parsing completely failed for text:", text, e);
      throw e;
    }
  },

  async analyzeText(mealDescription) {
    const prompt = `You are a certified nutrition expert. Analyze the meal description below and calculate accurate nutritional values from your knowledge.

Meal: "${mealDescription}"

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
]

Rules:
- calories/protein/carbs/fat/fiber/sugar/sodium are the TOTAL for the stated quantity.
- fiber (g), sugar (g), sodium (mg).
- Parse quantity from the text (e.g. "3 eggs" → quantity: 3).
- ALWAYS include "weight_grams" — the total weight in grams for the item.
- "serving" should be the weight (e.g. "200g", "150g"), NOT "1 serving".
- Use USDA-based nutritional values.
- Calories/sodium must be whole numbers. Macros/fiber/sugar can have 1 decimal place.`;

    try {
      const res = await this._fetch({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
      });

      if (!res.ok) {
        console.error('Gemini text error:', res.status, await res.text());
        if (res.status === 429) Utils.showToast('⚠️ API quota exceeded. Try again later.', 'error', 5000);
        return null;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      let items = this._parseJSON(text);
      if (items && !Array.isArray(items)) {
        if (Array.isArray(items.items)) items = items.items;
        else if (Array.isArray(items.food)) items = items.food;
        else if (Array.isArray(items.data)) items = items.data;
        else if (items.name || items.error) items = [items];
      }
      if (!Array.isArray(items) || items.length === 0) return null;
      return items.map(i => this._normalize(i));
    } catch (err) {
      console.error('Gemini text analysis failed:', err);
      return null;
    }
  },

  async analyzeImage(file, description) {
    try {
      const base64 = await this._fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';

      const descPart = description && description.trim()
        ? `\n\nUSER DESCRIPTION (ingredients the camera can't see): "${description.trim()}"
IMPORTANT: Factor these described ingredients into your analysis. They ARE part of this meal.`
        : '';

      const prompt = `You are a certified nutrition expert with computer vision. Analyze this food image.${descPart}

IMPORTANT RULES:
1. Calculate ALL nutritional values yourself using USDA-standard reference data. Always provide your best expert estimate.
2. Even if the image is blurry, dark, or unclear, try your BEST to identify the food. Use visual cues like color, shape, texture, plate type, and context.
3. If a USER DESCRIPTION is provided above, use it as strong guidance. The description tells you what the food IS — trust it even if the image is ambiguous. Combine visual analysis with the description.
4. ONLY return the error response if there is genuinely NO food at all in the image (e.g. a photo of a car, a blank wall, etc.).
5. FOR PACKAGED/BRANDED PRODUCTS: Read the brand name, product name, and volume/weight from the packaging. Use standard published nutritional data for that specific product and size. Do NOT guess — use real data.
6. CRITICAL SANITY CHECK — Use these reference calorie densities to verify your estimates:
   - Water/zero-cal drinks: 0 kcal
   - Sodas/colas/juice drinks: 40-50 kcal per 100ml (so 300ml = 120-150 kcal)
   - Fruits & vegetables: 20-60 kcal per 100g
   - Rice, bread, grains: 100-150 kcal per 100g (cooked)
   - Chicken, fish, lean meat: 150-200 kcal per 100g
   - Red meat: 200-280 kcal per 100g
   - Cheese: 300-400 kcal per 100g
   - Nuts: 550-650 kcal per 100g
   - Oils, butter, ghee: 800-900 kcal per 100g
   If your calculated calories are drastically outside these ranges, RECHECK your estimate.

If there is absolutely NO food and NO description, return:
[{"error": "No food detected in this image. Please try a food photo."}]

Otherwise return a JSON array:
[
  {
    "name": "Dish name (e.g. Chicken Biryani)",
    "quantity": 1,
    "calories": 650,
    "protein": 35.0,
    "carbs": 70.0,
    "fat": 22.0,
    "fiber": 6.0,
    "sugar": 4.0,
    "sodium": 850,
    "weight_grams": 400,
    "serving": "400g",
    "ingredients": [
      {
        "name": "Basmati Rice",
        "quantity": 1,
        "calories": 260,
        "protein": 5.0,
        "carbs": 55.0,
        "fat": 1.0,
        "fiber": 1.5,
        "sugar": 0.2,
        "sodium": 5,
        "weight_grams": 200,
        "serving": "200g"
      }
    ]
  }
]

Rules:
- ALWAYS include "weight_grams" — estimated weight in grams for EVERY item and ingredient.
- Include fiber (g), sugar (g), sodium (mg).
- "serving" MUST be the weight (e.g. "400g", "150g"), NEVER "1 serving" or "1 plate".
- Identify the main DISH name — not individual ingredients as top-level items.
- Provide ingredient breakdown for complex dishes. Simple foods (apple) can have empty [].
- Estimate portion size visually. Typical plate ≈ 400-600g.
- Calories/sodium whole number, macros/fiber/sugar 1 decimal.
- Return ONLY the JSON array. No markdown.`;

      const res = await this._fetch({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
      });

      if (!res.ok) {
        console.error('Gemini Vision error:', res.status, await res.text());
        if (res.status === 429) Utils.showToast('⚠️ API quota exceeded. Try again later.', 'error', 5000);
        return null;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      let items = this._parseJSON(text);
      if (items && !Array.isArray(items)) {
        if (Array.isArray(items.items)) items = items.items;
        else if (Array.isArray(items.food)) items = items.food;
        else if (Array.isArray(items.data)) items = items.data;
        else if (items.name || items.error) items = [items];
      }
      if (!Array.isArray(items) || items.length === 0) return null;
      if (items[0]?.error) return items;

      return items.map(i => this._normalize(i));
    } catch (err) {
      console.error('Gemini image analysis failed:', err);
      return null;
    }
  },

  async validateMacros({ tdee, protein, carbs, fat, totalCals, goal, weight, age, gender }) {
    const prompt = `You are a certified sports nutritionist. A user wants to set these daily macro targets:

- TDEE calculated: ${tdee} kcal
- Custom macros: Protein ${protein}g, Carbs ${carbs}g, Fat ${fat}g (total: ${totalCals} kcal)
- Goal: ${goal}
- Stats: ${gender}, ${age} years old, ${weight}kg

Evaluate if these macros are healthy and appropriate for their goal. Consider:
1. Is protein adequate for their weight? (min 1.6g/kg for muscle, 2.2g/kg ideal for cut)
2. Is fat sufficient? (minimum ~0.3g per lb or 20% of calories)
3. Is the calorie deficit/surplus appropriate for their goal?
4. Are carbs reasonable for energy needs?

Return ONLY valid JSON (no markdown):
{"isGood": true/false, "feedback": "2-3 sentence assessment with specific advice"}`;

    try {
      const res = await this._fetch({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: "application/json" },
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return this._parseJSON(text);
    } catch (err) {
      console.error('Macro validation failed:', err);
      throw err;
    }
  },

  async askCoach(question, history, userContext) {
    const contextMsgs = (history || []).slice(-16).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const systemPrompt = `You are a friendly, knowledgeable AI fitness and nutrition coach inside a calorie tracking app called MacroLens. 

Rules:
1. ONLY answer questions about fitness, nutrition, exercise, supplements, body composition, workout routines, meal planning, and health.
2. If the user asks something unrelated to fitness/nutrition (like coding, math, history, etc.), politely decline: "I'm your fitness coach! I can only help with nutrition, exercise, and health questions. 💪"
3. Keep answers concise (2-4 paragraphs max), practical, and evidence-based.
4. Use a friendly, encouraging tone.
5. When giving nutritional advice, mention specific numbers where helpful (grams, calories, etc.).
6. Never provide medical diagnoses. Suggest consulting a doctor for medical concerns.
7. CRITICAL: You have access to the user's MacroLens data below. ONLY refer to or analyze this data if the user explicitly asks about their personal data, eating patterns, or progress. If they ask a general question (e.g. "how much protein in soya chunks"), answer the question directly WITHOUT mentioning their personal data.
8. Use **bold** for emphasis and structure your responses with line breaks for readability.
${userContext || ''}`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Got it! I\'m your MacroLens AI fitness coach with access to your tracking data. I\'ll give you personalized advice based on your meals, macros, and progress. How can I help? 💪' }] },
      ...contextMsgs,
    ];

    if (!contextMsgs.length || contextMsgs[contextMsgs.length - 1]?.parts?.[0]?.text !== question) {
      contents.push({ role: 'user', parts: [{ text: question }] });
    }

    try {
      const res = await this._fetch({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.';
    } catch (err) {
      console.error('Coach query failed:', err);
      throw err;
    }
  },

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};
