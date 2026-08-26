/* ═══════════════════════════════════════════ */
/* DIARY — Food diary view                     */
/* ═══════════════════════════════════════════ */

window.Diary = {
  currentDate: null,

  init() {
    this.currentDate = Utils.todayStr();

    document.getElementById('diary-prev-btn').addEventListener('click', () => {
      this.currentDate = Utils.addDays(this.currentDate, -1);
      this.render();
    });
    document.getElementById('diary-next-btn').addEventListener('click', () => {
      if (this.currentDate < Utils.todayStr()) {
        this.currentDate = Utils.addDays(this.currentDate, 1);
        this.render();
      }
    });

    document.querySelectorAll('.meal-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('open-meal-log', { detail: { mealType: btn.dataset.meal, date: this.currentDate } }));
      });
    });

    // FAB removed — meal-add-btn buttons handle this per meal type

    document.addEventListener('meal-logged', () => this.render());
  },

  render() {
    document.getElementById('diary-date').textContent = Utils.formatDiaryDate(this.currentDate);
    document.getElementById('diary-next-btn').disabled = this.currentDate >= Utils.todayStr();

    const diary = Store.getDiary(this.currentDate);
    const t = Store.getDayTotals(this.currentDate);

    document.getElementById('diary-total-calories').textContent = t.calories;
    document.getElementById('diary-total-protein').textContent = Math.round(t.protein);
    document.getElementById('diary-total-carbs').textContent = Math.round(t.carbs);
    document.getElementById('diary-total-fat').textContent = Math.round(t.fat);
    
    const fiberEl = document.getElementById('diary-total-fiber');
    const sugarEl = document.getElementById('diary-total-sugar');
    const sodiumEl = document.getElementById('diary-total-sodium');
    if (fiberEl) fiberEl.textContent = `${Math.round(t.fiber * 10) / 10}g`;
    if (sugarEl) sugarEl.textContent = `${Math.round(t.sugar * 10) / 10}g`;
    if (sodiumEl) sodiumEl.textContent = `${Math.round(t.sodium)}mg`;

    ['breakfast','lunch','dinner','snacks'].forEach(meal => {
      const container = document.querySelector(`.meal-group-items[data-meal="${meal}"]`);
      const items = diary[meal];
      if (items.length === 0) {
        container.innerHTML = '<p class="meal-empty">No items logged</p>';
        return;
      }
      container.innerHTML = items.map(item => {
        const microParts = [];
        if (item.fiber) microParts.push(`Fib:${Math.round(item.fiber * 10) / 10}g`);
        if (item.sugar) microParts.push(`Sug:${Math.round(item.sugar * 10) / 10}g`);
        if (item.sodium) microParts.push(`Sod:${Math.round(item.sodium)}mg`);
        const microStr = microParts.length ? ` · ${microParts.join(' ')}` : '';

        return `
        <div class="meal-item" data-id="${item.id}">
          <div class="meal-item-info">
            <span class="meal-item-name">${item.name}</span>
            <span class="meal-item-serving">${item.serving || ''} · P:${Math.round(item.protein)}g C:${Math.round(item.carbs)}g F:${Math.round(item.fat)}g${microStr}</span>
          </div>
          <span class="meal-item-cals">${item.calories}</span>
          <button class="meal-item-delete icon-btn" onclick="Diary.deleteItem('${this.currentDate}','${meal}','${item.id}')" title="Remove">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `}).join('');
    });

    this.renderRecentFoods();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  deleteItem(dateStr, mealType, itemId) {
    const diary = Store.getDiary(dateStr);
    diary[mealType] = diary[mealType].filter(i => i.id !== itemId);
    Store.saveDiary(dateStr, diary);
    this.render();
    if (dateStr === Utils.todayStr()) Dashboard.refresh();
    Utils.showToast('Item removed', 'info');
  },

  renderRecentFoods() {
    const container = document.getElementById('recent-foods');
    if (!container) return;
    const recent = Store.getRecentFoods(8);
    if (recent.length === 0) {
      container.innerHTML = '<p class="empty-hint">Your recently logged foods will appear here.</p>';
      return;
    }
    container.innerHTML = recent.map((item, i) => {
      const dateLabel = item.date === Utils.todayStr() ? 'Today' : Utils.formatShortDate(item.date);
      return `<div class="frequent-food-card" onclick="Diary.showRecentDetail(${i})">
        <span class="ff-name">${item.name}</span>
        <span class="ff-cal">${item.calories} kcal · ${dateLabel}</span>
      </div>`;
    }).join('');
    this._recentItems = recent;
  },

  _recentItems: [],

  showRecentDetail(index) {
    const item = this._recentItems[index];
    if (!item) return;

    const modal = document.getElementById('recent-detail-modal');
    document.getElementById('recent-detail-title').textContent = item.name;

    // Image
    const imgSection = document.getElementById('recent-detail-image');
    const imgEl = document.getElementById('recent-detail-img');
    if (item.imageDataUrl) {
      imgEl.src = item.imageDataUrl;
      imgSection.classList.remove('hidden');
    } else {
      imgSection.classList.add('hidden');
    }

    // Macros
    document.getElementById('recent-detail-macros').innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; text-align:center;">
        <div style="background:var(--bg-tertiary); padding:10px 6px; border-radius:10px;">
          <div style="font-size:1.1rem; font-weight:700; color:var(--primary);">${item.calories}</div>
          <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">kcal</div>
        </div>
        <div style="background:var(--bg-tertiary); padding:10px 6px; border-radius:10px;">
          <div style="font-size:1.1rem; font-weight:700; color:#ef4444;">${parseFloat((item.protein || 0).toFixed(1))}g</div>
          <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">Protein</div>
        </div>
        <div style="background:var(--bg-tertiary); padding:10px 6px; border-radius:10px;">
          <div style="font-size:1.1rem; font-weight:700; color:#f59e0b;">${parseFloat((item.carbs || 0).toFixed(1))}g</div>
          <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">Carbs</div>
        </div>
        <div style="background:var(--bg-tertiary); padding:10px 6px; border-radius:10px;">
          <div style="font-size:1.1rem; font-weight:700; color:#3b82f6;">${parseFloat((item.fat || 0).toFixed(1))}g</div>
          <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">Fat</div>
        </div>
      </div>
      <div style="margin-top:8px; font-size:0.78rem; color:var(--text-secondary); text-align:center;">
        ${item.serving || ''} · ${item.mealType ? item.mealType.charAt(0).toUpperCase() + item.mealType.slice(1) : ''} · ${item.date === Utils.todayStr() ? 'Today' : Utils.formatShortDate(item.date)}
      </div>
    `;

    // Ingredients
    const ingContainer = document.getElementById('recent-detail-ingredients');
    if (item.ingredients && item.ingredients.length > 0) {
      ingContainer.innerHTML = `
        <div style="font-weight:500; font-size:0.85rem; color:var(--text-primary); margin-bottom:8px;">Ingredients</div>
        ${item.ingredients.map(ing => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color); font-size:0.8rem;">
            <span style="color:var(--text-primary);">• ${ing.name}</span>
            <span style="color:var(--text-secondary); font-size:0.75rem;">${ing.serving || (ing.weight_grams ? ing.weight_grams + 'g' : '')} · ${ing.calories || 0} kcal · P:${(ing.protein || 0).toFixed?.(1) || ing.protein || 0}g C:${(ing.carbs || 0).toFixed?.(1) || ing.carbs || 0}g F:${(ing.fat || 0).toFixed?.(1) || ing.fat || 0}g</span>
          </div>
        `).join('')}
      `;
    } else {
      ingContainer.innerHTML = '<p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">No ingredient breakdown available.</p>';
    }

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Close handlers
    document.getElementById('recent-detail-close').onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
  },
};
