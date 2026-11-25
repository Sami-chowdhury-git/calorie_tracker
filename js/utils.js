window.Utils = {
  uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  },

  formatDiaryDate(dateStr) {
    if (this.isToday(dateStr)) return `Today — ${this._shortDate(dateStr)}`;
    if (this.isYesterday(dateStr)) return `Yesterday — ${this._shortDate(dateStr)}`;
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} — ${this._shortDate(dateStr)}`;
  },

  _shortDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  formatShortDate(dateStr) {
    if (this.isToday(dateStr)) return 'Today';
    if (this.isYesterday(dateStr)) return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  },

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  sanitizeHtml(html, allowedTags = ['strong', 'em', 'br']) {
    if (typeof window !== 'undefined' && window.DOMPurify) {
      return window.DOMPurify.sanitize(String(html ?? ''), {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: []
      });
    }
    return this.escapeHtml(html);
  },

  isValidImageUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return false;
    const trimmed = url.trim();
    if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return true;
    }
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  },

  async compressImage(file, maxDim = 1024, quality = 0.8) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    if (typeof document === 'undefined' || !file?.type?.startsWith('image/')) {
      const parts = String(dataUrl).split(',');
      return {
        dataUrl,
        base64: parts[1] || '',
        mimeType: file?.type || 'image/jpeg'
      };
    }

    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = dataUrl;
      });

      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = compressedDataUrl.split(',')[1] || '';
      return {
        dataUrl: compressedDataUrl,
        base64,
        mimeType: 'image/jpeg'
      };
    } catch {
      const parts = String(dataUrl).split(',');
      return {
        dataUrl,
        base64: parts[1] || '',
        mimeType: file?.type || 'image/jpeg'
      };
    }
  },

  async createThumbnailDataUrl(file, maxDim = 320, quality = 0.6) {
    const res = await this.compressImage(file, maxDim, quality);
    // Keep stored thumbnails small so localStorage quota is never exceeded
    if (res.dataUrl && res.dataUrl.length <= 65000) {
      return res.dataUrl;
    }
    const smaller = await this.compressImage(file, 220, 0.45);
    return smaller.dataUrl && smaller.dataUrl.length <= 65000 ? smaller.dataUrl : null;
  },

  animateNumber(el, target, duration = 800, suffix = '') {
    if (!el) return;
    const start = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    const startTime = performance.now();
    const diff = target - start;
    const step = (ts) => {
      const p = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = this.formatNum(Math.round(start + diff * ease)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  ringOffset(radius, progress) {
    const circ = 2 * Math.PI * radius;
    return circ - circ * Math.min(Math.max(progress, 0), 1);
  },

  ringCircumference(radius) {
    return 2 * Math.PI * radius;
  },

  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: 'check-circle', warning: 'alert-triangle', error: 'x-circle', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const content = document.createElement('div');
    content.className = 'toast-content';

    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', icons[type] || 'info');

    const span = document.createElement('span');
    span.textContent = String(message ?? '');

    content.appendChild(icon);
    content.appendChild(span);
    toast.appendChild(content);
    container.appendChild(toast);

    if (typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  },

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },

  formatNum(n) {
    return Math.round(Number(n) || 0).toLocaleString('en-US');
  },

  addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  getDayName(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  },

  isToday(dateStr) { return dateStr === this.todayStr(); },

  isYesterday(dateStr) { return dateStr === this.addDays(this.todayStr(), -1); },

  calculateNutritionTargets(profile) {
    if (window.Nutrition) {
      return window.Nutrition.calculateNutritionTargets(profile);
    }
    return {
      tdee: 2000, protein: 150, carbs: 220, fat: 73,
      water: 2500, fiber: 28, sugar: 50, sodium: 2300
    };
  }
};
