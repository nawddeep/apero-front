/**
 * Apéro — Background Audio Controller
 *
 * Requirements:
 *  1. Silent by default when entering the website (no automatic playback).
 *  2. Existing "SOUND OFF" button shown initially as the single audio control.
 *  3. Clicking the Sound button starts the APÉRO background song and updates UI to SOUND ON.
 *  4. Clicking it again pauses/stops the song and returns UI to SOUND OFF.
 *  5. Tab hidden -> temporarily pause audio if currently playing.
 *  6. Tab visible -> resume audio only if it was playing before switching tabs.
 *  7. Single audio instance, zero console errors, zero duplicate elements.
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────────────
  const CONFIG = {
    src:        'assets/audio/apero.mp3',
    volume:     0.6,
    fadeIn:     1.5,   // seconds — fade on user play
    fadeOut:    0.6    // seconds — fade on user pause / tab hide
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────
  let audio              = null;   // Single HTMLAudioElement
  let isPlaying          = false;  // User has started playback
  let wasPlayingOnHide   = false;  // Preserved across visibility changes
  let fadeTween          = null;   // Active GSAP tween handle
  const vol              = { v: 0 }; // Proxy for volume interpolation

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLETON AUDIO ELEMENT
  // ─────────────────────────────────────────────────────────────────────────
  function getAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.src      = CONFIG.src;
    audio.loop     = true;
    audio.preload  = 'auto';
    audio.volume   = 0;
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
  // PLAY / PAUSE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start playback with volume fade-in.
   */
  function startPlayback(fadeDuration) {
    const snd = getAudio();
    const dur = (typeof fadeDuration === 'number') ? fadeDuration : CONFIG.fadeIn;

    const p = snd.play();
    if (p === undefined) {
      isPlaying = true;
      updateUI(true);
      fadeTo(CONFIG.volume, dur);
      return;
    }

    p.then(() => {
      isPlaying = true;
      updateUI(true);
      fadeTo(CONFIG.volume, dur);
    }).catch(() => {
      // Browser blocked play
      isPlaying = false;
      updateUI(false);
    });
  }

  /**
   * Stop / pause playback with volume fade-out.
   */
  function pausePlayback(fadeDuration, done) {
    if (!audio) {
      isPlaying = false;
      updateUI(false);
      if (done) done();
      return;
    }

    const dur = (typeof fadeDuration === 'number') ? fadeDuration : CONFIG.fadeOut;

    fadeTo(0, dur, () => {
      if (audio) {
        audio.pause();
      }
      isPlaying = false;
      updateUI(false);
      if (done) done();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // USER TOGGLE
  // ─────────────────────────────────────────────────────────────────────────
  function toggleSound() {
    if (isPlaying) {
      // User presses button while playing -> turn OFF
      wasPlayingOnHide = false;
      pausePlayback(CONFIG.fadeOut);
    } else {
      // User presses button while OFF -> turn ON
      startPlayback(CONFIG.fadeIn);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI SYNCHRONIZATION
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
  // PAGE VISIBILITY (Tab hidden / visible)
  // ─────────────────────────────────────────────────────────────────────────
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Tab minimized or switched away
      if (isPlaying) {
        wasPlayingOnHide = true;
        // Pause audio silently when leaving tab
        if (audio) {
          audio.pause();
        }
      }
    } else {
      // Tab returned to foreground
      if (wasPlayingOnHide) {
        wasPlayingOnHide = false;
        // Resume playback smoothly if user had sound ON
        startPlayback(CONFIG.fadeIn);
      }
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  // ─────────────────────────────────────────────────────────────────────────
  // INIT — runs on DOMContentLoaded
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure UI starts strictly in the OFF state
    updateUI(false);

    // Wire single click listener to existing sound toggle button
    const btn = document.getElementById('soundToggle');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSound();
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GLOBAL API
  // ─────────────────────────────────────────────────────────────────────────
  window.AperoAudio = {
    /**
     * Safe no-op: page entrance must remain silent by default.
     */
    startAt99Percent() {
      // Do nothing — sound is off by default
    },

    toggle:           toggleSound,
    isPlaying:        () => isPlaying,
    getAudioInstance: () => audio
  };

})();
