/**
 * Apéro — Ticket Booking System (Supabase-backed)
 *
 * Data is loaded from the shared Backend Services (/api/...) which talk to
 * the shared Supabase project:
 *   GET  /api/events          -> published events + availability
 *   GET  /api/events/:slug    -> event + active ticket types
 *   POST /api/orders          -> create order + payment intent (server-side)
 *   POST /api/orders/:id/pay  -> verify mock payment, allocate passes
 *   GET  /api/my/orders       -> this customer's orders
 *
 * Flow: TICKET -> MASK -> LOGIN -> ATTENDEE -> CHECKOUT -> SUCCESS
 */

(function () {
  'use strict';

  const GST_RATE = 0.18;
  const IN = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  const MASKS = {
    'obsidian-veil': { id: 'obsidian-veil', name: 'OBSIDIAN VEIL', tagline: 'MATTE BLACK ARCHIVAL RESIN' },
    'crimson-phantom': { id: 'crimson-phantom', name: 'CRIMSON PHANTOM', tagline: 'BLOOD RED METALLIC ACCENT' },
    'noir-kinetic': { id: 'noir-kinetic', name: 'NOIR KINETIC', tagline: 'GLOSS GEOMETRIC MESH' },
    'cipher-visage': { id: 'cipher-visage', name: 'CIPHER VISAGE', tagline: 'MINIMALIST TITANIUM RIM' }
  };

  const state = {
    events: [],
    event: null,           // current event + ticket_types
    ttId: null,            // selected ticket type id
    quantity: 1,
    maskId: 'crimson-phantom',
    currentStep: 'confirm',
    session: null,
    attendeeData: [],
    lastResult: null
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function apiFetch(path, options) {
    const opts = options || {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    return fetch(path, {
      method: opts.method || 'GET',
      headers: opts.headers || { 'Content-Type': 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    })
      .then(async (res) => {
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { success: false }; }
        if (!res.ok) {
          const err = new Error((data && data.message) || (data && data.error) || ('Request failed (' + res.status + ')'));
          err.code = data && data.error;
          err.httpStatus = res.status;
          throw err;
        }
        return data;
      })
      .finally(() => clearTimeout(timer));
  }

  function currentTier() {
    if (!state.event) return null;
    return state.event.ticket_types.find((t) => t.id === state.ttId) || null;
  }

  // ------------------------------------------------------------------
  // Modal helpers (module scope — used by booking modal and My Access)
  // ------------------------------------------------------------------
  function showDialog(dialog) {
    if (!dialog) return;
    try { dialog.showModal(); } catch (e) { dialog.setAttribute('open', ''); }
    const inner = dialog.querySelector('.modal-inner');
    if (inner) inner.scrollTop = 0;
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    try { dialog.close(); } catch (e) { dialog.removeAttribute('open'); }
  }

  // ------------------------------------------------------------------
  // Catalog loading
  //
  // Primary source: the shared Supabase project (public RLS read on
  // `events` where status = 'published' + the `public_ticket_availability`
  // view). Fallback: the Backend Services `/api/events` endpoints.
  //
  // Order creation / payment always go through the Backend Services.
  // ------------------------------------------------------------------
  function hasSupabase() {
    return typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function';
  }

  function normalizeCatalog(events, availability) {
    const byEvent = {};
    for (const row of availability || []) {
      if (!byEvent[row.event_id]) byEvent[row.event_id] = [];
      byEvent[row.event_id].push(row);
    }
    return (events || []).map((ev) => ({
      id: ev.id,
      name: ev.name,
      slug: ev.slug,
      description: ev.description,
      venue: ev.venue,
      address: ev.address,
      event_date: ev.event_date,
      start_time: ev.start_time,
      end_time: ev.end_time,
      cover_image: ev.cover_image,
      status: ev.status,
      created_at: ev.created_at,
      ticket_types: (byEvent[ev.id] || [])
        .filter((tt) => String(tt.status || 'active').toLowerCase() !== 'inactive')
        .map((tt) => ({
          id: tt.id,
          name: tt.name,
          description: tt.description,
          price: Number(tt.price),
          currency: tt.currency,
          admission_count: tt.admission_count,
          remaining_quantity: Number(tt.remaining_quantity),
          sold_quantity: Number(tt.sold_quantity),
          total_quantity: Number(tt.total_quantity),
          sales_start: tt.sales_start,
          sales_end: tt.sales_end
        }))
    }));
  }

  async function fetchCatalogFromSupabase() {
    const [eventsRes, availRes] = await Promise.all([
      supabaseClient
        .from('events')
        .select('id, name, slug, description, venue, address, event_date, start_time, end_time, cover_image, status, created_at')
        .eq('status', 'published')
        .order('event_date', { ascending: true }),
      supabaseClient
        .from('public_ticket_availability')
        .select('id, event_id, name, description, price, currency, admission_count, total_quantity, sold_quantity, remaining_quantity, sales_start, sales_end, status')
    ]);
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    if (availRes.error) throw new Error(availRes.error.message);
    return normalizeCatalog(eventsRes.data, availRes.data);
  }

  async function loadCatalog() {
    let loaded = false;
    let firstError = null;
    if (hasSupabase()) {
      try {
        state.events = await fetchCatalogFromSupabase();
        loaded = true;
      } catch (e) {
        firstError = e;
      }
    }
    if (!loaded) {
      try {
        const data = await apiFetch('/api/events');
        state.events = data.events || [];
        loaded = true;
      } catch (e) {
        showCatalogError((e && e.message) || (firstError && firstError.message) || 'Unable to load events. Please retry.');
        return;
      }
    }
    if (!state.events.length) {
      showCatalogError('No events are live right now. Check back soon.');
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const requestedSlug = (urlParams.get('event') || '').toLowerCase();
    const target = state.events.find((e) => e.slug === requestedSlug) || state.events[0];
    selectEvent(target);
  }

  async function loadEvent(slug) {
    const ce = $('catalogError');
    if (ce) ce.style.display = 'none';
    let target = state.events.find((e) => e.slug === slug);
    if (!target) {
      try {
        if (hasSupabase()) {
          state.events = await fetchCatalogFromSupabase();
          target = state.events.find((e) => e.slug === slug);
        }
        if (!target) {
          const data = await apiFetch('/api/events/' + encodeURIComponent(slug));
          target = data.event;
        }
      } catch (err) {
        showCatalogError(err.message || 'Unable to load this event.');
        return;
      }
    }
    if (!target) { showCatalogError('That event is not available.'); return; }
    selectEvent(target);
  }

  function selectEvent(ev) {
    state.event = ev;
    state.ttId = null;
    renderEventSelector();
    updateEventHeader();
    renderTickets();
    buildTierSelect();
    // Deep link support: ?tier=<ticket_type_id>
    const urlParams = new URLSearchParams(window.location.search);
    const tierParam = urlParams.get('tier') || urlParams.get('plan');
    if (tierParam && ev.ticket_types.some((t) => t.id === tierParam)) {
      setTimeout(() => openModal(tierParam), 200);
    }
  }

  function showCatalogError(msg) {
    const el = $('catalogError');
    const pill = $('ticketsEventPill');
    if (el) { el.style.display = 'block'; el.textContent = msg; }
    if (pill) {
      const sn = pill.querySelectorAll('span');
      if (sn[0]) sn[0].textContent = 'EVENT UNAVAILABLE';
    }
  }

  function updateEventHeader() {
    const ev = state.event;
    const fmtDate = (d) => {
      try {
        return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
      } catch (e) { return String(d || '').toUpperCase(); }
    };
    const fmtTime = (t) => {
      if (!t) return '';
      try {
        const [h, m] = String(t).split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hh = ((h % 12) || 12).toString().padStart(2, '0');
        return hh + ':' + (m == null ? '00' : String(m).padStart(2, '0')) + ' ' + ampm;
      } catch (e) { return String(t); }
    };
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    const pill = $('ticketsEventPill');
    set('evtDate', fmtDate(ev.event_date));
    set('evtVenue', String(ev.venue || ev.address || '').toUpperCase());
    set('evtTime', [fmtTime(ev.start_time), fmtTime(ev.end_time)].filter(Boolean).join(' – '));
    document.title = 'Tickets | ' + (ev.name || 'APÉRO');
    if (pill) {
      const sn = pill.querySelectorAll('span');
      if (sn[3]) sn[3].textContent = fmtTime(ev.start_time);
    }
  }

  function renderEventSelector() {
    const wrap = $('eventSelector');
    if (!wrap) return;
    if (!state.events.length || state.events.length < 2) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = state.events.map((e) => {
      const active = state.event && state.event.id === e.id;
      return '<button type="button" class="event-selector-chip' + (active ? ' active' : '') + '" data-slug="' + esc(e.slug) + '">' +
        esc(e.name) + '</button>';
    }).join('');
    wrap.querySelectorAll('.event-selector-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (state.event && chip.dataset.slug === state.event.slug) return;
        const url = new URL(window.location.href);
        url.searchParams.set('event', chip.dataset.slug);
        history.replaceState(null, '', url.toString());
        loadEvent(chip.dataset.slug);
      });
    });
  }

  // ------------------------------------------------------------------
  // Ticket cards
  // ------------------------------------------------------------------
  function renderTickets() {
    const single = $('singleTrack');
    const group = $('groupTrack');
    const catSingle = $('categorySingle');
    const catGroup = $('categoryGroup');
    if (!single || !group) return;

    const types = (state.event && state.event.ticket_types) || [];
    const singleTypes = types.filter((t) => t.admission_count === 1);
    const groupTypes = types.filter((t) => t.admission_count > 1);

    single.innerHTML = singleTypes.map((t) => buildCard(t)).join('');
    group.innerHTML = groupTypes.map((t) => buildCard(t)).join('');

    if (catSingle) catSingle.style.display = singleTypes.length ? 'block' : 'none';
    if (catGroup) catGroup.style.display = groupTypes.length ? 'block' : 'none';

    bindCardClicks();
  }

  function buildCard(tt) {
    const perPerson = tt.admission_count > 1 ? tt.price / tt.admission_count : tt.price;
    const soldOut = tt.remaining_quantity <= 0;
    const group = tt.admission_count > 1;
    const cardCls = ['ticket-card'];
    if (group) cardCls.push('group-card');
    if (soldOut) cardCls.push('dimmed', 'sold-out-card');

    const headerTag = group
      ? 'GROUP ENTRY &bull; ' + tt.admission_count + ' PEOPLE'
      : 'SINGLE ENTRY';
    const badge = soldOut ? '<div class="ticket-tier-badge muted">SOLD OUT</div>'
      : '<div class="ticket-tier-badge">' + (group ? 'ACCEPTING CREWS' : 'ACTIVE') + '</div>';

    const priceBlock = soldOut
      ? '<div class="ticket-sold-out-tag">SOLD OUT</div>'
      : (group
          ? '<div class="ticket-total-calc group-calc"><strong class="total-bold">' + IN(tt.price) + ' TOTAL</strong><span class="calc-divider">&bull;</span><span>' + tt.admission_count + ' PEOPLE</span><span class="calc-formula">(' + IN(tt.price) + ' &divide; ' + tt.admission_count + ' = ' + IN(Math.round(perPerson)) + '/PERSON)</span></div>'
          : '<div class="ticket-total-calc">TOTAL: ' + IN(tt.price) + ' &bull; 1 GUEST</div>');

    const features = (tt.description || '')
      .split('\n')
      .filter(Boolean)
      .map((l) => '<li class="ticket-feature-item">' + esc(l) + '</li>')
      .join('') ||
      '<li class="ticket-feature-item">Full event access</li>' +
      '<li class="ticket-feature-item">Unique pass code per guest</li>' +
      '<li class="ticket-feature-item">Digital check-in at gate</li>';

    const cta = soldOut
      ? '<button type="button" class="btn btn-outline btn-sm" disabled style="opacity: 0.45; cursor: not-allowed; width: 100%; pointer-events: none;">SOLD OUT</button>'
      : '<button type="button" class="btn btn-primary btn-sm open-booking-btn" data-tier="' + esc(tt.id) + '" style="width: 100%;">BUY TICKET &bull; ' + IN(tt.price) + '</button>';

    const remaining = soldOut
      ? '<div class="ticket-common-info"><div class="common-info-item">SOLD OUT</div></div>'
      : (tt.remaining_quantity <= 10
          ? '<div class="ticket-common-info"><div class="common-info-item" style="color: var(--red);">ONLY ' + tt.remaining_quantity + ' LEFT</div></div>'
          : '');

    return '' +
      '<div class="' + cardCls.join(' ') + '" data-tier="' + esc(tt.id) + '">' +
        '<div class="ticket-card-header">' +
          '<span class="ticket-category-tag' + (group ? ' group-tag' : (soldOut ? ' muted' : ' accent')) + '">' + headerTag + '</span>' +
          badge +
          '<h3 class="ticket-tier-name">' + esc(tt.name) + '</h3>' +
          '<div class="ticket-price-container">' +
            '<div class="ticket-per-person' + (group ? ' highlight' : '') + '">' +
              '<span class="currency">₹</span>' +
              '<span class="price-val">' + Number(tt.price).toLocaleString('en-IN') + '</span>' +
              '<span class="per-unit">/ ' + (group ? tt.admission_count + ' PEOPLE</span>' : 'PERSON</span>') +
            '</div>' +
            priceBlock +
          '</div>' +
          remaining +
        '</div>' +
        '<ul class="ticket-features">' + features + '</ul>' +
        '<div class="ticket-bottom-wrap">' +
          '<div class="ticket-perforation"></div>' +
          '<div class="ticket-barcode"><span class="barcode-stripes" aria-hidden="true"></span><span>' + esc(tt.name.slice(0, 8).toUpperCase()) + '</span></div>' +
          cta +
        '</div>' +
      '</div>';
  }

  function bindCardClicks() {
    document.querySelectorAll('.ticket-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) {
          const btn = e.target.closest('button');
          const tier = btn.getAttribute('data-tier');
          if (tier) openModal(tier);
          return;
        }
        if (card.classList.contains('sold-out-card') || card.classList.contains('tbd-card')) return;
        const tier = card.getAttribute('data-tier');
        if (tier) openModal(tier);
      });
    });
  }

  function buildTierSelect() {
    const select = $('bookTierSelect');
    if (!select) return;
    const types = (state.event && state.event.ticket_types) || [];
    select.innerHTML = types.map((t) => {
      const perPerson = t.admission_count > 1 ? Math.round(t.price / t.admission_count) : t.price;
      const label = (t.name + ' — ' + IN(t.price) + (t.admission_count > 1 ? ' (' + IN(perPerson) + '/person)' : '/person') + (t.remaining_quantity <= 0 ? ' (SOLD OUT)' : ''));
      return '<option value="' + esc(t.id) + '"' + (t.remaining_quantity <= 0 ? ' disabled' : '') + '>' + esc(label) + '</option>';
    }).join('');
    if (!state.ttId) {
      const first = types.find((t) => t.remaining_quantity > 0) || types[0];
      if (first) select.value = first.id;
    }
  }

  // ------------------------------------------------------------------
  // Category tabs
  // ------------------------------------------------------------------
  function initCategoryTabs() {
    const tabs = document.querySelectorAll('.category-tab');
    const sections = document.querySelectorAll('.ticket-category-section');
    if (!tabs.length) return;
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = tab.getAttribute('data-category');
        tabs.forEach((t) => {
          const isActive = t === tab;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        sections.forEach((sec) => {
          const group = sec.getAttribute('data-category-group');
          if (cat === 'all' || cat === group) sec.style.display = 'block';
          else sec.style.display = 'none';
        });
      });
    });
  }

  // ------------------------------------------------------------------
  // Booking modal
  // ------------------------------------------------------------------
  function initBookingSystem() {
    const modal = $('bookingModal');
    if (!modal) return;

    const closeBtn = $('modalCloseBtn');
    const tierSelect = $('bookTierSelect');
    const qtyMinus = $('qtyMinus');
    const qtyPlus = $('qtyPlus');
    const qtyDisplay = $('qtyDisplay');

    const steps = {
      confirm: $('stepPanelConfirm'),
      mask: $('stepPanelMask'),
      login: $('stepPanelLogin'),
      attendee: $('stepPanelAttendee'),
      checkout: $('stepPanelCheckout'),
      success: $('stepPanelSuccess')
    };
    const indicators = {
      confirm: $('indicatorConfirm'),
      mask: $('indicatorMask'),
      login: $('indicatorLogin'),
      attendee: $('indicatorAttendee'),
      checkout: $('indicatorCheckout')
    };
    const eyebrow = $('modalEyebrow');

    window.openAperoBookingModal = openModal;

    function openModal(rawTtId) {
      const types = (state.event && state.event.ticket_types) || [];
      let tt = types.find((t) => t.id === rawTtId);
      if (!tt) tt = types.find((t) => t.remaining_quantity > 0) || types[0];
      if (!tt) return;
      if (tt.remaining_quantity <= 0) return;

      state.ttId = tt.id;
      state.quantity = 1;
      state.maskId = 'crimson-phantom';
      state.lastResult = null;
      if (tierSelect) tierSelect.value = tt.id;

      updateCalculations();
      goToStep('confirm');
      showModal(modal);
    }
function showModal(dialog) {
      showDialog(dialog);
    }

    function closeModal() {
      closeDialog(modal);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    const finishBtn = $('btnFinishBooking');
    if (finishBtn) finishBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      const rect = modal.getBoundingClientRect();
      const inside = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!inside) closeModal();
    });

    function goToStep(step) {
      state.currentStep = step;
      Object.values(steps).forEach((p) => { if (p) p.classList.remove('active'); });
      Object.values(indicators).forEach((ind) => { if (ind) ind.classList.remove('active', 'completed'); });

      const order = ['confirm', 'mask', 'login', 'attendee', 'checkout', 'success'];
      const idx = order.indexOf(step);
      if (idx === -1) return;

      const panel = steps[step];
      if (panel) panel.classList.add('active');

      for (let i = 0; i < order.length - 1; i += 1) {
        const ind = indicators[order[i]];
        if (!ind) continue;
        if (i < idx || step === 'success') ind.classList.add('completed');
        if (i === idx) ind.classList.add('active');
      }
      if (step === 'success') { /* all completed */ }

      const labels = {
        confirm: 'RESERVATION TERMINAL • STEP 01',
        mask: 'MASQUERADE SELECTION • STEP 02',
        login: 'ACCOUNT ACCESS • STEP 03',
        attendee: 'ATTENDEE DETAILS • STEP 04',
        checkout: 'FINAL ORDER CONFIRMATION • STEP 05',
        success: 'PASS ALLOCATED • CONFIRMED'
      };
      if (eyebrow) eyebrow.textContent = labels[step] || '';

      if (step === 'login') refreshLoginView();
      if (step === 'attendee') buildAttendeeForms();
      if (step === 'checkout') updateCheckoutReview();

      const inner = modal.querySelector('.modal-inner');
      if (inner) inner.scrollTop = 0;
    }

    // ---- Step 1: tier + quantity ----
    if (tierSelect) {
      tierSelect.addEventListener('change', (e) => {
        setTier(e.target.value);
      });
    }
    if (qtyMinus) qtyMinus.addEventListener('click', () => {
      const tt = currentTier();
      if (!tt) return;
      if (state.quantity > 1) { state.quantity -= 1; updateCalculations(); }
    });
    if (qtyPlus) qtyPlus.addEventListener('click', () => {
      const tt = currentTier();
      if (!tt) return;
      const maxQty = Math.min(10, Math.max(1, tt.remaining_quantity || 1));
      if (state.quantity < maxQty) { state.quantity += 1; updateCalculations(); }
    });

    function setTier(ttId) {
      state.ttId = ttId;
      updateCalculations();
    }

    function updateCalculations() {
      const tt = currentTier();
      if (!tt) return;
      const qty = state.quantity;
      const perPerson = tt.admission_count > 1 ? tt.price / tt.admission_count : tt.price;
      const subtotal = tt.price * qty;
      const tax = Math.round(subtotal * GST_RATE);
      const total = subtotal + tax;
      const group = tt.admission_count > 1;

      const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };

      set('confirmPlanName', tt.name);
      set('confirmPlanPrice', IN(tt.price));
      set('confirmPlanPerPerson', group ? 'TOTAL (' + IN(Math.round(perPerson)) + '/PERSON)' : '/ PERSON');
      set('confirmPlanTypeLabel', group ? 'GROUP PASS (' + tt.admission_count + ' GUESTS)' : 'SINGLE ENTRY (1 GUEST)');
      set('confirmPlanEventDate', fmtEventDate());
      set('confirmPlanVenue', String(state.event && (state.event.venue || state.event.address) || '').toUpperCase());

      if (qtyDisplay) qtyDisplay.textContent = qty;
      set('sumTierName', tt.name);
      set('sumQtyLabel', qty);
      set('sumPriceLabel', group ? IN(tt.price) + ' (' + IN(Math.round(perPerson)) + '/person)' : IN(tt.price));
      set('sumSubtotal', IN(subtotal));
      set('sumTax', IN(tax));
      set('sumTotal', IN(total));

      const hint = $('qtyHint');
      if (hint) {
        hint.textContent = group
          ? (qty + ' ticket × ' + tt.admission_count + ' guests = ' + (qty * tt.admission_count) + ' passes')
          : (qty + ' ticket' + (qty > 1 ? 's' : '') + ' = ' + qty + ' pass' + (qty > 1 ? 'es' : ''));
      }

      const maxQty = Math.min(10, Math.max(1, tt.remaining_quantity || 1));
      if (qtyPlus) qtyPlus.disabled = state.quantity >= maxQty;
      if (qtyMinus) qtyMinus.disabled = state.quantity <= 1;
    }

    function fmtEventDate() {
      const ev = state.event;
      if (!ev || !ev.event_date) return '—';
      try {
        return new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      } catch (e) { return String(ev.event_date); }
    }

    // ---- Step 2: mask ----
    document.querySelectorAll('.mask-card').forEach((card) => {
      card.addEventListener('click', () => {
        const maskId = card.getAttribute('data-mask-id');
        if (!maskId || !MASKS[maskId]) return;
        document.querySelectorAll('.mask-card').forEach((c) => {
          c.classList.remove('selected');
          c.setAttribute('aria-checked', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');
        state.maskId = maskId;
      });
    });

    // ---- Step 3: authentication (Supabase) ----
    initAuthStep(goToStep);

    // ---- Step 4: attendees ----
    if ($('btnBackToLogin')) $('btnBackToLogin').addEventListener('click', () => goToStep('login'));
    if ($('btnGoToCheckout')) $('btnGoToCheckout').addEventListener('click', () => {
      if (collectAttendees()) goToStep('checkout');
    });

    // ---- Step 5: checkout ----
    if ($('btnGoToMask')) $('btnGoToMask').addEventListener('click', () => goToStep('mask'));
    if ($('btnBackToConfirm')) $('btnBackToConfirm').addEventListener('click', () => goToStep('confirm'));
    if ($('btnGoToLogin')) $('btnGoToLogin').addEventListener('click', () => goToStep('login'));
    if ($('btnBackToMask')) $('btnBackToMask').addEventListener('click', () => goToStep('mask'));
    if ($('btnGoToAttendee')) $('btnGoToAttendee').addEventListener('click', () => goToStep('attendee'));
    if ($('btnBackToAttendee')) $('btnBackToAttendee').addEventListener('click', () => goToStep('attendee'));

    const confirmBtn = $('btnFinalConfirmPayment');
    if (confirmBtn) confirmBtn.addEventListener('click', doFinalConfirm);

    // ---- My access ----
    const myAccessBtn = $('myAccessBtn');
    if (myAccessBtn) myAccessBtn.addEventListener('click', openMyTickets);
    const viewMyBtn = $('btnViewMyTickets');
    if (viewMyBtn) viewMyBtn.addEventListener('click', () => { goToStep('success'); openMyTickets(); });
    const mtClose = $('myTicketsCloseBtn');
    if (mtClose) mtClose.addEventListener('click', () => closeDialog($('myTicketsModal')));
    const mtBody = $('myTicketsBody');
    if (mtBody) mtBody.addEventListener('click', (e) => {
      const loginBtn = e.target.closest('#myTicketsSignInBtn');
      if (loginBtn) {
        closeDialog($('myTicketsModal'));
        goToStep('login');
        showModal(modal);
      }
      const logoutBtn = e.target.closest('#myTicketsLogoutBtn');
      if (logoutBtn) {
        supabaseClient.auth.signOut().then(() => {
          state.session = null;
          openMyTickets();
        }).catch(() => openMyTickets());
      }
    });
  }

  // ------------------------------------------------------------------
  // Authentication
  // ------------------------------------------------------------------
  async function getSession() {
    try {
      const res = await supabaseClient.auth.getSession();
      const session = res && res.data && res.data.session ? res.data.session : null;
      state.session = session;
      return session;
    } catch (e) {
      state.session = null;
      return null;
    }
  }

  function initAuthStep(goToStep) {
    const authView = $('loginAuthView');
    const connectedView = $('loginConnectedView');
    const signupForm = $('signupForm');
    const loginForm = $('loginForm');
    const tabCreate = $('tabCreateAccount');
    const tabMember = $('tabMemberLogin');
    const btnSignup = $('btnDoSignup');
    const btnLogin = $('btnDoLogin');
    const btnGoToAttendee = $('btnGoToAttendee');
    const authError = $('authError');

    function showAuthError(msg) {
      if (!authError) return;
      if (!msg) { authError.style.display = 'none'; authError.textContent = ''; return; }
      authError.style.display = 'block';
      authError.textContent = msg;
    }

    if (tabCreate && tabMember) {
      tabCreate.addEventListener('click', () => {
        tabCreate.classList.add('active');
        tabMember.classList.remove('active');
        if (signupForm) { signupForm.style.display = 'flex'; signupForm.style.flexDirection = 'column'; }
        if (loginForm) { loginForm.style.display = 'none'; loginForm.style.flexDirection = 'column'; }
        showAuthError('');
      });
      tabMember.addEventListener('click', () => {
        tabMember.classList.add('active');
        tabCreate.classList.remove('active');
        if (signupForm) { signupForm.style.display = 'none'; signupForm.style.flexDirection = 'column'; }
        if (loginForm) { loginForm.style.display = 'flex'; loginForm.style.flexDirection = 'column'; }
        showAuthError('');
      });
    }

    function showLoggedIn() {
      if (!authView || !connectedView) return;
      authView.style.display = 'none';
      connectedView.style.display = 'block';
      const session = state.session;
      const name = (session && session.user && (session.user.user_metadata && (session.user.user_metadata.name || ''))) || '';
      const email = (session && session.user && session.user.email) || '';
      const avatar = $('connectedAvatar');
      if (avatar) avatar.textContent = (name || email || 'A').charAt(0).toUpperCase();
      const nameEl = $('connectedName');
      if (nameEl) nameEl.textContent = name || 'APÉRO MEMBER';
      const emailEl = $('connectedEmail');
      if (emailEl) emailEl.textContent = email;
      if (btnGoToAttendee) btnGoToAttendee.style.display = 'inline-flex';
    }

    function showLogin() {
      if (!authView || !connectedView) return;
      authView.style.display = 'block';
      connectedView.style.display = 'none';
      if (btnGoToAttendee) btnGoToAttendee.style.display = 'none';
    }

    window.refreshLoginView = async function () {
      const session = await getSession();
      if (session) showLoggedIn();
      else showLogin();
    };

    async function afterAuth() {
      const session = await getSession();
      if (session) { showLoggedIn(); return true; }
      return false;
    }

    if (btnSignup) btnSignup.addEventListener('click', async () => {
      showAuthError('');
      const name = $('authName').value.trim();
      const email = $('authEmail').value.trim();
      const phone = $('authPhone').value.trim();
      const password = $('authPassword').value;
      if (name.length < 2) { showAuthError('Please enter your full name.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showAuthError('Please enter a valid email address.'); return; }
      if (!password || password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
      btnSignup.disabled = true;
      btnSignup.textContent = 'CREATING ACCOUNT...';
      try {
        const res = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: { data: { name: name, phone: phone } }
        });
        if (res.error) throw new Error(res.error.message);
        if (res.data && res.data.session) {
          state.session = res.data.session;
          showLoggedIn();
        } else {
          // Email confirmation is enabled in this Supabase project.
          showAuthError('Account created. Please check your email to confirm it, then use MEMBER LOGIN. (If you are testing locally, disable email confirmation in Supabase Auth settings.)');
          if (tabMember) tabMember.click();
        }
      } catch (err) {
        showAuthError(err.message || 'Unable to create account.');
      } finally {
        btnSignup.disabled = false;
        btnSignup.textContent = 'CREATE ACCOUNT →';
      }
    });

    if (btnLogin) btnLogin.addEventListener('click', async () => {
      showAuthError('');
      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;
      if (!email || !password) { showAuthError('Enter your email and password.'); return; }
      btnLogin.disabled = true;
      btnLogin.textContent = 'LOGGING IN...';
      try {
        const res = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
        if (res.error) throw new Error(res.error.message);
        state.session = res.data.session;
        showLoggedIn();
      } catch (err) {
        showAuthError(err.message || 'Unable to sign in.');
      } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'MEMBER LOGIN →';
      }
    });
  }

  // ------------------------------------------------------------------
  // Attendees
  // ------------------------------------------------------------------
  function buildAttendeeForms() {
    const container = $('attendeeFormFields');
    const sub = $('attendeeStepSub');
    if (!container) return;
    const tt = currentTier();
    if (!tt) return;

    const count = tt.admission_count * state.quantity;
    state.attendeeData = [{
      ticket_type_id: tt.id,
      quantity: state.quantity,
      attendees: Array.from({ length: count }, () => ({ name: '', age: '', gender: '', phone: '' }))
    }];

    if (sub) {
      sub.textContent = count + ' guest' + (count > 1 ? 's' : '') + ' admitted by ' + state.quantity + ' × ' + tt.name + '.';
    }

    container.innerHTML = state.attendeeData[0].attendees.map((a, i) => {
      return '' +
        '<div class="attendee-entry">' +
          '<div class="attendee-entry-head">' +
            '<span class="attendee-entry-index">PASS ' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="attendee-entry-tier">' + esc(tt.name) + (tt.admission_count > 1 ? ' · GROUP OF ' + tt.admission_count : ' · SINGLE') + '</span>' +
          '</div>' +
          '<div class="attendee-entry-fields">' +
            '<div class="form-group"><label class="form-label">Full Name (required)</label><input type="text" class="form-input at-name" placeholder="Guest name" autocomplete="name"></div>' +
            '<div class="form-group"><label class="form-label">Age (optional)</label><input type="number" class="form-input at-age" min="0" max="120" placeholder="—"></div>' +
            '<div class="form-group"><label class="form-label">Gender (optional)</label><select class="form-select at-gender"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>' +
            '<div class="form-group"><label class="form-label">Phone (optional)</label><input type="tel" class="form-input at-phone" placeholder="+91" inputmode="tel"></div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  function collectAttendees() {
    const container = $('attendeeFormFields');
    const errEl = $('attendeeError');
    const hideErr = () => { if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; } };
    const showErr = (m) => { if (errEl) { errEl.style.display = 'block'; errEl.textContent = m; } };

    if (!container) return true;
    const entries = container.querySelectorAll('.attendee-entry');
    const group = state.attendeeData[0];
    const attendees = [];
    let valid = true;
    entries.forEach((entry, i) => {
      const name = (entry.querySelector('.at-name').value || '').trim();
      const ageRaw = entry.querySelector('.at-age').value;
      const gender = entry.querySelector('.at-gender').value;
      const phone = (entry.querySelector('.at-phone').value || '').trim();
      let age = null;
      if (ageRaw !== '' && ageRaw !== null) {
        age = Number(ageRaw);
        if (!Number.isInteger(age) || age < 0 || age > 120) { valid = false; showErr('Guest ' + (i + 1) + ': age must be between 0 and 120.'); }
      }
      if (name.length < 2) { valid = false; showErr('Guest ' + (i + 1) + ': full name is required.'); }
      attendees.push({ name, age, gender, phone });
    });
    if (!valid || !group) return false;
    group.attendees = attendees;
    return true;
  }

  // ------------------------------------------------------------------
  // Checkout + payment
  // ------------------------------------------------------------------
  function updateCheckoutReview() {
    const tt = currentTier();
    if (!tt) return;
    const qty = state.quantity;
    const subtotal = tt.price * qty;
    const tax = Math.round(subtotal * GST_RATE);
    const total = subtotal + tax;
    const group = tt.admission_count > 1;
    const attendees = group ? tt.admission_count * qty : qty;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('checkoutTierName', tt.name);
    set('checkoutMaskName', MASKS[state.maskId] ? MASKS[state.maskId].name + ' (INCLUDED)' : '—');
    set('checkoutQty', group ? (qty + ' ticket' + (qty > 1 ? 's' : '') + ' (' + attendees + ' passes)') : (qty + ' pass' + (qty > 1 ? 'es' : '')));
    set('checkoutAttendeeCount', attendees + ' guest' + (attendees > 1 ? 's' : ''));
    set('checkoutVenue', String(state.event && (state.event.venue || state.event.address) || '').toUpperCase());
    set('checkoutSubtotal', IN(subtotal));
    set('checkoutTax', IN(tax));
    set('checkoutTotal', IN(total));
  }

  function showBookingError(msg) {
    const el = $('bookingFormError');
    if (!el) return;
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.textContent = msg;
  }

  async function doFinalConfirm() {
    const btn = $('btnFinalConfirmPayment');
    if (state.session === null || state.session === undefined) {
      const session = await getSession();
      if (!session) {
        showBookingError('Please log in before confirming your order.');
        goToStep('login');
        return;
      }
    }
    const tt = currentTier();
    if (!tt || !state.event) return;

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'RESERVING INVENTORY &amp; PROCESSING PAYMENT...';
    showBookingError('');

    try {
      const simulate = ($('paySimulation') && $('paySimulation').value) || 'success';
      const orderPayload = {
        event_id: state.event.id,
        items: [{ ticket_type_id: tt.id, quantity: state.quantity }],
        attendee_data: state.attendeeData
      };

      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.session.access_token };

      const orderRes = await apiFetch('/api/orders', { method: 'POST', headers, body: orderPayload });
      const payRes = await apiFetch('/api/orders/' + encodeURIComponent(orderRes.order.id) + '/pay', {
        method: 'POST',
        headers,
        body: { simulate }
      });

      state.lastResult = payRes;

      if (payRes.success === false) {
        showBookingError('Payment failed (' + (payRes.code || 'PAYMENT_FAILED') + '). Your ticket inventory has been released. You can retry.');
        return;
      }

      fillSuccess(orderRes.order, payRes);
      goToStep('success');

      if (window.AperoBooking && typeof window.AperoBooking.onBookingSubmit === 'function') {
        try {
          window.AperoBooking.onBookingSubmit({
            orderId: orderRes.order.id,
            ticketType: tt.name,
            quantity: state.quantity,
            mask: state.maskId,
            total: orderRes.order.total_amount,
            tickets: payRes.tickets || []
          });
        } catch (hookErr) { console.error('onBookingSubmit hook failed:', hookErr); }
      }
    } catch (err) {
      showBookingError(err.message || 'Order could not be completed. Please retry.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  function fillSuccess(order, payRes) {
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    const ev = state.event;
    const buyerName = (state.session.user && state.session.user.user_metadata && state.session.user.user_metadata.name) || state.session.user.email || 'MEMBER';
    set('confirmedHolderName', buyerName);
    set('confirmedBookingRef', String(order.id).slice(0, 8).toUpperCase());
    set('confirmedTier', currentTier().name);
    set('confirmedMask', MASKS[state.maskId] ? MASKS[state.maskId].name : '—');
    set('confirmedEventDate', fmtEventDate());
    set('confirmedVenue', String(ev.venue || ev.address || '').toUpperCase());

    const list = $('ticketsResultList');
    if (list) {
      const tickets = (payRes.tickets || []).map((t) => ({ code: t.ticket_code, name: t.name || currentTier().name }));
      list.innerHTML = '<div class="v-label">PASS CODES</div>' +
        (tickets.length ? tickets.map((t) =>
          '<div class="ticket-code-row"><span class="ticket-code">' + esc(t.code) + '</span><span class="ticket-code-name">' + esc(t.name) + '</span></div>'
        ).join('') : '<div class="ticket-code-row"><span class="muted">—</span></div>');
    }
  }

  // ------------------------------------------------------------------
  // My Access modal
  // ------------------------------------------------------------------
  async function openMyTickets() {
    const modal = $('myTicketsModal');
    const promptEl = $('myTicketsLoginPrompt');
    const contentEl = $('myTicketsContent');
    if (!modal || !promptEl || !contentEl) return;

    const session = await getSession();
    if (!session) {
      promptEl.style.display = 'block';
      contentEl.style.display = 'none';
      showDialog(modal);
      return;
    }

    promptEl.style.display = 'none';
    contentEl.style.display = 'block';
    contentEl.innerHTML = '<div class="muted" style="padding:1rem 0;">Loading your orders…</div>';

    showDialog(modal);

    try {
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token };
      const data = await apiFetch('/api/my/orders', { headers });
      const orders = data.orders || [];
      const email = (session.user && session.user.email) || '';
      const name = (session.user && session.user.user_metadata && session.user.user_metadata.name) || '';

      let html = '<div class="my-access-header">' +
        '<div><div class="my-access-name">' + esc(name || 'APÉRO MEMBER') + '</div>' +
        '<div class="muted">' + esc(email) + '</div></div>' +
        '<button type="button" class="btn btn-outline btn-sm" id="myTicketsLogoutBtn">SIGN OUT</button>' +
        '</div>';

      if (!orders.length) {
        html += '<div class="muted" style="padding:1rem 0;">No orders yet. Grab a pass above.</div>';
      } else {
        html += orders.map((o) => {
          const evt = o.events || {};
          const pay = (o.payments || [])[0];
          const statusCls = o.status === 'paid' ? 'status-ok' : (o.status === 'pending' ? 'status-pending' : 'status-failed');
          const tickets = [];
          (o.order_items || []).forEach((it) => {
            (it.ticket_holders || []).forEach((h) => {
              tickets.push({ code: h.ticket_code, name: h.name, tt: (it.ticket_types && it.ticket_types.name) || '', checked: h.check_in_status === 'checked_in' });
            });
          });
          const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
          return '' +
            '<div class="my-order">' +
              '<div class="my-order-head">' +
                '<div><div class="my-order-event">' + esc(evt.name || 'Event') + '</div>' +
                '<div class="muted">' + esc(dateStr) + ' · ' + IN(o.total_amount) + ' · ' + (pay ? esc(pay.provider).toUpperCase() + ' · ' + esc(pay.status) : '') + '</div></div>' +
                '<span class="order-status ' + statusCls + '">' + esc(o.status).toUpperCase() + '</span>' +
              '</div>' +
              (tickets.length ? '<div class="my-ticket-codes">' + tickets.map((t) =>
                '<div class="ticket-code-row"><span class="ticket-code">' + esc(t.code) + '</span>' +
                '<span class="ticket-code-name">' + esc(t.name) + ' · ' + esc(t.tt) + '</span>' +
                (t.checked ? '<span class="badge-ok">CHECKED IN</span>' : '') + '</div>'
              ).join('') + '</div>' : '') +
            '</div>';
        }).join('');
      }
      contentEl.innerHTML = html;
    } catch (err) {
      contentEl.innerHTML = '<div class="auth-form-error" style="display:block">' + esc(err.message || 'Unable to load your orders.') + '</div>';
    }
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initCategoryTabs();
    initBookingSystem();
    loadCatalog();
  });

  // Expose a stable global namespace (integration hook).
  window.AperoBooking = {
    get masks() { return MASKS; },
    getState: () => ({
      event: state.event,
      ticketTypeId: state.ttId,
      quantity: state.quantity,
      maskId: state.maskId,
      currentStep: state.currentStep,
      signedIn: !!(state.session)
    }),
    selectTicket: (ttId) => { if (typeof window.openAperoBookingModal === 'function') window.openAperoBookingModal(ttId); },
    openMyTickets,
    onBookingSubmit: (payload) => {
      console.log('APÉRO ORDER CONFIRMED:', payload);
    }
  };
})();