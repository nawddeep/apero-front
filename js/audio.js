/**
 * Apéro — Background Audio Controller
 * Continuous ambient loop, 99% preloader fade-in, smooth volume toggling
 */

(function () {
  'use strict';

  // ==========================================================================
  // AUDIO CONFIGURATION
  // ==========================================================================
  const AUDIO_CONFIG = {
    src: 'assets/audio/apero.mp3', // Path to background music file
    volume: 0.6,                  // Configured target volume (0.0 to 1.0)
    fadeDuration: 1.8,            // Initial smooth fade-in duration (seconds)
    fadeDurationToggle: 0.8       // Smooth fade duration when toggling (seconds)
  };

  let audio = null;
  let isPlaying = false;
  let isMutedManually = false;
  let audioStarted = false;
  const currentVolumeObj = { val: 0 };
  let activeFadeTween = null;

  /**
   * Instantiate and configure HTMLAudioElement
   */
  function initAudioInstance() {
    if (audio) return audio;

    audio = new Audio();
    audio.src = AUDIO_CONFIG.src;
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0; // Starts at 0 for smooth GSAP fade-in

    return audio;
  }

  /**
   * Smoothly interpolate audio volume using GSAP
   */
  function fadeVolumeTo(targetVol, duration, onComplete) {
    if (!audio) return;

    if (activeFadeTween) {
      activeFadeTween.kill();
    }

    if (typeof gsap !== 'undefined') {
      activeFadeTween = gsap.to(currentVolumeObj, {
        val: targetVol,
        duration: duration,
        ease: 'power2.out',
        onUpdate: () => {
          if (audio) {
            audio.volume = Math.max(0, Math.min(1, currentVolumeObj.val));
          }
        },
        onComplete: () => {
          activeFadeTween = null;
          if (typeof onComplete === 'function') onComplete();
        }
      });
    } else {
      audio.volume = targetVol;
      currentVolumeObj.val = targetVol;
      if (typeof onComplete === 'function') onComplete();
    }
  }

  /**
   * Start playback and smoothly fade volume to AUDIO_CONFIG.volume.
   * Triggered when loading progress reaches ~99%.
   */
  function startBackgroundMusic() {
    if (audioStarted || isMutedManually) return;
    audioStarted = true;

    const sound = initAudioInstance();
    sound.volume = 0;
    currentVolumeObj.val = 0;

    const playPromise = sound.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          isPlaying = true;
          updateSoundToggleUI(true);
          fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDuration);
        })
        .catch(() => {
          // Browser autoplay policy restricted audio; unlock on first user gesture
          isPlaying = false;
          updateSoundToggleUI(false);
          setupGestureUnlock();
        });
    }
  }

  /**
   * Unlock audio playback on first user gesture if restricted by browser policy
   */
  function setupGestureUnlock() {
    function unlock() {
      if (!isMutedManually) {
        const sound = initAudioInstance();
        sound.volume = 0;
        currentVolumeObj.val = 0;
        const p = sound.play();
        if (p !== undefined) {
          p.then(() => {
            isPlaying = true;
            updateSoundToggleUI(true);
            fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDuration);
          }).catch(() => {});
        }
      }
      ['click', 'touchstart', 'pointerdown', 'keydown'].forEach((evt) => {
        window.removeEventListener(evt, unlock);
      });
    }

    ['click', 'touchstart', 'pointerdown', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlock, { once: true, passive: true });
    });
  }

  /**
   * Toggle Sound ON / OFF
   */
  function toggleSound() {
    const sound = initAudioInstance();

    if (isPlaying && !isMutedManually) {
      // Turn OFF: Smoothly fade volume to 0, then pause
      isMutedManually = true;
      updateSoundToggleUI(false);
      fadeVolumeTo(0, AUDIO_CONFIG.fadeDurationToggle, () => {
        if (sound && isMutedManually) {
          sound.pause();
          isPlaying = false;
        }
      });
    } else {
      // Turn ON: Resume same audio position, smoothly fade volume back in
      isMutedManually = false;
      const resumePlay = () => {
        isPlaying = true;
        updateSoundToggleUI(true);
        fadeVolumeTo(AUDIO_CONFIG.volume, AUDIO_CONFIG.fadeDurationToggle);
      };

      if (sound.paused) {
        const p = sound.play();
        if (p !== undefined) {
          p.then(resumePlay).catch(() => {});
        }
      } else {
        resumePlay();
      }
    }
  }

  /**
   * Synchronize Sound Toggle Button UI
   */
  function updateSoundToggleUI(active) {
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

  function initSoundToggleBtn() {
    const btn = document.getElementById('soundToggle');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSound();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAudioInstance();
    initSoundToggleBtn();
  });

  // Global namespace for integration with loader timeline
  window.AperoAudio = {
    config: AUDIO_CONFIG,
    startAt99Percent: startBackgroundMusic,
    toggle: toggleSound,
    isPlaying: () => isPlaying && !isMutedManually,
    getAudioInstance: () => audio
  };

})();
