/* admin/admin.js — shared helpers for the APERO admin portal (vanilla JS)
 *
 * Navigation + auth references:
 *   Dashboard, Events, Orders, Tickets, Check-in, Payments, Refunds, Customers
 *
 * Admin sessions are Supabase email/password sessions. A user is only allowed
 * into the admin portal if their auth.users id exists in the `admin_users`
 * table (enforced again by RLS + the backend's requireAdmin).
 *
 * The Backend Services API (refunds, CSV export) is reached at
 * `window.APERO_API_BASE` (no trailing slash) when set, otherwise a relative
 * `/api` path. In development, serve both the customer frontend and this
 * admin folder from the same Express app, or set APERO_API_BASE to the API
 * origin, e.g. `window.APERO_API_BASE = "http://localhost:5000"`.
 */
'use strict';

(function () {
  const NAV_LINKS = [
    { href: 'dashboard.html', label: 'Dashboard' },
    { href: 'events.html', label: 'Events' },
    { href: 'orders.html', label: 'Orders' },
    { href: 'tickets.html', label: 'Tickets' },
    { href: 'checkin.html', label: 'Check-in' },
    { href: 'payments.html', label: 'Payments' },
    { href: 'refunds.html', label: 'Refunds' },
    { href: 'customers.html', label: 'Customers' }
  ];

  function apiBase() {
    if (typeof window.APERO_API_BASE === 'string' && window.APERO_API_BASE) {
      return window.APERO_API_BASE.replace(/\/$/, '');
    }
    if (window.location.protocol === 'file:') return 'http://localhost:5000';
    return '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function inr(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  function fmtDT(s) {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(s); }
  }

  function fmtDate(s) {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return String(s); }
  }

  async function getSession() {
    try {
      const res = await supabaseClient.auth.getSession();
      return res && res.data && res.data.session ? res.data.session : null;
    } catch (e) {
      return null;
    }
  }

  function getToken() {
    try {
      const raw = sessionStorage.getItem('apero_admin_access_token');
      if (raw) return raw;
    } catch (e) { /* ignore */ }
    return '';
  }

  /**
   * Confirms a Supabase session exists AND belongs to an admin_users member.
   * Redirects to login.html when the user is anonymous or not an admin.
   * Returns null (after redirect) or { session, admin }.
   */
  async function ensureAdmin() {
    const session = await getSession();
    if (!session) {
      redirectLogin();
      return null;
    }
    try {
      const { data, error } = await supabaseClient
        .from('admin_users')
        .select('user_id, role, created_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error && !/relation "admin_users" does not exist/.test(String(error.message))) {
        bootError('Failed to verify admin access: ' + esc(error.message));
        return null;
      }
      if (!data) {
        // Signed in privately but not in admin_users.
        try { await supabaseClient.auth.signOut(); } catch (e) { /* ignore */ }
        redirectLogin('not-admin');
        return null;
      }
      try { sessionStorage.setItem('apero_admin_access_token', session.access_token); } catch (e) { /* ignore */ }
      return { session, admin: data };
    } catch (err) {
      bootError('Failed to verify admin access: ' + esc(err && err.message));
      return null;
    }
  }

  function redirectLogin(reason) {
    const q = reason ? '?reason=' + encodeURIComponent(reason) : '';
    window.location.replace('login.html' + q);
  }

  function bootError(msg) {
    const host = document.getElementById('bootError');
    if (host) host.style.display = 'block';
    const el = document.getElementById('bootErrorMsg');
    if (el) el.textContent = msg;
    const content = document.querySelector('.container');
    if (content) content.style.opacity = '0.35';
  }

  async function logout() {
    try { await supabaseClient.auth.signOut(); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem('apero_admin_access_token'); } catch (e) { /* ignore */ }
    window.location.href = 'login.html';
  }

  async function apiFetch(path, options) {
    const opts = options || {};
    const base = apiBase();
    const url = base + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const token = getToken() || ((await getSession()) || {}).access_token;
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      if (token) headers.Authorization = 'Bearer ' + token;
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = { success: false }; }
      if (res.status === 401 || res.status === 403) {
        window.location.href = 'login.html';
        throw new Error('Admin session required. Please log in again.');
      }
      if (!res.ok) {
        throw new Error((data && (data.message || data.error)) || ('Request failed (' + res.status + ')'));
      }
      return data;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Request timed out. Please retry.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Injects the shared admin topbar into #appNav. */
  function renderNav(active) {
    const host = document.getElementById('appNav');
    if (!host) return;
    const links = NAV_LINKS.map((l) =>
      '<a href="' + esc(l.href) + '"' + (l.label === active ? ' class="active"' : '') + '>' + esc(l.label) + '</a>'
    ).join('');
    host.innerHTML =
      '<header class="admin-topbar">' +
        '<div class="admin-topbar-inner">' +
          '<div class="brand">APÉRO <small>ADMIN PORTAL</small></div>' +
          '<nav class="nav-links">' + links +
          '<a href="#" class="logout-link" id="adminLogoutLink">Logout</a></nav>' +
        '</div>' +
      '</header>';
    const out = document.getElementById('adminLogoutLink');
    if (out) out.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  }

  function statusBadge(status) {
    const map = {
      paid: ['ok', 'paid'],
      captured: ['ok', 'captured'],
      created: ['pending', 'created'],
      pending: ['pending', 'pending'],
      refunded: ['refunded', 'refunded'],
      partially_refunded: ['partial', 'partial refund'],
      failed: ['failed', 'failed'],
      cancelled: ['failed', 'cancelled'],
      processed: ['ok', 'processed'],
      completed: ['ok', 'completed'],
      published: ['ok', 'published'],
      sold_out: ['ok', 'sold out']
    };
    const m = map[String(status || '')] || ['muted', String(status || '—')];
    return '<span class="badge ' + m[0] + '">' + esc(m[1]) + '</span>';
  }

  function showAlert(el, msg) {
    if (!el) return;
    el.style.display = 'block';
    el.textContent = msg;
  }

  function hideAlert(el) {
    if (el) el.style.display = 'none';
  }

  window.AperoAdmin = {
    esc,
    inr,
    fmtDT,
    fmtDate,
    getSession,
    getToken,
    ensureAdmin,
    logout,
    apiFetch,
    renderNav,
    statusBadge,
    showAlert,
    hideAlert,
    apiBase
  };
})();