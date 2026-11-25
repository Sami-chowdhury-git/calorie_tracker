import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('Regression Tests for Repaired Correctness Defects', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    window.Nutrition = require('../../js/nutrition.js');
    window.SyncMerge = require('../../js/sync-merge.js');
    require('../../js/utils.js');
    require('../../js/storage.js');
  });

  it('allows typing spaces inside landing auth name field', () => {
    document.body.innerHTML = `
      <section id="auth-screen" class="screen active">
        <div class="landing-slide active" data-slide="9">
          <input id="signup-name" type="text" />
        </div>
      </section>
    `;
    require('../../js/landing.js');
    window.Landing.init();

    const nameInput = document.getElementById('signup-name');
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    nameInput.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('migrates legacy day-level diary keys into conflict-tolerant per-item records', () => {
    const user = { id: 'u-1', name: 'Test User', email: 'test@example.com' };
    window.Store.setSession(user);

    const today = window.Utils.todayStr();
    localStorage.setItem(
      `caltrack_diary_u-1_${today}`,
      JSON.stringify({
        breakfast: [{ id: 'legacy-1', name: 'Oatmeal', calories: 250, protein: 8, carbs: 45, fat: 4, fiber: 6, sugar: 1, sodium: 5 }],
        lunch: [], dinner: [], snacks: []
      })
    );

    const diary = window.Store.getDiary(today);
    expect(diary.breakfast).toHaveLength(1);
    expect(diary.breakfast[0].name).toBe('Oatmeal');
    expect(localStorage.getItem(`caltrack_diary_u-1_${today}`)).toBeNull();
  });

  it('saves meal items with distinct IDs and supports tombstone deletion without affecting other meals', () => {
    const user = { id: 'u-2', name: 'Two', email: 'two@example.com' };
    window.Store.setSession(user);
    const today = window.Utils.todayStr();

    const a = window.Store.addDiaryItem(today, 'breakfast', { name: 'Eggs', calories: 150, protein: 12, carbs: 1, fat: 10, fiber: 0, sugar: 0, sodium: 120 });
    const b = window.Store.addDiaryItem(today, 'breakfast', { name: 'Toast', calories: 80, protein: 3, carbs: 15, fat: 1, fiber: 2, sugar: 1, sodium: 130 });

    expect(window.Store.getDayTotals(today).calories).toBe(230);
    window.Store.deleteDiaryItem(today, 'breakfast', a.id);

    const after = window.Store.getDiary(today);
    expect(after.breakfast).toHaveLength(1);
    expect(after.breakfast[0].id).toBe(b.id);
    expect(window.Store.getDayTotals(today).calories).toBe(80);
  });

  it('tracks individual water entries per ID and supports day reset tombstones', () => {
    const user = { id: 'u-3', name: 'Three', email: 'three@example.com' };
    window.Store.setSession(user);
    const today = window.Utils.todayStr();

    window.Store.addWater(today, 250);
    window.Store.addWater(today, 500);
    expect(window.Store.getWaterLog(today).total).toBe(750);

    window.Store.resetWaterForDate(today);
    expect(window.Store.getWaterLog(today).total).toBe(0);
  });
});
