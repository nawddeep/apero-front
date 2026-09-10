/**
 * Apéro — Ticket Booking System
 * Modal controller, live pricing calculation, form validation, and decoupled API hook
 */

(function () {
  'use strict';

  // Ticket Tier Specifications
  const TIERS = {
    early: {
      name: 'EARLY BIRD PASS',
      price: 999,
      code: 'AP-EB'
    },
    general: {
      name: 'GENERAL ADMISSION',
      price: 1499,
      code: 'AP-GEN'
    },
    vip: {
      name: 'VIP BACKSTAGE PASS',
      price: 2999,
      code: 'AP-VIP'
    }
  };

  const GST_RATE = 0.18; // 18% GST / entertainment tax

  let currentTier = 'general';
  let currentQty = 1;

  document.addEventListener('DOMContentLoaded', () => {
    initBookingSystem();
  });

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
        const tier = btn.getAttribute('data-tier') || 'general';
        openModal(tier);
      });
    });

    function openModal(tier) {
      if (TIERS[tier]) {
        currentTier = tier;
        if (tierSelect) tierSelect.value = tier;
      }
      currentQty = 1;
      updateCalculations();

      // Reset views
      bookingForm.style.display = 'flex';
      if (successView) successView.classList.remove('active');

      modal.showModal();

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

    // Tier selection change
    if (tierSelect) {
      tierSelect.addEventListener('change', (e) => {
        currentTier = e.target.value;
        updateCalculations();
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
      const tierData = TIERS[currentTier] || TIERS.general;
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
      if (sumPriceLabel) sumPriceLabel.textContent = `₹${tierData.price.toLocaleString('en-IN')}`;
      if (sumSubtotal) sumSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
      if (sumTax) sumTax.textContent = `₹${tax.toLocaleString('en-IN')}`;
      if (sumTotal) sumTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
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

      const bookingPayload = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
        tier: currentTier,
        tierName: TIERS[currentTier].name,
        quantity: currentQty,
        unitPrice: TIERS[currentTier].price,
        subtotal: TIERS[currentTier].price * currentQty,
        tax: Math.round(TIERS[currentTier].price * currentQty * GST_RATE),
        total: Math.round(TIERS[currentTier].price * currentQty * (1 + GST_RATE)),
        timestamp: new Date().toISOString()
      };

      // Decoupled API Callback Hook for future Payment Gateway / Backend
      if (window.AperoBooking && typeof window.AperoBooking.onBookingSubmit === 'function') {
        window.AperoBooking.onBookingSubmit(bookingPayload);
      }

      // UI Simulation: Loading state
      const originalBtnText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'ALLOCATING ENCRYPTED PASS...';

      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;

        // Generate realistic reference
        const randomRef = `APÉRO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const holderEl = document.getElementById('confirmedHolderName');
        const refEl = document.getElementById('confirmedBookingRef');
        const tierEl = document.getElementById('confirmedTier');

        if (holderEl) holderEl.textContent = bookingPayload.name;
        if (refEl) refEl.textContent = randomRef;
        if (tierEl) tierEl.textContent = `${bookingPayload.tierName} (${bookingPayload.quantity}X)`;

        // Transition to confirmation view
        bookingForm.style.display = 'none';
        if (successView) {
          successView.classList.add('active');
          if (typeof gsap !== 'undefined') {
            gsap.fromTo(successView, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4 });
          }
        }
      }, 1200);
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
