window.MealLogger = {
  selectedMealType: 'breakfast',
  targetDate: null,
  parsedItems: [],
  _selectedImageFile: null,
  _selectedImageDataUrl: null,
  _compressedImage: null,
  _videoStream: null,
  _barcodeInterval: null,

  _createSvg(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('svg-icon');

    const shapes = {
      search: [
        ['circle', { cx: '11', cy: '11', r: '7' }],
        ['path', { d: 'M20 20l-3.5-3.5' }]
      ],
      'loader-2': [
        ['path', { d: 'M12 3a9 9 0 1 0 9 9' }]
      ],
      camera: [
        ['path', { d: 'M4 7h4l2-2h4l2 2h4v12H4V7z' }],
        ['circle', { cx: '12', cy: '13', r: '3' }]
      ],
      'camera-off': [
        ['path', { d: 'M3 3l18 18M7 7H4v12h12M20 15V7h-4l-2-2h-3' }]
      ],
      edit: [
        ['path', { d: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }]
      ],
      trash: [
        ['path', { d: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14' }]
      ],
      'plus-circle': [
        ['circle', { cx: '12', cy: '12', r: '9' }],
        ['path', { d: 'M12 8v8M8 12h8' }]
      ],
      x: [
        ['path', { d: 'M18 6L6 18M6 6l12 12' }]
      ]
    };

    const list = shapes[name] || shapes.search;
    list.forEach(([tag, attrs]) => {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      svg.appendChild(el);
    });
    if (name === 'loader-2') svg.classList.add('spin-icon');
    return svg;
  },

  _updateTabIndicator() {
    const bar = document.getElementById('meal-log-tabs');
    const indicator = document.getElementById('meal-tab-indicator');
    const activeBtn = bar?.querySelector('.tab-btn.active');
    if (!bar || !indicator || !activeBtn) return;
    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
  },

  init() {
    document.addEventListener('open-meal-log', (e) => {
      this._explicitMealType = e.detail?.mealType || null;
      this.targetDate = e.detail?.date || Utils.todayStr();
      this.open();
    });

    document.getElementById('meal-log-close-btn').addEventListener('click', () => this.close());
    document.getElementById('meal-log-modal').addEventListener('click', (e) => {
      if (e.target.id === 'meal-log-modal') this.close();
    });

    document.querySelectorAll('.meal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMealType = btn.dataset.meal;
      });
    });

    document.querySelectorAll('#meal-log-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#meal-log-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const targetTab = document.getElementById(btn.dataset.tab + '-tab');
        if (targetTab) targetTab.classList.add('active');
        this._updateTabIndicator();

        if (btn.dataset.tab === 'barcode') {
          this.startBarcodeCamera();
        } else {
          this.stopBarcodeCamera();
        }
      });
    });

    window.addEventListener('resize', () => this._updateTabIndicator());

    document.getElementById('nlp-parse-btn').addEventListener('click', () => this.parseNLP());
    document.getElementById('nlp-confirm-btn').addEventListener('click', () => this.confirmParsed('nlp'));

    this.initImageUpload();
    document.getElementById('image-confirm-btn').addEventListener('click', () => this.confirmParsed('image'));

    this.initBarcodeScanner();
    document.getElementById('barcode-confirm-btn')?.addEventListener('click', () => this.confirmParsed('barcode'));

    document.getElementById('manual-add-btn').addEventListener('click', () => this.addManual());
  },

  open() {
    if (!this.targetDate) this.targetDate = Utils.todayStr();
    document.getElementById('meal-log-modal').classList.remove('hidden');
    this.resetTabs();
    const selectorEl = document.querySelector('.meal-type-selector');
    if (this._explicitMealType) {
      this.selectedMealType = this._explicitMealType;
      document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.remove('active'));
      const btn = document.querySelector(`.meal-type-btn[data-meal="${this._explicitMealType}"]`);
      if (btn) btn.classList.add('active');
      if (selectorEl) selectorEl.style.display = 'none';
      this._explicitMealType = null;
    } else {
      this.autoSelectMealType();
      if (selectorEl) selectorEl.style.display = '';
    }
    requestAnimationFrame(() => this._updateTabIndicator());
  },

  close() {
    document.getElementById('meal-log-modal').classList.add('hidden');
    this.stopBarcodeCamera();
    this.targetDate = null;
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
    requestAnimationFrame(() => this._updateTabIndicator());
  },

  resetForm() {
    document.getElementById('nlp-input').value = '';
    document.getElementById('nlp-results').classList.add('hidden');
    document.getElementById('image-results').classList.add('hidden');
    const barcodeResults = document.getElementById('barcode-results');
    if (barcodeResults) barcodeResults.classList.add('hidden');
    const barcodeInput = document.getElementById('barcode-input');
    if (barcodeInput) barcodeInput.value = '';
    document.getElementById('image-processing').classList.add('hidden');
    document.getElementById('image-drop-zone').style.display = '';
    const previewSection = document.getElementById('image-preview-section');
    if (previewSection) previewSection.classList.add('hidden');
    const descInput = document.getElementById('image-description');
    if (descInput) descInput.value = '';
    const resultPreview = document.getElementById('image-result-preview');
    if (resultPreview) resultPreview.classList.add('hidden');
    ['manual-food-name', 'manual-calories', 'manual-protein', 'manual-carbs', 'manual-fat', 'manual-fiber', 'manual-sugar', 'manual-sodium', 'manual-serving']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    this.parsedItems = [];
    this._selectedImageFile = null;
    this._selectedImageDataUrl = null;
    this._compressedImage = null;

    const fi = document.getElementById('image-file-input');
    const ci = document.getElementById('camera-file-input');
    if (fi) fi.value = '';
    if (ci) ci.value = '';
  },

  _setBtnContent(btn, iconName, labelText) {
    if (!btn) return;
    btn.textContent = '';
    btn.appendChild(this._createSvg(iconName));
    btn.appendChild(document.createTextNode(' ' + labelText));
  },

  async parseNLP() {
    const text = document.getElementById('nlp-input').value.trim();
    if (!text) { Utils.showToast('Please describe your meal first', 'warning'); return; }

    const parseBtn = document.getElementById('nlp-parse-btn');
    parseBtn.disabled = true;
    this._setBtnContent(parseBtn, 'loader-2', 'Analyzing with AI...');

    try {
      const geminiResult = await Gemini.analyzeText(text);
      if (geminiResult && geminiResult.length > 0) {
        this.parsedItems = geminiResult;
        Store.incrementNlpCount();
        Utils.showToast('Analyzed by Gemini AI', 'success', 2000);
      } else {
        Utils.showToast('Could not analyze this input. Try rephrasing.', 'warning', 3000);
      }
    } catch (err) {
      console.error('Gemini NLP error:', err);
      Utils.showToast('AI analysis failed. Check your connection and try again.', 'error', 4000);
    }

    parseBtn.disabled = false;
    this._setBtnContent(parseBtn, 'search', 'Analyze Food');

    if (this.parsedItems.length === 0) return;
    this.renderParsedItems('nlp');
  },

  editServing(index) {
    const item = this.parsedItems[index];
    if (!item) return;
    const current = item.food.weight_grams || item.food.serving;
    const newVal = window.prompt('Edit weight (grams):', current);
    if (newVal !== null && newVal.trim() !== '') {
      const grams = parseFloat(newVal);
      if (!isNaN(grams) && grams > 0 && item.food.weight_grams) {
        window.Nutrition.scaleFoodServings(item, grams);
      } else {
        item.food.serving = newVal.trim();
      }
      const activeTab = document.querySelector('.tab-panel.active');
      this.renderParsedItems(activeTab.id.replace('-tab', ''));
    }
  },

  editIngredientWeight(itemIndex, ingIndex) {
    const item = this.parsedItems[itemIndex];
    const ing = item?.ingredients?.[ingIndex];
    if (!ing) return;
    const current = ing.weight_grams || ing.serving;
    const newVal = window.prompt(`Edit weight for ${ing.name} (grams):`, current);
    if (newVal !== null && newVal.trim() !== '') {
      const grams = parseFloat(newVal);
      if (!isNaN(grams) && grams > 0 && ing.weight_grams) {
        window.Nutrition.scaleIngredientWeight(item, ingIndex, grams);
      } else {
        ing.serving = newVal.trim();
      }
      const activeTab = document.querySelector('.tab-panel.active');
      this.renderParsedItems(activeTab.id.replace('-tab', ''));
    }
  },

  removeIngredient(itemIndex, ingIndex) {
    const item = this.parsedItems[itemIndex];
    if (!item?.ingredients?.length) return;
    item.ingredients.splice(ingIndex, 1);
    window.Nutrition.syncItemFromIngredients(item);

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
    btnEl.textContent = '...';

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
          fiber: parseFloat((analyzedFood.fiber || 0).toFixed(1)),
          sugar: parseFloat((analyzedFood.sugar || 0).toFixed(1)),
          sodium: Math.round(analyzedFood.sodium || 0),
          weight_grams: weight,
          serving: `${weight}g`
        };

        if (!item.ingredients) item.ingredients = [];
        item.ingredients.push(newIng);
        window.Nutrition.syncItemFromIngredients(item);

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
    listEl.textContent = '';

    this.parsedItems.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = `parsed-item${item.unknown ? ' unknown' : ''}`;
      card.style.animationDelay = `${i * 0.05}s`;

      const top = document.createElement('div');
      top.className = 'parsed-item-top';

      const info = document.createElement('div');
      info.className = 'parsed-item-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'parsed-item-name';
      nameEl.textContent = `${item.food.name}${item.unknown ? ' (Estimated)' : ''}`;

      const detailEl = document.createElement('span');
      detailEl.className = 'parsed-item-detail';
      detailEl.appendChild(document.createTextNode(String(item.food.serving || '1 serving') + ' '));

      const editServBtn = document.createElement('button');
      editServBtn.type = 'button';
      editServBtn.className = 'weight-edit-btn';
      editServBtn.title = 'Edit weight';
      editServBtn.setAttribute('aria-label', `Edit weight for ${item.food.name}`);
      const editSvg = this._createSvg('edit');
      editSvg.style.cssText = 'width:12px;height:12px;';
      editServBtn.appendChild(editSvg);
      editServBtn.addEventListener('click', () => this.editServing(i));
      detailEl.appendChild(editServBtn);

      info.appendChild(nameEl);
      info.appendChild(detailEl);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'parsed-item-remove-btn';
      removeBtn.title = 'Remove item';
      removeBtn.setAttribute('aria-label', `Remove ${item.food.name}`);
      removeBtn.addEventListener('click', () => this.removeItem(i));
      const trashSvg = this._createSvg('trash');
      trashSvg.style.cssText = 'width: 14px; height: 14px;';
      removeBtn.appendChild(trashSvg);

      top.appendChild(info);
      top.appendChild(removeBtn);

      const bottom = document.createElement('div');
      bottom.className = 'parsed-item-bottom';

      const qtyDiv = document.createElement('div');
      qtyDiv.className = 'parsed-item-qty';

      const decBtn = document.createElement('button');
      decBtn.type = 'button';
      decBtn.className = 'qty-btn';
      decBtn.setAttribute('aria-label', 'Decrease quantity');
      decBtn.textContent = '-';
      decBtn.addEventListener('click', () => this.updateQty(i, -1));

      const qtyVal = document.createElement('span');
      qtyVal.className = 'qty-value';
      qtyVal.textContent = String(item.quantity);

      const incBtn = document.createElement('button');
      incBtn.type = 'button';
      incBtn.className = 'qty-btn';
      incBtn.setAttribute('aria-label', 'Increase quantity');
      incBtn.textContent = '+';
      incBtn.addEventListener('click', () => this.updateQty(i, 1));

      qtyDiv.appendChild(decBtn);
      qtyDiv.appendChild(qtyVal);
      qtyDiv.appendChild(incBtn);

      const macrosDiv = document.createElement('div');
      macrosDiv.className = 'parsed-item-macros';
      const calsEl = document.createElement('span');
      calsEl.className = 'parsed-item-cals';
      calsEl.textContent = `${item.totalCalories} kcal`;

      const macroRow = document.createElement('div');
      macroRow.className = 'parsed-item-macro-row';
      [
        ['P:', `${item.totalProtein}g`],
        ['C:', `${item.totalCarbs}g`],
        ['F:', `${item.totalFat}g`]
      ].forEach(([prefix, val]) => {
        const span = document.createElement('span');
        span.appendChild(document.createTextNode(prefix));
        const strong = document.createElement('strong');
        strong.textContent = val;
        span.appendChild(strong);
        macroRow.appendChild(span);
      });

      macrosDiv.appendChild(calsEl);
      macrosDiv.appendChild(macroRow);

      bottom.appendChild(qtyDiv);
      bottom.appendChild(macrosDiv);

      const ingWrap = document.createElement('div');
      ingWrap.className = 'parsed-item-ingredients';
      ingWrap.style.cssText = 'margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--border-subtle); width: 100%;';

      const hasIngredients = item.ingredients && item.ingredients.length > 0;
      if (hasIngredients) {
        const ingHeader = document.createElement('div');
        ingHeader.style.cssText = 'margin-bottom: 6px; font-weight: 600; color: var(--text-primary); font-size: 0.8rem;';
        ingHeader.textContent = 'Ingredients:';
        ingWrap.appendChild(ingHeader);

        item.ingredients.forEach((ing, j) => {
          const row = document.createElement('div');
          row.className = 'ingredient-row';

          const ingName = document.createElement('span');
          ingName.className = 'ingredient-name';
          ingName.style.cssText = 'word-break: break-word; white-space: normal;';
          ingName.textContent = ing.name || 'Ingredient';

          const ingWeight = document.createElement('span');
          ingWeight.className = 'ingredient-weight';
          ingWeight.appendChild(document.createTextNode((ing.serving || '--') + ' '));
          const editIngBtn = document.createElement('button');
          editIngBtn.type = 'button';
          editIngBtn.className = 'weight-edit-btn';
          editIngBtn.title = 'Edit weight';
          editIngBtn.setAttribute('aria-label', `Edit weight for ${ing.name}`);
          const editIngSvg = this._createSvg('edit');
          editIngSvg.style.cssText = 'width:11px;height:11px;';
          editIngBtn.appendChild(editIngSvg);
          editIngBtn.addEventListener('click', () => this.editIngredientWeight(i, j));
          ingWeight.appendChild(editIngBtn);

          const ingMacros = document.createElement('span');
          ingMacros.className = 'ingredient-macros';
          [`${ing.calories} kcal`, `P:${ing.protein}g`, `C:${ing.carbs}g`, `F:${ing.fat}g`].forEach(txt => {
            const sp = document.createElement('span');
            sp.textContent = txt;
            ingMacros.appendChild(sp);
          });

          const rmIngBtn = document.createElement('button');
          rmIngBtn.type = 'button';
          rmIngBtn.className = 'parsed-item-remove-btn';
          rmIngBtn.style.cssText = 'position:static; margin-left:6px; padding:3px; color:var(--danger);';
          rmIngBtn.title = 'Remove ingredient';
          rmIngBtn.setAttribute('aria-label', `Remove ${ing.name}`);
          rmIngBtn.addEventListener('click', () => this.removeIngredient(i, j));
          const rmSvg = this._createSvg('trash');
          rmSvg.style.cssText = 'width: 12px; height: 12px;';
          rmIngBtn.appendChild(rmSvg);
          ingMacros.appendChild(rmIngBtn);

          row.appendChild(ingName);
          row.appendChild(ingWeight);
          row.appendChild(ingMacros);
          ingWrap.appendChild(row);
        });
      }

      const showAddBtn = document.createElement('button');
      showAddBtn.type = 'button';
      showAddBtn.id = `add-ing-show-btn-${i}`;
      showAddBtn.className = 'btn btn-ghost btn-sm';
      showAddBtn.style.cssText = 'margin-top:6px; font-size:0.76rem; padding: 5px 10px;';
      const plusSvg = this._createSvg('plus-circle');
      plusSvg.style.cssText = 'width:13px;height:13px;';
      showAddBtn.appendChild(plusSvg);
      showAddBtn.appendChild(document.createTextNode(' Add Ingredient'));

      const addForm = document.createElement('div');
      addForm.id = `add-ing-form-${i}`;
      addForm.style.cssText = 'display:none; margin-top:8px; gap:8px; align-items:center; width:100%; flex-wrap:wrap;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = `add-ing-name-${i}`;
      nameInput.placeholder = 'Name (e.g. Cheese)';
      nameInput.className = 'input-field';
      nameInput.style.cssText = 'flex:1; min-width:120px; padding:6px 8px; font-size:0.8rem;';

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.id = `add-ing-weight-${i}`;
      weightInput.placeholder = 'Weight (g)';
      weightInput.className = 'input-field';
      weightInput.style.cssText = 'width:80px; padding:6px 8px; font-size:0.8rem;';

      const submitIngBtn = document.createElement('button');
      submitIngBtn.type = 'button';
      submitIngBtn.className = 'btn btn-secondary btn-sm';
      submitIngBtn.id = `add-ing-btn-${i}`;
      submitIngBtn.style.cssText = 'padding:6px 12px; font-size:0.8rem;';
      submitIngBtn.textContent = 'Add';
      submitIngBtn.addEventListener('click', () => this.submitNewIngredient(i));

      const cancelIngBtn = document.createElement('button');
      cancelIngBtn.type = 'button';
      cancelIngBtn.className = 'btn btn-ghost btn-sm';
      cancelIngBtn.style.cssText = 'padding:6px; font-size:0.8rem;';
      cancelIngBtn.setAttribute('aria-label', 'Cancel add ingredient');
      const xSvg = this._createSvg('x');
      xSvg.style.cssText = 'width:14px;height:14px;';
      cancelIngBtn.appendChild(xSvg);

      showAddBtn.addEventListener('click', () => {
        addForm.style.display = 'flex';
        showAddBtn.style.display = 'none';
      });
      cancelIngBtn.addEventListener('click', () => {
        addForm.style.display = 'none';
        showAddBtn.style.display = 'inline-flex';
      });

      addForm.appendChild(nameInput);
      addForm.appendChild(weightInput);
      addForm.appendChild(submitIngBtn);
      addForm.appendChild(cancelIngBtn);

      ingWrap.appendChild(showAddBtn);
      ingWrap.appendChild(addForm);

      card.appendChild(top);
      card.appendChild(bottom);
      card.appendChild(ingWrap);
      listEl.appendChild(card);
    });

    const tc = this.parsedItems.reduce((s, i) => s + i.totalCalories, 0);
    const tp = this.parsedItems.reduce((s, i) => s + i.totalProtein, 0);
    const tca = this.parsedItems.reduce((s, i) => s + i.totalCarbs, 0);
    const tf = this.parsedItems.reduce((s, i) => s + i.totalFat, 0);

    totalEl.textContent = '';
    const leftTotal = document.createElement('span');
    leftTotal.textContent = `Total: ${tc} kcal`;
    const rightTotal = document.createElement('span');
    rightTotal.textContent = `P:${parseFloat(tp.toFixed(1))}g | C:${parseFloat(tca.toFixed(1))}g | F:${parseFloat(tf.toFixed(1))}g`;
    totalEl.appendChild(leftTotal);
    totalEl.appendChild(rightTotal);

    resultsEl.classList.remove('hidden');
  },

  updateQty(index, delta) {
    const item = this.parsedItems[index];
    if (!item) return;
    item.quantity = Math.max(0.5, item.quantity + delta * 0.5);
    window.Nutrition.recalcParsedItemTotals(item);
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

    document.getElementById('camera-upload-btn')?.addEventListener('click', () => ci?.click());
    document.getElementById('gallery-upload-btn')?.addEventListener('click', () => fi?.click());

    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) this.showImagePreview(files[0]);
    });

    const fileChangeHandler = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.showImagePreview(e.target.files[0]);
        e.target.value = '';
      }
    };

    if (fi) fi.addEventListener('change', fileChangeHandler);
    if (ci) ci.addEventListener('change', fileChangeHandler);

    document.getElementById('image-analyze-btn')?.addEventListener('click', () => this.processImage());
  },

  async showImagePreview(file) {
    this._selectedImageFile = file;
    try {
      const compressed = await Utils.compressImage(file, 1024, 0.8);
      this._compressedImage = compressed;
      const thumb = await Utils.createThumbnailDataUrl(file, 320, 0.6);
      this._selectedImageDataUrl = thumb || compressed.dataUrl;

      document.getElementById('image-preview-img').src = compressed.dataUrl;
      document.getElementById('image-preview-section').classList.remove('hidden');
      document.getElementById('image-drop-zone').style.display = 'none';
    } catch {
      Utils.showToast('Could not read selected image', 'error');
    }
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
      const input = this._compressedImage || file;
      const geminiResult = await Gemini.analyzeImage(input, description);
      proc.classList.add('hidden');

      if (geminiResult && geminiResult.length > 0 && !geminiResult[0].error) {
        this.parsedItems = geminiResult;
        Store.incrementNlpCount();

        if (this._selectedImageDataUrl && Utils.isValidImageUrl(this._selectedImageDataUrl)) {
          const resultPreview = document.getElementById('image-result-preview');
          document.getElementById('image-result-img').src = this._selectedImageDataUrl;
          resultPreview.classList.remove('hidden');
        }
        Utils.showToast('Image analyzed by Gemini AI', 'success', 2000);
        this.renderParsedItems('image');
      } else if (geminiResult && geminiResult[0].error) {
        Utils.showToast(geminiResult[0].error, 'warning', 4000);
        document.getElementById('image-drop-zone').style.display = '';
        this._selectedImageFile = null;
        this._selectedImageDataUrl = null;
        this._compressedImage = null;
      } else {
        if (description && description.trim()) {
          Utils.showToast('Image unclear. Analyzing from your description...', 'info', 3000);
          const textResult = await Gemini.analyzeText(description.trim());
          if (textResult && textResult.length > 0) {
            this.parsedItems = textResult;
            Store.incrementNlpCount();
            if (this._selectedImageDataUrl && Utils.isValidImageUrl(this._selectedImageDataUrl)) {
              const resultPreview = document.getElementById('image-result-preview');
              document.getElementById('image-result-img').src = this._selectedImageDataUrl;
              resultPreview.classList.remove('hidden');
            }
            Utils.showToast('Analyzed from description', 'success', 2000);
            this.renderParsedItems('image');
            return;
          }
        }
        Utils.showToast('Could not identify food. Try adding a description and retry.', 'warning', 4000);
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
      this._compressedImage = null;
    }
  },

  initBarcodeScanner() {
    const searchBtn = document.getElementById('barcode-search-btn');
    const input = document.getElementById('barcode-input');
    const cameraToggleBtn = document.getElementById('barcode-camera-toggle-btn');

    searchBtn?.addEventListener('click', () => {
      this.lookupBarcode(input.value);
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.lookupBarcode(input.value);
      }
    });

    cameraToggleBtn?.addEventListener('click', () => {
      if (this._videoStream) {
        this.stopBarcodeCamera();
        this._setBtnContent(cameraToggleBtn, 'camera', 'Start Camera Scan');
      } else {
        this.startBarcodeCamera();
        this._setBtnContent(cameraToggleBtn, 'camera-off', 'Stop Camera');
      }
    });

    document.querySelectorAll('.barcode-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const code = chip.dataset.code;
        if (input) input.value = code;
        this.lookupBarcode(code);
      });
    });
  },

  async startBarcodeCamera() {
    const video = document.getElementById('barcode-video');
    const container = document.getElementById('barcode-scanner-box');
    const toggleBtn = document.getElementById('barcode-camera-toggle-btn');
    if (!video) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      Utils.showToast('Camera access not supported on this browser. Use manual entry below.', 'info', 3000);
      return;
    }

    try {
      this._videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      video.srcObject = this._videoStream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      if (container) container.classList.add('active');
      if (toggleBtn) {
        this._setBtnContent(toggleBtn, 'camera-off', 'Stop Camera');
      }

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']
        });

        this._barcodeInterval = setInterval(async () => {
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await detector.detect(video);
              if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                this.stopBarcodeCamera();
                const inp = document.getElementById('barcode-input');
                if (inp) inp.value = code;
                this.lookupBarcode(code);
              }
            } catch {
              // Ignore transient frame decode failure
            }
          }
        }, 350);
      }
    } catch (err) {
      console.warn('Camera start error:', err);
      Utils.showToast('Could not start camera. Please enter barcode number below.', 'info', 3500);
    }
  },

  stopBarcodeCamera() {
    if (this._barcodeInterval) {
      clearInterval(this._barcodeInterval);
      this._barcodeInterval = null;
    }
    if (this._videoStream) {
      this._videoStream.getTracks().forEach(t => t.stop());
      this._videoStream = null;
    }
    const container = document.getElementById('barcode-scanner-box');
    if (container) container.classList.remove('active');
    const toggleBtn = document.getElementById('barcode-camera-toggle-btn');
    if (toggleBtn) {
      this._setBtnContent(toggleBtn, 'camera', 'Start Camera Scan');
    }
  },

  async lookupBarcode(barcode) {
    barcode = (barcode || '').trim();
    if (!barcode) {
      Utils.showToast('Please enter a barcode number', 'warning');
      return;
    }

    const searchBtn = document.getElementById('barcode-search-btn');
    if (searchBtn) {
      searchBtn.disabled = true;
      this._setBtnContent(searchBtn, 'loader-2', 'Searching...');
    }

    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      if (data.status === 1 && data.product) {
        const p = data.product;
        const parsed = window.Nutrition.computeBarcodeNutrition(p);
        this.parsedItems = [parsed];

        const imgUrl = p.image_front_url || p.image_url;
        this._selectedImageDataUrl = Utils.isValidImageUrl(imgUrl) ? imgUrl : null;

        Utils.showToast(`Found: ${parsed.food.name}`, 'success', 2500);
        this.renderParsedItems('barcode');
        this.stopBarcodeCamera();
      } else {
        Utils.showToast('Product not found in Open Food Facts. Try manual entry.', 'warning', 4000);
      }
    } catch (err) {
      console.error('Barcode lookup failed:', err);
      Utils.showToast('Failed to connect to Open Food Facts database', 'error');
    } finally {
      if (searchBtn) {
        searchBtn.disabled = false;
        this._setBtnContent(searchBtn, 'search', 'Lookup');
      }
    }
  },

  confirmParsed() {
    if (this.parsedItems.length === 0) return;
    const dateStr = this.targetDate || Utils.todayStr();
    const safeThumb = (this._selectedImageDataUrl && Utils.isValidImageUrl(this._selectedImageDataUrl) && this._selectedImageDataUrl.length <= 70000)
      ? this._selectedImageDataUrl
      : null;

    this.parsedItems.forEach(item => {
      Store.addDiaryItem(dateStr, this.selectedMealType, {
        id: Utils.uuid(),
        name: item.food.name,
        calories: item.totalCalories,
        protein: item.totalProtein,
        carbs: item.totalCarbs,
        fat: item.totalFat,
        fiber: item.totalFiber != null ? item.totalFiber : Math.round((item.food.fiber || 0) * item.quantity * 10) / 10,
        sugar: item.totalSugar != null ? item.totalSugar : Math.round((item.food.sugar || 0) * item.quantity * 10) / 10,
        sodium: item.totalSodium != null ? item.totalSodium : Math.round((item.food.sodium || 0) * item.quantity),
        serving: `${item.quantity} x ${item.food.serving}`,
        timestamp: new Date().toISOString(),
        ingredients: item.ingredients || [],
        imageDataUrl: safeThumb
      });
      Store.incrementFoodFreq(item.food.name);
    });

    Store.incrementTotalMeals(this.parsedItems.length);
    document.dispatchEvent(new CustomEvent('meal-logged', { detail: { date: dateStr, meal: this.selectedMealType } }));

    const tc = this.parsedItems.reduce((s, i) => s + i.totalCalories, 0);
    Utils.showToast(`Added ${this.parsedItems.length} items (${tc} kcal)`, 'success');
    this.close();
  },

  addManual() {
    const name = document.getElementById('manual-food-name').value.trim();
    const calories = parseInt(document.getElementById('manual-calories').value, 10);
    const protein = parseFloat(document.getElementById('manual-protein').value) || 0;
    const carbs = parseFloat(document.getElementById('manual-carbs').value) || 0;
    const fat = parseFloat(document.getElementById('manual-fat').value) || 0;
    const fiber = parseFloat(document.getElementById('manual-fiber')?.value) || 0;
    const sugar = parseFloat(document.getElementById('manual-sugar')?.value) || 0;
    const sodium = parseFloat(document.getElementById('manual-sodium')?.value) || 0;
    const serving = document.getElementById('manual-serving').value.trim() || '1 serving';

    if (!name) { Utils.showToast('Please enter a food name', 'warning'); return; }
    if (isNaN(calories) || calories <= 0 || calories > 10000) { Utils.showToast('Please enter valid calories (1 to 10,000 kcal)', 'warning'); return; }
    if (isNaN(protein) || protein < 0 || protein > 1000) { Utils.showToast('Protein cannot be negative or exceed 1000g', 'warning'); return; }
    if (isNaN(carbs) || carbs < 0 || carbs > 1000) { Utils.showToast('Carbs cannot be negative or exceed 1000g', 'warning'); return; }
    if (isNaN(fat) || fat < 0 || fat > 1000) { Utils.showToast('Fat cannot be negative or exceed 1000g', 'warning'); return; }
    if (isNaN(fiber) || fiber < 0 || fiber > 500) { Utils.showToast('Fiber cannot be negative or exceed 500g', 'warning'); return; }
    if (isNaN(sugar) || sugar < 0 || sugar > 1000) { Utils.showToast('Sugar cannot be negative or exceed 1000g', 'warning'); return; }
    if (isNaN(sodium) || sodium < 0 || sodium > 50000) { Utils.showToast('Sodium cannot be negative or exceed 50,000mg', 'warning'); return; }

    const dateStr = this.targetDate || Utils.todayStr();
    Store.addDiaryItem(dateStr, this.selectedMealType, {
      id: Utils.uuid(),
      name,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      sodium,
      serving,
      timestamp: new Date().toISOString()
    });

    Store.incrementTotalMeals(1);
    Store.incrementFoodFreq(name);
    document.dispatchEvent(new CustomEvent('meal-logged', { detail: { date: dateStr, meal: this.selectedMealType } }));
    Utils.showToast(`${name} added (${calories} kcal)`, 'success');
    this.close();
  }
};
