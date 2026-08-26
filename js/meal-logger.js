/* ═══════════════════════════════════════════ */
/* MEAL LOGGER — NLP, Image, Manual logging    */
/* ═══════════════════════════════════════════ */

window.MealLogger = {
  selectedMealType: 'breakfast',
  targetDate: null,
  parsedItems: [],
  _selectedImageFile: null,
  _selectedImageDataUrl: null,

  init() {
    document.addEventListener('open-meal-log', (e) => {
      this._explicitMealType = e.detail?.mealType || null;
      this.targetDate = e.detail?.date || null;
      this.open();
    });

    document.getElementById('meal-log-close-btn').addEventListener('click', () => this.close());
    document.getElementById('meal-log-modal').addEventListener('click', (e) => {
      if (e.target.id === 'meal-log-modal') this.close();
    });

    // Meal type buttons
    document.querySelectorAll('.meal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMealType = btn.dataset.meal;
      });
    });

    // Tab switching
    document.querySelectorAll('#meal-log-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#meal-log-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
      });
    });

    // NLP
    document.getElementById('nlp-parse-btn').addEventListener('click', () => this.parseNLP());
    document.getElementById('nlp-confirm-btn').addEventListener('click', () => this.confirmParsed('nlp'));

    // Image
    this.initImageUpload();
    document.getElementById('image-confirm-btn').addEventListener('click', () => this.confirmParsed('image'));

    // Manual
    document.getElementById('manual-add-btn').addEventListener('click', () => this.addManual());
  },

  open() {
    document.getElementById('meal-log-modal').classList.remove('hidden');
    this.resetTabs();
    const selectorEl = document.querySelector('.meal-type-selector');
    if (this._explicitMealType) {
      // Use the explicitly passed meal type (from diary + buttons)
      this.selectedMealType = this._explicitMealType;
      document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.remove('active'));
      const btn = document.querySelector(`.meal-type-btn[data-meal="${this._explicitMealType}"]`);
      if (btn) btn.classList.add('active');
      // Hide selector — user already chose via diary
      if (selectorEl) selectorEl.style.display = 'none';
      this._explicitMealType = null;
    } else {
      this.autoSelectMealType();
      if (selectorEl) selectorEl.style.display = '';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  close() {
    document.getElementById('meal-log-modal').classList.add('hidden');
    this.resetForm();
  },

  autoSelectMealType() {
    const h = new Date().getHours();
    let meal = 'snacks';
    if (h >= 5 && h < 11) meal = 'breakfast';
    else if (h >= 11 && h < 15) meal = 'lunch';
    else if (h >= 15 && h < 21) meal = 'dinner';
    document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.meal-type-btn[data-meal="${meal}"]`);
    if (btn) btn.classList.add('active');
    this.selectedMealType = meal;
  },

  resetTabs() {
    document.querySelectorAll('#meal-log-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#meal-log-tabs .tab-btn[data-tab="nlp"]').classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('nlp-tab').classList.add('active');
  },

  resetForm() {
    document.getElementById('nlp-input').value = '';
    document.getElementById('nlp-results').classList.add('hidden');
    document.getElementById('image-results').classList.add('hidden');
    document.getElementById('image-processing').classList.add('hidden');
    document.getElementById('image-drop-zone').style.display = '';
    const previewSection = document.getElementById('image-preview-section');
    if (previewSection) previewSection.classList.add('hidden');
    const descInput = document.getElementById('image-description');
    if (descInput) descInput.value = '';
    const resultPreview = document.getElementById('image-result-preview');
    if (resultPreview) resultPreview.classList.add('hidden');
    ['manual-food-name','manual-calories','manual-protein','manual-carbs','manual-fat','manual-serving']
      .forEach(id => document.getElementById(id).value = '');
    this.parsedItems = [];
    this._selectedImageFile = null;
    this._selectedImageDataUrl = null;
    // Clear file inputs so same file can be re-selected
    const fi = document.getElementById('image-file-input');
    const ci = document.getElementById('camera-file-input');
    if (fi) fi.value = '';
    if (ci) ci.value = '';
  },

  async parseNLP() {
    const text = document.getElementById('nlp-input').value.trim();
    if (!text) { Utils.showToast('Please describe your meal first', 'warning'); return; }

    const parseBtn = document.getElementById('nlp-parse-btn');
    parseBtn.disabled = true;
    parseBtn.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> Analyzing with AI...';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
      const geminiResult = await Gemini.analyzeText(text);
      if (geminiResult && geminiResult.length > 0) {
        this.parsedItems = geminiResult;
        Utils.showToast('✨ Analyzed by Gemini AI', 'success', 2000);
      } else {
        Utils.showToast('Gemini could not analyze this — try rephrasing', 'warning', 3000);
      }
    } catch (err) {
      console.error('Gemini NLP error:', err);
      Utils.showToast('AI analysis failed. Check your connection and try again.', 'error', 4000);
    }

    parseBtn.disabled = false;
    parseBtn.innerHTML = '<i data-lucide="sparkles"></i> Analyze Food';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    Store.incrementNlpCount();

    if (this.parsedItems.length === 0) return;
    this.renderParsedItems('nlp');
  },

  editServing(index) {
    const item = this.parsedItems[index];
    const current = item.food.weight_grams || item.food.serving;
    const newVal = window.prompt('Edit weight (grams):', current);
    if (newVal !== null && newVal.trim() !== '') {
      const grams = parseFloat(newVal);
      if (!isNaN(grams) && grams >= 0 && item.food.weight_grams) {
        // Proportionally recalculate macros based on new weight
        const ratio = grams / item.food.weight_grams;
        item.food.calories = Math.round(item.food.calories * ratio);
        item.food.protein = parseFloat((item.food.protein * ratio).toFixed(1));
        item.food.carbs = parseFloat((item.food.carbs * ratio).toFixed(1));
        item.food.fat = parseFloat((item.food.fat * ratio).toFixed(1));
        item.food.weight_grams = grams;
        item.food.serving = `${grams}g`;
        // Recalculate totals
        item.totalCalories = Math.round(item.food.calories * item.quantity);
        item.totalProtein = parseFloat((item.food.protein * item.quantity).toFixed(1));
        item.totalCarbs = parseFloat((item.food.carbs * item.quantity).toFixed(1));
        item.totalFat = parseFloat((item.food.fat * item.quantity).toFixed(1));
      } else {
        item.food.serving = newVal.trim();
      }
      const activeTab = document.querySelector('.tab-panel.active');
      this.renderParsedItems(activeTab.id.replace('-tab', ''));
    }
  },

  editIngredientWeight(itemIndex, ingIndex) {
    const item = this.parsedItems[itemIndex];
    const ing = item.ingredients[ingIndex];
    const current = ing.weight_grams || ing.serving;
    const newVal = window.prompt(`Edit weight for ${ing.name} (grams):`, current);
    if (newVal !== null && newVal.trim() !== '') {
      const grams = parseFloat(newVal);
      if (!isNaN(grams) && grams >= 0 && ing.weight_grams) {
        const ratio = grams / ing.weight_grams;
        const oldCals = ing.calories;
        ing.calories = Math.round(ing.calories * ratio);
        ing.protein = parseFloat((ing.protein * ratio).toFixed(1));
        ing.carbs = parseFloat((ing.carbs * ratio).toFixed(1));
        ing.fat = parseFloat((ing.fat * ratio).toFixed(1));
        ing.weight_grams = grams;
        ing.serving = `${grams}g`;
        // Update parent totals
        const calDiff = ing.calories - oldCals;
        item.food.calories += Math.round(calDiff / item.quantity);
        item.totalCalories = Math.round(item.food.calories * item.quantity);
        item.food.protein = parseFloat(item.ingredients.reduce((s, i) => s + i.protein, 0).toFixed(1));
        item.food.carbs = parseFloat(item.ingredients.reduce((s, i) => s + i.carbs, 0).toFixed(1));
        item.food.fat = parseFloat(item.ingredients.reduce((s, i) => s + i.fat, 0).toFixed(1));
        item.totalProtein = parseFloat((item.food.protein * item.quantity).toFixed(1));
        item.totalCarbs = parseFloat((item.food.carbs * item.quantity).toFixed(1));
        item.totalFat = parseFloat((item.food.fat * item.quantity).toFixed(1));
      } else {
        ing.serving = newVal.trim();
      }
      const activeTab = document.querySelector('.tab-panel.active');
      this.renderParsedItems(activeTab.id.replace('-tab', ''));
    }
  },

  removeIngredient(itemIndex, ingIndex) {
    const item = this.parsedItems[itemIndex];
    if (!item.ingredients || item.ingredients.length === 0) return;
    
    const ing = item.ingredients[ingIndex];
    const oldCals = ing.calories;
    
    // Remove it
    item.ingredients.splice(ingIndex, 1);
    
    // Update parent totals
    const calDiff = 0 - oldCals;
    item.food.calories += Math.round(calDiff / item.quantity);
    item.totalCalories = Math.round(item.food.calories * item.quantity);
    item.food.protein = parseFloat(item.ingredients.reduce((s, i) => s + i.protein, 0).toFixed(1));
    item.food.carbs = parseFloat(item.ingredients.reduce((s, i) => s + i.carbs, 0).toFixed(1));
    item.food.fat = parseFloat(item.ingredients.reduce((s, i) => s + i.fat, 0).toFixed(1));
    item.totalProtein = parseFloat((item.food.protein * item.quantity).toFixed(1));
    item.totalCarbs = parseFloat((item.food.carbs * item.quantity).toFixed(1));
    item.totalFat = parseFloat((item.food.fat * item.quantity).toFixed(1));
    
    const activeTab = document.querySelector('.tab-panel.active');
    this.renderParsedItems(activeTab.id.replace('-tab', ''));
    Utils.showToast('Ingredient removed', 'info');
  },

  async submitNewIngredient(itemIndex) {
    const item = this.parsedItems[itemIndex];
    if (!item) return;
    
    const nameEl = document.getElementById(`add-ing-name-${itemIndex}`);
    const weightEl = document.getElementById(`add-ing-weight-${itemIndex}`);
    const btnEl = document.getElementById(`add-ing-btn-${itemIndex}`);
    
    const name = nameEl.value.trim();
    const weight = parseFloat(weightEl.value);
    
    if (!name) { Utils.showToast('Please enter an ingredient name', 'warning'); return; }
    if (!weight || weight <= 0) { Utils.showToast('Please enter a valid weight in grams', 'warning'); return; }
    
    btnEl.disabled = true;
    btnEl.innerHTML = '<i data-lucide="loader-2" class="spin-icon" style="width:14px;height:14px;"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    try {
      const prompt = `Calculate exact nutritional values for ${weight}g of ${name}. Ensure name is "${name}" and weight is ${weight}g.`;
      const result = await Gemini.analyzeText(prompt);
      
      if (result && result.length > 0 && !result[0].error) {
        const analyzedFood = result[0].food;
        
        const newIng = {
          name: analyzedFood.name || name,
          quantity: 1,
          calories: analyzedFood.calories || 0,
          protein: parseFloat((analyzedFood.protein || 0).toFixed(1)),
          carbs: parseFloat((analyzedFood.carbs || 0).toFixed(1)),
          fat: parseFloat((analyzedFood.fat || 0).toFixed(1)),
          weight_grams: weight,
          serving: `${weight}g`,
        };
        
        if (!item.ingredients) item.ingredients = [];
        item.ingredients.push(newIng);
        
        // Update parent totals
        item.food.calories += Math.round(newIng.calories / item.quantity);
        item.totalCalories = Math.round(item.food.calories * item.quantity);
        item.food.protein = parseFloat(item.ingredients.reduce((s, i) => s + i.protein, 0).toFixed(1));
        item.food.carbs = parseFloat(item.ingredients.reduce((s, i) => s + i.carbs, 0).toFixed(1));
        item.food.fat = parseFloat(item.ingredients.reduce((s, i) => s + i.fat, 0).toFixed(1));
        item.totalProtein = parseFloat((item.food.protein * item.quantity).toFixed(1));
        item.totalCarbs = parseFloat((item.food.carbs * item.quantity).toFixed(1));
        item.totalFat = parseFloat((item.food.fat * item.quantity).toFixed(1));
        
        const activeTab = document.querySelector('.tab-panel.active');
        this.renderParsedItems(activeTab.id.replace('-tab', ''));
        Utils.showToast(`${newIng.name} added`, 'success');
      } else {
        Utils.showToast('Could not analyze ingredient', 'warning');
      }
    } catch (err) {
      console.error('Failed to add ingredient:', err);
      Utils.showToast('Analysis failed. Try again.', 'error');
    }
    
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = 'Add';
    }
  },

  renderParsedItems(source) {
    const listEl = document.getElementById(source + '-items-list');
    const totalEl = document.getElementById(source + '-total');
    const resultsEl = document.getElementById(source + '-results');

    listEl.innerHTML = this.parsedItems.map((item, i) => {
      let ingHtml = '';
      const hasIngredients = item.ingredients && item.ingredients.length > 0;
      ingHtml = `<div class="parsed-item-ingredients" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color); grid-column: 1 / -1;">
          ${hasIngredients ? `<div style="margin-bottom: 8px; font-weight: 500; color: var(--text-primary); font-size: 0.82rem;">Ingredients:</div>` : ''}
          ${hasIngredients ? item.ingredients.map((ing, j) => `
            <div class="ingredient-row">
              <span class="ingredient-name">• ${ing.name}</span>
              <span class="ingredient-weight">
                ${ing.serving || '—'}
                <button class="weight-edit-btn" onclick="MealLogger.editIngredientWeight(${i}, ${j})" title="Edit weight">✏️</button>
              </span>
              <span class="ingredient-macros">
                <span>${ing.calories} kcal</span>
                <span>P:${ing.protein}g</span>
                <span>C:${ing.carbs}g</span>
                <span>F:${ing.fat}g</span>
                <button class="parsed-item-remove-btn" style="position:static; margin-left:8px; padding:2px; color:var(--danger);" onclick="MealLogger.removeIngredient(${i}, ${j})" title="Remove ingredient">
                  <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                </button>
              </span>
            </div>
          `).join('') : ''}
          <button id="add-ing-show-btn-${i}" class="btn btn-ghost btn-sm" onclick="document.getElementById('add-ing-form-${i}').style.display='flex'; this.style.display='none';" style="margin-top:8px; font-size:0.78rem; color: var(--primary); padding: 4px 10px;">
            <i data-lucide="plus-circle" style="width:14px;height:14px;"></i> Add Ingredient
          </button>
          <div id="add-ing-form-${i}" style="display:none; margin-top:8px; gap:8px; align-items:center; width:100%;">
            <input type="text" id="add-ing-name-${i}" placeholder="Name (e.g. Cheese)" class="input-field" style="flex:1; padding:6px 8px; font-size:0.8rem; background: var(--bg-tertiary);">
            <input type="number" id="add-ing-weight-${i}" placeholder="Weight (g)" class="input-field" style="width:80px; padding:6px 8px; font-size:0.8rem; background: var(--bg-tertiary);">
            <button class="btn btn-primary btn-sm" id="add-ing-btn-${i}" onclick="MealLogger.submitNewIngredient(${i})" style="padding:6px 12px; font-size:0.8rem;">Add</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('add-ing-form-${i}').style.display='none'; document.getElementById('add-ing-show-btn-${i}').style.display='flex';" style="padding:6px; font-size:0.8rem;"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
          </div>
        </div>`;

      return `
      <div class="parsed-item ${item.unknown ? 'unknown' : ''}" style="flex-wrap: wrap; animation: staggerFadeIn 0.3s ease both; animation-delay: ${i * 0.08}s;">
        <div class="parsed-item-info">
          <span class="parsed-item-name">${item.food.name}${item.unknown ? ' ⚠️' : ''}</span>
          <span class="parsed-item-detail" style="display: flex; align-items: center; gap: 4px;">
            ${item.food.serving}
            <button class="weight-edit-btn" onclick="MealLogger.editServing(${i})" title="Edit weight">✏️</button>
          </span>
        </div>
        <div class="parsed-item-qty">
          <button class="qty-btn" onclick="MealLogger.updateQty(${i}, -1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="MealLogger.updateQty(${i}, 1)">+</button>
        </div>
        <div class="parsed-item-macros">
          <span class="parsed-item-cals">${item.totalCalories} kcal</span>
          <div class="parsed-item-macro-row">
            <span>P:${item.totalProtein}g</span>
            <span>C:${item.totalCarbs}g</span>
            <span>F:${item.totalFat}g</span>
          </div>
        </div>
        <button class="parsed-item-remove-btn" onclick="MealLogger.removeItem(${i})" title="Remove item">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
        ${ingHtml}
      </div>
    `}).join('');

    const tc = this.parsedItems.reduce((s, i) => s + i.totalCalories, 0);
    const tp = this.parsedItems.reduce((s, i) => s + i.totalProtein, 0);
    const tca = this.parsedItems.reduce((s, i) => s + i.totalCarbs, 0);
    const tf = this.parsedItems.reduce((s, i) => s + i.totalFat, 0);
    totalEl.innerHTML = `<span>Total: ${tc} kcal</span><span>P:${parseFloat(tp.toFixed(1))}g · C:${parseFloat(tca.toFixed(1))}g · F:${parseFloat(tf.toFixed(1))}g</span>`;
    resultsEl.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  updateQty(index, delta) {
    const item = this.parsedItems[index];
    item.quantity = Math.max(0.5, item.quantity + delta * 0.5);
    item.totalCalories = Math.round(item.food.calories * item.quantity);
    item.totalProtein = Math.round(item.food.protein * item.quantity * 10) / 10;
    item.totalCarbs = Math.round(item.food.carbs * item.quantity * 10) / 10;
    item.totalFat = Math.round(item.food.fat * item.quantity * 10) / 10;
    const activeTab = document.querySelector('.tab-panel.active');
    this.renderParsedItems(activeTab.id.replace('-tab', ''));
  },

  removeItem(index) {
    if (index >= 0 && index < this.parsedItems.length) {
      this.parsedItems.splice(index, 1);
      const activeTab = document.querySelector('.tab-panel.active');
      const source = activeTab.id.replace('-tab', '');
      if (this.parsedItems.length === 0) {
        document.getElementById(source + '-results').classList.add('hidden');
      } else {
        this.renderParsedItems(source);
      }
      Utils.showToast('Item removed', 'info');
    }
  },

  initImageUpload() {
    const dz = document.getElementById('image-drop-zone');
    const fi = document.getElementById('image-file-input');
    const ci = document.getElementById('camera-file-input');
    
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) this.showImagePreview(files[0]);
    });
    
    const fileChangeHandler = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.showImagePreview(e.target.files[0]);
        // Reset so same file can be re-selected
        e.target.value = '';
      }
    };
    
    if (fi) fi.addEventListener('change', fileChangeHandler);
    if (ci) ci.addEventListener('change', fileChangeHandler);

    // Analyze button
    document.getElementById('image-analyze-btn')?.addEventListener('click', () => this.processImage());
  },

  showImagePreview(file) {
    this._selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this._selectedImageDataUrl = e.target.result;
      // Show preview
      document.getElementById('image-preview-img').src = e.target.result;
      document.getElementById('image-preview-section').classList.remove('hidden');
      document.getElementById('image-drop-zone').style.display = 'none';
    };
    reader.readAsDataURL(file);
  },

  async processImage() {
    const file = this._selectedImageFile;
    if (!file) {
      Utils.showToast('Please upload an image first', 'warning', 2000);
      return;
    }

    const previewSection = document.getElementById('image-preview-section');
    const proc = document.getElementById('image-processing');
    const description = document.getElementById('image-description')?.value || '';

    previewSection.classList.add('hidden');
    proc.classList.remove('hidden');

    try {
      const geminiResult = await Gemini.analyzeImage(file, description);
      proc.classList.add('hidden');
      
      if (geminiResult && geminiResult.length > 0 && !geminiResult[0].error) {
        this.parsedItems = geminiResult;
        // Show image above results
        if (this._selectedImageDataUrl) {
          const resultPreview = document.getElementById('image-result-preview');
          document.getElementById('image-result-img').src = this._selectedImageDataUrl;
          resultPreview.classList.remove('hidden');
        }
        Utils.showToast('✨ Image analyzed by Gemini AI', 'success', 2000);
        this.renderParsedItems('image');
      } else if (geminiResult && geminiResult[0].error) {
        Utils.showToast(geminiResult[0].error, 'warning', 4000);
        document.getElementById('image-drop-zone').style.display = '';
        this._selectedImageFile = null;
        this._selectedImageDataUrl = null;
        document.getElementById('image-file-input').value = '';
        document.getElementById('camera-file-input').value = '';
      } else {
        // If we have a description, try text-based analysis as fallback
        if (description && description.trim()) {
          Utils.showToast('Image unclear — analyzing from your description...', 'info', 3000);
          const textResult = await Gemini.analyzeText(description.trim());
          if (textResult && textResult.length > 0) {
            this.parsedItems = textResult;
            if (this._selectedImageDataUrl) {
              const resultPreview = document.getElementById('image-result-preview');
              document.getElementById('image-result-img').src = this._selectedImageDataUrl;
              resultPreview.classList.remove('hidden');
            }
            Utils.showToast('✨ Analyzed from description', 'success', 2000);
            this.renderParsedItems('image');
            return;
          }
        }
        Utils.showToast('Could not identify food. Try adding a description and retry.', 'warning', 4000);
        // Show preview section again so user can add description and retry
        document.getElementById('image-preview-section').classList.remove('hidden');
        document.getElementById('image-drop-zone').style.display = 'none';
      }
    } catch (err) {
      console.error('Image analysis failed:', err);
      proc.classList.add('hidden');
      Utils.showToast('Image analysis failed. Please try again.', 'error', 4000);
      document.getElementById('image-drop-zone').style.display = '';
      this._selectedImageFile = null;
      this._selectedImageDataUrl = null;
      document.getElementById('image-file-input').value = '';
      document.getElementById('camera-file-input').value = '';
    }
  },

  confirmParsed(source) {
    if (this.parsedItems.length === 0) return;
    const dateStr = this.targetDate || (Diary.currentDate ? Diary.currentDate : Utils.todayStr());
    const diary = Store.getDiary(dateStr);

    this.parsedItems.forEach(item => {
      diary[this.selectedMealType].push({
        id: Utils.uuid(), name: item.food.name,
        calories: item.totalCalories, protein: item.totalProtein,
        carbs: item.totalCarbs, fat: item.totalFat,
        serving: `${item.quantity} × ${item.food.serving}`,
        timestamp: new Date().toISOString(),
        ingredients: item.ingredients || [],
        imageDataUrl: this._selectedImageDataUrl || null,
      });
      Store.incrementFoodFreq(item.food.name);
    });

    Store.saveDiary(dateStr, diary);
    Store.incrementTotalMeals(this.parsedItems.length);
    document.dispatchEvent(new CustomEvent('meal-logged', { detail: { date: dateStr, meal: this.selectedMealType } }));

    const tc = this.parsedItems.reduce((s, i) => s + i.totalCalories, 0);
    Utils.showToast(`Added ${this.parsedItems.length} items (${tc} kcal)`, 'success');
    this.close();
  },

  addManual() {
    const name = document.getElementById('manual-food-name').value.trim();
    const calories = parseInt(document.getElementById('manual-calories').value);
    const protein = parseFloat(document.getElementById('manual-protein').value) || 0;
    const carbs = parseFloat(document.getElementById('manual-carbs').value) || 0;
    const fat = parseFloat(document.getElementById('manual-fat').value) || 0;
    const serving = document.getElementById('manual-serving').value.trim() || '1 serving';

    if (!name) { Utils.showToast('Please enter a food name', 'warning'); return; }
    if (isNaN(calories) || calories <= 0 || calories > 10000) { Utils.showToast('Please enter valid calories (1–10,000 kcal)', 'warning'); return; }
    if (isNaN(protein) || protein < 0 || protein > 1000) { Utils.showToast('Protein cannot be negative or exceed 1000g', 'warning'); return; }
    if (isNaN(carbs) || carbs < 0 || carbs > 1000) { Utils.showToast('Carbs cannot be negative or exceed 1000g', 'warning'); return; }
    if (isNaN(fat) || fat < 0 || fat > 1000) { Utils.showToast('Fat cannot be negative or exceed 1000g', 'warning'); return; }

    const dateStr = this.targetDate || (Diary.currentDate ? Diary.currentDate : Utils.todayStr());
    const diary = Store.getDiary(dateStr);
    diary[this.selectedMealType].push({
      id: Utils.uuid(), name, calories, protein, carbs, fat, serving,
      timestamp: new Date().toISOString(),
    });

    Store.saveDiary(dateStr, diary);
    Store.incrementTotalMeals(1);
    Store.incrementFoodFreq(name);
    document.dispatchEvent(new CustomEvent('meal-logged', { detail: { date: dateStr, meal: this.selectedMealType } }));
    Utils.showToast(`${name} added (${calories} kcal)`, 'success');
    this.close();
  },
};
