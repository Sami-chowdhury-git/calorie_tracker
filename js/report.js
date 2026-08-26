/* ═══════════════════════════════════════════ */
/* REPORT — Nutrition Report Exporter (CSV & PDF)*/
/* ═══════════════════════════════════════════ */

window.Report = {
  getReportData(days = 7) {
    const profile = Store.getProfile() || {};
    const user = Auth.getCurrentUser() || {};
    const today = Utils.todayStr();
    const dates = [];

    if (days === 'all') {
      const logged = Store.getLoggedDates();
      if (logged.length === 0) dates.push(today);
      else {
        // Range from earliest logged date to today
        let curr = logged[0];
        while (curr <= today) {
          dates.push(curr);
          curr = Utils.addDays(curr, 1);
        }
      }
    } else {
      const numDays = parseInt(days) || 7;
      for (let i = numDays - 1; i >= 0; i--) {
        dates.push(Utils.addDays(today, -i));
      }
    }

    const rows = dates.map(dateStr => {
      const totals = Store.getDayTotals(dateStr);
      const water = Store.getWaterLog(dateStr);
      const diary = Store.getDiary(dateStr);
      const d = new Date(dateStr + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        date: dateStr,
        day: dayName,
        calories: totals.calories,
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fat: Math.round(totals.fat * 10) / 10,
        fiber: Math.round(totals.fiber * 10) / 10,
        sugar: Math.round(totals.sugar * 10) / 10,
        sodium: Math.round(totals.sodium),
        water: water.total || 0,
        waterGoal: water.goal || 2500,
        meals: totals.meals,
        diary
      };
    });

    const activeDays = rows.filter(r => r.meals > 0 || r.water > 0);
    const count = activeDays.length || 1;
    const avg = {
      calories: Math.round(rows.reduce((s, r) => s + r.calories, 0) / count),
      protein: Math.round((rows.reduce((s, r) => s + r.protein, 0) / count) * 10) / 10,
      carbs: Math.round((rows.reduce((s, r) => s + r.carbs, 0) / count) * 10) / 10,
      fat: Math.round((rows.reduce((s, r) => s + r.fat, 0) / count) * 10) / 10,
      fiber: Math.round((rows.reduce((s, r) => s + r.fiber, 0) / count) * 10) / 10,
      sugar: Math.round((rows.reduce((s, r) => s + r.sugar, 0) / count) * 10) / 10,
      sodium: Math.round(rows.reduce((s, r) => s + r.sodium, 0) / count),
      water: Math.round(rows.reduce((s, r) => s + r.water, 0) / count)
    };

    const targets = Utils.calculateNutritionTargets(profile);

    return {
      user: { name: user.name || profile.name || 'MacroLens User', email: user.email || '' },
      profile,
      targets,
      generatedAt: new Date().toLocaleString(),
      range: days === 'all' ? 'All Time' : `Past ${days} Days`,
      rows,
      averages: avg,
      totalMealsLogged: rows.reduce((s, r) => s + r.meals, 0)
    };
  },

  exportCSV(days = 7) {
    const data = this.getReportData(days);
    const headers = [
      'Date',
      'Day',
      'Calories (kcal)',
      'Protein (g)',
      'Carbs (g)',
      'Fat (g)',
      'Fiber (g)',
      'Sugar (g)',
      'Sodium (mg)',
      'Water (ml)',
      'Meals Count'
    ];

    const lines = [
      `"MacroLens Nutrition Summary Report"`,
      `"User: ${data.user.name.replace(/"/g, '""')}"`,
      `"Generated: ${data.generatedAt}"`,
      `"Period: ${data.range}"`,
      `"Personalized Daily Targets: Calories: ${data.targets.tdee} kcal | Protein: ${data.targets.protein}g | Carbs: ${data.targets.carbs}g | Fat: ${data.targets.fat}g | Fiber: ${data.targets.fiber}g | Sugar: <${data.targets.sugar}g | Sodium: <${data.targets.sodium}mg | Water: ${data.targets.water}ml"`,
      '',
      headers.join(',')
    ];

    data.rows.forEach(r => {
      lines.push([
        r.date,
        r.day,
        r.calories,
        r.protein,
        r.carbs,
        r.fat,
        r.fiber,
        r.sugar,
        r.sodium,
        r.water,
        r.meals
      ].join(','));
    });

    lines.push('');
    lines.push([
      'AVERAGE',
      '-',
      data.averages.calories,
      data.averages.protein,
      data.averages.carbs,
      data.averages.fat,
      data.averages.fiber,
      data.averages.sugar,
      data.averages.sodium,
      data.averages.water,
      '-'
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(lines.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `MacroLens_Report_${Utils.todayStr()}_${days}D.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Utils.showToast(`📊 CSV report downloaded (${data.range})`, 'success');
  },

  exportPDF(days = 7) {
    const data = this.getReportData(days);
    
    // Create printable window/overlay
    const printContainer = document.createElement('div');
    printContainer.id = 'macrolens-print-report';
    printContainer.innerHTML = `
      <style>
        @media screen {
          #macrolens-print-report { display: none; }
        }
        @media print {
          body > *:not(#macrolens-print-report) { display: none !important; }
          #macrolens-print-report {
            display: block !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            padding: 24px;
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff !important;
          }
          .p-header { border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .p-logo { font-size: 24px; font-weight: 800; color: #4f46e5; }
          .p-meta { font-size: 12px; color: #6b7280; text-align: right; }
          .p-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .p-card { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
          .p-card-val { font-size: 18px; font-weight: 700; color: #1f2937; margin-top: 4px; }
          .p-card-lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #6b7280; }
          .p-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          .p-table th { background: #eef2ff; color: #4338ca; padding: 8px 6px; text-align: right; border: 1px solid #e0e7ff; font-weight: 600; }
          .p-table th:first-child, .p-table th:nth-child(2) { text-align: left; }
          .p-table td { padding: 6px; text-align: right; border: 1px solid #e5e7eb; }
          .p-table td:first-child, .p-table td:nth-child(2) { text-align: left; font-weight: 500; }
          .p-table tr.p-avg-row { background: #faf5ff; font-weight: 700; }
          .p-footer { border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 11px; color: #9ca3af; text-align: center; }
        }
      </style>
      <div class="p-header">
        <div>
          <div class="p-logo">MacroLens</div>
          <div style="font-size: 14px; font-weight: 600; color: #374151; margin-top: 2px;">Nutrition & Hydration Progress Report</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">User: <strong>${data.user.name}</strong> (${data.user.email || 'Client'})</div>
        </div>
        <div class="p-meta">
          <div><strong>Period:</strong> ${data.range}</div>
          <div><strong>Targets:</strong> ${data.targets.tdee} kcal · P:${data.targets.protein}g · C:${data.targets.carbs}g · F:${data.targets.fat}g</div>
          <div><strong>Hydration Target:</strong> ${data.targets.water} ml · <strong>Fiber:</strong> ${data.targets.fiber}g</div>
          <div><strong>Generated:</strong> ${data.generatedAt}</div>
        </div>
      </div>

      <div class="p-cards">
        <div class="p-card">
          <div class="p-card-lbl">Avg Daily Calories</div>
          <div class="p-card-val" style="color: #4f46e5;">${data.averages.calories} <span style="font-size:12px;font-weight:400;">kcal</span></div>
        </div>
        <div class="p-card">
          <div class="p-card-lbl">Avg Daily Protein</div>
          <div class="p-card-val" style="color: #dc2626;">${data.averages.protein}g</div>
        </div>
        <div class="p-card">
          <div class="p-card-lbl">Avg Daily Water</div>
          <div class="p-card-val" style="color: #0284c7;">${data.averages.water} <span style="font-size:12px;font-weight:400;">ml</span></div>
        </div>
        <div class="p-card">
          <div class="p-card-lbl">Total Meals Logged</div>
          <div class="p-card-val" style="color: #059669;">${data.totalMealsLogged}</div>
        </div>
      </div>

      <table class="p-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Day</th>
            <th>Calories</th>
            <th>Protein</th>
            <th>Carbs</th>
            <th>Fat</th>
            <th>Fiber</th>
            <th>Sugar</th>
            <th>Sodium</th>
            <th>Water</th>
            <th>Meals</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows.map(r => `
            <tr>
              <td>${r.date}</td>
              <td>${r.day}</td>
              <td>${r.calories}</td>
              <td>${r.protein}g</td>
              <td>${r.carbs}g</td>
              <td>${r.fat}g</td>
              <td>${r.fiber}g</td>
              <td>${r.sugar}g</td>
              <td>${r.sodium}mg</td>
              <td>${r.water}ml</td>
              <td>${r.meals}</td>
            </tr>
          `).join('')}
          <tr class="p-avg-row">
            <td colspan="2">DAILY AVERAGE</td>
            <td>${data.averages.calories}</td>
            <td>${data.averages.protein}g</td>
            <td>${data.averages.carbs}g</td>
            <td>${data.averages.fat}g</td>
            <td>${data.averages.fiber}g</td>
            <td>${data.averages.sugar}g</td>
            <td>${data.averages.sodium}mg</td>
            <td>${data.averages.water}ml</td>
            <td>-</td>
          </tr>
        </tbody>
      </table>

      <div class="p-footer">
        Generated by MacroLens AI Calorie & Nutrition Tracker • Verified Health Summary
      </div>
    `;

    document.body.appendChild(printContainer);
    window.print();
    setTimeout(() => {
      if (document.getElementById('macrolens-print-report')) {
        document.body.removeChild(printContainer);
      }
    }, 1500);

    Utils.showToast('📄 Print dialog opened for PDF export', 'success');
  }
};
