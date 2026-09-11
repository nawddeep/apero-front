/**
 * Apéro — Animation Engine
 * GSAP, ScrollTrigger, and Lenis Smooth Scroll Integration
 */

(function () {
  'use strict';

  // Reliable Scroll Restoration Fix: Ensure page unconditionally starts at top (0, 0)
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  if (!window.location.hash) {
    window.scrollTo(0, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.hash) {
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (!window.location.hash && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  });

  // Wait for window load to ensure assets & libraries are ready
  window.addEventListener('load', () => {
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
    initLenis();
    initPreloaderAndHero();
    initScrollAnimations();
    initArtistHover();
  });

  let lenisInstance = null;

  /* ==========================================================================
     1. Lenis Smooth Scroll Setup
     ========================================================================== */
  function initLenis() {
    if (typeof Lenis === 'undefined') {
      console.warn('Lenis library not loaded, falling back to native scroll.');
      return;
    }

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // Disable Lenis on mobile for better native scroll performance
    if (window.innerWidth <= 768) {
      return;
    }

    lenisInstance = new Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.5,
      infinite: false
    });

    window.lenisInstance = lenisInstance;

    // Prevent Lenis from preserving unexpected previous scroll position at bottom
    if (!window.location.hash) {
      lenisInstance.scrollTo(0, { immediate: true });
    }

    // Synchronize Lenis with GSAP ScrollTrigger
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);

      if (typeof ScrollTrigger.clearScrollMemory === 'function') {
        ScrollTrigger.clearScrollMemory('manual');
      }

      lenisInstance.on('scroll', ScrollTrigger.update);

      gsap.ticker.add((time) => {
        lenisInstance.raf(time * 1000);
      });

      gsap.ticker.lagSmoothing(0);
    } else {
      function raf(time) {
        lenisInstance.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    }
  }

  /* ==========================================================================
     2. Preloader & Cinematic Hero Entrance
     ========================================================================== */
  function initPreloaderAndHero() {
    const preloader = document.getElementById('preloader');
    const counterEl = document.getElementById('preloaderCounter');
    const barEl = document.getElementById('preloaderBar');
    const heroVideo = document.getElementById('heroVideo');

    // Fallback if GSAP is unavailable
    if (typeof gsap === 'undefined') {
      if (typeof window.startHeroVideo === 'function') {
        window.startHeroVideo();
      } else if (heroVideo) {
        heroVideo.muted = true;
        heroVideo.play().catch(() => {});
      }
      if (window.AperoAudio && typeof window.AperoAudio.startAt99Percent === 'function') {
        window.AperoAudio.startAt99Percent();
      }
      if (preloader) {
        setTimeout(() => {
          preloader.style.opacity = '0';
          setTimeout(() => preloader.style.display = 'none', 500);
        }, 800);
      }
      return;
    }

    const counter = { val: 0 };
    let audioStarted = false;
    const tl = gsap.timeline({
      defaults: { ease: 'power3.inOut' }
    });

    // Animate counter from 00% to 100%
    tl.to(counter, {
      val: 100,
      duration: 1.6,
      ease: 'power2.out',
      onUpdate: () => {
        const rounded = Math.floor(counter.val);
        if (counterEl) {
          counterEl.textContent = `${String(rounded).padStart(2, '0')}%`;
        }
        if (barEl) {
          barEl.style.width = `${rounded}%`;
        }
        // Start background music smoothly at approximately 99% loading
        if (rounded >= 99 && !audioStarted) {
          audioStarted = true;
          if (window.AperoAudio && typeof window.AperoAudio.startAt99Percent === 'function') {
            window.AperoAudio.startAt99Percent();
          }
        }
      }
    })
    .to('#preloaderLogo', {
      scale: 1.06,
      letterSpacing: '0.2em',
      duration: 0.6,
      ease: 'power2.out'
    }, '-=0.5')
    .to(preloader, {
      yPercent: -100,
      duration: 1.1,
      ease: 'expo.inOut',
      onStart: () => {
        if (typeof window.startHeroVideo === 'function') {
          window.startHeroVideo();
        } else if (heroVideo) {
          heroVideo.muted = true;
          heroVideo.play().catch(() => {});
        }
      },
      onComplete: () => {
        if (preloader) preloader.style.display = 'none';
        if (!window.location.hash) {
          if (lenisInstance) {
            lenisInstance.scrollTo(0, { immediate: true });
          } else {
            window.scrollTo(0, 0);
          }
        }
        if (typeof window.startHeroVideo === 'function') {
          window.startHeroVideo();
        } else if (heroVideo) {
          heroVideo.muted = true;
          heroVideo.play().catch(() => {});
        }
      }
    });

    // Hero Entrance — reduce filter intensity on mobile for better performance
    const isMobileAnim = window.innerWidth <= 768;
    tl
    .fromTo(heroVideo, {
      scale: isMobileAnim ? 1.04 : 1.14,
      filter: isMobileAnim ? 'brightness(60%)' : 'contrast(120%) brightness(50%)'
    }, {
      scale: 1.0,
      filter: isMobileAnim ? 'brightness(85%)' : 'contrast(110%) brightness(85%)',
      duration: isMobileAnim ? 1.5 : 2.2,
      ease: 'power2.out'
    }, '-=0.8')
    .from('#mainNav', {
      y: -30,
      opacity: 0,
      duration: 0.9,
      ease: 'power2.out'
    }, '-=1.6')
    .from('.hero-title', {
      y: isMobileAnim ? 30 : 60,
      opacity: 0,
      duration: isMobileAnim ? 0.9 : 1.3,
      ease: 'power4.out'
    }, '-=1.2')
    .from('.hero-tagline', {
      y: 25,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out'
    }, '-=0.9')
    .from('.hero-meta', {
      y: 20,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out'
    }, '-=0.7');
  }

  /* ==========================================================================
     3. Scroll-Driven Animations via ScrollTrigger
     ========================================================================== */
  function initScrollAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // --- Statement Text Scrub Reveal ---
    const words = document.querySelectorAll('.statement-headline .reveal-word');
    if (words.length > 0) {
      gsap.fromTo(words, {
        opacity: 0.15,
        y: 10
      }, {
        opacity: 1,
        y: 0,
        stagger: 0.08,
        ease: 'none',
        scrollTrigger: {
          trigger: '#about',
          start: 'top 75%',
          end: 'top 20%',
          scrub: 1.2
        }
      });
    }

    // --- Experience Cards Stagger Entrance ---
    const expCards = document.querySelectorAll('.experience-card');
    if (expCards.length > 0) {
      gsap.from(expCards, {
        y: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.experience-grid',
          start: 'top 85%'
        }
      });
    }

    // --- Countdown Section Entrance ---
    const countdownBoxes = document.querySelectorAll('.countdown-box');
    if (countdownBoxes.length > 0) {
      gsap.from(countdownBoxes, {
        scale: 0.92,
        opacity: 0,
        stagger: 0.1,
        duration: 0.9,
        ease: 'back.out(1.2)',
        scrollTrigger: {
          trigger: '#countdown',
          start: 'top 80%'
        }
      });
    }

    // --- Artist Lineup / Announcement Entrance ---
    const artistRows = document.querySelectorAll('.artist-row');
    const announcementContent = document.querySelector('.announcement-content');
    
    if (artistRows.length > 0) {
      gsap.from(artistRows, {
        x: -40,
        opacity: 0,
        stagger: 0.12,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.artists-list',
          start: 'top 80%'
        }
      });
    } else if (announcementContent) {
      gsap.from(announcementContent.children, {
        y: 30,
        opacity: 0,
        stagger: 0.15,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.artists-announcement',
          start: 'top 80%'
        }
      });
    }

    // --- Venue Image Parallax (desktop only — too janky on mobile) ---
    const venueImg = document.querySelector('.venue-image');
    if (venueImg && !isMobile) {
      gsap.to(venueImg, {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: {
          trigger: '#venue',
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    }

    // --- Ticket Passes 3D Lift Entrance ---
    const ticketCards = document.querySelectorAll('.ticket-card');
    if (ticketCards.length > 0) {
      gsap.from(ticketCards, {
        y: 60,
        opacity: 0,
        stagger: 0.2,
        duration: 1.2,
        ease: 'power4.out',
        scrollTrigger: {
          trigger: '#tickets',
          start: 'top 75%'
        }
      });
    }

    // --- Gallery Parallax Elements ---
    const galleryItems = document.querySelectorAll('.gallery-item');
    const isMobile = window.innerWidth <= 768;
    
    galleryItems.forEach((item, index) => {
      // Reduce parallax intensity on mobile for better performance
      const speed = isMobile ? -10 : ((index % 2 === 0) ? -20 : -35);
      const img = item.querySelector('.gallery-img');
      if (img) {
        gsap.to(img, {
          yPercent: speed,
          ease: 'none',
          scrollTrigger: {
            trigger: item,
            start: 'top bottom',
            end: 'bottom top',
            scrub: isMobile ? 0.5 : 1
          }
        });
      }
    });

    // --- Final CTA Entrance ---
    const finalContent = document.querySelector('.final-cta-content');
    if (finalContent) {
      gsap.from(finalContent.children, {
        y: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '#finalCta',
          start: 'top 75%'
        }
      });
    }
  }

  /* ==========================================================================
     4. Interactive Artist Hover Preview (Desktop)
     ========================================================================== */
  function initArtistHover() {
    const preview = document.getElementById('artistPreview');
    const previewImg = document.getElementById('artistPreviewImg');
    const artistRows = document.querySelectorAll('.artist-row');

    if (!preview || !previewImg || artistRows.length === 0) return;

    if (window.matchMedia('(pointer: coarse)').matches) return;

    // Use GSAP quickTo for ultra-smooth 60fps tracking
    const setX = gsap.quickTo(preview, 'x', { duration: 0.35, ease: 'power3.out' });
    const setY = gsap.quickTo(preview, 'y', { duration: 0.35, ease: 'power3.out' });

    window.addEventListener('mousemove', (e) => {
      // Offset preview slightly so cursor doesn't obscure it
      setX(e.clientX + 40);
      setY(e.clientY - 60);
    });

    artistRows.forEach((row) => {
      row.addEventListener('mouseenter', () => {
        const imgSrc = row.getAttribute('data-img');
        if (imgSrc) {
          previewImg.src = imgSrc;
        }

        gsap.killTweensOf(preview);
        gsap.to(preview, {
          opacity: 1,
          scale: 1,
          duration: 0.35,
          ease: 'power2.out',
          overwrite: 'auto'
        });
      });

      row.addEventListener('mouseleave', () => {
        gsap.killTweensOf(preview);
        gsap.to(preview, {
          opacity: 0,
          scale: 0.85,
          duration: 0.25,
          ease: 'power2.in',
          overwrite: 'auto'
        });
      });
    });
  }

})();
