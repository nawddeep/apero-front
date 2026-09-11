/**
 * Apéro — Ticket Booking System
 * Multi-Step Booking Terminal:
 * Step 1: Ticket Confirmation & Quantity
 * Step 2: Mask Selection (Select 1 of 4 masks)
 * Step 3: Login / Guest Access Credentials
 * Step 4: Checkout & Order Summary
 * Step 5: Success Pass Voucher
 */

(function () {
  'use strict';

  // Exact Ticket Tier Specifications
  const TIERS = {
    'early-bird': {
      ticketId: 'early-bird',
      ticketName: 'EARLY BIRD',
      name: 'EARLY BIRD',
      price: 1333,
      perPerson: 1333,
      people: 1,
      type: 'individual',
      isSoldOut: false,
      isTbd: false,
      code: 'AP-EB'
    },
    'super-early': {
      ticketId: 'super-early',
      ticketName: 'SUPER EARLY BIRD',
      name: 'SUPER EARLY BIRD',
      price: 1111,
      perPerson: 1111,
      people: 1,
      type: 'individual',
      isSoldOut: true,
      isTbd: false,
      code: 'AP-SEB'
    },
    'stage1': {
      ticketId: 'stage1',
      ticketName: 'STAGE 1',
      name: 'STAGE 1',
      price: 1777,
      perPerson: 1777,
      people: 1,
      type: 'individual',
      isSoldOut: false,
      isTbd: false,
      code: 'AP-S1'
    },
    'stage2': {
      ticketId: 'stage2',
      ticketName: 'STAGE 2',
      name: 'STAGE 2',
      price: 0,
      perPerson: 0,
      people: 1,
      type: 'individual',
      isTbd: true,
      isSoldOut: false,
      code: 'AP-S2'
    },
    'group5': {
      ticketId: 'group5',
      ticketName: 'GROUP OF 5',
      name: 'GROUP OF 5',
      price: 6000,
      perPerson: 1200,
      people: 5,
      type: 'group',
      isSoldOut: false,
      isTbd: false,
      code: 'AP-GRP5'
    },
    'group8': {
      ticketId: 'group8',
      ticketName: 'GROUP OF 8',
      name: 'GROUP OF 8',
      price: 9200,
      perPerson: 1150,
      people: 8,
      type: 'group',
      isSoldOut: false,
      isTbd: false,
      code: 'AP-GRP8'
    }
  };

  // Aliases for compatibility
  TIERS['early'] = TIERS['early-bird'];
  TIERS['super_early'] = TIERS['super-early'];

  const MASKS = {
    'obsidian-veil': {
      id: 'obsidian-veil',
      name: 'OBSIDIAN VEIL',
      tagline: 'MATTE BLACK ARCHIVAL RESIN'
    },
    'crimson-phantom': {
      id: 'crimson-phantom',
      name: 'CRIMSON PHANTOM',
      tagline: 'BLOOD RED METALLIC ACCENT'
    },
    'noir-kinetic': {
      id: 'noir-kinetic',
      name: 'NOIR KINETIC',
      tagline: 'GLOSS GEOMETRIC MESH'
    },
    'cipher-visage': {
      id: 'cipher-visage',
      name: 'CIPHER VISAGE',
      tagline: 'MINIMALIST TITANIUM RIM'
    }
  };

  const GST_RATE = 0.18; // 18% GST / entertainment tax

  // Central Booking State
  const bookingState = {
    ticketId: 'early-bird',
    ticketName: 'EARLY BIRD',
    price: 1333,
    perPerson: 1333,
    quantity: 1,
    selectedMask: 'crimson-phantom',
    selectedMaskName: 'CRIMSON PHANTOM',
    currentStep: 'confirm',
    user: {
      name: '',
      email: '',
      phone: ''
    }
  };

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
        // If clicking on the CTA button, let the button handler handle it
        if (e.target.closest('button')) {
          // Button handler will call openModal, just highlight the card
          cards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          return;
        }
        
        // If clicking inside the card but not on the CTA button
        const tier = card.getAttribute('data-tier');
        const tierData = TIERS[tier];
        if (tierData && !tierData.isTbd && !tierData.isSoldOut) {
          cards.forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          if (typeof window.openAperoBookingModal === 'function') {
            window.openAperoBookingModal(tier);
          }
        }
      });
    });
  }

  function initBookingSystem() {
    const modal = document.getElementById('bookingModal');
    if (!modal) return;

    const closeBtn = document.getElementById('modalCloseBtn');
    const openBtns = document.querySelectorAll('.open-booking-btn');
    const tierSelect = document.getElementById('bookTierSelect');
    const qtyMinus = document.getElementById('qtyMinus');
    const qtyPlus = document.getElementById('qtyPlus');
    const qtyDisplay = document.getElementById('qtyDisplay');

    // Step elements
    const stepPanelConfirm = document.getElementById('stepPanelConfirm');
    const stepPanelMask = document.getElementById('stepPanelMask');
    const stepPanelLogin = document.getElementById('stepPanelLogin');
    const stepPanelCheckout = document.getElementById('stepPanelCheckout');
    const stepPanelSuccess = document.getElementById('stepPanelSuccess');

    const indicatorConfirm = document.getElementById('indicatorConfirm');
    const indicatorMask = document.getElementById('indicatorMask');
    const indicatorLogin = document.getElementById('indicatorLogin');
    const indicatorCheckout = document.getElementById('indicatorCheckout');
    const modalEyebrow = document.getElementById('modalEyebrow');

    // Nav Buttons
    const btnGoToMask = document.getElementById('btnGoToMask');
    const btnBackToConfirm = document.getElementById('btnBackToConfirm');
    const btnGoToLogin = document.getElementById('btnGoToLogin');
    const btnBackToMask = document.getElementById('btnBackToMask');
    const btnGoToCheckout = document.getElementById('btnGoToCheckout');
    const btnBackToLogin = document.getElementById('btnBackToLogin');
    const btnFinalConfirmPayment = document.getElementById('btnFinalConfirmPayment');
    const finishBtn = document.getElementById('btnFinishBooking');

    // Open modal from any CTA button
    openBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tier = btn.getAttribute('data-tier') || 'early-bird';
        if (tier === 'stage2' || tier === 'super-early' || tier === 'super_early') return;
        openModal(tier);
      });
    });

    window.openAperoBookingModal = openModal;

    function openModal(rawTier) {
      let tierKey = rawTier;
      if (rawTier === 'early') tierKey = 'early-bird';
      if (rawTier === 'super_early') tierKey = 'super-early';

      const tierData = TIERS[tierKey] || TIERS['early-bird'];
      if (tierData.isSoldOut || tierData.isTbd) return;

      bookingState.ticketId = tierData.ticketId;
      bookingState.ticketName = tierData.ticketName;
      bookingState.price = tierData.price;
      bookingState.perPerson = tierData.perPerson;
      bookingState.quantity = 1;
      bookingState.selectedMask = 'crimson-phantom';
      bookingState.selectedMaskName = 'CRIMSON PHANTOM';

      if (tierSelect) {
        tierSelect.value = tierData.ticketId;
      }

      updateCalculations();
      goToStep('confirm');

      try {
        modal.showModal();
      } catch (err) {
        modal.setAttribute('open', '');
      }

      const modalInner = modal.querySelector('.modal-inner');
      if (modalInner) modalInner.scrollTop = 0;
    }

    function closeModal() {
      try {
        modal.close();
      } catch (e) {
        modal.removeAttribute('open');
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

    // Step Transition Manager
    function goToStep(step) {
      bookingState.currentStep = step;

      const panels = [stepPanelConfirm, stepPanelMask, stepPanelLogin, stepPanelCheckout, stepPanelSuccess];
      panels.forEach(p => { if (p) p.classList.remove('active'); });

      // Reset indicators
      [indicatorConfirm, indicatorMask, indicatorLogin, indicatorCheckout].forEach(ind => {
        if (ind) ind.classList.remove('active', 'completed');
      });

      if (step === 'confirm') {
        if (stepPanelConfirm) stepPanelConfirm.classList.add('active');
        if (indicatorConfirm) indicatorConfirm.classList.add('active');
        if (modalEyebrow) modalEyebrow.textContent = 'RESERVATION TERMINAL • STEP 01';
      } else if (step === 'mask') {
        if (stepPanelMask) stepPanelMask.classList.add('active');
        if (indicatorConfirm) indicatorConfirm.classList.add('completed');
        if (indicatorMask) indicatorMask.classList.add('active');
        if (modalEyebrow) modalEyebrow.textContent = 'MASQUERADE SELECTION • STEP 02';
      } else if (step === 'login') {
        if (stepPanelLogin) stepPanelLogin.classList.add('active');
        if (indicatorConfirm) indicatorConfirm.classList.add('completed');
        if (indicatorMask) indicatorMask.classList.add('completed');
        if (indicatorLogin) indicatorLogin.classList.add('active');
        if (modalEyebrow) modalEyebrow.textContent = 'ATTENDEE ACCESS • STEP 03';
      } else if (step === 'checkout') {
        if (stepPanelCheckout) stepPanelCheckout.classList.add('active');
        if (indicatorConfirm) indicatorConfirm.classList.add('completed');
        if (indicatorMask) indicatorMask.classList.add('completed');
        if (indicatorLogin) indicatorLogin.classList.add('completed');
        if (indicatorCheckout) indicatorCheckout.classList.add('active');
        if (modalEyebrow) modalEyebrow.textContent = 'FINAL ORDER CONFIRMATION • STEP 04';
        updateCheckoutReview();
      } else if (step === 'success') {
        if (stepPanelSuccess) stepPanelSuccess.classList.add('active');
        [indicatorConfirm, indicatorMask, indicatorLogin, indicatorCheckout].forEach(ind => {
          if (ind) ind.classList.add('completed');
        });
        if (modalEyebrow) modalEyebrow.textContent = 'PASS ALLOCATED • CONFIRMED';
      }

      const modalInner = modal.querySelector('.modal-inner');
      if (modalInner) modalInner.scrollTop = 0;
    }

    // Step 1: Change tier via dropdown
    if (tierSelect) {
      tierSelect.addEventListener('change', (e) => {
        const selectedKey = e.target.value;
        const tierData = TIERS[selectedKey];
        if (tierData && !tierData.isTbd && !tierData.isSoldOut) {
          bookingState.ticketId = tierData.ticketId;
          bookingState.ticketName = tierData.ticketName;
          bookingState.price = tierData.price;
          bookingState.perPerson = tierData.perPerson;
          updateCalculations();
        }
      });
    }

    // Quantity Stepper
    if (qtyMinus) {
      qtyMinus.addEventListener('click', () => {
        if (bookingState.quantity > 1) {
          bookingState.quantity--;
          updateCalculations();
        }
      });
    }

    if (qtyPlus) {
      qtyPlus.addEventListener('click', () => {
        if (bookingState.quantity < 10) {
          bookingState.quantity++;
          updateCalculations();
        }
      });
    }

    function updateCalculations() {
      const tierData = TIERS[bookingState.ticketId] || TIERS['early-bird'];
      const qty = bookingState.quantity;
      const subtotal = tierData.price * qty;
      const tax = Math.round(subtotal * GST_RATE);
      const total = subtotal + tax;

      // Update Step 1 banner
      const confirmPlanName = document.getElementById('confirmPlanName');
      const confirmPlanPrice = document.getElementById('confirmPlanPrice');
      const confirmPlanPerPerson = document.getElementById('confirmPlanPerPerson');
      const confirmPlanTypeLabel = document.getElementById('confirmPlanTypeLabel');

      if (confirmPlanName) confirmPlanName.textContent = tierData.name;
      if (confirmPlanPrice) confirmPlanPrice.textContent = `₹${tierData.price.toLocaleString('en-IN')}`;
      if (confirmPlanPerPerson) {
        confirmPlanPerPerson.textContent = tierData.type === 'group'
          ? `TOTAL (₹${tierData.perPerson.toLocaleString('en-IN')}/PERSON)`
          : '/ PERSON';
      }
      if (confirmPlanTypeLabel) {
        confirmPlanTypeLabel.textContent = tierData.type === 'group'
          ? `GROUP PASS (${tierData.people} GUESTS)`
          : 'SINGLE ENTRY (1 GUEST)';
      }

      // Update Step 1 Order Summary Box
      if (qtyDisplay) qtyDisplay.textContent = qty;
      const sumTierName = document.getElementById('sumTierName');
      const sumQtyLabel = document.getElementById('sumQtyLabel');
      const sumPriceLabel = document.getElementById('sumPriceLabel');
      const sumSubtotal = document.getElementById('sumSubtotal');
      const sumTax = document.getElementById('sumTax');
      const sumTotal = document.getElementById('sumTotal');

      if (sumTierName) sumTierName.textContent = tierData.name;
      if (sumQtyLabel) sumQtyLabel.textContent = qty;
      if (sumPriceLabel) {
        sumPriceLabel.textContent = tierData.type === 'group'
          ? `₹${tierData.price.toLocaleString('en-IN')} (₹${tierData.perPerson.toLocaleString('en-IN')}/person)`
          : `₹${tierData.price.toLocaleString('en-IN')}`;
      }
      if (sumSubtotal) sumSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
      if (sumTax) sumTax.textContent = `₹${tax.toLocaleString('en-IN')}`;
      if (sumTotal) sumTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
    }

    function updateCheckoutReview() {
      const tierData = TIERS[bookingState.ticketId] || TIERS['early-bird'];
      const qty = bookingState.quantity;
      const subtotal = tierData.price * qty;
      const tax = Math.round(subtotal * GST_RATE);
      const total = subtotal + tax;

      const checkoutTierName = document.getElementById('checkoutTierName');
      const checkoutMaskName = document.getElementById('checkoutMaskName');
      const checkoutQty = document.getElementById('checkoutQty');
      const checkoutSubtotal = document.getElementById('checkoutSubtotal');
      const checkoutTax = document.getElementById('checkoutTax');
      const checkoutTotal = document.getElementById('checkoutTotal');

      if (checkoutTierName) checkoutTierName.textContent = `${tierData.name}`;
      if (checkoutMaskName) checkoutMaskName.textContent = `${bookingState.selectedMaskName} (INCLUDED)`;
      if (checkoutQty) {
        checkoutQty.textContent = tierData.type === 'group'
          ? `${qty} Group Pack (${qty * tierData.people} Passes Total)`
          : `${qty} Pass${qty > 1 ? 'es' : ''}`;
      }
      if (checkoutSubtotal) checkoutSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
      if (checkoutTax) checkoutTax.textContent = `₹${tax.toLocaleString('en-IN')}`;
      if (checkoutTotal) checkoutTotal.textContent = `₹${total.toLocaleString('en-IN')}`;
    }

    // Step 2: Mask Selection Interaction
    const maskCards = document.querySelectorAll('.mask-card');
    maskCards.forEach((card) => {
      card.addEventListener('click', () => {
        const maskId = card.getAttribute('data-mask-id');
        if (!maskId || !MASKS[maskId]) return;

        maskCards.forEach(c => {
          c.classList.remove('selected');
          c.setAttribute('aria-checked', 'false');
        });

        card.classList.add('selected');
        card.setAttribute('aria-checked', 'true');

        bookingState.selectedMask = maskId;
        bookingState.selectedMaskName = MASKS[maskId].name;
      });
    });

    // Step Navigation Handlers
    if (btnGoToMask) {
      btnGoToMask.addEventListener('click', () => {
        goToStep('mask');
      });
    }

    if (btnBackToConfirm) {
      btnBackToConfirm.addEventListener('click', () => {
        goToStep('confirm');
      });
    }

    if (btnGoToLogin) {
      btnGoToLogin.addEventListener('click', () => {
        goToStep('login');
      });
    }

    if (btnBackToMask) {
      btnBackToMask.addEventListener('click', () => {
        goToStep('mask');
      });
    }

    if (btnGoToCheckout) {
      btnGoToCheckout.addEventListener('click', () => {
        const nameInput = document.getElementById('loginName');
        const emailInput = document.getElementById('loginEmail');
        const phoneInput = document.getElementById('loginPhone');

        const nameVal = nameInput ? nameInput.value.trim() : '';
        const emailVal = emailInput ? emailInput.value.trim() : '';
        const phoneVal = phoneInput ? phoneInput.value.trim() : '';

        if (!nameVal) {
          alert('Please enter your Full Legal Name.');
          if (nameInput) nameInput.focus();
          return;
        }

        if (!emailVal || !emailVal.includes('@')) {
          alert('Please enter a valid Email Address for pass delivery.');
          if (emailInput) emailInput.focus();
          return;
        }

        if (!phoneVal || phoneVal.length < 8) {
          alert('Please enter a valid Phone Number (+91).');
          if (phoneInput) phoneInput.focus();
          return;
        }

        bookingState.user.name = nameVal;
        bookingState.user.email = emailVal;
        bookingState.user.phone = phoneVal;

        goToStep('checkout');
      });
    }

    if (btnBackToLogin) {
      btnBackToLogin.addEventListener('click', () => {
        goToStep('login');
      });
    }

    // Step 4: Final Confirmation and Ticket Allocation
    if (btnFinalConfirmPayment) {
      btnFinalConfirmPayment.addEventListener('click', () => {
        const originalText = btnFinalConfirmPayment.innerHTML;
        btnFinalConfirmPayment.disabled = true;
        btnFinalConfirmPayment.innerHTML = 'ENCRYPTING &amp; ALLOCATING PASSES...';

        const tierData = TIERS[bookingState.ticketId] || TIERS['early-bird'];
        const totalGuests = tierData.people * bookingState.quantity;

        const bookingPayload = {
          ticketId: bookingState.ticketId,
          ticketName: bookingState.ticketName,
          price: tierData.price,
          perPerson: tierData.perPerson,
          quantity: bookingState.quantity,
          totalGuests: totalGuests,
          selectedMask: bookingState.selectedMask,
          maskName: bookingState.selectedMaskName,
          user: { ...bookingState.user },
          subtotal: tierData.price * bookingState.quantity,
          tax: Math.round(tierData.price * bookingState.quantity * GST_RATE),
          total: Math.round(tierData.price * bookingState.quantity * (1 + GST_RATE)),
          timestamp: new Date().toISOString()
        };

        if (window.AperoBooking && typeof window.AperoBooking.onBookingSubmit === 'function') {
          window.AperoBooking.onBookingSubmit(bookingPayload);
        }

        setTimeout(() => {
          btnFinalConfirmPayment.disabled = false;
          btnFinalConfirmPayment.innerHTML = originalText;

          const randomRef = `APÉRO-2026-${Math.floor(1000 + Math.random() * 9000)}`;
          const holderEl = document.getElementById('confirmedHolderName');
          const refEl = document.getElementById('confirmedBookingRef');
          const tierEl = document.getElementById('confirmedTier');
          const maskEl = document.getElementById('confirmedMask');

          if (holderEl) holderEl.textContent = bookingState.user.name || 'GUEST ATTENDEE';
          if (refEl) refEl.textContent = randomRef;
          if (tierEl) {
            tierEl.textContent = tierData.type === 'group'
              ? `${tierData.name} (${totalGuests} GUESTS)`
              : `${tierData.name} (${bookingState.quantity}X)`;
          }
          if (maskEl) {
            maskEl.textContent = bookingState.selectedMaskName;
          }

          goToStep('success');
        }, 850);
      });
    }

    // Auto-open modal if tier requested in URL (e.g. ?tier=early-bird or #early-bird)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let requestedTier = urlParams.get('tier') || urlParams.get('plan') || window.location.hash.replace('#', '');
      if (requestedTier === 'early') requestedTier = 'early-bird';
      if (requestedTier && TIERS[requestedTier] && !TIERS[requestedTier].isSoldOut && !TIERS[requestedTier].isTbd) {
        setTimeout(() => openModal(requestedTier), 150);
      }
    } catch (e) {
      // safe fallback
    }
  }

  // Expose global namespace
  window.AperoBooking = {
    tiers: TIERS,
    masks: MASKS,
    getState: () => ({ ...bookingState }),
    selectTicket: (tierId) => {
      if (typeof window.openAperoBookingModal === 'function') {
        window.openAperoBookingModal(tierId);
      }
    },
    onBookingSubmit: (payload) => {
      console.log('✅ APÉRO TICKET & MASK ALLOCATED:', payload);
    }
  };

})();
