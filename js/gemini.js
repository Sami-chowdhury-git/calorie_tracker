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
            serving: ing.serving || (ing.weight_grams ? `${ing.weight_grams}g` : '1 serving'),
            weight_grams: ing.weight_grams || null,
          }))
        : [],
      quantity: qty,
      totalCalories: Math.round(item.calories || 0),
      totalProtein: parseFloat((item.protein || 0).toFixed(1)),
      totalCarbs: parseFloat((item.carbs || 0).toFixed(1)),
      totalFat: parseFloat((item.fat || 0).toFixed(1)),
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
    "weight_grams": 200,
    "serving": "200g"
  }
]

Rules:
- calories/protein/carbs/fat are the TOTAL for the stated quantity.
- Parse quantity from the text (e.g. "3 eggs" → quantity: 3).
- ALWAYS include "weight_grams" — the total weight in grams for the item.
- "serving" should be the weight (e.g. "200g", "150g"), NOT "1 serving".
- Use USDA-based nutritional values.
- Calories must be a whole number. Macros can have 1 decimal place.`;

    try {
      const res = await this._fetch({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      });

      if (!res.ok) {
        console.error('Gemini text error:', res.status, await res.text());
        if (res.status === 429) Utils.showToast('⚠️ API quota exceeded. Try again later.', 'error', 5000);
        return null;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      const items = this._parseJSON(text);
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

IMPORTANT: Calculate ALL nutritional values yourself. Always provide your best expert estimate.

Step 1 — Identify what you see. If there is NO food, return:
[{"error": "No food detected in this image. Please try a food photo."}]

Step 2 — Return a JSON array:
[
  {
    "name": "Dish name (e.g. Chicken Biryani)",
    "quantity": 1,
    "calories": 650,
    "protein": 35.0,
    "carbs": 70.0,
    "fat": 22.0,
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
        "weight_grams": 200,
        "serving": "200g"
      }
    ]
  }
]

Rules:
- ALWAYS include "weight_grams" — estimated weight in grams for EVERY item and ingredient.
- "serving" MUST be the weight (e.g. "400g", "150g"), NEVER "1 serving" or "1 plate".
- Identify the main DISH name — not individual ingredients as top-level items.
- Provide ingredient breakdown for complex dishes. Simple foods (apple) can have empty [].
- Estimate portion size visually. Typical plate ≈ 400-600g.
- Calories whole number, macros 1 decimal.
- Return ONLY the JSON array. No markdown.`;

      const res = await this._fetch({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      });

      if (!res.ok) {
        console.error('Gemini Vision error:', res.status, await res.text());
        if (res.status === 429) Utils.showToast('⚠️ API quota exceeded. Try again later.', 'error', 5000);
        return null;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      const items = this._parseJSON(text);
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
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
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

  async askCoach(question, history) {
    const contextMsgs = (history || []).slice(-16).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const systemPrompt = `You are a friendly, knowledgeable AI fitness and nutrition coach inside a calorie tracking app called CalTrack. 

Rules:
1. ONLY answer questions about fitness, nutrition, exercise, supplements, body composition, workout routines, meal planning, and health.
2. If the user asks something unrelated to fitness/nutrition (like coding, math, history, etc.), politely decline: "I'm your fitness coach! I can only help with nutrition, exercise, and health questions. 💪"
3. Keep answers concise (2-4 paragraphs max), practical, and evidence-based.
4. Use a friendly, encouraging tone.
5. When giving nutritional advice, mention specific numbers where helpful (grams, calories, etc.).
6. Never provide medical diagnoses. Suggest consulting a doctor for medical concerns.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Got it! I\'m your CalTrack AI fitness coach. I\'ll only answer fitness and nutrition questions. How can I help? 💪' }] },
      ...contextMsgs,
    ];

    // Add current question if not already in context
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
