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
        let curr = logged[0];
        while (curr <= today) {
          dates.push(curr);
          curr = Utils.addDays(curr, 1);
        }
      }
    } else {
      const numDays = parseInt(days, 10) || 7;
      for (let i = numDays - 1; i >= 0; i--) {
        dates.push(Utils.addDays(today, -i));
      }
    }

    const rows = dates.map(dateStr => {
      const totals = Store.getDayTotals(dateStr);
      const water = Store.getWaterLog(dateStr);
      const diary = Store.getDiary(dateStr);
      const d = new Date(dateStr + 'T12:00:00');
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
      'Date', 'Day', 'Calories (kcal)', 'Protein (g)', 'Carbs (g)',
      'Fat (g)', 'Fiber (g)', 'Sugar (g)', 'Sodium (mg)', 'Water (ml)', 'Meals Count'
    ];

    const lines = [
      '"MacroLens Nutrition Summary Report"',
      `"User: ${data.user.name.replace(/"/g, '""')}"`,
      `"Generated: ${data.generatedAt}"`,
      `"Period: ${data.range}"`,
      `"Personalized Daily Targets: Calories: ${data.targets.tdee} kcal | Protein: ${data.targets.protein}g | Carbs: ${data.targets.carbs}g | Fat: ${data.targets.fat}g | Fiber: ${data.targets.fiber}g | Sugar: <${data.targets.sugar}g | Sodium: <${data.targets.sodium}mg | Water: ${data.targets.water}ml"`,
      '',
      headers.join(',')
    ];

    data.rows.forEach(r => {
      lines.push([
        r.date, r.day, r.calories, r.protein, r.carbs,
        r.fat, r.fiber, r.sugar, r.sodium, r.water, r.meals
      ].join(','));
    });

    lines.push('');
    lines.push([
      'AVERAGE', '-', data.averages.calories, data.averages.protein,
      data.averages.carbs, data.averages.fat, data.averages.fiber,
      data.averages.sugar, data.averages.sodium, data.averages.water, '-'
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(lines.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `MacroLens_Report_${Utils.todayStr()}_${days}D.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Utils.showToast(`CSV report downloaded (${data.range})`, 'success');
  },

  async exportPDF(days = 7) {
    const data = this.getReportData(days);

    let jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;

    if (!jsPDFClass) {
      try {
        await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      } catch (e) {
        console.warn('Could not load jsPDF from CDN, using fallback', e);
      }
    }

    if (!jsPDFClass) {
      this._exportPDFFallback(data);
      return;
    }

    try {
      const doc = new jsPDFClass({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFillColor(217, 84, 30);
      doc.rect(0, 0, pageWidth, 6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(17, 17, 17);
      doc.text('MacroLens', 40, 40);

      doc.setFontSize(13);
      doc.setTextColor(47, 45, 42);
      doc.text('Nutrition & Hydration Progress Report', 40, 58);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(82, 78, 70);
      doc.text(`Period: ${data.range}`, pageWidth - 40, 36, { align: 'right' });
      doc.text(`Generated: ${data.generatedAt}`, pageWidth - 40, 50, { align: 'right' });
      doc.text(`User: ${data.user.name}`, pageWidth - 40, 64, { align: 'right' });

      doc.setFillColor(243, 238, 227);
      doc.roundedRect(40, 78, pageWidth - 80, 48, 4, 4, 'F');
      doc.setDrawColor(17, 17, 17);
      doc.roundedRect(40, 78, pageWidth - 80, 48, 4, 4, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(168, 58, 14);
      doc.text('PERSONALIZED DAILY TARGETS', 52, 94);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(17, 17, 17);
      doc.text(`Calories: ${data.targets.tdee} kcal   |   Protein: ${data.targets.protein}g   |   Carbs: ${data.targets.carbs}g   |   Fat: ${data.targets.fat}g`, 52, 108);
      doc.text(`Hydration Goal: ${data.targets.water} ml   |   Fiber: ${data.targets.fiber}g   |   Sugar Limit: <${data.targets.sugar}g   |   Sodium Limit: <${data.targets.sodium}mg`, 52, 120);

      const cardWidth = (pageWidth - 80 - 36) / 4;
      const cardY = 134;
      const cardH = 44;

      const metrics = [
        { label: 'AVG CALORIES', value: `${data.averages.calories} kcal`, color: [217, 84, 30] },
        { label: 'AVG PROTEIN', value: `${data.averages.protein}g`, color: [17, 17, 17] },
        { label: 'AVG WATER', value: `${data.averages.water} ml`, color: [17, 17, 17] },
        { label: 'TOTAL MEALS', value: `${data.totalMealsLogged}`, color: [31, 81, 50] }
      ];

      metrics.forEach((m, idx) => {
        const x = 40 + idx * (cardWidth + 12);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, cardY, cardWidth, cardH, 4, 4, 'F');
        doc.setDrawColor(17, 17, 17);
        doc.roundedRect(x, cardY, cardWidth, cardH, 4, 4, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(82, 78, 70);
        doc.text(m.label, x + cardWidth / 2, cardY + 14, { align: 'center' });

        doc.setFontSize(11);
        doc.setTextColor(m.color[0], m.color[1], m.color[2]);
        doc.text(m.value, x + cardWidth / 2, cardY + 32, { align: 'center' });
      });

      const tableHeaders = [
        ['Date', 'Day', 'Calories', 'Protein', 'Carbs', 'Fat', 'Fiber', 'Sugar', 'Sodium', 'Water', 'Meals']
      ];

      const tableRows = data.rows.map(r => [
        r.date, r.day, `${r.calories}`, `${r.protein}g`, `${r.carbs}g`,
        `${r.fat}g`, `${r.fiber}g`, `${r.sugar}g`, `${r.sodium}mg`, `${r.water}ml`, r.meals
      ]);

      tableRows.push([
        'DAILY AVG', '-', `${data.averages.calories}`, `${data.averages.protein}g`,
        `${data.averages.carbs}g`, `${data.averages.fat}g`, `${data.averages.fiber}g`,
        `${data.averages.sugar}g`, `${data.averages.sodium}mg`, `${data.averages.water}ml`, '-'
      ]);

      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: 188,
          margin: { left: 40, right: 40 },
          head: tableHeaders,
          body: tableRows,
          theme: 'striped',
          headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
          bodyStyles: { fontSize: 7, textColor: [17, 17, 17], halign: 'center' },
          alternateRowStyles: { fillColor: [243, 238, 227] },
          columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'left' } },
          didParseCell: function(cellData) {
            if (cellData.row.index === tableRows.length - 1) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fillColor = [234, 227, 210];
              cellData.cell.styles.textColor = [17, 17, 17];
            }
          },
          didDrawPage: function(pageData) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(82, 78, 70);
            doc.text('MacroLens Nutrition & Hydration Progress Report', 40, pageHeight - 16);
            doc.text(`Page ${pageData.pageNumber}`, pageWidth - 40, pageHeight - 16, { align: 'right' });
          }
        });
      }

      const fileName = `MacroLens_Report_${Utils.todayStr()}_${days}D.pdf`;
      doc.save(fileName);
      Utils.showToast(`PDF downloaded (${fileName})`, 'success', 3500);
    } catch (err) {
      console.error('PDF generation error:', err);
      this._exportPDFFallback(data);
    }
  },

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  _exportPDFFallback(data) {
    const printContainer = document.createElement('div');
    printContainer.id = 'macrolens-print-report';

    const header = document.createElement('div');
    header.style.cssText = 'border-bottom: 2px solid #D9541E; padding-bottom: 12px; margin-bottom: 16px;';
    const title = document.createElement('h1');
    title.style.cssText = 'color:#111111; margin:0;';
    title.textContent = 'MacroLens';
    const sub = document.createElement('p');
    sub.style.cssText = 'margin:4px 0; color:#524E46;';
    sub.textContent = 'Nutrition & Hydration Progress Report';
    const meta = document.createElement('p');
    meta.style.cssText = 'margin:4px 0; font-size:12px;';
    meta.textContent = `User: ${data.user.name} | Period: ${data.range} | Generated: ${data.generatedAt}`;

    header.appendChild(title);
    header.appendChild(sub);
    header.appendChild(meta);
    printContainer.appendChild(header);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:12px;';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.style.cssText = 'background:#111111; color:#FFFFFF;';
    ['Date', 'Day', 'Calories', 'Protein', 'Carbs', 'Fat', 'Fiber', 'Sugar', 'Sodium', 'Water', 'Meals'].forEach(col => {
      const th = document.createElement('th');
      th.style.cssText = 'padding:6px; border:1px solid #111111;';
      th.textContent = col;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.rows.forEach(r => {
      const tr = document.createElement('tr');
      const cells = [r.date, r.day, String(r.calories), `${r.protein}g`, `${r.carbs}g`, `${r.fat}g`, `${r.fiber}g`, `${r.sugar}g`, `${r.sodium}mg`, `${r.water}ml`, String(r.meals)];
      cells.forEach((val, idx) => {
        const td = document.createElement('td');
        td.style.cssText = idx >= 2 ? 'padding:6px; border:1px solid #111111; text-align:right;' : 'padding:6px; border:1px solid #111111;';
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    printContainer.appendChild(table);

    document.body.appendChild(printContainer);
    window.print();
    setTimeout(() => {
      if (document.getElementById('macrolens-print-report')) {
        document.body.removeChild(printContainer);
      }
    }, 1500);
  }
};
