window.Diary = {
  currentDate: null,
  _recentItems: [],

  _createTrashSvg() {
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
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14');
    svg.appendChild(p);
    return svg;
  },

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
        document.dispatchEvent(new CustomEvent('open-meal-log', {
          detail: { mealType: btn.dataset.meal, date: this.currentDate }
        }));
      });
    });

    document.addEventListener('meal-logged', () => this.render());
  },

  render() {
    if (!this.currentDate) this.currentDate = Utils.todayStr();
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

    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(meal => {
      const container = document.querySelector(`.meal-group-items[data-meal="${meal}"]`);
      container.textContent = '';
      const items = diary[meal];
      if (items.length === 0) {
        const emptyP = document.createElement('p');
        emptyP.className = 'meal-empty';
        emptyP.textContent = 'No items logged';
        container.appendChild(emptyP);
        return;
      }

      items.forEach(item => {
        const microParts = [];
        if (item.fiber) microParts.push(`Fib:${Math.round(item.fiber * 10) / 10}g`);
        if (item.sugar) microParts.push(`Sug:${Math.round(item.sugar * 10) / 10}g`);
        if (item.sodium) microParts.push(`Sod:${Math.round(item.sodium)}mg`);
        const microStr = microParts.length ? ` | ${microParts.join(' ')}` : '';

        const row = document.createElement('div');
        row.className = 'meal-item';
        row.dataset.id = item.id;

        const info = document.createElement('div');
        info.className = 'meal-item-info';

        const nameEl = document.createElement('span');
        nameEl.className = 'meal-item-name';
        nameEl.textContent = item.name || 'Food item';

        const servEl = document.createElement('span');
        servEl.className = 'meal-item-serving';
        servEl.textContent = `${item.serving || ''} | P:${Math.round(item.protein || 0)}g C:${Math.round(item.carbs || 0)}g F:${Math.round(item.fat || 0)}g${microStr}`;

        info.appendChild(nameEl);
        info.appendChild(servEl);

        const calsEl = document.createElement('span');
        calsEl.className = 'meal-item-cals';
        calsEl.textContent = String(Math.round(item.calories || 0));

        const delBtn = document.createElement('button');
        delBtn.className = 'meal-item-delete icon-btn';
        delBtn.title = 'Remove';
        delBtn.setAttribute('aria-label', `Remove ${item.name || 'item'}`);
        delBtn.addEventListener('click', () => this.deleteItem(this.currentDate, meal, item.id));
        delBtn.appendChild(this._createTrashSvg());

        row.appendChild(info);
        row.appendChild(calsEl);
        row.appendChild(delBtn);
        container.appendChild(row);
      });
    });

    this.renderRecentFoods();
  },

  deleteItem(dateStr, mealType, itemId) {
    Store.deleteDiaryItem(dateStr, mealType, itemId);
    this.render();
    if (dateStr === Utils.todayStr()) Dashboard.refresh();
    Utils.showToast('Item removed', 'info');
  },

  renderRecentFoods() {
    const container = document.getElementById('recent-foods');
    if (!container) return;
    container.textContent = '';

    const recent = Store.getRecentFoods(8);
    this._recentItems = recent;

    if (recent.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = 'Your recently logged foods will appear here.';
      container.appendChild(p);
      return;
    }

    recent.forEach((item, i) => {
      const dateLabel = item.date === Utils.todayStr() ? 'Today' : Utils.formatShortDate(item.date);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'frequent-food-card';
      card.style.textAlign = 'left';
      card.addEventListener('click', () => this.showRecentDetail(i));

      const nameEl = document.createElement('span');
      nameEl.className = 'ff-name';
      nameEl.textContent = item.name || 'Food item';

      const calEl = document.createElement('span');
      calEl.className = 'ff-cal';
      calEl.textContent = `${Math.round(item.calories || 0)} kcal | ${dateLabel}`;

      card.appendChild(nameEl);
      card.appendChild(calEl);
      container.appendChild(card);
    });
  },

  showRecentDetail(index) {
    const item = this._recentItems[index];
    if (!item) return;

    const modal = document.getElementById('recent-detail-modal');
    document.getElementById('recent-detail-title').textContent = item.name || 'Food Details';

    const imgSection = document.getElementById('recent-detail-image');
    const imgEl = document.getElementById('recent-detail-img');
    if (item.imageDataUrl && Utils.isValidImageUrl(item.imageDataUrl)) {
      imgEl.src = item.imageDataUrl;
      imgSection.classList.remove('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgSection.classList.add('hidden');
    }

    const macrosContainer = document.getElementById('recent-detail-macros');
    macrosContainer.textContent = '';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; text-align:center;';

    const boxes = [
      { value: String(Math.round(item.calories || 0)), label: 'kcal', color: 'var(--accent-text)' },
      { value: `${parseFloat((item.protein || 0).toFixed(1))}g`, label: 'Protein', color: 'var(--accent-text)' },
      { value: `${parseFloat((item.carbs || 0).toFixed(1))}g`, label: 'Carbs', color: 'var(--text-primary)' },
      { value: `${parseFloat((item.fat || 0).toFixed(1))}g`, label: 'Fat', color: 'var(--fats-color)' }
    ];

    boxes.forEach(b => {
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--bg-primary); padding:10px 6px; border-radius:4px; border:1px solid var(--border-color);';
      const valEl = document.createElement('div');
      valEl.style.cssText = `font-size:1.05rem; font-weight:700; color:${b.color}; font-variant-numeric:tabular-nums;`;
      valEl.textContent = b.value;
      const lblEl = document.createElement('div');
      lblEl.style.cssText = 'font-size:0.7rem; color:var(--text-muted); margin-top:2px;';
      lblEl.textContent = b.label;
      card.appendChild(valEl);
      card.appendChild(lblEl);
      grid.appendChild(card);
    });

    const metaEl = document.createElement('div');
    metaEl.style.cssText = 'margin-top:8px; font-size:0.78rem; color:var(--text-secondary); text-align:center;';
    const mealName = item.mealType ? item.mealType.charAt(0).toUpperCase() + item.mealType.slice(1) : '';
    const dateName = item.date === Utils.todayStr() ? 'Today' : Utils.formatShortDate(item.date);
    metaEl.textContent = `${item.serving || ''} | ${mealName} | ${dateName}`;

    macrosContainer.appendChild(grid);
    macrosContainer.appendChild(metaEl);

    const ingContainer = document.getElementById('recent-detail-ingredients');
    ingContainer.textContent = '';

    if (item.ingredients && item.ingredients.length > 0) {
      const heading = document.createElement('div');
      heading.style.cssText = 'font-weight:700; font-size:0.85rem; color:var(--text-primary); margin-bottom:8px;';
      heading.textContent = 'Ingredients';
      ingContainer.appendChild(heading);

      item.ingredients.forEach(ing => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-subtle); font-size:0.8rem;';

        const left = document.createElement('span');
        left.style.color = 'var(--text-primary)';
        left.textContent = ing.name || 'Ingredient';

        const right = document.createElement('span');
        right.style.cssText = 'color:var(--text-muted); font-size:0.75rem; font-variant-numeric:tabular-nums;';
        const w = ing.serving || (ing.weight_grams ? `${ing.weight_grams}g` : '');
        const p = Number(ing.protein || 0).toFixed(1);
        const c = Number(ing.carbs || 0).toFixed(1);
        const f = Number(ing.fat || 0).toFixed(1);
        right.textContent = `${w} | ${ing.calories || 0} kcal | P:${p}g C:${c}g F:${f}g`;

        row.appendChild(left);
        row.appendChild(right);
        ingContainer.appendChild(row);
      });
    } else {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:0.8rem; color:var(--text-muted); text-align:center;';
      empty.textContent = 'No ingredient breakdown available.';
      ingContainer.appendChild(empty);
    }

    modal.classList.remove('hidden');

    document.getElementById('recent-detail-close').onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
  }
};
