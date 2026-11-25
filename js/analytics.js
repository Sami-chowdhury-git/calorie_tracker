window.Analytics = {
  calorieChart: null,
  weightChart: null,
  weightPeriod: 7,

  _getThemePalette() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const styles = getComputedStyle(document.documentElement);
    return {
      isDark,
      text: styles.getPropertyValue('--text-primary').trim() || (isDark ? '#F3EEE3' : '#111111'),
      muted: styles.getPropertyValue('--text-muted').trim() || (isDark ? '#A8A296' : '#524E46'),
      cardBg: styles.getPropertyValue('--bg-secondary').trim() || (isDark ? '#1B1B1B' : '#FFFFFF'),
      accent: '#D9541E',
      grid: isDark ? 'rgba(243, 238, 227, 0.14)' : 'rgba(17, 17, 17, 0.1)',
      border: isDark ? '#F3EEE3' : '#111111',
      targetFill: isDark ? 'rgba(243, 238, 227, 0.14)' : 'rgba(17, 17, 17, 0.08)',
      targetBorder: isDark ? 'rgba(243, 238, 227, 0.48)' : 'rgba(17, 17, 17, 0.42)',
      tooltipBg: isDark ? '#F3EEE3' : '#111111',
      tooltipFg: isDark ? '#111111' : '#FFFFFF'
    };
  },

  init() {
    document.getElementById('weight-period-7').addEventListener('click', () => {
      this.weightPeriod = 7;
      document.getElementById('weight-period-7').classList.add('active');
      document.getElementById('weight-period-30').classList.remove('active');
      this.renderWeightChart();
    });
    document.getElementById('weight-period-30').addEventListener('click', () => {
      this.weightPeriod = 30;
      document.getElementById('weight-period-30').classList.add('active');
      document.getElementById('weight-period-7').classList.remove('active');
      this.renderWeightChart();
    });

    document.getElementById('weight-log-btn').addEventListener('click', () => {
      const profile = Store.getProfile();
      const unit = profile?.weightUnit === 'lbs' ? 'lbs' : 'kg';
      const rawVal = parseFloat(document.getElementById('weight-input').value);
      const minW = unit === 'lbs' ? 44 : 20;
      const maxW = unit === 'lbs' ? 660 : 300;
      if (!rawVal || rawVal < minW || rawVal > maxW) {
        Utils.showToast(`Enter a valid weight (${minW} to ${maxW} ${unit})`, 'warning');
        return;
      }

      const weightKg = unit === 'lbs' ? window.Nutrition.lbsToKg(rawVal) : rawVal;
      const today = Utils.todayStr();
      Store.recordWeight(today, weightKg);
      document.getElementById('weight-input').value = '';

      this.renderWeightChart();
      Utils.showToast(`Weight logged (${rawVal} ${unit})`, 'success');
      document.dispatchEvent(new CustomEvent('check-achievements'));
    });

    const exportModal = document.getElementById('export-report-modal');
    document.getElementById('export-report-btn')?.addEventListener('click', () => {
      if (exportModal) {
        exportModal.classList.remove('hidden');
      }
    });

    document.getElementById('export-modal-close')?.addEventListener('click', () => {
      if (exportModal) exportModal.classList.add('hidden');
    });

    exportModal?.addEventListener('click', (e) => {
      if (e.target === exportModal) exportModal.classList.add('hidden');
    });

    document.getElementById('export-csv-action-btn')?.addEventListener('click', () => {
      const range = document.getElementById('export-range-select')?.value || 7;
      if (window.Report) window.Report.exportCSV(range);
      if (exportModal) exportModal.classList.add('hidden');
    });

    document.getElementById('export-pdf-action-btn')?.addEventListener('click', () => {
      const range = document.getElementById('export-range-select')?.value || 7;
      if (window.Report) window.Report.exportPDF(range);
      if (exportModal) exportModal.classList.add('hidden');
    });

    document.addEventListener('meal-logged', () => this.refresh());
  },

  refresh() {
    const profile = Store.getProfile();
    const unit = profile?.weightUnit === 'lbs' ? 'lbs' : 'kg';
    const wInput = document.getElementById('weight-input');
    if (wInput) {
      wInput.placeholder = `Enter weight (${unit})`;
      wInput.min = unit === 'lbs' ? '44' : '20';
      wInput.max = unit === 'lbs' ? '660' : '300';
    }
    this.renderCalorieChart();
    this.renderWeightChart();
    this.renderSummaryStats();
  },

  renderCalorieChart() {
    const canvas = document.getElementById('calorie-chart-canvas');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const profile = Store.getProfile();
    if (!profile) return;

    const p = this._getThemePalette();
    const labels = [], consumed = [], targets = [];
    for (let i = 6; i >= 0; i--) {
      const d = Utils.addDays(Utils.todayStr(), -i);
      labels.push(Utils.getDayName(d));
      const t = Store.getDayTotals(d);
      consumed.push(t.calories);
      targets.push(profile.tdee);
    }

    if (this.calorieChart) this.calorieChart.destroy();
    this.calorieChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Consumed',
            data: consumed,
            backgroundColor: p.accent,
            borderColor: p.border,
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.56
          },
          {
            label: 'Target',
            data: targets,
            backgroundColor: p.targetFill,
            borderColor: p.targetBorder,
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.56
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            labels: {
              color: p.text,
              font: { family: 'Inter', size: 11, weight: '600' },
              boxWidth: 12,
              padding: 16
            }
          },
          tooltip: {
            backgroundColor: p.tooltipBg,
            titleColor: p.tooltipFg,
            bodyColor: p.tooltipFg,
            borderColor: p.accent,
            borderWidth: 1,
            cornerRadius: 4,
            padding: 10
          },
          datalabels: false
        },
        scales: {
          x: {
            grid: { color: p.grid, drawBorder: true, borderColor: p.border },
            border: { color: p.border, width: 1 },
            ticks: { color: p.text, font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: p.grid },
            border: { color: p.border, width: 1 },
            ticks: { color: p.text, font: { family: 'Inter', size: 11 } },
            beginAtZero: true
          }
        }
      }
    });
  },

  renderWeightChart() {
    const canvas = document.getElementById('weight-chart-canvas');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const profile = Store.getProfile();
    const unit = profile?.weightUnit === 'lbs' ? 'lbs' : 'kg';
    const log = Store.getWeightLog();
    const cutoff = Utils.addDays(Utils.todayStr(), -this.weightPeriod);
    const filtered = log.filter(e => e.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));
    const p = this._getThemePalette();

    if (this.weightChart) this.weightChart.destroy();

    if (filtered.length === 0) {
      this.weightChart = new Chart(ctx, {
        type: 'line',
        data: { labels: ['No data yet'], datasets: [{ data: [0], borderColor: 'transparent' }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 240 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } }
        }
      });
      return;
    }

    const labels = filtered.map(e => {
      const d = new Date(e.date + 'T12:00:00');
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const weights = filtered.map(e => (unit === 'lbs' ? window.Nutrition.kgToLbs(e.weight) : e.weight));

    const chartSubtitle = document.getElementById('weight-chart-subtitle');
    if (chartSubtitle) {
      if (filtered.length >= 2) {
        const change = (weights[weights.length - 1] - weights[0]).toFixed(1);
        const changeText = change > 0 ? `+${change}` : change;
        chartSubtitle.textContent = `Current: ${weights[weights.length - 1]} ${unit} | Change: ${changeText} ${unit} in ${this.weightPeriod}D`;
      } else {
        chartSubtitle.textContent = `Latest: ${weights[0]} ${unit}`;
      }
    }

    this.weightChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `Weight (${unit})`,
          data: weights,
          borderColor: p.accent,
          backgroundColor: (context) => {
            const ch = context.chart;
            const { ctx: c, chartArea } = ch;
            if (!chartArea) return 'transparent';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(217, 84, 30, 0.16)');
            g.addColorStop(1, 'rgba(217, 84, 30, 0.01)');
            return g;
          },
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: p.accent,
          pointBorderColor: p.border,
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: p.tooltipBg,
            titleColor: p.tooltipFg,
            bodyColor: p.tooltipFg,
            borderColor: p.accent,
            borderWidth: 1,
            cornerRadius: 4,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: p.grid },
            border: { color: p.border, width: 1 },
            ticks: { color: p.text, font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: p.grid },
            border: { color: p.border, width: 1 },
            ticks: { color: p.text, font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });
  },

  renderSummaryStats() {
    const profile = Store.getProfile();
    if (!profile) return;

    let totalC = 0, totalP = 0, days = 0;
    for (let i = 0; i < 7; i++) {
      const t = Store.getDayTotals(Utils.addDays(Utils.todayStr(), -i));
      if (t.meals > 0) { totalC += t.calories; totalP += t.protein; days++; }
    }
    const avgC = days > 0 ? Math.round(totalC / days) : 0;
    const avgP = days > 0 ? Math.round(totalP / days) : 0;

    let lastTotalC = 0, lastDays = 0;
    for (let i = 7; i < 14; i++) {
      const t = Store.getDayTotals(Utils.addDays(Utils.todayStr(), -i));
      if (t.meals > 0) { lastTotalC += t.calories; lastDays++; }
    }
    const lastAvgC = lastDays > 0 ? Math.round(lastTotalC / lastDays) : 0;

    let consistent = 0;
    const streakData = Store.getComputedStreaks();
    for (let i = 0; i < 7; i++) {
      const t = Store.getDayTotals(Utils.addDays(Utils.todayStr(), -i));
      if (t.meals > 0 && Math.abs(t.calories - profile.tdee) / profile.tdee <= 0.15) consistent++;
    }
    const consistencyPct = days > 0 ? Math.round((consistent / 7) * 100) : 0;

    document.getElementById('avg-calories').textContent = avgC > 0 ? `${Utils.formatNum(avgC)} kcal` : '--';
    document.getElementById('avg-protein').textContent = avgP > 0 ? `${avgP} g` : '--';
    document.getElementById('consistency-score').textContent = days > 0 ? `${consistencyPct}%` : '--';

    const calChange = document.getElementById('avg-cal-change');
    if (calChange && lastAvgC > 0 && avgC > 0) {
      const pct = Math.round(((avgC - lastAvgC) / lastAvgC) * 100);
      calChange.textContent = `${pct >= 0 ? '+' : ''}${pct}% vs last week`;
      calChange.style.color = pct >= 0 ? 'var(--accent-text)' : 'var(--success)';
    }

    const protChange = document.getElementById('avg-prot-change');
    if (protChange && profile.protein) {
      const diff = avgP - profile.protein;
      protChange.textContent = `${diff >= 0 ? '+' : ''}${diff}g vs target`;
      protChange.style.color = diff >= 0 ? 'var(--success)' : 'var(--accent-text)';
    }

    const conDetail = document.getElementById('consistency-detail');
    if (conDetail) {
      conDetail.textContent = `Log streak: ${streakData?.currentStreak || 0} days`;
    }
  }
};
