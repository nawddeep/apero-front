/**
 * Apéro — Main Application Script
 * Core UI interactions, countdown timer, navigation
 */

(function () {
  'use strict';

  // --- Configuration ---
  const EVENT_DATE = new Date('2026-09-26T18:00:00+05:30').getTime();

  // --- Initialize when DOM is ready ---
  document.addEventListener('DOMContentLoaded', () => {
    initHeroVideoPlayback();
    initCountdownTimer();
    initMobileNav();
    initDirectionsModal();
    initHeaderScrollEffect();
  });

  /* ==========================================================================
     Live Countdown Timer to 26 September 2026
     ========================================================================== */
  function initCountdownTimer() {
    const daysEl = document.getElementById('cdDays');
    const hoursEl = document.getElementById('cdHours');
    const minsEl = document.getElementById('cdMins');
    const secsEl = document.getElementById('cdSecs');

    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    function updateTimer() {
      const now = Date.now();
      const difference = EVENT_DATE - now;

      if (difference <= 0) {
        daysEl.textContent = '000';
        hoursEl.textContent = '00';
        minsEl.textContent = '00';
        secsEl.textContent = '00';
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      daysEl.textContent  = String(days);
      hoursEl.textContent = String(hours);
      minsEl.textContent  = String(minutes);
      secsEl.textContent  = String(seconds);
    }

    updateTimer();
    setInterval(updateTimer, 1000);
  }

  /* ==========================================================================
     Mobile Navigation Drawer
     ========================================================================== */
  function initMobileNav() {
    const menuToggle = document.getElementById('menuToggle');
    const mobileDrawer = document.getElementById('mobileDrawer');
    const mobileLinks = document.querySelectorAll('.mobile-nav-link');

    if (!menuToggle || !mobileDrawer) return;

    function toggleMenu() {
      const isOpen = menuToggle.classList.toggle('open');
      mobileDrawer.classList.toggle('active');
      menuToggle.setAttribute('aria-expanded', isOpen);
      mobileDrawer.setAttribute('aria-hidden', !isOpen);

      if (isOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    }

    menuToggle.addEventListener('click', toggleMenu);

    mobileLinks.forEach((link) => {
      link.addEventListener('click', () => {
        if (mobileDrawer.classList.contains('active')) {
          toggleMenu();
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileDrawer.classList.contains('active')) {
        toggleMenu();
      }
    });
  }

  /* ==========================================================================
     Directions Modal
     ========================================================================== */
  function initDirectionsModal() {
    const modal = document.getElementById('venueDirectionsModal');
    const openBtn = document.getElementById('btnOpenDirections');
    const closeBtn = document.getElementById('closeDirectionsBtn');

    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', () => {
      modal.showModal();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.close();
      });
    }

    modal.addEventListener('click', (e) => {
      const rect = modal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        modal.close();
      }
    });
  }

  /* ==========================================================================
     Header Scroll Blur & Background Switch
     ========================================================================== */
  function initHeaderScrollEffect() {
    const header = document.getElementById('mainNav');
    if (!header) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 60) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  /* ==========================================================================
     Hero Background Video Auto-Playback Controller
     Ensures continuous, error-free muted loop playback on entry across all browsers
     ========================================================================== */
  function initHeroVideoPlayback() {
    const video = document.getElementById('heroVideo');
    if (!video) return;

    // Strict browser compatibility flags for autoplay
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    function triggerPlay() {
      if (!video) return;
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // If browser restricted autoplay, play on the very first user gesture
          function userGestureHandler() {
            video.muted = true;
            video.play().catch(() => {});
            ['click', 'touchstart', 'pointerdown', 'keydown', 'scroll'].forEach((evt) => {
              window.removeEventListener(evt, userGestureHandler);
            });
          }
          ['click', 'touchstart', 'pointerdown', 'keydown', 'scroll'].forEach((evt) => {
            window.addEventListener(evt, userGestureHandler, { once: true, passive: true });
          });
        });
      }
    }

    // Attempt playback immediately and on readiness events
    triggerPlay();
    video.addEventListener('loadeddata', triggerPlay);
    video.addEventListener('canplay', triggerPlay);
    video.addEventListener('canplaythrough', triggerPlay);

    // If tab switches or window regains focus, resume if paused
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && video.paused) {
        triggerPlay();
      }
    });
    window.addEventListener('focus', () => {
      if (video.paused) {
        triggerPlay();
      }
    });

    // Expose for preloader / animation triggers
    window.startHeroVideo = triggerPlay;
  }

})();
