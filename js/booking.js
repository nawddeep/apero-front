/**
 * Apéro — Ticket Booking System
 * Modal controller, tier configuration, live price calculations, category tabs, and booking hooks.
 */

(function () {
  'use strict';

  // Exact Ticket Tier Specifications
  const TIERS = {
    super_early: {
      name: 'SUPER EARLY BIRD',
      price: 1111,
      perPerson: 1111,
      people: 1,
      isSoldOut: true,
      type: 'single',
      code: 'AP-SEB'
    },
    early: {
      name: 'EARLY BIRD PASS',
      price: 1333,
      perPerson: 1333,
      people: 1,
      type: 'single',
      code: 'AP-EB'
    },
    stage1: {
      name: 'STAGE 1 PASS',
      price: 1777,
      perPerson: 1777,
      people: 1,
      type: 'single',
      code: 'AP-S1'
    },
    stage2: {
      name: 'STAGE 2 (TBD)',
      price: 0,
      perPerson: 0,
      people: 1,
      isTbd: true,
      type: 'single',
      code: 'AP-S2'
    },
    group5: {
      name: 'GROUP PASS (5 PEOPLE)',
      price: 6000,
      perPerson: 1200,
      people: 5,
      type: 'group',
      code: 'AP-GRP5'
    },
    group8: {
      name: 'GROUP PASS (8 PEOPLE)',
      price: 9200,
      perPerson: 1150,
      people: 8,
      type: 'group',
      code: 'AP-GRP8'
    }
  };

  const GST_RATE = 0.18; // 18% GST / entertainment tax

  let currentTier = 'early';
  let currentQty = 1;

  document.addEventListener('DOMContentLoaded', () => {
    initBookingSystem();
    initCategoryTabs();
    initCardSelection();
  });

  function initCategoryTabs() {
    const tabs = document.querySelectorAll('.category-tab');
    const sections = document.querySelectorAll('.ticket-category-section');
    if (!tabs.length || !sections.length) return;

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
          if (cat === 'all' || cat === group) {
            sec.style.display = 'block';
            if (typeof gsap !== 'undefined') {
              gsap.fromTo(sec, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
            }
          } else {
            sec.style.display = 'none';
          }
        });
      });
    });
  }

  function initCardSelection() {
    const cards = document.querySelectorAll('.ticket-card:not(.tbd-card):not(.sold-out-card)');
    cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        // If clicking inside the card but not directly on the CTA button
        if (!e.target.closest('button')) {
          const tier = card.getAttribute('data-tier');
          if (tier && TIERS[tier] && !TIERS[tier].isTbd && !TIERS[tier].isSoldOut) {
            cards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            if (typeof window.openAperoBookingModal === 'function') {
              window.openAperoBookingModal(tier);
            }
          }
        }
      });
    });
  }

  function initBookingSystem() {
    const modal = document.getElementById('bookingModal');
    const closeBtn = document.getElementById('modalCloseBtn');
    const openBtns = document.querySelectorAll('.open-booking-btn');
    const tierSelect = document.getElementById('bookTier');
    const qtyMinus = document.getElementById('qtyMinus');
    const qtyPlus = document.getElementById('qtyPlus');
    const qtyDisplay = document.getElementById('qtyDisplay');
    const bookingForm = document.getElementById('bookingForm');
    const successView = document.getElementById('bookingSuccessView');
    const finishBtn = document.getElementById('btnFinishBooking');

    if (!modal || !bookingForm) return;

    // Open modal from any CTA button
    openBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tier = btn.getAttribute('data-tier') || 'early';
        if (tier === 'stage2' || tier === 'super_early') return; // TBD and SOLD OUT cannot be booked
        openModal(tier);
      });
    });

    window.openAperoBookingModal = openModal;

    function openModal(tier) {
      if (TIERS[tier] && !TIERS[tier].isTbd && !TIERS[tier].isSoldOut) {
        currentTier = tier;
        if (tierSelect) tierSelect.value = tier;
      } else {
        currentTier = 'early';
        if (tierSelect) tierSelect.value = 'early';
      }

      currentQty = 1;
      updateCalculations();

      // Reset views
      bookingForm.style.display = 'flex';
      if (successView) successView.classList.remove('active');

      modal.showModal();

      // Scroll modal to top on every open
      const modalInner = modal.querySelector('.modal-inner');
      if (modalInner) modalInner.scrollTop = 0;

      // GSAP Entrance
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(modal, {
          scale: 0.92,
          opacity: 0,
          y: 20
        }, {
          scale: 1,
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power3.out'
        });
      }
    }

    function closeModal() {
      if (typeof gsap !== 'undefined') {
        gsap.to(modal, {
          scale: 0.95,
          opacity: 0,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: () => {
            modal.close();
          }
        });
      } else {
        modal.close();
      }
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (finishBtn) finishBtn.addEventListener('click', closeModal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      const rect = modal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        closeModal();
      }
    });

    // Tier selection change in dropdown
    if (tierSelect) {
      tierSelect.addEventListener('change', (e) => {
        const selected = e.target.value;
        if (TIERS[selected] && !TIERS[selected].isTbd && !TIERS[selected].isSoldOut) {
          currentTier = selected;
          updateCalculations();
        }
      });
    }

    // Quantity Increment / Decrement
    if (qtyMinus) {
      qtyMinus.addEventListener('click', () => {
        if (currentQty > 1) {
          currentQty--;
          updateCalculations();
        }
      });
    }

    if (qtyPlus) {
      qtyPlus.addEventListener('click', () => {
        if (currentQty < 10) {
          currentQty++;
          updateCalculations();
        }
      });
    }

    // Dynamic Calculations
    function updateCalculations() {
      const tierData = TIERS[currentTier] || TIERS.early;
      const isTbd = !!tierData.isTbd;
      const subtotal = tierData.price * currentQty;
      const tax = Math.round(subtotal * GST_RATE);
      const total = subtotal + tax;

      if (qtyDisplay) qtyDisplay.textContent = currentQty;

      const sumTierName = document.getElementById('sumTierName');
      const sumQtyLabel = document.getElementById('sumQtyLabel');
      const sumPriceLabel = document.getElementById('sumPriceLabel');
      const sumSubtotal = document.getElementById('sumSubtotal');
      const sumTax = document.getElementById('sumTax');
      const sumTotal = document.getElementById('sumTotal');

      if (sumTierName) sumTierName.textContent = tierData.name;
      if (sumQtyLabel) sumQtyLabel.textContent = currentQty;

      if (isTbd) {
        if (sumPriceLabel) sumPriceLabel.textContent = 'TBD';
        if (sumSubtotal) sumSubtotal.textContent = 'TBD';
        if (sumTax) sumTax.textContent = 'TBD';
        if (sumTotal) sumTotal.textContent = 'TBD';
      } else {
        if (sumPriceLabel) {
          sumPriceLabel.textContent = tierData.type === 'group'
            ? `₹${tierData.price.toLocaleString('en-IN')} (₹${tierData.perPerson.toLocaleString('en-IN')}/person)`
            : `₹${tierData.price.toLocaleString('en-IN')}`;
        }
        if (sumSubtotal) sumSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
        if (sumTax) sumTax.textContent = `₹${tax.toLocaleString('en-IN')}`;
        if (sumTotal) sumTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
      }
    }

    // Form Submission & Validation
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('bookName');
      const emailInput = document.getElementById('bookEmail');
      const phoneInput = document.getElementById('bookPhone');
      const submitBtn = document.getElementById('submitBookingBtn');

      if (!nameInput.value.trim() || !emailInput.value.trim() || !phoneInput.value.trim()) {
        alert('Please provide complete reservation details.');
        return;
      }

      const tierData = TIERS[currentTier] || TIERS.early;
      if (tierData.isTbd || tierData.isSoldOut) {
        alert('This ticket tier is currently not available for reservation.');
        return;
      }

      const totalGuests = tierData.people * currentQty;

      const bookingPayload = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
        tier: currentTier,
        tierName: tierData.name,
        category: tierData.type,
        quantity: currentQty,
        totalGuests: totalGuests,
        unitPrice: tierData.price,
        perPersonPrice: tierData.perPerson,
        subtotal: tierData.price * currentQty,
        tax: Math.round(tierData.price * currentQty * GST_RATE),
        total: Math.round(tierData.price * currentQty * (1 + GST_RATE)),
        timestamp: new Date().toISOString()
      };

      // Decoupled API Callback Hook
      if (window.AperoBooking && typeof window.AperoBooking.onBookingSubmit === 'function') {
        window.AperoBooking.onBookingSubmit(bookingPayload);
      }

      // UI Simulation: Loading state
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'ALLOCATING ENCRYPTED PASSES...';

      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;

        const randomRef = `APÉRO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const holderEl = document.getElementById('confirmedHolderName');
        const refEl = document.getElementById('confirmedBookingRef');
        const tierEl = document.getElementById('confirmedTier');

        if (holderEl) holderEl.textContent = bookingPayload.name;
        if (refEl) refEl.textContent = randomRef;
        if (tierEl) {
          tierEl.textContent = tierData.type === 'group'
            ? `${tierData.name} — ${bookingPayload.totalGuests} GUESTS`
            : `${tierData.name} (${bookingPayload.quantity}X)`;
        }

        // Transition to confirmation view
        bookingForm.style.display = 'none';
        if (successView) {
          successView.classList.add('active');
          if (typeof gsap !== 'undefined') {
            gsap.fromTo(successView, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4 });
          }
        }
      }, 1100);
    });
  }

  // Expose global namespace for backend / payment integration
  window.AperoBooking = {
    tiers: TIERS,
    onBookingSubmit: (payload) => {
      console.log('✅ APÉRO BOOKING PAYLOAD READY FOR PAYMENT GATEWAY:', payload);
    }
  };

})();
