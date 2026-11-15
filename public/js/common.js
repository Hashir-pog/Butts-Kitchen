// Shared helpers for every page.
const BK = (() => {
  const PHONE = '0345 8081990';
  const PHONE_TEL = '+923458081990';

  const money = n => 'Rs. ' + Math.round(n).toLocaleString('en-US');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
  };

  async function api(url, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(url, {
        method, credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      const err = new Error('You seem to be offline. Check your connection and try again.');
      err.offline = true; throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status; err.fields = data.fields; throw err;
    }
    return data;
  }

  function toast(message, { action, onAction, error = false, duration = 5000 } = {}) {
    let host = $('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.append(host); }
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' error' : '');
    el.innerHTML = `<span>${esc(message)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action;
      b.addEventListener('click', () => { onAction?.(); el.remove(); });
      el.append(b);
    }
    host.append(el);
    setTimeout(() => el.remove(), duration);
    return el;
  }

  function ago(ms, now = Date.now()) {
    const m = Math.floor((now - ms) / 60e3);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ${m % 60} min ago`;
    return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const time = ms => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateTime = ms => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  const STATUS_LABEL = {
    new: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
  };
  function statusLabel(status, type) {
    if (status === 'ready') return type === 'delivery' ? 'Out for delivery' : 'Ready for pickup';
    if (status === 'completed') return type === 'delivery' ? 'Delivered' : 'Picked up';
    return STATUS_LABEL[status] || status;
  }

  // Theme: follows the device unless the person picks one.
  function initTheme(button) {
    const saved = store.get('bk-theme', null);
    if (saved) document.documentElement.dataset.theme = saved;
    if (!button) return;
    const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    const sync = () => { button.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode'); button.innerHTML = isDark() ? ICONS.sun : ICONS.moon; };
    sync();
    button.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next; store.set('bk-theme', next); sync();
    });
  }

  const ICONS = {
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };

  return { PHONE, PHONE_TEL, money, esc, $, $$, store, api, toast, ago, time, dateTime, statusLabel, initTheme, ICONS };
})();
