import { describe, it, expect, beforeEach } from 'vitest';
import createDOMPurify from 'dompurify';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('XSS Defense & DOMPurify Sanitization', () => {
  beforeEach(() => {
    window.DOMPurify = createDOMPurify(window);
    window.Nutrition = require('../../js/nutrition.js');
    require('../../js/utils.js');
  });

  it('prevents execution of malicious HTML/scripts in AI coach formatted output', () => {
    const dirty = '**Protein**<script>window.xss=1</script><img src=x onerror=alert(2)>';
    const escaped = window.Utils.escapeHtml(dirty)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    const clean = window.Utils.sanitizeHtml(escaped, ['strong', 'em', 'br']);

    const div = document.createElement('div');
    div.innerHTML = clean;

    expect(div.querySelector('strong')?.textContent).toBe('Protein');
    expect(div.querySelector('script')).toBeNull();
    expect(div.querySelector('img')).toBeNull();

    const directRaw = window.Utils.sanitizeHtml('<strong onclick="alert(1)">Ok</strong><img src=x onerror=alert(2)><script>alert(3)</script>', ['strong', 'em', 'br']);
    expect(directRaw).toBe('<strong>Ok</strong>');
  });

  it('rejects javascript: and data:text/html URLs for product/food images', () => {
    expect(window.Utils.isValidImageUrl('javascript:alert(1)')).toBe(false);
    expect(window.Utils.isValidImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(window.Utils.isValidImageUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(window.Utils.isValidImageUrl('https://images.openfoodfacts.org/product.jpg')).toBe(true);
    expect(window.Utils.isValidImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
  });

  it('renders toast messages as textContent rather than interpreting HTML tags', () => {
    document.body.innerHTML = '<div id="toast-container"></div>';
    window.Utils.showToast('<img src=x onerror=window.xss=1>', 'warning', 100);
    const span = document.querySelector('#toast-container span');
    expect(span.textContent).toBe('<img src=x onerror=window.xss=1>');
    expect(document.querySelector('#toast-container img')).toBeNull();
  });
});
