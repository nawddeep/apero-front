/* admin/admin.js — shared helpers for the APERO admin portal (vanilla JS) */
'use strict';

(function () {
  const TOKEN_KEY = 'apero_admin_token';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage unavailable */ }
  }

  function logout() {
    setToken('');
    window.location.href = 'login.html';
  }

  async function apiFetch(path, options) {
    const opts = options || {};
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs || 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      const token = getToken();
      if (token && !headers.Authorization) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = { success: false, error: 'Invalid server response' };
      }
      if (res.status === 401) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
      if (!res.ok) {
        const msg = (data && (data.error || (data.details && data.details.join('; ')))) || ('Request failed (' + res.status + ')');
        throw new Error(msg);
      }
      return data;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Request timed out. Please retry.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function requireAuth() {
    if (!getToken()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  function showAlert(el, type, msg) {
    if (!el) return;
    el.className = 'alert ' + type;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideAlert(el) {
    if (!el) return;
    el.style.display = 'none';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  window.AperoAdmin = { getToken, setToken, logout, apiFetch, requireAuth, showAlert, hideAlert, esc };
})();
