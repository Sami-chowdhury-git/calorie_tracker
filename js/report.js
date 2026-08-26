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

  async exportPDF(days = 7) {
    const data = this.getReportData(days);

    // Resolve jsPDF constructor
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
      this._exportPDFFallback(data, days);
      return;
    }

    try {
      const doc = new jsPDFClass({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top brand accent bar
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // Title & Logo Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(79, 70, 229);
      doc.text('MacroLens', 40, 40);

      doc.setFontSize(13);
      doc.setTextColor(31, 41, 55);
      doc.text('Nutrition & Hydration Progress Report', 40, 58);

      // Meta info (right aligned)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(107, 114, 128);
      doc.text(`Period: ${data.range}`, pageWidth - 40, 36, { align: 'right' });
      doc.text(`Generated: ${data.generatedAt}`, pageWidth - 40, 50, { align: 'right' });
      doc.text(`User: ${data.user.name}`, pageWidth - 40, 64, { align: 'right' });

      // Personalized Targets Card / Banner
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(40, 78, pageWidth - 80, 48, 6, 6, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(40, 78, pageWidth - 80, 48, 6, 6, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(79, 70, 229);
      doc.text('PERSONALIZED DAILY TARGETS', 52, 94);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(55, 65, 81);
      doc.text(`Calories: ${data.targets.tdee} kcal   |   Protein: ${data.targets.protein}g   |   Carbs: ${data.targets.carbs}g   |   Fat: ${data.targets.fat}g`, 52, 108);
      doc.text(`Hydration Goal: ${data.targets.water} ml   |   Fiber: ${data.targets.fiber}g   |   Sugar Limit: <${data.targets.sugar}g   |   Sodium Limit: <${data.targets.sodium}mg`, 52, 120);

      // 4 Metric Summary Cards
      const cardWidth = (pageWidth - 80 - 36) / 4;
      const cardY = 134;
      const cardH = 44;

      const metrics = [
        { label: 'AVG CALORIES', value: `${data.averages.calories} kcal`, color: [79, 70, 229] },
        { label: 'AVG PROTEIN', value: `${data.averages.protein}g`, color: [220, 38, 38] },
        { label: 'AVG WATER', value: `${data.averages.water} ml`, color: [2, 132, 199] },
        { label: 'TOTAL MEALS', value: `${data.totalMealsLogged}`, color: [5, 150, 105] }
      ];

      metrics.forEach((m, idx) => {
        const x = 40 + idx * (cardWidth + 12);
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(x, cardY, cardWidth, cardH, 4, 4, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.roundedRect(x, cardY, cardWidth, cardH, 4, 4, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(107, 114, 128);
        doc.text(m.label, x + cardWidth / 2, cardY + 14, { align: 'center' });

        doc.setFontSize(11);
        doc.setTextColor(m.color[0], m.color[1], m.color[2]);
        doc.text(m.value, x + cardWidth / 2, cardY + 32, { align: 'center' });
      });

      // Daily Breakdown Table
      const tableHeaders = [
        ['Date', 'Day', 'Calories', 'Protein', 'Carbs', 'Fat', 'Fiber', 'Sugar', 'Sodium', 'Water', 'Meals']
      ];

      const tableRows = data.rows.map(r => [
        r.date,
        r.day,
        `${r.calories}`,
        `${r.protein}g`,
        `${r.carbs}g`,
        `${r.fat}g`,
        `${r.fiber}g`,
        `${r.sugar}g`,
        `${r.sodium}mg`,
        `${r.water}ml`,
        r.meals
      ]);

      // Average footer row
      tableRows.push([
        'DAILY AVG',
        '-',
        `${data.averages.calories}`,
        `${data.averages.protein}g`,
        `${data.averages.carbs}g`,
        `${data.averages.fat}g`,
        `${data.averages.fiber}g`,
        `${data.averages.sugar}g`,
        `${data.averages.sodium}mg`,
        `${data.averages.water}ml`,
        '-'
      ]);

      if (typeof doc.autoTable === 'function') {
        doc.autoTable({
          startY: 188,
          margin: { left: 40, right: 40 },
          head: tableHeaders,
          body: tableRows,
          theme: 'striped',
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 7.5,
            halign: 'center'
          },
          bodyStyles: {
            fontSize: 7,
            textColor: [31, 41, 55],
            halign: 'center'
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251]
          },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold' },
            1: { halign: 'left' }
          },
          didParseCell: function(cellData) {
            if (cellData.row.index === tableRows.length - 1) {
              cellData.cell.styles.fontStyle = 'bold';
              cellData.cell.styles.fillColor = [238, 242, 255];
              cellData.cell.styles.textColor = [67, 56, 202];
            }
          },
          didDrawPage: function(pageData) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(156, 163, 175);
            doc.text('Generated by MacroLens AI Nutrition Tracker • Clinical Progress Report', 40, pageHeight - 16);
            doc.text(`Page ${pageData.pageNumber}`, pageWidth - 40, pageHeight - 16, { align: 'right' });
          }
        });
      }

      // Automatic download
      const fileName = `MacroLens_Report_${Utils.todayStr()}_${days}D.pdf`;
      doc.save(fileName);

      Utils.showToast(`📄 PDF downloaded automatically (${fileName})`, 'success', 3500);
    } catch (err) {
      console.error('PDF generation error:', err);
      this._exportPDFFallback(data, days);
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

  _exportPDFFallback(data, days) {
    // Printable / Blob download fallback
    const printContainer = document.createElement('div');
    printContainer.id = 'macrolens-print-report';
    printContainer.innerHTML = `
      <style>
        @media screen { #macrolens-print-report { display: none; } }
        @media print {
          body > *:not(#macrolens-print-report) { display: none !important; }
          #macrolens-print-report {
            display: block !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #111827; padding: 24px; max-width: 900px; margin: 0 auto; background: #fff !important;
          }
        }
      </style>
      <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">
        <h1 style="color:#4f46e5; margin:0;">MacroLens</h1>
        <p style="margin:4px 0; color:#6b7280;">Nutrition & Hydration Progress Report</p>
        <p style="margin:4px 0; font-size:12px;"><strong>User:</strong> ${data.user.name} | <strong>Period:</strong> ${data.range} | <strong>Generated:</strong> ${data.generatedAt}</p>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:#eef2ff; color:#4338ca;">
            <th style="padding:6px; border:1px solid #e0e7ff;">Date</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Day</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Calories</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Protein</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Carbs</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Fat</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Fiber</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Sugar</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Sodium</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Water</th>
            <th style="padding:6px; border:1px solid #e0e7ff;">Meals</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows.map(r => `
            <tr>
              <td style="padding:6px; border:1px solid #e5e7eb;">${r.date}</td>
              <td style="padding:6px; border:1px solid #e5e7eb;">${r.day}</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.calories}</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.protein}g</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.carbs}g</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.fat}g</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.fiber}g</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.sugar}g</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.sodium}mg</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.water}ml</td>
              <td style="padding:6px; border:1px solid #e5e7eb; text-align:right;">${r.meals}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    document.body.appendChild(printContainer);
    window.print();
    setTimeout(() => {
      if (document.getElementById('macrolens-print-report')) {
        document.body.removeChild(printContainer);
      }
    }, 1500);
  }
};
