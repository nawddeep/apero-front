/**
 * Apéro — Background Audio Controller
 *
 * Behavior:
 * - Default ON for first-time visitors (no saved preference).
 * - Persists user's explicit ON/OFF preference via localStorage.
 * - Autoplay attempted immediately; if browser blocks it, waits for
 *   first user gesture then respects the saved preference.
 * - Browser autoplay restriction is NEVER treated as a user preference.
 * - Only one audio instance ever exists.
 */

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const AUDIO_CONFIG = {
    src: 'assets/audio/apero.mp3',
    volume: 0.6,
    fadeDuration: 2.2,        // Initial fade-in (seconds)
    fadeDurationToggle: 0.8   // Manual toggle fade (seconds)
  };

  const STORAGE_KEY = 'aperoMusicPreference'; // localStorage key

  // ============================================================
  // STATE
  // ============================================================
  let audio = null;                 // Single HTMLAudioElement instance
  let isPlaying = false;            // True when audio is actively playing
  let gestureUnlockActive = false;  // True while waiting for gesture unlock
  let activeFadeTween = null;

  const volumeProxy = { val: 0 };   // GSAP animates this object

  // ============================================================
  // PREFERENCE HELPERS
  // localStorage only; never sessionStorage.
  // We read preference before touching audio state.
  // ============================================================
  function getSavedPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY); // "on" | "off" | null
    } catch (e) {
      return null; // Private browsing may throw — treat as no preference
    }
  }

  function savePreference(value) {
    // Only called on explicit user action (not on autoplay block)
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) { /* ignore quota errors */ }
  }

  function wantsMusicOn() {
    const pref = getSavedPreference();
    // null = first visit → default ON
    // "on"  → ON
    // "off" → OFF
    return pref !== 'off';
  }

  // ============================================================
  // AUDIO INSTANCE (singleton)
  // ============================================================
  function getAudio() {
    if (audio) return audio;

    audio = new Audio();
    audio.src = AUDIO_CONFIG.src;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0; // Always start silent; GSAP fades it in

    return audio;
  }

  // ============================================================
  // VOLUME FADE
  // ============================================================
  function fadeVolumeTo(targetVol, duration, onComplete) {
    if (activeFadeTween) {
      activeFadeTween.kill();
      activeFadeTween = null;
    }

    const sound = getAudio();

    if (typeof gsap !== 'undefined') {
      activeFadeTween = gsap.to(volumeProxy, {
        val: targetVol,
        duration: duration,
        ease: 'power2.out',
        onUpdate: () => {
          sound.volume = Math.max(0, Math.min(1, volumeProxy.val));
        },
        onComplete: () => {
          activeFadeTween = null;
          if (typeof onComplete === 'function') onComplete();
        }
      });
    } else {
      sound.volume = targetVol;
      volumeProxy.val = targetVol;
      if (typeof onComplete === 'function') onComplete();
    }
  }

  // ============================================================
  // PLAY — internal, never saves preference
  // ============================================================
  function attemptPlay(onSuccess, onBlocked) {
    const sound = getAudio();
    sound.volume = 0;
    volumeProxy.val = 0;

    const p = sound.play();
    if (p === undefined) {
      // Legacy browser — assume success
      isPlaying = true;
      if (typeof onSuccess === 'function') onSuccess();
      return;
    }

    p.then(() => {
      isPlaying = true;
      if (typeof onSuccess === 'function') onSuccess();
    }).catch(() => {
      isPlaying = false;
      if (typeof onBlocked === 'function') onBlocked();
    });
  }

  // ============================================================
  // PAUSE — internal, never saves preference
  // ============================================================
  function pauseAudio(onComplete) {
    const sound = getAudio();
    fadeVolumeTo(0, AUDIO_CONFIG.fadeDurationToggle, () => {
      sound.pause();
      isPlaying = false;
      if (typeof onComplete === 'function') onComplete();
    });
  }

  // ============================================================
  // GESTURE UNLOCK
  // Registered when autoplay is blocked.
  // On first user interaction, re-checks saved preference and acts.
  // IMPORTANT: does NOT change the saved preference.
  // ============================================================
  function setupGestureUnlock() {
    if (gestureUnlockActive) return;
    gestureUnlockActive = true;

    const EVENTS = ['click', 'touchstart', 'pointerdown', 'keydown'];

    function handleUnlock() {
      gestureUnlockActive = false;
      EVENTS.forEach(e => document.removeEventListener(e, handleUnlock));

      // Re-read preference — user may have toggled during the blocked window
      if (!wantsMusicOn()) return; // User explicitly OFF — do not start

      const sound = getAudio();
      sound.volume = 0;
      volumeProxy.val = 0;

      const p = sound.play();
      if (p !== undefined) {
        p.then(() => {
          isPlaying = true;
          updateUI(true);
          fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDuration);
        }).catch(() => {
          // Still blocked — silently give up; user has the toggle button
        });
      }
    }

    EVENTS.forEach(e =>
      document.addEventListener(e, handleUnlock, { once: true, passive: true })
    );
  }

  // ============================================================
  // BOOT — called once at DOMContentLoaded
  // ============================================================
  function boot() {
    if (!wantsMusicOn()) {
      // Saved preference is OFF — do not start, do not register gesture unlock
      updateUI(false);
      return;
    }

    // Preference is ON (or first visit) — attempt autoplay
    attemptPlay(
      /* onSuccess */ () => {
        updateUI(true);
        fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDuration);
      },
      /* onBlocked */ () => {
        // Browser blocked autoplay.
        // Do NOT change saved preference.
        // Show UI as OFF visually (since nothing is playing yet),
        // and register gesture unlock to start as soon as user interacts.
        updateUI(false);
        setupGestureUnlock();
      }
    );
  }

  // ============================================================
  // PUBLIC TOGGLE — called when user clicks the sound button
  // This is the ONLY place we save preference.
  // ============================================================
  function toggleSound() {
    // Cancel any pending gesture unlock — user is explicitly controlling now
    gestureUnlockActive = false;

    if (isPlaying) {
      // User is turning music OFF
      savePreference('off');
      updateUI(false);
      pauseAudio();
    } else {
      // User is turning music ON
      savePreference('on');
      updateUI(true);

      const sound = getAudio();
      sound.volume = 0;
      volumeProxy.val = 0;

      if (sound.paused) {
        const p = sound.play();
        if (p !== undefined) {
          p.then(() => {
            isPlaying = true;
            fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDurationToggle);
          }).catch(() => {
            // Unexpected block — update UI
            isPlaying = false;
            updateUI(false);
          });
        }
      } else {
        isPlaying = true;
        fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDurationToggle);
      }
    }
  }

  // ============================================================
  // UI SYNC
  // ============================================================
  function updateUI(active) {
    const btn = document.getElementById('soundToggle');
    const text = document.getElementById('soundText');
    if (!btn) return;

    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      btn.classList.add('playing');
      if (text) text.textContent = 'SOUND ON';
    } else {
      btn.classList.remove('playing');
      if (text) text.textContent = 'SOUND OFF';
    }
  }

  function initToggleButton() {
    const btn = document.getElementById('soundToggle');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSound();
    });
  }

  // ============================================================
  // INIT
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    getAudio();        // Pre-instantiate and begin buffering
    initToggleButton();
    boot();            // Apply saved preference and attempt autoplay
  });

  // ============================================================
  // GLOBAL API
  // animations.js calls startAt99Percent() from the preloader timeline.
  // With the new preference system, this is a safe no-op if audio
  // already started; otherwise it gives the preference system one
  // more opportunity to start music (e.g. after preloader interaction).
  // ============================================================
  window.AperoAudio = {
    // Called by animations.js at 99% preloader — safe if already playing
    startAt99Percent: function () {
      if (isPlaying) return;          // Already playing — do nothing
      if (!wantsMusicOn()) return;    // User preference is OFF — respect it

      // Try to start — the preloader transition itself counts as a valid
      // browser context even if the initial autoplay was blocked
      const sound = getAudio();
      sound.volume = 0;
      volumeProxy.val = 0;

      const p = sound.play();
      if (p !== undefined) {
        p.then(() => {
          isPlaying = true;
          updateUI(true);
          fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDuration);
          // Gesture unlock no longer needed
          gestureUnlockActive = false;
        }).catch(() => {
          // Still blocked — gesture unlock remains registered
        });
      }
    },

    toggle: toggleSound,
    isPlaying: () => isPlaying,
    getAudioInstance: () => audio,
    getPreference: getSavedPreference
  };

})();
