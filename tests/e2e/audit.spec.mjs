import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'https://caltrack-amber.vercel.app';

test.describe('MacroLens Live Audit (E2E, Security & Axe Accessibility)', () => {
  test('security headers, CSP, and broken-access-control checks', async ({ page, request }) => {
    const homeRes = await request.get(BASE_URL);
    expect(homeRes.status()).toBe(200);
    const headers = homeRes.headers();
    expect(headers['content-security-policy']).toBeTruthy();
    expect(headers['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/i);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');

    // S1: Spoofed bearer ID must fail with 401
    const spoofRes = await request.get(`${BASE_URL}/api/data/sync`, {
      headers: { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' }
    });
    expect(spoofRes.status()).toBe(401);

    // S3: Unauthenticated Gemini call must fail with 401
    const geminiUnauth = await request.post(`${BASE_URL}/api/gemini`, {
      data: { contents: [{ parts: [{ text: '1 apple' }] }] }
    });
    expect(geminiUnauth.status()).toBe(401);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const landingAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(landingAxe.violations.filter(v => ['critical', 'serious'].includes(v.impact))).toEqual([]);
  });

  test('signup with space in name, HttpOnly session cookie, lbs onboarding, XSS safety, date isolation & multi-browser flow', async ({ page, browserName }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Jump straight to Auth slide (slide 9)
    await page.evaluate(() => window.Landing.setSlide(9));
    await page.click('#show-signup');

    const uniqueEmail = `pw_${browserName}_${Date.now()}@example.com`;
    const nameInput = page.locator('#signup-name');
    await nameInput.click();
    await nameInput.type('Audit User Name');
    // Verify space was NOT blocked by Landing spacebar listener
    await expect(nameInput).toHaveValue('Audit User Name');

    await page.fill('#signup-email', uniqueEmail);
    await page.fill('#signup-password', 'StrongPass123!');
    await page.click('#signup-submit-btn');

    await expect(page.locator('#onboarding-screen')).toHaveClass(/active/, { timeout: 15000 });

    // Verify HttpOnly cookie is invisible to JS
    const jsCookie = await page.evaluate(() => document.cookie);
    expect(jsCookie).not.toContain('caltrack_session');

    // Step 1 -> Step 2 (Metrics with imperial units: 165 lbs, 5ft 10in)
    await page.fill('#ob-age', '26');
    await page.click('#ob-next-btn');

    await page.selectOption('#ob-weight-unit', 'lbs');
    await page.fill('#ob-weight', '165');
    await page.selectOption('#ob-height-unit', 'ft');
    await page.fill('#ob-height', '5');
    await page.fill('#ob-height-inches', '10');
    await page.click('#ob-next-btn');

    // Step 3 -> Step 4 -> Step 5
    await page.click('#ob-next-btn');
    await page.click('#ob-next-btn');
    await expect(page.locator('.onboarding-step[data-step="5"]')).toHaveClass(/active/);

    await page.click('#ob-finish-btn');
    await expect(page.locator('#app-shell')).toHaveClass(/active/, { timeout: 10000 });

    // Check realistic TDEE (165 lbs ~= 74.8 kg -> ~2400-2700 kcal, NOT lbs-as-kg > 3500 kcal)
    const targetText = await page.locator('#calories-target').textContent();
    const targetNum = parseInt((targetText || '0').replace(/,/g, ''), 10);
    expect(targetNum).toBeGreaterThan(2000);
    expect(targetNum).toBeLessThan(3100);

    // Accessibility check on authenticated Dashboard
    const dashAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(dashAxe.violations.filter(v => ['critical', 'serious'].includes(v.impact))).toEqual([]);

    // Verify browsing past Diary day does NOT cause Dashboard FAB meal to save to wrong day
    await page.click('#nav-diary');
    await page.click('#diary-prev-btn');
    await page.click('#nav-dashboard');
    await page.click('#quick-add-btn');
    await page.click('#meal-log-tabs .tab-btn[data-tab="manual"]');

    const xssFoodName = '<img src=x onerror=window.__xssFired=true> Roast Beef';
    await page.fill('#manual-food-name', xssFoodName);
    await page.fill('#manual-calories', '420');
    await page.fill('#manual-protein', '35');
    await page.fill('#manual-carbs', '2');
    await page.fill('#manual-fat', '28');
    await page.fill('#manual-fiber', '1');
    await page.fill('#manual-sugar', '1');
    await page.fill('#manual-sodium', '450');
    await page.click('#manual-add-btn');

    // Verify today's dashboard calories updated (NOT saved to yesterday!)
    await expect(page.locator('#calories-consumed')).toHaveText('420');
    const xssFired = await page.evaluate(() => Boolean(window.__xssFired));
    expect(xssFired).toBe(false);

    // Check Diary yesterday still has 0 kcal, and today has 420 kcal with literal escaped name
    await page.click('#nav-diary');
    await expect(page.locator('#diary-total-calories')).toHaveText('0');
    await page.click('#diary-next-btn');
    await expect(page.locator('#diary-total-calories')).toHaveText('420');
    await expect(page.locator('#diary-breakfast .meal-item-name')).toHaveText(xssFoodName);

    // Reload page -> verify cookie session keeps user logged in and meals persisted
    await page.waitForTimeout(2000); // allow debounced sync to complete
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#app-shell')).toHaveClass(/active/, { timeout: 15000 });

    // Clean up test user's synced data & sign out
    await page.evaluate(async () => {
      await fetch('/api/data/reset', { method: 'POST', credentials: 'same-origin' });
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    });

    // Zero severe console errors
    expect(consoleErrors.filter(e => !e.includes('favicon'))).toEqual([]);
  });
});
