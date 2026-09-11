/**
 * Apéro — Background Audio Controller
 *
 * Key behaviors:
 *  1. Default ON for first-time visitors (no saved preference).
 *  2. User can explicitly toggle OFF/ON — preference persisted in localStorage.
 *  3. Tab hidden  → pause automatically (NOT saved as user preference).
 *  4. Tab visible → resume only when user preference is ON.
 *  5. Browser autoplay block → silent gesture-unlock; preference unchanged.
 *  6. Single audio instance, single visibilitychange listener.
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────────────
  const CONFIG = {
    src:           'assets/audio/apero.mp3',
    volume:        0.6,
    fadeIn:        2.2,   // seconds — initial fade
    fadeToggle:    0.8    // seconds — manual toggle fade
  };

  const PREF_KEY = 'aperoMusicPreference'; // localStorage key: 'on' | 'off'

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  //   isPlaying        — whether audio is currently playing and audible
  //   unlockRegistered — whether gesture-unlock listeners are currently active
  //   unlockHandler    — reference to the unlock callback for cleanup
  //   fadeTween        — active GSAP tween handle
  //   audio            — single HTMLAudioElement instance
  // ─────────────────────────────────────────────────────────────────────────
  let audio             = null;
  let isPlaying         = false;
  let unlockRegistered  = false;
  let unlockHandler     = null;
  let fadeTween         = null;
  const vol             = { v: 0 }; // GSAP animates this proxy

  // ─────────────────────────────────────────────────────────────────────────
  // PREFERENCE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Read saved preference: returns "on" | "off" | null (first visit). */
  function readPref() {
    try {
      return localStorage.getItem(PREF_KEY);
    } catch (_) {
      return null;
    }
  }

  /**
   * Persist explicit user choice.
   * ONLY called from toggleSound() — never from autoplay or tab-visibility events.
   */
  function savePref(value /* "on" | "off" */) {
    try {
      localStorage.setItem(PREF_KEY, value);
    } catch (_) {}
  }

  /**
   * True when user preference is ON (explicitly "on" OR no preference yet -> default ON).
   */
  function prefIsOn() {
    return readPref() !== 'off';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLETON AUDIO ELEMENT
  // ─────────────────────────────────────────────────────────────────────────
  function getAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.src      = CONFIG.src;
    audio.loop     = true;
    audio.preload  = 'auto';
    audio.volume   = 0; // Starts at 0; smoothly faded in
    return audio;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VOLUME FADE
  // ─────────────────────────────────────────────────────────────────────────
  function fadeTo(target, duration, done) {
    if (fadeTween) {
      fadeTween.kill();
      fadeTween = null;
    }

    const snd = getAudio();

    if (typeof gsap !== 'undefined') {
      fadeTween = gsap.to(vol, {
        v: target,
        duration: duration,
        ease: 'power2.out',
        onUpdate: () => {
          snd.volume = Math.max(0, Math.min(1, vol.v));
        },
        onComplete: () => {
          fadeTween = null;
          if (done) done();
        }
      });
    } else {
      snd.volume = target;
      vol.v = target;
      if (done) done();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTERNAL PLAY / PAUSE (never touch preference)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attempt to start playback.
   * @param {number} [fadeSeconds] - duration of volume fade-in
   * @param {Function} [onBlocked] - called if browser blocks autoplay
   */
  function startAudio(fadeSeconds, onBlocked) {
    // If preference is explicitly OFF, never start
    if (!prefIsOn()) return;

    const snd = getAudio();
    const dur = (typeof fadeSeconds === 'number') ? fadeSeconds : CONFIG.fadeIn;

    // If already playing smoothly, don't restart
    if (isPlaying && !snd.paused && vol.v >= CONFIG.volume * 0.9) {
      updateUI(true);
      return;
    }

    snd.volume = 0;
    vol.v = 0;

    const p = snd.play();
    if (p === undefined) {
      // Legacy browser without promise
      isPlaying = true;
      updateUI(true);
      fadeTo(CONFIG.volume, dur);
      return;
    }

    p.then(() => {
      isPlaying = true;
      updateUI(true);
      fadeTo(CONFIG.volume, dur);
    }).catch((err) => {
      isPlaying = false;
      // Do NOT overwrite user preference on block.
      // Keep UI showing current preference (ON).
      updateUI(prefIsOn());
      if (onBlocked) onBlocked(err);
    });
  }

  /**
   * Pause with volume fade-out. Never alters saved preference.
   * @param {number} [fadeSeconds]
   * @param {Function} [done]
   */
  function pauseAudio(fadeSeconds, done) {
    const snd = getAudio();
    const dur = (typeof fadeSeconds === 'number') ? fadeSeconds : 0.3;

    fadeTo(0, dur, () => {
      // Only pause if tab is hidden or user has turned sound off
      if (document.visibilityState === 'hidden' || !prefIsOn()) {
        snd.pause();
      }
      isPlaying = false;
      if (done) done();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GESTURE UNLOCK
  // Registered when autoplay is blocked by browser policy.
  // Resumes on first user interaction, then deregisters completely.
  // Never changes saved preference.
  // ─────────────────────────────────────────────────────────────────────────
  const UNLOCK_EVENTS = ['click', 'touchstart', 'pointerdown', 'keydown'];

  function registerGestureUnlock() {
    if (unlockRegistered) return;
    unlockRegistered = true;

    unlockHandler = function () {
      cleanupGestureUnlock();

      if (!prefIsOn()) return; // User turned it OFF in the meantime
      if (isPlaying) return;   // Already playing

      startAudio(CONFIG.fadeIn);
    };

    UNLOCK_EVENTS.forEach(evt => {
      document.addEventListener(evt, unlockHandler, { passive: true });
    });
  }

  function cleanupGestureUnlock() {
    if (!unlockRegistered) return;
    unlockRegistered = false;
    if (unlockHandler) {
      UNLOCK_EVENTS.forEach(evt => {
        document.removeEventListener(evt, unlockHandler);
      });
      unlockHandler = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE VISIBILITY (Tab hidden / visible)
  // Critical: NEVER saves preference here.
  // ─────────────────────────────────────────────────────────────────────────
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Tab minimized / switched away — pause silently
      if (isPlaying) {
        pauseAudio(0.3);
      }
    } else {
      // Tab returned to — resume only when preference is ON
      if (prefIsOn() && !isPlaying) {
        startAudio(CONFIG.fadeIn, () => {
          registerGestureUnlock();
        });
      }
    }
  }

  // Single listener — registered once, never duplicated
  document.addEventListener('visibilitychange', onVisibilityChange);

  // ─────────────────────────────────────────────────────────────────────────
  // USER TOGGLE — the ONLY place that updates & saves preference
  // ─────────────────────────────────────────────────────────────────────────
  function toggleSound() {
    // Cancel any pending gesture unlock — user took explicit action
    cleanupGestureUnlock();

    if (prefIsOn()) {
      // User is explicitly turning OFF
      savePref('off');
      updateUI(false);
      pauseAudio(CONFIG.fadeToggle, () => {
        const snd = getAudio();
        snd.pause();
      });
      isPlaying = false;
    } else {
      // User is explicitly turning ON
      savePref('on');
      updateUI(true);
      startAudio(CONFIG.fadeToggle);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI SYNC
  // ─────────────────────────────────────────────────────────────────────────
  function updateUI(on) {
    const btn  = document.getElementById('soundToggle');
    const text = document.getElementById('soundText');
    if (!btn) return;

    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      btn.classList.add('playing');
      if (text) text.textContent = 'SOUND ON';
    } else {
      btn.classList.remove('playing');
      if (text) text.textContent = 'SOUND OFF';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BOOT — called on DOMContentLoaded
  // ─────────────────────────────────────────────────────────────────────────
  function boot() {
    getAudio(); // instantiate + begin buffering

    if (!prefIsOn()) {
      // Explicit saved preference is OFF — stay silent, no gesture unlock
      updateUI(false);
      return;
    }

    // Default ON (or saved ON) — ensure UI shows ON state immediately
    updateUI(true);

    // Attempt autoplay immediately
    startAudio(CONFIG.fadeIn, () => {
      // Autoplay blocked by browser: register gesture unlock, do NOT change preference
      registerGestureUnlock();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Wire toggle button
    const btn = document.getElementById('soundToggle');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSound();
      });
    }

    // Attempt autoplay & sync UI
    boot();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GLOBAL API (called by animations.js at 99% preloader)
  // ─────────────────────────────────────────────────────────────────────────
  window.AperoAudio = {
    /**
     * Called by animations.js when preloader reaches ~99%.
     * Safe no-op if already playing or if user set preference to OFF.
     */
    startAt99Percent() {
      if (isPlaying) return;
      if (!prefIsOn()) return;
      startAudio(CONFIG.fadeIn, () => registerGestureUnlock());
    },

    toggle:           toggleSound,
    isPlaying:        () => isPlaying,
    getAudioInstance: () => audio,
    getPreference:    readPref
  };

})();
