/* ═══════════════════════════════════════════ */
/* MEAL LOGGER — NLP, Image, Manual logging    */
/* ═══════════════════════════════════════════ */

window.MealLogger = {
  selectedMealType: 'breakfast',
  parsedItems: [],
  _selectedImageFile: null,
  _selectedImageDataUrl: null,

  init() {
    document.addEventListener('open-meal-log', (e) => {
      if (e.detail?.mealType) this.selectedMealType = e.detail.mealType;
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
    this.autoSelectMealType();
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
      if (!isNaN(grams) && grams > 0 && item.food.weight_grams) {
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
      if (!isNaN(grams) && grams > 0 && ing.weight_grams) {
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
        item.totalProtein = parseFloat((item.ingredients.reduce((s, i) => s + i.protein, 0) * item.quantity).toFixed(1));
        item.totalCarbs = parseFloat((item.ingredients.reduce((s, i) => s + i.carbs, 0) * item.quantity).toFixed(1));
        item.totalFat = parseFloat((item.ingredients.reduce((s, i) => s + i.fat, 0) * item.quantity).toFixed(1));
      } else {
        ing.serving = newVal.trim();
      }
      const activeTab = document.querySelector('.tab-panel.active');
      this.renderParsedItems(activeTab.id.replace('-tab', ''));
    }
  },

  renderParsedItems(source) {
    const listEl = document.getElementById(source + '-items-list');
    const totalEl = document.getElementById(source + '-total');
    const resultsEl = document.getElementById(source + '-results');

    listEl.innerHTML = this.parsedItems.map((item, i) => {
      let ingHtml = '';
      if (item.ingredients && item.ingredients.length > 0) {
        ingHtml = `<div class="parsed-item-ingredients" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color); grid-column: 1 / -1;">
          <div style="margin-bottom: 8px; font-weight: 500; color: var(--text-primary); font-size: 0.82rem;">Ingredients:</div>
          ${item.ingredients.map((ing, j) => `
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
              </span>
            </div>
          `).join('')}
        </div>`;
      }

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
    totalEl.innerHTML = `<span>Total: ${tc} kcal</span><span>P:${Math.round(tp)}g · C:${Math.round(tca)}g · F:${Math.round(tf)}g</span>`;
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
      if (e.target.files && e.target.files.length > 0) this.showImagePreview(e.target.files[0]);
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
      } else {
        Utils.showToast('Could not identify food in this image', 'warning', 3000);
        document.getElementById('image-drop-zone').style.display = '';
      }
    } catch (err) {
      console.error('Image analysis failed:', err);
      proc.classList.add('hidden');
      Utils.showToast('Image analysis failed. Please try again.', 'error', 4000);
      document.getElementById('image-drop-zone').style.display = '';
    }
  },

  confirmParsed(source) {
    if (this.parsedItems.length === 0) return;
    const dateStr = Utils.todayStr();
    const diary = Store.getDiary(dateStr);

    this.parsedItems.forEach(item => {
      diary[this.selectedMealType].push({
        id: Utils.uuid(), name: item.food.name,
        calories: item.totalCalories, protein: item.totalProtein,
        carbs: item.totalCarbs, fat: item.totalFat,
        serving: `${item.quantity} × ${item.food.serving}`,
        timestamp: new Date().toISOString(),
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
    const calories = parseInt(document.getElementById('manual-calories').value) || 0;
    const protein = parseFloat(document.getElementById('manual-protein').value) || 0;
    const carbs = parseFloat(document.getElementById('manual-carbs').value) || 0;
    const fat = parseFloat(document.getElementById('manual-fat').value) || 0;
    const serving = document.getElementById('manual-serving').value.trim() || '1 serving';

    if (!name) { Utils.showToast('Please enter a food name', 'warning'); return; }
    if (calories <= 0) { Utils.showToast('Please enter calories', 'warning'); return; }

    const dateStr = Utils.todayStr();
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
