/**
 * Apéro — Mobile Optimizations
 * Mobile-specific enhancements for iOS and Android
 */

(function () {
  'use strict';

  // Only run mobile optimizations on mobile devices
  const isMobile = window.innerWidth <= 768;
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  if (!isMobile && !isTouchDevice) return;

  document.addEventListener('DOMContentLoaded', () => {
    initMobileStickyCta();
    optimizeMobileScrolling();
    preventZoomOnInputFocus();
    optimizeMobileModals();
    disableCursorEffects();
    handleSafeAreas();
  });

  /* ==========================================================================
     Mobile Sticky CTA (Bottom Book Ticket Button)
     Shows after user scrolls past hero section
     ========================================================================== */
  function initMobileStickyCta() {
    // Only activate on mobile widths
    if (window.innerWidth > 768) return;

    const stickyCta = document.getElementById('mobileStickyCta');
    if (!stickyCta) return;

    let ticking = false;

    function updateStickyCta() {
      const scrollY = window.scrollY;
      const heroHeight = window.innerHeight;
      const finalCta = document.getElementById('finalCta');
      const bookingModal = document.getElementById('bookingModal');

      // Hide if any modal is open
      if (bookingModal && bookingModal.hasAttribute('open')) {
        stickyCta.classList.remove('visible');
        ticking = false;
        return;
      }

      // Show sticky CTA after scrolling past hero
      let shouldShow = scrollY > heroHeight * 0.8;

      // Hide when final CTA section is in viewport
      if (finalCta) {
        const finalRect = finalCta.getBoundingClientRect();
        if (finalRect.top < window.innerHeight) {
          shouldShow = false;
        }
      }

      if (shouldShow) {
        stickyCta.classList.add('visible');
      } else {
        stickyCta.classList.remove('visible');
      }

      ticking = false;
    }

    function requestTick() {
      if (!ticking) {
        requestAnimationFrame(updateStickyCta);
        ticking = true;
      }
    }

    window.addEventListener('scroll', requestTick, { passive: true });
    updateStickyCta(); // Initial check
  }

  /* ==========================================================================
     Optimize Mobile Scrolling Performance
     ========================================================================== */
  function optimizeMobileScrolling() {
    // Disable Lenis on mobile — native touch scrolling performs better
    // Lenis is already disabled in animations.js for <= 768px
    // This ensures Lenis is paused when modal opens
    const bookingModal = document.getElementById('bookingModal');
    if (!bookingModal) return;

    // Pause Lenis and restore on modal open/close
    const observer = new MutationObserver(() => {
      if (bookingModal.hasAttribute('open')) {
        // Modal opened — pause Lenis if active, lock body scroll
        if (window.lenisInstance && typeof window.lenisInstance.stop === 'function') {
          window.lenisInstance.stop();
        }
        document.documentElement.style.overflow = 'hidden';
      } else {
        // Modal closed — resume Lenis if it was active
        if (window.lenisInstance && typeof window.lenisInstance.start === 'function') {
          window.lenisInstance.start();
        }
        document.documentElement.style.overflow = '';
      }
    });

    observer.observe(bookingModal, { attributes: true, attributeFilter: ['open'] });
  }

  /* ==========================================================================
     Prevent Zoom on Input Focus (iOS)
     Ensure inputs are 16px to prevent automatic zoom
     ========================================================================== */
  function preventZoomOnInputFocus() {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      // Ensure font-size is at least 16px to prevent iOS zoom
      const computedStyle = window.getComputedStyle(input);
      const fontSize = parseFloat(computedStyle.fontSize);

      if (fontSize < 16) {
        input.style.fontSize = '16px';
      }

      // Set appropriate mobile keyboard types
      if (input.type === 'email' && !input.getAttribute('inputmode')) {
        input.setAttribute('inputmode', 'email');
      } else if (input.type === 'tel' && !input.getAttribute('inputmode')) {
        input.setAttribute('inputmode', 'tel');
      } else if (input.type === 'number' && !input.getAttribute('inputmode')) {
        input.setAttribute('inputmode', 'numeric');
      }
    });
  }

  /* ==========================================================================
     Optimize Mobile Modals
     Prevent body scroll when modal is open, handle backdrop dismiss
     ========================================================================== */
  function optimizeMobileModals() {
    const bookingModal = document.getElementById('bookingModal');
    const directionsModal = document.getElementById('venueDirectionsModal');

    // Helper: save and restore scroll position to prevent iOS jump
    let savedScrollY = 0;

    function lockBodyScroll() {
      savedScrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = '100%';
    }

    function unlockBodyScroll() {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, savedScrollY);
    }

    // Watch booking modal open/close
    if (bookingModal) {
      // Allow closing by tapping outside modal content on mobile
      bookingModal.addEventListener('click', (e) => {
        if (e.target === bookingModal) {
          bookingModal.close();
        }
      });

      const observer = new MutationObserver(() => {
        if (bookingModal.hasAttribute('open')) {
          lockBodyScroll();
          // Auto-scroll modal body to top when opened
          const modalInner = bookingModal.querySelector('.modal-inner');
          if (modalInner) modalInner.scrollTop = 0;
        } else {
          unlockBodyScroll();
        }
      });
      observer.observe(bookingModal, { attributes: true, attributeFilter: ['open'] });
    }

    // Watch directions modal
    if (directionsModal) {
      directionsModal.addEventListener('click', (e) => {
        if (e.target === directionsModal) {
          directionsModal.close();
        }
      });

      const dirObserver = new MutationObserver(() => {
        if (directionsModal.hasAttribute('open')) {
          lockBodyScroll();
        } else {
          unlockBodyScroll();
        }
      });
      dirObserver.observe(directionsModal, { attributes: true, attributeFilter: ['open'] });
    }
  }

  /* ==========================================================================
     Disable Cursor Effects on Touch Devices
     ========================================================================== */
  function disableCursorEffects() {
    if (!isTouchDevice) return;

    // Disable artist hover preview on touch devices
    const artistPreview = document.getElementById('artistPreview');
    if (artistPreview) {
      artistPreview.style.display = 'none';
    }

    // Tag the document for touch-specific CSS targeting
    document.body.classList.add('touch-device');
  }

  /* ==========================================================================
     Detect and Handle Mobile Safe Areas (iOS notch)
     ========================================================================== */
  function handleSafeAreas() {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (iOS) {
      document.documentElement.classList.add('ios-device');
    }
  }

  /* ==========================================================================
     Optimize Video Playback on Mobile
     ========================================================================== */
  window.addEventListener('load', () => {
    const heroVideo = document.getElementById('heroVideo');
    if (!heroVideo) return;

    // Ensure video plays inline on iOS Safari
    heroVideo.setAttribute('playsinline', '');
    heroVideo.setAttribute('webkit-playsinline', '');
    heroVideo.playsInline = true;

    // On mobile, preload only metadata initially; full buffer loads naturally
    if (window.innerWidth <= 768) {
      if (heroVideo.readyState === 0) {
        // Only set if not yet loading — don't interrupt active loads
        heroVideo.setAttribute('preload', 'auto');
      }
    }
  });

  /* ==========================================================================
     Orientation Change Handling
     Re-check CTA visibility and safe areas on orientation flip
     ========================================================================== */
  window.addEventListener('orientationchange', () => {
    // Small delay to let viewport stabilize
    setTimeout(() => {
      const stickyCta = document.getElementById('mobileStickyCta');
      if (stickyCta) {
        // Force re-evaluation of visibility
        stickyCta.classList.remove('visible');
        window.dispatchEvent(new Event('scroll'));
      }
    }, 300);
  });

})();
